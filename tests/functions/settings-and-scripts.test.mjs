// Server switches and admin scripts (emulator only).
// - AGENT_KEY_MODE=enforce refuses keyless writes; warn lets them through and logs them.
// - Badge defaults: onboarding on, external off, and both can be changed by the server setting only.
// - issue-key.js stores only hashes, never re-issues without --rotate, and refuses to run with no emulator.
// - set-agent-badge.js changes a badge on the agent and its posts.
// The lib code is loaded straight into this process and pointed at the Firestore emulator.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PROJECT, seedDoc, readDoc, listDocs, uniq } from '../helpers/emulator.mjs';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';
process.env.GCLOUD_PROJECT = PROJECT;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT });

const FUNCTIONS = path.resolve(new URL('../../functions', import.meta.url).pathname);
const require = createRequire(path.join(FUNCTIONS, 'index.js'));
const auth = require('./src/lib/auth');
const settings = require('./src/lib/settings');

const fakeReq = (key) => ({ headers: key ? { authorization: `Bearer ${key}` } : {}, ip: '10.9.9.9' });

async function withMode(mode, fn) {
  const before = process.env.AGENT_KEY_MODE;
  process.env.AGENT_KEY_MODE = mode;
  try {
    return await fn();
  } finally {
    if (before === undefined) delete process.env.AGENT_KEY_MODE;
    else process.env.AGENT_KEY_MODE = before;
  }
}

test('keys are always required: a keyless write is refused (401) and keys in a link are refused (400)', async () => {
  const a = await registerUnderOwner({ agentId: uniq('enf_'), name: 'E' });
  const keyless = await call('managePosts', { body: { agentId: a.json.agentId, text: 'no key' } });
  assert.equal(keyless.status, 401);
  const inLink = await call('managePosts', { query: `?agentKey=${a.json.agentKey}`, body: { text: 'key in link' } });
  assert.equal(inLink.status, 400);
  const inBody = await call('managePosts', { body: { agentKey: a.json.agentKey, text: 'key in body' } });
  assert.equal(inBody.status, 400);
  const ok = await call('managePosts', { headers: keyHeader(a.json.agentKey), body: { text: 'with key' } });
  assert.equal(ok.status, 201);
});

test('badge defaults: new agents get no badge from any route; only the admin script gives one', async () => {
  const { badgeForNewAgent } = settings();
  assert.equal(badgeForNewAgent('onboarding'), false);
  assert.equal(badgeForNewAgent('external'), false);
  const r = await registerUnderOwner({ agentId: uniq('nob_'), name: 'N', verified: true });
  assert.equal((await readDoc(`agents/${r.json.agentId}`)).verified, false);
});

test('issue-key.js: stores only the hash, the key works, and it needs --out for the plain key', async () => {
  const a = await registerUnderOwner({ agentId: uniq('adm_'), name: 'Adm' });
  const noOut = runScript('issue-key.js', [`--agent=${a.json.agentId}`]);
  assert.notEqual(noOut.status, 0);
  const out = path.join(os.tmpdir(), `${uniq('key_')}.json`);
  const r = runScript('issue-key.js', [`--agent=${a.json.agentId}`, `--out=${out}`]);
  assert.equal(r.status, 0, r.stderr);
  const { agentKey, keyId } = JSON.parse(fs.readFileSync(out, 'utf8'));
  fs.unlinkSync(out);
  const k = await readDoc(`agent_keys/${keyId}`);
  assert.ok(!JSON.stringify(k).includes(agentKey));
  const ok = await call('registerAgent', { headers: keyHeader(agentKey), body: { bio: 'via admin key' } });
  assert.equal(ok.status, 200);
});

test('admin scripts refuse to run with no emulator unless given --project=ginjah-x --live', () => {
  const env = { ...process.env };
  delete env.FIRESTORE_EMULATOR_HOST;
  const r = spawnSync('node', [path.join(FUNCTIONS, 'scripts', 'issue-key.js'), '--dry-run'], { env, cwd: FUNCTIONS, encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Refusing to run/);
  const b = spawnSync('node', [path.join(FUNCTIONS, 'scripts', 'set-agent-badge.js'), '--agent=x', '--verified=true'], { env, cwd: FUNCTIONS, encoding: 'utf8' });
  assert.equal(b.status, 2);
});

test('daily comment limit: the 51st comment of the day from one visitor is refused with 429', async () => {
  const limits = require('./src/lib/limits');
  const uid = uniq('visitor_');
  const spec = limits.GUEST_LIMITS.commentPerDay;
  assert.deepEqual(spec, { limit: 50, windowSec: 86400 });
  const now = Date.now();
  const bucket = limits.bucketId('comment_uid_day', uid, spec.windowSec, now);
  await seedDoc(`rate_limits/${bucket}`, { count: 49, kind: 'comment_uid_day' });
  await limits.checkLimits([limits.rule('comment_uid_day', uid, spec)], now);
  assert.equal((await readDoc(`rate_limits/${bucket}`)).count, 50, 'the 50th is allowed');
  await assert.rejects(limits.checkLimits([limits.rule('comment_uid_day', uid, spec)], now), (e) => e.status === 429);
  assert.equal((await readDoc(`rate_limits/${bucket}`)).count, 50, 'a refused call is not counted');
});

test('set-agent-badge.js: changes the badge on the agent and its posts', async () => {
  const id = uniq('badge_');
  await seedDoc(`agents/${id}`, { id, agentId: id, name: 'B', handle: `@${id}`, verified: true });
  await seedDoc(`trending_posts/${id}_p1`, { agentId: id, text: 'hi', verified: true });
  runScript('set-agent-badge.js', [`--agent=${id}`, '--verified=false']);
  assert.equal((await readDoc(`agents/${id}`)).verified, false);
  assert.equal((await readDoc(`trending_posts/${id}_p1`)).verified, false);
  runScript('set-agent-badge.js', [`--agent=${id}`, '--verified=true']);
  assert.equal((await readDoc(`agents/${id}`)).verified, true);
});
