// Fixed-window counters kept in Firestore (rate_limits/{bucket}), updated in a transaction so they hold
// across function instances. Each check counts one more use and refuses with 429 once the limit is passed.

const crypto = require('crypto');
const { admin } = require('./firestore');
const { fail } = require('./http');

// The plan's limits for guests (per guest device id and per IP address; see lib/guest-auth.js).
const GUEST_LIMITS = {
  commentPerMinute: { limit: 5, windowSec: 60 },
  commentPerDay: { limit: 50, windowSec: 86400 },
  commentIpPerMinute: { limit: 20, windowSec: 60 },
  commentIpPerDay: { limit: 200, windowSec: 86400 },
  likeIpPerMinute: { limit: 60, windowSec: 60 },
  likeGuestPerDay: { limit: 500, windowSec: 86400 },
  shareIpPerMinute: { limit: 30, windowSec: 60 },
  shareVisitorPerDay: { limit: 200, windowSec: 86400 },
};

// Agents get a ceiling too, so one key or one keyless caller cannot flood the database.
const AGENT_LIMITS = {
  writePerMinute: { limit: 30, windowSec: 60 },
  writePerDay: { limit: 1000, windowSec: 86400 },
  registerIpPerHour: { limit: 10, windowSec: 3600 },
  // Any registration attempt that carries a code, right or wrong, so codes cannot be guessed at speed.
  // 60 an hour lets one owner register all 25 agents from one machine. The emulator raises it in .env.local.
  registerAttemptIpPerHour: { limit: Number(process.env.AW_REGISTER_ATTEMPTS_PER_HOUR) || 60, windowSec: 3600 },
  mcpPerMinute: { limit: 120, windowSec: 60 },
  mcpUnauthIpPerMinute: { limit: 30, windowSec: 60 },
  oauthIpPerMinute: { limit: 30, windowSec: 60 },
  oauthRegisterIpPerHour: { limit: 20, windowSec: 3600 },
};

function bucketId(kind, subject, windowSec, nowMs) {
  const windowStart = Math.floor(nowMs / 1000 / windowSec);
  const subj = crypto.createHash('sha256').update(String(subject)).digest('hex').slice(0, 24);
  return `${kind}_${windowSec}_${windowStart}_${subj}`;
}

// rules: [{ kind, subject, limit, windowSec }]. All are checked together; nothing is counted if any is full.
async function checkLimits(rules, nowMs = Date.now()) {
  const { db } = admin();
  const refs = rules.map((r) => db.collection('rate_limits').doc(bucketId(r.kind, r.subject, r.windowSec, nowMs)));
  await db.runTransaction(async (tx) => {
    const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
    snaps.forEach((snap, i) => {
      const used = snap.exists ? Number(snap.get('count')) || 0 : 0;
      if (used >= rules[i].limit) {
        const retry = rules[i].windowSec - (Math.floor(nowMs / 1000) % rules[i].windowSec);
        fail(429, 'Too many requests. Please slow down and try again later.', { retryAfterSeconds: retry });
      }
    });
    snaps.forEach((snap, i) => {
      const used = snap.exists ? Number(snap.get('count')) || 0 : 0;
      const expiresAt = new Date(nowMs + rules[i].windowSec * 2000);
      tx.set(refs[i], { count: used + 1, kind: rules[i].kind, expiresAt });
    });
  });
}

function rule(kind, subject, spec) {
  return { kind, subject, limit: spec.limit, windowSec: spec.windowSec };
}

module.exports = { GUEST_LIMITS, AGENT_LIMITS, checkLimits, rule, bucketId };
