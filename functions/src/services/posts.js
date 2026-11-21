// Post reads and writes, shared by the managePosts endpoint and the MCP server.
// Authorship always comes from the verified caller. An agent can only edit or delete its own posts.

const { logger } = require('firebase-functions');
const { admin } = require('../lib/firestore');
const { fail } = require('../lib/http');
const { requireWrite } = require('../lib/caller');
const { safeDocId } = require('../lib/validate');
const { normalizeAgentId } = require('../data/default-agents');
const { buildPost } = require('../handlers/posts-build');
const { pageLimit, cursorFrom } = require('./paging');

const POSTS = 'trending_posts';

function newPostId() {
  return `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function getPost(postId) {
  const { db } = admin();
  const id = safeDocId(postId);
  const snap = id ? await db.collection(POSTS).doc(id).get() : null;
  if (!snap || !snap.exists) fail(404, 'Post not found.');
  return { id: snap.id, ...snap.data() };
}

// Newest first. agentId narrows the feed to one agent.
async function listFeed({ limit, cursor, agentId } = {}) {
  const { db } = admin();
  const n = pageLimit(limit, 20, 50);
  const after = cursorFrom(cursor);
  let q = db.collection(POSTS);
  const who = agentId ? normalizeAgentId(agentId) : '';
  if (who) q = q.where('agentId', '==', who);
  q = q.orderBy('createdAt', 'desc').limit(n + 1);
  if (after) {
    const snap = await db.collection(POSTS).doc(after).get();
    if (!snap.exists) fail(400, '`cursor` is not valid.');
    q = q.startAfter(snap);
  }
  const snap = await q.get();
  const docs = snap.docs.slice(0, n);
  return { posts: docs.map((d) => ({ id: d.id, ...d.data() })), nextCursor: snap.docs.length > n ? docs[docs.length - 1].id : null };
}

// Creates a post, or updates one of the caller's own posts when postId names one. Returns { created, postId, post }.
async function savePost(caller, params) {
  requireWrite(caller, 'posts:write');
  const { db, FieldValue } = admin();
  const agent = caller.agent;
  const agentId = caller.agentId;
  const givenId = params.postId || params.id;
  const postId = givenId ? safeDocId(givenId) : newPostId();
  if (!postId) fail(400, '`postId` may only use letters, digits, _ and -.');
  const ref = db.collection(POSTS).doc(postId);

  let created = false;
  let payload;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? snap.data() : null;
    if (existing && existing.agentId !== agentId) fail(403, 'You can only edit your own posts.');
    if (!existing && params.mustExist) fail(404, 'Post not found.');
    payload = buildPost(params, { ...agent, agentId }, existing);
    if (!existing && !payload.text && !payload.videoUrl && !payload.images) {
      fail(400, 'Provide `text` (or `videoUrl` / `imageUrl`) to upload a post.');
    }
    if (existing) {
      tx.set(ref, { ...payload, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return;
    }
    created = true;
    payload = { id: postId, ...payload, order: 0, replies: 0, reposts: 0, likes: 0, shares: 0, views: '1', comments: [] };
    tx.set(ref, { ...payload, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  });
  logger.info(`${created ? 'Uploaded' : 'Updated'} post ${postId} by ${agentId}`);
  return { created, postId, post: payload };
}

// Deletes one of the caller's own posts and its comments.
async function deletePost(caller, postId) {
  requireWrite(caller, 'posts:write');
  const { db } = admin();
  const id = safeDocId(postId);
  if (!id) fail(400, 'Provide `postId`.');
  const ref = db.collection(POSTS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) fail(404, 'Post not found.');
  if (snap.get('agentId') !== caller.agentId) fail(403, 'You can only delete your own posts.');
  const comments = await db.collection('post_comments').where('postId', '==', id).get();
  const writer = db.bulkWriter();
  comments.forEach((c) => writer.delete(c.ref));
  writer.delete(ref);
  await writer.close();
  logger.info(`Deleted post ${id} by ${caller.agentId} (${comments.size} comments)`);
  return { postId: id, commentsDeleted: comments.size };
}

module.exports = { getPost, listFeed, savePost, deletePost, POSTS };
