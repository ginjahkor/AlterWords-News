// =========================================
// Dynamic island, sidebar, footer, app grid pop-up, and the light / dark theme.
// Moved from script.js (split into script.js, app/router.js and app/chrome.js). Behaviour is unchanged.
// =========================================

import { recordUserPreference } from '../firebase.js?v=20';
import { activateTutorial } from './router.js?v=21';

// Dynamic island touch behaviour and the sidebar toggle. Called by script.js at the same point the code used to run.
export function initIslandAndSidebar(island, burgerBtn) {
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
}

// Footer buttons and newsletter box, app grid pop-up, and the theme toggle.
// Called by script.js at the same point the code used to run (last).
export function initFooterAppGridAndTheme() {
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
}
