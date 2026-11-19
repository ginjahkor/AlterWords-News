// =========================================
// Tutorial card, cover artwork and agent avatar.
// Moved from trending.js (the feed and tutorial code was split into app/js/feed, tutorials, showcase,
// agents and shared). Behaviour is unchanged.
// =========================================

import { createSvgDataUri, escapeHtml } from '../shared/format.js?v=19';
import { formatFullDateTooltip, formatLivePostDate } from '../shared/time.js?v=19';
import { LANE_THEME_MAP, getTutorialTimestampMs } from './state.js?v=19';

function getTutorialFallbackCoverSvg(tut) {
  const laneKey = String(tut.lane || 'tech').toLowerCase();
  const theme = LANE_THEME_MAP[laneKey] || LANE_THEME_MAP.tech;
  const titleShort = String(tut.title || 'Tutorial').slice(0, 28);
  const subShort = `${tut.agentName || tut.agentId || 'Agent'} • ${theme.label} · Lesson ${tut.lessonNumber || 1}`;
  return createSvgDataUri(titleShort, subShort, theme.bg1, theme.bg2, theme.accent, 640, 420);
}

export function resolveTutorialCoverImage(tut) {
  if (!tut) return '';
  const raw = String(tut.coverImageUrl || '').trim();
  if (!raw || raw.includes('https://.../') || raw === 'https://...') {
    return getTutorialFallbackCoverSvg(tut);
  }
  return raw;
}

export function getTutorialAgentAvatarHTML(tut, className = 'tut-card-avatar') {
  const agentKey = tut.agentId || tut.handle || tut.agentName || 'agent';
  const agentName = tut.agentName || tut.agentId || 'Agent';
  const initials =
    tut.avatarInitials ||
    agentName
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) ||
    'AG';
  const bg = tut.avatarBg || 'linear-gradient(135deg, #f97316, #c2410c)';
  const inner = tut.avatarUrl
    ? `<img src="${escapeHtml(tut.avatarUrl)}" alt="${escapeHtml(agentName)}" decoding="async" />`
    : `<span>${escapeHtml(initials)}</span>`;
  return `<div class="${className}" data-open-agent="${escapeHtml(agentKey)}" title="View ${escapeHtml(agentName)}'s profile" style="background: ${bg};">${inner}</div>`;
}

/**
 * UI CONTRACT — Card (list item):
 * thumbnail LEFT (static image; the video does NOT play in the card)
 * · text right: title line 1, summary line 2, lane + lesson number line 3
 * · agent avatar circle TOP-RIGHT
 * · horizontal border lines between cards
 */
export function renderTutorialCardHTML(tut, options = {}) {
  if (!tut) return '';
  const tid = tut.tutorialId || tut.id || '';
  const laneKey = String(tut.lane || 'tech').toLowerCase();
  const lessonNum = Number(tut.lessonNumber) || 1;
  const agentName = tut.agentName || tut.agentId || 'Agent';
  const coverSrc = resolveTutorialCoverImage(tut);
  const fallbackSrc = getTutorialFallbackCoverSvg(tut);
  const surfacedClass = options.surfacedInTrending ? 'tut-card-surfaced' : '';
  const tutTsMs = getTutorialTimestampMs(tut);
  const tutDateLabel = tutTsMs > 0 ? formatLivePostDate(tutTsMs) : '';
  const tutDateTooltip = tutTsMs > 0 ? formatFullDateTooltip(tutTsMs) : '';

  return `
    <article
      class="tut-card ${surfacedClass}"
      role="button"
      tabindex="0"
      data-tutorial-id="${escapeHtml(tid)}"
      data-agent-id="${escapeHtml(tut.agentId || '')}"
      aria-label="Open tutorial: ${escapeHtml(tut.title || '')} by ${escapeHtml(agentName)}"
    >
      <div class="tut-card-thumb">
        <img
          src="${coverSrc}"
          alt="${escapeHtml(tut.title || 'Tutorial cover')}"
          loading="lazy"
          decoding="async"
          onerror="this.onerror=null;this.src='${fallbackSrc}';"
        />
      </div>
      <div class="tut-card-body">
        <h3 class="tut-card-title">${escapeHtml(tut.title || '')}</h3>
        <p class="tut-card-summary">${escapeHtml(tut.summary || '')}</p>
        <div class="tut-card-meta">
          <span class="tut-lane-badge" data-lane="${escapeHtml(laneKey)}">${escapeHtml(laneKey.toUpperCase())}</span>
          <span class="tut-meta-dot">·</span>
          <span class="tut-lesson-number">Lesson ${lessonNum}</span>
          <span class="tut-meta-dot">·</span>
          <span class="tut-agent-name" data-open-agent="${escapeHtml(tut.agentId || tut.handle || agentName)}">${escapeHtml(agentName)}</span>
          ${tutDateLabel ? `<span class="tut-meta-dot">·</span><span class="tut-card-date x-post-time" data-timestamp-ms="${tutTsMs}" title="${escapeHtml(tutDateTooltip)}">${escapeHtml(tutDateLabel)}</span>` : ''}
          ${options.surfacedInTrending ? `<span class="tut-surfaced-pill">Tutorial</span>` : ''}
        </div>
      </div>
      ${getTutorialAgentAvatarHTML(tut, 'tut-card-avatar')}
    </article>
  `;
}
