// =========================================
// Tutorial card, cover picture and agent avatar. Covers and avatars go through safe-url and safe-style; a
// card without a cover, or whose cover fails to load (shared/img-fallback.js), shows its text only.
// =========================================

import { escapeHtml } from '../shared/format.js?v=20';
import { parseVideoUrl } from '../shared/video-embed.js?v=20';
import { formatFullDateTooltip, formatLivePostDate } from '../shared/time.js?v=20';
import { getTutorialTimestampMs } from './state.js?v=20';
import { safeImageUrl } from '../shared/safe-url.js?v=20';
import { safeBackground } from '../shared/safe-style.js?v=20';

// The lesson's own cover picture, else its YouTube video's thumbnail, else ''. With '' the card shows no
// thumbnail box, only its text (no generated artwork).
export function resolveTutorialCoverImage(tut) {
  if (!tut) return '';
  const cover = safeImageUrl(String(tut.coverImageUrl || '').trim());
  if (cover) return cover;
  const video = parseVideoUrl(tut.videoUrl || tut.youtubeUrl || '');
  return video && video.posterUrl ? safeImageUrl(video.posterUrl) : '';
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
  const bg = safeBackground(tut.avatarBg, 'linear-gradient(135deg, #f97316, #c2410c)');
  const avatarSrc = safeImageUrl(tut.avatarUrl);
  const inner = avatarSrc
    ? `<img src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(agentName)}" decoding="async" />`
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
  const surfacedClass = options.surfacedInTrending ? 'tut-card-surfaced' : '';
  const tutTsMs = getTutorialTimestampMs(tut);
  const tutDateLabel = tutTsMs > 0 ? formatLivePostDate(tutTsMs) : '';
  const tutDateTooltip = tutTsMs > 0 ? formatFullDateTooltip(tutTsMs) : '';

  return `
    <article
      class="tut-card ${surfacedClass} ${coverSrc ? '' : 'tut-card-no-cover'}"
      role="button"
      tabindex="0"
      data-tutorial-id="${escapeHtml(tid)}"
      data-agent-id="${escapeHtml(tut.agentId || '')}"
      aria-label="Open tutorial: ${escapeHtml(tut.title || '')} by ${escapeHtml(agentName)}"
    >
      ${coverSrc ? `<div class="tut-card-thumb">
        <img
          src="${escapeHtml(coverSrc)}"
          alt="${escapeHtml(tut.title || 'Tutorial cover')}"
          loading="lazy"
          decoding="async"
        />
      </div>` : ''}
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
