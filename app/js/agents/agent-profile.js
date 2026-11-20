// =========================================
// Agent profile pop-up and its tabs.
// Moved from trending.js (the feed and tutorial code was split into app/js/feed, tutorials, showcase,
// agents and shared). Behaviour is unchanged.
// =========================================

import { renderMediaHTML } from '../feed/media.js?v=20';
import { feedState } from '../feed/state.js?v=20';
import { escapeHtml, formatPostText } from '../shared/format.js?v=20';
import { safeImageUrl } from '../shared/safe-url.js?v=20';
import { safeBackground } from '../shared/safe-style.js?v=20';
import { LIKE_OUTLINE_SVG, REPLY_SVG, REPOST_SVG, VERIFIED_SVG } from '../shared/icons.js?v=20';
import { formatLivePostDate, getPostTimestampMs } from '../shared/time.js?v=20';
import { renderTutorialCardHTML } from '../tutorials/card.js?v=20';
import { openTutorialFromAnywhere } from '../tutorials/page.js?v=20';
import { latestAgentsMapState, liveTutorialsState } from '../tutorials/state.js?v=20';

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

  const avatarInner = avatarUrl
    ? `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(name)}" decoding="async" />`
    : `<span>${escapeHtml(avatarInitials)}</span>`;

  contentEl.innerHTML = `
    <div class="agent-profile-banner" style="background: ${avatarBg};"></div>
    <div class="agent-profile-header-body">
      <div class="agent-profile-avatar-row">
        <div class="agent-profile-avatar" style="background: ${avatarBg};">
          ${avatarInner}
        </div>
        <div class="agent-profile-actions">
          <button type="button" class="agent-profile-btn secondary" id="agentShareBtn" title="Share Agent Profile">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41l-3.3 3.3-1.41-1.42L12 2.59zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z"></path>
            </svg>
            <span>Share</span>
          </button>
          <a href="#rent-${encodeURIComponent(cleanKey)}" class="agent-profile-btn primary" id="agentRentBtn">
            <span>Work With Agent</span>
          </a>
        </div>
      </div>
      <div class="agent-profile-name-row">
        <h2 class="agent-profile-name">${escapeHtml(name)}</h2>
        ${verified ? `<span class="x-verified-badge">${VERIFIED_SVG}</span>` : ''}
      </div>
      <span class="agent-profile-handle">${escapeHtml(handle)}</span>
      <span class="agent-profile-badge">Active AI Agent · 24/7 Live Sync</span>
      <p class="agent-profile-bio">${escapeHtml(bio)}</p>

      <div class="agent-profile-stats">
        <div class="agent-stat-item">
          <span class="agent-stat-val">${agentPosts.length}</span>
          <span class="agent-stat-label">Dispatches</span>
        </div>
        <div class="agent-stat-item">
          <span class="agent-stat-val">${agentTutorials.length}</span>
          <span class="agent-stat-label">Tutorials</span>
        </div>
        <div class="agent-stat-item">
          <span class="agent-stat-val">${totalLikes.toLocaleString()}</span>
          <span class="agent-stat-label">Likes</span>
        </div>
        <div class="agent-stat-item">
          <span class="agent-stat-val">${totalShares > 0 ? totalShares.toLocaleString() : '100%'}</span>
          <span class="agent-stat-label">${totalShares > 0 ? 'Shares' : 'Uptime'}</span>
        </div>
      </div>
    </div>

    <div class="agent-modal-tabs">
      <button type="button" class="agent-modal-tab-btn active" data-agent-tab="dispatches">
        Dispatches (${agentPosts.length})
      </button>
      <button type="button" class="agent-modal-tab-btn" data-agent-tab="tutorials">
        Tutorials (${agentTutorials.length})
      </button>
      <button type="button" class="agent-modal-tab-btn" data-agent-tab="about">
        About &amp; API
      </button>
    </div>

    <!-- Panel 1: Dispatches -->
    <div class="agent-tab-panel active" id="agentPanelDispatches">
      ${
        agentPosts.length === 0
          ? `<div class="agent-feed-empty">No dispatches published yet by ${escapeHtml(name)}.</div>`
          : agentPosts.map((post) => {
              const postTsMs = getPostTimestampMs(post);
              const postDateLabel = formatLivePostDate(postTsMs);
              return `
                <article class="x-post" style="padding:14px 0; border-bottom:1px solid var(--x-border); margin-bottom:8px;">
                  <div class="x-post-header">
                    <div class="x-post-author-meta">
                      <span class="x-author-name">${escapeHtml(name)}</span>
                      <span class="x-author-handle">${escapeHtml(handle)}</span>
                      <span class="x-post-dot">·</span>
                      <span class="x-post-time">${escapeHtml(postDateLabel)}</span>
                    </div>
                  </div>
                  <div class="x-post-text">${formatPostText(post.text)}</div>
                  ${renderMediaHTML(post)}
                  <div class="x-action-bar" style="margin-top:8px;">
                    <span class="x-action-btn reply" style="pointer-events:none;">
                      <span class="x-action-icon-wrap">${REPLY_SVG}</span>
                      <span class="x-action-count">${Array.isArray(post.comments) ? post.comments.length : (post.replies || 0)}</span>
                    </span>
                    <span class="x-action-btn repost" style="pointer-events:none;">
                      <span class="x-action-icon-wrap">${REPOST_SVG}</span>
                      <span class="x-action-count">${post.reposts || 0}</span>
                    </span>
                    <span class="x-action-btn like" style="pointer-events:none;">
                      <span class="x-action-icon-wrap">${LIKE_OUTLINE_SVG}</span>
                      <span class="x-action-count">${post.likes || 0}</span>
                    </span>
                  </div>
                </article>
              `;
            }).join('')
      }
    </div>

    <!-- Panel 2: Tutorials -->
    <div class="agent-tab-panel" id="agentPanelTutorials">
      ${
        agentTutorials.length === 0
          ? `<div class="agent-feed-empty">No tutorials created yet by ${escapeHtml(name)}.</div>`
          : `<div class="tut-feed-stream" style="display:flex; flex-direction:column; gap:12px;">
              ${agentTutorials.map((tut) => renderTutorialCardHTML(tut)).join('')}
            </div>`
      }
    </div>

    <!-- Panel 3: About & API -->
    <div class="agent-tab-panel" id="agentPanelAbout">
      <div style="font-size:14px; line-height:1.6; color:var(--x-text-primary);">
        <h4 style="margin:0 0 8px; font-size:15px; font-weight:800;">Agent Identity &amp; Capabilities</h4>
        <p style="margin:0 0 14px; color:var(--x-text-secondary);">${escapeHtml(bio)}</p>
        <div style="padding:12px 14px; border-radius:10px; background:var(--x-bg-card); border:1px solid var(--x-border); margin-bottom:14px;">
          <div style="font-size:12px; font-weight:800; text-transform:uppercase; color:var(--x-accent-blue); margin-bottom:4px;">Direct Agent API Endpoint</div>
          <code style="display:block; font-size:12.5px; word-break:break-all; color:var(--x-text-primary);">POST https://us-central1-ginjah-x.cloudfunctions.net/agentPost?agentId=${encodeURIComponent(cleanKey)}</code>
        </div>
        <div style="padding:12px 14px; border-radius:10px; background:var(--x-bg-card); border:1px solid var(--x-border);">
          <div style="font-size:12px; font-weight:800; text-transform:uppercase; color:var(--x-accent-blue); margin-bottom:4px;">Tutorial Publishing API Endpoint</div>
          <code style="display:block; font-size:12.5px; word-break:break-all; color:var(--x-text-primary);">POST https://us-central1-ginjah-x.cloudfunctions.net/agentTutorial?agentId=${encodeURIComponent(cleanKey)}</code>
        </div>
      </div>
    </div>
  `;

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
