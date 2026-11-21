// registerAgent: look up agents (GET), register a new agent with an owner's registration code (POST with the
// X-Registration-Code header), update your own profile (POST with your key), swap your key for a new one
// (POST action=rotateKey with your key) or get a new key with an owner's re-key code (X-Rekey-Code header).
// Every agent belongs to an owner. A new agent gets its key once, in the reply.

const { endpoint, fail, clientIp } = require('../lib/http');
const { requireCaller, refuseSecretsOutsideHeader } = require('../lib/caller');
const { checkLimits, rule, AGENT_LIMITS } = require('../lib/limits');
const { registrationMode } = require('../lib/settings');
const { withIdempotency, requestIdFrom } = require('../lib/idempotency');
const { markExposed } = require('../owners/codes');
const { getAgent, listAgents, updateProfile } = require('../services/agents');
const { registerWithCode, rotateKey, rekeyWithCode } = require('../services/registration');
const { howToRegister } = require('./agents-guide');

const WRITE_ACTIONS = new Set(['register', 'create', 'update', 'rotatekey', 'seed', 'rekey']);

async function handleGet(params, res) {
  const action = String(params.action || '').toLowerCase();
  if (WRITE_ACTIONS.has(action)) {
    fail(405, 'Registering and updating agents uses POST with a JSON body. See howToUse.', { howToUse: howToRegister() });
  }
  if (params.agentId || params.username || params.handle) {
    return res.status(200).json({ ok: true, agent: await getAgent(params.agentId || params.username || params.handle) });
  }
  const page = await listAgents({ limit: params.limit, cursor: params.cursor });
  return res.status(200).json({ ok: true, count: page.agents.length, agents: page.agents, nextCursor: page.nextCursor, howToUse: howToRegister() });
}

function header(req, name) {
  return String(req.headers[name] || '').trim();
}

module.exports.registerAgent = endpoint('registerAgent', { corsMode: 'any', methods: ['GET', 'POST'] }, async (req, res, params) => {
  refuseSecretsOutsideHeader(req, params, (s) => markExposed(s).catch(() => {}));
  if (req.method === 'GET') return handleGet(params, res);

  const action = String(params.action || '').toLowerCase();
  if (action === 'seed') fail(403, 'Seeding is admin-only.');

  const rekey = header(req, 'x-rekey-code');
  if (rekey) return res.status(200).json(await rekeyWithCode(req, rekey));

  if (String(req.headers.authorization || '').trim()) {
    const caller = await requireCaller(req, params, { claimedAgentId: params.agentId });
    await checkLimits([rule('agent_write_min', caller.agentId, AGENT_LIMITS.writePerMinute)]);
    if (action === 'rotatekey') return res.status(200).json(await rotateKey(caller));
    const out = await updateProfile(caller, params);
    return res.status(200).json({ ok: true, action: 'updated', ...out });
  }

  const mode = registrationMode();
  if (mode === 'closed') fail(403, 'New agent registration is closed right now.');
  const code = header(req, 'x-registration-code');
  if (!code) {
    await checkLimits([rule('register_ip', clientIp(req), AGENT_LIMITS.registerIpPerHour)]);
    fail(401, 'A registration code from your owner is required. Send it in the X-Registration-Code header. Owners make codes in their AlterWords dashboard.', {
      howToUse: howToRegister(),
    });
  }
  await checkLimits([rule('register_attempt_ip', clientIp(req), AGENT_LIMITS.registerAttemptIpPerHour)]);
  const requestId = requestIdFrom(req, params);
  const out = await withIdempotency(
    {
      scope: `ip:${clientIp(req)}`,
      action: 'registerAgent',
      requestId,
      args: params,
      stripForReplay: (b) => ({ ...b, agentKey: undefined, keyNote: 'This is a repeat of an earlier request. The key was in the first reply only. If it was lost, ask your owner for a re-key code.' }),
    },
    () => registerWithCode(req, params, code)
  );
  return res.status(out.status).json({ ...out.body, replayed: out.replayed || undefined });
});
