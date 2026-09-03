'use strict';

const { createHash } = require('node:crypto');
const { types } = require('node:util');
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
  'policy_id', 'policy_version', 'valid_until', 'tool_id', 'payload', 'payload_sha256', 'approval_id',
]);
const BINDINGS = Object.freeze(REQUEST_KEYS.filter((key) => ![
  'request_id', 'payload', 'approval_id',
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
  if (types.isProxy(value)) deny('INVALID_DATA');
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

function requestSnapshot(raw) {
  const r = copy(raw);
  if (!r || Array.isArray(r) || typeof r !== 'object' ||
      Object.keys(r).some((k) => !REQUEST_KEYS.includes(k)) ||
      REQUEST_KEYS.filter((k) => k !== 'approval_id').some((k) => !Object.hasOwn(r, k))) deny('INVALID_REQUEST');
  for (const k of REQUEST_KEYS.filter((key) => !['payload', 'approval_id'].includes(key))) {
    if (!token(r[k])) deny('INVALID_REQUEST');
  }
  if (r.approval_id !== undefined && r.approval_id !== null && !token(r.approval_id)) deny('INVALID_REQUEST');
  if (r.tool_id !== ACTION || r.effect_class !== EFFECT_CLASS) deny('ACTION_DENIED');
  if (!timestamp(r.valid_until)) deny('INVALID_REQUEST');
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
  same(c.policy, r, ['company_id', 'policy_id', 'policy_version'], 'POLICY_DENIED');
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

const auditStates = new WeakMap();
const domainStates = new WeakMap();
const permitStates = new WeakMap();
const AUDIT_EVENTS = Object.freeze(['ACTION_INTENT', 'BOS_DECISION', 'EXECUTION_REVALIDATED', 'DOMAIN_DECISION', 'RESULT']);

// These factories configure a trusted, synthetic harness. No production adapter
// or authority is accepted. Only evaluate/execute consume untrusted requests.
function createHandoffAuthority(initial) {
  const state = { data: freeze(copy(initial)), consumed: new Set(), bound: false };
  const authority = Object.freeze({
    replace(next) { state.data = freeze(copy(next)); },
    snapshot() { return copy(state.data); },
  });
  authorityStates.set(authority, state);
  return authority;
}

function createFakeAuditWriter({ failAt = [], beforeWrite = () => {}, afterWrite = () => {} } = {}) {
  const state = { failures: [], records: [], writing: false, bound: false, beforeWrite, afterWrite };
  if (typeof beforeWrite !== 'function' || typeof afterWrite !== 'function') throw new TypeError('invalid audit hooks');
  function setFailures(next) {
    const values = copy(next);
    if (!Array.isArray(values) || values.some((x) => !AUDIT_EVENTS.includes(x))) throw new TypeError('invalid audit failure point');
    state.failures = values;
  }
  setFailures(failAt);
  // Internal append-only ledgers can exceed the untrusted input array/node cap.
  const writer = Object.freeze({ setFailures, listRecords: () => state.records.map((record) => copy(record)) });
  auditStates.set(writer, state);
  return writer;
}

function createFakeDomainGuard(initial, { beforeCheck = () => {}, afterCheck = () => {} } = {}) {
  if (typeof beforeCheck !== 'function' || typeof afterCheck !== 'function') throw new TypeError('invalid Domain hooks');
  const state = { data: freeze(copy(initial)), revision: 0, calls: 0, bound: false, beforeCheck, afterCheck };
  // Synthetic Domain rules live here; neither BOS nor Application Service owns them.
  state.decide = (r) => {
    const d = state.data;
    if (!d || !['ALLOW', 'DENY', 'STOP'].includes(d.decision)) return { decision: 'STOP', reason: 'DOMAIN_UNAVAILABLE' };
    if (d.company_id !== r.company_id || d.resource_id !== r.resource_id || d.version !== r.resource_version) {
      return { decision: 'DENY', reason: 'DOMAIN_RESOURCE_CONFLICT' };
    }
    return { decision: d.decision, reason: d.decision === 'ALLOW' ? 'DOMAIN_ALLOWED' : d.decision === 'DENY' ? 'DOMAIN_VETO' : 'DOMAIN_STOP' };
  };
  const domain = Object.freeze({
    replace(next) { state.data = freeze(copy(next)); state.revision++; },
    snapshot() { return copy(state.data); },
    callCount: () => state.calls,
  });
  domainStates.set(domain, state);
  return domain;
}

function createFakeEffectAdapter({ mode = 'SUCCESS', afterAccept = () => {} } = {}) {
  if (!['SUCCESS', 'REJECT_BEFORE_EFFECT', 'PARTIAL', 'TIMEOUT_AFTER_ACCEPT'].includes(mode) || typeof afterAccept !== 'function') {
    throw new TypeError('invalid fake adapter configuration');
  }
  const state = { mode, afterAccept, calls: 0, effects: [], bound: false };
  const adapter = Object.freeze({ listEffects: () => state.effects.map((effect) => copy(effect)), callCount: () => state.calls });
  adapterStates.set(adapter, state);
  return adapter;
}

function createPreEffectHandoffProof({ registry, authority, audit, domain, adapter }) {
  const auth = authorityStates.get(authority);
  const writer = auditStates.get(audit);
  const guard = domainStates.get(domain);
  const fake = adapterStates.get(adapter);
  if (!auth || !writer || !guard || !fake || auth.bound || writer.bound || guard.bound || fake.bound ||
      !registry || typeof registry.getAgentPackage !== 'function') throw new TypeError('requires unbound synthetic dependencies');
  const getAgent = registry.getAgentPackage.bind(registry);
  auth.bound = writer.bound = guard.bound = fake.bound = true;
  const owner = Object.freeze({});
  const deliveries = new Map();
  const secondaryLedger = [];
  let sequence = 0;
  let permitSequence = 0;
  let applicationCalls = 0;
  let observedTime = -Infinity;

  function semanticDigest(r) {
    const body = { ...r };
    delete body.request_id;
    return hash(body);
  }

  function context(r, requireApproval = true) {
    // Last external trust read. Everything after this read is own private data.
    let record;
    try { record = copy(getAgent(r.agent_id, r.agent_version)); }
    catch { deny('REGISTRY_UNVERIFIABLE'); }
    validateAgent(record, r);
    const c = auth.data;
    validateContext(c, r);
    const now = Date.parse(c.now);
    if (now < observedTime) deny('CLOCK_ROLLBACK');
    observedTime = now;
    if (Date.parse(r.valid_until) <= now) deny('INTENT_EXPIRED');
    if (requireApproval) validateApproval(c, r, auth.consumed);
    return c;
  }

  function safeEvent(r, event, status, reason, entry) {
    return {
      component: event === 'DOMAIN_DECISION' ? 'FAKE_DOMAIN' : event === 'RESULT' ? 'APPLICATION_SERVICE' : 'BOS_AI1',
      event, status, reason_code: reason,
      correlation_id: r ? r.correlation_id : `handoff-invalid-${sequence}`,
      action_sha256: r ? hash(r.action_id) : null,
      request_sha256: r ? semanticDigest(r) : null,
      idempotency_sha256: r ? hash(r.idempotency_key) : null,
      permit_sha256: entry && entry.permit ? entry.permit.permit_sha256 : null,
      context_sha256: entry ? entry.contextDigest : null,
      effect_id: entry && entry.effect ? entry.effect.effect_id : null,
      effect_state: entry && entry.effect ? entry.effect.state : 'NONE',
      domain_decision: entry ? entry.domainDecision : null,
      synthetic: true,
    };
  }

  function append(ledger, body) {
    const record = { ...body, sequence: ledger.length + 1, previous_audit_sha256: ledger.length ? ledger.at(-1).audit_sha256 : '0'.repeat(64) };
    const sealed = freeze({ ...record, audit_sha256: hash(record) });
    ledger.push(sealed);
    return sealed;
  }

  function write(body) {
    if (writer.writing) return false;
    writer.writing = true;
    try {
      const event = freeze(copy(body));
      if (writer.beforeWrite(event) !== undefined || writer.failures.includes(event.event)) return false;
      append(writer.records, event);
      if (writer.afterWrite(event) !== undefined) return false;
      return true;
    } catch { return false; }
    finally { writer.writing = false; }
  }

  // Private secondary evidence cannot be suppressed or populated by a callback.
  function respond(r, response, entry = null, permit = null) {
    const record = append(secondaryLedger, safeEvent(r, 'RESULT', response.status, response.reason_code, entry));
    return freeze({ ...copy(response), ...(permit ? { permit } : {}),
      correlation_id: record.correlation_id, audit_id: `handoff-secondary-${record.sequence}` });
  }

  function rejected(r, error, entry = null) {
    const known = decisions.get(error);
    const reason = known ? known.reason_code : 'INVALID_REQUEST';
    const waiting = known && known.decision === 'REQUIRE_APPROVAL';
    return respond(r, { decision: waiting ? 'REQUIRE_APPROVAL' : 'DENY',
      status: waiting ? 'PENDING_APPROVAL' : 'DENIED', reason_code: reason, effect_state: 'NONE' }, entry);
  }

  function inProgress(r, entry) {
    return respond(r, { status: 'IN_PROGRESS', reason_code: 'REQUEST_IN_PROGRESS', effect_state: 'NONE', duplicate: true }, entry);
  }

  function evaluate(raw) {
    sequence++;
    let r = null;
    let entry = null;
    let reserved = false;
    let issuing = false;
    try {
      r = requestSnapshot(raw);
      const digest = semanticDigest(r);
      entry = deliveries.get(r.idempotency_key);
      if (entry && entry.digest !== digest) deny('IDEMPOTENCY_CONFLICT');
      if (entry && ['ISSUING', 'EXECUTING'].includes(entry.state)) return inProgress(r, entry);
      if (entry && entry.state === 'COMPLETE') return respond(r, { ...entry.response, duplicate: true }, entry);
      if (!entry) {
        entry = { digest, state: 'ISSUING', contextDigest: null, domainDecision: null, effect: null, permit: null };
        deliveries.set(r.idempotency_key, entry);
        reserved = true;
      } else {
        // Re-evaluation itself is reserved before another registry callback.
        entry.state = 'ISSUING';
      }
      issuing = true;
      const c = context(r);
      entry.contextDigest = hash(c);
      if (entry.permit && Date.parse(entry.permit.expires_at) <= Date.parse(c.now)) deny('PERMIT_EXPIRED');
      if (!write(safeEvent(r, 'ACTION_INTENT', 'VALIDATED', 'INTENT_VALIDATED', entry)) ||
          !write(safeEvent(r, 'BOS_DECISION', 'ALLOW', 'CONTROL_ALLOWED', entry))) {
        if (reserved) deliveries.delete(r.idempotency_key); else entry.state = 'PERMITTED';
        return respond(r, { decision: 'STOPPED', status: 'STOPPED', reason_code: 'PRE_EFFECT_AUDIT_FAILED', effect_state: 'NONE' }, entry);
      }
      // Auditing may change authority. Revalidate before issuing an ALLOW permit.
      const final = context(r);
      entry.contextDigest = hash(final);
      if (!entry.permit) {
        const expires = Math.min(...[r.valid_until, final.task.expires_at, final.delegation.expires_at,
          final.approvals[r.approval_id].expires_at].map(Date.parse));
        const binding = Object.fromEntries([...BINDINGS, 'approval_id'].map((k) => [k, r[k]]));
        const body = { permit_id: `handoff-permit-${++permitSequence}`, ...binding, issued_at: final.now,
          expires_at: new Date(expires).toISOString(), request_sha256: digest };
        entry.permit = freeze({ ...body, permit_sha256: hash(body) });
        permitStates.set(entry.permit, { owner, entry, requestDigest: digest });
      }
      entry.state = 'PERMITTED';
      return respond(r, { decision: 'ALLOW', status: 'PERMITTED', reason_code: 'CONTROL_ALLOWED', effect_state: 'NONE' }, entry, entry.permit);
    } catch (error) {
      if (reserved) deliveries.delete(r.idempotency_key);
      else if (issuing && entry && entry.state === 'ISSUING') entry.state = 'PERMITTED';
      return rejected(r, error, entry);
    }
  }

  function finish(r, entry, status, reason) {
    // Capture the effect receipt BEFORE the injectable terminal writer.
    append(secondaryLedger, safeEvent(r, 'RESULT', status, reason, entry));
    const logged = write(safeEvent(r, 'RESULT', status, reason, entry));
    if (!logged) {
      status = entry.effect ? 'COMPENSATION_REQUIRED' : 'STOPPED';
      reason = entry.effect ? 'POST_EFFECT_AUDIT_FAILED' : 'RESULT_AUDIT_FAILED';
    }
    entry.response = freeze({ status, reason_code: reason,
      effect_state: entry.effect ? entry.effect.state : 'NONE',
      effect_id: entry.effect ? entry.effect.effect_id : null,
      compensation_required: status === 'COMPENSATION_REQUIRED', duplicate: false });
    entry.state = 'COMPLETE';
    return respond(r, entry.response, entry);
  }

  function execute(permit, raw) {
    sequence++;
    let r = null;
    let entry = null;
    let executing = false;
    try {
      const provenance = permitStates.get(permit);
      if (!provenance || provenance.owner !== owner) deny('INVALID_PERMIT');
      r = requestSnapshot(raw);
      if (semanticDigest(r) !== provenance.requestDigest) deny('PERMIT_BINDING_MISMATCH');
      entry = provenance.entry;
      if (deliveries.get(r.idempotency_key) !== entry) deny('INVALID_PERMIT');
      if (['ISSUING', 'EXECUTING'].includes(entry.state)) return inProgress(r, entry);
      if (entry.state === 'COMPLETE') return respond(r, { ...entry.response, duplicate: true }, entry);
      entry.state = 'EXECUTING';
      executing = true;
      const c = context(r);
      if (Date.parse(permit.expires_at) <= Date.parse(c.now)) deny('PERMIT_EXPIRED');
      entry.contextDigest = hash(c);
      if (!write(safeEvent(r, 'EXECUTION_REVALIDATED', 'ALLOW', 'CONTROL_REVALIDATED', entry))) {
        return finish(r, entry, 'STOPPED', 'PRE_EFFECT_AUDIT_FAILED');
      }
      applicationCalls++;
      guard.calls++;
      let verdict;
      try {
        if (guard.beforeCheck(freeze(copy(r))) !== undefined || guard.afterCheck() !== undefined) throw null;
        verdict = guard.decide(r);
      } catch { verdict = { decision: 'STOP', reason: 'DOMAIN_UNAVAILABLE' }; }
      const revision = guard.revision;
      entry.domainDecision = verdict.decision;
      if (!write(safeEvent(r, 'DOMAIN_DECISION', verdict.decision, verdict.reason, entry))) {
        return finish(r, entry, 'STOPPED', 'PRE_EFFECT_AUDIT_FAILED');
      }
      if (verdict.decision !== 'ALLOW') return finish(r, entry, verdict.decision === 'DENY' ? 'DENIED' : 'STOPPED', verdict.reason);

      const final = context(r); // Final external call is the REG4 read in context.
      entry.contextDigest = hash(final);
      if (Date.parse(permit.expires_at) <= Date.parse(final.now)) deny('PERMIT_EXPIRED');
      if (guard.revision !== revision || guard.decide(r).decision !== 'ALLOW') deny('DOMAIN_STATE_CHANGED');
      // No callbacks from here until consumption, adapter call and effect receipt.
      auth.consumed.add(r.approval_id);
      fake.calls++;
      if (fake.mode === 'REJECT_BEFORE_EFFECT') return finish(r, entry, 'FAILED', 'ADAPTER_REJECTED_NO_EFFECT');
      const effect = {
        effect_id: `fake-handoff-effect-${fake.effects.length + 1}`, action_id: r.action_id,
        tool_id: ACTION, company_id: r.company_id, resource_id: r.resource_id,
        resource_version: r.resource_version, payload_sha256: r.payload_sha256,
        permit_sha256: permit.permit_sha256, correlation_id: r.correlation_id,
        state: fake.mode === 'SUCCESS' ? 'APPLIED' : fake.mode === 'PARTIAL' ? 'PARTIAL' : 'UNKNOWN', synthetic: true,
      };
      fake.effects.push(effect);
      entry.effect = effect;
      try { if (fake.afterAccept() !== undefined) effect.state = 'UNKNOWN'; }
      catch { effect.state = 'UNKNOWN'; }
      return finish(r, entry, effect.state === 'APPLIED' ? 'EXECUTED' : 'COMPENSATION_REQUIRED',
        effect.state === 'APPLIED' ? 'OK' : effect.state === 'PARTIAL' ? 'PARTIAL_EFFECT' : 'OUTCOME_UNKNOWN');
    } catch (error) {
      if (!executing) return rejected(r, error, entry);
      const known = decisions.get(error);
      return finish(r, entry, entry.effect ? 'COMPENSATION_REQUIRED' : 'DENIED',
        entry.effect ? 'OUTCOME_UNKNOWN' : known ? known.reason_code : 'INVALID_REQUEST');
    }
  }

  return Object.freeze({
    bos: Object.freeze({ evaluate }), applicationService: Object.freeze({ execute }),
    listEffects: () => fake.effects.map((effect) => copy(effect)),
    listSecondaryAudit: () => secondaryLedger.map((record) => copy(record)),
    applicationCallCount: () => applicationCalls,
  });
}

module.exports = {
  ACTION, PERMISSION, EFFECT_CLASS, BINDINGS, REG4_BASELINE, AGENT_CONTRACT,
  payloadSha256, createHandoffAuthority, createFakeAuditWriter, createFakeDomainGuard,
  createFakeEffectAdapter, createPreEffectHandoffProof,
};
