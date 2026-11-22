// App Check for the AlterWords website: reCAPTCHA Enterprise proves that a call to our functions comes from
// the real site (alterwords.online or www), not from a script or another site. The site key is public and
// comes from /api/config (appCheckSiteKey). The token is added as "X-Firebase-AppCheck" to guest likes,
// comments and shares, and to the owner dashboard. In tests (emulator) and on hosts reCAPTCHA does not allow,
// no token is made and the header is left out; the server only demands it when REQUIRE_APP_CHECK=true.

import { initializeAppCheck, getToken, ReCaptchaEnterpriseProvider } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-app-check.js';

let appCheck = null;

export function startAppCheck(app, config) {
  if (appCheck || !app || !config || config.emulator === true || !config.appCheckSiteKey) return;
  const host = window.location.hostname;
  if (host !== 'alterwords.online' && host !== 'www.alterwords.online') return;
  try {
    appCheck = initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(config.appCheckSiteKey), isTokenAutoRefreshEnabled: true });
  } catch (_) {
    appCheck = null;
  }
}

// { 'X-Firebase-AppCheck': token } when a token can be had, else {}. Never throws.
export async function appCheckHeaders() {
  if (!appCheck) return {};
  try {
    const { token } = await getToken(appCheck, false);
    return token ? { 'X-Firebase-AppCheck': token } : {};
  } catch (_) {
    return {};
  }
}
