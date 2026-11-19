// =========================================
// Timestamps, "2m ago" labels and the live clock ticker that keeps them fresh.
// Moved from trending.js (the feed and tutorial code was split into app/js/feed, tutorials, showcase,
// agents and shared). Behaviour is unchanged.
// =========================================

let liveTimestampTickerId = null;

export function extractTimestampMs(val) {
  if (!val) return 0;
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val.toMillis === 'function') {
    try {
      return val.toMillis();
    } catch (_) {}
  }
  if (typeof val.seconds === 'number') {
    return val.seconds * 1000 + Math.floor((val.nanoseconds || 0) / 1e6);
  }
  if (typeof val._seconds === 'number') {
    return val._seconds * 1000 + Math.floor((val._nanoseconds || 0) / 1e6);
  }
  if (typeof val === 'string' && val.trim().length > 0) {
    const parsed = Date.parse(val);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

export function extractIdTimestampMs(idStr) {
  const match = String(idStr || '').match(/(\d{10,15})/);
  if (!match) return 0;
  const num = Number(match[1]);
  return num < 1e11 ? num * 1000 : num;
}

function parseRelativeTimeOffsetMs(timeStr) {
  const raw = String(timeStr || '').trim().toLowerCase();
  if (!raw || raw === 'just now' || raw === 'now' || raw === 'live') return 0;
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*(s|sec|secs|m|min|mins|h|hr|hrs|d|day|days|w|wk|wks)/i);
  if (!match) return 12 * 3600 * 1000;
  const val = parseFloat(match[1]);
  const unit = match[2][0];
  if (unit === 's') return val * 1000;
  if (unit === 'm') return val * 60 * 1000;
  if (unit === 'h') return val * 3600 * 1000;
  if (unit === 'd') return val * 86400 * 1000;
  if (unit === 'w') return val * 7 * 86400 * 1000;
  return 12 * 3600 * 1000;
}

/**
 * Resolves the true publish timestamp (in milliseconds) for any post.
 * Uses Firestore createdAt / post-<timestamp> ID for live agent posts.
 */
export function getPostTimestampMs(post) {
  if (!post) return 0;
  const rawId = String(post.id || '');
  const baseId = rawId.replace(/-r\d+$/i, '');
  const createdMs = extractTimestampMs(post.createdAtMs) || extractTimestampMs(post.createdAt);
  const updatedMs = extractTimestampMs(post.updatedAtMs) || extractTimestampMs(post.updatedAt);
  const idMs = extractIdTimestampMs(baseId);
  return createdMs || idMs || updatedMs || Date.now();
}

export function getCommentTimestampMs(comment, postTimestampMs = 0) {
  if (!comment) return Date.now();
  const createdMs = extractTimestampMs(comment.createdAtMs) || extractTimestampMs(comment.createdAt);
  if (createdMs > 0) return createdMs;
  const idMs = extractIdTimestampMs(comment.id || '');
  if (idMs > 0) return idMs;

  // For baseline seed comments without an explicit createdAt, anchor relative to the parent post's publish time
  const offsetFromLabel = parseRelativeTimeOffsetMs(comment.time);
  if (postTimestampMs > 0) {
    return Math.min(Date.now() - 30000, postTimestampMs + Math.max(5 * 60 * 1000, 3600 * 1000 - offsetFromLabel));
  }
  return Date.now() - offsetFromLabel;
}

/**
 * Formats a millisecond timestamp into a live-counting relative label + calendar date
 * (e.g. "Just now", "15s ago", "4m ago", "3h ago · Nov 4", "1d ago · Nov 3, 10:04 AM", "6d ago · Oct 28", "Oct 20 · 15d ago")
 */
export function formatLivePostDate(tsMs, nowMs = Date.now()) {
  if (!tsMs || !Number.isFinite(tsMs) || tsMs <= 0) return 'Just now';
  const diffMs = Math.max(0, nowMs - tsMs);
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  const d = new Date(tsMs);
  const nowDate = new Date(nowMs);
  const sameYear = d.getFullYear() === nowDate.getFullYear();
  const shortDate = d.toLocaleDateString(
    'en-US',
    sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' }
  );

  if (diffSec < 12) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago · ${shortDate}`;
  if (diffDays === 1) {
    const shortTime = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `1d ago · ${shortDate}, ${shortTime}`;
  }
  if (diffDays < 7) return `${diffDays}d ago · ${shortDate}`;
  return `${shortDate} · ${diffDays}d ago`;
}

export function formatFullDateTooltip(tsMs) {
  if (!tsMs || !Number.isFinite(tsMs) || tsMs <= 0) return '';
  try {
    return new Date(tsMs).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch (_) {
    return '';
  }
}

function refreshVisibleTimestampsDOM() {
  const nowMs = Date.now();
  document.querySelectorAll('[data-timestamp-ms]').forEach((el) => {
    const tsMs = Number(el.getAttribute('data-timestamp-ms'));
    if (!tsMs || !Number.isFinite(tsMs)) return;
    const prefix = el.getAttribute('data-timestamp-prefix') || '';
    el.textContent = `${prefix}${formatLivePostDate(tsMs, nowMs)}`;
  });
}

export function ensureLiveTimestampTicker() {
  if (liveTimestampTickerId) return;
  liveTimestampTickerId = setInterval(refreshVisibleTimestampsDOM, 15000);
}
