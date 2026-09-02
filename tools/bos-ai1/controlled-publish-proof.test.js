'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const {
  ACTION, PERMISSION, EFFECT_CLASS, BINDINGS, REG4_BASELINE, AGENT_CONTRACT,
  payloadSha256, createSyntheticPublishAuthority, createFakePublishAdapter, createControlledPublishProof,
} = require('./controlled-publish-proof');
const { createAgentRegistry, calculatePackageSha256 } = require('../reg4/agent-registry');

const NOW = '2026-09-02T03:00:00.000Z';
const PAST = '2026-09-01T03:00:00.000Z';
const FUTURE = '2026-09-03T03:00:00.000Z';

function fixture(options = {}) {
  const registry = createAgentRegistry({ now: () => NOW });
  const content = {
    agent_id: AGENT_CONTRACT.agent_id, version: AGENT_CONTRACT.version,
    name: 'Synthetic controlled publish agent', created_by: 'builder.publish',
    permissions: [PERMISSION], required_tools: [ACTION], prohibited_actions: ['critical_write'],
    evidence_references: [
      { evidence_id: 'fake.test', evidence_type: 'AUTOMATED_TEST', result: 'PASS', sha256: 'a'.repeat(64) },
      { evidence_id: 'fake.review', evidence_type: 'INDEPENDENT_REVIEW', result: 'PASS', sha256: 'b'.repeat(64) },
    ],
  };
  options.editAgent?.(content);
  const packageSha = calculatePackageSha256(content);
  registry.registerAgentPackage({ ...content, package_sha256: packageSha }, { actor_id: 'builder.publish', role: 'AUTHOR' });
  const transition = (status) => registry.transitionApproval(
    { agent_id: content.agent_id, version: content.version, to_status: status },
    { actor_id: 'review.publish', role: status === 'RETIRED' ? 'REGISTRY_ADMIN' : status === 'APPROVED' ? 'APPROVER' : 'REVIEWER' });
  transition('IN_REVIEW');
  transition(options.status || 'APPROVED');
  const payload = { status: 'ON_TRACK', note: 'Synthetic update only' };
  const request = {
    request_id: 'request-1', correlation_id: 'oc6-fake-correlation-1', idempotency_key: 'delivery-1',
    action_id: ACTION, effect_class: EFFECT_CLASS, agent_id: content.agent_id,
    agent_version: content.version, package_sha256: packageSha,
    reg4_baseline_commit: REG4_BASELINE.commit, reg4_baseline_tree: REG4_BASELINE.tree,
    requester_id: 'requester', executor_id: 'executor', on_behalf_of: 'owner', company_id: 'fake-company',
    resource_id: 'fake-project', resource_version: '7', task_id: 'fake-task', task_version: '1',
    delegation_id: 'fake-delegation', delegation_version: '1', policy_version: 'policy-1',
    payload, payload_sha256: payloadSha256(payload), approval_id: 'approval-1',
  };
  const identities = Object.fromEntries(['requester', 'executor', 'owner', 'approver'].map((id) => [id, {
    identity_id: id, company_id: request.company_id, active: true, role: id,
    permissions: [PERMISSION, 'project.status_update.approve'],
  }]));
  Object.assign(identities.executor, { agent_id: content.agent_id, agent_version: content.version, package_sha256: packageSha });
  const approval = Object.fromEntries(BINDINGS.map((key) => [key, request[key]]));
  Object.assign(approval, { approval_id: 'approval-1', approver_id: 'approver', status: 'ACTIVE', not_before: PAST, expires_at: FUTURE });
  const data = {
    now: NOW, identities,
    task: { task_id: request.task_id, version: request.task_version, company_id: request.company_id,
      requester_id: 'requester', executor_id: 'executor', on_behalf_of: 'owner', resource_id: request.resource_id,
      active: true, expires_at: FUTURE, permissions: [PERMISSION], allowed_actions: [ACTION], allowed_tools: [ACTION] },
    delegation: { delegation_id: request.delegation_id, version: '1', company_id: request.company_id,
      delegate_id: 'executor', delegator_id: 'owner', resource_id: request.resource_id, revoked: false,
      expires_at: FUTURE, permissions: [PERMISSION], allowed_actions: [ACTION], allowed_tools: [ACTION] },
    project: { resource_id: request.resource_id, version: '7', company_id: request.company_id,
      permissions_by_principal: { owner: [PERMISSION] } },
    policy: { policy_version: 'policy-1', company_id: request.company_id,
      allowed_actions: [ACTION], allowed_tools: [ACTION], prohibited_actions: [],
      role_permissions: { requester: [PERMISSION] }, approver_ids: ['approver'] },
    approvals: { 'approval-1': approval },
  };
  const authority = createSyntheticPublishAuthority(data);
  const adapter = createFakePublishAdapter({ mode: options.mode, afterAccept: () => options.afterAccept?.(f) });
  const gateRegistry = options.wrapRegistry ? options.wrapRegistry(registry, () => f) : registry;
  const proof = createControlledPublishProof({ registry: gateRegistry, authority, adapter,
    beforeFinalRevalidation: () => options.hook?.(f) });
  const f = { registry, transition, content, data, authority, adapter, proof, request,
    change(edit) { edit(data); authority.replace(data); } };
  return f;
}

function noEffect(f, result, decision = 'DENY') {
  assert.equal(result.decision, decision);
  assert.equal(f.proof.listEffects().length, 0);
  const audit = f.proof.listAuditRecords().at(-1);
  assert.equal(audit.effect_created, false);
  assert.equal(audit.correlation_id, result.correlation_id);
}

test('CP01 no approval waits; approval re-enters BOS-AI1 and revalidates before one effect', () => {
  let reads = 0;
  const f = fixture({ wrapRegistry: (registry) => ({ getAgentPackage(...args) { reads++; return registry.getAgentPackage(...args); } }) });
  noEffect(f, f.proof.invoke({ ...f.request, approval_id: null }), 'REQUIRE_APPROVAL');
  const result = f.proof.invoke(f.request);
  assert.equal(result.decision, 'ALLOW');
  assert.equal(result.effect_state, 'APPLIED');
  assert.equal(reads, 3);
  assert.equal(f.proof.listEffects().length, 1);
  assert.equal(f.proof.listAuditRecords().length, 2);
});

for (const status of ['BLOCKED', 'RETIRED']) test(`CP02 Agent ${status} denies before effect`, () => {
  const f = fixture({ status });
  const result = f.proof.invoke(f.request);
  noEffect(f, result);
  assert.equal(result.reason_code, `AGENT_${status}`);
});

test('CP02 final real REG4 retirement blocks effect', () => {
  const f = fixture({ hook: (x) => x.transition('RETIRED') });
  noEffect(f, f.proof.invoke(f.request));
});

test('CP02 final BLOCKED registry result blocks effect', () => {
  let reads = 0;
  const f = fixture({ wrapRegistry: (registry) => ({ getAgentPackage(...args) {
    const record = registry.getAgentPackage(...args);
    return ++reads === 2 ? { ...record, approval_status: 'BLOCKED' } : record;
  } }) });
  assert.equal(f.proof.invoke(f.request).reason_code, 'AGENT_BLOCKED');
  assert.equal(f.proof.listEffects().length, 0);
});

const changes = {
  'requester inactive': (d) => { d.identities.requester.active = false; },
  'executor inactive': (d) => { d.identities.executor.active = false; },
  'owner permission lost': (d) => { d.identities.owner.permissions = []; },
  'requester permission lost': (d) => { d.identities.requester.permissions = []; },
  'executor permission lost': (d) => { d.identities.executor.permissions = []; },
  'executor package changed': (d) => { d.identities.executor.package_sha256 = 'f'.repeat(64); },
  'task expired': (d) => { d.task.expires_at = NOW; },
  'task inactive': (d) => { d.task.active = false; },
  'task permission lost': (d) => { d.task.permissions = []; },
  'task tool denied': (d) => { d.task.allowed_tools = []; },
  'delegation expired': (d) => { d.delegation.expires_at = PAST; },
  'delegation revoked': (d) => { d.delegation.revoked = true; },
  'delegation permission lost': (d) => { d.delegation.permissions = []; },
  'delegation tool denied': (d) => { d.delegation.allowed_tools = []; },
  'delegation changed': (d) => { d.delegation.version = '2'; },
  'company wrong': (d) => { d.identities.owner.company_id = 'other-company'; },
  'resource wrong': (d) => { d.project.resource_id = 'other-project'; },
  'resource company wrong': (d) => { d.project.company_id = 'other-company'; },
  'resource version stale': (d) => { d.project.version = '8'; },
  'resource permission lost': (d) => { d.project.permissions_by_principal.owner = []; },
  'policy version changed': (d) => { d.policy.policy_version = 'policy-2'; },
  'policy permission lost': (d) => { d.policy.role_permissions.requester = []; },
  'policy prohibits action': (d) => { d.policy.prohibited_actions = [ACTION]; },
  'policy prohibits effect class': (d) => { d.policy.prohibited_actions = ['LIMITED_WRITE']; },
  'approver inactive': (d) => { d.identities.approver.active = false; },
  'approver unauthorized': (d) => { d.identities.approver.permissions = []; },
  'approver policy removed': (d) => { d.policy.approver_ids = []; },
  'approval expired': (d) => { d.approvals['approval-1'].expires_at = NOW; },
  'approval revoked': (d) => { d.approvals['approval-1'].status = 'REVOKED'; },
  'approval already consumed': (d) => { d.approvals['approval-1'].status = 'CONSUMED'; },
  'approval not yet valid': (d) => { d.approvals['approval-1'].not_before = FUTURE; },
  'fresh final clock catches expiry': (d) => { d.now = FUTURE; },
};
for (const [label, edit] of Object.entries(changes)) test(`CP03-05 final ${label}: no effect`, () => {
  const f = fixture({ hook: (x) => x.change(edit) });
  noEffect(f, f.proof.invoke(f.request));
});

for (const key of BINDINGS) test(`CP05 approval binding ${key} cannot be reused incorrectly`, () => {
  const f = fixture();
  f.change((d) => { d.approvals['approval-1'][key] = 'other-value'; });
  const result = f.proof.invoke(f.request);
  noEffect(f, result);
  assert.equal(result.reason_code, 'APPROVAL_BINDING_MISMATCH');
});

test('CP05 approval lookup identity cannot be substituted', () => {
  const f = fixture();
  f.change((d) => { d.approvals['approval-1'].approval_id = 'approval-2'; });
  noEffect(f, f.proof.invoke(f.request));
});

test('CP05 consumed ID survives synthetic state replacement and cannot fund another delivery', () => {
  const f = fixture();
  assert.equal(f.proof.invoke(f.request).decision, 'ALLOW');
  f.change((d) => { d.approvals['approval-1'].idempotency_key = 'delivery-2'; });
  const result = f.proof.invoke({ ...f.request, idempotency_key: 'delivery-2' });
  assert.equal(result.reason_code, 'APPROVAL_CONSUMED');
  assert.equal(f.proof.listEffects().length, 1);
  assert.equal(f.proof.listAuditRecords().at(-1).effect_created, false);
});

test('CP06 sequential duplicate returns exact receipt with one acceptance', () => {
  const f = fixture();
  const first = f.proof.invoke(f.request);
  const second = f.proof.invoke({ ...f.request, request_id: 'delivery-retry', correlation_id: 'oc6-retry' });
  assert.deepEqual(second.result, first.result);
  assert.equal(second.duplicate, true);
  assert.equal(second.correlation_id, 'oc6-retry');
  assert.equal(f.proof.listEffects().length, 1);
  assert.equal(f.proof.listAuditRecords().length, 2);
});

test('CP06 conflicting duplicate is denied without a second effect', () => {
  const f = fixture();
  f.proof.invoke(f.request);
  const payload = { status: 'BLOCKED', note: 'different' };
  const second = f.proof.invoke({ ...f.request, payload, payload_sha256: payloadSha256(payload) });
  assert.equal(second.reason_code, 'IDEMPOTENCY_CONFLICT');
  assert.equal(f.proof.listEffects().length, 1);
});

for (const location of ['hook', 'registry', 'adapter']) test(`CP06 nested duplicate at ${location} cannot double accept`, () => {
  let nested;
  let nesting = false;
  function reenter(f) { if (!nesting) { nesting = true; nested = f.proof.invoke(f.request); } }
  const f = fixture({
    hook: location === 'hook' ? reenter : undefined,
    afterAccept: location === 'adapter' ? reenter : undefined,
    wrapRegistry: location === 'registry' ? (registry, getFixture) => ({ getAgentPackage(...args) {
      reenter(getFixture()); return registry.getAgentPackage(...args);
    } }) : undefined,
  });
  assert.equal(f.proof.invoke(f.request).decision, 'ALLOW');
  assert.equal(nested.reason_code, 'REQUEST_IN_PROGRESS');
  assert.equal(f.proof.listEffects().length, 1);
  assert.equal(f.proof.listAuditRecords().length, 2);
});

test('CP03 final registry callback changing authority is detected after registry read', () => {
  let reads = 0;
  const f = fixture({ wrapRegistry: (registry, getFixture) => ({ getAgentPackage(...args) {
    if (++reads === 2) getFixture().change((d) => { d.delegation.revoked = true; });
    return registry.getAgentPackage(...args);
  } }) });
  noEffect(f, f.proof.invoke(f.request));
});

for (const [mode, state] of [['PARTIAL', 'PARTIAL'], ['TIMEOUT_AFTER_ACCEPT', 'UNKNOWN']]) test(`CP07 ${mode} is terminal compensation without retry`, () => {
  let calls = 0;
  const f = fixture({ mode, afterAccept: () => { calls++; } });
  const first = f.proof.invoke(f.request);
  assert.equal(first.decision, 'COMPENSATION_REQUIRED');
  assert.equal(first.effect_state, state);
  for (let i = 0; i < 3; i++) assert.deepEqual(f.proof.invoke(f.request).result, first.result);
  assert.equal(calls, 1);
  assert.equal(f.proof.listEffects().length, 1);
  assert.equal(f.proof.listAuditRecords().at(-1).compensation, 'REQUIRED_NO_RETRY');
});

test('CP07 arbitrary throw after accept becomes UNKNOWN and remains cached', () => {
  const hostile = new Proxy({}, { get() { throw 'secret-value'; } });
  const f = fixture({ afterAccept: () => { throw hostile; } });
  const first = f.proof.invoke(f.request);
  assert.equal(first.effect_state, 'UNKNOWN');
  assert.equal(first.decision, 'COMPENSATION_REQUIRED');
  assert.deepEqual(f.proof.invoke(f.request).result, first.result);
  assert.equal(f.proof.listEffects().length, 1);
  assert.ok(!JSON.stringify(f.proof.listAuditRecords()).includes('secret-value'));
});

for (const [label, input] of [
  ['null', () => null], ['primitive', () => 'secret-payload'],
  ['getter', () => Object.defineProperty({}, 'correlation_id', { enumerable: true, get() { throw 'secret-getter'; } })],
  ['proxy', () => new Proxy({}, { ownKeys() { throw new Proxy({}, { get() { throw 'secret-proxy'; } }); } })],
  ['prototype pollution', (r) => ({ ...r, payload: JSON.parse('{"__proto__":{"polluted":true}}') })],
  ['critical write', (r) => ({ ...r, effect_class: 'CRITICAL_WRITE' })],
  ['other action', (r) => ({ ...r, action_id: 'project.delete' })],
  ['digest mismatch', (r) => ({ ...r, payload_sha256: '0'.repeat(64) })],
  ['sparse array', (r) => ({ ...r, payload: Array(1) })],
]) test(`CP08 safe audit for invalid ${label}`, () => {
  const f = fixture();
  noEffect(f, f.proof.invoke(input(f.request)));
  assert.equal(f.proof.listAuditRecords().length, 1);
  assert.ok(!JSON.stringify(f.proof.listAuditRecords()).includes('secret-'));
});

function stable(value) {
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
}
test('CP08 every invocation has complete hash-linked audit and isolated read views', () => {
  const f = fixture();
  f.proof.invoke({ ...f.request, approval_id: null });
  f.proof.invoke(f.request);
  for (let i = 0; i < 220; i++) f.proof.invoke(f.request);
  const records = f.proof.listAuditRecords();
  assert.equal(records.length, 222);
  let prior = '0'.repeat(64);
  for (const { audit_sha256: digest, ...body } of records) {
    assert.equal(body.previous_audit_sha256, prior);
    assert.equal(body.correlation_id, f.request.correlation_id);
    assert.equal(digest, createHash('sha256').update(stable(body)).digest('hex'));
    prior = digest;
  }
  assert.equal(records.filter((a) => a.effect_created).length, 1);
  records[0].decision = 'tampered';
  f.proof.listEffects()[0].state = 'tampered';
  assert.equal(f.proof.listAuditRecords()[0].decision, 'REQUIRE_APPROVAL');
  assert.equal(f.proof.listEffects()[0].state, 'APPLIED');
});

test('CP08 a pre-effect hook exception denies, audits and releases reservation', () => {
  let fail = true;
  const f = fixture({ hook: () => { if (fail) throw 'untrusted'; } });
  noEffect(f, f.proof.invoke(f.request));
  fail = false;
  assert.equal(f.proof.invoke(f.request).decision, 'ALLOW');
});

test('CP10 dependency brands prevent a real adapter or authority and prevent rebinding', () => {
  const f = fixture();
  for (const authority of [{}, f.authority]) assert.throws(() => createControlledPublishProof({ registry: f.registry, authority, adapter: f.adapter }), TypeError);
  assert.throws(() => createControlledPublishProof({ registry: f.registry, authority: createSyntheticPublishAuthority(f.data), adapter: { publish() {} } }), TypeError);
});
