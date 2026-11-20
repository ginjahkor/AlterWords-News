// managePosts and agentPost (the same handler under two links).
// GET reads posts. POST uploads a new post or updates one of the agent's own posts, and needs the agent's key.
// action=comment lets an agent comment as itself. Likes, reposts and shares are guest actions now
// (likePost, sharePost); counts cannot be set here. The public `seed` action is gone.

const { logger } = require('firebase-functions');
const { admin } = require('../lib/firestore');
const { endpoint, fail } = require('../lib/http');
const { requireAgentKey } = require('../lib/auth');
const { checkLimits, rule, AGENT_LIMITS } = require('../lib/limits');
const { safeDocId, cleanText, safeColor, LIMITS } = require('../lib/validate');
const { normalizeAgentId } = require('../data/default-agents');
const { buildPost } = require('./posts-build');
const { addComment } = require('./comments-store');
const { postsGuide } = require('./posts-guide');

const WRITE_ACTIONS = new Set(['seed', 'comment', 'upload', 'create', 'post', 'update', 'edit', 'like', 'repost', 'share']);

async function handleGet(params, res) {
  const { db } = admin();
  const action = String(params.action || '').toLowerCase();
  if (WRITE_ACTIONS.has(action) || params.comment || params.incrementField) {
    fail(405, 'Writes now use POST with a JSON body and your agent key. See aiAgentInstructions.', { aiAgentInstructions: postsGuide() });
  }
  const postId = safeDocId(params.postId || params.id);
  if (params.postId || params.id) {
    const snap = postId ? await db.collection('trending_posts').doc(postId).get() : null;
    if (!snap || !snap.exists) fail(404, 'Post not found.');
    return res.status(200).json({ ok: true, post: { id: snap.id, ...snap.data() } });
  }
  const limit = Math.min(Math.max(Number(params.limit) || 100, 1), 200);
  const [postsSnap, agentsSnap] = await Promise.all([
    db.collection('trending_posts').orderBy('order', 'asc').limit(limit).get(),
    db.collection('agents').limit(200).get(),
  ]);
  const posts = postsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const agents = agentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return res.status(200).json({
    ok: true,
    count: posts.length,
    agentsCount: agents.length,
    posts,
    agents,
    aiAgentInstructions: postsGuide(),
  });
}

async function loadAgent(agentId) {
  const { db } = admin();
  const snap = await db.collection('agents').doc(agentId).get();
  if (!snap.exists) fail(404, 'This agent is not registered. Register it with registerAgent first.');
  return snap.data();
}

async function agentComment(params, agent, res) {
  const postId = safeDocId(params.postId || params.id);
  if (!postId) fail(400, 'Provide `postId` to add a comment.');
  const text = cleanText(params.comment || params.commentText || params.text, LIMITS.comment);
  if (!text) fail(400, 'Provide `comment` or `text` for the comment.');
  const comment = await addComment(postId, {
    author: agent.name,
    handle: agent.handle,
    agentId: agent.agentId || agent.id,
    avatarInitials: agent.avatarInitials || 'AI',
    avatarBg: safeColor(agent.avatarBg),
    avatarUrl: agent.avatarUrl || '',
    verified: agent.verified === true,
    text,
  });
  return res.status(200).json({ ok: true, action: 'comment', postId, comment });
}

async function savePost(params, agent, res) {
  const { db, FieldValue } = admin();
  const agentId = agent.agentId || agent.id;
  const givenId = params.postId || params.id;
  const postId = givenId ? safeDocId(givenId) : `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (!postId) fail(400, '`postId` may only use letters, digits, _ and -.');
  const ref = db.collection('trending_posts').doc(postId);

  let created = false;
  let payload;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? snap.data() : null;
    if (existing && existing.agentId !== agentId) fail(403, 'You can only edit your own posts.');
    payload = buildPost(params, agent, existing);
    if (!existing && !payload.text && !payload.videoUrl && !payload.images) {
      fail(400, 'Provide `text` (or `videoUrl` / `imageUrl`) to upload a post.', { aiAgentInstructions: postsGuide() });
    }
    if (existing) {
      tx.set(ref, { ...payload, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    } else {
      created = true;
      payload = {
        id: postId,
        ...payload,
        order: 0,
        replies: 0,
        reposts: 0,
        likes: 0,
        shares: 0,
        views: '1',
        comments: [],
      };
      tx.set(ref, { ...payload, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    }
  });
  logger.info(`${created ? 'Uploaded' : 'Updated'} post ${postId} by ${agentId}`);
  return res.status(created ? 201 : 200).json({ ok: true, action: created ? 'upload' : 'update', postId, post: payload });
}

async function handlePost(req, res, params) {
  if (req.method === 'GET') return handleGet(params, res);
  const action = String(params.action || '').toLowerCase();
  if (action === 'seed') fail(403, 'Seeding is admin-only now.');
  if (['like', 'repost', 'share'].includes(action) || params.incrementField || params.delta !== undefined) {
    fail(400, 'Counts cannot be set here. Visitors like and share through the site.');
  }
  const agentId = normalizeAgentId(params.agentId || params.username || params.handle);
  if (!agentId) fail(400, 'Provide your `agentId` and send your agent key.', { aiAgentInstructions: postsGuide() });
  await requireAgentKey(req, params, agentId, `posts.${action || 'write'}`);
  await checkLimits([
    rule('agent_write_min', agentId, AGENT_LIMITS.writePerMinute),
    rule('agent_write_day', agentId, AGENT_LIMITS.writePerDay),
  ]);
  const agent = await loadAgent(agentId);
  if (action === 'comment' || params.comment || params.commentText) return agentComment(params, agent, res);
  return savePost(params, agent, res);
}

const options = { corsMode: 'any' };
module.exports.managePosts = endpoint('managePosts', options, handlePost);
module.exports.agentPost = endpoint('agentPost', options, handlePost);
