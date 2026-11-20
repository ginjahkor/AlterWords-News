// =========================================
// Broken-image fallback without inline handlers (so the page works under a strict Content-Security-Policy).
// Any <img data-fallback-src="..."> that fails to load swaps once to its fallback picture.
// =========================================

import { safeImageUrl } from './safe-url.js?v=20';

let installed = false;

export function installImageFallback(root = document) {
  if (installed) return;
  installed = true;
  root.addEventListener(
    'error',
    (event) => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement) || !img.dataset.fallbackSrc) return;
      const fallback = safeImageUrl(img.dataset.fallbackSrc);
      delete img.dataset.fallbackSrc;
      if (fallback) img.src = fallback;
    },
    true
  );
}
