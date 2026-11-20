// =========================================
// Draws the feed, keeps scroll positions, "See more", and wires up the buttons, comments and carousels.
// Moved from trending.js (the feed and tutorial code was split into app/js/feed, tutorials, showcase,
// agents and shared). Behaviour is unchanged. Pictures and colours from posts go through safe-url and safe-style.
// =========================================

import { bindPostUnitInteractions, renderPostUnitHTML } from './post-unit.js?v=21';
import { getFilteredAndSortedPosts } from './ranking.js?v=20';
import { feedState } from './state.js?v=20';
import { initVideoPlayers } from './video-players.js?v=21';
import { bindImageSkeletonLoaders, renderSkeletonPostHTML } from '../shared/ui.js?v=20';
import { ensureLiveTimestampTicker } from '../shared/time.js?v=20';
import { renderTutorialCardHTML } from '../tutorials/card.js?v=20';
import { openTutorialFromAnywhere } from '../tutorials/page.js?v=21';
import { getOrderedTutorials } from '../tutorials/state.js?v=20';
import { getCurrentUserIdentity } from '../firebase.js?v=20';

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
        const extraHTML = `
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
        `;
        return renderPostUnitHTML(post, { postIdx, isLast: isLastVisiblePost, readerIdentity, extraHTML });
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
    const drawer = streamEl.querySelector(`.x-inline-comments-drawer[data-comments-for="${CSS.escape(pid)}"]`);
    const listEl = drawer ? drawer.querySelector('.x-comments-scroll-list') : null;
    if (listEl) listEl.scrollTop = scrollTop;
  });

  // Like, repost, share, comment drawer, post tap, picture lightbox and carousels (feed/post-unit.js)
  bindPostUnitInteractions(streamEl);

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
