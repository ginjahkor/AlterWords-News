// =========================================
// Colour checks for anything that came from the database and goes into a style attribute.
// Only a hex colour, rgb()/rgba(), or a linear-gradient made of those is allowed; anything else
// becomes the fallback, so no one can close the style attribute or load a url() from a post.
// =========================================

const HEX = '#[0-9a-fA-F]{3,8}';
const RGB = 'rgba?\\(\\s*\\d{1,3}\\s*,\\s*\\d{1,3}\\s*,\\s*\\d{1,3}\\s*(?:,\\s*(?:0|1|0?\\.\\d+)\\s*)?\\)';
const COLOR = `(?:${HEX}|${RGB})`;
const STOP = `${COLOR}(?:\\s+\\d{1,3}%)?`;
const COLOR_RE = new RegExp(`^${COLOR}$`);
const GRADIENT_RE = new RegExp(`^linear-gradient\\(\\s*(?:\\d{1,3}deg\\s*,\\s*|to (?:top|bottom|left|right)(?: (?:top|bottom|left|right))?\\s*,\\s*)?${STOP}(?:\\s*,\\s*${STOP}){1,5}\\s*\\)$`);

export const DEFAULT_BG = 'linear-gradient(135deg, #1d9bf0, #0f5c8c)';

export function safeColor(value, fallback = '#1d9bf0') {
  const raw = typeof value === 'string' ? value.trim() : '';
  return COLOR_RE.test(raw) ? raw : fallback;
}

// For backgrounds: a plain colour or a linear gradient.
export function safeBackground(value, fallback = DEFAULT_BG) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (COLOR_RE.test(raw) || GRADIENT_RE.test(raw)) return raw;
  return fallback;
}
