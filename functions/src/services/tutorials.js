// Tutorial reads and writes, shared by the agentTutorial endpoint and the MCP server.
// An agent can only change or delete its own tutorials. createdAt is set by the server.

const { admin } = require('../lib/firestore');
const { fail } = require('../lib/http');
const { requireWrite } = require('../lib/caller');
const { safeDocId } = require('../lib/validate');
const { normalizeAgentId } = require('../data/default-agents');
const { authorFields, changedFields, newTutorialFields } = require('../handlers/tutorials-build');
const { pageLimit } = require('./paging');

async function listTutorials({ limit, agentId } = {}) {
  const { db } = admin();
  const n = pageLimit(limit, 100, 500);
  const snap = await db.collection('tutorials').limit(500).get();
  let all = snap.docs.map((d) => d.data());
  const who = agentId ? normalizeAgentId(agentId) : '';
  if (who) all = all.filter((t) => normalizeAgentId(t.agentId) === who);
  all.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return { tutorials: all.slice(0, n), total: all.length };
}

async function getTutorial(tutorialId) {
  const { db } = admin();
  const id = safeDocId(tutorialId);
  const snap = id ? await db.collection('tutorials').doc(id).get() : null;
  if (!snap || !snap.exists) fail(404, 'Tutorial not found.');
  return snap.data();
}

async function loadOwned(tx, ref, agentId) {
  const snap = await tx.get(ref);
  if (!snap.exists) return null;
  if (normalizeAgentId(snap.get('agentId')) !== agentId) fail(403, 'agent does not own this tutorial');
  return snap.data();
}

// mode: 'upsert' (upload, or update when the id is the caller's own), 'update' (must exist).
async function saveTutorial(caller, params, mode = 'upsert') {
  requireWrite(caller, 'tutorials:write');
  const { db } = admin();
  const agentId = caller.agentId;
  const author = authorFields(caller.agent, agentId);
  const givenId = params.tutorialId || params.id;
  if (mode === 'update' && !givenId) fail(400, 'tutorialId is required for action=update');
  const tutorialId = givenId ? safeDocId(givenId) : `tutorial-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  if (!tutorialId) fail(400, '`tutorialId` may only use letters, digits, _ and -.');
  const ref = db.collection('tutorials').doc(tutorialId);
  const nowIso = new Date().toISOString();
  let action = 'upload';
  await db.runTransaction(async (tx) => {
    const existing = await loadOwned(tx, ref, agentId);
    if (mode === 'update' && !existing) fail(404, 'tutorial not found');
    if (existing) {
      action = 'update';
      tx.set(ref, { ...changedFields(params, author.agentName), ...author, updatedAt: nowIso }, { merge: true });
    } else {
      tx.set(ref, { tutorialId, id: tutorialId, ...newTutorialFields(params, author.agentName), ...author, createdAt: nowIso, updatedAt: nowIso });
    }
  });
  return { tutorialId, action };
}

async function deleteTutorial(caller, tutorialId) {
  requireWrite(caller, 'tutorials:write');
  const { db } = admin();
  const id = safeDocId(tutorialId);
  if (!id) fail(400, 'tutorialId is required');
  const ref = db.collection('tutorials').doc(id);
  await db.runTransaction(async (tx) => {
    if (!(await loadOwned(tx, ref, caller.agentId))) fail(404, 'tutorial not found');
    tx.delete(ref);
  });
  return { tutorialId: id, action: 'delete' };
}

module.exports = { listTutorials, getTutorial, saveTutorial, deleteTutorial };
