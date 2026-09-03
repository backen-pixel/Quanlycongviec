'use strict';

// Synthetic orchestration only. Native control modules retain every ALLOW,
// permit, lifecycle, policy, audit, accounting and effect decision.
const { createHash, randomUUID } = require('node:crypto');
const { types } = require('node:util');
const REG = require('../reg4/agent-registry');
const MG = require('../mg5/model-gateway-proof');
const READ = require('../bos-ai1/read-pre-effect-handoff-proof');
const DRAFT = require('../bos-ai1/draft-pre-effect-handoff-proof');
const PUBLISH = require('../bos-ai1/pre-effect-handoff-proof');
const MODULES = { READ, DRAFT, PUBLISH };
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const SHA = /^[a-f0-9]{64}$/;
const ZERO = '0'.repeat(64);
const NOW = '2026-09-03T00:00:00.000Z';
const UNTIL = '2026-09-03T00:15:00.000Z';
const EXPIRY = '2026-09-03T01:00:00.000Z';
const HOOKS = Object.freeze(['session.beforeVerify', 'registry.read', 'mg5.beforeFinal', 'mg5.audit.prepare',
  'model.before', 'model.after', 'model.validate', 'bos.audit.before', 'bos.audit.after', 'domain.before',
  'domain.after', 'read.before', 'read.after', 'filter.before', 'filter.after', 'redaction.before',
  'redaction.after', 'effect.after', 'audit.before', 'audit.after']);
const SESSION_KEYS = Object.freeze(['session_id', 'correlation_id', 'task_id', 'task_version', 'session_version',
  'company_id', 'resource_id', 'delegation_id', 'delegation_version', 'executive_ai_identity',
  'executive_ai_version', 'on_behalf_of', 'agent_id', 'agent_version', 'package_sha256']);
const INTENT_KEYS = Object.freeze(['action_id', 'session_id', 'session_version', 'correlation_id', 'task_id',
  'task_version', 'requester_id', 'executor_id', 'on_behalf_of', 'delegation_id', 'delegation_version',
  'company_id', 'action_type', 'target', 'input_data', 'data_classification', 'risk_level', 'budget_or_limit',
  'evidence_references', 'valid_until', 'idempotency_key', 'agent_id', 'agent_version', 'agent_package_sha256',
  'policy_reference', 'model_invocation_reference']);
const marks = new WeakMap();
function fail(code = 'INVALID_INPUT', status = 'DENIED') { const x = Object.freeze({}); marks.set(x, { code, status }); throw x; }
function copy(v, depth = 0, budget = { n: 0 }) {
  if (++budget.n > 2000 || depth > 12) fail();
  if (v === null || typeof v === 'boolean') return v;
  if (typeof v === 'string' && v.length <= 4096) return v;
  if (typeof v === 'number' && Number.isSafeInteger(v)) return v;
  if (!v || typeof v !== 'object' || types.isProxy(v)) fail();
  const a = Array.isArray(v);
  if (Object.getPrototypeOf(v) !== (a ? Array.prototype : Object.prototype)) fail();
  const keys = Reflect.ownKeys(v);
  if (keys.length > 501 || keys.some(k => typeof k !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(k))) fail();
  let selected = keys.sort();
  if (a) {
    const d = Object.getOwnPropertyDescriptor(v, 'length');
    if (!d || !Object.hasOwn(d, 'value') || !Number.isSafeInteger(d.value) || d.value < 0 || d.value > 500 || keys.length !== d.value + 1) fail();
    selected = Array.from({ length: d.value }, (_, i) => String(i));
    if (keys.some(k => k !== 'length' && !selected.includes(k))) fail();
  }
  const out = a ? [] : {};
  for (const k of selected) { const d = Object.getOwnPropertyDescriptor(v, k); if (!d || !d.enumerable || !Object.hasOwn(d, 'value')) fail(); out[k] = copy(d.value, depth + 1, budget); }
  return out;
}
function freeze(v) { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; }
function stable(v) { return v && typeof v === 'object' ? Array.isArray(v) ? `[${v.map(stable).join(',')}]` : `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v); }
function hash(v) { return createHash('sha256').update(stable(v)).digest('hex'); }
function exact(v, keys) { if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) fail(); }
function token(v) { return typeof v === 'string' && TOKEN.test(v) && !v.includes('..') && !v.includes('//'); }
function iso(v) { return typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v; }
function equal(a, b) { return stable(a) === stable(b); }
const CONSTANTS = freeze({ NOW, UNTIL, EXPIRY, HOOKS, SESSION_KEYS, INTENT_KEYS,
  agent_id: READ.AGENT_CONTRACT.agent_id, agent_version: READ.AGENT_CONTRACT.version,
  company_id: 'company-demo-1', resource_id: 'project-demo-1', executive_id: 'executive-ai',
  executor_id: 'agent-executor', founder_id: 'founder', fake_model: 'model.fake.reasoning@1.0.0' });

function createOC6Proof(options = {}) {
  const instanceReference = `oc6-${randomUUID()}`;
  const opts = copy(options);
  if (Object.keys(opts).some(k => k !== 'agentStatus') || (opts.agentStatus && !['APPROVED', 'BLOCKED', 'RETIRED'].includes(opts.agentStatus))) throw new TypeError('invalid synthetic options');
  const hooks = new Map(), failures = new Set(), sessions = new Map(), entries = new Map(), idempotency = new Map();
  const tickets = new WeakMap(), approvals = new WeakMap(), approvalRequests = new Map();
  const audit = [], secondary = [], queues = { executive: [], founder: [], approval: [] };
  const registry = REG.createAgentRegistry({ now: () => NOW });
  const permissions = ['model.request', READ.PERMISSION, DRAFT.PERMISSION, PUBLISH.PERMISSION];
  const agentContent = { agent_id: CONSTANTS.agent_id, name: 'OC6 Synthetic Project Status Agent', version: CONSTANTS.agent_version,
    created_by: 'builder.oc6', permissions, required_tools: [READ.ACTION, DRAFT.ACTION, PUBLISH.ACTION], prohibited_actions: ['critical_write'],
    evidence_references: [{ evidence_id: 'synthetic.tests', evidence_type: 'AUTOMATED_TEST', result: 'PASS', sha256: 'a'.repeat(64) },
      { evidence_id: 'synthetic.review', evidence_type: 'INDEPENDENT_REVIEW', result: 'PASS', sha256: 'b'.repeat(64) }] };
  const packageSha = REG.calculatePackageSha256(agentContent);
  registry.registerAgentPackage({ ...agentContent, package_sha256: packageSha }, { actor_id: 'builder.oc6', role: 'AUTHOR' });
  const transition = (to, role) => registry.transitionApproval({ agent_id: agentContent.agent_id, version: agentContent.version, to_status: to }, { actor_id: 'control.oc6', role });
  transition('IN_REVIEW', 'REVIEWER');
  transition(opts.agentStatus === 'BLOCKED' ? 'BLOCKED' : 'APPROVED', opts.agentStatus === 'BLOCKED' ? 'REVIEWER' : 'APPROVER');
  if (opts.agentStatus === 'RETIRED') transition('RETIRED', 'REGISTRY_ADMIN');
  const origin = freeze({ delegation_id: 'delegation-1', delegation_version: '1', founder_identity: 'founder',
    executive_ai_identity: 'executive-ai', executive_ai_version: '1', on_behalf_of: 'founder', company_id: CONSTANTS.company_id,
    resource_id: CONSTANTS.resource_id, permissions, allowed_actions: ['READ', 'DRAFT', 'PUBLISH'],
    objective: 'Prepare and simulate the Synthetic Project Status Update through approved controls',
    delegation_scope: { domain: 'project_status', use_case: 'prepare_status_update', action_types: ['READ', 'DRAFT', 'PUBLISH'],
      resource_ids: [CONSTANTS.resource_id], data_classes: ['D1'], channel: 'FAKE_ADAPTER' },
    company_scope: [CONSTANTS.company_id], granted_permissions: permissions,
    prohibited_actions: ['READ_SENSITIVE', 'REAL_EGRESS', 'CHANGE_AUTHORITY_POLICY'],
    budget: { unit: 'fake-credit', maximum: 10 }, risk_thresholds: { autonomous_maximum: 'LOW', material_exception: 'PARTIAL_OR_UNKNOWN_EFFECT' },
    acceptance_criteria: Array.from({ length: 14 }, (_, i) => `OC6-P${String(i + 1).padStart(2, '0')}`),
    stop_conditions: ['DELEGATION_NOT_ACTIVE', 'GLOBAL_STOP', 'SESSION_STOP', 'AUDIT_UNAVAILABLE', 'PIN_DRIFT', 'BUDGET_EXCEEDED'],
    revocation_conditions: ['FOUNDER_REVOKED', 'EXPIRED', 'REPLACED_VERSION'], revocation_authorities: ['founder'],
    policy_references: [{ policy_id: 'fake-bos-policy', policy_version: '1' }, { policy_id: 'fake-model-policy', policy_version: '1' }],
    status: 'ACTIVE', issued_at: NOW, valid_from: NOW, expires_at: EXPIRY, risk: 'LOW', channel: 'FAKE_ADAPTER' });
  const originHash = hash(origin);
  const control = { now: NOW, observedTime: Date.parse(NOW), delegationStatus: 'ACTIVE', delegationExpiry: EXPIRY,
    integrity: originHash, executiveVersion: '1', assignmentVersion: agentContent.version, assignmentSha: packageSha,
    globalStop: false, writeClose: false, originStopped: false, budgetLimit: 10, auditAvailable: true,
    bosVersion: '1', prohibited: [], modelStatus: 'APPROVED', modelPolicy: '1', modelCatalog: '1', modelAllowed: true };
  const config = { resourceVersion: '1', domainDecision: 'ALLOW', readMode: 'SUCCESS', effectMode: 'SUCCESS', filterFailure: false, redactionFailure: false };
  let approvalSeq = 0, modelSeq = 0, simulations = 0, bosEvaluations = 0, approvalRechecks = 0, modelBusy = false;
  let modelOutcomes = [];
  let modelOutput = freeze({ status: 'ON_TRACK', note: 'Synthetic status update' });
  function append(ledger, body) {
    const x = { ...body, sequence: ledger.length + 1, previous_audit_sha256: ledger.length ? ledger.at(-1).audit_sha256 : ZERO };
    const row = freeze({ ...x, audit_sha256: hash(x) }); ledger.push(row); return row;
  }
  function metadata(event, s, e, extras = {}) { return { event, component: 'OC6', session_id: s ? s.request.session_id : null,
    correlation_id: s ? s.request.correlation_id : 'oc6-invalid', task_id: s ? s.request.task_id : null,
    action_id: e ? e.intent.action_id : null, delegation_reference: { delegation_id: origin.delegation_id, delegation_version: origin.delegation_version },
    origin_sha256: originHash, projection_sha256: e ? e.projectionHash : null,
    policy_reference: { policy_id: 'fake-bos-policy', policy_version: e ? e.intent.policy_reference.policy_version : control.bosVersion },
    agent_reference: { agent_id: agentContent.agent_id, agent_version: agentContent.version, package_sha256: packageSha },
    model_invocation_reference: s && s.model ? s.model.reference : null, company_id: origin.company_id, on_behalf_of: origin.on_behalf_of,
    data_classification: 'D1', idempotency_reference: e && e.digest ? e.digest : null, synthetic: true, ...extras }; }
  function hook(name, s, e, extras = {}) {
    const fn = hooks.get(name); if (!fn) return;
    try { if (fn(freeze(metadata(extras.event || name, s, e, { ...extras, hook: name }))) !== undefined) fail('HOOK_FAILED', 'STOPPED'); }
    catch { fail('HOOK_FAILED', 'STOPPED'); }
  }
  function emit(event, s, e, extras = {}) {
    const body = metadata(event, s, e, extras);
    hook('audit.before', s, e, { event });
    if (!control.auditAvailable || failures.has('*') || failures.has(event)) fail('AUDIT_UNAVAILABLE', 'STOPPED');
    const row = append(audit, body);
    hook('audit.after', s, e, { event });
    if (!control.auditAvailable || failures.has('*') || failures.has(event)) fail('AUDIT_UNAVAILABLE', 'STOPPED');
    return row;
  }
  function bridgeRegistry(s, e = null) {
    if (!s) return;
    for (const record of registry.listAuditRecords()) if (!s.registryBridges.has(record.audit_sha256)) {
      s.registryBridges.add(record.audit_sha256);
      append(audit, metadata('NATIVE_BRIDGE', s, e, { native_component: 'REG4', native_audit_sha256: record.audit_sha256,
        native_correlation_id: record.correlation_id, request_sha256: hash(s.request) }));
    }
  }
  function agent(s, e) {
    bridgeRegistry(s, e);
    const r = registry.getAgentPackage(agentContent.agent_id, agentContent.version);
    if (!r || r.package_sha256 !== packageSha || REG.calculatePackageSha256(Object.fromEntries(Object.keys(agentContent).map(k => [k, r[k]]))) !== packageSha ||
      r.approval_status !== 'APPROVED') fail('AGENT_INVALID');
    return r;
  }
  function guard(s, e = null) {
    if (!s || s.state === 'STOPPED' || s.stopped || control.globalStop || control.originStopped || control.delegationStatus !== 'ACTIVE') fail('AUTHORITY_STOPPED', 'STOPPED');
    const now = Date.parse(control.now);
    if (!iso(control.now) || now < control.observedTime) fail('CLOCK_INVALID', 'STOPPED');
    control.observedTime = now;
    if (now < Date.parse(origin.valid_from) || now >= Date.parse(control.delegationExpiry) || now >= Date.parse(origin.expires_at)) fail('DELEGATION_EXPIRED', 'STOPPED');
    if (control.integrity !== originHash || control.executiveVersion !== origin.executive_ai_version ||
      control.assignmentVersion !== s.request.agent_version || control.assignmentSha !== packageSha) fail('ORIGIN_BINDING_CHANGED', 'STOPPED');
    agent(s, e);
    if (e) {
      if (now >= Date.parse(e.intent.valid_until)) fail('INTENT_EXPIRED');
      if (control.bosVersion !== e.intent.policy_reference.policy_version || control.prohibited.includes(e.kind)) fail('POLICY_DENIED');
      if (control.writeClose && e.kind !== 'READ') fail('GLOBAL_WRITE_CLOSED', 'STOPPED');
      if (e.intent.target.resource_version !== s.config.resourceVersion) fail('RESOURCE_VERSION_CHANGED');
      if (!s.model || e.intent.model_invocation_reference !== s.model.reference || !equal(s.model.pin, modelPin(s))) fail('MODEL_PROVENANCE_CHANGED', 'STOPPED');
    }
  }
  function modelPin(s) { return { origin: control.integrity, executive: control.executiveVersion, assignment: control.assignmentVersion,
    assignment_sha256: control.assignmentSha, policy: control.modelPolicy, catalog: control.modelCatalog,
    status: control.modelStatus, allowed: control.modelAllowed, budget_limit: control.budgetLimit, session: s.request.session_id,
    agent_status: registry.getAgentPackage(agentContent.agent_id, agentContent.version).approval_status }; }
  function modelGuard(s, pin) { guard(s); if (!equal(pin, modelPin(s)) || control.modelStatus !== 'APPROVED' || !control.modelAllowed) fail('MODEL_PROVENANCE_CHANGED', 'STOPPED'); }
  function charged() { let total = 0; for (const s of sessions.values()) if (s.gateway) total += s.gateway.getBudgetSnapshot().reduce((n, x) => n + x.proof_spent_units, 0); return total; }
  function result(s, e, status, reason, additions = {}, queue = true) {
    const body = { status, reason_code: reason, session_id: s ? s.request.session_id : null, correlation_id: s ? s.request.correlation_id : 'oc6-invalid',
      action_id: e ? e.intent.action_id : null, policy_reference: e ? copy(e.intent.policy_reference) : { policy_id: 'fake-bos-policy', policy_version: control.bosVersion },
      delegation_reference: { delegation_id: origin.delegation_id, delegation_version: origin.delegation_version, integrity_reference: originHash },
      resource_version: e ? e.intent.target.resource_version : s ? s.config.resourceVersion : null,
      approval_reference: e && e.approval ? hash(e.approval.approval_id) : null,
      result_summary: `Synthetic ${status.toLowerCase()} result`, compensation_reference: status === 'COMPENSATION_REQUIRED' ? `compensation-${e.intent.action_id}` : null,
      duplicate: false, data_released: false, ...additions };
    const row = append(secondary, metadata('RESULT', s, e, { status, reason_code: reason }));
    // Callback-free final receipt bookkeeping after native release/effect.
    const primary = append(audit, metadata('RESULT', s, e, { status, reason_code: reason, secondary_audit_sha256: row.audit_sha256 }));
    const out = freeze({ ...body, audit_reference: primary.audit_sha256 });
    if (queue && !['PERMITTED', 'ACTIVE'].includes(status)) {
      const safe = { ...out }; delete safe.data; delete safe.output; delete safe.ticket;
      if (status === 'COMPENSATION_REQUIRED') { queues.founder.push(freeze(safe)); queues.executive.push(freeze({ ...safe })); }
      else if (status === 'PENDING_APPROVAL') queues.approval.push(freeze(safe));
      else queues.executive.push(freeze(safe));
    }
    return out;
  }
  function rejected(error, s = null, e = null) { const m = marks.get(error); return result(s, e, m ? m.status : 'DENIED', m ? m.code : 'INVALID_INPUT'); }
  function safePrior(s, e, prior) { const x = { ...prior }; delete x.data; delete x.output; delete x.audit_reference; return result(s, e, prior.status, prior.reason_code, { ...x, data_released: false, duplicate: true }, false); }
  function sessionRequest(overrides = {}) { return { session_id: 'session-1', correlation_id: 'correlation-1', task_id: 'task-1', task_version: '1', session_version: '1',
    company_id: origin.company_id, resource_id: origin.resource_id, delegation_id: origin.delegation_id, delegation_version: origin.delegation_version,
    executive_ai_identity: origin.executive_ai_identity, executive_ai_version: origin.executive_ai_version, on_behalf_of: origin.on_behalf_of,
    agent_id: agentContent.agent_id, agent_version: agentContent.version, package_sha256: packageSha, ...copy(overrides) }; }
  function openSession(raw) {
    let s, own = false;
    try {
      const r = copy(raw); exact(r, SESSION_KEYS); if (SESSION_KEYS.some(k => !token(r[k]))) fail();
      const defaults = sessionRequest();
      if (SESSION_KEYS.filter(k => !['session_id', 'correlation_id', 'task_id'].includes(k)).some(k => r[k] !== defaults[k])) fail('SESSION_BINDING_MISMATCH');
      s = sessions.get(r.session_id);
      if (s) { if (!equal(s.request, r)) fail('SESSION_CONFLICT'); if (s.state === 'OPENING') fail('REQUEST_IN_PROGRESS', 'STOPPED'); guard(s); return result(s, null, 'ACTIVE', 'OK', { duplicate: true }, false); }
      if ([...sessions.values()].some(x => x.request.correlation_id === r.correlation_id || x.request.task_id === r.task_id)) fail('SESSION_CONFLICT');
      s = { request: freeze(r), state: 'OPENING', stopped: false, config: { ...config }, model: null, modelState: 'NONE', gateway: null, registryBridges: new Set() };
      sessions.set(r.session_id, s);
      own = true;
      hook('session.beforeVerify', s); guard(s);
      emit('ROUTER_PROPOSED', s); guard(s);
      emit('REG4_VERIFIED', s, null, { package_sha256: packageSha }); guard(s);
      emit('SESSION_OPENED', s); guard(s); s.state = 'ACTIVE';
      return result(s, null, 'ACTIVE', 'OK', {}, false);
    } catch (err) { if (own && s && s.state === 'OPENING') s.state = 'STOPPED'; return rejected(err, s); }
  }
  function runModel(sessionId) {
    let s, own = false, pin;
    try {
      if (!token(sessionId)) fail(); s = sessions.get(sessionId); guard(s);
      if (s.modelState === 'RUNNING' || modelBusy) fail('REQUEST_IN_PROGRESS', 'STOPPED');
      if (s.model) { modelGuard(s, s.model.pin); return safePrior(s, null, s.model.response); }
      if (s.modelState === 'FAILED') fail('MODEL_ALREADY_FAILED', 'STOPPED');
      s.modelState = 'RUNNING'; modelBusy = true; own = true; // Global delegation reservation excludes cross-session reentry.
      pin = modelPin(s); const reference = `${instanceReference}-model-${++modelSeq}`;
      emit('MG5_REQUESTED', s); modelGuard(s, pin);
      let denied = false;
      const check = () => { if (denied) fail('MODEL_PROVENANCE_CHANGED', 'STOPPED'); try { modelGuard(s, pin); } catch (err) { denied = true; throw err; } };
      const resolvers = {
        getAuthority: () => { guard(s); return { requester_id: 'agent-executor', active: true, company_id: origin.company_id, role: 'agent', permissions: ['model.request'], agent_id: agentContent.agent_id, agent_version: agentContent.version, package_sha256: packageSha }; },
        getCompanyContext: () => ({ company_id: origin.company_id, active: !control.globalStop, context_version: '1' }),
        getPolicy: () => ({ company_id: origin.company_id, policy_version: control.modelPolicy, allowed_use_cases: ['project-summary'], allowed_data_classes: ['D1'], allowed_models: [control.modelAllowed ? CONSTANTS.fake_model : 'model.prohibited@1.0.0'], d3_mode: 'DENY' }),
        getCatalog: () => ({ catalog_version: control.modelCatalog, models: [{ model_id: 'model.fake.reasoning', version: '1.0.0', adapter_id: 'fake-model', provider: 'synthetic', region: 'local', safety_class: 'fake-only', data_classes: ['D1'], status: control.modelStatus, quality_score: 90, cost_units: 2, latency_units: 1 }] }),
        getBudget: () => ({ company_id: origin.company_id, budget_version: '1', limit_units: control.budgetLimit, preexisting_spent_units: charged() - (s.gateway ? s.gateway.getBudgetSnapshot().reduce((n, x) => n + x.proof_spent_units, 0) : 0) }),
      };
      s.gateway = MG.createModelGatewayProof({ registry: { getAgentPackage: (...args) => { hook('registry.read', s); guard(s); return registry.getAgentPackage(...args); } }, resolvers,
        now: () => control.now,
        beforeFinalRevalidation: () => { hook('mg5.beforeFinal', s); check(); },
        audit: { prepare: () => { hook('mg5.audit.prepare', s); emit('MG5_PREPARE', s); return { ok: true }; },
          commit: record => { emit('MG5_TERMINAL', s, null, { native_audit_sha256: record.audit_sha256, native_correlation_id: record.correlation_id }); check(); return { ok: true }; } },
        adapters: { 'fake-model': () => { try {
          check(); hook('model.before', s); check(); simulations++;
          const outcome = modelOutcomes.shift() || 'SUCCESS';
          hook('model.after', s); check();
          return outcome === 'SUCCESS' ? { outcome, output: { schema_version: 'mg5-output/v1', content: JSON.stringify(modelOutput), confidence: 95 } } : { outcome };
        } catch { denied = true; return { outcome: 'PERMANENT_FAILURE' }; } } },
        validator: () => { try { check(); hook('model.validate', s); check(); return { valid: true }; } catch { denied = true; return { valid: false }; } },
      });
      const payload = { prompt: 'Produce only the synthetic project status fixture' };
      const nativeModelRequest = { request_id: reference, idempotency_key: `idem-${reference}`, agent_id: agentContent.agent_id, agent_version: agentContent.version, package_sha256: packageSha,
        reg4_baseline_commit: MG.BASELINES.reg4.commit, reg4_baseline_tree: MG.BASELINES.reg4.tree, bos_ai1_baseline_commit: MG.BASELINES.bos_ai1.commit, bos_ai1_baseline_tree: MG.BASELINES.bos_ai1.tree,
        requester_id: 'agent-executor', company_id: origin.company_id, use_case: 'project-summary', data_class: 'D1', payload, payload_sha256: MG.calculatePayloadSha256(payload) };
      const native = s.gateway.invoke(nativeModelRequest);
      const semanticModelRequest = { ...nativeModelRequest }; delete semanticModelRequest.request_id;
      for (const record of s.gateway.listAuditRecords()) append(audit, metadata('NATIVE_BRIDGE', s, null, { native_component: 'MG5', native_audit_sha256: record.audit_sha256, native_correlation_id: record.correlation_id,
        request_id: reference, request_sha256: hash(semanticModelRequest), invocation_sha256: hash(nativeModelRequest) }));
      if (native.decision !== 'ALLOW') fail(denied ? 'MODEL_PROVENANCE_CHANGED' : native.reason_code, 'STOPPED');
      check(); const derived = JSON.parse(native.result.output.content); exact(derived, ['status', 'note']);
      if (!['ON_TRACK', 'AT_RISK', 'BLOCKED'].includes(derived.status) || typeof derived.note !== 'string' || derived.note.length > 500) fail('OUTPUT_INVALID');
      emit('MODEL_OUTPUT', s, null, { model_invocation_reference: reference, output_trust: 'UNTRUSTED_OUTPUT', output_sha256: hash(native.result.output) }); check();
      const response = result(s, null, 'ADVISORY_ONLY', 'OK', { model_invocation_reference: reference, output_trust: 'UNTRUSTED_OUTPUT', output: native.result.output });
      s.model = { reference, pin: freeze(pin), derived: freeze(derived), response }; s.modelState = 'DONE'; return response;
    } catch (err) { if (own && s) s.modelState = 'FAILED'; return rejected(err, s); }
    finally { if (own) modelBusy = false; }
  }
  function intent(kind, overrides = {}) {
    const o = copy(overrides); const s = sessions.get(o.session_id || 'session-1');
    if (!MODULES[kind] || !s || !s.model) throw new TypeError('synthetic model/session required');
    const r = s.request;
    return { action_id: `action-${kind}-${r.session_id}`, session_id: r.session_id, session_version: r.session_version, correlation_id: r.correlation_id,
      task_id: r.task_id, task_version: r.task_version, requester_id: r.executive_ai_identity, executor_id: 'agent-executor', on_behalf_of: r.on_behalf_of,
      delegation_id: r.delegation_id, delegation_version: r.delegation_version, company_id: r.company_id, action_type: kind,
      target: { resource_id: r.resource_id, resource_version: '1' }, input_data: kind === 'READ' ? { include: 'current' } : copy(s.model.derived),
      data_classification: 'D1', risk_level: 'LOW', budget_or_limit: { unit: 'fake-credit', maximum: 10 }, evidence_references: [s.model.reference],
      valid_until: UNTIL, idempotency_key: `idem-${kind}-${r.session_id}`, agent_id: r.agent_id, agent_version: r.agent_version, agent_package_sha256: r.package_sha256,
      policy_reference: { policy_id: 'fake-bos-policy', policy_version: '1' }, model_invocation_reference: s.model.reference, ...o };
  }
  function validateIntent(raw) {
    const i = copy(raw); exact(i, INTENT_KEYS);
    const structured = ['target', 'input_data', 'budget_or_limit', 'evidence_references', 'policy_reference'];
    if (INTENT_KEYS.filter(k => !structured.includes(k)).some(k => !token(i[k])) || !MODULES[i.action_type] || !iso(i.valid_until)) fail();
    const s = sessions.get(i.session_id); guard(s);
    const expected = intent(i.action_type, { session_id: i.session_id });
    for (const k of INTENT_KEYS.filter(k => !['action_id', 'idempotency_key', 'valid_until'].includes(k))) if (!equal(i[k], expected[k])) fail('INTENT_BINDING_MISMATCH');
    if (Date.parse(i.valid_until) > Date.parse(UNTIL) || Date.parse(i.valid_until) <= Date.parse(control.now)) fail('INTENT_EXPIRED');
    return { s, i: freeze(i) };
  }
  function nativeRequest(e) {
    const i = e.intent, mod = MODULES[e.kind];
    return { request_id: `native-${i.action_id}`, correlation_id: i.correlation_id, idempotency_key: i.idempotency_key, action_id: i.action_id,
      effect_class: mod.EFFECT_CLASS, agent_id: i.agent_id, agent_version: i.agent_version, package_sha256: i.agent_package_sha256,
      reg4_baseline_commit: mod.REG4_BASELINE.commit, reg4_baseline_tree: mod.REG4_BASELINE.tree,
      requester_id: i.requester_id, executor_id: i.executor_id, on_behalf_of: i.on_behalf_of, company_id: i.company_id,
      resource_id: i.target.resource_id, resource_version: i.target.resource_version, task_id: i.task_id, task_version: i.task_version,
      delegation_id: i.delegation_id, delegation_version: i.delegation_version, policy_id: i.policy_reference.policy_id,
      policy_version: i.policy_reference.policy_version, valid_until: i.valid_until, tool_id: mod.ACTION,
      payload: copy(i.input_data), payload_sha256: mod.payloadSha256(i.input_data), ...(e.kind === 'PUBLISH' ? { approval_id: e.approval ? e.approval.approval_id : null } : {}) };
  }
  function authorityData(e) {
    const r = e.nativeRequest, mod = MODULES[e.kind], s = e.session;
    const identities = Object.fromEntries(['executive-ai', 'agent-executor', 'founder', 'approver'].map(id => [id, { identity_id: id, company_id: origin.company_id, active: true, role: id, permissions: [mod.PERMISSION, ...(e.kind === 'PUBLISH' ? ['project.status_update.approve'] : [])] }]));
    Object.assign(identities['agent-executor'], { agent_id: agentContent.agent_id, agent_version: agentContent.version, package_sha256: packageSha });
    const active = !s.stopped && !control.globalStop && !control.originStopped && control.delegationStatus === 'ACTIVE';
    identities['executive-ai'].active = active && control.executiveVersion === origin.executive_ai_version;
    const common = { company_id: origin.company_id, resource_id: origin.resource_id, expires_at: control.delegationExpiry, permissions: [mod.PERMISSION], allowed_actions: [mod.ACTION], allowed_tools: [mod.ACTION] };
    const state = { now: control.now, identities,
      task: { ...common, task_id: s.request.task_id, version: s.request.task_version, requester_id: 'executive-ai', executor_id: 'agent-executor', on_behalf_of: 'founder', active },
      delegation: { ...common, delegation_id: origin.delegation_id, version: origin.delegation_version, delegate_id: 'agent-executor', delegator_id: 'founder', revoked: !active },
      [e.kind === 'READ' ? 'scope' : 'project']: { company_id: origin.company_id, resource_id: origin.resource_id, version: s.config.resourceVersion, permissions_by_principal: { founder: [mod.PERMISSION] } },
      policy: { company_id: origin.company_id, policy_id: 'fake-bos-policy', policy_version: control.bosVersion, allowed_actions: [mod.ACTION], allowed_tools: [mod.ACTION],
        prohibited_actions: control.prohibited.includes(e.kind) || (control.writeClose && e.kind !== 'READ') ? [mod.ACTION] : [], role_permissions: { 'executive-ai': [mod.PERMISSION] } },
    };
    if (e.kind === 'PUBLISH') {
      state.policy.approver_ids = ['approver']; state.approvals = {};
      if (e.approval) state.approvals[e.approval.approval_id] = { ...Object.fromEntries(PUBLISH.BINDINGS.map(k => [k, r[k]])), approval_id: e.approval.approval_id,
        approver_id: 'approver', status: 'ACTIVE', not_before: NOW, expires_at: e.approval.expires_at };
    }
    return state;
  }
  function domainData(e) { return { company_id: origin.company_id, resource_id: origin.resource_id, version: e.session.config.resourceVersion,
    ...(e.kind === 'READ' ? { exists: true } : {}), decision: e.session.config.domainDecision }; }
  function sync(e) {
    if (!e.authority) return;
    e.authority.replace(authorityData(e));
    const d = domainData(e); if (!equal(d, e.domainSnapshot)) { e.domain.replace(d); e.domainSnapshot = d; }
    if (e.pipeline) {
      const p = { filter: e.session.config.filterFailure, redaction: e.session.config.redactionFailure };
      if (!equal(p, e.pipelineSnapshot)) { e.pipeline.setFailures(p); e.pipelineSnapshot = p; }
    }
  }
  function buildNative(e) {
    const mod = MODULES[e.kind], s = e.session;
    e.nativeRequest = nativeRequest(e);
    e.authority = e.kind === 'READ' ? mod.createReadAuthority(authorityData(e)) : e.kind === 'DRAFT' ? mod.createDraftAuthority(authorityData(e)) : mod.createHandoffAuthority(authorityData(e));
    const reg = { getAgentPackage: (...args) => { hook('registry.read', s, e); guard(s, e); sync(e); return registry.getAgentPackage(...args); } };
    const auditOptions = { beforeWrite: event => { hook('bos.audit.before', s, e, { event: `BOS_${event.event}` }); emit(`BOS_${event.event}`, s, e, { status: event.status }); },
      afterWrite: event => { hook('bos.audit.after', s, e, { event: `BOS_${event.event}` }); guard(s, e); sync(e); } };
    e.audit = e.kind === 'READ' ? mod.createFakeReadAuditWriter(auditOptions) : mod.createFakeAuditWriter(auditOptions);
    const domainHooks = { beforeCheck: () => { hook('domain.before', s, e); guard(s, e); sync(e); }, afterCheck: () => { hook('domain.after', s, e); guard(s, e); sync(e); } };
    e.domainSnapshot = domainData(e);
    e.domain = e.kind === 'READ' ? mod.createFakeReadDomain(e.domainSnapshot, domainHooks) : mod.createFakeDomainGuard(e.domainSnapshot, domainHooks);
    if (e.kind === 'READ') {
      e.repository = mod.createFakeReadRepository({ company_id: origin.company_id, resource_id: origin.resource_id, version: s.config.resourceVersion,
        fields: { status: 'ON_TRACK', progress_percent: 50, owner_contact: 'synthetic-private-contact', private_note: 'synthetic-private-row' } },
      { mode: s.config.readMode, beforeRead: () => { hook('read.before', s, e); guard(s, e); sync(e); }, afterRead: () => { hook('read.after', s, e); guard(s, e); sync(e); } });
      e.pipelineSnapshot = { filter: s.config.filterFailure, redaction: s.config.redactionFailure };
      e.pipeline = mod.createFakeReadPipeline({ failFilter: s.config.filterFailure, failRedaction: s.config.redactionFailure,
        beforeFilter: () => { hook('filter.before', s, e); guard(s, e); sync(e); }, afterFilter: () => { hook('filter.after', s, e); guard(s, e); sync(e); },
        beforeRedact: () => { hook('redaction.before', s, e); guard(s, e); sync(e); }, afterRedact: () => { hook('redaction.after', s, e); guard(s, e); sync(e); } });
      e.native = mod.createReadPreEffectHandoffProof({ registry: reg, authority: e.authority, audit: e.audit, domain: e.domain, repository: e.repository, pipeline: e.pipeline });
    } else {
      const afterAccept = () => { hook('effect.after', s, e); guard(s, e); };
      e.adapter = e.kind === 'DRAFT' ? mod.createFakeDraftAdapter({ mode: s.config.effectMode, afterAccept }) : mod.createFakeEffectAdapter({ mode: s.config.effectMode, afterAccept });
      e.native = e.kind === 'DRAFT' ? mod.createDraftPreEffectHandoffProof({ registry: reg, authority: e.authority, audit: e.audit, domain: e.domain, adapter: e.adapter }) : mod.createPreEffectHandoffProof({ registry: reg, authority: e.authority, audit: e.audit, domain: e.domain, adapter: e.adapter });
    }
  }
  function bridge(e) {
    if (!e.native) return;
    const records = [...e.audit.listRecords(), ...e.native.listSecondaryAudit()];
    for (const r of records) if (!e.bridged.has(r.audit_sha256)) { e.bridged.add(r.audit_sha256); append(audit, metadata('NATIVE_BRIDGE', e.session, e, { native_component: e.kind,
      native_audit_sha256: r.audit_sha256, native_correlation_id: r.correlation_id, request_sha256: r.request_sha256 || null })); }
  }
  function stage(e, name, native) { e.stages.push(freeze({ stage: name, status: native.status, decision: native.decision || null,
    permit_sha256: native.permit ? native.permit.permit_sha256 : null, audit_reference: native.audit_id || native.correlation_id || null })); bridge(e); }
  function evaluate(e) {
    guard(e.session, e); sync(e); bosEvaluations++;
    const native = e.native.bos.evaluate(e.nativeRequest); stage(e, 'BOS_EVALUATE', native);
    if (native.status === 'PENDING_APPROVAL') {
      if (!e.approvalRequest) { e.approvalRequest = `approval-request-${++approvalSeq}`; approvalRequests.set(e.approvalRequest, e); }
      emit('APPROVAL_REQUESTED', e.session, e); guard(e.session, e); e.state = 'PENDING_APPROVAL';
      return result(e.session, e, 'PENDING_APPROVAL', native.reason_code, { decision: native.decision, approval_request_id: e.approvalRequest });
    }
    if (native.status !== 'PERMITTED' || native.decision !== 'ALLOW' || !native.permit) {
      e.state = 'COMPLETE'; e.receipt = result(e.session, e, native.status === 'STOPPED' ? 'STOPPED' : 'DENIED', native.reason_code); return e.receipt;
    }
    guard(e.session, e); e.permit = native.permit;
    const ticket = freeze({ ticket_id: `ticket-${e.intent.action_id}`, action_id: e.intent.action_id, session_id: e.intent.session_id, intent_digest: e.digest });
    tickets.set(ticket, e); e.ticket = ticket; e.state = 'PERMITTED';
    return result(e.session, e, 'PERMITTED', 'CONTROL_ALLOWED', { decision: 'ALLOW', ticket }, false);
  }
  function submitIntent(raw) {
    let s, e, own = false;
    try {
      // Resolve only own scalar tracing fields before the full snapshot. Nested
      // invalid data cannot erase a known root trace or invoke a caller getter.
      if (raw && typeof raw === 'object' && !types.isProxy(raw) && Object.getPrototypeOf(raw) === Object.prototype) {
        const sd = Object.getOwnPropertyDescriptor(raw, 'session_id');
        const ad = Object.getOwnPropertyDescriptor(raw, 'action_id');
        if (sd && Object.hasOwn(sd, 'value') && token(sd.value)) s = sessions.get(sd.value);
        if (s && ad && Object.hasOwn(ad, 'value') && token(ad.value)) e = { intent: { action_id: ad.value,
          policy_reference: { policy_id: 'fake-bos-policy', policy_version: '1' }, target: { resource_version: s.config.resourceVersion } }, projectionHash: null };
      }
      const snapshot = copy(raw);
      if (snapshot && typeof snapshot === 'object' && token(snapshot.session_id)) s = sessions.get(snapshot.session_id);
      // A safely copied candidate can be traced to an existing session even when
      // later validation denies it. No caller scope/policy or payload is trusted.
      if (s && token(snapshot.action_id)) e = { intent: { action_id: snapshot.action_id,
        policy_reference: { policy_id: 'fake-bos-policy', policy_version: '1' }, target: { resource_version: s.config.resourceVersion } }, projectionHash: null };
      const checked = validateIntent(snapshot); s = checked.s; const i = checked.i, digest = hash(i);
      const existing = entries.get(i.action_id);
      if (existing) {
        e = existing;
        if (e.digest !== digest) fail('ACTION_CONFLICT');
        if (['SUBMITTING', 'EXECUTING', 'APPROVING'].includes(e.state)) fail('REQUEST_IN_PROGRESS', 'STOPPED');
        if (e.state === 'COMPLETE') return safePrior(s, e, e.receipt);
        if (e.state === 'PERMITTED') return result(s, e, 'PERMITTED', 'CONTROL_ALLOWED', { decision: 'ALLOW', ticket: e.ticket, duplicate: true }, false);
        return result(s, e, 'PENDING_APPROVAL', 'APPROVAL_REQUIRED', { approval_request_id: e.approvalRequest, duplicate: true }, false);
      }
      if (idempotency.has(i.idempotency_key)) fail('IDEMPOTENCY_CONFLICT');
      e = { intent: i, session: s, digest, kind: i.action_type, state: 'SUBMITTING', approval: null, stages: [], bridged: new Set(),
        projectionHash: hash({ instance_reference: instanceReference, origin_sha256: originHash, executive: s.request.executive_ai_identity, executive_version: s.request.executive_ai_version, session: s.request, intent_sha256: digest }) };
      entries.set(i.action_id, e); idempotency.set(i.idempotency_key, e); own = true;
      guard(s, e); emit('ACTION_INTENT', s, e); guard(s, e); buildNative(e); return evaluate(e);
    } catch (err) { const out = rejected(err, s, e); if (own && e) { e.state = 'COMPLETE'; e.receipt = out; } return out; }
  }
  function approval(requestId, overrides = {}) {
    const e = approvalRequests.get(requestId); if (!e) throw new TypeError('unknown synthetic approval request');
    const a = freeze({ approval_request_id: requestId, approval_id: `approval-${requestId}`, session_id: e.intent.session_id, action_id: e.intent.action_id,
      intent_digest: e.digest, resource_version: e.intent.target.resource_version, approver_id: 'approver', decision: 'APPROVE', expires_at: UNTIL, ...copy(overrides) });
    approvals.set(a, { e, used: false }); return a;
  }
  function receiveApproval(raw) {
    let e, own = false;
    try {
      if (!raw || typeof raw !== 'object' || types.isProxy(raw)) fail('APPROVAL_UNTRUSTED');
      const brand = approvals.get(raw); if (!brand || brand.used) fail('APPROVAL_UNTRUSTED'); e = brand.e;
      if (e.state !== 'PENDING_APPROVAL') fail('APPROVAL_NOT_PENDING');
      e.state = 'APPROVING'; own = true; brand.used = true;
      const a = copy(raw); exact(a, ['approval_request_id', 'approval_id', 'session_id', 'action_id', 'intent_digest', 'resource_version', 'approver_id', 'decision', 'expires_at']); guard(e.session, e);
      if (a.approval_request_id !== e.approvalRequest || a.action_id !== e.intent.action_id || a.session_id !== e.intent.session_id || a.intent_digest !== e.digest ||
        a.resource_version !== e.intent.target.resource_version || a.approver_id !== 'approver' || !iso(a.expires_at) || Date.parse(a.expires_at) <= Date.parse(control.now) || Date.parse(a.expires_at) > Date.parse(UNTIL)) fail('APPROVAL_BINDING_MISMATCH');
      emit('APPROVAL_RECEIVED', e.session, e, { decision: a.decision === 'APPROVE' ? 'APPROVE' : 'DENY' }); guard(e.session, e);
      if (a.decision !== 'APPROVE') fail('APPROVAL_DENIED');
      e.approval = freeze(a); e.nativeRequest = nativeRequest(e); sync(e); approvalRechecks++; return evaluate(e);
    } catch (err) { const out = rejected(err, e ? e.session : null, e); if (own && e) { e.state = 'COMPLETE'; e.receipt = out; } return out; }
  }
  function execute(ticket) {
    let e, own = false;
    try {
      if (!ticket || typeof ticket !== 'object' || types.isProxy(ticket)) fail('INVALID_TICKET');
      e = tickets.get(ticket); if (!e) fail('INVALID_TICKET');
      if (e.state === 'COMPLETE') return safePrior(e.session, e, e.receipt);
      if (e.state !== 'PERMITTED') fail('REQUEST_IN_PROGRESS', 'STOPPED');
      e.state = 'EXECUTING'; own = true; guard(e.session, e); sync(e);
      let permit = e.permit;
      if (e.kind === 'READ') {
        const ready = e.native.preEffectAudit.record(permit, e.nativeRequest); stage(e, 'PRE_EFFECT_AUDIT', ready);
        if (ready.status !== 'READY' || !ready.permit) { e.state = 'COMPLETE'; return (e.receipt = result(e.session, e, ready.status === 'STOPPED' ? 'STOPPED' : 'DENIED', ready.reason_code)); }
        guard(e.session, e); permit = ready.permit;
      }
      const native = e.native.applicationService.execute(permit, e.nativeRequest); stage(e, 'APPLICATION_SERVICE', native);
      const status = ['EXECUTED', 'FAILED', 'COMPENSATION_REQUIRED', 'STOPPED', 'DENIED'].includes(native.status) ? native.status : 'STOPPED';
      const additions = { effect_state: native.effect_state || (native.data_released ? 'DISCLOSED' : 'NONE'), effect_id: native.effect_id || null,
        data_released: native.data_released === true, release_id: native.release_id || null, ...(native.data_released ? { data: native.data } : {}) };
      const out = result(e.session, e, status, native.reason_code, additions); e.state = 'COMPLETE'; e.receipt = { ...out }; delete e.receipt.data; return out;
    } catch (err) { const out = rejected(err, e ? e.session : null, e); if (own && e) { e.state = 'COMPLETE'; e.receipt = out; } return out; }
  }
  function inspect() {
    const bos = [], mg5 = []; let applications = 0, domains = 0, reads = 0, releases = 0, effects = 0, attempts = 0;
    for (const s of sessions.values()) if (s.gateway) { const records = s.gateway.listAuditRecords(); attempts += records.reduce((n, r) => n + r.attempts.length, 0); mg5.push({ session_id: s.request.session_id, records, budget: s.gateway.getBudgetSnapshot() }); }
    for (const e of entries.values()) if (e.native) {
      applications += e.native.applicationCallCount(); domains += e.domain.callCount();
      if (e.kind === 'READ') { reads += e.repository.readCount(); releases += e.native.releaseCount(); }
      else effects += (e.kind === 'DRAFT' ? e.native.listDrafts() : e.native.listEffects()).length;
      bos.push({ action_id: e.intent.action_id, kind: e.kind, records: e.audit.listRecords(), secondary: e.native.listSecondaryAudit(), stages: e.stages.map(x => ({ ...x })), receipts: e.kind === 'READ' ? e.native.listReceipts() : (e.kind === 'DRAFT' ? e.native.listDrafts() : e.native.listEffects()).map(x => ({ effect_id: x.effect_id, state: x.state, correlation_id: x.correlation_id, synthetic: true })) });
    }
    return freeze({ counters: { model_simulations: simulations, model_native_attempts: attempts, bos_evaluations: bosEvaluations, application_calls: applications, domain_calls: domains,
      repository_reads: reads, data_releases: releases, effects, approval_rechecks: approvalRechecks },
    audit: audit.map(x => ({ ...x })), secondary: secondary.map(x => ({ ...x })), queues: Object.fromEntries(Object.entries(queues).map(([k, a]) => [k, a.map(x => ({ ...x }))])),
    sessions: [...sessions.values()].map(s => ({ session_id: s.request.session_id, correlation_id: s.request.correlation_id, task_id: s.request.task_id, status: s.stopped ? 'STOPPED' : s.state })),
    native: { reg4: registry.listAuditRecords(), mg5, bos }, budget: { limit: control.budgetLimit, charged: charged() },
    proof_reference: instanceReference, delegation: { ...origin, integrity_reference: originHash },
    authority_state: { delegation_status: control.delegationStatus, expires_at: control.delegationExpiry, executive_version: control.executiveVersion,
      assignment_version: control.assignmentVersion, origin_stopped: control.originStopped, global_stop: control.globalStop, global_write_close: control.writeClose } });
  }
  function mutate(kind, raw, sessionId = 'session-1') {
    const value = copy(raw), s = sessions.get(sessionId), c = s ? s.config : config;
    const bool = () => { if (typeof value !== 'boolean') throw new TypeError('boolean mutation required'); };
    const tok = () => { if (!token(value)) throw new TypeError('token mutation required'); };
    const timestamp = () => { if (!iso(value)) throw new TypeError('timestamp mutation required'); };
    const choice = values => { if (!values.includes(value)) throw new TypeError('invalid mutation enum'); };
    switch (kind) {
      case 'delegation.status': choice(['ACTIVE', 'SUSPENDED', 'REVOKED']); if (value !== 'ACTIVE') control.originStopped = true; control.delegationStatus = value; break;
      case 'delegation.expires_at': timestamp(); if (Date.parse(value) > Date.parse(EXPIRY)) throw new TypeError('cannot extend delegation'); control.delegationExpiry = value; break;
      case 'delegation.integrity': tok(); control.integrity = value; break;
      case 'executive.version': tok(); control.executiveVersion = value; break;
      case 'assignment.version': tok(); control.assignmentVersion = value; break;
      case 'assignment.package_sha256': if (!SHA.test(value)) throw new TypeError('sha required'); control.assignmentSha = value; break;
      case 'session.stop': if (value !== true || !s) throw new TypeError('existing session and stop required'); s.stopped = true; break;
      case 'global.stop': if (value !== true) throw new TypeError('stop required'); control.globalStop = true; break;
      case 'global.write_close': if (value !== true) throw new TypeError('write closure required'); control.writeClose = true; break;
      case 'clock': timestamp(); control.now = value; break;
      case 'bos.policy_version': tok(); control.bosVersion = value; break;
      case 'bos.prohibited': if (!Array.isArray(value) || value.some(k => !MODULES[k])) throw new TypeError('action array required'); control.prohibited = value; break;
      case 'resource.version': tok(); c.resourceVersion = value; break;
      case 'domain.decision': choice(['ALLOW', 'DENY', 'STOP']); c.domainDecision = value; break;
      case 'model.status': choice(['APPROVED', 'BLOCKED', 'RETIRED']); control.modelStatus = value; break;
      case 'model.policy_version': tok(); control.modelPolicy = value; break;
      case 'model.catalog_version': tok(); control.modelCatalog = value; break;
      case 'model.allowed': bool(); control.modelAllowed = value; break;
      case 'budget.limit': if (!Number.isSafeInteger(value) || value < 0 || value > 10) throw new TypeError('bounded budget required'); control.budgetLimit = value; break;
      case 'audit.available': bool(); control.auditAvailable = value; break;
      case 'pipeline.filter_failure': bool(); c.filterFailure = value; break;
      case 'pipeline.redaction_failure': bool(); c.redactionFailure = value; break;
      case 'read.mode': choice(['SUCCESS', 'THROW', 'INVALID_RESULT']); c.readMode = value; break;
      case 'effect.mode': choice(['SUCCESS', 'REJECT_BEFORE_EFFECT', 'PARTIAL', 'TIMEOUT_AFTER_ACCEPT']); c.effectMode = value; break;
      default: throw new TypeError('unknown mutation');
    }
    for (const e of entries.values()) sync(e);
  }
  const openclaw = Object.freeze({ openSession, runModel, submitIntent, receiveApproval, execute, inspect });
  const harness = Object.freeze({ sessionRequest, intent, approval, mutate,
    setHook(name, fn) { if (!HOOKS.includes(name) || (fn !== null && typeof fn !== 'function')) throw new TypeError('invalid hook'); if (fn === null) hooks.delete(name); else hooks.set(name, fn); },
    setAuditFailure(event, enabled = true) { if (!token(event) && event !== '*') throw new TypeError('invalid event'); if (typeof enabled !== 'boolean') throw new TypeError('boolean required'); if (enabled) failures.add(event); else failures.delete(event); },
    setModelOutcomes(values) { const a = copy(values); if (!Array.isArray(a) || a.length > 2 || a.some(x => !['SUCCESS', 'TRANSIENT_FAILURE', 'PERMANENT_FAILURE'].includes(x))) throw new TypeError('invalid synthetic outcomes'); modelOutcomes = a; },
    setModelOutput(value) { const v = copy(value); exact(v, ['status', 'note']); if (!['ON_TRACK', 'AT_RISK', 'BLOCKED'].includes(v.status) || typeof v.note !== 'string' || v.note.length > 500) throw new TypeError('invalid synthetic output'); modelOutput = freeze(v); },
    transitionAgent(to, role = 'REGISTRY_ADMIN') { try { return transition(to, role); } finally { for (const s of sessions.values()) bridgeRegistry(s); } },
  });
  return Object.freeze({ openclaw, harness });
}

module.exports = { createOC6Proof, CONSTANTS };
