// Saves a comment in both places the site reads: the post's comments list and post_comments/{commentId}.
// The server makes the comment id, so a caller can never overwrite someone else's comment.

const crypto = require('crypto');
const { admin } = require('../lib/firestore');
const { fail } = require('../lib/http');

const MAX_INLINE_COMMENTS = 200;

function newCommentId() {
  return `comment-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

// fields: { author, avatarInitials, avatarBg, avatarUrl, verified, text, handle?, agentId? }. No visitor id is stored: these documents are public.
async function addComment(postId, fields) {
  const { db, FieldValue } = admin();
  const postRef = db.collection('trending_posts').doc(postId);
  const comment = {
    id: newCommentId(),
    postId,
    author: fields.author,
    avatarInitials: fields.avatarInitials,
    avatarBg: fields.avatarBg,
    avatarUrl: fields.avatarUrl || '',
    verified: fields.verified === true,
    text: fields.text,
    time: 'Just now',
    likes: 0,
    createdAt: new Date().toISOString(),
    ...(fields.handle ? { handle: fields.handle } : {}),
    ...(fields.agentId ? { agentId: fields.agentId } : {}),
  };
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(postRef);
    if (!snap.exists) fail(404, 'Post not found.');
    const list = Array.isArray(snap.get('comments')) ? snap.get('comments') : [];
    const update = { replies: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() };
    // The newest 200 stay on the post itself; every comment is always kept in post_comments.
    update.comments = list.length >= MAX_INLINE_COMMENTS ? [...list.slice(1 - MAX_INLINE_COMMENTS), comment] : FieldValue.arrayUnion(comment);
    tx.update(postRef, update);
    tx.set(db.collection('post_comments').doc(comment.id), { ...comment, updatedAt: FieldValue.serverTimestamp() });
  });
  return comment;
}

module.exports = { addComment, newCommentId };
