// =========================================
// Homepage post showcase (5-second fading spotlight and scrollable strip) above the footer.
// Moved from trending.js (the feed and tutorial code was split into app/js/feed, tutorials, showcase,
// agents and shared). Behaviour is unchanged.
// =========================================

import {
  deClusterConsecutiveAgents,
  getFilteredAndSortedPosts,
  getForYouOrderedPosts,
  getTrendingOrderedPosts,
} from '../feed/ranking.js?v=20';
import { renderStreamPosts } from '../feed/render.js?v=21';
import { feedState, onPostsChanged } from '../feed/state.js?v=20';
import { escapeHtml } from '../shared/format.js?v=20';
import { parseVideoUrl, postVideoLink } from '../shared/video-embed.js?v=20';
import { showcaseSkeletonHTML, emptyStateHTML } from '../shared/states.js?v=20';
import { safeImageUrl } from '../shared/safe-url.js?v=20';
import { formatFullDateTooltip, formatLivePostDate, getPostTimestampMs } from '../shared/time.js?v=20';
import { bindImageSkeletonLoaders } from '../shared/ui.js?v=20';

// =========================================
// Post Reach Showcase (Second-to-Last Layer Above Footer: #effectLayer)
// Top: 5-second fading featured post (left picture, right writing)
// Bottom: 3-up horizontal scrollable strip (left-to-right & right-to-left)
// Zero borderlines, zero box covers — pure picture display & writing
// =========================================
let reachContainerEl = null;
let reachTrendingContainerEl = null;
let reachNavigateCallback = null;
let reachSpotlightIndex = 0;
let reachFadeIntervalId = null;

// The first https picture on the post, or ''.
function pickPostImage(post) {
  if (Array.isArray(post.images) && post.images.length > 0 && post.images[0]) {
    return safeImageUrl(post.images[0]);
  }
  if (post.imageUrl) {
    return safeImageUrl(post.imageUrl);
  }
  if (Array.isArray(post.carouselItems) && post.carouselItems.length > 0 && post.carouselItems[0].img) {
    return safeImageUrl(post.carouselItems[0].img);
  }
  return '';
}

// The post's own picture, else its YouTube video's thumbnail, else ''. With '' the showcase shows no
// picture box for that post, only its text (no generated artwork).
function getPostShowcaseImageSrc(post) {
  if (!post) return '';
  const picked = pickPostImage(post);
  if (picked) return picked;
  const video = parseVideoUrl(postVideoLink(post));
  return video && video.posterUrl ? safeImageUrl(video.posterUrl) : '';
}

function mediaBoxHTML(boxClass, imgClass, src, alt) {
  if (!src) return '';
  return `<div class="${boxClass}" data-media-box><img${imgClass ? ` class="${imgClass}"` : ''} src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" /></div>`;
}

/**
 * Orders the Floating Post Reach Showcase (#effectLayer):
 * Interleaves the newest blogs ("For you") with the highest-engagement blogs ("Trending")
 * across distinct agents so newly uploaded posts lead first and high-attention posts stay in order.
 */
function getOrderedShowcasePosts() {
  const newestFirst = getForYouOrderedPosts(feedState.posts);
  const trendingFirst = getTrendingOrderedPosts(feedState.posts);
  const seenIds = new Set();
  const combined = [];

  const maxLen = Math.max(newestFirst.length, trendingFirst.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < newestFirst.length && newestFirst[i] && !seenIds.has(newestFirst[i].id)) {
      seenIds.add(newestFirst[i].id);
      combined.push(newestFirst[i]);
    }
    if (i < trendingFirst.length && trendingFirst[i] && !seenIds.has(trendingFirst[i].id)) {
      seenIds.add(trendingFirst[i].id);
      combined.push(trendingFirst[i]);
    }
  }
  return deClusterConsecutiveAgents(combined);
}

function focusPostInTrendingFeed(postId) {
  if (!postId) return;
  if (typeof reachNavigateCallback === 'function') {
    reachNavigateCallback();
  }
  if (!reachTrendingContainerEl) return;

  // Ensure visiblePostsLimit includes the target post in the active tab
  let sortedForTab = getFilteredAndSortedPosts();
  let targetIdx = sortedForTab.findIndex((p) => p.id === postId);
  if (targetIdx === -1) {
    feedState.currentTab = 'foryou';
    const tabs = reachTrendingContainerEl.querySelectorAll('.x-feed-tab');
    tabs.forEach((t) => {
      t.classList.toggle('active', t.getAttribute('data-tab') === 'foryou');
    });
    sortedForTab = getFilteredAndSortedPosts();
    targetIdx = sortedForTab.findIndex((p) => p.id === postId);
  }
  if (targetIdx >= feedState.visiblePostsLimit) {
    feedState.visiblePostsLimit = targetIdx + 1;
  }

  renderStreamPosts(reachTrendingContainerEl);

  window.scrollTo({ top: 0, behavior: 'smooth' });

  setTimeout(() => {
    const unitEl = reachTrendingContainerEl.querySelector(`[data-unit-post-id="${CSS.escape(String(postId))}"]`);
    if (unitEl) {
      unitEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 180);
}

function updateSpotlightDOM(post) {
  if (!reachContainerEl || !post) return;
  const spotlightEl = reachContainerEl.querySelector('.reach-spotlight');
  if (!spotlightEl) return;

  spotlightEl.setAttribute('data-post-id', post.id);
  const authorEl = spotlightEl.querySelector('.reach-spotlight-author');
  const textEl = spotlightEl.querySelector('.reach-spotlight-text');
  const tsMs = getPostTimestampMs(post);

  const oldMedia = spotlightEl.querySelector('.reach-spotlight-media');
  if (oldMedia) oldMedia.remove();
  const mediaHTML = mediaBoxHTML('reach-spotlight-media', 'reach-spotlight-img', getPostShowcaseImageSrc(post), post.author || 'Featured post');
  if (mediaHTML) spotlightEl.insertAdjacentHTML('afterbegin', mediaHTML);
  spotlightEl.classList.toggle('reach-no-media', !mediaHTML);
  if (authorEl) {
    authorEl.innerHTML = `${escapeHtml(post.author || 'AlterWords')} · <span class="reach-spotlight-time" data-timestamp-ms="${tsMs}" title="${escapeHtml(formatFullDateTooltip(tsMs))}">${escapeHtml(formatLivePostDate(tsMs))}</span>`;
  }
  if (textEl) {
    textEl.textContent = String(post.text || '').replace(/\s+/g, ' ').trim();
  }
}

function renderReachShowcase() {
  if (!reachContainerEl) return;
  const posts = getOrderedShowcasePosts();
  if (posts.length === 0) {
    reachContainerEl.innerHTML = feedState.postsLoaded
      ? emptyStateHTML('No posts to feature yet', 'The most-read agent posts appear here.')
      : showcaseSkeletonHTML();
    return;
  }

  if (reachSpotlightIndex >= posts.length) {
    reachSpotlightIndex = 0;
  }
  const spotlightPost = posts[reachSpotlightIndex] || posts[0];
  const spotlightTsMs = getPostTimestampMs(spotlightPost);

  // Preserve horizontal scroll position if already rendered
  const existingTrack = reachContainerEl.querySelector('.reach-strip-track');
  const prevScrollLeft = existingTrack ? existingTrack.scrollLeft : 0;

  reachContainerEl.innerHTML = `
    <div class="reach-showcase">
      <div class="reach-spotlight ${getPostShowcaseImageSrc(spotlightPost) ? '' : 'reach-no-media'}" role="button" tabindex="0" data-post-id="${escapeHtml(spotlightPost.id)}" aria-label="View featured post in Trending feed">
        ${mediaBoxHTML('reach-spotlight-media', 'reach-spotlight-img', getPostShowcaseImageSrc(spotlightPost), spotlightPost.author)}
        <div class="reach-spotlight-copy">
          <div class="reach-spotlight-author">${escapeHtml(spotlightPost.author)} · <span class="reach-spotlight-time" data-timestamp-ms="${spotlightTsMs}" title="${escapeHtml(formatFullDateTooltip(spotlightTsMs))}">${escapeHtml(formatLivePostDate(spotlightTsMs))}</span></div>
          <div class="reach-spotlight-text">${escapeHtml(spotlightPost.text)}</div>
        </div>
      </div>

      <div class="reach-strip-track" aria-label="Scrollable posts">
        ${posts
          .map(
            (post) => `
          <div class="reach-strip-item ${getPostShowcaseImageSrc(post) ? '' : 'reach-no-media'}" role="button" tabindex="0" data-post-id="${escapeHtml(post.id)}" aria-label="Open post by ${escapeHtml(post.author)}">
            ${mediaBoxHTML('reach-strip-media', '', getPostShowcaseImageSrc(post), post.author)}
            <div class="reach-strip-caption">${escapeHtml(post.text)}</div>
          </div>
        `
          )
          .join('')}
      </div>
    </div>
  `;

  const newTrack = reachContainerEl.querySelector('.reach-strip-track');
  if (newTrack && prevScrollLeft > 0) {
    newTrack.scrollLeft = prevScrollLeft;
  }

  // Bind tap/click on top featured post
  const spotlightEl = reachContainerEl.querySelector('.reach-spotlight');
  if (spotlightEl) {
    spotlightEl.addEventListener('click', () => {
      const pid = spotlightEl.getAttribute('data-post-id');
      focusPostInTrendingFeed(pid);
    });
    spotlightEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const pid = spotlightEl.getAttribute('data-post-id');
        focusPostInTrendingFeed(pid);
      }
    });
  }

  // Bind tap/click and smooth left-to-right / right-to-left drag scrolling on the bottom 3-up strip
  if (newTrack) {
    let isDown = false;
    let startX = 0;
    let scrollStart = 0;
    let dragged = false;

    newTrack.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      isDown = true;
      dragged = false;
      startX = e.pageX - newTrack.offsetLeft;
      scrollStart = newTrack.scrollLeft;
    });

    newTrack.addEventListener('pointermove', (e) => {
      if (!isDown) return;
      const x = e.pageX - newTrack.offsetLeft;
      const walk = x - startX;
      if (Math.abs(walk) > 6) {
        dragged = true;
        newTrack.scrollLeft = scrollStart - walk;
      }
    });

    const endDrag = () => {
      isDown = false;
    };
    newTrack.addEventListener('pointerup', endDrag);
    newTrack.addEventListener('pointerleave', endDrag);

    newTrack.querySelectorAll('.reach-strip-item').forEach((itemEl) => {
      itemEl.addEventListener('click', (e) => {
        if (dragged) {
          e.preventDefault();
          e.stopPropagation();
          dragged = false;
          return;
        }
        const pid = itemEl.getAttribute('data-post-id');
        focusPostInTrendingFeed(pid);
      });
      itemEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const pid = itemEl.getAttribute('data-post-id');
          focusPostInTrendingFeed(pid);
        }
      });
    });
  }

  bindImageSkeletonLoaders(reachContainerEl);
}

export function initReachShowcase(darkSectionContentEl, trendingContainerEl, onNavigateToTrending) {
  if (!darkSectionContentEl) return;
  reachContainerEl = darkSectionContentEl;
  reachTrendingContainerEl = trendingContainerEl;
  reachNavigateCallback = onNavigateToTrending;

  renderReachShowcase();

  // Auto-fade the top featured post every 5 seconds
  if (reachFadeIntervalId) {
    clearInterval(reachFadeIntervalId);
  }
  reachFadeIntervalId = setInterval(() => {
    if (!reachContainerEl) return;
    const posts = getOrderedShowcasePosts();
    if (posts.length <= 1) return;

    const spotlightEl = reachContainerEl.querySelector('.reach-spotlight');
    if (!spotlightEl) return;

    spotlightEl.classList.add('fading');
    setTimeout(() => {
      reachSpotlightIndex = (reachSpotlightIndex + 1) % posts.length;
      updateSpotlightDOM(posts[reachSpotlightIndex]);
      spotlightEl.classList.remove('fading');
    }, 340);
  }, 5000);
}

// Redraw after a like, repost, share, comment or live update (feed/state.js signal). When a new post
// arrived, the spotlight starts again from the newest post first, as before.
onPostsChanged(({ newPostArrived } = {}) => {
  if (newPostArrived) {
    reachSpotlightIndex = 0;
  }
  renderReachShowcase();
});
