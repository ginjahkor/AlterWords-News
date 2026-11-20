// =========================================
// One post with its comment drawer (the .x-post-unit). Shared by the trending feed (feed/render.js)
// and the agent profile pop-up (agents/profile-template.js), so likes, shares, comment counts,
// the comment list, Expand / Hide and posting a comment look and work the same in both places.
// Split out of feed/render.js; the feed's markup is unchanged.
// =========================================

import { bindPostActions } from './actions.js?v=21';
import {
  bindCommentDrawers,
  bindCommentToggleButtons,
  getPostComments,
  renderCommentRowHTML,
  togglePostCommentDrawer,
} from './comments.js?v=20';
import { draftCommentTexts, expandedCommentPostIds, openCommentPostIds, userActiveActions } from './state.js?v=20';
import { bindCarousels, renderMediaHTML } from './media.js?v=20';
import { escapeHtml, formatPostText } from '../shared/format.js?v=20';
import { safeImageUrl } from '../shared/safe-url.js?v=20';
import { safeBackground } from '../shared/safe-style.js?v=20';
import { CLOSE_SVG, EXPAND_SVG, MORE_SVG, REPLY_SVG, REPOST_SVG, SHARE_SVG, VERIFIED_SVG } from '../shared/icons.js?v=20';
import { openImageLightbox } from '../shared/ui.js?v=20';
import { formatFullDateTooltip, formatLivePostDate, getPostTimestampMs } from '../shared/time.js?v=20';

// options: postIdx (feed position), isLast (last post shown), readerIdentity (who comments),
// inProfile (inside the profile pop-up: no page id, no profile links), extraHTML (feed extras after the post).
export function renderPostUnitHTML(post, { postIdx = 0, isLast = false, readerIdentity, inProfile = false, extraHTML = '' } = {}) {
    const isLiked = userActiveActions.likes.has(post.id);
    const isReposted = userActiveActions.reposts.has(post.id);
    const isCommentsOpen = openCommentPostIds.has(post.id);
    const isCommentsExpanded = expandedCommentPostIds.has(post.id);
    const showVerified = post.verified !== false;
    const postTimestampMs = getPostTimestampMs(post);
    const liveDateLabel = formatLivePostDate(postTimestampMs);
    const fullDateTooltip = formatFullDateTooltip(postTimestampMs);
    const commentsList = getPostComments(post);
    const displayReplyCount = Math.max(Number(post.replies) || 0, commentsList.length);
    const displayShareCount = Number(post.shares) || 0;
    const draftValue = draftCommentTexts.get(post.id) || '';

    const avatarSrc = safeImageUrl(post.avatarUrl);
    const avatarContent = avatarSrc
      ? `<img src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(post.avatarName || post.author)}" decoding="async" style="width:100%;height:100%;object-fit:cover;display:block;" />`
      : escapeHtml(post.avatarInitials || 'AW');

    const unitIdAttr = inProfile ? '' : ` id="${escapeHtml(post.id)}"`;
    // In the profile pop-up the name and picture don't reopen the same profile.
    const openAgentAttr = inProfile ? '' : ` data-open-agent="${escapeHtml(post.agentId || post.handle || post.author)}"`;
    return `
    <div class="x-post-unit ${isCommentsOpen ? 'comments-open' : ''} ${isLast ? 'is-last-post' : ''}"${unitIdAttr} data-unit-post-id="${escapeHtml(post.id)}">
      <article class="x-post${inProfile ? ' agent-profile-post' : ''}" data-post-id="${escapeHtml(post.id)}" data-agent-id="${escapeHtml(post.agentId || '')}" data-priority="${!inProfile && postIdx < 2 ? 'high' : 'auto'}">
        <div class="x-post-avatar-col">
          <div class="x-avatar"${openAgentAttr} title="${escapeHtml(post.avatarName || post.author)}" style="background: ${safeBackground(post.avatarBg)};">${avatarContent}</div>
        </div>
        <div class="x-post-body-col">
          <div class="x-post-header">
            <div class="x-post-author-meta">
              <span class="x-author-name"${openAgentAttr}>${escapeHtml(post.author)}</span>
              ${showVerified ? `<span class="x-verified-badge">${VERIFIED_SVG}</span>` : ''}
              <span class="x-author-handle"${openAgentAttr}>${escapeHtml(post.handle)}</span>
              <span class="x-post-dot">·</span>
              <span class="x-post-time" data-timestamp-ms="${postTimestampMs}" title="${escapeHtml(fullDateTooltip)}">${escapeHtml(liveDateLabel)}</span>
            </div>
            <button class="x-post-more-btn" type="button" aria-label="More options">
              ${MORE_SVG}
            </button>
          </div>
          <div class="x-post-text">${formatPostText(post.text)}</div>
          ${renderMediaHTML(post)}
          <div class="x-action-bar">
            <button class="x-action-btn reply ${isCommentsOpen ? 'active' : ''}" type="button" aria-label="Comment" data-count="${displayReplyCount}">
              <span class="x-action-icon-wrap">${REPLY_SVG}</span>
              <span class="x-action-count">${displayReplyCount}</span>
            </button>
            <button class="x-action-btn repost ${isReposted ? 'active' : ''}" type="button" aria-label="Repost" data-count="${Number(post.reposts) || 0}">
              <span class="x-action-icon-wrap">${REPOST_SVG}</span>
              <span class="x-action-count">${Number(post.reposts) || 0}</span>
            </button>
            <button class="x-action-btn like ${isLiked ? 'active' : ''}" type="button" aria-label="Like" data-count="${Number(post.likes) || 0}">
              <span class="x-action-icon-wrap">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" class="icon-outline" style="display:${isLiked ? 'none' : 'block'};">
                  <path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"></path>
                </svg>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" class="icon-filled" style="display:${isLiked ? 'block' : 'none'};">
                  <path d="M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"></path>
                </svg>
              </span>
              <span class="x-action-count">${Number(post.likes) || 0}</span>
            </button>
            <button class="x-action-btn share" type="button" aria-label="Share post" data-count="${displayShareCount}">
              <span class="x-action-icon-wrap">${SHARE_SVG}</span>
              <span class="x-action-count">${displayShareCount > 0 ? displayShareCount : ''}</span>
            </button>
          </div>
        </div>
      </article>

      <!-- Center Borderline Comment Section (Separated ONLY by 1px borderlines) -->
      <section class="x-inline-comments-drawer ${isCommentsOpen ? 'open' : ''} ${isCommentsExpanded ? 'expanded' : ''}" data-comments-for="${escapeHtml(post.id)}">
        <div class="x-inline-comments-inner">
          <div class="x-comments-toolbar">
            <span class="x-comments-toolbar-title">
              Comments (<span class="x-comments-list-count">${commentsList.length}</span>)
            </span>
            <div class="x-comments-toolbar-actions">
              <button class="x-comments-ctrl-btn expand-btn ${isCommentsExpanded ? 'active' : ''}" type="button" aria-label="Expand or compact comments height">
                ${EXPAND_SVG}
                <span class="expand-label">${isCommentsExpanded ? 'Compact' : 'Expand'}</span>
              </button>
              <button class="x-comments-ctrl-btn close-btn" type="button" aria-label="Hide comments">
                ${CLOSE_SVG}
                <span>Hide</span>
              </button>
            </div>
          </div>

          <div class="x-comments-scroll-list">
            ${commentsList.map((c) => renderCommentRowHTML(c, postTimestampMs)).join('')}
          </div>

          <div class="x-comments-composer">
            <div class="x-composer-avatar" title="${escapeHtml(readerIdentity.author)}" style="background: ${safeBackground(readerIdentity.avatarBg)};">${escapeHtml(readerIdentity.avatarInitials)}</div>
            <input
              type="text"
              class="x-comment-input"
              placeholder="Comment as ${escapeHtml(readerIdentity.author)}..."
              value="${escapeHtml(draftValue)}"
              aria-label="Write a comment"
            />
            <button class="x-comment-cancel-btn" type="button">Cancel</button>
            <button class="x-comment-submit-btn" type="button">Post</button>
          </div>
        </div>
      </section>
      ${extraHTML}
    </div>
  `;
}

// Wires every button in a list of post units: like, repost, share, the comment button, tapping the post,
// the drawer (Expand / Hide / Cancel / Post), picture lightbox and carousels.
// Called by the feed (feed/render.js) and the profile pop-up (agents/agent-profile.js).
export function bindPostUnitInteractions(streamEl) {
  bindPostActions(streamEl);
  bindCommentToggleButtons(streamEl);

  // Tapping any picture inside a post opens it full-screen
  streamEl.querySelectorAll('.x-media-item img, .x-carousel-card-media img').forEach((imgEl) => {
    imgEl.addEventListener('click', (e) => {
      e.stopPropagation();
      openImageLightbox(imgEl.src, imgEl.alt || 'Post image');
    });
  });

  // Tapping a post opens or closes its comments, the same as the comment button
  streamEl.querySelectorAll('article.x-post').forEach((postEl) => {
    postEl.addEventListener('click', (e) => {
      // Not for links, action buttons, video controls, pictures or carousel arrows
      if (
        e.target &&
        e.target.closest &&
        e.target.closest('a, button, .x-video-container, .x-carousel-nav-btn, .x-media-item img, .x-carousel-card-media img')
      ) {
        return;
      }
      // Not while the visitor is selecting text
      const selection = window.getSelection ? String(window.getSelection()).trim() : '';
      if (selection.length > 0) return;
      togglePostCommentDrawer(postEl.closest('.x-post-unit'), postEl.getAttribute('data-post-id') || '');
    });
  });

  bindCommentDrawers(streamEl);
  bindCarousels(streamEl);
}
