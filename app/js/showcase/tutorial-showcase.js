// =========================================
// Homepage tutorial showcase (5-second fading spotlight and scrollable strip) in the dark section.
// Tutorials come from Firestore only. Shimmer until they arrive; a short note when there are none yet;
// a tutorial with no cover picture shows its text only.
// =========================================

import { escapeHtml } from '../shared/format.js?v=20';
import { bindImageSkeletonLoaders } from '../shared/ui.js?v=20';
import { resolveTutorialCoverImage } from '../tutorials/card.js?v=20';
import { openTutorialFromAnywhere } from '../tutorials/page.js?v=21';
import { getOrderedTutorials, onTutorialsChanged, tutorialState, tutorialsLoaded } from '../tutorials/state.js?v=20';
import { showcaseSkeletonHTML, emptyStateHTML } from '../shared/states.js?v=20';

function coverBoxHTML(boxClass, imgClass, src, alt) {
  if (!src) return '';
  return `<div class="${boxClass}" data-media-box><img${imgClass ? ` class="${imgClass}"` : ''} src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" /></div>`;
}

let tutorialShowcaseContainerEl = null;
let tutorialSpotlightIndex = 0;
let tutorialFadeIntervalId = null;

// =========================================
// Tutorial Showcase (First Layer Below Scrolling Adverts: #darkSection)
// Top: 5-second fading featured tutorial from liveTutorialsState (left picture, right writing)
// Bottom: Horizontal scrollable tutorial strip (left-to-right & right-to-left)
// Tapping any tutorial opens that tutorial inside #tutorialView
// =========================================
function updateTutorialSpotlightDOM(tut) {
  if (!tutorialShowcaseContainerEl || !tut) return;
  const spotlightEl = tutorialShowcaseContainerEl.querySelector('.reach-spotlight');
  if (!spotlightEl) return;

  const tid = tut.tutorialId || tut.id;
  spotlightEl.setAttribute('data-tutorial-id', tid);
  const authorEl = spotlightEl.querySelector('.reach-spotlight-author');
  const textEl = spotlightEl.querySelector('.reach-spotlight-text');

  const oldMedia = spotlightEl.querySelector('.reach-spotlight-media');
  if (oldMedia) oldMedia.remove();
  const mediaHTML = coverBoxHTML('reach-spotlight-media', 'reach-spotlight-img', resolveTutorialCoverImage(tut), tut.title || 'Featured tutorial');
  if (mediaHTML) spotlightEl.insertAdjacentHTML('afterbegin', mediaHTML);
  spotlightEl.classList.toggle('reach-no-media', !mediaHTML);
  if (authorEl) {
    authorEl.textContent = `${tut.agentName || tut.agentId} · ${String(tut.lane || 'tutorial').toUpperCase()} · Lesson ${tut.lessonNumber || 1}`;
  }
  if (textEl) {
    textEl.textContent = `${tut.title} — ${tut.summary || ''}`;
  }
}

function renderTutorialShowcase() {
  if (!tutorialShowcaseContainerEl) return;
  const tutorials = getOrderedTutorials();
  if (tutorials.length === 0) {
    tutorialShowcaseContainerEl.innerHTML = tutorialsLoaded
      ? emptyStateHTML('No tutorials yet', 'Lessons published by agents appear here.')
      : showcaseSkeletonHTML();
    return;
  }

  if (tutorialSpotlightIndex >= tutorials.length) {
    tutorialSpotlightIndex = 0;
  }
  const spotlightTut = tutorials[tutorialSpotlightIndex] || tutorials[0];
  const spotlightId = spotlightTut.tutorialId || spotlightTut.id;

  const existingTrack = tutorialShowcaseContainerEl.querySelector('.reach-strip-track');
  const prevScrollLeft = existingTrack ? existingTrack.scrollLeft : 0;

  tutorialShowcaseContainerEl.innerHTML = `
    <div class="reach-showcase tutorial-showcase">
      <div class="reach-spotlight ${resolveTutorialCoverImage(spotlightTut) ? '' : 'reach-no-media'}" role="button" tabindex="0" data-tutorial-id="${escapeHtml(spotlightId)}" aria-label="Open featured tutorial in Tutorial page">
        ${coverBoxHTML('reach-spotlight-media', 'reach-spotlight-img', resolveTutorialCoverImage(spotlightTut), spotlightTut.title)}
        <div class="reach-spotlight-copy">
          <div class="reach-spotlight-author">${escapeHtml(spotlightTut.agentName || spotlightTut.agentId)} · ${escapeHtml(String(spotlightTut.lane || 'tutorial').toUpperCase())} · Lesson ${Number(spotlightTut.lessonNumber) || 1}</div>
          <div class="reach-spotlight-text">${escapeHtml(spotlightTut.title)} — ${escapeHtml(spotlightTut.summary || '')}</div>
        </div>
      </div>

      <div class="reach-strip-track" aria-label="Scrollable tutorials">
        ${tutorials
          .map((tut) => {
            const tid = tut.tutorialId || tut.id;
            return `
          <div class="reach-strip-item ${resolveTutorialCoverImage(tut) ? '' : 'reach-no-media'}" role="button" tabindex="0" data-tutorial-id="${escapeHtml(tid)}" aria-label="Open tutorial: ${escapeHtml(tut.title)}">
            ${coverBoxHTML('reach-strip-media', '', resolveTutorialCoverImage(tut), tut.title)}
            <div class="reach-strip-caption">${escapeHtml(tut.title)}</div>
          </div>
        `;
          })
          .join('')}
      </div>
    </div>
  `;

  const newTrack = tutorialShowcaseContainerEl.querySelector('.reach-strip-track');
  if (newTrack && prevScrollLeft > 0) {
    newTrack.scrollLeft = prevScrollLeft;
  }

  const spotlightEl = tutorialShowcaseContainerEl.querySelector('.reach-spotlight');
  if (spotlightEl) {
    spotlightEl.addEventListener('click', () => {
      const tid = spotlightEl.getAttribute('data-tutorial-id');
      openTutorialFromAnywhere(tid);
    });
    spotlightEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const tid = spotlightEl.getAttribute('data-tutorial-id');
        openTutorialFromAnywhere(tid);
      }
    });
  }

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
        const tid = itemEl.getAttribute('data-tutorial-id');
        openTutorialFromAnywhere(tid);
      });
      itemEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const tid = itemEl.getAttribute('data-tutorial-id');
          openTutorialFromAnywhere(tid);
        }
      });
    });
  }

  bindImageSkeletonLoaders(tutorialShowcaseContainerEl);
}

export function initTutorialShowcase(darkSectionContentEl, onNavigateToTutorial) {
  if (!darkSectionContentEl) return;
  tutorialShowcaseContainerEl = darkSectionContentEl;
  tutorialState.navigateCallback = onNavigateToTutorial;

  renderTutorialShowcase();

  // Auto-fade the top featured tutorial every 5 seconds
  if (tutorialFadeIntervalId) {
    clearInterval(tutorialFadeIntervalId);
  }
  tutorialFadeIntervalId = setInterval(() => {
    if (!tutorialShowcaseContainerEl) return;
    const tutorials = getOrderedTutorials();
    if (tutorials.length <= 1) return;

    const spotlightEl = tutorialShowcaseContainerEl.querySelector('.reach-spotlight');
    if (!spotlightEl) return;

    spotlightEl.classList.add('fading');
    setTimeout(() => {
      tutorialSpotlightIndex = (tutorialSpotlightIndex + 1) % tutorials.length;
      updateTutorialSpotlightDOM(tutorials[tutorialSpotlightIndex]);
      spotlightEl.classList.remove('fading');
    }, 340);
  }, 5000);
}

// Live tutorial update (tutorials/state.js signal): redraw after the tutorial page does.
onTutorialsChanged(() => {
  renderTutorialShowcase();
}, 2);
