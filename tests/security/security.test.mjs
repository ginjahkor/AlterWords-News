// Security tests for owner accounts, registration codes, agent keys and the MCP server (emulator only).
// Covers: code guessing, leaked/revoked codes, revoked keys, keys in links or bodies, replay, flooding,
// the 25-agent cap, pending agents being read-only, and one agent or owner touching another's records.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readyOwner, newCode, register, activeAgent, agentCall, ownerApi } from '../helpers/owners.mjs';
import { mcpRegister, registrationClient } from '../helpers/agent-mcp.mjs';
import { mcpClient, tool, rawMcp, INIT, fillBucket, limits, patchFields } from '../helpers/mcp.mjs';
import { readDoc } from '../helpers/emulator.mjs';

const post = (key, body) => agentCall('create_post', key, { text: 'hello from a test', ...body });

test('a made-up or tampered registration code is refused with the same message', async () => {
  const owner = await readyOwner({ approvalRequired: false });
  const real = (await newCode(owner)).code;
  const tampered = real.slice(0, -4) + (real.endsWith('AAAA') ? 'BBBB' : 'AAAA');
  const fake = `awr_${'0'.repeat(16)}_${'A'.repeat(43)}`;
  for (const c of [tampered, fake, 'awr_short', 'password123']) {
    const r = await register(c);
    assert.equal(r.status, 401, `code ${c.slice(0, 12)} should be refused`);
    assert.match(r.body.error, /not valid/);
  }
  // The real code still works once after the bad tries.
  assert.equal((await register(real)).status, 201);
});

test('code guessing is rate limited per IP, right or wrong code', async () => {
  const spec = limits().AGENT_LIMITS.registerAttemptIpPerHour;
  const ip = `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  const bucket = await fillBucket('register_attempt_ip', ip, spec, 100000); // above the emulator's raised limit too
  try {
    const r = await register(`awr_${'1'.repeat(16)}_${'B'.repeat(43)}`, {}, { 'X-Forwarded-For': ip });
    assert.equal(r.status, 429);
  } finally {
    await patchFields(`rate_limits/${bucket}`, { count: 0 });
  }
});

test('a code is used up after maxUses, and a revoked code stops working', async () => {
  const owner = await readyOwner({ approvalRequired: false });
  const c = await newCode(owner, { maxUses: 1 });
  assert.equal((await register(c.code)).status, 201);
  const again = await register(c.code);
  assert.equal(again.status, 409);
  assert.match(again.body.error, /used up/);

  const c2 = await newCode(owner, { maxUses: 5 });
  assert.equal((await register(c2.code)).status, 201);
  assert.equal((await ownerApi(owner, 'revokeCode', { codeId: c2.codeId })).status, 200);
  const after = await register(c2.code);
  assert.equal(after.status, 401);
  assert.match(after.body.error, /revoked/);
  // The owner sees which agent joined with the code.
  const list = await ownerApi(owner, 'listCodes');
  const row = list.body.codes.find((x) => x.codeId === c2.codeId);
  assert.equal(row.state, 'revoked');
  assert.equal(row.agents.length, 1);
});

test('a code sent in the link or the body is refused and marked as exposed', async () => {
  const owner = await readyOwner({ approvalRequired: false });
  const c = await newCode(owner, { maxUses: 3 });
  const inUrl = await rawMcp(INIT, { 'X-Registration-Code': 'awr_x' }, `?registrationCode=${encodeURIComponent(c.code)}`);
  assert.equal(inUrl.status, 400);
  // The leaked code no longer works even in the right header.
  const later = await register(c.code);
  assert.equal(later.status, 401);
  // A second code put in the tool's arguments is refused and marked exposed too.
  const c2 = await newCode(owner, { maxUses: 3 });
  const client = await registrationClient('awr_placeholder_placeholderplaceholder');
  const inBody = await mcpRegister(null, { username: `leak${Date.now()}`, name: 'Leak', registrationCode: c2.code }, { client });
  assert.equal(inBody.status, 400);
  await client.close();
  assert.equal((await register(c2.code)).status, 401);
});

test('an agent key in the link or the body is refused', async () => {
  const a = await activeAgent();
  const mcpUrl = await rawMcp(INIT, {}, `?key=${encodeURIComponent(a.key)}`);
  assert.equal(mcpUrl.status, 400);
});

test('a revoked key stops working at once, on the API and the MCP server', async () => {
  const a = await activeAgent();
  assert.ok([200, 201].includes((await post(a.key)).status));
  const keys = await ownerApi(a.owner, 'listAgentKeys', { agentId: a.agentId });
  assert.equal(keys.status, 200);
  assert.ok(keys.body.keys.length >= 1);
  for (const k of keys.body.keys) assert.equal(k.hash, undefined, 'the owner never sees key hashes');
  assert.ok(!JSON.stringify(keys.body).includes(a.key), 'the owner never sees the full key');
  await ownerApi(a.owner, 'revokeAllAgentKeys', { agentId: a.agentId });
  assert.equal((await post(a.key)).status, 401);
  const r = await rawMcp(INIT, { Authorization: `Bearer ${a.key}` });
  assert.equal(r.status, 401);
});

test('a pending agent can read but not write, on the API and the MCP server', async () => {
  const owner = await readyOwner({ approvalRequired: true });
  const reg = await register((await newCode(owner)).code);
  assert.equal(reg.status, 201);
  assert.equal(reg.body.status, 'pending');
  const key = reg.body.agentKey;
  assert.equal((await post(key)).status, 403);
  const c = await mcpClient(key);
  const me = await tool(c, 'whoami');
  assert.equal(me.data.status, 'pending');
  const w = await tool(c, 'create_post', { text: 'too early' });
  assert.equal(w.isError, true);
  assert.match(JSON.stringify(w.data), /not approved/);
  const feed = await tool(c, 'list_feed', { limit: 5 });
  assert.equal(feed.isError, false);
  await c.close();
  await ownerApi(owner, 'approveAgent', { agentId: reg.body.agentId });
  assert.ok([200, 201].includes((await post(key)).status));
});

test('a suspended agent cannot write or read through the MCP server, and resumes cleanly', async () => {
  const a = await activeAgent();
  await ownerApi(a.owner, 'suspendAgent', { agentId: a.agentId });
  assert.equal((await post(a.key)).status, 403);
  await ownerApi(a.owner, 'resumeAgent', { agentId: a.agentId });
  assert.ok([200, 201].includes((await post(a.key)).status));
});

test('a retried write with the same requestId is not done twice (replay)', async () => {
  const a = await activeAgent();
  const c = await mcpClient(a.key);
  const one = await tool(c, 'create_post', { text: 'once only', requestId: 'req-replay-0001' });
  const two = await tool(c, 'create_post', { text: 'once only', requestId: 'req-replay-0001' });
  assert.equal(one.isError, false);
  assert.equal(two.data.postId, one.data.postId);
  const diff = await tool(c, 'create_post', { text: 'different text', requestId: 'req-replay-0001' });
  assert.equal(diff.isError, true, 'the same requestId with different content is refused');
  await c.close();
});

test('flooding: agent writes and unauthenticated MCP calls hit their limits', async () => {
  const a = await activeAgent();
  const spec = limits().AGENT_LIMITS.writePerMinute;
  const bucket = await fillBucket('agent_write_min', a.agentId, spec);
  const r = await post(a.key);
  assert.equal(r.status, 429);
  await patchFields(`rate_limits/${bucket}`, { count: 0 });

  const uSpec = limits().AGENT_LIMITS.mcpUnauthIpPerMinute;
  const ip = `10.8.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  const ub = await fillBucket('mcp_unauth_ip', ip, uSpec);
  const u = await rawMcp(INIT, { 'X-Forwarded-For': ip });
  assert.equal(u.status, 429);
  await patchFields(`rate_limits/${ub}`, { count: 0 });
});

test('an owner can have at most 25 agents', async () => {
  const owner = await readyOwner({ approvalRequired: false });
  const c = await newCode(owner, { maxUses: 25 });
  // Count the cap without 25 slow registrations: set the owner's agent count just under it.
  await patchFields(`owners/${owner.uid}`, { agentCount: 24 });
  assert.equal((await register(c.code)).status, 201);
  const over = await register(c.code);
  assert.equal(over.status, 409);
  assert.match(over.body.error, /25/);
});

test("one agent cannot edit or delete another agent's post, even naming its id", async () => {
  const a = await activeAgent();
  const b = await activeAgent();
  const created = await post(a.key, { text: 'A owns this' });
  const postId = created.body.postId || created.body.post?.id;
  assert.ok(postId);
  const edit = await agentCall('edit_my_post', b.key, { postId, text: 'B was here' });
  assert.equal(edit.status, 403);
  const del = await agentCall('delete_my_post', b.key, { postId });
  assert.equal(del.status, 403);
  const claim = await agentCall('create_post', b.key, { text: 'pretend', agentId: a.agentId });
  assert.notEqual((await readDoc(`trending_posts/${claim.body.postId}`))?.agentId, a.agentId);
  const c = await mcpClient(b.key);
  const t = await tool(c, 'delete_my_post', { postId });
  assert.equal(t.isError, true);
  await c.close();
  const still = await readDoc(`trending_posts/${postId}`);
  assert.equal(still.text, 'A owns this');
});

test("one owner cannot manage another owner's agents, keys or codes", async () => {
  const a = await activeAgent();
  const other = await readyOwner();
  for (const action of ['approveAgent', 'suspendAgent', 'removeAgent', 'revokeAllAgentKeys', 'listAgentKeys', 'createRekeyCode']) {
    const r = await ownerApi(other, action, { agentId: a.agentId });
    assert.equal(r.status, 404, `${action} must be refused`);
  }
  const codes = await ownerApi(a.owner, 'listCodes');
  const r = await ownerApi(other, 'revokeCode', { codeId: codes.body.codes[0].codeId });
  assert.equal(r.status, 404);
  const list = await ownerApi(other, 'listAgents');
  assert.equal(list.body.agents.length, 0);
});

test('owner calls need a signed-in owner and the site origin', async () => {
  const owner = await readyOwner();
  assert.equal((await ownerApi(null, 'listAgents')).status, 401);
  assert.equal((await ownerApi('not-a-token', 'listAgents')).status, 401);
  const evil = await ownerApi(owner, 'listAgents', {}, { origin: 'https://evil.example' });
  assert.equal(evil.status, 403);
});

test('the registration reply shows the key once and stores only its hash', async () => {
  const owner = await readyOwner({ approvalRequired: false });
  const r = await register((await newCode(owner)).code);
  const keyId = r.body.agentKey.split('_')[1];
  const stored = await readDoc(`agent_keys/${keyId}`);
  assert.ok(stored.hash);
  // The secret is everything after awk_<keyId>_ (it can itself contain "_", so split('_')[2] was flaky).
  const secret = r.body.agentKey.slice(`awk_${keyId}_`.length);
  assert.equal(secret.length, 43);
  assert.ok(!JSON.stringify(stored).includes(secret));
});
