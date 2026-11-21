// =========================================
// Lesson steps: text, image galleries, mini checklists, mistakes, video clips, links and tips.
// Moved from trending.js (the feed and tutorial code was split into app/js/feed, tutorials, showcase,
// agents and shared). Behaviour is unchanged.
// =========================================

import { escapeHtml } from '../shared/format.js?v=20';
import { parseVideoUrl, embedIframeHTML } from '../shared/video-embed.js?v=20';
import { safeImageUrl, safeLinkUrl } from '../shared/safe-url.js?v=20';

// Section 5 of the lesson page. Returns exactly the HTML that used to sit inline in renderTutorialDetailHTML
// (tutorials/detail.js), which places it with ${renderTutorialStepsSectionHTML(steps, tid)}.
export function renderTutorialStepsSectionHTML(steps, tid) {
  return `<!-- 5. COMPOSABLE STEP-BY-STEP BREAKDOWN (Multi-Element: text, slideable images, checklist, mistakes, video, tips) -->
        <section class="tut-steps-section">
          <h2 class="tut-section-heading">Step-by-Step Breakdown</h2>
          <div class="tut-steps-list">
            ${steps
              .map((step, idx) => {
                const sNum = step && typeof step === 'object' ? step.number || idx + 1 : idx + 1;
                const sTitle = step && typeof step === 'object' ? step.title || `Step ${sNum}` : `Step ${sNum}`;
                const sBody = step && typeof step === 'object' ? step.body || '' : String(step || '');
                const sTip = step && typeof step === 'object' && step.tip ? String(step.tip) : '';

                // Slideable Image Gallery inside Step
                const sImages = Array.isArray(step.images) ? step.images : (step.image ? [step.image] : []);
                let imagesHtml = '';
                if (sImages.length > 1) {
                  imagesHtml = `
                    <div class="tut-step-slider-wrap" data-step-slider="${idx}">
                      <button type="button" class="tut-step-slider-btn prev" aria-label="Previous image">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
                      </button>
                      <div class="tut-step-slider">
                        ${sImages.map((imgObj, i) => {
                          const src = safeImageUrl(typeof imgObj === 'string' ? imgObj : imgObj.img || imgObj.url || '');
                          const cap = typeof imgObj === 'object' && imgObj.caption ? imgObj.caption : '';
                          return `
                            <div class="tut-step-slide-item">
                              <img src="${escapeHtml(src)}" alt="${escapeHtml(sTitle)} visual ${i + 1}" loading="lazy" />
                              ${cap ? `<div class="tut-step-slide-caption">${escapeHtml(cap)}</div>` : ''}
                            </div>
                          `;
                        }).join('')}
                      </div>
                      <button type="button" class="tut-step-slider-btn next" aria-label="Next image">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
                      </button>
                      <span class="tut-step-slider-badge">1 / ${sImages.length}</span>
                    </div>
                  `;
                } else if (sImages.length === 1) {
                  const src = safeImageUrl(typeof sImages[0] === 'string' ? sImages[0] : sImages[0].img || sImages[0].url || '');
                  const cap = typeof sImages[0] === 'object' && sImages[0].caption ? sImages[0].caption : '';
                  imagesHtml = `
                    <div class="tut-step-slider-wrap">
                      <div class="tut-step-slide-item">
                        <img src="${escapeHtml(src)}" alt="${escapeHtml(sTitle)} visual" loading="lazy" />
                        ${cap ? `<div class="tut-step-slide-caption">${escapeHtml(cap)}</div>` : ''}
                      </div>
                    </div>
                  `;
                }

                // Interactive Checklist inside Step
                const sChecklist = Array.isArray(step.checklist) ? step.checklist : [];
                let stepChecklistHtml = '';
                if (sChecklist.length > 0) {
                  stepChecklistHtml = `
                    <div class="tut-step-checklist" data-step-check="${idx}">
                      <span class="tut-step-checklist-title">Step ${sNum} Action Checklist</span>
                      ${sChecklist.map((item, cIdx) => {
                        const cText = typeof item === 'string' ? item : item.text || item.label || '';
                        const storageKey = `alterwords_step_check_${tid}_${idx}_${cIdx}`;
                        const isChecked = typeof localStorage !== 'undefined' && localStorage.getItem(storageKey) === '1';
                        return `
                          <label class="tut-step-check-row ${isChecked ? 'checked' : ''}" data-storage-key="${escapeHtml(storageKey)}">
                            <input type="checkbox" class="tut-step-check-input" ${isChecked ? 'checked' : ''} />
                            <span class="tut-step-check-box-ui">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="20 6 9 17 4 12"></polyline>
                              </svg>
                            </span>
                            <span>${escapeHtml(cText)}</span>
                          </label>
                        `;
                      }).join('')}
                    </div>
                  `;
                }

                // Mistakes & Warnings inside Step
                const sMistakes = Array.isArray(step.mistakes) ? step.mistakes : (step.mistake ? [step.mistake] : (step.warning ? [step.warning] : []));
                let stepMistakesHtml = '';
                if (sMistakes.length > 0) {
                  stepMistakesHtml = sMistakes.map((m) => {
                    const mText = typeof m === 'string' ? m : m.text || m.body || '';
                    return `
                      <div class="tut-step-mistake-box">
                        <span class="tut-mistake-x">✕</span>
                        <span><strong>Avoid:</strong> ${escapeHtml(mText)}</span>
                      </div>
                    `;
                  }).join('');
                }

                // Step-specific YouTube clip
                const stepVideo = parseVideoUrl(step.videoUrl || step.youtubeUrl || '');
                const stepVideoHtml = !stepVideo
                  ? ''
                  : stepVideo.provider === 'file'
                    ? `<div class="tut-step-video-container"><video class="tut-step-video-iframe" src="${escapeHtml(stepVideo.src)}" controls playsinline preload="metadata"></video></div>`
                    : `<div class="tut-step-video-container">${embedIframeHTML(stepVideo, 'tut-step-video-iframe', `${sTitle} video clip`)}</div>`;

                // Step-specific Links
                const sLinks = Array.isArray(step.links) ? step.links : [];
                let stepLinksHtml = '';
                if (sLinks.length > 0) {
                  stepLinksHtml = `
                    <div class="tut-step-links">
                      ${sLinks.map((l) => {
                        const url = safeLinkUrl(typeof l === 'string' ? l : l.url || '') || '#';
                        const label = typeof l === 'string' ? l : l.label || l.title || url;
                        return `<a href="${escapeHtml(url)}" class="tut-step-link-chip" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
                      }).join('')}
                    </div>
                  `;
                }

                return `
                  <div class="tut-step-card">
                    <div class="tut-step-num-col">
                      <span class="tut-step-num">${escapeHtml(String(sNum))}</span>
                    </div>
                    <div class="tut-step-content-col">
                      <h3 class="tut-step-title">${escapeHtml(sTitle)}</h3>
                      <p class="tut-step-body">${escapeHtml(sBody)}</p>
                      ${imagesHtml}
                      ${stepChecklistHtml}
                      ${stepMistakesHtml}
                      ${stepVideoHtml}
                      ${stepLinksHtml}
                      ${
                        sTip
                          ? `
                        <div class="tut-step-tip">
                          <span class="tut-step-tip-badge">TIP</span>
                          <span>${escapeHtml(sTip)}</span>
                        </div>
                      `
                          : ''
                      }
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        </section>`;
}
