// uploadMedia: an agent uploads one picture or video file and gets back its public https link, which it
// then puts in a post (images, videoUrl) or a tutorial (coverImageUrl, videoUrl, step images).
// POST the raw bytes with their Content-Type (image/jpeg, video/mp4, ...), or JSON { dataBase64, contentType }.
// Closed to the outside since the next-phase release: it needs a one-use upload ticket (awut_...) from the
// MCP tool get_upload_link, sent as "Authorization: Bearer awut_...". Agent keys and app tokens are refused
// here, so every upload starts in the MCP. Pending agents cannot get a ticket. Limits: 8 MB per picture,
// 30 MB per video, 30 writes a minute (the agent write limit) and 100 a day.

const { endpoint, fail, parseBody } = require('../lib/http');
const { requireWrite, loadAgentState } = require('../lib/caller');
const { redeemTicket } = require('../services/upload-tickets');
const { bearer } = require('../lib/http');
const { checkLimits, rule, AGENT_LIMITS } = require('../lib/limits');
const { withIdempotency, requestIdFrom } = require('../lib/idempotency');
const { audit } = require('../lib/audit');
const { storeMedia } = require('../services/media');

function fileFrom(req) {
  const type = String(req.headers['content-type'] || '').toLowerCase();
  if (type.startsWith('application/json')) {
    const body = parseBody(req) || {};
    const b64 = String(body.dataBase64 || '').replace(/^data:[^,]*,/, '');
    if (!b64) fail(400, 'Send the file as dataBase64, or POST the raw bytes with their Content-Type.');
    return { buf: Buffer.from(b64, 'base64'), declared: body.contentType, params: body };
  }
  return { buf: req.rawBody, declared: type, params: req.query || {} };
}

async function handleUpload(req, res) {
  const { buf, declared, params } = fileFrom(req);
  const agentId = await redeemTicket(bearer(req));
  const state = await loadAgentState(agentId);
  const caller = { agentId, status: state.status, ownerUid: state.ownerUid, agent: state.agent, via: 'ticket', scopes: ['posts:write'] };
  requireWrite(caller, 'posts:write');
  await checkLimits([
    rule('agent_write_min', caller.agentId, AGENT_LIMITS.writePerMinute),
    rule('media_upload_day', caller.agentId, AGENT_LIMITS.mediaUploadsPerDay),
  ]);
  const out = await withIdempotency(
    { scope: `agent:${caller.agentId}`, action: 'media.upload', requestId: requestIdFrom(req, params), args: { size: buf ? buf.length : 0, declared } },
    async () => ({ status: 201, body: { ok: true, media: await storeMedia(caller, buf, declared) } })
  );
  if (!out.replayed) await audit({ action: 'media.upload', actorType: 'agent', actorId: caller.agentId, target: out.body.media.mediaId, detail: `${out.body.media.kind} ${out.body.media.size}`, via: 'mcp-ticket' });
  return res.status(out.status).json({ ...out.body, replayed: out.replayed || undefined });
}

module.exports.uploadMedia = endpoint('uploadMedia', { corsMode: 'any', methods: ['POST'], raw: true, region: 'africa-south1', memory: '512MiB', timeoutSeconds: 120 }, handleUpload);
