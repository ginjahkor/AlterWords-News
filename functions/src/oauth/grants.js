// App connections (grants): an owner allowed one app to act as one of their agents. oauth_grants/{grantId}.
// The owner dashboard lists them and can revoke one, which ends every token of that connection at once.

const { admin } = require('../lib/firestore');
const { fail } = require('../lib/http');
const { revokeGrantTokensIn } = require('./tokens');

function ts(t) {
  return t && t.toDate ? t.toDate().toISOString() : null;
}

async function listGrants(ownerUid) {
  const snap = await admin().db.collection('oauth_grants').where('ownerUid', '==', ownerUid).where('revoked', '==', false).get();
  return snap.docs
    .map((d) => {
      const g = d.data();
      return { grantId: g.grantId, clientName: g.clientName, agentId: g.agentId, scopes: g.scopes, createdAt: ts(g.createdAt) };
    })
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function revokeGrant(ownerUid, grantId) {
  const { db, FieldValue } = admin();
  const ref = db.collection('oauth_grants').doc(String(grantId || '-'));
  let n = 0;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get('ownerUid') !== ownerUid || snap.get('revoked')) fail(404, 'Connection not found.');
    n = await revokeGrantTokensIn(tx, snap.id);
    tx.update(ref, { revoked: true, revokedAt: FieldValue.serverTimestamp(), revokedReason: 'owner' });
  });
  return { grantId, revoked: true, tokensRevoked: n };
}

// The owner moves a connection to another of their active agents (or back). The app acts as that agent from
// its next call; its tokens keep working.
async function moveGrant(ownerUid, grantId, agentId) {
  const { db, FieldValue } = admin();
  const ref = db.collection('oauth_grants').doc(String(grantId || '-'));
  let from = '';
  await db.runTransaction(async (tx) => {
    const [snap, priv] = await Promise.all([tx.get(ref), tx.get(db.collection('agent_private').doc(String(agentId || '-')))]);
    if (!snap.exists || snap.get('ownerUid') !== ownerUid || snap.get('revoked')) fail(404, 'Connection not found.');
    if (!priv.exists || priv.get('ownerUid') !== ownerUid || priv.get('status') !== 'active') fail(404, 'Pick one of your active agents.');
    from = snap.get('agentId');
    tx.update(ref, { agentId: priv.id, movedFrom: from, movedAt: FieldValue.serverTimestamp(), movedBy: 'owner' });
  });
  const { audit } = require('../lib/audit');
  await audit({ action: 'connection.move', actorType: 'owner', actorId: ownerUid, target: grantId, detail: `${from} -> ${agentId}` });
  return { grantId, agentId, movedFrom: from };
}

module.exports = { listGrants, revokeGrant, moveGrant };
