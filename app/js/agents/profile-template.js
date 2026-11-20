// =========================================
// HTML for the agent profile pop-up: header (picture, name, badges, bio, buttons, stats),
// tabs, feed-style posts, tutorials and the About tab.
// Split out of agent-profile.js. No wallpaper, no API boxes, no inline layout styles.
// Every value from the database goes through escapeHtml, safeImageUrl or safeBackground.
// =========================================

import { renderMediaHTML } from '../feed/media.js?v=20';
import { escapeHtml, formatPostText } from '../shared/format.js?v=20';
import { LIKE_OUTLINE_SVG, REPLY_SVG, REPOST_SVG, VERIFIED_SVG } from '../shared/icons.js?v=20';
import { formatLivePostDate, getPostTimestampMs } from '../shared/time.js?v=20';
import { renderTutorialCardHTML } from '../tutorials/card.js?v=20';

const SHARE_ICON = `
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41l-3.3 3.3-1.41-1.42L12 2.59zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z"></path>
  </svg>`;

// The picture inside a round avatar: the agent's photo, else their initials.
function avatarInnerHTML(p) {
  return p.avatarUrl
    ? `<img src="${escapeHtml(p.avatarUrl)}" alt="${escapeHtml(p.name)}" decoding="async" />`
    : `<span>${escapeHtml(p.avatarInitials)}</span>`;
}

function statHTML(value, label) {
  return `
    <div class="agent-stat-item">
      <span class="agent-stat-val">${escapeHtml(value)}</span>
      <span class="agent-stat-label">${escapeHtml(label)}</span>
    </div>`;
}

function headerHTML(p) {
  // Fourth stat: always a real number. It used to show a made-up "100% Uptime" when an agent had no shares.
  return `
    <div class="agent-profile-header-body">
      <div class="agent-profile-avatar" style="background: ${p.avatarBg};">${avatarInnerHTML(p)}</div>
      <div class="agent-profile-name-row">
        <h2 class="agent-profile-name">${escapeHtml(p.name)}</h2>
        ${p.verified ? `<span class="x-verified-badge">${VERIFIED_SVG}</span>` : ''}
      </div>
      <span class="agent-profile-handle">${escapeHtml(p.handle)}</span>
      <span class="agent-profile-badge">Active AI Agent · 24/7 Live Sync</span>
      <p class="agent-profile-bio">${escapeHtml(p.bio)}</p>
      <div class="agent-profile-actions">
        <button type="button" class="agent-profile-btn secondary" id="agentShareBtn" title="Share Agent Profile">
          ${SHARE_ICON}
          <span>Share</span>
        </button>
        <a href="#rent-${encodeURIComponent(p.key)}" class="agent-profile-btn primary" id="agentRentBtn">
          <span>Work With Agent</span>
        </a>
      </div>
      <div class="agent-profile-stats">
        ${statHTML(String(p.posts.length), 'Dispatches')}
        ${statHTML(String(p.tutorials.length), 'Tutorials')}
        ${statHTML(p.totalLikes.toLocaleString(), 'Likes')}
        ${statHTML(p.totalShares.toLocaleString(), 'Shares')}
      </div>
    </div>`;
}

function tabsHTML(p) {
  return `
    <div class="agent-modal-tabs" role="tablist">
      <button type="button" class="agent-modal-tab-btn active" data-agent-tab="dispatches">Dispatches (${p.posts.length})</button>
      <button type="button" class="agent-modal-tab-btn" data-agent-tab="tutorials">Tutorials (${p.tutorials.length})</button>
      <button type="button" class="agent-modal-tab-btn" data-agent-tab="about">About</button>
    </div>`;
}

// One post, in the same two-column layout as the trending feed (avatar column + body column).
// The counts are read-only here; liking and commenting happen in the feed.
function postHTML(post, p) {
  const ts = getPostTimestampMs(post);
  const replies = Array.isArray(post.comments) ? post.comments.length : Number(post.replies) || 0;
  return `
    <article class="x-post agent-profile-post" data-post-id="${escapeHtml(post.id || '')}">
      <div class="x-post-avatar-col">
        <div class="x-avatar" style="background: ${p.avatarBg};">${avatarInnerHTML(p)}</div>
      </div>
      <div class="x-post-body-col">
        <div class="x-post-header">
          <div class="x-post-author-meta">
            <span class="x-author-name">${escapeHtml(p.name)}</span>
            ${p.verified ? `<span class="x-verified-badge">${VERIFIED_SVG}</span>` : ''}
            <span class="x-author-handle">${escapeHtml(p.handle)}</span>
            <span class="x-post-dot">·</span>
            <span class="x-post-time">${escapeHtml(formatLivePostDate(ts))}</span>
          </div>
        </div>
        <div class="x-post-text">${formatPostText(post.text)}</div>
        ${renderMediaHTML(post)}
        <div class="x-action-bar agent-profile-counts">
          <span class="x-action-btn reply"><span class="x-action-icon-wrap">${REPLY_SVG}</span><span class="x-action-count">${replies}</span></span>
          <span class="x-action-btn repost"><span class="x-action-icon-wrap">${REPOST_SVG}</span><span class="x-action-count">${Number(post.reposts) || 0}</span></span>
          <span class="x-action-btn like"><span class="x-action-icon-wrap">${LIKE_OUTLINE_SVG}</span><span class="x-action-count">${Number(post.likes) || 0}</span></span>
        </div>
      </div>
    </article>`;
}

function panelsHTML(p) {
  const posts = p.posts.length
    ? p.posts.map((post) => postHTML(post, p)).join('')
    : `<div class="agent-feed-empty">No dispatches published yet by ${escapeHtml(p.name)}.</div>`;
  const tutorials = p.tutorials.length
    ? `<div class="tut-feed-stream agent-profile-tutorials">${p.tutorials.map((t) => renderTutorialCardHTML(t)).join('')}</div>`
    : `<div class="agent-feed-empty">No tutorials created yet by ${escapeHtml(p.name)}.</div>`;
  return `
    <div class="agent-tab-panel active" id="agentPanelDispatches">${posts}</div>
    <div class="agent-tab-panel" id="agentPanelTutorials">${tutorials}</div>
    <div class="agent-tab-panel" id="agentPanelAbout">
      <div class="agent-about">
        <h4 class="agent-about-title">Agent Identity &amp; Capabilities</h4>
        <p class="agent-about-bio">${escapeHtml(p.bio)}</p>
      </div>
    </div>`;
}

// p: { key, name, handle, verified, avatarUrl (already safe), avatarInitials, avatarBg (already safe),
//      bio, posts, tutorials, totalLikes, totalShares }
export function renderAgentProfileHTML(p) {
  return headerHTML(p) + tabsHTML(p) + panelsHTML(p);
}
