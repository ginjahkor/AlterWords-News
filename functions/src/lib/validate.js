// Checks every value a caller sends before it is saved.
// Text is stored as plain text (the browser escapes it). Links must be https.
// Colours must be a known colour or gradient. Anything else is refused or replaced with a safe default.

const { fail } = require('./http');

const LIMITS = {
  name: 120,
  handle: 40,
  bio: 500,
  title: 300,
  text: 10000,
  comment: 2000,
  url: 2048,
  fileName: 120,
  initials: 4,
  hashtag: 60,
  listItems: 20,
  mediaItems: 10,
};

// Removes control characters (keeps new lines and tabs), trims and cuts to a maximum length.
function cleanText(value, max = LIMITS.text) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

// Returns the link if it is a plain https address, else ''. data: SVG images made by our own
// avatar maker are allowed only where allowDataImage is set (avatars).
function safeUrl(value, { allowDataImage = false } = {}) {
  const raw = cleanText(value, LIMITS.url);
  if (!raw) return '';
  if (allowDataImage && /^data:image\/(svg\+xml|png|jpe?g|webp|gif)[;,]/i.test(raw)) {
    return raw.length <= 20000 ? raw : '';
  }
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return '';
    if (/["'<>`\s]/.test(raw)) return '';
    return u.href;
  } catch (_) {
    return '';
  }
}

// Like safeUrl, but a value that was given and is not safe is an error, not silently dropped.
function requireSafeUrl(value, field, opts) {
  if (value === undefined || value === null || String(value).trim() === '') return '';
  const url = safeUrl(value, opts);
  if (!url) fail(400, `\`${field}\` must be a full https:// link.`);
  return url;
}

const HEX = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i;
const GRADIENT = /^linear-gradient\(\s*\d{1,3}deg\s*,\s*#[0-9a-f]{3,6}\s*(\d{1,3}%)?\s*,\s*#[0-9a-f]{3,6}\s*(\d{1,3}%)?\s*\)$/i;
const DEFAULT_BG = 'linear-gradient(135deg, #1d9bf0, #0f5c8c)';

// Only a hex colour or a two-colour linear gradient. Everything else becomes the default.
function safeColor(value, fallback = DEFAULT_BG) {
  const raw = cleanText(value, 120);
  if (HEX.test(raw) || GRADIENT.test(raw)) return raw;
  return fallback;
}

function safeInitials(value, fallback = 'AI') {
  const raw = cleanText(value, LIMITS.initials).replace(/[^\p{L}\p{N}]/gu, '').toUpperCase();
  return raw || fallback;
}

function safeFileName(value, fallback) {
  const raw = cleanText(value, LIMITS.fileName).replace(/[^a-zA-Z0-9._-]/g, '-');
  return raw || fallback;
}

function toList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const s = value.trim();
    if (s.startsWith('[')) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) return parsed;
      } catch (_) {
        /* fall through to comma split */
      }
    }
    return s.split(',').map((x) => x.trim());
  }
  return [];
}

// A list of safe links (bad ones are dropped), at most `max`.
function safeUrlList(value, max = LIMITS.mediaItems) {
  return toList(value)
    .map((u) => safeUrl(u))
    .filter(Boolean)
    .slice(0, max);
}

function safeHashtags(value, max = LIMITS.listItems) {
  return Array.from(
    new Set(
      toList(value)
        .map((t) => cleanText(t, LIMITS.hashtag).replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, ''))
        .filter(Boolean)
        .map((t) => `#${t}`)
    )
  ).slice(0, max);
}

function toBool(value) {
  if (typeof value === 'boolean') return value;
  const s = String(value === undefined || value === null ? '' : value).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

function toCount(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(Math.floor(n), 1e9);
}

// Firestore document ids we create or look up: letters, digits, _ and -, at most 120 characters.
function safeDocId(value) {
  const s = cleanText(value, 120);
  return /^[A-Za-z0-9_-]{1,120}$/.test(s) ? s : '';
}

module.exports = {
  LIMITS,
  DEFAULT_BG,
  cleanText,
  safeUrl,
  requireSafeUrl,
  safeColor,
  safeInitials,
  safeFileName,
  toList,
  safeUrlList,
  safeHashtags,
  toBool,
  toCount,
  safeDocId,
};
