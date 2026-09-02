'use strict'; const { createHash, timingSafeEqual } = require('node:crypto');
const { calculatePackageSha256 } = require('../reg4/agent-registry'); const BASELINES = deepFreeze({
  parent: { commit: '057de036f9434b6acdd1951b556bc2cbd77cd881',
    tree: '6568ab8ecbb5355e6b883f833a6ff8070ebb0bdf', },
  reg4: { commit: '3def40122e4072f266c943bc4eb84d3164501339',
    tree: 'aef6c623ce7f549b560af46e73a7ee6d0abd35ae', source_blob: 'be69c77be7559f8fb2ccf896612e65e0f605b595',
  }, bos_ai1: {
    commit: 'f44c14365589b7ff9f1df2ce40185ef8ebece05f', tree: 'f17e4c4f699335ddad056310c8d70e3ed3df6909',
    source_blob: '05f51d90b4f187d95682b58f75430f88bad9f82d', test_blob: 'ece5780d08899d4b07caf846dec88452722074dd',
  }, });
const POLICY = deepFreeze({ maximum_request_cost_units: 12,
  minimum_quality_score: 80, maximum_latency_units: 50,
  maximum_adapter_invocations: 3, maximum_retries_per_model: 1,
  maximum_fallback_models: 1, });
const DECISIONS = Object.freeze({ ALLOW: 'ALLOW', DENY: 'DENY', STOP: 'STOP' }); const REASON_CODES = Object.freeze({
  OK: 'OK', DUPLICATE_REQUEST: 'DUPLICATE_REQUEST',
  INVALID_REQUEST: 'INVALID_REQUEST', BASELINE_MISMATCH: 'BASELINE_MISMATCH',
  AGENT_NOT_REGISTERED: 'AGENT_NOT_REGISTERED', PACKAGE_FINGERPRINT_MISMATCH: 'PACKAGE_FINGERPRINT_MISMATCH',
  AGENT_NOT_APPROVED: 'AGENT_NOT_APPROVED', AGENT_BLOCKED: 'AGENT_BLOCKED', AGENT_RETIRED: 'AGENT_RETIRED',
  REQUIRED_EVIDENCE_MISSING: 'REQUIRED_EVIDENCE_MISSING', MODEL_STATUS_CHANGED: 'MODEL_STATUS_CHANGED',
  POLICY_CHANGED: 'POLICY_CHANGED', CATALOG_CHANGED: 'CATALOG_CHANGED',
  AUTHORITY_DENIED: 'AUTHORITY_DENIED', COMPANY_CONTEXT_DENIED: 'COMPANY_CONTEXT_DENIED',
  POLICY_DENIED: 'POLICY_DENIED', DOMAIN_OWNER_REQUIRED: 'DOMAIN_OWNER_REQUIRED', D4_DENIED: 'D4_DENIED',
  SECRET_DETECTED: 'SECRET_DETECTED', CATALOG_DENIED: 'CATALOG_DENIED', INVALID_COST: 'INVALID_COST',
  REQUEST_COST_LIMIT: 'REQUEST_COST_LIMIT', COST_LIMIT_EXCEEDED: 'COST_LIMIT_EXCEEDED', COST_OVERFLOW: 'COST_OVERFLOW',
  BUDGET_DENIED: 'BUDGET_DENIED', BUDGET_EXHAUSTED: 'BUDGET_EXHAUSTED', NUMERIC_OVERFLOW: 'NUMERIC_OVERFLOW',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  REQUEST_IN_PROGRESS: 'REQUEST_IN_PROGRESS', CONTEXT_CHANGED: 'CONTEXT_CHANGED',
  DEPENDENCY_UNAVAILABLE: 'DEPENDENCY_UNAVAILABLE', AUDIT_UNAVAILABLE: 'AUDIT_UNAVAILABLE',
  ADAPTER_FAILURE: 'ADAPTER_FAILURE', OUTPUT_INVALID: 'OUTPUT_INVALID', OUTPUT_VALIDATION_FAILED: 'OUTPUT_VALIDATION_FAILED',
}); const REQUEST_KEYS = Object.freeze([
  'request_id', 'idempotency_key', 'agent_id', 'agent_version', 'package_sha256', 'reg4_baseline_commit', 'reg4_baseline_tree', 'bos_ai1_baseline_commit',
  'bos_ai1_baseline_tree', 'requester_id', 'company_id', 'use_case', 'data_class', 'payload', 'payload_sha256', 'claimed_role', 'claimed_permissions',
  'claimed_company_id', ]);
const REQUIRED_REQUEST_KEYS = Object.freeze(REQUEST_KEYS.filter((key) => ![ 'claimed_role', 'claimed_permissions', 'claimed_company_id',
].includes(key))); const AUTHORITY_KEYS = Object.freeze([
  'requester_id', 'active', 'company_id', 'role', 'permissions', 'agent_id', 'agent_version', 'package_sha256',
]); const COMPANY_KEYS = Object.freeze(['company_id', 'active', 'context_version']);
const POLICY_KEYS = Object.freeze([ 'company_id', 'policy_version', 'allowed_use_cases', 'allowed_data_classes',
  'allowed_models', 'd3_mode', ]);
const CATALOG_KEYS = Object.freeze(['catalog_version', 'models']); const MODEL_KEYS = Object.freeze([
  'model_id', 'version', 'adapter_id', 'provider', 'region', 'safety_class', 'data_classes', 'status', 'quality_score', 'cost_units', 'latency_units',
]); const BUDGET_KEYS = Object.freeze([
  'company_id', 'budget_version', 'limit_units', 'preexisting_spent_units', ]);
const OUTPUT_KEYS = Object.freeze(['schema_version', 'content', 'confidence']); const DATA_CLASSES = Object.freeze(['D0', 'D1', 'D2', 'D3', 'D4']);
const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,127}$/; const SEMVER_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/; const GIT_OID_PATTERN = /^[0-9a-f]{40}$/;
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/; const MAX_DEPTH = 10;
const MAX_NODES = 500; const MAX_STRING_LENGTH = 4096;
const MAX_ARRAY_LENGTH = 200; const MAX_OBJECT_KEYS = 200;
const ZERO_SHA256 = '0'.repeat(64); const decisionProvenance = new WeakMap();
const snapshotFailureProvenance = new WeakSet(); function decide(decision, reasonCode) {
  const marker = Object.freeze(Object.create(null)); decisionProvenance.set(marker, Object.freeze({ decision, reason_code: reasonCode }));
  throw marker; }
function provenDecision(value) { try {
    return decisionProvenance.get(value) || null; } catch {
    return null; }
} function snapshotFail() {
  const marker = Object.freeze(Object.create(null)); snapshotFailureProvenance.add(marker);
  throw marker; }
function isPlainObject(value) { try {
    return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
  } catch { return false;
  } }
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value); for (const key of Object.keys(value)) deepFreeze(value[key]);
  } return value;
} function snapshotData(value, depth = 0, state = { nodes: 0 }) {
  state.nodes += 1; if (state.nodes > MAX_NODES || depth > MAX_DEPTH) snapshotFail();
  if (value === null || typeof value === 'boolean') return value; if (typeof value === 'string') {
    if (value.length > MAX_STRING_LENGTH || value !== value.normalize('NFC') || /\p{Cc}/u.test(value)) { snapshotFail();
    } return value;
  } if (typeof value === 'number') {
    if (!Number.isFinite(value)) snapshotFail(); return value;
  } if (typeof value !== 'object') snapshotFail();
  let prototype; let ownKeys;
  let isArray; try {
    prototype = Object.getPrototypeOf(value); ownKeys = Reflect.ownKeys(value);
    isArray = Array.isArray(value); } catch {
    snapshotFail(); }
  if (ownKeys.some((key) => typeof key !== 'string')) snapshotFail(); if (isArray) {
    if (prototype !== Array.prototype) snapshotFail(); let lengthDescriptor;
    try { lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    } catch { snapshotFail();
    } if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, 'value') ||
        !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0 || lengthDescriptor.value > MAX_ARRAY_LENGTH) snapshotFail();
    const length = lengthDescriptor.value; const expected = Array.from({ length }, (_, index) => String(index));
    const permitted = new Set([...expected, 'length']); if (ownKeys.length !== length + 1 || ownKeys.some((key) => !permitted.has(key))) snapshotFail();
    const copy = []; for (const key of expected) {
      let descriptor; try {
        descriptor = Object.getOwnPropertyDescriptor(value, key); } catch {
        snapshotFail(); }
      if (!descriptor || descriptor.enumerable !== true || !Object.hasOwn(descriptor, 'value')) snapshotFail(); copy.push(snapshotData(descriptor.value, depth + 1, state));
    } return copy;
  } if (prototype !== Object.prototype || ownKeys.length > MAX_OBJECT_KEYS) snapshotFail();
  const copy = {}; for (const key of ownKeys.sort(compareAscii)) {
    let descriptor; try {
      descriptor = Object.getOwnPropertyDescriptor(value, key); } catch {
      snapshotFail(); }
    if (!descriptor || descriptor.enumerable !== true || !Object.hasOwn(descriptor, 'value')) snapshotFail(); copy[key] = snapshotData(descriptor.value, depth + 1, state);
  } return copy;
} function snapshotBoundary(value, reasonCode) {
  try { return snapshotData(value);
  } catch { decide(DECISIONS.DENY, reasonCode);
  } }
function exactObject(value, keys, required, reasonCode) { const copy = snapshotBoundary(value, reasonCode);
  if (!isPlainObject(copy)) decide(DECISIONS.DENY, reasonCode); const present = Object.keys(copy);
  if (present.some((key) => !keys.includes(key)) || required.some((key) => !Object.hasOwn(copy, key))) { decide(DECISIONS.DENY, reasonCode);
  } return copy;
} function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0; }
function stableJson(value) { if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`; return `{${Object.keys(value).sort(compareAscii).map((key) =>
    `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`; }
function hashValue(value) { return createHash('sha256').update(Buffer.from(stableJson(value), 'utf8')).digest('hex');
} function calculatePayloadSha256(payload) {
  return hashValue(snapshotData(payload)); }
function digestMatches(left, right) { return typeof left === 'string' && typeof right === 'string' &&
    SHA256_PATTERN.test(left) && SHA256_PATTERN.test(right) && timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
} function containsSecretText(value) {
  if (typeof value !== 'string') return false; return /-----BEGIN [A-Z ]*PRIVATE KEY-----/i.test(value) ||
    /\bAKIA[0-9A-Z]{16}\b/.test(value) || /\b(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}\b/.test(value) ||
    /\bBearer\s+[A-Za-z0-9._~+\/-]{8,}/i.test(value) || /\b(?:password|passwd|api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*\S{4,}/i.test(value);
} function containsSecret(value) {
  if (typeof value === 'string') return containsSecretText(value); if (Array.isArray(value)) return value.some(containsSecret);
  if (isPlainObject(value)) return Object.keys(value).some((key) => containsSecretText(key) || containsSecret(value[key]));
  return false; }
function requireToken(value, reasonCode = REASON_CODES.INVALID_REQUEST) { if (typeof value !== 'string' || !TOKEN_PATTERN.test(value) || value.includes('..') ||
      value.includes('//')) decide(DECISIONS.DENY, reasonCode); if (containsSecretText(value)) decide(DECISIONS.DENY, REASON_CODES.SECRET_DETECTED);
  return value; }
function requireSha(value, reasonCode = REASON_CODES.INVALID_REQUEST) { if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) decide(DECISIONS.DENY, reasonCode);
  return value; }
function requireGitOid(value, reasonCode = REASON_CODES.INVALID_REQUEST) { if (typeof value !== 'string' || !GIT_OID_PATTERN.test(value)) decide(DECISIONS.DENY, reasonCode);
  return value; }
function requireSemver(value, reasonCode) { if (typeof value !== 'string' || !SEMVER_PATTERN.test(value)) decide(DECISIONS.DENY, reasonCode);
  return value; }
function requireDenseUniqueTokens(value, minimum, reasonCode) { if (!Array.isArray(value) || value.length < minimum || value.length > MAX_ARRAY_LENGTH) {
    decide(DECISIONS.DENY, reasonCode); }
  const result = []; const seen = new Set();
  for (const item of value) { const token = requireToken(item, reasonCode);
    if (seen.has(token)) decide(DECISIONS.DENY, reasonCode); seen.add(token);
    result.push(token); }
  return result; }
function requireNonNegativeSafeInteger(value, reasonCode) { if (!Number.isSafeInteger(value) || value < 0) decide(DECISIONS.DENY, reasonCode);
  return value; }
function safeAdd(...values) { let total = 0;
  for (const value of values) { if (!Number.isSafeInteger(value) || value < 0 || total > Number.MAX_SAFE_INTEGER - value) {
      decide(DECISIONS.DENY, REASON_CODES.COST_OVERFLOW); }
    total += value; }
  return total; }
function safeMultiply(left, right) { if (!Number.isSafeInteger(left) || left < 0 || !Number.isSafeInteger(right) || right < 0 ||
      (left !== 0 && right > Math.floor(Number.MAX_SAFE_INTEGER / left))) { decide(DECISIONS.DENY, REASON_CODES.COST_OVERFLOW);
  } return left * right;
} function copyRequest(rawRequest) {
  const request = exactObject(rawRequest, REQUEST_KEYS, REQUIRED_REQUEST_KEYS, REASON_CODES.INVALID_REQUEST); for (const key of [
    'request_id', 'idempotency_key', 'agent_id', 'requester_id', 'company_id', 'use_case', 'data_class',
  ]) requireToken(request[key]); requireSemver(request.agent_version, REASON_CODES.INVALID_REQUEST);
  for (const key of ['package_sha256', 'payload_sha256']) requireSha(request[key]);
  for (const key of ['reg4_baseline_commit', 'reg4_baseline_tree', 'bos_ai1_baseline_commit',
    'bos_ai1_baseline_tree']) requireGitOid(request[key]);
  if (!DATA_CLASSES.includes(request.data_class)) decide(DECISIONS.DENY, REASON_CODES.INVALID_REQUEST); if (request.claimed_role !== undefined) requireToken(request.claimed_role);
  if (request.claimed_company_id !== undefined) requireToken(request.claimed_company_id); if (request.claimed_permissions !== undefined) {
    request.claimed_permissions = requireDenseUniqueTokens(request.claimed_permissions, 0, REASON_CODES.INVALID_REQUEST); }
  if (!digestMatches(request.payload_sha256, hashValue(request.payload))) { decide(DECISIONS.DENY, REASON_CODES.INVALID_REQUEST);
  } if (containsSecret(request.payload)) decide(DECISIONS.DENY, REASON_CODES.SECRET_DETECTED);
  return request; }
function immutableReg4Content(record) { return {
    agent_id: record.agent_id, name: record.name,
    version: record.version, created_by: record.created_by,
    permissions: record.permissions, required_tools: record.required_tools,
    prohibited_actions: record.prohibited_actions, evidence_references: record.evidence_references,
  }; }
function mandatoryEvidencePresent(record) { return Array.isArray(record.evidence_references) &&
    record.evidence_references.some((item) => isPlainObject(item) && item.evidence_type === 'AUTOMATED_TEST' && item.result === 'PASS') &&
    record.evidence_references.some((item) => isPlainObject(item) && item.evidence_type === 'INDEPENDENT_REVIEW' && item.result === 'PASS');
} function getOwnFunction(container, key) {
  try { const descriptor = Object.getOwnPropertyDescriptor(container, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'function') return null; return descriptor.value;
  } catch { return null;
  } }
function dependencyObject(value, keys, optional = []) { if (!isPlainObject(value)) throw new TypeError('invalid proof dependencies');
  let ownKeys; try {
    ownKeys = Reflect.ownKeys(value); } catch {
    throw new TypeError('invalid proof dependencies'); }
  if (ownKeys.some((key) => typeof key !== 'string' || !keys.includes(key)) || keys.filter((key) => !optional.includes(key)).some((key) => !ownKeys.includes(key))) {
    throw new TypeError('invalid proof dependencies'); }
  const copy = {}; for (const key of ownKeys) {
    const method = getOwnFunction(value, key); if (!method) throw new TypeError('invalid proof dependencies');
    copy[key] = method; }
  return Object.freeze(copy); }
function isCanonicalTimestamp(value) { return typeof value === 'string' && ISO_UTC_PATTERN.test(value) &&
    !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value; }
function createModelGatewayProof(options) { const optionKeys = [
    'registry', 'resolvers', 'adapters', 'now', 'validator', 'audit', 'beforeFinalRevalidation', ];
  if (!isPlainObject(options)) throw new TypeError('invalid proof dependencies'); let optionOwnKeys;
  try { optionOwnKeys = Reflect.ownKeys(options);
  } catch { throw new TypeError('invalid proof dependencies');
  } if (optionOwnKeys.some((key) => typeof key !== 'string' || !optionKeys.includes(key)) ||
      ['registry', 'resolvers', 'adapters', 'now'].some((key) => !optionOwnKeys.includes(key))) { throw new TypeError('invalid proof dependencies');
  } const readOption = (key) => {
    let descriptor; try {
      descriptor = Object.getOwnPropertyDescriptor(options, key); } catch {
      throw new TypeError('invalid proof dependencies'); }
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new TypeError('invalid proof dependencies'); return descriptor.value;
  }; const registry = readOption('registry'); const now = readOption('now');
  if (typeof now !== 'function') throw new TypeError('invalid proof dependencies');
  const getAgentPackage = getOwnFunction(registry, 'getAgentPackage'); if (!getAgentPackage) throw new TypeError('invalid proof dependencies');
  const resolvers = dependencyObject(readOption('resolvers'), [ 'getAuthority', 'getCompanyContext', 'getPolicy', 'getCatalog', 'getBudget',
  ]); const adapters = readOption('adapters');
  if (!isPlainObject(adapters)) throw new TypeError('invalid proof dependencies'); let adapterKeys;
  try { adapterKeys = Reflect.ownKeys(adapters);
  } catch { throw new TypeError('invalid proof dependencies');
  } if (adapterKeys.length < 1 || adapterKeys.length > MAX_ARRAY_LENGTH ||
      adapterKeys.some((key) => typeof key !== 'string' || !TOKEN_PATTERN.test(key) || !getOwnFunction(adapters, key))) { throw new TypeError('invalid proof dependencies');
  } const adapterFunctions = Object.freeze(Object.fromEntries(adapterKeys.map((key) =>
    [key, getOwnFunction(adapters, key)]))); const validator = optionOwnKeys.includes('validator') ? readOption('validator') : () => ({ valid: true });
  const beforeFinalRevalidation = optionOwnKeys.includes('beforeFinalRevalidation') ? readOption('beforeFinalRevalidation') : () => {};
  if (typeof validator !== 'function' || typeof beforeFinalRevalidation !== 'function') { throw new TypeError('invalid proof dependencies');
  } let audit = null;
  if (optionOwnKeys.includes('audit')) { audit = dependencyObject(readOption('audit'), ['prepare', 'commit']);
  } const ledger = [];
  const idempotency = new Map(); const budgetAccounts = new Map();
  function safeClock() { try { const value = now();
      return isCanonicalTimestamp(value) ? { value, unavailable: false } : { value: '1970-01-01T00:00:00.000Z', unavailable: true };
    } catch { return { value: '1970-01-01T00:00:00.000Z', unavailable: true }; } }
  function resolve(name, args, reasonCode) { let raw;
    try { raw = resolvers[name](...args);
    } catch { decide(DECISIONS.DENY, reasonCode);
    } if (raw === null || raw === undefined) decide(DECISIONS.DENY, reasonCode);
    return snapshotBoundary(raw, reasonCode); }
  function readAgent(request) { let raw;
    try { raw = getAgentPackage.call(registry, request.agent_id, request.agent_version);
    } catch { decide(DECISIONS.DENY, REASON_CODES.AGENT_NOT_REGISTERED);
    } if (raw === null || raw === undefined) decide(DECISIONS.DENY, REASON_CODES.AGENT_NOT_REGISTERED);
    const record = snapshotBoundary(raw, REASON_CODES.AGENT_NOT_REGISTERED); if (!isPlainObject(record) || record.agent_id !== request.agent_id ||
        record.version !== request.agent_version) decide(DECISIONS.DENY, REASON_CODES.AGENT_NOT_REGISTERED); let resolvedSha;
    try { resolvedSha = calculatePackageSha256(immutableReg4Content(record));
    } catch { decide(DECISIONS.DENY, REASON_CODES.PACKAGE_FINGERPRINT_MISMATCH);
    } if (!digestMatches(record.package_sha256, resolvedSha) ||
        !digestMatches(request.package_sha256, resolvedSha)) { decide(DECISIONS.DENY, REASON_CODES.PACKAGE_FINGERPRINT_MISMATCH);
    } if (!mandatoryEvidencePresent(record)) decide(DECISIONS.DENY, REASON_CODES.REQUIRED_EVIDENCE_MISSING);
    if (record.approval_status === 'BLOCKED') decide(DECISIONS.DENY, REASON_CODES.AGENT_BLOCKED);
    if (record.approval_status === 'RETIRED') decide(DECISIONS.DENY, REASON_CODES.AGENT_RETIRED);
    if (record.approval_status !== 'APPROVED') decide(DECISIONS.DENY, REASON_CODES.AGENT_NOT_APPROVED); if (!Array.isArray(record.permissions) || !record.permissions.includes('model.request')) {
      decide(DECISIONS.DENY, REASON_CODES.AUTHORITY_DENIED); }
    return { record, package_sha256: resolvedSha }; }
  function checkBaselines(request) { if (request.reg4_baseline_commit !== BASELINES.reg4.commit ||
        request.reg4_baseline_tree !== BASELINES.reg4.tree || request.bos_ai1_baseline_commit !== BASELINES.bos_ai1.commit ||
        request.bos_ai1_baseline_tree !== BASELINES.bos_ai1.tree) { decide(DECISIONS.DENY, REASON_CODES.BASELINE_MISMATCH);
    } }
  function readAuthority(request) { const authority = exactObject(
      resolve('getAuthority', [request.requester_id], REASON_CODES.DEPENDENCY_UNAVAILABLE), AUTHORITY_KEYS, AUTHORITY_KEYS, REASON_CODES.AUTHORITY_DENIED,
    ); requireDenseUniqueTokens(authority.permissions, 0, REASON_CODES.AUTHORITY_DENIED);
    if (authority.requester_id !== request.requester_id || authority.active !== true || authority.company_id !== request.company_id || authority.agent_id !== request.agent_id ||
        authority.agent_version !== request.agent_version || !digestMatches(authority.package_sha256, request.package_sha256) ||
        !authority.permissions.includes('model.request')) { decide(DECISIONS.DENY, REASON_CODES.AUTHORITY_DENIED);
    } if (request.claimed_role !== undefined && request.claimed_role !== authority.role) {
      decide(DECISIONS.DENY, REASON_CODES.AUTHORITY_DENIED); }
    if (request.claimed_permissions !== undefined && request.claimed_permissions.some((permission) => !authority.permissions.includes(permission))) {
      decide(DECISIONS.DENY, REASON_CODES.AUTHORITY_DENIED); }
    if (request.claimed_company_id !== undefined && request.claimed_company_id !== authority.company_id) { decide(DECISIONS.DENY, REASON_CODES.COMPANY_CONTEXT_DENIED);
    } return authority;
  } function readCompany(request) {
    const company = exactObject( resolve('getCompanyContext', [request.company_id], REASON_CODES.DEPENDENCY_UNAVAILABLE),
      COMPANY_KEYS, COMPANY_KEYS, REASON_CODES.COMPANY_CONTEXT_DENIED, );
    if (company.company_id !== request.company_id || company.active !== true) { decide(DECISIONS.DENY, REASON_CODES.COMPANY_CONTEXT_DENIED);
    } requireToken(company.context_version, REASON_CODES.COMPANY_CONTEXT_DENIED);
    return company; }
  function readPolicy(request) { const policy = exactObject(
      resolve('getPolicy', [request.company_id, request.use_case], REASON_CODES.DEPENDENCY_UNAVAILABLE), POLICY_KEYS, POLICY_KEYS, REASON_CODES.POLICY_DENIED,
    ); requireToken(policy.policy_version, REASON_CODES.POLICY_DENIED);
    requireDenseUniqueTokens(policy.allowed_use_cases, 1, REASON_CODES.POLICY_DENIED); requireDenseUniqueTokens(policy.allowed_data_classes, 1, REASON_CODES.POLICY_DENIED);
    requireDenseUniqueTokens(policy.allowed_models, 1, REASON_CODES.POLICY_DENIED); if (policy.company_id !== request.company_id || !policy.allowed_use_cases.includes(request.use_case) ||
        !['ALLOW', 'REQUIRE_DOMAIN_OWNER', 'DENY'].includes(policy.d3_mode)) {
      decide(DECISIONS.DENY, REASON_CODES.POLICY_DENIED); }
    if (request.data_class === 'D4') decide(DECISIONS.DENY, REASON_CODES.D4_DENIED);
    if (!policy.allowed_data_classes.includes(request.data_class)) decide(DECISIONS.DENY, REASON_CODES.POLICY_DENIED);
    if (request.data_class === 'D3' && policy.d3_mode === 'REQUIRE_DOMAIN_OWNER') {
      decide(DECISIONS.STOP, REASON_CODES.DOMAIN_OWNER_REQUIRED); }
    if (request.data_class === 'D3' && policy.d3_mode !== 'ALLOW') { decide(DECISIONS.DENY, REASON_CODES.POLICY_DENIED);
    } return policy;
  } function readCatalog() {
    const catalog = exactObject( resolve('getCatalog', [], REASON_CODES.DEPENDENCY_UNAVAILABLE),
      CATALOG_KEYS, CATALOG_KEYS, REASON_CODES.CATALOG_DENIED, );
    requireToken(catalog.catalog_version, REASON_CODES.CATALOG_DENIED); if (!Array.isArray(catalog.models) || catalog.models.length < 1 ||
        catalog.models.length > MAX_ARRAY_LENGTH) decide(DECISIONS.DENY, REASON_CODES.CATALOG_DENIED); const seen = new Set();
    catalog.models = catalog.models.map((raw) => { const model = exactObject(raw, MODEL_KEYS, MODEL_KEYS, REASON_CODES.CATALOG_DENIED);
      for (const key of ['model_id', 'adapter_id', 'provider', 'region', 'safety_class']) { requireToken(model[key], REASON_CODES.CATALOG_DENIED);
      } requireSemver(model.version, REASON_CODES.CATALOG_DENIED);
      model.data_classes = requireDenseUniqueTokens(model.data_classes, 1, REASON_CODES.CATALOG_DENIED) .sort(compareAscii);
      if (!model.data_classes.every((item) => DATA_CLASSES.includes(item)) || !['APPROVED', 'BLOCKED', 'RETIRED'].includes(model.status)) {
        decide(DECISIONS.DENY, REASON_CODES.CATALOG_DENIED); }
      requireNonNegativeSafeInteger(model.quality_score, REASON_CODES.CATALOG_DENIED); requireNonNegativeSafeInteger(model.cost_units, REASON_CODES.INVALID_COST);
      requireNonNegativeSafeInteger(model.latency_units, REASON_CODES.CATALOG_DENIED); const reference = `${model.model_id}@${model.version}`;
      if (seen.has(reference)) decide(DECISIONS.DENY, REASON_CODES.CATALOG_DENIED); seen.add(reference);
      return model; });
    return catalog; }
  function modelOrder(left, right) { return right.quality_score - left.quality_score || left.cost_units - right.cost_units ||
      left.latency_units - right.latency_units || compareAscii(`${left.model_id}@${left.version}`, `${right.model_id}@${right.version}`);
  } function buildPlan(request, policy, catalog) {
    const eligible = catalog.models.filter((model) => model.status === 'APPROVED' && policy.allowed_models.includes(`${model.model_id}@${model.version}`) &&
      model.data_classes.includes(request.data_class) && model.quality_score >= POLICY.minimum_quality_score &&
      model.latency_units <= POLICY.maximum_latency_units).sort((left, right) =>
      policy.allowed_models.indexOf(`${left.model_id}@${left.version}`) - policy.allowed_models.indexOf(`${right.model_id}@${right.version}`) || modelOrder(left, right));
    if (eligible.length === 0) decide(DECISIONS.DENY, REASON_CODES.CATALOG_DENIED);
    const primary = eligible[0]; const capability = stableJson(primary.data_classes);
    const fallback = eligible.slice(1).find((model) => model.provider === primary.provider && model.region === primary.region &&
      model.safety_class === primary.safety_class && stableJson(model.data_classes) === capability) || null; let maximumCost = safeMultiply(primary.cost_units, POLICY.maximum_retries_per_model + 1);
    if (fallback) maximumCost = safeAdd(maximumCost, fallback.cost_units); if (maximumCost > POLICY.maximum_request_cost_units) {
      decide(DECISIONS.DENY, REASON_CODES.COST_LIMIT_EXCEEDED); }
    return { primary, fallback, maximum_cost_units: maximumCost }; }
  function readBudget(request) { const budget = exactObject(
      resolve('getBudget', [request.company_id], REASON_CODES.DEPENDENCY_UNAVAILABLE), BUDGET_KEYS, BUDGET_KEYS, REASON_CODES.BUDGET_DENIED,
    ); if (budget.company_id !== request.company_id) decide(DECISIONS.DENY, REASON_CODES.BUDGET_DENIED);
    requireToken(budget.budget_version, REASON_CODES.BUDGET_DENIED); requireNonNegativeSafeInteger(budget.limit_units, REASON_CODES.BUDGET_DENIED);
    requireNonNegativeSafeInteger(budget.preexisting_spent_units, REASON_CODES.BUDGET_DENIED); if (budget.preexisting_spent_units > budget.limit_units) {
      decide(DECISIONS.DENY, REASON_CODES.BUDGET_DENIED); }
    return budget; }
  function accountFor(companyId) { if (!budgetAccounts.has(companyId)) {
      budgetAccounts.set(companyId, { proof_spent_units: 0, reserved_units: 0 }); }
    return budgetAccounts.get(companyId); }
  function reserveBudget(request, budget, amount) { const account = accountFor(request.company_id);
    const afterReservation = safeAdd( budget.preexisting_spent_units, account.proof_spent_units, account.reserved_units, amount,
    ); if (afterReservation > budget.limit_units) decide(DECISIONS.DENY, REASON_CODES.BUDGET_EXHAUSTED);
    account.reserved_units = safeAdd(account.reserved_units, amount); return { account, amount, charged: 0, active: true };
  } function chargeReservation(reservation, amount) {
    if (!reservation.active || reservation.charged > reservation.amount - amount) { decide(DECISIONS.DENY, REASON_CODES.COST_OVERFLOW);
    } reservation.charged = safeAdd(reservation.charged, amount);
  } function settleReservation(reservation) {
    if (!reservation || !reservation.active) return; reservation.account.reserved_units -= reservation.amount;
    reservation.account.proof_spent_units = safeAdd( reservation.account.proof_spent_units, reservation.charged,
    ); reservation.active = false;
  } function contextAtT0(request, expected = null) {
    const agent = readAgent(request); const authority = readAuthority(request);
    const company = readCompany(request); const policy = readPolicy(request);
    if (expected && hashValue(policy) !== hashValue(expected.policy)) decide(DECISIONS.DENY, REASON_CODES.POLICY_CHANGED);
    const catalog = readCatalog();
    if (expected) { const selected = catalog.models.find((model) => model.model_id === expected.plan.primary.model_id &&
        model.version === expected.plan.primary.version);
      if (!selected || selected.status !== 'APPROVED') decide(DECISIONS.DENY, REASON_CODES.MODEL_STATUS_CHANGED);
      if (hashValue(catalog) !== hashValue(expected.catalog)) decide(DECISIONS.DENY, REASON_CODES.CATALOG_CHANGED); }
    const plan = buildPlan(request, policy, catalog);
    const budget = readBudget(request); return { agent, authority, company, policy, catalog, plan, budget };
  } function contextDigest(context) {
    return hashValue({ agent: context.agent,
      authority: context.authority, company: context.company,
      policy: context.policy, catalog: context.catalog,
      budget: context.budget, plan: {
        primary: `${context.plan.primary.model_id}@${context.plan.primary.version}`, fallback: context.plan.fallback
          ? `${context.plan.fallback.model_id}@${context.plan.fallback.version}` : null, maximum_cost_units: context.plan.maximum_cost_units,
      }, });
  } function requestDigest(request) {
    const semantic = { ...request }; delete semantic.request_id;
    return hashValue(semantic); }
  function callAdapter(model, request, attemptNumber) { const adapter = adapterFunctions[model.adapter_id];
    if (typeof adapter !== 'function') return { outcome: 'MALFORMED_FAILURE', output: null }; const input = deepFreeze(snapshotData({
      request_id: request.request_id, company_id: request.company_id,
      use_case: request.use_case, data_class: request.data_class,
      payload: request.payload, payload_sha256: request.payload_sha256,
      model: { model_id: model.model_id,
        version: model.version, provider: model.provider,
        region: model.region, safety_class: model.safety_class,
      }, attempt: attemptNumber,
    })); let raw;
    try { raw = adapter(input);
    } catch { return { outcome: 'MALFORMED_FAILURE', output: null };
    } let result;
    try { result = snapshotData(raw);
    } catch { return { outcome: 'MALFORMED_FAILURE', output: null };
    } if (!isPlainObject(result)) return { outcome: 'MALFORMED_FAILURE', output: null };
    const keys = Object.keys(result).sort(compareAscii); if (result.outcome === 'SUCCESS' && keys.join('|') === 'outcome|output') {
      return { outcome: 'SUCCESS', output: result.output }; }
    if (['TRANSIENT_FAILURE', 'PERMANENT_FAILURE'].includes(result.outcome) && keys.join('|') === 'outcome') return { outcome: result.outcome, output: null };
    return { outcome: 'MALFORMED_FAILURE', output: null }; }
  function validateOutput(rawOutput, request, model) { const output = exactObject(rawOutput, OUTPUT_KEYS, OUTPUT_KEYS, REASON_CODES.OUTPUT_VALIDATION_FAILED);
    if (output.schema_version !== 'mg5-output/v1' || typeof output.content !== 'string' || output.content.length < 1 || output.content.length > 2000 ||
        !Number.isSafeInteger(output.confidence) || output.confidence < 0 || output.confidence > 100) { decide(DECISIONS.DENY, REASON_CODES.OUTPUT_VALIDATION_FAILED);
    } if (containsSecret(output)) decide(DECISIONS.DENY, REASON_CODES.SECRET_DETECTED);
    let verdict; try {
      verdict = validator( deepFreeze(snapshotData(output)),
        deepFreeze(snapshotData({ company_id: request.company_id, use_case: request.use_case,
          data_class: request.data_class, model_id: model.model_id, model_version: model.version, })),
      ); } catch {
      decide(DECISIONS.DENY, REASON_CODES.OUTPUT_VALIDATION_FAILED); }
    const copiedVerdict = exactObject(verdict, ['valid'], ['valid'], REASON_CODES.OUTPUT_VALIDATION_FAILED); if (copiedVerdict.valid !== true) decide(DECISIONS.DENY, REASON_CODES.OUTPUT_VALIDATION_FAILED);
    return output; }
  function executePlan(request, plan, reservation, attempts) { const models = [plan.primary, ...(plan.fallback ? [plan.fallback] : [])];
    for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) { const model = models[modelIndex];
      const allowedAttempts = modelIndex === 0 ? POLICY.maximum_retries_per_model + 1 : 1; for (let perModelAttempt = 1; perModelAttempt <= allowedAttempts; perModelAttempt += 1) {
        if (attempts.length >= POLICY.maximum_adapter_invocations) break; chargeReservation(reservation, model.cost_units);
        const result = callAdapter(model, request, attempts.length + 1); attempts.push({
          model_id: model.model_id, version: model.version,
          outcome: result.outcome, cost_units: model.cost_units,
        }); if (result.outcome === 'SUCCESS') {
          return { output: validateOutput(result.output, request, model), model }; }
        if (result.outcome !== 'TRANSIENT_FAILURE') { decide(DECISIONS.DENY, REASON_CODES.ADAPTER_FAILURE);
        } }
    } decide(DECISIONS.DENY, REASON_CODES.ADAPTER_FAILURE);
  } function safeAuditToken(value) {
    return typeof value === 'string' && TOKEN_PATTERN.test(value) && !containsSecretText(value) ? value : null;
  } function safeAuditSha(value) {
    return typeof value === 'string' && SHA256_PATTERN.test(value) ? value : null; }
  function safeRequestContext(request) { if (!request) return {};
    return { request_id: safeAuditToken(request.request_id),
      idempotency_key_sha256: typeof request.idempotency_key === 'string' ? hashValue(request.idempotency_key) : null,
      agent_id: safeAuditToken(request.agent_id), agent_version: typeof request.agent_version === 'string' && SEMVER_PATTERN.test(request.agent_version)
        ? request.agent_version : null, package_sha256: safeAuditSha(request.package_sha256),
      requester_id: safeAuditToken(request.requester_id), company_id: safeAuditToken(request.company_id),
      use_case: safeAuditToken(request.use_case), data_class: DATA_CLASSES.includes(request.data_class) ? request.data_class : null,
      payload_sha256: safeAuditSha(request.payload_sha256), };
  } function buildAuditRecord(request, response, details) {
    const sequence = ledger.length + 1; const previous = sequence === 1 ? ZERO_SHA256 : ledger[ledger.length - 1].audit_sha256;
    const body = { sequence, occurred_at: details.occurred_at,
      audit_id: `mg5-audit-${String(sequence).padStart(6, '0')}`, correlation_id: `mg5-correlation-${String(sequence).padStart(10, '0')}`,
      ...safeRequestContext(request), parent_commit: BASELINES.parent.commit,
      parent_tree: BASELINES.parent.tree, reg4_commit: BASELINES.reg4.commit,
      reg4_tree: BASELINES.reg4.tree, bos_ai1_commit: BASELINES.bos_ai1.commit,
      bos_ai1_tree: BASELINES.bos_ai1.tree, policy_version: details.policy_version || null,
      catalog_version: details.catalog_version || null, budget_version: details.budget_version || null,
      selected_primary: details.selected_primary || null, selected_fallback: details.selected_fallback || null,
      attempts: details.attempts.map((attempt) => ({ ...attempt })), reserved_units: details.reserved_units,
      charged_units: details.charged_units, released_units: details.released_units,
      decision: response.decision, reason_code: response.reason_code,
      output_sha256: details.output_sha256 || null, output_trust: response.decision === DECISIONS.ALLOW ? 'UNTRUSTED' : null,
      business_effect: 'NONE', audit_mode: details.audit_mode,
      previous_audit_sha256: previous, };
    return { ...body, audit_sha256: hashValue(body) }; }
  function auditPrepare(request, details) { if (!audit) return;
    const preview = deepFreeze(snapshotData({ request_id: request.request_id,
      payload_sha256: request.payload_sha256, company_id: request.company_id,
      policy_version: details.policy_version, catalog_version: details.catalog_version,
      budget_version: details.budget_version, }));
    let result; try {
      result = audit.prepare(preview); } catch {
      decide(DECISIONS.DENY, REASON_CODES.AUDIT_UNAVAILABLE); }
    const verdict = exactObject(result, ['ok'], ['ok'], REASON_CODES.AUDIT_UNAVAILABLE); if (verdict.ok !== true) decide(DECISIONS.DENY, REASON_CODES.AUDIT_UNAVAILABLE);
  } function commitTerminal(request, response, details) {
    let finalResponse = response; let record = buildAuditRecord(request, finalResponse, { ...details, audit_mode: 'PRIMARY' });
    if (audit) { let committed = false;
      try { const result = audit.commit(deepFreeze(snapshotData(record)));
        const verdict = snapshotData(result); committed = isPlainObject(verdict) && Object.keys(verdict).join('|') === 'ok' && verdict.ok === true;
      } catch { committed = false;
      } if (!committed) {
        finalResponse = { decision: DECISIONS.DENY,
          reason_code: REASON_CODES.AUDIT_UNAVAILABLE, result: null,
        }; record = buildAuditRecord(request, finalResponse, { ...details, output_sha256: null, audit_mode: 'FAILSAFE' });
      } }
    ledger.push(record); return {
      response: finalResponse, correlation_id: record.correlation_id,
      audit_sha256: record.audit_sha256, };
  } function invoke(rawRequest) { const invocationClock = safeClock();
    let request = null; let response = { decision: DECISIONS.DENY, reason_code: REASON_CODES.INVALID_REQUEST, result: null };
    let context = null; let reservation = null;
    let inFlightEntry = null; let semanticDigest = null;
    let completedResult = null; const attempts = [];
    try { if (invocationClock.unavailable) decide(DECISIONS.DENY, REASON_CODES.DEPENDENCY_UNAVAILABLE);
      request = copyRequest(rawRequest);
      checkBaselines(request); context = contextAtT0(request);
      const initialContextDigest = contextDigest(context); semanticDigest = requestDigest(request);
      const existing = idempotency.get(request.idempotency_key);
      if (existing && existing.request_sha256 !== semanticDigest) { decide(DECISIONS.DENY, REASON_CODES.IDEMPOTENCY_CONFLICT);
      } if (existing && existing.state === 'IN_FLIGHT') {
        decide(DECISIONS.DENY, REASON_CODES.REQUEST_IN_PROGRESS); }
      if (existing && existing.state === 'COMPLETED') { completedResult = snapshotData(existing.result);
      } else { inFlightEntry = { state: 'IN_FLIGHT', request_sha256: semanticDigest };
        idempotency.set(request.idempotency_key, inFlightEntry); }
      if (!completedResult) reservation = reserveBudget(request, context.budget, context.plan.maximum_cost_units);
      try { beforeFinalRevalidation(deepFreeze(snapshotData({ request, duplicate: Boolean(completedResult),
          plan: { primary: `${context.plan.primary.model_id}@${context.plan.primary.version}`,
            fallback: context.plan.fallback ? `${context.plan.fallback.model_id}@${context.plan.fallback.version}` : null,
          } }))); } catch {
        decide(DECISIONS.DENY, REASON_CODES.DEPENDENCY_UNAVAILABLE); }
      const finalContext = contextAtT0(request, context); if (contextDigest(finalContext) !== initialContextDigest) {
        decide(DECISIONS.DENY, REASON_CODES.CONTEXT_CHANGED); }
      context = finalContext; auditPrepare(request, {
        policy_version: context.policy.policy_version, catalog_version: context.catalog.catalog_version,
        budget_version: context.budget.budget_version, });
      if (!completedResult) {
        const execution = executePlan(request, context.plan, reservation, attempts); const result = {
          request_id: request.request_id, selected_model: {
            model_id: execution.model.model_id, version: execution.model.version,
          }, output: execution.output,
          output_trust: 'UNTRUSTED', business_effect: 'NONE',
          cost: { reserved_units: reservation.amount,
            charged_units: reservation.charged, released_units: reservation.amount - reservation.charged,
            attempts: attempts.length, },
        }; completedResult = result;
        response = { decision: DECISIONS.ALLOW, reason_code: REASON_CODES.OK, result }; } else {
        response = { decision: DECISIONS.ALLOW,
          reason_code: REASON_CODES.DUPLICATE_REQUEST, result: completedResult,
        }; }
    } catch (error) { const proven = provenDecision(error);
      response = proven && Object.values(DECISIONS).includes(proven.decision) && Object.hasOwn(REASON_CODES, proven.reason_code)
        ? { decision: proven.decision, reason_code: proven.reason_code, result: null } : { decision: DECISIONS.DENY, reason_code: REASON_CODES.INVALID_REQUEST, result: null };
    } settleReservation(reservation);
    const releasedUnits = reservation ? reservation.amount - reservation.charged : 0; const outputSha = response.decision === DECISIONS.ALLOW && response.result
      ? hashValue(response.result.output) : null; const details = {
      policy_version: context && context.policy ? context.policy.policy_version : null, catalog_version: context && context.catalog ? context.catalog.catalog_version : null,
      budget_version: context && context.budget ? context.budget.budget_version : null, selected_primary: context && context.plan
        ? `${context.plan.primary.model_id}@${context.plan.primary.version}` : null, selected_fallback: context && context.plan && context.plan.fallback
        ? `${context.plan.fallback.model_id}@${context.plan.fallback.version}` : null, attempts,
      reserved_units: reservation ? reservation.amount : 0, charged_units: reservation ? reservation.charged : 0,
      released_units: releasedUnits, output_sha256: outputSha, occurred_at: invocationClock.value,
    }; const terminal = commitTerminal(request, response, details);
    response = terminal.response; if (inFlightEntry && request && idempotency.get(request.idempotency_key) === inFlightEntry) {
      if (response.decision === DECISIONS.ALLOW && completedResult) { idempotency.set(request.idempotency_key, {
          state: 'COMPLETED', request_sha256: semanticDigest, result: deepFreeze(snapshotData(completedResult)),
          receipt_sha256: terminal.audit_sha256, });
      } else { idempotency.delete(request.idempotency_key);
      } }
    const final = { decision: response.decision,
      reason_code: response.reason_code, correlation_id: terminal.correlation_id,
      result: response.result, };
    return deepFreeze(snapshotData(final)); }
  const getBudgetSnapshot = () => Array.from(budgetAccounts.entries()).sort(([left], [right]) =>
      compareAscii(left, right)).map(([companyId, state]) => ({ company_id: companyId,
      proof_spent_units: state.proof_spent_units, reserved_units: state.reserved_units,
    }));
  return Object.freeze({ invoke,
    listAuditRecords: () => ledger.map((record) => snapshotData(record)), getBudgetSnapshot, });
} module.exports = {
  createModelGatewayProof, calculatePayloadSha256,
  BASELINES, POLICY,
  DECISIONS, REASON_CODES,
};
