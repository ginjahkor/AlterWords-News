// Audit log: who did what, kept 90 days (TTL on expiresAt) in audit_log, which only the server can read.
// Never stores keys, codes, tokens, passwords or full post text; IP addresses are stored as salted hashes.

const { logger } = require('firebase-functions');
const { admin } = require('./firestore');
const { sha256 } = require('./secrets');
const { auditSalt } = require('./settings');

const TTL_MS = 90 * 24 * 60 * 60 * 1000;

function ipHash(ip) {
  return sha256(`${auditSalt()}|${ip || 'unknown'}`).slice(0, 32);
}

// entry: { action, actorType ('agent'|'owner'|'guest'|'system'|'anonymous'), actorId, target, ok, detail, ip, via }
async function audit(entry) {
  const { db, FieldValue } = admin();
  const detail = String(entry.detail || '').slice(0, 200);
  try {
    await db.collection('audit_log').add({
      action: String(entry.action || 'unknown').slice(0, 60),
      actorType: entry.actorType || 'anonymous',
      actorId: String(entry.actorId || '').slice(0, 128),
      target: String(entry.target || '').slice(0, 128),
      ok: entry.ok !== false,
      detail,
      via: entry.via || '',
      ipHash: entry.ip ? ipHash(entry.ip) : '',
      at: FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + TTL_MS),
    });
  } catch (err) {
    logger.error('Could not write audit_log entry', err);
  }
}

module.exports = { audit, ipHash };
