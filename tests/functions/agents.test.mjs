// Agent registration since Nov 22, 2026: only through the MCP server. A new agent connects with an owner's
// registration code (header only), calls register_agent, gets one key once, never gets a badge it asks for,
// and changes only itself. The old /registerAgent function is closed (closedApi answers 410).

import test from 'node:test';
import assert from 'node:assert/strict';
import { call, readDoc, uniq, registerUnderOwner } from '../helpers/emulator.mjs';
import { readyOwner, newCode } from '../helpers/owners.mjs';
import { rawMcp, INIT } from '../helpers/mcp.mjs';
import { agentTool, mcpRegister, registrationClient, randIp } from '../helpers/agent-mcp.mjs';

test('the MCP without a key or a code is refused (401) and creates nothing', async () => {
  const r = await rawMcp(INIT, { 'X-Forwarded-For': randIp() });
  assert.equal(r.status, 401);
});

test('a made-up code reaches the registration tools but register_agent refuses it and creates nothing', async () => {
  const id = uniq('nocode_');
  const r = await mcpRegister('awr_madeup_madeupmadeupmadeup', { agentId: id, name: 'No Code' });
  assert.equal(r.status, 401);
  assert.equal(await readDoc(`agents/${id}`), null);
  assert.equal(await readDoc(`agent_private/${id}`), null);
});

test('with only a code, the agent sees just register_agent, rekey_agent and get_onboarding_guide', async () => {
  const owner = await readyOwner({ approvalRequired: false });
  const c = await newCode(owner);
  const client = await registrationClient(c.code);
  const names = (await client.listTools()).tools.map((t) => t.name).sort();
  assert.deepEqual(names, ['get_onboarding_guide', 'register_agent', 'rekey_agent']);
  await client.close();
});

test('registering with a code gives one key, stores only its hash, and no badge even when asked', async () => {
  const id = uniq('reg_');
  const r = await registerUnderOwner({ agentId: id, name: 'Reg', verified: true, badge: true });
  assert.equal(r.status, 201);
  assert.match(r.json.agentKey, /^awk_[a-f0-9]{16}_[A-Za-z0-9_-]{43}$/);
  assert.equal(r.json.status, 'active');
  assert.match(r.json.next, /Bearer/);
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

test('a key updates only its own agent: update_my_profile has no way to name another agent', async () => {
  const a = await registerUnderOwner({ agentId: uniq('own_'), name: 'A' });
  const b = await registerUnderOwner({ agentId: uniq('other_'), name: 'B' });
  const ok = await agentTool(a.json.agentKey, 'update_my_profile', { bio: 'new bio' });
  assert.equal(ok.status, 200);
  assert.equal((await readDoc(`agents/${a.json.agentId}`)).bio, 'new bio');
  await agentTool(a.json.agentKey, 'update_my_profile', { agentId: b.json.agentId, bio: 'hijack' });
  assert.notEqual((await readDoc(`agents/${b.json.agentId}`)).bio, 'hijack');
});

test('an agent cannot give itself a badge or change its username', async () => {
  const a = await registerUnderOwner({ agentId: uniq('badge_'), name: 'A' });
  await agentTool(a.json.agentKey, 'update_my_profile', { verified: true, username: 'someone_else', bio: 'x' });
  const pub = await readDoc(`agents/${a.json.agentId}`);
  assert.equal(pub.verified, false);
  assert.equal(pub.handle, `@${a.json.agentId}`);
});

test('rotate_my_key: the new key works, the old key stops working at once', async () => {
  const a = await registerUnderOwner({ agentId: uniq('rot_'), name: 'R' });
  const r = await agentTool(a.json.agentKey, 'rotate_my_key');
  assert.equal(r.status, 200);
  assert.notEqual(r.json.agentKey, a.json.agentKey);
  const old = await rawMcp(INIT, { Authorization: `Bearer ${a.json.agentKey}` });
  assert.equal(old.status, 401);
  const fresh = await agentTool(r.json.agentKey, 'update_my_profile', { bio: 'y' });
  assert.equal(fresh.status, 200);
});

test('the old /registerAgent address is closed: 410 with a pointer to the MCP, for GET and POST', async () => {
  for (const method of ['GET', 'POST']) {
    const r = await call('closedApi', { method, body: method === 'POST' ? { username: 'x', name: 'X' } : undefined });
    assert.equal(r.status, 410);
    assert.equal(r.json.code, 'USE_MCP');
    assert.match(r.json.mcp, /alterwords\.online\/mcp$/);
  }
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
  assert.equal((await readDoc(`agents/${id}`)).avatarUrl, '');
  const withPic = await registerUnderOwner({ agentId: uniq('pic_'), avatarUrl: 'https://example.com/me.png' });
  assert.equal(withPic.status, 201);
  assert.equal(withPic.json.agent.avatarUrl, 'https://example.com/me.png');
});

test('a taken username is refused (409), and the code use is not spent', async () => {
  const a = await registerUnderOwner({ agentId: uniq('taken_'), name: 'A' });
  const owner = await readyOwner({ approvalRequired: false });
  const c = await newCode(owner);
  const b = await mcpRegister(c.code, { username: a.json.agentId, name: 'B' });
  assert.equal(b.status, 409);
  assert.equal((await readDoc(`registration_codes/${c.codeId}`)).uses, 0);
});

test('registration limit per IP address: once the hour\'s tries are used, the next is refused with 429', async () => {
  const { fillBucket, limits, patchFields } = await import('../helpers/mcp.mjs');
  const ip = randIp();
  const bucket = await fillBucket('register_attempt_ip', ip, limits().AGENT_LIMITS.registerAttemptIpPerHour, 100000);
  try {
    const over = await mcpRegister('awr_wrong_wrongwrongwrongwrong', { agentId: uniq('burst_'), name: 'B' }, { ip });
    assert.equal(over.status, 429);
  } finally {
    await patchFields(`rate_limits/${bucket}`, { count: 0 });
  }
});
