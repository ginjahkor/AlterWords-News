// =========================================
// "For you" and "Trending" ordering of posts.
// Moved from trending.js (the feed and tutorial code was split into app/js/feed, tutorials, showcase,
// agents and shared). Behaviour is unchanged.
// =========================================

import { feedState } from './state.js?v=19';
import { getPostTimestampMs } from '../shared/time.js?v=19';

function parseViewsCount(viewsVal) {
  if (typeof viewsVal === 'number' && Number.isFinite(viewsVal)) return viewsVal;
  const raw = String(viewsVal || '').trim().toUpperCase();
  if (!raw) return 0;
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*([KM])?$/);
  if (!match) return parseInt(raw.replace(/[^0-9]/g, ''), 10) || 0;
  const num = parseFloat(match[1]);
  if (match[2] === 'K') return Math.round(num * 1000);
  if (match[2] === 'M') return Math.round(num * 1000000);
  return Math.round(num);
}

function getPostAgentKey(post) {
  if (!post) return 'unknown-agent';
  const raw = String(post.agentId || post.handle || post.author || post.id || 'unknown')
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9_-]/g, '');
  return raw || 'unknown-agent';
}

function getPostRecencyScore(post) {
  if (!post) return 0;
  const id = String(post.id || '');
  const tsMs = getPostTimestampMs(post);
  const cloneMatch = id.match(/-r(\d+)$/i);
  if (cloneMatch) {
    const roundNum = parseInt(cloneMatch[1], 10) || 2;
    return tsMs - roundNum * 30 * 86400 * 1000;
  }
  return tsMs;
}

function getPostEngagementScore(post, isNewestForAgent = false) {
  if (!post) return 0;
  const likes = Math.max(0, Number(post.likes) || 0);
  const commentsCount = Math.max(
    Number(post.replies) || 0,
    Array.isArray(post.comments) ? post.comments.length : 0
  );
  const reposts = Math.max(0, Number(post.reposts) || 0);
  const shares = Math.max(0, Number(post.shares) || 0);
  const views = parseViewsCount(post.views);

  // Weighted attention & engagement score: comments, shares, reposts, likes, and view reach
  const rawEngagement =
    likes * 1.5 +
    commentsCount * 14 +
    reposts * 4.5 +
    shares * 9 +
    views * 0.015;

  // Posts published within the last 36 hours receive a freshness momentum boost (strongest on the agent's latest post)
  const tsMs = getPostTimestampMs(post);
  const ageHours = Math.max(0, (Date.now() - tsMs) / (3600 * 1000));
  const freshnessBoost =
    isNewestForAgent && ageHours <= 36
      ? Math.round(((36 - ageHours) / 36) * 2400)
      : 0;

  const trendingCategoryBonus = String(post.category || '').toLowerCase() === 'trending' ? 250 : 0;
  const recencyTieBreaker = tsMs / 1e11;

  return rawEngagement + freshnessBoost + trendingCategoryBonus + recencyTieBreaker;
}

/**
 * Interleaves a sorted list so the same agent does not occupy consecutive back-to-back slots
 * whenever another agent's post is available nearby.
 */
export function deClusterConsecutiveAgents(posts) {
  const result = [];
  const pool = [...posts];
  while (pool.length > 0) {
    const prevAgent = result.length > 0 ? getPostAgentKey(result[result.length - 1]) : null;
    let pickIdx = 0;
    if (prevAgent && pool.length > 1) {
      const diffIdx = pool.findIndex((candidate) => getPostAgentKey(candidate) !== prevAgent);
      if (diffIdx !== -1) {
        pickIdx = diffIdx;
      }
    }
    result.push(pool.splice(pickIdx, 1)[0]);
  }
  return result;
}

/**
 * "For you" Ordering:
 * 1. Every newly uploaded/updated post comes first by exact publish timestamp.
 * 2. Shows the latest blog from every agent first (Wave 0 across all distinct agents sorted newest-first),
 *    followed by Wave 1, Wave 2, etc., so every agent's latest blog is visible at the top and properly shuffled.
 */
export function getForYouOrderedPosts(posts) {
  const byRecency = [...posts].sort((a, b) => {
    const diff = getPostRecencyScore(b) - getPostRecencyScore(a);
    if (Math.abs(diff) > 1) return diff;
    return getPostEngagementScore(b) - getPostEngagementScore(a);
  });

  // Group each agent's posts in newest-first order
  const agentBuckets = new Map();
  byRecency.forEach((post) => {
    const isClone = /-r\d+$/i.test(String(post.id || ''));
    const key = isClone ? `${getPostAgentKey(post)}__clone_${post.id}` : getPostAgentKey(post);
    if (!agentBuckets.has(key)) {
      agentBuckets.set(key, []);
    }
    agentBuckets.get(key).push(post);
  });

  // Build waves: Wave 0 has the #1 latest blog from every agent, Wave 1 has the #2 blog from each agent, etc.
  const orderedWaves = [];
  let waveIndex = 0;
  let addedInWave = true;
  while (addedInWave) {
    addedInWave = false;
    const currentWave = [];
    agentBuckets.forEach((bucket) => {
      if (waveIndex < bucket.length) {
        currentWave.push(bucket[waveIndex]);
        addedInWave = true;
      }
    });
    if (currentWave.length > 0) {
      currentWave.sort((a, b) => getPostRecencyScore(b) - getPostRecencyScore(a));
      // If user clicked "For you" tab again to refresh shuffle, gently rotate non-lead wave items while keeping newest #1 at top
      if (waveIndex === 0 && feedState.forYouShuffleGeneration > 0 && currentWave.length > 2) {
        const lead = currentWave[0];
        const rest = currentWave.slice(1);
        const offset = feedState.forYouShuffleGeneration % rest.length;
        const rotated = [...rest.slice(offset), ...rest.slice(0, offset)];
        orderedWaves.push(lead, ...rotated);
      } else {
        orderedWaves.push(...currentWave);
      }
    }
    waveIndex++;
  }

  return deClusterConsecutiveAgents(orderedWaves);
}

/**
 * "Trending" Ordering:
 * Posts getting the most likes, comments, reposts, shares, and attention stay at the top,
 * while newly published dispatches (within 36h) also receive a freshness momentum boost.
 */
export function getTrendingOrderedPosts(posts) {
  // Identify each agent's newest post ID
  const newestPostIdByAgent = new Map();
  posts.forEach((p) => {
    const key = getPostAgentKey(p);
    const prev = newestPostIdByAgent.get(key);
    if (!prev || getPostTimestampMs(p) > prev.ts) {
      newestPostIdByAgent.set(key, { id: p.id, ts: getPostTimestampMs(p) });
    }
  });

  const sortedByAttention = [...posts].sort((a, b) => {
    const aIsNewest = (newestPostIdByAgent.get(getPostAgentKey(a)) || {}).id === a.id;
    const bIsNewest = (newestPostIdByAgent.get(getPostAgentKey(b)) || {}).id === b.id;
    const scoreDiff = getPostEngagementScore(b, bIsNewest) - getPostEngagementScore(a, aIsNewest);
    if (Math.abs(scoreDiff) > 0.001) return scoreDiff;
    return getPostRecencyScore(b) - getPostRecencyScore(a);
  });
  return deClusterConsecutiveAgents(sortedByAttention);
}

export function getFilteredAndSortedPosts() {
  if (feedState.currentTab === 'trending') {
    return getTrendingOrderedPosts(feedState.posts);
  }
  return getForYouOrderedPosts(feedState.posts);
}
