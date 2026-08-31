const { ARTIFACT_TYPES, AGENT_TYPES, POLICY_ACTIONS, RUN_STATES } = require('./constants');
const { SoftwareFactoryAgentRegistry, deepFreeze } = require('./agentRegistry');
const { SoftwareFactoryApprovalAuthority, digestValue } = require('./approvalAuthority');
const { SoftwareFactoryAuditLedger } = require('./auditLedger');
const { createArtifact, verifyArtifactIntegrity } = require('./artifactContracts');
const { factoryError } = require('./errors');
const { evaluateAgentAction, normalizeRepoPath } = require('./policy');
const { assertActorTypeAllowed, assertTransitionAllowed } = require('./qualityGate');
const { RuntimeExecutionBoundary } = require('./runtimeAdapterContract');
const { SoftwareFactoryMutationGuard } = require('./mutationGuard');
const { createEvidenceEnvelope, validateProvenance } = require('./evidenceContracts');
const { sha256Digest } = require('./canonical');

const ARTIFACT_ALLOWED_STATES = Object.freeze({
  [ARTIFACT_TYPES.REQUIREMENT]: [RUN_STATES.REQUESTED],
  [ARTIFACT_TYPES.ARCHITECTURE]: [RUN_STATES.ANALYZED],
  [ARTIFACT_TYPES.IMPLEMENTATION]: [RUN_STATES.BUILDING],
  [ARTIFACT_TYPES.REVIEW]: [RUN_STATES.IN_REVIEW],
  [ARTIFACT_TYPES.TEST]: [RUN_STATES.TESTING, RUN_STATES.UAT_READY],
  [ARTIFACT_TYPES.RELEASE]: [RUN_STATES.UAT_PASSED],
});

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function restoreObject(target, snapshot) {
  Object.keys(target).forEach((key) => delete target[key]);
  Object.assign(target, clone(snapshot));
}

function countFailures(value) {
  if (Array.isArray(value)) return value.length;
  if (Number.isFinite(Number(value))) return Number(value);
  return value ? 1 : 0;
}

class SoftwareFactoryControlPlane {
  #approvalAuthority;
  #approvals;
  #artifacts;
  #audit;
  #clock;
  #counter;
  #factoryRevision;
  #handoffs;
  #identityBoundary;
  #mutationGuard;
  #registry;
  #requirements;
  #runs;
  #runtimeBoundary;

  constructor({
    registry = new SoftwareFactoryAgentRegistry(),
    identityBoundary,
    approvalAuthority,
    runtimeAdapter = null,
    clock = () => new Date(),
  } = {}) {
    if (!identityBoundary
      || typeof identityBoundary.resolveAgentContext !== 'function'
      || typeof identityBoundary.resolveHumanContext !== 'function') {
      throw factoryError('IDENTITY_BOUNDARY_REQUIRED', 'Control Plane bắt buộc có trusted Identity Boundary.');
    }
    this.#registry = registry;
    this.#identityBoundary = identityBoundary;
    this.#clock = clock;
    this.#approvalAuthority = approvalAuthority || new SoftwareFactoryApprovalAuthority({ clock });
    this.#runtimeBoundary = runtimeAdapter ? new RuntimeExecutionBoundary({ adapter: runtimeAdapter, clock }) : null;
    this.#audit = new SoftwareFactoryAuditLedger({ clock });
    this.#requirements = new Map();
    this.#runs = new Map();
    this.#artifacts = new Map();
    this.#handoffs = new Map();
    this.#approvals = new Map();
    this.#counter = 0;
    this.#factoryRevision = 0;
    this.#mutationGuard = new SoftwareFactoryMutationGuard();
  }

  #nextId(prefix) {
    this.#counter += 1;
    return `${prefix}-${String(this.#counter).padStart(6, '0')}`;
  }

  #agent(agentId) {
    return this.#registry.get(agentId);
  }

  #actor(actorContext) {
    const identity = this.#identityBoundary.resolveAgentContext(actorContext);
    const agent = this.#agent(identity.agent_id);
    if (agent.identity_namespace !== identity.identity_namespace) {
      throw factoryError('AGENT_IDENTITY_BINDING_MISMATCH', 'Authenticated Agent Instance không khớp registry namespace.');
    }
    return { agent, identity };
  }

  #run(runId) {
    const run = this.#runs.get(String(runId || ''));
    if (!run) throw factoryError('RUN_NOT_FOUND', `Không tìm thấy Agent Run: ${runId}`);
    return run;
  }

  #requirement(requirementId) {
    const requirement = this.#requirements.get(String(requirementId || ''));
    if (!requirement) throw factoryError('REQUIREMENT_NOT_FOUND', `Không tìm thấy Requirement: ${requirementId}`);
    return requirement;
  }

  #artifactsForRun(runId, artifactType = null) {
    return [...this.#artifacts.values()].filter((artifact) => (
      artifact.run_id === runId && (!artifactType || artifact.artifact_type === artifactType)
    ));
  }

  #latestArtifact(runId, artifactType, predicate = () => true) {
    return this.#artifactsForRun(runId, artifactType).filter(predicate).at(-1) || null;
  }

  #appendAudit(eventType, actorId, requirementId, runId, metadata = {}) {
    return this.#audit.append({
      event_type: eventType,
      actor_id: actorId,
      requirement_id: requirementId,
      run_id: runId,
      metadata,
    });
  }

  #beginRunMutation({ run, requestId, expectedRevision, operation, actorId, input }) {
    return this.#mutationGuard.begin({
      scope_id: run.run_id,
      request_id: requestId,
      expected_revision: expectedRevision,
      current_revision: run.revision,
      operation,
      actor_id: actorId,
      input,
    });
  }

  #completeRunMutation(run, started, result) {
    run.revision += 1;
    const finalResult = typeof result === 'function' ? result() : result;
    this.#mutationGuard.complete(started.token, {
      new_revision: run.revision,
      result: finalResult,
    });
    return finalResult;
  }

  createRequirement({
    actor_context: actorContext,
    payload,
    provenance,
    uat_required: uatRequired = true,
    request_id: requestId,
    expected_factory_revision: expectedFactoryRevision,
  }) {
    const { agent, identity } = this.#actor(actorContext);
    if (agent.agent_type !== AGENT_TYPES.PRODUCT_OWNER) {
      throw factoryError('REQUIREMENT_ACTOR_DENIED', 'Chỉ Product Owner Agent được tạo Requirement.');
    }
    validateProvenance(provenance);

    const started = this.#mutationGuard.begin({
      scope_id: 'software-factory',
      request_id: requestId,
      expected_revision: expectedFactoryRevision,
      current_revision: this.#factoryRevision,
      operation: 'CREATE_REQUIREMENT',
      actor_id: identity.principal_id,
      input: { payload, provenance, uat_required: uatRequired === true },
    });
    if (started.replayed) return started.result;

    const requirementId = this.#nextId('sf-req');
    const runId = this.#nextId('sf-run');
    const createdAt = this.#clock().toISOString();
    const requirement = deepFreeze({
      requirement_id: requirementId,
      created_by: agent.agent_id,
      created_by_principal: identity.principal_id,
      created_at: createdAt,
    });
    const run = {
      run_id: runId,
      requirement_id: requirementId,
      status: RUN_STATES.REQUESTED,
      uat_required: uatRequired === true,
      created_by: agent.agent_id,
      created_by_principal: identity.principal_id,
      created_at: createdAt,
      builder_agent_id: null,
      reviewer_agent_id: null,
      qa_agent_id: null,
      release_agent_id: null,
      founder_approval_id: null,
      build_cycle: 0,
      revision: 0,
    };

    try {
      this.#requirements.set(requirementId, requirement);
      this.#runs.set(runId, run);
      const artifact = this.#storeArtifact({
        agent,
        run,
        type: ARTIFACT_TYPES.REQUIREMENT,
        payload,
        provenance,
      });
      this.#appendAudit('REQUIREMENT_CREATED', agent.agent_id, requirementId, runId, {
        principal_id: identity.principal_id,
        uat_required: run.uat_required,
        artifact_id: artifact.artifact_id,
        artifact_digest: artifact.artifact_digest,
      });

      const result = {
        requirement: clone(requirement),
        run: clone(run),
        artifact,
      };
      this.#factoryRevision += 1;
      this.#mutationGuard.complete(started.token, {
        new_revision: this.#factoryRevision,
        result,
      });
      return result;
    } catch (error) {
      this.#requirements.delete(requirementId);
      this.#runs.delete(runId);
      for (const [artifactId, artifact] of this.#artifacts.entries()) {
        if (artifact.run_id === runId) this.#artifacts.delete(artifactId);
      }
      this.#mutationGuard.abort(started.token);
      throw error;
    }
  }

  #storeArtifact({ agent, run, type, payload, provenance }) {
    if (!agent.write_scope.includes(type)) {
      throw factoryError('ARTIFACT_ACTOR_DENIED', `${agent.agent_type} không được tạo ${type}.`);
    }
    if (!(ARTIFACT_ALLOWED_STATES[type] || []).includes(run.status)) {
      throw factoryError('ARTIFACT_STATE_DENIED', `${type} không được tạo khi run ở ${run.status}.`);
    }

    if (type === ARTIFACT_TYPES.IMPLEMENTATION && run.builder_agent_id !== agent.agent_id) {
      throw factoryError('BUILDER_IDENTITY_MISMATCH', 'ImplementationArtifact phải do Builder đã nhận run tạo.');
    }
    if (type === ARTIFACT_TYPES.REVIEW && run.builder_agent_id === agent.agent_id) {
      throw factoryError('SELF_REVIEW_DENIED', 'Builder không thể review implementation của chính mình.');
    }
    if (type === ARTIFACT_TYPES.TEST && run.builder_agent_id === agent.agent_id) {
      throw factoryError('BUILDER_QA_CONFLICT', 'Builder không thể làm QA cho chính run của mình.');
    }
    validateProvenance(provenance);
    if (provenance?.captured_by !== agent.agent_id) {
      throw factoryError('PROVENANCE_ACTOR_MISMATCH', 'Provenance captured_by không khớp authenticated Agent.');
    }
    if (provenance.policy_version !== agent.policy_version) {
      throw factoryError('PROVENANCE_POLICY_MISMATCH', 'Provenance policy_version không khớp Agent policy đang thực thi.');
    }

    const parentArtifactIds = provenance?.parent_artifact_ids;
    if (type !== ARTIFACT_TYPES.REQUIREMENT
      && (!Array.isArray(parentArtifactIds) || parentArtifactIds.length < 1)) {
      throw factoryError('PROVENANCE_PARENT_REQUIRED', type + ' cần ít nhất một parent artifact.');
    }
    for (const parentArtifactId of parentArtifactIds || []) {
      const parent = this.#artifacts.get(parentArtifactId);
      if (!parent || parent.run_id !== run.run_id || parent.requirement_id !== run.requirement_id) {
        throw factoryError('PROVENANCE_PARENT_SCOPE_MISMATCH', 'Parent artifact không thuộc cùng Requirement/Run.');
      }
      verifyArtifactIntegrity(parent);
    }

    const artifact = createArtifact({
      artifact_id: this.#nextId('sf-artifact'),
      type,
      requirement_id: run.requirement_id,
      run_id: run.run_id,
      created_by: agent.agent_id,
      payload,
      provenance,
      run_cycle: run.build_cycle,
    }, this.#clock);
    this.#artifacts.set(artifact.artifact_id, artifact);
    this.#appendAudit('ARTIFACT_CREATED', agent.agent_id, run.requirement_id, run.run_id, {
      artifact_id: artifact.artifact_id,
      artifact_type: artifact.artifact_type,
      version: artifact.version,
      artifact_digest: artifact.artifact_digest,
      provenance_digest: artifact.provenance_digest,
      redaction_count: artifact.redactions.length,
    });
    return artifact;
  }

  createArtifact({
    actor_context: actorContext,
    run_id: runId,
    type,
    payload,
    provenance,
    request_id: requestId,
    expected_revision: expectedRevision,
  }) {
    const run = this.#run(runId);
    this.#requirement(run.requirement_id);
    const { agent, identity } = this.#actor(actorContext);
    const started = this.#beginRunMutation({
      run,
      requestId,
      expectedRevision,
      operation: 'CREATE_ARTIFACT',
      actorId: identity.principal_id,
      input: { type, payload, provenance },
    });
    if (started.replayed) return started.result;
    try {
      const artifact = this.#storeArtifact({ agent, run, type, payload, provenance });
      return this.#completeRunMutation(run, started, artifact);
    } catch (error) {
      this.#mutationGuard.abort(started.token);
      throw error;
    }
  }

  #assertTransitionPrerequisites(run, agent, toState) {
    if (toState === RUN_STATES.ARCHITECTURE_APPROVED
      && !this.#latestArtifact(run.run_id, ARTIFACT_TYPES.ARCHITECTURE)) {
      throw factoryError('ARCHITECTURE_ARTIFACT_REQUIRED', 'Thiếu ArchitectureArtifact.');
    }

    if (toState === RUN_STATES.READY_TO_BUILD
      && [RUN_STATES.FAILED, RUN_STATES.CHANGES_REQUESTED].includes(run.status)) {
      run.builder_agent_id = null;
      run.reviewer_agent_id = null;
      run.qa_agent_id = null;
      run.release_agent_id = null;
      run.founder_approval_id = null;
    }

    if (toState === RUN_STATES.BUILDING) {
      run.build_cycle += 1;
      run.builder_agent_id = agent.agent_id;
    }

    if (toState === RUN_STATES.BUILT) {
      if (run.builder_agent_id !== agent.agent_id) {
        throw factoryError('BUILDER_IDENTITY_MISMATCH', 'Chỉ Builder đã nhận run mới được đánh dấu BUILT.');
      }
      if (!this.#latestArtifact(run.run_id, ARTIFACT_TYPES.IMPLEMENTATION, (item) => item.run_cycle === run.build_cycle)) {
        throw factoryError('IMPLEMENTATION_ARTIFACT_REQUIRED', 'Thiếu ImplementationArtifact.');
      }
    }

    if ([RUN_STATES.REVIEW_PASSED, RUN_STATES.BLOCKED, RUN_STATES.CHANGES_REQUESTED].includes(toState)) {
      if (agent.agent_id === run.builder_agent_id) {
        throw factoryError('SELF_REVIEW_DENIED', 'Builder không thể review hoặc approve code của chính mình.');
      }
      const expectedStatus = toState === RUN_STATES.REVIEW_PASSED
        ? 'PASS'
        : toState === RUN_STATES.BLOCKED
          ? 'BLOCKED'
          : 'CHANGES_REQUESTED';
      const review = this.#latestArtifact(run.run_id, ARTIFACT_TYPES.REVIEW, (item) => (
        item.created_by === agent.agent_id
        && item.run_cycle === run.build_cycle
        && item.payload.status === expectedStatus
      ));
      if (!review) throw factoryError('REVIEW_ARTIFACT_REQUIRED', `Thiếu ReviewArtifact status=${expectedStatus}.`);
      run.reviewer_agent_id = agent.agent_id;
    }

    if (toState === RUN_STATES.TESTING) {
      if (agent.agent_id === run.builder_agent_id || agent.agent_id === run.reviewer_agent_id) {
        throw factoryError('QA_SEPARATION_OF_DUTIES', 'QA phải độc lập với Builder và Reviewer.');
      }
      run.qa_agent_id = agent.agent_id;
    }

    if ([RUN_STATES.TEST_PASSED, RUN_STATES.FAILED].includes(toState)) {
      if (run.qa_agent_id !== agent.agent_id) throw factoryError('QA_IDENTITY_MISMATCH', 'Chỉ QA đã nhận run được kết luận test.');
      const testArtifact = this.#latestArtifact(run.run_id, ARTIFACT_TYPES.TEST, (item) => (
        item.run_cycle === run.build_cycle && item.payload.test_kind === 'AUTOMATED'
      ));
      if (!testArtifact) throw factoryError('TEST_ARTIFACT_REQUIRED', 'Thiếu TestArtifact AUTOMATED.');
      const failures = countFailures(testArtifact.payload.failed);
      if (toState === RUN_STATES.TEST_PASSED && (testArtifact.payload.status !== 'PASS' || failures > 0)) {
        throw factoryError('TEST_GATE_FAILED', 'Không thể TEST_PASSED khi còn test FAIL.');
      }
      if (toState === RUN_STATES.FAILED && testArtifact.payload.status !== 'FAIL' && failures === 0) {
        throw factoryError('FAILED_STATE_REQUIRES_EVIDENCE', 'FAILED cần TestArtifact có lỗi.');
      }
    }

    if (toState === RUN_STATES.UAT_READY && run.qa_agent_id !== agent.agent_id) {
      throw factoryError('QA_IDENTITY_MISMATCH', 'Chỉ QA đã nhận run được mở UAT_READY.');
    }

    if (toState === RUN_STATES.UAT_PASSED) {
      const uatArtifact = this.#latestArtifact(run.run_id, ARTIFACT_TYPES.TEST, (item) => (
        item.run_cycle === run.build_cycle && item.payload.test_kind === 'UAT'
      ));
      if (!uatArtifact) throw factoryError('UAT_ARTIFACT_REQUIRED', 'Thiếu TestArtifact UAT.');
      const expected = run.uat_required ? 'PASS' : 'NOT_REQUIRED';
      if (uatArtifact.payload.status !== expected || (run.uat_required && countFailures(uatArtifact.payload.failed) > 0)) {
        throw factoryError('UAT_GATE_FAILED', `UAT phải có status ${expected} và không còn lỗi.`);
      }
    }

    if (toState === RUN_STATES.RELEASE_CANDIDATE) {
      if ([run.builder_agent_id, run.reviewer_agent_id, run.qa_agent_id].includes(agent.agent_id)) {
        throw factoryError('RELEASE_SEPARATION_OF_DUTIES', 'Release Agent phải độc lập với Builder/Reviewer/QA.');
      }
      const release = this.#latestArtifact(run.run_id, ARTIFACT_TYPES.RELEASE, (item) => (
        item.created_by === agent.agent_id && item.run_cycle === run.build_cycle
      ));
      if (!release) throw factoryError('RELEASE_ARTIFACT_REQUIRED', 'Thiếu ReleaseArtifact.');
      if (release.payload.release_status !== 'CANDIDATE') {
        throw factoryError('RELEASE_ARTIFACT_INVALID', 'ReleaseArtifact phải ở trạng thái CANDIDATE.');
      }
      run.release_agent_id = agent.agent_id;
    }

    if ([RUN_STATES.AWAITING_FOUNDER_APPROVAL, RUN_STATES.BASELINED, RUN_STATES.ROLLED_BACK].includes(toState)
      && run.release_agent_id !== agent.agent_id) {
      throw factoryError('RELEASE_IDENTITY_MISMATCH', 'Chỉ Release Agent đã lập candidate được tiếp tục release gate.');
    }

    if (toState === RUN_STATES.BASELINED) {
      const approval = this.#approvals.get(run.founder_approval_id);
      if (!approval || approval.status !== 'APPROVED') {
        throw factoryError('FOUNDER_APPROVAL_REQUIRED', 'Chưa có Founder/authorized human approval.');
      }
      const target = this.#releaseApprovalTarget(run);
      if (approval.release_artifact_id !== target.release_artifact_id
        || approval.target_digest !== target.target_digest
        || Number(approval.run_cycle) !== Number(target.run_cycle)) {
        throw factoryError('APPROVAL_TARGET_MISMATCH', 'Founder approval không khớp ReleaseArtifact/digest hiện hành.');
      }
    }
  }

  transition({
    actor_context: actorContext,
    run_id: runId,
    to_state: toState,
    evidence = {},
    request_id: requestId,
    expected_revision: expectedRevision,
  }) {
    const run = this.#run(runId);
    const { agent, identity } = this.#actor(actorContext);
    const fromState = run.status;
    const snapshot = clone(run);
    const started = this.#beginRunMutation({
      run,
      requestId,
      expectedRevision,
      operation: 'TRANSITION',
      actorId: identity.principal_id,
      input: { to_state: toState, evidence },
    });
    if (started.replayed) return started.result;

    try {
      assertTransitionAllowed(fromState, toState);
      assertActorTypeAllowed(agent, toState);
      this.#assertTransitionPrerequisites(run, agent, toState);
    } catch (error) {
      this.#appendAudit('QUALITY_GATE_TRANSITION_DENIED', agent.agent_id, run.requirement_id, run.run_id, {
        principal_id: identity.principal_id,
        from_state: fromState,
        to_state: toState,
        reason_code: error.code || 'TRANSITION_DENIED',
      });
      restoreObject(run, snapshot);
      this.#mutationGuard.abort(started.token);
      throw error;
    }

    run.status = toState;
    run.updated_at = this.#clock().toISOString();
    run.revision += 1;
    this.#appendAudit('QUALITY_GATE_TRANSITION', agent.agent_id, run.requirement_id, run.run_id, {
      principal_id: identity.principal_id,
      from_state: fromState,
      to_state: toState,
      evidence: clone(evidence),
      revision: run.revision,
    });
    const result = clone(run);
    this.#mutationGuard.complete(started.token, { new_revision: run.revision, result });
    return result;
  }

  handoff({
    actor_context: actorContext,
    to_agent_id: toAgentId,
    run_id: runId,
    artifact_ids: artifactIds,
    request_id: requestId,
    expected_revision: expectedRevision,
  }) {
    const run = this.#run(runId);
    const { agent: from, identity } = this.#actor(actorContext);
    const to = this.#agent(toAgentId);
    const started = this.#beginRunMutation({
      run,
      requestId,
      expectedRevision,
      operation: 'HANDOFF',
      actorId: identity.principal_id,
      input: { to_agent_id: toAgentId, artifact_ids: artifactIds },
    });
    if (started.replayed) return started.result;
    try {
    if (from.agent_id === to.agent_id) throw factoryError('SELF_HANDOFF_DENIED', 'Không được handoff cho chính mình.');
    if (!from.handoff_targets.includes(to.agent_type)) {
      throw factoryError('HANDOFF_TARGET_DENIED', `${from.agent_id} không được handoff tới ${to.agent_type}.`);
    }
    if (!Array.isArray(artifactIds) || artifactIds.length === 0) {
      throw factoryError('HANDOFF_EVIDENCE_REQUIRED', 'Handoff phải có ít nhất một artifact.');
    }
    const artifacts = artifactIds.map((id) => {
      const artifact = this.#artifacts.get(id);
      if (!artifact) throw factoryError('ARTIFACT_NOT_FOUND', `Không tìm thấy artifact: ${id}`);
      if (artifact.run_id !== run.run_id || artifact.requirement_id !== run.requirement_id) {
        throw factoryError('HANDOFF_ARTIFACT_SCOPE_MISMATCH', 'Artifact không thuộc cùng Requirement/Agent Run.');
      }
      return artifact;
    });
    if (from.agent_type !== AGENT_TYPES.ORCHESTRATOR
      && artifacts.some((artifact) => artifact.created_by !== from.agent_id)) {
      throw factoryError('HANDOFF_ARTIFACT_OWNERSHIP_MISMATCH', 'Agent chỉ được handoff artifact do mình tạo; Orchestrator là ngoại lệ điều phối.');
    }
    const handoff = deepFreeze({
      handoff_id: this.#nextId('sf-handoff'),
      requirement_id: run.requirement_id,
      run_id: run.run_id,
      from_agent_id: from.agent_id,
      to_agent_id: to.agent_id,
      artifact_ids: artifacts.map((item) => item.artifact_id),
      created_at: this.#clock().toISOString(),
    });
    this.#handoffs.set(handoff.handoff_id, handoff);
    this.#appendAudit('HANDOFF_CREATED', from.agent_id, run.requirement_id, run.run_id, {
      principal_id: identity.principal_id,
      handoff_id: handoff.handoff_id,
      to_agent_id: to.agent_id,
      artifact_ids: handoff.artifact_ids,
    });
      return this.#completeRunMutation(run, started, handoff);
    } catch (error) {
      this.#mutationGuard.abort(started.token);
      throw error;
    }
  }

  #releaseApprovalTarget(run) {
    const release = this.#latestArtifact(run.run_id, ARTIFACT_TYPES.RELEASE, (item) => (
      item.run_cycle === run.build_cycle && item.payload.release_status === 'CANDIDATE'
    ));
    if (!release) throw factoryError('RELEASE_ARTIFACT_REQUIRED', 'Thiếu ReleaseArtifact hiện hành để approval.');
    return {
      requirement_id: run.requirement_id,
      run_id: run.run_id,
      run_cycle: run.build_cycle,
      release_artifact_id: release.artifact_id,
      target_digest: digestValue(release),
    };
  }

  issueFounderApproval({
    human_context: humanContext,
    run_id: runId,
    approved,
    notes = '',
    ttl_ms: ttlMs,
    request_id: requestId,
    expected_revision: expectedRevision,
  }) {
    const run = this.#run(runId);
    if (run.status !== RUN_STATES.AWAITING_FOUNDER_APPROVAL) {
      throw factoryError('APPROVAL_STATE_DENIED', 'Founder approval chỉ được ghi ở AWAITING_FOUNDER_APPROVAL.');
    }
    const humanIdentity = this.#identityBoundary.resolveHumanContext(humanContext);
    const started = this.#beginRunMutation({
      run,
      requestId,
      expectedRevision,
      operation: 'ISSUE_FOUNDER_APPROVAL',
      actorId: humanIdentity.principal_id,
      input: { approved: approved === true, notes, ttl_ms: ttlMs || null },
    });
    if (started.replayed) return started.result;
    try {
    const target = this.#releaseApprovalTarget(run);
    const token = this.#approvalAuthority.issue({
      humanIdentity,
      decision: approved === true ? 'APPROVED' : 'REJECTED',
      target,
      notes,
      ...(ttlMs == null ? {} : { ttlMs }),
    });
    this.#appendAudit('FOUNDER_APPROVAL_ISSUED', humanIdentity.principal_id, run.requirement_id, run.run_id, {
      nonce: token.nonce,
      authority: token.authority,
      release_artifact_id: target.release_artifact_id,
      target_digest: target.target_digest,
      expires_at: token.expires_at,
    });
      return this.#completeRunMutation(run, started, token);
    } catch (error) {
      this.#mutationGuard.abort(started.token);
      throw error;
    }
  }

  recordFounderApproval({
    run_id: runId,
    approval_token: approvalToken,
    request_id: requestId,
    expected_revision: expectedRevision,
  }) {
    const run = this.#run(runId);
    if (run.status !== RUN_STATES.AWAITING_FOUNDER_APPROVAL) {
      throw factoryError('APPROVAL_STATE_DENIED', 'Founder approval chỉ được ghi ở AWAITING_FOUNDER_APPROVAL.');
    }
    const started = this.#beginRunMutation({
      run,
      requestId,
      expectedRevision,
      operation: 'RECORD_FOUNDER_APPROVAL',
      actorId: String(approvalToken?.approver_identity || 'unknown-approver'),
      input: { approval_token: approvalToken },
    });
    if (started.replayed) return started.result;
    try {
    const target = this.#releaseApprovalTarget(run);
    const approval = this.#approvalAuthority.consume(approvalToken, target);
    this.#approvals.set(approval.approval_id, approval);
    run.founder_approval_id = approval.approval_id;
    this.#appendAudit('FOUNDER_APPROVAL_RECORDED', approval.approver_id, run.requirement_id, run.run_id, {
      approval_id: approval.approval_id,
      nonce: approval.nonce,
      status: approval.status,
      authority: approval.authority,
      release_artifact_id: approval.release_artifact_id,
      target_digest: approval.target_digest,
    });
      return this.#completeRunMutation(run, started, approval);
    } catch (error) {
      this.#mutationGuard.abort(started.token);
      throw error;
    }
  }

  authorizeAction(request = {}) {
    if (Object.prototype.hasOwnProperty.call(request, 'identity')
      || Object.prototype.hasOwnProperty.call(request, 'agent_id')) {
      throw factoryError('CALLER_IDENTITY_DENIED', 'Caller không được tự khai identity/agent_id.');
    }
    const { agent, identity } = this.#actor(request.actor_context);
    const policyRequest = { ...request, identity };
    delete policyRequest.actor_context;
    const decision = evaluateAgentAction(this.#registry, policyRequest);
    this.#appendAudit('AGENT_POLICY_DECISION', agent.agent_id, request.requirement_id || null, request.run_id || null, {
      principal_id: identity.principal_id,
      tool: request.tool || null,
      action: decision.action || null,
      path: request.path || null,
      allowed: decision.allowed,
      reason_code: decision.reason_code,
    });
    return decision;
  }

  #assertToolGate(request, run, agent, action) {
    const implementationActions = new Set([
      POLICY_ACTIONS.MODIFY_CODE,
      POLICY_ACTIONS.MODIFY_SCHEMA,
      POLICY_ACTIONS.CREATE_MIGRATION,
    ]);

    if (implementationActions.has(action)) {
      if (run.status !== RUN_STATES.BUILDING || run.builder_agent_id !== agent.agent_id) {
        throw factoryError('APPROVED_BUILD_GATE_REQUIRED', 'Tool ghi chỉ được gọi bởi Builder đã nhận run ở BUILDING.');
      }
      const architecture = this.#latestArtifact(run.run_id, ARTIFACT_TYPES.ARCHITECTURE);
      if (!architecture) throw factoryError('ARCHITECTURE_ARTIFACT_REQUIRED', 'Tool ghi cần ArchitectureArtifact đã duyệt.');
      if ([POLICY_ACTIONS.MODIFY_SCHEMA, POLICY_ACTIONS.CREATE_MIGRATION].includes(action)
        && (agent.agent_type !== AGENT_TYPES.DATABASE_MIGRATION || architecture.payload.migration_required !== true)) {
        throw factoryError('MIGRATION_ARCHITECTURE_GATE_REQUIRED', 'Migration cần Database Agent và ArchitectureArtifact cho phép migration.');
      }
    }

    if (action === POLICY_ACTIONS.MODIFY_TEST_CODE) {
      const qaMayWriteTest = [RUN_STATES.TESTING, RUN_STATES.UAT_READY].includes(run.status)
        && run.qa_agent_id === agent.agent_id;
      if (!qaMayWriteTest) {
        throw factoryError('QA_TEST_WRITE_GATE_REQUIRED', 'Chỉ QA đã nhận run được sửa test trong TESTING/UAT_READY.');
      }
    }

    if (action === POLICY_ACTIONS.RUN_TESTS) {
      const builderMayTest = run.status === RUN_STATES.BUILDING && run.builder_agent_id === agent.agent_id;
      const qaMayTest = [RUN_STATES.TESTING, RUN_STATES.UAT_READY].includes(run.status)
        && run.qa_agent_id === agent.agent_id;
      if (!builderMayTest && !qaMayTest) {
        throw factoryError('TEST_EXECUTION_GATE_REQUIRED', 'Test chỉ chạy bởi Builder trong BUILDING hoặc QA trong TESTING/UAT_READY.');
      }
    }

    if ([POLICY_ACTIONS.COMMIT, POLICY_ACTIONS.TAG].includes(action)) {
      const approval = this.#approvals.get(run.founder_approval_id);
      const target = this.#releaseApprovalTarget(run);
      if (run.status !== RUN_STATES.AWAITING_FOUNDER_APPROVAL
        || run.release_agent_id !== agent.agent_id
        || approval?.status !== 'APPROVED'
        || approval.target_digest !== target.target_digest
        || request.target_digest !== target.target_digest) {
        throw factoryError('HUMAN_APPROVED_RELEASE_GATE_REQUIRED', 'Commit/tag cần release candidate và Founder approval.');
      }
    }
  }

  async executeAuthorizedAction(request = {}) {
    if (Object.prototype.hasOwnProperty.call(request, 'identity')
      || Object.prototype.hasOwnProperty.call(request, 'agent_id')) {
      throw factoryError('CALLER_IDENTITY_DENIED', 'Caller không được tự khai identity/agent_id.');
    }
    const { agent, identity } = this.#actor(request.actor_context);
    const policyRequest = { ...request, identity };
    delete policyRequest.actor_context;
    const decision = evaluateAgentAction(this.#registry, policyRequest);
    if (!decision.allowed) {
      this.#appendAudit('AGENT_POLICY_DECISION', agent.agent_id, request.requirement_id || null, request.run_id || null, {
        principal_id: identity.principal_id,
        tool: request.tool || null,
        action: decision.action || null,
        path: request.path || null,
        allowed: false,
        reason_code: decision.reason_code,
      });
      throw factoryError(decision.reason_code, decision.message, decision);
    }

    const run = this.#run(request.run_id);
    if (request.requirement_id !== run.requirement_id) {
      throw factoryError('TOOL_REQUIREMENT_RUN_MISMATCH', 'Tool request không khớp Requirement/Agent Run.');
    }
    const started = this.#beginRunMutation({
      run,
      requestId: request.request_id,
      expectedRevision: request.expected_revision,
      operation: 'EXECUTE_AUTHORIZED_ACTION',
      actorId: identity.principal_id,
      input: {
        tool: request.tool,
        action: decision.action,
        path: request.path || null,
        domain_context: request.context?.domain || null,
        target_digest: request.target_digest || null,
        ...(request.input === undefined ? {} : { input: request.input }),
      },
    });
    if (started.replayed) return started.result;
    this.#appendAudit('AGENT_POLICY_DECISION', agent.agent_id, run.requirement_id, run.run_id, {
      principal_id: identity.principal_id,
      tool: request.tool || null,
      action: decision.action || null,
      path: request.path || null,
      allowed: true,
      reason_code: decision.reason_code,
    });
    try {
      this.#assertToolGate(request, run, agent, decision.action);
    } catch (error) {
      this.#appendAudit('TOOL_INVOCATION_DENIED', agent.agent_id, run.requirement_id, run.run_id, {
        principal_id: identity.principal_id,
        tool: request.tool,
        action: decision.action,
        path: request.path || null,
        reason_code: error.code || 'TOOL_GATE_DENIED',
      });
      this.#mutationGuard.abort(started.token);
      throw error;
    }

    if (!this.#runtimeBoundary) {
      this.#mutationGuard.abort(started.token);
      throw factoryError('RUNTIME_ADAPTER_NOT_CONFIGURED', 'SF-1 P0 chưa cấu hình Runtime Adapter thật.');
    }
    const canonicalPath = request.path ? normalizeRepoPath(request.path) : null;
    this.#appendAudit('TOOL_INVOCATION_STARTED', agent.agent_id, run.requirement_id, run.run_id, {
      principal_id: identity.principal_id,
      tool: request.tool,
      action: decision.action,
      path: canonicalPath,
    });
    try {
      const outcome = await this.#runtimeBoundary.execute({
        policy_verified: true,
        request_id: request.request_id,
        principal_id: identity.principal_id,
        agent_id: agent.agent_id,
        requirement_id: run.requirement_id,
        run_id: run.run_id,
        run_cycle: run.build_cycle,
        tool: request.tool,
        action: decision.action,
        path: canonicalPath,
        domain_context: request.context?.domain || null,
        target_digest: request.target_digest || null,
        ...(request.input === undefined ? {} : { input: clone(request.input) }),
      });
      const evidenceEnvelope = createEvidenceEnvelope({
        evidence_type: 'SOFTWARE_FACTORY_TOOL_OUTCOME',
        subject: run.run_id + ':' + request.tool,
        provenance: {
          source_type: 'RUNTIME_ADAPTER_EVIDENCE',
          source_refs: [{
            ref: 'runtime-grant:' + outcome.grant.grant_id,
            digest: sha256Digest({
              grant_id: outcome.grant.grant_id,
              tool: request.tool,
              path: canonicalPath,
            }),
          }],
          parent_artifact_ids: this.#artifactsForRun(run.run_id).map((item) => item.artifact_id),
          policy_version: agent.policy_version,
          captured_by: agent.agent_id,
          capture_method: 'TOOL_EVIDENCE',
        },
        content: { result: outcome.result, evidence: outcome.evidence },
      });
      const audit = this.#appendAudit('TOOL_INVOCATION_COMPLETED', agent.agent_id, run.requirement_id, run.run_id, {
        principal_id: identity.principal_id,
        grant_id: outcome.grant.grant_id,
        tool: request.tool,
        action: decision.action,
        path: canonicalPath,
        evidence_digest: evidenceEnvelope.evidence_digest,
        evidence: evidenceEnvelope,
      });
      const result = deepFreeze({
        result: evidenceEnvelope.content.result,
        evidence: evidenceEnvelope.content.evidence,
        evidence_envelope: evidenceEnvelope,
        audit,
      });
      return this.#completeRunMutation(run, started, result);
    } catch (error) {
      this.#appendAudit('TOOL_INVOCATION_FAILED', agent.agent_id, run.requirement_id, run.run_id, {
        principal_id: identity.principal_id,
        tool: request.tool,
        action: decision.action,
        path: canonicalPath,
        reason_code: error.code || 'RUNTIME_INVOCATION_FAILED',
      });
      this.#mutationGuard.abort(started.token);
      throw error;
    }
  }

  recordToolInvocation() {
    throw factoryError('DIRECT_TOOL_RECORDING_DENIED', 'Tool invocation chỉ được thực hiện qua executeAuthorizedAction().');
  }

  getRun(runId) {
    return clone(this.#run(runId));
  }

  getFactoryRevision() {
    return this.#factoryRevision;
  }

  getArtifact(artifactId) {
    const artifact = this.#artifacts.get(String(artifactId || ''));
    if (!artifact) throw factoryError('ARTIFACT_NOT_FOUND', `Không tìm thấy artifact: ${artifactId}`);
    verifyArtifactIntegrity(artifact);
    return artifact;
  }

  buildTrace(runId) {
    const run = this.#run(runId);
    const artifacts = this.#artifactsForRun(run.run_id);
    artifacts.forEach(verifyArtifactIntegrity);
    return deepFreeze({
      requirement: this.#requirement(run.requirement_id),
      run: clone(run),
      artifacts,
      handoffs: [...this.#handoffs.values()].filter((item) => item.run_id === run.run_id),
      approval: run.founder_approval_id ? this.#approvals.get(run.founder_approval_id) : null,
      audit: this.#audit.list({ run_id: run.run_id }),
    });
  }

  getAgentDefinition(agentId) {
    return this.#registry.get(agentId);
  }

  getAuditEntries(filter = {}) {
    return this.#audit.list(filter);
  }

  verifyAuditChain() {
    return this.#audit.verifyChain();
  }
}

module.exports = {
  SoftwareFactoryControlPlane,
};
