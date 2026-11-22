// likePost and sharePost: visitors like and share from the site. GET returns the counts.
// Like: one like per guest device per post, stored in post_likes/{postId}__{guestId} (lib/guest-auth.js).
// Liking twice changes nothing; unliking only takes away that guest's own like. Like records are never
// readable from the browser: POST { mine: true } returns the guest's own liked post ids.
// Share: returns the share link (always on alterwords.online) and counts one share per visitor per post.

const { endpoint, fail, clientIp } = require('../lib/http');
const { requireGuest } = require('../lib/guest-auth');
const { checkLimits, rule, GUEST_LIMITS } = require('../lib/limits');
const { toBool } = require('../lib/validate');
const { setLike, recordShare, postSummaries, shareUrlFor, likedPostIds } = require('../services/engagement');

module.exports.likePost = endpoint('likePost', { corsMode: 'site', region: 'africa-south1' }, async (req, res, params) => {
  if (req.method === 'GET') {
    if (params.action || params.likes !== undefined || params.delta !== undefined) fail(405, 'Likes are sent with POST from the site.');
    const posts = await postSummaries('likes');
    return res.status(200).json({ ok: true, totalLikes: posts.reduce((n, p) => n + p.likes, 0), posts });
  }
  const uid = await requireGuest(req);
  if (params.mine === true || params.mine === 'true') {
    await checkLimits([rule('likes_mine_ip_min', clientIp(req), GUEST_LIMITS.likeIpPerMinute)]);
    return res.status(200).json({ ok: true, postIds: await likedPostIds(uid) });
  }
  if (!params.postId && !params.id) fail(400, 'Provide `postId` to record a like.');
  const wantActive = params.active === undefined ? true : toBool(params.active);
  await checkLimits([rule('like_ip_min', clientIp(req), GUEST_LIMITS.likeIpPerMinute), rule('like_guest_day', uid, GUEST_LIMITS.likeGuestPerDay)]);
  const out = await setLike(uid, params.postId || params.id, wantActive);
  return res.status(200).json({ ok: true, action: 'like', ...out });
});

module.exports.sharePost = endpoint('sharePost', { corsMode: 'site', region: 'africa-south1' }, async (req, res, params) => {
  if (req.method === 'GET') {
    if (params.postId || params.id) fail(405, 'Shares are sent with POST from the site.');
    const posts = (await postSummaries('shares')).map((p) => ({ ...p, shareUrl: shareUrlFor(p.postId) }));
    return res.status(200).json({ ok: true, posts });
  }
  const uid = await requireGuest(req);
  if (!params.postId && !params.id) fail(400, 'Provide `postId` to share a post.');
  await checkLimits([rule('share_ip_min', clientIp(req), GUEST_LIMITS.shareIpPerMinute), rule('share_uid_day', uid, GUEST_LIMITS.shareVisitorPerDay)]);
  const out = await recordShare(uid, params.postId || params.id);
  return res.status(200).json({ ok: true, action: 'share', ...out });
});
