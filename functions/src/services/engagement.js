// Likes and shares, one per liker per post. A liker is a visitor (their anonymous Firebase uid) or an agent
// ("agent:<id>", which can never match a visitor's uid). Shared by likePost, sharePost and the MCP server.

const { admin } = require('../lib/firestore');
const { fail } = require('../lib/http');
const { safeDocId } = require('../lib/validate');
const { SITE_URL } = require('../lib/settings');

const shareUrlFor = (postId) => `${SITE_URL}/?post=${encodeURIComponent(postId)}#${encodeURIComponent(postId)}`;

function postIdFrom(raw) {
  const id = safeDocId(raw);
  if (!id) fail(400, 'Provide `postId`.');
  return id;
}

async function setLike(liker, rawPostId, wantActive) {
  const { db, FieldValue } = admin();
  const postId = postIdFrom(rawPostId);
  const postRef = db.collection('trending_posts').doc(postId);
  const likeRef = db.collection('post_likes').doc(`${postId}__${liker}`);
  const result = await db.runTransaction(async (tx) => {
    const [post, like] = await Promise.all([tx.get(postRef), tx.get(likeRef)]);
    if (!post.exists) fail(404, 'Post not found.');
    const wasActive = like.exists && like.get('active') === true;
    const likes = Number(post.get('likes')) || 0;
    if (wasActive === wantActive) return { likes, active: wasActive };
    const delta = wantActive ? 1 : -1;
    tx.update(postRef, { likes: FieldValue.increment(delta), updatedAt: FieldValue.serverTimestamp() });
    tx.set(
      likeRef,
      { postId, userId: liker, active: wantActive, updatedAt: FieldValue.serverTimestamp(), ...(like.exists ? {} : { createdAt: FieldValue.serverTimestamp() }) },
      { merge: true }
    );
    return { likes: Math.max(0, likes + delta), active: wantActive };
  });
  return { postId, ...result };
}

async function recordShare(sharer, rawPostId) {
  const { db, FieldValue } = admin();
  const postId = postIdFrom(rawPostId);
  const postRef = db.collection('trending_posts').doc(postId);
  const shareRef = db.collection('post_shares').doc(`${postId}__${sharer}`);
  const out = await db.runTransaction(async (tx) => {
    const [post, share] = await Promise.all([tx.get(postRef), tx.get(shareRef)]);
    if (!post.exists) fail(404, 'Post not found.');
    const shares = Number(post.get('shares')) || 0;
    const data = post.data();
    const base = {
      title: `${data.author || 'AlterWords News'} (${data.handle || '@alterwords'})`,
      text: String(data.text || 'Read this dispatch on AlterWords News').slice(0, 240),
    };
    if (share.exists) return { ...base, shares, counted: false };
    tx.update(postRef, { shares: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
    tx.set(shareRef, { postId, userId: sharer, createdAt: FieldValue.serverTimestamp() });
    return { ...base, shares: shares + 1, counted: true };
  });
  return { postId, shareUrl: shareUrlFor(postId), ...out };
}

async function postSummaries(field) {
  const { db } = admin();
  const snap = await db.collection('trending_posts').select('author', field).limit(200).get();
  return snap.docs.map((d) => ({ postId: d.id, author: d.get('author'), [field]: Number(d.get(field)) || 0 }));
}

module.exports = { setLike, recordShare, postSummaries, shareUrlFor };
