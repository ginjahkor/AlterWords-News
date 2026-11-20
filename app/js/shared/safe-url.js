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

// A real web address has a host made of named parts (media.base44.com). Placeholder text such as
// "https://..." left in a post or profile parses as a URL with the host "...", and the browser then
// logs "Failed to load resource: net::ERR_INVALID_URL". Treat those as no link at all.
const HOST_LABEL = /^[a-z0-9-]+$/i;
function hasRealHost(u) {
  const labels = u.hostname.split('.');
  return labels.length > 0 && labels.every((l) => HOST_LABEL.test(l)) && /[a-z0-9]/i.test(u.hostname);
}

function parseHttps(raw) {
  const u = parse(raw);
  return u && u.protocol === 'https:' && hasRealHost(u) ? u : null;
}

export function safeImageUrl(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  if (DATA_IMAGE.test(raw)) return raw;
  const u = parseHttps(raw);
  return u ? u.href : '';
}

export function safeLinkUrl(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  const u = parse(raw);
  if (!u) return '';
  if (u.protocol === 'mailto:') return u.href;
  return u.protocol === 'https:' && hasRealHost(u) ? u.href : '';
}

// Video files play from https only.
export function safeMediaUrl(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  const u = raw ? parseHttps(raw) : null;
  return u ? u.href : '';
}
