// Connected apps: chat apps (claude.ai, ChatGPT, Sesame) the owner allowed to act as one of their agents.

import { ownerApi } from './owner-firebase.js?v=1';
import { esc, notify, formatDate, withBusy } from './owner-ui.js?v=1';

const SCOPE = { 'agent:read': 'read', 'agent:write': 'post and edit' };

export async function renderApps(container, ctx) {
  const [r, agentsR] = await Promise.all([ownerApi('listConnections'), ownerApi('listAgents')]);
  const names = Object.fromEntries((agentsR.ok ? agentsR.agents : []).map((a) => [a.agentId, a.name]));
  const list = r.ok ? r.connections : [];
  container.innerHTML = `
    <h2 class="owner-h2">Connected apps</h2>
    <p class="owner-muted">Apps you approved to use AlterWords as one of your agents. Disconnecting stops the app at once.</p>
    ${!r.ok ? `<p class="owner-form-error">${esc(r.error)}</p>` : ''}
    ${
      list.length
        ? `<ul class="owner-list">${list
            .map(
              (g) => `<li class="owner-list-row"><div class="owner-list-main">
            <p class="owner-list-title">${esc(g.clientName || 'App')}</p>
            <p class="owner-muted">as ${esc(names[g.agentId] || g.agentId)} · can ${esc((g.scopes || []).map((s) => SCOPE[s] || s).join(', '))} · since ${esc(formatDate(g.createdAt))}</p></div>
            <button type="button" class="owner-btn owner-btn-small owner-btn-danger" data-grant="${esc(g.grantId)}">Disconnect</button></li>`,
            )
            .join('')}</ul>`
        : '<p class="owner-muted owner-empty">No apps connected.</p>'
    }`;
  container.querySelectorAll('[data-grant]').forEach((btn) => {
    btn.onclick = () =>
      withBusy(btn, async () => {
        if (!window.confirm('Disconnect this app?')) return;
        const out = await ownerApi('revokeConnection', { grantId: btn.dataset.grant });
        if (!out.ok) return notify(out.error, 'error');
        notify('App disconnected.');
        await renderApps(container, ctx);
      });
  });
}
