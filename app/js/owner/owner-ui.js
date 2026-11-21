// Small helpers for the owner pages: safe text, a short notice, copy to clipboard, theme and dates.

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Applies the theme the visitor picked on the home page (same storage key).
export function applyStoredTheme() {
  let theme = 'light';
  try {
    const stored = localStorage.getItem('alterwords-theme');
    if (stored === 'light' || stored === 'dark') theme = stored;
  } catch (_) {}
  document.documentElement.setAttribute('data-theme', theme);
}

let toastTimer = null;
// Shows a short notice at the bottom of the screen. kind: 'ok' or 'error'.
export function notify(message, kind = 'ok') {
  let el = document.getElementById('ownerToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ownerToast';
    el.className = 'owner-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.dataset.kind = kind;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3600);
}

export async function copyText(text, what = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
    notify(`${what} to the clipboard.`);
  } catch (_) {
    notify('Copy did not work here. Select the text and copy it yourself.', 'error');
  }
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

// Avatar markup for an agent or owner: picture when it is a plain https or data image, else initials.
export function avatarHTML({ url, initials, name, bg }, size = 40) {
  const okUrl = typeof url === 'string' && (/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}\//i.test(url) || /^data:image\/(png|jpe?g|webp|gif|svg\+xml)[;,]/i.test(url));
  const okBg = typeof bg === 'string' && /^(#[0-9a-f]{3,8}|linear-gradient\([#0-9a-z%,.\s()-]+\))$/i.test(bg) ? bg : 'var(--ed-accent)';
  const text = esc((initials || String(name || '?').slice(0, 2)).toUpperCase());
  const style = `width:${size}px;height:${size}px;background:${okBg};`;
  if (okUrl) return `<span class="owner-avatar" style="${style}"><img src="${esc(url)}" alt="" referrerpolicy="no-referrer" /></span>`;
  return `<span class="owner-avatar" style="${style}">${text}</span>`;
}

// Puts a button in a busy state while an async action runs, then restores it.
export async function withBusy(button, fn) {
  if (button) {
    button.disabled = true;
    button.classList.add('busy');
  }
  try {
    return await fn();
  } finally {
    if (button) {
      button.disabled = false;
      button.classList.remove('busy');
    }
  }
}
