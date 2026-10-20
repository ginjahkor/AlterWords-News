/**
 * AlterWords News — Firebase Cloud Functions (2nd Gen)
 * Separate Cloud Functions codebase for uploading, updating, seeding,
 * and managing Trending feed posts in Cloud Firestore (project: ginjah-x).
 */

const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

if (getApps().length === 0) {
  initializeApp();
}

const VALID_MEDIA_TYPES = new Set([
  'none',
  'grid-1',
  'grid-2',
  'grid-3',
  'grid-4',
  'video-horizontal',
  'video-vertical',
  'carousel',
]);

/**
 * 1. managePosts (HTTP v2 Cloud Function)
 * Supports:
 * - GET: Fetch all posts from `trending_posts` ordered by `order`
 * - POST (action: "upload" | "create"): Upload/create a new post in `trending_posts`
 * - POST/PUT/PATCH (action: "update"): Update an existing post's content, media, or counters
 * - POST (action: "seed"): Batch upload/update multiple posts at once
 */
exports.managePosts = onRequest({ cors: true, maxInstances: 10 }, async (req, res) => {
  const db = getFirestore();

  try {
    // GET: List all trending posts
    if (req.method === 'GET') {
      const snapshot = await db.collection('trending_posts').orderBy('order', 'asc').get();
      const posts = [];
      snapshot.forEach((docSnap) => {
        posts.push({ id: docSnap.id, ...docSnap.data() });
      });
      return res.status(200).json({ ok: true, count: posts.length, posts });
    }

    const body = req.body || {};
    const action = (body.action || req.query.action || 'update').toLowerCase();

    // Batch seed / bulk upload posts
    if (action === 'seed' && Array.isArray(body.posts)) {
      const batch = db.batch();
      body.posts.forEach((post, idx) => {
        const postId = String(post.id || `post-${Date.now()}-${idx}`);
        const ref = db.collection('trending_posts').doc(postId);
        batch.set(
          ref,
          {
            id: postId,
            order: typeof post.order === 'number' ? post.order : idx + 1,
            author: String(post.author || 'AlterWords Editorial'),
            handle: String(post.handle || '@alterwords'),
            time: String(post.time || 'Just now'),
            avatarBg: String(post.avatarBg || 'linear-gradient(135deg, #1d9bf0, #0f5c8c)'),
            avatarInitials: String(post.avatarInitials || 'AW'),
            text: String(post.text || ''),
            mediaType: VALID_MEDIA_TYPES.has(post.mediaType) ? post.mediaType : 'none',
            ...(post.images ? { images: post.images } : {}),
            ...(post.videoMeta ? { videoMeta: post.videoMeta } : {}),
            ...(post.carouselItems ? { carouselItems: post.carouselItems } : {}),
            replies: Number(post.replies) || 0,
            reposts: Number(post.reposts) || 0,
            likes: Number(post.likes) || 0,
            views: String(post.views || '0'),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });
      await batch.commit();
      logger.info(`Seeded ${body.posts.length} posts to trending_posts.`);
      return res.status(200).json({ ok: true, action: 'seed', count: body.posts.length });
    }

    // Upload / Create a new post
    if (action === 'upload' || action === 'create') {
      const post = body.post || body;
      if (!post.text || !post.author) {
        return res.status(400).json({
          ok: false,
          error: 'Missing required fields: author and text are required to upload a post.',
        });
      }

      const postId = String(post.id || `post-${Date.now()}`);
      const postPayload = {
        id: postId,
        order: typeof post.order === 'number' ? post.order : 1,
        author: String(post.author).slice(0, 120),
        handle: String(post.handle || '@alterwords').slice(0, 60),
        time: String(post.time || 'Just now').slice(0, 40),
        avatarBg: String(post.avatarBg || 'linear-gradient(135deg, #1d9bf0, #0f5c8c)'),
        avatarInitials: String(post.avatarInitials || 'AW').slice(0, 10),
        text: String(post.text).slice(0, 5000),
        mediaType: VALID_MEDIA_TYPES.has(post.mediaType) ? post.mediaType : 'none',
        ...(Array.isArray(post.images) ? { images: post.images.slice(0, 10) } : {}),
        ...(post.videoMeta && typeof post.videoMeta === 'object' ? { videoMeta: post.videoMeta } : {}),
        ...(Array.isArray(post.carouselItems) ? { carouselItems: post.carouselItems.slice(0, 20) } : {}),
        replies: Number(post.replies) || 0,
        reposts: Number(post.reposts) || 0,
        likes: Number(post.likes) || 0,
        views: String(post.views || '1'),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      await db.collection('trending_posts').doc(postId).set(postPayload, { merge: true });
      logger.info(`Uploaded post ${postId}`);
      return res.status(201).json({ ok: true, action: 'upload', postId, post: postPayload });
    }

    // Update an existing post (content, media, or engagement counters)
    if (action === 'update' || req.method === 'PUT' || req.method === 'PATCH') {
      const postId = String(body.postId || body.id || req.query.postId || '');
      if (!postId) {
        return res.status(400).json({ ok: false, error: 'Missing postId to update.' });
      }

      const updates = { updatedAt: FieldValue.serverTimestamp() };
      const allowedStrings = ['author', 'handle', 'time', 'avatarBg', 'avatarInitials', 'text', 'views'];
      allowedStrings.forEach((field) => {
        if (typeof body[field] === 'string') {
          updates[field] = body[field];
        }
      });

      if (typeof body.mediaType === 'string' && VALID_MEDIA_TYPES.has(body.mediaType)) {
        updates.mediaType = body.mediaType;
      }
      if (Array.isArray(body.images)) updates.images = body.images.slice(0, 10);
      if (body.videoMeta && typeof body.videoMeta === 'object') updates.videoMeta = body.videoMeta;
      if (Array.isArray(body.carouselItems)) updates.carouselItems = body.carouselItems.slice(0, 20);

      ['likes', 'reposts', 'replies', 'order'].forEach((numField) => {
        if (typeof body[numField] === 'number' && body[numField] >= 0) {
          updates[numField] = body[numField];
        }
      });

      // Support atomic increment delta (e.g., { postId: "post-1", incrementField: "likes", delta: 1 })
      if (
        typeof body.incrementField === 'string' &&
        ['likes', 'reposts', 'replies'].includes(body.incrementField)
      ) {
        const delta = typeof body.delta === 'number' ? body.delta : 1;
        updates[body.incrementField] = FieldValue.increment(delta);
      }

      await db.collection('trending_posts').doc(postId).set(updates, { merge: true });
      logger.info(`Updated post ${postId}`);
      return res.status(200).json({ ok: true, action: 'update', postId });
    }

    return res.status(400).json({ ok: false, error: `Unsupported action: ${action}` });
  } catch (err) {
    logger.error('Error in managePosts function:', err);
    return res.status(500).json({ ok: false, error: err.message || 'Internal Server Error' });
  }
});

/**
 * 2. onTrendingPostWritten (Firestore v2 Trigger)
 * Automatically updates `platform_status/current` whenever any post is uploaded or updated.
 */
exports.onTrendingPostWritten = onDocumentWritten('trending_posts/{postId}', async (event) => {
  const db = getFirestore();
  const postId = event.params.postId;

  try {
    await db.collection('platform_status').doc('current').set(
      {
        label: 'Platform Active',
        status: 'active',
        active: true,
        online: true,
        message: `Latest post update: ${postId}`,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    logger.warn('Failed to update platform_status from trigger:', err);
  }
});
