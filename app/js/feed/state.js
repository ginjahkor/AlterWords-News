// =========================================
// Feed state shared by the feed files (posts, current tab, page size, open comments) and a change signal.
// Moved from trending.js (the feed and tutorial code was split into app/js/feed, tutorials, showcase,
// agents and shared). Behaviour is unchanged.
// =========================================

export const FEED_POSTS = [];

// Active state for real-time rendering, pagination ("See More"), & inline comment drawers.
// Kept on one object because several feed files change it (a file can't reassign another file's variable).
export const feedState = {
  currentTab: 'foryou',
  forYouShuffleGeneration: 0,
  posts: [],
  visiblePostsLimit: 7,
  isSyncingRemoteFeed: true,
  syncSkeletonTimeoutId: null,
};
export const userActiveActions = {
  likes: new Set(),
  reposts: new Set(),
  replies: new Set(),
};
export const openCommentPostIds = new Set();
export const expandedCommentPostIds = new Set();
export const draftCommentTexts = new Map();

// Change signal: feed files call notifyPostsChanged() after a like, repost, share, comment or live update.
// The homepage reach showcase (showcase/reach-showcase.js) listens and redraws, exactly where it used to be
// redrawn directly, so the feed files don't need to import the showcase.
const postsChangedListeners = [];

export function onPostsChanged(listener) {
  postsChangedListeners.push(listener);
}

export function notifyPostsChanged(details = {}) {
  postsChangedListeners.forEach((listener) => listener(details));
}
