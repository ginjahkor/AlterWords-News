// AlterWords icons: the filled style of the grid icons (white on black, black on white via currentColor),
// each carrying the brand's small four-point star cut out of the shape. The star is the exact shape from
// the owner's icon set (wifi/pin/chat .svg): two quadratic curves per quarter, controls at 0.3 of its size.
// The two grid icons (tutorial, profile) are the live paths unchanged; only the star mask is added.

let uid = 0;

function starPath(cx, cy, s) {
  const f = (n) => n.toFixed(2);
  const c = 0.3 * s;
  return `M${f(cx)} ${f(cy - s)} Q${f(cx + c)} ${f(cy - c)} ${f(cx + s)} ${f(cy)} Q${f(cx + c)} ${f(cy + c)} ${f(cx)} ${f(cy + s)} `
    + `Q${f(cx - c)} ${f(cy + c)} ${f(cx - s)} ${f(cy)} Q${f(cx - c)} ${f(cy - c)} ${f(cx)} ${f(cy - s)}Z`;
}

// body: the shape's own SVG markup; star: [cx, cy, size] of the cut-out star.
const ICONS = {
  home: { body: '<path d="M3.5 10.2 12 3.2l8.5 7V20a1 1 0 0 1-1 1H15v-5.5H9V21H4.5a1 1 0 0 1-1-1z"/>', star: [12, 10.6, 1.9] },
  trending: { body: '<path d="M12 2.5c.9 3.6 5.6 5.6 5.6 11a5.6 5.6 0 0 1-11.2 0c0-2.3 1-3.9 2.2-5 .1 2 1 3.1 2.1 3.2-.3-3.6-.4-6.3 1.3-9.2z"/>', star: [12, 15.4, 1.9] },
  tutorial: { body: '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6" fill="none" stroke-width="2"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>', star: [12, 9.95, 1.7] },
  profile: { body: '<circle cx="12" cy="8" r="4.2"/><path d="M4 21a8 8 0 0 1 16 0z"/>', star: [12, 17.4, 2] },
  about: { body: '<circle cx="12" cy="12" r="9.2"/>', star: [12, 12, 3.2] },
  settings: { body: '<path d="M19.68 10.66 L21.6 10.8 L21.6 13.2 L19.68 13.34 L18.38 16.49 L19.7 17.9 L17.9 19.7 L16.49 18.38 L13.34 19.68 L13.2 21.6 L10.8 21.6 L10.66 19.68 L7.51 18.38 L6.1 19.7 L4.3 17.9 L5.62 16.49 L4.32 13.34 L2.4 13.2 L2.4 10.8 L4.32 10.66 L5.62 7.51 L4.3 6.1 L6.1 4.3 L7.51 5.62 L10.66 4.32 L10.8 2.4 L13.2 2.4 L13.34 4.32 L16.49 5.62 L17.9 4.3 L19.7 6.1 L18.38 7.51Z"/>', star: [12, 12, 3] },
  posts: { body: '<path d="M6 2.8h8.2L19 7.6V20a1.2 1.2 0 0 1-1.2 1.2H6A1.2 1.2 0 0 1 4.8 20V4A1.2 1.2 0 0 1 6 2.8z"/>', star: [11.9, 13.4, 2.6] },
  agents: { body: '<circle cx="9" cy="8" r="3.6"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0z"/><circle cx="17" cy="8.6" r="2.7"/><path d="M17.2 13.4A5.3 5.3 0 0 1 21.6 20h-4.4c0-2.6-.6-4.5 0-6.6z"/>', star: [9, 17.3, 1.6] },
  codes: { body: '<path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h6.4a1.5 1.5 0 0 1 1.06.44l8.6 8.6a1.5 1.5 0 0 1 0 2.12l-6.4 6.4a1.5 1.5 0 0 1-2.12 0l-8.6-8.6A1.5 1.5 0 0 1 3 10.9z"/>', star: [8, 8, 2] },
  apps: { body: '<rect x="3" y="3" width="7.6" height="7.6" rx="2"/><rect x="13.4" y="3" width="7.6" height="7.6" rx="2"/><rect x="3" y="13.4" width="7.6" height="7.6" rx="2"/><rect x="13.4" y="13.4" width="7.6" height="7.6" rx="2"/>', star: [17.2, 17.2, 2] },
  claims: { body: '<path d="M12 2.6 19.6 5.6v5.6c0 4.8-3.2 8.6-7.6 10.2-4.4-1.6-7.6-5.4-7.6-10.2V5.6z"/>', star: [12, 11.6, 3] },
  link: { body: '<circle cx="12" cy="12" r="9.2"/>', star: [12, 12, 3.2] },
};

export function iconSVG(name, size = 18) {
  const icon = ICONS[name];
  if (!icon) return '';
  const id = `awst${++uid}`;
  const [cx, cy, s] = icon.star;
  return `<svg class="aw-ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">`
    + `<defs><mask id="${id}"><rect width="24" height="24" fill="#fff"/><path d="${starPath(cx, cy, s)}" fill="#000" stroke="#000" stroke-width="0.5"/></mask></defs>`
    + `<g mask="url(#${id})">${icon.body}</g></svg>`;
}

function decorate(root) {
  const els = root.querySelectorAll ? root.querySelectorAll('[data-aw-icon]') : [];
  els.forEach((el) => {
    if (el.querySelector(':scope > svg.aw-ico')) return;
    el.insertAdjacentHTML('afterbegin', iconSVG(el.getAttribute('data-aw-icon'), Number(el.getAttribute('data-aw-icon-size')) || 18));
    el.classList.add('aw-has-ico');
  });
}

// Adds the icon to every element with data-aw-icon="name", now and whenever new content is rendered.
export function installIcons(root = document.body) {
  decorate(root);
  const obs = new MutationObserver((muts) => {
    for (const m of muts) m.addedNodes.forEach((n) => { if (n.nodeType === 1) { if (n.hasAttribute('data-aw-icon')) decorate(n.parentNode || n); decorate(n); } });
  });
  obs.observe(root, { childList: true, subtree: true });
  return obs;
}
