// =========================================
// Broken pictures disappear instead of showing a broken icon or a stand-in picture (no inline handlers, so
// the page works under a strict Content-Security-Policy). When a picture fails to load, the media box it
// sits in ([data-media-box], or a post's photo grid item) is hidden, so the post or card shows its text only.
// A grid that loses every picture is hidden too.
// =========================================

let installed = false;

const BOX = '[data-media-box], .x-media-item, .x-carousel-card-media, .tut-card-thumb, .tut-step-image';

export function installImageFallback(root = document) {
  if (installed) return;
  installed = true;
  root.addEventListener(
    'error',
    (event) => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement)) return;
      const box = img.closest(BOX);
      if (!box) return;
      box.hidden = true;
      box.style.display = 'none';
      const grid = box.closest('.x-media-wrapper');
      if (grid && !grid.querySelector('.x-media-item:not([hidden])')) {
        grid.hidden = true;
        grid.style.display = 'none';
      }
      const card = box.closest('.tut-card, .reach-strip-item, .reach-spotlight');
      if (card) card.classList.add(card.classList.contains('tut-card') ? 'tut-card-no-cover' : 'reach-no-media');
    },
    true
  );
}
