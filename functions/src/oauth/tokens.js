// OAuth tokens. Access tokens (awo_, 1 hour) and refresh tokens (awf_, 30 days) are bound to one grant: one
// owner, one of their agents, one app. oauth_tokens/{tokenId} keeps the hash only. Refresh tokens rotate on use;
// presenting a refresh token that was already used revokes the whole grant (it was probably stolen).

const crypto = require('crypto');
const { admin } = require('../lib/firestore');
const { fail } = require('../lib/http');
const { randomPart, sha256, sameHash } = require('../lib/secrets');
const { oauthFail } = require('./clients');

const ACCESS_TTL_S = 3600;
const REFRESH_TTL_S = 30 * 24 * 3600;
const TOKEN_RE = /^(awo|awf)_([a-f0-9]{16})_([A-Za-z0-9_-]{43})$/;

function mint(writer, type, grant) {
  const { db, Timestamp, FieldValue } = admin();
  const tokenId = crypto.randomBytes(8).toString('hex');
  const token = `${type}_${tokenId}_${randomPart(32)}`;
  const ttl = type === 'awo' ? ACCESS_TTL_S : REFRESH_TTL_S;
  writer.set(db.collection('oauth_tokens').doc(tokenId), {
    tokenId,
    type,
    hash: sha256(token),
    grantId: grant.grantId,
    clientId: grant.clientId,
    agentId: grant.agentId,
    ownerUid: grant.ownerUid,
    scopes: grant.scopes,
    resource: grant.resource,
    used: false,
    revoked: false,
    expiresAt: Timestamp.fromMillis(Date.now() + ttl * 1000),
    createdAt: FieldValue.serverTimestamp(),
  });
  return token;
}

function issuePair(writer, grant) {
  return {
    access_token: mint(writer, 'awo', grant),
    token_type: 'Bearer',
    expires_in: ACCESS_TTL_S,
    refresh_token: mint(writer, 'awf', grant),
    scope: grant.scopes.join(' '),
  };
}

async function lookup(tx, token, type) {
  const m = String(token || '').match(TOKEN_RE);
  if (!m || m[1] !== type) return null;
  const ref = admin().db.collection('oauth_tokens').doc(m[2]);
  const snap = tx ? await tx.get(ref) : await ref.get();
  if (!snap.exists || !sameHash(sha256(token), snap.get('hash'))) return null;
  return { ref, data: snap.data() };
}

async function grantIsLive(tx, grantId) {
  const ref = admin().db.collection('oauth_grants').doc(grantId);
  const snap = tx ? await tx.get(ref) : await ref.get();
  return snap.exists && snap.get('revoked') !== true;
}

// For the MCP server. Returns { tokenId, agentId, clientId, scopes } or throws 401.
async function verifyAccessToken(token) {
  const t = await lookup(null, token, 'awo');
  if (!t || t.data.revoked || t.data.expiresAt.toMillis() <= Date.now()) fail(401, 'This access token is not valid or has expired.');
  const { agentScopesFor, mcpResource } = require('./metadata');
  if (t.data.resource !== mcpResource()) fail(401, 'This access token was issued for another resource.');
  if (!(await grantIsLive(null, t.data.grantId))) fail(401, 'This app connection was revoked by the owner.');
  return { tokenId: t.data.tokenId, agentId: t.data.agentId, clientId: t.data.clientId, scopes: agentScopesFor(t.data.scopes) };
}

async function revokeGrantTokensIn(tx, grantId) {
  const { db, FieldValue } = admin();
  const snap = await tx.get(db.collection('oauth_tokens').where('grantId', '==', grantId).where('revoked', '==', false));
  snap.docs.forEach((d) => tx.update(d.ref, { revoked: true, revokedAt: FieldValue.serverTimestamp() }));
  return snap.size;
}

async function refresh(client, refreshToken) {
  const { db, FieldValue } = admin();
  let pair;
  let reused = null;
  await db.runTransaction(async (tx) => {
    const t = await lookup(tx, refreshToken, 'awf');
    if (!t || t.data.clientId !== client.clientId) oauthFail(400, 'invalid_grant', 'Refresh token not valid.');
    const live = await grantIsLive(tx, t.data.grantId);
    if (t.data.used || t.data.revoked) {
      reused = t.data.grantId;
      return;
    }
    if (!live || t.data.expiresAt.toMillis() <= Date.now()) oauthFail(400, 'invalid_grant', 'Refresh token has expired or was revoked.');
    tx.update(t.ref, { used: true, usedAt: FieldValue.serverTimestamp() });
    pair = issuePair(tx, { grantId: t.data.grantId, clientId: t.data.clientId, agentId: t.data.agentId, ownerUid: t.data.ownerUid, scopes: t.data.scopes, resource: t.data.resource });
  });
  if (reused) {
    await db.runTransaction(async (tx) => {
      await revokeGrantTokensIn(tx, reused);
      tx.update(db.collection('oauth_grants').doc(reused), { revoked: true, revokedAt: FieldValue.serverTimestamp(), revokedReason: 'refresh token reused' });
    });
    oauthFail(400, 'invalid_grant', 'Refresh token was already used. The connection has been revoked for safety.');
  }
  return pair;
}

// RFC 7009: always answers 200, revokes when the token is real and belongs to this client.
async function revokeToken(client, token) {
  const { FieldValue } = admin();
  for (const type of ['awo', 'awf']) {
    const t = await lookup(null, token, type);
    if (t && t.data.clientId === client.clientId) await t.ref.update({ revoked: true, revokedAt: FieldValue.serverTimestamp() });
  }
}

module.exports = { ACCESS_TTL_S, REFRESH_TTL_S, issuePair, verifyAccessToken, refresh, revokeToken, revokeGrantTokensIn };
