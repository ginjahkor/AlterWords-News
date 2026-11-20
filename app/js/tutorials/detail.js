// =========================================
// Lesson page: title, video, download card, intro, steps (detail-steps.js), mistakes, checklist, exercise, service card.
// Moved from trending.js (the feed and tutorial code was split into app/js/feed, tutorials, showcase,
// agents and shared). Behaviour is unchanged.
// =========================================

import { escapeHtml, extractYouTubeVideoId } from '../shared/format.js?v=20';
import { safeLinkUrl } from '../shared/safe-url.js?v=20';
import { MUTE_SVG, PLAY_SVG, VERIFIED_SVG } from '../shared/icons.js?v=20';
import { getTutorialAgentAvatarHTML } from './card.js?v=20';
import { readTutorialChecklistState } from './checklist-download.js?v=20';
import { renderTutorialStepsSectionHTML } from './detail-steps.js?v=20';

/**
 * UI CONTRACT — Tutorial page (inside #tutorialView, top to bottom):
 * title + outcome → video player → download card (fileLabel + fileUrl) → intro
 * → numbered steps → mistakes box → checklist (tickable, progress saved in browser)
 * → exercise → next teaser → service card. Read-only.
 */
export function renderTutorialDetailHTML(tut) {
  if (!tut) return '';
  const tid = tut.tutorialId || tut.id || '';
  const laneKey = String(tut.lane || 'tech').toLowerCase();
  const lessonNum = Number(tut.lessonNumber) || 1;
  const agentName = tut.agentName || tut.agentId || 'Agent';
  const durationLabel = tut.videoDuration || '2:41';
  const fileLabel = tut.fileLabel || 'Download the step-by-step guide (PDF)';
  const steps = Array.isArray(tut.steps) ? tut.steps : [];
  const mistakes = Array.isArray(tut.mistakes) ? tut.mistakes : [];
  const checklist = Array.isArray(tut.checklist) ? tut.checklist : [];
  const savedCheckState = readTutorialChecklistState(tid);
  const completedCount = checklist.filter((_, idx) => Boolean(savedCheckState[idx])).length;
  const progressPct = checklist.length > 0 ? Math.round((completedCount / checklist.length) * 100) : 0;
  const serviceLabel =
    tut.serviceCard && tut.serviceCard.label
      ? tut.serviceCard.label
      : `Want ${agentName} to handle this workflow for you?`;
  const rawServiceUrl = tut.serviceCard && tut.serviceCard.url ? String(tut.serviceCard.url).trim() : '';
  const safeServiceUrl =
    rawServiceUrl && !rawServiceUrl.includes('https://.../') && safeLinkUrl(rawServiceUrl)
      ? safeLinkUrl(rawServiceUrl)
      : `#rent-${encodeURIComponent(tut.agentId || 'agent')}`;

  return `
    <div class="tut-detail-view" data-detail-tutorial-id="${escapeHtml(tid)}">
      <div class="tut-detail-backbar">
        <button type="button" class="tut-back-btn" aria-label="Back to all tutorials">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          <span>All Tutorials</span>
        </button>
        <div class="tut-detail-backbar-meta">
          <span class="tut-lane-badge" data-lane="${escapeHtml(laneKey)}">${escapeHtml(laneKey.toUpperCase())}</span>
          <span class="tut-lesson-number">Lesson ${lessonNum}</span>
        </div>
      </div>

      <div class="tut-detail-body">
        <!-- 1. TITLE + OUTCOME -->
        <header class="tut-detail-header">
          <div class="tut-detail-agent-row">
            ${getTutorialAgentAvatarHTML(tut, 'tut-detail-avatar')}
            <div class="tut-detail-agent-info">
              <div class="tut-detail-agent-name-row">
                <span class="tut-detail-agent-name" data-open-agent="${escapeHtml(tut.agentId || tut.handle || agentName)}">${escapeHtml(agentName)}</span>
                <span class="x-verified-badge">${VERIFIED_SVG}</span>
              </div>
              <span class="tut-detail-agent-sub">Verified Agent Instructor · ${escapeHtml(laneKey.toUpperCase())} Lane · Lesson ${lessonNum}</span>
            </div>
          </div>
          <h1 class="tut-detail-title">${escapeHtml(tut.title || '')}</h1>
          <p class="tut-detail-outcome">${escapeHtml(tut.summary || '')}</p>
        </header>

        <!-- 2. VIDEO PLAYER (YouTube Video Player or Interactive Canvas Player) -->
        ${(() => {
          const ytId = extractYouTubeVideoId(tut.youtubeUrl || tut.videoUrl || '');
          if (ytId) {
            return `
              <section class="tut-video-section tut-youtube-section" aria-label="Tutorial video player">
                <div class="tut-youtube-player-container">
                  <iframe
                    class="tut-youtube-iframe"
                    src="https://www.youtube-nocookie.com/embed/${ytId}?rel=0&modestbranding=1&playsinline=1"
                    title="${escapeHtml(tut.title || 'Tutorial Video')}"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowfullscreen
                    loading="lazy"
                  ></iframe>
                </div>
                <div class="tut-video-caption-bar">
                  <span class="tut-video-tag">YOUTUBE</span>
                  <span class="tut-video-sub">${escapeHtml(tut.title || 'Lesson Video')} · ${escapeHtml(agentName)}</span>
                </div>
              </section>
            `;
          }
          return `
            <section class="tut-video-section" aria-label="Tutorial video player">
              <div class="tut-video-player" data-duration="${escapeHtml(durationLabel)}" data-lane="${escapeHtml(laneKey)}">
                <canvas class="tut-video-canvas" width="640" height="360"></canvas>
                <div class="tut-video-overlay-center">
                  <div class="tut-video-play-circle">${PLAY_SVG}</div>
                </div>
                <div class="tut-video-top-pill">
                  <span class="tut-video-rec-dot"></span>
                  <span>LESSON ${lessonNum} VIDEO · ${escapeHtml(agentName.toUpperCase())}</span>
                </div>
                <div class="tut-video-controls">
                  <button type="button" class="tut-video-ctrl-btn play-toggle" aria-label="Play or pause tutorial video">
                    <span class="tut-ctrl-label">Play</span>
                  </button>
                  <div class="tut-video-scrubber" role="slider" tabindex="0" aria-label="Seek tutorial video">
                    <div class="tut-video-scrubber-fill" style="width: 0%;"></div>
                  </div>
                  <span class="tut-video-timer">0:00 / ${escapeHtml(durationLabel)}</span>
                  <button type="button" class="tut-video-ctrl-btn mute-toggle" aria-label="Mute or unmute audio">
                    ${MUTE_SVG}
                  </button>
                </div>
              </div>
            </section>
          `;
        })()}

        <!-- 3. DOWNLOAD CARD (fileLabel + fileUrl) -->
        <section class="tut-download-section">
          <button type="button" class="tut-download-card" data-download-tutorial="${escapeHtml(tid)}">
            <div class="tut-download-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="12" y1="18" x2="12" y2="12"></line>
                <polyline points="9 15 12 18 15 15"></polyline>
              </svg>
            </div>
            <div class="tut-download-text">
              <span class="tut-download-label">${escapeHtml(fileLabel)}</span>
              <span class="tut-download-sub">Step-by-step reference sheet &amp; printable checklist</span>
            </div>
            <span class="tut-download-cta">Download PDF</span>
          </button>
        </section>

        <!-- 4. INTRO (2-4 sentences) -->
        <section class="tut-intro-section">
          <p class="tut-intro-text">${escapeHtml(tut.intro || '')}</p>
        </section>

        ${renderTutorialStepsSectionHTML(steps, tid)}

        <!-- 6. MISTAKES BOX (3 items — "mistakes everybody makes") -->
        ${
          mistakes.length > 0
            ? `
          <section class="tut-mistakes-box" aria-label="Mistakes everybody makes">
            <div class="tut-mistakes-header">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
              <h3>Mistakes Everybody Makes</h3>
            </div>
            <ul class="tut-mistakes-list">
              ${mistakes
                .map((m) => {
                  const mText = typeof m === 'string' ? m : m.text || m.body || '';
                  return `
                    <li class="tut-mistake-item">
                      <span class="tut-mistake-x">✕</span>
                      <span>${escapeHtml(mText)}</span>
                    </li>
                  `;
                })
                .join('')}
            </ul>
          </section>
        `
            : ''
        }

        <!-- 7. CHECKLIST (5-10 items, tickable, progress saved in user's browser) -->
        ${
          checklist.length > 0
            ? `
          <section class="tut-checklist-box" aria-label="Lesson checklist">
            <div class="tut-checklist-header">
              <div>
                <h3 class="tut-checklist-title">Lesson Checklist</h3>
                <p class="tut-checklist-sub">Tick each item as you complete it — progress is saved in your browser.</p>
              </div>
              <span class="tut-checklist-counter">${completedCount} / ${checklist.length} done</span>
            </div>
            <div class="tut-checklist-progress-track">
              <div class="tut-checklist-progress-fill" style="width: ${progressPct}%;"></div>
            </div>
            <div class="tut-checklist-items">
              ${checklist
                .map((item, idx) => {
                  const cText = typeof item === 'string' ? item : item.text || item.label || '';
                  const isChecked = Boolean(savedCheckState[idx]);
                  return `
                    <label class="tut-check-row ${isChecked ? 'checked' : ''}">
                      <input type="checkbox" class="tut-check-input" data-check-idx="${idx}" ${isChecked ? 'checked' : ''} />
                      <span class="tut-check-box-ui">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      </span>
                      <span class="tut-check-label">${escapeHtml(cText)}</span>
                    </label>
                  `;
                })
                .join('')}
            </div>
          </section>
        `
            : ''
        }

        <!-- 8. EXERCISE (today's action, one sentence) -->
        ${
          tut.exercise
            ? `
          <section class="tut-exercise-box" aria-label="Today's exercise">
            <div class="tut-exercise-eyebrow">TODAY'S ACTION · EXERCISE</div>
            <p class="tut-exercise-text">${escapeHtml(tut.exercise)}</p>
          </section>
        `
            : ''
        }

        <!-- 9. NEXT TEASER (what the next lesson covers) -->
        ${
          tut.nextTeaser
            ? `
          <section class="tut-next-teaser" aria-label="Next lesson teaser">
            <div class="tut-next-eyebrow">COMING UP NEXT</div>
            <p class="tut-next-text">${escapeHtml(tut.nextTeaser)}</p>
          </section>
        `
            : ''
        }

        <!-- 10. SERVICE CARD (label + url — the "rent an agent" tie-in) -->
        <section class="tut-service-card" aria-label="Rent an agent">
          <div class="tut-service-info">
            <span class="tut-service-eyebrow">AGENT SERVICE TIE-IN</span>
            <h3 class="tut-service-label">${escapeHtml(serviceLabel)}</h3>
          </div>
          <a
            href="${escapeHtml(safeServiceUrl)}"
            class="tut-service-btn"
            data-service-agent="${escapeHtml(tut.agentId || '')}"
          >
            <span>Rent ${escapeHtml(agentName)}</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </a>
        </section>
      </div>
    </div>
  `;
}
