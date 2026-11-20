// XSS payloads in the database must show as plain text, or not at all, in a real browser.
// Seeds the Firestore EMULATOR with poisoned posts, comments, agents and tutorials, opens the preview server
// (AW_MODE=emulator, http://localhost:8080) in headless Chromium, and checks that no payload ran, no injected
// element or handler exists, and the payload text is visible as text.
// Needs Playwright: set PLAYWRIGHT_MODULE to its index.mjs, or have 'playwright' installed.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { seedDoc, clearFirestore } from '../helpers/emulator.mjs';

const SITE = process.env.AW_SITE || 'http://localhost:8080';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

const TAG = (n) => `<img src=x onerror="window.__xss=(window.__xss||[]).concat('${n}')">`;
const SCRIPT = (n) => `<script>window.__xss=(window.__xss||[]).concat('${n}')</script>`;
const JS_URL = (n) => `javascript:window.__xss=(window.__xss||[]).concat('${n}')`;
const ATTR = (n) => `x" onmouseover="window.__xss=['${n}']" data-x="`;
const STYLE = (n) => `red;" onmouseover="window.__xss=['${n}']" style="background:url(${JS_URL(n)})`;
const NOW = new Date().toISOString();

const AGENT = 'zz-xss-agent';
const POST = 'post-9999999999999';
const TUT = 'tutorial-9999999999999';

let browser;

before(async () => {
  await clearFirestore();
  await seedDoc(`agents/${AGENT}`, {
    id: AGENT, agentId: AGENT, handle: `@${AGENT}`, name: `Evil ${TAG('agent-name')}`, bio: `Bio ${SCRIPT('agent-bio')}`,
    avatarUrl: JS_URL('agent-avatar'), avatarBg: STYLE('agent-bg'), avatarInitials: `<b>`, verified: false,
    website: JS_URL('agent-site'), createdAt: NOW,
  });
  await seedDoc(`trending_posts/${POST}`, {
    id: POST, agentId: AGENT, author: `Author ${TAG('post-author')}`, handle: `@${AGENT}${ATTR('post-handle')}`,
    text: `Hello ${SCRIPT('post-text')} ${TAG('post-text-img')} https://ok.example/"onmouseover="window.__xss=['post-link'] #tag`,
    avatarUrl: JS_URL('post-avatar'), avatarBg: STYLE('post-bg'), avatarInitials: TAG('post-initials'),
    mediaType: 'image', images: [JS_URL('post-img'), `https://x.example/a.png" onerror="window.__xss=['post-img2']`],
    links: [JS_URL('post-links')], hashtags: [`#${TAG('post-hashtag')}`], category: 'trending',
    likes: 1, reposts: 0, replies: 1, shares: 0, views: '1', order: 0, verified: false, time: 'Just now', createdAt: NOW,
    comments: [{ id: 'comment-1', postId: POST, author: `C ${TAG('embedded-comment-author')}`, text: `T ${SCRIPT('embedded-comment')}`, avatarUrl: JS_URL('c-av'), avatarBg: STYLE('c-bg'), avatarInitials: 'C', verified: false, time: 'Just now', likes: 0, createdAt: NOW }],
  });
  await seedDoc('post_comments/comment-9999999999999', {
    id: 'comment-9999999999999', postId: POST, author: `Guest ${TAG('comment-author')}`, text: `Nice ${TAG('comment-text')}`,
    avatarUrl: JS_URL('comment-avatar'), avatarBg: STYLE('comment-bg'), avatarInitials: 'G', verified: false, likes: 0, time: 'Just now', createdAt: NOW,
  });
  await seedDoc(`tutorials/${TUT}`, {
    tutorialId: TUT, agentId: AGENT, title: `Lesson ${TAG('tut-title')}`, description: `Desc ${SCRIPT('tut-desc')}`,
    author: `A ${TAG('tut-author')}`, handle: `@${AGENT}`, avatarUrl: JS_URL('tut-avatar'), avatarBg: STYLE('tut-bg'), avatarInitials: 'A',
    thumbnail: JS_URL('tut-thumb'), videoUrl: JS_URL('tut-video'), category: `Cat ${TAG('tut-cat')}`, level: 'Beginner', duration: '5 min',
    steps: [1, 2, 3, 4].map((i) => ({ title: `Step ${i} ${TAG(`step-${i}`)}`, description: `D ${SCRIPT(`stepd-${i}`)}`, code: `</code>${TAG(`code-${i}`)}`, link: JS_URL(`step-link-${i}`) })),
    resources: [{ title: TAG('res'), url: JS_URL('res-url') }], verified: false, createdAt: NOW,
  });
  browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
});

after(async () => {
  await browser?.close();
  await clearFirestore();
});

// Everything a payload could leave behind in the page.
async function inspect(page) {
  return page.evaluate(() => {
    const handlers = [];
    for (const el of document.querySelectorAll('*')) {
      for (const a of el.attributes) {
        if (/^on/i.test(a.name)) handlers.push(`${el.tagName}[${a.name}]`);
        if (/^(href|src|action|formaction|xlink:href)$/i.test(a.name) && /^\s*javascript:/i.test(a.value)) handlers.push(`${el.tagName}[${a.name}=javascript:]`);
        if (a.name === 'style' && /url\(|expression\(/i.test(a.value) && /javascript/i.test(a.value)) handlers.push(`${el.tagName}[style js]`);
      }
    }
    return {
      ran: window.__xss || null,
      injectedImgs: document.querySelectorAll('img[src="x"]').length,
      injectedScripts: [...document.querySelectorAll('script')].filter((s) => /__xss/.test(s.textContent)).length,
      handlers,
      text: document.body.innerText,
    };
  });
}

async function openPage(url, act) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(SITE + url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  if (act) await act(page);
  // hover and click everything the payload might have hooked
  for (const el of await page.locator('#trendingView article.x-post, .agent-modal, #tutorialView *').all().then((l) => l.slice(0, 40))) {
    await el.hover({ timeout: 300 }).catch(() => {});
  }
  await page.waitForTimeout(800);
  const r = await inspect(page);
  await ctx.close();
  return { ...r, errors };
}

function assertClean(r, where) {
  assert.equal(r.ran, null, `${where}: a payload ran: ${JSON.stringify(r.ran)}`);
  assert.equal(r.injectedImgs, 0, `${where}: an injected <img src=x> exists`);
  assert.equal(r.injectedScripts, 0, `${where}: an injected <script> exists`);
  assert.deepEqual(r.handlers, [], `${where}: inline handlers or javascript: links found`);
}

test('feed: poisoned post, author, embedded comment render as plain text', async () => {
  const r = await openPage('/');
  assertClean(r, 'feed');
  assert.match(r.text, /Evil <img src=x onerror=/, 'the author (agent name) payload is visible as text');
  assert.match(r.text, /Hello <script>window\.__xss=\(window\.__xss\|\|\[\]\)\.concat\('post-text'\)<\/script>/, 'the post text payload is visible as text, quotes intact');
  assert.ok(!r.text.includes('&#39;') && !r.text.includes('&lt;'), 'no escape codes are shown to the reader');
});

test('comments drawer: poisoned comments render as plain text', async () => {
  const r = await openPage('/', async (p) => {
    await p.evaluate((id) => document.querySelector(`article.x-post[data-post-id="${id}"] .x-action-btn.reply`)?.click(), POST);
    await p.waitForTimeout(1500);
  });
  assertClean(r, 'comments');
  assert.match(r.text, /T <script>window\.__xss/, 'comment text payload visible as text');
  assert.match(r.text, /C <img src=x onerror=/, 'comment author payload visible as text');
});

test('agent profile: poisoned name, bio, avatar and colour do nothing', async () => {
  const r = await openPage('/', async (p) => {
    await p.evaluate((id) => document.querySelector(`article.x-post[data-post-id="${id}"] [data-open-agent]`)?.click(), POST);
    await p.waitForTimeout(1500);
  });
  assertClean(r, 'agent profile');
  assert.match(r.text, /Evil <img src=x onerror=/, 'agent name visible as text');
});

test('tutorial list and lesson: poisoned title, steps, code and links do nothing', async () => {
  const list = await openPage('/?view=tutorial');
  assertClean(list, 'tutorial list');
  assert.match(list.text, /Lesson <img src=x onerror=/, 'tutorial title visible as text');
  const lesson = await openPage('/?view=tutorial', async (p) => {
    await p.evaluate((id) => document.querySelector(`#tutorialView [data-tutorial-id="${id}"]`)?.click(), TUT);
    await p.waitForTimeout(1500);
  });
  assertClean(lesson, 'lesson');
  assert.match(lesson.text, /Step 1 <img src=x onerror=/, 'step title visible as text');
});

test('home showcases: poisoned post and tutorial do nothing', async () => {
  const r = await openPage('/?view=home');
  assertClean(r, 'home');
});
