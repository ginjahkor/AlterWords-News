// OAuth clients, registered by the apps themselves (dynamic client registration, RFC 7591).
// oauth_clients/{clientId}: name, redirect URIs, how it authenticates and the hash of its secret, if any.
// Redirect URIs must be https, or http on localhost / 127.0.0.1 for desktop tools. No wildcards.

const crypto = require('crypto');
const { admin } = require('../lib/firestore');
const { randomPart, sha256, sameHash } = require('../lib/secrets');
const { cleanText } = require('../lib/validate');

class OAuthError extends Error {
  constructor(status, error, description) {
    super(description);
    this.status = status;
    this.error = error;
  }
}

const oauthFail = (status, error, description) => {
  throw new OAuthError(status, error, description);
};

function validRedirect(uri) {
  let u;
  try {
    u = new URL(String(uri));
  } catch (_) {
    return false;
  }
  if (u.hash || u.username || u.password) return false;
  if (u.protocol === 'https:') return true;
  return u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
}

async function registerClient(body) {
  const { db, FieldValue } = admin();
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : [];
  if (!uris.length || uris.length > 10 || !uris.every(validRedirect)) {
    oauthFail(400, 'invalid_redirect_uri', 'redirect_uris must be 1 to 10 https addresses (or http on localhost).');
  }
  const method = String(body.token_endpoint_auth_method || 'none');
  if (!['none', 'client_secret_post', 'client_secret_basic'].includes(method)) oauthFail(400, 'invalid_client_metadata', 'Unsupported token_endpoint_auth_method.');
  const grants = Array.isArray(body.grant_types) ? body.grant_types : ['authorization_code', 'refresh_token'];
  if (!grants.every((g) => ['authorization_code', 'refresh_token'].includes(g))) oauthFail(400, 'invalid_client_metadata', 'Unsupported grant_types.');
  const clientId = `awcl_${crypto.randomBytes(12).toString('hex')}`;
  const secret = method === 'none' ? '' : `awcs_${randomPart(32)}`;
  const name = cleanText(body.client_name, 80) || 'An app';
  const doc = {
    clientId,
    name,
    clientUri: /^https:\/\//.test(String(body.client_uri || '')) ? String(body.client_uri).slice(0, 300) : '',
    redirectUris: uris,
    authMethod: method,
    secretHash: secret ? sha256(secret) : '',
    grantTypes: grants,
    createdAt: FieldValue.serverTimestamp(),
  };
  await db.collection('oauth_clients').doc(clientId).set(doc);
  const reply = {
    client_id: clientId,
    client_name: name,
    redirect_uris: uris,
    token_endpoint_auth_method: method,
    grant_types: grants,
    response_types: ['code'],
    client_id_issued_at: Math.floor(Date.now() / 1000),
  };
  if (secret) {
    reply.client_secret = secret;
    reply.client_secret_expires_at = 0;
  }
  return reply;
}

async function getClient(clientId) {
  if (!/^awcl_[a-f0-9]{24}$/.test(String(clientId || ''))) return null;
  const snap = await admin().db.collection('oauth_clients').doc(String(clientId)).get();
  return snap.exists ? snap.data() : null;
}

// Reads client_id and client_secret from the form body or HTTP Basic, and checks them. Returns the client.
async function authenticateClient(req, body) {
  let id = body.client_id;
  let secret = body.client_secret;
  const basic = String(req.headers.authorization || '').match(/^Basic\s+(.+)$/i);
  if (basic) {
    const [u, p] = Buffer.from(basic[1], 'base64').toString('utf8').split(':');
    id = decodeURIComponent(u || '');
    secret = decodeURIComponent(p || '');
  }
  const client = await getClient(id);
  if (!client) oauthFail(401, 'invalid_client', 'Unknown client.');
  if (client.authMethod !== 'none' && !sameHash(sha256(secret || ''), client.secretHash)) oauthFail(401, 'invalid_client', 'Client authentication failed.');
  return client;
}

module.exports = { OAuthError, oauthFail, validRedirect, registerClient, getClient, authenticateClient };
