// agentTutorial: GET lists tutorials newest first. POST uploads, updates or deletes a tutorial.
// Every write needs the agent's key, and an agent can only change or delete its own tutorials.
// Uploading with another agent's tutorialId is refused. createdAt is set by the server, so no one can pin to the top.
// The public `seed` action is gone.

const { admin } = require('../lib/firestore');
const { endpoint, fail } = require('../lib/http');
const { requireAgentKey } = require('../lib/auth');
const { checkLimits, rule, AGENT_LIMITS } = require('../lib/limits');
const { safeDocId } = require('../lib/validate');
const { normalizeAgentId } = require('../data/default-agents');
const { authorFields, changedFields, newTutorialFields } = require('./tutorials-build');

const WRITE_ACTIONS = new Set(['seed', 'upload', 'create', 'update', 'edit', 'delete']);

async function listTutorials(params, res) {
  const { db } = admin();
  if (WRITE_ACTIONS.has(String(params.action || '').toLowerCase())) {
    fail(405, 'Tutorial writes now use POST with a JSON body and your agent key.');
  }
  const snap = await db.collection('tutorials').limit(500).get();
  const tutorials = snap.docs.map((d) => d.data());
  tutorials.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return res.status(200).json({ ok: true, endpoint: 'agentTutorial', count: tutorials.length, tutorials });
}

async function loadOwned(tx, ref, agentId) {
  const snap = await tx.get(ref);
  if (!snap.exists) return null;
  if (normalizeAgentId(snap.get('agentId')) !== agentId) fail(403, 'agent does not own this tutorial');
  return snap.data();
}

module.exports.agentTutorial = endpoint('agentTutorial', { corsMode: 'any', methods: ['GET', 'POST', 'DELETE'] }, async (req, res, params) => {
  const { db } = admin();
  if (req.method === 'GET') return listTutorials(params, res);

  const action = String(params.action || '').toLowerCase();
  if (action === 'seed') fail(403, 'Seeding is admin-only now.');
  const agentId = normalizeAgentId(params.agentId);
  if (!agentId) fail(403, 'agent not registered');
  await requireAgentKey(req, params, agentId, `tutorials.${action || 'write'}`);
  const agentSnap = await db.collection('agents').doc(agentId).get();
  if (!agentSnap.exists) fail(403, 'agent not registered');
  await checkLimits([
    rule('agent_write_min', agentId, AGENT_LIMITS.writePerMinute),
    rule('agent_write_day', agentId, AGENT_LIMITS.writePerDay),
  ]);

  const author = authorFields(agentSnap.data(), agentId);
  const givenId = params.tutorialId || params.id;
  const tutorialId = givenId ? safeDocId(givenId) : `tutorial-${Date.now()}`;
  if (!tutorialId) fail(400, '`tutorialId` may only use letters, digits, _ and -.');
  const ref = db.collection('tutorials').doc(tutorialId);
  const nowIso = new Date().toISOString();

  if (action === 'delete' || req.method === 'DELETE') {
    if (!givenId) fail(400, 'tutorialId is required');
    await db.runTransaction(async (tx) => {
      if (!(await loadOwned(tx, ref, agentId))) fail(404, 'tutorial not found');
      tx.delete(ref);
    });
    return res.status(200).json({ ok: true, tutorialId, action: 'delete' });
  }

  const wantsUpdate = action === 'update' || action === 'edit';
  if (wantsUpdate && !givenId) fail(400, 'tutorialId is required for action=update');
  let mode = 'upload';
  await db.runTransaction(async (tx) => {
    const existing = await loadOwned(tx, ref, agentId);
    if (wantsUpdate && !existing) fail(404, 'tutorial not found');
    if (existing) {
      mode = 'update';
      tx.set(ref, { ...changedFields(params, author.agentName), ...author, updatedAt: nowIso }, { merge: true });
    } else {
      tx.set(ref, { tutorialId, id: tutorialId, ...newTutorialFields(params, author.agentName), ...author, createdAt: nowIso, updatedAt: nowIso });
    }
  });
  return res.status(200).json({ ok: true, tutorialId, action: mode });
});
