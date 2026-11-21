// =========================================
// Photo grids, video and carousel markup for posts, and the carousel arrows and dots.
// Picture links go through safe-url; video links through shared/video-embed.js. Nothing is ever drawn in
// place of missing media: a post with no picture or playable video shows only its text.
// =========================================

import { escapeHtml } from '../shared/format.js?v=20';
import { safeImageUrl } from '../shared/safe-url.js?v=20';
import { parseVideoUrl, embedIframeHTML, postVideoLink } from '../shared/video-embed.js?v=20';
import { MUTE_SVG, PLAY_SVG } from '../shared/icons.js?v=20';

// The layout to draw. A post that says 'none' but carries pictures or a playable video still shows them.
function pickMediaType(post, images) {
  const t = String(post.mediaType || 'none');
  if (/^grid-[1-4]$/.test(t)) return images ? `grid-${Math.min(Number(t.slice(5)), images.length)}` : 'none';
  if (t === 'carousel' || t === 'video-horizontal' || t === 'video-vertical') return t;
  if (parseVideoUrl(postVideoLink(post))) return 'video-horizontal';
  if (images) return `grid-${Math.min(4, images.length)}`;
  return 'none';
}

export function renderMediaHTML(post) {
  // Only https (or data:image) pictures are drawn; anything else is dropped before it reaches the page.
  const safeImages = Array.isArray(post.images) ? post.images.map(safeImageUrl).filter(Boolean) : [];
  const images = safeImages.length > 0 ? safeImages.map(escapeHtml) : null;
  const mediaType = pickMediaType(post, images);

  if (mediaType === 'grid-1' && images) {
    return `
      <div class="x-media-wrapper x-media-grid-1">
        <div class="x-media-item">
          <img src="${images[0]}" alt="Post attachment" loading="lazy" />
        </div>
      </div>
    `;
  }

  if (mediaType === 'grid-2' && images) {
    return `
      <div class="x-media-wrapper x-media-grid-2">
        ${images.slice(0, 2).map((src, idx) => `
          <div class="x-media-item">
            <img src="${src}" alt="Post attachment ${idx + 1}" loading="lazy" />
          </div>
        `).join('')}
      </div>
    `;
  }

  if (mediaType === 'grid-3' && images) {
    return `
      <div class="x-media-wrapper x-media-grid-3">
        ${images.slice(0, 3).map((src, idx) => `
          <div class="x-media-item">
            <img src="${src}" alt="Post attachment ${idx + 1}" loading="lazy" />
          </div>
        `).join('')}
      </div>
    `;
  }

  if (mediaType === 'grid-4' && images) {
    return `
      <div class="x-media-wrapper x-media-grid-4">
        ${images.slice(0, 4).map((src, idx) => `
          <div class="x-media-item">
            <img src="${src}" alt="Post attachment ${idx + 1}" loading="lazy" />
          </div>
        `).join('')}
      </div>
    `;
  }

  if (mediaType === 'video-horizontal' || mediaType === 'video-vertical') {
    // Only a link AlterWords can play gets a box (shared/video-embed.js); anything else shows no video box.
    const video = parseVideoUrl(postVideoLink(post));
    if (!video) return '';
    const isVertical = mediaType === 'video-vertical';
    const shape = isVertical ? 'x-video-vertical' : 'x-video-horizontal';
    const v = post.videoMeta || {};

    if (video.provider !== 'file') {
      // YouTube, TikTok, Instagram and the other allowlisted players: their own controls, in a sandboxed frame.
      return `
        <div class="x-video-container ${shape} x-video-embed-box" data-video-post="${escapeHtml(post.id)}" data-video-provider="${escapeHtml(video.provider)}">
          ${embedIframeHTML(video, 'x-video-element x-video-embed', v.title || post.author || 'Video')}
        </div>
      `;
    }

    const duration = v.duration ? escapeHtml(v.duration) : '';
    return `
      <div class="x-video-container ${shape}" data-video-post="${escapeHtml(post.id)}" data-native-video="true">
        <video class="x-video-element" src="${escapeHtml(video.src)}" playsinline muted preload="metadata"></video>
        <div class="x-video-overlay">
          <button class="x-video-play-btn" type="button" aria-label="Play or pause video">
            ${PLAY_SVG}
          </button>
          <div class="x-video-bottom-bar">
            <span class="x-video-badge" data-duration="${duration}"${duration ? '' : ' hidden'}>${duration}</span>
            <button class="x-video-mute-btn" type="button" aria-label="Toggle mute" data-muted="true">
              ${MUTE_SVG}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // A slide is drawn only when it has a picture or a title; a slide's picture box only when it has a picture.
  const carouselItems = (Array.isArray(post.carouselItems) ? post.carouselItems : [])
    .filter((it) => it && (safeImageUrl(it.img) || it.title));

  if (mediaType === 'carousel' && carouselItems.length > 0) {
    return `
      <div class="x-carousel-outer" data-carousel="${escapeHtml(post.id)}">
        <button class="x-carousel-nav-btn prev" type="button" aria-label="Previous slide">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <div class="x-carousel-track">
          ${carouselItems.map((item, idx) => `
            <div class="x-carousel-card">
              ${safeImageUrl(item.img) ? `<div class="x-carousel-card-media">
                <img src="${escapeHtml(safeImageUrl(item.img))}" alt="${escapeHtml(item.title || `Slide ${idx + 1}`)}" loading="lazy" />
                <span class="x-carousel-slide-count">${escapeHtml(item.slide || `${idx + 1} / ${carouselItems.length}`)}</span>
              </div>` : ''}
              <div class="x-carousel-card-meta">
                ${item.domain ? `<span class="x-carousel-card-domain">${escapeHtml(item.domain)}</span>` : ''}
                <span class="x-carousel-card-title">${escapeHtml(item.title || '')}</span>
              </div>
            </div>
          `).join('')}
        </div>
        <button class="x-carousel-nav-btn next" type="button" aria-label="Next slide">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
        <div class="x-carousel-dots">
          ${carouselItems.map((_, idx) => `
            <span class="x-carousel-dot ${idx === 0 ? 'active' : ''}"></span>
          `).join('')}
        </div>
      </div>
    `;
  }

  return '';
}

// Carousel arrows and dots inside posts. Called by renderStreamPosts (feed/render.js).
export function bindCarousels(streamEl) {
  // Left-to-Right Horizontal Carousel Navigation & Dots
  streamEl.querySelectorAll('.x-carousel-outer').forEach((carousel) => {
    const track = carousel.querySelector('.x-carousel-track');
    const prevBtn = carousel.querySelector('.x-carousel-nav-btn.prev');
    const nextBtn = carousel.querySelector('.x-carousel-nav-btn.next');
    const dots = carousel.querySelectorAll('.x-carousel-dot');
    if (!track) return;

    const scrollByCard = (dir) => {
      const card = track.querySelector('.x-carousel-card');
      const step = card ? card.offsetWidth + 10 : 300;
      track.scrollBy({ left: dir * step, behavior: 'smooth' });
    };

    if (prevBtn) {
      prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        scrollByCard(-1);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        scrollByCard(1);
      });
    }

    track.addEventListener(
      'scroll',
      () => {
        const card = track.querySelector('.x-carousel-card');
        if (!card || dots.length === 0) return;
        const step = card.offsetWidth + 10;
        const idx = Math.min(dots.length - 1, Math.max(0, Math.round(track.scrollLeft / step)));
        dots.forEach((d, i) => d.classList.toggle('active', i === idx));
      },
      { passive: true }
    );
  });
}
