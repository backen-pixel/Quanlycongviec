'use strict';

const { createHash } = require('node:crypto');
const { calculatePackageSha256 } = require('../reg4/agent-registry');
const { REG4_BASELINE, AGENT_CONTRACT } = require('./project-progress-brief-proof');

const ACTION = 'project.publish_status_update';
const PERMISSION = 'project.status_update.publish';
const EFFECT_CLASS = 'LIMITED_WRITE';
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const SHA = /^[0-9a-f]{64}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const authorityStates = new WeakMap();
const adapterStates = new WeakMap();
const decisions = new WeakMap();
const REQUEST_KEYS = Object.freeze([
  'request_id', 'correlation_id', 'idempotency_key', 'action_id', 'effect_class',
  'agent_id', 'agent_version', 'package_sha256', 'reg4_baseline_commit', 'reg4_baseline_tree',
  'requester_id', 'executor_id', 'on_behalf_of', 'company_id', 'resource_id',
  'resource_version', 'task_id', 'task_version', 'delegation_id', 'delegation_version',
  'policy_version', 'payload', 'payload_sha256', 'approval_id',
]);
const BINDINGS = Object.freeze(REQUEST_KEYS.filter((key) => ![
  'request_id', 'correlation_id', 'payload', 'approval_id',
].includes(key)));

function deny(reason, decision = 'DENY') {
  const marker = Object.freeze({});
  decisions.set(marker, { decision, reason_code: reason });
  throw marker;
}

// Bounded own-data snapshot. No getters, toJSON, prototypes or thrown metadata.
function copy(value, depth = 0, budget = { nodes: 0 }) {
  if (++budget.nodes > 1000 || depth > 10) deny('INVALID_DATA');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string' && value.length <= 4096) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (!value || typeof value !== 'object') deny('INVALID_DATA');
  const array = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype)) deny('INVALID_DATA');
  const keys = Reflect.ownKeys(value);
  if (keys.length > 201 || keys.some((k) => typeof k !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(k))) deny('INVALID_DATA');
  const result = array ? [] : {};
  let length = 0;
  if (array) {
    const descriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) deny('INVALID_DATA');
    length = descriptor.value;
    if (!Number.isSafeInteger(length) || length < 0 || length > 200 || keys.length !== length + 1) deny('INVALID_DATA');
  }
  const dataKeys = array ? Array.from({ length }, (_, i) => String(i)) : keys.sort();
  if (array && keys.some((k) => k !== 'length' && !dataKeys.includes(k))) deny('INVALID_DATA');
  for (const key of dataKeys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !d.enumerable || !Object.hasOwn(d, 'value')) deny('INVALID_DATA');
    result[key] = copy(d.value, depth + 1, budget);
  }
  return result;
}

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
}

function hash(value) { return createHash('sha256').update(stable(value)).digest('hex'); }
function payloadSha256(value) { return hash(copy(value)); }
function token(value) { return typeof value === 'string' && TOKEN.test(value) && !value.includes('..') && !value.includes('//'); }
function timestamp(value) {
  return typeof value === 'string' && ISO.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function includes(list, item) { return Array.isArray(list) && list.includes(item); }
function same(record, expected, keys, reason) {
  if (!record || keys.some((k) => record[k] !== expected[k])) deny(reason);
}

function createSyntheticPublishAuthority(initial) {
  const state = { data: freeze(copy(initial)), bound: false, consumed: new Set() };
  const authority = Object.freeze({
    replace(next) { state.data = freeze(copy(next)); },
    snapshot() { return copy(state.data); },
  });
  authorityStates.set(authority, state);
  return authority;
}

function createFakePublishAdapter({ mode = 'SUCCESS', afterAccept = () => {} } = {}) {
  if (!['SUCCESS', 'PARTIAL', 'TIMEOUT_AFTER_ACCEPT'].includes(mode) || typeof afterAccept !== 'function') {
    throw new TypeError('invalid fake adapter configuration');
  }
  const state = { mode, afterAccept, bound: false, effects: [] };
  const adapter = Object.freeze({ listEffects: () => state.effects.map((effect) => copy(effect)) });
  adapterStates.set(adapter, state);
  return adapter;
}

function requestSnapshot(raw) {
  const r = copy(raw);
  if (!r || Array.isArray(r) || typeof r !== 'object' ||
      Object.keys(r).some((k) => !REQUEST_KEYS.includes(k)) ||
      REQUEST_KEYS.filter((k) => k !== 'approval_id').some((k) => !Object.hasOwn(r, k))) deny('INVALID_REQUEST');
  for (const k of REQUEST_KEYS.filter((key) => !['payload', 'approval_id'].includes(key))) {
    if (!token(r[k])) deny('INVALID_REQUEST');
  }
  if (r.approval_id !== undefined && r.approval_id !== null && !token(r.approval_id)) deny('INVALID_REQUEST');
  if (r.action_id !== ACTION || r.effect_class !== EFFECT_CLASS) deny('ACTION_DENIED');
  if (r.agent_id !== AGENT_CONTRACT.agent_id || r.agent_version !== AGENT_CONTRACT.version ||
      r.reg4_baseline_commit !== REG4_BASELINE.commit || r.reg4_baseline_tree !== REG4_BASELINE.tree) deny('BASELINE_OR_AGENT_MISMATCH');
  if (!SHA.test(r.package_sha256) || !SHA.test(r.payload_sha256) || hash(r.payload) !== r.payload_sha256) deny('PAYLOAD_OR_PACKAGE_INVALID');
  if (!r.payload || Array.isArray(r.payload) || typeof r.payload !== 'object' ||
      Object.keys(r.payload).sort().join(',') !== 'note,status' ||
      !['ON_TRACK', 'AT_RISK', 'BLOCKED'].includes(r.payload.status) ||
      typeof r.payload.note !== 'string' || r.payload.note.length > 500) deny('PAYLOAD_INVALID');
  return freeze(r);
}

function validateAgent(record, r) {
  if (!record) deny('AGENT_NOT_REGISTERED');
  same(record, { agent_id: r.agent_id, version: r.agent_version }, ['agent_id', 'version'], 'AGENT_MISMATCH');
  const immutable = {};
  for (const k of ['agent_id', 'name', 'version', 'created_by', 'permissions', 'required_tools', 'prohibited_actions', 'evidence_references']) immutable[k] = record[k];
  const digest = calculatePackageSha256(immutable);
  if (digest !== r.package_sha256 || digest !== record.package_sha256) deny('PACKAGE_FINGERPRINT_MISMATCH');
  if (record.approval_status === 'RETIRED') deny('AGENT_RETIRED');
  if (record.approval_status === 'BLOCKED') deny('AGENT_BLOCKED');
  if (record.approval_status !== 'APPROVED') deny('AGENT_NOT_APPROVED');
  if (!['AUTOMATED_TEST', 'INDEPENDENT_REVIEW'].every((type) =>
    record.evidence_references.some((e) => e.evidence_type === type && e.result === 'PASS'))) deny('REQUIRED_EVIDENCE_MISSING');
  if (!includes(record.permissions, PERMISSION) || !includes(record.required_tools, ACTION)) deny('AGENT_PERMISSION_DENIED');
  if ([ACTION, PERMISSION, 'limited_write', EFFECT_CLASS].some((x) => includes(record.prohibited_actions, x))) deny('ACTION_PROHIBITED');
}

function validateContext(c, r) {
  if (!timestamp(c.now)) deny('CLOCK_UNAVAILABLE');
  const time = Date.parse(c.now);
  const actors = ['requester_id', 'executor_id', 'on_behalf_of'].map((key) => {
    const actor = c.identities && c.identities[r[key]];
    if (!actor || actor.identity_id !== r[key] || actor.active !== true) deny('AUTHORITY_DENIED');
    if (actor.company_id !== r.company_id) deny('COMPANY_DENIED');
    if (!includes(actor.permissions, PERMISSION)) deny('PERMISSION_DENIED');
    return actor;
  });
  same(actors[1], r, ['agent_id', 'agent_version', 'package_sha256'], 'EXECUTOR_MISMATCH');
  const task = c.task;
  same(task, { ...r, version: r.task_version }, ['task_id', 'version', 'company_id', 'requester_id', 'executor_id', 'on_behalf_of', 'resource_id'], 'TASK_DENIED');
  if (task.active !== true || !timestamp(task.expires_at) || Date.parse(task.expires_at) <= time ||
      !includes(task.allowed_actions, ACTION) || !includes(task.allowed_tools, ACTION) || !includes(task.permissions, PERMISSION)) deny('TASK_DENIED');
  const d = c.delegation;
  same(d, { ...r, version: r.delegation_version, delegate_id: r.executor_id, delegator_id: r.on_behalf_of },
    ['delegation_id', 'version', 'company_id', 'delegate_id', 'delegator_id', 'resource_id'], 'DELEGATION_DENIED');
  if (d.revoked !== false || !timestamp(d.expires_at) || Date.parse(d.expires_at) <= time ||
      !includes(d.allowed_actions, ACTION) || !includes(d.allowed_tools, ACTION) || !includes(d.permissions, PERMISSION)) deny('DELEGATION_DENIED');
  same(c.project, { ...r, version: r.resource_version }, ['resource_id', 'company_id', 'version'], 'RESOURCE_DENIED');
  if (!includes(c.project.permissions_by_principal && c.project.permissions_by_principal[r.on_behalf_of], PERMISSION)) deny('PERMISSION_DENIED');
  same(c.policy, r, ['company_id', 'policy_version'], 'POLICY_DENIED');
  if (!includes(c.policy.allowed_actions, ACTION) || !includes(c.policy.allowed_tools, ACTION) ||
      [ACTION, PERMISSION, EFFECT_CLASS, 'limited_write'].some((x) => includes(c.policy.prohibited_actions, x)) ||
      !includes(c.policy.role_permissions && c.policy.role_permissions[actors[0].role], PERMISSION)) deny('POLICY_DENIED');
}

function validateApproval(c, r, consumed) {
  if (!r.approval_id) deny('APPROVAL_REQUIRED', 'REQUIRE_APPROVAL');
  const a = c.approvals && c.approvals[r.approval_id];
  if (!a) deny('APPROVAL_REQUIRED', 'REQUIRE_APPROVAL');
  same(a, r, ['approval_id', ...BINDINGS], 'APPROVAL_BINDING_MISMATCH');
  if (consumed.has(r.approval_id) || a.status === 'CONSUMED') deny('APPROVAL_CONSUMED');
  if (a.status === 'REVOKED') deny('APPROVAL_REVOKED');
  if (a.status !== 'ACTIVE') deny('APPROVAL_INVALID');
  if (!timestamp(a.not_before) || !timestamp(a.expires_at) ||
      Date.parse(a.not_before) > Date.parse(c.now) || Date.parse(a.expires_at) <= Date.parse(c.now) ||
      Date.parse(a.not_before) >= Date.parse(a.expires_at)) deny('APPROVAL_EXPIRED_OR_NOT_YET_VALID');
  const approver = c.identities[a.approver_id];
  if (!approver || approver.identity_id !== a.approver_id || approver.active !== true ||
      approver.company_id !== r.company_id || !includes(approver.permissions, 'project.status_update.approve') ||
      !includes(c.policy.approver_ids, a.approver_id)) deny('APPROVER_DENIED');
}

function createControlledPublishProof({ registry, authority, adapter, beforeFinalRevalidation = () => {} }) {
  const auth = authorityStates.get(authority);
  const fake = adapterStates.get(adapter);
  if (!auth || !fake || auth.bound || fake.bound || !registry ||
      typeof registry.getAgentPackage !== 'function' || typeof beforeFinalRevalidation !== 'function') {
    throw new TypeError('requires unbound synthetic proof dependencies');
  }
  const getAgent = registry.getAgentPackage.bind(registry);
  auth.bound = true;
  fake.bound = true;
  const deliveries = new Map();
  const ledger = [];
  let invocationSequence = 0;

  function currentContext(r) {
    // The registry is the final external call. All subsequent reads are private data.
    let record;
    try { record = copy(getAgent(r.agent_id, r.agent_version)); }
    catch { deny('REGISTRY_UNVERIFIABLE'); }
    validateAgent(record, r);
    const context = auth.data;
    validateContext(context, r);
    return context;
  }

  function invoke(raw) {
    const invocationId = `bos-publish-invocation-${++invocationSequence}`;
    let r = null;
    let contextDigest = null;
    let semanticDigest = null;
    let reserved = false;
    let accepted = null;
    let duplicate = false;
    let response;
    try {
      r = requestSnapshot(raw);
      const semantic = { ...r };
      delete semantic.request_id;
      delete semantic.correlation_id;
      semanticDigest = hash(semantic);
      const prior = deliveries.get(r.idempotency_key);
      if (prior && prior.digest !== semanticDigest) deny('IDEMPOTENCY_CONFLICT');
      if (prior && prior.state === 'IN_FLIGHT') deny('REQUEST_IN_PROGRESS');
      if (!prior) {
        deliveries.set(r.idempotency_key, { digest: semanticDigest, state: 'IN_FLIGHT' });
        reserved = true;
      }
      const initial = currentContext(r);
      contextDigest = hash(initial);
      if (prior) {
        duplicate = true;
        response = copy(prior.response);
      } else {
        validateApproval(initial, r, auth.consumed);
        try { beforeFinalRevalidation(); } catch { deny('REVALIDATION_HOOK_FAILED'); }
        const finalContext = currentContext(r);
        validateApproval(finalContext, r, auth.consumed);
        contextDigest = hash(finalContext);
        // No external calls from this point until the effect and consumption exist.
        auth.consumed.add(r.approval_id);
        accepted = {
          effect_id: `fake-publish-${fake.effects.length + 1}`,
          action_id: ACTION, effect_class: EFFECT_CLASS, company_id: r.company_id,
          resource_id: r.resource_id, resource_version: r.resource_version,
          payload_sha256: r.payload_sha256, idempotency_key_sha256: hash(r.idempotency_key),
          state: fake.mode === 'SUCCESS' ? 'APPLIED' : fake.mode === 'PARTIAL' ? 'PARTIAL' : 'UNKNOWN',
          synthetic: true,
        };
        fake.effects.push(accepted);
        try { fake.afterAccept(); } catch { accepted.state = 'UNKNOWN'; }
        response = {
          decision: accepted.state === 'APPLIED' ? 'ALLOW' : 'COMPENSATION_REQUIRED',
          reason_code: accepted.state === 'APPLIED' ? 'OK' : 'COMPENSATION_REQUIRED',
          effect_state: accepted.state, result: copy(accepted),
        };
        deliveries.set(r.idempotency_key, { digest: semanticDigest, state: 'COMPLETE', response: freeze(copy(response)) });
      }
    } catch (error) {
      const known = decisions.get(error);
      response = { ...(known || { decision: 'DENY', reason_code: 'INVALID_REQUEST' }), effect_state: 'NONE', result: null };
      if (reserved && !accepted) deliveries.delete(r.idempotency_key);
    }
    const correlation = r ? r.correlation_id : `bos-publish-correlation-${invocationSequence}`;
    const body = {
      sequence: ledger.length + 1, invocation_id: invocationId, correlation_id: correlation,
      action_id: ACTION, decision: response.decision, reason_code: response.reason_code,
      request_sha256: semanticDigest, context_sha256: contextDigest,
      approval_id_sha256: r && r.approval_id ? hash(r.approval_id) : null,
      duplicate, effect_created: accepted !== null, effect_state: response.effect_state,
      effect_id: response.result ? response.result.effect_id : null,
      compensation: response.effect_state === 'UNKNOWN' || response.effect_state === 'PARTIAL' ? 'REQUIRED_NO_RETRY' : 'NOT_REQUIRED',
      previous_audit_sha256: ledger.length ? ledger[ledger.length - 1].audit_sha256 : '0'.repeat(64),
    };
    const audit = freeze({ ...body, audit_sha256: hash(body) });
    ledger.push(audit);
    return freeze({ ...copy(response), duplicate, correlation_id: correlation, audit_id: invocationId });
  }

  return Object.freeze({ invoke, listAuditRecords: () => ledger.map((record) => copy(record)), listEffects: () => fake.effects.map((effect) => copy(effect)) });
}

module.exports = {
  ACTION, PERMISSION, EFFECT_CLASS, BINDINGS, REG4_BASELINE, AGENT_CONTRACT,
  payloadSha256, createSyntheticPublishAuthority, createFakePublishAdapter, createControlledPublishProof,
};
