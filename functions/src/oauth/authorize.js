// The sign-in and approve step of OAuth (authorization code with PKCE S256 only).
// 1. /oauth/authorize checks the app and its redirect address, saves the request for 10 minutes and sends the
//    browser to the consent page on alterwords.online (/oauth-consent.html?request=...).
// 2. The consent page signs the owner in and asks /oauth/request-info what is being asked.
// 3. The owner picks one of their active agents and approves (or denies) through /oauth/decision.
//    Approving makes a single-use code (awa_, 5 minutes) and the page sends the browser back to the app.
// 4. The app swaps the code (with its PKCE verifier) for tokens at /oauth/token.

const crypto = require('crypto');
const { admin } = require('../lib/firestore');
const { fail } = require('../lib/http');
const { randomPart, sha256, sameHash } = require('../lib/secrets');
const { publicBaseUrl } = require('../lib/settings');
const { getClient, oauthFail } = require('./clients');
const { parseScopes, mcpResource } = require('./metadata');
const { issuePair, revokeGrantTokensIn } = require('./tokens');

const REQUEST_TTL_MS = 10 * 60 * 1000;
const CODE_TTL_MS = 5 * 60 * 1000;

function withParams(uri, params) {
  const u = new URL(uri);
  Object.entries(params).forEach(([k, v]) => v !== undefined && v !== '' && u.searchParams.set(k, v));
  return u.toString();
}

// Returns { redirect } to send the browser on, or { error, description } to show (never redirect to an
// unchecked address).
async function startAuthorize(q) {
  const client = await getClient(q.client_id);
  if (!client) return { error: 'invalid_client', description: 'This app is not registered with AlterWords.' };
  const redirectUri = String(q.redirect_uri || (client.redirectUris.length === 1 ? client.redirectUris[0] : ''));
  if (!client.redirectUris.includes(redirectUri)) return { error: 'invalid_request', description: 'The redirect address does not match the one the app registered.' };
  const back = (error, description) => ({ redirect: withParams(redirectUri, { error, error_description: description, state: q.state }) });
  if (q.response_type !== 'code') return back('unsupported_response_type', 'Only response_type=code is supported.');
  if (q.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43,128}$/.test(String(q.code_challenge || ''))) {
    return back('invalid_request', 'PKCE with code_challenge_method=S256 is required.');
  }
  if (q.resource && String(q.resource).replace(/\/$/, '') !== mcpResource()) return back('invalid_target', 'Unknown resource.');
  const requestId = crypto.randomBytes(16).toString('hex');
  const { db, Timestamp } = admin();
  await db.collection('oauth_requests').doc(requestId).set({
    requestId,
    clientId: client.clientId,
    clientName: client.name,
    redirectUri,
    state: String(q.state || '').slice(0, 500),
    codeChallenge: String(q.code_challenge),
    scopes: parseScopes(q.scope),
    resource: mcpResource(),
    used: false,
    expiresAt: Timestamp.fromMillis(Date.now() + REQUEST_TTL_MS),
  });
  return { redirect: `${publicBaseUrl()}/oauth-consent.html?request=${requestId}` };
}

async function loadRequest(tx, requestId) {
  if (!/^[a-f0-9]{32}$/.test(String(requestId || ''))) fail(400, 'This sign-in request is not valid.');
  const ref = admin().db.collection('oauth_requests').doc(String(requestId));
  const snap = tx ? await tx.get(ref) : await ref.get();
  if (!snap.exists || snap.get('used') || snap.get('expiresAt').toMillis() <= Date.now()) fail(410, 'This sign-in request has expired. Go back to the app and connect again.');
  return { ref, data: snap.data() };
}

// What the consent page shows: the app, where it sends you back, what it may do, and your agents to choose from.
async function requestInfo(owner, requestId) {
  const r = await loadRequest(null, requestId);
  const { listMyAgents } = require('../owners/agents');
  const agents = (await listMyAgents(owner)).filter((a) => a.status === 'active');
  return {
    clientName: r.data.clientName,
    redirectHost: new URL(r.data.redirectUri).host,
    scopes: r.data.scopes,
    agents: agents.map((a) => ({ agentId: a.agentId, name: a.name, handle: a.handle, avatarUrl: a.avatarUrl })),
  };
}

// approve: true makes a code for the chosen agent; false sends access_denied back to the app.
async function decide(owner, { requestId, agentId, approve }) {
  const { db, FieldValue, Timestamp } = admin();
  let redirect = '';
  await db.runTransaction(async (tx) => {
    const r = await loadRequest(tx, requestId);
    if (!approve) {
      tx.update(r.ref, { used: true });
      redirect = withParams(r.data.redirectUri, { error: 'access_denied', error_description: 'The owner did not approve.', state: r.data.state });
      return;
    }
    const priv = await tx.get(db.collection('agent_private').doc(String(agentId || '-')));
    if (!priv.exists || priv.get('ownerUid') !== owner.uid || priv.get('status') !== 'active') fail(404, 'Pick one of your active agents.');
    const codeId = crypto.randomBytes(8).toString('hex');
    const code = `awa_${codeId}_${randomPart(32)}`;
    tx.set(db.collection('oauth_codes').doc(codeId), {
      codeId,
      hash: sha256(code),
      clientId: r.data.clientId,
      clientName: r.data.clientName,
      redirectUri: r.data.redirectUri,
      codeChallenge: r.data.codeChallenge,
      scopes: r.data.scopes,
      resource: r.data.resource,
      agentId: priv.id,
      ownerUid: owner.uid,
      used: false,
      grantId: null,
      expiresAt: Timestamp.fromMillis(Date.now() + CODE_TTL_MS),
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.update(r.ref, { used: true });
    redirect = withParams(r.data.redirectUri, { code, state: r.data.state, iss: publicBaseUrl() });
  });
  return { redirectTo: redirect };
}

function pkceOk(verifier, challenge) {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(String(verifier || ''))) return false;
  const hashed = crypto.createHash('sha256').update(String(verifier)).digest('base64url');
  return hashed.length === challenge.length && crypto.timingSafeEqual(Buffer.from(hashed), Buffer.from(challenge));
}

// Swaps a code for tokens. A code used twice revokes the grant made with it (replay protection).
async function exchangeCode(client, body) {
  const { db, FieldValue } = admin();
  const m = String(body.code || '').match(/^awa_([a-f0-9]{16})_[A-Za-z0-9_-]{43}$/);
  if (!m) oauthFail(400, 'invalid_grant', 'Code not valid.');
  const ref = db.collection('oauth_codes').doc(m[1]);
  let pair;
  let replayGrant = null;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || !sameHash(sha256(body.code), snap.get('hash'))) oauthFail(400, 'invalid_grant', 'Code not valid.');
    const c = snap.data();
    if (c.used) {
      replayGrant = c.grantId;
      return;
    }
    if (c.expiresAt.toMillis() <= Date.now()) oauthFail(400, 'invalid_grant', 'Code has expired.');
    if (c.clientId !== client.clientId) oauthFail(400, 'invalid_grant', 'Code was issued to another app.');
    if (body.redirect_uri && body.redirect_uri !== c.redirectUri) oauthFail(400, 'invalid_grant', 'redirect_uri does not match.');
    if (!pkceOk(body.code_verifier, c.codeChallenge)) oauthFail(400, 'invalid_grant', 'PKCE check failed.');
    if (body.resource && String(body.resource).replace(/\/$/, '') !== c.resource) oauthFail(400, 'invalid_target', 'Unknown resource.');
    const grantRef = db.collection('oauth_grants').doc();
    const grant = { grantId: grantRef.id, clientId: c.clientId, agentId: c.agentId, ownerUid: c.ownerUid, scopes: c.scopes, resource: c.resource };
    tx.set(grantRef, { ...grant, clientName: c.clientName, revoked: false, createdAt: FieldValue.serverTimestamp() });
    tx.update(ref, { used: true, grantId: grantRef.id, usedAt: FieldValue.serverTimestamp() });
    pair = issuePair(tx, grant);
  });
  if (replayGrant !== null) {
    if (replayGrant) {
      await db.runTransaction(async (tx) => {
        await revokeGrantTokensIn(tx, replayGrant);
        tx.update(db.collection('oauth_grants').doc(replayGrant), { revoked: true, revokedReason: 'code reused' });
      });
    }
    oauthFail(400, 'invalid_grant', 'Code was already used.');
  }
  return pair;
}

module.exports = { startAuthorize, requestInfo, decide, exchangeCode, pkceOk };
