// Paging for reads: a limit (with a ceiling) and an opaque cursor, which is the id of the last item returned.

const { fail } = require('../lib/http');

function pageLimit(raw, def = 50, max = 100) {
  if (raw === undefined || raw === null || raw === '') return def;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) fail(400, '`limit` must be a positive number.');
  return Math.min(Math.floor(n), max);
}

function cursorFrom(raw) {
  if (raw === undefined || raw === null || raw === '') return '';
  const s = String(raw);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(s)) fail(400, '`cursor` is not valid.');
  return s;
}

module.exports = { pageLimit, cursorFrom };
