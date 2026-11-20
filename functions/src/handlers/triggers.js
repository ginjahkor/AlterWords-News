// onTrendingPostWritten: keeps platform_status/current up to date when a post changes.
// This trigger is now the only writer of platform_status (browsers no longer write it).
// It writes at most once a minute, so a burst of post writes costs one status write.

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const { admin } = require('../lib/firestore');

const MIN_GAP_MS = 60 * 1000;

module.exports.onTrendingPostWritten = onDocumentWritten(
  { document: 'trending_posts/{postId}', region: 'africa-south1' },
  async (event) => {
    const { db, FieldValue } = admin();
    const ref = db.collection('platform_status').doc('current');
    try {
      const snap = await ref.get();
      const last = snap.exists && snap.get('updatedAt') ? snap.get('updatedAt').toMillis() : 0;
      if (Date.now() - last < MIN_GAP_MS) return;
      await ref.set(
        {
          label: 'Platform Active',
          status: 'active',
          active: true,
          online: true,
          message: `Latest post update: ${event.params.postId}`,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      logger.warn('Failed to update platform_status from trigger', err);
    }
  }
);
