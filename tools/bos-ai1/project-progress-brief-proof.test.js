'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createProjectProgressBriefProof,
  calculatePayloadSha256,
  REG4_BASELINE,
  AGENT_CONTRACT,
  DECISIONS,
  REASON_CODES,
} = require('./project-progress-brief-proof');
const {
  createAgentRegistry,
  calculatePackageSha256,
  STATUSES,
  ACTOR_ROLES,
} = require('../reg4/agent-registry');

const NOW = '2026-09-02T03:00:00.000Z';
const FUTURE = '2026-09-03T03:00:00.000Z';
const PAST = '2026-09-01T03:00:00.000Z';
const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

function agentContent({ evidence = true } = {}) {
  return {
    agent_id: AGENT_CONTRACT.agent_id,
    name: 'BOS AI1 Project Progress Brief Proof',
    version: AGENT_CONTRACT.version,
    created_by: 'builder.agent',
    permissions: ['project.progress.read', 'project.status_update.draft', 'project.status_update.publish'],
    required_tools: ['project.get_progress_summary', 'project.create_status_update_draft'],
    prohibited_actions: ['critical_write', 'limited_write', 'production.deploy', 'runtime.execute'],
    evidence_references: evidence ? [
      { evidence_id: 'builder-tests', evidence_type: 'AUTOMATED_TEST', result: 'PASS', sha256: SHA_A },
      { evidence_id: 'independent-review', evidence_type: 'INDEPENDENT_REVIEW', result: 'PASS', sha256: SHA_B },
    ] : [],
  };
}

function makeRegistry(status = STATUSES.APPROVED, options = {}) {
  const registry = createAgentRegistry({ now: () => NOW });
  const content = agentContent(options);
  const record = registry.registerAgentPackage(
    { ...content, package_sha256: calculatePackageSha256(content) },
    { actor_id: 'builder.agent', role: ACTOR_ROLES.AUTHOR },
  );
  if (status !== STATUSES.DRAFT) {
    registry.transitionApproval(
      { agent_id: content.agent_id, version: content.version, to_status: STATUSES.IN_REVIEW },
      { actor_id: 'reviewer.agent', role: ACTOR_ROLES.REVIEWER },
    );
  }
  if (status === STATUSES.APPROVED) {
    registry.transitionApproval(
      { agent_id: content.agent_id, version: content.version, to_status: STATUSES.APPROVED },
      { actor_id: 'approver.agent', role: ACTOR_ROLES.APPROVER },
    );
  } else if (status === STATUSES.BLOCKED) {
    registry.transitionApproval(
      { agent_id: content.agent_id, version: content.version, to_status: STATUSES.BLOCKED },
      { actor_id: 'reviewer.agent', role: ACTOR_ROLES.REVIEWER },
    );
  } else if (status === STATUSES.RETIRED) {
    registry.transitionApproval(
      { agent_id: content.agent_id, version: content.version, to_status: STATUSES.RETIRED },
      { actor_id: 'registry.admin', role: ACTOR_ROLES.REGISTRY_ADMIN },
    );
  }
  return { registry, content, sha256: record.package_sha256 };
}

function makeFixtures() {
  const allPermissions = ['project.progress.read', 'project.status_update.draft', 'project.status_update.publish'];
  const identities = {
    requester: { identity_id: 'requester', company_id: 'company-a', role: 'PROJECT_MANAGER', permissions: [...allPermissions], active: true },
    executor: {
      identity_id: 'executor', company_id: 'company-a', role: 'AGENT_EXECUTOR', permissions: [...allPermissions], active: true,
      agent_id: AGENT_CONTRACT.agent_id, agent_version: AGENT_CONTRACT.version, package_sha256: null,
    },
    principal: { identity_id: 'principal', company_id: 'company-a', role: 'PROJECT_OWNER', permissions: [...allPermissions], active: true },
    approver: { identity_id: 'approver', company_id: 'company-a', role: 'APPROVER', permissions: [...allPermissions], active: true },
  };
  const task = {
    task_id: 'task-1', version: '1', company_id: 'company-a', requester_id: 'requester',
    executor_id: 'executor', on_behalf_of: 'principal', permissions: [...allPermissions],
    resource_type: 'project', resource_id: 'project-1',
    allowed_tools: ['project.get_progress_summary', 'project.create_status_update_draft'],
    allowed_actions: ['project.progress.read', 'project.status_update.draft', 'project.status_update.publish'],
    expires_at: FUTURE, active: true,
  };
  const delegation = {
    delegation_id: 'delegation-1', version: '1', company_id: 'company-a', delegator_id: 'principal',
    delegate_id: 'executor', permissions: [...allPermissions], expires_at: FUTURE, revoked: false,
    resource_type: 'project', resource_id: 'project-1',
    allowed_tools: ['project.get_progress_summary', 'project.create_status_update_draft'],
    allowed_actions: ['project.progress.read', 'project.status_update.draft', 'project.status_update.publish'],
  };
  const project = {
    resource_type: 'project', resource_id: 'project-1', version: '7', company_id: 'company-a',
    fields: { name: 'Synthetic project', progress_percent: 42, status: 'ON_TRACK', internal_secret: 'never-disclose', milestone: 'M1' },
    permissions_by_principal: { principal: [...allPermissions] },
  };
  const policy = {
    company_id: 'company-a',
    allowed_tools: ['project.get_progress_summary', 'project.create_status_update_draft'],
    allowed_actions: ['project.progress.read', 'project.status_update.draft', 'project.status_update.publish'],
    prohibited_actions: [],
    role_permissions: { PROJECT_MANAGER: [...allPermissions] },
    read_fields: ['name', 'progress_percent', 'status'],
  };
  const approvals = {
    'approval-1': {
      approval_id: 'approval-1', status: 'ACTIVE', company_id: 'company-a', requester_id: 'requester',
      executor_id: 'executor', on_behalf_of: 'principal', approver_id: 'approver',
      action: 'project.status_update.publish', resource_type: 'project', resource_id: 'project-1',
      resource_version: '7', expires_at: FUTURE,
      agent_id: AGENT_CONTRACT.agent_id, agent_version: AGENT_CONTRACT.version, package_sha256: null,
      task_id: 'task-1', task_version: '1', delegation_id: 'delegation-1', delegation_version: '1',
      tool_name: 'project.create_status_update_draft', tool_contract_version: '1.0.0', payload_sha256: null,
    },
  };
  return {
    identities, task, delegation, project, policy, approvals,
    resolvers: {
      getIdentity: (id) => identities[id] || null,
      getTask: (id) => id === task.task_id ? task : null,
      getDelegation: (id) => id === delegation.delegation_id ? delegation : null,
      getProject: (type, id) => type === project.resource_type && id === project.resource_id ? project : null,
      getPolicy: (companyId) => companyId === policy.company_id ? policy : null,
      getApproval: (id) => approvals[id] || null,
    },
  };
}

let requestSequence = 0;
function makeRequest(sha256, operation = 'READ', overrides = {}) {
  requestSequence += 1;
  const payload = operation === 'READ' ? { include: 'current' } : { status: 'ON_TRACK', note: 'Synthetic status update' };
  const tool = operation === 'READ' ? {
    tool_name: 'project.get_progress_summary', tool_contract_version: '1.0.0', action: 'project.progress.read',
  } : operation === 'DRAFT' ? {
    tool_name: 'project.create_status_update_draft', tool_contract_version: '1.0.0', action: 'project.status_update.draft',
  } : {
    tool_name: 'project.create_status_update_draft', tool_contract_version: '1.0.0', action: 'project.status_update.publish',
  };
  const request = {
    request_id: `request-${requestSequence}`,
    idempotency_key: `idempotency-${requestSequence}`,
    correlation_id: `caller-correlation-${requestSequence}`,
    requested_operation: operation,
    agent_id: AGENT_CONTRACT.agent_id,
    agent_version: AGENT_CONTRACT.version,
    package_sha256: sha256,
    reg4_baseline_commit: REG4_BASELINE.commit,
    reg4_baseline_tree: REG4_BASELINE.tree,
    requester_id: 'requester', executor_id: 'executor', on_behalf_of: 'principal', approver_id: 'approver',
    company_id: 'company-a', task_id: 'task-1', task_version: '1', delegation_id: 'delegation-1', delegation_version: '1',
    resource_type: 'project', resource_id: 'project-1', resource_version: '7',
    ...tool,
    payload,
    payload_sha256: calculatePayloadSha256(payload),
    ...overrides,
  };
  if (Object.hasOwn(overrides, 'payload') && !Object.hasOwn(overrides, 'payload_sha256')) {
    request.payload_sha256 = calculatePayloadSha256(request.payload);
  }
  return request;
}

function setup({ status = STATUSES.APPROVED, evidence = true, registryOverride, hook } = {}) {
  const reg = makeRegistry(status, { evidence });
  const fixtures = makeFixtures();
  const registry = registryOverride ? registryOverride(reg.registry) : reg.registry;
  fixtures.identities.executor.package_sha256 = reg.sha256;
  fixtures.approvals['approval-1'].package_sha256 = reg.sha256;
  const proof = createProjectProgressBriefProof({
    registry,
    now: () => NOW,
    resolvers: fixtures.resolvers,
    beforeFinalRevalidation: hook || (() => {}),
  });
  return { ...reg, fixtures, proof };
}

function assertNoEffect(proof) {
  assert.equal(proof.listDrafts().length, 0);
  assert.equal(proof.listAuditRecords().at(-1).effect, 'NONE');
}

test('E01 valid Agent tuple passes eligibility', () => {
  const { proof, sha256 } = setup();
  assert.equal(proof.invoke(makeRequest(sha256)).decision, DECISIONS.ALLOW);
});

test('E02 unknown Agent ID is denied', () => {
  const { proof, sha256 } = setup();
  const result = proof.invoke(makeRequest(sha256, 'READ', { agent_id: 'unknown.agent' }));
  assert.deepEqual([result.decision, result.reason_code], [DECISIONS.DENY, REASON_CODES.AGENT_NOT_REGISTERED]);
  assertNoEffect(proof);
});

test('E03 wrong Agent version is denied', () => {
  const { proof, sha256 } = setup();
  const result = proof.invoke(makeRequest(sha256, 'READ', { agent_version: '2.0.0' }));
  assert.deepEqual([result.decision, result.reason_code], [DECISIONS.DENY, REASON_CODES.AGENT_VERSION_MISMATCH]);
});

test('E04 wrong package SHA-256 is denied', () => {
  const { proof } = setup();
  const result = proof.invoke(makeRequest('f'.repeat(64)));
  assert.equal(result.reason_code, REASON_CODES.PACKAGE_FINGERPRINT_MISMATCH);
  assertNoEffect(proof);
});

test('E05 changed package content under old version is denied', () => {
  const { proof, sha256 } = setup({ registryOverride: (registry) => ({
    getAgentPackage: (...args) => {
      const record = registry.getAgentPackage(...args);
      return record ? { ...record, name: 'Altered attacker content' } : null;
    },
  }) });
  const result = proof.invoke(makeRequest(sha256));
  assert.equal(result.reason_code, REASON_CODES.PACKAGE_FINGERPRINT_MISMATCH);
  assertNoEffect(proof);
});

test('E06 BLOCKED Agent is denied', () => {
  const { proof, sha256 } = setup({ status: STATUSES.BLOCKED });
  assert.equal(proof.invoke(makeRequest(sha256)).reason_code, REASON_CODES.AGENT_BLOCKED);
  assertNoEffect(proof);
});

test('E07 RETIRED Agent is denied', () => {
  const { proof, sha256 } = setup({ status: STATUSES.RETIRED });
  assert.equal(proof.invoke(makeRequest(sha256)).reason_code, REASON_CODES.AGENT_RETIRED);
  assertNoEffect(proof);
});

test('E08 missing mandatory REG4 evidence references is denied without unsupported freshness claims', () => {
  const { proof, sha256 } = setup({ status: STATUSES.IN_REVIEW, evidence: false });
  assert.equal(proof.invoke(makeRequest(sha256)).reason_code, REASON_CODES.REQUIRED_EVIDENCE_MISSING);
  assertNoEffect(proof);
});

test('E09 final REG4 revalidation denies a lifecycle change before effect', () => {
  const reg = makeRegistry();
  const fixtures = makeFixtures();
  fixtures.identities.executor.package_sha256 = reg.sha256;
  let changed = false;
  const proof = createProjectProgressBriefProof({
    registry: reg.registry, now: () => NOW, resolvers: fixtures.resolvers,
    beforeFinalRevalidation: () => {
      if (!changed) {
        changed = true;
        reg.registry.transitionApproval(
          { agent_id: AGENT_CONTRACT.agent_id, version: AGENT_CONTRACT.version, to_status: STATUSES.RETIRED },
          { actor_id: 'registry.admin', role: ACTOR_ROLES.REGISTRY_ADMIN },
        );
      }
    },
  });
  assert.equal(proof.invoke(makeRequest(reg.sha256, 'DRAFT')).reason_code, REASON_CODES.AGENT_RETIRED);
  assertNoEffect(proof);
});

test('C01 requester executor represented principal and approver are stored separately', () => {
  const { proof, sha256 } = setup();
  proof.invoke(makeRequest(sha256));
  const record = proof.listAuditRecords()[0];
  assert.deepEqual([record.requester_id, record.executor_id, record.on_behalf_of, record.approver_id],
    ['requester', 'executor', 'principal', 'approver']);
});

test('C02 forged company ID is denied', () => {
  const { proof, sha256 } = setup();
  assert.equal(proof.invoke(makeRequest(sha256, 'READ', { company_id: 'company-b' })).reason_code, REASON_CODES.COMPANY_CONTEXT_DENIED);
  assertNoEffect(proof);
});

test('C03 cross-company resource is denied with zero data disclosure', () => {
  const { proof, sha256, fixtures } = setup();
  fixtures.project.company_id = 'company-b';
  const result = proof.invoke(makeRequest(sha256));
  assert.equal(result.reason_code, REASON_CODES.RESOURCE_SCOPE_DENIED);
  assert.equal(JSON.stringify(result).includes('never-disclose'), false);
  assertNoEffect(proof);
});

test('C04 forged higher role is denied', () => {
  const { proof, sha256, fixtures } = setup();
  assert.equal(proof.invoke(makeRequest(sha256, 'READ', { claimed_role: 'FOUNDER' })).reason_code, REASON_CODES.FORGED_AUTHORITY);
  fixtures.identities.executor.agent_version = '9.9.9';
  assert.equal(proof.invoke(makeRequest(sha256)).reason_code, REASON_CODES.FORGED_AUTHORITY);
});

test('C05 forged nonexistent permission is denied', () => {
  const { proof, sha256 } = setup();
  assert.equal(proof.invoke(makeRequest(sha256, 'READ', { claimed_permissions: ['system.root'] })).reason_code, REASON_CODES.FORGED_AUTHORITY);
});

test('C06 expired task is denied', () => {
  const { proof, sha256, fixtures } = setup();
  fixtures.task.expires_at = PAST;
  assert.equal(proof.invoke(makeRequest(sha256)).reason_code, REASON_CODES.TASK_INVALID);
  assertNoEffect(proof);
});

test('C07 revoked delegation is denied', () => {
  const { proof, sha256, fixtures } = setup();
  fixtures.delegation.revoked = true;
  assert.equal(proof.invoke(makeRequest(sha256)).reason_code, REASON_CODES.DELEGATION_INVALID);
});

test('C08 represented principal without underlying permission is denied', () => {
  const { proof, sha256, fixtures } = setup();
  fixtures.identities.principal.permissions = ['project.status_update.draft', 'project.status_update.publish'];
  assert.equal(proof.invoke(makeRequest(sha256)).reason_code, REASON_CODES.REPRESENTED_PRINCIPAL_DENIED);
  assertNoEffect(proof);
});

test('C09 effective company context is immutable within the call', () => {
  const reg = makeRegistry();
  const fixtures = makeFixtures();
  fixtures.identities.executor.package_sha256 = reg.sha256;
  const proof = createProjectProgressBriefProof({
    registry: reg.registry, now: () => NOW, resolvers: fixtures.resolvers,
    beforeFinalRevalidation: () => fixtures.policy.read_fields.push('milestone'),
  });
  assert.equal(proof.invoke(makeRequest(reg.sha256)).reason_code, REASON_CODES.CONTEXT_CHANGED);
  assertNoEffect(proof);
});

test('A01 Publish without approval stops with zero publish effect', () => {
  const { proof, sha256 } = setup();
  const result = proof.invoke(makeRequest(sha256, 'PUBLISH'));
  assert.deepEqual([result.decision, result.reason_code], [DECISIONS.STOP, REASON_CODES.APPROVAL_REQUIRED]);
  assertNoEffect(proof);
});

test('A02 expired approval stops with zero effect', () => {
  const { proof, sha256, fixtures } = setup();
  fixtures.approvals['approval-1'].expires_at = PAST;
  const request = makeRequest(sha256, 'PUBLISH', { approval_id: 'approval-1' });
  fixtures.approvals['approval-1'].payload_sha256 = request.payload_sha256;
  const result = proof.invoke(request);
  assert.deepEqual([result.decision, result.reason_code], [DECISIONS.STOP, REASON_CODES.APPROVAL_EXPIRED]);
  assertNoEffect(proof);
});

test('A03 revoked approval is denied with zero effect', () => {
  const { proof, sha256, fixtures } = setup();
  fixtures.approvals['approval-1'].status = 'REVOKED';
  const request = makeRequest(sha256, 'PUBLISH', { approval_id: 'approval-1' });
  fixtures.approvals['approval-1'].payload_sha256 = request.payload_sha256;
  assert.equal(proof.invoke(request).reason_code, REASON_CODES.APPROVAL_REVOKED);
  assertNoEffect(proof);
});

test('A04 consumed approval cannot be reused', () => {
  const { proof, sha256, fixtures } = setup();
  fixtures.approvals['approval-1'].status = 'CONSUMED';
  const request = makeRequest(sha256, 'PUBLISH', { approval_id: 'approval-1' });
  fixtures.approvals['approval-1'].payload_sha256 = request.payload_sha256;
  assert.equal(proof.invoke(request).reason_code, REASON_CODES.APPROVAL_REPLAYED);
  assertNoEffect(proof);
});

test('A05 approval bound to action A cannot authorize action B', () => {
  const { proof, sha256, fixtures } = setup();
  fixtures.approvals['approval-1'].action = 'project.progress.read';
  const request = makeRequest(sha256, 'PUBLISH', { approval_id: 'approval-1' });
  fixtures.approvals['approval-1'].payload_sha256 = request.payload_sha256;
  assert.equal(proof.invoke(request).reason_code, REASON_CODES.APPROVAL_ACTION_MISMATCH);
  const second = setup();
  const secondRequest = makeRequest(second.sha256, 'PUBLISH', { approval_id: 'approval-1' });
  second.fixtures.approvals['approval-1'].payload_sha256 = secondRequest.payload_sha256;
  second.fixtures.approvals['approval-1'].task_version = '99';
  assert.equal(second.proof.invoke(secondRequest).reason_code, REASON_CODES.APPROVAL_ACTION_MISMATCH);
});

test('A06 approval bound to stale resource version stops', () => {
  const { proof, sha256, fixtures } = setup();
  fixtures.approvals['approval-1'].resource_version = '6';
  const request = makeRequest(sha256, 'PUBLISH', { approval_id: 'approval-1' });
  fixtures.approvals['approval-1'].payload_sha256 = request.payload_sha256;
  const result = proof.invoke(request);
  assert.deepEqual([result.decision, result.reason_code], [DECISIONS.STOP, REASON_CODES.APPROVAL_RESOURCE_STALE]);
  assertNoEffect(proof);
});

test('A07 approval does not create a missing permission', () => {
  const { proof, sha256, fixtures } = setup();
  fixtures.identities.requester.permissions = ['project.progress.read', 'project.status_update.draft'];
  const request = makeRequest(sha256, 'PUBLISH', { approval_id: 'approval-1' });
  fixtures.approvals['approval-1'].payload_sha256 = request.payload_sha256;
  assert.equal(proof.invoke(request).reason_code, REASON_CODES.PERMISSION_DENIED);
  assertNoEffect(proof);
});

test('T01 authorized READ returns only scoped fields', () => {
  const { proof, sha256 } = setup();
  const result = proof.invoke(makeRequest(sha256));
  assert.deepEqual(Object.keys(result.result.summary.fields).sort(), ['name', 'progress_percent', 'status']);
  assert.equal(JSON.stringify(result).includes('never-disclose'), false);
});

test('T02 DRAFT is visibly non-canonical', () => {
  const { proof, sha256 } = setup();
  const draft = proof.invoke(makeRequest(sha256, 'DRAFT')).result.draft;
  assert.deepEqual([draft.status, draft.is_canonical, draft.publish_capability], ['DRAFT_ONLY', false, false]);
  assert.throws(() => { draft.content.note = 'caller mutation attempt'; }, TypeError);
  assert.equal(proof.listDrafts()[0].content.note, 'Synthetic status update');
});

test('T03 DRAFT cannot transition to Publish', () => {
  const { proof, sha256, fixtures } = setup();
  const request = makeRequest(sha256, 'PUBLISH', { approval_id: 'approval-1' });
  fixtures.approvals['approval-1'].payload_sha256 = request.payload_sha256;
  const result = proof.invoke(request);
  assert.deepEqual([result.decision, result.reason_code], [DECISIONS.STOP, REASON_CODES.FOUNDER_DECISION_REQUIRED]);
  assertNoEffect(proof);
});

test('T04 same idempotency key and same digest returns the same draft', () => {
  const { proof, sha256 } = setup();
  const firstRequest = makeRequest(sha256, 'DRAFT');
  const first = proof.invoke(firstRequest);
  const second = proof.invoke({ ...firstRequest, request_id: 'request-retry', correlation_id: 'caller-correlation-retry' });
  assert.equal(second.reason_code, REASON_CODES.DUPLICATE_REQUEST);
  assert.equal(second.result.draft.draft_id, first.result.draft.draft_id);
});

test('T05 same idempotency key with different digest is denied as conflict', () => {
  const { proof, sha256 } = setup();
  const first = makeRequest(sha256, 'DRAFT');
  proof.invoke(first);
  const payload = { status: 'AT_RISK', note: 'Different synthetic update' };
  const result = proof.invoke({ ...first, request_id: 'request-conflict', correlation_id: 'caller-conflict', payload, payload_sha256: calculatePayloadSha256(payload) });
  assert.equal(result.reason_code, REASON_CODES.IDEMPOTENCY_CONFLICT);
  assert.equal(proof.listDrafts().length, 1);
});

test('T06 two deliveries create exactly one draft', () => {
  const { proof, sha256 } = setup();
  const request = makeRequest(sha256, 'DRAFT');
  proof.invoke(request);
  proof.invoke({ ...request, request_id: 'request-delivery-2', correlation_id: 'delivery-2' });
  assert.equal(proof.listDrafts().length, 1);
  assert.equal(proof.listAuditRecords().length, 2);
});

test('L01 every ALLOW DENY STOP and duplicate result has one linked ledger record', () => {
  const { proof, sha256 } = setup();
  const draftRequest = makeRequest(sha256, 'DRAFT');
  proof.invoke(makeRequest(sha256));
  proof.invoke(makeRequest(sha256, 'READ', { company_id: 'company-b' }));
  proof.invoke(makeRequest(sha256, 'PUBLISH'));
  proof.invoke(draftRequest);
  proof.invoke({ ...draftRequest, request_id: 'request-duplicate-ledger', correlation_id: 'duplicate-ledger' });
  const records = proof.listAuditRecords();
  assert.equal(records.length, 5);
  records.forEach((record, index) => {
    assert.equal(record.sequence, index + 1);
    assert.match(record.audit_sha256, /^[0-9a-f]{64}$/);
    assert.equal(record.previous_audit_sha256, index === 0 ? '0'.repeat(64) : records[index - 1].audit_sha256);
  });
});

test('L02 unavailable or ambiguous dependency fails closed', () => {
  const { proof, sha256 } = setup();
  const original = proof;
  const reg = makeRegistry();
  const fixtures = makeFixtures();
  fixtures.identities.executor.package_sha256 = reg.sha256;
  fixtures.resolvers.getPolicy = () => { throw new Error('attacker secret stack'); };
  const unavailableProof = createProjectProgressBriefProof({ registry: reg.registry, now: () => NOW, resolvers: fixtures.resolvers });
  const result = unavailableProof.invoke(makeRequest(reg.sha256, 'DRAFT'));
  assert.deepEqual([result.decision, result.reason_code], [DECISIONS.DENY, REASON_CODES.DEPENDENCY_UNAVAILABLE]);
  assertNoEffect(unavailableProof);
  assert.equal(JSON.stringify(unavailableProof.listAuditRecords()).includes('attacker secret stack'), false);
  const invalid = setup();
  invalid.fixtures.task.expires_at = 'not-a-timestamp';
  const invalidResult = invalid.proof.invoke(makeRequest(invalid.sha256));
  assert.deepEqual([invalidResult.decision, invalidResult.reason_code], [DECISIONS.DENY, REASON_CODES.TASK_INVALID]);
  assertNoEffect(invalid.proof);
  assert.ok(original);
  assert.ok(sha256);
});

test('L03 ledger excludes raw credential approval secret payload and external errors', () => {
  const { proof, sha256 } = setup();
  const payload = { note: 'synthetic', password: 'RAW-CREDENTIAL-DO-NOT-LOG', approval_secret: 'RAW-APPROVAL-SECRET' };
  proof.invoke(makeRequest(sha256, 'DRAFT', { payload }));
  const serialized = JSON.stringify(proof.listAuditRecords());
  assert.equal(serialized.includes('RAW-CREDENTIAL-DO-NOT-LOG'), false);
  assert.equal(serialized.includes('RAW-APPROVAL-SECRET'), false);
  assert.equal(serialized.includes('password'), false);
});

test('L04 proof output does not claim durable tamper-proof or production-ready audit', () => {
  const { proof, sha256 } = setup();
  const result = proof.invoke(makeRequest(sha256));
  const serialized = JSON.stringify({ result, ledger: proof.listAuditRecords() }).toLowerCase();
  for (const forbidden of ['durable', 'tamper-proof', 'production-ready']) assert.equal(serialized.includes(forbidden), false);
});

test('L05 rollback and compensation are explicit for READ and DRAFT', () => {
  const { proof, sha256 } = setup();
  proof.invoke(makeRequest(sha256));
  proof.invoke(makeRequest(sha256, 'DRAFT'));
  const [read, draft] = proof.listAuditRecords();
  assert.deepEqual([read.rollback, read.compensation], ['NOT_APPLICABLE', 'NOT_APPLICABLE']);
  assert.deepEqual([draft.rollback, draft.compensation, draft.draft_disposition], ['NOT_REQUIRED', 'EXPIRE_DRAFT', 'COMMITTED_NON_CANONICAL']);
});
