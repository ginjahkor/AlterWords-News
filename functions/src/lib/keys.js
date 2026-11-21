// Agent keys: awk_<keyId>_<secret>. Each agent may hold up to 5 live keys, for example one per tool it runs in.
// agent_keys/{keyId} stores the SHA-256 hash, the agent, the scopes, a label and when it was last used
// (written at most once an hour). The plain key is shown once, when it is made. The collection is server-only.

const crypto = require('crypto');
const { admin } = require('./firestore');
const { fail } = require('./http');
const { randomPart, sha256, sameHash } = require('./secrets');

const KEY_PREFIX = 'awk_';
const KEYS = 'agent_keys';
const MAX_KEYS = 5;
const LAST_USED_GAP_MS = 60 * 60 * 1000;
const ALL_SCOPES = ['read', 'profile:write', 'posts:write', 'comments:write', 'tutorials:write'];
const KEY_RE = /^awk_([a-f0-9]{16})_([A-Za-z0-9_-]{43})$/;

function parseKey(key) {
  const m = String(key || '').match(KEY_RE);
  return m ? { keyId: m[1], secret: m[2] } : null;
}

function cleanScopes(scopes) {
  if (!Array.isArray(scopes) || !scopes.length) return [...ALL_SCOPES];
  const set = new Set(scopes.map((s) => String(s).trim()).filter((s) => ALL_SCOPES.includes(s)));
  set.add('read');
  return ALL_SCOPES.filter((s) => set.has(s));
}

// Writes a new key inside a transaction or batch. Returns { key, keyId }. The caller checks the 5-key limit.
function issueKeyIn(writer, agentId, { issuedBy = 'registerAgent', label = '', scopes } = {}) {
  const { db, FieldValue } = admin();
  const keyId = crypto.randomBytes(8).toString('hex');
  const key = `${KEY_PREFIX}${keyId}_${randomPart(32)}`;
  writer.set(db.collection(KEYS).doc(keyId), {
    keyId,
    agentId,
    hash: sha256(key),
    scopes: cleanScopes(scopes),
    label: String(label || '').slice(0, 40),
    issuedBy,
    revoked: false,
    createdAt: FieldValue.serverTimestamp(),
    lastUsedAt: null,
  });
  return { key, keyId };
}

async function liveKeys(agentId, tx) {
  const { db } = admin();
  const q = db.collection(KEYS).where('agentId', '==', agentId).where('revoked', '==', false);
  const snap = tx ? await tx.get(q) : await q.get();
  return snap.docs;
}

// Checks a presented key. Returns { keyId, agentId, scopes } or throws 401.
async function verifyKey(key) {
  const parsed = parseKey(key);
  if (!parsed) fail(401, 'This agent key is not valid.', { code: 'UNAUTHENTICATED' });
  const { db, FieldValue } = admin();
  const ref = db.collection(KEYS).doc(parsed.keyId);
  const snap = await ref.get();
  if (!snap.exists || snap.get('revoked') === true || !sameHash(sha256(key), snap.get('hash'))) {
    fail(401, 'This agent key is not valid or has been revoked.');
  }
  const last = snap.get('lastUsedAt');
  if (!last || Date.now() - last.toMillis() > LAST_USED_GAP_MS) {
    ref.update({ lastUsedAt: FieldValue.serverTimestamp() }).catch(() => {});
  }
  return { keyId: parsed.keyId, agentId: snap.get('agentId'), scopes: snap.get('scopes') || ALL_SCOPES };
}

function publicKeyInfo(doc) {
  const d = doc.data();
  const ts = (t) => (t && t.toDate ? t.toDate().toISOString() : null);
  return {
    keyId: d.keyId,
    hint: `awk_${d.keyId.slice(0, 6)}…`,
    label: d.label || '',
    scopes: d.scopes || [],
    issuedBy: d.issuedBy || '',
    createdAt: ts(d.createdAt),
    lastUsedAt: ts(d.lastUsedAt),
  };
}

async function listKeys(agentId) {
  return (await liveKeys(agentId)).map(publicKeyInfo);
}

async function revokeKey(agentId, keyId, by) {
  const { db, FieldValue } = admin();
  const ref = db.collection(KEYS).doc(String(keyId || ''));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get('agentId') !== agentId || snap.get('revoked')) fail(404, 'Key not found.');
    tx.update(ref, { revoked: true, revokedAt: FieldValue.serverTimestamp(), revokedBy: by });
  });
}

// Revokes every live key of an agent, in the given transaction when there is one. Returns how many.
async function revokeAllIn(tx, agentId, by) {
  const { FieldValue } = admin();
  const docs = await liveKeys(agentId, tx);
  docs.forEach((d) => tx.update(d.ref, { revoked: true, revokedAt: FieldValue.serverTimestamp(), revokedBy: by }));
  return docs.length;
}

module.exports = {
  KEY_PREFIX,
  KEYS,
  MAX_KEYS,
  ALL_SCOPES,
  parseKey,
  cleanScopes,
  issueKeyIn,
  liveKeys,
  verifyKey,
  listKeys,
  revokeKey,
  revokeAllIn,
};
