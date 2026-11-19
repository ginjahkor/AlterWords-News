// =========================================
// Comment rows, opening a post's comment drawer, and the drawer controls (expand, close, post a comment).
// Moved from trending.js (the feed and tutorial code was split into app/js/feed, tutorials, showcase,
// agents and shared). Behaviour is unchanged.
// =========================================

import {
  draftCommentTexts,
  expandedCommentPostIds,
  feedState,
  notifyPostsChanged,
  openCommentPostIds,
} from './state.js?v=19';
import { escapeHtml, formatPostText } from '../shared/format.js?v=19';
import { formatFullDateTooltip, formatLivePostDate, getCommentTimestampMs } from '../shared/time.js?v=19';
import { addPostComment, getCurrentUserIdentity } from '../firebase.js?v=19';

export function getPostComments(post) {
  if (Array.isArray(post.comments)) {
    return post.comments;
  }
  return [];
}

// Random Unregistered User Comment Row — Separated ONLY by 1px borderlines (No verified badge, no @username, just Name + Time + Comment)
export function renderCommentRowHTML(comment, postTimestampMs = 0) {
  const cAuthor = comment.author || 'Marcus Vance';
  const commentTsMs = getCommentTimestampMs(comment, postTimestampMs);
  const cTimeFormatted = formatLivePostDate(commentTsMs);
  const cTooltip = formatFullDateTooltip(commentTsMs);
  const cInitials =
    comment.avatarInitials ||
    cAuthor
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) ||
    'MV';
  const cBg = comment.avatarBg || 'linear-gradient(135deg, #3b82f6, #1d4ed8)';
  const cAvatarContent = comment.avatarUrl
    ? `<img src="${comment.avatarUrl}" alt="${escapeHtml(cAuthor)}" />`
    : escapeHtml(cInitials);

  return `
    <div class="x-comment-item" data-comment-id="${escapeHtml(comment.id || '')}">
      <div class="x-comment-avatar" style="background: ${cBg};">${cAvatarContent}</div>
      <div class="x-comment-body">
        <div class="x-comment-meta">
          <span class="x-comment-author">${escapeHtml(cAuthor)}</span>
          <span class="x-comment-time" data-timestamp-ms="${commentTsMs}" data-timestamp-prefix="· " title="${escapeHtml(cTooltip)}">· ${escapeHtml(cTimeFormatted)}</span>
        </div>
        <div class="x-comment-text">${formatPostText(comment.text || '')}</div>
      </div>
    </div>
  `;
}

// Shared helper: Toggles the center-borderline inline comment section for a post
export const togglePostCommentDrawer = (unitEl, postId) => {
  if (!unitEl || !postId) return;
  const drawerEl = unitEl.querySelector('.x-inline-comments-drawer');
  const replyBtn = unitEl.querySelector('.x-action-btn.reply');
  if (!drawerEl) return;

  const isNowOpen = !drawerEl.classList.contains('open');
  drawerEl.classList.toggle('open', isNowOpen);
  unitEl.classList.toggle('comments-open', isNowOpen);
  if (replyBtn) {
    replyBtn.classList.toggle('active', isNowOpen);
  }

  if (isNowOpen) {
    openCommentPostIds.add(postId);
  } else {
    openCommentPostIds.delete(postId);
  }
};

// Comment button on each post opens its comment drawer. Called by renderStreamPosts (feed/render.js).
export function bindCommentToggleButtons(streamEl) {
  // Tapping the Comment Icon separates the center borderline between the two posts to show scrollable comments + input
  streamEl.querySelectorAll('.x-action-btn.reply').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const unitEl = btn.closest('.x-post-unit');
      const postEl = btn.closest('.x-post');
      const postId = postEl ? postEl.getAttribute('data-post-id') : '';
      togglePostCommentDrawer(unitEl, postId);
    });
  });
}

// Comment drawer controls: expand / compact, hide, post a comment. Called by renderStreamPosts (feed/render.js).
export function bindCommentDrawers(streamEl) {
  // Bind Inline Comment Drawer Controls (Expand/Compact Height, Hide/Cancel, and Post Comment)
  streamEl.querySelectorAll('.x-inline-comments-drawer').forEach((drawerEl) => {
    const postId = drawerEl.getAttribute('data-comments-for') || '';
    const unitEl = drawerEl.closest('.x-post-unit');
    const replyBtn = unitEl ? unitEl.querySelector('.x-action-btn.reply') : null;
    const expandBtn = drawerEl.querySelector('.x-comments-ctrl-btn.expand-btn');
    const closeBtn = drawerEl.querySelector('.x-comments-ctrl-btn.close-btn');
    const scrollListEl = drawerEl.querySelector('.x-comments-scroll-list');
    const listCountEl = drawerEl.querySelector('.x-comments-list-count');
    const inputEl = drawerEl.querySelector('.x-comment-input');
    const cancelBtn = drawerEl.querySelector('.x-comment-cancel-btn');
    const submitBtn = drawerEl.querySelector('.x-comment-submit-btn');

    drawerEl.addEventListener('click', (e) => e.stopPropagation());

    const closeDrawer = () => {
      drawerEl.classList.remove('open');
      if (unitEl) unitEl.classList.remove('comments-open');
      if (replyBtn) replyBtn.classList.remove('active');
      openCommentPostIds.delete(postId);
    };

    if (expandBtn) {
      expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isExpanded = drawerEl.classList.toggle('expanded');
        expandBtn.classList.toggle('active', isExpanded);
        const labelSpan = expandBtn.querySelector('.expand-label');
        if (labelSpan) labelSpan.textContent = isExpanded ? 'Compact' : 'Expand';
        if (isExpanded) expandedCommentPostIds.add(postId);
        else expandedCommentPostIds.delete(postId);
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeDrawer();
      });
    }

    if (inputEl) {
      inputEl.addEventListener('input', () => {
        draftCommentTexts.set(postId, inputEl.value);
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (inputEl && inputEl.value.trim().length > 0) {
          inputEl.value = '';
          draftCommentTexts.delete(postId);
        } else {
          closeDrawer();
        }
      });
    }

    const submitComment = () => {
      if (!inputEl) return;
      const text = inputEl.value.trim();
      if (!text) return;

      const identity = getCurrentUserIdentity();
      const newComment = {
        id: `comment-${Date.now()}`,
        postId,
        author: identity.author,
        avatarInitials: identity.avatarInitials,
        avatarBg: identity.avatarBg,
        verified: false,
        time: 'Just now',
        text,
        createdAt: new Date().toISOString(),
      };

      // Update local state immediately
      const postObj = feedState.posts.find((p) => p.id === postId);
      let updatedComments = [];
      let newReplyCount = 1;
      if (postObj) {
        const existingComments = getPostComments(postObj);
        updatedComments = [...existingComments, newComment];
        postObj.comments = updatedComments;
        newReplyCount = Math.max((Number(postObj.replies) || 0) + 1, updatedComments.length);
        postObj.replies = newReplyCount;
      }

      // Append to scrollable comment list & scroll to bottom
      if (scrollListEl) {
        scrollListEl.insertAdjacentHTML('beforeend', renderCommentRowHTML(newComment));
        scrollListEl.scrollTo({ top: scrollListEl.scrollHeight, behavior: 'smooth' });
      }
      if (listCountEl && updatedComments.length > 0) {
        listCountEl.textContent = String(updatedComments.length);
      }
      if (replyBtn) {
        replyBtn.setAttribute('data-count', String(newReplyCount));
        const replyCountSpan = replyBtn.querySelector('.x-action-count');
        if (replyCountSpan) replyCountSpan.textContent = String(newReplyCount);
      }

      inputEl.value = '';
      draftCommentTexts.delete(postId);
      notifyPostsChanged();

      // Persist comment & updated reply count to Firestore
      addPostComment(postId, newComment, newReplyCount);
    };

    if (submitBtn) {
      submitBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        submitComment();
      });
    }

    if (inputEl) {
      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          submitComment();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          closeDrawer();
        }
      });
    }
  });
}
