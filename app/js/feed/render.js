// =========================================
// Draws the feed, keeps scroll positions, "See more", and wires up the buttons, comments and carousels.
// Moved from trending.js (the feed and tutorial code was split into app/js/feed, tutorials, showcase,
// agents and shared). Behaviour is unchanged.
// =========================================

import { bindPostActions } from './actions.js?v=19';
import {
  bindCommentDrawers,
  bindCommentToggleButtons,
  getPostComments,
  renderCommentRowHTML,
  togglePostCommentDrawer,
} from './comments.js?v=19';
import { bindCarousels, renderMediaHTML } from './media.js?v=19';
import { getFilteredAndSortedPosts } from './ranking.js?v=19';
import {
  draftCommentTexts,
  expandedCommentPostIds,
  feedState,
  openCommentPostIds,
  userActiveActions,
} from './state.js?v=19';
import { initVideoPlayers } from './video-players.js?v=19';
import { escapeHtml, formatPostText } from '../shared/format.js?v=19';
import {
  CLOSE_SVG,
  EXPAND_SVG,
  MORE_SVG,
  REPLY_SVG,
  REPOST_SVG,
  SHARE_SVG,
  VERIFIED_SVG,
} from '../shared/icons.js?v=19';
import {
  ensureLiveTimestampTicker,
  formatFullDateTooltip,
  formatLivePostDate,
  getPostTimestampMs,
} from '../shared/time.js?v=19';
import { bindImageSkeletonLoaders, openImageLightbox, renderSkeletonPostHTML } from '../shared/ui.js?v=19';
import { renderTutorialCardHTML } from '../tutorials/card.js?v=19';
import { openTutorialFromAnywhere } from '../tutorials/page.js?v=19';
import { getOrderedTutorials } from '../tutorials/state.js?v=19';
import { getCurrentUserIdentity } from '../firebase.js?v=19';

export function renderStreamPosts(trendingContainer) {
  const streamEl = trendingContainer.querySelector('.x-feed-stream');
  if (!streamEl) return;

  // Save current scroll positions of any open comment lists before re-rendering
  const savedCommentScrolls = new Map();
  streamEl.querySelectorAll('.x-inline-comments-drawer.open').forEach((drawer) => {
    const pid = drawer.getAttribute('data-comments-for');
    const listEl = drawer.querySelector('.x-comments-scroll-list');
    if (pid && listEl) {
      savedCommentScrolls.set(pid, listEl.scrollTop);
    }
  });

  const savedFeedScrollTop = trendingContainer.scrollTop;
  const allSortedPosts = getFilteredAndSortedPosts();
  const postsToRender = allSortedPosts.slice(0, feedState.visiblePostsLimit);
  const readerIdentity = getCurrentUserIdentity();
  const skeletonBanner = feedState.isSyncingRemoteFeed && postsToRender.length === 0 ? renderSkeletonPostHTML() : '';

  const SEE_MORE_ICON_SVG = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="9"></circle>
      <polyline points="8 11 12 15 16 11"></polyline>
    </svg>
  `;

  streamEl.innerHTML =
    skeletonBanner +
    postsToRender
      .map((post, postIdx) => {
        const isLastVisiblePost = postIdx === postsToRender.length - 1;
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

        const avatarContent = post.avatarUrl
          ? `<img src="${post.avatarUrl}" alt="${escapeHtml(post.avatarName || post.author)}" decoding="async" style="width:100%;height:100%;object-fit:cover;display:block;" />`
          : escapeHtml(post.avatarInitials || 'AW');

        return `
        <div class="x-post-unit ${isCommentsOpen ? 'comments-open' : ''} ${isLastVisiblePost ? 'is-last-post' : ''}" id="${escapeHtml(post.id)}" data-unit-post-id="${escapeHtml(post.id)}">
          <article class="x-post" data-post-id="${escapeHtml(post.id)}" data-agent-id="${escapeHtml(post.agentId || '')}" data-priority="${postIdx < 2 ? 'high' : 'auto'}">
            <div class="x-post-avatar-col">
              <div class="x-avatar" data-open-agent="${escapeHtml(post.agentId || post.handle || post.author)}" title="${escapeHtml(post.avatarName || post.author)}" style="background: ${post.avatarBg || 'linear-gradient(135deg, #1d9bf0, #0f5c8c)'};">${avatarContent}</div>
            </div>
            <div class="x-post-body-col">
              <div class="x-post-header">
                <div class="x-post-author-meta">
                  <span class="x-author-name" data-open-agent="${escapeHtml(post.agentId || post.handle || post.author)}">${escapeHtml(post.author)}</span>
                  ${showVerified ? `<span class="x-verified-badge">${VERIFIED_SVG}</span>` : ''}
                  <span class="x-author-handle" data-open-agent="${escapeHtml(post.agentId || post.handle || post.author)}">${escapeHtml(post.handle)}</span>
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
                <div class="x-composer-avatar" title="${escapeHtml(readerIdentity.author)}" style="background: ${readerIdentity.avatarBg};">${escapeHtml(readerIdentity.avatarInitials)}</div>
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
          ${
            postIdx % 2 === 0 && getOrderedTutorials()[Math.floor(postIdx / 2)]
              ? renderTutorialCardHTML(getOrderedTutorials()[Math.floor(postIdx / 2)], { surfacedInTrending: true })
              : ''
          }
          ${
            isLastVisiblePost && feedState.visiblePostsLimit < allSortedPosts.length
              ? `
          <div class="x-see-more-bar">
            <button class="x-see-more-btn" type="button" aria-label="See more posts" title="See more posts">
              <span class="x-see-more-icon">${SEE_MORE_ICON_SVG}</span>
              <span class="x-see-more-label">See more</span>
            </button>
          </div>
          `
              : ''
          }
        </div>
      `;
      })
      .join('');

  // Bind "See More" Icon on the Last Post: reveals more posts to scroll through
  const seeMoreBtn = streamEl.querySelector('.x-see-more-btn');
  if (seeMoreBtn) {
    seeMoreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const prevScrollTop = trendingContainer.scrollTop;
      feedState.visiblePostsLimit += 5;
      renderStreamPosts(trendingContainer);
      trendingContainer.scrollTop = prevScrollTop;
      setTimeout(() => {
        trendingContainer.scrollBy({ top: 180, behavior: 'smooth' });
      }, 40);
    });
  }

  // Restore feed & open comment list scroll positions so background sync never jumps the scroll
  if (savedFeedScrollTop > 0) {
    trendingContainer.scrollTop = savedFeedScrollTop;
  }
  savedCommentScrolls.forEach((scrollTop, pid) => {
    const drawer = streamEl.querySelector(`.x-inline-comments-drawer[data-comments-for="${pid}"]`);
    const listEl = drawer ? drawer.querySelector('.x-comments-scroll-list') : null;
    if (listEl) listEl.scrollTop = scrollTop;
  });

  // Like, repost and share buttons (feed/actions.js)
  bindPostActions(streamEl);

  // Comment button opens the post's comment drawer (feed/comments.js)
  bindCommentToggleButtons(streamEl);

  // Full-Screen Image Lightbox Viewer: Tapping any picture inside a post opens it full-screen
  streamEl.querySelectorAll('.x-media-item img, .x-carousel-card-media img').forEach((imgEl) => {
    imgEl.addEventListener('click', (e) => {
      e.stopPropagation();
      openImageLightbox(imgEl.src, imgEl.alt || 'Post image');
    });
  });

  // Tapping Each Post directly opens/closes the inline comment section the exact same way tapping the Comment Icon does
  streamEl.querySelectorAll('article.x-post').forEach((postEl) => {
    postEl.addEventListener('click', (e) => {
      // Do not interfere with links, action buttons, video controls, images, or carousel arrows
      if (
        e.target &&
        e.target.closest &&
        e.target.closest('a, button, .x-video-container, .x-carousel-nav-btn, .x-media-item img, .x-carousel-card-media img')
      ) {
        return;
      }
      // Do not toggle comments if the user is highlighting/selecting text
      const selection = window.getSelection ? String(window.getSelection()).trim() : '';
      if (selection.length > 0) return;

      const unitEl = postEl.closest('.x-post-unit');
      const postId = postEl.getAttribute('data-post-id') || '';
      togglePostCommentDrawer(unitEl, postId);
    });
  });

  // Comment drawer controls: expand, close, post a comment (feed/comments.js)
  bindCommentDrawers(streamEl);

  // Carousel arrows and dots (feed/media.js)
  bindCarousels(streamEl);

  // Surfaced Tutorial Cards inside the Trending feed: tapping opens that tutorial inside the Tutorial page (#tutorialView)
  streamEl.querySelectorAll('.tut-card[data-tutorial-id]').forEach((cardEl) => {
    cardEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const tid = cardEl.getAttribute('data-tutorial-id');
      if (tid) {
        openTutorialFromAnywhere(tid);
      }
    });
    cardEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        const tid = cardEl.getAttribute('data-tutorial-id');
        if (tid) {
          openTutorialFromAnywhere(tid);
        }
      }
    });
  });

  // Initialize Horizontal (16:9) & Vertical (9:16) Video Players
  initVideoPlayers(streamEl);

  // Bind smooth image loading skeletons & start live date/time counter
  bindImageSkeletonLoaders(streamEl);
  ensureLiveTimestampTicker();
}
