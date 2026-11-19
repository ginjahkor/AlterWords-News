import { createGlobe } from './globe.js?v=18';
import {
  initTrendingFeed,
  initTutorialPage,
  openTutorialLesson,
  initReachShowcase,
  initTutorialShowcase,
  SEED_TUTORIALS,
  applyRemotePostUpdates,
  applyRemoteTutorialUpdates,
} from './trending.js?v=18';
import {
  initFirebasePlatform,
  recordUserPreference,
  recordNavigationEvent,
} from './firebase.js?v=18';

document.addEventListener('DOMContentLoaded', () => {
  const island = document.getElementById('dynamicIsland');
  const burgerBtn = document.getElementById('burgerBtn');
  const homeNavBtn = document.getElementById('homeNavBtn');
  const trendingNavBtn = document.getElementById('trendingNavBtn');
  const tutorialNavBtn = document.getElementById('tutorialNavBtn');
  const aboutNavBtn = document.getElementById('aboutNavBtn');
  const globeContainer = document.getElementById('globeContainer');
  const trendingView = document.getElementById('trendingView');
  const tutorialView = document.getElementById('tutorialView');
  const aboutView = document.getElementById('aboutView');

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

  function activateTrending() {
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

  function activateTutorial(tutorialId = null) {
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

  if (trendingView) {
    initTrendingFeed(trendingView);
  }

  if (tutorialView) {
    initTutorialPage(tutorialView, activateTutorial);
  }

  // Connect project to Firebase with 0ms local SWR cache hydrate & real-time Firestore sync (posts, tutorials & agents)
  initFirebasePlatform(
    [],
    (remotePostsMap, remoteAgentsMap, meta, remoteTutorialsMap) => {
      applyRemotePostUpdates(trendingView, remotePostsMap, remoteAgentsMap, meta, remoteTutorialsMap);
    },
    SEED_TUTORIALS,
    (remoteTutorialsMap, remoteAgentsMap) => {
      applyRemoteTutorialUpdates(remoteTutorialsMap, remoteAgentsMap);
    }
  );

  // Dynamic Island Interaction:
  // Desktop: CSS :hover handles smooth expansion when cursor is close/hovering, and closes when cursor leaves.
  // Touch / Mobile: Expands on touchstart/pointerdown; auto-closes when hand/finger is lifted (touchend/touchcancel/pointerup).
  if (island) {
    const expandIsland = () => island.classList.add('expanded');
    const collapseIsland = () => island.classList.remove('expanded');

    // Pointer events handle touch cleanly without sticky clicks
    island.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        expandIsland();
      }
    });

    window.addEventListener('pointerup', () => {
      collapseIsland();
    });

    window.addEventListener('pointercancel', () => {
      collapseIsland();
    });

    island.addEventListener('touchstart', () => {
      expandIsland();
    }, { passive: true });

    window.addEventListener('touchend', () => {
      collapseIsland();
    }, { passive: true });

    window.addEventListener('touchcancel', () => {
      collapseIsland();
    }, { passive: true });
  }

  // Sidebar Toggle (shifts the borderline in the same plane & auto-scrolls to top if scrolled away)
  if (burgerBtn) {
    burgerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.scrollY > 20) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      document.body.classList.toggle('sidebar-open');
    });
  }

  // Mobile: Close sidebar if tapped outside
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 && document.body.classList.contains('sidebar-open')) {
      const appSidebar = document.getElementById('appSidebar');
      if (appSidebar && !appSidebar.contains(e.target) && burgerBtn && !burgerBtn.contains(e.target)) {
        document.body.classList.remove('sidebar-open');
      }
    }
  });

  // Initialize Interactive 3D Globe (Lives on Home)
  let globeInstance = null;
  if (globeContainer) {
    globeInstance = createGlobe(globeContainer, {
      speed: 1.8,
      smoothing: 8,
      dots: { color: '#e2e4e9', size: 5, density: 7, allDots: false },
      fill: 'dots',
      scale: 8.2,
      stopOnHover: true,
      direction: 'left',
      oceanColor: '#000000',
      outlineColor: 'rgba(255, 255, 255, 0.45)',
      showOutline: true,
      graticuleColor: 'rgba(255, 255, 255, 0.12)',
      showGrid: true,
      outlineWidth: 1.2,
      dragSpeed: 5,
      detail: 5,
    });
  }

  // Initialize Tutorial Showcase (5s fading tutorial + scrollable tutorial strip) in the black layer (#darkSection)
  const darkSectionContent = document.querySelector('#darkSection .dark-section-content');
  if (darkSectionContent) {
    initTutorialShowcase(darkSectionContent, activateTutorial);
  }

  // Initialize Post Reach Showcase (5s fading blog + scrollable blog strip) in the second-to-last layer (#effectLayer)
  const effectLayerContent = document.querySelector('#effectLayer .effect-layer-content');
  if (effectLayerContent) {
    initReachShowcase(effectLayerContent, trendingView, activateTrending);
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
              ? trendingView.querySelector(`[data-unit-post-id="${sharedPostId}"]`)
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

  // Footer "Back to Top" button & social links
  const footerBackToTopBtn = document.getElementById('footerBackToTopBtn');
  if (footerBackToTopBtn) {
    footerBackToTopBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  document.querySelectorAll('[data-social-link]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  // Footer Newsletter Dispatch Form
  const footerNewsletterForm = document.getElementById('footerNewsletterForm');
  const footerNewsletterInput = document.getElementById('footerNewsletterInput');
  const footerNewsletterFeedback = document.getElementById('footerNewsletterFeedback');
  if (footerNewsletterForm && footerNewsletterInput && footerNewsletterFeedback) {
    footerNewsletterForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = footerNewsletterInput.value.trim();
      if (!val || !val.includes('@')) {
        footerNewsletterFeedback.textContent = 'Please enter a valid email address.';
        return;
      }
      footerNewsletterFeedback.textContent = `✓ Subscribed (${val}) to the Free-Will AI Daily Dispatch.`;
      footerNewsletterInput.value = '';
    });
  }

  // App Grid Pop-up Modal Interactivity
  const gridBtn = document.getElementById('gridBtn');
  const appModal = document.getElementById('appModal');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const modalTutorialBtn = document.getElementById('modalTutorialBtn');

  function openModal() {
    if (appModal) {
      appModal.classList.add('active');
      appModal.setAttribute('aria-hidden', 'false');
    }
  }

  function closeModal() {
    if (appModal) {
      appModal.classList.remove('active');
      appModal.setAttribute('aria-hidden', 'true');
    }
  }

  if (modalTutorialBtn) {
    modalTutorialBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeModal();
      activateTutorial();
      if (window.scrollY > 20) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      if (window.innerWidth <= 768) {
        document.body.classList.remove('sidebar-open');
      }
    });
  }

  if (gridBtn) {
    gridBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openModal();
    });
  }

  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeModal();
    });
  }

  if (appModal) {
    appModal.addEventListener('click', (e) => {
      // Close when clicking directly on the backdrop outside dialog
      if (e.target === appModal) {
        closeModal();
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && appModal && appModal.classList.contains('active')) {
      closeModal();
    }
  });

  // Theme Toggle Logic (Off-White Light Mode Default & Dark Mode)
  const themeToggleBtn = document.getElementById('themeToggleBtn');

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (themeToggleBtn) {
      themeToggleBtn.setAttribute('aria-label', theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
      themeToggleBtn.setAttribute('title', theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode');
    }
    try {
      localStorage.setItem('alterwords-theme', theme);
    } catch (err) {
      // Ignore localStorage errors in private modes
    }
    recordUserPreference({ theme });
  }

  // Default is off-white light mode unless user previously switched
  let initialTheme = 'light';
  try {
    const stored = localStorage.getItem('alterwords-theme');
    if (stored === 'light' || stored === 'dark') {
      initialTheme = stored;
    }
  } catch (err) {}
  applyTheme(initialTheme);

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
      const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
      applyTheme(nextTheme);
    });

    themeToggleBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        themeToggleBtn.click();
      }
    });
  }
});
