// Tool results. Success is JSON text plus structuredContent. Errors are { code, message, retryable } with
// isError: true, so the model can read what went wrong and whether trying again can help. Internal detail
// never leaves the server.

const { logger } = require('firebase-functions');
const { HttpError } = require('../lib/http');

const RETRYABLE = new Set(['RATE_LIMITED', 'UNAVAILABLE', 'INTERNAL', 'CONFLICT']);

function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
}

function error(code, message, extra = {}) {
  const body = { error: { code, message, retryable: RETRYABLE.has(code), ...extra } };
  return { isError: true, content: [{ type: 'text', text: JSON.stringify(body) }], structuredContent: body };
}

function fromException(err, tool) {
  if (err instanceof HttpError) {
    const extra = err.extra && err.extra.retryAfterSeconds ? { retryAfterSeconds: err.extra.retryAfterSeconds } : {};
    return error(err.code, err.message, extra);
  }
  logger.error(`MCP tool ${tool} failed`, err);
  return error('INTERNAL', 'Something went wrong. Please try again later.');
}

module.exports = { ok, error, fromException };
