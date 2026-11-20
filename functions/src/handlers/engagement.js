// likePost and sharePost: visitors like and share from the site. GET returns the counts.
// Like: one like per visitor per post, stored in post_likes/{postId}__{visitor}. Liking twice changes nothing;
// unliking only takes away the visitor's own like. Only the visitor can read their own like records.
// Share: returns the share link (always on alterwords.online) and counts one share per visitor per post.

const { admin } = require('../lib/firestore');
const { endpoint, fail, clientIp } = require('../lib/http');
const { requireGuest } = require('../lib/guest-auth');
const { checkLimits, rule, GUEST_LIMITS } = require('../lib/limits');
const { safeDocId, toBool } = require('../lib/validate');
const { SITE_URL } = require('../lib/settings');

const shareUrlFor = (postId) => `${SITE_URL}/?post=${encodeURIComponent(postId)}#${encodeURIComponent(postId)}`;

async function postSummaries(field) {
  const { db } = admin();
  const snap = await db.collection('trending_posts').select('author', field).limit(200).get();
  return snap.docs.map((d) => ({ postId: d.id, author: d.get('author'), [field]: Number(d.get(field)) || 0 }));
}

module.exports.likePost = endpoint('likePost', { corsMode: 'site' }, async (req, res, params) => {
  const { db, FieldValue } = admin();
  if (req.method === 'GET') {
    if (params.action || params.likes !== undefined || params.delta !== undefined) fail(405, 'Likes are sent with POST from the site.');
    const posts = await postSummaries('likes');
    return res.status(200).json({ ok: true, totalLikes: posts.reduce((n, p) => n + p.likes, 0), posts });
  }
  const uid = await requireGuest(req);
  const postId = safeDocId(params.postId || params.id);
  if (!postId) fail(400, 'Provide `postId` to record a like.');
  const wantActive = params.active === undefined ? true : toBool(params.active);
  await checkLimits([rule('like_ip_min', clientIp(req), GUEST_LIMITS.likeIpPerMinute)]);

  const postRef = db.collection('trending_posts').doc(postId);
  const likeRef = db.collection('post_likes').doc(`${postId}__${uid}`);
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
      { postId, userId: uid, active: wantActive, updatedAt: FieldValue.serverTimestamp(), ...(like.exists ? {} : { createdAt: FieldValue.serverTimestamp() }) },
      { merge: true }
    );
    return { likes: Math.max(0, likes + delta), active: wantActive };
  });
  return res.status(200).json({ ok: true, action: 'like', postId, ...result });
});

module.exports.sharePost = endpoint('sharePost', { corsMode: 'site' }, async (req, res, params) => {
  const { db, FieldValue } = admin();
  if (req.method === 'GET') {
    if (params.postId || params.id) fail(405, 'Shares are sent with POST from the site.');
    const posts = (await postSummaries('shares')).map((p) => ({ ...p, shareUrl: shareUrlFor(p.postId) }));
    return res.status(200).json({ ok: true, posts });
  }
  const uid = await requireGuest(req);
  const postId = safeDocId(params.postId || params.id);
  if (!postId) fail(400, 'Provide `postId` to share a post.');
  await checkLimits([
    rule('share_ip_min', clientIp(req), GUEST_LIMITS.shareIpPerMinute),
    rule('share_uid_day', uid, GUEST_LIMITS.shareVisitorPerDay),
  ]);

  const postRef = db.collection('trending_posts').doc(postId);
  const shareRef = db.collection('post_shares').doc(`${postId}__${uid}`);
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
    tx.set(shareRef, { postId, userId: uid, createdAt: FieldValue.serverTimestamp() });
    return { ...base, shares: shares + 1, counted: true };
  });
  return res.status(200).json({ ok: true, action: 'share', postId, shareUrl: shareUrlFor(postId), ...out });
});
