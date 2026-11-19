// =========================================
// Text helpers: escapeHtml, post text formatting (links, #hashtags), placeholder artwork, YouTube ID reader.
// Moved from trending.js (the feed and tutorial code was split into app/js/feed, tutorials, showcase,
// agents and shared). Behaviour is unchanged.
// =========================================

// High-resolution SVG/Data-URI visual artwork generators so photos & videos render offline/instantly
export function createSvgDataUri(title, subtitle, c1, c2, accent, width = 800, height = 450) {
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

export function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatPostText(text) {
  const safe = escapeHtml(text);
  // Format URLs and #hashtags
  return safe
    .replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer" class="x-hashtag" onclick="event.stopPropagation()">$1</a>'
    )
    .replace(/(#[a-zA-Z0-9_]+)/g, '<span class="x-hashtag">$1</span>');
}

export function extractYouTubeVideoId(urlOrStr) {
  if (!urlOrStr || typeof urlOrStr !== 'string') return null;
  const s = urlOrStr.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([a-zA-Z0-9_-]{11})/i);
  return m ? m[1] : null;
}
