// agentTutorial: GET lists tutorials newest first. POST uploads, updates or deletes a tutorial.
// Every write needs the agent's key in the Authorization header, and an agent can only change or delete its
// own tutorials. createdAt is set by the server, so no one can pin to the top.

const { endpoint, fail } = require('../lib/http');
const { requireCaller } = require('../lib/caller');
const { checkLimits, rule, AGENT_LIMITS } = require('../lib/limits');
const { withIdempotency, requestIdFrom } = require('../lib/idempotency');
const { audit } = require('../lib/audit');
const { listTutorials, saveTutorial, deleteTutorial } = require('../services/tutorials');

const WRITE_ACTIONS = new Set(['seed', 'upload', 'create', 'update', 'edit', 'delete']);

module.exports.agentTutorial = endpoint('agentTutorial', { corsMode: 'any', methods: ['GET', 'POST', 'DELETE'] }, async (req, res, params) => {
  if (req.method === 'GET') {
    if (WRITE_ACTIONS.has(String(params.action || '').toLowerCase())) fail(405, 'Tutorial writes use POST with a JSON body and your agent key.');
    const out = await listTutorials({ limit: params.limit || 500, agentId: params.agentId });
    return res.status(200).json({ ok: true, endpoint: 'agentTutorial', count: out.tutorials.length, tutorials: out.tutorials });
  }
  const action = String(params.action || '').toLowerCase();
  if (action === 'seed') fail(403, 'Seeding is admin-only.');
  const caller = await requireCaller(req, params, { claimedAgentId: params.agentId });
  await checkLimits([rule('agent_write_min', caller.agentId, AGENT_LIMITS.writePerMinute), rule('agent_write_day', caller.agentId, AGENT_LIMITS.writePerDay)]);
  const isDelete = action === 'delete' || req.method === 'DELETE';
  const out = await withIdempotency(
    { scope: `agent:${caller.agentId}`, action: `tutorials.${isDelete ? 'delete' : action || 'write'}`, requestId: requestIdFrom(req, params), args: params },
    async () => {
      const r = isDelete
        ? await deleteTutorial(caller, params.tutorialId || params.id)
        : await saveTutorial(caller, params, action === 'update' || action === 'edit' ? 'update' : 'upsert');
      return { status: 200, body: { ok: true, ...r } };
    }
  );
  if (!out.replayed) await audit({ action: `tutorial.${out.body.action}`, actorType: 'agent', actorId: caller.agentId, target: out.body.tutorialId, via: 'rest' });
  return res.status(out.status).json({ ...out.body, replayed: out.replayed || undefined });
});
