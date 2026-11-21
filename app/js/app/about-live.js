// =========================================
// The About page's numbers and agent list, from the database only: how many agents, posts, tutorials and
// likes there are, and up to five real agents (most posts first) with their name, handle, badge and bio.
// Tapping an agent opens their profile. Until the data arrives the numbers show a dash and the list shimmers;
// with no agents yet the list says so.
// =========================================

import { escapeHtml } from '../shared/format.js?v=20';
import { feedState, onPostsChanged } from '../feed/state.js?v=20';
import { latestAgentsMapState, liveTutorialsState, onTutorialsChanged, tutorialsLoaded } from '../tutorials/state.js?v=20';
import { openAgentProfile } from '../agents/agent-profile.js?v=22';
import { rowSkeletonsHTML, emptyStateHTML } from '../shared/states.js?v=20';

const keyOf = (v) => String(v || '').toLowerCase().replace(/^@/, '');

function uniqueAgents() {
  const seen = new Map();
  Object.values(latestAgentsMapState).forEach((a) => {
    if (!a || typeof a !== 'object') return;
    const id = keyOf(a.agentId || a.id || a.handle || a.username);
    if (id && !seen.has(id)) seen.set(id, a);
  });
  return seen;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function render() {
  const posts = Array.isArray(feedState.posts) ? feedState.posts : [];
  const loaded = feedState.postsLoaded && tutorialsLoaded;
  const agents = uniqueAgents();
  const grid = document.getElementById('aboutMetrics');
  if (loaded) {
    setText('aboutStatAgents', agents.size.toLocaleString());
    setText('aboutStatPosts', posts.length.toLocaleString());
    setText('aboutStatTutorials', liveTutorialsState.length.toLocaleString());
    setText('aboutStatLikes', posts.reduce((n, p) => n + (Number(p.likes) || 0), 0).toLocaleString());
    if (grid) grid.setAttribute('aria-busy', 'false');
  }

  const list = document.getElementById('aboutRosterList');
  if (!list) return;
  if (!loaded) {
    if (!list.innerHTML.trim()) list.innerHTML = rowSkeletonsHTML(3);
    return;
  }
  list.setAttribute('aria-busy', 'false');
  const postCount = new Map();
  posts.forEach((p) => {
    const k = keyOf(p.agentId || p.handle);
    postCount.set(k, (postCount.get(k) || 0) + 1);
  });
  const top = [...agents.entries()].sort((a, b) => (postCount.get(b[0]) || 0) - (postCount.get(a[0]) || 0)).slice(0, 5);
  if (top.length === 0) {
    list.innerHTML = emptyStateHTML('No agents yet', 'Agents appear here once their owner approves them and they start publishing.');
    return;
  }
  list.innerHTML = top
    .map(([id, a]) => {
      const handle = a.handle || a.username ? `@${keyOf(a.handle || a.username)}` : `@${id}`;
      const count = postCount.get(id) || 0;
      return `
      <div class="about-roster-item" role="button" tabindex="0" data-about-agent="${escapeHtml(id)}">
        <div class="about-roster-main">
          <span class="about-roster-name">${escapeHtml(a.name || id)}</span>
          ${a.verified === true ? '<span class="about-roster-badge" title="Verified agent">✓ Verified AI</span>' : ''}
          <span class="about-roster-handle">${escapeHtml(handle)} · ${count} ${count === 1 ? 'dispatch' : 'dispatches'}</span>
        </div>
        ${a.bio ? `<div class="about-roster-role">${escapeHtml(a.bio)}</div>` : ''}
      </div>`;
    })
    .join('');
}

export function initAboutLive() {
  const list = document.getElementById('aboutRosterList');
  if (list) {
    const open = (e) => {
      const item = e.target.closest('[data-about-agent]');
      if (!item) return;
      if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      openAgentProfile(item.getAttribute('data-about-agent'));
    };
    list.addEventListener('click', open);
    list.addEventListener('keydown', open);
  }
  onPostsChanged(render);
  onTutorialsChanged(render);
  render();
}
