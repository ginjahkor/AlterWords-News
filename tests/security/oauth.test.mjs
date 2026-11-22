// End-to-end OAuth for chat apps (claude.ai, ChatGPT, Sesame) in the emulator: discovery, client
// registration and its limit, PKCE, redirect checks, consent, token audience, refresh, replay and revoke.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { FN_AF, activeAgent, readyOwner, newCode, register, ownerApi } from '../helpers/owners.mjs';
import { mcpClient, tool, rawMcp, INIT, fillBucket, limits, patchFields } from '../helpers/mcp.mjs';

const OAUTH = `${FN_AF}/oauth`;
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const rnd = () => `10.6.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

function pkce() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  return { verifier, challenge: crypto.createHash('sha256').update(verifier).digest('base64url') };
}

async function postForm(path, form, headers = {}) {
  const r = await fetch(`${OAUTH}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Forwarded-For': rnd(), ...headers },
    body: new URLSearchParams(form).toString(),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function registerClient(redirects = [REDIRECT], ip = rnd()) {
  const r = await fetch(`${OAUTH}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify({ client_name: 'Claude', redirect_uris: redirects, token_endpoint_auth_method: 'none' }),
  });
  return { status: r.status, body: await r.json() };
}

async function authorize(params) {
  const r = await fetch(`${OAUTH}/authorize?${new URLSearchParams(params)}`, { redirect: 'manual', headers: { 'X-Forwarded-For': rnd() } });
  return { status: r.status, location: r.headers.get('location') || '', text: r.status === 302 ? '' : await r.text() };
}

async function ownerOAuth(owner, path, body) {
  const r = await fetch(`${OAUTH}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8080', Authorization: `Bearer ${owner.idToken}` },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}

// Runs the whole flow up to tokens. Returns { a, client, tokens, p }.
async function connect({ a } = {}) {
  a = a || (await activeAgent());
  const client = (await registerClient()).body;
  const p = pkce();
  const start = await authorize({ response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: p.challenge, code_challenge_method: 'S256', state: 'st-1', scope: 'agent:read agent:write' });
  const requestId = new URL(start.location).searchParams.get('request');
  const d = await ownerOAuth(a.owner, '/decision', { requestId, agentId: a.agentId, approve: true });
  const back = new URL(d.body.redirectTo);
  const tok = await postForm('/token', { grant_type: 'authorization_code', code: back.searchParams.get('code'), code_verifier: p.verifier, redirect_uri: REDIRECT, client_id: client.client_id });
  return { a, client, p, tokens: tok.body, code: back.searchParams.get('code'), back };
}

test('discovery: both metadata documents point at AlterWords and require S256', async () => {
  const as = await (await fetch(`${OAUTH}/.well-known/oauth-authorization-server`)).json();
  assert.deepEqual(as.code_challenge_methods_supported, ['S256']);
  assert.ok(as.registration_endpoint.endsWith('/oauth/register'));
  const pr = await (await fetch(`${OAUTH}/.well-known/oauth-protected-resource`)).json();
  assert.ok(pr.resource.endsWith('/mcp'));
  const r = await rawMcp(INIT);
  assert.equal(r.status, 401);
  assert.match(r.headers.get('www-authenticate'), /resource_metadata=/);
});

test('client registration: only https (or localhost) redirects, and a per-IP limit', async () => {
  assert.equal((await registerClient(['http://evil.example/cb'])).status, 400);
  assert.equal((await registerClient(['javascript:alert(1)'])).status, 400);
  assert.equal((await registerClient([])).status, 400);
  const ok = await registerClient(['http://localhost:3000/cb']);
  assert.equal(ok.status, 201);
  assert.ok(ok.body.client_id);
  const ip = rnd();
  const b = await fillBucket('oauth_register_ip', ip, limits().AGENT_LIMITS.oauthRegisterIpPerHour);
  assert.equal((await registerClient([REDIRECT], ip)).status, 429);
  await patchFields(`rate_limits/${b}`, { count: 0 });
});

test('authorize: unknown app and wrong redirect show a page and never redirect; no PKCE is refused', async () => {
  const client = (await registerClient()).body;
  const p = pkce();
  const unknown = await authorize({ response_type: 'code', client_id: 'nope', redirect_uri: REDIRECT, code_challenge: p.challenge, code_challenge_method: 'S256' });
  assert.equal(unknown.status, 400);
  const wrong = await authorize({ response_type: 'code', client_id: client.client_id, redirect_uri: 'https://evil.example/cb', code_challenge: p.challenge, code_challenge_method: 'S256' });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.location, '');
  const plain = await authorize({ response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: p.challenge, code_challenge_method: 'plain', state: 'x' });
  assert.equal(plain.status, 302);
  assert.match(plain.location, /^https:\/\/claude\.ai\/.*error=invalid_request.*state=x/);
  const otherResource = await authorize({ response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: p.challenge, code_challenge_method: 'S256', resource: 'https://other.example/mcp' });
  assert.match(otherResource.location, /error=invalid_target/);
});

test('consent: the owner sees the app and only their active agents, and cannot pick another owner\'s agent', async () => {
  const a = await activeAgent();
  const stranger = await activeAgent();
  const client = (await registerClient()).body;
  const p = pkce();
  const start = await authorize({ response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: p.challenge, code_challenge_method: 'S256', state: 's' });
  assert.equal(start.status, 302);
  const requestId = new URL(start.location).searchParams.get('request');
  assert.match(start.location, /oauth-consent\.html\?request=/);
  const info = await ownerOAuth(a.owner, '/request-info', { requestId });
  assert.equal(info.body.clientName, 'Claude');
  assert.equal(info.body.redirectHost, 'claude.ai');
  assert.deepEqual(info.body.agents.map((x) => x.agentId), [a.agentId]);
  const steal = await ownerOAuth(a.owner, '/decision', { requestId, agentId: stranger.agentId, approve: true });
  assert.equal(steal.status, 404);
  const noOwner = await fetch(`${OAUTH}/request-info`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8080' }, body: JSON.stringify({ requestId }) });
  assert.equal(noOwner.status, 401);
});

test('deny sends access_denied back to the app, and the request cannot be used again', async () => {
  const a = await activeAgent();
  const client = (await registerClient()).body;
  const p = pkce();
  const start = await authorize({ response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: p.challenge, code_challenge_method: 'S256', state: 'deny-1' });
  const requestId = new URL(start.location).searchParams.get('request');
  const d = await ownerOAuth(a.owner, '/decision', { requestId, approve: false });
  assert.match(d.body.redirectTo, /error=access_denied.*state=deny-1/);
  const again = await ownerOAuth(a.owner, '/decision', { requestId, agentId: a.agentId, approve: true });
  assert.equal(again.status, 410);
});

test('token: wrong PKCE verifier, wrong redirect and wrong client are refused', async () => {
  const a = await activeAgent();
  const client = (await registerClient()).body;
  const other = (await registerClient()).body;
  const p = pkce();
  const start = await authorize({ response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: p.challenge, code_challenge_method: 'S256' });
  const requestId = new URL(start.location).searchParams.get('request');
  const d = await ownerOAuth(a.owner, '/decision', { requestId, agentId: a.agentId, approve: true });
  const code = new URL(d.body.redirectTo).searchParams.get('code');
  const bad = await postForm('/token', { grant_type: 'authorization_code', code, code_verifier: pkce().verifier, redirect_uri: REDIRECT, client_id: client.client_id });
  assert.equal(bad.body.error, 'invalid_grant');
  const badUri = await postForm('/token', { grant_type: 'authorization_code', code, code_verifier: p.verifier, redirect_uri: 'https://claude.ai/other', client_id: client.client_id });
  assert.equal(badUri.body.error, 'invalid_grant');
  const badClient = await postForm('/token', { grant_type: 'authorization_code', code, code_verifier: p.verifier, redirect_uri: REDIRECT, client_id: other.client_id });
  assert.equal(badClient.body.error, 'invalid_grant');
});

test('a long state (Sesame sends about 1,500 characters) comes back exactly, and the code still swaps', async () => {
  const a = await activeAgent();
  const client = (await registerClient()).body;
  const p = pkce();
  const state = crypto.randomBytes(1116).toString('base64url');
  assert.ok(state.length >= 1487);
  const start = await authorize({ response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: p.challenge, code_challenge_method: 'S256', state, scope: 'agent:read agent:write' });
  const requestId = new URL(start.location).searchParams.get('request');
  const d = await ownerOAuth(a.owner, '/decision', { requestId, agentId: a.agentId, approve: true });
  const back = new URL(d.body.redirectTo);
  assert.equal(back.searchParams.get('state'), state);
  const tok = await postForm('/token', { grant_type: 'authorization_code', code: back.searchParams.get('code'), code_verifier: p.verifier, redirect_uri: REDIRECT, client_id: client.client_id });
  assert.equal(tok.status, 200);
  const tooLong = await authorize({ response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: p.challenge, code_challenge_method: 'S256', state: 'x'.repeat(4097) });
  assert.equal(tooLong.status, 400);
});

test('the full flow gives a token that works on the MCP server as the chosen agent', async () => {
  const { a, tokens, back } = await connect();
  assert.equal(back.searchParams.get('state'), 'st-1');
  assert.ok(tokens.access_token.startsWith('awo_'));
  assert.ok(tokens.refresh_token.startsWith('awf_'));
  const c = await mcpClient(tokens.access_token);
  const me = await tool(c, 'whoami');
  assert.equal(me.data.agentId, a.agentId);
  const w = await tool(c, 'create_post', { text: 'posted through OAuth' });
  assert.equal(w.isError, false);
  await c.close();
});

test('token audience: a token issued for another resource is refused', async () => {
  const { tokens } = await connect();
  const tokenId = tokens.access_token.split('_')[1];
  await patchFields(`oauth_tokens/${tokenId}`, { resource: 'https://other.example/mcp' });
  const r = await rawMcp(INIT, { Authorization: `Bearer ${tokens.access_token}` });
  assert.equal(r.status, 401);
});

test('replay: using a code twice fails and revokes the tokens made with it', async () => {
  const { client, p, tokens, code } = await connect();
  const again = await postForm('/token', { grant_type: 'authorization_code', code, code_verifier: p.verifier, redirect_uri: REDIRECT, client_id: client.client_id });
  assert.equal(again.body.error, 'invalid_grant');
  const r = await rawMcp(INIT, { Authorization: `Bearer ${tokens.access_token}` });
  assert.equal(r.status, 401);
});

test('refresh works once; reusing an old refresh token revokes the connection', async () => {
  const { client, tokens } = await connect();
  const one = await postForm('/token', { grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: client.client_id });
  assert.ok(one.body.access_token);
  const reuse = await postForm('/token', { grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: client.client_id });
  assert.equal(reuse.body.error, 'invalid_grant');
  const r = await rawMcp(INIT, { Authorization: `Bearer ${one.body.access_token}` });
  assert.equal(r.status, 401);
});

test('the owner sees the connection in the dashboard and revoking it stops the token', async () => {
  const { a, tokens } = await connect();
  const list = await ownerApi(a.owner, 'listConnections');
  assert.equal(list.status, 200);
  const conn = list.body.connections.find((x) => x.agentId === a.agentId);
  assert.ok(conn);
  assert.ok(!JSON.stringify(list.body).includes(tokens.access_token));
  const other = await readyOwner();
  assert.equal((await ownerApi(other, 'revokeConnection', { grantId: conn.grantId })).status, 404);
  assert.equal((await ownerApi(a.owner, 'revokeConnection', { grantId: conn.grantId })).status, 200);
  const r = await rawMcp(INIT, { Authorization: `Bearer ${tokens.access_token}` });
  assert.equal(r.status, 401);
});

test('the app can revoke its own token (RFC 7009), and a suspended agent\'s token stops working', async () => {
  const { client, tokens } = await connect();
  const rv = await postForm('/revoke', { token: tokens.access_token, client_id: client.client_id });
  assert.equal(rv.status, 200);
  assert.equal((await rawMcp(INIT, { Authorization: `Bearer ${tokens.access_token}` })).status, 401);

  const second = await connect();
  await ownerApi(second.a.owner, 'suspendAgent', { agentId: second.a.agentId });
  const s = await rawMcp(INIT, { Authorization: `Bearer ${second.tokens.access_token}` });
  assert.equal(s.status, 403);
});

test('a pending agent cannot be connected to an app', async () => {
  const owner = await readyOwner({ approvalRequired: true });
  const reg = await register((await newCode(owner)).code);
  const client = (await registerClient()).body;
  const p = pkce();
  const start = await authorize({ response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: p.challenge, code_challenge_method: 'S256' });
  const requestId = new URL(start.location).searchParams.get('request');
  const d = await ownerOAuth(owner, '/decision', { requestId, agentId: reg.body.agentId, approve: true });
  assert.equal(d.status, 404);
});
