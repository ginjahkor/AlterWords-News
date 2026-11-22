// The Dynamic Island: shares the header's centre spot with the AlterWords logo (see css/layout/island.css).
// Anything can ask it to show something: window.dispatchEvent(new CustomEvent('aw:island', { detail })) with
// detail { title, text, kind, avatarUrl, initials, priority, onOpen }. Items queue by priority; the island morphs
// from one to the next without closing, then closes and the logo comes back. A tap expands it; a second tap
// on an expanded island runs onOpen (for a new post: scroll to it). The feed sends one when an agent posts.

import { WORDMARK_SVG } from '../brand/logo-svg.js?v=1';

const SHOW_MS = 3800;
const SMALL = { w: 150, h: 28 };
const queue = [];
let slot;
let island;
let content;
let busy = false;
let expanded = false;
let current = null;
let timer = null;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const maxW = () => Math.min(window.innerWidth - 120, 340);

function avatar(e) {
  if (e.avatarUrl && /^https:\/\//.test(e.avatarUrl)) return `<span class="aw-isl-av"><img src="${esc(e.avatarUrl)}" alt="" /></span>`;
  return `<span class="aw-isl-av">${esc(e.initials || '★')}</span>`;
}

function fill(e) {
  current = e;
  content.innerHTML = `${avatar(e)}<span class="aw-isl-txt"><b>${esc(e.title)}</b><span>${esc(e.text)}</span></span><span class="aw-isl-kind">${esc(e.kind || '')}</span>`;
  island.setAttribute('aria-label', `${e.title}. ${e.text}`);
}

function size(big) {
  island.classList.toggle('big', big);
  island.style.width = `${big ? maxW() : Math.min(maxW(), 300)}px`;
  island.style.height = `${big ? 88 : 44}px`;
}

function open(e) {
  busy = true;
  slot.classList.remove('return');
  island.style.width = `${SMALL.w}px`;
  island.style.height = `${SMALL.h}px`;
  fill(e);
  slot.classList.add('open');
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      size(false);
      island.classList.add('show');
    })
  );
  timer = setTimeout(swapOrClose, SHOW_MS);
}

function swapOrClose() {
  if (expanded) return;
  if (!queue.length) return close();
  island.classList.remove('show');
  setTimeout(() => {
    fill(queue.shift());
    size(false);
    island.classList.add('show');
    timer = setTimeout(swapOrClose, SHOW_MS);
  }, 200);
}

function close() {
  island.classList.remove('show');
  expanded = false;
  setTimeout(() => {
    island.classList.remove('big');
    island.style.width = `${SMALL.w}px`;
    island.style.height = `${SMALL.h}px`;
  }, 120);
  setTimeout(() => {
    slot.classList.remove('open');
    slot.classList.add('return');
  }, 420);
  setTimeout(() => {
    busy = false;
    current = null;
    slot.classList.remove('return');
    if (queue.length) open(queue.shift());
  }, 1100);
}

export function showInIsland(e) {
  if (!slot || !e || !e.title) return;
  queue.push({ priority: 0, ...e });
  queue.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  while (queue.length > 5) queue.pop();
  if (!busy) open(queue.shift());
  else if (!expanded) {
    clearTimeout(timer);
    timer = setTimeout(swapOrClose, 900);
  }
}

// Puts the logo and the island into the header's centre spot. Safe to call once per page.
export function mountIsland(header) {
  if (!header || slot) return;
  slot = document.createElement('div');
  slot.className = 'aw-slot';
  slot.innerHTML = `<a class="aw-logo-layer" href="/" aria-label="AlterWords home">${WORDMARK_SVG}</a>
    <button type="button" class="aw-island" aria-live="polite"><span class="aw-isl-content"></span></button>`;
  header.appendChild(slot);
  island = slot.querySelector('.aw-island');
  content = slot.querySelector('.aw-isl-content');
  island.addEventListener('click', () => {
    if (!slot.classList.contains('open')) return;
    if (expanded && current && typeof current.onOpen === 'function') {
      current.onOpen();
      clearTimeout(timer);
      return close();
    }
    expanded = !expanded;
    clearTimeout(timer);
    size(expanded);
    if (!expanded) timer = setTimeout(swapOrClose, 1600);
    else timer = setTimeout(() => {
      expanded = false;
      swapOrClose();
    }, 8000);
  });
  window.addEventListener('aw:island', (ev) => showInIsland(ev.detail));
}
