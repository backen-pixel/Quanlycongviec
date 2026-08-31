'use strict';

const crypto = require('node:crypto');

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function stableSerialize(value) {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableSerialize).join(',') + ']';
  return '{' + Object.keys(value).sort().map((key) => (
    JSON.stringify(key) + ':' + stableSerialize(value[key])
  )).join(',') + '}';
}

function digest(value) {
  return crypto.createHash('sha256').update(stableSerialize(value)).digest('hex');
}

module.exports = {
  clone,
  deepFreeze,
  digest,
  stableSerialize,
};
