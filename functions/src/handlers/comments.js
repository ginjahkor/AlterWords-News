// commentPost: visitors comment from the site. GET reads comments.
// The visitor must be signed in (anonymous Firebase sign-in) and the call must come from alterwords.online.
// Every guest comment shows as "Guest": the caller cannot pick a name, picture, badge, id or count.
// Limits: 5 a minute and 50 a day per visitor, 20 a minute and 200 a day per IP address.

const crypto = require('crypto');
const { admin } = require('../lib/firestore');
const { endpoint, fail, clientIp } = require('../lib/http');
const { requireGuest } = require('../lib/guest-auth');
const { checkLimits, rule, GUEST_LIMITS } = require('../lib/limits');
const { cleanText, safeDocId, LIMITS } = require('../lib/validate');
const { addComment } = require('./comments-store');

const GUEST_COLORS = [
  'linear-gradient(135deg, #3b82f6, #1d4ed8)',
  'linear-gradient(135deg, #10b981, #047857)',
  'linear-gradient(135deg, #f59e0b, #b45309)',
  'linear-gradient(135deg, #8b5cf6, #5b21b6)',
  'linear-gradient(135deg, #ec4899, #9d174d)',
  'linear-gradient(135deg, #06b6d4, #0e7490)',
];

// The same visitor always gets the same colour.
function guestColor(uid) {
  const n = crypto.createHash('sha256').update(uid).digest()[0];
  return GUEST_COLORS[n % GUEST_COLORS.length];
}

async function readComments(params, res) {
  const { db } = admin();
  const postId = safeDocId(params.postId || params.id);
  if (params.postId || params.id) {
    const snap = postId ? await db.collection('trending_posts').doc(postId).get() : null;
    const data = snap && snap.exists ? snap.data() : {};
    const comments = Array.isArray(data.comments) ? data.comments : [];
    return res.status(200).json({ ok: true, postId, count: comments.length, replies: Number(data.replies) || comments.length, comments });
  }
  const snap = await db.collection('post_comments').limit(200).get();
  const comments = snap.docs.map((d) => d.data());
  return res.status(200).json({ ok: true, count: comments.length, comments });
}

module.exports.commentPost = endpoint('commentPost', { corsMode: 'site' }, async (req, res, params) => {
  if (req.method === 'GET') {
    if (params.comment || params.commentText || params.text) fail(405, 'Comments are posted with POST from the site.');
    return readComments(params, res);
  }
  const uid = await requireGuest(req);
  const postId = safeDocId(params.postId || params.id);
  const text = cleanText(params.comment || params.commentText || params.text, LIMITS.comment);
  if (!postId || !text) fail(400, 'Provide both `postId` and `text` to save a comment.');

  const ip = clientIp(req);
  await checkLimits([
    rule('comment_uid_min', uid, GUEST_LIMITS.commentPerMinute),
    rule('comment_uid_day', uid, GUEST_LIMITS.commentPerDay),
    rule('comment_ip_min', ip, GUEST_LIMITS.commentIpPerMinute),
    rule('comment_ip_day', ip, GUEST_LIMITS.commentIpPerDay),
  ]);

  const comment = await addComment(postId, {
    author: 'Guest',
    avatarInitials: 'G',
    avatarBg: guestColor(uid),
    avatarUrl: '',
    verified: false,
    text,
  });
  return res.status(201).json({ ok: true, action: 'comment', postId, comment });
});
