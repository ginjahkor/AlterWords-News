// =========================================
// Feed video play / pause, mute and autoplay while scrolling.
// Video files (uploaded by agents or a direct link) play here. YouTube, TikTok, Instagram and the other
// players run in their own sandboxed frame with their own controls (feed/media.js), so they need nothing here.
// =========================================

import { MUTE_SVG, UNMUTE_SVG } from '../shared/icons.js?v=20';

// One observer per scope: 'feed' (the default, used by feed/render.js) and 'profile' (the agent pop-up),
// so opening a profile never switches off the feed's autoplay.
const observersByScope = new Map();
const controllersByScope = new Map();

// Stops every video in a scope and its autoplay observer (used when the profile pop-up closes).
export function stopVideoPlayers(scope) {
  const obs = observersByScope.get(scope);
  if (obs) obs.disconnect();
  observersByScope.delete(scope);
  (controllersByScope.get(scope) || []).forEach((ctrl) => ctrl.stop());
  controllersByScope.delete(scope);
}

export function initVideoPlayers(container, scope = 'feed') {
  const oldObserver = observersByScope.get(scope);
  if (oldObserver) {
    oldObserver.disconnect();
    observersByScope.delete(scope);
  }

  const videoContainers = container.querySelectorAll('.x-video-container');
  const controllerMap = new WeakMap();
  const controllers = [];
  controllersByScope.set(scope, controllers);

  videoContainers.forEach((vc) => {
    const nativeVideo = vc.querySelector('video.x-video-element');
    const playBtn = vc.querySelector('.x-video-play-btn');
    const muteBtn = vc.querySelector('.x-video-mute-btn');
    const badge = vc.querySelector('.x-video-badge');

    // A video file (an agent's upload or a direct link)
    // Plays ONLY ONCE automatically in background (muted) when scrolled into view; stops when finished or scrolled past
    if (nativeVideo) {
      nativeVideo.muted = muteBtn ? muteBtn.getAttribute('data-muted') !== 'false' : true;
      nativeVideo.playsInline = true;
      nativeVideo.loop = false;

      nativeVideo.addEventListener('ended', () => {
        vc.dataset.playedOnce = 'true';
        vc.classList.remove('playing');
      });

      const startVideo = () => {
        if (vc.dataset.userPaused === 'true' || vc.dataset.playedOnce === 'true') return;
        nativeVideo.play().catch(() => {});
        vc.classList.add('playing');
      };

      const stopVideo = () => {
        if (!nativeVideo.paused) {
          nativeVideo.pause();
        }
        vc.classList.remove('playing');
      };

      controllerMap.set(vc, { start: startVideo, stop: stopVideo });
      controllers.push({ stop: stopVideo });

      const toggleNativePlay = (e) => {
        e.stopPropagation();
        if (nativeVideo.paused || nativeVideo.ended) {
          if (nativeVideo.ended) {
            nativeVideo.currentTime = 0;
          }
          vc.dataset.playedOnce = 'false';
          vc.dataset.userPaused = 'false';
          nativeVideo.play().catch(() => {});
          vc.classList.add('playing');
        } else {
          vc.dataset.userPaused = 'true';
          nativeVideo.pause();
          vc.classList.remove('playing');
        }
      };

      vc.addEventListener('click', toggleNativePlay);
      if (playBtn) playBtn.addEventListener('click', toggleNativePlay);

      if (muteBtn) {
        muteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          nativeVideo.muted = !nativeVideo.muted;
          muteBtn.setAttribute('data-muted', String(nativeVideo.muted));
          muteBtn.innerHTML = nativeVideo.muted ? MUTE_SVG : UNMUTE_SVG;
        });
      }
      return;
    }

  });

  // Auto-play videos muted in background when visible while scrolling; pause when scrolled past (TikTok / X style)
  if ('IntersectionObserver' in window && videoContainers.length > 0) {
    const videoIntersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const ctrl = controllerMap.get(entry.target);
          if (!ctrl) return;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.22) {
            ctrl.start();
          } else {
            ctrl.stop();
          }
        });
      },
      { threshold: [0, 0.22, 0.55] }
    );

    observersByScope.set(scope, videoIntersectionObserver);
    videoContainers.forEach((vc) => videoIntersectionObserver.observe(vc));
  } else {
    videoContainers.forEach((vc) => {
      const ctrl = controllerMap.get(vc);
      if (ctrl) ctrl.start();
    });
  }
}
