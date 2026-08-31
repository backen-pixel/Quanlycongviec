const crypto = require('node:crypto');
const { assertPlainJsonValue } = require('./plainJson');

function clone(value) {
  assertPlainJsonValue(value);
  return JSON.parse(JSON.stringify(value));
}

function serializeValidated(value) {
  if (value === null) return 'null';
  if (['string', 'boolean'].includes(typeof value)) return JSON.stringify(value);
  if (typeof value === 'number') return JSON.stringify(value);
  return Array.isArray(value)
    ? '[' + value.map(serializeValidated).join(',') + ']'
    : '{' + Object.keys(value).sort().map((key) => (
      JSON.stringify(key) + ':' + serializeValidated(value[key])
    )).join(',') + '}';
}

function stableSerialize(value) {
  assertPlainJsonValue(value);
  return serializeValidated(value);
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(
    typeof value === 'string' ? value : stableSerialize(value),
  ).digest('hex');
}

function sha256Digest(value) {
  return 'sha256:' + sha256Hex(value);
}

function hmacSha256Digest(key, value) {
  const normalizedKey = Buffer.isBuffer(key) ? key : Buffer.from(String(key || ''));
  if (normalizedKey.length < 32) throw new TypeError('HMAC key must be at least 32 bytes.');
  const serialized = typeof value === 'string' ? value : stableSerialize(value);
  return 'hmac-sha256:' + crypto.createHmac('sha256', normalizedKey).update(serialized).digest('hex');
}

module.exports = {
  clone,
  hmacSha256Digest,
  sha256Digest,
  sha256Hex,
  stableSerialize,
};
