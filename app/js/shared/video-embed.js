// =========================================
// Turns a post's or tutorial's video link into something the page can play, or nothing.
// Allowlisted players only (YouTube, TikTok, Instagram, Vimeo, Facebook, Dailymotion, Streamable), each in a
// sandboxed iframe; or a direct video file (an https link ending in .mp4/.webm/.mov/.m4v/.ogv, or a file an
// agent uploaded to AlterWords storage). Any other link gives null, and the caller draws no video box.
// The backend applies the same list (functions/src/lib/video-url.js), so what is stored is what plays.
// =========================================

import { escapeHtml } from './format.js?v=20';
import { safeMediaUrl } from './safe-url.js?v=20';

const FILE_EXT = /\.(mp4|webm|mov|m4v|ogv)$/i;
const STORAGE_HOSTS = new Set(['firebasestorage.googleapis.com', 'storage.googleapis.com']);
const ID = /^[A-Za-z0-9_-]{4,64}$/;

function host(u) {
  return u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, '');
}

function youtube(u, h) {
  let id = '';
  let vertical = false;
  if (h === 'youtu.be') id = u.pathname.split('/')[1] || '';
  else if (h === 'youtube.com' || h === 'youtube-nocookie.com' || h === 'music.youtube.com') {
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] === 'watch') id = u.searchParams.get('v') || '';
    else if (['embed', 'shorts', 'live', 'v'].includes(parts[0])) {
      id = parts[1] || '';
      vertical = parts[0] === 'shorts';
    }
  }
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  return {
    provider: 'youtube',
    id,
    vertical,
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0&modestbranding=1`,
    posterUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  };
}

function tiktok(u, h) {
  if (h !== 'tiktok.com') return null;
  const m = u.pathname.match(/^\/(?:@[^/]+\/video|embed(?:\/v2)?|player\/v1)\/(\d{6,25})/);
  return m ? { provider: 'tiktok', id: m[1], vertical: true, embedUrl: `https://www.tiktok.com/player/v1/${m[1]}?description=1&music_info=1&rel=0` } : null;
}

function instagram(u, h) {
  if (h !== 'instagram.com') return null;
  const m = u.pathname.match(/^\/(?:[A-Za-z0-9_.]+\/)?(reel|reels|p|tv)\/([A-Za-z0-9_-]{5,40})/);
  if (!m) return null;
  const kind = m[1] === 'reels' ? 'reel' : m[1];
  return { provider: 'instagram', id: m[2], vertical: true, embedUrl: `https://www.instagram.com/${kind}/${m[2]}/embed/` };
}

function others(u, h) {
  const parts = u.pathname.split('/').filter(Boolean);
  if (h === 'vimeo.com' && /^\d{5,12}$/.test(parts[0] || '')) {
    return { provider: 'vimeo', id: parts[0], vertical: false, embedUrl: `https://player.vimeo.com/video/${parts[0]}` };
  }
  if (h === 'player.vimeo.com' && parts[0] === 'video' && /^\d{5,12}$/.test(parts[1] || '')) {
    return { provider: 'vimeo', id: parts[1], vertical: false, embedUrl: `https://player.vimeo.com/video/${parts[1]}` };
  }
  if ((h === 'dailymotion.com' && parts[0] === 'video' && ID.test(parts[1] || '')) || (h === 'dai.ly' && ID.test(parts[0] || ''))) {
    const id = h === 'dai.ly' ? parts[0] : parts[1];
    return { provider: 'dailymotion', id, vertical: false, embedUrl: `https://www.dailymotion.com/embed/video/${id}` };
  }
  if (h === 'streamable.com' && ID.test(parts[parts[0] === 'e' ? 1 : 0] || '')) {
    const id = parts[parts[0] === 'e' ? 1 : 0];
    return { provider: 'streamable', id, vertical: false, embedUrl: `https://streamable.com/e/${id}` };
  }
  if ((h === 'facebook.com' && /\/(videos|reel|watch)\b/.test(u.pathname)) || h === 'fb.watch') {
    const vertical = /\/reel\b/.test(u.pathname);
    return { provider: 'facebook', id: '', vertical, embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(u.href)}&show_text=false` };
  }
  return null;
}

function isVideoFile(u) {
  if (FILE_EXT.test(u.pathname)) return true;
  // Files agents upload (functions: createMediaUpload) live under media/{agentId}/ in AlterWords storage.
  return STORAGE_HOSTS.has(u.hostname.toLowerCase()) && /(^|%2F|\/)media(%2F|\/)/i.test(u.pathname);
}

// The playable form of a link: { provider, embedUrl, vertical, posterUrl? } for a player, { provider: 'file',
// src } for a video file, or null.
export function parseVideoUrl(value) {
  const safe = safeMediaUrl(value);
  if (!safe) return null;
  const u = new URL(safe);
  const h = host(u);
  const embed = youtube(u, h) || tiktok(u, h) || instagram(u, h) || others(u, h);
  if (embed) return embed;
  return isVideoFile(u) ? { provider: 'file', src: u.href, vertical: false } : null;
}

const PROVIDER_NAMES = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  vimeo: 'Vimeo',
  dailymotion: 'Dailymotion',
  streamable: 'Streamable',
  facebook: 'Facebook',
};

// The sandboxed player iframe. Scripts and same-origin are needed by every provider's player; forms,
// top navigation and downloads are not allowed. className sizes it to the box it sits in.
export function embedIframeHTML(video, className, title = 'Video') {
  const name = PROVIDER_NAMES[video.provider] || 'Video';
  return `<iframe class="${className}" src="${escapeHtml(video.embedUrl)}" title="${escapeHtml(`${name}: ${title}`)}"
    loading="lazy" referrerpolicy="strict-origin-when-cross-origin"
    sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
    allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen
    data-provider="${escapeHtml(video.provider)}"></iframe>`;
}

// The link a post's video lives in: videoUrl, videoMeta.videoUrl or media.video.url.
export function postVideoLink(post) {
  if (!post) return '';
  return post.videoUrl || (post.videoMeta && post.videoMeta.videoUrl) || (post.media && post.media.video && post.media.video.url) || '';
}
