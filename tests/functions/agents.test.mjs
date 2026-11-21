// registerAgent since Nov 21, 2026: every agent registers with an owner's registration code (header only),
// gets one key once, never gets a badge it asks for, and updates itself only with its own key.

import test from 'node:test';
import assert from 'node:assert/strict';
import { call, readDoc, uniq, keyHeader, registerUnderOwner } from '../helpers/emulator.mjs';
import { readyOwner, newCode } from '../helpers/owners.mjs';

const regIp = () => `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

test('registering without a code is refused (401) and creates nothing', async () => {
  const id = uniq('nocode_');
  const r = await call('registerAgent', { headers: { 'X-Forwarded-For': regIp() }, body: { agentId: id, name: 'No Code' } });
  assert.equal(r.status, 401);
  assert.match(r.json.error, /registration code/i);
  assert.equal(await readDoc(`agents/${id}`), null);
  assert.equal(await readDoc(`agent_private/${id}`), null);
});

test('registering with a code gives one key, stores only its hash, and no badge even when asked', async () => {
  const id = uniq('reg_');
  const r = await registerUnderOwner({ agentId: id, name: 'Reg', verified: true, badge: true });
  assert.equal(r.status, 201);
  assert.match(r.json.agentKey, /^awk_[a-f0-9]{16}_[A-Za-z0-9_-]{43}$/);
  assert.equal(r.json.status, 'active');
  const pub = await readDoc(`agents/${id}`);
  assert.equal(pub.verified, false);
  assert.equal(pub.ownerUsername, r.owner.username);
  const keyId = r.json.agentKey.split('_')[1];
  const k = await readDoc(`agent_keys/${keyId}`);
  assert.equal(k.agentId, id);
  assert.equal(k.hash.length, 64);
  assert.ok(!JSON.stringify(k).includes(r.json.agentKey), 'plain key must not be stored');
  assert.ok(!JSON.stringify(await readDoc(`agent_private/${id}`)).includes('awk_'));
});

test('a key updates only its own agent; a key for another agent is refused (403)', async () => {
  const a = await registerUnderOwner({ agentId: uniq('own_'), name: 'A' });
  const b = await registerUnderOwner({ agentId: uniq('other_'), name: 'B' });
  const ok = await call('registerAgent', { headers: keyHeader(a.json.agentKey), body: { bio: 'new bio' } });
  assert.equal(ok.status, 200);
  assert.equal((await readDoc(`agents/${a.json.agentId}`)).bio, 'new bio');
  const cross = await call('registerAgent', { headers: keyHeader(a.json.agentKey), body: { agentId: b.json.agentId, bio: 'hijack' } });
  assert.equal(cross.status, 403);
  assert.notEqual((await readDoc(`agents/${b.json.agentId}`)).bio, 'hijack');
});

test('an agent cannot give itself a badge or change its username', async () => {
  const a = await registerUnderOwner({ agentId: uniq('badge_'), name: 'A' });
  const r = await call('registerAgent', { headers: keyHeader(a.json.agentKey), body: { verified: true, username: 'someone_else' } });
  assert.equal(r.status, 200);
  const pub = await readDoc(`agents/${a.json.agentId}`);
  assert.equal(pub.verified, false);
  assert.equal(pub.handle, `@${a.json.agentId}`);
});

test('rotateKey: the new key works, the old key stops working at once', async () => {
  const a = await registerUnderOwner({ agentId: uniq('rot_'), name: 'R' });
  const r = await call('registerAgent', { headers: keyHeader(a.json.agentKey), body: { action: 'rotateKey' } });
  assert.equal(r.status, 200);
  assert.notEqual(r.json.agentKey, a.json.agentKey);
  const old = await call('registerAgent', { headers: keyHeader(a.json.agentKey), body: { bio: 'x' } });
  assert.equal(old.status, 401);
  const fresh = await call('registerAgent', { headers: keyHeader(r.json.agentKey), body: { bio: 'y' } });
  assert.equal(fresh.status, 200);
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
  const bad = await registerUnderOwner({ agentId: uniq('bad_'), avatarUrl: 'javascript:alert(1)' });
  assert.equal(bad.status, 400);
  const r = await registerUnderOwner({ agentId: uniq('clean_'), avatarBg: 'red;background:url(https://evil)', bio: 'b'.repeat(5000), name: 'N'.repeat(500) });
  assert.equal(r.status, 201);
  assert.equal(r.json.agent.avatarBg, 'linear-gradient(135deg, #1d9bf0, #0f5c8c)');
  assert.equal(r.json.agent.bio.length, 500);
  assert.equal(r.json.agent.name.length, 120);
});

test('an agent with no picture gets no made-up picture: avatarUrl stays empty so the site shows initials', async () => {
  const id = uniq('nopic_');
  const r = await registerUnderOwner({ agentId: id, name: 'No Picture' });
  assert.equal(r.status, 201);
  assert.equal(r.json.agent.avatarUrl, '');
  const doc = await readDoc(`agents/${id}`);
  assert.equal(doc.avatarUrl, '');
  const withPic = await registerUnderOwner({ agentId: uniq('pic_'), avatarUrl: 'https://example.com/me.png' });
  assert.equal(withPic.status, 201);
  assert.equal(withPic.json.agent.avatarUrl, 'https://example.com/me.png');
});

test('a taken username is refused (409), and the code use is not spent', async () => {
  const a = await registerUnderOwner({ agentId: uniq('taken_'), name: 'A' });
  const owner = await readyOwner({ approvalRequired: false });
  const c = await newCode(owner);
  const b = await call('registerAgent', { headers: { 'X-Forwarded-For': regIp(), 'X-Registration-Code': c.code }, body: { username: a.json.agentId, name: 'B' } });
  assert.equal(b.status, 409);
  assert.equal((await readDoc(`registration_codes/${c.codeId}`)).uses, 0);
});

test('registration limit: 10 tries an hour per IP address, the 11th is refused with 429', async () => {
  const addr = regIp();
  for (let i = 0; i < 10; i += 1) {
    const r = await call('registerAgent', { headers: { 'X-Forwarded-For': addr }, body: { agentId: uniq('burst_'), name: 'B' } });
    assert.equal(r.status, 401, `try ${i + 1}`);
  }
  const over = await call('registerAgent', { headers: { 'X-Forwarded-For': addr }, body: { agentId: uniq('burst_'), name: 'B' } });
  assert.equal(over.status, 429);
});
