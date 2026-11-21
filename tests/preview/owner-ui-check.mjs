// Browser check of the owner pages on the emulator preview (http://localhost:8080 by default).
// Walks: app grid -> Profile -> sign-in -> dashboard -> make code -> approve -> keys -> public page ->
// agent profile owner link -> OAuth consent -> approve. Then screenshots at 4 sizes in light and dark,
// checking nothing spills past the screen edge and no console errors.
// Run after seed-demo.mjs:  node tests/preview/owner-ui-check.mjs

import fs from 'node:fs';
import crypto from 'node:crypto';
import { EMAIL, PASSWORD, HANDLE, agentName } from './demo-account.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const SITE = process.env.AW_PREVIEW || 'http://localhost:8080';
const OUT = process.env.AW_SHOTS || '/home/sprite/owner-ui-shots';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const errors = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
// Only our own pages count: embedded YouTube, TikTok and Instagram players log their own warnings from their frames.
const ownOrigin = new URL(SITE).origin;
page.on('console', (m) => {
  const from = (m.location() && m.location().url) || '';
  if (from && !from.startsWith(ownOrigin)) return;
  if (m.type() === 'error') errors.push(`${page.url()} :: ${m.text()}`);
});
page.on('response', (r) => { if (r.status() >= 500) errors.push(`${page.url()} :: ${r.status()} from ${r.url().slice(0, 160)}`); });
page.on('pageerror', (e) => errors.push(`${page.url()} :: ${e.message}`));
page.on('dialog', (d) => d.accept());

// 1. Home page -> grid -> Profile opens the sign-in pop-up.
await page.goto(`${SITE}/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#gridBtn', { timeout: 20000 });
await page.click('#gridBtn');
await page.waitForSelector('#modalProfileBtn', { state: 'visible' });
check('grid shows the Profile icon', await page.isVisible('#modalProfileBtn'));
await page.click('#modalProfileBtn');
await page.waitForSelector('#ownerSignInModal.open', { timeout: 10000 });
check('Profile opens the sign-in pop-up for a guest', await page.isVisible('#ownerGoogleBtn'));
await page.screenshot({ path: `${OUT}/signin-desktop-light.png` });

// 2. Wrong password shows a friendly error; right one goes to the dashboard.
await page.fill('#ownerEmailInput', EMAIL);
await page.fill('#ownerPasswordInput', 'wrong-password-1');
await page.click('#ownerSubmitBtn');
await page.waitForFunction(() => document.getElementById('ownerSignInError').textContent.length > 0, null, { timeout: 10000 });
check('wrong password shows an error', /do not match|No account/.test(await page.textContent('#ownerSignInError')));
await page.fill('#ownerPasswordInput', PASSWORD);
await page.click('#ownerSubmitBtn');
await page.waitForURL('**/dashboard.html', { timeout: 15000 });
await page.waitForSelector('#dashAgents .owner-list-row', { timeout: 20000 });
check('dashboard loads with agents', (await page.$$('#dashAgents .owner-agent-row')).length >= 4);
check('dashboard shows the public link', (await page.textContent('#dashLink')).includes(`/u/${HANDLE}`));
check('no full agent key on the dashboard', !/awk_[A-Za-z0-9]{8,}_[A-Za-z0-9_-]{20,}/.test(await page.content()));

// 3. Make a code: shown once, then gone after reload.
await page.fill('#codeLabel', 'Morning test');
await page.click('#codeForm button[type=submit]');
await page.waitForSelector('.owner-secret-value', { timeout: 10000 });
const code = (await page.textContent('.owner-secret-value')).trim();
check('new code is shown once', /^awr_/.test(code));
await page.reload();
await page.waitForSelector('#dashCodes .owner-list-row', { timeout: 20000 });
check('code is not shown again after reload', !(await page.content()).includes(code));

// 4. Approve the waiting agent, open keys, make a re-key code.
const approve = await page.$('[data-act="approveAgent"]');
if (approve) {
  await approve.click();
  await page.waitForFunction(() => !document.querySelector('[data-act="approveAgent"]'), null, { timeout: 15000 });
}
check('waiting agent approved from the dashboard', !(await page.$('[data-act="approveAgent"]')));
await page.click('[data-act="keys"]');
await page.waitForSelector('.owner-keys:not([hidden]) .owner-key-row', { timeout: 10000 });
check('keys show hints and dates only', (await page.textContent('.owner-keys:not([hidden])')).includes('last used'));
await page.screenshot({ path: `${OUT}/dashboard-desktop-light-full.png`, fullPage: true });

// 5. Public owner page and the owner icon on an agent profile.
await page.goto(`${SITE}/u/${HANDLE}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.owner-agent-card', { timeout: 15000 });
check('public owner page lists agents', (await page.$$('.owner-agent-card')).length >= 3);
check('public page has no registration code', !(await page.content()).includes(code));
await page.goto(`${SITE}/?agent=${agentName('nova_scribe')}`, { waitUntil: 'domcontentloaded' });
const ownerLink = await page.waitForSelector('.agent-profile-owner', { timeout: 25000 }).catch(() => null);
check('agent profile shows the owner icon', !!ownerLink && (await ownerLink.getAttribute('href')) === `/u/${HANDLE}`);

// 6. OAuth: register a client, start authorize, approve on the consent page, land on the redirect.
const reg = await (await fetch(`${SITE}/oauth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] }) })).json();
const verifier = crypto.randomBytes(32).toString('base64url');
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
const q = new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: 'https://claude.ai/api/mcp/auth_callback', code_challenge: challenge, code_challenge_method: 'S256', state: 'ui-check', scope: 'agent:read agent:write' });
await page.route('https://claude.ai/**', (route) => route.fulfill({ status: 200, body: 'claude callback' }));
await page.goto(`${SITE}/oauth/authorize?${q}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#consentApprove', { timeout: 20000 });
check('consent page names the app', (await page.textContent('#consentMain')).includes('Claude'));
await page.screenshot({ path: `${OUT}/consent-desktop-light.png` });
await page.click('#consentApprove');
await page.waitForURL('https://claude.ai/**', { timeout: 15000 });
const back = new URL(page.url());
check('approve returns to the app with a code and state', !!back.searchParams.get('code') && back.searchParams.get('state') === 'ui-check');
const tok = await (await fetch(`${SITE}/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: back.searchParams.get('code'), code_verifier: verifier, redirect_uri: 'https://claude.ai/api/mcp/auth_callback', client_id: reg.client_id }) })).json();
check('the code turns into an access token', /^awo_/.test(tok.access_token || ''));
await page.goto(`${SITE}/dashboard.html`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#dashApps [data-grant]', { timeout: 20000 });
check('dashboard lists the connected app', (await page.textContent('#dashApps')).includes('Claude'));

// 7. Screens: 4 sizes x light/dark for dashboard, public page, consent-less pages. No sideways spill.
const SIZES = [[1440, 900], [1024, 768], [390, 844], [360, 740]];
const PAGES = [['dashboard', '/dashboard.html', '#dashAgents .owner-list-row'], ['owner', `/u/${HANDLE}`, '.owner-agent-card']];
let clean = 0;
let total = 0;
// ownerApi allows 60 calls a minute per owner in fixed one-minute windows, and each dashboard load makes about 5.
// Start the 8 dashboard loads in a fresh window so the check measures the screens, not the rate limit.
await page.waitForTimeout(61000 - (Date.now() % 60000));
for (const theme of ['light', 'dark']) {
  await page.evaluate((t) => localStorage.setItem('alterwords-theme', t), theme);
  for (const [w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    for (const [name, path, sel] of PAGES) {
      await page.goto(`${SITE}${path}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector(sel, { timeout: 20000 });
      const spill = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const themed = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      total++;
      if (spill <= 1 && themed === theme) clean++;
      else console.log(`  spill ${spill}px or theme ${themed} on ${name} ${w} ${theme}`);
      await page.screenshot({ path: `${OUT}/${name}-${w}-${theme}.png`, fullPage: name === 'dashboard' && w <= 390 });
    }
  }
}
check(`owner screens fit at 4 sizes in light and dark (${clean}/${total})`, clean === total);

// 8. Sign out returns to a guest, and the grid Profile opens sign-in again.
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${SITE}/dashboard.html`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#signOutBtn:not([hidden])', { timeout: 20000 });
await page.click('#signOutBtn');
await page.waitForURL(`${SITE}/`, { timeout: 15000 });
await page.waitForSelector('#gridBtn');
await page.click('#gridBtn');
await page.click('#modalProfileBtn');
await page.waitForSelector('#ownerSignInModal.open', { timeout: 10000 });
check('after sign-out, Profile opens sign-in again (phone size)', true);
await page.screenshot({ path: `${OUT}/signin-390-light.png` });

const realErrors = errors.filter((e) => !/favicon|ERR_BLOCKED_BY_CLIENT|auth\/invalid-credential|status of 400|status of 401/.test(e));
check('no console errors on the owner pages', realErrors.length === 0, realErrors.slice(0, 5).join(' | '));

await browser.close();
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ results, errors: realErrors }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} owner UI checks passed`);
process.exit(failed ? 1 : 0);
