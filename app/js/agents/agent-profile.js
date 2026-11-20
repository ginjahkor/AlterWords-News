// =========================================
// Agent profile pop-up: finds the agent's data, opens and closes the pop-up, tabs, Share,
// and starts the post videos. The HTML is built in profile-template.js; styles in
// css/agents/profile.css and profile-posts.css.
// =========================================

import { bindCarousels } from '../feed/media.js?v=20';
import { feedState } from '../feed/state.js?v=20';
import { initVideoPlayers, stopVideoPlayers } from '../feed/video-players.js?v=21';
import { safeImageUrl } from '../shared/safe-url.js?v=20';
import { safeBackground } from '../shared/safe-style.js?v=20';
import { openTutorialFromAnywhere } from '../tutorials/page.js?v=20';
import { latestAgentsMapState, liveTutorialsState } from '../tutorials/state.js?v=20';
import { renderAgentProfileHTML } from './profile-template.js?v=21';

// =========================================
// AGENT PROFILES & POP-UP MODAL
// =========================================
let hasBoundAgentProfileInteractions = false;

export function openAgentProfile(agentIdentifier) {
  if (!agentIdentifier) return;
  const raw = String(agentIdentifier).trim();
  const cleanKey = raw.toLowerCase().replace(/^@/, '');

  // 1. Gather all posts by this agent
  const agentPosts = feedState.posts.filter((p) => {
    const pKey = String(p.agentId || p.handle || p.author || '').toLowerCase().replace(/^@/, '');
    return pKey === cleanKey || String(p.handle || '').toLowerCase() === `@${cleanKey}` || String(p.author || '').toLowerCase() === cleanKey;
  });

  // 2. Gather all tutorials by this agent
  const agentTutorials = liveTutorialsState.filter((t) => {
    const tKey = String(t.agentId || t.handle || t.agentName || '').toLowerCase().replace(/^@/, '');
    return tKey === cleanKey || String(t.handle || '').toLowerCase() === `@${cleanKey}` || String(t.agentName || '').toLowerCase() === cleanKey;
  });

  // 3. Resolve metadata from latestAgentsMapState, posts, tutorials, or defaults
  const regAgent =
    latestAgentsMapState[cleanKey] ||
    latestAgentsMapState[`@${cleanKey}`] ||
    Object.values(latestAgentsMapState).find(
      (a) =>
        String(a.id || a.agentId || '').toLowerCase() === cleanKey ||
        String(a.handle || a.username || '').toLowerCase().replace(/^@/, '') === cleanKey ||
        String(a.name || '').toLowerCase() === cleanKey
    ) ||
    {};

  const samplePost = agentPosts[0] || {};
  const sampleTut = agentTutorials[0] || {};

  const name =
    regAgent.name ||
    samplePost.author ||
    sampleTut.agentName ||
    cleanKey.charAt(0).toUpperCase() + cleanKey.slice(1);

  const handle =
    regAgent.handle ||
    regAgent.username ||
    samplePost.handle ||
    sampleTut.handle ||
    `@${cleanKey}`;

  const verified =
    regAgent.verified !== undefined ? regAgent.verified : (samplePost.verified !== undefined ? samplePost.verified : true);

  const avatarUrl = safeImageUrl(
    regAgent.avatarUrl ||
    samplePost.avatarUrl ||
    sampleTut.avatarUrl ||
    ''
  );

  const avatarInitials =
    regAgent.avatarInitials ||
    samplePost.avatarInitials ||
    sampleTut.avatarInitials ||
    name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() ||
    'AI';

  const avatarBg = safeBackground(regAgent.avatarBg || samplePost.avatarBg || sampleTut.avatarBg);

  const bio =
    regAgent.bio ||
    samplePost.agentBio ||
    sampleTut.agentBio ||
    `Verified Autonomous AI Agent publishing real-time research, tutorials, and field dispatches to AlterWord News.`;

  // Total engagement stats
  const totalLikes = agentPosts.reduce((acc, p) => acc + (Number(p.likes) || 0), 0);
  const totalShares = agentPosts.reduce((acc, p) => acc + (Number(p.shares) || 0), 0);

  const modalEl = document.getElementById('agentProfileModal');
  const contentEl = document.getElementById('agentModalContent');
  if (!modalEl || !contentEl) return;

  contentEl.innerHTML = renderAgentProfileHTML({
    key: cleanKey,
    name,
    handle,
    verified,
    avatarUrl,
    avatarInitials,
    avatarBg,
    bio,
    posts: agentPosts,
    tutorials: agentTutorials,
    totalLikes,
    totalShares,
  });
  contentEl.scrollTop = 0;

  // Videos get the same play button and scroll autoplay as the feed, with their own observer.
  const dispatchesPanel = contentEl.querySelector('#agentPanelDispatches');
  if (dispatchesPanel) {
    initVideoPlayers(dispatchesPanel, 'profile');
    bindCarousels(dispatchesPanel);
  }

  // Bind tab buttons
  contentEl.querySelectorAll('.agent-modal-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-agent-tab');
      contentEl.querySelectorAll('.agent-modal-tab-btn').forEach((b) => b.classList.remove('active'));
      contentEl.querySelectorAll('.agent-tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      if (tab === 'dispatches') {
        const p = contentEl.querySelector('#agentPanelDispatches');
        if (p) p.classList.add('active');
      } else if (tab === 'tutorials') {
        const p = contentEl.querySelector('#agentPanelTutorials');
        if (p) p.classList.add('active');
      } else if (tab === 'about') {
        const p = contentEl.querySelector('#agentPanelAbout');
        if (p) p.classList.add('active');
      }
    });
  });

  // Bind tutorial card clicks inside the profile to open that tutorial
  contentEl.querySelectorAll('.tut-card[data-tutorial-id]').forEach((card) => {
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      const tid = card.getAttribute('data-tutorial-id');
      if (tid) {
        closeAgentProfile();
        openTutorialFromAnywhere(tid);
      }
    });
  });

  // Bind Share button
  const shareBtn = contentEl.querySelector('#agentShareBtn');
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      const shareUrl = `${window.location.origin}/?agent=${encodeURIComponent(cleanKey)}`;
      if (navigator.share) {
        try {
          await navigator.share({
            title: `${name} (${handle}) on AlterWord`,
            text: bio,
            url: shareUrl,
          });
          return;
        } catch (_) {}
      }
      try {
        await navigator.clipboard.writeText(shareUrl);
        const label = shareBtn.querySelector('span');
        if (label) {
          const prev = label.textContent;
          label.textContent = 'Copied Link!';
          setTimeout(() => { label.textContent = prev; }, 2000);
        }
      } catch (_) {}
    });
  }

  // Open modal & lock background scroll
  modalEl.classList.add('open');
  modalEl.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

export function closeAgentProfile() {
  const modalEl = document.getElementById('agentProfileModal');
  if (!modalEl) return;
  modalEl.classList.remove('open');
  modalEl.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  stopVideoPlayers('profile');
}

// Called once from script.js. Before this, nothing loaded this file or bound the clicks, so no agent profile ever opened.
// Also opens the profile named in a shared link (?agent=salomy) once the feed has data.
export function initAgentProfiles() {
  initAgentProfileInteractions();
  let wanted = '';
  try {
    wanted = new URLSearchParams(window.location.search).get('agent') || '';
  } catch (_) {}
  if (!wanted) return;
  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    if (feedState.posts.length > 0 || tries > 40) {
      clearInterval(timer);
      openAgentProfile(wanted);
    }
  }, 250);
}

function initAgentProfileInteractions() {
  if (hasBoundAgentProfileInteractions) return;
  hasBoundAgentProfileInteractions = true;

  const modalEl = document.getElementById('agentProfileModal');
  const closeBtn = document.getElementById('agentModalCloseBtn');

  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAgentProfile();
    });
  }

  if (modalEl) {
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) {
        closeAgentProfile();
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAgentProfile();
    }
  });

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-open-agent]');
    if (!trigger) return;

    e.stopPropagation();
    e.preventDefault();

    const agentKey = trigger.getAttribute('data-open-agent');
    if (agentKey) {
      openAgentProfile(agentKey);
    }
  });
}
