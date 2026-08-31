const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
  ARTIFACT_TYPES,
  POLICY_ACTIONS,
  RUN_STATES,
  SoftwareFactoryAgentRegistry,
  SoftwareFactoryControlPlane,
  SoftwareFactoryIdentityBoundary,
  SoftwareFactoryMutationGuard,
  SoftwareFactoryStateCoordinator,
  DurableControlPlaneFoundation,
  assertDurableStatePortContract,
  assertKeyProviderContract,
  assertPlainJsonValue,
  validateKeyReference,
  authorizationDecisionDigest,
  getVerifiedKeyAuditEvents,
  keyAuditHash,
  revokeKeyVersion,
  rotateActiveKey,
  assertRuntimeAdapterContract,
  assertStatePortContract,
  createEvidenceEnvelope,
  isAuthorizedExecutionGrant,
  sha256Digest,
  verifyArtifactIntegrity,
  verifyEvidenceEnvelope,
} = require('../src/softwareFactory');
const { stableSerialize } = require('../src/softwareFactory/canonical');

const IDS = Object.freeze({
  orchestrator: 'sf-orchestrator',
  productOwner: 'sf-product-owner',
  architect: 'sf-solution-architect',
  builder: 'sf-backend-domain',
  frontend: 'sf-frontend',
  database: 'sf-database-migration',
  qa: 'sf-qa-uat',
  reviewer: 'sf-independent-reviewer',
  release: 'sf-release-baseline',
});
const STATE_IDEMPOTENCY_KEY = Buffer.alloc(32, 7);

function requirementPayload() {
  return {
    objective: 'Thêm một capability nhỏ không chạm Manufacturing Scheduling.',
    business_context: 'Business OS staging.',
    scope: ['software_factory_core'],
    out_of_scope: ['production_deploy', 'manufacturing_schedule'],
    acceptance_criteria: ['quality gate fail closed'],
    risks: ['permission drift'],
    definition_of_done: ['review PASS', 'test PASS'],
  };
}

function architecturePayload(options = {}) {
  return {
    affected_domains: ['crm'],
    domain_owner: 'crm',
    application_services: ['ExampleApplicationService'],
    orchestration: 'none',
    schema_impact: options.migrationRequired ? 'additive' : 'none',
    api_impact: 'none',
    permission_impact: 'scoped',
    tenant_impact: 'none',
    migration_required: options.migrationRequired === true,
    adr_required: false,
    test_strategy: ['unit', 'permission'],
  };
}

function implementationPayload() {
  return {
    files_changed: ['backend/src/domains/crm/services/example.js'],
    reason: 'Implement approved requirement.',
    implementation_summary: 'Additive application service.',
    tests_added: ['backend/tests/example.test.js'],
    migration_added: false,
    known_risks: [],
  };
}

function reviewPayload(status = 'PASS') {
  return {
    reviewer: IDS.reviewer,
    findings: [],
    severity: 'NONE',
    architectural_conflicts: [],
    security_conflicts: [],
    status,
  };
}

function testPayload(kind = 'AUTOMATED', status = 'PASS', failures = []) {
  return {
    test_kind: kind,
    tests_run: ['software-factory-control-plane'],
    passed: status === 'PASS' ? 1 : 0,
    failed: failures,
    skipped: 0,
    fixture: 'in-memory',
    cleanup: 'not_applicable',
    evidence: ['node:test'],
    status,
  };
}

function releasePayload(label = 'sf-pilot-candidate') {
  return {
    commit: 'PROPOSED',
    tag: 'PROPOSED',
    baseline: label,
    database_state: 'UNCHANGED',
    migration_state: 'NONE',
    backup: 'NOT_REQUIRED_NO_DATABASE_CHANGE',
    recovery_point: 'revert scoped commit',
    approvals: [],
    release_status: 'CANDIDATE',
  };
}

function createRuntimeAdapter() {
  const calls = [];
  return {
    calls,
    canBypassPolicy: false,
    canDeployProduction: false,
    supportsIdempotency: true,
    async invokeTool(request) {
      assert.equal(isAuthorizedExecutionGrant(request.authorization_grant), true);
      calls.push({ phase: 'invoke', request });
      return { ok: true, tool: request.tool, path: request.path };
    },
    async collectEvidence(request) {
      assert.equal(isAuthorizedExecutionGrant(request.authorization_grant), true);
      calls.push({ phase: 'evidence', request });
      return { source: 'authenticated-test-runtime', ok: true };
    },
  };
}

function provenanceFixture({
  type = ARTIFACT_TYPES.REQUIREMENT,
  capturedBy = IDS.productOwner,
  parentIds = [],
  label = 'fixture',
} = {}) {
  const source = { type, captured_by: capturedBy, parent_artifact_ids: parentIds, label };
  return {
    source_type: 'SOFTWARE_FACTORY_TEST_FIXTURE',
    source_refs: [{ ref: 'local-test:' + label, digest: sha256Digest(source) }],
    parent_artifact_ids: parentIds,
    policy_version: 'sf-policy-v1',
    captured_by: capturedBy,
    capture_method: 'TEST_HARNESS',
  };
}

function createGuardedClient(rawControlPlane, actorAgentIds) {
  let requestCounter = 0;
  const nextRequestId = (operation) => {
    requestCounter += 1;
    return 'sf-test-' + operation + '-' + String(requestCounter).padStart(6, '0');
  };
  const provenanceFor = (args, type) => {
    if (args.provenance) return args.provenance;
    const runId = args.run_id || 'new-requirement';
    const artifacts = args.run_id ? rawControlPlane.buildTrace(args.run_id).artifacts : [];
    const parentIds = type === ARTIFACT_TYPES.REQUIREMENT
      ? []
      : artifacts.length
        ? [artifacts.at(-1).artifact_id]
        : [];
    const capturedBy = actorAgentIds.get(args.actor_context) || IDS.productOwner;
    return provenanceFixture({ type, capturedBy, parentIds, label: type + ':' + runId });
  };

  return new Proxy(rawControlPlane, {
    get(target, property) {
      if (property === 'createRequirement') return (args) => target.createRequirement({
        ...args,
        request_id: args.request_id || nextRequestId('create-requirement'),
        expected_factory_revision: args.expected_factory_revision ?? target.getFactoryRevision(),
        provenance: provenanceFor(args, ARTIFACT_TYPES.REQUIREMENT),
      });
      if (property === 'createArtifact') return (args) => target.createArtifact({
        ...args,
        request_id: args.request_id || nextRequestId('create-artifact'),
        expected_revision: args.expected_revision ?? target.getRun(args.run_id).revision,
        provenance: provenanceFor(args, args.type),
      });
      if (['transition', 'handoff', 'issueFounderApproval', 'recordFounderApproval'].includes(property)) {
        return (args) => target[property]({
          ...args,
          request_id: args.request_id || nextRequestId(String(property)),
          expected_revision: args.expected_revision ?? target.getRun(args.run_id).revision,
        });
      }
      if (property === 'executeAuthorizedAction') return (args) => target.executeAuthorizedAction({
        ...args,
        request_id: args.request_id || nextRequestId('execute-action'),
        expected_revision: args.expected_revision ?? target.getRun(args.run_id).revision,
      });
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function createHarness(options = {}) {
  const clock = options.clock || (() => new Date());
  const principals = new Map();
  const tokens = {};
  for (const [name, agentId] of Object.entries(IDS)) {
    const token = `trusted-agent-token:${name}`;
    tokens[name] = token;
    principals.set(token, {
      principal_type: 'software_factory_agent',
      principal_id: `principal:${name}`,
      agent_instance_id: `instance:${name}`,
      agent_id: agentId,
    });
  }
  tokens.founder = 'trusted-human-token:founder';
  tokens.authorizedRelease = 'trusted-human-token:authorized-release';
  tokens.businessAI = 'business-ai-token';
  principals.set(tokens.founder, {
    principal_type: 'human',
    principal_id: 'human:founder',
    authority: 'FOUNDER',
  });
  principals.set(tokens.authorizedRelease, {
    principal_type: 'human',
    principal_id: 'human:release-approver',
    authority: 'AUTHORIZED_RELEASE_APPROVER',
  });
  principals.set(tokens.businessAI, {
    principal_type: 'business_ai',
    principal_id: 'business-ai:crm',
  });

  const registry = new SoftwareFactoryAgentRegistry();
  const identityBoundary = new SoftwareFactoryIdentityBoundary({
    clock,
    contextTtlMs: 30 * 60 * 1000,
    resolveTrustedPrincipal(assertion) {
      return principals.get(assertion?.token) || null;
    },
  });
  const actors = Object.fromEntries(Object.keys(IDS).map((name) => [
    name,
    identityBoundary.authenticateAgent({ token: tokens[name] }),
  ]));
  const humans = {
    founder: identityBoundary.authenticateHuman({ token: tokens.founder }),
    authorizedRelease: identityBoundary.authenticateHuman({ token: tokens.authorizedRelease }),
  };
  const rawControlPlane = new SoftwareFactoryControlPlane({
    registry,
    identityBoundary,
    runtimeAdapter: options.runtimeAdapter || null,
    clock,
  });
  const actorAgentIds = new WeakMap(Object.entries(actors).map(([name, context]) => [context, IDS[name]]));
  const controlPlane = createGuardedClient(rawControlPlane, actorAgentIds);
  return { actors, controlPlane, humans, identityBoundary, rawControlPlane, registry, tokens };
}

function createRun(harness, options = {}) {
  return harness.controlPlane.createRequirement({
    actor_context: harness.actors.productOwner,
    payload: requirementPayload(),
    uat_required: options.uatRequired ?? true,
  });
}

function advanceToBuilding(harness, options = {}) {
  const created = createRun(harness);
  const { controlPlane, actors } = harness;
  const runId = created.run.run_id;
  controlPlane.transition({ actor_context: actors.productOwner, run_id: runId, to_state: RUN_STATES.ANALYZED });
  controlPlane.createArtifact({
    actor_context: actors.architect,
    run_id: runId,
    type: ARTIFACT_TYPES.ARCHITECTURE,
    payload: architecturePayload(options),
  });
  controlPlane.transition({ actor_context: actors.architect, run_id: runId, to_state: RUN_STATES.ARCHITECTURE_APPROVED });
  controlPlane.transition({ actor_context: actors.orchestrator, run_id: runId, to_state: RUN_STATES.READY_TO_BUILD });
  controlPlane.transition({
    actor_context: options.builderContext || actors.builder,
    run_id: runId,
    to_state: RUN_STATES.BUILDING,
  });
  return { ...created, runId };
}

function advanceToReview(harness) {
  const created = advanceToBuilding(harness);
  const { controlPlane, actors } = harness;
  controlPlane.createArtifact({ actor_context: actors.builder, run_id: created.runId, type: ARTIFACT_TYPES.IMPLEMENTATION, payload: implementationPayload() });
  controlPlane.transition({ actor_context: actors.builder, run_id: created.runId, to_state: RUN_STATES.BUILT });
  controlPlane.transition({ actor_context: actors.orchestrator, run_id: created.runId, to_state: RUN_STATES.IN_REVIEW });
  return created;
}

function advanceToTesting(harness) {
  const created = advanceToReview(harness);
  const { controlPlane, actors } = harness;
  controlPlane.createArtifact({ actor_context: actors.reviewer, run_id: created.runId, type: ARTIFACT_TYPES.REVIEW, payload: reviewPayload('PASS') });
  controlPlane.transition({ actor_context: actors.reviewer, run_id: created.runId, to_state: RUN_STATES.REVIEW_PASSED });
  controlPlane.transition({ actor_context: actors.qa, run_id: created.runId, to_state: RUN_STATES.TESTING });
  return created;
}

function advanceToAwaitingFounder(harness, label) {
  const created = advanceToTesting(harness);
  const { controlPlane, actors } = harness;
  controlPlane.createArtifact({ actor_context: actors.qa, run_id: created.runId, type: ARTIFACT_TYPES.TEST, payload: testPayload('AUTOMATED', 'PASS') });
  controlPlane.transition({ actor_context: actors.qa, run_id: created.runId, to_state: RUN_STATES.TEST_PASSED });
  controlPlane.transition({ actor_context: actors.qa, run_id: created.runId, to_state: RUN_STATES.UAT_READY });
  controlPlane.createArtifact({ actor_context: actors.qa, run_id: created.runId, type: ARTIFACT_TYPES.TEST, payload: testPayload('UAT', 'PASS') });
  controlPlane.transition({ actor_context: actors.qa, run_id: created.runId, to_state: RUN_STATES.UAT_PASSED });
  controlPlane.createArtifact({ actor_context: actors.release, run_id: created.runId, type: ARTIFACT_TYPES.RELEASE, payload: releasePayload(label) });
  controlPlane.transition({ actor_context: actors.release, run_id: created.runId, to_state: RUN_STATES.RELEASE_CANDIDATE });
  controlPlane.transition({ actor_context: actors.release, run_id: created.runId, to_state: RUN_STATES.AWAITING_FOUNDER_APPROVAL });
  return created;
}

test('1. Caller không thể tự khai hoặc clone Software Factory identity', () => {
  const h = createHarness();
  assert.throws(() => h.controlPlane.authorizeAction({
    identity: { agent_id: IDS.builder, identity_namespace: 'software_factory' },
    tool: 'source.write',
    path: 'backend/src/domains/crm/services/example.js',
    context: { domain: 'crm' },
  }), (error) => error.code === 'CALLER_IDENTITY_DENIED');
  assert.throws(() => h.controlPlane.authorizeAction({
    actor_context: { ...h.actors.builder },
    tool: 'source.write',
    path: 'backend/src/domains/crm/services/example.js',
    context: { domain: 'crm' },
  }), (error) => error.code === 'AUTHENTICATED_CONTEXT_REQUIRED');
});

test('2. Business AI principal không thể authenticate thành Software Factory Agent', () => {
  const h = createHarness();
  assert.throws(() => h.identityBoundary.authenticateAgent({ token: h.tokens.businessAI }),
    (error) => error.code === 'SOFTWARE_FACTORY_AGENT_AUTHENTICATION_DENIED');
});

test('3. Builder không thể tự tạo human approval', () => {
  const h = createHarness();
  const created = advanceToAwaitingFounder(h);
  assert.throws(() => h.controlPlane.issueFounderApproval({
    human_context: h.actors.builder,
    run_id: created.runId,
    approved: true,
  }), (error) => error.code === 'AUTHENTICATED_CONTEXT_REQUIRED');
});

test('4. Builder không thể trở thành Reviewer cho chính run', () => {
  const h = createHarness();
  const created = advanceToReview(h);
  assert.throws(() => h.controlPlane.createArtifact({
    actor_context: h.actors.builder,
    run_id: created.runId,
    type: ARTIFACT_TYPES.REVIEW,
    payload: reviewPayload('PASS'),
  }), (error) => error.code === 'ARTIFACT_ACTOR_DENIED');
});

test('5. QA không thể sửa ImplementationArtifact', () => {
  const h = createHarness();
  const created = advanceToBuilding(h);
  assert.throws(() => h.controlPlane.createArtifact({
    actor_context: h.actors.qa,
    run_id: created.runId,
    type: ARTIFACT_TYPES.IMPLEMENTATION,
    payload: implementationPayload(),
  }), (error) => error.code === 'ARTIFACT_ACTOR_DENIED');
});

test('6. Independent Reviewer có thể BLOCK run với evidence', () => {
  const h = createHarness();
  const created = advanceToReview(h);
  h.controlPlane.createArtifact({ actor_context: h.actors.reviewer, run_id: created.runId, type: ARTIFACT_TYPES.REVIEW, payload: reviewPayload('BLOCKED') });
  const run = h.controlPlane.transition({ actor_context: h.actors.reviewer, run_id: created.runId, to_state: RUN_STATES.BLOCKED });
  assert.equal(run.status, RUN_STATES.BLOCKED);
});

test('7. Release không thể đi tiếp khi automated test FAIL', () => {
  const h = createHarness();
  const created = advanceToTesting(h);
  h.controlPlane.createArtifact({ actor_context: h.actors.qa, run_id: created.runId, type: ARTIFACT_TYPES.TEST, payload: testPayload('AUTOMATED', 'FAIL', ['case-1']) });
  h.controlPlane.transition({ actor_context: h.actors.qa, run_id: created.runId, to_state: RUN_STATES.FAILED });
  assert.throws(() => h.controlPlane.transition({ actor_context: h.actors.release, run_id: created.runId, to_state: RUN_STATES.RELEASE_CANDIDATE }),
    (error) => error.code === 'INVALID_GATE_TRANSITION');
});

test('8. Không thể skip Quality Gate', () => {
  const h = createHarness();
  const created = createRun(h);
  assert.throws(() => h.controlPlane.transition({ actor_context: h.actors.builder, run_id: created.run.run_id, to_state: RUN_STATES.BUILDING }),
    (error) => error.code === 'INVALID_GATE_TRANSITION');
});

test('9. Production deploy và staging/production database write mặc định DENY', () => {
  const h = createHarness();
  for (const tool of ['deploy.production', 'database.staging.migrate', 'database.production.migrate', 'database.staging.write', 'database.production.write', 'database.write']) {
    const actor = tool.includes('database') ? h.actors.database : h.actors.release;
    const decision = h.controlPlane.authorizeAction({ actor_context: actor, tool });
    assert.equal(decision.allowed, false, tool);
    assert.equal(decision.reason_code, 'DANGEROUS_ACTION_DENIED', tool);
  }
});

test('10. Agent không thể vượt allowed_paths', () => {
  const h = createHarness();
  const denied = h.controlPlane.authorizeAction({ actor_context: h.actors.builder, tool: 'source.write', path: 'frontend/src/App.jsx', context: { domain: 'crm' } });
  const allowed = h.controlPlane.authorizeAction({ actor_context: h.actors.builder, tool: 'source.write', path: 'backend/src/domains/crm/services/example.js', context: { domain: 'crm' } });
  assert.equal(denied.allowed, false);
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.action, POLICY_ACTIONS.MODIFY_CODE);
});

test('11. Caller không được tự khai action và Agent không sửa policy', () => {
  const h = createHarness();
  const declared = h.controlPlane.authorizeAction({
    actor_context: h.actors.builder,
    tool: 'source.write',
    action: POLICY_ACTIONS.MODIFY_TEST_CODE,
    path: 'backend/src/domains/crm/services/example.js',
    context: { domain: 'crm' },
  });
  const policyChange = h.controlPlane.authorizeAction({ actor_context: h.actors.builder, tool: 'agent.policy.modify' });
  assert.equal(declared.reason_code, 'CALLER_DECLARED_ACTION_DENIED');
  assert.equal(policyChange.reason_code, 'DANGEROUS_ACTION_DENIED');
  assert.equal(Object.isFrozen(h.controlPlane.getAgentDefinition(IDS.builder)), true);
});

test('12. Write tool bắt buộc có path; Builder không thể phân loại test thành source code', () => {
  const h = createHarness();
  const missingPath = h.controlPlane.authorizeAction({ actor_context: h.actors.builder, tool: 'source.write', context: { domain: 'crm' } });
  const testRewrite = h.controlPlane.authorizeAction({ actor_context: h.actors.builder, tool: 'source.write', path: 'backend/tests/security.test.js', context: { domain: 'crm' } });
  assert.equal(missingPath.reason_code, 'PATH_REQUIRED');
  assert.equal(testRewrite.reason_code, 'ACTION_PATH_CLASSIFICATION_MISMATCH');
});

test('13. Transition thành công có audit hash chain hợp lệ nhưng ledger không lộ mutator', () => {
  const h = createHarness();
  const created = createRun(h);
  h.controlPlane.transition({ actor_context: h.actors.productOwner, run_id: created.run.run_id, to_state: RUN_STATES.ANALYZED });
  const transitions = h.controlPlane.getAuditEntries({ run_id: created.run.run_id, event_type: 'QUALITY_GATE_TRANSITION' });
  assert.equal(transitions.length, 1);
  assert.equal(transitions[0].metadata.from_state, RUN_STATES.REQUESTED);
  assert.equal(h.controlPlane.verifyAuditChain(), true);
  assert.equal(h.controlPlane.audit, undefined);
});

test('14. Artifact bắt buộc gắn đúng Requirement và Agent Run', () => {
  const h = createHarness();
  const first = createRun(h);
  const second = createRun(h);
  assert.throws(() => h.controlPlane.handoff({
    actor_context: h.actors.productOwner,
    to_agent_id: IDS.architect,
    run_id: second.run.run_id,
    artifact_ids: [first.artifact.artifact_id],
  }), (error) => error.code === 'HANDOFF_ARTIFACT_SCOPE_MISMATCH');
});

test('15. Release Candidate truy ngược Requirement → Build → Review → Test', () => {
  const h = createHarness();
  const created = advanceToAwaitingFounder(h);
  const trace = h.controlPlane.buildTrace(created.runId);
  const types = new Set(trace.artifacts.map((artifact) => artifact.artifact_type));
  for (const type of Object.values(ARTIFACT_TYPES)) assert.ok(types.has(type), type);
  assert.equal(trace.run.status, RUN_STATES.AWAITING_FOUNDER_APPROVAL);
});

test('16. Manufacturing Scheduling baseline path luôn BLOCKED_BY_BASELINE_DEPENDENCY', () => {
  const h = createHarness();
  const decision = h.controlPlane.authorizeAction({
    actor_context: h.actors.database,
    tool: 'migration.create',
    path: 'database/588_manufacturing_schedule_profile_audit.sql',
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason_code, 'BLOCKED_BY_BASELINE_DEPENDENCY');
});

test('17. Tool ghi cần Approved Architecture và Builder đang ở BUILDING', async () => {
  const runtimeAdapter = createRuntimeAdapter();
  const h = createHarness({ runtimeAdapter });
  const created = createRun(h);
  await assert.rejects(() => h.controlPlane.executeAuthorizedAction({
    actor_context: h.actors.builder,
    requirement_id: created.requirement.requirement_id,
    run_id: created.run.run_id,
    tool: 'source.write',
    path: 'backend/src/domains/crm/services/example.js',
    context: { domain: 'crm' },
  }), (error) => error.code === 'APPROVED_BUILD_GATE_REQUIRED');
  assert.equal(runtimeAdapter.calls.length, 0);
});

test('18. Destructive/force-push/weaken-gate tools đều bị deny', () => {
  const h = createHarness();
  for (const tool of [
    'database.destructive', 'production.data.delete', 'tenant.isolation.disable',
    'migration.history.rewrite', 'git.force_push', 'baseline.protected.change',
    'test.failing.remove', 'quality_gate.weaken', 'quality_gate.bypass', 'domain_rules.bypass',
  ]) {
    const decision = h.controlPlane.authorizeAction({ actor_context: h.actors.release, tool });
    assert.equal(decision.reason_code, 'DANGEROUS_ACTION_DENIED', tool);
  }
});

test('19. Remediation loop tăng build_cycle và không dùng trực tiếp ReviewArtifact cũ', () => {
  const h = createHarness();
  const created = advanceToTesting(h);
  h.controlPlane.createArtifact({ actor_context: h.actors.qa, run_id: created.runId, type: ARTIFACT_TYPES.TEST, payload: testPayload('AUTOMATED', 'FAIL', ['case-1']) });
  h.controlPlane.transition({ actor_context: h.actors.qa, run_id: created.runId, to_state: RUN_STATES.FAILED });
  h.controlPlane.transition({ actor_context: h.actors.orchestrator, run_id: created.runId, to_state: RUN_STATES.READY_TO_BUILD });
  const rebuilding = h.controlPlane.transition({ actor_context: h.actors.builder, run_id: created.runId, to_state: RUN_STATES.BUILDING });
  assert.equal(rebuilding.build_cycle, 2);
  h.controlPlane.createArtifact({ actor_context: h.actors.builder, run_id: created.runId, type: ARTIFACT_TYPES.IMPLEMENTATION, payload: implementationPayload() });
  h.controlPlane.transition({ actor_context: h.actors.builder, run_id: created.runId, to_state: RUN_STATES.BUILT });
  h.controlPlane.transition({ actor_context: h.actors.orchestrator, run_id: created.runId, to_state: RUN_STATES.IN_REVIEW });
  assert.throws(() => h.controlPlane.transition({ actor_context: h.actors.reviewer, run_id: created.runId, to_state: RUN_STATES.REVIEW_PASSED }),
    (error) => error.code === 'REVIEW_ARTIFACT_REQUIRED');
});

test('20. Agent không được handoff artifact do Agent khác tạo', () => {
  const h = createHarness();
  const created = createRun(h);
  h.controlPlane.transition({ actor_context: h.actors.productOwner, run_id: created.run.run_id, to_state: RUN_STATES.ANALYZED });
  const architecture = h.controlPlane.createArtifact({ actor_context: h.actors.architect, run_id: created.run.run_id, type: ARTIFACT_TYPES.ARCHITECTURE, payload: architecturePayload() });
  assert.throws(() => h.controlPlane.handoff({ actor_context: h.actors.productOwner, to_agent_id: IDS.architect, run_id: created.run.run_id, artifact_ids: [architecture.artifact_id] }),
    (error) => error.code === 'HANDOFF_ARTIFACT_OWNERSHIP_MISMATCH');
});

test('21. Direct tool recording bị khóa; QA test.write chỉ chạy qua authorized gateway', async () => {
  const runtimeAdapter = createRuntimeAdapter();
  const h = createHarness({ runtimeAdapter });
  const created = advanceToTesting(h);
  assert.throws(() => h.controlPlane.recordToolInvocation({}), (error) => error.code === 'DIRECT_TOOL_RECORDING_DENIED');
  const outcome = await h.controlPlane.executeAuthorizedAction({
    actor_context: h.actors.qa,
    requirement_id: created.requirement.requirement_id,
    run_id: created.runId,
    tool: 'test.write',
    path: 'backend/tests/software-factory-extra.test.js',
  });
  assert.equal(outcome.result.ok, true);
  assert.equal(runtimeAdapter.calls.length, 2);
});

test('22. Single gateway tạo opaque execution grant sau policy + run gate', async () => {
  const runtimeAdapter = createRuntimeAdapter();
  const h = createHarness({ runtimeAdapter });
  const created = advanceToBuilding(h);
  const outcome = await h.controlPlane.executeAuthorizedAction({
    actor_context: h.actors.builder,
    requirement_id: created.requirement.requirement_id,
    run_id: created.runId,
    tool: 'source.write',
    path: 'backend/src/domains/crm/services/example.js',
    context: { domain: 'crm' },
    input: { patch: 'test-only' },
  });
  assert.equal(outcome.evidence.source, 'authenticated-test-runtime');
  assert.equal(runtimeAdapter.calls[0].request.authorization_grant.agent_id, IDS.builder);
});

test('23. Runtime Adapter không được cung cấp identity hoặc bypass policy', () => {
  assert.throws(() => assertRuntimeAdapterContract({
    getIdentity() { return { agent_id: IDS.release }; },
    async invokeTool() {},
    async collectEvidence() {},
  }), (error) => error.code === 'RUNTIME_IDENTITY_PROVIDER_DENIED');
  assert.throws(() => assertRuntimeAdapterContract({
    canBypassPolicy: true,
    async invokeTool() {},
    async collectEvidence() {},
  }), (error) => error.code === 'RUNTIME_ADAPTER_PRIVILEGE_DENIED');
  assert.throws(() => assertRuntimeAdapterContract({
    async invokeTool() {},
    async collectEvidence() {},
  }), (error) => error.code === 'RUNTIME_IDEMPOTENCY_REQUIRED');
});

test('24. Internal run state không thể bị đổi qua public property', () => {
  const h = createHarness();
  const created = createRun(h);
  h.controlPlane._runs = new Map([[created.run.run_id, { status: RUN_STATES.BASELINED }]]);
  assert.equal(h.controlPlane.getRun(created.run.run_id).status, RUN_STATES.REQUESTED);
});

test('25. Founder approval có nonce, expiry, digest binding và one-time protection', () => {
  const h = createHarness();
  const created = advanceToAwaitingFounder(h);
  const token = h.controlPlane.issueFounderApproval({
    human_context: h.humans.founder,
    run_id: created.runId,
    approved: true,
  });
  assert.ok(token.nonce);
  assert.ok(token.issued_at);
  assert.ok(token.expires_at);
  assert.ok(token.release_artifact_id);
  assert.ok(token.target_digest);
  const approval = h.controlPlane.recordFounderApproval({ run_id: created.runId, approval_token: token });
  assert.equal(approval.status, 'APPROVED');
  assert.throws(() => h.controlPlane.recordFounderApproval({ run_id: created.runId, approval_token: token }),
    (error) => error.code === 'APPROVAL_REPLAY_DENIED');
});

test('26. Approval cho ReleaseArtifact A không dùng được cho ReleaseArtifact B', () => {
  const h = createHarness();
  const first = advanceToAwaitingFounder(h, 'candidate-A');
  const second = advanceToAwaitingFounder(h, 'candidate-B');
  const token = h.controlPlane.issueFounderApproval({ human_context: h.humans.authorizedRelease, run_id: first.runId, approved: true });
  assert.throws(() => h.controlPlane.recordFounderApproval({ run_id: second.runId, approval_token: token }),
    (error) => error.code === 'APPROVAL_TARGET_MISMATCH');
  assert.equal(h.controlPlane.recordFounderApproval({ run_id: first.runId, approval_token: token }).status, 'APPROVED');
});

test('27. Approval hết hạn và token giả đều bị deny', () => {
  let nowMs = Date.parse('2026-08-30T08:00:00.000Z');
  const h = createHarness({ clock: () => new Date(nowMs) });
  const created = advanceToAwaitingFounder(h);
  const token = h.controlPlane.issueFounderApproval({ human_context: h.humans.founder, run_id: created.runId, approved: true, ttl_ms: 1000 });
  nowMs += 1001;
  assert.throws(() => h.controlPlane.recordFounderApproval({ run_id: created.runId, approval_token: token }),
    (error) => error.code === 'APPROVAL_TOKEN_EXPIRED');
  assert.throws(() => h.controlPlane.recordFounderApproval({ run_id: created.runId, approval_token: { ...token, nonce: 'forged' } }),
    (error) => error.code === 'APPROVAL_TOKEN_INVALID');
});

test('28. Tool request phải khớp đúng Requirement/Run trước khi runtime được gọi', async () => {
  const runtimeAdapter = createRuntimeAdapter();
  const h = createHarness({ runtimeAdapter });
  const created = advanceToBuilding(h);
  await assert.rejects(() => h.controlPlane.executeAuthorizedAction({
    actor_context: h.actors.builder,
    requirement_id: 'sf-req-wrong',
    run_id: created.runId,
    tool: 'source.write',
    path: 'backend/src/domains/crm/services/example.js',
    context: { domain: 'crm' },
  }), (error) => error.code === 'TOOL_REQUIREMENT_RUN_MISMATCH');
  assert.equal(runtimeAdapter.calls.length, 0);
});

class LocalTestStatePort {
  constructor() {
    this.checkpoints = new Map();
    this.receipts = new Map();
    this.isProductionAdapter = false;
  }

  readCheckpoint(scopeId) {
    return this.checkpoints.get(scopeId) || null;
  }

  readReceipt(scopeId, requestId) {
    return this.receipts.get(scopeId + ':' + requestId) || null;
  }

  commitMutation({ scope_id: scopeId, expected_revision: expectedRevision, checkpoint, receipt }) {
    const currentRevision = this.readCheckpoint(scopeId)?.revision || 0;
    if (currentRevision !== expectedRevision) return { committed: false };
    this.checkpoints.set(scopeId, checkpoint);
    this.receipts.set(scopeId + ':' + receipt.request_id, receipt);
    return { committed: true };
  }
}

function plainClone(value) {
  return value === null || value === undefined ? value : JSON.parse(JSON.stringify(value));
}

class LocalTestKeyProvider {
  #activeVersion;
  #audit;
  #keys;

  constructor() {
    this.#keys = new Map();
    this.#audit = [];
    this.#activeVersion = 1;
    this.#keys.set(1, {
      descriptor: {
        key_id: 'sf2b-test-idempotency',
        version: 1,
        algorithm: 'HMAC-SHA-256',
        purpose: 'SOFTWARE_FACTORY_IDEMPOTENCY',
        status: 'ACTIVE',
      },
      key: Buffer.alloc(32, 41),
    });
    this.#appendAudit({
      event_type: 'KEY_CREATED',
      key_version: 1,
      previous_version: null,
      actor_id: 'sf2b-test-bootstrap',
      reason: 'create isolated test key',
    });
  }

  #appendAudit({ event_type: eventType, key_version: keyVersion, previous_version: previousVersion, actor_id: actorId, reason }) {
    const previous = this.#audit.at(-1) || null;
    const base = {
      audit_schema_version: '1.0.0',
      sequence: this.#audit.length + 1,
      timestamp: new Date(Date.UTC(2026, 7, 30, 0, 0, this.#audit.length)).toISOString(),
      event_type: eventType,
      key_id: 'sf2b-test-idempotency',
      key_version: keyVersion,
      previous_version: previousVersion,
      actor_id: actorId,
      reason,
      previous_hash: previous?.hash || null,
    };
    this.#audit.push({ ...base, hash: keyAuditHash(base) });
  }

  async getActiveKey() {
    return plainClone(this.#keys.get(this.#activeVersion).descriptor);
  }

  async getKey({ key_id: keyId, version }) {
    const record = this.#keys.get(version);
    if (!record || keyId !== record.descriptor.key_id) throw new Error('unknown test key');
    return plainClone(record.descriptor);
  }

  async sign({ key_reference: reference, value }) {
    const record = this.#keys.get(reference.version);
    if (!record || record.descriptor.status !== 'ACTIVE') throw new Error('test key cannot sign');
    return 'hmac-sha256:' + crypto.createHmac('sha256', record.key)
      .update(stableSerialize(value))
      .digest('hex');
  }

  async verify({ key_reference: reference, value, digest }) {
    const record = this.#keys.get(reference.version);
    if (!record || record.descriptor.status === 'REVOKED') return false;
    const expected = 'hmac-sha256:' + crypto.createHmac('sha256', record.key)
      .update(stableSerialize(value))
      .digest('hex');
    if (typeof digest !== 'string' || digest.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(expected));
  }

  async listAuditEvents() {
    return plainClone(this.#audit);
  }

  async rotateKey({ previous_reference: previousReference, actor_id: actorId, reason }) {
    const previous = this.#keys.get(this.#activeVersion);
    if (previousReference.version !== this.#activeVersion) throw new Error('stale rotation reference');
    previous.descriptor.status = 'VERIFY_ONLY';
    const nextVersion = this.#activeVersion + 1;
    this.#keys.set(nextVersion, {
      descriptor: {
        key_id: previous.descriptor.key_id,
        version: nextVersion,
        algorithm: 'HMAC-SHA-256',
        purpose: 'SOFTWARE_FACTORY_IDEMPOTENCY',
        status: 'ACTIVE',
      },
      key: Buffer.alloc(32, 41 + nextVersion),
    });
    this.#activeVersion = nextVersion;
    this.#appendAudit({
      event_type: 'KEY_ROTATED',
      key_version: nextVersion,
      previous_version: nextVersion - 1,
      actor_id: actorId,
      reason,
    });
    return plainClone(this.#keys.get(nextVersion).descriptor);
  }

  async revokeKey({ key_reference: keyReference, actor_id: actorId, reason }) {
    const record = this.#keys.get(keyReference.version);
    if (!record) throw new Error('unknown test key');
    record.descriptor.status = 'REVOKED';
    this.#appendAudit({
      event_type: 'KEY_REVOKED',
      key_version: keyReference.version,
      previous_version: null,
      actor_id: actorId,
      reason,
    });
    return plainClone(record.descriptor);
  }
}

class LocalDurableTestPort {
  constructor() {
    this.scopes = new Map();
    this.fault = null;
    this.commitCount = 0;
    this.isProductionAdapter = false;
  }

  getCapabilities() {
    return {
      contract_version: '1.0.0',
      atomic_state_checkpoint_receipt_audit_idempotency_evidence_seal: true,
      compare_and_swap: true,
      unique_scope_request: true,
      consistent_recovery_read: true,
      async_methods: true,
      production_ready: false,
    };
  }

  scope(scopeId) {
    if (!this.scopes.has(scopeId)) {
      this.scopes.set(scopeId, {
        currentState: null,
        currentCheckpoint: null,
        states: new Map(),
        checkpoints: new Map(),
        receipts: new Map(),
        idempotency: new Map(),
        evidence: new Map(),
        seals: new Map(),
        audits: [],
      });
    }
    return this.scopes.get(scopeId);
  }

  async readScopeState(scopeId) {
    return plainClone(this.scope(scopeId).currentState);
  }

  async readCheckpoint(scopeId, revision = null) {
    const scope = this.scope(scopeId);
    return plainClone(revision === null ? scope.currentCheckpoint : scope.checkpoints.get(revision) || null);
  }

  async readReceipt(scopeId, requestId) {
    return plainClone(this.scope(scopeId).receipts.get(requestId) || null);
  }

  async readAuditEntries(scopeId) {
    return plainClone(this.scope(scopeId).audits);
  }

  async readIdempotencyRecord(scopeId, requestId) {
    return plainClone(this.scope(scopeId).idempotency.get(requestId) || null);
  }

  async readEvidenceRecord(scopeId, requestId) {
    return plainClone(this.scope(scopeId).evidence.get(requestId) || null);
  }

  async readTransactionSeal(scopeId, requestId) {
    return plainClone(this.scope(scopeId).seals.get(requestId) || null);
  }

  async readRecoverySnapshot({ scope_id: scopeId, request_id: requestId }) {
    const scope = this.scope(scopeId);
    const receipt = scope.receipts.get(requestId) || null;
    const audit = scope.audits.find((entry) => entry.request_id === requestId) || null;
    const revision = receipt?.committed_revision || audit?.revision || null;
    const currentRequestId = scope.audits.at(-1)?.request_id || null;
    return plainClone({
      scope_id: scopeId,
      request_id: requestId,
      state_record: scope.currentState,
      checkpoint: scope.currentCheckpoint,
      transaction_state_record: revision === null ? null : scope.states.get(revision) || null,
      transaction_checkpoint: revision === null ? null : scope.checkpoints.get(revision) || null,
      receipt,
      idempotency_record: scope.idempotency.get(requestId) || null,
      evidence_record: scope.evidence.get(requestId) || null,
      transaction_seal: scope.seals.get(requestId) || null,
      current_transaction_seal: [...scope.seals.values()].find((seal) => (
        seal.transaction_id === scope.currentState?.transaction_id
      )) || null,
      current_receipt: currentRequestId ? scope.receipts.get(currentRequestId) || null : null,
      current_idempotency_record: currentRequestId ? scope.idempotency.get(currentRequestId) || null : null,
      current_evidence_record: currentRequestId ? scope.evidence.get(currentRequestId) || null : null,
      history_record_sets: scope.audits.map((entry) => ({
        state_record: scope.states.get(entry.revision) || null,
        checkpoint: scope.checkpoints.get(entry.revision) || null,
        receipt: scope.receipts.get(entry.request_id) || null,
        idempotency_record: scope.idempotency.get(entry.request_id) || null,
        evidence_record: scope.evidence.get(entry.request_id) || null,
        transaction_seal: scope.seals.get(entry.request_id) || null,
      })),
      audit_entries: scope.audits,
    });
  }

  applyBundle(bundle) {
    const scope = this.scope(bundle.scope_id);
    scope.currentState = plainClone(bundle.state_record);
    scope.currentCheckpoint = plainClone(bundle.checkpoint);
    scope.states.set(bundle.next_revision, plainClone(bundle.state_record));
    scope.checkpoints.set(bundle.next_revision, plainClone(bundle.checkpoint));
    scope.receipts.set(bundle.request_id, plainClone(bundle.receipt));
    scope.idempotency.set(bundle.request_id, plainClone(bundle.idempotency_record));
    scope.evidence.set(bundle.request_id, plainClone(bundle.evidence_record));
    scope.seals.set(bundle.request_id, plainClone(bundle.transaction_seal));
    scope.audits.push(plainClone(bundle.audit_event));
    this.commitCount += 1;
  }

  async commitAtomicMutation(bundle) {
    const { bundle_digest: ignored, ...unsigned } = bundle;
    if (bundle.bundle_digest !== sha256Digest(unsigned)) return { status: 'INVALID_BUNDLE' };
    const scope = this.scope(bundle.scope_id);
    const currentRevision = scope.currentState?.revision || 0;
    if (this.fault === 'force_conflict' || currentRevision !== bundle.expected_revision) {
      return { status: 'CONFLICT', current_revision: currentRevision };
    }
    if (scope.receipts.has(bundle.request_id) || scope.idempotency.has(bundle.request_id)) {
      return { status: 'CONFLICT', current_revision: currentRevision };
    }
    if (this.fault === 'unknown_without_commit') return { status: 'UNKNOWN' };
    if (this.fault === 'receipt_only_then_unknown') {
      scope.receipts.set(bundle.request_id, plainClone(bundle.receipt));
      return { status: 'UNKNOWN' };
    }
    this.applyBundle(bundle);
    if (this.fault === 'commit_then_throw') throw new Error('simulated lost acknowledgement');
    if (this.fault === 'same_request_won_race') {
      return { status: 'CONFLICT', current_revision: bundle.next_revision };
    }
    return { status: 'COMMITTED', current_revision: bundle.next_revision };
  }

  setFault(fault) {
    this.fault = fault;
  }

  tamper(scopeId, mutate) {
    mutate(this.scope(scopeId));
  }
}

const ISSUED_DURABLE_AUTHORIZATION_DIGESTS = new Set();
const LOCAL_AUTHORIZATION_VERIFIER = Object.freeze({
  async verifyDecision({ decision, binding }) {
    return ISSUED_DURABLE_AUTHORIZATION_DIGESTS.has(decision.decision_digest)
      && decision.scope_id === binding.scope_id
      && decision.request_id === binding.request_id
      && decision.operation === binding.operation;
  },
});

function durableAuthorization({ scopeId, requestId, requirementId, actorId, policyVersion, operation }) {
  const base = {
    authorization_schema_version: '1.0.0',
    decision_id: 'sf2b-decision-' + requestId,
    scope_id: scopeId,
    request_id: requestId,
    requirement_id: requirementId,
    operation,
    agent_id: actorId,
    principal_id: 'founder-delegated-principal',
    policy_version: policyVersion,
    outcome: 'ALLOW',
    issued_at: '2026-08-30T00:00:00.000Z',
  };
  const decision = Object.freeze({ ...base, decision_digest: sha256Digest(base) });
  ISSUED_DURABLE_AUTHORIZATION_DIGESTS.add(decision.decision_digest);
  return decision;
}

function createDurableTestControl(port, keyProvider = new LocalTestKeyProvider()) {
  return new DurableControlPlaneFoundation({
    port,
    key_provider: keyProvider,
    authorization_verifier: LOCAL_AUTHORIZATION_VERIFIER,
  });
}

function durableCommand({
  scopeId = 'sf2b-scope',
  requestId = 'sf2b-request-1',
  requirementId = 'sf2b-requirement-1',
  actorId = IDS.productOwner,
  expectedRevision = 0,
  input = { action: 'SAVE_DURABLE_STATE' },
  nextState = { status: 'DURABLE_READY' },
  policyVersion = 'sf-policy-v2',
} = {}) {
  const operation = 'SAVE_DURABLE_STATE';
  const authorization = durableAuthorization({
    scopeId,
    requestId,
    requirementId,
    actorId,
    policyVersion,
    operation,
  });
  const source = { scopeId, requestId, requirementId };
  const evidence = createEvidenceEnvelope({
    evidence_type: 'DURABLE_MUTATION_EVIDENCE',
    subject: scopeId + ':' + requestId,
    provenance: {
      source_type: 'SF2B_TEST_FIXTURE',
      source_refs: [{ ref: 'local-test:' + requestId, digest: sha256Digest(source) }],
      parent_artifact_ids: [],
      policy_version: policyVersion,
      captured_by: actorId,
      capture_method: 'TEST_HARNESS',
    },
    content: { acceptance: 'PASS', request_id: requestId },
  });
  return {
    scope_id: scopeId,
    request_id: requestId,
    requirement_id: requirementId,
    expected_revision: expectedRevision,
    operation,
    actor_id: actorId,
    authorization,
    input,
    next_state: nextState,
    evidence,
  };
}

function attackerRecomputeAllShaLinks(scope, requestId, revision, status) {
  const state = scope.states.get(revision);
  state.state.status = status;
  state.state_digest = sha256Digest(state.state);
  state.record_digest = sha256Digest(Object.fromEntries(Object.entries(state).filter(([key]) => key !== 'record_digest')));
  if (scope.currentState?.revision === revision) scope.currentState = plainClone(state);
  const checkpoint = scope.checkpoints.get(revision);
  checkpoint.state = plainClone(state.state);
  checkpoint.state_digest = state.state_digest;
  checkpoint.checkpoint_digest = sha256Digest(Object.fromEntries(Object.entries(checkpoint).filter(([key]) => key !== 'checkpoint_digest')));
  if (scope.currentCheckpoint?.revision === revision) scope.currentCheckpoint = plainClone(checkpoint);
  const audit = scope.audits.find((entry) => entry.revision === revision);
  audit.state_digest = state.record_digest;
  audit.checkpoint_digest = checkpoint.checkpoint_digest;
  audit.hash = sha256Digest(Object.fromEntries(Object.entries(audit).filter(([key]) => key !== 'hash')));
  const receipt = scope.receipts.get(requestId);
  receipt.state_record_digest = state.record_digest;
  receipt.checkpoint_digest = checkpoint.checkpoint_digest;
  receipt.audit_hash = audit.hash;
  receipt.receipt_digest = sha256Digest(Object.fromEntries(Object.entries(receipt).filter(([key]) => key !== 'receipt_digest')));
  const idempotency = scope.idempotency.get(requestId);
  idempotency.receipt_digest = receipt.receipt_digest;
  idempotency.idempotency_digest = sha256Digest(Object.fromEntries(Object.entries(idempotency).filter(([key]) => key !== 'idempotency_digest')));
  const evidence = scope.evidence.get(requestId);
  const seal = scope.seals.get(requestId);
  seal.integrity_manifest = {
    scope_id: state.scope_id,
    request_id: requestId,
    transaction_id: receipt.transaction_id,
    revision,
    state_record_digest: state.record_digest,
    checkpoint_digest: checkpoint.checkpoint_digest,
    receipt_digest: receipt.receipt_digest,
    audit_hash: audit.hash,
    idempotency_digest: idempotency.idempotency_digest,
    evidence_record_digest: evidence.record_digest,
  };
}

test('29. SF2-A từ chối Requirement thiếu provenance và không tăng factory revision', () => {
  const h = createHarness();
  assert.throws(() => h.rawControlPlane.createRequirement({
    actor_context: h.actors.productOwner,
    payload: requirementPayload(),
    request_id: 'sf2a-missing-provenance',
    expected_factory_revision: 0,
  }), (error) => error.code === 'PROVENANCE_REQUIRED');
  assert.equal(h.rawControlPlane.getFactoryRevision(), 0);
  assert.equal(h.rawControlPlane.getAuditEntries().some((entry) => entry.event_type === 'REQUIREMENT_CREATED'), false);
});

test('30. SF2-A từ chối source digest hoặc policy provenance giả', () => {
  const h = createHarness();
  const provenance = provenanceFixture();
  provenance.source_refs[0].digest = 'sha256:not-a-real-digest';
  assert.throws(() => h.rawControlPlane.createRequirement({
    actor_context: h.actors.productOwner,
    payload: requirementPayload(),
    provenance,
    request_id: 'sf2a-invalid-source-digest',
    expected_factory_revision: 0,
  }), (error) => error.code === 'PROVENANCE_DIGEST_INVALID');
  assert.throws(() => h.rawControlPlane.createRequirement({
    actor_context: h.actors.productOwner,
    payload: requirementPayload(),
    provenance: { ...provenanceFixture(), policy_version: 'sf-policy-stale' },
    request_id: 'sf2a-stale-provenance-policy',
    expected_factory_revision: 0,
  }), (error) => error.code === 'PROVENANCE_POLICY_MISMATCH');
});

test('31. SF2-A semantic validation fail closed và rollback mutation chưa hợp lệ', () => {
  const h = createHarness();
  assert.throws(() => h.controlPlane.createRequirement({
    actor_context: h.actors.productOwner,
    payload: { ...requirementPayload(), scope: 'software_factory_core' },
  }), (error) => error.code === 'ARTIFACT_SEMANTIC_INVALID');
  assert.equal(h.rawControlPlane.getFactoryRevision(), 0);
  const valid = createRun(h);
  assert.equal(valid.run.status, RUN_STATES.REQUESTED);
  assert.equal(h.rawControlPlane.getFactoryRevision(), 1);
});

test('32. SF2-A redacts secret/PII khỏi Artifact và Audit nhưng giữ trace digest hợp lệ', () => {
  const h = createHarness();
  const created = h.controlPlane.createRequirement({
    actor_context: h.actors.productOwner,
    payload: {
      ...requirementPayload(),
      contact_email: 'founder@example.com',
      api_token: 'sk-1234567890abcdefghijkl',
    },
  });
  assert.equal(created.artifact.payload.contact_email, '[REDACTED:PII_EMAIL]');
  assert.equal(created.artifact.payload.api_token, '[REDACTED:SECRET]');
  assert.equal(verifyArtifactIntegrity(created.artifact), true);
  h.controlPlane.transition({
    actor_context: h.actors.productOwner,
    run_id: created.run.run_id,
    to_state: RUN_STATES.ANALYZED,
    evidence: {
      email: 'operator@example.com',
      authorization: 'Bearer secret-value',
      message: 'Contact operator@example.com with Authorization: Bearer embedded-secret-value',
    },
  });
  const serialized = JSON.stringify(h.rawControlPlane.getAuditEntries({ run_id: created.run.run_id }));
  assert.equal(serialized.includes('founder@example.com'), false);
  assert.equal(serialized.includes('operator@example.com'), false);
  assert.equal(serialized.includes('secret-value'), false);
  assert.equal(serialized.includes('embedded-secret-value'), false);
  assert.equal(h.rawControlPlane.verifyAuditChain(), true);
});

test('33. SF2-A Evidence Envelope deterministic và phát hiện content bị sửa', () => {
  const provenance = provenanceFixture({ capturedBy: IDS.qa, label: 'deterministic-evidence' });
  const first = createEvidenceEnvelope({
    evidence_type: 'ADVERSARIAL_TEST_RESULT',
    subject: 'sf-run-deterministic',
    provenance,
    content: { passed: 4, api_token: 'sk-1234567890abcdefghijkl', failed: 0, result: 'PASS' },
  });
  const second = createEvidenceEnvelope({
    evidence_type: 'ADVERSARIAL_TEST_RESULT',
    subject: 'sf-run-deterministic',
    provenance,
    content: { result: 'PASS', failed: 0, api_token: 'sk-1234567890abcdefghijkl', passed: 4 },
  });
  assert.equal(first.evidence_digest, second.evidence_digest);
  assert.equal(first.content.api_token, '[REDACTED:SECRET]');
  assert.equal(verifyEvidenceEnvelope(first), true);
  assert.throws(() => verifyEvidenceEnvelope({
    ...first,
    content: { ...first.content, failed: 1 },
  }), (error) => error.code === 'EVIDENCE_TAMPERED');
  assert.throws(() => verifyEvidenceEnvelope({ ...first, redactions: [] }),
    (error) => error.code === 'EVIDENCE_TAMPERED');
  assert.throws(() => createEvidenceEnvelope({
    evidence_type: 'NON_JSON_EVIDENCE',
    subject: 'sf-run-deterministic',
    provenance,
    content: { unsupported: undefined },
  }), (error) => error.code === 'EVIDENCE_VALUE_UNSUPPORTED');
});

test('34. SF2-A phát hiện Artifact payload bị tamper sau khi tạo', () => {
  const h = createHarness();
  const created = createRun(h);
  assert.throws(() => verifyArtifactIntegrity({
    ...created.artifact,
    payload: { ...created.artifact.payload, objective: 'tampered objective' },
  }), (error) => error.code === 'ARTIFACT_TAMPERED');
});

test('35. SF2-A không cho provenance trỏ parent Artifact khác Requirement/Run', () => {
  const h = createHarness();
  const first = createRun(h);
  const second = createRun(h);
  h.controlPlane.transition({
    actor_context: h.actors.productOwner,
    run_id: second.run.run_id,
    to_state: RUN_STATES.ANALYZED,
  });
  const revision = h.rawControlPlane.getRun(second.run.run_id).revision;
  assert.throws(() => h.rawControlPlane.createArtifact({
    actor_context: h.actors.architect,
    run_id: second.run.run_id,
    type: ARTIFACT_TYPES.ARCHITECTURE,
    payload: architecturePayload(),
    provenance: provenanceFixture({
      type: ARTIFACT_TYPES.ARCHITECTURE,
      capturedBy: IDS.architect,
      parentIds: [first.artifact.artifact_id],
      label: 'cross-run-parent',
    }),
    request_id: 'sf2a-cross-run-parent',
    expected_revision: revision,
  }), (error) => error.code === 'PROVENANCE_PARENT_SCOPE_MISMATCH');
  assert.equal(h.rawControlPlane.getRun(second.run.run_id).revision, revision);
});

test('36. SF2-A optimistic concurrency từ chối stale revision', () => {
  const h = createHarness();
  const created = createRun(h);
  assert.throws(() => h.rawControlPlane.transition({
    actor_context: h.actors.productOwner,
    run_id: created.run.run_id,
    to_state: RUN_STATES.ANALYZED,
    request_id: 'sf2a-stale-transition',
    expected_revision: 1,
  }), (error) => error.code === 'STALE_REVISION');
  assert.equal(h.rawControlPlane.getRun(created.run.run_id).status, RUN_STATES.REQUESTED);
});

test('37. SF2-A replay cùng request trả cùng kết quả và không lặp side effect', () => {
  const h = createHarness();
  const created = createRun(h);
  const request = {
    actor_context: h.actors.productOwner,
    run_id: created.run.run_id,
    to_state: RUN_STATES.ANALYZED,
    evidence: { source: 'idempotency-test' },
    request_id: 'sf2a-idempotent-transition',
    expected_revision: 0,
  };
  const first = h.rawControlPlane.transition(request);
  const auditCount = h.rawControlPlane.getAuditEntries({ run_id: created.run.run_id }).length;
  const replay = h.rawControlPlane.transition(request);
  assert.deepEqual(replay, first);
  assert.equal(h.rawControlPlane.getRun(created.run.run_id).revision, 1);
  assert.equal(h.rawControlPlane.getAuditEntries({ run_id: created.run.run_id }).length, auditCount);
});

test('38. SF2-A từ chối reuse idempotency key với mutation khác', () => {
  const h = createHarness();
  const created = createRun(h);
  const base = {
    actor_context: h.actors.productOwner,
    run_id: created.run.run_id,
    request_id: 'sf2a-reused-key',
    expected_revision: 0,
  };
  h.rawControlPlane.transition({ ...base, to_state: RUN_STATES.ANALYZED });
  assert.throws(() => h.rawControlPlane.transition({ ...base, to_state: RUN_STATES.BLOCKED }),
    (error) => error.code === 'IDEMPOTENCY_KEY_REUSE_DENIED');
});

test('39. SF2-A mutation guard chỉ cho một active writer trên mỗi scope', () => {
  const guard = new SoftwareFactoryMutationGuard();
  const first = guard.begin({
    scope_id: 'sf-run-concurrent',
    request_id: 'request-one',
    expected_revision: 0,
    current_revision: 0,
    operation: 'TEST_MUTATION',
    actor_id: IDS.builder,
    input: { value: 1 },
  });
  assert.throws(() => guard.begin({
    scope_id: 'sf-run-concurrent',
    request_id: 'request-two',
    expected_revision: 0,
    current_revision: 0,
    operation: 'TEST_MUTATION',
    actor_id: IDS.qa,
    input: { value: 2 },
  }), (error) => error.code === 'CONCURRENT_MUTATION_DENIED');
  guard.abort(first.token);

  const replayGuard = new SoftwareFactoryMutationGuard({ idempotencyKey: STATE_IDEMPOTENCY_KEY });
  const mutation = replayGuard.begin({
    scope_id: 'sf-run-sensitive-replay',
    request_id: 'sensitive-request',
    expected_revision: 0,
    current_revision: 0,
    operation: 'TEST_MUTATION',
    actor_id: IDS.builder,
    input: { api_token: 'sk-11111111111111111111' },
  });
  replayGuard.complete(mutation.token, { new_revision: 1, result: { ok: true } });
  assert.throws(() => replayGuard.begin({
    scope_id: 'sf-run-sensitive-replay',
    request_id: 'sensitive-request',
    expected_revision: 0,
    current_revision: 1,
    operation: 'TEST_MUTATION',
    actor_id: IDS.builder,
    input: { api_token: 'sk-22222222222222222222' },
  }), (error) => error.code === 'IDEMPOTENCY_KEY_REUSE_DENIED');
});

test('40. SF2-A State Port là persistence-neutral và cấm adapter production/database', () => {
  assert.throws(() => assertStatePortContract({ readCheckpoint() {} }),
    (error) => error.code === 'STATE_PORT_CONTRACT_INCOMPLETE');
  assert.throws(() => assertStatePortContract({
    isProductionAdapter: true,
    readCheckpoint() {},
    readReceipt() {},
    commitMutation() {},
  }), (error) => error.code === 'REAL_PERSISTENCE_ADAPTER_DENIED');
  assert.equal(assertStatePortContract(new LocalTestStatePort()), true);
});

test('41. SF2-A recovery khôi phục checkpoint và replay receipt sau process restart giả lập', () => {
  const port = new LocalTestStatePort();
  const firstProcess = new SoftwareFactoryStateCoordinator({
    port,
    scope_id: 'sf-run-recovery',
    idempotency_key: STATE_IDEMPOTENCY_KEY,
  });
  const request = {
    request_id: 'sf2a-recovery-request',
    expected_revision: 0,
    operation: 'SAVE_TEST_STATE',
    input: { phase: 'testing' },
    state: { status: 'TESTING', api_token: 'sk-1234567890abcdefghijkl' },
  };
  const committed = firstProcess.commit(request);
  assert.equal(committed.replayed, false);
  assert.equal(committed.checkpoint.state.api_token, '[REDACTED:SECRET]');

  const restartedProcess = new SoftwareFactoryStateCoordinator({
    port,
    scope_id: 'sf-run-recovery',
    idempotency_key: STATE_IDEMPOTENCY_KEY,
  });
  assert.equal(restartedProcess.recover().checkpoint_digest, committed.checkpoint.checkpoint_digest);
  const replay = restartedProcess.commit(request);
  assert.equal(replay.replayed, true);
  assert.equal(replay.receipt.checkpoint_digest, committed.receipt.checkpoint_digest);
});

test('42. SF2-A recovery fail closed với checkpoint tamper và compare-and-swap conflict', () => {
  const port = new LocalTestStatePort();
  const coordinator = new SoftwareFactoryStateCoordinator({
    port,
    scope_id: 'sf-run-tamper',
    idempotency_key: STATE_IDEMPOTENCY_KEY,
  });
  const committed = coordinator.commit({
    request_id: 'sf2a-tamper-source',
    expected_revision: 0,
    operation: 'SAVE_STATE',
    input: { step: 1 },
    state: { status: 'BUILDING' },
  });
  port.checkpoints.set('sf-run-tamper', {
    ...committed.checkpoint,
    state: { status: 'BASELINED' },
  });
  assert.throws(() => coordinator.recover(), (error) => error.code === 'RECOVERY_CHECKPOINT_TAMPERED');

  const rejectingPort = new LocalTestStatePort();
  rejectingPort.commitMutation = () => ({ committed: false });
  const concurrent = new SoftwareFactoryStateCoordinator({
    port: rejectingPort,
    scope_id: 'sf-run-cas',
    idempotency_key: STATE_IDEMPOTENCY_KEY,
  });
  assert.throws(() => concurrent.commit({
    request_id: 'sf2a-cas-conflict',
    expected_revision: 0,
    operation: 'SAVE_STATE',
    input: { step: 1 },
    state: { status: 'REQUESTED' },
  }), (error) => error.code === 'CONCURRENT_MUTATION_DENIED');

  const partialPort = new LocalTestStatePort();
  const firstProcess = new SoftwareFactoryStateCoordinator({
    port: partialPort,
    scope_id: 'sf-run-partial-commit',
    idempotency_key: STATE_IDEMPOTENCY_KEY,
  });
  const partialRequest = {
    request_id: 'sf2a-partial-commit',
    expected_revision: 0,
    operation: 'SAVE_STATE',
    input: { step: 1 },
    state: { status: 'REQUESTED' },
  };
  firstProcess.commit(partialRequest);
  partialPort.checkpoints.delete('sf-run-partial-commit');
  const restarted = new SoftwareFactoryStateCoordinator({
    port: partialPort,
    scope_id: 'sf-run-partial-commit',
    idempotency_key: STATE_IDEMPOTENCY_KEY,
  });
  assert.throws(() => restarted.commit(partialRequest),
    (error) => error.code === 'STATE_RECEIPT_CHECKPOINT_MISMATCH');
});

test('43. SF2-A replay State Port từ chối cùng request_id nếu state đã bị đổi', () => {
  const port = new LocalTestStatePort();
  const coordinator = new SoftwareFactoryStateCoordinator({
    port,
    scope_id: 'sf-run-state-replay',
    idempotency_key: STATE_IDEMPOTENCY_KEY,
  });
  const base = {
    request_id: 'sf2a-state-replay',
    expected_revision: 0,
    operation: 'SAVE_STATE',
    input: { step: 1 },
  };
  coordinator.commit({ ...base, state: { status: 'REQUESTED', api_token: 'sk-11111111111111111111' } });
  assert.throws(() => coordinator.commit({
    ...base,
    state: { status: 'REQUESTED', api_token: 'sk-22222222222222222222' },
  }),
    (error) => error.code === 'STATE_REPLAY_MISMATCH');
});

test('44. SF2-A runtime retry không gọi lại tool và idempotency key được scope theo run', async () => {
  let invokeCount = 0;
  let evidenceCount = 0;
  const idempotencyKeys = [];
  const runtimeAdapter = {
    supportsIdempotency: true,
    async invokeTool(request) {
      assert.equal(isAuthorizedExecutionGrant(request.authorization_grant), true);
      assert.equal(request.idempotency_key.endsWith(':sf2a-runtime-retry'), true);
      idempotencyKeys.push(request.idempotency_key);
      invokeCount += 1;
      return { ok: true };
    },
    async collectEvidence(request) {
      assert.equal(isAuthorizedExecutionGrant(request.authorization_grant), true);
      evidenceCount += 1;
      if (evidenceCount === 1) throw new Error('simulated evidence collector failure');
      return { source: 'retry-safe-test-runtime', ok: true };
    },
  };
  const h = createHarness({ runtimeAdapter });
  const firstRun = advanceToBuilding(h);
  const firstRequest = {
    actor_context: h.actors.builder,
    requirement_id: firstRun.requirement.requirement_id,
    run_id: firstRun.runId,
    tool: 'source.write',
    path: 'backend/src/domains/crm/services/example.js',
    context: { domain: 'crm' },
    request_id: 'sf2a-runtime-retry',
    expected_revision: h.rawControlPlane.getRun(firstRun.runId).revision,
  };
  await assert.rejects(() => h.rawControlPlane.executeAuthorizedAction(firstRequest), /simulated evidence collector failure/);
  const outcome = await h.rawControlPlane.executeAuthorizedAction(firstRequest);
  assert.equal(outcome.result.ok, true);
  assert.equal(invokeCount, 1);
  assert.equal(evidenceCount, 2);

  const secondRun = advanceToBuilding(h);
  await h.rawControlPlane.executeAuthorizedAction({
    ...firstRequest,
    requirement_id: secondRun.requirement.requirement_id,
    run_id: secondRun.runId,
    expected_revision: h.rawControlPlane.getRun(secondRun.runId).revision,
  });
  assert.equal(invokeCount, 2);
  assert.equal(new Set(idempotencyKeys).size, 2);
});

test('45. SF2-B canonical validator chỉ chấp nhận JSON-compatible plain object', () => {
  const nullPrototype = Object.create(null);
  nullPrototype.ok = ['value', 1, true, null];
  assert.equal(assertPlainJsonValue({ nested: nullPrototype }), true);

  class UnsupportedClass {}
  const cyclic = {};
  cyclic.self = cyclic;
  const sparse = [];
  sparse[1] = 'gap';
  const accessor = {};
  Object.defineProperty(accessor, 'value', { enumerable: true, get: () => 'hidden execution' });
  const arrayWithSymbol = [];
  arrayWithSymbol[Symbol('hidden')] = true;
  const unsupported = [
    new Map([['a', 1]]),
    new Set([1]),
    new Date('2026-08-30T00:00:00.000Z'),
    () => true,
    undefined,
    1n,
    new UnsupportedClass(),
    Buffer.from('not-json'),
    /not-json/,
    new Proxy({ value: 1 }, {}),
    sparse,
    accessor,
    arrayWithSymbol,
  ];
  unsupported.forEach((value) => assert.throws(
    () => assertPlainJsonValue(value),
    (error) => error.code === 'CANONICAL_VALUE_UNSUPPORTED',
  ));
  assert.throws(() => assertPlainJsonValue(cyclic),
    (error) => error.code === 'CANONICAL_CYCLE_DENIED');
  assert.throws(() => sha256Digest({ nested: new Map() }),
    (error) => error.code === 'CANONICAL_VALUE_UNSUPPORTED');
  const validEnvelope = durableCommand({ scopeId: 'sf2b-envelope', requestId: 'strict-envelope' }).evidence;
  assert.throws(() => verifyEvidenceEnvelope(Object.assign(new Date(), plainClone(validEnvelope))),
    (error) => error.code === 'EVIDENCE_VALUE_UNSUPPORTED');
  assert.throws(() => verifyEvidenceEnvelope({ ...validEnvelope, ignored: new Map() }),
    (error) => error.code === 'EVIDENCE_VALUE_UNSUPPORTED');
});

test('46. SF2-B Durable State Port bắt buộc atomic/CAS/unique/consistent-read và không production-ready', () => {
  assert.throws(() => assertDurableStatePortContract({ getCapabilities() { return {}; } }),
    (error) => error.code === 'DURABLE_PORT_CONTRACT_INCOMPLETE');
  const port = new LocalDurableTestPort();
  assert.equal(assertDurableStatePortContract(port), true);
  port.isProductionAdapter = true;
  assert.throws(() => assertDurableStatePortContract(port),
    (error) => error.code === 'REAL_DURABLE_ADAPTER_DENIED');
  port.isProductionAdapter = false;
  port.getCapabilities = () => ({
    contract_version: '1.0.0',
    atomic_state_checkpoint_receipt_audit_idempotency_evidence_seal: true,
    compare_and_swap: true,
    unique_scope_request: true,
    consistent_recovery_read: true,
    async_methods: true,
    production_ready: true,
  });
  assert.throws(() => assertDurableStatePortContract(port),
    (error) => error.code === 'DURABLE_PORT_CAPABILITY_DENIED');
});

test('47. SF2-B HMAC Key Provider cấm export/raw secret và bắt buộc descriptor/lifecycle audit', async () => {
  const provider = new LocalTestKeyProvider();
  assert.equal(assertKeyProviderContract(provider), true);
  assert.deepEqual(Object.keys(await provider.getActiveKey()).sort(), [
    'algorithm', 'key_id', 'purpose', 'status', 'version',
  ]);
  assert.equal(validateKeyReference({
    key_id: 'sf2b-test-idempotency',
    version: 1,
    algorithm: 'HMAC-SHA-256',
    purpose: 'SOFTWARE_FACTORY_IDEMPOTENCY',
  }), true);
  assert.throws(() => validateKeyReference({
    key_id: 'sf2b-test-idempotency',
    version: 1,
    algorithm: 'NONE',
    purpose: 'SOFTWARE_FACTORY_IDEMPOTENCY',
  }), (error) => error.code === 'HMAC_KEY_REFERENCE_INVALID');
  const exportingProvider = new LocalTestKeyProvider();
  exportingProvider.exportKey = () => Buffer.alloc(32);
  assert.throws(() => assertKeyProviderContract(exportingProvider),
    (error) => error.code === 'KEY_PROVIDER_EXTRA_SURFACE_DENIED');
  const publicStateProvider = new LocalTestKeyProvider();
  publicStateProvider.publicKeyBytes = Buffer.alloc(32);
  assert.throws(() => assertKeyProviderContract(publicStateProvider),
    (error) => error.code === 'KEY_PROVIDER_PUBLIC_STATE_DENIED');
  const symbolProvider = new LocalTestKeyProvider();
  symbolProvider[Symbol.for('raw-secret')] = Buffer.alloc(32);
  assert.throws(() => assertKeyProviderContract(symbolProvider),
    (error) => error.code === 'KEY_PROVIDER_PUBLIC_STATE_DENIED');
  assert.throws(() => assertKeyProviderContract(new Proxy(provider, {})),
    (error) => error.code === 'KEY_PROVIDER_PROXY_DENIED');
  const invalidDescriptorProvider = new LocalTestKeyProvider();
  invalidDescriptorProvider.getActiveKey = async () => ({
    ...(await provider.getActiveKey()),
    metadata: { secret: 'must-never-leave-provider' },
  });
  const invalidControl = createDurableTestControl(new LocalDurableTestPort(), invalidDescriptorProvider);
  await assert.rejects(() => invalidControl.commit(durableCommand({
    scopeId: 'invalid-key-descriptor', requestId: 'invalid-key-descriptor-1',
  })), (error) => error.code === 'HMAC_KEY_DESCRIPTOR_INVALID');

  const sensitiveKeyIdProvider = new LocalTestKeyProvider();
  sensitiveKeyIdProvider.getActiveKey = async () => ({
    ...(await provider.getActiveKey()),
    key_id: 'sk-12345678901234567890',
  });
  const sensitiveKeyIdControl = createDurableTestControl(
    new LocalDurableTestPort(),
    sensitiveKeyIdProvider,
  );
  await assert.rejects(() => sensitiveKeyIdControl.commit(durableCommand({
    scopeId: 'sensitive-key-id', requestId: 'sensitive-key-id-1',
  })), (error) => error.code === 'HMAC_KEY_SENSITIVE');

  const sensitiveAuditProvider = new LocalTestKeyProvider();
  const sensitiveAuditEvents = await sensitiveAuditProvider.listAuditEvents();
  sensitiveAuditEvents[0].reason = 'rotate api_token=sk-12345678901234567890';
  sensitiveAuditEvents[0].hash = keyAuditHash(sensitiveAuditEvents[0]);
  sensitiveAuditProvider.listAuditEvents = async () => plainClone(sensitiveAuditEvents);
  await assert.rejects(() => getVerifiedKeyAuditEvents(sensitiveAuditProvider),
    (error) => error.code === 'KEY_AUDIT_SENSITIVE');

  const lifecycleProvider = new LocalTestKeyProvider();
  const auditCountBefore = (await lifecycleProvider.listAuditEvents()).length;
  await assert.rejects(() => rotateActiveKey(lifecycleProvider, {
    actor_id: 'sf2b-security-reviewer',
    reason: 'rotate api_token=sk-12345678901234567890',
  }), (error) => error.code === 'KEY_AUDIT_SENSITIVE');
  assert.equal((await lifecycleProvider.listAuditEvents()).length, auditCountBefore);
});

test('48. SF2-B atomic commit ghi đồng thời state/checkpoint/receipt/audit/idempotency/evidence/seal', async () => {
  const port = new LocalDurableTestPort();
  const keyProvider = new LocalTestKeyProvider();
  const control = createDurableTestControl(port, keyProvider);
  const rawSecret = 'sk-sf2b-secret-1234567890';
  const command = durableCommand({
    scopeId: 'sf2b-atomic',
    requestId: 'sf2b-atomic-1',
    input: { api_token: rawSecret, action: 'commit' },
    nextState: { status: 'COMMITTED', api_token: rawSecret },
  });
  const result = await control.commit(command);
  assert.equal(result.replayed, false);
  assert.equal(result.recovered, false);
  assert.equal(result.state.state.api_token, '[REDACTED:SECRET]');
  assert.equal(result.state.revision, 1);
  assert.equal(result.checkpoint.revision, 1);
  assert.equal(result.receipt.committed_revision, 1);
  assert.equal(result.idempotency_record.status, 'COMMITTED');
  assert.equal(result.audit_event.transaction_id, result.receipt.transaction_id);
  assert.equal(result.evidence_record.transaction_id, result.receipt.transaction_id);
  assert.equal(result.transaction_seal.transaction_id, result.receipt.transaction_id);
  assert.equal(port.commitCount, 1);
  const persisted = await port.readRecoverySnapshot({ scope_id: command.scope_id, request_id: command.request_id });
  assert.equal(JSON.stringify(persisted).includes(rawSecret), false);
  assert.equal(JSON.stringify(persisted).includes('must-never-leave-provider'), false);
});

test('49. SF2-B restart giữ lịch sử và replay request cũ sau revision mới không tạo side effect', async () => {
  const port = new LocalDurableTestPort();
  const keyProvider = new LocalTestKeyProvider();
  const firstProcess = createDurableTestControl(port, keyProvider);
  const first = durableCommand({ scopeId: 'sf2b-restart', requestId: 'sf2b-restart-1' });
  await firstProcess.commit(first);
  const second = durableCommand({
    scopeId: 'sf2b-restart',
    requestId: 'sf2b-restart-2',
    expectedRevision: 1,
    nextState: { status: 'SECOND_REVISION' },
  });
  await firstProcess.commit(second);

  const restarted = createDurableTestControl(port, keyProvider);
  const recoveredFirst = await restarted.recover({ scope_id: first.scope_id, request_id: first.request_id });
  assert.equal(recoveredFirst.state_record.revision, 2);
  assert.equal(recoveredFirst.transaction_state_record.revision, 1);
  const replay = await restarted.commit(first);
  assert.equal(replay.replayed, true);
  assert.equal(replay.state.revision, 1);
  assert.equal(port.commitCount, 2);
  assert.equal((await port.readAuditEntries(first.scope_id)).length, 2);
});

test('50. SF2-B cùng request_id với payload khác bị durable HMAC idempotency deny', async () => {
  const port = new LocalDurableTestPort();
  const control = createDurableTestControl(port);
  const command = durableCommand({ scopeId: 'sf2b-hmac', requestId: 'sf2b-hmac-1' });
  await control.commit(command);
  await assert.rejects(() => control.commit({ ...command, input: { action: 'DIFFERENT_PAYLOAD' } }),
    (error) => error.code === 'HMAC_VERIFICATION_FAILED');
  assert.equal(port.commitCount, 1);
});

test('51. SF2-B nhiều worker không thể cùng commit một revision và CAS fail closed', async () => {
  const port = new LocalDurableTestPort();
  const keyProvider = new LocalTestKeyProvider();
  const workerOne = createDurableTestControl(port, keyProvider);
  const workerTwo = createDurableTestControl(port, keyProvider);
  await workerOne.commit(durableCommand({ scopeId: 'sf2b-workers', requestId: 'worker-1' }));
  await assert.rejects(() => workerTwo.commit(durableCommand({
    scopeId: 'sf2b-workers',
    requestId: 'worker-2',
    expectedRevision: 0,
  })), (error) => error.code === 'STALE_REVISION');
  assert.equal(port.commitCount, 1);

  const conflictPort = new LocalDurableTestPort();
  conflictPort.setFault('force_conflict');
  const conflictWorker = createDurableTestControl(conflictPort, keyProvider);
  await assert.rejects(() => conflictWorker.commit(durableCommand({
    scopeId: 'sf2b-cas-conflict',
    requestId: 'worker-conflict',
  })), (error) => error.code === 'CONCURRENT_MUTATION_DENIED');
  assert.equal(conflictPort.commitCount, 0);

  const sameRequestPort = new LocalDurableTestPort();
  sameRequestPort.setFault('same_request_won_race');
  const sameRequestWorker = createDurableTestControl(sameRequestPort, keyProvider);
  const sameRequestResult = await sameRequestWorker.commit(durableCommand({
    scopeId: 'sf2b-same-request-race',
    requestId: 'same-request-race',
  }));
  assert.equal(sameRequestResult.replayed, true);
  assert.equal(sameRequestPort.commitCount, 1);
});

test('52. SF2-B commit thành công nhưng mất ACK được recovery thành công đúng một lần', async () => {
  const port = new LocalDurableTestPort();
  port.setFault('commit_then_throw');
  const control = createDurableTestControl(port);
  const command = durableCommand({ scopeId: 'sf2b-lost-ack', requestId: 'sf2b-lost-ack-1' });
  const result = await control.commit(command);
  assert.equal(result.recovered, true);
  assert.equal(result.replayed, false);
  assert.equal(port.commitCount, 1);
  assert.equal((await control.commit(command)).replayed, true);
  assert.equal(port.commitCount, 1);
});

test('53. SF2-B unknown/partial commit không bao giờ được coi là operation thành công', async () => {
  const unknownPort = new LocalDurableTestPort();
  unknownPort.setFault('unknown_without_commit');
  const unknown = createDurableTestControl(unknownPort);
  await assert.rejects(() => unknown.commit(durableCommand({
    scopeId: 'sf2b-unknown', requestId: 'sf2b-unknown-1',
  })), (error) => error.code === 'DURABLE_COMMIT_INDETERMINATE');
  assert.equal(unknownPort.commitCount, 0);

  const partialPort = new LocalDurableTestPort();
  partialPort.setFault('receipt_only_then_unknown');
  const partial = createDurableTestControl(partialPort);
  await assert.rejects(() => partial.commit(durableCommand({
    scopeId: 'sf2b-partial', requestId: 'sf2b-partial-1',
  })), (error) => error.code === 'DURABLE_PARTIAL_COMMIT_DETECTED');
  assert.equal(partialPort.commitCount, 0);

  const deletedPriorPort = new LocalDurableTestPort();
  const deletedPrior = createDurableTestControl(deletedPriorPort);
  const prior = durableCommand({ scopeId: 'sf2b-deleted-prior', requestId: 'deleted-prior-1' });
  await deletedPrior.commit(prior);
  deletedPriorPort.tamper(prior.scope_id, (scope) => scope.receipts.delete(prior.request_id));
  await assert.rejects(() => deletedPrior.commit(durableCommand({
    scopeId: prior.scope_id,
    requestId: 'deleted-prior-2',
    expectedRevision: 1,
  })), (error) => error.code === 'DURABLE_PARTIAL_COMMIT_DETECTED');
});

test('54. SF2-B HMAC rotation cho phép verify key cũ và dùng version mới để sign', async () => {
  const port = new LocalDurableTestPort();
  const keyProvider = new LocalTestKeyProvider();
  const control = createDurableTestControl(port, keyProvider);
  const first = durableCommand({ scopeId: 'sf2b-rotation', requestId: 'rotation-1' });
  const firstResult = await control.commit(first);
  assert.equal(firstResult.receipt.key_reference.version, 1);
  await rotateActiveKey(keyProvider, { actor_id: IDS.release, reason: 'scheduled SF2-B test rotation' });
  const secondResult = await control.commit(durableCommand({
    scopeId: 'sf2b-rotation', requestId: 'rotation-2', expectedRevision: 1,
  }));
  assert.equal(secondResult.receipt.key_reference.version, 2);
  assert.equal((await control.commit(first)).replayed, true);
  const keyAudit = await keyProvider.listAuditEvents();
  assert.equal(keyAudit.some((entry) => entry.event_type === 'KEY_ROTATED'), true);
  assert.equal(JSON.stringify(keyAudit).includes('secret'), false);
});

test('55. SF2-B key revocation được audit và replay/recovery bằng key revoked bị fail closed', async () => {
  const port = new LocalDurableTestPort();
  const keyProvider = new LocalTestKeyProvider();
  const control = createDurableTestControl(port, keyProvider);
  const command = durableCommand({ scopeId: 'sf2b-revocation', requestId: 'revocation-1' });
  await control.commit(command);
  await rotateActiveKey(keyProvider, { actor_id: IDS.release, reason: 'prepare revocation test' });
  await revokeKeyVersion(keyProvider, {
    key_id: 'sf2b-test-idempotency', version: 1, algorithm: 'HMAC-SHA-256', purpose: 'SOFTWARE_FACTORY_IDEMPOTENCY',
  }, { actor_id: IDS.release, reason: 'compromised historical test key' });
  await assert.rejects(() => control.commit(command), (error) => error.code === 'HMAC_KEY_REVOKED');
  await assert.rejects(() => control.recover({ scope_id: command.scope_id, request_id: command.request_id }),
    (error) => error.code === 'HMAC_KEY_REVOKED');
  assert.equal((await keyProvider.listAuditEvents()).some((entry) => (
    entry.event_type === 'KEY_REVOKED' && entry.key_version === 1
  )), true);
});

test('56. SF2-B mutation bắt buộc trusted Requirement → Authorization → Policy → Evidence binding', async () => {
  const port = new LocalDurableTestPort();
  const control = createDurableTestControl(port);
  const denied = durableCommand({ scopeId: 'sf2b-authz', requestId: 'authz-denied' });
  const { decision_digest: ignoredDigest, ...forgedAuthorizationBase } = denied.authorization;
  forgedAuthorizationBase.decision_id = 'caller-self-declared-forgery';
  const forged = {
    ...denied,
    authorization: {
      ...forgedAuthorizationBase,
      decision_digest: authorizationDecisionDigest(forgedAuthorizationBase),
    },
  };
  await assert.rejects(() => control.commit(forged),
    (error) => error.code === 'DURABLE_AUTHORIZATION_REQUIRED');

  const sensitiveActor = durableCommand({
    scopeId: 'sf2b-authz',
    requestId: 'sensitive-actor',
    actorId: 'admin@example.com',
  });
  await assert.rejects(() => control.commit(sensitiveActor),
    (error) => error.code === 'DURABLE_IDENTIFIER_SENSITIVE');

  const mismatched = durableCommand({ scopeId: 'sf2b-authz', requestId: 'evidence-mismatch' });
  mismatched.actor_id = IDS.builder;
  mismatched.authorization = durableAuthorization({
    scopeId: mismatched.scope_id,
    requestId: mismatched.request_id,
    requirementId: mismatched.requirement_id,
    actorId: IDS.builder,
    policyVersion: mismatched.evidence.provenance.policy_version,
    operation: mismatched.operation,
  });
  await assert.rejects(() => control.commit(mismatched),
    (error) => error.code === 'DURABLE_EVIDENCE_BINDING_MISMATCH');

  let releaseVerifier;
  const verifierGate = new Promise((resolve) => { releaseVerifier = resolve; });
  const deferredVerifier = Object.freeze({
    async verifyDecision({ decision }) {
      await verifierGate;
      return ISSUED_DURABLE_AUTHORIZATION_DIGESTS.has(decision.decision_digest);
    },
  });
  const toctouPort = new LocalDurableTestPort();
  const toctouControl = new DurableControlPlaneFoundation({
    port: toctouPort,
    key_provider: new LocalTestKeyProvider(),
    authorization_verifier: deferredVerifier,
  });
  const toctouCommand = durableCommand({ scopeId: 'sf2b-toctou-original', requestId: 'toctou-original-1' });
  const pending = toctouControl.commit(toctouCommand);
  toctouCommand.scope_id = 'sf2b-toctou-attacker';
  toctouCommand.request_id = 'toctou-attacker-1';
  toctouCommand.authorization = durableAuthorization({
    scopeId: toctouCommand.scope_id,
    requestId: toctouCommand.request_id,
    requirementId: toctouCommand.requirement_id,
    actorId: toctouCommand.actor_id,
    policyVersion: toctouCommand.evidence.provenance.policy_version,
    operation: toctouCommand.operation,
  });
  releaseVerifier();
  await assert.rejects(() => pending, (error) => error.code === 'DURABLE_COMMAND_TOCTOU_DENIED');
  assert.equal(toctouPort.commitCount, 0);
  assert.equal(port.commitCount, 0);
});

test('57. SF2-B restart/recovery phát hiện tamper và attacker recompute toàn bộ SHA linkage', async () => {
  const cases = [
    (scope) => { scope.currentState.state.status = 'TAMPERED'; },
    (scope) => { scope.audits[0].hash = 'sha256:' + '0'.repeat(64); },
    (scope) => { scope.receipts.values().next().value.operation = 'TAMPERED'; },
    (scope) => { scope.idempotency.values().next().value.status = 'PENDING'; },
    (scope) => { scope.evidence.values().next().value.envelope.content.acceptance = 'TAMPERED'; },
  ];
  for (const [index, mutate] of cases.entries()) {
    const scopeId = 'sf2b-tamper-' + index;
    const requestId = 'tamper-request-' + index;
    const port = new LocalDurableTestPort();
    const keyProvider = new LocalTestKeyProvider();
    const firstProcess = createDurableTestControl(port, keyProvider);
    await firstProcess.commit(durableCommand({ scopeId, requestId }));
    port.tamper(scopeId, mutate);
    const restarted = createDurableTestControl(port, keyProvider);
    await assert.rejects(() => restarted.recover({ scope_id: scopeId, request_id: requestId }),
      (error) => [
        'DURABLE_STATE_TAMPERED',
        'DURABLE_AUDIT_TAMPERED',
        'DURABLE_RECORD_TAMPERED',
        'DURABLE_REVISION_MISMATCH',
        'EVIDENCE_TAMPERED',
        'DURABLE_TRANSACTION_SEAL_MISMATCH',
        'DURABLE_CURRENT_RECORD_SET_MISMATCH',
      ].includes(error.code));
  }

  const recomputePort = new LocalDurableTestPort();
  const recomputeKeyProvider = new LocalTestKeyProvider();
  const recomputeControl = createDurableTestControl(recomputePort, recomputeKeyProvider);
  const recomputeCommand = durableCommand({ scopeId: 'sf2b-recompute', requestId: 'recompute-1' });
  await recomputeControl.commit(recomputeCommand);
  recomputePort.tamper(recomputeCommand.scope_id, (scope) => {
    attackerRecomputeAllShaLinks(scope, recomputeCommand.request_id, 1, 'ATTACKER_RECOMPUTED');
  });
  await assert.rejects(() => recomputeControl.recover({
    scope_id: recomputeCommand.scope_id,
    request_id: recomputeCommand.request_id,
  }), (error) => error.code === 'HMAC_VERIFICATION_FAILED');

  const multiPort = new LocalDurableTestPort();
  const multiKeyProvider = new LocalTestKeyProvider();
  const multiControl = createDurableTestControl(multiPort, multiKeyProvider);
  const oldCommand = durableCommand({ scopeId: 'sf2b-multi-tip', requestId: 'multi-rev-1' });
  const tipCommand = durableCommand({
    scopeId: 'sf2b-multi-tip', requestId: 'multi-rev-2', expectedRevision: 1,
  });
  await multiControl.commit(oldCommand);
  await multiControl.commit(tipCommand);
  multiPort.tamper(oldCommand.scope_id, (scope) => {
    attackerRecomputeAllShaLinks(scope, tipCommand.request_id, 2, 'ATTACKER_RECOMPUTED_CURRENT_TIP');
  });
  await assert.rejects(() => multiControl.recover({
    scope_id: oldCommand.scope_id,
    request_id: oldCommand.request_id,
  }), (error) => error.code === 'HMAC_VERIFICATION_FAILED');
  await assert.rejects(() => multiControl.commit(durableCommand({
    scopeId: oldCommand.scope_id,
    requestId: 'multi-rev-3',
    expectedRevision: 2,
  })), (error) => error.code === 'HMAC_VERIFICATION_FAILED');

  const historyPort = new LocalDurableTestPort();
  const historyControl = createDurableTestControl(historyPort, new LocalTestKeyProvider());
  const historyOld = durableCommand({ scopeId: 'sf2b-history-complete', requestId: 'history-rev-1' });
  const historyTip = durableCommand({
    scopeId: historyOld.scope_id,
    requestId: 'history-rev-2',
    expectedRevision: 1,
  });
  await historyControl.commit(historyOld);
  await historyControl.commit(historyTip);
  historyPort.tamper(historyOld.scope_id, (scope) => {
    scope.evidence.delete(historyOld.request_id);
  });
  await assert.rejects(() => historyControl.recover({
    scope_id: historyTip.scope_id,
    request_id: historyTip.request_id,
  }), (error) => error.code === 'DURABLE_PARTIAL_COMMIT_DETECTED');
  await assert.rejects(() => historyControl.commit(durableCommand({
    scopeId: historyOld.scope_id,
    requestId: 'history-rev-3',
    expectedRevision: 2,
  })), (error) => error.code === 'DURABLE_PARTIAL_COMMIT_DETECTED');
});
