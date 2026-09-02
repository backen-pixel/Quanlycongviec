'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { test } = require('node:test');

const {
  createAgentRegistry,
  calculatePackageSha256,
  STATUSES,
  ACTOR_ROLES,
} = require('../../tools/reg4/agent-registry');

const TEST_SHA = 'a'.repeat(64);
const REVIEW_SHA = 'b'.repeat(64);
const KNOWN_PACKAGE_SHA256 = '4da13dd3ad7e38ea0f4613a29a23c054dc55bd55823f8125f204b30a65974ed6';
const KNOWN_PREIMAGE = '{"schema_version":"reg4-agent-package/v1","agent_id":"qa.registry-agent","name":"QA Registry Agent","version":"7.8.9","created_by":"qa.author","permissions":["registry:read","registry:write"],"required_tools":["node:crypto","node:test"],"prohibited_actions":["network:access","production:write"],"evidence_references":[{"evidence_id":"proof.review","evidence_type":"INDEPENDENT_REVIEW","result":"PASS","sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},{"evidence_id":"proof.test","evidence_type":"AUTOMATED_TEST","result":"PASS","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]}';

function qaClock(start = '2026-09-01T10:00:00.000Z') {
  let value = Date.parse(start);
  return () => {
    const current = new Date(value).toISOString();
    value += 1000;
    return current;
  };
}

function qaEvidence() {
  return [
    {
      evidence_id: 'proof.test',
      evidence_type: 'AUTOMATED_TEST',
      result: 'PASS',
      sha256: TEST_SHA,
    },
    {
      evidence_id: 'proof.review',
      evidence_type: 'INDEPENDENT_REVIEW',
      result: 'PASS',
      sha256: REVIEW_SHA,
    },
  ];
}

function qaContent(overrides = {}) {
  return {
    agent_id: 'qa.registry-agent',
    name: 'QA Registry Agent',
    version: '7.8.9',
    created_by: 'qa.author',
    permissions: ['registry:write', 'registry:read'],
    required_tools: ['node:test', 'node:crypto'],
    prohibited_actions: ['production:write', 'network:access'],
    evidence_references: qaEvidence(),
    ...overrides,
  };
}

function asciiOrder(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function canonicalPreimage(content) {
  const body = {
    schema_version: 'reg4-agent-package/v1',
    agent_id: content.agent_id,
    name: content.name,
    version: content.version,
    created_by: content.created_by,
    permissions: [...content.permissions].sort(asciiOrder),
    required_tools: [...content.required_tools].sort(asciiOrder),
    prohibited_actions: [...content.prohibited_actions].sort(asciiOrder),
    evidence_references: content.evidence_references
      .map((item) => ({
        evidence_id: item.evidence_id,
        evidence_type: item.evidence_type,
        result: item.result,
        sha256: item.sha256,
      }))
      .sort((left, right) => asciiOrder(left.evidence_id, right.evidence_id)),
  };
  return JSON.stringify(body);
}

function sha256Utf8(value) {
  return createHash('sha256').update(Buffer.from(value, 'utf8')).digest('hex');
}

function qaPackageSha256(content) {
  return sha256Utf8(canonicalPreimage(content));
}

function qaRequest(content = qaContent()) {
  return { ...content, package_sha256: qaPackageSha256(content) };
}

function qaActor(actorId, role) {
  return { actor_id: actorId, role };
}

function expectCode(action, expectedCode) {
  assert.throws(action, (error) => {
    assert.equal(error.name, 'RegistryError');
    assert.equal(error.code, expectedCode);
    return true;
  });
}

function qaRegister(registry, content = qaContent()) {
  return registry.registerAgentPackage(
    qaRequest(content),
    qaActor(content.created_by, ACTOR_ROLES.AUTHOR),
  );
}

function qaTransition(registry, content, toStatus, actor) {
  return registry.transitionApproval(
    { agent_id: content.agent_id, version: content.version, to_status: toStatus },
    actor,
  );
}

test('REG4-Q01 independently verifies registration identity, minimum fields, DRAFT and audit', () => {
  const registry = createAgentRegistry({ now: qaClock() });
  const content = qaContent();
  const registered = qaRegister(registry, content);

  assert.deepEqual(Object.keys(registered), [
    'agent_id',
    'name',
    'version',
    'package_sha256',
    'created_by',
    'permissions',
    'required_tools',
    'prohibited_actions',
    'evidence_references',
    'approval_status',
    'timestamps',
  ]);
  assert.deepEqual(Object.keys(registered.timestamps), ['created_at', 'updated_at']);
  assert.equal(registered.agent_id, content.agent_id);
  assert.equal(registered.version, content.version);
  assert.equal(registered.package_sha256, KNOWN_PACKAGE_SHA256);
  assert.equal(registered.created_by, content.created_by);
  assert.equal(registered.approval_status, STATUSES.DRAFT);
  assert.deepEqual(registered.timestamps, {
    created_at: '2026-09-01T10:00:00.000Z',
    updated_at: '2026-09-01T10:00:00.000Z',
  });
  assert.deepEqual(registry.listAuditRecords().map(({ operation, outcome, reason_code, to_status }) => ({
    operation,
    outcome,
    reason_code,
    to_status,
  })), [{ operation: 'REGISTER', outcome: 'ACCEPTED', reason_code: 'REGISTERED', to_status: 'DRAFT' }]);
});

test('REG4-Q02 independently traverses all five states and every legal lifecycle edge', () => {
  const registry = createAgentRegistry({ now: qaClock() });
  const reviewer = qaActor('qa.reviewer', ACTOR_ROLES.REVIEWER);
  const approver = qaActor('qa.approver', ACTOR_ROLES.APPROVER);
  const admin = qaActor('qa.admin', ACTOR_ROLES.REGISTRY_ADMIN);
  const observedStates = new Set([STATUSES.DRAFT]);

  const approved = qaContent({ agent_id: 'qa.path-approved', version: '1.0.0' });
  qaRegister(registry, approved);
  observedStates.add(qaTransition(registry, approved, STATUSES.IN_REVIEW, reviewer).approval_status);
  observedStates.add(qaTransition(registry, approved, STATUSES.APPROVED, approver).approval_status);
  observedStates.add(qaTransition(registry, approved, STATUSES.RETIRED, admin).approval_status);

  const blocked = qaContent({ agent_id: 'qa.path-blocked', version: '1.0.0' });
  qaRegister(registry, blocked);
  qaTransition(registry, blocked, STATUSES.IN_REVIEW, reviewer);
  observedStates.add(qaTransition(registry, blocked, STATUSES.BLOCKED, reviewer).approval_status);
  qaTransition(registry, blocked, STATUSES.RETIRED, admin);

  const draft = qaContent({ agent_id: 'qa.path-draft', version: '1.0.0' });
  qaRegister(registry, draft);
  qaTransition(registry, draft, STATUSES.RETIRED, admin);

  const reviewed = qaContent({ agent_id: 'qa.path-reviewed', version: '1.0.0' });
  qaRegister(registry, reviewed);
  qaTransition(registry, reviewed, STATUSES.IN_REVIEW, reviewer);
  qaTransition(registry, reviewed, STATUSES.RETIRED, admin);

  assert.deepEqual(observedStates, new Set(Object.values(STATUSES)));
  const acceptedEdges = registry.listAuditRecords()
    .filter((record) => record.operation === 'TRANSITION' && record.outcome === 'ACCEPTED')
    .map((record) => `${record.from_status}->${record.to_status}`);
  assert.deepEqual(new Set(acceptedEdges), new Set([
    'DRAFT->IN_REVIEW',
    'DRAFT->RETIRED',
    'IN_REVIEW->APPROVED',
    'IN_REVIEW->BLOCKED',
    'IN_REVIEW->RETIRED',
    'BLOCKED->RETIRED',
    'APPROVED->RETIRED',
  ]));
});

test('REG4-Q03 independently denies approval by the creator and by the Agent identity', () => {
  const registry = createAgentRegistry({ now: qaClock() });
  const reviewer = qaActor('qa.reviewer', ACTOR_ROLES.REVIEWER);
  const creatorCase = qaContent({
    agent_id: 'qa.self-creator',
    version: '1.0.0',
    created_by: 'qa.creator',
  });
  const agentCase = qaContent({
    agent_id: 'qa.self-agent',
    version: '2.0.0',
    created_by: 'qa.other-author',
  });

  for (const content of [creatorCase, agentCase]) {
    qaRegister(registry, content);
    qaTransition(registry, content, STATUSES.IN_REVIEW, reviewer);
  }
  expectCode(
    () => qaTransition(registry, creatorCase, STATUSES.APPROVED, qaActor('qa.creator', ACTOR_ROLES.APPROVER)),
    'SELF_APPROVAL_DENIED',
  );
  expectCode(
    () => qaTransition(registry, agentCase, STATUSES.APPROVED, qaActor('qa.self-agent', ACTOR_ROLES.APPROVER)),
    'SELF_APPROVAL_DENIED',
  );

  assert.equal(registry.getAgentPackage(creatorCase.agent_id, creatorCase.version).approval_status, 'IN_REVIEW');
  assert.equal(registry.getAgentPackage(agentCase.agent_id, agentCase.version).approval_status, 'IN_REVIEW');
  assert.deepEqual(
    registry.listAuditRecords().filter((record) => record.reason_code === 'SELF_APPROVAL_DENIED')
      .map((record) => record.outcome),
    ['REJECTED', 'REJECTED'],
  );
});

test('REG4-Q04 independently proves same-version duplicate and content replacement rejection', () => {
  const registry = createAgentRegistry({ now: qaClock() });
  const originalContent = qaContent();
  const original = qaRegister(registry, originalContent);

  const reorderedSameContent = qaContent({
    permissions: ['registry:read', 'registry:write'],
    required_tools: ['node:crypto', 'node:test'],
    prohibited_actions: ['network:access', 'production:write'],
    evidence_references: [...qaEvidence()].reverse(),
  });
  expectCode(
    () => registry.registerAgentPackage(qaRequest(reorderedSameContent), qaActor('qa.author', ACTOR_ROLES.AUTHOR)),
    'AGENT_VERSION_ALREADY_REGISTERED',
  );

  const replacement = qaContent({ name: 'QA Registry Agent Replacement' });
  assert.notEqual(qaPackageSha256(replacement), original.package_sha256);
  expectCode(
    () => registry.registerAgentPackage(qaRequest(replacement), qaActor('qa.author', ACTOR_ROLES.AUTHOR)),
    'IMMUTABLE_VERSION_CONFLICT',
  );

  assert.deepEqual(registry.getAgentPackage(original.agent_id, original.version), original);
  assert.deepEqual(registry.listAuditRecords().map((record) => record.reason_code), [
    'REGISTERED',
    'AGENT_VERSION_ALREADY_REGISTERED',
    'IMMUTABLE_VERSION_CONFLICT',
  ]);
});

test('REG4-Q05 independently rejects a syntactically valid mismatched package fingerprint', () => {
  const registry = createAgentRegistry({ now: qaClock() });
  const content = qaContent({ agent_id: 'qa.hash-mismatch', version: '1.0.0' });
  const request = qaRequest(content);
  request.package_sha256 = 'c'.repeat(64);

  expectCode(
    () => registry.registerAgentPackage(request, qaActor(content.created_by, ACTOR_ROLES.AUTHOR)),
    'PACKAGE_SHA256_MISMATCH',
  );
  assert.equal(registry.getAgentPackage(content.agent_id, content.version), null);
  const [audit] = registry.listAuditRecords();
  assert.deepEqual({
    operation: audit.operation,
    outcome: audit.outcome,
    reason_code: audit.reason_code,
    supplied: audit.supplied_package_sha256,
    resolved: audit.resolved_package_sha256,
  }, {
    operation: 'REGISTER',
    outcome: 'REJECTED',
    reason_code: 'PACKAGE_SHA256_MISMATCH',
    supplied: 'c'.repeat(64),
    resolved: null,
  });
});

test('REG4-Q06 independently blocks approval unless both mandatory PASS evidence types exist', () => {
  const registry = createAgentRegistry({ now: qaClock() });
  const reviewer = qaActor('qa.reviewer', ACTOR_ROLES.REVIEWER);
  const approver = qaActor('qa.approver', ACTOR_ROLES.APPROVER);
  const automatedPass = qaEvidence().find((item) => item.evidence_type === 'AUTOMATED_TEST');
  const reviewPass = qaEvidence().find((item) => item.evidence_type === 'INDEPENDENT_REVIEW');
  const evidenceCases = [
    [],
    [automatedPass],
    [reviewPass],
    [automatedPass, { ...reviewPass, result: 'FAIL' }],
    [{ ...automatedPass, result: 'FAIL' }, reviewPass],
  ];

  evidenceCases.forEach((evidence, index) => {
    const content = qaContent({
      agent_id: `qa.evidence-${index}`,
      version: '1.0.0',
      evidence_references: evidence,
    });
    qaRegister(registry, content);
    qaTransition(registry, content, STATUSES.IN_REVIEW, reviewer);
    expectCode(
      () => qaTransition(registry, content, STATUSES.APPROVED, approver),
      'REQUIRED_EVIDENCE_MISSING',
    );
    assert.equal(registry.getAgentPackage(content.agent_id, content.version).approval_status, 'IN_REVIEW');
  });

  assert.equal(
    registry.listAuditRecords().filter((record) => record.reason_code === 'REQUIRED_EVIDENCE_MISSING').length,
    evidenceCases.length,
  );
});

test('REG4-Q07 independently rejects every illegal edge and every wrong role on legal edges', () => {
  const allowed = {
    DRAFT: { IN_REVIEW: 'REVIEWER', RETIRED: 'REGISTRY_ADMIN' },
    IN_REVIEW: { APPROVED: 'APPROVER', BLOCKED: 'REVIEWER', RETIRED: 'REGISTRY_ADMIN' },
    BLOCKED: { RETIRED: 'REGISTRY_ADMIN' },
    APPROVED: { RETIRED: 'REGISTRY_ADMIN' },
    RETIRED: {},
  };
  let serial = 0;

  function registryAt(targetStatus) {
    serial += 1;
    const registry = createAgentRegistry({ now: qaClock() });
    const content = qaContent({
      agent_id: `qa.state-${serial}`,
      version: '1.0.0',
      created_by: `qa.author-${serial}`,
    });
    qaRegister(registry, content);
    if ([STATUSES.IN_REVIEW, STATUSES.BLOCKED, STATUSES.APPROVED].includes(targetStatus)) {
      qaTransition(registry, content, STATUSES.IN_REVIEW, qaActor('qa.setup-reviewer', ACTOR_ROLES.REVIEWER));
    }
    if (targetStatus === STATUSES.BLOCKED) {
      qaTransition(registry, content, STATUSES.BLOCKED, qaActor('qa.setup-reviewer', ACTOR_ROLES.REVIEWER));
    }
    if (targetStatus === STATUSES.APPROVED) {
      qaTransition(registry, content, STATUSES.APPROVED, qaActor('qa.setup-approver', ACTOR_ROLES.APPROVER));
    }
    if (targetStatus === STATUSES.RETIRED) {
      qaTransition(registry, content, STATUSES.RETIRED, qaActor('qa.setup-admin', ACTOR_ROLES.REGISTRY_ADMIN));
    }
    return { registry, content };
  }

  for (const fromStatus of Object.values(STATUSES)) {
    for (const toStatus of Object.values(STATUSES)) {
      if (allowed[fromStatus][toStatus]) continue;
      const { registry, content } = registryAt(fromStatus);
      const before = registry.getAgentPackage(content.agent_id, content.version);
      const auditCount = registry.listAuditRecords().length;
      expectCode(
        () => qaTransition(registry, content, toStatus, qaActor('qa.invalid-admin', ACTOR_ROLES.REGISTRY_ADMIN)),
        'INVALID_STATE_TRANSITION',
      );
      assert.deepEqual(registry.getAgentPackage(content.agent_id, content.version), before);
      assert.equal(registry.listAuditRecords().length, auditCount + 1);
    }
  }

  for (const [fromStatus, targetMap] of Object.entries(allowed)) {
    for (const [toStatus, requiredRole] of Object.entries(targetMap)) {
      for (const wrongRole of Object.values(ACTOR_ROLES).filter((role) => role !== requiredRole)) {
        const { registry, content } = registryAt(fromStatus);
        const before = registry.getAgentPackage(content.agent_id, content.version);
        expectCode(
          () => qaTransition(
            registry,
            content,
            toStatus,
            qaActor(`qa.wrong-${wrongRole.toLowerCase()}`, wrongRole),
          ),
          'ACTOR_NOT_AUTHORIZED',
        );
        assert.deepEqual(registry.getAgentPackage(content.agent_id, content.version), before);
      }
    }
  }

  const registry = createAgentRegistry({ now: qaClock() });
  expectCode(
    () => registry.registerAgentPackage(qaRequest(), qaActor('qa.author', ACTOR_ROLES.REVIEWER)),
    'ACTOR_NOT_AUTHORIZED',
  );
  expectCode(
    () => registry.transitionApproval(
      { agent_id: 'qa.missing', version: '1.0.0', to_status: STATUSES.IN_REVIEW },
      qaActor('qa.reviewer', ACTOR_ROLES.REVIEWER),
    ),
    'AGENT_VERSION_NOT_FOUND',
  );
  expectCode(
    () => registry.transitionApproval(
      { agent_id: 'qa.missing', version: '1.0.0', to_status: 'UNKNOWN' },
      qaActor('qa.reviewer', ACTOR_ROLES.REVIEWER),
    ),
    'INVALID_INPUT',
  );
});

test('REG4-Q08 independently recomputes a complete accepted/rejected audit hash chain', () => {
  const registry = createAgentRegistry({ now: qaClock() });
  const content = qaContent();
  const request = qaRequest(content);
  const author = qaActor(content.created_by, ACTOR_ROLES.AUTHOR);

  expectCode(() => registry.registerAgentPackage({}, author), 'INVALID_INPUT');
  registry.registerAgentPackage(request, author);
  expectCode(() => registry.registerAgentPackage(request, author), 'AGENT_VERSION_ALREADY_REGISTERED');
  qaTransition(registry, content, STATUSES.IN_REVIEW, qaActor('qa.reviewer', ACTOR_ROLES.REVIEWER));
  expectCode(
    () => qaTransition(registry, content, STATUSES.APPROVED, qaActor(content.created_by, ACTOR_ROLES.APPROVER)),
    'SELF_APPROVAL_DENIED',
  );
  qaTransition(registry, content, STATUSES.APPROVED, qaActor('qa.approver', ACTOR_ROLES.APPROVER));
  expectCode(
    () => qaTransition(registry, content, STATUSES.APPROVED, qaActor('qa.approver', ACTOR_ROLES.APPROVER)),
    'INVALID_STATE_TRANSITION',
  );

  const records = registry.listAuditRecords();
  assert.equal(records.length, 7);
  assert.deepEqual(records.map((record) => record.reason_code), [
    'INVALID_INPUT',
    'REGISTERED',
    'AGENT_VERSION_ALREADY_REGISTERED',
    'STATE_TRANSITIONED',
    'SELF_APPROVAL_DENIED',
    'STATE_TRANSITIONED',
    'INVALID_STATE_TRANSITION',
  ]);
  assert.deepEqual(records.map((record) => record.sequence), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(records[0].agent_id, null);
  assert.equal(records[0].version, null);

  let previous = '0'.repeat(64);
  records.forEach((record, index) => {
    assert.deepEqual(Object.keys(record), [
      'sequence',
      'audit_id',
      'correlation_id',
      'operation',
      'outcome',
      'reason_code',
      'actor_id',
      'actor_role',
      'agent_id',
      'version',
      'from_status',
      'to_status',
      'supplied_package_sha256',
      'resolved_package_sha256',
      'occurred_at',
      'previous_audit_sha256',
      'audit_sha256',
    ]);
    assert.equal(record.audit_id, `reg4-audit-${String(index + 1).padStart(6, '0')}`);
    assert.equal(record.previous_audit_sha256, previous);
    const independentlyOrderedAuditBody = {
      sequence: record.sequence,
      audit_id: record.audit_id,
      correlation_id: record.correlation_id,
      operation: record.operation,
      outcome: record.outcome,
      reason_code: record.reason_code,
      actor_id: record.actor_id,
      actor_role: record.actor_role,
      agent_id: record.agent_id,
      version: record.version,
      from_status: record.from_status,
      to_status: record.to_status,
      supplied_package_sha256: record.supplied_package_sha256,
      resolved_package_sha256: record.resolved_package_sha256,
      occurred_at: record.occurred_at,
      previous_audit_sha256: record.previous_audit_sha256,
    };
    assert.equal(record.audit_sha256, sha256Utf8(JSON.stringify(independentlyOrderedAuditBody)));
    previous = record.audit_sha256;
  });
});

test('REG4-Q09 independently verifies the canonical known answer, permutations and sensitivity', () => {
  const content = qaContent();
  assert.equal(canonicalPreimage(content), KNOWN_PREIMAGE);
  assert.equal(sha256Utf8(KNOWN_PREIMAGE), KNOWN_PACKAGE_SHA256);
  assert.equal(calculatePackageSha256(content), KNOWN_PACKAGE_SHA256);

  const permutation = qaContent({
    permissions: [...content.permissions].reverse(),
    required_tools: [...content.required_tools].reverse(),
    prohibited_actions: [...content.prohibited_actions].reverse(),
    evidence_references: [...content.evidence_references].reverse(),
  });
  assert.equal(calculatePackageSha256(permutation), KNOWN_PACKAGE_SHA256);
  assert.equal(qaPackageSha256(permutation), KNOWN_PACKAGE_SHA256);

  const variants = [
    qaContent({ agent_id: 'qa.registry-other' }),
    qaContent({ name: 'Other QA Registry Agent' }),
    qaContent({ version: '7.8.10' }),
    qaContent({ created_by: 'qa.other-author' }),
    qaContent({ permissions: ['registry:read'] }),
    qaContent({ required_tools: [] }),
    qaContent({ prohibited_actions: ['network:access'] }),
    qaContent({ evidence_references: [qaEvidence()[0]] }),
  ];
  for (const variant of variants) {
    assert.notEqual(calculatePackageSha256(variant), KNOWN_PACKAGE_SHA256);
    assert.equal(calculatePackageSha256(variant), qaPackageSha256(variant));
  }
});

test('REG4-Q10 independently proves deep-copy isolation for inputs, outputs, reads and audits', () => {
  const registry = createAgentRegistry({ now: qaClock() });
  const content = qaContent();
  const request = qaRequest(content);
  const inputSnapshot = structuredClone(request);
  const returned = registry.registerAgentPackage(request, qaActor(content.created_by, ACTOR_ROLES.AUTHOR));
  assert.deepEqual(request, inputSnapshot);

  request.permissions[0] = 'tampered:input';
  request.evidence_references[0].result = 'FAIL';
  returned.name = 'Tampered return';
  returned.permissions.push('tampered:return');
  returned.evidence_references[0].sha256 = 'f'.repeat(64);
  returned.timestamps.updated_at = '2000-01-01T00:00:00.000Z';

  const firstRead = registry.getAgentPackage(content.agent_id, content.version);
  const beforeReadAuditCount = registry.listAuditRecords().length;
  firstRead.permissions[0] = 'tampered:read';
  firstRead.evidence_references[0].result = 'FAIL';
  firstRead.timestamps.created_at = '2000-01-01T00:00:00.000Z';
  const auditSnapshot = registry.listAuditRecords();
  auditSnapshot[0].reason_code = 'TAMPERED';
  auditSnapshot.push({ fake: true });

  const secondRead = registry.getAgentPackage(content.agent_id, content.version);
  assert.equal(secondRead.name, 'QA Registry Agent');
  assert.deepEqual(secondRead.permissions, ['registry:read', 'registry:write']);
  assert(secondRead.evidence_references.every((item) => item.result === 'PASS'));
  assert.deepEqual(secondRead.timestamps, {
    created_at: '2026-09-01T10:00:00.000Z',
    updated_at: '2026-09-01T10:00:00.000Z',
  });
  assert.equal(registry.listAuditRecords().length, beforeReadAuditCount);
  assert.equal(registry.listAuditRecords()[0].reason_code, 'REGISTERED');
  assert.equal(registry.getAgentPackage('qa.not-found', '1.0.0'), null);
  assert.equal(registry.listAuditRecords().length, beforeReadAuditCount);

  const isolated = createAgentRegistry({ now: qaClock() });
  assert.equal(isolated.getAgentPackage(content.agent_id, content.version), null);
  assert.deepEqual(isolated.listAuditRecords(), []);
});

test('REG4-Q11 independently rejects strict malformed, sparse, Symbol and accessor inputs', () => {
  const registry = createAgentRegistry({ now: qaClock() });
  const author = qaActor('qa.author', ACTOR_ROLES.AUTHOR);
  const malformedRequests = [null, Object.create(null)];

  const missing = qaRequest();
  delete missing.name;
  malformedRequests.push(missing);
  malformedRequests.push({ ...qaRequest(), extra: true });
  malformedRequests.push({ ...qaRequest(), approval_status: STATUSES.DRAFT });

  const hidden = qaRequest();
  Object.defineProperty(hidden, 'hidden', { value: true });
  malformedRequests.push(hidden);
  const symbol = qaRequest();
  symbol[Symbol('metadata')] = true;
  malformedRequests.push(symbol);
  let topAccessorCalled = false;
  const topAccessor = qaRequest();
  Object.defineProperty(topAccessor, 'name', {
    enumerable: true,
    get() {
      topAccessorCalled = true;
      return 'Unsafe';
    },
  });
  malformedRequests.push(topAccessor);

  const sparsePermissions = qaRequest();
  sparsePermissions.permissions = new Array(1);
  malformedRequests.push(sparsePermissions);
  const arrayExtra = qaRequest();
  arrayExtra.permissions.extra = true;
  malformedRequests.push(arrayExtra);
  const arraySymbol = qaRequest();
  arraySymbol.permissions[Symbol('metadata')] = true;
  malformedRequests.push(arraySymbol);
  let arrayAccessorCalled = false;
  const arrayAccessor = qaRequest();
  Object.defineProperty(arrayAccessor.permissions, '0', {
    enumerable: true,
    get() {
      arrayAccessorCalled = true;
      return 'unsafe:permission';
    },
  });
  malformedRequests.push(arrayAccessor);

  const evidenceExtra = qaRequest();
  evidenceExtra.evidence_references[0].extra = true;
  malformedRequests.push(evidenceExtra);
  const evidenceHidden = qaRequest();
  Object.defineProperty(evidenceHidden.evidence_references[0], 'hidden', { value: true });
  malformedRequests.push(evidenceHidden);
  const evidenceSymbol = qaRequest();
  evidenceSymbol.evidence_references[0][Symbol('metadata')] = true;
  malformedRequests.push(evidenceSymbol);
  let evidenceAccessorCalled = false;
  const evidenceAccessor = qaRequest();
  Object.defineProperty(evidenceAccessor.evidence_references[0], 'result', {
    enumerable: true,
    get() {
      evidenceAccessorCalled = true;
      return 'PASS';
    },
  });
  malformedRequests.push(evidenceAccessor);

  const invalidOverrides = [
    { agent_id: 'QA' },
    { agent_id: `q${'a'.repeat(64)}` },
    { name: ' QA Registry Agent' },
    { name: 'e\u0301' },
    { name: 'line\nname' },
    { name: 'x'.repeat(121) },
    { version: '01.0.0' },
    { version: '1.0.0-beta' },
    { created_by: 'qa..author' },
    { permissions: [] },
    { permissions: ['registry:read', 'registry:read'] },
    { permissions: Array.from({ length: 101 }, (_, index) => `scope:${index}`) },
    { required_tools: Array.from({ length: 101 }, (_, index) => `tool:${index}`) },
    { prohibited_actions: [] },
    { evidence_references: [qaEvidence()[0], { ...qaEvidence()[0] }] },
    { evidence_references: Array.from({ length: 101 }, (_, index) => ({
      evidence_id: `proof:${index}`,
      evidence_type: 'AUTOMATED_TEST',
      result: 'PASS',
      sha256: TEST_SHA,
    })) },
  ];
  for (const override of invalidOverrides) {
    const request = qaRequest();
    Object.assign(request, override);
    malformedRequests.push(request);
  }
  const uppercaseHash = qaRequest();
  uppercaseHash.package_sha256 = 'A'.repeat(64);
  malformedRequests.push(uppercaseHash);

  for (const request of malformedRequests) {
    const before = registry.listAuditRecords().length;
    expectCode(() => registry.registerAgentPackage(request, author), 'INVALID_INPUT');
    assert.equal(registry.listAuditRecords().length, before + 1);
    assert.equal(registry.listAuditRecords().at(-1).outcome, 'REJECTED');
  }
  assert.equal(topAccessorCalled, false);
  assert.equal(arrayAccessorCalled, false);
  assert.equal(evidenceAccessorCalled, false);

  let actorAccessorCalled = false;
  const actorAccessor = {};
  Object.defineProperties(actorAccessor, {
    actor_id: {
      enumerable: true,
      get() {
        actorAccessorCalled = true;
        return 'qa.author';
      },
    },
    role: { enumerable: true, value: ACTOR_ROLES.AUTHOR },
  });
  const invalidActors = [
    null,
    { actor_id: 'qa.author' },
    { actor_id: 'qa.author', role: 'ROOT' },
    { actor_id: 'qa..author', role: ACTOR_ROLES.AUTHOR },
    { actor_id: 'qa.author', role: ACTOR_ROLES.AUTHOR, extra: true },
    actorAccessor,
  ];
  for (const invalidActor of invalidActors) {
    const before = registry.listAuditRecords().length;
    expectCode(() => registry.registerAgentPackage(qaRequest(), invalidActor), 'INVALID_ACTOR');
    assert.equal(registry.listAuditRecords().length, before + 1);
  }
  assert.equal(actorAccessorCalled, false);

  const content = qaContent({ agent_id: 'qa.command-shape', version: '1.0.0' });
  qaRegister(registry, content);
  const validCommand = {
    agent_id: content.agent_id,
    version: content.version,
    to_status: STATUSES.IN_REVIEW,
  };
  const commandMissing = { ...validCommand };
  delete commandMissing.to_status;
  const commandSymbol = { ...validCommand };
  commandSymbol[Symbol('metadata')] = true;
  let commandAccessorCalled = false;
  const commandAccessor = { ...validCommand };
  Object.defineProperty(commandAccessor, 'to_status', {
    enumerable: true,
    get() {
      commandAccessorCalled = true;
      return STATUSES.IN_REVIEW;
    },
  });
  const malformedCommands = [
    commandMissing,
    { ...validCommand, extra: true },
    commandSymbol,
    commandAccessor,
    { ...validCommand, reason: '' },
    { ...validCommand, reason: 'x'.repeat(501) },
  ];
  for (const command of malformedCommands) {
    const before = registry.listAuditRecords().length;
    expectCode(
      () => registry.transitionApproval(command, qaActor('qa.reviewer', ACTOR_ROLES.REVIEWER)),
      'INVALID_INPUT',
    );
    assert.equal(registry.listAuditRecords().length, before + 1);
  }
  assert.equal(commandAccessorCalled, false);

  expectCode(() => createAgentRegistry({ now: qaClock(), extra: true }), 'INVALID_INPUT');
  const boundary = qaContent({
    agent_id: `q${'0'.repeat(63)}`,
    name: '\ud83e\udd16'.repeat(120),
    version: '0.0.0',
    permissions: Array.from({ length: 100 }, (_, index) => `scope:${index}`),
    required_tools: Array.from({ length: 100 }, (_, index) => `tool:${index}`),
    prohibited_actions: Array.from({ length: 100 }, (_, index) => `action:${index}`),
    evidence_references: Array.from({ length: 100 }, (_, index) => ({
      evidence_id: `proof:${index}`,
      evidence_type: index % 2 === 0 ? 'AUTOMATED_TEST' : 'INDEPENDENT_REVIEW',
      result: 'PASS',
      sha256: index % 2 === 0 ? TEST_SHA : REVIEW_SHA,
    })),
  });
  assert.equal(calculatePackageSha256(boundary), qaPackageSha256(boundary));
});

test('REG4-Q12 independently verifies deterministic timestamps and rejection non-mutation', () => {
  const times = [
    '2026-09-01T12:00:00.000Z',
    '2026-09-01T12:00:01.000Z',
    '2026-09-01T12:00:02.000Z',
    '2026-09-01T12:00:03.000Z',
    '2026-09-01T12:00:04.000Z',
  ];
  let index = 0;
  const registry = createAgentRegistry({ now: () => times[index++] });
  const content = qaContent({ agent_id: 'qa.timestamps', version: '1.0.0' });
  const initial = qaRegister(registry, content);

  expectCode(
    () => qaTransition(registry, content, STATUSES.APPROVED, qaActor('qa.approver', ACTOR_ROLES.APPROVER)),
    'INVALID_STATE_TRANSITION',
  );
  assert.deepEqual(registry.getAgentPackage(content.agent_id, content.version).timestamps, initial.timestamps);

  const reviewed = qaTransition(
    registry,
    content,
    STATUSES.IN_REVIEW,
    qaActor('qa.reviewer', ACTOR_ROLES.REVIEWER),
  );
  assert.deepEqual(reviewed.timestamps, { created_at: times[0], updated_at: times[2] });

  expectCode(
    () => qaTransition(registry, content, STATUSES.IN_REVIEW, qaActor('qa.reviewer', ACTOR_ROLES.REVIEWER)),
    'INVALID_STATE_TRANSITION',
  );
  assert.deepEqual(registry.getAgentPackage(content.agent_id, content.version).timestamps, reviewed.timestamps);

  const approved = qaTransition(
    registry,
    content,
    STATUSES.APPROVED,
    qaActor('qa.approver', ACTOR_ROLES.APPROVER),
  );
  assert.deepEqual(approved.timestamps, { created_at: times[0], updated_at: times[4] });
  assert.deepEqual(registry.listAuditRecords().map((record) => record.occurred_at), times);
  assert.equal(index, times.length);
});

test('REG4-QP1-01 independently contains hostile registration and transition Proxies', () => {
  const sensitiveMarker = 'QA_RAW_SECRET_CREDENTIAL_CAUSE_ORIGIN_STACK_91F67C';
  const registry = createAgentRegistry({ now: qaClock('2026-09-01T13:00:00.000Z') });
  const registrationContent = qaContent({
    agent_id: 'qa.proxy-registration',
    version: '1.0.0',
  });
  const registrationRequest = qaRequest(registrationContent);
  const author = qaActor(registrationContent.created_by, ACTOR_ROLES.AUTHOR);
  const transitionContent = qaContent({
    agent_id: 'qa.proxy-transition',
    version: '1.0.0',
  });
  qaRegister(registry, transitionContent);
  const transitionSnapshot = registry.getAgentPackage(
    transitionContent.agent_id,
    transitionContent.version,
  );

  function proxyThrowing(target, trapName, thrownValue = new Error(sensitiveMarker)) {
    return new Proxy(target, {
      [trapName]() {
        throw thrownValue;
      },
    });
  }

  function assertNoSensitiveLeak(value) {
    assert.doesNotMatch(value.message, new RegExp(sensitiveMarker));
    assert.doesNotMatch(value.stack, new RegExp(sensitiveMarker));
    assert.doesNotMatch(JSON.stringify(value), new RegExp(sensitiveMarker));
    assert.equal(Object.prototype.hasOwnProperty.call(value, 'cause'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(value, 'origin_stack'), false);
  }

  function captureRejectedAttempt(action, expectation) {
    const beforeCount = registry.listAuditRecords().length;
    let caught;
    try {
      action();
      assert.fail('hostile Proxy-backed mutation must be rejected');
    } catch (error) {
      caught = error;
    }

    assert.equal(caught.name, 'RegistryError');
    assert.equal(caught.code, expectation.code);
    assert.match(caught.correlation_id, /^reg4-correlation-[0-9]{10}$/);
    assertNoSensitiveLeak(caught);

    const records = registry.listAuditRecords();
    assert.equal(records.length, beforeCount + 1);
    const audit = records.at(-1);
    assert.equal(audit.sequence, beforeCount + 1);
    assert.equal(audit.operation, expectation.operation);
    assert.equal(audit.outcome, 'REJECTED');
    assert.equal(audit.reason_code, expectation.code);
    assert.equal(audit.actor_id, expectation.actor_id);
    assert.equal(audit.actor_role, expectation.actor_role);
    assert.equal(audit.correlation_id, caught.correlation_id);
    assert.equal(
      audit.correlation_id,
      `reg4-correlation-${String(audit.sequence).padStart(10, '0')}`,
    );
    assert.match(audit.occurred_at, /^2026-09-01T13:00:[0-9]{2}\.000Z$/);
    assert.doesNotMatch(JSON.stringify(audit), new RegExp(sensitiveMarker));
    assert(Object.values(audit).every((item) =>
      item === null || typeof item === 'string' || typeof item === 'number'));
    return audit;
  }

  const requestTrapExpectations = {
    getPrototypeOf: { actor_id: 'qa.author', actor_role: ACTOR_ROLES.AUTHOR },
    ownKeys: { actor_id: 'qa.author', actor_role: ACTOR_ROLES.AUTHOR },
    getOwnPropertyDescriptor: { actor_id: 'qa.author', actor_role: ACTOR_ROLES.AUTHOR },
  };
  for (const [trapName, safeActor] of Object.entries(requestTrapExpectations)) {
    captureRejectedAttempt(
      () => registry.registerAgentPackage(
        proxyThrowing(registrationRequest, trapName),
        author,
      ),
      { operation: 'REGISTER', code: 'INVALID_INPUT', ...safeActor },
    );
    assert.equal(
      registry.getAgentPackage(registrationContent.agent_id, registrationContent.version),
      null,
    );
  }

  const actorTrapExpectations = {
    getPrototypeOf: { actor_id: null, actor_role: null },
    ownKeys: { actor_id: 'qa.author', actor_role: ACTOR_ROLES.AUTHOR },
    getOwnPropertyDescriptor: { actor_id: null, actor_role: null },
  };
  for (const [trapName, safeActor] of Object.entries(actorTrapExpectations)) {
    captureRejectedAttempt(
      () => registry.registerAgentPackage(
        registrationRequest,
        proxyThrowing(author, trapName),
      ),
      { operation: 'REGISTER', code: 'INVALID_ACTOR', ...safeActor },
    );
    assert.equal(
      registry.getAgentPackage(registrationContent.agent_id, registrationContent.version),
      null,
    );
  }

  const nestedRequest = qaRequest(registrationContent);
  nestedRequest.permissions = proxyThrowing(nestedRequest.permissions, 'ownKeys');
  captureRejectedAttempt(
    () => registry.registerAgentPackage(nestedRequest, author),
    {
      operation: 'REGISTER',
      code: 'INVALID_INPUT',
      actor_id: 'qa.author',
      actor_role: ACTOR_ROLES.AUTHOR,
    },
  );
  assert.equal(
    registry.getAgentPackage(registrationContent.agent_id, registrationContent.version),
    null,
  );

  const thrownProxy = new Proxy(new Error(sensitiveMarker), {
    getPrototypeOf() {
      throw new Error(sensitiveMarker);
    },
    get() {
      throw new Error(sensitiveMarker);
    },
  });
  captureRejectedAttempt(
    () => registry.registerAgentPackage(
      proxyThrowing(registrationRequest, 'ownKeys', thrownProxy),
      author,
    ),
    {
      operation: 'REGISTER',
      code: 'INVALID_INPUT',
      actor_id: 'qa.author',
      actor_role: ACTOR_ROLES.AUTHOR,
    },
  );

  const command = {
    agent_id: transitionContent.agent_id,
    version: transitionContent.version,
    to_status: STATUSES.IN_REVIEW,
  };
  const reviewer = qaActor('qa.proxy-reviewer', ACTOR_ROLES.REVIEWER);
  for (const trapName of ['getPrototypeOf', 'ownKeys', 'getOwnPropertyDescriptor']) {
    captureRejectedAttempt(
      () => registry.transitionApproval(proxyThrowing(command, trapName), reviewer),
      {
        operation: 'TRANSITION',
        code: 'INVALID_INPUT',
        actor_id: reviewer.actor_id,
        actor_role: reviewer.role,
      },
    );
    assert.deepEqual(
      registry.getAgentPackage(transitionContent.agent_id, transitionContent.version),
      transitionSnapshot,
    );
  }

  const transitionActorTrapExpectations = {
    getPrototypeOf: { actor_id: null, actor_role: null },
    ownKeys: { actor_id: reviewer.actor_id, actor_role: reviewer.role },
    getOwnPropertyDescriptor: { actor_id: null, actor_role: null },
  };
  for (const [trapName, safeActor] of Object.entries(transitionActorTrapExpectations)) {
    captureRejectedAttempt(
      () => registry.transitionApproval(command, proxyThrowing(reviewer, trapName)),
      { operation: 'TRANSITION', code: 'INVALID_ACTOR', ...safeActor },
    );
    assert.deepEqual(
      registry.getAgentPackage(transitionContent.agent_id, transitionContent.version),
      transitionSnapshot,
    );
  }

  const poisonRegistry = createAgentRegistry({ now: qaClock() });
  let poisonedRegistryError;
  try {
    poisonRegistry.registerAgentPackage({}, qaActor('qa.author', ACTOR_ROLES.AUTHOR));
  } catch (error) {
    poisonedRegistryError = error;
  }
  poisonedRegistryError.code = 'HOSTILE_UNTRUSTED_CODE';
  poisonedRegistryError.message = sensitiveMarker;
  poisonedRegistryError.stack = sensitiveMarker;
  poisonedRegistryError.cause = sensitiveMarker;
  poisonedRegistryError.origin_stack = sensitiveMarker;

  captureRejectedAttempt(
    () => registry.registerAgentPackage(
      proxyThrowing(registrationRequest, 'ownKeys', poisonedRegistryError),
      author,
    ),
    {
      operation: 'REGISTER',
      code: 'INVALID_INPUT',
      actor_id: 'qa.author',
      actor_role: ACTOR_ROLES.AUTHOR,
    },
  );
  assert.equal(
    registry.getAgentPackage(registrationContent.agent_id, registrationContent.version),
    null,
  );

  const records = registry.listAuditRecords();
  let previousAuditSha256 = '0'.repeat(64);
  for (const record of records) {
    assert.equal(record.previous_audit_sha256, previousAuditSha256);
    const independentBody = {
      sequence: record.sequence,
      audit_id: record.audit_id,
      correlation_id: record.correlation_id,
      operation: record.operation,
      outcome: record.outcome,
      reason_code: record.reason_code,
      actor_id: record.actor_id,
      actor_role: record.actor_role,
      agent_id: record.agent_id,
      version: record.version,
      from_status: record.from_status,
      to_status: record.to_status,
      supplied_package_sha256: record.supplied_package_sha256,
      resolved_package_sha256: record.resolved_package_sha256,
      occurred_at: record.occurred_at,
      previous_audit_sha256: record.previous_audit_sha256,
    };
    assert.equal(record.audit_sha256, sha256Utf8(JSON.stringify(independentBody)));
    previousAuditSha256 = record.audit_sha256;
  }
  assert.deepEqual(
    registry.getAgentPackage(transitionContent.agent_id, transitionContent.version),
    transitionSnapshot,
  );
});

test('REG4-QP1-01 rejects cross-context replay of genuine system reason codes', () => {
  const replayMarker = 'QA_SYSTEM_CODE_REPLAY_SECRET_PAYLOAD_6D20A9';
  const canonicalMessages = {
    INVALID_INPUT: 'input is invalid',
    INVALID_ACTOR: 'actor context is invalid',
  };
  const errorKeys = ['code', 'correlation_id', 'message', 'name', 'stack'];
  const auditKeys = [
    'sequence',
    'audit_id',
    'correlation_id',
    'operation',
    'outcome',
    'reason_code',
    'actor_id',
    'actor_role',
    'agent_id',
    'version',
    'from_status',
    'to_status',
    'supplied_package_sha256',
    'resolved_package_sha256',
    'occurred_at',
    'previous_audit_sha256',
    'audit_sha256',
  ];

  function captureSystemErrors() {
    const source = createAgentRegistry({ now: qaClock('2026-09-01T14:00:00.000Z') });
    const selfContent = qaContent({
      agent_id: 'qa.replay-source-self',
      version: '1.0.0',
      created_by: 'qa.replay-author',
    });
    qaRegister(source, selfContent);
    qaTransition(
      source,
      selfContent,
      STATUSES.IN_REVIEW,
      qaActor('qa.replay-reviewer', ACTOR_ROLES.REVIEWER),
    );

    let selfApprovalError;
    try {
      qaTransition(
        source,
        selfContent,
        STATUSES.APPROVED,
        qaActor(selfContent.created_by, ACTOR_ROLES.APPROVER),
      );
    } catch (error) {
      selfApprovalError = error;
    }
    assert.equal(selfApprovalError.code, 'SELF_APPROVAL_DENIED');

    const roleContent = qaContent({
      agent_id: 'qa.replay-source-role',
      version: '1.0.0',
      created_by: 'qa.role-author',
    });
    qaRegister(source, roleContent);
    let unauthorizedError;
    try {
      qaTransition(
        source,
        roleContent,
        STATUSES.IN_REVIEW,
        qaActor('qa.wrong-role', ACTOR_ROLES.AUTHOR),
      );
    } catch (error) {
      unauthorizedError = error;
    }
    assert.equal(unauthorizedError.code, 'ACTOR_NOT_AUTHORIZED');
    return { selfApprovalError, unauthorizedError };
  }

  function poison(error, label) {
    error.code = `PUBLIC_TAMPER_${label}`;
    error.message = `${replayMarker}:${label}:message`;
    error.stack = `${replayMarker}:${label}:origin-stack:C:\\internal\\registry.js`;
    error.cause = { secret: `${replayMarker}:${label}:cause` };
    error.request_payload = { credential: `${replayMarker}:${label}:payload` };
    error.arbitrary = `${replayMarker}:${label}:arbitrary`;
    error[Symbol(`replay-${label}`)] = `${replayMarker}:${label}:symbol`;
    return error;
  }

  function trap(target, trapName, thrown) {
    return new Proxy(target, {
      [trapName]() {
        throw thrown;
      },
    });
  }

  const systemErrors = captureSystemErrors();
  const replayedSelfError = poison(systemErrors.selfApprovalError, 'self');
  const replayedRoleError = poison(systemErrors.unauthorizedError, 'role');
  const wrappedSelfError = new Proxy(replayedSelfError, {});
  const wrappedRoleError = new Proxy(replayedRoleError, {});

  const registry = createAgentRegistry({ now: qaClock('2026-09-01T15:00:00.000Z') });
  const registrationContent = qaContent({
    agent_id: 'qa.replay-registration',
    version: '1.0.0',
  });
  const request = qaRequest(registrationContent);
  const author = qaActor(registrationContent.created_by, ACTOR_ROLES.AUTHOR);
  const transitionContent = qaContent({
    agent_id: 'qa.replay-transition',
    version: '1.0.0',
  });
  qaRegister(registry, transitionContent);
  const transitionSnapshot = registry.getAgentPackage(
    transitionContent.agent_id,
    transitionContent.version,
  );
  const command = {
    agent_id: transitionContent.agent_id,
    version: transitionContent.version,
    to_status: STATUSES.IN_REVIEW,
  };
  const reviewer = qaActor('qa.replay-target-reviewer', ACTOR_ROLES.REVIEWER);

  const cases = [
    {
      label: 'raw system error from registration request Proxy',
      action: () => registry.registerAgentPackage(trap(request, 'ownKeys', replayedSelfError), author),
      expectedCode: 'INVALID_INPUT',
      operation: 'REGISTER',
      actor_id: author.actor_id,
      actor_role: author.role,
    },
    {
      label: 'raw system error from registration actor Proxy',
      action: () => registry.registerAgentPackage(
        request,
        trap(author, 'getOwnPropertyDescriptor', replayedRoleError),
      ),
      expectedCode: 'INVALID_ACTOR',
      operation: 'REGISTER',
      actor_id: null,
      actor_role: null,
    },
    {
      label: 'raw system error from transition command Proxy',
      action: () => registry.transitionApproval(trap(command, 'ownKeys', replayedSelfError), reviewer),
      expectedCode: 'INVALID_INPUT',
      operation: 'TRANSITION',
      actor_id: reviewer.actor_id,
      actor_role: reviewer.role,
    },
    {
      label: 'raw system error from transition actor Proxy',
      action: () => registry.transitionApproval(
        command,
        trap(reviewer, 'getOwnPropertyDescriptor', replayedRoleError),
      ),
      expectedCode: 'INVALID_ACTOR',
      operation: 'TRANSITION',
      actor_id: null,
      actor_role: null,
    },
    {
      label: 'Proxy-wrapped system error from registration request Proxy',
      action: () => registry.registerAgentPackage(trap(request, 'ownKeys', wrappedSelfError), author),
      expectedCode: 'INVALID_INPUT',
      operation: 'REGISTER',
      actor_id: author.actor_id,
      actor_role: author.role,
    },
    {
      label: 'Proxy-wrapped system error from transition actor Proxy',
      action: () => registry.transitionApproval(
        command,
        trap(reviewer, 'getOwnPropertyDescriptor', wrappedRoleError),
      ),
      expectedCode: 'INVALID_ACTOR',
      operation: 'TRANSITION',
      actor_id: null,
      actor_role: null,
    },
  ];

  const observations = [];
  for (const replayCase of cases) {
    const beforeCount = registry.listAuditRecords().length;
    let caught;
    try {
      replayCase.action();
      assert.fail(`${replayCase.label} must be rejected`);
    } catch (error) {
      caught = error;
    }
    const records = registry.listAuditRecords();
    assert.equal(records.length, beforeCount + 1, `${replayCase.label} must create exactly one audit`);
    const audit = records.at(-1);

    assert.equal(caught.name, 'RegistryError');
    assert.deepEqual([...Reflect.ownKeys(caught)].sort(), [...errorKeys].sort());
    assert.equal(caught.correlation_id, audit.correlation_id);
    assert.match(caught.message, /^(?:input is invalid|actor context is invalid|self-approval is denied|actor is not authorized for this operation)$/);
    assert.equal(caught.stack, `RegistryError: ${caught.message}`);
    assert(caught.stack.length <= 96);
    assert.doesNotMatch(caught.stack, /(?:[A-Za-z]:\\|\/tools\/|node:internal|\bat\s)/);
    assert.doesNotMatch(JSON.stringify(caught), new RegExp(replayMarker));

    assert.deepEqual(Object.keys(audit), auditKeys);
    assert.equal(audit.operation, replayCase.operation);
    assert.equal(audit.outcome, 'REJECTED');
    assert.equal(audit.actor_id, replayCase.actor_id);
    assert.equal(audit.actor_role, replayCase.actor_role);
    assert.match(audit.correlation_id, /^reg4-correlation-[0-9]{10}$/);
    assert.doesNotMatch(JSON.stringify(audit), new RegExp(replayMarker));
    assert(Object.values(audit).every((value) =>
      value === null || typeof value === 'string' || typeof value === 'number'));
    observations.push({ replayCase, caught, audit });

    assert.equal(
      registry.getAgentPackage(registrationContent.agent_id, registrationContent.version),
      null,
    );
    assert.deepEqual(
      registry.getAgentPackage(transitionContent.agent_id, transitionContent.version),
      transitionSnapshot,
    );
  }

  let previousAuditSha256 = '0'.repeat(64);
  for (const audit of registry.listAuditRecords()) {
    assert.equal(audit.previous_audit_sha256, previousAuditSha256);
    const auditBody = {
      sequence: audit.sequence,
      audit_id: audit.audit_id,
      correlation_id: audit.correlation_id,
      operation: audit.operation,
      outcome: audit.outcome,
      reason_code: audit.reason_code,
      actor_id: audit.actor_id,
      actor_role: audit.actor_role,
      agent_id: audit.agent_id,
      version: audit.version,
      from_status: audit.from_status,
      to_status: audit.to_status,
      supplied_package_sha256: audit.supplied_package_sha256,
      resolved_package_sha256: audit.resolved_package_sha256,
      occurred_at: audit.occurred_at,
      previous_audit_sha256: audit.previous_audit_sha256,
    };
    assert.equal(audit.audit_sha256, sha256Utf8(JSON.stringify(auditBody)));
    previousAuditSha256 = audit.audit_sha256;
  }

  for (const { replayCase, caught, audit } of observations) {
    assert.equal(caught.code, replayCase.expectedCode, `${replayCase.label} leaked a replayed system code`);
    assert.equal(caught.message, canonicalMessages[replayCase.expectedCode]);
    assert.equal(caught.stack, `RegistryError: ${canonicalMessages[replayCase.expectedCode]}`);
    assert.equal(audit.reason_code, replayCase.expectedCode, `${replayCase.label} audited a replayed system code`);
  }
});
