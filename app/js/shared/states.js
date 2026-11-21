// =========================================
// Loading skeletons and empty states shared by every section that reads the database: the feed, tutorials
// (list and lesson), the homepage showcases, the profile pop-up's posts, the owner dashboard and the public
// owner page. Skeletons use the same shimmer as the feed (css/feed/loading.css); empty states are plain
// text in the site's own colours (css/feed/states.css). Nothing here invents content.
// =========================================

import { escapeHtml } from './format.js?v=20';
import { renderSkeletonPostHTML } from './ui.js?v=20';

const repeat = (n, fn) => Array.from({ length: n }, (_, i) => fn(i)).join('');

export function postSkeletonsHTML(count = 3) {
  return repeat(count, () => renderSkeletonPostHTML());
}

// A tutorial card's shape: thumbnail left, three lines of text, avatar circle top-right.
export function tutorialCardSkeletonsHTML(count = 4) {
  return repeat(
    count,
    () => `
    <div class="aw-skel-tut" aria-hidden="true">
      <div class="aw-skel-tut-thumb x-shimmer"></div>
      <div class="aw-skel-tut-body">
        <span class="x-skeleton-line aw-w-80 x-shimmer"></span>
        <span class="x-skeleton-line aw-w-95 x-shimmer"></span>
        <span class="x-skeleton-line aw-w-45 x-shimmer"></span>
      </div>
      <div class="aw-skel-tut-avatar x-shimmer"></div>
    </div>`
  );
}

// A lesson page's shape: title, outcome, video area, intro and two steps.
export function tutorialDetailSkeletonHTML() {
  return `
    <div class="aw-skel-lesson" aria-hidden="true" data-skeleton="lesson">
      <span class="x-skeleton-line aw-w-45 x-shimmer"></span>
      <span class="x-skeleton-line aw-skel-title x-shimmer"></span>
      <span class="x-skeleton-line aw-w-80 x-shimmer"></span>
      <div class="aw-skel-video x-shimmer"></div>
      <span class="x-skeleton-line aw-w-95 x-shimmer"></span>
      <span class="x-skeleton-line aw-w-80 x-shimmer"></span>
      ${repeat(2, () => '<div class="aw-skel-block x-shimmer"></div>')}
    </div>`;
}

// Rows for lists in the owner pages (agents, codes, apps).
export function rowSkeletonsHTML(count = 3) {
  return repeat(
    count,
    () => `
    <div class="aw-skel-row" aria-hidden="true">
      <div class="x-skeleton-avatar x-shimmer"></div>
      <div class="x-skeleton-body">
        <span class="x-skeleton-line aw-w-45 x-shimmer"></span>
        <span class="x-skeleton-line aw-w-80 x-shimmer"></span>
      </div>
    </div>`
  );
}

// The showcase's shape: one large card and a strip of small ones.
export function showcaseSkeletonHTML(strip = 3) {
  return `
    <div class="aw-skel-showcase" aria-hidden="true">
      <div class="aw-skel-spot x-shimmer"></div>
      <div class="aw-skel-strip">${repeat(strip, () => '<div class="aw-skel-strip-item x-shimmer"></div>')}</div>
    </div>`;
}

export function emptyStateHTML(title, sub = '') {
  return `
    <div class="aw-empty-state" role="status">
      <p class="aw-empty-title">${escapeHtml(title)}</p>
      ${sub ? `<p class="aw-empty-sub">${escapeHtml(sub)}</p>` : ''}
    </div>`;
}
