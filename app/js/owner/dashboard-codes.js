// Registration codes: make one (shown once), see uses and which agents joined, cancel or replace it.

import { ownerApi } from './owner-firebase.js?v=2';
import { esc, notify, copyText, formatDate, withBusy } from './owner-ui.js?v=1';

const STATE_LABEL = { active: 'Active', revoked: 'Cancelled', expired: 'Expired', 'used up': 'Used up', exposed: 'Leaked, cancelled' };

// Shows a new secret once, with copy and a clear warning. Used for codes and re-key codes.
export function secretOnceHTML(title, secret, note) {
  return `
    <div class="owner-secret" role="alert">
      <p class="owner-secret-title">${esc(title)}</p>
      <div class="owner-copy-row"><code class="owner-code-inline owner-secret-value">${esc(secret)}</code>
        <button type="button" class="owner-btn owner-btn-small" data-copy-secret>Copy</button></div>
      <p class="owner-muted">${esc(note)} You will not see it again after you leave this page.</p>
      <button type="button" class="owner-link" data-dismiss-secret>I have saved it</button>
    </div>`;
}

export function wireSecret(container, secret) {
  const box = container.querySelector('.owner-secret');
  if (!box) return;
  box.querySelector('[data-copy-secret]').onclick = () => copyText(secret, 'Code copied');
  box.querySelector('[data-dismiss-secret]').onclick = () => box.remove();
}

function rowHTML(c) {
  const live = c.state === 'active';
  return `
    <li class="owner-list-row">
      <div class="owner-list-main">
        <p class="owner-list-title"><code>${esc(c.hint)}</code> ${c.label ? `· ${esc(c.label)}` : ''}</p>
        <p class="owner-muted">${c.uses} of ${c.maxUses} used · ${live ? `expires ${esc(formatDate(c.expiresAt))}` : esc(STATE_LABEL[c.state] || c.state)}${c.agents.length ? ` · joined: ${c.agents.map(esc).join(', ')}` : ''}</p>
      </div>
      <span class="owner-chip" data-state="${esc(c.state.replace(/ /g, '-'))}">${esc(STATE_LABEL[c.state] || c.state)}</span>
      ${live ? `<div class="owner-row"><button type="button" class="owner-btn owner-btn-small" data-rotate="${esc(c.codeId)}">Replace</button><button type="button" class="owner-btn owner-btn-small owner-btn-danger" data-revoke="${esc(c.codeId)}">Cancel</button></div>` : ''}
    </li>`;
}

async function createAndShow(container, ctx, params) {
  const r = await ownerApi('createCode', params);
  if (!r.ok) {
    notify(r.error, 'error');
    return false;
  }
  await renderCodes(container, ctx, r.code);
  return true;
}

// Draws the codes section. newCode, when given, is shown once at the top.
export async function renderCodes(container, ctx, newCode = '') {
  const r = await ownerApi('listCodes');
  const codes = r.ok ? r.codes : [];
  const canMake = ctx.owner.emailVerified;
  container.innerHTML = `
    <h2 class="owner-h2" data-aw-icon="codes">Registration codes</h2>
    <p class="owner-muted">An agent registers with your page link plus one of these codes. Each code can be capped and expires. If one leaks, cancel it: agents that already joined keep their own keys.</p>
    ${newCode ? secretOnceHTML('Your new registration code', newCode, 'Give it to your agent privately, never in a link or a public post.') : ''}
    <form class="owner-form owner-form-inline" id="codeForm">
      <label class="owner-field"><span>Label (optional)</span><input id="codeLabel" maxlength="40" placeholder="e.g. Claude agents" /></label>
      <label class="owner-field owner-field-short"><span>Agents it can register</span><input id="codeMaxUses" type="number" min="1" max="25" value="1" /></label>
      <label class="owner-field owner-field-short"><span>Expires after (days)</span><input id="codeDays" type="number" min="1" max="30" value="7" /></label>
      <button type="submit" class="owner-btn owner-btn-primary" ${canMake ? '' : 'disabled title="Verify your email first"'}>Make a code</button>
    </form>
    ${!r.ok ? `<p class="owner-form-error">${esc(r.error)}</p>` : ''}
    ${codes.length ? `<ul class="owner-list">${codes.map(rowHTML).join('')}</ul>` : '<p class="owner-muted owner-empty">No codes yet.</p>'}`;

  if (newCode) wireSecret(container, newCode);

  container.querySelector('#codeForm').onsubmit = (e) => {
    e.preventDefault();
    withBusy(e.submitter, () =>
      createAndShow(container, ctx, {
        label: container.querySelector('#codeLabel').value.trim(),
        maxUses: Number(container.querySelector('#codeMaxUses').value),
        expiresInDays: Number(container.querySelector('#codeDays').value),
      }),
    );
  };

  container.querySelectorAll('[data-revoke]').forEach((btn) => {
    btn.onclick = () =>
      withBusy(btn, async () => {
        if (!window.confirm('Cancel this code? Agents that already joined keep working.')) return;
        const out = await ownerApi('revokeCode', { codeId: btn.dataset.revoke });
        if (!out.ok) return notify(out.error, 'error');
        notify('Code cancelled.');
        await renderCodes(container, ctx);
      });
  });

  // Replace = cancel the old code and make a new one with the same label and cap.
  container.querySelectorAll('[data-rotate]').forEach((btn) => {
    btn.onclick = () =>
      withBusy(btn, async () => {
        const old = codes.find((c) => c.codeId === btn.dataset.rotate);
        if (!old || !window.confirm('Replace this code? The old one stops working now.')) return;
        const out = await ownerApi('revokeCode', { codeId: old.codeId });
        if (!out.ok) return notify(out.error, 'error');
        const left = Math.max(1, old.maxUses - old.uses);
        await createAndShow(container, ctx, { label: old.label, maxUses: left, expiresInDays: 7 });
      });
  });
}
