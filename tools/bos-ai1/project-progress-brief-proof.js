'use strict';

const { createHash, timingSafeEqual } = require('node:crypto');

const REG4_BASELINE = Object.freeze({
  commit: '3def40122e4072f266c943bc4eb84d3164501339',
  tree: 'aef6c623ce7f549b560af46e73a7ee6d0abd35ae',
});

const AGENT_CONTRACT = Object.freeze({
  agent_id: 'bos-ai1.project-progress-brief',
  version: '1.0.0',
});

const TOOL_CONTRACTS = Object.freeze({
  'project.get_progress_summary': Object.freeze({
    name: 'project.get_progress_summary',
    version: '1.0.0',
    effect: 'READ',
    action: 'project.progress.read',
    required_permission: 'project.progress.read',
  }),
  'project.create_status_update_draft': Object.freeze({
    name: 'project.create_status_update_draft',
    version: '1.0.0',
    effect: 'DRAFT',
    action: 'project.status_update.draft',
    required_permission: 'project.status_update.draft',
  }),
});

const DECISIONS = Object.freeze({ ALLOW: 'ALLOW', DENY: 'DENY', STOP: 'STOP' });
const REASON_CODES = Object.freeze({
  OK: 'OK',
  DUPLICATE_REQUEST: 'DUPLICATE_REQUEST',
  INVALID_REQUEST: 'INVALID_REQUEST',
  AGENT_NOT_REGISTERED: 'AGENT_NOT_REGISTERED',
  AGENT_VERSION_MISMATCH: 'AGENT_VERSION_MISMATCH',
  PACKAGE_FINGERPRINT_MISMATCH: 'PACKAGE_FINGERPRINT_MISMATCH',
  AGENT_NOT_APPROVED: 'AGENT_NOT_APPROVED',
  AGENT_BLOCKED: 'AGENT_BLOCKED',
  AGENT_RETIRED: 'AGENT_RETIRED',
  REQUIRED_EVIDENCE_MISSING: 'REQUIRED_EVIDENCE_MISSING',
  REGISTRY_UNVERIFIABLE: 'REGISTRY_UNVERIFIABLE',
  TOOL_NOT_ALLOWED: 'TOOL_NOT_ALLOWED',
  ACTION_PROHIBITED: 'ACTION_PROHIBITED',
  FORGED_AUTHORITY: 'FORGED_AUTHORITY',
  COMPANY_CONTEXT_DENIED: 'COMPANY_CONTEXT_DENIED',
  RESOURCE_SCOPE_DENIED: 'RESOURCE_SCOPE_DENIED',
  TASK_INVALID: 'TASK_INVALID',
  DELEGATION_INVALID: 'DELEGATION_INVALID',
  REPRESENTED_PRINCIPAL_DENIED: 'REPRESENTED_PRINCIPAL_DENIED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  CONTEXT_CHANGED: 'CONTEXT_CHANGED',
  APPROVAL_REVOKED: 'APPROVAL_REVOKED',
  APPROVAL_REPLAYED: 'APPROVAL_REPLAYED',
  APPROVAL_ACTION_MISMATCH: 'APPROVAL_ACTION_MISMATCH',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  DEPENDENCY_UNAVAILABLE: 'DEPENDENCY_UNAVAILABLE',
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
  APPROVAL_EXPIRED: 'APPROVAL_EXPIRED',
  APPROVAL_RESOURCE_STALE: 'APPROVAL_RESOURCE_STALE',
  FOUNDER_DECISION_REQUIRED: 'FOUNDER_DECISION_REQUIRED',
});

const OUTCOME = new Set(Object.values(DECISIONS));
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ZERO_SHA256 = '0'.repeat(64);
const MAX_DEPTH = 10;
const MAX_KEYS = 200;
const REQUEST_KEYS = Object.freeze([
  'request_id', 'idempotency_key', 'correlation_id', 'requested_operation',
  'agent_id', 'agent_version', 'package_sha256', 'reg4_baseline_commit',
  'reg4_baseline_tree', 'requester_id', 'executor_id', 'on_behalf_of',
  'approver_id', 'company_id', 'task_id', 'task_version', 'delegation_id',
  'delegation_version', 'resource_type', 'resource_id', 'resource_version',
  'tool_name', 'tool_contract_version', 'action', 'payload', 'payload_sha256',
  'approval_id', 'claimed_role', 'claimed_permissions',
]);
const REQUIRED_REQUEST_KEYS = Object.freeze(REQUEST_KEYS.filter((key) =>
  !['approval_id', 'claimed_role', 'claimed_permissions'].includes(key)));

class ProofDecision extends Error {
  constructor(decision, reasonCode) {
    super(reasonCode);
    this.name = 'ProofDecision';
    this.decision = decision;
    this.reason_code = reasonCode;
  }
}

function decide(decision, reasonCode) {
  throw new ProofDecision(decision, reasonCode);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}

function snapshotData(value, depth = 0) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (depth >= MAX_DEPTH || typeof value !== 'object') decide(DECISIONS.DENY, REASON_CODES.INVALID_REQUEST);
  const prototype = Object.getPrototypeOf(value);
  if (Array.isArray(value)) {
    const keys = Reflect.ownKeys(value);
    if (value.length > MAX_KEYS || keys.some((key) => key !== 'length' && !/^(0|[1-9]\d*)$/.test(String(key)))) {
      decide(DECISIONS.DENY, REASON_CODES.INVALID_REQUEST);
    }
    return Array.from({ length: value.length }, (_, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        decide(DECISIONS.DENY, REASON_CODES.INVALID_REQUEST);
      }
      return snapshotData(descriptor.value, depth + 1);
    });
  }
  if (prototype !== Object.prototype) decide(DECISIONS.DENY, REASON_CODES.INVALID_REQUEST);
  const keys = Reflect.ownKeys(value);
  if (keys.length > MAX_KEYS || keys.some((key) => typeof key !== 'string')) {
    decide(DECISIONS.DENY, REASON_CODES.INVALID_REQUEST);
  }
  const copy = {};
  for (const key of keys.sort()) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      decide(DECISIONS.DENY, REASON_CODES.INVALID_REQUEST);
    }
    copy[key] = snapshotData(descriptor.value, depth + 1);
  }
  return copy;
}

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function hashValue(value) {
  return createHash('sha256').update(Buffer.from(stableJson(value), 'utf8')).digest('hex');
}

function calculatePayloadSha256(payload) {
  return hashValue(snapshotData(payload));
}

function digestMatches(left, right) {
  return typeof left === 'string' && typeof right === 'string' &&
    SHA256_PATTERN.test(left) && SHA256_PATTERN.test(right) &&
    timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function requireToken(value) {
  if (typeof value !== 'string' || !TOKEN_PATTERN.test(value) || value.includes('..') || value.includes('//')) {
    decide(DECISIONS.DENY, REASON_CODES.INVALID_REQUEST);
  }
  return value;
}

function requireSha(value) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    decide(DECISIONS.DENY, REASON_CODES.INVALID_REQUEST);
  }
  return value;
}

function isCanonicalTimestamp(value) {
  return typeof value === 'string' && ISO_UTC_PATTERN.test(value) && !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value;
}

function requireTimestamp(value) {
  if (!isCanonicalTimestamp(value)) {
    decide(DECISIONS.DENY, REASON_CODES.DEPENDENCY_UNAVAILABLE);
  }
  return value;
}

function clone(value) {
  return snapshotData(value);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

function copyRequest(raw) {
  const request = snapshotData(raw);
  if (!isPlainObject(request)) decide(DECISIONS.DENY, REASON_CODES.INVALID_REQUEST);
  const keys = Object.keys(request);
  if (keys.some((key) => !REQUEST_KEYS.includes(key)) || REQUIRED_REQUEST_KEYS.some((key) => !Object.hasOwn(request, key))) {
    decide(DECISIONS.DENY, REASON_CODES.INVALID_REQUEST);
  }
  for (const key of REQUIRED_REQUEST_KEYS.filter((item) => !['payload', 'package_sha256', 'payload_sha256'].includes(item))) {
    requireToken(request[key]);
  }
  requireSha(request.package_sha256);
  requireSha(request.payload_sha256);
  if (request.approval_id !== undefined && request.approval_id !== null) requireToken(request.approval_id);
  if (request.claimed_role !== undefined) requireToken(request.claimed_role);
  if (request.claimed_permissions !== undefined) {
    if (!Array.isArray(request.claimed_permissions)) decide(DECISIONS.DENY, REASON_CODES.INVALID_REQUEST);
    request.claimed_permissions.forEach(requireToken);
  }
  if (!digestMatches(request.payload_sha256, calculatePayloadSha256(request.payload))) {
    decide(DECISIONS.DENY, REASON_CODES.INVALID_REQUEST);
  }
  return request;
}

function immutableReg4Content(record) {
  return {
    agent_id: record.agent_id,
    name: record.name,
    version: record.version,
    created_by: record.created_by,
    permissions: record.permissions,
    required_tools: record.required_tools,
    prohibited_actions: record.prohibited_actions,
    evidence_references: record.evidence_references,
  };
}

function mandatoryEvidencePresent(record) {
  return Array.isArray(record.evidence_references) &&
    record.evidence_references.some((item) => item && item.evidence_type === 'AUTOMATED_TEST' && item.result === 'PASS') &&
    record.evidence_references.some((item) => item && item.evidence_type === 'INDEPENDENT_REVIEW' && item.result === 'PASS');
}

function createProjectProgressBriefProof({ registry, now, resolvers, beforeFinalRevalidation = () => {} }) {
  if (!registry || typeof registry.getAgentPackage !== 'function' || typeof now !== 'function' || !isPlainObject(resolvers)) {
    throw new TypeError('invalid proof dependencies');
  }
  const requiredResolvers = ['getIdentity', 'getTask', 'getDelegation', 'getProject', 'getPolicy', 'getApproval'];
  if (requiredResolvers.some((name) => typeof resolvers[name] !== 'function') || typeof beforeFinalRevalidation !== 'function') {
    throw new TypeError('invalid proof dependencies');
  }

  const drafts = new Map();
  const idempotency = new Map();
  const ledger = [];

  function safeNow() {
    try {
      return { value: requireTimestamp(now()), unavailable: false };
    } catch {
      return { value: '1970-01-01T00:00:00.000Z', unavailable: true };
    }
  }

  function resolve(name, ...args) {
    try {
      const value = resolvers[name](...args);
      return value === null || value === undefined ? null : snapshotData(value);
    } catch {
      decide(DECISIONS.DENY, REASON_CODES.DEPENDENCY_UNAVAILABLE);
    }
  }

  function readAgent(request, final = false) {
    let record;
    try {
      record = registry.getAgentPackage(request.agent_id, request.agent_version);
      record = record === null ? null : snapshotData(record);
    } catch {
      decide(DECISIONS.DENY, REASON_CODES.REGISTRY_UNVERIFIABLE);
    }
    if (!record) {
      decide(DECISIONS.DENY,
        request.agent_id !== AGENT_CONTRACT.agent_id ? REASON_CODES.AGENT_NOT_REGISTERED :
          request.agent_version !== AGENT_CONTRACT.version ? REASON_CODES.AGENT_VERSION_MISMATCH :
            REASON_CODES.REGISTRY_UNVERIFIABLE);
    }
    if (record.agent_id !== request.agent_id) decide(DECISIONS.DENY, REASON_CODES.AGENT_NOT_REGISTERED);
    if (record.version !== request.agent_version) decide(DECISIONS.DENY, REASON_CODES.AGENT_VERSION_MISMATCH);
    let resolvedSha;
    try {
      const { calculatePackageSha256 } = require('../reg4/agent-registry');
      resolvedSha = calculatePackageSha256(immutableReg4Content(record));
    } catch {
      decide(DECISIONS.DENY, REASON_CODES.REGISTRY_UNVERIFIABLE);
    }
    if (!digestMatches(record.package_sha256, resolvedSha) || !digestMatches(request.package_sha256, resolvedSha)) {
      decide(DECISIONS.DENY, REASON_CODES.PACKAGE_FINGERPRINT_MISMATCH);
    }
    if (!mandatoryEvidencePresent(record)) decide(DECISIONS.DENY, REASON_CODES.REQUIRED_EVIDENCE_MISSING);
    if (record.approval_status === 'BLOCKED') decide(DECISIONS.DENY, REASON_CODES.AGENT_BLOCKED);
    if (record.approval_status === 'RETIRED') decide(DECISIONS.DENY, REASON_CODES.AGENT_RETIRED);
    if (record.approval_status !== 'APPROVED') decide(DECISIONS.DENY, REASON_CODES.AGENT_NOT_APPROVED);
    if (request.reg4_baseline_commit !== REG4_BASELINE.commit || request.reg4_baseline_tree !== REG4_BASELINE.tree) {
      decide(DECISIONS.DENY, REASON_CODES.REGISTRY_UNVERIFIABLE);
    }
    if (!record.permissions.includes(permissionForRequest(request))) decide(DECISIONS.DENY, REASON_CODES.PERMISSION_DENIED);
    if (request.requested_operation !== 'PUBLISH' && !record.required_tools.includes(request.tool_name)) {
      decide(DECISIONS.DENY, REASON_CODES.TOOL_NOT_ALLOWED);
    }
    if (record.prohibited_actions.includes(request.action)) decide(DECISIONS.DENY, REASON_CODES.ACTION_PROHIBITED);
    return { record, resolved_sha256: resolvedSha, phase: final ? 'T1' : 'T0' };
  }

  function permissionForRequest(request) {
    if (request.requested_operation === 'PUBLISH') return 'project.status_update.publish';
    const contract = TOOL_CONTRACTS[request.tool_name];
    return contract ? contract.required_permission : 'invalid.permission';
  }

  function validateTool(request) {
    if (request.requested_operation === 'PUBLISH') {
      if (request.tool_name !== 'project.create_status_update_draft' || request.tool_contract_version !== '1.0.0' || request.action !== 'project.status_update.publish') {
        decide(DECISIONS.DENY, REASON_CODES.TOOL_NOT_ALLOWED);
      }
      return;
    }
    const contract = TOOL_CONTRACTS[request.tool_name];
    if (!contract || contract.version !== request.tool_contract_version || contract.effect !== request.requested_operation || contract.action !== request.action) {
      decide(DECISIONS.DENY, REASON_CODES.TOOL_NOT_ALLOWED);
    }
  }

  function trustedContext(request, invocationTimestamp) {
    const requester = resolve('getIdentity', request.requester_id);
    const executor = resolve('getIdentity', request.executor_id);
    const represented = resolve('getIdentity', request.on_behalf_of);
    const approver = request.approver_id === 'none' ? null : resolve('getIdentity', request.approver_id);
    if (!requester || !executor || !represented || requester.identity_id !== request.requester_id ||
        executor.identity_id !== request.executor_id || represented.identity_id !== request.on_behalf_of ||
        (approver && approver.identity_id !== request.approver_id) ||
        principalsInactive(requester, executor, represented, approver)) {
      decide(DECISIONS.DENY, REASON_CODES.FORGED_AUTHORITY);
    }
    if (request.claimed_role !== undefined && request.claimed_role !== requester.role) {
      decide(DECISIONS.DENY, REASON_CODES.FORGED_AUTHORITY);
    }
    if (request.claimed_permissions !== undefined && request.claimed_permissions.some((permission) => !requester.permissions.includes(permission))) {
      decide(DECISIONS.DENY, REASON_CODES.FORGED_AUTHORITY);
    }
    if (executor.agent_id !== request.agent_id || executor.agent_version !== request.agent_version ||
        !digestMatches(executor.package_sha256, request.package_sha256)) {
      decide(DECISIONS.DENY, REASON_CODES.FORGED_AUTHORITY);
    }
    const principals = [requester, executor, represented, ...(approver ? [approver] : [])];
    if (principals.some((identity) => identity.company_id !== request.company_id)) {
      decide(DECISIONS.DENY, REASON_CODES.COMPANY_CONTEXT_DENIED);
    }
    const task = resolve('getTask', request.task_id);
    if (!task || task.active !== true || task.version !== request.task_version ||
        task.company_id !== request.company_id || task.requester_id !== request.requester_id ||
        task.executor_id !== request.executor_id || task.on_behalf_of !== request.on_behalf_of ||
        task.resource_type !== request.resource_type || task.resource_id !== request.resource_id ||
        !Array.isArray(task.allowed_tools) || !task.allowed_tools.includes(request.tool_name) ||
        !Array.isArray(task.allowed_actions) || !task.allowed_actions.includes(request.action) ||
        !isCanonicalTimestamp(task.expires_at) || Date.parse(task.expires_at) <= Date.parse(invocationTimestamp)) {
      decide(DECISIONS.DENY, REASON_CODES.TASK_INVALID);
    }
    const delegation = resolve('getDelegation', request.delegation_id);
    if (!delegation || delegation.revoked !== false || delegation.version !== request.delegation_version ||
        delegation.company_id !== request.company_id || delegation.delegate_id !== request.executor_id ||
        delegation.delegator_id !== request.on_behalf_of || delegation.resource_type !== request.resource_type ||
        delegation.resource_id !== request.resource_id || !Array.isArray(delegation.allowed_tools) ||
        !delegation.allowed_tools.includes(request.tool_name) || !Array.isArray(delegation.allowed_actions) ||
        !delegation.allowed_actions.includes(request.action) || !isCanonicalTimestamp(delegation.expires_at) ||
        Date.parse(delegation.expires_at) <= Date.parse(invocationTimestamp)) {
      decide(DECISIONS.DENY, REASON_CODES.DELEGATION_INVALID);
    }
    const project = resolve('getProject', request.resource_type, request.resource_id);
    if (!project || project.resource_type !== request.resource_type || project.resource_id !== request.resource_id ||
        project.company_id !== request.company_id || project.version !== request.resource_version) {
      decide(DECISIONS.DENY, REASON_CODES.RESOURCE_SCOPE_DENIED);
    }
    const policy = resolve('getPolicy', request.company_id);
    if (!policy || policy.company_id !== request.company_id) decide(DECISIONS.DENY, REASON_CODES.COMPANY_CONTEXT_DENIED);
    const permission = permissionForRequest(request);
    const sources = [requester.permissions, executor.permissions, represented.permissions, task.permissions,
      delegation.permissions, project.permissions_by_principal && project.permissions_by_principal[request.on_behalf_of],
      policy.role_permissions && policy.role_permissions[requester.role]];
    if (sources.some((source) => !Array.isArray(source) || !source.includes(permission))) {
      if (!represented.permissions.includes(permission)) decide(DECISIONS.DENY, REASON_CODES.REPRESENTED_PRINCIPAL_DENIED);
      decide(DECISIONS.DENY, REASON_CODES.PERMISSION_DENIED);
    }
    if (!Array.isArray(policy.allowed_tools) || !policy.allowed_tools.includes(request.tool_name)) {
      decide(DECISIONS.DENY, REASON_CODES.TOOL_NOT_ALLOWED);
    }
    if (!Array.isArray(policy.allowed_actions) || !policy.allowed_actions.includes(request.action)) {
      decide(DECISIONS.DENY, REASON_CODES.ACTION_PROHIBITED);
    }
    if (Array.isArray(policy.prohibited_actions) && policy.prohibited_actions.includes(request.action)) {
      decide(DECISIONS.DENY, REASON_CODES.ACTION_PROHIBITED);
    }
    return { requester, executor, represented, approver, task, delegation, project, policy };
  }

  function principalsInactive(requester, executor, represented, approver) {
    return [requester, executor, represented, ...(approver ? [approver] : [])]
      .some((item) => item.active !== true);
  }

  function contextDigest(context) {
    return hashValue(context);
  }

  function requestDigest(request) {
    const semantic = { ...request };
    delete semantic.request_id;
    delete semantic.correlation_id;
    return hashValue(semantic);
  }

  function approvalGate(request, context, timestamp) {
    if (request.requested_operation !== 'PUBLISH') return;
    if (!request.approval_id) decide(DECISIONS.STOP, REASON_CODES.APPROVAL_REQUIRED);
    const approval = resolve('getApproval', request.approval_id);
    if (!approval || approval.company_id !== request.company_id || approval.requester_id !== request.requester_id ||
        approval.executor_id !== request.executor_id || approval.on_behalf_of !== request.on_behalf_of ||
        approval.approver_id !== request.approver_id || approval.agent_id !== request.agent_id ||
        approval.agent_version !== request.agent_version || !digestMatches(approval.package_sha256, request.package_sha256) ||
        approval.task_id !== request.task_id || approval.task_version !== request.task_version ||
        approval.delegation_id !== request.delegation_id || approval.delegation_version !== request.delegation_version ||
        approval.tool_name !== request.tool_name || approval.tool_contract_version !== request.tool_contract_version ||
        !digestMatches(approval.payload_sha256, request.payload_sha256)) {
      decide(DECISIONS.DENY, REASON_CODES.APPROVAL_ACTION_MISMATCH);
    }
    if (approval.status === 'REVOKED') decide(DECISIONS.DENY, REASON_CODES.APPROVAL_REVOKED);
    if (approval.status === 'CONSUMED') decide(DECISIONS.DENY, REASON_CODES.APPROVAL_REPLAYED);
    if (approval.status !== 'ACTIVE' || !isCanonicalTimestamp(approval.expires_at)) {
      decide(DECISIONS.DENY, REASON_CODES.DEPENDENCY_UNAVAILABLE);
    }
    if (approval.action !== request.action) decide(DECISIONS.DENY, REASON_CODES.APPROVAL_ACTION_MISMATCH);
    if (Date.parse(approval.expires_at) <= Date.parse(timestamp)) decide(DECISIONS.STOP, REASON_CODES.APPROVAL_EXPIRED);
    if (approval.resource_type !== request.resource_type || approval.resource_id !== request.resource_id ||
        approval.resource_version !== request.resource_version || context.project.version !== request.resource_version) {
      decide(DECISIONS.STOP, REASON_CODES.APPROVAL_RESOURCE_STALE);
    }
    decide(DECISIONS.STOP, REASON_CODES.FOUNDER_DECISION_REQUIRED);
  }

  function scopedRead(context) {
    const fields = {};
    for (const field of context.policy.read_fields) {
      if (Object.hasOwn(context.project.fields, field)) fields[field] = clone(context.project.fields[field]);
    }
    return {
      resource_type: context.project.resource_type,
      resource_id: context.project.resource_id,
      version: context.project.version,
      company_id: context.project.company_id,
      fields,
    };
  }

  function auditContext(request) {
    if (!request) return {};
    const copyIfToken = (value) => typeof value === 'string' && TOKEN_PATTERN.test(value) ? value : null;
    return {
      request_id: copyIfToken(request.request_id),
      idempotency_key_sha256: typeof request.idempotency_key === 'string' ? hashValue(request.idempotency_key) : null,
      requester_id: copyIfToken(request.requester_id), executor_id: copyIfToken(request.executor_id),
      on_behalf_of: copyIfToken(request.on_behalf_of), approver_id: copyIfToken(request.approver_id),
      approval_id: copyIfToken(request.approval_id), agent_id: copyIfToken(request.agent_id),
      agent_version: copyIfToken(request.agent_version), package_sha256: SHA256_PATTERN.test(request.package_sha256 || '') ? request.package_sha256 : null,
      reg4_baseline_commit: request.reg4_baseline_commit === REG4_BASELINE.commit ? REG4_BASELINE.commit : null,
      reg4_baseline_tree: request.reg4_baseline_tree === REG4_BASELINE.tree ? REG4_BASELINE.tree : null,
      company_id: copyIfToken(request.company_id), task_id: copyIfToken(request.task_id), task_version: copyIfToken(request.task_version),
      delegation_id: copyIfToken(request.delegation_id), delegation_version: copyIfToken(request.delegation_version),
      resource_type: copyIfToken(request.resource_type), resource_id: copyIfToken(request.resource_id), resource_version: copyIfToken(request.resource_version),
      tool_name: Object.hasOwn(TOOL_CONTRACTS, request.tool_name) ? request.tool_name : null,
      tool_contract_version: request.tool_contract_version === '1.0.0' ? '1.0.0' : null,
      action: ['project.progress.read', 'project.status_update.draft', 'project.status_update.publish'].includes(request.action) ? request.action : null,
      requested_operation: ['READ', 'DRAFT', 'PUBLISH'].includes(request.requested_operation) ? request.requested_operation : null,
    };
  }

  function appendLedger({ timestamp, request, response, effect, duplicate, contextDigestValue }) {
    const sequence = ledger.length + 1;
    const previous = sequence === 1 ? ZERO_SHA256 : ledger[ledger.length - 1].audit_sha256;
    let rollback = 'NOT_APPLICABLE';
    let compensation = 'NOT_APPLICABLE';
    let draftDisposition = 'NONE';
    if (request && request.requested_operation === 'DRAFT') {
      if (effect === 'DRAFT_CREATED') {
        rollback = 'NOT_REQUIRED';
        compensation = 'EXPIRE_DRAFT';
        draftDisposition = 'COMMITTED_NON_CANONICAL';
      } else if (effect === 'DUPLICATE_RETURNED') {
        compensation = 'EXPIRE_DRAFT';
        draftDisposition = 'RECOVERED_NON_CANONICAL';
      } else {
        rollback = 'DISCARD_PREPARED_STATE';
        draftDisposition = 'DISCARDED';
      }
    }
    const body = {
      sequence,
      audit_id: `bos-ai1-audit-${String(sequence).padStart(6, '0')}`,
      correlation_id: `bos-ai1-correlation-${String(sequence).padStart(10, '0')}`,
      occurred_at: timestamp,
      ...auditContext(request),
      duplicate: duplicate === true,
      context_sha256: contextDigestValue || null,
      decision: response.decision,
      reason_code: response.reason_code,
      result_ref_sha256: hashValue(response.result || null),
      effect,
      rollback,
      compensation,
      draft_disposition: draftDisposition,
      draft_expires_at: response.result && response.result.draft ? response.result.draft.expires_at : null,
      previous_audit_sha256: previous,
    };
    const record = { ...body, audit_sha256: hashValue(body) };
    ledger.push(record);
    response.correlation_id = record.correlation_id;
  }

  function invoke(rawRequest) {
    const clock = safeNow();
    let request = null;
    let response = { decision: DECISIONS.DENY, reason_code: REASON_CODES.INVALID_REQUEST, result: null };
    let effect = 'NONE';
    let duplicate = false;
    let digestOfContext = null;
    try {
      if (clock.unavailable) decide(DECISIONS.DENY, REASON_CODES.DEPENDENCY_UNAVAILABLE);
      request = copyRequest(rawRequest);
      if (request.agent_id !== AGENT_CONTRACT.agent_id) decide(DECISIONS.DENY, REASON_CODES.AGENT_NOT_REGISTERED);
      if (request.agent_version !== AGENT_CONTRACT.version) decide(DECISIONS.DENY, REASON_CODES.AGENT_VERSION_MISMATCH);
      validateTool(request);
      readAgent(request, false);
      const initialContext = trustedContext(request, clock.value);
      digestOfContext = contextDigest(initialContext);
      const semanticDigest = requestDigest(request);
      const existingDelivery = idempotency.get(request.idempotency_key);
      if (existingDelivery && existingDelivery.request_sha256 !== semanticDigest) {
        decide(DECISIONS.DENY, REASON_CODES.IDEMPOTENCY_CONFLICT);
      }
      approvalGate(request, initialContext, clock.value);
      try {
        beforeFinalRevalidation({ request: clone(request), duplicate: Boolean(existingDelivery) });
      } catch {
        decide(DECISIONS.DENY, REASON_CODES.DEPENDENCY_UNAVAILABLE);
      }
      readAgent(request, true);
      const finalContext = trustedContext(request, clock.value);
      if (contextDigest(finalContext) !== digestOfContext) decide(DECISIONS.DENY, REASON_CODES.CONTEXT_CHANGED);
      if (existingDelivery) {
        const draft = drafts.get(existingDelivery.draft_id);
        if (!draft) decide(DECISIONS.DENY, REASON_CODES.DEPENDENCY_UNAVAILABLE);
        duplicate = true;
        effect = 'DUPLICATE_RETURNED';
        response = { decision: DECISIONS.ALLOW, reason_code: REASON_CODES.DUPLICATE_REQUEST, result: { draft: clone(draft) } };
      } else if (request.requested_operation === 'READ') {
        effect = 'READ_RELEASED';
        response = { decision: DECISIONS.ALLOW, reason_code: REASON_CODES.OK, result: { summary: scopedRead(finalContext) } };
      } else if (request.requested_operation === 'DRAFT') {
        const draftId = `bos-ai1-draft-${String(drafts.size + 1).padStart(6, '0')}`;
        const draft = {
          draft_id: draftId,
          status: 'DRAFT_ONLY',
          is_canonical: false,
          publish_capability: false,
          company_id: request.company_id,
          resource_type: request.resource_type,
          resource_id: request.resource_id,
          resource_version: request.resource_version,
          content: clone(request.payload),
          created_at: clock.value,
          expires_at: finalContext.task.expires_at,
        };
        drafts.set(draftId, draft);
        idempotency.set(request.idempotency_key, { request_sha256: semanticDigest, draft_id: draftId });
        effect = 'DRAFT_CREATED';
        response = { decision: DECISIONS.ALLOW, reason_code: REASON_CODES.OK, result: { draft: clone(draft) } };
      } else {
        decide(DECISIONS.STOP, REASON_CODES.FOUNDER_DECISION_REQUIRED);
      }
    } catch (error) {
      if (error instanceof ProofDecision && OUTCOME.has(error.decision) && Object.hasOwn(REASON_CODES, error.reason_code)) {
        response = { decision: error.decision, reason_code: error.reason_code, result: null };
      } else {
        response = { decision: DECISIONS.DENY, reason_code: REASON_CODES.INVALID_REQUEST, result: null };
      }
      effect = 'NONE';
    }
    appendLedger({ timestamp: clock.value, request, response, effect, duplicate, contextDigestValue: digestOfContext });
    return deepFreeze(clone(response));
  }

  return Object.freeze({
    invoke,
    listDrafts: () => Array.from(drafts.values(), clone),
    listAuditRecords: () => ledger.map(clone),
  });
}

module.exports = {
  createProjectProgressBriefProof,
  calculatePayloadSha256,
  TOOL_CONTRACTS,
  DECISIONS,
  REASON_CODES,
  REG4_BASELINE,
  AGENT_CONTRACT,
};
