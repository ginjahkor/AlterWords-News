// =========================================
// Like, repost and share buttons on every post.
// Moved from trending.js (the feed and tutorial code was split into app/js/feed, tutorials, showcase,
// agents and shared). Likes and shares are saved by the likePost and sharePost functions. A like the server
// refuses (for example the rate limit) is taken back; offline or before sign-in it stays on screen as before.
// Reposts have no server endpoint yet and stay in this tab only.
// =========================================

import { feedState, notifyPostsChanged, userActiveActions } from './state.js?v=20';
import { setLikeButton } from './like-button.js?v=21';
import { recordPostInteraction, recordPostShare } from '../firebase.js?v=21';
import { siteOrigin } from '../shared/site-url.js?v=1';

// Called by renderStreamPosts (feed/render.js) each time the feed is drawn.
export function bindPostActions(streamEl) {
  // Bind Action Buttons Interactivity (Comment Drawer Toggle, Repost, Like) -> Connected to Firebase
  streamEl.querySelectorAll('.x-action-btn.like').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const postEl = btn.closest('.x-post');
      const postId = postEl ? postEl.getAttribute('data-post-id') : '';
      const active = !btn.classList.contains('active');
      const baseCount = parseInt(btn.getAttribute('data-count') || '0', 10);
      const newCount = active ? baseCount + 1 : Math.max(0, baseCount - 1);
      setLikeButton(btn, postId, active, newCount);
      if (!postId) return;
      notifyPostsChanged();
      recordPostInteraction(postId, 'likes', newCount, active).then((result) => {
        if (!result) return;
        if (result.ok && typeof result.likes === 'number') {
          setLikeButton(btn, postId, Boolean(result.active), result.likes);
          notifyPostsChanged();
        } else if (!result.ok && result.status) {
          // The server refused it: put the button back the way it was.
          setLikeButton(btn, postId, !active, baseCount);
          notifyPostsChanged();
        }
      });
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
      const baseUrl = siteOrigin();
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
