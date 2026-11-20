// =========================================
// Lesson video player (canvas player, play / pause, progress, chapters).
// Moved from trending.js (the feed and tutorial code was split into app/js/feed, tutorials, showcase,
// agents and shared). Behaviour is unchanged.
// =========================================

import { MUTE_SVG, UNMUTE_SVG } from '../shared/icons.js?v=20';
import { LANE_THEME_MAP, tutorialState } from './state.js?v=20';

export function initTutorialDetailVideoPlayer(detailContainerEl, tut) {
  if (tutorialState.activeVideoRafId) {
    cancelAnimationFrame(tutorialState.activeVideoRafId);
    tutorialState.activeVideoRafId = null;
  }
  const playerEl = detailContainerEl.querySelector('.tut-video-player');
  if (!playerEl || !tut) return;

  const canvas = playerEl.querySelector('.tut-video-canvas');
  const ctx = canvas ? canvas.getContext('2d') : null;
  const playToggleBtn = playerEl.querySelector('.tut-video-ctrl-btn.play-toggle');
  const ctrlLabel = playerEl.querySelector('.tut-ctrl-label');
  const muteToggleBtn = playerEl.querySelector('.tut-video-ctrl-btn.mute-toggle');
  const scrubber = playerEl.querySelector('.tut-video-scrubber');
  const scrubberFill = playerEl.querySelector('.tut-video-scrubber-fill');
  const timerEl = playerEl.querySelector('.tut-video-timer');

  const durationStr = tut.videoDuration || '2:41';
  const parts = String(durationStr).split(':').map(Number);
  const totalSec = parts.length === 2 ? (parts[0] || 0) * 60 + (parts[1] || 0) : 161;
  const laneKey = String(tut.lane || 'ads').toLowerCase();
  const theme = LANE_THEME_MAP[laneKey] || LANE_THEME_MAP.ads;

  let isPlaying = false;
  let isMuted = false;
  let elapsedSec = 0;
  let lastFrameTs = 0;

  const formatSec = (s) => {
    const clamped = Math.max(0, Math.min(totalSec, Math.floor(s)));
    const m = Math.floor(clamped / 60);
    const rem = clamped % 60;
    return `${m}:${rem < 10 ? '0' : ''}${rem}`;
  };

  const steps = Array.isArray(tut.steps) && tut.steps.length > 0 ? tut.steps : [{ number: 1, title: tut.title }];

  const drawFrame = (sec) => {
    if (!ctx || !canvas) return;
    const w = canvas.width;
    const h = canvas.height;
    const progress = totalSec > 0 ? Math.min(1, sec / totalSec) : 0;

    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, theme.bg1);
    grad.addColorStop(1, theme.bg2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Animated subtle waveform / rings
    const pulse = Math.sin(sec * 2.4) * 10;
    ctx.strokeStyle = theme.accent;
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(w * 0.82, h * 0.34, 68 + pulse, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 0.12;
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.arc(w * 0.82, h * 0.34, 42 - pulse * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Determine active step for current video timestamp
    const stepIndex = Math.min(steps.length - 1, Math.floor(progress * steps.length));
    const currentStep = steps[stepIndex] || steps[0];
    const stepNum = currentStep.number || stepIndex + 1;
    const stepTitle = String(currentStep.title || tut.title || '').slice(0, 54);

    // Step indicator pill
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.fillRect(32, h - 132, 165, 26);
    ctx.fillStyle = theme.accent;
    ctx.font = '700 12px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`STEP ${stepNum} OF ${steps.length} · ${theme.label}`, 44, h - 114);

    // Main caption on video frame
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 20px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(stepTitle, 32, h - 78);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.76)';
    ctx.font = '500 13px "Plus Jakarta Sans", sans-serif';
    const subLine = String(currentStep.body || tut.summary || '').slice(0, 76);
    ctx.fillText(subLine + (subLine.length >= 76 ? '...' : ''), 32, h - 52);
  };

  const syncControlsUI = () => {
    const pct = totalSec > 0 ? Math.min(100, (elapsedSec / totalSec) * 100) : 0;
    if (scrubberFill) scrubberFill.style.width = `${pct}%`;
    if (timerEl) timerEl.textContent = `${formatSec(elapsedSec)} / ${durationStr}`;
    playerEl.classList.toggle('playing', isPlaying);
    if (ctrlLabel) ctrlLabel.textContent = isPlaying ? 'Pause' : elapsedSec >= totalSec ? 'Replay' : 'Play';
  };

  const stepLoop = (now) => {
    if (!isPlaying) return;
    if (!lastFrameTs) lastFrameTs = now;
    const dt = (now - lastFrameTs) / 1000;
    lastFrameTs = now;
    elapsedSec += dt;

    if (elapsedSec >= totalSec) {
      elapsedSec = totalSec;
      isPlaying = false;
      drawFrame(elapsedSec);
      syncControlsUI();
      return;
    }

    drawFrame(elapsedSec);
    syncControlsUI();
    tutorialState.activeVideoRafId = requestAnimationFrame(stepLoop);
  };

  const togglePlay = () => {
    if (elapsedSec >= totalSec) {
      elapsedSec = 0;
    }
    isPlaying = !isPlaying;
    if (isPlaying) {
      lastFrameTs = performance.now();
      tutorialState.activeVideoRafId = requestAnimationFrame(stepLoop);
    } else if (tutorialState.activeVideoRafId) {
      cancelAnimationFrame(tutorialState.activeVideoRafId);
      tutorialState.activeVideoRafId = null;
    }
    syncControlsUI();
  };

  drawFrame(0);
  syncControlsUI();

  playerEl.addEventListener('click', (e) => {
    if (e.target.closest('.tut-video-ctrl-btn, .tut-video-scrubber')) return;
    togglePlay();
  });

  if (playToggleBtn) {
    playToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePlay();
    });
  }

  if (muteToggleBtn) {
    muteToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      isMuted = !isMuted;
      muteToggleBtn.innerHTML = isMuted ? MUTE_SVG : UNMUTE_SVG;
    });
  }

  if (scrubber) {
    scrubber.addEventListener('click', (e) => {
      e.stopPropagation();
      const rect = scrubber.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      elapsedSec = ratio * totalSec;
      drawFrame(elapsedSec);
      syncControlsUI();
    });
  }
}
