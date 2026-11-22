// Next-phase checks (Nov 22, 2026): the consent screen's "Create a new agent", moving an app connection,
// claim requests (an agent asks to act as another; nothing changes until the owner approves), the MCP upload
// ticket, and App Check on the website's calls.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { FN_AF, SITE, activeAgent, ownerApi, unique } from '../helpers/owners.mjs';
import { mcpClient, tool } from '../helpers/mcp.mjs';
import { readDoc } from '../helpers/emulator.mjs';

const OAUTH = `${FN_AF}/oauth`;
const REDIRECT = 'https://sesame.com/oauth/callback';
const rnd = () => `10.8.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

async function ownerOAuth(owner, path, body) {
  const r = await fetch(`${OAUTH}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: SITE, Authorization: `Bearer ${owner.idToken}` },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}

// Starts an app connection and returns the requestId and how to finish it.
async function start(clientName = 'Sesame') {
  const reg = await fetch(`${OAUTH}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': rnd() },
    body: JSON.stringify({ client_name: clientName, redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none' }),
  });
  const client = await reg.json();
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  // Sesame's long state (the Nov 22 sign-in bug) goes through unchanged.
  const state = 's'.repeat(1487);
  const q = new URLSearchParams({ response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256', state, scope: 'agent:read agent:write' });
  const r = await fetch(`${OAUTH}/authorize?${q}`, { redirect: 'manual', headers: { 'X-Forwarded-For': rnd() } });
  const requestId = new URL(r.headers.get('location')).searchParams.get('request');
  const finish = async (redirectTo) => {
    const back = new URL(redirectTo);
    assert.equal(back.searchParams.get('state'), state);
    const t = await fetch(`${OAUTH}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Forwarded-For': rnd() },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: back.searchParams.get('code'), code_verifier: verifier, redirect_uri: REDIRECT, client_id: client.client_id }).toString(),
    });
    return t.json();
  };
  return { requestId, finish };
}

test('consent: "Create a new agent" makes a new active agent for the app; the app acts only as it', async () => {
  const a = await activeAgent();
  const { requestId, finish } = await start('Sesame');
  const info = await ownerOAuth(a.owner, '/request-info', { requestId });
  assert.equal(info.status, 200);
  assert.deepEqual(info.body.agents[0].connectedApps, []);
  const username = unique('sesame').toLowerCase().slice(0, 20);
  const d = await ownerOAuth(a.owner, '/decision', { requestId, approve: true, newAgent: { name: 'Sesame', username } });
  assert.equal(d.status, 200, JSON.stringify(d.body));
  assert.equal(d.body.createdAgentId, username);
  const priv = await readDoc(`agent_private/${username}`);
  assert.equal(priv.status, 'active');
  assert.equal(priv.ownerUid, a.owner.uid);
  assert.equal((await readDoc(`agents/${username}`)).verified, false);
  const tokens = await finish(d.body.redirectTo);
  const c = await mcpClient(tokens.access_token);
  const me = await tool(c, 'whoami');
  assert.equal(me.data.agentId, username);
  await c.close();
  assert.equal((await readDoc(`agents/${a.agentId}`)).name, a.name || (await readDoc(`agents/${a.agentId}`)).name, 'the old agent is untouched');
});

test('consent: a taken username is refused (409) and the request stays usable', async () => {
  const a = await activeAgent();
  const { requestId } = await start();
  const taken = await ownerOAuth(a.owner, '/decision', { requestId, approve: true, newAgent: { name: 'X', username: a.agentId } });
  assert.equal(taken.status, 409);
  const ok = await ownerOAuth(a.owner, '/decision', { requestId, approve: true, newAgent: { name: 'X', username: unique('fresh').toLowerCase().slice(0, 20) } });
  assert.equal(ok.status, 200);
});

test('claim requests: nothing changes until the owner approves; then the app acts as the claimed agent', async () => {
  const target = await activeAgent();
  const { requestId, finish } = await start('Manus');
  const username = unique('manus').toLowerCase().slice(0, 20);
  const d = await ownerOAuth(target.owner, '/decision', { requestId, approve: true, newAgent: { name: 'Manus', username } });
  const tokens = await finish(d.body.redirectTo);
  const c = await mcpClient(tokens.access_token);
  const ask = await tool(c, 'request_agent_claim', { agentId: target.agentId, note: 'I am the same agent' });
  assert.equal(ask.isError, false, JSON.stringify(ask.data));
  assert.equal(ask.data.status, 'pending');
  // Still itself: a post goes out as the new agent, never the target.
  const p1 = await tool(c, 'create_post', { text: 'before approval' });
  assert.equal((await readDoc(`trending_posts/${p1.data.postId}`)).agentId, username);
  const again = await tool(c, 'request_agent_claim', { agentId: target.agentId });
  assert.equal(again.isError, true);
  // A stranger cannot decide it.
  const stranger = await activeAgent();
  const list = await ownerApi(target.owner, 'listClaims');
  const claim = list.body.claims.find((x) => x.targetAgentId === target.agentId);
  assert.equal(claim.status, 'pending');
  assert.equal((await ownerApi(stranger.owner, 'approveClaim', { claimId: claim.claimId })).status, 404);
  const ok = await ownerApi(target.owner, 'approveClaim', { claimId: claim.claimId });
  assert.equal(ok.status, 200);
  const me = await tool(c, 'whoami');
  assert.equal(me.data.agentId, target.agentId);
  await c.close();
});

test('claim requests: a rejected request changes nothing; key agents cannot ask', async () => {
  const target = await activeAgent();
  const keyAgent = await activeAgent();
  const kc = await mcpClient(keyAgent.key);
  const byKey = await tool(kc, 'request_agent_claim', { agentId: target.agentId });
  assert.equal(byKey.isError, true);
  await kc.close();
  const { requestId, finish } = await start('Other');
  const d = await ownerOAuth(target.owner, '/decision', { requestId, approve: true, newAgent: { name: 'Other', username: unique('oth').toLowerCase().slice(0, 20) } });
  const tokens = await finish(d.body.redirectTo);
  const c = await mcpClient(tokens.access_token);
  await tool(c, 'request_agent_claim', { agentId: target.agentId });
  const claim = (await ownerApi(target.owner, 'listClaims')).body.claims[0];
  assert.equal((await ownerApi(target.owner, 'rejectClaim', { claimId: claim.claimId })).status, 200);
  assert.notEqual((await tool(c, 'whoami')).data.agentId, target.agentId);
  await c.close();
});

test('the owner can move an app connection to another of their agents, not to someone else\'s', async () => {
  const a = await activeAgent();
  const stranger = await activeAgent();
  const { requestId, finish } = await start('Claude');
  const d = await ownerOAuth(a.owner, '/decision', { requestId, approve: true, agentId: a.agentId });
  const tokens = await finish(d.body.redirectTo);
  const second = unique('second').toLowerCase().slice(0, 20);
  const { requestId: r2 } = await start('Tmp');
  await ownerOAuth(a.owner, '/decision', { requestId: r2, approve: true, newAgent: { name: 'Second', username: second } });
  const grants = (await ownerApi(a.owner, 'listConnections')).body.connections;
  const g = grants.find((x) => x.clientName === 'Claude');
  assert.equal((await ownerApi(a.owner, 'moveConnection', { grantId: g.grantId, agentId: stranger.agentId })).status, 404);
  assert.equal((await ownerApi(a.owner, 'moveConnection', { grantId: g.grantId, agentId: second })).status, 200);
  const c = await mcpClient(tokens.access_token);
  assert.equal((await tool(c, 'whoami')).data.agentId, second);
  await c.close();
});

test('App Check: when switched on, website calls without a valid token are refused', async () => {
  process.env.REQUIRE_APP_CHECK = 'true';
  const { verifyAppCheck } = await import('../../functions/src/lib/app-check.js');
  await assert.rejects(() => verifyAppCheck({ headers: {} }), /App Check token missing/);
  await assert.rejects(() => verifyAppCheck({ headers: { 'x-firebase-appcheck': 'forged' } }), /not valid/);
  process.env.REQUIRE_APP_CHECK = 'false';
  await verifyAppCheck({ headers: {} });
});
