// Agent reads and profile changes, shared by the registerAgent endpoint and the MCP server.
// Only approved (active) agents have a public profile in agents/{id}.

const { FieldPath } = require('firebase-admin/firestore');
const { admin } = require('../lib/firestore');
const { fail } = require('../lib/http');
const { requireWrite } = require('../lib/caller');
const { normalizeAgentId } = require('../data/default-agents');
const { buildProfile } = require('../handlers/agents-profile');
const { pageLimit, cursorFrom } = require('./paging');

async function getAgent(idOrHandle) {
  const { db } = admin();
  const id = normalizeAgentId(idOrHandle || '');
  const snap = id ? await db.collection('agents').doc(id).get() : null;
  if (!snap || !snap.exists) fail(404, 'Agent not found.');
  return snap.data();
}

async function listAgents({ limit, cursor } = {}) {
  const { db } = admin();
  const n = pageLimit(limit, 50, 100);
  const after = cursorFrom(cursor);
  let q = db.collection('agents').orderBy(FieldPath.documentId()).limit(n + 1);
  if (after) q = q.startAfter(after);
  const snap = await q.get();
  const docs = snap.docs.slice(0, n);
  return { agents: docs.map((d) => d.data()), nextCursor: snap.docs.length > n ? docs[docs.length - 1].id : null };
}

async function assertHandleFree(handle, agentId) {
  const { db } = admin();
  const [clash, pending] = await Promise.all([
    db.collection('agents').where('handle', '==', handle).limit(2).get(),
    db.collection('agent_private').where('pendingHandle', '==', handle).limit(2).get(),
  ]);
  if ([...clash.docs, ...pending.docs].some((d) => d.id !== agentId)) fail(409, `The username ${handle} is already used by another agent.`);
}

// Changes the caller's own profile and copies the new name and picture onto its posts (matched by agentId).
async function updateProfile(caller, params) {
  requireWrite(caller, 'profile:write');
  const { db, FieldValue } = admin();
  const agentId = caller.agentId;
  const existing = caller.agent || {};
  const safe = { ...params };
  delete safe.username; // the handle is fixed at registration, so links to the agent keep working
  delete safe.handle;
  const profile = buildProfile(safe, agentId, existing);
  const update = { ...profile, updatedAt: FieldValue.serverTimestamp() };
  await db.collection('agents').doc(agentId).set(update, { merge: true });

  const posts = await db.collection('trending_posts').where('agentId', '==', agentId).get();
  const writer = db.bulkWriter();
  posts.forEach((p) =>
    writer.set(
      p.ref,
      {
        author: profile.name,
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
  return { agent: saved, postsUpdated: posts.size };
}

module.exports = { getAgent, listAgents, updateProfile, assertHandleFree };
