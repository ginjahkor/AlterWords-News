// =========================================
// Tutorial list page, opening a lesson (also from links elsewhere), and its start-up.
// Moved from trending.js (the feed and tutorial code was split into app/js/feed, tutorials, showcase,
// agents and shared). Behaviour is unchanged.
// =========================================

import { bindImageSkeletonLoaders } from '../shared/ui.js?v=20';
import { renderTutorialCardHTML } from './card.js?v=20';
import {
  readTutorialChecklistState,
  triggerStepByStepGuideDownload,
  writeTutorialChecklistState,
} from './checklist-download.js?v=20';
import { initTutorialDetailVideoPlayer } from './detail-video.js?v=20';
import { renderTutorialDetailHTML } from './detail.js?v=20';
import { getOrderedTutorials, onTutorialsChanged, tutorialState } from './state.js?v=20';

let tutorialPageContainerEl = null;
let activeTutorialDetailId = null;

export function renderTutorialPage(containerEl = tutorialPageContainerEl) {
  if (!containerEl) return;
  tutorialPageContainerEl = containerEl;

  if (tutorialState.activeVideoRafId) {
    cancelAnimationFrame(tutorialState.activeVideoRafId);
    tutorialState.activeVideoRafId = null;
  }

  const orderedTutorials = getOrderedTutorials();

  // If a specific tutorial is open in Detail Mode, render the 10-part Tutorial Page
  if (activeTutorialDetailId) {
    const selectedTut =
      orderedTutorials.find((t) => (t.tutorialId || t.id) === activeTutorialDetailId) || orderedTutorials[0];

    if (selectedTut) {
      containerEl.innerHTML = `
        <div class="x-feed-column tut-feed-column">
          ${renderTutorialDetailHTML(selectedTut)}
        </div>
      `;

      // Bind Back button ("← All Tutorials")
      const backBtn = containerEl.querySelector('.tut-back-btn');
      if (backBtn) {
        backBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          // Opened from an agent's profile: Back returns to that profile (agents/profile-history.js).
          if (typeof tutorialState.backOverride === 'function') {
            tutorialState.backOverride();
            return;
          }
          activeTutorialDetailId = null;
          renderTutorialPage(containerEl);
          containerEl.scrollTo({ top: 0, behavior: 'smooth' });
        });
      }

      // Bind Video Player inside the tutorial detail page
      initTutorialDetailVideoPlayer(containerEl, selectedTut);

      // Bind Download Card (fileLabel + fileUrl)
      const downloadBtn = containerEl.querySelector('.tut-download-card');
      if (downloadBtn) {
        downloadBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          triggerStepByStepGuideDownload(selectedTut);
        });
      }

      // Bind Tickable Checklist (saved in localStorage)
      const checkInputs = containerEl.querySelectorAll('.tut-check-input');
      const counterEl = containerEl.querySelector('.tut-checklist-counter');
      const progressFillEl = containerEl.querySelector('.tut-checklist-progress-fill');
      const totalChecks = checkInputs.length;

      checkInputs.forEach((inputEl) => {
        inputEl.addEventListener('change', () => {
          const idx = inputEl.getAttribute('data-check-idx');
          const rowEl = inputEl.closest('.tut-check-row');
          if (rowEl) rowEl.classList.toggle('checked', inputEl.checked);

          const currentState = readTutorialChecklistState(selectedTut.tutorialId || selectedTut.id);
          currentState[idx] = inputEl.checked;
          writeTutorialChecklistState(selectedTut.tutorialId || selectedTut.id, currentState);

          const doneCount = Array.from(checkInputs).filter((inp) => inp.checked).length;
          const pct = totalChecks > 0 ? Math.round((doneCount / totalChecks) * 100) : 0;
          if (counterEl) counterEl.textContent = `${doneCount} / ${totalChecks} done`;
          if (progressFillEl) progressFillEl.style.width = `${pct}%`;
        });
      });

      // Bind Step Slideable Image Gallery Prev / Next Navigation
      containerEl.querySelectorAll('.tut-step-slider-wrap').forEach((wrap) => {
        const slider = wrap.querySelector('.tut-step-slider');
        const prevBtn = wrap.querySelector('.tut-step-slider-btn.prev');
        const nextBtn = wrap.querySelector('.tut-step-slider-btn.next');
        const badge = wrap.querySelector('.tut-step-slider-badge');
        const items = wrap.querySelectorAll('.tut-step-slide-item');

        if (!slider || items.length <= 1) return;

        const updateBadge = () => {
          const w = slider.offsetWidth || 1;
          const curIdx = Math.min(items.length - 1, Math.max(0, Math.round(slider.scrollLeft / w)));
          if (badge) badge.textContent = `${curIdx + 1} / ${items.length}`;
        };

        if (prevBtn) {
          prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            slider.scrollBy({ left: -slider.offsetWidth, behavior: 'smooth' });
            setTimeout(updateBadge, 260);
          });
        }

        if (nextBtn) {
          nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            slider.scrollBy({ left: slider.offsetWidth, behavior: 'smooth' });
            setTimeout(updateBadge, 260);
          });
        }

        slider.addEventListener('scroll', updateBadge, { passive: true });
      });

      // Bind Step-Level Interactive Checklists
      containerEl.querySelectorAll('.tut-step-check-row').forEach((row) => {
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          const input = row.querySelector('.tut-step-check-input');
          const storageKey = row.getAttribute('data-storage-key');
          if (!input || !storageKey) return;
          input.checked = !input.checked;
          row.classList.toggle('checked', input.checked);
          try {
            localStorage.setItem(storageKey, input.checked ? '1' : '0');
          } catch (_) {}
        });
      });

      return;
    }
  }

  // Otherwise render Stream Mode matching the user's wireframe sketch:
  // One scrollable stream of all agents' tutorials (newest-first), horizontal border lines between cards
  containerEl.innerHTML = `
    <div class="x-feed-column tut-feed-column">
      <div class="tut-stream-list" role="region" aria-label="All agent tutorials">
        ${orderedTutorials.map((tut) => renderTutorialCardHTML(tut)).join('')}
      </div>
    </div>
  `;

  containerEl.querySelectorAll('.tut-card[data-tutorial-id]').forEach((cardEl) => {
    const openCard = () => {
      const tid = cardEl.getAttribute('data-tutorial-id');
      if (tid) {
        activeTutorialDetailId = tid;
        renderTutorialPage(containerEl);
        containerEl.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };
    cardEl.addEventListener('click', (e) => {
      e.stopPropagation();
      openCard();
    });
    cardEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openCard();
      }
    });
  });

  bindImageSkeletonLoaders(containerEl);
}

export function openTutorialLesson(tutorialId = null) {
  activeTutorialDetailId = tutorialId || null;
  if (tutorialPageContainerEl) {
    renderTutorialPage(tutorialPageContainerEl);
    tutorialPageContainerEl.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

export function openTutorialFromAnywhere(tutorialId) {
  if (typeof tutorialState.navigateCallback === 'function') {
    tutorialState.navigateCallback(tutorialId);
  } else {
    openTutorialLesson(tutorialId);
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function initTutorialPage(tutorialContainer, onNavigateToTutorial) {
  if (!tutorialContainer) return;
  tutorialPageContainerEl = tutorialContainer;
  if (typeof onNavigateToTutorial === 'function') {
    tutorialState.navigateCallback = onNavigateToTutorial;
  }
  renderTutorialPage(tutorialContainer);
}

// Live tutorial update (tutorials/state.js signal): redraw the list, keeping its scroll position,
// unless a lesson is open. Runs before the homepage showcase redraws.
onTutorialsChanged(() => {
  if (tutorialPageContainerEl && !activeTutorialDetailId) {
    const prevScroll = tutorialPageContainerEl.scrollTop;
    renderTutorialPage(tutorialPageContainerEl);
    tutorialPageContainerEl.scrollTop = prevScroll;
  }
}, 1);
