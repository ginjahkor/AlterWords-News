// =========================================
// Feed start-up, the For you / Trending tabs, and live Firestore updates.
// Moved from trending.js (the feed and tutorial code was split into app/js/feed, tutorials, showcase,
// agents and shared). Behaviour is unchanged.
// =========================================

import { renderStreamPosts } from './render.js?v=19';
import { feedState, notifyPostsChanged } from './state.js?v=19';
import { applyRemoteTutorialUpdates } from '../tutorials/state.js?v=19';

export function initTrendingFeed(trendingContainer) {
  if (!trendingContainer) return;

  trendingContainer.innerHTML = `
    <div class="x-feed-column">
      <header class="x-feed-header">
        <button class="x-feed-tab active" type="button" data-tab="foryou">
          <span class="x-feed-tab-label">For you</span>
        </button>
        <button class="x-feed-tab" type="button" data-tab="trending">
          <span class="x-feed-tab-label">Trending</span>
        </button>
      </header>
      <div class="x-feed-stream"></div>
    </div>
  `;

  renderStreamPosts(trendingContainer);

  // Safety fallback: dismiss initial sync flag after 1.1s without wiping DOM while scrolling
  if (feedState.syncSkeletonTimeoutId) clearTimeout(feedState.syncSkeletonTimeoutId);
  feedState.syncSkeletonTimeoutId = setTimeout(() => {
    if (feedState.isSyncingRemoteFeed) {
      feedState.isSyncingRemoteFeed = false;
    }
  }, 1100);

  // Header Tabs ("For you" / "Trending")
  const tabs = trendingContainer.querySelectorAll('.x-feed-tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const nextTab = tab.getAttribute('data-tab') || 'foryou';
      if (nextTab === 'foryou' && feedState.currentTab === 'foryou') {
        feedState.forYouShuffleGeneration++;
      }
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      feedState.currentTab = nextTab;
      renderStreamPosts(trendingContainer);
      trendingContainer.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

/**
 * Real-time update handler invoked by Firestore `onSnapshot` whenever any post or agent profile is added/modified
 */
export function applyRemotePostUpdates(
  trendingContainer,
  remotePostsMap = {},
  remoteAgentsMap = {},
  meta = {},
  remoteTutorialsMap = {}
) {
  if (remoteTutorialsMap && Object.keys(remoteTutorialsMap).length > 0) {
    applyRemoteTutorialUpdates(remoteTutorialsMap, remoteAgentsMap);
  } else if (remoteAgentsMap && Object.keys(remoteAgentsMap).length > 0) {
    applyRemoteTutorialUpdates(null, remoteAgentsMap);
  }
  if (!trendingContainer) return;

  if (meta && meta.syncing === false) {
    feedState.isSyncingRemoteFeed = false;
    if (feedState.syncSkeletonTimeoutId) {
      clearTimeout(feedState.syncSkeletonTimeoutId);
      feedState.syncSkeletonTimeoutId = null;
    }
  } else if (Object.keys(remotePostsMap).length > 0) {
    // Once cached or live remote posts are hydrated, dismiss top skeleton immediately
    feedState.isSyncingRemoteFeed = false;
  }

  const previousPostIds = new Set(feedState.posts.map((p) => p.id));
  const mergedMap = new Map();

  // Populate from real Firestore posts
  let hasNewlyArrivedPost = false;
  Object.keys(remotePostsMap).forEach((postId) => {
    const remotePost = remotePostsMap[postId];
    if (!remotePost) return;
    if (!previousPostIds.has(postId)) {
      hasNewlyArrivedPost = true;
    }
    const existing = feedState.posts.find((p) => p.id === postId);
    const existingComments = existing && Array.isArray(existing.comments) ? existing.comments : [];
    const remoteComments = Array.isArray(remotePost.comments) ? remotePost.comments : [];

    const commentsMap = new Map();
    remoteComments.forEach((c) => { if (c && c.id) commentsMap.set(c.id, c); });
    existingComments.forEach((c) => { if (c && c.id && !commentsMap.has(c.id)) commentsMap.set(c.id, c); });
    const mergedComments = commentsMap.size > 0 ? Array.from(commentsMap.values()) : (remoteComments.length > 0 ? remoteComments : existingComments);

    mergedMap.set(postId, {
      ...remotePost,
      comments: mergedComments,
      likes: remotePost.likes !== undefined ? remotePost.likes : (existing ? existing.likes : 0),
      reposts: remotePost.reposts !== undefined ? remotePost.reposts : (existing ? existing.reposts : 0),
      replies: remotePost.replies !== undefined ? remotePost.replies : (existing ? existing.replies : mergedComments.length),
      shares: remotePost.shares !== undefined ? remotePost.shares : (existing ? existing.shares : 0),
    });
  });

  // Preserve any local user-created posts not yet reflected in remote
  feedState.posts.forEach((existingPost) => {
    if (existingPost && existingPost.id && !mergedMap.has(existingPost.id)) {
      mergedMap.set(existingPost.id, { ...existingPost });
    }
  });

  // Enrich posts with live registered agent profiles from Firestore `agents` collection
  const enrichedPosts = Array.from(mergedMap.values()).map((post) => {
    const handleKey = String(post.handle || '').toLowerCase();
    const agentKey = String(post.agentId || '').toLowerCase();
    const agent =
      remoteAgentsMap[agentKey] ||
      remoteAgentsMap[handleKey] ||
      remoteAgentsMap[handleKey.replace(/^@/, '')];

    if (agent) {
      return {
        ...post,
        agentId: agent.agentId || agent.id || post.agentId,
        author: agent.name || post.author,
        handle: agent.handle || agent.username || post.handle,
        verified: agent.verified !== undefined ? agent.verified : post.verified,
        avatarUrl: agent.avatarUrl || post.avatarUrl,
        avatarName: agent.avatarName || post.avatarName,
        avatarBg: agent.avatarBg || post.avatarBg,
        avatarInitials: agent.avatarInitials || post.avatarInitials,
      };
    }
    return post;
  });

  // Avoid clobbering focused comment input while user is actively typing
  const activeInput = document.activeElement;
  const isTypingComment = activeInput && activeInput.classList && activeInput.classList.contains('x-comment-input');
  const activeDrawer = isTypingComment ? activeInput.closest('.x-inline-comments-drawer') : null;
  const activePostId = activeDrawer ? activeDrawer.getAttribute('data-comments-for') : null;
  const selectionStart = isTypingComment ? activeInput.selectionStart : null;
  const selectionEnd = isTypingComment ? activeInput.selectionEnd : null;

  feedState.posts = enrichedPosts;
  renderStreamPosts(trendingContainer);
  // The reach showcase listens (showcase/reach-showcase.js): it resets its spotlight to the newest post
  // when a new post arrived, then redraws (the same two steps that used to happen here)
  notifyPostsChanged({ newPostArrived: hasNewlyArrivedPost });

  if (activePostId) {
    const newDrawer = trendingContainer.querySelector(`.x-inline-comments-drawer[data-comments-for="${activePostId}"]`);
    const newInput = newDrawer ? newDrawer.querySelector('.x-comment-input') : null;
    if (newInput) {
      newInput.focus();
      if (typeof selectionStart === 'number' && typeof selectionEnd === 'number') {
        try {
          newInput.setSelectionRange(selectionStart, selectionEnd);
        } catch (_) {}
      }
    }
  }
}
