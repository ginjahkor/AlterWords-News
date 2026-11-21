// =========================================
// Lesson video. A YouTube, TikTok, Instagram (or other allowlisted) link plays in the lesson's embed frame
// with a caption bar; a video file (an agent's upload or a direct .mp4/.webm/.mov link) plays in the lesson's
// own player: the same play button, top pill, scrubber, timer and mute control as before, now driving a real
// <video>. A lesson with no playable video gets no video section at all.
// =========================================

import { escapeHtml } from '../shared/format.js?v=20';
import { MUTE_SVG, UNMUTE_SVG, PLAY_SVG } from '../shared/icons.js?v=20';
import { parseVideoUrl, embedIframeHTML } from '../shared/video-embed.js?v=20';

const TAGS = { youtube: 'YOUTUBE', tiktok: 'TIKTOK', instagram: 'INSTAGRAM', vimeo: 'VIMEO', facebook: 'FACEBOOK', dailymotion: 'DAILYMOTION', streamable: 'STREAMABLE' };

export function tutorialVideoOf(tut) {
  return tut ? parseVideoUrl(tut.videoUrl || tut.youtubeUrl || '') : null;
}

export function renderTutorialVideoHTML(tut) {
  const video = tutorialVideoOf(tut);
  if (!video) return '';
  const agentName = tut.agentName || tut.agentId || 'Agent';
  const lessonNum = Number(tut.lessonNumber) || 1;
  if (video.provider !== 'file') {
    return `
      <section class="tut-video-section tut-youtube-section" aria-label="Tutorial video player" data-video-provider="${escapeHtml(video.provider)}">
        <div class="tut-youtube-player-container ${video.vertical ? 'tut-embed-vertical' : ''}">
          ${embedIframeHTML(video, 'tut-youtube-iframe', tut.title || 'Tutorial Video')}
        </div>
        <div class="tut-video-caption-bar">
          <span class="tut-video-tag">${TAGS[video.provider] || 'VIDEO'}</span>
          <span class="tut-video-sub">${escapeHtml(tut.title || 'Lesson Video')} · ${escapeHtml(agentName)}</span>
        </div>
      </section>
    `;
  }
  const duration = tut.videoDuration ? escapeHtml(tut.videoDuration) : '0:00';
  return `
    <section class="tut-video-section" aria-label="Tutorial video player" data-video-provider="file">
      <div class="tut-video-player" data-lane="${escapeHtml(String(tut.lane || 'tech').toLowerCase())}">
        <video class="tut-video-canvas" src="${escapeHtml(video.src)}" playsinline preload="metadata"></video>
        <div class="tut-video-overlay-center">
          <div class="tut-video-play-circle">${PLAY_SVG}</div>
        </div>
        <div class="tut-video-top-pill">
          <span class="tut-video-rec-dot"></span>
          <span>LESSON ${lessonNum} VIDEO · ${escapeHtml(agentName.toUpperCase())}</span>
        </div>
        <div class="tut-video-controls">
          <button type="button" class="tut-video-ctrl-btn play-toggle" aria-label="Play or pause tutorial video">
            <span class="tut-ctrl-label">Play</span>
          </button>
          <div class="tut-video-scrubber" role="slider" tabindex="0" aria-label="Seek tutorial video">
            <div class="tut-video-scrubber-fill" style="width: 0%;"></div>
          </div>
          <span class="tut-video-timer">0:00 / ${duration}</span>
          <button type="button" class="tut-video-ctrl-btn mute-toggle" aria-label="Mute or unmute audio">
            ${UNMUTE_SVG}
          </button>
        </div>
      </div>
    </section>
  `;
}

const formatSec = (s) => {
  const t = Math.max(0, Math.floor(Number(s) || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

// Wires the lesson player's controls to its <video>. Embedded players need nothing: they have their own.
export function initTutorialDetailVideoPlayer(detailContainerEl, tut) {
  const playerEl = detailContainerEl.querySelector('.tut-video-player');
  const video = playerEl && playerEl.querySelector('video.tut-video-canvas');
  if (!video || !tut) return;

  const playToggleBtn = playerEl.querySelector('.tut-video-ctrl-btn.play-toggle');
  const ctrlLabel = playerEl.querySelector('.tut-ctrl-label');
  const muteToggleBtn = playerEl.querySelector('.tut-video-ctrl-btn.mute-toggle');
  const scrubber = playerEl.querySelector('.tut-video-scrubber');
  const scrubberFill = playerEl.querySelector('.tut-video-scrubber-fill');
  const timerEl = playerEl.querySelector('.tut-video-timer');
  const fallbackDuration = tut.videoDuration || '0:00';

  const sync = () => {
    const total = Number.isFinite(video.duration) ? video.duration : 0;
    const pct = total > 0 ? Math.min(100, (video.currentTime / total) * 100) : 0;
    if (scrubberFill) scrubberFill.style.width = `${pct}%`;
    if (timerEl) timerEl.textContent = `${formatSec(video.currentTime)} / ${total > 0 ? formatSec(total) : fallbackDuration}`;
    const playing = !video.paused && !video.ended;
    playerEl.classList.toggle('playing', playing);
    if (ctrlLabel) ctrlLabel.textContent = playing ? 'Pause' : video.ended ? 'Replay' : 'Play';
  };

  const togglePlay = () => {
    if (video.paused || video.ended) {
      if (video.ended) video.currentTime = 0;
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  ['timeupdate', 'play', 'pause', 'ended', 'loadedmetadata'].forEach((ev) => video.addEventListener(ev, sync));
  video.addEventListener('error', () => {
    const section = playerEl.closest('.tut-video-section');
    if (section) section.hidden = true;
  });

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
      video.muted = !video.muted;
      muteToggleBtn.innerHTML = video.muted ? MUTE_SVG : UNMUTE_SVG;
    });
  }
  if (scrubber) {
    scrubber.addEventListener('click', (e) => {
      e.stopPropagation();
      const total = Number.isFinite(video.duration) ? video.duration : 0;
      if (!total) return;
      const rect = scrubber.getBoundingClientRect();
      video.currentTime = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * total;
      sync();
    });
  }
  sync();
}

// Stops the lesson video when the lesson closes.
export function stopTutorialDetailVideo(detailContainerEl) {
  const video = detailContainerEl && detailContainerEl.querySelector('video.tut-video-canvas');
  if (video) video.pause();
}
