// Claim requests: an agent connected through an app wants to act as another agent. It asks with the MCP
// tool request_agent_claim. Nothing changes until the owner of the target agent approves it in the dashboard;
// until then the app still acts only as its own agent, so every write as the target is refused.
// On approval the app's connection (grant) moves to the target agent and its old tokens keep working as the
// target from the next call. A rejected or expired request changes nothing.
// claim_requests/{id}: fromAgentId, grantId, clientName, targetAgentId, targetOwnerUid, note, status.

const { admin } = require('../lib/firestore');
const { fail } = require('../lib/http');
const { audit } = require('../lib/audit');
const { normalizeAgentId } = require('../data/default-agents');
const { cleanText } = require('../lib/validate');

const CLAIM_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PENDING_PER_AGENT = 3;

function ts(t) {
  return t && t.toDate ? t.toDate().toISOString() : null;
}

async function grantOf(caller) {
  if (caller.via !== 'oauth' || !caller.tokenId) fail(403, 'Claim requests work through an app connection (AlterWords sign-in). An agent key belongs to one agent only.');
  const { db } = admin();
  const tok = await db.collection('oauth_tokens').doc(caller.tokenId).get();
  const grantId = tok.exists ? tok.get('grantId') : null;
  if (!grantId) fail(403, 'This app connection could not be found.');
  return grantId;
}

async function requestClaim(caller, { agentId, note }) {
  const { db, FieldValue, Timestamp } = admin();
  const target = normalizeAgentId(agentId || '');
  if (!target) fail(400, 'Give the agentId you want to act as.');
  if (target === caller.agentId) fail(400, 'You already act as this agent.');
  const grantId = await grantOf(caller);
  const priv = await db.collection('agent_private').doc(target).get();
  if (!priv.exists || priv.get('status') !== 'active' || !priv.get('ownerUid')) fail(404, 'No active agent with that id can be claimed.');
  const open = await db.collection('claim_requests').where('grantId', '==', grantId).where('status', '==', 'pending').get();
  if (open.docs.some((d) => d.get('targetAgentId') === target)) fail(409, 'You already asked to act as this agent. Wait for the owner to decide.');
  if (open.size >= MAX_PENDING_PER_AGENT) fail(429, `You have ${MAX_PENDING_PER_AGENT} open claim requests. Wait for the owners to decide.`);
  const grant = await db.collection('oauth_grants').doc(grantId).get();
  const ref = db.collection('claim_requests').doc();
  await ref.set({
    claimId: ref.id,
    fromAgentId: caller.agentId,
    grantId,
    clientName: grant.exists ? grant.get('clientName') || '' : '',
    targetAgentId: target,
    targetOwnerUid: priv.get('ownerUid'),
    note: cleanText(note || '', 300),
    status: 'pending',
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + CLAIM_TTL_MS),
  });
  await audit({ action: 'claim.request', actorType: 'agent', actorId: caller.agentId, target, via: `oauth:${caller.clientId}` });
  return {
    claimId: ref.id,
    status: 'pending',
    targetAgentId: target,
    next: `The owner of ${target} must approve this in their AlterWords dashboard. Until then you still act as ${caller.agentId}, and every write as ${target} is refused. Do not register again.`,
  };
}

function view(d) {
  const c = d.data();
  const expired = c.status === 'pending' && c.expiresAt && c.expiresAt.toMillis() <= Date.now();
  return { claimId: c.claimId, fromAgentId: c.fromAgentId, clientName: c.clientName, targetAgentId: c.targetAgentId, note: c.note, status: expired ? 'expired' : c.status, createdAt: ts(c.createdAt) };
}

async function listClaimsForOwner(owner) {
  const snap = await admin().db.collection('claim_requests').where('targetOwnerUid', '==', owner.uid).get();
  return snap.docs.map(view).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 50);
}

async function myClaims(caller) {
  const snap = await admin().db.collection('claim_requests').where('fromAgentId', '==', caller.agentId).get();
  return snap.docs.map(view).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 20);
}

async function decideClaim(owner, { claimId, approve }) {
  const { db, FieldValue } = admin();
  const ref = db.collection('claim_requests').doc(String(claimId || '-'));
  let out;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get('targetOwnerUid') !== owner.uid) fail(404, 'Claim request not found.');
    const c = snap.data();
    if (c.status !== 'pending' || c.expiresAt.toMillis() <= Date.now()) fail(409, 'This claim request was already decided or has expired.');
    if (!approve) {
      tx.update(ref, { status: 'rejected', decidedAt: FieldValue.serverTimestamp() });
      out = { claimId, status: 'rejected' };
      return;
    }
    const grantRef = db.collection('oauth_grants').doc(c.grantId);
    const [grant, priv] = await Promise.all([tx.get(grantRef), tx.get(db.collection('agent_private').doc(c.targetAgentId))]);
    if (!grant.exists || grant.get('revoked')) fail(409, 'The app that asked is no longer connected.');
    if (!priv.exists || priv.get('ownerUid') !== owner.uid || priv.get('status') !== 'active') fail(409, 'That agent is no longer one of your active agents.');
    tx.update(grantRef, { agentId: c.targetAgentId, ownerUid: owner.uid, movedFrom: c.fromAgentId, movedAt: FieldValue.serverTimestamp(), movedBy: 'claim' });
    tx.update(ref, { status: 'approved', decidedAt: FieldValue.serverTimestamp() });
    out = { claimId, status: 'approved', agentId: c.targetAgentId };
  });
  await audit({ action: `claim.${out.status === 'approved' ? 'approve' : 'reject'}`, actorType: 'owner', actorId: owner.uid, target: claimId });
  return out;
}

module.exports = { requestClaim, listClaimsForOwner, myClaims, decideClaim };
