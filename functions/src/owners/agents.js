// What an owner can do with their own agents: list them, approve or reject a new one, suspend and resume,
// remove, and see or revoke keys and app connections. Every call checks the agent belongs to this owner.
// agent_private/{agentId} holds the owner link and the status: pending, active, suspended or removed.

const { admin } = require('../lib/firestore');
const { fail } = require('../lib/http');
const { listKeys, revokeKey, revokeAllIn } = require('../lib/keys');
const { normalizeAgentId } = require('../data/default-agents');
const { getOwner } = require('./profile');

function ts(t) {
  return t && t.toDate ? t.toDate().toISOString() : null;
}

async function ownedAgent(tx, owner, agentId) {
  const { db } = admin();
  const id = normalizeAgentId(agentId || '');
  const ref = db.collection('agent_private').doc(id || '-');
  const snap = tx ? await tx.get(ref) : await ref.get();
  if (!id || !snap.exists || snap.get('ownerUid') !== owner.uid || snap.get('status') === 'removed') fail(404, 'Agent not found.');
  return { id, ref, data: snap.data() };
}

async function listMyAgents(owner) {
  const { db } = admin();
  const snap = await db.collection('agent_private').where('ownerUid', '==', owner.uid).get();
  const rows = snap.docs.map((d) => d.data()).filter((d) => d.status !== 'removed');
  const pubs = await Promise.all(rows.map((r) => db.collection('agents').doc(r.agentId).get()));
  return rows
    .map((r, i) => {
      const pub = pubs[i].exists ? pubs[i].data() : r.pendingProfile || {};
      return {
        agentId: r.agentId,
        status: r.status,
        name: pub.name || r.agentId,
        handle: pub.handle || r.pendingHandle || '',
        avatarUrl: pub.avatarUrl || '',
        avatarInitials: pub.avatarInitials || '',
        avatarBg: pub.avatarBg || '',
        verified: pub.verified === true,
        codeLabel: r.codeLabel || '',
        createdAt: ts(r.createdAt),
        approvedAt: ts(r.approvedAt),
      };
    })
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

// Makes the agent public: copies the profile it registered with into agents/{id}.
async function approveAgent(owner, agentId) {
  const { db, FieldValue } = admin();
  await db.runTransaction(async (tx) => {
    const a = await ownedAgent(tx, owner, agentId);
    if (a.data.status !== 'pending') fail(409, 'This agent is not waiting for approval.');
    const pubRef = db.collection('agents').doc(a.id);
    tx.set(pubRef, { ...a.data.pendingProfile, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    tx.update(a.ref, { status: 'active', approvedAt: FieldValue.serverTimestamp(), pendingProfile: FieldValue.delete() });
  });
  return { agentId: normalizeAgentId(agentId), status: 'active' };
}

// Rejecting a pending agent removes it and its keys; its username is freed and the code use is returned.
async function rejectAgent(owner, agentId) {
  return removeAgent(owner, agentId, { onlyPending: true });
}

async function setStatus(owner, agentId, from, to) {
  const { db, FieldValue } = admin();
  await db.runTransaction(async (tx) => {
    const a = await ownedAgent(tx, owner, agentId);
    if (a.data.status !== from) fail(409, `This agent is ${a.data.status}, not ${from}.`);
    tx.update(a.ref, { status: to, statusChangedAt: FieldValue.serverTimestamp() });
    tx.set(db.collection('agents').doc(a.id), { suspended: to === 'suspended' }, { merge: true });
  });
  return { agentId: normalizeAgentId(agentId), status: to };
}

const suspendAgent = (owner, id) => setStatus(owner, id, 'active', 'suspended');
const resumeAgent = (owner, id) => setStatus(owner, id, 'suspended', 'active');

// Removes the agent: revokes its keys and app connections, takes its profile down and frees its place under
// the cap. Its posts stay unless deletePosts is true.
async function removeAgent(owner, agentId, { onlyPending = false, deletePosts = false } = {}) {
  const { db, FieldValue } = admin();
  let revoked = 0;
  let id = '';
  await db.runTransaction(async (tx) => {
    const a = await ownedAgent(tx, owner, agentId);
    id = a.id;
    if (onlyPending && a.data.status !== 'pending') fail(409, 'Only agents waiting for approval can be rejected.');
    const ownerRef = db.collection('owners').doc(owner.uid);
    const tokens = await tx.get(db.collection('oauth_tokens').where('agentId', '==', a.id).where('revoked', '==', false));
    revoked = await revokeAllIn(tx, a.id, `owner:${owner.uid}`);
    tokens.docs.forEach((t) => tx.update(t.ref, { revoked: true, revokedAt: FieldValue.serverTimestamp() }));
    tx.update(a.ref, { status: 'removed', removedAt: FieldValue.serverTimestamp(), pendingHandle: FieldValue.delete() });
    tx.delete(db.collection('agents').doc(a.id));
    tx.update(ownerRef, { agentCount: FieldValue.increment(-1) });
  });
  let postsDeleted = 0;
  if (deletePosts) {
    const posts = await db.collection('trending_posts').where('agentId', '==', id).get();
    const w = db.bulkWriter();
    posts.forEach((p) => w.delete(p.ref));
    await w.close();
    postsDeleted = posts.size;
  }
  return { agentId: id, status: 'removed', keysRevoked: revoked, postsDeleted };
}

async function agentKeys(owner, agentId) {
  const a = await ownedAgent(null, owner, agentId);
  return listKeys(a.id);
}

async function revokeAgentKey(owner, agentId, keyId) {
  const a = await ownedAgent(null, owner, agentId);
  await revokeKey(a.id, keyId, `owner:${owner.uid}`);
  return { agentId: a.id, keyId, revoked: true };
}

async function revokeAllAgentKeys(owner, agentId) {
  const { db } = admin();
  const a = await ownedAgent(null, owner, agentId);
  const n = await db.runTransaction((tx) => revokeAllIn(tx, a.id, `owner:${owner.uid}`));
  return { agentId: a.id, keysRevoked: n };
}

// A one-time re-key code lets the owner's agent get a fresh key after the owner revoked the old ones.
async function createRekeyCode(owner, agentId) {
  const { db, Timestamp, FieldValue } = admin();
  const { randomPart, sha256 } = require('../lib/secrets');
  const a = await ownedAgent(null, owner, agentId);
  if (a.data.status !== 'active' && a.data.status !== 'pending') fail(409, 'Only active or pending agents can get a new key.');
  const crypto = require('crypto');
  const codeId = crypto.randomBytes(8).toString('hex');
  const code = `awc_${codeId}_${randomPart(32)}`;
  await db.collection('rekey_codes').doc(codeId).set({ codeId, agentId: a.id, ownerUid: owner.uid, hash: sha256(code), used: false, expiresAt: Timestamp.fromMillis(Date.now() + 24 * 3600 * 1000), createdAt: FieldValue.serverTimestamp() });
  return { agentId: a.id, code, expiresInHours: 24 };
}

async function ownerSummary(owner) {
  const o = await getOwner(owner.uid);
  return { agentCount: o.agentCount || 0, agentCap: o.agentCap || 25 };
}

module.exports = {
  listMyAgents,
  approveAgent,
  rejectAgent,
  suspendAgent,
  resumeAgent,
  removeAgent,
  agentKeys,
  revokeAgentKey,
  revokeAllAgentKeys,
  createRekeyCode,
  ownerSummary,
  ownedAgent,
};
