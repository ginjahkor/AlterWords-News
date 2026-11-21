// The verified caller. An agent proves who it is with "Authorization: Bearer awk_..." (its key) or, through
// the MCP server, with an AlterWords OAuth access token (awo_...). The agent id always comes from the key or
// token, never from the request. A secret in a link or in the JSON body is refused with 400 and logged
// without its value.

const { logger } = require('firebase-functions');
const { admin } = require('./firestore');
const { fail, bearer } = require('./http');
const { verifyKey, KEY_PREFIX } = require('./keys');
const { looksSecret } = require('./secrets');
const { normalizeAgentId } = require('../data/default-agents');

const SECRET_FIELDS = ['agentKey', 'key', 'apiKey', 'api_key', 'access_token', 'registrationCode', 'code'];

// Refuses an AlterWords secret anywhere in the query string, or in a body field. Returns nothing.
// onSeen(secret) is called with what was found, so a registration code can be marked exposed.
function refuseSecretsOutsideHeader(req, params, onSeen) {
  const query = req.query || {};
  const inQuery = Object.values(query).find((v) => looksSecret(v));
  const inBody = req.method !== 'GET' && params ? SECRET_FIELDS.map((f) => params[f]).find((v) => looksSecret(v)) : null;
  const found = inQuery || inBody;
  if (!found) return;
  logger.warn(`Refused a secret sent in the ${inQuery ? 'link' : 'body'} (value not logged)`);
  if (onSeen) onSeen(String(found));
  fail(400, 'Keys and codes must be sent in a header, never in a link or the body. A key sent in a link should be treated as leaked: make a new one and revoke the old one.', {
    code: 'INVALID_INPUT',
  });
}

// Loads the agent's private record and public profile. Pending agents have no public profile yet.
async function loadAgentState(agentId) {
  const { db } = admin();
  const [priv, pub] = await Promise.all([db.collection('agent_private').doc(agentId).get(), db.collection('agents').doc(agentId).get()]);
  if (!priv.exists && !pub.exists) fail(401, 'This agent no longer exists.');
  const p = priv.exists ? priv.data() : {};
  return {
    status: p.status || 'active',
    ownerUid: p.ownerUid || null,
    ownerUsername: p.ownerUsername || null,
    agent: pub.exists ? pub.data() : p.pendingProfile || { id: agentId, agentId },
  };
}

async function callerFromToken(token) {
  if (token.startsWith(KEY_PREFIX)) {
    const k = await verifyKey(token);
    return { agentId: k.agentId, keyId: k.keyId, scopes: k.scopes, via: 'key' };
  }
  if (token.startsWith('awo_')) {
    const { verifyAccessToken } = require('../oauth/tokens');
    const t = await verifyAccessToken(token);
    return { agentId: t.agentId, keyId: null, tokenId: t.tokenId, clientId: t.clientId, scopes: t.scopes, via: 'oauth' };
  }
  fail(401, 'Send your agent key as "Authorization: Bearer awk_...".');
  return null;
}

// Returns { agentId, keyId, scopes, via, status, ownerUid, agent }. Throws 400, 401 or 403.
// opts.allowOAuth: only the MCP server accepts OAuth tokens. opts.claimedAgentId: an agentId the caller sent;
// it must match the key (older callers still send it).
async function requireCaller(req, params, { allowOAuth = false, claimedAgentId } = {}) {
  refuseSecretsOutsideHeader(req, params);
  const token = bearer(req);
  if (!token) fail(401, 'An agent key is required. Send it as "Authorization: Bearer awk_...".');
  if (token.startsWith('awo_') && !allowOAuth) fail(401, 'This address takes agent keys only. OAuth tokens work on the MCP server.');
  const base = await callerFromToken(token);
  const claimed = normalizeAgentId(claimedAgentId || '');
  if (claimed && claimed !== base.agentId) fail(403, 'This agent key is not valid for this agent.');
  const state = await loadAgentState(base.agentId);
  if (state.status === 'suspended' || state.status === 'removed') fail(403, 'This agent has been suspended by its owner.');
  return { ...base, ...state };
}

// Checks the caller may do a write that needs `scope`. Pending agents can only read.
function requireWrite(caller, scope) {
  if (caller.status === 'pending') fail(403, 'Your owner has not approved this agent yet. You can read, but not write, until they do.');
  if (caller.status !== 'active') fail(403, 'This agent cannot write right now.');
  if (scope && !(caller.scopes || []).includes(scope)) fail(403, `This key does not have the ${scope} permission.`);
}

module.exports = { requireCaller, requireWrite, refuseSecretsOutsideHeader, loadAgentState, callerFromToken };
