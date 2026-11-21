// =========================================
// Saved checklist ticks and the step-by-step guide download.
// Moved from trending.js (the feed and tutorial code was split into app/js/feed, tutorials, showcase,
// agents and shared). Behaviour is unchanged.
// =========================================

import { escapeHtml } from '../shared/format.js?v=20';
import { safeImageUrl, safeLinkUrl } from '../shared/safe-url.js?v=20';

function getChecklistStorageKey(tutorialId) {
  return `alterwords_tut_check_${tutorialId}`;
}

export function readTutorialChecklistState(tutorialId) {
  try {
    const raw = localStorage.getItem(getChecklistStorageKey(tutorialId));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

export function writeTutorialChecklistState(tutorialId, stateObj) {
  try {
    localStorage.setItem(getChecklistStorageKey(tutorialId), JSON.stringify(stateObj));
  } catch (_) {}
}

export function triggerStepByStepGuideDownload(tut) {
  if (!tut) return;
  const rawUrl = safeLinkUrl(String(tut.fileUrl || '').trim());
  // If an agent uploaded a real external PDF URL (not a placeholder), open it directly
  if (
    rawUrl &&
    /^https:\/\//i.test(rawUrl) &&
    !rawUrl.includes('https://.../') &&
    !rawUrl.includes('alterwords-news.vercel.app/guides/') &&
    !rawUrl.includes('alterwords.online/guides/')
  ) {
    window.open(rawUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  // Otherwise generate a clean, printable Step-by-Step Guide document so the download works offline & instantly
  const stepsHtml = (Array.isArray(tut.steps) ? tut.steps : [])
    .map(
      (s, i) => {
        const sImages = Array.isArray(s.images) ? s.images : (s.image ? [s.image] : []);
        const sCheck = Array.isArray(s.checklist) ? s.checklist : [];
        const sMist = Array.isArray(s.mistakes) ? s.mistakes : (s.mistake ? [s.mistake] : (s.warning ? [s.warning] : []));
        const imgsHtml = sImages.map((im) => {
          const src = safeImageUrl(typeof im === 'string' ? im : im.img || im.url || '');
          const cap = typeof im === 'object' && im.caption ? im.caption : '';
          return `<div style="margin:10px 0;"><img src="${escapeHtml(src)}" style="max-width:100%;border-radius:8px;display:block;" />${cap ? `<div style="font-size:12px;color:#6b7280;margin-top:4px;">${escapeHtml(cap)}</div>` : ''}</div>`;
        }).join('');
        const checkHtml = sCheck.length > 0 ? `<div style="margin-top:10px;padding:8px 12px;background:#f0fdf4;border-radius:6px;border:1px solid #bbf7d0;"><div style="font-size:12px;font-weight:700;color:#166534;margin-bottom:4px;">STEP CHECKLIST</div>${sCheck.map((c) => `<div style="font-size:13px;color:#374151;margin-bottom:3px;">☐ ${escapeHtml(typeof c === 'string' ? c : c.text || '')}</div>`).join('')}</div>` : '';
        const mistHtml = sMist.length > 0 ? `<div style="margin-top:8px;padding:8px 12px;background:#fef2f2;border-radius:6px;border:1px solid #fecaca;color:#991b1b;font-size:13px;">${sMist.map((m) => `<div>✕ Avoid: ${escapeHtml(typeof m === 'string' ? m : m.text || '')}</div>`).join('')}</div>` : '';
        return `
      <div style="margin-bottom:16px;padding:14px 16px;border:1px solid #d6d3cd;border-radius:10px;background:#ffffff;">
        <div style="font-weight:700;font-size:15px;color:#111827;margin-bottom:4px;">Step ${escapeHtml(s.number || i + 1)}: ${escapeHtml(s.title || '')}</div>
        <div style="font-size:14px;color:#374151;line-height:1.55;">${escapeHtml(s.body || '')}</div>
        ${imgsHtml}
        ${checkHtml}
        ${mistHtml}
        ${s.tip ? `<div style="margin-top:8px;font-size:13px;color:#b45309;font-weight:600;">Tip: ${escapeHtml(s.tip)}</div>` : ''}
      </div>`;
      }
    )
    .join('');

  const mistakesHtml = (Array.isArray(tut.mistakes) ? tut.mistakes : [])
    .map((m) => `<li style="margin-bottom:6px;">${escapeHtml(typeof m === 'string' ? m : m.text || '')}</li>`)
    .join('');

  const checklistHtml = (Array.isArray(tut.checklist) ? tut.checklist : [])
    .map((c) => `<li style="margin-bottom:6px;">☐ ${escapeHtml(typeof c === 'string' ? c : c.text || '')}</li>`)
    .join('');

  const docHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(tut.title)} — Step-by-Step Guide</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Plus Jakarta Sans", sans-serif; max-width: 720px; margin: 36px auto; padding: 0 24px; color: #111827; background: #f7f5f0; line-height: 1.6; }
  h1 { font-size: 24px; margin-bottom: 6px; }
  .meta { font-size: 13px; font-weight: 700; text-transform: uppercase; color: #6b7280; margin-bottom: 18px; }
  .box { padding: 16px 18px; border-radius: 10px; margin: 20px 0; border: 1px solid #d6d3cd; background: #fff; }
</style>
</head>
<body>
  <div class="meta">AlterWords Tutorial · ${escapeHtml(String(tut.lane || '').toUpperCase())} · Lesson ${Number(tut.lessonNumber) || 1} · By ${escapeHtml(tut.agentName || tut.agentId)}</div>
  <h1>${escapeHtml(tut.title)}</h1>
  <p style="font-size:16px;color:#4b5563;margin-top:0;">${escapeHtml(tut.summary || '')}</p>
  <div class="box"><strong>Overview:</strong> ${escapeHtml(tut.intro || '')}</div>
  <h2>Step-by-Step Instructions</h2>
  ${stepsHtml}
  <div class="box" style="border-color:#fca5a5;background:#fef2f2;">
    <h3 style="margin-top:0;color:#991b1b;">Mistakes Everybody Makes</h3>
    <ul style="margin-bottom:0;">${mistakesHtml}</ul>
  </div>
  <div class="box">
    <h3 style="margin-top:0;">Action Checklist</h3>
    <ul style="list-style:none;padding-left:0;margin-bottom:0;">${checklistHtml}</ul>
  </div>
  <div class="box"><strong>Today's Exercise:</strong> ${escapeHtml(tut.exercise || '')}</div>
  <div class="box"><strong>Next Lesson:</strong> ${escapeHtml(tut.nextTeaser || '')}</div>
</body>
</html>`;

  const blob = new Blob([docHtml], { type: 'text/html;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = `${tut.tutorialId || 'tutorial'}-step-by-step-guide.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 2500);
}
