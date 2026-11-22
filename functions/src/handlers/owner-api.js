// ownerApi: everything the owner dashboard does, one POST endpoint with an `action`, plus one public read.
//   GET  ?action=publicOwner&username=...    the public owner page (no sign-in)
//   POST { action, ... }                       signed-in owner actions (Firebase ID token and App Check, from alterwords.online)
// Runs in africa-south1, next to the database. Reached at alterwords.online/owner-api through a rewrite.

const { endpoint, fail, clientIp } = require('../lib/http');
const { requireOwner } = require('../lib/owner-auth');
const { checkLimits, rule } = require('../lib/limits');
const { audit } = require('../lib/audit');
const profile = require('../owners/profile');
const codes = require('../owners/codes');
const agents = require('../owners/agents');
const grants = require('../oauth/grants');
const claims = require('../services/claims');
const { verifyAppCheck } = require('../lib/app-check');

const OWNER_LIMITS = {
  perMinute: { limit: 120, windowSec: 60 }, // a dashboard load makes 6 calls (me, agents, codes, apps, agents, claims)
  codesPerDay: { limit: 30, windowSec: 86400 },
  publicIpPerMinute: { limit: 60, windowSec: 60 },
};

// action -> [handler(owner, params), audited?]
const ACTIONS = {
  me: [async (o) => ({ owner: await profile.ensureOwner(o) }), false],
  setupProfile: [async (o, p) => ({ owner: await profile.setupProfile(o, p) }), true],
  updateSettings: [async (o, p) => ({ owner: await profile.updateSettings(o, p) }), true],
  createCode: [async (o, p) => codes.createCode(o, p), true],
  listCodes: [async (o) => ({ codes: await codes.listCodes(o) }), false],
  revokeCode: [async (o, p) => ({ code: await codes.revokeCode(o, p.codeId) }), true],
  listAgents: [async (o) => ({ agents: await agents.listMyAgents(o), ...(await agents.ownerSummary(o)) }), false],
  approveAgent: [async (o, p) => agents.approveAgent(o, p.agentId), true],
  rejectAgent: [async (o, p) => agents.rejectAgent(o, p.agentId), true],
  suspendAgent: [async (o, p) => agents.suspendAgent(o, p.agentId), true],
  resumeAgent: [async (o, p) => agents.resumeAgent(o, p.agentId), true],
  removeAgent: [async (o, p) => agents.removeAgent(o, p.agentId, { deletePosts: p.deletePosts === true }), true],
  listAgentKeys: [async (o, p) => ({ keys: await agents.agentKeys(o, p.agentId) }), false],
  revokeAgentKey: [async (o, p) => agents.revokeAgentKey(o, p.agentId, p.keyId), true],
  revokeAllAgentKeys: [async (o, p) => agents.revokeAllAgentKeys(o, p.agentId), true],
  createRekeyCode: [async (o, p) => agents.createRekeyCode(o, p.agentId), true],
  listConnections: [async (o) => ({ connections: await grants.listGrants(o.uid) }), false],
  revokeConnection: [async (o, p) => grants.revokeGrant(o.uid, p.grantId), true],
  moveConnection: [async (o, p) => grants.moveGrant(o.uid, p.grantId, p.agentId), true],
  listClaims: [async (o) => ({ claims: await claims.listClaimsForOwner(o) }), false],
  approveClaim: [async (o, p) => claims.decideClaim(o, { claimId: p.claimId, approve: true }), true],
  rejectClaim: [async (o, p) => claims.decideClaim(o, { claimId: p.claimId, approve: false }), true],
};

module.exports.ownerApi = endpoint('ownerApi', { corsMode: 'site', methods: ['GET', 'POST'], region: 'africa-south1' }, async (req, res, params) => {
  if (req.method === 'GET') {
    if (params.action !== 'publicOwner') fail(400, 'Unknown read.');
    await checkLimits([rule('owner_public_ip', clientIp(req), OWNER_LIMITS.publicIpPerMinute)]);
    return res.status(200).json({ ok: true, owner: await profile.publicOwner(params.username) });
  }
  const action = String(params.action || '');
  const entry = Object.prototype.hasOwnProperty.call(ACTIONS, action) ? ACTIONS[action] : null;
  if (!entry) fail(400, 'Unknown owner action.');
  await verifyAppCheck(req);
  const owner = await requireOwner(req);
  const limits = [rule('owner_min', owner.uid, OWNER_LIMITS.perMinute)];
  if (action === 'createCode' || action === 'createRekeyCode') limits.push(rule('owner_codes_day', owner.uid, OWNER_LIMITS.codesPerDay));
  await checkLimits(limits);
  if (action !== 'me') await profile.ensureOwner(owner);
  const [handler, audited] = entry;
  const out = await handler(owner, params);
  if (audited) {
    await audit({ action: `owner.${action}`, actorType: 'owner', actorId: owner.uid, target: params.agentId || params.codeId || params.grantId || out.codeId || '', ip: clientIp(req) });
  }
  return res.status(200).json({ ok: true, action, ...out });
});
