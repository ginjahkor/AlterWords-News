// =========================================
// Link and image checks for anything that came from the database.
// safeImageUrl: https links, or data:image pictures (our own SVG avatars and placeholders). Anything else -> ''.
// safeLinkUrl: https and mailto links only. Anything else (javascript:, data:, http:, relative paths) -> ''.
// The result is still escaped with escapeHtml when it goes into HTML.
// =========================================

const DATA_IMAGE = /^data:image\/(svg\+xml|png|jpe?g|webp|gif)[;,]/i;

function parse(raw) {
  try {
    return new URL(raw);
  } catch (_) {
    return null;
  }
}

export function safeImageUrl(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  if (DATA_IMAGE.test(raw)) return raw;
  const u = parse(raw);
  return u && u.protocol === 'https:' ? u.href : '';
}

export function safeLinkUrl(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  const u = parse(raw);
  if (!u) return '';
  return u.protocol === 'https:' || u.protocol === 'mailto:' ? u.href : '';
}

// Video files play from https only.
export function safeMediaUrl(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  const u = raw ? parse(raw) : null;
  return u && u.protocol === 'https:' ? u.href : '';
}
