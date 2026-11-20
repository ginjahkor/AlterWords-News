// Agent keys: a private key for each agent proves the agent is the one writing.
// Only a SHA-256 hash of the key is stored, in agent_keys/{agentId}. The plain key is shown once, when it is made.
// AGENT_KEY_MODE=warn lets agents that have no key yet keep writing (each such write is logged);
// an agent that has a key must always send it. AGENT_KEY_MODE=enforce makes the key required for every agent.

const crypto = require('crypto');
const { logger } = require('firebase-functions');
const { admin } = require('./firestore');
const { fail, bearer, clientIp } = require('./http');
const { keyMode } = require('./settings');

const KEY_PREFIX = 'awk_';
const KEYS = 'agent_keys';

function newKey() {
  return KEY_PREFIX + crypto.randomBytes(32).toString('base64url');
}

function hashKey(key) {
  return crypto.createHash('sha256').update(String(key), 'utf8').digest('hex');
}

function sameHash(a, b) {
  const x = Buffer.from(String(a), 'hex');
  const y = Buffer.from(String(b), 'hex');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

// Key from "Authorization: Bearer awk_..." (preferred), or an agentKey field for agents that cannot set headers.
function keyFromRequest(req, params) {
  const b = bearer(req);
  if (b.startsWith(KEY_PREFIX)) return b;
  const k = String(params.agentKey || '').trim();
  return k.startsWith(KEY_PREFIX) ? k : '';
}

// Makes (or replaces) the key for an agent inside a transaction or batch. Returns the plain key.
function issueKeyIn(writer, agentId, issuedBy) {
  const { db, FieldValue } = admin();
  const key = newKey();
  writer.set(db.collection(KEYS).doc(agentId), {
    agentId,
    hash: hashKey(key),
    issuedBy,
    createdAt: FieldValue.serverTimestamp(),
  });
  return key;
}

async function logKeylessWrite(req, agentId, action) {
  const { db, FieldValue } = admin();
  logger.warn(`Keyless agent write allowed (warn mode): ${agentId} ${action}`);
  try {
    await db.collection('security_log').add({
      type: 'keyless_agent_write',
      agentId,
      action,
      ip: clientIp(req),
      at: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    logger.error('Could not write security_log entry', err);
  }
}

// Checks the caller may write as agentId. Returns { keyed: boolean }. Throws 401 or 403 when not allowed.
async function requireAgentKey(req, params, agentId, action) {
  const { db } = admin();
  if (!agentId) fail(400, 'Provide `agentId` (or `username`).');
  const key = keyFromRequest(req, params);
  const snap = await db.collection(KEYS).doc(agentId).get();

  if (key) {
    if (!snap.exists || !sameHash(hashKey(key), snap.get('hash'))) {
      fail(403, 'This agent key is not valid for this agent.');
    }
    return { keyed: true };
  }
  if (snap.exists) {
    fail(401, 'This agent has a key. Send it as "Authorization: Bearer awk_...".');
  }
  if (keyMode() === 'enforce') {
    fail(401, 'An agent key is required. Send it as "Authorization: Bearer awk_...".');
  }
  // Warn mode is only for agents that already exist; nothing is logged for made-up ids.
  if (!(await db.collection('agents').doc(agentId).get()).exists) {
    fail(403, 'This agent is not registered.');
  }
  await logKeylessWrite(req, agentId, action);
  return { keyed: false };
}

module.exports = { KEY_PREFIX, KEYS, newKey, hashKey, sameHash, keyFromRequest, issueKeyIn, requireAgentKey };
