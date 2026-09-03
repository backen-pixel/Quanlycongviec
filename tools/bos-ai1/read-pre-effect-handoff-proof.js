'use strict';

// Additive, memory-only READ proof. The authority holds grants, never rows.
// The three public stages cannot bypass the private read/release boundaries.
const { createHash } = require('node:crypto');
const { types } = require('node:util');
const { calculatePackageSha256 } = require('../reg4/agent-registry');
const { REG4_BASELINE, AGENT_CONTRACT } = require('./project-progress-brief-proof');

const ACTION = 'project.get_progress_summary';
const PERMISSION = 'project.progress.read';
const EFFECT_CLASS = 'READ';
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const SHA = /^[0-9a-f]{64}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const failures = new WeakMap();
const authorityStates = new WeakMap();
const domainStates = new WeakMap();
const repositoryStates = new WeakMap();
const pipelineStates = new WeakMap();
const auditStates = new WeakMap();
const permitStates = new WeakMap();
const REQUEST_KEYS = Object.freeze([
  'request_id', 'correlation_id', 'idempotency_key', 'action_id', 'effect_class',
  'agent_id', 'agent_version', 'package_sha256', 'reg4_baseline_commit', 'reg4_baseline_tree',
  'requester_id', 'executor_id', 'on_behalf_of', 'company_id', 'resource_id',
  'resource_version', 'task_id', 'task_version', 'delegation_id', 'delegation_version',
  'policy_id', 'policy_version', 'valid_until', 'tool_id', 'payload', 'payload_sha256',
]);
const BINDINGS = Object.freeze(REQUEST_KEYS.filter((key) => !['request_id', 'payload'].includes(key)));
const AUDIT_EVENTS = Object.freeze([
  'ACTION_INTENT', 'BOS_DECISION', 'PRE_EFFECT_READY', 'EXECUTION_REVALIDATED',
  'DOMAIN_DECISION', 'READ_COMPLETED', 'FILTERED', 'REDACTED', 'RESULT',
]);

function fail(status = 'DENIED') {
  const marker = Object.freeze({});
  failures.set(marker, status);
  throw marker;
}

// Bounded own-data snapshots reject accessors/proxies without invoking them.
function copy(value, depth = 0, budget = { nodes: 0 }) {
  if (++budget.nodes > 1000 || depth > 10) fail();
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string' && value.length <= 4096) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (!value || typeof value !== 'object' || types.isProxy(value)) fail();
  const array = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype)) fail();
  const keys = Reflect.ownKeys(value);
  if (keys.length > 201 || keys.some((key) => typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key))) fail();
  const result = array ? [] : {};
  let length = 0;
  if (array) {
    const d = Object.getOwnPropertyDescriptor(value, 'length');
    if (!d || !Object.hasOwn(d, 'value')) fail();
    length = d.value;
    if (!Number.isSafeInteger(length) || length < 0 || length > 200 || keys.length !== length + 1) fail();
  }
  const dataKeys = array ? Array.from({ length }, (_, i) => String(i)) : keys.sort();
  if (array && keys.some((key) => key !== 'length' && !dataKeys.includes(key))) fail();
  for (const key of dataKeys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !d.enumerable || !Object.hasOwn(d, 'value')) fail();
    result[key] = copy(d.value, depth + 1, budget);
  }
  return result;
}

function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
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
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exact(value, keys) {
  if (!object(value) || Object.keys(value).length !== keys.length || keys.some((k) => !Object.hasOwn(value, k))) fail();
}
function tokens(value) { if (!Array.isArray(value) || value.some((x) => !token(x))) fail(); }
function tokenMap(value) {
  if (!object(value)) fail();
  for (const [key, list] of Object.entries(value)) { if (!token(key)) fail(); tokens(list); }
}
function includes(list, item) { return Array.isArray(list) && list.includes(item); }
function same(value, expected, keys) { if (!value || keys.some((k) => value[k] !== expected[k])) fail(); }

function requestSnapshot(raw) {
  const r = copy(raw);
  exact(r, REQUEST_KEYS);
  for (const key of REQUEST_KEYS.filter((k) => k !== 'payload')) if (!token(r[key])) fail();
  if (r.tool_id !== ACTION || r.effect_class !== EFFECT_CLASS || !timestamp(r.valid_until)) fail();
  if (r.agent_id !== AGENT_CONTRACT.agent_id || r.agent_version !== AGENT_CONTRACT.version ||
      r.reg4_baseline_commit !== REG4_BASELINE.commit || r.reg4_baseline_tree !== REG4_BASELINE.tree) fail();
  if (!SHA.test(r.package_sha256) || !SHA.test(r.payload_sha256) || hash(r.payload) !== r.payload_sha256) fail();
  exact(r.payload, ['include']);
  if (r.payload.include !== 'current') fail();
  return freeze(r);
}

function authoritySnapshot(raw) {
  const c = copy(raw);
  exact(c, ['now', 'identities', 'task', 'delegation', 'scope', 'policy']);
  if (!timestamp(c.now) || !object(c.identities)) fail();
  for (const [id, actor] of Object.entries(c.identities)) {
    if (!token(id)) fail();
    const keys = ['identity_id', 'company_id', 'active', 'role', 'permissions'];
    if (object(actor) && Object.hasOwn(actor, 'agent_id')) keys.push('agent_id', 'agent_version', 'package_sha256');
    exact(actor, keys);
    for (const k of keys.filter((k) => !['permissions', 'active'].includes(k))) if (!token(actor[k])) fail();
    if (typeof actor.active !== 'boolean') fail();
    tokens(actor.permissions);
  }
  exact(c.task, ['task_id', 'version', 'company_id', 'requester_id', 'executor_id', 'on_behalf_of', 'resource_id',
    'active', 'expires_at', 'permissions', 'allowed_actions', 'allowed_tools']);
  exact(c.delegation, ['delegation_id', 'version', 'company_id', 'delegate_id', 'delegator_id', 'resource_id',
    'revoked', 'expires_at', 'permissions', 'allowed_actions', 'allowed_tools']);
  for (const [value, flag] of [[c.task, 'active'], [c.delegation, 'revoked']]) {
    if (typeof value[flag] !== 'boolean' || !timestamp(value.expires_at)) fail();
    for (const [key, item] of Object.entries(value)) {
      if (['permissions', 'allowed_actions', 'allowed_tools'].includes(key)) tokens(item);
      else if (key !== flag && key !== 'expires_at' && !token(item)) fail();
    }
  }
  exact(c.scope, ['company_id', 'resource_id', 'version', 'permissions_by_principal']);
  for (const key of ['company_id', 'resource_id', 'version']) if (!token(c.scope[key])) fail();
  tokenMap(c.scope.permissions_by_principal);
  exact(c.policy, ['company_id', 'policy_id', 'policy_version', 'allowed_actions', 'allowed_tools', 'prohibited_actions', 'role_permissions']);
  for (const key of ['company_id', 'policy_id', 'policy_version']) if (!token(c.policy[key])) fail();
  for (const key of ['allowed_actions', 'allowed_tools', 'prohibited_actions']) tokens(c.policy[key]);
  tokenMap(c.policy.role_permissions);
  return freeze(c);
}

function validateAgent(record, r) {
  if (!record) fail();
  same(record, { agent_id: r.agent_id, version: r.agent_version }, ['agent_id', 'version']);
  const immutable = {};
  for (const k of ['agent_id', 'name', 'version', 'created_by', 'permissions', 'required_tools', 'prohibited_actions', 'evidence_references']) immutable[k] = record[k];
  const digest = calculatePackageSha256(immutable);
  if (digest !== r.package_sha256 || digest !== record.package_sha256 || record.approval_status !== 'APPROVED') fail();
  if (!Array.isArray(record.evidence_references) || !['AUTOMATED_TEST', 'INDEPENDENT_REVIEW'].every((type) =>
    record.evidence_references.some((e) => e.evidence_type === type && e.result === 'PASS'))) fail();
  if (!includes(record.permissions, PERMISSION) || !includes(record.required_tools, ACTION)) fail();
  if ([ACTION, PERMISSION, EFFECT_CLASS, 'read'].some((x) => includes(record.prohibited_actions, x))) fail();
}

function validateContext(c, r) {
  const time = Date.parse(c.now);
  const actors = ['requester_id', 'executor_id', 'on_behalf_of'].map((key) => {
    const actor = c.identities[r[key]];
    if (!actor || actor.identity_id !== r[key] || actor.active !== true || actor.company_id !== r.company_id ||
        !includes(actor.permissions, PERMISSION)) fail();
    return actor;
  });
  same(actors[1], r, ['agent_id', 'agent_version', 'package_sha256']);
  const task = c.task;
  same(task, { ...r, version: r.task_version }, ['task_id', 'version', 'company_id', 'requester_id', 'executor_id', 'on_behalf_of', 'resource_id']);
  if (!task.active || Date.parse(task.expires_at) <= time || !includes(task.permissions, PERMISSION) ||
      !includes(task.allowed_actions, ACTION) || !includes(task.allowed_tools, ACTION)) fail();
  const d = c.delegation;
  same(d, { ...r, version: r.delegation_version, delegate_id: r.executor_id, delegator_id: r.on_behalf_of },
    ['delegation_id', 'version', 'company_id', 'delegate_id', 'delegator_id', 'resource_id']);
  if (d.revoked || Date.parse(d.expires_at) <= time || !includes(d.permissions, PERMISSION) ||
      !includes(d.allowed_actions, ACTION) || !includes(d.allowed_tools, ACTION)) fail();
  same(c.scope, { ...r, version: r.resource_version }, ['resource_id', 'company_id', 'version']);
  if (!includes(c.scope.permissions_by_principal[r.on_behalf_of], PERMISSION)) fail();
  same(c.policy, r, ['company_id', 'policy_id', 'policy_version']);
  if (!includes(c.policy.allowed_actions, ACTION) || !includes(c.policy.allowed_tools, ACTION) ||
      [ACTION, PERMISSION, EFFECT_CLASS, 'read'].some((x) => includes(c.policy.prohibited_actions, x)) ||
      !includes(c.policy.role_permissions[actors[0].role], PERMISSION)) fail();
}

function createReadAuthority(initial) {
  const state = { data: authoritySnapshot(initial), bound: false };
  const authority = Object.freeze({ replace(next) { state.data = authoritySnapshot(next); }, snapshot: () => copy(state.data) });
  authorityStates.set(authority, state);
  return authority;
}

function domainSnapshot(raw) {
  if (raw === null) return null;
  const d = copy(raw);
  exact(d, ['company_id', 'resource_id', 'version', 'exists', 'decision']);
  if (typeof d.exists !== 'boolean' || !['ALLOW', 'DENY', 'STOP'].includes(d.decision) ||
      !['company_id', 'resource_id', 'version'].every((k) => token(d[k]))) fail();
  return freeze(d);
}

function createFakeReadDomain(initial, { beforeCheck = () => {}, afterCheck = () => {} } = {}) {
  if (typeof beforeCheck !== 'function' || typeof afterCheck !== 'function') throw new TypeError('invalid Domain hooks');
  const state = { data: domainSnapshot(initial), revision: 0, calls: 0, bound: false, beforeCheck, afterCheck };
  state.decide = (r) => {
    const d = state.data;
    if (!d || d.decision === 'STOP') return 'STOP';
    if (!d.exists || d.decision === 'DENY' || d.company_id !== r.company_id ||
        d.resource_id !== r.resource_id || d.version !== r.resource_version) return 'DENY';
    return 'ALLOW';
  };
  const domain = Object.freeze({ replace(next) { state.data = domainSnapshot(next); state.revision++; }, callCount: () => state.calls });
  domainStates.set(domain, state);
  return domain;
}

function rowSnapshot(raw) {
  if (raw === null) return null;
  const row = copy(raw);
  exact(row, ['company_id', 'resource_id', 'version', 'fields']);
  if (!object(row.fields) || !['company_id', 'resource_id', 'version'].every((k) => token(row[k]))) fail();
  return freeze(row);
}

function createFakeReadRepository(initial, { mode = 'SUCCESS', beforeRead = () => {}, afterRead = () => {} } = {}) {
  if (!['SUCCESS', 'THROW', 'INVALID_RESULT'].includes(mode) || typeof beforeRead !== 'function' || typeof afterRead !== 'function') {
    throw new TypeError('invalid repository configuration');
  }
  const state = { row: rowSnapshot(initial), revision: 0, mode, beforeRead, afterRead, calls: 0, reads: 0, bound: false };
  const repository = Object.freeze({ replace(next) { state.row = rowSnapshot(next); state.revision++; },
    readCount: () => state.reads, callCount: () => state.calls });
  repositoryStates.set(repository, state);
  return repository;
}

function createFakeReadPipeline({ beforeFilter = () => {}, afterFilter = () => {}, beforeRedact = () => {}, afterRedact = () => {},
  failFilter = false, failRedaction = false } = {}) {
  if ([beforeFilter, afterFilter, beforeRedact, afterRedact].some((hook) => typeof hook !== 'function')) throw new TypeError('invalid pipeline hooks');
  const state = { beforeFilter, afterFilter, beforeRedact, afterRedact, revision: 0, filters: 0, redactions: 0, bound: false };
  function setFailures(raw) {
    const next = copy(raw);
    exact(next, ['filter', 'redaction']);
    if (typeof next.filter !== 'boolean' || typeof next.redaction !== 'boolean') fail();
    state.failFilter = next.filter; state.failRedaction = next.redaction; state.revision++;
  }
  setFailures({ filter: failFilter, redaction: failRedaction });
  const pipeline = Object.freeze({ setFailures, filterCount: () => state.filters, redactionCount: () => state.redactions });
  pipelineStates.set(pipeline, state);
  return pipeline;
}

function createFakeReadAuditWriter({ failAt = [], beforeWrite = () => {}, afterWrite = () => {} } = {}) {
  if (typeof beforeWrite !== 'function' || typeof afterWrite !== 'function') throw new TypeError('invalid audit hooks');
  const state = { failures: [], records: [], writing: false, bound: false, beforeWrite, afterWrite };
  function setFailures(raw) {
    const next = copy(raw);
    if (!Array.isArray(next) || next.some((event) => !AUDIT_EVENTS.includes(event))) fail();
    state.failures = next;
  }
  setFailures(failAt);
  const writer = Object.freeze({ setFailures, listRecords: () => state.records.map((record) => copy(record)) });
  auditStates.set(writer, state);
  return writer;
}

function createReadPreEffectHandoffProof({ registry, authority, audit, domain, repository, pipeline }) {
  const auth = authorityStates.get(authority);
  const writer = auditStates.get(audit);
  const guard = domainStates.get(domain);
  const repo = repositoryStates.get(repository);
  const projection = pipelineStates.get(pipeline);
  const dependencies = [auth, writer, guard, repo, projection];
  if (dependencies.some((state) => !state || state.bound) || !registry || typeof registry.getAgentPackage !== 'function') {
    throw new TypeError('requires unbound synthetic dependencies and current REG4 reader');
  }
  // Trusted REG4 synchronous snapshot primitive; no model/remote lookup.
  const getAgent = registry.getAgentPackage.bind(registry);
  dependencies.forEach((state) => { state.bound = true; });
  const owner = Object.freeze({});
  const deliveries = new Map();
  const actionKeys = new Map();
  const secondary = [];
  const receipts = [];
  let sequence = 0;
  let permitSequence = 0;
  let applications = 0;
  let releases = 0;
  let observedTime = -Infinity;

  function semanticDigest(r) { const body = { ...r }; delete body.request_id; return hash(body); }
  function context(r, entry) {
    let record;
    try { record = copy(getAgent(r.agent_id, r.agent_version)); validateAgent(record, r); }
    catch { fail(); }
    // Read private authority after the last registry callback.
    const c = auth.data;
    validateContext(c, r);
    const now = Date.parse(c.now);
    if (now < observedTime || Date.parse(r.valid_until) <= now || (entry.expiry !== null && entry.expiry <= now)) fail();
    observedTime = now;
    entry.contextDigest = hash(c);
    return c;
  }
  function event(r, name, status, entry) {
    return {
      component: name === 'DOMAIN_DECISION' ? 'FAKE_DOMAIN' : name === 'BOS_DECISION' ? 'BOS_AI1' : 'READ_HANDOFF',
      event: name, status, reason_code: status === 'DENY' || status === 'DENIED' ? 'READ_DENIED' :
        status === 'STOP' || status === 'STOPPED' ? 'READ_STOPPED' : 'OK',
      correlation_id: r ? r.correlation_id : `read-handoff-invalid-${sequence}`,
      action_sha256: r ? hash(r.action_id) : null, request_sha256: r ? semanticDigest(r) : null,
      idempotency_sha256: r ? hash(r.idempotency_key) : null,
      permit_sha256: entry && entry.control ? entry.control.permit_sha256 : null,
      context_sha256: entry ? entry.contextDigest : null,
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
  function write(r, name, status, entry) {
    if (name === 'RESULT') entry.resultAttempted = true;
    if (writer.writing) return false;
    writer.writing = true;
    try {
      const body = freeze(event(r, name, status, entry));
      if (writer.beforeWrite(body) !== undefined || writer.failures.includes(name)) return false;
      append(writer.records, body);
      if (writer.afterWrite(body) !== undefined) return false;
      return true;
    } catch { return false; }
    finally { writer.writing = false; }
  }
  function respond(r, status, entry = null, additions = {}) {
    const record = append(secondary, event(r, 'RESULT', status, entry));
    return freeze({ status, decision: ['PERMITTED', 'READY', 'EXECUTED'].includes(status) ? 'ALLOW' : status === 'DENIED' ? 'DENY' : status,
      reason_code: status === 'DENIED' ? 'READ_DENIED' : status === 'STOPPED' ? 'READ_STOPPED' : status === 'IN_PROGRESS' ? 'REQUEST_IN_PROGRESS' : 'OK',
      data_released: false, duplicate: false, ...additions,
      correlation_id: record.correlation_id, audit_id: `read-handoff-secondary-${record.sequence}` });
  }
  function progress(r, entry) { return respond(r, 'IN_PROGRESS', entry, { duplicate: true }); }
  function terminal(r, entry, status) {
    if (!entry.resultAttempted && !write(r, 'RESULT', status, entry)) status = 'STOPPED';
    entry.receipt = freeze({ status, release_id: null });
    entry.state = 'COMPLETE';
    return respond(r, status, entry);
  }
  function replay(r, entry) {
    // Lock BEFORE the registry callback; a nested receipt lookup cannot recurse.
    entry.state = 'CHECKING_RECEIPT';
    try {
      context(r, entry);
      return respond(r, entry.receipt.status, entry, { duplicate: true, release_id: entry.receipt.release_id });
    } catch { return respond(r, 'DENIED', entry, { duplicate: true }); }
    finally { entry.state = 'COMPLETE'; }
  }
  function busy(entry) { return ['ISSUING', 'AUDITING', 'EXECUTING', 'CHECKING_RECEIPT', 'CHECKING_READY'].includes(entry.state); }
  function permitFor(entry, r, c, kind) {
    const body = { permit_id: `read-handoff-permit-${++permitSequence}`, stage: kind,
      ...Object.fromEntries(BINDINGS.map((key) => [key, r[key]])),
      issued_at: c.now, expires_at: new Date(entry.expiry).toISOString(), request_sha256: entry.digest,
      control_sha256: entry.control ? entry.control.permit_sha256 : null };
    const permit = freeze({ ...body, permit_sha256: hash(body) });
    permitStates.set(permit, { owner, entry, kind, digest: entry.digest });
    return permit;
  }
  function presentation(permit, raw, kind) {
    const r = requestSnapshot(raw);
    const provenance = permitStates.get(permit);
    if (!provenance || provenance.owner !== owner || provenance.kind !== kind || semanticDigest(r) !== provenance.digest ||
        deliveries.get(r.idempotency_key) !== provenance.entry) fail();
    return { r, entry: provenance.entry };
  }

  function evaluate(raw) {
    sequence++;
    let r = null;
    let entry = null;
    let owned = false;
    try {
      r = requestSnapshot(raw);
      const digest = semanticDigest(r);
      if (actionKeys.has(r.action_id) && actionKeys.get(r.action_id) !== r.idempotency_key) fail();
      entry = deliveries.get(r.idempotency_key);
      if (entry && entry.digest !== digest) fail();
      if (entry && busy(entry)) return progress(r, entry);
      if (entry && entry.state === 'COMPLETE') return replay(r, entry);
      const prior = entry ? entry.state : 'PERMITTED';
      if (!entry) {
        entry = { digest, state: 'ISSUING', expiry: null, control: null, execution: null,
          contextDigest: null, domainDecision: null, resultAttempted: false, receipt: null };
        deliveries.set(r.idempotency_key, entry);
        actionKeys.set(r.action_id, r.idempotency_key);
      } else entry.state = 'ISSUING';
      owned = true;
      const c = context(r, entry);
      if (!entry.control) {
        entry.expiry = Math.min(...[r.valid_until, c.task.expires_at, c.delegation.expires_at].map(Date.parse));
        entry.control = permitFor(entry, r, c, 'CONTROL');
      }
      entry.state = prior;
      // BOS emits only owned metadata evidence. Primary pre-effect audit is next.
      return respond(r, 'PERMITTED', entry, { permit: entry.control });
    } catch {
      if (owned) { entry.receipt = freeze({ status: 'DENIED', release_id: null }); entry.state = 'COMPLETE'; }
      return respond(r, 'DENIED', entry);
    }
  }

  function record(permit, raw) {
    sequence++;
    let r = null;
    let entry = null;
    let owned = false;
    try {
      r = requestSnapshot(raw);
      ({ entry } = presentation(permit, r, 'CONTROL'));
      if (busy(entry)) return progress(r, entry);
      if (entry.state === 'COMPLETE') return replay(r, entry);
      if (entry.state === 'READY') {
        entry.state = 'CHECKING_READY'; owned = true;
        context(r, entry);
        entry.state = 'READY';
        return respond(r, 'READY', entry, { permit: entry.execution, duplicate: true });
      }
      if (entry.state !== 'PERMITTED') fail();
      entry.state = 'AUDITING'; owned = true;
      context(r, entry);
      for (const [name, status] of [['ACTION_INTENT', 'VALIDATED'], ['BOS_DECISION', 'ALLOW'], ['PRE_EFFECT_READY', 'PREPARED']]) {
        if (!write(r, name, status, entry)) fail('STOPPED');
        context(r, entry);
      }
      const c = context(r, entry);
      entry.execution = permitFor(entry, r, c, 'EXECUTION');
      entry.state = 'READY';
      return respond(r, 'READY', entry, { permit: entry.execution });
    } catch (error) {
      if (owned) return terminal(r, entry, failures.get(error) || 'STOPPED');
      return respond(r, 'DENIED', entry);
    }
  }

  function invokeHook(hook, r, name, entry) {
    try { if (hook(freeze(event(r, name, 'CHECKING', entry))) !== undefined) fail('STOPPED'); }
    catch { fail('STOPPED'); }
  }
  function validateBoundary(r, entry, domainRevision, repositoryRevision, pipelineRevision) {
    context(r, entry); // Last external call; following checks use private state.
    if (guard.revision !== domainRevision || guard.decide(r) !== 'ALLOW') fail();
    if (repo.revision !== repositoryRevision || projection.revision !== pipelineRevision) fail('STOPPED');
  }

  function execute(permit, raw) {
    sequence++;
    let r = null;
    let entry = null;
    let owned = false;
    try {
      r = requestSnapshot(raw);
      ({ entry } = presentation(permit, r, 'EXECUTION'));
      if (busy(entry)) return progress(r, entry);
      if (entry.state === 'COMPLETE') return replay(r, entry);
      if (entry.state !== 'READY') fail();
      entry.state = 'EXECUTING'; owned = true;
      context(r, entry);
      if (!write(r, 'EXECUTION_REVALIDATED', 'ALLOW', entry)) fail('STOPPED');
      context(r, entry);
      applications++;
      guard.calls++;
      let verdict;
      try {
        invokeHook(guard.beforeCheck, r, 'DOMAIN_CHECK', entry);
        verdict = guard.decide(r);
        invokeHook(guard.afterCheck, r, 'DOMAIN_CHECK', entry);
      } catch { verdict = 'STOP'; }
      const domainRevision = guard.revision;
      entry.domainDecision = verdict;
      if (!write(r, 'DOMAIN_DECISION', verdict, entry)) fail('STOPPED');
      if (verdict !== 'ALLOW') return terminal(r, entry, verdict === 'DENY' ? 'DENIED' : 'STOPPED');
      const repositoryRevision = repo.revision;
      const pipelineRevision = projection.revision;
      validateBoundary(r, entry, domainRevision, repositoryRevision, pipelineRevision);
      repo.calls++;
      invokeHook(repo.beforeRead, r, 'BEFORE_READ', entry);
      validateBoundary(r, entry, domainRevision, repositoryRevision, pipelineRevision);
      // Domain ALLOW and current authority immediately precede the private read.
      repo.reads++;
      if (repo.mode !== 'SUCCESS') fail('STOPPED');
      const row = repo.row;
      if (!row || row.company_id !== r.company_id || row.resource_id !== r.resource_id || row.version !== r.resource_version) fail('STOPPED');
      invokeHook(repo.afterRead, r, 'AFTER_READ', entry);
      if (!write(r, 'READ_COMPLETED', 'READ', entry)) fail('STOPPED');
      validateBoundary(r, entry, domainRevision, repositoryRevision, pipelineRevision);

      projection.filters++;
      invokeHook(projection.beforeFilter, r, 'BEFORE_FILTER', entry);
      if (projection.failFilter || !['ON_TRACK', 'AT_RISK', 'BLOCKED'].includes(row.fields.status) ||
          !Number.isSafeInteger(row.fields.progress_percent) || row.fields.progress_percent < 0 || row.fields.progress_percent > 100) fail('STOPPED');
      // Do not copy arbitrary values, free text or contact into the projection.
      const selected = { status: row.fields.status, progress_percent: row.fields.progress_percent };
      invokeHook(projection.afterFilter, r, 'AFTER_FILTER', entry);
      if (!write(r, 'FILTERED', 'FILTERED', entry)) fail('STOPPED');
      validateBoundary(r, entry, domainRevision, repositoryRevision, pipelineRevision);

      projection.redactions++;
      invokeHook(projection.beforeRedact, r, 'BEFORE_REDACT', entry);
      if (projection.failRedaction) fail('STOPPED');
      const data = freeze({ ...selected, owner_contact: '[REDACTED]' });
      invokeHook(projection.afterRedact, r, 'AFTER_REDACT', entry);
      if (!write(r, 'REDACTED', 'REDACTED', entry)) fail('STOPPED');
      validateBoundary(r, entry, domainRevision, repositoryRevision, pipelineRevision);

      // A successful RESULT audit means PREPARED, not already disclosed data.
      if (!write(r, 'RESULT', 'PREPARED', entry)) fail('STOPPED');
      validateBoundary(r, entry, domainRevision, repositoryRevision, pipelineRevision);
      // No callbacks, fallible adapter operations or raw-data caching after this.
      // Allocate identity here: a different action may finish in the last hook.
      const releaseId = `fake-read-release-${releases + 1}`;
      const receipt = freeze({ status: 'EXECUTED', release_id: releaseId });
      const result = respond(r, 'EXECUTED', entry, { data, data_released: true, release_id: releaseId });
      entry.receipt = receipt;
      entry.state = 'COMPLETE';
      receipts.push(freeze({ ...receipt, correlation_id: r.correlation_id, request_sha256: entry.digest, synthetic: true }));
      releases++;
      return result;
    } catch (error) {
      if (owned) return terminal(r, entry, failures.get(error) || 'STOPPED');
      return respond(r, 'DENIED', entry);
    }
  }

  return Object.freeze({
    bos: Object.freeze({ evaluate }), preEffectAudit: Object.freeze({ record }), applicationService: Object.freeze({ execute }),
    listSecondaryAudit: () => secondary.map((row) => copy(row)), listReceipts: () => receipts.map((row) => copy(row)),
    applicationCallCount: () => applications, releaseCount: () => releases,
  });
}

module.exports = {
  ACTION, PERMISSION, EFFECT_CLASS, BINDINGS, REG4_BASELINE, AGENT_CONTRACT, AUDIT_EVENTS,
  payloadSha256, createReadAuthority, createFakeReadDomain, createFakeReadRepository,
  createFakeReadPipeline, createFakeReadAuditWriter, createReadPreEffectHandoffProof,
};
