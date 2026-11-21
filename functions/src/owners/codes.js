// Registration codes: awr_<codeId>_<secret>. An owner makes one in the dashboard, sees it once and hands it to
// their agent over a private channel (never in a link). registration_codes/{codeId} keeps only the hash, the
// owner, a label, how many agents may use it, how many did, when it expires and whether it was revoked.
// A code seen in a link is marked exposed and revoked at once.

const crypto = require('crypto');
const { admin } = require('../lib/firestore');
const { fail } = require('../lib/http');
const { randomPart, sha256, sameHash } = require('../lib/secrets');
const { cleanText } = require('../lib/validate');
const { AGENT_CAP, getOwner } = require('./profile');

const CODES = 'registration_codes';
const CODE_RE = /^awr_([a-f0-9]{16})_([A-Za-z0-9_-]{43})$/;
const MAX_LIVE_CODES = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseCode(code) {
  const m = String(code || '').trim().match(CODE_RE);
  return m ? { codeId: m[1] } : null;
}

function ts(t) {
  return t && t.toDate ? t.toDate().toISOString() : t instanceof Date ? t.toISOString() : null;
}

function codeView(d) {
  const expires = d.expiresAt && d.expiresAt.toDate ? d.expiresAt.toDate() : null;
  let state = 'active';
  if (d.revoked) state = d.exposed ? 'exposed' : 'revoked';
  else if (expires && expires.getTime() <= Date.now()) state = 'expired';
  else if (d.uses >= d.maxUses) state = 'used up';
  return { codeId: d.codeId, hint: `awr_${d.codeId.slice(0, 6)}…`, label: d.label || '', maxUses: d.maxUses, uses: d.uses || 0, state, expiresAt: ts(d.expiresAt), createdAt: ts(d.createdAt), agents: d.agents || [] };
}

function intIn(raw, min, max, def, name) {
  if (raw === undefined || raw === null || raw === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) fail(400, `\`${name}\` must be a whole number from ${min} to ${max}.`);
  return n;
}

// Returns { code, ...codeView }. The plain code is in this reply only.
async function createCode(owner, params) {
  const { db, FieldValue, Timestamp } = admin();
  const o = await getOwner(owner.uid);
  if (!o.username) fail(400, 'Pick your owner username first.');
  if (!owner.emailVerified) fail(403, 'Please verify your email address before making registration codes.');
  const live = await db.collection(CODES).where('ownerUid', '==', owner.uid).where('revoked', '==', false).get();
  const stillLive = live.docs.filter((d) => codeView(d.data()).state === 'active');
  if (stillLive.length >= MAX_LIVE_CODES) fail(409, `You already have ${MAX_LIVE_CODES} active codes. Revoke one first.`);
  const room = Math.max(0, (o.agentCap || AGENT_CAP) - (o.agentCount || 0));
  if (room === 0) fail(409, `You already have ${o.agentCap || AGENT_CAP} agents, the most one owner can have.`);
  const maxUses = intIn(params.maxUses, 1, AGENT_CAP, 1, 'maxUses');
  const days = intIn(params.expiresInDays, 1, 30, 7, 'expiresInDays');
  const codeId = crypto.randomBytes(8).toString('hex');
  const code = `awr_${codeId}_${randomPart(32)}`;
  const doc = {
    codeId,
    ownerUid: owner.uid,
    ownerUsername: o.username,
    hash: sha256(code),
    label: cleanText(params.label, 40),
    maxUses,
    uses: 0,
    agents: [],
    revoked: false,
    exposed: false,
    expiresAt: Timestamp.fromMillis(Date.now() + days * DAY_MS),
    createdAt: FieldValue.serverTimestamp(),
  };
  await db.collection(CODES).doc(codeId).set(doc);
  return { code, ...codeView({ ...doc, createdAt: null }) };
}

async function listCodes(owner) {
  const snap = await admin().db.collection(CODES).where('ownerUid', '==', owner.uid).get();
  return snap.docs.map((d) => codeView(d.data())).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function revokeCode(owner, codeId) {
  const { db, FieldValue } = admin();
  const ref = db.collection(CODES).doc(String(codeId || ''));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get('ownerUid') !== owner.uid) fail(404, 'Code not found.');
    tx.update(ref, { revoked: true, revokedAt: FieldValue.serverTimestamp() });
  });
  return codeView((await ref.get()).data());
}

// A code that showed up in a link is treated as leaked: it is revoked and flagged for the owner.
async function markExposed(code) {
  const parsed = parseCode(code);
  if (!parsed) return;
  const { db, FieldValue } = admin();
  const ref = db.collection(CODES).doc(parsed.codeId);
  const snap = await ref.get();
  if (snap.exists && sameHash(sha256(code), snap.get('hash'))) {
    await ref.update({ revoked: true, exposed: true, revokedAt: FieldValue.serverTimestamp() });
  }
}

// Inside the registration transaction: checks the code and returns its data and ref. Throws 401 or 409.
async function checkCodeIn(tx, code) {
  const parsed = parseCode(code);
  if (!parsed) fail(401, 'This registration code is not valid.');
  const { db } = admin();
  const ref = db.collection(CODES).doc(parsed.codeId);
  const snap = await tx.get(ref);
  if (!snap.exists || !sameHash(sha256(code), snap.get('hash'))) fail(401, 'This registration code is not valid.');
  const d = snap.data();
  if (d.revoked) fail(401, 'This registration code has been revoked. Ask your owner for a new one.');
  if (d.expiresAt && d.expiresAt.toMillis() <= Date.now()) fail(401, 'This registration code has expired. Ask your owner for a new one.');
  if ((d.uses || 0) >= d.maxUses) fail(409, 'This registration code has been used up. Ask your owner for a new one.');
  return { ref, data: d };
}

module.exports = { CODES, parseCode, createCode, listCodes, revokeCode, markExposed, checkCodeIn, codeView };
