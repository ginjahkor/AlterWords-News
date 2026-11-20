// =========================================
// Photo grids, video and carousel markup for posts, and the carousel arrows and dots.
// Moved from trending.js (the feed and tutorial code was split into app/js/feed, tutorials, showcase,
// agents and shared). Behaviour is unchanged. Picture and video links go through safe-url; colours through safe-style.
// =========================================

import { escapeHtml } from '../shared/format.js?v=20';
import { safeImageUrl, safeMediaUrl } from '../shared/safe-url.js?v=20';
import { safeColor } from '../shared/safe-style.js?v=20';
import { MUTE_SVG, PLAY_SVG } from '../shared/icons.js?v=20';

export function renderMediaHTML(post) {
  // Only https (or data:image) pictures are drawn; anything else is dropped before it reaches the page.
  const safeImages = Array.isArray(post.images) ? post.images.map(safeImageUrl).filter(Boolean) : [];
  const images = safeImages.length > 0 ? safeImages.map(escapeHtml) : null;

  if (post.mediaType === 'grid-1' && images) {
    return `
      <div class="x-media-wrapper x-media-grid-1">
        <div class="x-media-item">
          <img src="${images[0]}" alt="Post attachment" loading="lazy" />
        </div>
      </div>
    `;
  }

  if (post.mediaType === 'grid-2' && images) {
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

  if (post.mediaType === 'grid-3' && images) {
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

  if (post.mediaType === 'grid-4' && images) {
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

  if (post.mediaType === 'video-horizontal' || post.mediaType === 'video-vertical') {
    const isVertical = post.mediaType === 'video-vertical';
    const v = post.videoMeta || {
      duration: post.duration || '0:45',
      themeColor: '#1d9bf0',
      bg1: '#0b1520',
      bg2: '#132a3e',
      title: String(post.author || 'LIVE DISPATCH').toUpperCase(),
      subtitle: isVertical ? '9:16 Vertical Mobile Dispatch' : '16:9 Horizontal Broadcast',
    };
    const directVideoUrl = safeMediaUrl(post.videoUrl || (v && v.videoUrl) || '');

    if (directVideoUrl) {
      return `
        <div class="x-video-container ${isVertical ? 'x-video-vertical' : 'x-video-horizontal'}" data-video-post="${escapeHtml(post.id)}" data-native-video="true">
          <video class="x-video-element" src="${escapeHtml(directVideoUrl)}" playsinline muted preload="metadata"></video>
          <div class="x-video-overlay">
            <button class="x-video-play-btn" type="button" aria-label="Play or pause video">
              ${PLAY_SVG}
            </button>
            <div class="x-video-bottom-bar">
              <span class="x-video-badge" data-duration="${escapeHtml(v.duration || 'LIVE')}">${escapeHtml(v.duration || 'LIVE')}</span>
              <button class="x-video-mute-btn" type="button" aria-label="Toggle mute" data-muted="true">
                ${MUTE_SVG}
              </button>
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="x-video-container ${isVertical ? 'x-video-vertical' : 'x-video-horizontal'}" data-video-post="${escapeHtml(post.id)}">
        <canvas class="x-video-element" width="${isVertical ? 360 : 640}" height="${isVertical ? 640 : 360}"
          data-bg1="${safeColor(v.bg1, '#0b1520')}" data-bg2="${safeColor(v.bg2, '#132a3e')}" data-accent="${safeColor(v.themeColor, '#1d9bf0')}"
          data-title="${escapeHtml(v.title || 'LIVE DISPATCH')}" data-subtitle="${escapeHtml(v.subtitle || '')}"></canvas>
        <div class="x-video-overlay">
          <button class="x-video-play-btn" type="button" aria-label="Play or pause video">
            ${PLAY_SVG}
          </button>
          <div class="x-video-bottom-bar">
            <span class="x-video-badge" data-duration="${escapeHtml(v.duration || '0:45')}">${escapeHtml(v.duration || '0:45')}</span>
            <button class="x-video-mute-btn" type="button" aria-label="Toggle mute" data-muted="true">
              ${MUTE_SVG}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  const carouselItems = Array.isArray(post.carouselItems) ? post.carouselItems : [];

  if (post.mediaType === 'carousel' && Array.isArray(carouselItems) && carouselItems.length > 0) {
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
              <div class="x-carousel-card-media">
                <img src="${escapeHtml(safeImageUrl(item.img))}" alt="${escapeHtml(item.title || `Slide ${idx + 1}`)}" loading="lazy" />
                <span class="x-carousel-slide-count">${escapeHtml(item.slide || `${idx + 1} / ${carouselItems.length}`)}</span>
              </div>
              <div class="x-carousel-card-meta">
                <span class="x-carousel-card-domain">${escapeHtml(item.domain || 'alterwords.press')}</span>
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
