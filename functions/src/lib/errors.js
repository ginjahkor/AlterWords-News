// One list of error codes for every endpoint, the MCP server and OAuth.
// Each code has a fixed HTTP status. Callers get the code and a short message, never internal detail.

const STATUS_BY_CODE = {
  INVALID_INPUT: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  UNAVAILABLE: 503,
};

const CODE_BY_STATUS = Object.fromEntries(Object.entries(STATUS_BY_CODE).map(([c, s]) => [s, c]));

function codeForStatus(status) {
  return CODE_BY_STATUS[status] || (status >= 500 ? 'INTERNAL' : 'INVALID_INPUT');
}

function statusForCode(code) {
  return STATUS_BY_CODE[code] || 500;
}

module.exports = { STATUS_BY_CODE, codeForStatus, statusForCode };
