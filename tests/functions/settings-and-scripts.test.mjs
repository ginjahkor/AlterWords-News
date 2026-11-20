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

test('key mode switch: warn is the default; enforce refuses keyless writes, warn allows and logs them', async () => {
  delete process.env.AGENT_KEY_MODE;
  assert.equal(settings.keyMode(), 'warn');
  const id = uniq('legacy_');
  await seedDoc(`agents/${id}`, { id, agentId: id, name: 'Legacy', handle: `@${id}`, verified: true });

  await withMode('enforce', async () => {
    assert.equal(settings.keyMode(), 'enforce');
    await assert.rejects(auth.requireAgentKey(fakeReq(), {}, id, 'test'), (e) => e.status === 401);
  });
  await withMode('warn', async () => {
    const r = await auth.requireAgentKey(fakeReq(), {}, id, 'test-warn');
    assert.deepEqual(r, { keyed: false });
  });
  const log = (await listDocs('security_log')).filter((d) => d.agentId === id);
  assert.equal(log.length, 1, 'the keyless write in warn mode is logged once');
  assert.equal(log[0].type, 'keyless_agent_write');
  assert.equal(log[0].action, 'test-warn');

  await withMode('warn', async () => {
    await assert.rejects(auth.requireAgentKey(fakeReq(), {}, uniq('ghost_'), 'x'), (e) => e.status === 403, 'made-up ids are refused');
  });
});

test('badge defaults: onboarding gets the badge, external does not; only the server setting changes them', async () => {
  delete process.env.ONBOARDING_BADGE_DEFAULT;
  delete process.env.EXTERNAL_BADGE_DEFAULT;
  assert.equal(settings.badgeForNewAgent('onboarding'), true);
  assert.equal(settings.badgeForNewAgent('external'), false);
  process.env.EXTERNAL_BADGE_DEFAULT = 'true';
  process.env.ONBOARDING_BADGE_DEFAULT = 'false';
  try {
    assert.equal(settings.badgeForNewAgent('external'), true);
    assert.equal(settings.badgeForNewAgent('onboarding'), false);
  } finally {
    delete process.env.EXTERNAL_BADGE_DEFAULT;
    delete process.env.ONBOARDING_BADGE_DEFAULT;
  }
});

const scriptEnv = { ...process.env, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8085', GCLOUD_PROJECT: PROJECT };
const runScript = (name, args) => execFileSync('node', [path.join(FUNCTIONS, 'scripts', name), ...args], { env: scriptEnv, cwd: FUNCTIONS, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

test('issue-key.js: stores only the hash, the key works, and it never re-issues without --rotate', async () => {
  const id = uniq('old_');
  await seedDoc(`agents/${id}`, { id, agentId: id, name: 'Old', handle: `@${id}`, verified: true });
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'awk-')), 'keys.json');
  runScript('issue-key.js', [`--agent=${id}`, `--out=${out}`]);
  const file = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal((fs.statSync(out).mode & 0o777).toString(8), '600', 'key file is owner-only');
  const key = file.keys[0].agentKey;
  assert.match(key, /^awk_/);
  const stored = await readDoc(`agent_keys/${id}`);
  assert.equal(stored.hash, auth.hashKey(key));
  assert.ok(!JSON.stringify(stored).includes(key), 'plain key not stored');
  assert.deepEqual(await auth.requireAgentKey(fakeReq(key), {}, id, 'x'), { keyed: true });

  const again = JSON.parse(runScript('issue-key.js', [`--agent=${id}`, `--out=${out}.2`]));
  assert.equal(again.issued, 0);
  assert.equal(again.skipped[0].reason, 'already has a key');
  assert.equal((await readDoc(`agent_keys/${id}`)).hash, stored.hash, 'existing key untouched');
  fs.rmSync(path.dirname(out), { recursive: true, force: true });
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
