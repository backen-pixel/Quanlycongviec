const { factoryError } = require('./errors');
const { types: utilTypes } = require('node:util');

const DEFAULT_MAX_JSON_DEPTH = 64;
const DEFAULT_MAX_JSON_NODES = 50000;
const DEFAULT_MAX_JSON_STRING_BYTES = 1024 * 1024;
const DEFAULT_MAX_JSON_TOTAL_STRING_BYTES = 4 * 1024 * 1024;

function fail(code, message, path, value) {
  const tag = value == null ? String(value) : Object.prototype.toString.call(value);
  throw factoryError(code, message + ' tại ' + path + '.', { path, value_type: tag });
}

function assertPlainJsonValue(value, options = {}, path = '$', ancestors = new WeakSet(), context = null, depth = 0) {
  const {
    unsupported_code: unsupportedCode = 'CANONICAL_VALUE_UNSUPPORTED',
    cycle_code: cycleCode = 'CANONICAL_CYCLE_DENIED',
    budget_code: budgetCode = 'CANONICAL_BUDGET_EXCEEDED',
    max_depth: maxDepth = DEFAULT_MAX_JSON_DEPTH,
    max_nodes: maxNodes = DEFAULT_MAX_JSON_NODES,
    max_string_bytes: maxStringBytes = DEFAULT_MAX_JSON_STRING_BYTES,
    max_total_string_bytes: maxTotalStringBytes = DEFAULT_MAX_JSON_TOTAL_STRING_BYTES,
  } = options;
  const budget = context || {
    nodes: 0,
    stringBytes: 0,
    maxDepth,
    maxNodes,
    maxStringBytes,
    maxTotalStringBytes,
  };
  budget.nodes += 1;
  if (!Number.isInteger(budget.maxDepth) || budget.maxDepth < 1
    || !Number.isInteger(budget.maxNodes) || budget.maxNodes < 1
    || !Number.isInteger(budget.maxStringBytes) || budget.maxStringBytes < 1
    || !Number.isInteger(budget.maxTotalStringBytes) || budget.maxTotalStringBytes < 1
    || depth > budget.maxDepth || budget.nodes > budget.maxNodes) {
    fail(budgetCode, 'JSON input vượt canonical resource budget', path, value);
  }
  if (typeof value === 'string') {
    const stringBytes = Buffer.byteLength(value, 'utf8');
    budget.stringBytes += stringBytes;
    if (stringBytes > budget.maxStringBytes
      || budget.stringBytes > budget.maxTotalStringBytes) {
      fail(budgetCode, 'JSON string/key vượt UTF-8 byte budget', path, value);
    }
    return true;
  }
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(unsupportedCode, 'JSON chỉ chấp nhận finite number', path, value);
    return true;
  }
  if (['undefined', 'function', 'symbol', 'bigint'].includes(typeof value)) {
    fail(unsupportedCode, 'Giá trị không JSON-compatible', path, value);
  }
  if (!value || typeof value !== 'object') {
    fail(unsupportedCode, 'Giá trị không JSON-compatible', path, value);
  }
  if (utilTypes.isProxy(value)) {
    fail(unsupportedCode, 'Proxy object không được phép trong canonical/evidence input', path, value);
  }
  if (ancestors.has(value)) fail(cycleCode, 'JSON object có circular reference', path, value);

  ancestors.add(value);
  if (Array.isArray(value)) {
    if (value.length > budget.maxNodes - budget.nodes) {
      fail(budgetCode, 'JSON array vượt node budget', path, value);
    }
    if (Object.getOwnPropertySymbols(value).length) {
      fail(unsupportedCode, 'JSON array không được có Symbol property', path, value);
    }
    const ownNames = Object.getOwnPropertyNames(value);
    const expectedNames = Array.from({ length: value.length }, (_, index) => String(index)).concat('length');
    if (ownNames.length !== expectedNames.length
      || ownNames.some((name, index) => name !== expectedNames[index])) {
      fail(unsupportedCode, 'Sparse array hoặc array có hidden/custom property không được phép', path, value);
    }
    const enumerableKeys = Object.keys(value);
    if (enumerableKeys.length !== value.length
      || enumerableKeys.some((key, index) => key !== String(index))) {
      fail(unsupportedCode, 'Sparse array hoặc array có custom property không được phép', path, value);
    }
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor?.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        fail(unsupportedCode, 'JSON array không được có accessor/hidden element', path + '[' + index + ']', value);
      }
    }
    value.forEach((item, index) => assertPlainJsonValue(item, options,
      path + '[' + index + ']', ancestors, budget, depth + 1));
    ancestors.delete(value);
    return true;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(unsupportedCode, 'Chỉ chấp nhận JSON plain object; Map/Set/Date/class instance bị deny', path, value);
  }
  if (Object.getOwnPropertySymbols(value).length) {
    fail(unsupportedCode, 'JSON plain object không được có Symbol key', path, value);
  }
  const ownNames = Object.getOwnPropertyNames(value);
  if (ownNames.length > budget.maxNodes - budget.nodes) {
    fail(budgetCode, 'JSON object vượt node budget', path, value);
  }
  for (const key of ownNames) {
    const keyBytes = Buffer.byteLength(key, 'utf8');
    budget.stringBytes += keyBytes;
    if (keyBytes > budget.maxStringBytes
      || budget.stringBytes > budget.maxTotalStringBytes) {
      fail(budgetCode, 'JSON string/key vượt UTF-8 byte budget', path, key);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      fail(unsupportedCode, 'JSON plain object không được có hidden/accessor property', path + '.' + key, value);
    }
    assertPlainJsonValue(descriptor.value, options,
      path + '.' + key, ancestors, budget, depth + 1);
  }
  ancestors.delete(value);
  return true;
}

module.exports = {
  DEFAULT_MAX_JSON_DEPTH,
  DEFAULT_MAX_JSON_NODES,
  DEFAULT_MAX_JSON_STRING_BYTES,
  DEFAULT_MAX_JSON_TOTAL_STRING_BYTES,
  assertPlainJsonValue,
};
