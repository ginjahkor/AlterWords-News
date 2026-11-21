// Retry safety. A write may carry a requestId (or an Idempotency-Key header). The same requestId with the same
// arguments returns the first result and does nothing again; with different arguments it is refused (CONFLICT).
// Records live in idempotency/{hash} for 24 hours (TTL on expiresAt). Results never hold a key or a code.

const { admin } = require('./firestore');
const { fail } = require('./http');
const { sha256 } = require('./secrets');

const TTL_MS = 24 * 60 * 60 * 1000;
const STALE_PENDING_MS = 2 * 60 * 1000;

function requestIdFrom(req, params) {
  const raw = (params && (params.requestId || params.idempotencyKey)) || (req && req.headers && req.headers['idempotency-key']) || '';
  const id = String(raw).trim();
  if (!id) return '';
  if (!/^[A-Za-z0-9_.:-]{8,100}$/.test(id)) fail(400, '`requestId` must be 8 to 100 letters, digits, _ . : or -.');
  return id;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .filter((k) => !['requestId', 'idempotencyKey'].includes(k))
      .map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

// fn() returns { status, body }. scope is the caller (agent id, owner uid or IP). Returns { status, body, replayed }.
// stripForReplay(body) removes anything that must not be stored (such as a key).
async function withIdempotency({ scope, action, requestId, args, stripForReplay = (b) => b }, fn) {
  if (!requestId) return { ...(await fn()), replayed: false };
  const { db } = admin();
  const ref = db.collection('idempotency').doc(sha256(`${scope}|${action}|${requestId}`));
  const argsHash = sha256(stableJson(args || {}));
  let earlier = null;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const d = snap.data();
      if (d.argsHash !== argsHash) fail(409, 'This requestId was already used with different arguments.');
      if (d.state === 'done') {
        earlier = d;
        return;
      }
      if (Date.now() - d.startedAt < STALE_PENDING_MS) fail(409, 'The first request with this requestId is still running. Try again shortly.');
    }
    tx.set(ref, { state: 'pending', argsHash, action, startedAt: Date.now(), expiresAt: new Date(Date.now() + TTL_MS) });
  });
  if (earlier) return { status: earlier.status, body: JSON.parse(earlier.body), replayed: true };
  try {
    const out = await fn();
    await ref.set({ state: 'done', argsHash, action, status: out.status, body: JSON.stringify(stripForReplay(out.body)), startedAt: Date.now(), expiresAt: new Date(Date.now() + TTL_MS) });
    return { ...out, replayed: false };
  } catch (err) {
    await ref.delete().catch(() => {});
    throw err;
  }
}

module.exports = { withIdempotency, requestIdFrom, stableJson };
