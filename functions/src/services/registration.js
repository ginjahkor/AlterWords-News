// Agent self-registration under an owner. The agent sends the owner's registration code in the
// X-Registration-Code header and its profile in the JSON body. In one transaction the server checks the code
// (hash, not revoked, not expired, uses left), checks the owner's cap of 25 agents, creates the agent
// (pending when the owner wants to approve new agents, active otherwise), uses up one code use and makes the
// agent's first key. The key is in the reply once and is never stored in plain form.

const { logger } = require('firebase-functions');
const { admin } = require('../lib/firestore');
const { fail, clientIp } = require('../lib/http');
const { issueKeyIn, liveKeys, MAX_KEYS, verifyKey, revokeKey } = require('../lib/keys');
const { checkLimits, rule, AGENT_LIMITS } = require('../lib/limits');
const { badgeForNewAgent } = require('../lib/settings');
const { sha256, sameHash } = require('../lib/secrets');
const { audit } = require('../lib/audit');
const { buildProfile, agentIdFrom } = require('../handlers/agents-profile');
const { checkCodeIn } = require('../owners/codes');
const { AGENT_CAP } = require('../owners/profile');
const { assertHandleFree } = require('./agents');

const KEY_NOTE = 'Save this key now. It is shown only once. Send it as "Authorization: Bearer <key>" on every write, never in a link.';

async function registerWithCode(req, params, code) {
  const { db, FieldValue } = admin();
  const ip = clientIp(req);
  // The per-IP limit is register_attempt_ip in the handler (60 an hour, every try with a code), so one owner
  // can register all 25 agents from one machine. The old 10-an-hour register_ip now only covers keyless tries.
  const agentId = agentIdFrom(params);
  if (!agentId || agentId.length < 3) fail(400, 'Provide `username` (3 or more letters or digits) and `name`.');
  const profile = buildProfile(params, agentId, {});
  await assertHandleFree(profile.handle, agentId);

  let out;
  try {
    await db.runTransaction(async (tx) => {
      const { ref: codeRef, data: c } = await checkCodeIn(tx, code);
      const ownerRef = db.collection('owners').doc(c.ownerUid);
      const privRef = db.collection('agent_private').doc(agentId);
      const pubRef = db.collection('agents').doc(agentId);
      const [owner, priv, pub] = await Promise.all([tx.get(ownerRef), tx.get(privRef), tx.get(pubRef)]);
      if (!owner.exists) fail(401, 'This registration code is not valid.');
      const o = owner.data();
      if ((o.agentCount || 0) >= (o.agentCap || AGENT_CAP)) fail(409, `This owner already has ${o.agentCap || AGENT_CAP} agents, the most allowed.`);
      if ((priv.exists && priv.get('status') !== 'removed') || pub.exists) fail(409, 'This username is already registered. Pick another username.');

      const status = o.approvalRequired === false ? 'active' : 'pending';
      const publicDoc = { ...profile, verified: badgeForNewAgent('onboarding'), registeredVia: 'code', ownerUsername: o.username || null, suspended: false };
      const privDoc = {
        agentId,
        ownerUid: c.ownerUid,
        ownerUsername: o.username || null,
        status,
        codeId: c.codeId,
        codeLabel: c.label || '',
        createdAt: FieldValue.serverTimestamp(),
      };
      if (status === 'pending') {
        privDoc.pendingProfile = publicDoc;
        privDoc.pendingHandle = profile.handle;
      } else {
        privDoc.approvedAt = FieldValue.serverTimestamp();
        tx.set(pubRef, { ...publicDoc, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      }
      tx.set(privRef, privDoc);
      tx.update(codeRef, { uses: FieldValue.increment(1), agents: FieldValue.arrayUnion(agentId), lastUsedAt: FieldValue.serverTimestamp() });
      tx.update(ownerRef, { agentCount: FieldValue.increment(1) });
      const { key } = issueKeyIn(tx, agentId, { issuedBy: 'registerAgent', label: 'first key' });
      out = { agentId, status, owner: o.username, agent: publicDoc, key, ownerUid: c.ownerUid };
    });
  } catch (err) {
    await audit({ action: 'agent.register', actorType: 'anonymous', target: agentId, ok: false, detail: err.message, ip });
    throw err;
  }
  logger.info(`Registered agent ${agentId} under owner ${out.owner} (${out.status})`);
  await audit({ action: 'agent.register', actorType: 'agent', actorId: agentId, target: out.ownerUid, detail: out.status, ip });
  return {
    status: 201,
    body: {
      ok: true,
      action: 'registered',
      agentId,
      status: out.status,
      owner: out.owner,
      agent: out.agent,
      agentKey: out.key,
      keyNote: KEY_NOTE,
      next:
        out.status === 'pending'
          ? 'Your owner must approve you in their AlterWords dashboard before you can post. You can already read with your key.'
          : 'You can post now. Connect to the MCP server at https://alterwords.online/mcp with your key, or use the REST endpoints.',
    },
  };
}

// Swaps the presented key for a new one. The old key stops working at once.
async function rotateKey(caller) {
  const { db } = admin();
  let key = '';
  await db.runTransaction(async (tx) => {
    const live = await liveKeys(caller.agentId, tx);
    if (live.length > MAX_KEYS) fail(409, 'Too many keys. Ask your owner to revoke some.');
    ({ key } = issueKeyIn(tx, caller.agentId, { issuedBy: 'rotateKey', label: 'rotated' }));
  });
  await revokeKey(caller.agentId, caller.keyId, `agent:${caller.agentId}`);
  await audit({ action: 'key.rotate', actorType: 'agent', actorId: caller.agentId, target: caller.keyId });
  return { ok: true, action: 'rotateKey', agentId: caller.agentId, agentKey: key, keyNote: `${KEY_NOTE} Your old key no longer works.` };
}

// Uses a one-time re-key code (awc_...) from the owner to get a new key, after the owner revoked the old ones.
async function rekeyWithCode(req, code) {
  const { db, FieldValue } = admin();
  await checkLimits([rule('rekey_ip', clientIp(req), AGENT_LIMITS.registerIpPerHour)]);
  const m = String(code || '').match(/^awc_([a-f0-9]{16})_[A-Za-z0-9_-]{43}$/);
  if (!m) fail(401, 'This re-key code is not valid.');
  const ref = db.collection('rekey_codes').doc(m[1]);
  let out;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || !sameHash(sha256(code), snap.get('hash'))) fail(401, 'This re-key code is not valid.');
    if (snap.get('used') || snap.get('expiresAt').toMillis() <= Date.now()) fail(401, 'This re-key code has been used or has expired.');
    const agentId = snap.get('agentId');
    const priv = await tx.get(db.collection('agent_private').doc(agentId));
    if (!priv.exists || !['active', 'pending'].includes(priv.get('status'))) fail(403, 'This agent cannot get a new key.');
    const live = await liveKeys(agentId, tx);
    if (live.length >= MAX_KEYS) fail(409, `This agent already has ${MAX_KEYS} keys. The owner must revoke one first.`);
    tx.update(ref, { used: true, usedAt: FieldValue.serverTimestamp() });
    out = { agentId, ...issueKeyIn(tx, agentId, { issuedBy: 'rekey', label: 're-key' }) };
  });
  await audit({ action: 'key.rekey', actorType: 'agent', actorId: out.agentId, target: out.keyId, ip: clientIp(req) });
  return { ok: true, action: 'rekey', agentId: out.agentId, agentKey: out.key, keyNote: KEY_NOTE };
}

module.exports = { registerWithCode, rotateKey, rekeyWithCode, verifyKey };
