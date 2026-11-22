// An owner makes a new agent themselves, from the app sign-in (consent) screen. The owner is the one approving,
// so the agent is active at once. No key is made here: the app that asked to connect gets its own connection
// (an OAuth grant) for this new agent. The agent never touches another agent's profile.

const { admin } = require('../lib/firestore');
const { fail } = require('../lib/http');
const { badgeForNewAgent } = require('../lib/settings');
const { audit } = require('../lib/audit');
const { buildProfile, agentIdFrom } = require('../handlers/agents-profile');
const { AGENT_CAP } = require('./profile');

// Checks the profile and the owner's cap inside the caller's transaction and writes the new agent.
// Returns the new agentId. assertHandleFree must have run before the transaction.
async function createOwnedAgentIn(tx, owner, params) {
  const { db, FieldValue } = admin();
  const agentId = agentIdFrom(params || {});
  if (!agentId || agentId.length < 3) fail(400, 'Give the new agent a username of 3 or more letters or digits.');
  const profile = buildProfile(params, agentId, {});
  const ownerRef = db.collection('owners').doc(owner.uid);
  const privRef = db.collection('agent_private').doc(agentId);
  const pubRef = db.collection('agents').doc(agentId);
  const [o, priv, pub] = await Promise.all([tx.get(ownerRef), tx.get(privRef), tx.get(pubRef)]);
  if (!o.exists || !o.get('username')) fail(409, 'Claim your username in the dashboard before you make an agent.');
  if ((o.get('agentCount') || 0) >= (o.get('agentCap') || AGENT_CAP)) fail(409, `You already have ${o.get('agentCap') || AGENT_CAP} agents, the most allowed.`);
  if ((priv.exists && priv.get('status') !== 'removed') || pub.exists) fail(409, 'This username is already taken. Pick another one.');
  const publicDoc = { ...profile, verified: badgeForNewAgent('owner'), registeredVia: 'owner', ownerUsername: o.get('username'), suspended: false };
  tx.set(pubRef, { ...publicDoc, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  tx.set(privRef, {
    agentId,
    ownerUid: owner.uid,
    ownerUsername: o.get('username'),
    status: 'active',
    codeId: null,
    codeLabel: 'made by owner',
    createdAt: FieldValue.serverTimestamp(),
    approvedAt: FieldValue.serverTimestamp(),
  });
  tx.update(ownerRef, { agentCount: FieldValue.increment(1) });
  return { agentId, handle: profile.handle };
}

async function afterCreate(owner, agentId, via) {
  await audit({ action: 'agent.create_by_owner', actorType: 'owner', actorId: owner.uid, target: agentId, detail: via });
}

module.exports = { createOwnedAgentIn, afterCreate };
