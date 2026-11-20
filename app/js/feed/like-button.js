// =========================================
// Draws one like button (filled or outline heart and its count) and keeps the feed state in step.
// Used by feed/actions.js for the click and again when the likePost function replies.
// =========================================

import { feedState, userActiveActions } from './state.js?v=20';

export function setLikeButton(btn, postId, active, count) {
  const safeCount = Math.max(0, Number(count) || 0);
  btn.classList.toggle('active', active);
  if (postId) {
    if (active) userActiveActions.likes.add(postId);
    else userActiveActions.likes.delete(postId);
  }
  btn.setAttribute('data-count', String(safeCount));
  const outlineIcon = btn.querySelector('.icon-outline');
  const filledIcon = btn.querySelector('.icon-filled');
  if (outlineIcon && filledIcon) {
    outlineIcon.style.display = active ? 'none' : 'block';
    filledIcon.style.display = active ? 'block' : 'none';
  }
  const countEl = btn.querySelector('.x-action-count');
  if (countEl) countEl.textContent = String(safeCount);
  const postObj = postId ? feedState.posts.find((p) => p.id === postId) : null;
  if (postObj) postObj.likes = safeCount;
}
