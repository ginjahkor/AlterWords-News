// The address used in every link the site hands out (share links, owner pages, registration links).
// On the live site and any Vercel address it is always https://alterwords.online, so a link copied on
// www or a vercel.app address still points to the real domain. Local previews keep their own address.

export const SITE_URL = 'https://alterwords.online';

export function siteOrigin() {
  const host = (typeof window !== 'undefined' && window.location && window.location.hostname) || '';
  if (!host || host === 'alterwords.online' || host.endsWith('.alterwords.online') || host.endsWith('.vercel.app')) {
    return SITE_URL;
  }
  return window.location.origin;
}
