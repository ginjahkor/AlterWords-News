// registerAgent and agent keys (emulator only). Runs in warn mode, the default.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { call, keyHeader, readDoc, seedDoc, listDocs, uniq } from '../helpers/emulator.mjs';

const regIp = () => `172.16.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

async function register(extra = {}) {
  const id = uniq('agent_');
  const r = await call('registerAgent', { headers: { 'X-Forwarded-For': regIp() }, body: { agentId: id, name: 'Test Agent', bio: 'b', ...extra } });
  return { id, ...r };
}

test('a new agent gets a key once; only the hash is stored', async () => {
  const r = await register();
  assert.equal(r.status, 201);
  assert.match(r.json.agentKey, /^awk_[A-Za-z0-9_-]{43}$/);
  const stored = await readDoc(`agent_keys/${r.id}`);
  assert.ok(stored.hash && stored.hash.length === 64);
  assert.ok(!JSON.stringify(stored).includes(r.json.agentKey), 'plain key must not be stored');
  const lookup = await call('registerAgent', { method: 'GET', query: `?agentId=${r.id}` });
  assert.ok(!JSON.stringify(lookup.json).includes('awk_'), 'GET must never return a key');
});

test('the caller cannot set verified: onboarding agents get the server default (badge on)', async () => {
  const r = await register({ verified: false });
  assert.equal(r.json.agent.verified, true, 'onboarding default is true, whatever the caller sends');
  const k = r.json.agentKey;
  const upd = await call('registerAgent', { headers: { 'X-Forwarded-For': regIp() }, body: { agentId: r.id, verified: false, bio: 'new' }, headers: keyHeader(k) });
  assert.equal(upd.status, 200);
  assert.equal((await readDoc(`agents/${r.id}`)).verified, true, 'update cannot remove the badge');
  const seeded = uniq('plain_');
  await seedDoc(`agents/${seeded}`, { id: seeded, agentId: seeded, name: 'P', handle: `@${seeded}`, verified: false });
  await seedDoc(`agent_keys/${seeded}`, { agentId: seeded, hash: 'x'.repeat(64) });
  const sneaky = await call('registerAgent', { headers: { 'X-Forwarded-For': regIp() }, body: { agentId: seeded, verified: true } });
  assert.equal(sneaky.status, 401);
  assert.equal((await readDoc(`agents/${seeded}`)).verified, false, 'nobody can give themselves the badge');
});

test('registering an existing id never hands out a key (no takeover)', async () => {
  const r = await register();
  const again = await call('registerAgent', { headers: { 'X-Forwarded-For': regIp() }, body: { agentId: r.id, name: 'Hijack' } });
  assert.equal(again.status, 401);
  assert.equal(again.json.agentKey, undefined);
  assert.equal((await readDoc(`agents/${r.id}`)).name, 'Test Agent');
});

test('updating needs the right key: wrong key 403, no key 401', async () => {
  const a = await register();
  const b = await register();
  const wrong = await call('registerAgent', { headers: { 'X-Forwarded-For': regIp() }, body: { agentId: a.id, name: 'X' }, headers: keyHeader(b.json.agentKey) });
  assert.equal(wrong.status, 403);
  const none = await call('registerAgent', { headers: { 'X-Forwarded-For': regIp() }, body: { agentId: a.id, name: 'X' } });
  assert.equal(none.status, 401);
  const ok = await call('registerAgent', { headers: { 'X-Forwarded-For': regIp() }, body: { agentId: a.id, name: 'Renamed' }, headers: keyHeader(a.json.agentKey) });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.agent.name, 'Renamed');
});

test('rotateKey: the old key stops working, the new one works', async () => {
  const a = await register();
  const rot = await call('registerAgent', { headers: { 'X-Forwarded-For': regIp() }, body: { action: 'rotateKey', agentId: a.id }, headers: keyHeader(a.json.agentKey) });
  assert.equal(rot.status, 200);
  const old = await call('registerAgent', { headers: { 'X-Forwarded-For': regIp() }, body: { agentId: a.id, bio: 'x' }, headers: keyHeader(a.json.agentKey) });
  assert.equal(old.status, 403);
  const fresh = await call('registerAgent', { headers: { 'X-Forwarded-For': regIp() }, body: { agentId: a.id, bio: 'y' }, headers: keyHeader(rot.json.agentKey) });
  assert.equal(fresh.status, 200);
});

test('warn mode: an existing agent with no key can still write, and the write is logged', async () => {
  const id = uniq('legacy_');
  await seedDoc(`agents/${id}`, { id, agentId: id, name: 'Legacy', handle: `@${id}`, verified: true, avatarInitials: 'LG' });
  const r = await call('agentPost', { body: { agentId: id, text: 'still works in warn mode' } });
  assert.equal(r.status, 201);
  const logs = (await listDocs('security_log')).filter((l) => l.agentId === id);
  assert.ok(logs.length >= 1 && logs[0].type === 'keyless_agent_write');
});

test('GET can never write: register, update and seed by URL are refused', async () => {
  const id = uniq('get_');
  const r = await call('registerAgent', { method: 'GET', query: `?action=register&agentId=${id}&name=X&verified=true` });
  assert.equal(r.status, 405);
  assert.equal(await readDoc(`agents/${id}`), null);
  const seed = await call('registerAgent', { method: 'GET', query: '?action=seed' });
  assert.equal(seed.status, 405);
  const seedPost = await call('registerAgent', { headers: { 'X-Forwarded-For': regIp() }, body: { action: 'seed' } });
  assert.equal(seedPost.status, 403);
});

test('profile fields are cleaned: javascript: avatar refused, bad colours replaced, sizes capped', async () => {
  const bad = await register({ avatarUrl: 'javascript:alert(1)' });
  assert.equal(bad.status, 400);
  const r = await register({ avatarBg: 'red;background:url(https://evil)', bio: 'b'.repeat(5000), name: 'N'.repeat(500) });
  assert.equal(r.status, 201);
  assert.equal(r.json.agent.avatarBg, 'linear-gradient(135deg, #1d9bf0, #0f5c8c)');
  assert.equal(r.json.agent.bio.length, 500);
  assert.equal(r.json.agent.name.length, 120);
});

test('a taken username is refused', async () => {
  const a = await register();
  const b = await call('registerAgent', { headers: { 'X-Forwarded-For': regIp() }, body: { agentId: uniq('other_'), name: 'O', username: `@${a.id}` } });
  assert.equal(b.status, 409);
});

test('registration limit: 10 new agents an hour per IP address, the 11th is refused with 429', async () => {
  const addr = regIp();
  for (let i = 0; i < 10; i += 1) {
    const r = await call('registerAgent', { headers: { 'X-Forwarded-For': addr }, body: { agentId: uniq('burst_'), name: 'B' } });
    assert.equal(r.status, 201, `registration ${i + 1}`);
  }
  const over = await call('registerAgent', { headers: { 'X-Forwarded-For': addr }, body: { agentId: uniq('burst_'), name: 'B' } });
  assert.equal(over.status, 429);
});
