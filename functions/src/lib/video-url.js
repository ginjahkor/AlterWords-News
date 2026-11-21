// Which video links AlterWords can play, so a post or tutorial never stores a video that shows as a broken
// box. The same list as the site's app/js/shared/video-embed.js: YouTube, TikTok, Instagram, Vimeo,
// Facebook, Dailymotion and Streamable links, direct https video files (.mp4 .webm .mov .m4v .ogv), and files
// uploaded with uploadMedia (AlterWords storage, media/ folder).

const { requireSafeUrl } = require('./validate');
const { fail } = require('./http');

const FILE_EXT = /\.(mp4|webm|mov|m4v|ogv)$/i;
const STORAGE_HOSTS = new Set(['firebasestorage.googleapis.com', 'storage.googleapis.com']);

function videoProvider(url) {
  let u;
  try {
    u = new URL(url);
  } catch (_) {
    return '';
  }
  const h = u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, '');
  const p = u.pathname;
  if (h === 'youtu.be' && /^\/[A-Za-z0-9_-]{11}/.test(p)) return 'youtube';
  if (['youtube.com', 'youtube-nocookie.com', 'music.youtube.com'].includes(h)) {
    if (p === '/watch' && /^[A-Za-z0-9_-]{11}$/.test(u.searchParams.get('v') || '')) return 'youtube';
    if (/^\/(embed|shorts|live|v)\/[A-Za-z0-9_-]{11}/.test(p)) return 'youtube';
  }
  if (h === 'tiktok.com' && /^\/(?:@[^/]+\/video|embed(?:\/v2)?|player\/v1)\/\d{6,25}/.test(p)) return 'tiktok';
  if (h === 'instagram.com' && /^\/(?:[A-Za-z0-9_.]+\/)?(reel|reels|p|tv)\/[A-Za-z0-9_-]{5,40}/.test(p)) return 'instagram';
  if ((h === 'vimeo.com' && /^\/\d{5,12}/.test(p)) || (h === 'player.vimeo.com' && /^\/video\/\d{5,12}/.test(p))) return 'vimeo';
  if ((h === 'dailymotion.com' && /^\/video\/[A-Za-z0-9_-]{4,64}/.test(p)) || (h === 'dai.ly' && /^\/[A-Za-z0-9_-]{4,64}/.test(p))) return 'dailymotion';
  if (h === 'streamable.com' && /^\/(e\/)?[A-Za-z0-9_-]{4,64}/.test(p)) return 'streamable';
  if ((h === 'facebook.com' && /\/(videos|reel|watch)\b/.test(p)) || h === 'fb.watch') return 'facebook';
  if (FILE_EXT.test(p)) return 'file';
  if (STORAGE_HOSTS.has(u.hostname.toLowerCase()) && /(^|%2F|\/)media(%2F|\/)/i.test(p)) return 'file';
  return '';
}

// The link if AlterWords can play it; a 400 that lists what works if not.
function requirePlayableVideo(value, field = 'videoUrl') {
  const url = requireSafeUrl(value, field);
  if (!videoProvider(url)) {
    fail(400, `${field} must be a YouTube, TikTok, Instagram, Vimeo, Facebook, Dailymotion or Streamable link, a direct https video file (.mp4, .webm, .mov), or a file uploaded with uploadMedia.`);
  }
  return url;
}

module.exports = { videoProvider, requirePlayableVideo };
