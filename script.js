import { createGlobe } from './globe.js';
import { initTrendingFeed, FEED_POSTS, applyRemotePostUpdates } from './trending.js';
import {
  initFirebasePlatform,
  recordUserPreference,
  recordNavigationEvent,
} from './firebase.js';

document.addEventListener('DOMContentLoaded', () => {
  const island = document.getElementById('dynamicIsland');
  const burgerBtn = document.getElementById('burgerBtn');
  const homeNavBtn = document.getElementById('homeNavBtn');
  const trendingNavBtn = document.getElementById('trendingNavBtn');
  const aboutNavBtn = document.getElementById('aboutNavBtn');
  const globeContainer = document.getElementById('globeContainer');
  const trendingView = document.getElementById('trendingView');
  const aboutView = document.getElementById('aboutView');

  if (trendingView) {
    initTrendingFeed(trendingView);
  }

  // Connect project to Firebase and automatically seed & sync database state
  initFirebasePlatform(FEED_POSTS, (remoteMap) => {
    applyRemotePostUpdates(trendingView, remoteMap);
  });

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

  // Navigation Logic: Home vs Trending vs About
  function activateHome() {
    if (globeContainer) globeContainer.style.display = 'flex';
    if (trendingView) trendingView.style.display = 'none';
    if (aboutView) aboutView.style.display = 'none';
    if (homeNavBtn) homeNavBtn.classList.add('active');
    if (trendingNavBtn) trendingNavBtn.classList.remove('active');
    if (aboutNavBtn) aboutNavBtn.classList.remove('active');
    recordNavigationEvent('home');
  }

  function activateTrending() {
    if (globeContainer) globeContainer.style.display = 'none';
    if (trendingView) trendingView.style.display = 'block'; // Completely empty inside the borderline
    if (aboutView) aboutView.style.display = 'none';
    if (trendingNavBtn) trendingNavBtn.classList.add('active');
    if (homeNavBtn) homeNavBtn.classList.remove('active');
    if (aboutNavBtn) aboutNavBtn.classList.remove('active');
    recordNavigationEvent('trending');
  }

  function activateAbout() {
    if (globeContainer) globeContainer.style.display = 'none';
    if (trendingView) trendingView.style.display = 'none';
    if (aboutView) aboutView.style.display = 'block'; // Completely empty inside the borderline
    if (aboutNavBtn) aboutNavBtn.classList.add('active');
    if (homeNavBtn) homeNavBtn.classList.remove('active');
    if (trendingNavBtn) trendingNavBtn.classList.remove('active');
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

  if (aboutNavBtn) {
    aboutNavBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      activateAbout();
      // On mobile, auto-close sidebar to display the section fully
      if (window.innerWidth <= 768) {
        document.body.classList.remove('sidebar-open');
      }
    });
  }

  // App Grid Pop-up Modal Interactivity
  const gridBtn = document.getElementById('gridBtn');
  const appModal = document.getElementById('appModal');
  const modalCloseBtn = document.getElementById('modalCloseBtn');

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
