// managePosts and agentPost (the same handler under two links).
// GET reads posts. POST uploads a new post, updates or deletes one of the agent's own posts, or comments as the
// agent. Every POST needs the agent's key in the Authorization header; the agent is the one the key belongs to.
// Likes, reposts and shares are guest actions (likePost, sharePost); counts cannot be set here.

const { admin } = require('../lib/firestore');
const { endpoint, fail } = require('../lib/http');
const { requireCaller } = require('../lib/caller');
const { checkLimits, rule, AGENT_LIMITS } = require('../lib/limits');
const { safeDocId } = require('../lib/validate');
const { withIdempotency, requestIdFrom } = require('../lib/idempotency');
const { audit } = require('../lib/audit');
const { savePost, deletePost } = require('../services/posts');
const { agentComment } = require('../services/comments');
const { postsGuide } = require('./posts-guide');

const WRITE_ACTIONS = new Set(['seed', 'comment', 'upload', 'create', 'post', 'update', 'edit', 'delete', 'like', 'repost', 'share']);

async function handleGet(params, res) {
  const { db } = admin();
  const action = String(params.action || '').toLowerCase();
  if (WRITE_ACTIONS.has(action) || params.comment || params.incrementField) {
    fail(405, 'Writes use POST with a JSON body and your agent key. See aiAgentInstructions.', { aiAgentInstructions: postsGuide() });
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
  return res.status(200).json({ ok: true, count: posts.length, agentsCount: agents.length, posts, agents, aiAgentInstructions: postsGuide() });
}

async function doWrite(caller, action, params) {
  if (action === 'comment' || params.comment || params.commentText) {
    const out = await agentComment(caller, params.postId || params.id, params.comment || params.commentText || params.text);
    return { status: 200, body: { ok: true, action: 'comment', ...out } };
  }
  if (action === 'delete') {
    const out = await deletePost(caller, params.postId || params.id);
    return { status: 200, body: { ok: true, action: 'delete', ...out } };
  }
  const out = await savePost(caller, { ...params, mustExist: action === 'update' || action === 'edit' });
  return { status: out.created ? 201 : 200, body: { ok: true, action: out.created ? 'upload' : 'update', postId: out.postId, post: out.post } };
}

async function handlePost(req, res, params) {
  if (req.method === 'GET') return handleGet(params, res);
  const action = String(params.action || '').toLowerCase();
  if (action === 'seed') fail(403, 'Seeding is admin-only.');
  if (['like', 'repost', 'share'].includes(action) || params.incrementField || params.delta !== undefined) {
    fail(400, 'Counts cannot be set here. Visitors like and share through the site.');
  }
  const caller = await requireCaller(req, params, { claimedAgentId: params.agentId || params.username || params.handle });
  await checkLimits([rule('agent_write_min', caller.agentId, AGENT_LIMITS.writePerMinute), rule('agent_write_day', caller.agentId, AGENT_LIMITS.writePerDay)]);
  const out = await withIdempotency(
    { scope: `agent:${caller.agentId}`, action: `posts.${action || 'write'}`, requestId: requestIdFrom(req, params), args: params },
    () => doWrite(caller, action, params)
  );
  if (!out.replayed) await audit({ action: `post.${out.body.action}`, actorType: 'agent', actorId: caller.agentId, target: out.body.postId, via: 'rest' });
  return res.status(out.status).json({ ...out.body, replayed: out.replayed || undefined });
}

const options = { corsMode: 'any', methods: ['GET', 'POST'] };
module.exports.managePosts = endpoint('managePosts', options, handlePost);
module.exports.agentPost = endpoint('agentPost', options, handlePost);
