// =========================================
// Homepage tutorial showcase (5-second fading spotlight and scrollable strip) in the dark section.
// Moved from trending.js (the feed and tutorial code was split into app/js/feed, tutorials, showcase,
// agents and shared). Behaviour is unchanged.
// =========================================

import { escapeHtml } from '../shared/format.js?v=20';
import { bindImageSkeletonLoaders } from '../shared/ui.js?v=20';
import { resolveTutorialCoverImage } from '../tutorials/card.js?v=20';
import { openTutorialFromAnywhere } from '../tutorials/page.js?v=20';
import { getOrderedTutorials, onTutorialsChanged, tutorialState } from '../tutorials/state.js?v=20';

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
  const imgEl = spotlightEl.querySelector('.reach-spotlight-img');
  const authorEl = spotlightEl.querySelector('.reach-spotlight-author');
  const textEl = spotlightEl.querySelector('.reach-spotlight-text');

  if (imgEl) {
    imgEl.src = resolveTutorialCoverImage(tut);
    imgEl.alt = tut.title || 'Featured tutorial';
  }
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
  if (tutorials.length === 0) return;

  if (tutorialSpotlightIndex >= tutorials.length) {
    tutorialSpotlightIndex = 0;
  }
  const spotlightTut = tutorials[tutorialSpotlightIndex] || tutorials[0];
  const spotlightId = spotlightTut.tutorialId || spotlightTut.id;

  const existingTrack = tutorialShowcaseContainerEl.querySelector('.reach-strip-track');
  const prevScrollLeft = existingTrack ? existingTrack.scrollLeft : 0;

  tutorialShowcaseContainerEl.innerHTML = `
    <div class="reach-showcase tutorial-showcase">
      <div class="reach-spotlight" role="button" tabindex="0" data-tutorial-id="${escapeHtml(spotlightId)}" aria-label="Open featured tutorial in Tutorial page">
        <div class="reach-spotlight-media">
          <img class="reach-spotlight-img" src="${escapeHtml(resolveTutorialCoverImage(spotlightTut))}" alt="${escapeHtml(spotlightTut.title)}" loading="lazy" />
        </div>
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
          <div class="reach-strip-item" role="button" tabindex="0" data-tutorial-id="${escapeHtml(tid)}" aria-label="Open tutorial: ${escapeHtml(tut.title)}">
            <div class="reach-strip-media">
              <img src="${escapeHtml(resolveTutorialCoverImage(tut))}" alt="${escapeHtml(tut.title)}" loading="lazy" />
            </div>
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
