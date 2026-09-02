'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { test } = require('node:test');

const {
  createAgentRegistry,
  calculatePackageSha256,
  STATUSES,
  ACTOR_ROLES,
} = require('./agent-registry');

const AUTOMATED_HASH = 'a'.repeat(64);
const REVIEW_HASH = 'b'.repeat(64);
const KNOWN_PACKAGE_HASH = 'f654bfa73d674d708f57c0dffac3c22e1214515654d11a03a48dc5d9221bbba4';

function clock(start = '2026-09-01T00:00:00.000Z') {
  let tick = Date.parse(start);
  return () => {
    const value = new Date(tick).toISOString();
    tick += 1000;
    return value;
  };
}

function evidenceReferences() {
  return [
    {
      evidence_id: 'z-review',
      evidence_type: 'INDEPENDENT_REVIEW',
      result: 'PASS',
      sha256: REVIEW_HASH,
    },
    {
      evidence_id: 'a-test',
      evidence_type: 'AUTOMATED_TEST',
      result: 'PASS',
      sha256: AUTOMATED_HASH,
    },
  ];
}

function packageContent(overrides = {}) {
  return {
    agent_id: 'alpha.agent',
    name: 'Alpha Agent',
    version: '1.2.3',
    created_by: 'author.one',
    permissions: ['agent:write', 'agent:read'],
    required_tools: ['node:test', 'node:crypto'],
    prohibited_actions: ['production:write', 'network:access'],
    evidence_references: evidenceReferences(),
    ...overrides,
  };
}

function registrationRequest(content = packageContent()) {
  return { ...content, package_sha256: calculatePackageSha256(content) };
}

function actor(actorId, role) {
  return { actor_id: actorId, role };
}

function expectCode(action, code) {
  assert.throws(action, (error) => {
    assert.equal(error.name, 'RegistryError');
    assert.equal(error.code, code);
    return true;
  });
}

function register(registry, content = packageContent()) {
  return registry.registerAgentPackage(
    registrationRequest(content),
    actor(content.created_by, ACTOR_ROLES.AUTHOR),
  );
}

function transition(registry, content, toStatus, transitionActor) {
  return registry.transitionApproval(
    { agent_id: content.agent_id, version: content.version, to_status: toStatus },
    transitionActor,
  );
}

test('REG4-B01 registers the exact minimum Agent Package shape as DRAFT', () => {
  const registry = createAgentRegistry({ now: clock() });
  const content = packageContent();
  const record = register(registry, content);

  assert.deepEqual(Object.keys(record), [
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
  assert.deepEqual(Object.keys(record.timestamps), ['created_at', 'updated_at']);
  assert.deepEqual(Object.keys(record.evidence_references[0]), [
    'evidence_id',
    'evidence_type',
    'result',
    'sha256',
  ]);
  assert.deepEqual(record, {
    agent_id: 'alpha.agent',
    name: 'Alpha Agent',
    version: '1.2.3',
    package_sha256: KNOWN_PACKAGE_HASH,
    created_by: 'author.one',
    permissions: ['agent:read', 'agent:write'],
    required_tools: ['node:crypto', 'node:test'],
    prohibited_actions: ['network:access', 'production:write'],
    evidence_references: [
      {
        evidence_id: 'a-test',
        evidence_type: 'AUTOMATED_TEST',
        result: 'PASS',
        sha256: AUTOMATED_HASH,
      },
      {
        evidence_id: 'z-review',
        evidence_type: 'INDEPENDENT_REVIEW',
        result: 'PASS',
        sha256: REVIEW_HASH,
      },
    ],
    approval_status: 'DRAFT',
    timestamps: {
      created_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-01T00:00:00.000Z',
    },
  });
  assert.deepEqual(STATUSES, {
    DRAFT: 'DRAFT',
    IN_REVIEW: 'IN_REVIEW',
    APPROVED: 'APPROVED',
    BLOCKED: 'BLOCKED',
    RETIRED: 'RETIRED',
  });
  assert.deepEqual(ACTOR_ROLES, {
    AUTHOR: 'AUTHOR',
    REVIEWER: 'REVIEWER',
    APPROVER: 'APPROVER',
    REGISTRY_ADMIN: 'REGISTRY_ADMIN',
  });
  assert(Object.isFrozen(STATUSES));
  assert(Object.isFrozen(ACTOR_ROLES));
  assert.equal(registry.listAuditRecords().length, 1);
  assert.equal(registry.listAuditRecords()[0].reason_code, 'REGISTERED');
});

test('REG4-B02 covers every status and every legal state transition', () => {
  const registry = createAgentRegistry({ now: clock() });
  const reviewer = actor('reviewer.one', ACTOR_ROLES.REVIEWER);
  const approver = actor('approver.one', ACTOR_ROLES.APPROVER);
  const admin = actor('admin.one', ACTOR_ROLES.REGISTRY_ADMIN);

  const approved = packageContent({ agent_id: 'path.approved', version: '1.0.0' });
  register(registry, approved);
  assert.equal(transition(registry, approved, STATUSES.IN_REVIEW, reviewer).approval_status, 'IN_REVIEW');
  assert.equal(transition(registry, approved, STATUSES.APPROVED, approver).approval_status, 'APPROVED');
  assert.equal(transition(registry, approved, STATUSES.RETIRED, admin).approval_status, 'RETIRED');

  const blocked = packageContent({ agent_id: 'path.blocked', version: '1.0.0' });
  register(registry, blocked);
  transition(registry, blocked, STATUSES.IN_REVIEW, reviewer);
  assert.equal(transition(registry, blocked, STATUSES.BLOCKED, reviewer).approval_status, 'BLOCKED');
  assert.equal(transition(registry, blocked, STATUSES.RETIRED, admin).approval_status, 'RETIRED');

  const draft = packageContent({ agent_id: 'path.draft', version: '1.0.0' });
  register(registry, draft);
  assert.equal(transition(registry, draft, STATUSES.RETIRED, admin).approval_status, 'RETIRED');

  const inReview = packageContent({ agent_id: 'path.review', version: '1.0.0' });
  register(registry, inReview);
  transition(registry, inReview, STATUSES.IN_REVIEW, reviewer);
  assert.equal(transition(registry, inReview, STATUSES.RETIRED, admin).approval_status, 'RETIRED');

  const acceptedTransitions = registry.listAuditRecords().filter((record) =>
    record.operation === 'TRANSITION' && record.outcome === 'ACCEPTED');
  assert.deepEqual(
    new Set(acceptedTransitions.map((record) => `${record.from_status}->${record.to_status}`)),
    new Set([
      'DRAFT->IN_REVIEW',
      'DRAFT->RETIRED',
      'IN_REVIEW->APPROVED',
      'IN_REVIEW->BLOCKED',
      'IN_REVIEW->RETIRED',
      'BLOCKED->RETIRED',
      'APPROVED->RETIRED',
    ]),
  );
});

test('REG4-B03 denies self-approval by created_by or agent_id', () => {
  const registry = createAgentRegistry({ now: clock() });
  const reviewer = actor('reviewer.one', ACTOR_ROLES.REVIEWER);

  const creatorSelf = packageContent({ agent_id: 'self.creator', created_by: 'person.one' });
  register(registry, creatorSelf);
  transition(registry, creatorSelf, STATUSES.IN_REVIEW, reviewer);
  expectCode(
    () => transition(
      registry,
      creatorSelf,
      STATUSES.APPROVED,
      actor('person.one', ACTOR_ROLES.APPROVER),
    ),
    'SELF_APPROVAL_DENIED',
  );

  const agentSelf = packageContent({ agent_id: 'self.agent', version: '2.0.0', created_by: 'person.two' });
  register(registry, agentSelf);
  transition(registry, agentSelf, STATUSES.IN_REVIEW, reviewer);
  expectCode(
    () => transition(
      registry,
      agentSelf,
      STATUSES.APPROVED,
      actor('self.agent', ACTOR_ROLES.APPROVER),
    ),
    'SELF_APPROVAL_DENIED',
  );

  assert.equal(registry.getAgentPackage('self.creator', '1.2.3').approval_status, 'IN_REVIEW');
  assert.equal(registry.getAgentPackage('self.agent', '2.0.0').approval_status, 'IN_REVIEW');
  assert.deepEqual(
    registry.listAuditRecords().filter((record) => record.reason_code === 'SELF_APPROVAL_DENIED')
      .map((record) => record.outcome),
    ['REJECTED', 'REJECTED'],
  );
});

test('REG4-B04 rejects same-content duplicates and immutable same-version conflicts', () => {
  const registry = createAgentRegistry({ now: clock() });
  const originalContent = packageContent();
  const original = register(registry, originalContent);

  expectCode(
    () => registry.registerAgentPackage(
      registrationRequest(packageContent({
        permissions: ['agent:read', 'agent:write'],
        required_tools: ['node:crypto', 'node:test'],
        prohibited_actions: ['network:access', 'production:write'],
        evidence_references: [...evidenceReferences()].reverse(),
      })),
      actor('author.one', ACTOR_ROLES.AUTHOR),
    ),
    'AGENT_VERSION_ALREADY_REGISTERED',
  );

  const conflictingContent = packageContent({ name: 'Changed Alpha Agent' });
  expectCode(
    () => registry.registerAgentPackage(
      registrationRequest(conflictingContent),
      actor('author.one', ACTOR_ROLES.AUTHOR),
    ),
    'IMMUTABLE_VERSION_CONFLICT',
  );

  assert.deepEqual(registry.getAgentPackage('alpha.agent', '1.2.3'), original);
  assert.deepEqual(
    registry.listAuditRecords().map((record) => record.reason_code),
    ['REGISTERED', 'AGENT_VERSION_ALREADY_REGISTERED', 'IMMUTABLE_VERSION_CONFLICT'],
  );
});

test('REG4-B05 rejects package fingerprint mismatch without creating a package', () => {
  const registry = createAgentRegistry({ now: clock() });
  const request = registrationRequest();
  request.package_sha256 = 'c'.repeat(64);

  expectCode(
    () => registry.registerAgentPackage(request, actor('author.one', ACTOR_ROLES.AUTHOR)),
    'PACKAGE_SHA256_MISMATCH',
  );
  assert.equal(registry.getAgentPackage('alpha.agent', '1.2.3'), null);
  assert.equal(registry.listAuditRecords().length, 1);
  assert.deepEqual(
    {
      outcome: registry.listAuditRecords()[0].outcome,
      reason: registry.listAuditRecords()[0].reason_code,
      supplied: registry.listAuditRecords()[0].supplied_package_sha256,
      resolved: registry.listAuditRecords()[0].resolved_package_sha256,
    },
    { outcome: 'REJECTED', reason: 'PACKAGE_SHA256_MISMATCH', supplied: 'c'.repeat(64), resolved: null },
  );
});

test('REG4-B06 requires both passing evidence types before APPROVED', () => {
  const registry = createAgentRegistry({ now: clock() });
  const reviewer = actor('reviewer.one', ACTOR_ROLES.REVIEWER);
  const approver = actor('approver.one', ACTOR_ROLES.APPROVER);
  const evidenceSets = [
    [],
    [evidenceReferences()[1]],
    [
      evidenceReferences()[1],
      { ...evidenceReferences()[0], result: 'FAIL' },
    ],
  ];

  evidenceSets.forEach((references, index) => {
    const content = packageContent({
      agent_id: `evidence.case-${index}`,
      version: '1.0.0',
      evidence_references: references,
    });
    register(registry, content);
    transition(registry, content, STATUSES.IN_REVIEW, reviewer);
    expectCode(
      () => transition(registry, content, STATUSES.APPROVED, approver),
      'REQUIRED_EVIDENCE_MISSING',
    );
    assert.equal(registry.getAgentPackage(content.agent_id, content.version).approval_status, 'IN_REVIEW');
  });

  assert.equal(
    registry.listAuditRecords().filter((record) => record.reason_code === 'REQUIRED_EVIDENCE_MISSING').length,
    3,
  );
});

test('REG4-B07 rejects every prohibited edge and every wrong role on legal edges', () => {
  const roles = Object.values(ACTOR_ROLES);
  const allowed = {
    DRAFT: { IN_REVIEW: 'REVIEWER', RETIRED: 'REGISTRY_ADMIN' },
    IN_REVIEW: { APPROVED: 'APPROVER', BLOCKED: 'REVIEWER', RETIRED: 'REGISTRY_ADMIN' },
    BLOCKED: { RETIRED: 'REGISTRY_ADMIN' },
    APPROVED: { RETIRED: 'REGISTRY_ADMIN' },
    RETIRED: {},
  };
  let serial = 0;

  function registryAt(status) {
    serial += 1;
    const registry = createAgentRegistry({ now: clock() });
    const content = packageContent({
      agent_id: `state.case-${serial}`,
      version: '1.0.0',
      created_by: `author.case-${serial}`,
    });
    register(registry, content);
    if (status === STATUSES.IN_REVIEW || status === STATUSES.BLOCKED || status === STATUSES.APPROVED) {
      transition(registry, content, STATUSES.IN_REVIEW, actor('reviewer.setup', ACTOR_ROLES.REVIEWER));
    }
    if (status === STATUSES.BLOCKED) {
      transition(registry, content, STATUSES.BLOCKED, actor('reviewer.setup', ACTOR_ROLES.REVIEWER));
    }
    if (status === STATUSES.APPROVED) {
      transition(registry, content, STATUSES.APPROVED, actor('approver.setup', ACTOR_ROLES.APPROVER));
    }
    if (status === STATUSES.RETIRED) {
      transition(registry, content, STATUSES.RETIRED, actor('admin.setup', ACTOR_ROLES.REGISTRY_ADMIN));
    }
    return { registry, content };
  }

  for (const fromStatus of Object.values(STATUSES)) {
    for (const toStatus of Object.values(STATUSES)) {
      if (allowed[fromStatus][toStatus]) continue;
      const { registry, content } = registryAt(fromStatus);
      const before = registry.getAgentPackage(content.agent_id, content.version);
      const beforeCount = registry.listAuditRecords().length;
      expectCode(
        () => transition(registry, content, toStatus, actor('admin.invalid-edge', ACTOR_ROLES.REGISTRY_ADMIN)),
        'INVALID_STATE_TRANSITION',
      );
      assert.deepEqual(registry.getAgentPackage(content.agent_id, content.version), before);
      assert.equal(registry.listAuditRecords().length, beforeCount + 1);
    }
  }

  for (const [fromStatus, targets] of Object.entries(allowed)) {
    for (const [toStatus, requiredRole] of Object.entries(targets)) {
      for (const wrongRole of roles.filter((role) => role !== requiredRole)) {
        const { registry, content } = registryAt(fromStatus);
        const before = registry.getAgentPackage(content.agent_id, content.version);
        expectCode(
          () => transition(registry, content, toStatus, actor(`actor.${wrongRole.toLowerCase()}`, wrongRole)),
          'ACTOR_NOT_AUTHORIZED',
        );
        assert.deepEqual(registry.getAgentPackage(content.agent_id, content.version), before);
      }
    }
  }

  const registry = createAgentRegistry({ now: clock() });
  expectCode(
    () => registry.registerAgentPackage(
      registrationRequest(),
      actor('author.one', ACTOR_ROLES.REVIEWER),
    ),
    'ACTOR_NOT_AUTHORIZED',
  );
  expectCode(
    () => registry.transitionApproval(
      { agent_id: 'missing.agent', version: '1.0.0', to_status: 'IN_REVIEW' },
      actor('reviewer.one', ACTOR_ROLES.REVIEWER),
    ),
    'AGENT_VERSION_NOT_FOUND',
  );
  expectCode(
    () => registry.transitionApproval(
      { agent_id: 'missing.agent', version: '1.0.0', to_status: 'UNKNOWN' },
      actor('reviewer.one', ACTOR_ROLES.REVIEWER),
    ),
    'INVALID_INPUT',
  );
});

test('REG4-B08 creates one independently verifiable hash-chained audit per mutating attempt', () => {
  const registry = createAgentRegistry({ now: clock() });
  const content = packageContent();
  const request = registrationRequest(content);
  const author = actor('author.one', ACTOR_ROLES.AUTHOR);
  const reviewer = actor('reviewer.one', ACTOR_ROLES.REVIEWER);

  registry.registerAgentPackage(request, author);
  expectCode(() => registry.registerAgentPackage(request, author), 'AGENT_VERSION_ALREADY_REGISTERED');
  transition(registry, content, STATUSES.IN_REVIEW, reviewer);
  expectCode(
    () => transition(registry, content, STATUSES.APPROVED, actor('author.one', ACTOR_ROLES.APPROVER)),
    'SELF_APPROVAL_DENIED',
  );
  transition(registry, content, STATUSES.APPROVED, actor('approver.one', ACTOR_ROLES.APPROVER));
  expectCode(
    () => transition(registry, content, STATUSES.APPROVED, actor('approver.one', ACTOR_ROLES.APPROVER)),
    'INVALID_STATE_TRANSITION',
  );

  const records = registry.listAuditRecords();
  assert.equal(records.length, 6);
  assert.deepEqual(records.map((record) => record.sequence), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(records.map((record) => record.audit_id), [
    'reg4-audit-000001',
    'reg4-audit-000002',
    'reg4-audit-000003',
    'reg4-audit-000004',
    'reg4-audit-000005',
    'reg4-audit-000006',
  ]);
  assert.deepEqual(records.map((record) => record.correlation_id), [
    'reg4-correlation-0000000001',
    'reg4-correlation-0000000002',
    'reg4-correlation-0000000003',
    'reg4-correlation-0000000004',
    'reg4-correlation-0000000005',
    'reg4-correlation-0000000006',
  ]);
  assert.deepEqual(Object.keys(records[0]), [
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

  let previous = '0'.repeat(64);
  for (const record of records) {
    assert.equal(record.previous_audit_sha256, previous);
    const body = { ...record };
    delete body.audit_sha256;
    const expected = createHash('sha256')
      .update(Buffer.from(JSON.stringify(body), 'utf8'))
      .digest('hex');
    assert.equal(record.audit_sha256, expected);
    previous = record.audit_sha256;
  }

  records[0].reason_code = 'TAMPERED';
  assert.equal(registry.listAuditRecords()[0].reason_code, 'REGISTERED');
});

test('REG4-B09 matches the canonical known answer and all set permutations', () => {
  const canonicalContent = packageContent();
  assert.equal(calculatePackageSha256(canonicalContent), KNOWN_PACKAGE_HASH);

  const independentlyOrderedBody = {
    schema_version: 'reg4-agent-package/v1',
    agent_id: 'alpha.agent',
    name: 'Alpha Agent',
    version: '1.2.3',
    created_by: 'author.one',
    permissions: ['agent:read', 'agent:write'],
    required_tools: ['node:crypto', 'node:test'],
    prohibited_actions: ['network:access', 'production:write'],
    evidence_references: [
      { evidence_id: 'a-test', evidence_type: 'AUTOMATED_TEST', result: 'PASS', sha256: AUTOMATED_HASH },
      { evidence_id: 'z-review', evidence_type: 'INDEPENDENT_REVIEW', result: 'PASS', sha256: REVIEW_HASH },
    ],
  };
  assert.equal(
    createHash('sha256').update(Buffer.from(JSON.stringify(independentlyOrderedBody), 'utf8')).digest('hex'),
    KNOWN_PACKAGE_HASH,
  );

  const permutations = [
    packageContent({
      permissions: [...canonicalContent.permissions].reverse(),
      required_tools: [...canonicalContent.required_tools].reverse(),
      prohibited_actions: [...canonicalContent.prohibited_actions].reverse(),
      evidence_references: [...canonicalContent.evidence_references].reverse(),
    }),
    packageContent({
      permissions: ['agent:read', 'agent:write'],
      required_tools: ['node:crypto', 'node:test'],
      prohibited_actions: ['network:access', 'production:write'],
    }),
  ];
  for (const permutation of permutations) {
    assert.equal(calculatePackageSha256(permutation), KNOWN_PACKAGE_HASH);
  }

  const variants = [
    packageContent({ agent_id: 'beta.agent' }),
    packageContent({ name: 'Beta Agent' }),
    packageContent({ version: '1.2.4' }),
    packageContent({ created_by: 'author.two' }),
    packageContent({ permissions: ['agent:read'] }),
    packageContent({ required_tools: [] }),
    packageContent({ prohibited_actions: ['network:access'] }),
    packageContent({ evidence_references: [evidenceReferences()[0]] }),
  ];
  for (const variant of variants) {
    assert.notEqual(calculatePackageSha256(variant), KNOWN_PACKAGE_HASH);
  }
});

test('REG4-B10 deep-copies inputs, outputs and audits without mutation or read audits', () => {
  const registry = createAgentRegistry({ now: clock() });
  const content = packageContent();
  const request = registrationRequest(content);
  const snapshot = structuredClone(request);
  const digestInput = packageContent();
  const digestSnapshot = structuredClone(digestInput);

  const returned = registry.registerAgentPackage(request, actor('author.one', ACTOR_ROLES.AUTHOR));
  assert.deepEqual(request, snapshot);
  calculatePackageSha256(digestInput);
  assert.deepEqual(digestInput, digestSnapshot);

  request.permissions[0] = 'tamper:input';
  request.evidence_references[0].result = 'FAIL';
  returned.name = 'Tampered output';
  returned.permissions[0] = 'tamper:output';
  returned.evidence_references[0].result = 'FAIL';
  returned.timestamps.updated_at = '2000-01-01T00:00:00.000Z';

  const firstRead = registry.getAgentPackage('alpha.agent', '1.2.3');
  const auditCount = registry.listAuditRecords().length;
  firstRead.permissions.push('tamper:getter');
  firstRead.evidence_references[0].result = 'FAIL';
  const audits = registry.listAuditRecords();
  audits.push({ fake: true });
  audits[0].audit_sha256 = '0'.repeat(64);

  const secondRead = registry.getAgentPackage('alpha.agent', '1.2.3');
  assert.equal(secondRead.name, 'Alpha Agent');
  assert.deepEqual(secondRead.permissions, ['agent:read', 'agent:write']);
  assert.equal(secondRead.evidence_references[0].result, 'PASS');
  assert.equal(secondRead.timestamps.updated_at, '2026-09-01T00:00:00.000Z');
  assert.equal(registry.listAuditRecords().length, auditCount);
  assert.notEqual(registry.listAuditRecords()[0].audit_sha256, '0'.repeat(64));
  assert.equal(registry.getAgentPackage('missing.agent', '1.0.0'), null);
  assert.equal(registry.listAuditRecords().length, auditCount);
});

test('REG4-B11 rejects strict-shape, sparse, Symbol, accessor and boundary violations', () => {
  const registry = createAgentRegistry({ now: clock() });
  const invalidRequests = [];

  const missing = registrationRequest();
  delete missing.name;
  invalidRequests.push(missing);
  invalidRequests.push({ ...registrationRequest(), extra: true });
  invalidRequests.push({ ...registrationRequest(), approval_status: 'DRAFT' });
  const symbolRequest = registrationRequest();
  symbolRequest[Symbol('metadata')] = true;
  invalidRequests.push(symbolRequest);
  const nonEnumerableExtra = registrationRequest();
  Object.defineProperty(nonEnumerableExtra, 'hidden', { value: true });
  invalidRequests.push(nonEnumerableExtra);
  const accessorRequest = registrationRequest();
  let topGetterCalled = false;
  Object.defineProperty(accessorRequest, 'name', {
    enumerable: true,
    get() {
      topGetterCalled = true;
      return 'Unsafe';
    },
  });
  invalidRequests.push(accessorRequest);

  const sparsePermissions = registrationRequest();
  sparsePermissions.permissions = new Array(1);
  invalidRequests.push(sparsePermissions);
  const arraySymbol = registrationRequest();
  arraySymbol.permissions[Symbol('metadata')] = true;
  invalidRequests.push(arraySymbol);
  const arrayAccessor = registrationRequest();
  let arrayGetterCalled = false;
  Object.defineProperty(arrayAccessor.permissions, '0', {
    enumerable: true,
    get() {
      arrayGetterCalled = true;
      return 'unsafe:scope';
    },
  });
  invalidRequests.push(arrayAccessor);

  const evidenceExtra = registrationRequest();
  evidenceExtra.evidence_references[0].extra = true;
  invalidRequests.push(evidenceExtra);
  const evidenceSymbol = registrationRequest();
  evidenceSymbol.evidence_references[0][Symbol('metadata')] = true;
  invalidRequests.push(evidenceSymbol);
  const evidenceAccessor = registrationRequest();
  let evidenceGetterCalled = false;
  Object.defineProperty(evidenceAccessor.evidence_references[0], 'result', {
    enumerable: true,
    get() {
      evidenceGetterCalled = true;
      return 'PASS';
    },
  });
  invalidRequests.push(evidenceAccessor);

  invalidRequests.push({
    ...packageContent({ permissions: ['agent:read', 'agent:read'] }),
    package_sha256: KNOWN_PACKAGE_HASH,
  });
  invalidRequests.push({
    ...packageContent({ evidence_references: [
      evidenceReferences()[0],
      { ...evidenceReferences()[0], sha256: AUTOMATED_HASH },
    ] }),
    package_sha256: KNOWN_PACKAGE_HASH,
  });

  const invalidFieldOverrides = [
    { agent_id: 'AB' },
    { name: ' Alpha Agent' },
    { name: 'e\u0301' },
    { name: `line\nname` },
    { name: 'x'.repeat(121) },
    { version: '01.0.0' },
    { version: '1.0.0-beta' },
    { created_by: '../author' },
    { permissions: [] },
    { permissions: Array.from({ length: 101 }, (_, index) => `scope:${index}`) },
    { required_tools: Array.from({ length: 101 }, (_, index) => `tool:${index}`) },
    { prohibited_actions: [] },
    { prohibited_actions: Array.from({ length: 101 }, (_, index) => `action:${index}`) },
    { evidence_references: Array.from({ length: 101 }, (_, index) => ({
      evidence_id: `evidence:${index}`,
      evidence_type: 'AUTOMATED_TEST',
      result: 'PASS',
      sha256: AUTOMATED_HASH,
    })) },
  ];
  for (const override of invalidFieldOverrides) {
    const content = packageContent(override);
    invalidRequests.push({ ...content, package_sha256: KNOWN_PACKAGE_HASH });
  }
  const badHash = registrationRequest();
  badHash.package_sha256 = 'A'.repeat(64);
  invalidRequests.push(badHash);

  for (const request of invalidRequests) {
    const before = registry.listAuditRecords().length;
    expectCode(
      () => registry.registerAgentPackage(request, actor('author.one', ACTOR_ROLES.AUTHOR)),
      'INVALID_INPUT',
    );
    assert.equal(registry.listAuditRecords().length, before + 1);
    assert.equal(registry.listAuditRecords().at(-1).outcome, 'REJECTED');
  }
  assert.equal(topGetterCalled, false);
  assert.equal(arrayGetterCalled, false);
  assert.equal(evidenceGetterCalled, false);

  const invalidActors = [
    null,
    { actor_id: 'author.one' },
    { actor_id: 'author.one', role: 'ROOT' },
    { actor_id: '../author', role: ACTOR_ROLES.AUTHOR },
    { actor_id: 'author.one', role: ACTOR_ROLES.AUTHOR, extra: true },
  ];
  for (const invalidActor of invalidActors) {
    const before = registry.listAuditRecords().length;
    expectCode(
      () => registry.registerAgentPackage(registrationRequest(), invalidActor),
      'INVALID_ACTOR',
    );
    assert.equal(registry.listAuditRecords().length, before + 1);
  }

  const boundaryContent = packageContent({
    agent_id: `a${'0'.repeat(63)}`,
    name: '\ud83e\udd16'.repeat(120),
    version: '0.0.0',
    permissions: Array.from({ length: 100 }, (_, index) => `scope:${index}`),
    required_tools: Array.from({ length: 100 }, (_, index) => `tool:${index}`),
    prohibited_actions: Array.from({ length: 100 }, (_, index) => `action:${index}`),
    evidence_references: Array.from({ length: 100 }, (_, index) => ({
      evidence_id: `evidence:${index}`,
      evidence_type: index % 2 === 0 ? 'AUTOMATED_TEST' : 'INDEPENDENT_REVIEW',
      result: 'PASS',
      sha256: index % 2 === 0 ? AUTOMATED_HASH : REVIEW_HASH,
    })),
  });
  assert.match(calculatePackageSha256(boundaryContent), /^[0-9a-f]{64}$/);
  assert.match(calculatePackageSha256(packageContent({ agent_id: 'abc', name: 'x' })), /^[0-9a-f]{64}$/);
});

test('REG4-B12 uses deterministic timestamps and rejection never updates a package', () => {
  const times = [
    '2026-09-01T01:00:00.000Z',
    '2026-09-01T01:00:01.000Z',
    '2026-09-01T01:00:02.000Z',
    '2026-09-01T01:00:03.000Z',
  ];
  let index = 0;
  const registry = createAgentRegistry({ now: () => times[index++] });
  const content = packageContent();
  const initial = register(registry, content);

  expectCode(
    () => transition(registry, content, STATUSES.APPROVED, actor('approver.one', ACTOR_ROLES.APPROVER)),
    'INVALID_STATE_TRANSITION',
  );
  assert.deepEqual(registry.getAgentPackage(content.agent_id, content.version).timestamps, initial.timestamps);

  const reviewed = transition(
    registry,
    content,
    STATUSES.IN_REVIEW,
    actor('reviewer.one', ACTOR_ROLES.REVIEWER),
  );
  assert.deepEqual(reviewed.timestamps, {
    created_at: times[0],
    updated_at: times[2],
  });

  expectCode(
    () => transition(registry, content, STATUSES.IN_REVIEW, actor('reviewer.one', ACTOR_ROLES.REVIEWER)),
    'INVALID_STATE_TRANSITION',
  );
  assert.deepEqual(registry.getAgentPackage(content.agent_id, content.version).timestamps, reviewed.timestamps);
  assert.deepEqual(registry.listAuditRecords().map((record) => record.occurred_at), times);
  assert.equal(index, 4);
});

test('REG4-P1-01 contains registration and transition Proxy traps with one safe correlated audit', () => {
  const sensitiveMarker = 'credential-secret-proxy-stack-raw-marker';
  const canonicalMessages = {
    INVALID_INPUT: 'input is invalid',
    INVALID_ACTOR: 'actor context is invalid',
  };
  const allowedReasonCodes = new Set([
    'REGISTERED',
    'STATE_TRANSITIONED',
    'INVALID_INPUT',
    'INVALID_ACTOR',
    'CREATOR_MISMATCH',
    'PACKAGE_SHA256_MISMATCH',
    'AGENT_VERSION_ALREADY_REGISTERED',
    'IMMUTABLE_VERSION_CONFLICT',
    'AGENT_VERSION_NOT_FOUND',
    'INVALID_STATE_TRANSITION',
    'ACTOR_NOT_AUTHORIZED',
    'SELF_APPROVAL_DENIED',
    'REQUIRED_EVIDENCE_MISSING',
  ]);
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
  const registry = createAgentRegistry({ now: clock('2026-09-01T02:00:00.000Z') });
  const registrationContent = packageContent({
    agent_id: 'proxy.registration',
    version: '1.0.0',
  });
  const validRequest = registrationRequest(registrationContent);
  const validAuthor = actor(registrationContent.created_by, ACTOR_ROLES.AUTHOR);
  const transitionContent = packageContent({
    agent_id: 'proxy.transition',
    version: '1.0.0',
  });
  register(registry, transitionContent);
  const transitionSnapshot = registry.getAgentPackage(
    transitionContent.agent_id,
    transitionContent.version,
  );

  function trappedProxy(target, trapName, thrownValue = new Error(sensitiveMarker)) {
    return new Proxy(target, {
      [trapName]() {
        throw thrownValue;
      },
    });
  }

  function captureRejectedAttempt(action, expectedCode, expectedOperation) {
    const before = registry.listAuditRecords().length;
    let caught;
    try {
      action();
      assert.fail('Proxy-backed mutating attempt must be rejected');
    } catch (error) {
      caught = error;
    }

    assert.equal(caught.name, 'RegistryError');
    assert.equal(caught.code, expectedCode);
    assert.equal(caught.message, canonicalMessages[expectedCode]);
    assert.equal(caught.stack, `RegistryError: ${canonicalMessages[expectedCode]}`);
    assert.match(caught.correlation_id, /^reg4-correlation-[0-9]{10}$/);
    assert.deepEqual(
      [...Reflect.ownKeys(caught)].sort(),
      ['code', 'correlation_id', 'message', 'name', 'stack'],
    );
    assert.doesNotMatch(caught.message, new RegExp(sensitiveMarker));
    assert.doesNotMatch(caught.stack, new RegExp(sensitiveMarker));
    assert.equal(Object.prototype.hasOwnProperty.call(caught, 'cause'), false);
    assert.doesNotMatch(JSON.stringify(caught), new RegExp(sensitiveMarker));

    const records = registry.listAuditRecords();
    assert.equal(records.length, before + 1);
    const audit = records.at(-1);
    assert.equal(audit.operation, expectedOperation);
    assert.equal(audit.outcome, 'REJECTED');
    assert.equal(audit.reason_code, expectedCode);
    assert(allowedReasonCodes.has(audit.reason_code));
    assert.equal(audit.correlation_id, caught.correlation_id);
    assert.deepEqual(Object.keys(audit), auditKeys);
    assert.match(audit.occurred_at, /^2026-09-01T02:00:[0-9]{2}\.000Z$/);
    assert(Object.prototype.hasOwnProperty.call(audit, 'actor_id'));
    assert(Object.prototype.hasOwnProperty.call(audit, 'actor_role'));
    assert(Object.values(audit).every((value) =>
      value === null || typeof value === 'string' || typeof value === 'number'));
    const serializedAudit = JSON.stringify(audit);
    assert.doesNotMatch(serializedAudit, new RegExp(sensitiveMarker));
    assert.doesNotMatch(serializedAudit, /credential-secret|proxy-stack|raw-marker/);
  }

  for (const trapName of ['getPrototypeOf', 'ownKeys', 'getOwnPropertyDescriptor']) {
    captureRejectedAttempt(
      () => registry.registerAgentPackage(
        trappedProxy(validRequest, trapName),
        validAuthor,
      ),
      'INVALID_INPUT',
      'REGISTER',
    );
    assert.equal(registry.getAgentPackage(registrationContent.agent_id, registrationContent.version), null);
  }

  const hostileThrownProxy = new Proxy({}, {
    getPrototypeOf() {
      throw new Error(sensitiveMarker);
    },
  });
  captureRejectedAttempt(
    () => registry.registerAgentPackage(
      trappedProxy(validRequest, 'ownKeys', hostileThrownProxy),
      validAuthor,
    ),
    'INVALID_INPUT',
    'REGISTER',
  );

  for (const trapName of ['getPrototypeOf', 'ownKeys', 'getOwnPropertyDescriptor']) {
    captureRejectedAttempt(
      () => registry.registerAgentPackage(
        validRequest,
        trappedProxy(validAuthor, trapName),
      ),
      'INVALID_ACTOR',
      'REGISTER',
    );
  }

  const nestedProxyRequest = registrationRequest(registrationContent);
  nestedProxyRequest.permissions = trappedProxy(nestedProxyRequest.permissions, 'ownKeys');
  captureRejectedAttempt(
    () => registry.registerAgentPackage(nestedProxyRequest, validAuthor),
    'INVALID_INPUT',
    'REGISTER',
  );

  const validCommand = {
    agent_id: transitionContent.agent_id,
    version: transitionContent.version,
    to_status: STATUSES.IN_REVIEW,
  };
  const validReviewer = actor('reviewer.proxy', ACTOR_ROLES.REVIEWER);
  for (const trapName of ['getPrototypeOf', 'ownKeys', 'getOwnPropertyDescriptor']) {
    captureRejectedAttempt(
      () => registry.transitionApproval(
        trappedProxy(validCommand, trapName),
        validReviewer,
      ),
      'INVALID_INPUT',
      'TRANSITION',
    );
    assert.deepEqual(
      registry.getAgentPackage(transitionContent.agent_id, transitionContent.version),
      transitionSnapshot,
    );
  }

  for (const trapName of ['getPrototypeOf', 'ownKeys', 'getOwnPropertyDescriptor']) {
    captureRejectedAttempt(
      () => registry.transitionApproval(
        validCommand,
        trappedProxy(validReviewer, trapName),
      ),
      'INVALID_ACTOR',
      'TRANSITION',
    );
    assert.deepEqual(
      registry.getAgentPackage(transitionContent.agent_id, transitionContent.version),
      transitionSnapshot,
    );
  }

  const poisonRegistry = createAgentRegistry({ now: clock('2026-09-01T03:00:00.000Z') });
  let previouslyIssuedError;
  try {
    poisonRegistry.registerAgentPackage({}, actor('author.one', ACTOR_ROLES.AUTHOR));
  } catch (error) {
    previouslyIssuedError = error;
  }
  previouslyIssuedError.code = 'SELF_APPROVAL_DENIED';
  previouslyIssuedError.message = sensitiveMarker;
  previouslyIssuedError.stack = sensitiveMarker;
  previouslyIssuedError.cause = sensitiveMarker;
  previouslyIssuedError.origin_stack = sensitiveMarker;
  previouslyIssuedError.request_payload = { raw: sensitiveMarker };
  captureRejectedAttempt(
    () => registry.registerAgentPackage(
      trappedProxy(validRequest, 'ownKeys', previouslyIssuedError),
      validAuthor,
    ),
    'INVALID_INPUT',
    'REGISTER',
  );

  previouslyIssuedError.code = 'HOSTILE_UNTRUSTED_CODE';
  captureRejectedAttempt(
    () => registry.registerAgentPackage(
      trappedProxy(validRequest, 'getOwnPropertyDescriptor', previouslyIssuedError),
      validAuthor,
    ),
    'INVALID_INPUT',
    'REGISTER',
  );

  const proxyWrappedIssuedError = new Proxy(previouslyIssuedError, {
    getPrototypeOf() {
      throw new Error(sensitiveMarker);
    },
    get() {
      throw new Error(sensitiveMarker);
    },
  });
  captureRejectedAttempt(
    () => registry.transitionApproval(
      trappedProxy(validCommand, 'ownKeys', proxyWrappedIssuedError),
      validReviewer,
    ),
    'INVALID_INPUT',
    'TRANSITION',
  );
  assert.deepEqual(
    registry.getAgentPackage(transitionContent.agent_id, transitionContent.version),
    transitionSnapshot,
  );

  function genuinePolicyErrors() {
    const source = createAgentRegistry({ now: clock('2026-09-01T04:00:00.000Z') });
    const selfContent = packageContent({
      agent_id: 'replay.source-self',
      version: '1.0.0',
      created_by: 'replay.author',
    });
    register(source, selfContent);
    transition(
      source,
      selfContent,
      STATUSES.IN_REVIEW,
      actor('replay.reviewer', ACTOR_ROLES.REVIEWER),
    );
    let selfApproval;
    try {
      transition(
        source,
        selfContent,
        STATUSES.APPROVED,
        actor(selfContent.created_by, ACTOR_ROLES.APPROVER),
      );
    } catch (error) {
      selfApproval = error;
    }
    assert.equal(selfApproval.code, 'SELF_APPROVAL_DENIED');

    const roleContent = packageContent({
      agent_id: 'replay.source-role',
      version: '1.0.0',
      created_by: 'replay.role-author',
    });
    register(source, roleContent);
    let unauthorized;
    try {
      transition(
        source,
        roleContent,
        STATUSES.IN_REVIEW,
        actor('replay.wrong-role', ACTOR_ROLES.AUTHOR),
      );
    } catch (error) {
      unauthorized = error;
    }
    assert.equal(unauthorized.code, 'ACTOR_NOT_AUTHORIZED');
    return { selfApproval, unauthorized };
  }

  const replayed = genuinePolicyErrors();
  for (const [label, error] of Object.entries(replayed)) {
    error.code = `PUBLIC_TAMPER_${label}`;
    error.message = `${sensitiveMarker}:${label}:message`;
    error.stack = `${sensitiveMarker}:${label}:stack:C:\\internal\\registry.js`;
    error.cause = { raw: `${sensitiveMarker}:${label}:cause` };
    error.request_payload = { credential: sensitiveMarker };
    error[Symbol(`replay-${label}`)] = sensitiveMarker;
  }
  const wrappedSelfApproval = new Proxy(replayed.selfApproval, {});
  const wrappedUnauthorized = new Proxy(replayed.unauthorized, {});

  const replayCases = [
    {
      action: () => registry.registerAgentPackage(
        trappedProxy(validRequest, 'ownKeys', replayed.selfApproval),
        validAuthor,
      ),
      code: 'INVALID_INPUT',
      operation: 'REGISTER',
    },
    {
      action: () => registry.registerAgentPackage(
        validRequest,
        trappedProxy(validAuthor, 'getOwnPropertyDescriptor', replayed.unauthorized),
      ),
      code: 'INVALID_ACTOR',
      operation: 'REGISTER',
    },
    {
      action: () => registry.transitionApproval(
        trappedProxy(validCommand, 'ownKeys', replayed.selfApproval),
        validReviewer,
      ),
      code: 'INVALID_INPUT',
      operation: 'TRANSITION',
    },
    {
      action: () => registry.transitionApproval(
        validCommand,
        trappedProxy(validReviewer, 'getOwnPropertyDescriptor', replayed.unauthorized),
      ),
      code: 'INVALID_ACTOR',
      operation: 'TRANSITION',
    },
    {
      action: () => registry.registerAgentPackage(
        trappedProxy(validRequest, 'ownKeys', wrappedSelfApproval),
        validAuthor,
      ),
      code: 'INVALID_INPUT',
      operation: 'REGISTER',
    },
    {
      action: () => registry.transitionApproval(
        validCommand,
        trappedProxy(validReviewer, 'getOwnPropertyDescriptor', wrappedUnauthorized),
      ),
      code: 'INVALID_ACTOR',
      operation: 'TRANSITION',
    },
  ];
  for (const replayCase of replayCases) {
    captureRejectedAttempt(replayCase.action, replayCase.code, replayCase.operation);
    assert.equal(
      registry.getAgentPackage(registrationContent.agent_id, registrationContent.version),
      null,
    );
    assert.deepEqual(
      registry.getAgentPackage(transitionContent.agent_id, transitionContent.version),
      transitionSnapshot,
    );
  }

  const getContent = packageContent({
    agent_id: 'proxy.get-snapshot',
    version: '1.0.0',
    created_by: 'proxy.get-author',
  });
  const getRequest = registrationRequest(getContent);
  const getAuthor = actor(getContent.created_by, ACTOR_ROLES.AUTHOR);
  const beforeGetRegistration = registry.listAuditRecords().length;
  const getRegistered = registry.registerAgentPackage(
    trappedProxy(getRequest, 'get', replayed.selfApproval),
    trappedProxy(getAuthor, 'get', replayed.unauthorized),
  );
  assert.equal(getRegistered.approval_status, STATUSES.DRAFT);
  assert.equal(registry.listAuditRecords().length, beforeGetRegistration + 1);
  assert.equal(registry.listAuditRecords().at(-1).reason_code, 'REGISTERED');

  const beforeGetTransition = registry.listAuditRecords().length;
  const getReviewed = registry.transitionApproval(
    trappedProxy({
      agent_id: getContent.agent_id,
      version: getContent.version,
      to_status: STATUSES.IN_REVIEW,
    }, 'get', replayed.selfApproval),
    trappedProxy(actor('proxy.get-reviewer', ACTOR_ROLES.REVIEWER), 'get', replayed.unauthorized),
  );
  assert.equal(getReviewed.approval_status, STATUSES.IN_REVIEW);
  assert.equal(registry.listAuditRecords().length, beforeGetTransition + 1);
  assert.equal(registry.listAuditRecords().at(-1).reason_code, 'STATE_TRANSITIONED');
  assert.doesNotMatch(JSON.stringify(getReviewed), new RegExp(sensitiveMarker));

  const records = registry.listAuditRecords();
  assert(records.every((record) => allowedReasonCodes.has(record.reason_code)));
  assert(records.every((record) => Object.keys(record).join('|') === auditKeys.join('|')));
  assert.deepEqual(
    records.map((record) => record.correlation_id),
    records.map((record) => `reg4-correlation-${String(record.sequence).padStart(10, '0')}`),
  );
  let previous = '0'.repeat(64);
  for (const record of records) {
    assert.equal(record.previous_audit_sha256, previous);
    const body = { ...record };
    delete body.audit_sha256;
    const expected = createHash('sha256')
      .update(Buffer.from(JSON.stringify(body), 'utf8'))
      .digest('hex');
    assert.equal(record.audit_sha256, expected);
    previous = record.audit_sha256;
  }
  assert.equal(
    registry.getAgentPackage(transitionContent.agent_id, transitionContent.version).approval_status,
    STATUSES.DRAFT,
  );
  assert.equal(registry.getAgentPackage(registrationContent.agent_id, registrationContent.version), null);
});
