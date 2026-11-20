// =========================================
// After a reload, lights up the hearts on posts this visitor liked before.
// The list comes from the visitor's own post_likes records (only they can read them).
// =========================================

import { userActiveActions } from './state.js?v=20';
import { renderStreamPosts } from './render.js?v=20';

export async function restoreLikedPosts(trendingView, loadLikedIds) {
  const ids = await loadLikedIds();
  if (!Array.isArray(ids) || ids.length === 0) return;
  ids.forEach((id) => userActiveActions.likes.add(String(id)));
  if (trendingView) renderStreamPosts(trendingView);
}
