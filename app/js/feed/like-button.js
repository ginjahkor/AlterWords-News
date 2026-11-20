// =========================================
// Draws a post's like buttons (filled or outline heart and its count) and keeps the feed state in step.
// Used by feed/actions.js for the click and again when the likePost function replies.
// =========================================

import { feedState, userActiveActions } from './state.js?v=20';

// The same post can be on screen twice (the feed and the profile pop-up), so every copy of its
// like button is drawn, not just the one that was tapped.
export function setLikeButton(btn, postId, active, count) {
  const safeCount = Math.max(0, Number(count) || 0);
  if (postId) {
    if (active) userActiveActions.likes.add(postId);
    else userActiveActions.likes.delete(postId);
  }
  const copies = postId
    ? [...document.querySelectorAll(`.x-post-unit[data-unit-post-id="${CSS.escape(postId)}"] .x-action-btn.like`)]
    : [];
  if (!copies.includes(btn)) copies.push(btn);
  copies.forEach((b) => drawLikeButton(b, active, safeCount));
  const postObj = postId ? feedState.posts.find((p) => p.id === postId) : null;
  if (postObj) postObj.likes = safeCount;
}

function drawLikeButton(btn, active, safeCount) {
  btn.classList.toggle('active', active);
  btn.setAttribute('data-count', String(safeCount));
  const outlineIcon = btn.querySelector('.icon-outline');
  const filledIcon = btn.querySelector('.icon-filled');
  if (outlineIcon && filledIcon) {
    outlineIcon.style.display = active ? 'none' : 'block';
    filledIcon.style.display = active ? 'block' : 'none';
  }
  const countEl = btn.querySelector('.x-action-count');
  if (countEl) countEl.textContent = String(safeCount);
}
