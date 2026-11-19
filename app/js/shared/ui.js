// =========================================
// Loading skeletons, image shimmer placeholders and the full-screen image viewer.
// Moved from trending.js (the feed and tutorial code was split into app/js/feed, tutorials, showcase,
// agents and shared). Behaviour is unchanged.
// =========================================

export function renderSkeletonPostHTML() {
  return `
    <div class="x-post-skeleton" aria-hidden="true">
      <div class="x-skeleton-avatar x-shimmer"></div>
      <div class="x-skeleton-body">
        <div class="x-skeleton-header">
          <span class="x-skeleton-line x-skeleton-author x-shimmer"></span>
          <span class="x-skeleton-line x-skeleton-handle x-shimmer"></span>
        </div>
        <div class="x-skeleton-line x-skeleton-text-1 x-shimmer"></div>
        <div class="x-skeleton-line x-skeleton-text-2 x-shimmer"></div>
        <div class="x-skeleton-media x-shimmer"></div>
      </div>
    </div>
  `;
}

export function bindImageSkeletonLoaders(rootEl) {
  if (!rootEl) return;
  rootEl.querySelectorAll('.x-media-item, .x-carousel-card-media, .reach-spotlight-media, .reach-strip-media').forEach((wrap) => {
    const img = wrap.querySelector('img');
    if (!img) return;
    if (img.complete && img.naturalWidth > 0) {
      wrap.classList.add('img-loaded');
    } else {
      wrap.classList.add('x-img-loading');
      const markLoaded = () => {
        wrap.classList.remove('x-img-loading');
        wrap.classList.add('img-loaded');
      };
      img.addEventListener('load', markLoaded, { once: true });
      img.addEventListener('error', markLoaded, { once: true });
    }
  });
}

export function openImageLightbox(src, alt = 'Post image') {
  if (!src) return;
  let lightbox = document.getElementById('xImageLightbox');
  if (!lightbox) {
    lightbox = document.createElement('div');
    lightbox.id = 'xImageLightbox';
    lightbox.className = 'x-image-lightbox';
    lightbox.setAttribute('role', 'dialog');
    lightbox.setAttribute('aria-modal', 'true');
    lightbox.setAttribute('aria-label', 'Image viewer');
    lightbox.innerHTML = `
      <button type="button" class="x-image-lightbox-close" aria-label="Close image viewer">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
      <img class="x-image-lightbox-img" src="" alt="" />
    `;
    document.body.appendChild(lightbox);

    const closeLightbox = () => {
      lightbox.classList.remove('active');
    };

    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox || e.target.closest('.x-image-lightbox-close')) {
        closeLightbox();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && lightbox.classList.contains('active')) {
        closeLightbox();
      }
    });
  }

  const imgEl = lightbox.querySelector('.x-image-lightbox-img');
  if (imgEl) {
    imgEl.src = src;
    imgEl.alt = alt;
  }
  lightbox.classList.add('active');
}
