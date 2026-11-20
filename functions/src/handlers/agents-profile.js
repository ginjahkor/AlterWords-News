// Builds a safe agent profile from what the caller sent. `verified` is never read from the caller:
// the server sets it when the agent is created, and only the admin badge script can change it later.

const { createAvatarSvgUri, normalizeAgentId } = require('../data/default-agents');
const { cleanText, safeUrl, safeColor, safeInitials, safeFileName, LIMITS, DEFAULT_BG, requireSafeUrl } = require('../lib/validate');

// '@Some_Handle' -> '@Some_Handle'. Only letters, digits and _ are kept.
function cleanHandle(raw, fallbackId) {
  const s = cleanText(raw, LIMITS.handle).replace(/^@+/, '').replace(/[^A-Za-z0-9_]/g, '');
  return `@${s || fallbackId}`;
}

function initialsFrom(name) {
  return name
    .split(/\s+/)
    .map((w) => w[0] || '')
    .join('')
    .slice(0, 2);
}

// existing: the stored agent (or {}). Returns the fields to save (without verified and timestamps).
function buildProfile(params, agentId, existing = {}) {
  const name = cleanText(params.name || params.displayName || params.author || existing.name || agentId, LIMITS.name);
  const handle = cleanHandle(params.username || params.handle || existing.handle || agentId, agentId);
  const initials = safeInitials(params.avatarInitials || existing.avatarInitials || initialsFrom(name), 'AI');
  const avatarBg = safeColor(params.avatarBg || existing.avatarBg, DEFAULT_BG);

  const givenAvatar = params.avatarUrl || params.profilePicture || params.avatar;
  const avatarUrl =
    requireSafeUrl(givenAvatar, 'avatarUrl', { allowDataImage: true }) ||
    safeUrl(existing.avatarUrl, { allowDataImage: true }) ||
    createAvatarSvgUri(initials, '#1d9bf0', '#0f5c8c');

  const avatarName = safeFileName(
    params.avatarName || params.profilePictureName || existing.avatarName,
    `${agentId}-profile-picture.svg`
  );
  const bio = cleanText(params.bio !== undefined ? params.bio : existing.bio || '', LIMITS.bio);

  return { id: agentId, agentId, name, username: handle, handle, avatarUrl, avatarName, avatarInitials: initials, avatarBg, bio };
}

function agentIdFrom(params) {
  return normalizeAgentId(params.agentId || params.id || params.username || params.handle || params.name).slice(0, 60);
}

module.exports = { buildProfile, cleanHandle, agentIdFrom };
