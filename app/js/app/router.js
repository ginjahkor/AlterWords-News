// =========================================
// Page switching: Home, Trending, Tutorial and About; ?view=, ?post= and ?tutorial= links; nav buttons.
// Moved from script.js (split into script.js, app/router.js and app/chrome.js). Behaviour is unchanged.
// =========================================

import { recordNavigationEvent } from '../firebase.js?v=20';
import { openTutorialLesson } from '../tutorials/page.js?v=21';

// Page elements, handed over by script.js once the page has loaded (setRouterElements)
let globeContainer = null;
let trendingView = null;
let tutorialView = null;
let aboutView = null;
let homeNavBtn = null;
let trendingNavBtn = null;
let tutorialNavBtn = null;
let aboutNavBtn = null;

export function setRouterElements(elements) {
  ({ globeContainer, trendingView, tutorialView, aboutView, homeNavBtn, trendingNavBtn, tutorialNavBtn, aboutNavBtn } = elements);
}

// Navigation Logic: Home vs Trending vs Tutorial vs About
function activateHome() {
  if (globeContainer) globeContainer.style.display = 'flex';
  if (trendingView) trendingView.style.display = 'none';
  if (tutorialView) tutorialView.style.display = 'none';
  if (aboutView) aboutView.style.display = 'none';
  if (homeNavBtn) homeNavBtn.classList.add('active');
  if (trendingNavBtn) trendingNavBtn.classList.remove('active');
  if (tutorialNavBtn) tutorialNavBtn.classList.remove('active');
  if (aboutNavBtn) aboutNavBtn.classList.remove('active');
  recordNavigationEvent('home');
}

export function activateTrending() {
  if (globeContainer) globeContainer.style.display = 'none';
  if (trendingView) trendingView.style.display = 'block';
  if (tutorialView) tutorialView.style.display = 'none';
  if (aboutView) aboutView.style.display = 'none';
  if (trendingNavBtn) trendingNavBtn.classList.add('active');
  if (homeNavBtn) homeNavBtn.classList.remove('active');
  if (tutorialNavBtn) tutorialNavBtn.classList.remove('active');
  if (aboutNavBtn) aboutNavBtn.classList.remove('active');
  recordNavigationEvent('trending');
}

export function activateTutorial(tutorialId = null) {
  if (globeContainer) globeContainer.style.display = 'none';
  if (trendingView) trendingView.style.display = 'none';
  if (tutorialView) tutorialView.style.display = 'block';
  if (aboutView) aboutView.style.display = 'none';
  if (tutorialNavBtn) tutorialNavBtn.classList.add('active');
  if (homeNavBtn) homeNavBtn.classList.remove('active');
  if (trendingNavBtn) trendingNavBtn.classList.remove('active');
  if (aboutNavBtn) aboutNavBtn.classList.remove('active');
  openTutorialLesson(typeof tutorialId === 'string' && tutorialId.length > 0 ? tutorialId : null);
  recordNavigationEvent('tutorial');
}

function activateAbout() {
  if (globeContainer) globeContainer.style.display = 'none';
  if (trendingView) trendingView.style.display = 'none';
  if (tutorialView) tutorialView.style.display = 'none';
  if (aboutView) aboutView.style.display = 'block';
  if (aboutNavBtn) aboutNavBtn.classList.add('active');
  if (homeNavBtn) homeNavBtn.classList.remove('active');
  if (trendingNavBtn) trendingNavBtn.classList.remove('active');
  if (tutorialNavBtn) tutorialNavBtn.classList.remove('active');
  recordNavigationEvent('about');
}

// Which page is showing, and switching back to it (used by agents/profile-history.js
// to put the page back as it was when returning from a tutorial to a profile).
export function getActiveViewName() {
  if (tutorialView && tutorialView.style.display === 'block') return 'tutorial';
  if (aboutView && aboutView.style.display === 'block') return 'about';
  if (trendingView && trendingView.style.display === 'block') return 'trending';
  return 'home';
}

export function showView(name) {
  if (name === 'home') activateHome();
  else if (name === 'about') activateAbout();
  else if (name === 'tutorial') activateTutorial(null);
  else activateTrending();
}

// Sidebar, About page, homepage and footer navigation buttons, plus the landing view from the URL.
// Called by script.js at the same point the code used to run.
export function bindNavigation() {
  if (homeNavBtn) {
    homeNavBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      activateHome();
      // On mobile, auto-close sidebar to display the section fully
      if (window.innerWidth <= 768) {
        document.body.classList.remove('sidebar-open');
      }
    });
  }

  if (trendingNavBtn) {
    trendingNavBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      activateTrending();
      // On mobile, auto-close sidebar to display the section fully
      if (window.innerWidth <= 768) {
        document.body.classList.remove('sidebar-open');
      }
    });
  }

  if (tutorialNavBtn) {
    tutorialNavBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      activateTutorial(null);
      // On mobile, auto-close sidebar to display the section fully
      if (window.innerWidth <= 768) {
        document.body.classList.remove('sidebar-open');
      }
    });
  }

  if (aboutNavBtn) {
    aboutNavBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      activateAbout();
      // On mobile, auto-close sidebar to display the section fully
      if (window.innerWidth <= 768) {
        document.body.classList.remove('sidebar-open');
      }
    });

    // Default landing view is Trending (#trendingView) unless overridden by URL parameters (?tutorial=..., ?view=home, ?view=about)
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const sharedTutorialId = urlParams.get('tutorial');
      const sharedPostId = urlParams.get('post');
      const requestedView = (urlParams.get('view') || '').toLowerCase();
      if (sharedTutorialId || requestedView === 'tutorial') {
        activateTutorial(sharedTutorialId || null);
      } else if (requestedView === 'home') {
        activateHome();
      } else if (requestedView === 'about') {
        activateAbout();
      } else {
        activateTrending();
        if (sharedPostId) {
          setTimeout(() => {
            const targetEl = trendingView
              ? trendingView.querySelector(`[data-unit-post-id="${CSS.escape(String(sharedPostId))}"]`)
              : null;
            if (targetEl) {
              targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }, 350);
        }
      }
    } catch (_) {
      activateTrending();
    }
  }

  // Wire up navigation & smooth-scroll buttons inside About Page, Homepage About Section, and Footer
  document.querySelectorAll('[data-nav-target]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const target = btn.getAttribute('data-nav-target');
      const scrollSectionId = btn.getAttribute('data-about-scroll');

      if (target === 'home') {
        activateHome();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (target === 'trending') {
        activateTrending();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (trendingView) trendingView.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (target === 'tutorial') {
        activateTutorial();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (tutorialView) tutorialView.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (target === 'about') {
        activateAbout();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (scrollSectionId && aboutView) {
          setTimeout(() => {
            const sec = document.getElementById(scrollSectionId);
            if (sec) {
              aboutView.scrollTo({ top: Math.max(0, sec.offsetTop - 52), behavior: 'smooth' });
            }
          }, 120);
        } else if (aboutView) {
          aboutView.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
    });
  });

  // Wire up internal section jump buttons inside About Page sticky bar
  document.querySelectorAll('.about-view [data-about-scroll]').forEach((btn) => {
    if (btn.hasAttribute('data-nav-target')) return;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const secId = btn.getAttribute('data-about-scroll');
      const sec = secId ? document.getElementById(secId) : null;
      if (sec && aboutView) {
        aboutView.scrollTo({ top: Math.max(0, sec.offsetTop - 52), behavior: 'smooth' });
      }
    });
  });
}
