// Preview check for today's changes, through a real browser: the feed shows each kind of post correctly (text only
// with no media box, the uploaded picture, YouTube / TikTok / Instagram players, the uploaded video in the site's
// own player), there are no placeholder images, a guest like counts without creating a sign-in user, and the
// pages fit 4 screen sizes in light and dark. Emulator preview only.
//
//   PLAYWRIGHT_MODULE=... node preview/media-guest-check.mjs [site]

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const SITE = process.argv[2] || process.env.AW_PREVIEW || 'http://localhost:8080';
const AUTH = 'http://127.0.0.1:9099';
const FS = 'http://127.0.0.1:8085/v1/projects/demo-alterwords/databases/(default)/documents';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

async function authUserCount() {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/demo-alterwords/accounts:query`, {
    method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: '{}',
  });
  const b = await r.json();
  return Number(b.recordsCount || 0);
}

async function postByText(start) {
  const r = await fetch(`${FS}/trending_posts?pageSize=300`, { headers: { Authorization: 'Bearer owner' } });
  const docs = (await r.json()).documents || [];
  const d = docs.find((x) => String(x.fields.text?.stringValue || x.fields.content?.stringValue || '').startsWith(start));
  return d && { id: d.name.split('/').pop(), likes: Number(d.fields.likes?.integerValue || 0) };
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
const own = new URL(SITE).origin;
const errors = [];
page.on('console', (m) => {
  const from = (m.location() && m.location().url) || '';
  if (m.type() === 'error' && (!from || from.startsWith(own))) errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(e.message));

const usersBefore = await authUserCount();
await page.goto(`${SITE}/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.x-post-unit', { timeout: 30000 });
await page.waitForTimeout(4000);

const cardOf = (start) => page.locator('.x-post-unit').filter({ hasText: start }).first();
// The feed shows 7 posts and a "See more" button on the last one: press it until the post is there.
async function find(start) {
  for (let i = 0; i < 10 && !(await cardOf(start).count()); i++) {
    const more = page.locator('.x-see-more-btn').first();
    if (!(await more.count())) break;
    await more.click();
    await page.waitForTimeout(1200);
  }
}

async function card(start) {
  await find(start);
  const c = cardOf(start);
  await c.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  return c.evaluate((el) => ({
    imgs: [...el.querySelectorAll('img')].filter((i) => i.offsetParent !== null && !i.closest('.tut-card') && !i.closest('.x-post-avatar, .x-avatar, [class*="avatar"]')).map((i) => ({ src: i.src, ok: i.complete && i.naturalWidth > 0 })),
    iframes: [...el.querySelectorAll('iframe')].map((f) => f.src),
    videos: [...el.querySelectorAll('video')].map((v) => v.currentSrc || v.src || (v.querySelector('source') || {}).src),
    canvas: el.querySelectorAll('canvas').length,
    videoBox: el.querySelectorAll('.x-video-container').length,
  }));
}

const text = await card('A text-only post');
check('text-only post: no picture, no video box, no placeholder', text.imgs.length === 0 && text.videoBox === 0 && text.canvas === 0 && text.iframes.length === 0, JSON.stringify(text));
const pic = await card('A post with one uploaded picture');
check('picture post: the uploaded picture shows and loaded', pic.imgs.length === 1 && pic.imgs[0].ok && /\/v0\/b\//.test(pic.imgs[0].src), JSON.stringify(pic.imgs));

async function playerFor(start, re, name) {
  const c = cardOf(start);
  let info = await card(start);
  if (!info.iframes.length) {
    const btn = c.locator('.x-video-container, [data-video-post], .x-video-play, button[aria-label*="lay"]').first();
    if (await btn.count()) await btn.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2500);
    info = await card(start);
  }
  check(`${name} link: plays in the video box`, info.videoBox >= 1 && info.iframes.some((s) => re.test(s)), JSON.stringify(info.iframes));
}
await playerFor('A YouTube link', /youtube(-nocookie)?\.com\/embed\//, 'YouTube');
await playerFor('A TikTok link', /tiktok\.com\/(embed|player)/, 'TikTok');
await playerFor('An Instagram post link', /instagram\.com\/p\/[^/]+\/embed/, 'Instagram');

const upl = await card('A video file the agent uploaded');
let playable = false;
if (upl.videos.length) {
  playable = await cardOf('A video file the agent uploaded').locator('video').first().evaluate(async (v) => {
    v.muted = true;
    try { await v.play(); } catch (_) { /* readyState still tells */ }
    await new Promise((r) => setTimeout(r, 2500));
    return v.readyState >= 2 && v.duration > 5;
  });
} else {
  const box = cardOf('A video file the agent uploaded').locator('.x-video-container').first();
  if (await box.count()) await box.click().catch(() => {});
  await page.waitForTimeout(2500);
  const v2 = await card('A video file the agent uploaded');
  upl.videos = v2.videos;
  if (v2.videos.length) playable = await cardOf('A video file the agent uploaded').locator('video').first().evaluate(async (v) => { v.muted = true; try { await v.play(); } catch (_) {} await new Promise((r) => setTimeout(r, 2500)); return v.readyState >= 2 && v.duration > 5; });
}
check('uploaded video file: plays in the site\'s own player', playable, JSON.stringify(upl.videos));

const anyPlaceholder = await page.evaluate(() => [...document.querySelectorAll('img')].some((i) => /placeholder|picsum|via\.placeholder|unsplash\.com\/random/.test(i.src)));
check('no placeholder pictures anywhere on the page', !anyPlaceholder);

// Guest like.
const target = await postByText('A text-only post');
const likeBtn = cardOf('A text-only post').locator('.x-action-btn.like').first();
await likeBtn.click();
await page.waitForTimeout(4000);
const after = await postByText('A text-only post');
check('guest like is counted on the server', after.likes === target.likes + 1, `${target.likes} -> ${after.likes}`);
const usersAfter = await authUserCount();
check('guest like did not create a sign-in user', usersAfter === usersBefore, `users ${usersBefore} -> ${usersAfter}`);
const signedIn = await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('firebase:authUser')));
check('the guest browser holds no sign-in session', !signedIn);
await ctx.close();

// Screens: home feed and tutorial list at 4 sizes, light and dark.
const SIZES = [[390, 844], [820, 1180], [1366, 768], [1920, 1080]];
let bad = [];
for (const [w, h] of SIZES) {
  for (const theme of ['light', 'dark']) {
    const c = await browser.newContext({ viewport: { width: w, height: h } });
    await c.addInitScript((t) => localStorage.setItem('alterwords-theme', t), theme);
    const p = await c.newPage();
    for (const path of ['/', '/?view=tutorial']) {
      await p.goto(`${SITE}${path}`, { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(3500);
      const spill = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (spill > 1) bad.push(`${path} ${w} ${theme} spills ${spill}px`);
      await p.screenshot({ path: `${process.env.AW_SHOTS || '/tmp'}/media-${path === '/' ? 'home' : 'tutorials'}-${w}-${theme}.png` });
    }
    await c.close();
  }
}
check('home and tutorial pages fit 4 screen sizes in light and dark (16 screens)', bad.length === 0, bad.join('; '));
check('no console errors from AlterWords pages', errors.length === 0, errors.slice(0, 4).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} media and guest checks passed`);
process.exit(failed ? 1 : 0);
