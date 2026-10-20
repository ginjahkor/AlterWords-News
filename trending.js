// =========================================
// Trending Page — X (Twitter) Scrollable News Feed
// Strictly isolated to #trendingView inside .content-frame
// =========================================

import { recordPostInteraction } from './firebase.js';

const VERIFIED_SVG = `
  <svg width="16" height="16" viewBox="0 0 22 22" fill="currentColor" aria-label="Verified account">
    <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"></path>
  </svg>
`;

const MORE_SVG = `
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 12c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2zm9 2c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm7 0c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"></path>
  </svg>
`;

const REPLY_SVG = `
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z"></path>
  </svg>
`;

const REPOST_SVG = `
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z"></path>
  </svg>
`;

const LIKE_OUTLINE_SVG = `
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" class="icon-outline">
    <path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"></path>
  </svg>
`;

const LIKE_FILLED_SVG = `
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" class="icon-filled" style="display:none;">
    <path d="M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"></path>
  </svg>
`;

const VIEWS_SVG = `
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10h2L6 21H4zm9.248 0v-7h2v7h-2z"></path>
  </svg>
`;

const BOOKMARK_SVG = `
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5zM6.5 4c-.276 0-.5.22-.5.5v14.56l6-4.29 6 4.29V4.5c0-.28-.224-.5-.5-.5h-11z"></path>
  </svg>
`;

const SHARE_SVG = `
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41l-3.3 3.3-1.41-1.42L12 2.59zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z"></path>
  </svg>
`;

const PLAY_SVG = `
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style="margin-left:2px;">
    <path d="M8 5v14l11-7z"></path>
  </svg>
`;

const MUTE_SVG = `
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"></path>
  </svg>
`;

const UNMUTE_SVG = `
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"></path>
  </svg>
`;

// High-resolution SVG/Data-URI visual artwork generators so photos & videos render offline/instantly with zero broken links
function createSvgDataUri(title, subtitle, c1, c2, accent, width = 800, height = 450) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${c1}"/>
        <stop offset="100%" stop-color="${c2}"/>
      </linearGradient>
      <radialGradient id="r" cx="75%" cy="25%" r="60%">
        <stop offset="0%" stop-color="${accent}" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="${c2}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <rect width="100%" height="100%" fill="url(#r)"/>
    <circle cx="${width * 0.78}" cy="${height * 0.32}" r="${Math.min(width, height) * 0.26}" fill="none" stroke="${accent}" stroke-opacity="0.28" stroke-width="1.5"/>
    <circle cx="${width * 0.78}" cy="${height * 0.32}" r="${Math.min(width, height) * 0.16}" fill="${accent}" fill-opacity="0.14"/>
    <line x1="0" y1="${height * 0.74}" x2="${width}" y2="${height * 0.74}" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
    <text x="36" y="${height - 64}" fill="#ffffff" font-family="Plus Jakarta Sans, sans-serif" font-size="22" font-weight="700" letter-spacing="0.3">${title}</text>
    <text x="36" y="${height - 34}" fill="rgba(255,255,255,0.72)" font-family="Plus Jakarta Sans, sans-serif" font-size="14" font-weight="500">${subtitle}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const FEED_POSTS = [
  {
    id: 'post-1',
    author: 'AlterWords Editorial',
    handle: '@alterwords',
    time: '18m',
    avatarBg: 'linear-gradient(135deg, #1d9bf0, #0f5c8c)',
    avatarInitials: 'AW',
    text: `Inside our global newsroom architecture: how real-time dispatches move from field correspondents to interactive visual stories in under 90 seconds. #AlterWords #Journalism`,
    mediaType: 'video-horizontal',
    videoMeta: {
      duration: '0:48',
      themeColor: '#1d9bf0',
      bg1: '#0b1520',
      bg2: '#132a3e',
      title: 'GLOBAL DISPATCH LIVE STREAM',
      subtitle: '16:9 Horizontal Broadcast • 1080p 60fps',
    },
    replies: 42,
    reposts: 128,
    likes: 864,
    views: '24.8K',
  },
  {
    id: 'post-2',
    author: 'Design & Typography',
    handle: '@editorialcraft',
    time: '46m',
    avatarBg: 'linear-gradient(135deg, #d97706, #78350f)',
    avatarInitials: 'DT',
    text: `Multi-part visual essay: swipe left-to-right through our 4-part breakdown of modern digital broadsheets, off-white reading surfaces, and high-contrast grid systems. #DesignSystems`,
    mediaType: 'carousel',
    carouselItems: [
      {
        slide: '1 / 4',
        domain: 'alterwords.press • Part I',
        title: '01. Warm Alabaster & Editorial Off-White Surfaces',
        img: createSvgDataUri('01. Off-White Reading Surfaces', 'Zero-glare contrast calibration', '#1f1d1a', '#38332c', '#f59e0b', 640, 400),
      },
      {
        slide: '2 / 4',
        domain: 'alterwords.press • Part II',
        title: '02. Hairline 1px Structural Grid Separators',
        img: createSvgDataUri('02. 1px Structural Borderlines', 'Architectural timeline rhythm', '#172026', '#243440', '#38bdf8', 640, 400),
      },
      {
        slide: '3 / 4',
        domain: 'alterwords.press • Part III',
        title: '03. Asymmetric Multi-Photo Story Mosaics',
        img: createSvgDataUri('03. Multi-Photo Mosaics', 'Balanced visual density in feed', '#1e1b2e', '#312c4a', '#a78bfa', 640, 400),
      },
      {
        slide: '4 / 4',
        domain: 'alterwords.press • Part IV',
        title: '04. Motion & Vertical Dispatch Formats',
        img: createSvgDataUri('04. Motion & Vertical Video', 'Native 9:16 & 16:9 storytelling', '#14261f', '#203d32', '#34d399', 640, 400),
      },
    ],
    replies: 19,
    reposts: 94,
    likes: 532,
    views: '15.2K',
  },
  {
    id: 'post-3',
    author: 'Field Notes Mobile',
    handle: '@fieldnotes_live',
    time: '1h',
    avatarBg: 'linear-gradient(135deg, #10b981, #065f46)',
    avatarInitials: 'FN',
    text: `On the ground in Tokyo: vertical 9:16 mobile reel capturing late-night print editions rolling off the rotary presses before dawn. #FieldNotes #Tokyo`,
    mediaType: 'video-vertical',
    videoMeta: {
      duration: '0:32',
      themeColor: '#10b981',
      bg1: '#091915',
      bg2: '#12352b',
      title: 'TOKYO PRESS RUN',
      subtitle: '9:16 Vertical Mobile Dispatch',
    },
    replies: 67,
    reposts: 215,
    likes: 1420,
    views: '51.4K',
  },
  {
    id: 'post-4',
    author: 'Architecture & Spaces',
    handle: '@arch_spaces',
    time: '2h',
    avatarBg: 'linear-gradient(135deg, #6366f1, #312e81)',
    avatarInitials: 'AS',
    text: `Three angles from the Nordic Reading Pavilion in Oslo—natural timber acoustic baffles, north-facing skylights, and quiet study alcoves. #Architecture`,
    mediaType: 'grid-3',
    images: [
      createSvgDataUri('Main Atrium Span', 'Nordic Pavilion • Left Full-Height Frame', '#18181b', '#27272a', '#818cf8', 600, 800),
      createSvgDataUri('Skylight Canopy', 'Upper Right Detail', '#1e293b', '#334155', '#38bdf8', 600, 400),
      createSvgDataUri('Timber Reading Alcove', 'Lower Right Detail', '#292524', '#44403c', '#fbbf24', 600, 400),
    ],
    replies: 31,
    reposts: 147,
    likes: 980,
    views: '33.1K',
  },
  {
    id: 'post-5',
    author: 'Visual Data Lab',
    handle: '@visdatalab',
    time: '3h',
    avatarBg: 'linear-gradient(135deg, #ec4899, #831843)',
    avatarInitials: 'VD',
    text: `Side-by-side comparison: daytime off-white parchment mode versus midnight obsidian mode across our global readership. Which reading environment do you prefer? #UI #DataViz`,
    mediaType: 'grid-2',
    images: [
      createSvgDataUri('Off-White Light Mode', 'Warm Alabaster Three-Layer System', '#2e2b26', '#4a453d', '#f7f5f0', 600, 500),
      createSvgDataUri('Obsidian Dark Mode', 'Deep High-Contrast Night Canvas', '#09090b', '#18181b', '#1d9bf0', 600, 500),
    ],
    replies: 88,
    reposts: 63,
    likes: 615,
    views: '19.7K',
  },
  {
    id: 'post-6',
    author: 'Global Photo Desk',
    handle: '@photodesk',
    time: '5h',
    avatarBg: 'linear-gradient(135deg, #8b5cf6, #4c1d95)',
    avatarInitials: 'GP',
    text: `Four dispatches from four time zones this afternoon—Reykjavik, Lisbon, Nairobi, and Kyoto. #Photojournalism #World`,
    mediaType: 'grid-4',
    images: [
      createSvgDataUri('01. Reykjavik Harbor', '64.1466° N, 21.9426° W', '#0f172a', '#1e293b', '#38bdf8', 600, 400),
      createSvgDataUri('02. Lisbon Tramline', '38.7223° N, 9.1393° W', '#271c19', '#432d27', '#fb923c', 600, 400),
      createSvgDataUri('03. Nairobi Skyline', '1.2921° S, 36.8219° E', '#14241b', '#1f3a2c', '#4ade80', 600, 400),
      createSvgDataUri('04. Kyoto Bamboo Grove', '35.0116° N, 135.7681° E', '#1f1929', '#322742', '#c084fc', 600, 400),
    ],
    replies: 54,
    reposts: 182,
    likes: 1190,
    views: '42.6K',
  },
  {
    id: 'post-7',
    author: 'AlterWords Longform',
    handle: '@alterwords_long',
    time: '6h',
    avatarBg: 'linear-gradient(135deg, #0ea5e9, #0369a1)',
    avatarInitials: 'AL',
    text: `Weekend Essay: Why slow, distraction-free longform essays are thriving in an era of instant feeds—and how thoughtful layout design bridges both worlds. #Longform #Blogs`,
    mediaType: 'grid-1',
    images: [
      createSvgDataUri('The Renaissance of Independent Blogs', 'Feature Essay • 12 min read on AlterWords', '#1c1917', '#292524', '#f59e0b', 900, 506),
    ],
    replies: 29,
    reposts: 112,
    likes: 740,
    views: '21.3K',
  },
];

function formatPostText(text) {
  return text.replace(/(#[a-zA-Z0-9_]+)/g, '<span class="x-hashtag">$1</span>');
}

function renderMediaHTML(post) {
  if (post.mediaType === 'grid-1' && post.images) {
    return `
      <div class="x-media-wrapper x-media-grid-1">
        <div class="x-media-item">
          <img src="${post.images[0]}" alt="Post attachment" loading="lazy" />
        </div>
      </div>
    `;
  }

  if (post.mediaType === 'grid-2' && post.images) {
    return `
      <div class="x-media-wrapper x-media-grid-2">
        ${post.images.map((src, idx) => `
          <div class="x-media-item">
            <img src="${src}" alt="Post attachment ${idx + 1}" loading="lazy" />
          </div>
        `).join('')}
      </div>
    `;
  }

  if (post.mediaType === 'grid-3' && post.images) {
    return `
      <div class="x-media-wrapper x-media-grid-3">
        ${post.images.map((src, idx) => `
          <div class="x-media-item">
            <img src="${src}" alt="Post attachment ${idx + 1}" loading="lazy" />
          </div>
        `).join('')}
      </div>
    `;
  }

  if (post.mediaType === 'grid-4' && post.images) {
    return `
      <div class="x-media-wrapper x-media-grid-4">
        ${post.images.map((src, idx) => `
          <div class="x-media-item">
            <img src="${src}" alt="Post attachment ${idx + 1}" loading="lazy" />
          </div>
        `).join('')}
      </div>
    `;
  }

  if (post.mediaType === 'video-horizontal' || post.mediaType === 'video-vertical') {
    const isVertical = post.mediaType === 'video-vertical';
    const v = post.videoMeta;
    return `
      <div class="x-video-container ${isVertical ? 'x-video-vertical' : 'x-video-horizontal'}" data-video-post="${post.id}">
        <canvas class="x-video-element" width="${isVertical ? 360 : 640}" height="${isVertical ? 640 : 360}"
          data-bg1="${v.bg1}" data-bg2="${v.bg2}" data-accent="${v.themeColor}"
          data-title="${v.title}" data-subtitle="${v.subtitle}"></canvas>
        <div class="x-video-overlay">
          <button class="x-video-play-btn" type="button" aria-label="Play or pause video">
            ${PLAY_SVG}
          </button>
          <div class="x-video-bottom-bar">
            <span class="x-video-badge" data-duration="${v.duration}">${v.duration}</span>
            <button class="x-video-mute-btn" type="button" aria-label="Toggle mute" data-muted="true">
              ${MUTE_SVG}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  if (post.mediaType === 'carousel' && post.carouselItems) {
    return `
      <div class="x-carousel-outer" data-carousel="${post.id}">
        <button class="x-carousel-nav-btn prev" type="button" aria-label="Previous slide">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <div class="x-carousel-track">
          ${post.carouselItems.map((item) => `
            <div class="x-carousel-card">
              <div class="x-carousel-card-media">
                <img src="${item.img}" alt="${item.title}" loading="lazy" />
                <span class="x-carousel-slide-count">${item.slide}</span>
              </div>
              <div class="x-carousel-card-meta">
                <span class="x-carousel-card-domain">${item.domain}</span>
                <span class="x-carousel-card-title">${item.title}</span>
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
          ${post.carouselItems.map((_, idx) => `
            <span class="x-carousel-dot ${idx === 0 ? 'active' : ''}"></span>
          `).join('')}
        </div>
      </div>
    `;
  }

  return '';
}

function initAnimatedVideoCanvases(container) {
  const videoContainers = container.querySelectorAll('.x-video-container');
  videoContainers.forEach((vc) => {
    const canvas = vc.querySelector('canvas.x-video-element');
    const playBtn = vc.querySelector('.x-video-play-btn');
    const muteBtn = vc.querySelector('.x-video-mute-btn');
    const badge = vc.querySelector('.x-video-badge');
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
    let rafId = null;

    function drawFrame() {
      const w = canvas.width;
      const h = canvas.height;
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, bg1);
      grad.addColorStop(1, bg2);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Animated wave/pulse rings
      const t = frame * 0.03;
      const cx = w * 0.5 + Math.cos(t * 0.7) * (w * 0.12);
      const cy = h * 0.42 + Math.sin(t * 0.9) * (h * 0.08);

      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, (Math.min(w, h) * 0.12 * i) + Math.sin(t + i) * 8, 0, Math.PI * 2);
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.28 / i;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Subtle animated equalizer/signal bars
      const barCount = 18;
      const barWidth = 4;
      const barGap = 5;
      const startX = 28;
      const baseY = h - 88;
      ctx.fillStyle = accent;
      for (let b = 0; b < barCount; b++) {
        const barH = isPlaying
          ? 8 + Math.abs(Math.sin(t * 2.2 + b * 0.45)) * 22
          : 6 + (b % 3) * 4;
        ctx.globalAlpha = 0.75;
        ctx.fillRect(startX + b * (barWidth + barGap), baseY - barH, barWidth, barH);
      }
      ctx.globalAlpha = 1;

      // Labels
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 18px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(title, 28, h - 62);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
      ctx.font = '500 13px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(subtitle, 28, h - 42);

      if (isPlaying) {
        frame++;
        if (badge && frame % 60 === 0) {
          const secs = Math.max(1, 32 - Math.floor(frame / 60) % 32);
          badge.textContent = `0:${secs < 10 ? '0' + secs : secs}`;
        }
        rafId = requestAnimationFrame(drawFrame);
      }
    }

    // Initial static poster render
    drawFrame();

    const togglePlay = (e) => {
      e.stopPropagation();
      isPlaying = !isPlaying;
      vc.classList.toggle('playing', isPlaying);
      if (isPlaying) {
        rafId = requestAnimationFrame(drawFrame);
      } else {
        if (rafId) cancelAnimationFrame(rafId);
        if (badge) badge.textContent = baseDuration;
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
}

export function initTrendingFeed(trendingContainer) {
  if (!trendingContainer) return;

  const postsHTML = FEED_POSTS.map((post) => `
    <article class="x-post" data-post-id="${post.id}">
      <div class="x-post-avatar-col">
        <div class="x-avatar" style="background: ${post.avatarBg};">${post.avatarInitials}</div>
      </div>
      <div class="x-post-body-col">
        <div class="x-post-header">
          <div class="x-post-author-meta">
            <span class="x-author-name">${post.author}</span>
            <span class="x-verified-badge">${VERIFIED_SVG}</span>
            <span class="x-author-handle">${post.handle}</span>
            <span class="x-post-dot">·</span>
            <span class="x-post-time">${post.time}</span>
          </div>
          <button class="x-post-more-btn" type="button" aria-label="More options">
            ${MORE_SVG}
          </button>
        </div>
        <div class="x-post-text">${formatPostText(post.text)}</div>
        ${renderMediaHTML(post)}
        <div class="x-action-bar">
          <button class="x-action-btn reply" type="button" aria-label="Reply">
            <span class="x-action-icon-wrap">${REPLY_SVG}</span>
            <span class="x-action-count">${post.replies}</span>
          </button>
          <button class="x-action-btn repost" type="button" aria-label="Repost" data-count="${post.reposts}">
            <span class="x-action-icon-wrap">${REPOST_SVG}</span>
            <span class="x-action-count">${post.reposts}</span>
          </button>
          <button class="x-action-btn like" type="button" aria-label="Like" data-count="${post.likes}">
            <span class="x-action-icon-wrap">
              ${LIKE_OUTLINE_SVG}
              ${LIKE_FILLED_SVG}
            </span>
            <span class="x-action-count">${post.likes}</span>
          </button>
          <button class="x-action-btn views" type="button" aria-label="Views">
            <span class="x-action-icon-wrap">${VIEWS_SVG}</span>
            <span class="x-action-count">${post.views}</span>
          </button>
          <div class="x-action-right-group">
            <button class="x-action-btn bookmark" type="button" aria-label="Bookmark">
              <span class="x-action-icon-wrap">${BOOKMARK_SVG}</span>
            </button>
            <button class="x-action-btn reply" type="button" aria-label="Share">
              <span class="x-action-icon-wrap">${SHARE_SVG}</span>
            </button>
          </div>
        </div>
      </div>
    </article>
  `).join('');

  trendingContainer.innerHTML = `
    <div class="x-feed-column">
      <header class="x-feed-header">
        <button class="x-feed-tab active" type="button" data-tab="foryou">
          <span class="x-feed-tab-label">For you</span>
        </button>
        <button class="x-feed-tab" type="button" data-tab="following">
          <span class="x-feed-tab-label">Following</span>
        </button>
      </header>
      <div class="x-feed-stream">
        ${postsHTML}
      </div>
    </div>
  `;

  // Header Tabs ("For you" / "Following")
  const tabs = trendingContainer.querySelectorAll('.x-feed-tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      trendingContainer.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  // Action Buttons Interactivity (Like, Repost, Bookmark) -> Connected to Firebase
  trendingContainer.querySelectorAll('.x-action-btn.like').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const postEl = btn.closest('.x-post');
      const postId = postEl ? postEl.getAttribute('data-post-id') : '';
      const active = btn.classList.toggle('active');
      const countEl = btn.querySelector('.x-action-count');
      const baseCount = parseInt(btn.getAttribute('data-count') || '0', 10);
      const newCount = active ? baseCount + 1 : baseCount;
      const outlineIcon = btn.querySelector('.icon-outline');
      const filledIcon = btn.querySelector('.icon-filled');
      if (outlineIcon && filledIcon) {
        outlineIcon.style.display = active ? 'none' : 'block';
        filledIcon.style.display = active ? 'block' : 'none';
      }
      if (countEl) {
        countEl.textContent = String(newCount);
      }
      if (postId) {
        recordPostInteraction(postId, 'likes', newCount, active);
      }
    });
  });

  trendingContainer.querySelectorAll('.x-action-btn.repost').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const postEl = btn.closest('.x-post');
      const postId = postEl ? postEl.getAttribute('data-post-id') : '';
      const active = btn.classList.toggle('active');
      const countEl = btn.querySelector('.x-action-count');
      const baseCount = parseInt(btn.getAttribute('data-count') || '0', 10);
      const newCount = active ? baseCount + 1 : baseCount;
      if (countEl) {
        countEl.textContent = String(newCount);
      }
      if (postId) {
        recordPostInteraction(postId, 'reposts', newCount, active);
      }
    });
  });

  trendingContainer.querySelectorAll('.x-action-btn.bookmark').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const postEl = btn.closest('.x-post');
      const postId = postEl ? postEl.getAttribute('data-post-id') : '';
      const active = btn.classList.toggle('active');
      if (postId) {
        recordPostInteraction(postId, 'bookmarked', null, active);
      }
    });
  });

  // Left-to-Right Horizontal Carousel Navigation & Dots
  trendingContainer.querySelectorAll('.x-carousel-outer').forEach((carousel) => {
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

    track.addEventListener('scroll', () => {
      const card = track.querySelector('.x-carousel-card');
      if (!card || dots.length === 0) return;
      const step = card.offsetWidth + 10;
      const idx = Math.min(dots.length - 1, Math.max(0, Math.round(track.scrollLeft / step)));
      dots.forEach((d, i) => d.classList.toggle('active', i === idx));
    }, { passive: true });
  });

  // Initialize Horizontal (16:9) & Vertical (9:16) Video Players
  initAnimatedVideoCanvases(trendingContainer);

  // Scroll Priority Inside Content Area (#trendingView):
  // While on the Trending page, scrolling down scrolls all posts inside #trendingView first.
  // Only once #trendingView finishes scrolling to the bottom does the outer page (advert bar, lower layers, footer) scroll up.
  window.addEventListener('wheel', (e) => {
    // Only active when Trending view is visible
    if (trendingContainer.style.display === 'none') return;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;

    const maxScrollTop = trendingContainer.scrollHeight - trendingContainer.clientHeight;
    if (maxScrollTop <= 0) return;

    const atFeedBottom = trendingContainer.scrollTop >= maxScrollTop - 2;
    const atFeedTop = trendingContainer.scrollTop <= 2;

    if (e.deltaY > 0) {
      // Scrolling down: every post scrolls inside #trendingView first before the outer page moves
      if (!atFeedBottom) {
        if (!trendingContainer.contains(e.target) || window.scrollY > 0) {
          e.preventDefault();
          trendingContainer.scrollTop += e.deltaY;
        }
      }
    } else if (e.deltaY < 0) {
      // Scrolling up: if the outer page was scrolled down to the advert/footer, return outer page to top first
      if (window.scrollY > 2) {
        if (trendingContainer.contains(e.target)) {
          e.preventDefault();
          window.scrollBy(0, e.deltaY);
        }
      } else if (!atFeedTop && !trendingContainer.contains(e.target)) {
        // Outer page is at top: scroll #trendingView back up even if cursor is on the side margins
        e.preventDefault();
        trendingContainer.scrollTop += e.deltaY;
      }
    }
  }, { passive: false });
}

export function applyRemotePostUpdates(trendingContainer, remoteMap) {
  if (!trendingContainer || !remoteMap) return;
  Object.keys(remoteMap).forEach((postId) => {
    const data = remoteMap[postId];
    const postEl = trendingContainer.querySelector(`.x-post[data-post-id="${postId}"]`);
    if (!postEl || !data) return;

    const likeBtn = postEl.querySelector('.x-action-btn.like');
    if (likeBtn && typeof data.likes === 'number' && !likeBtn.classList.contains('active')) {
      likeBtn.setAttribute('data-count', String(data.likes));
      const countEl = likeBtn.querySelector('.x-action-count');
      if (countEl) countEl.textContent = String(data.likes);
    }

    const repostBtn = postEl.querySelector('.x-action-btn.repost');
    if (repostBtn && typeof data.reposts === 'number' && !repostBtn.classList.contains('active')) {
      repostBtn.setAttribute('data-count', String(data.reposts));
      const countEl = repostBtn.querySelector('.x-action-count');
      if (countEl) countEl.textContent = String(data.reposts);
    }
  });
}
