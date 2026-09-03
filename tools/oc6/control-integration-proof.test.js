'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createOC6Proof, CONSTANTS } = require('./control-integration-proof');

/*
 * Builder functional coverage, initial build round 0. These tests exercise only
 * the actual OC6 public interface and trusted synthetic harness; no substitute
 * policy evaluator, registry, model gateway, Domain, or effect ledger is used.
 *
 * Requirement -> principal cases:
 * P01 F02/F03; P02 F04; P03 F06; P04 F07; P05 F08/F09/F17;
 * P06 F10/F11/F12/F18-F24; P07 F05; P08 F13; P09 F14-F16;
 * P10 F31-F33; P11 F34; P12 F35; P13 F25-F30/F38; P14 F36/F37.
 * Security tests separately cover actual BLOCKED/RETIRED mutations, hostile
 * bindings, malformed inputs, callback drift, audit faults and concurrency.
 * No tests were executed by the author; Architect owns the Development run.
 */

const SHA256 = /^[a-f0-9]{64}$/;
const READ_EVENTS = [
  'ACTION_INTENT', 'BOS_DECISION', 'PRE_EFFECT_READY',
  'EXECUTION_REVALIDATED', 'DOMAIN_DECISION', 'READ_COMPLETED',
  'FILTERED', 'REDACTED', 'RESULT',
];

function opened(options = {}, overrides = {}) {
  const { openclaw: o, harness: h } = createOC6Proof(options);
  const request = h.sessionRequest(overrides);
  const session = o.openSession(request);
  assert.equal(session.status, 'ACTIVE');
  assert.equal(session.session_id, request.session_id);
  assert.equal(session.correlation_id, request.correlation_id);
  return { o, h, request, session };
}

function modeled(options = {}, overrides = {}) {
  const f = opened(options, overrides);
  f.model = f.o.runModel(f.request.session_id);
  assert.equal(f.model.status, 'ADVISORY_ONLY');
  assert.equal(f.model.output_trust, 'UNTRUSTED_OUTPUT');
  assert.equal(typeof f.model.model_invocation_reference, 'string');
  return f;
}

function prepare(f, kind, overrides = {}) {
  const intent = f.h.intent(kind, { session_id: f.request.session_id, ...overrides });
  const initial = f.o.submitIntent(intent);
  let allowed = initial;
  let approval = null;
  if (kind === 'PUBLISH') {
    assert.equal(initial.status, 'PENDING_APPROVAL');
    assert.equal(initial.decision, 'REQUIRE_APPROVAL');
    approval = f.h.approval(initial.approval_request_id);
    allowed = f.o.receiveApproval(approval);
  }
  assert.equal(allowed.status, 'PERMITTED');
  assert.equal(allowed.decision, 'ALLOW');
  assert.ok(allowed.ticket && Object.isFrozen(allowed.ticket));
  return { intent, initial, approval, allowed };
}

function nativeAction(f, actionId) {
  const matching = f.o.inspect().native.bos.filter(row => row.action_id === actionId);
  assert.equal(matching.length, 1, 'one accumulated native BOS path per action');
  return matching[0];
}

function noBusinessActivity(snapshot) {
  for (const name of ['application_calls', 'domain_calls', 'repository_reads', 'data_releases', 'effects']) {
    assert.equal(snapshot.counters[name], 0, `${name} must remain zero`);
  }
}

function noReleasedData(result) {
  assert.equal(Object.hasOwn(result, 'data'), false);
  assert.notEqual(result.data_released, true);
}

function noNewBusinessActivity(before, after) {
  for (const name of ['application_calls', 'domain_calls', 'repository_reads', 'data_releases', 'effects']) {
    assert.equal(after.counters[name], before.counters[name], `${name} must not increase on replay`);
  }
}

function envelope(result, intent) {
  for (const key of [
    'status', 'reason_code', 'correlation_id', 'session_id', 'action_id',
    'policy_reference', 'delegation_reference', 'resource_version',
    'approval_reference', 'audit_reference', 'result_summary', 'compensation_reference',
  ]) assert.ok(Object.hasOwn(result, key), `Result Envelope requires ${key}`);
  assert.equal(result.action_id, intent.action_id);
  assert.equal(result.session_id, intent.session_id);
  assert.equal(result.correlation_id, intent.correlation_id);
  assert.equal(typeof result.reason_code, 'string');
  assert.ok(result.reason_code.length > 0);
  assert.deepEqual(result.policy_reference, intent.policy_reference);
  assert.equal(result.delegation_reference.delegation_id, intent.delegation_id);
  assert.equal(result.delegation_reference.delegation_version, intent.delegation_version);
  assert.match(result.delegation_reference.integrity_reference, SHA256);
  assert.equal(result.resource_version, intent.target.resource_version);
  assert.match(result.audit_reference, SHA256);
  if (intent.action_type !== 'PUBLISH') assert.equal(result.approval_reference, null);
  assert.equal(typeof result.result_summary, 'string');
  assert.ok(result.result_summary.length > 0);
  if (result.status === 'COMPENSATION_REQUIRED') {
    assert.equal(typeof result.compensation_reference, 'string');
    assert.ok(result.compensation_reference.length > 0);
  } else assert.equal(result.compensation_reference, null);
}

function ordered(actual, expected, label) {
  let cursor = -1;
  for (const item of expected) {
    cursor = actual.indexOf(item, cursor + 1);
    assert.ok(cursor >= 0, `${label}: missing or out-of-order ${item}`);
  }
}

function nativeExecuted(f, item) {
  const path = nativeAction(f, item.intent.action_id);
  const stages = path.stages;
  assert.ok(stages.some(row => row.stage === 'BOS_EVALUATE' && row.decision === 'ALLOW'));
  assert.ok(stages.some(row => row.stage === 'APPLICATION_SERVICE' && row.status === 'EXECUTED'));
  assert.ok(path.records.length > 0, 'native audit must accompany execution');
  assert.ok(path.receipts.length > 0, 'native receipt must accompany execution');
  for (const record of path.records) assert.match(record.audit_sha256, SHA256);
  for (const receipt of path.receipts) assert.equal(receipt.synthetic, true);
  return path;
}

test('F01 [G1/G2] frozen OpenClaw surface exposes orchestration without trusted authority controls', () => {
  const proof = createOC6Proof();
  assert.ok(Object.isFrozen(proof));
  assert.ok(Object.isFrozen(proof.openclaw));
  assert.ok(Object.isFrozen(proof.harness));
  assert.deepEqual(Object.keys(proof.openclaw).sort(), [
    'execute', 'inspect', 'openSession', 'receiveApproval', 'runModel', 'submitIntent',
  ]);
  assert.equal(Object.hasOwn(proof.openclaw, 'mutate'), false);
  assert.equal(Object.hasOwn(proof.openclaw, 'transitionAgent'), false);
  assert.equal(Object.hasOwn(proof.openclaw, 'approval'), false);
  noBusinessActivity(proof.openclaw.inspect());
});

test('F02 [OC6-P01] complete immutable Founder delegation binds an ACTIVE Executive session', () => {
  const f = opened();
  const snapshot = f.o.inspect();
  const session = snapshot.sessions.find(row => row.session_id === f.request.session_id);
  assert.ok(session);
  assert.equal(session.status, 'ACTIVE');
  assert.equal(session.correlation_id, f.request.correlation_id);
  assert.ok(f.request.delegation_id);
  assert.ok(f.request.delegation_version);
  assert.notEqual(f.request.executive_ai_identity, f.request.agent_id);
  assert.notEqual(f.request.on_behalf_of, f.request.executive_ai_identity);
  const delegation = snapshot.delegation;
  assert.ok(delegation && Object.isFrozen(delegation));
  for (const key of [
    'objective', 'delegation_scope', 'company_scope', 'granted_permissions',
    'prohibited_actions', 'budget', 'risk_thresholds', 'valid_from', 'expires_at',
    'acceptance_criteria', 'stop_conditions', 'revocation_conditions', 'revocation_authorities',
  ]) assert.ok(Object.hasOwn(delegation, key), `Founder delegation requires ${key}`);
  assert.equal(delegation.delegation_id, f.request.delegation_id);
  assert.equal(delegation.delegation_version, f.request.delegation_version);
  assert.equal(delegation.executive_ai_identity, f.request.executive_ai_identity);
  assert.equal(delegation.executive_ai_version, f.request.executive_ai_version);
  assert.equal(delegation.founder_identity, f.request.on_behalf_of);
  assert.equal(delegation.on_behalf_of, delegation.founder_identity);
  assert.deepEqual(delegation.company_scope, [f.request.company_id]);
  assert.deepEqual(delegation.delegation_scope.resource_ids, [f.request.resource_id]);
  assert.deepEqual(delegation.delegation_scope.action_types, ['READ', 'DRAFT', 'PUBLISH']);
  assert.equal(delegation.delegation_scope.channel, 'FAKE_ADAPTER');
  assert.equal(delegation.budget.maximum, 10);
  assert.ok(delegation.stop_conditions.length > 0);
  assert.ok(delegation.revocation_conditions.length > 0);
  assert.deepEqual(delegation.revocation_authorities, [delegation.founder_identity]);
  assert.deepEqual(delegation.acceptance_criteria, Array.from({ length: 14 }, (_, i) => `OC6-P${String(i + 1).padStart(2, '0')}`));
  assert.match(delegation.integrity_reference, SHA256);
  assert.equal(f.session.delegation_reference.integrity_reference, delegation.integrity_reference);
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.sessions));
  assert.ok(snapshot.audit.some(row => row.event === 'SESSION_OPENED'));
  noBusinessActivity(snapshot);
});

test('F03 [OC6-P01/P02] outside-company session request cannot create an ACTIVE session or dispatch', () => {
  const { openclaw: o, harness: h } = createOC6Proof();
  const request = h.sessionRequest({ company_id: 'company-outside-delegation' });
  const result = o.openSession(request);
  assert.equal(result.status, 'DENIED');
  assert.equal(o.inspect().sessions.filter(row => row.status === 'ACTIVE').length, 0);
  assert.equal(o.inspect().counters.model_simulations, 0);
  noBusinessActivity(o.inspect());
});

test('F04 [OC6-P02] ordinary prohibited protected action cannot reach native application execution', () => {
  const f = modeled();
  f.h.mutate('bos.prohibited', ['DRAFT']);
  const intent = f.h.intent('DRAFT');
  const result = f.o.submitIntent(intent);
  assert.equal(result.status, 'DENIED');
  assert.equal(result.correlation_id, f.request.correlation_id);
  assert.equal(result.session_id, f.request.session_id);
  noReleasedData(result);
  noBusinessActivity(f.o.inspect());
  assert.ok(f.o.inspect().audit.some(row => row.event === 'RESULT' && row.action_id === intent.action_id));
});

test('F05 [OC6-P07/P14] cross-company intent is denied before Application Service with trusted session correlation', () => {
  const f = modeled();
  const intent = f.h.intent('READ', { company_id: 'company-outside-delegation' });
  const result = f.o.submitIntent(intent);
  assert.equal(result.status, 'DENIED');
  assert.equal(result.correlation_id, f.request.correlation_id);
  assert.equal(result.session_id, f.request.session_id);
  noReleasedData(result);
  noBusinessActivity(f.o.inspect());
  assert.equal(f.o.inspect().queues.founder.length, 0);
  const denialAudit = f.o.inspect().audit.filter(row => row.event === 'RESULT' && row.status === 'DENIED').at(-1);
  assert.ok(denialAudit);
  assert.equal(denialAudit.correlation_id, f.request.correlation_id);
  assert.equal(denialAudit.session_id, f.request.session_id);
});

test('F06 [OC6-P03] Router proposal precedes verification of a real APPROVED REG4 package', () => {
  const f = opened();
  const snapshot = f.o.inspect();
  ordered(snapshot.audit.map(row => row.event), ['ROUTER_PROPOSED', 'REG4_VERIFIED'], 'routing control');
  const approval = snapshot.native.reg4.find(row => row.to_status === 'APPROVED' && row.outcome === 'ACCEPTED');
  assert.ok(approval, 'real REG4 transition audit must prove APPROVED');
  assert.equal(approval.actor_role, 'APPROVER');
  assert.equal(approval.agent_id, f.request.agent_id);
  assert.equal(approval.version, f.request.agent_version);
  assert.equal(approval.resolved_package_sha256, f.request.package_sha256);
  assert.match(approval.audit_sha256, SHA256);
  const bridge = snapshot.audit.find(row => row.event === 'NATIVE_BRIDGE' && row.native_component === 'REG4' &&
    row.native_audit_sha256 === approval.audit_sha256);
  assert.ok(bridge, 'root session must bind the actual native REG4 approval audit');
  assert.equal(bridge.native_correlation_id, approval.correlation_id);
  assert.equal(bridge.session_id, f.request.session_id);
  assert.equal(bridge.correlation_id, f.request.correlation_id);
  assert.equal(snapshot.counters.model_native_attempts, 0);
  noBusinessActivity(snapshot);
});

test('F07 [OC6-P04] one fake MG5 route preserves native model, costs, sealed audit and historical BOS pin', () => {
  const f = modeled();
  const snapshot = f.o.inspect();
  assert.equal(snapshot.native.mg5.length, 1);
  const gateway = snapshot.native.mg5[0];
  assert.equal(gateway.session_id, f.request.session_id);
  const native = gateway.records.at(-1);
  assert.equal(native.decision, 'ALLOW');
  // Approved scenario alias MODEL-FAKE-REASONING-V1 maps explicitly to this
  // single native MG5 model/profile; native audit vocabulary is unchanged.
  assert.equal(CONSTANTS.fake_model, 'model.fake.reasoning@1.0.0');
  assert.equal(native.selected_primary, CONSTANTS.fake_model);
  assert.equal(native.selected_fallback, null);
  assert.equal(native.attempts.length, 1);
  assert.equal(`${native.attempts[0].model_id}@${native.attempts[0].version}`, native.selected_primary);
  assert.equal(native.attempts[0].cost_units, 2);
  assert.equal(native.charged_units, 2);
  assert.equal(native.business_effect, 'NONE');
  assert.equal(native.output_trust, 'UNTRUSTED');
  assert.equal(native.bos_ai1_commit, 'f44c14365589b7ff9f1df2ce40185ef8ebece05f');
  assert.equal(native.bos_ai1_tree, 'f17e4c4f699335ddad056310c8d70e3ed3df6909');
  assert.match(native.audit_sha256, SHA256);
  assert.equal(snapshot.counters.model_simulations, 1);
  assert.equal(snapshot.counters.model_native_attempts, 1);
  assert.equal(snapshot.budget.charged, 2);
  noBusinessActivity(snapshot);
});

test('F08 [OC6-P05] model result is explicitly untrusted advisory and never a business effect', () => {
  const f = modeled();
  assert.equal(f.model.output_trust, 'UNTRUSTED_OUTPUT');
  assert.equal(f.model.correlation_id, f.request.correlation_id);
  assert.equal(Object.hasOwn(f.model, 'ticket'), false);
  noBusinessActivity(f.o.inspect());
  assert.equal(f.o.inspect().counters.bos_evaluations, 0);
  assert.ok(f.o.inspect().audit.some(row => row.event === 'MODEL_OUTPUT'));
});

test('F09 [OC6-P05/P10] repeated model request returns prior provenance without another invocation or charge', () => {
  const f = modeled();
  const before = f.o.inspect();
  const replay = f.o.runModel(f.request.session_id);
  assert.equal(replay.status, 'ADVISORY_ONLY');
  assert.equal(replay.duplicate, true);
  assert.equal(replay.model_invocation_reference, f.model.model_invocation_reference);
  assert.equal(f.o.inspect().counters.model_native_attempts, before.counters.model_native_attempts);
  assert.equal(f.o.inspect().counters.model_simulations, before.counters.model_simulations);
  assert.equal(f.o.inspect().budget.charged, before.budget.charged);
  noBusinessActivity(f.o.inspect());
});

test('F10 [OC6-P06] READ BOS control ALLOW does not perform its separate pre-effect audit or data read', () => {
  const f = modeled();
  const item = prepare(f, 'READ');
  const path = nativeAction(f, item.intent.action_id);
  assert.deepEqual(path.stages.map(row => row.stage), ['BOS_EVALUATE']);
  assert.equal(path.stages[0].status, 'PERMITTED');
  assert.equal(path.stages[0].decision, 'ALLOW');
  assert.match(path.stages[0].permit_sha256, SHA256);
  assert.equal(path.records.length, 0);
  assert.equal(path.receipts.length, 0);
  noReleasedData(item.allowed);
  noBusinessActivity(f.o.inspect());
});

test('F11 [OC6-P06/P14] READ executes native control -> readiness -> Domain -> filtered release with distinct permits', () => {
  const f = modeled();
  const item = prepare(f, 'READ');
  const result = f.o.execute(item.allowed.ticket);
  assert.equal(result.status, 'EXECUTED');
  assert.equal(result.data_released, true);
  assert.ok(result.data && Object.isFrozen(result.data));
  assert.deepEqual(result.data, { status: 'ON_TRACK', progress_percent: 50, owner_contact: '[REDACTED]' });
  assert.equal(Object.hasOwn(result.data, 'private_note'), false);
  envelope(result, item.intent);
  const path = nativeExecuted(f, item);
  assert.deepEqual(path.stages.map(row => row.stage), ['BOS_EVALUATE', 'PRE_EFFECT_AUDIT', 'APPLICATION_SERVICE']);
  assert.deepEqual(path.stages.map(row => row.status), ['PERMITTED', 'READY', 'EXECUTED']);
  assert.match(path.stages[1].permit_sha256, SHA256);
  assert.notEqual(path.stages[0].permit_sha256, path.stages[1].permit_sha256);
  ordered(path.records.map(row => row.event), READ_EVENTS, 'native READ audit');
  const counts = f.o.inspect().counters;
  assert.equal(counts.application_calls, 1);
  assert.equal(counts.domain_calls, 1);
  assert.equal(counts.repository_reads, 1);
  assert.equal(counts.data_releases, 1);
  assert.equal(counts.effects, 0);
});

test('F12 [OC6-P06] DRAFT requires native ALLOW and separate Domain execution for one synthetic draft effect', () => {
  const f = modeled();
  const item = prepare(f, 'DRAFT');
  noBusinessActivity(f.o.inspect());
  const result = f.o.execute(item.allowed.ticket);
  assert.equal(result.status, 'EXECUTED');
  envelope(result, item.intent);
  noReleasedData(result);
  const path = nativeExecuted(f, item);
  assert.equal(path.kind, 'DRAFT');
  assert.equal(path.stages.filter(row => row.stage === 'BOS_EVALUATE').length, 1);
  assert.equal(f.o.inspect().counters.effects, 1);
  assert.equal(f.o.inspect().counters.domain_calls, 1);
  assert.equal(f.o.inspect().counters.repository_reads, 0);
  assert.equal(f.o.inspect().counters.approval_rechecks, 0);
  assert.equal(f.o.inspect().queues.approval.length, 0);
});

test('F13 [OC6-P08] unapproved Publish is native REQUIRE_APPROVAL and queued with zero effect', () => {
  const f = modeled();
  const intent = f.h.intent('PUBLISH');
  const result = f.o.submitIntent(intent);
  assert.equal(result.status, 'PENDING_APPROVAL');
  assert.equal(result.decision, 'REQUIRE_APPROVAL');
  envelope(result, intent);
  assert.equal(typeof result.approval_request_id, 'string');
  assert.equal(Object.hasOwn(result, 'ticket'), false);
  const path = nativeAction(f, intent.action_id);
  assert.equal(path.stages.length, 1);
  assert.equal(path.stages[0].decision, 'REQUIRE_APPROVAL');
  assert.equal(path.stages[0].status, 'PENDING_APPROVAL');
  assert.equal(f.o.inspect().queues.approval.length, 1);
  assert.equal(f.o.inspect().queues.founder.length, 0);
  noBusinessActivity(f.o.inspect());
});

test('F14 [OC6-P09] bound authority APPROVE performs a second native BOS evaluation without executing', () => {
  const f = modeled();
  const item = prepare(f, 'PUBLISH');
  const path = nativeAction(f, item.intent.action_id);
  assert.deepEqual(path.stages.map(row => row.stage), ['BOS_EVALUATE', 'BOS_EVALUATE']);
  assert.deepEqual(path.stages.map(row => row.decision), ['REQUIRE_APPROVAL', 'ALLOW']);
  assert.equal(path.stages[1].status, 'PERMITTED');
  assert.match(path.stages[1].permit_sha256, SHA256);
  assert.equal(f.o.inspect().counters.bos_evaluations, 2);
  assert.equal(f.o.inspect().counters.approval_rechecks, 1);
  ordered(f.o.inspect().audit.map(row => row.event), ['APPROVAL_REQUESTED', 'APPROVAL_RECEIVED'], 'approval loop');
  noBusinessActivity(f.o.inspect());
});

test('F15 [OC6-P09] approved Publish reaches native Application Service only after two BOS decisions', () => {
  const f = modeled();
  const item = prepare(f, 'PUBLISH');
  const result = f.o.execute(item.allowed.ticket);
  assert.equal(result.status, 'EXECUTED');
  envelope(result, item.intent);
  assert.ok(result.approval_reference);
  const path = nativeExecuted(f, item);
  assert.deepEqual(path.stages.map(row => row.stage), ['BOS_EVALUATE', 'BOS_EVALUATE', 'APPLICATION_SERVICE']);
  assert.equal(path.kind, 'PUBLISH');
  assert.equal(f.o.inspect().counters.application_calls, 1);
  assert.equal(f.o.inspect().counters.domain_calls, 1);
  assert.equal(f.o.inspect().counters.effects, 1);
  assert.equal(f.o.inspect().counters.data_releases, 0);
});

test('F16 [OC6-P09] authority DENY closes pending Publish without native execution or effect', () => {
  const f = modeled();
  const intent = f.h.intent('PUBLISH');
  const pending = f.o.submitIntent(intent);
  assert.equal(pending.status, 'PENDING_APPROVAL');
  const rejected = f.o.receiveApproval(f.h.approval(pending.approval_request_id, { decision: 'DENY' }));
  assert.equal(rejected.status, 'DENIED');
  envelope(rejected, intent);
  noReleasedData(rejected);
  assert.equal(Object.hasOwn(rejected, 'ticket'), false);
  assert.equal(nativeAction(f, intent.action_id).stages.some(row => row.stage === 'APPLICATION_SERVICE'), false);
  noBusinessActivity(f.o.inspect());
});

test('F17 [OC6-P05] model advisory result cannot itself act as an execution ticket', () => {
  const f = modeled();
  const result = f.o.execute(f.model);
  assert.equal(result.status, 'DENIED');
  noReleasedData(result);
  assert.equal(f.o.inspect().counters.bos_evaluations, 0);
  noBusinessActivity(f.o.inspect());
});

for (const [index, kind] of ['READ', 'DRAFT', 'PUBLISH'].entries()) {
  test(`F${18 + index} [OC6-P06] ${kind} Domain DENY after native ALLOW prevents every read/effect`, () => {
    const f = modeled();
    const item = prepare(f, kind);
    f.h.mutate('domain.decision', 'DENY');
    const result = f.o.execute(item.allowed.ticket);
    assert.equal(result.status, 'DENIED');
    envelope(result, item.intent);
    noReleasedData(result);
    const path = nativeAction(f, item.intent.action_id);
    assert.ok(path.stages.some(row => row.stage === 'BOS_EVALUATE' && row.decision === 'ALLOW'));
    assert.equal(path.stages.at(-1).stage, 'APPLICATION_SERVICE');
    assert.equal(path.stages.at(-1).status, 'DENIED');
    const counts = f.o.inspect().counters;
    assert.equal(counts.domain_calls, 1);
    assert.equal(counts.repository_reads, 0);
    assert.equal(counts.data_releases, 0);
    assert.equal(counts.effects, 0);
    assert.equal(f.o.inspect().queues.founder.length, 0);
  });
}

for (const [index, kind] of ['READ', 'DRAFT', 'PUBLISH'].entries()) {
  test(`F${21 + index} [OC6-P06/G6] ${kind} Domain STOP prevents downstream access independently of BOS ALLOW`, () => {
    const f = modeled();
    const item = prepare(f, kind);
    f.h.mutate('domain.decision', 'STOP');
    const result = f.o.execute(item.allowed.ticket);
    assert.equal(result.status, 'STOPPED');
    noReleasedData(result);
    assert.equal(f.o.inspect().counters.domain_calls, 1);
    assert.equal(f.o.inspect().counters.repository_reads, 0);
    assert.equal(f.o.inspect().counters.data_releases, 0);
    assert.equal(f.o.inspect().counters.effects, 0);
    assert.equal(nativeAction(f, item.intent.action_id).stages.at(-1).status, 'STOPPED');
  });
}

test('F24 [OC6-P06/P09] current resource-version change invalidates a previously approved Publish', () => {
  const f = modeled();
  const item = prepare(f, 'PUBLISH');
  f.h.mutate('resource.version', '2');
  const result = f.o.execute(item.allowed.ticket);
  assert.ok(['DENIED', 'STOPPED'].includes(result.status));
  noReleasedData(result);
  assert.equal(f.o.inspect().counters.effects, 0);
  assert.equal(f.o.inspect().counters.data_releases, 0);
  assert.equal(nativeAction(f, item.intent.action_id).receipts.length, 0);
});

test('F25 [OC6-P13] native READ repository failure stops without releasing data or creating effects', () => {
  const f = modeled();
  f.h.mutate('read.mode', 'THROW');
  const item = prepare(f, 'READ');
  const result = f.o.execute(item.allowed.ticket);
  assert.equal(result.status, 'STOPPED');
  envelope(result, item.intent);
  noReleasedData(result);
  assert.equal(f.o.inspect().counters.domain_calls, 1);
  assert.equal(f.o.inspect().counters.data_releases, 0);
  assert.equal(f.o.inspect().counters.effects, 0);
  assert.equal(nativeAction(f, item.intent.action_id).stages.at(-1).status, 'STOPPED');
});

test('F26 [OC6-P13] READ filtering failure retains native read evidence but releases no data', () => {
  const f = modeled();
  f.h.mutate('pipeline.filter_failure', true);
  const item = prepare(f, 'READ');
  const result = f.o.execute(item.allowed.ticket);
  assert.equal(result.status, 'STOPPED');
  noReleasedData(result);
  assert.equal(f.o.inspect().counters.repository_reads, 1);
  assert.equal(f.o.inspect().counters.data_releases, 0);
  assert.equal(f.o.inspect().counters.effects, 0);
  const records = nativeAction(f, item.intent.action_id).records;
  assert.ok(records.some(row => row.event === 'READ_COMPLETED'));
});

for (const [index, kind] of ['DRAFT', 'PUBLISH'].entries()) {
  test(`F${27 + index} [OC6-P13] ${kind} known rejection before effect is FAILED with zero effect`, () => {
    const f = modeled();
    f.h.mutate('effect.mode', 'REJECT_BEFORE_EFFECT');
    const item = prepare(f, kind);
    const result = f.o.execute(item.allowed.ticket);
    assert.equal(result.status, 'FAILED');
    envelope(result, item.intent);
    noReleasedData(result);
    assert.equal(result.effect_state, 'NONE');
    assert.equal(result.compensation_reference, null);
    assert.equal(f.o.inspect().counters.domain_calls, 1);
    assert.equal(f.o.inspect().counters.effects, 0);
    assert.equal(f.o.inspect().queues.founder.length, 0);
    assert.equal(nativeAction(f, item.intent.action_id).stages.at(-1).status, 'FAILED');
  });
}

for (const [index, mode] of ['PARTIAL', 'TIMEOUT_AFTER_ACCEPT'].entries()) {
  test(`F${29 + index} [OC6-P12/P13] Publish ${mode} preserves effect evidence and requires compensation`, () => {
    const f = modeled();
    f.h.mutate('effect.mode', mode);
    const item = prepare(f, 'PUBLISH');
    const result = f.o.execute(item.allowed.ticket);
    assert.equal(result.status, 'COMPENSATION_REQUIRED');
    envelope(result, item.intent);
    noReleasedData(result);
    assert.equal(result.effect_state, mode === 'PARTIAL' ? 'PARTIAL' : 'UNKNOWN');
    assert.equal(f.o.inspect().counters.effects, 1);
    assert.equal(f.o.inspect().counters.data_releases, 0);
    const path = nativeAction(f, item.intent.action_id);
    assert.ok(path.receipts.length > 0);
    assert.equal(path.stages.at(-1).status, 'COMPENSATION_REQUIRED');
    assert.ok(f.o.inspect().queues.founder.some(row => row.action_id === item.intent.action_id));
  });
}

for (const [index, kind] of ['READ', 'DRAFT', 'PUBLISH'].entries()) {
  test(`F${31 + index} [OC6-P10] duplicate completed ${kind} returns prior receipt without redisclosure or duplicate effect`, () => {
    const f = modeled();
    const item = prepare(f, kind);
    const first = f.o.execute(item.allowed.ticket);
    assert.equal(first.status, 'EXECUTED');
    const before = f.o.inspect();
    const repeated = f.o.submitIntent(item.intent);
    const replay = repeated.ticket ? f.o.execute(repeated.ticket) : repeated;
    assert.equal(replay.status, 'EXECUTED');
    assert.equal(replay.duplicate, true);
    assert.equal(replay.action_id, first.action_id);
    assert.equal(replay.correlation_id, first.correlation_id);
    noReleasedData(replay);
    noNewBusinessActivity(before, f.o.inspect());
    assert.equal(f.o.inspect().counters.effects, kind === 'READ' ? 0 : 1);
    assert.equal(f.o.inspect().counters.data_releases, kind === 'READ' ? 1 : 0);
    const priorPath = before.native.bos.find(row => row.action_id === item.intent.action_id);
    assert.equal(nativeAction(f, item.intent.action_id).receipts.length, priorPath.receipts.length);
  });
}

test('F34 [OC6-P11] ordinary READ, DRAFT and Publish results go to Executive without Founder escalation', () => {
  const f = modeled();
  const actions = [];
  for (const kind of ['READ', 'DRAFT', 'PUBLISH']) {
    const item = prepare(f, kind);
    const result = f.o.execute(item.allowed.ticket);
    assert.equal(result.status, 'EXECUTED');
    actions.push(item.intent.action_id);
  }
  const snapshot = f.o.inspect();
  assert.equal(snapshot.queues.founder.length, 0);
  for (const actionId of actions) {
    const delivered = snapshot.queues.executive.filter(row => row.action_id === actionId && row.status === 'EXECUTED');
    assert.equal(delivered.length, 1);
    assert.equal(Object.hasOwn(delivered[0], 'data'), false, 'result queue must not redisclose the READ payload');
  }
  assert.equal(snapshot.counters.effects, 2);
  assert.equal(snapshot.counters.data_releases, 1);
});

test('F35 [OC6-P12/P13] a known no-effect failure remains ordinary while partial effect creates Founder exception', () => {
  const ordinary = modeled();
  ordinary.h.mutate('effect.mode', 'REJECT_BEFORE_EFFECT');
  const failedItem = prepare(ordinary, 'PUBLISH');
  const failed = ordinary.o.execute(failedItem.allowed.ticket);
  assert.equal(failed.status, 'FAILED');
  assert.equal(ordinary.o.inspect().queues.founder.length, 0);
  assert.ok(ordinary.o.inspect().queues.executive.some(row => row.action_id === failedItem.intent.action_id && row.status === 'FAILED'));

  const material = modeled();
  material.h.mutate('effect.mode', 'PARTIAL');
  const partialItem = prepare(material, 'PUBLISH');
  const partial = material.o.execute(partialItem.allowed.ticket);
  assert.equal(partial.status, 'COMPENSATION_REQUIRED');
  assert.equal(material.o.inspect().queues.founder.filter(row => row.action_id === partialItem.intent.action_id).length, 1);
  assert.ok(material.o.inspect().queues.executive.some(row => row.action_id === partialItem.intent.action_id));
});

test('F36 [OC6-P14] complete branch retains root correlation, native audits, bridges and redacted Result Envelopes', () => {
  const f = modeled();
  const actions = [];
  for (const kind of ['READ', 'DRAFT', 'PUBLISH']) {
    const item = prepare(f, kind);
    const result = f.o.execute(item.allowed.ticket);
    assert.equal(result.status, 'EXECUTED');
    envelope(result, item.intent);
    actions.push(item.intent.action_id);
  }
  const snapshot = f.o.inspect();
  ordered(snapshot.audit.map(row => row.event), [
    'ROUTER_PROPOSED', 'REG4_VERIFIED', 'MG5_REQUESTED', 'MG5_PREPARE',
    'MG5_TERMINAL', 'MODEL_OUTPUT', 'ACTION_INTENT',
  ], 'root control chain');
  assert.ok(snapshot.audit.some(row => row.event === 'NATIVE_BRIDGE'));
  for (const actionId of actions) {
    const branch = snapshot.audit.filter(row => row.action_id === actionId);
    assert.ok(branch.length > 0);
    assert.ok(branch.some(row => row.event === 'ACTION_INTENT'));
    assert.ok(branch.some(row => row.event === 'RESULT'));
    for (const row of branch) {
      assert.equal(row.session_id, f.request.session_id);
      assert.equal(row.correlation_id, f.request.correlation_id);
      assert.match(row.audit_sha256, SHA256);
    }
    for (const row of nativeAction(f, actionId).records) assert.equal(row.correlation_id, f.request.correlation_id);
  }
  const nativeModel = snapshot.native.mg5[0].records.at(-1);
  assert.notEqual(nativeModel.correlation_id, f.request.correlation_id, 'retain native MG5 local id');
  assert.ok(JSON.stringify(snapshot.audit).includes(nativeModel.audit_sha256), 'bridge binds native audit hash');
  assert.ok(JSON.stringify(snapshot.audit).includes(nativeModel.correlation_id), 'bridge binds native local correlation');
  const publicEvidence = JSON.stringify(snapshot);
  assert.equal(publicEvidence.includes('Synthetic status update'), false, 'model-derived note cannot leak into inspect/audit/queues');
  assert.equal(publicEvidence.includes('synthetic-private-contact'), false);
  assert.equal(publicEvidence.includes('synthetic-private-row'), false);
  for (const row of snapshot.audit) assert.equal(row.synthetic, true);
  for (const row of snapshot.queues.executive) assert.equal(Object.hasOwn(row, 'data'), false);
});

test('F37 [OC6-P14] independent sessions keep distinct task and root correlation through their native READ paths', () => {
  const f = modeled();
  const secondRequest = f.h.sessionRequest({ session_id: 'session-2', task_id: 'task-2', correlation_id: 'correlation-2' });
  assert.equal(f.o.openSession(secondRequest).status, 'ACTIVE');
  assert.equal(f.o.runModel(secondRequest.session_id).status, 'ADVISORY_ONLY');
  for (const request of [f.request, secondRequest]) {
    const intent = f.h.intent('READ', { session_id: request.session_id });
    assert.equal(intent.task_id, request.task_id);
    assert.equal(intent.correlation_id, request.correlation_id);
    const allowed = f.o.submitIntent(intent);
    assert.equal(allowed.status, 'PERMITTED');
    const result = f.o.execute(allowed.ticket);
    assert.equal(result.status, 'EXECUTED');
    envelope(result, intent);
    for (const record of nativeAction(f, intent.action_id).records) assert.equal(record.correlation_id, request.correlation_id);
    for (const record of f.o.inspect().audit.filter(row => row.action_id === intent.action_id)) {
      assert.equal(record.session_id, request.session_id);
      assert.equal(record.correlation_id, request.correlation_id);
    }
  }
  assert.equal(f.o.inspect().counters.repository_reads, 2);
  assert.equal(f.o.inspect().counters.data_releases, 2);
  assert.equal(f.o.inspect().counters.effects, 0);
  assert.equal(f.o.inspect().native.mg5.length, 2);
  assert.equal(f.o.inspect().budget.charged, 4);
});

test('F38 [OC6-P10/P13] uncertain prior Publish outcome cannot be retried into a second effect', () => {
  const f = modeled();
  f.h.mutate('effect.mode', 'TIMEOUT_AFTER_ACCEPT');
  const item = prepare(f, 'PUBLISH');
  const first = f.o.execute(item.allowed.ticket);
  assert.equal(first.status, 'COMPENSATION_REQUIRED');
  const before = f.o.inspect();
  const replay = f.o.execute(item.allowed.ticket);
  assert.equal(replay.status, 'COMPENSATION_REQUIRED');
  assert.equal(replay.duplicate, true);
  assert.equal(replay.compensation_reference, first.compensation_reference);
  noNewBusinessActivity(before, f.o.inspect());
  assert.equal(f.o.inspect().counters.effects, 1);
  assert.equal(nativeAction(f, item.intent.action_id).receipts.length, 1);
});
