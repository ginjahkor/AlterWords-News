// =========================================
// Like, repost and share buttons on every post.
// Moved from trending.js (the feed and tutorial code was split into app/js/feed, tutorials, showcase,
// agents and shared). Behaviour is unchanged.
// =========================================

import { feedState, notifyPostsChanged, userActiveActions } from './state.js?v=19';
import { recordPostInteraction, recordPostShare } from '../firebase.js?v=19';

// Called by renderStreamPosts (feed/render.js) each time the feed is drawn.
export function bindPostActions(streamEl) {
  // Bind Action Buttons Interactivity (Comment Drawer Toggle, Repost, Like) -> Connected to Firebase
  streamEl.querySelectorAll('.x-action-btn.like').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const postEl = btn.closest('.x-post');
      const postId = postEl ? postEl.getAttribute('data-post-id') : '';
      const active = btn.classList.toggle('active');
      if (active) userActiveActions.likes.add(postId);
      else userActiveActions.likes.delete(postId);

      const countEl = btn.querySelector('.x-action-count');
      const baseCount = parseInt(btn.getAttribute('data-count') || '0', 10);
      const newCount = active ? baseCount + 1 : Math.max(0, baseCount - 1);
      btn.setAttribute('data-count', String(newCount));

      const outlineIcon = btn.querySelector('.icon-outline');
      const filledIcon = btn.querySelector('.icon-filled');
      if (outlineIcon && filledIcon) {
        outlineIcon.style.display = active ? 'none' : 'block';
        filledIcon.style.display = active ? 'block' : 'none';
      }
      if (countEl) countEl.textContent = String(newCount);
      if (postId) {
        const postObj = feedState.posts.find((p) => p.id === postId);
        if (postObj) {
          postObj.likes = newCount;
        }
        notifyPostsChanged();
        recordPostInteraction(postId, 'likes', newCount, active);
      }
    });
  });

  streamEl.querySelectorAll('.x-action-btn.repost').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const postEl = btn.closest('.x-post');
      const postId = postEl ? postEl.getAttribute('data-post-id') : '';
      const active = btn.classList.toggle('active');
      if (active) userActiveActions.reposts.add(postId);
      else userActiveActions.reposts.delete(postId);

      const countEl = btn.querySelector('.x-action-count');
      const baseCount = parseInt(btn.getAttribute('data-count') || '0', 10);
      const newCount = active ? baseCount + 1 : Math.max(0, baseCount - 1);
      btn.setAttribute('data-count', String(newCount));

      if (countEl) countEl.textContent = String(newCount);
      if (postId) {
        const postObj = feedState.posts.find((p) => p.id === postId);
        if (postObj) {
          postObj.reposts = newCount;
        }
        notifyPostsChanged();
        recordPostInteraction(postId, 'reposts', newCount, active);
      }
    });
  });

  // Share Button: Packages post link, copies to clipboard, triggers native phone share sheet, & calls sharePost Cloud Function
  streamEl.querySelectorAll('.x-action-btn.share').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const postEl = btn.closest('.x-post');
      const postId = postEl ? postEl.getAttribute('data-post-id') : '';
      if (!postId) return;

      const postObj = feedState.posts.find((p) => p.id === postId) || {};
      const baseUrl = window.location.origin || 'https://alterwords-news.vercel.app';
      const shareUrl = `${baseUrl}/?post=${encodeURIComponent(postId)}#${encodeURIComponent(postId)}`;
      const shareTitle = `${postObj.author || 'AlterWords News'}`;
      const shareText = postObj.text ? String(postObj.text).slice(0, 200) : 'Check out this story on AlterWords News';

      const countEl = btn.querySelector('.x-action-count');
      const baseCount = parseInt(btn.getAttribute('data-count') || '0', 10);
      const newCount = baseCount + 1;
      btn.setAttribute('data-count', String(newCount));
      btn.classList.add('active');
      if (postObj && postObj.id) {
        postObj.shares = newCount;
        notifyPostsChanged();
      }

      // Copy packaged link to clipboard for instant sharing
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(shareUrl);
        } catch (_) {}
      }

      if (countEl) {
        countEl.textContent = 'Copied';
        setTimeout(() => {
          countEl.textContent = String(newCount);
        }, 1400);
      }

      // Trigger native mobile/OS Share Sheet so user can pick which app to share with on their phone
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({
            title: shareTitle,
            text: shareText,
            url: shareUrl,
          });
        } catch (_) {}
      }

      // Persist share to dedicated sharePost Cloud Function & Firestore
      recordPostShare(postId, newCount);
    });
  });
}
