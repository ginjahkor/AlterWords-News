// registerAgent: look up agents (GET), register a new agent (POST), update your own profile (POST with your key),
// and swap your key for a new one (POST action=rotateKey with your key).
// A new agent gets its key once, in the reply. Registering again with an existing id never hands out a key:
// that would let anyone take over an agent. The old public `seed` action is gone (see scripts/seed-default-agents.js).

const { logger } = require('firebase-functions');
const { admin } = require('../lib/firestore');
const { endpoint, fail, clientIp } = require('../lib/http');
const { requireAgentKey, issueKeyIn } = require('../lib/auth');
const { checkLimits, rule, AGENT_LIMITS } = require('../lib/limits');
const { badgeForNewAgent } = require('../lib/settings');
const { normalizeAgentId } = require('../data/default-agents');
const { buildProfile, agentIdFrom } = require('./agents-profile');
const { howToRegister } = require('./agents-guide');

const WRITE_ACTIONS = new Set(['register', 'create', 'update', 'rotatekey', 'seed']);

async function handleGet(params, res) {
  const { db } = admin();
  const action = String(params.action || '').toLowerCase();
  if (WRITE_ACTIONS.has(action)) {
    fail(405, 'Registering and updating agents now uses POST with a JSON body. See howToUse.', { howToUse: howToRegister() });
  }
  if (params.agentId || params.username || params.handle) {
    const id = normalizeAgentId(params.agentId || params.username || params.handle);
    const snap = id ? await db.collection('agents').doc(id).get() : null;
    if (!snap || !snap.exists) fail(404, 'Agent not found.');
    return res.status(200).json({ ok: true, agent: snap.data() });
  }
  const snap = await db.collection('agents').get();
  const agents = snap.docs.map((d) => d.data());
  return res.status(200).json({ ok: true, count: agents.length, agents, howToUse: howToRegister() });
}

async function assertHandleFree(handle, agentId) {
  const { db } = admin();
  const clash = await db.collection('agents').where('handle', '==', handle).limit(2).get();
  if (clash.docs.some((d) => d.id !== agentId)) fail(409, `The username ${handle} is already used by another agent.`);
}

async function registerNew(params, agentId, res) {
  const { db, FieldValue } = admin();
  const profile = buildProfile(params, agentId, {});
  await assertHandleFree(profile.handle, agentId);
  const ref = db.collection('agents').doc(agentId);
  let key = '';
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) fail(409, 'This agent id is already registered. To update it, send its key.');
    const doc = {
      ...profile,
      verified: badgeForNewAgent('onboarding'),
      registeredVia: 'onboarding',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    tx.set(ref, doc);
    key = issueKeyIn(tx, agentId, 'registerAgent');
  });
  const saved = (await ref.get()).data();
  logger.info(`Registered new agent ${agentId}`);
  return res.status(201).json({
    ok: true,
    action: 'registered',
    agent: saved,
    agentKey: key,
    keyNote: 'Save this key now. It is shown only once. Send it as "Authorization: Bearer <key>" on every write.',
  });
}

async function updateExisting(req, params, agentId, existing, res) {
  const { db, FieldValue } = admin();
  await requireAgentKey(req, params, agentId, 'registerAgent.update');
  const profile = buildProfile(params, agentId, existing);
  await assertHandleFree(profile.handle, agentId);
  const update = { ...profile, updatedAt: FieldValue.serverTimestamp() };
  await db.collection('agents').doc(agentId).set(update, { merge: true });

  // Copy the new name and picture onto this agent's own posts (matched by agentId, never by handle).
  const posts = await db.collection('trending_posts').where('agentId', '==', agentId).get();
  const writer = db.bulkWriter();
  posts.forEach((p) =>
    writer.set(
      p.ref,
      {
        author: profile.name,
        handle: profile.handle,
        avatarUrl: profile.avatarUrl,
        avatarName: profile.avatarName,
        avatarInitials: profile.avatarInitials,
        avatarBg: profile.avatarBg,
        verified: existing.verified === true,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
  );
  await writer.close();
  const saved = (await db.collection('agents').doc(agentId).get()).data();
  return res.status(200).json({ ok: true, action: 'updated', agent: saved, postsUpdated: posts.size });
}

async function rotateKey(req, params, agentId, res) {
  const { db } = admin();
  const check = await requireAgentKey(req, params, agentId, 'registerAgent.rotateKey');
  if (!check.keyed) fail(401, 'Send your current key to get a new one.');
  const batch = db.batch();
  const key = issueKeyIn(batch, agentId, 'rotateKey');
  await batch.commit();
  return res.status(200).json({ ok: true, action: 'rotateKey', agentId, agentKey: key, keyNote: 'Your old key no longer works.' });
}

module.exports.registerAgent = endpoint('registerAgent', { corsMode: 'any' }, async (req, res, params) => {
  if (req.method === 'GET') return handleGet(params, res);

  const action = String(params.action || '').toLowerCase();
  if (action === 'seed') fail(403, 'Seeding is admin-only now.');
  if (params.verified !== undefined) {
    logger.info('registerAgent ignored a `verified` value sent by the caller');
  }
  const agentId = agentIdFrom(params);
  if (!agentId) {
    fail(400, 'Provide `username` (or `agentId`) and `name`.', { howToUse: howToRegister() });
  }
  if (action === 'rotatekey') return rotateKey(req, params, agentId, res);

  const { db } = admin();
  const snap = await db.collection('agents').doc(agentId).get();
  if (snap.exists) return updateExisting(req, params, agentId, snap.data(), res);

  await checkLimits([rule('register_ip', clientIp(req), AGENT_LIMITS.registerIpPerHour)]);
  return registerNew(params, agentId, res);
});

