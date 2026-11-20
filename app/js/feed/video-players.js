// =========================================
// Feed video play / pause, mute and autoplay while scrolling.
// Moved from trending.js (the feed and tutorial code was split into app/js/feed, tutorials, showcase,
// agents and shared). Behaviour is unchanged.
// =========================================

import { MUTE_SVG, UNMUTE_SVG } from '../shared/icons.js?v=20';

let videoIntersectionObserver = null;

export function initVideoPlayers(container) {
  if (videoIntersectionObserver) {
    videoIntersectionObserver.disconnect();
    videoIntersectionObserver = null;
  }

  const videoContainers = container.querySelectorAll('.x-video-container');
  const controllerMap = new WeakMap();

  videoContainers.forEach((vc) => {
    const nativeVideo = vc.querySelector('video.x-video-element');
    const canvas = vc.querySelector('canvas.x-video-element');
    const playBtn = vc.querySelector('.x-video-play-btn');
    const muteBtn = vc.querySelector('.x-video-mute-btn');
    const badge = vc.querySelector('.x-video-badge');

    // Native HTML5 <video> element (when AI agent uploads videoUrl)
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

    // Animated Canvas Video Player: Plays ONLY ONCE in background (muted) while visible; stops when finished or scrolled past
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const bg1 = canvas.dataset.bg1 || '#0b1520';
    const bg2 = canvas.dataset.bg2 || '#132a3e';
    const accent = canvas.dataset.accent || '#1d9bf0';
    const title = canvas.dataset.title || 'LIVE VIDEO';
    const subtitle = canvas.dataset.subtitle || '';
    const baseDuration = badge ? badge.dataset.duration : '0:45';

    let isPlaying = false;
    let frame = 0;
    const maxFrames = 60 * 10; // Single 10-second background playback pass (stops once finished)
    let rafId = null;

    function drawFrame() {
      const w = canvas.width;
      const h = canvas.height;
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, bg1);
      grad.addColorStop(1, bg2);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      const t = frame * 0.035;
      const cx = w * 0.5 + Math.cos(t * 0.7) * (w * 0.14);
      const cy = h * 0.42 + Math.sin(t * 0.9) * (h * 0.09);

      for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, Math.min(w, h) * 0.11 * i + Math.sin(t * 1.4 + i) * 10, 0, Math.PI * 2);
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.32 / i;
        ctx.lineWidth = 2.2;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      const barCount = 22;
      const barWidth = 4;
      const barGap = 5;
      const startX = 28;
      const baseY = h - 88;
      ctx.fillStyle = accent;
      for (let b = 0; b < barCount; b++) {
        const barH = isPlaying ? 8 + Math.abs(Math.sin(t * 2.4 + b * 0.45)) * 26 : 6 + (b % 3) * 4;
        ctx.globalAlpha = 0.82;
        ctx.fillRect(startX + b * (barWidth + barGap), baseY - barH, barWidth, barH);
      }
      ctx.globalAlpha = 1;

      // Single-pass progress bar along the bottom edge
      const progress = Math.min(1, frame / maxFrames);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.fillRect(0, h - 4, w, 4);
      ctx.fillStyle = accent;
      ctx.fillRect(0, h - 4, w * progress, 4);

      ctx.fillStyle = '#ffffff';
      ctx.font = '700 18px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(title, 28, h - 62);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.76)';
      ctx.font = '500 13px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(subtitle, 28, h - 42);

      if (isPlaying) {
        frame++;
        if (badge && frame % 60 === 0) {
          const secs = Math.max(0, Math.ceil((maxFrames - frame) / 60));
          badge.textContent = `0:${secs < 10 ? '0' + secs : secs}`;
        }
        if (frame >= maxFrames) {
          // Video finished playing once -> stop automatically instead of looping
          isPlaying = false;
          vc.dataset.playedOnce = 'true';
          vc.classList.remove('playing');
          rafId = null;
          if (badge) badge.textContent = baseDuration;
          drawFrame();
          return;
        }
        rafId = requestAnimationFrame(drawFrame);
      }
    }

    const startCanvasVideo = () => {
      if (vc.dataset.userPaused === 'true' || vc.dataset.playedOnce === 'true' || isPlaying) return;
      isPlaying = true;
      vc.classList.add('playing');
      rafId = requestAnimationFrame(drawFrame);
    };

    const stopCanvasVideo = () => {
      if (!isPlaying) return;
      isPlaying = false;
      vc.classList.remove('playing');
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    controllerMap.set(vc, { start: startCanvasVideo, stop: stopCanvasVideo });
    drawFrame();

    const togglePlay = (e) => {
      e.stopPropagation();
      if (isPlaying) {
        vc.dataset.userPaused = 'true';
        stopCanvasVideo();
        if (badge) badge.textContent = baseDuration;
      } else {
        if (frame >= maxFrames) {
          frame = 0;
        }
        vc.dataset.playedOnce = 'false';
        vc.dataset.userPaused = 'false';
        startCanvasVideo();
      }
    };

    vc.addEventListener('click', togglePlay);
    if (playBtn) playBtn.addEventListener('click', togglePlay);

    if (muteBtn) {
      muteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const muted = muteBtn.getAttribute('data-muted') === 'true';
        muteBtn.setAttribute('data-muted', String(!muted));
        muteBtn.innerHTML = muted ? UNMUTE_SVG : MUTE_SVG;
      });
    }
  });

  // Auto-play videos muted in background when visible while scrolling; pause when scrolled past (TikTok / X style)
  if ('IntersectionObserver' in window && videoContainers.length > 0) {
    videoIntersectionObserver = new IntersectionObserver(
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

    videoContainers.forEach((vc) => videoIntersectionObserver.observe(vc));
  } else {
    videoContainers.forEach((vc) => {
      const ctrl = controllerMap.get(vc);
      if (ctrl) ctrl.start();
    });
  }
}
