'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const {
  ACTION, PERMISSION, EFFECT_CLASS, BINDINGS, REG4_BASELINE, AGENT_CONTRACT,
  payloadSha256, createHandoffAuthority, createFakeAuditWriter, createFakeDomainGuard, createFakeEffectAdapter, createPreEffectHandoffProof,
} = require('./pre-effect-handoff-proof');
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
    action_id: 'ACT-PUBLISH-001', tool_id: ACTION, policy_id: 'fake-policy', valid_until: FUTURE, effect_class: EFFECT_CLASS, agent_id: content.agent_id,
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
    policy: { policy_id: 'fake-policy', policy_version: 'policy-1', company_id: request.company_id,
      allowed_actions: [ACTION], allowed_tools: [ACTION], prohibited_actions: [],
      role_permissions: { requester: [PERMISSION] }, approver_ids: ['approver'] },
    approvals: { 'approval-1': approval },
  };
  const authority = createHandoffAuthority(data);
  const domain = createFakeDomainGuard({ company_id: request.company_id, resource_id: request.resource_id,
    version: '7', decision: options.domainDecision || 'ALLOW' }, {
    beforeCheck: (r) => options.beforeDomain?.(f, r), afterCheck: () => options.afterDomain?.(f),
  });
  const audit = createFakeAuditWriter({ failAt: options.failAt || [],
    beforeWrite: (e) => options.beforeAudit?.(f, e), afterWrite: (e) => options.afterAudit?.(f, e) });
  const adapter = createFakeEffectAdapter({ mode: options.mode, afterAccept: () => options.afterAccept?.(f) });
  let reads = 0;
  const gateRegistry = { getAgentPackage(...args) {
    const record = registry.getAgentPackage(...args);
    reads++;
    options.onRegistry?.(f, reads);
    return options.registryResult ? options.registryResult(record, reads) : record;
  } };
  const proof = createPreEffectHandoffProof({ registry: gateRegistry, authority, audit, domain, adapter });
  const f = { registry, transition, content, data, authority, audit, domain, adapter, proof, request,
    change(edit) { edit(data); authority.replace(data); },
    allow() { return proof.bos.evaluate(request); },
    run() { const c = proof.bos.evaluate(request); return c.decision === 'ALLOW' ? proof.applicationService.execute(c.permit, request) : c; },
  };
  return f;
}

function zero(f, result, status = 'DENIED') {
  assert.equal(result.status, status);
  assert.equal(f.proof.listEffects().length, 0);
  assert.equal(f.adapter.callCount(), 0);
  assert.equal(f.proof.listSecondaryAudit().at(-1).correlation_id, result.correlation_id);
}

test('H01 ALLOW is an audited, zero-effect handoff; Application Service runs separately', () => {
  const trace = [];
  const f = fixture({ beforeAudit: (_f, e) => { trace.push(e.event); },
    beforeDomain: () => { trace.push('DOMAIN_CALL'); }, afterAccept: () => { trace.push('ADAPTER_ACCEPT'); } });
  const control = f.allow();
  assert.equal(control.decision, 'ALLOW');
  assert.equal(control.status, 'PERMITTED');
  assert.equal(control.effect_state, 'NONE');
  assert.equal(f.domain.callCount(), 0);
  assert.equal(f.proof.applicationCallCount(), 0);
  assert.equal(f.adapter.callCount(), 0);
  assert.equal(f.proof.listEffects().length, 0);
  assert.deepEqual(trace, ['ACTION_INTENT', 'BOS_DECISION']);
  assert.deepEqual(f.audit.listRecords().map((e) => e.status), ['VALIDATED', 'ALLOW']);
  const result = f.proof.applicationService.execute(control.permit, f.request);
  assert.equal(result.status, 'EXECUTED');
  assert.equal(f.proof.listEffects().length, 1);
  assert.deepEqual(trace, ['ACTION_INTENT', 'BOS_DECISION', 'EXECUTION_REVALIDATED', 'DOMAIN_CALL', 'DOMAIN_DECISION', 'ADAPTER_ACCEPT', 'RESULT']);
});

test('H01 approval re-enters BOS, never calls Domain directly', () => {
  const f = fixture();
  const pending = f.proof.bos.evaluate({ ...f.request, approval_id: null });
  zero(f, pending, 'PENDING_APPROVAL');
  assert.equal(pending.decision, 'REQUIRE_APPROVAL');
  assert.equal(f.domain.callCount(), 0);
  const c = f.allow();
  assert.equal(c.decision, 'ALLOW');
  assert.equal(f.proof.listEffects().length, 0);
  assert.equal(f.proof.applicationService.execute(c.permit, f.request).status, 'EXECUTED');
});

for (const event of ['ACTION_INTENT', 'BOS_DECISION', 'EXECUTION_REVALIDATED', 'DOMAIN_DECISION']) {
  test(`H02 ${event} write failure stops before adapter`, () => {
    const f = fixture({ failAt: [event] });
    const result = f.run();
    zero(f, result, 'STOPPED');
    assert.equal(f.domain.callCount(), event === 'DOMAIN_DECISION' ? 1 : 0);
    if (['ACTION_INTENT', 'BOS_DECISION'].includes(event)) assert.equal(f.proof.applicationCallCount(), 0);
    assert.equal(result.reason_code, 'PRE_EFFECT_AUDIT_FAILED');
  });
  test(`H02 ${event} hostile audit exception is fail-closed without exception metadata`, () => {
    const poison = new Proxy({}, { get() { throw new Error('SECRET_STACK_SENTINEL'); } });
    const f = fixture({ beforeAudit: (_f, e) => { if (e.event === event) throw poison; } });
    zero(f, f.run(), 'STOPPED');
    assert.equal(JSON.stringify(f.proof.listSecondaryAudit()).includes('SECRET_STACK_SENTINEL'), false);
  });
}

for (const decision of ['DENY', 'STOP']) test(`H03 Domain ${decision} veto precedes adapter`, () => {
  const f = fixture({ domainDecision: decision });
  const result = f.run();
  zero(f, result, decision === 'DENY' ? 'DENIED' : 'STOPPED');
  assert.equal(f.domain.callCount(), 1);
  assert.equal(f.audit.listRecords().find((e) => e.event === 'DOMAIN_DECISION').status, decision);
});

test('H03 state change before Domain check denies despite an earlier BOS ALLOW', () => {
  const f = fixture();
  const c = f.allow();
  f.domain.replace({ ...f.domain.snapshot(), version: '8' });
  zero(f, f.proof.applicationService.execute(c.permit, f.request));
  assert.equal(f.domain.callCount(), 1);
});

for (const boundary of ['domainAudit', 'finalRegistry']) test(`H03 Domain state mutation at ${boundary} cannot invalidate veto ordering`, () => {
  const mutate = (f) => f.domain.replace({ ...f.domain.snapshot(), decision: 'DENY' });
  const f = fixture({ beforeAudit: (x, e) => { if (boundary === 'domainAudit' && e.event === 'DOMAIN_DECISION') mutate(x); },
    onRegistry: (x, n) => { if (boundary === 'finalRegistry' && n === 4) mutate(x); } });
  const result = f.run();
  zero(f, result);
  assert.equal(result.reason_code, 'DOMAIN_STATE_CHANGED');
});

test('H03 Domain exception fails safely with no caller-controlled reason', () => {
  const f = fixture({ beforeDomain: () => { throw { status: 'ALLOW', reason_code: 'SECRET_DOMAIN' }; } });
  zero(f, f.run(), 'STOPPED');
  assert.equal(JSON.stringify(f.audit.listRecords()).includes('SECRET_DOMAIN'), false);
});

const changes = {
  'requester inactive': (d) => { d.identities.requester.active = false; },
  'executor inactive': (d) => { d.identities.executor.active = false; },
  'owner inactive': (d) => { d.identities.owner.active = false; },
  'requester permission': (d) => { d.identities.requester.permissions = []; },
  'executor permission': (d) => { d.identities.executor.permissions = []; },
  'owner permission': (d) => { d.identities.owner.permissions = []; },
  'executor package': (d) => { d.identities.executor.package_sha256 = 'f'.repeat(64); },
  'task expired': (d) => { d.task.expires_at = NOW; },
  'task inactive': (d) => { d.task.active = false; },
  'task permission': (d) => { d.task.permissions = []; },
  'task tool': (d) => { d.task.allowed_tools = []; },
  'delegation expired': (d) => { d.delegation.expires_at = NOW; },
  'delegation revoked': (d) => { d.delegation.revoked = true; },
  'delegation permission': (d) => { d.delegation.permissions = []; },
  'delegation tool': (d) => { d.delegation.allowed_tools = []; },
  'delegation version': (d) => { d.delegation.version = '2'; },
  'company': (d) => { d.identities.owner.company_id = 'other'; },
  'resource ID': (d) => { d.project.resource_id = 'other'; },
  'resource company': (d) => { d.project.company_id = 'other'; },
  'resource version': (d) => { d.project.version = '8'; },
  'resource permission': (d) => { d.project.permissions_by_principal.owner = []; },
  'policy version': (d) => { d.policy.policy_version = 'other'; },
  'policy ID': (d) => { d.policy.policy_id = 'other'; },
  'policy permission': (d) => { d.policy.role_permissions.requester = []; },
  'policy prohibition': (d) => { d.policy.prohibited_actions = [ACTION]; },
  'approver inactive': (d) => { d.identities.approver.active = false; },
  'approver permission': (d) => { d.identities.approver.permissions = []; },
  'approver policy': (d) => { d.policy.approver_ids = []; },
  'approval expiry': (d) => { d.approvals['approval-1'].expires_at = NOW; },
  'approval revocation': (d) => { d.approvals['approval-1'].status = 'REVOKED'; },
  'approval consumption': (d) => { d.approvals['approval-1'].status = 'CONSUMED'; },
  'approval future': (d) => { d.approvals['approval-1'].not_before = FUTURE; },
  'fresh clock': (d) => { d.now = FUTURE; },
  'clock rollback': (d) => { d.now = PAST; },
};
for (const [label, edit] of Object.entries(changes)) for (const boundary of ['handoff', 'domainAudit', 'finalRegistry']) {
  test(`H04 ${label} changes at ${boundary}: zero effect`, () => {
    const f = fixture({ beforeAudit: (x, e) => { if (boundary === 'domainAudit' && e.event === 'DOMAIN_DECISION') x.change(edit); },
      onRegistry: (x, n) => { if (boundary === 'finalRegistry' && n === 4) x.change(edit); } });
    const c = f.allow();
    assert.equal(c.decision, 'ALLOW');
    if (boundary === 'handoff') f.change(edit);
    zero(f, f.proof.applicationService.execute(c.permit, f.request));
  });
}

for (const status of ['BLOCKED', 'RETIRED']) for (const boundary of ['control', 'handoff', 'final']) {
  test(`H04 Agent ${status} at ${boundary} blocks execution`, () => {
    const f = fixture({ registryResult: (r, n) =>
      (boundary === 'control' || (boundary === 'handoff' && n >= 3) || (boundary === 'final' && n === 4)) ? { ...r, approval_status: status } : r });
    zero(f, f.run());
  });
}

test('H04 audit mutation cannot mint a permit after authority revocation', () => {
  const f = fixture({ beforeAudit: (x, e) => { if (e.event === 'BOS_DECISION') x.change((d) => { d.delegation.revoked = true; }); } });
  zero(f, f.allow());
  assert.equal(f.domain.callCount(), 0);
});

for (const key of [...BINDINGS, 'approval_id']) test(`H05 permit binding rejects substituted ${key}`, () => {
  const f = fixture();
  const c = f.allow();
  assert.equal(c.decision, 'ALLOW');
  const bad = { ...f.request, [key]: key.includes('sha256') ? 'c'.repeat(64) : key === 'valid_until' ? PAST : 'other' };
  zero(f, f.proof.applicationService.execute(c.permit, bad));
  assert.equal(f.domain.callCount(), 0);
  // A hostile mismatched presentation does not consume the genuine permit.
  assert.equal(f.proof.applicationService.execute(c.permit, f.request).status, 'EXECUTED');
});

test('H05 permit expiry cannot be extended through mutable authority fixtures', () => {
  const f = fixture();
  f.change((d) => { d.approvals['approval-1'].expires_at = '2026-09-02T03:00:01.000Z'; });
  const c = f.allow();
  assert.equal(c.permit.expires_at, '2026-09-02T03:00:01.000Z');
  f.change((d) => { d.now = '2026-09-02T03:00:02.000Z'; d.approvals['approval-1'].expires_at = FUTURE; });
  const result = f.proof.applicationService.execute(c.permit, f.request);
  zero(f, result);
  assert.equal(result.reason_code, 'PERMIT_EXPIRED');
});

test('H05 forged, copied, proxy and cross-instance permits do not authorize effects', () => {
  const f = fixture();
  const g = fixture();
  const c = f.allow();
  const revoked = Proxy.revocable(c.permit, {}); revoked.revoke();
  for (const bad of [null, {}, { ...c.permit }, new Proxy(c.permit, {}), revoked.proxy, g.allow().permit]) {
    zero(f, f.proof.applicationService.execute(bad, f.request));
  }
  assert.throws(() => { c.permit.resource_id = 'other'; }, TypeError);
  assert.equal(f.proof.applicationService.execute(c.permit, f.request).status, 'EXECUTED');
});

test('H06 fifty sequential duplicate executions preserve one adapter call and effect', () => {
  const f = fixture();
  const c = f.allow();
  const first = f.proof.applicationService.execute(c.permit, f.request);
  assert.equal(first.status, 'EXECUTED');
  for (let i = 0; i < 50; i++) {
    const result = f.proof.applicationService.execute(c.permit, { ...f.request, request_id: `retry-${i}` });
    assert.equal(result.status, 'EXECUTED');
    assert.equal(result.duplicate, true);
    assert.equal(result.effect_id, first.effect_id);
  }
  assert.equal(f.adapter.callCount(), 1);
  assert.equal(f.proof.listEffects().length, 1);
  assert.equal(f.domain.callCount(), 1);
});

test('H06 simultaneous Promise-scheduled callers cannot create two effects', async () => {
  const f = fixture();
  const c = f.allow();
  const results = await Promise.all(Array.from({ length: 64 }, () => Promise.resolve().then(() => f.proof.applicationService.execute(c.permit, f.request))));
  assert.equal(results.filter((r) => !r.duplicate).length, 1);
  assert.equal(f.adapter.callCount(), 1);
  assert.equal(f.proof.listEffects().length, 1);
});

for (const point of ['registry', 'intentAudit', 'allowAudit', 'recheckAudit', 'Domain', 'domainAudit', 'adapter', 'postAudit']) {
  test(`H06 nested call at ${point} is IN_PROGRESS and preserves one effect`, () => {
    const nested = [];
    let permit;
    const replay = (f) => nested.push(permit ? f.proof.applicationService.execute(permit, f.request) : f.allow());
    const f = fixture({ onRegistry: (x) => { if (point === 'registry') replay(x); },
      beforeAudit: (x, e) => { if ({ ACTION_INTENT: 'intentAudit', BOS_DECISION: 'allowAudit', EXECUTION_REVALIDATED: 'recheckAudit', DOMAIN_DECISION: 'domainAudit', RESULT: 'postAudit' }[e.event] === point) replay(x); },
      beforeDomain: (x) => { if (point === 'Domain') replay(x); }, afterAccept: (x) => { if (point === 'adapter') replay(x); } });
    const c = f.allow(); permit = c.permit;
    assert.equal(c.decision, 'ALLOW');
    assert.equal(f.proof.applicationService.execute(permit, f.request).status, 'EXECUTED');
    assert.ok(nested.length > 0);
    assert.ok(nested.every((r) => r.status === 'IN_PROGRESS'));
    assert.equal(f.adapter.callCount(), 1);
    assert.equal(f.proof.listEffects().length, 1);
  });
}

test('H06 conflicting nested evaluation cannot release an outer issuance reservation', () => {
  const nested = [];
  const f = fixture({ beforeAudit: (x, e) => {
    if (e.event === 'BOS_DECISION') {
      nested.push(x.proof.bos.evaluate({ ...x.request, correlation_id: 'conflict' }));
      nested.push(x.allow());
    }
  } });
  assert.equal(f.run().status, 'EXECUTED');
  assert.deepEqual(nested.map((r) => r.status), ['DENIED', 'IN_PROGRESS']);
  assert.equal(f.adapter.callCount(), 1);
});

test('H06 consumed approval cannot authorize another key after fixture replacement', () => {
  const f = fixture();
  assert.equal(f.run().status, 'EXECUTED');
  f.request.idempotency_key = 'second-delivery';
  f.change((d) => { d.approvals['approval-1'].idempotency_key = 'second-delivery'; });
  const c = f.allow();
  assert.equal(c.status, 'DENIED');
  assert.equal(c.reason_code, 'APPROVAL_CONSUMED');
  assert.equal(f.adapter.callCount(), 1);
});

for (const [mode, status, state, count] of [
  ['SUCCESS', 'EXECUTED', 'APPLIED', 1], ['REJECT_BEFORE_EFFECT', 'FAILED', 'NONE', 0],
  ['PARTIAL', 'COMPENSATION_REQUIRED', 'PARTIAL', 1], ['TIMEOUT_AFTER_ACCEPT', 'COMPENSATION_REQUIRED', 'UNKNOWN', 1],
]) test(`H07 ${mode} yields ${status}; duplicate never retries adapter`, () => {
  const f = fixture({ mode });
  const c = f.allow();
  const first = f.proof.applicationService.execute(c.permit, f.request);
  assert.equal(first.status, status);
  assert.equal(first.effect_state, state);
  assert.equal(f.proof.listEffects().length, count);
  assert.equal(f.proof.applicationService.execute(c.permit, f.request).status, status);
  assert.equal(f.proof.bos.evaluate(f.request).status, status);
  assert.equal(f.adapter.callCount(), 1);
});

test('H07 after-accept exception produces UNKNOWN without hostile metadata', () => {
  const f = fixture({ afterAccept: () => { throw new Proxy({}, { get() { throw new Error('SECRET_EXCEPTION'); } }); } });
  const result = f.run();
  assert.equal(result.status, 'COMPENSATION_REQUIRED');
  assert.equal(result.effect_state, 'UNKNOWN');
  assert.equal(JSON.stringify(f.proof.listSecondaryAudit()).includes('SECRET_EXCEPTION'), false);
});

for (const mode of ['SUCCESS', 'PARTIAL', 'TIMEOUT_AFTER_ACCEPT']) test(`H07 terminal audit failure after ${mode} preserves compensation evidence`, () => {
  const f = fixture({ mode, failAt: ['RESULT'] });
  const c = f.allow();
  const result = f.proof.applicationService.execute(c.permit, f.request);
  assert.equal(result.status, 'COMPENSATION_REQUIRED');
  assert.equal(result.reason_code, 'POST_EFFECT_AUDIT_FAILED');
  assert.equal(result.compensation_required, true);
  assert.equal(f.proof.listEffects().length, 1);
  assert.ok(f.proof.listSecondaryAudit().filter((r) => r.effect_id === result.effect_id).length >= 2);
  assert.equal(f.proof.applicationService.execute(c.permit, f.request).status, 'COMPENSATION_REQUIRED');
  assert.equal(f.adapter.callCount(), 1);
});

const hostile = {
  'getter': () => Object.defineProperty({}, 'action_id', { enumerable: true, get() { throw new Error('SECRET_GETTER'); } }),
  'proxy': () => new Proxy({}, { ownKeys() { throw new Error('SECRET_PROXY'); }, get() { throw new Error('SECRET_PROXY'); } }),
  'revoked Proxy': () => { const p = Proxy.revocable({}, {}); p.revoke(); return p.proxy; },
  'cycle': () => { const x = {}; x.payload = x; return x; },
  'custom prototype': () => Object.create({ action_id: 'SECRET_PROTOTYPE' }),
  'symbol': () => ({ [Symbol('SECRET_SYMBOL')]: 'SECRET' }),
};
for (const [label, make] of Object.entries(hostile)) for (const boundary of ['control', 'execution']) {
  test(`H08 ${label} at ${boundary} never escapes or controls audit metadata`, () => {
    const f = fixture();
    const c = boundary === 'execution' ? f.allow() : null;
    let result;
    assert.doesNotThrow(() => { result = c ? f.proof.applicationService.execute(c.permit, make()) : f.proof.bos.evaluate(make()); });
    zero(f, result);
    assert.match(result.correlation_id, /^handoff-invalid-/);
    assert.equal(JSON.stringify([...f.audit.listRecords(), ...f.proof.listSecondaryAudit()]).includes('SECRET'), false);
  });
}

function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
}
function checkChain(records) {
  let previous = '0'.repeat(64);
  for (const [i, record] of records.entries()) {
    const { audit_sha256, ...body } = record;
    assert.equal(body.previous_audit_sha256, previous);
    assert.equal(body.sequence, i + 1);
    assert.equal(createHash('sha256').update(stable(body)).digest('hex'), audit_sha256);
    previous = audit_sha256;
  }
}

test('H08 primary and secondary correlation, digests, immutable views and hash chains', () => {
  const f = fixture();
  f.request.payload.note = 'SECRET_PAYLOAD_SENTINEL';
  f.request.payload_sha256 = payloadSha256(f.request.payload);
  f.change((d) => { d.approvals['approval-1'].payload_sha256 = f.request.payload_sha256; });
  const c = f.allow();
  assert.equal(f.proof.applicationService.execute(c.permit, f.request).status, 'EXECUTED');
  f.proof.applicationService.execute(c.permit, f.request);
  for (const records of [f.audit.listRecords(), f.proof.listSecondaryAudit()]) {
    checkChain(records);
    assert.ok(records.every((r) => r.correlation_id === f.request.correlation_id));
    assert.equal(JSON.stringify(records).includes('SECRET_PAYLOAD_SENTINEL'), false);
  }
  const view = f.proof.listEffects(); view.length = 0;
  assert.equal(f.proof.listEffects().length, 1);
  const auditView = f.audit.listRecords(); auditView[0].reason_code = 'TAMPER';
  assert.notEqual(f.audit.listRecords()[0].reason_code, 'TAMPER');
});

test('H08 dependencies cannot be rebound to reset private idempotency or approval state', () => {
  const f = fixture();
  assert.throws(() => createPreEffectHandoffProof({ registry: f.registry, authority: f.authority,
    audit: f.audit, domain: f.domain, adapter: f.adapter }), TypeError);
});
