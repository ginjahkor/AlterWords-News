// The browser's link, colour and text checks, run directly in Node against known XSS payloads.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeImageUrl, safeLinkUrl, safeMediaUrl } from '../../app/js/shared/safe-url.js';
import { safeColor, safeBackground, DEFAULT_BG } from '../../app/js/shared/safe-style.js';
import { escapeHtml, formatPostText } from '../../app/js/shared/format.js';

const BAD_URLS = [
  'javascript:alert(1)',
  ' JaVaScRiPt:alert(1)',
  'java\tscript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'vbscript:msgbox(1)',
  'http://evil.example/x.png',
  '//evil.example/x.png',
  '/relative/path',
  '" onerror="alert(1)',
];

test('links and images: only https (and data:image for pictures, mailto for links) get through', () => {
  for (const u of BAD_URLS) {
    assert.equal(safeImageUrl(u), '', `image ${u}`);
    assert.equal(safeLinkUrl(u), '', `link ${u}`);
    assert.equal(safeMediaUrl(u), '', `media ${u}`);
  }
  assert.equal(safeImageUrl('https://media.base44.com/a.png'), 'https://media.base44.com/a.png');
  assert.ok(safeImageUrl('data:image/png;base64,AAAA').startsWith('data:image/png'));
  assert.equal(safeLinkUrl('mailto:hi@alterwords.online'), 'mailto:hi@alterwords.online');
  assert.equal(safeLinkUrl('https://alterwords.online/?a="b'), 'https://alterwords.online/?a=%22b', 'quotes are encoded');
});

test('colours: anything but a real colour or gradient falls back', () => {
  const bad = [
    'red;background:url(javascript:alert(1))',
    '#fff" onmouseover="alert(1)',
    'url(https://evil.example/x.png)',
    'expression(alert(1))',
    'linear-gradient(135deg, #fff, #000); background-image:url(x)',
  ];
  for (const c of bad) {
    assert.equal(safeColor(c), '#1d9bf0', c);
    assert.equal(safeBackground(c), DEFAULT_BG, c);
  }
  assert.equal(safeColor('#FFD60A'), '#FFD60A');
  assert.equal(safeBackground('linear-gradient(135deg, #FFD60A, #B8860B)'), 'linear-gradient(135deg, #FFD60A, #B8860B)');
  assert.equal(safeBackground('rgba(0, 0, 0, 0.5)'), 'rgba(0, 0, 0, 0.5)');
});

test('escapeHtml escapes all five characters, single quote included', () => {
  assert.equal(escapeHtml(`<img src=x onerror='a'>"&`), '&lt;img src=x onerror=&#39;a&#39;&gt;&quot;&amp;');
  assert.equal(escapeHtml(null), '');
});

test('post text: apostrophes stay apostrophes, hashtags still highlight, payloads stay text', () => {
  assert.equal(formatPostText("don't #go"), 'don&#39;t <span class="x-hashtag">#go</span>');
  const out = formatPostText('<script>x</script> https://ok.example/"onmouseover="y');
  assert.ok(!out.includes('<script>'));
  assert.ok(out.includes('href="https://ok.example/"'), 'link stops at the quote');
  assert.equal(formatPostText('javascript:alert(1)'), 'javascript:alert(1)', 'not a link');
});
