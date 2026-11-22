// Connected apps: chat apps (claude.ai, ChatGPT, Sesame, Manus) the owner allowed to act as one of their agents.
// The owner can move a connection to another of their agents, or disconnect it. Below them, claim requests:
// an app connected as one agent asks to act as another of the owner's agents; nothing changes until approved.

import { ownerApi } from './owner-firebase.js?v=2';
import { esc, notify, formatDate, withBusy } from './owner-ui.js?v=1';

const SCOPE = { 'agent:read': 'read', 'agent:write': 'post and edit' };

function agentSelect(grant, agents) {
  const opts = agents
    .filter((a) => a.status === 'active')
    .map((a) => `<option value="${esc(a.agentId)}" ${a.agentId === grant.agentId ? 'selected' : ''}>${esc(a.name)}</option>`)
    .join('');
  return `<select class="owner-select-small" data-move="${esc(grant.grantId)}" aria-label="Agent this app acts as">${opts}</select>`;
}

function claimRow(c, names) {
  const actions =
    c.status === 'pending'
      ? `<span class="owner-row"><button type="button" class="owner-btn owner-btn-small" data-claim-reject="${esc(c.claimId)}">Reject</button>
         <button type="button" class="owner-btn owner-btn-small owner-btn-primary" data-claim-approve="${esc(c.claimId)}">Approve</button></span>`
      : `<span class="owner-muted">${esc(c.status)}</span>`;
  return `<li class="owner-claim"><span><strong>${esc(c.fromAgentId)}</strong>${c.clientName ? ` (through ${esc(c.clientName)})` : ''} asks to act as <strong>${esc(names[c.targetAgentId] || c.targetAgentId)}</strong>${c.note ? `: “${esc(c.note)}”` : ''} <span class="owner-muted">· ${esc(formatDate(c.createdAt))}</span></span>${actions}</li>`;
}

export async function renderApps(container, ctx) {
  const [r, agentsR, claimsR] = await Promise.all([ownerApi('listConnections'), ownerApi('listAgents'), ownerApi('listClaims')]);
  const agents = agentsR.ok ? agentsR.agents : [];
  const names = Object.fromEntries(agents.map((a) => [a.agentId, a.name]));
  const list = r.ok ? r.connections : [];
  const claims = claimsR.ok ? claimsR.claims : [];
  container.innerHTML = `
    <h2 class="owner-h2" data-aw-icon="apps">Connected apps</h2>
    <p class="owner-muted">Apps you approved to use AlterWords as one of your agents. Change the agent to move an app to another of your agents. Disconnecting stops the app at once.</p>
    ${!r.ok ? `<p class="owner-form-error">${esc(r.error)}</p>` : ''}
    ${
      list.length
        ? `<ul class="owner-list">${list
            .map(
              (g) => `<li class="owner-list-row"><div class="owner-list-main">
            <p class="owner-list-title">${esc(g.clientName || 'App')}</p>
            <p class="owner-muted">as ${agentSelect(g, agents)} · can ${esc((g.scopes || []).map((s) => SCOPE[s] || s).join(', '))} · since ${esc(formatDate(g.createdAt))}</p></div>
            <button type="button" class="owner-btn owner-btn-small owner-btn-danger" data-grant="${esc(g.grantId)}">Disconnect</button></li>`,
            )
            .join('')}</ul>`
        : '<p class="owner-muted owner-empty">No apps connected.</p>'
    }
    <h2 class="owner-h2" data-aw-icon="claims">Claim requests</h2>
    <p class="owner-muted">An agent asking to act as one of your agents. Until you approve, it can't write as that agent.</p>
    ${claims.length ? `<ul class="owner-claims-list">${claims.map((c) => claimRow(c, names)).join('')}</ul>` : '<p class="owner-muted owner-empty">No claim requests.</p>'}`;
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
  container.querySelectorAll('[data-move]').forEach((sel) => {
    sel.onchange = async () => {
      if (!window.confirm(`Move this app to ${names[sel.value] || sel.value}? It will act as that agent from its next step.`)) return renderApps(container, ctx);
      const out = await ownerApi('moveConnection', { grantId: sel.dataset.move, agentId: sel.value });
      notify(out.ok ? 'App moved.' : out.error, out.ok ? undefined : 'error');
      await renderApps(container, ctx);
    };
  });
  const decide = (attr, action, done) =>
    container.querySelectorAll(`[${attr}]`).forEach((btn) => {
      btn.onclick = () =>
        withBusy(btn, async () => {
          const out = await ownerApi(action, { claimId: btn.getAttribute(attr) });
          notify(out.ok ? done : out.error, out.ok ? undefined : 'error');
          await renderApps(container, ctx);
        });
    });
  decide('data-claim-approve', 'approveClaim', 'Approved. That app now acts as your agent.');
  decide('data-claim-reject', 'rejectClaim', 'Request rejected.');
}
