'use strict';

// Builder negative/security coverage. Development executes only from root's frozen tree.
// No fake implementation of REG4, MG5, BOS, authority, or their audit ledgers lives here.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { createOC6Proof } = require('./control-integration-proof');

const PRIVATE_CANARY = 'OC6_PRIVATE_PAYLOAD_NEVER_AUDIT_7842';
const ERROR_CANARY = 'OC6_UNTRUSTED_EXCEPTION_NEVER_AUDIT_7842';

function fixture(options) {
  const { openclaw: o, harness: h } = createOC6Proof(options);
  return { o, h };
}

function active(f, suffix = '1') {
  const request = f.h.sessionRequest({ session_id: `session-${suffix}`,
    task_id: `task-${suffix}`, correlation_id: `correlation-${suffix}` });
  assert.equal(f.o.openSession(request).status, 'ACTIVE');
  return request;
}

function advisory(f, suffix = '1') {
  const request = active(f, suffix);
  const result = f.o.runModel(request.session_id);
  assert.equal(result.status, 'ADVISORY_ONLY');
  assert.equal(result.output_trust, 'UNTRUSTED_OUTPUT');
  return request;
}

function permitted(f, kind = 'DRAFT', suffix = '1') {
  const request = advisory(f, suffix);
  const intent = f.h.intent(kind, { session_id: request.session_id });
  let control = f.o.submitIntent(intent);
  if (kind === 'PUBLISH') {
    assert.equal(control.status, 'PENDING_APPROVAL');
    control = f.o.receiveApproval(f.h.approval(control.approval_request_id));
  }
  assert.equal(control.status, 'PERMITTED');
  assert.ok(control.ticket);
  return { request, intent, control };
}

function denied(result, label = '') {
  assert.ok(['DENIED', 'STOPPED'].includes(result.status), `${label}: ${result.status}`);
  for (const field of ['ticket', 'data', 'model_invocation_reference']) {
    assert.equal(Object.hasOwn(result, field), false, `${label}: ${field} escaped denial`);
  }
}

function noBusiness(f, label = '') {
  const { counters } = f.o.inspect();
  for (const name of ['repository_reads', 'data_releases', 'effects']) {
    assert.equal(counters[name], 0, `${label}: ${name}`);
  }
}

function noApplication(f, label = '') {
  noBusiness(f, label);
  assert.equal(f.o.inspect().counters.application_calls, 0, `${label}: application_calls`);
}

function nativeModelRecords(f) {
  return f.o.inspect().native.mg5.flatMap((entry) => entry.records);
}

function costIsNative(f, { loweredCap = false } = {}) {
  const snapshot = f.o.inspect();
  const records = nativeModelRecords(f);
  let attempts = 0;
  let charged = 0;
  for (const record of records) {
    assert.equal(record.selected_fallback, null);
    assert.ok(record.attempts.length <= 2, 'a third native attempt is forbidden');
    assert.equal(record.charged_units,
      record.attempts.reduce((sum, attempt) => sum + attempt.cost_units, 0));
    assert.equal(record.reserved_units, record.charged_units + record.released_units);
    for (const attempt of record.attempts) assert.equal(attempt.cost_units, 2);
    attempts += record.attempts.length;
    charged += record.charged_units;
  }
  assert.equal(snapshot.counters.model_native_attempts, attempts);
  assert.equal(snapshot.budget.charged, charged);
  assert.ok(charged <= 10, 'original Founder credit ceiling remains fixed');
  if (!loweredCap) assert.ok(charged <= snapshot.budget.limit);
  assert.ok(snapshot.budget.limit <= 10);
  assert.ok(snapshot.counters.model_simulations <= attempts);
  return { attempts, charged };
}

function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
}

function sealedChain(records, encode = stable) {
  let previous = '0'.repeat(64);
  for (const [index, record] of records.entries()) {
    const { audit_sha256, ...body } = record;
    assert.equal(body.sequence, index + 1);
    assert.equal(body.previous_audit_sha256, previous);
    assert.equal(createHash('sha256').update(encode(body)).digest('hex'), audit_sha256);
    previous = audit_sha256;
  }
}

test('OC6-S01 public interfaces and snapshots cannot provide authority mutation handles', () => {
  const f = fixture();
  assert.ok(Object.isFrozen(f.o));
  assert.ok(Object.isFrozen(f.h));
  assert.deepEqual(Object.keys(f.o).sort(),
    ['execute', 'inspect', 'openSession', 'receiveApproval', 'runModel', 'submitIntent'].sort());
  advisory(f);
  const snapshot = f.o.inspect();
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.counters));
  assert.ok(Object.isFrozen(snapshot.sessions));
  assert.throws(() => { snapshot.counters.effects = 900; }, TypeError);
  assert.throws(() => { snapshot.sessions.length = 0; }, TypeError);
  assert.equal(f.o.inspect().counters.effects, 0);
  assert.equal(f.o.inspect().sessions.length, 1);
});

test('OC6-S02 session admission binds Founder, delegation, Executive, task version and assigned package', () => {
  const changes = {
    session_version: 'other-version', task_version: 'other-version', company_id: 'company-other',
    resource_id: 'resource-other', delegation_id: 'delegation-other', delegation_version: 'other-version',
    executive_ai_identity: 'executive-other', executive_ai_version: 'other-version',
    on_behalf_of: 'founder-other', agent_id: 'agent.other', agent_version: '9.0.0', package_sha256: 'f'.repeat(64),
  };
  for (const [field, value] of Object.entries(changes)) {
    const f = fixture();
    denied(f.o.openSession(f.h.sessionRequest({ [field]: value })), field);
    assert.equal(f.o.inspect().counters.model_simulations, 0, field);
    noApplication(f, field);
  }
});

test('OC6-S03 intent binds every authority reference and opaque model provenance', () => {
  const changes = {
    session_id: 'session-other', session_version: 'other-version', correlation_id: 'correlation-other',
    task_id: 'task-other', task_version: 'other-version', requester_id: 'executive-other',
    executor_id: 'executor-other', on_behalf_of: 'founder-other', delegation_id: 'delegation-other',
    delegation_version: 'other-version', company_id: 'company-other', agent_id: 'agent.other',
    agent_version: '9.0.0', agent_package_sha256: 'f'.repeat(64),
    model_invocation_reference: 'invented-model-result',
  };
  for (const [field, value] of Object.entries(changes)) {
    const f = fixture();
    advisory(f);
    const intent = f.h.intent('DRAFT');
    intent[field] = value;
    denied(f.o.submitIntent(intent), field);
    noApplication(f, field);
  }
});

test('OC6-S04 model provenance cannot migrate between two live sessions or two proof instances', () => {
  const f = fixture();
  advisory(f, '1');
  const first = f.h.intent('DRAFT');
  advisory(f, '2');
  const second = f.h.intent('DRAFT', { session_id: 'session-2' });
  second.model_invocation_reference = first.model_invocation_reference;
  second.evidence_references = [...first.evidence_references];
  denied(f.o.submitIntent(second), 'other session provenance');
  const foreign = fixture();
  advisory(foreign);
  const foreignIntent = foreign.h.intent('DRAFT');
  assert.notEqual(foreignIntent.model_invocation_reference, first.model_invocation_reference,
    'opaque provenance must be namespaced to its owning proof instance');
  foreignIntent.model_invocation_reference = first.model_invocation_reference;
  foreignIntent.evidence_references = [...first.evidence_references];
  denied(foreign.o.submitIntent(foreignIntent), 'other instance provenance');
  noApplication(f);
  noApplication(foreign);
});

test('OC6-S05 authoritative binding drift is checked before intent and again before execution', () => {
  const mutations = [
    ['delegation.status', 'REVOKED'], ['delegation.integrity', 'changed-integrity'],
    ['executive.version', 'changed-version'], ['assignment.version', 'changed-version'],
    ['assignment.package_sha256', 'f'.repeat(64)], ['session.stop', true],
    ['delegation.expires_at', '2020-01-01T00:00:00.000Z'], ['clock', '2099-01-01T00:00:00.000Z'],
  ];
  for (const [kind, value] of mutations) {
    for (const stage of ['submit', 'execute']) {
      const f = fixture();
      advisory(f);
      const intent = f.h.intent('DRAFT');
      const control = stage === 'execute' ? f.o.submitIntent(intent) : null;
      if (control) assert.equal(control.status, 'PERMITTED');
      f.h.mutate(kind, value);
      denied(stage === 'submit' ? f.o.submitIntent(intent) : f.o.execute(control.ticket), `${kind}/${stage}`);
      noApplication(f, `${kind}/${stage}`);
    }
  }
});

test('OC6-S06 pending approvals cannot outlive origin authority or assignment binding', () => {
  for (const [kind, value] of [
    ['delegation.status', 'REVOKED'], ['delegation.integrity', 'changed-integrity'],
    ['executive.version', 'changed-version'], ['assignment.version', 'changed-version'],
    ['assignment.package_sha256', 'f'.repeat(64)], ['session.stop', true],
  ]) {
    const f = fixture();
    advisory(f);
    const pending = f.o.submitIntent(f.h.intent('PUBLISH'));
    assert.equal(pending.status, 'PENDING_APPROVAL');
    const approval = f.h.approval(pending.approval_request_id);
    f.h.mutate(kind, value);
    denied(f.o.receiveApproval(approval), kind);
    noApplication(f, kind);
  }
});

test('OC6-S07 approval decisions require same-instance ownership and exact intent, resource, approver and TTL', () => {
  for (const overrides of [
    { intent_digest: 'f'.repeat(64) }, { resource_version: 'other-version' },
    { approver_id: 'unassigned-approver' }, { expires_at: '2020-01-01T00:00:00.000Z' },
  ]) {
    const f = fixture();
    advisory(f);
    const pending = f.o.submitIntent(f.h.intent('PUBLISH'));
    assert.equal(pending.status, 'PENDING_APPROVAL');
    denied(f.o.receiveApproval(f.h.approval(pending.approval_request_id, overrides)));
    noApplication(f);
  }
  for (const transform of [(a) => ({ ...a }), (a) => structuredClone(a)]) {
    const f = fixture();
    advisory(f);
    const pending = f.o.submitIntent(f.h.intent('PUBLISH'));
    const approval = f.h.approval(pending.approval_request_id);
    denied(f.o.receiveApproval(transform(approval)), 'approval copy');
    noApplication(f);
  }
  const a = fixture();
  const b = fixture();
  advisory(a);
  advisory(b);
  const pendingA = a.o.submitIntent(a.h.intent('PUBLISH'));
  const pendingB = b.o.submitIntent(b.h.intent('PUBLISH'));
  const approvalA = a.h.approval(pendingA.approval_request_id);
  assert.equal(pendingB.status, 'PENDING_APPROVAL');
  denied(b.o.receiveApproval(approvalA), 'foreign approval');
  const accepted = a.o.receiveApproval(approvalA);
  assert.equal(accepted.status, 'PERMITTED');
  denied(a.o.receiveApproval(approvalA), 'consumed approval');
  noApplication(a);
  noApplication(b);
});

test('OC6-S08 tickets cannot be cloned, rebranded or swapped across proof instances', () => {
  for (const transform of [(ticket) => ({ ...ticket }), (ticket) => structuredClone(ticket),
    () => Object.freeze({ status: 'PERMITTED', decision: 'ALLOW' })]) {
    const f = fixture();
    const { control } = permitted(f);
    assert.ok(Object.isFrozen(control.ticket));
    denied(f.o.execute(transform(control.ticket)));
    noApplication(f);
  }
  const a = fixture();
  const b = fixture();
  const first = permitted(a);
  permitted(b);
  denied(b.o.execute(first.control.ticket));
  noApplication(a);
  noApplication(b);
});

test('OC6-S09 actual REG4 lifecycle preserves unsupported BLOCKED transition and real retirement', () => {
  const f = fixture();
  const { control } = permitted(f);
  const original = f.o.inspect().native.reg4;
  assert.throws(() => f.h.transitionAgent('BLOCKED'),
    (error) => error.name === 'RegistryError' && error.code === 'INVALID_STATE_TRANSITION');
  const afterRejected = f.o.inspect().native.reg4;
  assert.equal(afterRejected.length, original.length + 1);
  assert.equal(afterRejected.at(-1).from_status, 'APPROVED');
  assert.equal(afterRejected.at(-1).to_status, 'BLOCKED');
  assert.equal(afterRejected.at(-1).outcome, 'REJECTED');
  f.h.transitionAgent('RETIRED');
  const retired = f.o.inspect().native.reg4.at(-1);
  assert.equal(retired.from_status, 'APPROVED');
  assert.equal(retired.to_status, 'RETIRED');
  assert.equal(retired.actor_role, 'REGISTRY_ADMIN');
  assert.equal(retired.outcome, 'ACCEPTED');
  assert.equal(retired.agent_id, original.find((r) => r.to_status === 'APPROVED').agent_id);
  assert.equal(retired.version, original.find((r) => r.to_status === 'APPROVED').version);
  denied(f.o.execute(control.ticket));
  noApplication(f);
  const blocked = fixture({ agentStatus: 'BLOCKED' });
  denied(blocked.o.openSession(blocked.h.sessionRequest()));
  const blockedEvent = blocked.o.inspect().native.reg4.find((record) => record.to_status === 'BLOCKED');
  assert.ok(blockedEvent);
  assert.equal(blockedEvent.from_status, 'IN_REVIEW');
  assert.equal(blockedEvent.outcome, 'ACCEPTED');
  assert.equal(blockedEvent.actor_role, 'REVIEWER');
  sealedChain(f.o.inspect().native.reg4, JSON.stringify);
  sealedChain(blocked.o.inspect().native.reg4, JSON.stringify);
});

test('OC6-S10 MG5 policy/model drift after prepare suppresses simulation without erasing native charges', () => {
  for (const [kind, value] of [['model.policy_version', 'changed-policy'], ['model.status', 'BLOCKED']]) {
    const f = fixture();
    active(f);
    f.h.setHook('mg5.audit.prepare', () => { f.h.mutate(kind, value); });
    denied(f.o.runModel('session-1'), kind);
    assert.equal(f.o.inspect().counters.model_simulations, 0);
    const cost = costIsNative(f);
    assert.equal(cost.attempts, 1, 'native attempt reaches guarded adapter');
    assert.equal(cost.charged, 2, 'native reservation already charges the guarded attempt');
    noApplication(f);
  }
});

test('OC6-S11 between-retry drift consumes at most the second native attempt and never simulates it', () => {
  for (const [kind, value] of [['model.policy_version', 'changed-policy'], ['model.status', 'RETIRED']]) {
    const f = fixture();
    active(f);
    f.h.setModelOutcomes(['TRANSIENT_FAILURE', 'SUCCESS']);
    f.h.setHook('model.after', () => { f.h.mutate(kind, value); });
    denied(f.o.runModel('session-1'), kind);
    assert.equal(f.o.inspect().counters.model_simulations, 1);
    const cost = costIsNative(f);
    assert.ok(cost.attempts >= 1 && cost.attempts <= 2);
    assert.equal(cost.charged, cost.attempts * 2);
    assert.equal(nativeModelRecords(f).at(-1).decision, 'DENY');
    noApplication(f);
  }
});

test('OC6-S12 model output validation rechecks policy/model authority before creating provenance', () => {
  for (const [kind, value] of [['model.policy_version', 'changed-policy'], ['model.status', 'BLOCKED'],
    ['assignment.version', 'changed-version'], ['session.stop', true]]) {
    const f = fixture();
    active(f);
    f.h.setHook('model.validate', () => { f.h.mutate(kind, value); });
    denied(f.o.runModel('session-1'), kind);
    assert.equal(f.o.inspect().counters.model_simulations, 1);
    const cost = costIsNative(f);
    assert.equal(cost.attempts, 1);
    assert.equal(cost.charged, 2);
    assert.equal(nativeModelRecords(f).at(-1).decision, 'DENY');
    noApplication(f);
  }
});

test('OC6-S13 native MG5 two-attempt ceiling, one model and budget reservations remain authoritative', () => {
  const failures = fixture();
  active(failures);
  assert.throws(() => failures.h.setModelOutcomes(['TRANSIENT_FAILURE', 'TRANSIENT_FAILURE', 'SUCCESS']), TypeError);
  failures.h.setModelOutcomes(['TRANSIENT_FAILURE', 'TRANSIENT_FAILURE']);
  denied(failures.o.runModel('session-1'));
  assert.equal(failures.o.inspect().counters.model_simulations, 2);
  assert.deepEqual(costIsNative(failures), { attempts: 2, charged: 4 });
  const exhausted = fixture();
  let refusals = 0;
  for (let i = 1; i <= 7; i += 1) {
    active(exhausted, String(i));
    const result = exhausted.o.runModel(`session-${i}`);
    if (result.status !== 'ADVISORY_ONLY') { denied(result); refusals += 1; }
  }
  assert.ok(refusals > 0, 'finite company fake-credit budget must exhaust');
  costIsNative(exhausted);
  assert.ok(exhausted.o.inspect().counters.model_simulations <= 5);
  assert.ok(nativeModelRecords(exhausted).some((record) => record.reason_code === 'BUDGET_EXHAUSTED'));
  noApplication(exhausted);
});

test('OC6-S14 policy/model changes after advisory invalidate submit, approval and execution provenance', () => {
  for (const kind of ['model.policy_version', 'model.catalog_version', 'bos.policy_version']) {
    for (const stage of ['submit', 'approval', 'execute']) {
      const f = fixture();
      advisory(f);
      const intent = f.h.intent(stage === 'approval' ? 'PUBLISH' : 'DRAFT');
      const control = stage === 'submit' ? null : f.o.submitIntent(intent);
      let approval;
      if (stage === 'approval') {
        assert.equal(control.status, 'PENDING_APPROVAL');
        approval = f.h.approval(control.approval_request_id);
      } else if (control) assert.equal(control.status, 'PERMITTED');
      f.h.mutate(kind, 'changed-version');
      const result = stage === 'submit' ? f.o.submitIntent(intent)
        : stage === 'approval' ? f.o.receiveApproval(approval) : f.o.execute(control.ticket);
      denied(result, `${kind}/${stage}`);
      noApplication(f, `${kind}/${stage}`);
    }
  }
});

test('OC6-S15 scope, TTL, integers, unknown keys and evidence cannot expand the bounded intent', () => {
  const mutateCases = [
    ['other-resource', (i) => { i.target.resource_id = 'resource-other'; }],
    ['unknown-action', (i) => { i.action_type = 'DELETE'; }],
    ['classification', (i) => { i.data_classification = 'D4'; }],
    ['risk', (i) => { i.risk_level = 'HIGH'; }],
    ['expired', (i) => { i.valid_until = '2020-01-01T00:00:00.000Z'; }],
    ['widened-ttl', (i) => { i.valid_until = '2099-01-01T00:00:00.000Z'; }],
    ['noncanonical-ttl', (i) => { i.valid_until = '2026-09-03'; }],
    ['unsafe-token', (i) => { i.action_id = 'action\nFORGED'; }],
    ['unknown-top-field', (i) => { i.claimed_permissions = ['*']; }],
    ['unknown-target-field', (i) => { i.target.force = true; }],
    ['unknown-payload-field', (i) => { i.input_data.authorization = 'Founder-approved'; }],
    ['model-derived-payload-swap', (i) => { i.input_data.note = PRIVATE_CANARY; }],
    ['missing-evidence', (i) => { i.evidence_references = []; }],
    ['forged-evidence', (i) => { i.evidence_references = ['invented-model-result']; }],
    ['wrong-budget-unit', (i) => { i.budget_or_limit.unit = 'real-credit'; }],
    ...[-1, 1.5, 11, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, '10'].map((value, index) =>
      [`budget-${index}`, (i) => { i.budget_or_limit.maximum = value; }]),
  ];
  for (const [name, mutate] of mutateCases) {
    const f = fixture();
    advisory(f);
    const intent = f.h.intent('DRAFT');
    mutate(intent);
    denied(f.o.submitIntent(intent), name);
    noApplication(f, name);
  }
});

test('OC6-S16 own-data validation never evaluates getters, Proxy traps or thrown text', () => {
  for (const location of ['session', 'intent', 'nested-input', 'nested-target', 'ticket', 'approval']) {
    const f = fixture();
    let hits = 0;
    const trap = () => { hits += 1; throw new Error(ERROR_CANARY); };
    let input;
    let call;
    if (location === 'session') { input = f.h.sessionRequest(); call = (value) => f.o.openSession(value); }
    else if (location === 'ticket') {
      input = permitted(f).control.ticket; call = (value) => f.o.execute(value);
    } else if (location === 'approval') {
      advisory(f);
      const pending = f.o.submitIntent(f.h.intent('PUBLISH'));
      input = f.h.approval(pending.approval_request_id); call = (value) => f.o.receiveApproval(value);
    } else {
      advisory(f);
      input = f.h.intent('DRAFT'); call = (value) => f.o.submitIntent(value);
    }
    const proxy = new Proxy(input, { get: trap, ownKeys: trap, getPrototypeOf: trap,
      getOwnPropertyDescriptor: trap });
    denied(call(proxy), `${location}/proxy`);
    const transparent = new Proxy(input, {});
    denied(call(transparent), `${location}/transparent-proxy`);
    const revoked = Proxy.revocable(input, {});
    revoked.revoke();
    denied(call(revoked.proxy), `${location}/revoked-proxy`);
    if (location.startsWith('nested-')) {
      const key = location === 'nested-input' ? 'input_data' : 'target';
      const nested = { ...input, [key]: new Proxy(input[key], { get: trap, ownKeys: trap }) };
      denied(call(nested), `${location}/nested-proxy`);
      const accessor = { ...input, [key]: { ...input[key] } };
      Object.defineProperty(accessor[key], Object.keys(accessor[key])[0], { enumerable: true, get: trap });
      denied(call(accessor), `${location}/nested-getter`);
    }
    const accessor = { ...input };
    Object.defineProperty(accessor, Object.keys(accessor)[0] || 'untrusted', { enumerable: true, get: trap });
    denied(call(accessor), `${location}/getter`);
    assert.equal(hits, 0, `${location}: hostile callback was invoked`);
    assert.equal(JSON.stringify(f.o.inspect()).includes(ERROR_CANARY), false);
    noApplication(f, location);
  }
});

test('OC6-S17 audit unavailable before native handoff blocks all read/effect paths', () => {
  for (const kind of ['READ', 'DRAFT', 'PUBLISH']) {
    const f = fixture();
    const { control } = permitted(f, kind);
    f.h.mutate('audit.available', false);
    denied(f.o.execute(control.ticket), kind);
    noBusiness(f, kind);
    assert.ok(f.o.inspect().secondary.length > 0);
  }
  const f = fixture();
  active(f);
  f.h.setAuditFailure('MG5_PREPARE');
  denied(f.o.runModel('session-1'));
  assert.equal(f.o.inspect().counters.model_simulations, 0);
  assert.equal(costIsNative(f).charged, 0);
});

test('OC6-S18 post-effect audit failure retains native receipt and prevents false zero-effect success', () => {
  for (const kind of ['DRAFT', 'PUBLISH']) {
    const f = fixture();
    const { control } = permitted(f, kind);
    f.h.setAuditFailure('BOS_RESULT');
    const result = f.o.execute(control.ticket);
    assert.equal(result.status, 'COMPENSATION_REQUIRED', kind);
    assert.ok(result.compensation_reference, kind);
    const snapshot = f.o.inspect();
    assert.equal(snapshot.counters.effects, 1, kind);
    assert.equal(snapshot.counters.application_calls, 1, kind);
    assert.ok(snapshot.native.bos.some((entry) => entry.receipts.length > 0));
    assert.ok(snapshot.queues.founder.length > 0);
    const duplicate = f.o.execute(control.ticket);
    assert.equal(duplicate.status, 'COMPENSATION_REQUIRED');
    assert.equal(duplicate.duplicate, true);
    assert.equal(f.o.inspect().counters.effects, 1);
    assert.equal(f.o.inspect().counters.application_calls, 1);
  }
});

test('OC6-S19 audit loss after repository read prevents disclosure and duplicate release', () => {
  const f = fixture();
  const { control } = permitted(f, 'READ');
  f.h.setHook('read.after', () => { f.h.mutate('audit.available', false); });
  denied(f.o.execute(control.ticket));
  const snapshot = f.o.inspect();
  assert.equal(snapshot.counters.repository_reads, 1);
  assert.equal(snapshot.counters.data_releases, 0);
  assert.equal(snapshot.counters.effects, 0);
  const duplicate = f.o.execute(control.ticket);
  denied(duplicate);
  assert.equal(f.o.inspect().counters.repository_reads, 1);
  assert.equal(f.o.inspect().counters.data_releases, 0);
});

test('OC6-S20 action-id and semantic-digest conflicts cannot mint a second execution', () => {
  for (const collision of ['action', 'idempotency', 'semantic-ttl']) {
    const f = fixture();
    const { intent, control } = permitted(f);
    assert.equal(f.o.execute(control.ticket).status, 'EXECUTED');
    const changed = structuredClone(intent);
    // A still-valid narrower TTL passes envelope validation but changes the
    // full approved intent digest; this reaches the reservation conflict gate.
    changed.valid_until = '2026-09-03T00:14:00.000Z';
    if (collision === 'action') changed.idempotency_key = 'other-idempotency';
    if (collision === 'idempotency') changed.action_id = 'other-action';
    const rejected = f.o.submitIntent(changed);
    denied(rejected, collision);
    assert.equal(rejected.reason_code, collision === 'idempotency' ? 'IDEMPOTENCY_CONFLICT' : 'ACTION_CONFLICT');
    assert.equal(f.o.inspect().counters.effects, 1);
    assert.equal(f.o.inspect().counters.application_calls, 1);
    assert.equal(JSON.stringify(f.o.inspect()).includes(PRIVATE_CANARY), false);
  }
});

test('OC6-S21 sequential and Promise-scheduled duplicates disclose/effect at most once', async () => {
  for (const kind of ['READ', 'DRAFT', 'PUBLISH']) {
    const f = fixture();
    const { control } = permitted(f, kind);
    const results = await Promise.all(Array.from({ length: 8 }, () =>
      Promise.resolve().then(() => f.o.execute(control.ticket))));
    const sequential = f.o.execute(control.ticket);
    assert.ok(results.every((result) => result.status === 'EXECUTED'));
    assert.equal(sequential.duplicate, true);
    assert.equal(f.o.inspect().counters.application_calls, 1, kind);
    assert.equal(f.o.inspect().counters.effects, kind === 'READ' ? 0 : 1, kind);
    assert.equal(f.o.inspect().counters.repository_reads, kind === 'READ' ? 1 : 0, kind);
    assert.equal(f.o.inspect().counters.data_releases, kind === 'READ' ? 1 : 0, kind);
    assert.equal(results.filter((result) => Object.hasOwn(result, 'data')).length, kind === 'READ' ? 1 : 0);
    assert.equal(Object.hasOwn(sequential, 'data'), false);
  }
});

test('OC6-S22 reentry is reserved before audit, Domain, repository and effect callbacks', () => {
  for (const [kind, hook] of [['DRAFT', 'audit.before'], ['DRAFT', 'bos.audit.before'],
    ['DRAFT', 'domain.before'], ['DRAFT', 'effect.after'], ['READ', 'read.before'], ['READ', 'read.after']]) {
    const f = fixture();
    const { control } = permitted(f, kind);
    const nested = [];
    let entered = false;
    f.h.setHook(hook, () => {
      if (!entered) { entered = true; nested.push(f.o.execute(control.ticket)); }
    });
    const result = f.o.execute(control.ticket);
    assert.equal(entered, true, hook);
    assert.equal(nested.length, 1, hook);
    denied(nested[0], hook);
    assert.equal(result.status, 'EXECUTED', hook);
    assert.equal(f.o.inspect().counters.application_calls, 1, hook);
    assert.equal(f.o.inspect().counters.effects, kind === 'DRAFT' ? 1 : 0, hook);
    assert.equal(f.o.inspect().counters.repository_reads, kind === 'READ' ? 1 : 0, hook);
    assert.equal(f.o.inspect().counters.data_releases, kind === 'READ' ? 1 : 0, hook);
  }
});

test('OC6-S23 model and submit reservations also precede callback-capable boundaries', () => {
  const admission = fixture();
  const request = admission.h.sessionRequest();
  let nestedAdmission;
  let admissionEntered = false;
  admission.h.setHook('session.beforeVerify', () => {
    if (!admissionEntered) { admissionEntered = true; nestedAdmission = admission.o.openSession(request); }
  });
  assert.equal(admission.o.openSession(request).status, 'ACTIVE');
  assert.equal(admissionEntered, true);
  denied(nestedAdmission);
  assert.equal(admission.o.inspect().sessions.length, 1);
  const f = fixture();
  active(f);
  let nestedModel;
  let modelEntered = false;
  f.h.setHook('mg5.audit.prepare', () => {
    if (!modelEntered) { modelEntered = true; nestedModel = f.o.runModel('session-1'); }
  });
  assert.equal(f.o.runModel('session-1').status, 'ADVISORY_ONLY');
  assert.equal(modelEntered, true);
  denied(nestedModel);
  assert.equal(f.o.inspect().counters.model_simulations, 1);
  costIsNative(f);
  const intent = f.h.intent('DRAFT');
  let nestedIntent;
  let intentEntered = false;
  f.h.setHook('bos.audit.before', () => {
    if (!intentEntered) { intentEntered = true; nestedIntent = f.o.submitIntent(intent); }
  });
  const control = f.o.submitIntent(intent);
  assert.equal(intentEntered, true);
  denied(nestedIntent);
  assert.equal(control.status, 'PERMITTED');
  assert.equal(f.o.execute(control.ticket).status, 'EXECUTED');
  assert.equal(f.o.inspect().counters.effects, 1);
});

test('OC6-S24 STOP/write closure at native registry callbacks cannot be widened or affect another session', () => {
  for (const kind of ['READ', 'DRAFT', 'PUBLISH']) {
    const f = fixture();
    const { control } = permitted(f, kind);
    let invoked = false;
    f.h.setHook('registry.read', () => { invoked = true; f.h.mutate('global.stop', true); });
    denied(f.o.execute(control.ticket), kind);
    assert.equal(invoked, true);
    noBusiness(f, kind);
  }
  const f = fixture();
  const first = permitted(f, 'DRAFT', '1');
  const second = permitted(f, 'DRAFT', '2');
  f.h.mutate('session.stop', true, 'session-1');
  denied(f.o.execute(first.control.ticket));
  assert.equal(f.o.execute(second.control.ticket).status, 'EXECUTED');
  assert.equal(f.o.inspect().counters.effects, 1);
  const closed = fixture();
  const { control } = permitted(closed);
  closed.h.mutate('global.write_close', true);
  denied(closed.o.execute(control.ticket));
  noBusiness(closed);
  const revoked = fixture();
  advisory(revoked);
  revoked.h.mutate('delegation.status', 'REVOKED');
  revoked.h.mutate('delegation.status', 'ACTIVE');
  denied(revoked.o.runModel('session-1'), 'revocation cannot be resumed');
  denied(revoked.o.submitIntent(revoked.h.intent('DRAFT')), 'restored label cannot widen authority');
  noBusiness(revoked);
});

test('OC6-S25 failures and native audits remain sealed and bridged without payload or exception disclosure', () => {
  const f = fixture();
  f.h.setModelOutput({ status: 'ON_TRACK', note: PRIVATE_CANARY });
  advisory(f);
  const intent = f.h.intent('DRAFT');
  assert.equal(intent.input_data.note, PRIVATE_CANARY);
  const control = f.o.submitIntent(intent);
  assert.equal(control.status, 'PERMITTED');
  f.h.setAuditFailure('BOS_RESULT');
  assert.equal(f.o.execute(control.ticket).status, 'COMPENSATION_REQUIRED');
  const snapshot = f.o.inspect();
  const text = JSON.stringify(snapshot);
  assert.equal(text.includes(PRIVATE_CANARY), false);
  assert.equal(text.includes(ERROR_CANARY), false);
  sealedChain(snapshot.audit);
  sealedChain(snapshot.native.reg4, JSON.stringify);
  for (const entry of snapshot.native.mg5) sealedChain(entry.records);
  for (const entry of snapshot.native.bos) sealedChain(entry.records);
  const bridges = snapshot.audit.filter((record) => record.event === 'NATIVE_BRIDGE');
  assert.ok(bridges.length > 0);
  const nativeRecords = [...snapshot.native.reg4,
    ...snapshot.native.mg5.flatMap((entry) => entry.records),
    ...snapshot.native.bos.flatMap((entry) => [...entry.records, ...entry.secondary])];
  for (const bridge of bridges) {
    assert.equal(bridge.correlation_id, intent.correlation_id);
    assert.equal(bridge.session_id, intent.session_id);
    assert.ok(nativeRecords.some((record) => record.audit_sha256 === bridge.native_audit_sha256
      && record.correlation_id === bridge.native_correlation_id), 'bridge must reference an original sealed native record');
  }
  for (const entry of snapshot.native.mg5) {
    for (const record of entry.records) {
      assert.equal(record.bos_ai1_commit, 'f44c14365589b7ff9f1df2ce40185ef8ebece05f');
      assert.equal(record.bos_ai1_tree, 'f17e4c4f699335ddad056310c8d70e3ed3df6909');
      assert.notEqual(record.correlation_id, intent.correlation_id);
    }
  }
});

test('OC6-S26 hooks receive frozen metadata and exceptions fail closed without leaking text', () => {
  for (const hook of ['model.before', 'domain.before']) {
    const f = fixture();
    let control;
    if (hook === 'model.before') active(f);
    else control = permitted(f).control;
    let metadataSeen;
    f.h.setHook(hook, (metadata) => {
      metadataSeen = metadata;
      throw new Error(ERROR_CANARY);
    });
    const result = hook === 'model.before' ? f.o.runModel('session-1') : f.o.execute(control.ticket);
    assert.ok(metadataSeen, hook);
    assert.ok(Object.isFrozen(metadataSeen));
    for (const key of ['payload', 'input_data', 'output', 'data', 'row', 'approval', 'ticket']) {
      assert.equal(Object.hasOwn(metadataSeen, key), false, `${hook}/${key}`);
    }
    denied(result, hook);
    assert.equal(JSON.stringify([result, f.o.inspect()]).includes(ERROR_CANARY), false);
    noBusiness(f, hook);
  }
});

test('OC6-S27 caller mutation cannot rewrite an admitted session or an owned execution snapshot', () => {
  const f = fixture();
  const request = active(f);
  const originalCompany = request.company_id;
  request.company_id = 'company-after-admission';
  request.executive_ai_identity = 'executive-after-admission';
  assert.equal(f.o.runModel('session-1').status, 'ADVISORY_ONLY');
  const intent = f.h.intent('DRAFT');
  assert.equal(intent.company_id, originalCompany);
  const originalAction = intent.action_id;
  const originalRoot = intent.correlation_id;
  const originalIntentDigest = createHash('sha256').update(stable(intent)).digest('hex');
  const control = f.o.submitIntent(intent);
  assert.equal(control.status, 'PERMITTED');
  assert.equal(control.ticket.intent_digest, originalIntentDigest);
  const originalNative = f.o.inspect().native.bos.find((entry) => entry.action_id === originalAction);
  assert.ok(originalNative && originalNative.records.length > 0);
  const originalNativeDigest = originalNative.records[0].request_sha256;
  assert.match(originalNativeDigest, /^[a-f0-9]{64}$/);
  intent.company_id = 'company-after-permit';
  intent.action_id = 'action-after-permit';
  intent.requester_id = 'requester-after-permit';
  intent.target.resource_id = 'resource-after-permit';
  intent.input_data.note = PRIVATE_CANARY;
  const result = f.o.execute(control.ticket);
  assert.equal(result.status, 'EXECUTED');
  assert.equal(result.action_id, originalAction);
  assert.equal(result.correlation_id, originalRoot);
  assert.equal(control.ticket.intent_digest, originalIntentDigest);
  const snapshot = f.o.inspect();
  assert.equal(snapshot.counters.effects, 1);
  const native = snapshot.native.bos.find((entry) => entry.action_id === originalAction);
  assert.ok(native);
  for (const record of native.records) {
    assert.equal(record.request_sha256, originalNativeDigest);
    assert.equal(record.correlation_id, originalRoot);
  }
  sealedChain(native.records);
  assert.equal(JSON.stringify(snapshot).includes(PRIVATE_CANARY), false);
  assert.equal(JSON.stringify(snapshot).includes('company-after-permit'), false);
});

test('OC6-S28 reentrant execution of another session retains each root and authority binding', () => {
  const f = fixture();
  const first = permitted(f, 'READ', '1');
  const second = permitted(f, 'READ', '2');
  let inner;
  let entered = false;
  f.h.setHook('domain.before', () => {
    if (!entered) {
      entered = true;
      inner = f.o.execute(second.control.ticket);
      f.h.mutate('session.stop', true, 'session-2');
    }
  });
  const outer = f.o.execute(first.control.ticket);
  assert.equal(entered, true);
  assert.equal(inner.status, 'EXECUTED');
  assert.equal(outer.status, 'EXECUTED');
  assert.equal(inner.session_id, second.intent.session_id);
  assert.equal(inner.correlation_id, second.intent.correlation_id);
  assert.equal(outer.session_id, first.intent.session_id);
  assert.equal(outer.correlation_id, first.intent.correlation_id);
  const snapshot = f.o.inspect();
  assert.equal(snapshot.counters.effects, 0);
  assert.equal(snapshot.counters.repository_reads, 2);
  assert.equal(snapshot.counters.data_releases, 2);
  for (const item of [first, second]) {
    const native = snapshot.native.bos.find((entry) => entry.action_id === item.intent.action_id);
    assert.ok(native);
    for (const record of native.records) assert.equal(record.correlation_id, item.intent.correlation_id);
    for (const record of snapshot.audit.filter((row) => row.action_id === item.intent.action_id)) {
      assert.equal(record.session_id, item.intent.session_id);
      assert.equal(record.correlation_id, item.intent.correlation_id);
    }
  }
});

test('OC6-S29 budget drift around native model callbacks stops simulation but preserves sunk charges', () => {
  for (const hook of ['mg5.audit.prepare', 'model.before', 'model.after', 'model.validate']) {
    const f = fixture();
    active(f);
    let hit = false;
    f.h.setHook(hook, () => { hit = true; f.h.mutate('budget.limit', 0); });
    denied(f.o.runModel('session-1'), hook);
    assert.equal(hit, true, hook);
    const simulations = ['model.after', 'model.validate'].includes(hook) ? 1 : 0;
    assert.equal(f.o.inspect().counters.model_simulations, simulations, hook);
    assert.equal(f.o.inspect().budget.limit, 0, hook);
    const cost = costIsNative(f, { loweredCap: true });
    assert.equal(cost.attempts, 1, hook);
    assert.equal(cost.charged, 2, `${hook}: native sunk charge cannot be rewritten to the lowered cap`);
    denied(f.o.runModel('session-1'), `${hook}/retry-after-drift`);
    assert.equal(f.o.inspect().counters.model_simulations, simulations, hook);
    assert.equal(costIsNative(f, { loweredCap: true }).charged, 2);
    noBusiness(f, hook);
  }
  const retry = fixture();
  active(retry);
  retry.h.setModelOutcomes(['TRANSIENT_FAILURE', 'SUCCESS']);
  retry.h.setHook('model.after', () => { retry.h.mutate('budget.limit', 0); });
  denied(retry.o.runModel('session-1'));
  assert.equal(retry.o.inspect().counters.model_simulations, 1);
  const cost = costIsNative(retry, { loweredCap: true });
  assert.ok(cost.attempts >= 1 && cost.attempts <= 2);
  assert.equal(cost.charged, cost.attempts * 2);
});

test('OC6-S30 budget drift after advisory is rechecked before BOS, approval and execution', () => {
  for (const stage of ['submit', 'approval', 'execute']) {
    const f = fixture();
    advisory(f);
    const intent = f.h.intent(stage === 'approval' ? 'PUBLISH' : 'DRAFT');
    const control = stage === 'submit' ? null : f.o.submitIntent(intent);
    let approval;
    if (stage === 'approval') {
      assert.equal(control.status, 'PENDING_APPROVAL');
      approval = f.h.approval(control.approval_request_id);
    } else if (control) assert.equal(control.status, 'PERMITTED');
    f.h.mutate('budget.limit', 0);
    const result = stage === 'submit' ? f.o.submitIntent(intent)
      : stage === 'approval' ? f.o.receiveApproval(approval) : f.o.execute(control.ticket);
    denied(result, stage);
    noApplication(f, stage);
    assert.equal(f.o.inspect().counters.model_simulations, 1);
    assert.equal(costIsNative(f, { loweredCap: true }).charged, 2);
  }
});
