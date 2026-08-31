const { SoftwareFactoryAgentRegistry, deepFreeze } = require('./agentRegistry');
const { createArtifact } = require('./artifactContracts');
const { clone, sha256Digest, stableSerialize } = require('./canonical');
const { AGENT_TYPES, ARTIFACT_TYPES, RUN_STATES } = require('./constants');
const { DurableControlPlaneFoundation } = require('./durableControlPlane');
const { redactSensitiveData } = require('./evidenceContracts');
const { factoryError } = require('./errors');
const {
  SF2C2_FACTORY_STATE_SCHEMA_VERSION,
  SF2C2_OPERATIONS,
  artifactReference,
  artifactVersionId,
  digestRecord,
  findArtifactVersion,
  sameFields,
  verifyStagingFactoryState,
} = require('./factoryStateContracts');
const { assertPlainJsonValue } = require('./plainJson');
const { assertActorTypeAllowed, assertTransitionAllowed } = require('./qualityGate');

const COMMAND_FIELDS = Object.freeze([
  'actor_id', 'authorization', 'evidence', 'expected_revision', 'operation',
  'payload', 'request_id', 'requirement_id', 'run_id',
]);

const ARTIFACT_PAYLOAD_FIELDS = Object.freeze([
  'artifact_id', 'artifact_type', 'expected_previous_version', 'payload',
  'provenance', 'subject_ref',
]);

const BUILDER_TYPES = new Set([
  AGENT_TYPES.BACKEND_DOMAIN,
  AGENT_TYPES.FRONTEND,
  AGENT_TYPES.DATABASE_MIGRATION,
]);

const GATE_REQUIRED_ARTIFACT_TYPE = Object.freeze({
  [RUN_STATES.ANALYZED]: ARTIFACT_TYPES.REQUIREMENT,
  [RUN_STATES.ARCHITECTURE_APPROVED]: ARTIFACT_TYPES.ARCHITECTURE,
  [RUN_STATES.READY_TO_BUILD]: ARTIFACT_TYPES.ARCHITECTURE,
  [RUN_STATES.BUILDING]: ARTIFACT_TYPES.ARCHITECTURE,
  [RUN_STATES.BUILT]: ARTIFACT_TYPES.IMPLEMENTATION,
  [RUN_STATES.IN_REVIEW]: ARTIFACT_TYPES.IMPLEMENTATION,
  [RUN_STATES.REVIEW_PASSED]: ARTIFACT_TYPES.REVIEW,
  [RUN_STATES.CHANGES_REQUESTED]: ARTIFACT_TYPES.REVIEW,
  [RUN_STATES.BLOCKED]: ARTIFACT_TYPES.REVIEW,
  [RUN_STATES.TESTING]: ARTIFACT_TYPES.REVIEW,
  [RUN_STATES.TEST_PASSED]: ARTIFACT_TYPES.TEST,
  [RUN_STATES.FAILED]: ARTIFACT_TYPES.TEST,
  [RUN_STATES.UAT_READY]: ARTIFACT_TYPES.TEST,
  [RUN_STATES.UAT_PASSED]: ARTIFACT_TYPES.TEST,
  [RUN_STATES.RELEASE_CANDIDATE]: ARTIFACT_TYPES.RELEASE,
  [RUN_STATES.AWAITING_FOUNDER_APPROVAL]: ARTIFACT_TYPES.RELEASE,
});

function requiredText(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw factoryError('SF2C2_COMMAND_INVALID', 'Thiếu hoặc sai ' + field + '.');
  }
  return value.trim();
}

function requiredIdentifier(value, field) {
  const identifier = requiredText(value, field);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(identifier)) {
    throw factoryError('SF2C2_IDENTIFIER_INVALID', field + ' không thuộc opaque identifier contract.');
  }
  const result = redactSensitiveData({ value: identifier });
  if (result.findings.length || result.value.value !== identifier) {
    throw factoryError('SF2C2_IDENTIFIER_SENSITIVE', field + ' không được chứa secret/PII.');
  }
  return identifier;
}

function withDigest(base) {
  return deepFreeze({ ...base, record_digest: sha256Digest(base) });
}

function exactPayload(payload, fields, operation) {
  assertPlainJsonValue(payload);
  if (!sameFields(payload, fields)) {
    throw factoryError('SF2C2_PAYLOAD_INVALID', operation + ' payload sai exact contract.');
  }
  return payload;
}

function latestArtifactOfType(state, artifactType) {
  return [...state.artifact_versions].reverse().find((item) => (
    item.artifact_type === artifactType
    && state.latest_artifact_versions[item.artifact_id]?.version === item.version
  )) || null;
}

function sameReference(left, right) {
  return stableSerialize(left) === stableSerialize(right);
}

function currentEvidenceStreams(records, subjectReference, predicate = () => true) {
  const streams = new Map();
  for (const item of records) {
    if (sameReference(item.subject_ref, subjectReference) && predicate(item)) {
      streams.set(item.artifact_ref.artifact_id, item);
    }
  }
  return [...streams.values()];
}

class StagingDurableFactoryControlPlane {
  #clock;
  #durable;
  #registry;

  constructor({
    port,
    key_provider: keyProvider,
    authorization_verifier: authorizationVerifier,
    registry = new SoftwareFactoryAgentRegistry(),
    clock = () => new Date(),
  } = {}) {
    if (!(registry instanceof SoftwareFactoryAgentRegistry)) {
      throw factoryError('SF2C2_REGISTRY_REQUIRED', 'SF2-C2 phải reuse SoftwareFactoryAgentRegistry canonical.');
    }
    this.#registry = registry;
    this.#clock = clock;
    this.#durable = new DurableControlPlaneFoundation({
      port,
      key_provider: keyProvider,
      authorization_verifier: authorizationVerifier,
      clock,
    });
  }

  #agent(actorId) {
    const agent = this.#registry.get(actorId);
    if (agent.identity_namespace !== 'software_factory') {
      throw factoryError('SF2C2_IDENTITY_NAMESPACE_DENIED', 'Chỉ Software Factory identity được phép.');
    }
    return agent;
  }

  #assertAgentPolicy(agent, command) {
    if (command.authorization?.agent_id !== agent.agent_id
      || command.authorization?.policy_version !== agent.policy_version) {
      throw factoryError('SF2C2_AUTHORIZATION_POLICY_MISMATCH', 'Identity/policy không khớp canonical registry.');
    }
  }

  #assertArtifactProvenance(agent, provenance) {
    if (provenance?.captured_by !== agent.agent_id
      || provenance?.policy_version !== agent.policy_version) {
      throw factoryError(
        'SF2C2_ARTIFACT_PROVENANCE_AUTHORITY_MISMATCH',
        'Artifact provenance phải bind authenticated creator và canonical registry policy.',
      );
    }
  }

  async #readState(runId) {
    const durableState = await this.#durable.readCurrentState({ scope_id: runId });
    if (!durableState) return { state: null, revision: 0 };
    verifyStagingFactoryState(durableState.state);
    return { state: clone(durableState.state), revision: durableState.revision };
  }

  async readRun(runId) {
    runId = requiredIdentifier(runId, 'run_id');
    const current = await this.#readState(runId);
    if (!current.state) throw factoryError('SF2C2_FACTORY_RUN_NOT_FOUND', 'Factory Run không tồn tại.');
    return deepFreeze({ revision: current.revision, state: current.state });
  }

  #artifactRecord(state, agent, input, now, allowedTypes) {
    exactPayload(input, ARTIFACT_PAYLOAD_FIELDS, 'Artifact Version');
    const artifactId = requiredIdentifier(input.artifact_id, 'payload.artifact_id');
    if (!allowedTypes.includes(input.artifact_type)) {
      throw factoryError('SF2C2_ARTIFACT_TYPE_DENIED', 'Artifact type không được phép cho operation/role này.');
    }
    if (!Number.isInteger(input.expected_previous_version) || input.expected_previous_version < 0) {
      throw factoryError('SF2C2_ARTIFACT_VERSION_INVALID', 'expected_previous_version phải là integer >= 0.');
    }
    const previous = [...state.artifact_versions].reverse().find((item) => item.artifact_id === artifactId) || null;
    const currentVersion = previous?.version || 0;
    if (currentVersion !== input.expected_previous_version) {
      throw factoryError('SF2C2_STALE_ARTIFACT_VERSION', 'Artifact expected_previous_version đã stale.', {
        expected_previous_version: input.expected_previous_version,
        current_version: currentVersion,
      });
    }
    if (previous && previous.artifact_type !== input.artifact_type) {
      throw factoryError('SF2C2_ARTIFACT_ID_RETYPE_DENIED', 'Artifact ID không được đổi type giữa các version.');
    }
    if (!input.provenance || !Array.isArray(input.provenance.parent_artifact_ids)
      || input.provenance.parent_artifact_ids.length < 1) {
      throw factoryError('SF2C2_PROVENANCE_PARENT_REQUIRED', 'Artifact cần parent Artifact version/digest.');
    }
    this.#assertArtifactProvenance(agent, input.provenance);
    const subject = input.subject_ref === null ? null : findArtifactVersion(state, input.subject_ref);
    const version = currentVersion + 1;
    const artifact = createArtifact({
      artifact_id: artifactId,
      requirement_id: state.factory_run.requirement_id,
      run_id: state.factory_run.run_id,
      created_by: agent.agent_id,
      type: input.artifact_type,
      payload: input.payload,
      provenance: input.provenance,
      version,
      run_cycle: 0,
    }, () => new Date(now));
    const base = {
      artifact_id: artifactId,
      artifact_type: input.artifact_type,
      version,
      version_id: artifactVersionId(artifactId, version),
      created_by: agent.agent_id,
      created_at: artifact.created_at,
      subject_ref: subject ? artifactReference(subject) : null,
      artifact,
    };
    return withDigest(base);
  }

  #appendArtifact(state, record) {
    state.artifact_versions.push(record);
    state.latest_artifact_versions[record.artifact_id] = artifactReference(record);
  }

  #appendTrace(state, { actorId, operation, eventType, subject, now }) {
    const previous = state.trace_events.at(-1) || null;
    const sequence = state.trace_events.length + 1;
    const base = {
      event_id: 'sf2c2-trace-' + state.factory_run.run_id + '-' + sequence,
      sequence,
      event_type: eventType,
      operation,
      run_id: state.factory_run.run_id,
      requirement_id: state.factory_run.requirement_id,
      actor_id: actorId,
      subject: clone(subject),
      timestamp: now,
      previous_event_digest: previous?.event_digest || null,
    };
    state.trace_events.push(deepFreeze({ ...base, event_digest: sha256Digest(base) }));
    state.factory_run.updated_at = now;
  }

  #createRun(command, agent, now) {
    if (agent.agent_type !== AGENT_TYPES.PRODUCT_OWNER) {
      throw factoryError('SF2C2_REQUIREMENT_AUTHORITY_DENIED', 'Chỉ Product Owner tạo Requirement/Factory Run.');
    }
    const payload = exactPayload(command.payload, [
      'provenance', 'requirement_artifact_id', 'requirement_payload',
    ], command.operation);
    if (!Array.isArray(payload.provenance?.parent_artifact_ids)
      || payload.provenance.parent_artifact_ids.length !== 0) {
      throw factoryError('SF2C2_REQUIREMENT_PARENT_DENIED', 'RequirementArtifact v1 không được khai parent giả.');
    }
    this.#assertArtifactProvenance(agent, payload.provenance);
    const artifactId = requiredIdentifier(payload.requirement_artifact_id, 'requirement_artifact_id');
    const artifact = createArtifact({
      artifact_id: artifactId,
      requirement_id: command.requirement_id,
      run_id: command.run_id,
      created_by: agent.agent_id,
      type: ARTIFACT_TYPES.REQUIREMENT,
      payload: payload.requirement_payload,
      provenance: payload.provenance,
      version: 1,
      run_cycle: 0,
    }, () => new Date(now));
    const artifactBase = {
      artifact_id: artifactId,
      artifact_type: ARTIFACT_TYPES.REQUIREMENT,
      version: 1,
      version_id: artifactVersionId(artifactId, 1),
      created_by: agent.agent_id,
      created_at: artifact.created_at,
      subject_ref: null,
      artifact,
    };
    const artifactRecord = withDigest(artifactBase);
    const reference = artifactReference(artifactRecord);
    const requirement = withDigest({
      requirement_id: command.requirement_id,
      created_by: agent.agent_id,
      created_at: now,
      artifact_ref: reference,
    });
    const state = {
      schema_version: SF2C2_FACTORY_STATE_SCHEMA_VERSION,
      factory_run: {
        run_id: command.run_id,
        requirement_id: command.requirement_id,
        created_by: agent.agent_id,
        created_at: now,
        updated_at: now,
        gate_state: RUN_STATES.REQUESTED,
      },
      requirement,
      artifact_versions: [artifactRecord],
      latest_artifact_versions: { [artifactId]: reference },
      reviews: [],
      test_evidence: [],
      gate_events: [],
      handoffs: [],
      release_evidence: [],
      trace_events: [],
    };
    this.#appendTrace(state, {
      actorId: agent.agent_id,
      operation: command.operation,
      eventType: 'FACTORY_RUN_CREATED',
      subject: { requirement_ref: reference },
      now,
    });
    return state;
  }

  #createGeneralArtifact(state, command, agent, now) {
    const type = command.payload?.artifact_type;
    if (type === ARTIFACT_TYPES.ARCHITECTURE) {
      if (agent.agent_type !== AGENT_TYPES.SOLUTION_ARCHITECT
        || state.factory_run.gate_state !== RUN_STATES.ANALYZED) {
        throw factoryError('SF2C2_ARCHITECTURE_AUTHORITY_DENIED', 'Architecture Artifact cần Architect tại ANALYZED.');
      }
    } else if (type === ARTIFACT_TYPES.IMPLEMENTATION) {
      if (!BUILDER_TYPES.has(agent.agent_type)
        || state.factory_run.gate_state !== RUN_STATES.BUILDING) {
        throw factoryError('SF2C2_BUILDER_AUTHORITY_DENIED', 'Implementation Artifact cần Builder tại BUILDING.');
      }
    } else {
      throw factoryError('SF2C2_ARTIFACT_TYPE_DENIED', 'Generic operation chỉ tạo Architecture/Implementation Artifact.');
    }
    if (command.payload.subject_ref !== null) {
      throw factoryError('SF2C2_ARTIFACT_SUBJECT_DENIED', 'Architecture/Implementation dùng provenance parent, không caller subject override.');
    }
    const record = this.#artifactRecord(state, agent, command.payload, now, [type]);
    this.#appendArtifact(state, record);
    this.#appendTrace(state, {
      actorId: agent.agent_id,
      operation: command.operation,
      eventType: 'ARTIFACT_VERSION_CREATED',
      subject: { artifact_ref: artifactReference(record) },
      now,
    });
  }

  #recordReview(state, command, agent, now) {
    if (agent.agent_type !== AGENT_TYPES.SECURITY_ARCHITECTURE_REVIEWER
      || state.factory_run.gate_state !== RUN_STATES.IN_REVIEW) {
      throw factoryError('SF2C2_REVIEW_AUTHORITY_DENIED', 'Independent Reviewer chỉ review tại IN_REVIEW.');
    }
    if (command.payload?.artifact_type !== ARTIFACT_TYPES.REVIEW
      || command.payload?.subject_ref === null) {
      throw factoryError('SF2C2_REVIEW_SUBJECT_REQUIRED', 'Review phải bind exact subject Artifact.');
    }
    const subject = findArtifactVersion(state, command.payload.subject_ref);
    if (subject.created_by === agent.agent_id) {
      throw factoryError('SF2C2_BUILDER_SELF_REVIEW_DENIED', 'Builder không được review Artifact do chính mình tạo.');
    }
    const record = this.#artifactRecord(state, agent, command.payload, now, [ARTIFACT_TYPES.REVIEW]);
    const payload = record.artifact.payload;
    if (payload.status === 'PASS' && ['P0', 'P1'].includes(payload.severity)) {
      throw factoryError('SF2C2_REVIEW_PASS_WITH_CRITICAL_DENIED', 'Review có P0/P1 không được PASS.');
    }
    this.#appendArtifact(state, record);
    state.reviews.push(withDigest({
      artifact_ref: artifactReference(record),
      subject_ref: artifactReference(subject),
      reviewer_id: agent.agent_id,
      status: payload.status,
      severity: payload.severity,
    }));
    this.#appendTrace(state, {
      actorId: agent.agent_id,
      operation: command.operation,
      eventType: 'REVIEW_RECORDED',
      subject: { artifact_ref: artifactReference(record), subject_ref: artifactReference(subject) },
      now,
    });
  }

  #recordTest(state, command, agent, now) {
    if (agent.agent_type !== AGENT_TYPES.QA_UAT
      || ![RUN_STATES.TESTING, RUN_STATES.UAT_READY].includes(state.factory_run.gate_state)) {
      throw factoryError('SF2C2_QA_AUTHORITY_DENIED', 'QA/Eval evidence chỉ được ghi tại TESTING/UAT_READY.');
    }
    if (command.payload?.artifact_type !== ARTIFACT_TYPES.TEST
      || command.payload?.subject_ref === null) {
      throw factoryError('SF2C2_TEST_SUBJECT_REQUIRED', 'Test phải bind exact subject Artifact.');
    }
    const subject = findArtifactVersion(state, command.payload.subject_ref);
    if (subject.created_by === agent.agent_id) {
      throw factoryError('SF2C2_BUILDER_SELF_TEST_DENIED', 'Builder không được QA Artifact do chính mình tạo.');
    }
    const testKind = command.payload.payload?.test_kind;
    if ((state.factory_run.gate_state === RUN_STATES.UAT_READY && testKind !== 'UAT')
      || (state.factory_run.gate_state === RUN_STATES.TESTING && testKind === 'UAT')) {
      throw factoryError('SF2C2_TEST_KIND_GATE_MISMATCH', 'Test kind không khớp Quality Gate hiện tại.');
    }
    const record = this.#artifactRecord(state, agent, command.payload, now, [ARTIFACT_TYPES.TEST]);
    this.#appendArtifact(state, record);
    state.test_evidence.push(withDigest({
      artifact_ref: artifactReference(record),
      subject_ref: artifactReference(subject),
      tester_id: agent.agent_id,
      test_kind: record.artifact.payload.test_kind,
      status: record.artifact.payload.status,
    }));
    this.#appendTrace(state, {
      actorId: agent.agent_id,
      operation: command.operation,
      eventType: 'TEST_EVIDENCE_RECORDED',
      subject: { artifact_ref: artifactReference(record), subject_ref: artifactReference(subject) },
      now,
    });
  }

  #recordReleaseEvidence(state, command, agent, now) {
    if (agent.agent_type !== AGENT_TYPES.RELEASE_BASELINE
      || state.factory_run.gate_state !== RUN_STATES.UAT_PASSED) {
      throw factoryError('SF2C2_RELEASE_AUTHORITY_DENIED', 'Release evidence chỉ được lập bởi Release Authority sau UAT_PASSED.');
    }
    if (command.payload?.artifact_type !== ARTIFACT_TYPES.RELEASE
      || command.payload?.subject_ref === null) {
      throw factoryError('SF2C2_RELEASE_SUBJECT_REQUIRED', 'Release evidence phải bind exact subject Artifact.');
    }
    const subject = findArtifactVersion(state, command.payload.subject_ref);
    if (subject.created_by === agent.agent_id) {
      throw factoryError('SF2C2_RELEASE_SOD_DENIED', 'Release Authority không được là Builder của subject.');
    }
    const latestImplementation = latestArtifactOfType(state, ARTIFACT_TYPES.IMPLEMENTATION);
    const implementationReference = latestImplementation ? artifactReference(latestImplementation) : null;
    const reviews = implementationReference
      ? currentEvidenceStreams(state.reviews, implementationReference) : [];
    const automatedTests = implementationReference
      ? currentEvidenceStreams(state.test_evidence, implementationReference, (item) => item.test_kind !== 'UAT') : [];
    const uatTests = implementationReference
      ? currentEvidenceStreams(state.test_evidence, implementationReference, (item) => item.test_kind === 'UAT') : [];
    const evidenceActors = [
      ...reviews.map((item) => item.reviewer_id),
      ...automatedTests.map((item) => item.tester_id),
      ...uatTests.map((item) => item.tester_id),
    ];
    if (!latestImplementation || !reviews.length || reviews.some((item) => item.status !== 'PASS')
      || !automatedTests.length || automatedTests.some((item) => item.status !== 'PASS')
      || !uatTests.length || uatTests.some((item) => item.status !== 'PASS')
      || evidenceActors.includes(agent.agent_id)
      || !sameReference(command.payload.subject_ref, implementationReference)) {
      throw factoryError('SF2C2_RELEASE_EVIDENCE_INCOMPLETE', 'Release candidate thiếu current Review/Test/UAT hoặc vi phạm SoD.');
    }
    const record = this.#artifactRecord(state, agent, command.payload, now, [ARTIFACT_TYPES.RELEASE]);
    this.#appendArtifact(state, record);
    state.release_evidence.push(withDigest({
      artifact_ref: artifactReference(record),
      subject_ref: artifactReference(subject),
      release_authority_id: agent.agent_id,
      release_status: record.artifact.payload.release_status,
    }));
    this.#appendTrace(state, {
      actorId: agent.agent_id,
      operation: command.operation,
      eventType: 'RELEASE_EVIDENCE_RECORDED',
      subject: { artifact_ref: artifactReference(record), subject_ref: artifactReference(subject) },
      now,
    });
  }

  #assertCurrentEvidenceRefs(state, references) {
    if (!Array.isArray(references) || references.length < 1) {
      throw factoryError('SF2C2_GATE_EVIDENCE_REQUIRED', 'Gate transition cần immutable evidence refs.');
    }
    return references.map((reference) => {
      const record = findArtifactVersion(state, reference);
      if (state.latest_artifact_versions[record.artifact_id]?.version !== record.version) {
        throw factoryError('SF2C2_STALE_GATE_EVIDENCE', 'Gate evidence không phải latest Artifact version.');
      }
      return record;
    });
  }

  #assertGatePrerequisite(state, toState, evidenceRecords) {
    const requiredType = GATE_REQUIRED_ARTIFACT_TYPE[toState];
    if (!requiredType || !evidenceRecords.some((item) => item.artifact_type === requiredType)) {
      throw factoryError('SF2C2_GATE_EVIDENCE_INCOMPLETE', 'Gate thiếu required Artifact type: ' + requiredType + '.');
    }
    const latestImplementation = latestArtifactOfType(state, ARTIFACT_TYPES.IMPLEMENTATION);
    const implementationReference = latestImplementation ? artifactReference(latestImplementation) : null;
    const currentReviews = implementationReference
      ? currentEvidenceStreams(state.reviews, implementationReference) : [];
    const evidenceContains = (reference) => evidenceRecords.some((record) => (
      sameReference(reference, artifactReference(record))
    ));
    if ([RUN_STATES.REVIEW_PASSED, RUN_STATES.CHANGES_REQUESTED, RUN_STATES.BLOCKED].includes(toState)) {
      const requiredStatus = {
        [RUN_STATES.REVIEW_PASSED]: 'PASS',
        [RUN_STATES.CHANGES_REQUESTED]: 'CHANGES_REQUESTED',
        [RUN_STATES.BLOCKED]: 'BLOCKED',
      }[toState];
      const matchingReviews = currentReviews.filter((item) => item.status === requiredStatus);
      const valid = toState === RUN_STATES.REVIEW_PASSED
        ? currentReviews.length > 0
          && currentReviews.every((item) => item.status === 'PASS' && evidenceContains(item.artifact_ref))
        : matchingReviews.length > 0 && matchingReviews.every((item) => evidenceContains(item.artifact_ref));
      if (!valid) throw factoryError('SF2C2_REVIEW_PASS_EVIDENCE_REQUIRED', 'REVIEW_PASSED cần current independent PASS review.');
    }
    if ([RUN_STATES.TEST_PASSED, RUN_STATES.UAT_READY].includes(toState)) {
      const currentTests = implementationReference
        ? currentEvidenceStreams(state.test_evidence, implementationReference, (item) => item.test_kind !== 'UAT') : [];
      const valid = currentTests.length > 0
        && currentTests.every((item) => item.status === 'PASS' && evidenceContains(item.artifact_ref));
      if (!valid) throw factoryError('SF2C2_TEST_PASS_EVIDENCE_REQUIRED', 'TEST_PASSED/UAT_READY cần current PASS test.');
    }
    if (toState === RUN_STATES.FAILED) {
      const currentTests = implementationReference
        ? currentEvidenceStreams(state.test_evidence, implementationReference, (item) => item.test_kind !== 'UAT') : [];
      const failedTests = currentTests.filter((item) => item.status === 'FAIL');
      const valid = failedTests.length > 0 && failedTests.every((item) => evidenceContains(item.artifact_ref));
      if (!valid) throw factoryError('SF2C2_TEST_FAIL_EVIDENCE_REQUIRED', 'FAILED cần current FAIL test evidence.');
    }
    if (toState === RUN_STATES.UAT_PASSED) {
      const currentUat = implementationReference
        ? currentEvidenceStreams(state.test_evidence, implementationReference, (item) => item.test_kind === 'UAT') : [];
      const valid = currentUat.length > 0
        && currentUat.every((item) => item.status === 'PASS' && evidenceContains(item.artifact_ref));
      if (!valid) throw factoryError('SF2C2_UAT_PASS_EVIDENCE_REQUIRED', 'UAT_PASSED cần current PASS UAT evidence.');
    }
    if ([RUN_STATES.RELEASE_CANDIDATE, RUN_STATES.AWAITING_FOUNDER_APPROVAL].includes(toState)) {
      const currentReleases = implementationReference
        ? currentEvidenceStreams(state.release_evidence, implementationReference) : [];
      const valid = currentReleases.length > 0
        && currentReleases.every((item) => (
          item.release_status === 'CANDIDATE' && evidenceContains(item.artifact_ref)
        ));
      if (!valid) throw factoryError('SF2C2_RELEASE_CANDIDATE_EVIDENCE_REQUIRED', 'Gate cần exact current candidate evidence.');
    }
  }

  #transitionGate(state, command, agent, now) {
    const payload = exactPayload(command.payload, ['evidence_refs', 'to_state'], command.operation);
    if ([RUN_STATES.BASELINED, RUN_STATES.ROLLED_BACK].includes(payload.to_state)) {
      throw factoryError('SF2C2_RELEASE_EXECUTION_DENIED', 'SF2-C2 chỉ lưu candidate evidence; baseline/release/rollback execution chưa được phép.');
    }
    assertTransitionAllowed(state.factory_run.gate_state, payload.to_state);
    assertActorTypeAllowed(agent, payload.to_state);
    const evidenceRecords = this.#assertCurrentEvidenceRefs(state, payload.evidence_refs);
    this.#assertGatePrerequisite(state, payload.to_state, evidenceRecords);
    const previous = state.gate_events.at(-1) || null;
    const sequence = state.gate_events.length + 1;
    const base = {
      event_id: 'sf2c2-gate-' + state.factory_run.run_id + '-' + sequence,
      sequence,
      from_state: state.factory_run.gate_state,
      to_state: payload.to_state,
      actor_id: agent.agent_id,
      evidence_refs: clone(payload.evidence_refs),
      timestamp: now,
      previous_event_digest: previous?.event_digest || null,
    };
    const event = deepFreeze({ ...base, event_digest: sha256Digest(base) });
    state.gate_events.push(event);
    state.factory_run.gate_state = payload.to_state;
    this.#appendTrace(state, {
      actorId: agent.agent_id,
      operation: command.operation,
      eventType: 'QUALITY_GATE_TRANSITIONED',
      subject: {
        gate_event_id: event.event_id,
        from_state: event.from_state,
        to_state: event.to_state,
        evidence_refs: event.evidence_refs,
      },
      now,
    });
  }

  #createHandoff(state, command, agent, now) {
    const payload = exactPayload(command.payload, [
      'artifact_refs', 'handoff_id', 'purpose', 'to_agent_id',
    ], command.operation);
    const to = this.#agent(requiredIdentifier(payload.to_agent_id, 'to_agent_id'));
    if (to.agent_id === agent.agent_id) {
      throw factoryError('SF2C2_SELF_HANDOFF_DENIED', 'Không được self-handoff.');
    }
    if (!agent.handoff_targets.includes(to.agent_type)) {
      throw factoryError('SF2C2_HANDOFF_TARGET_DENIED', 'Handoff target không được canonical registry cho phép.');
    }
    const artifacts = this.#assertCurrentEvidenceRefs(state, payload.artifact_refs);
    if (agent.agent_type !== AGENT_TYPES.ORCHESTRATOR
      && artifacts.some((item) => item.created_by !== agent.agent_id)) {
      throw factoryError('SF2C2_HANDOFF_OWNERSHIP_DENIED', 'Agent chỉ handoff Artifact do mình tạo; Orchestrator là ngoại lệ routing.');
    }
    const handoffId = requiredIdentifier(payload.handoff_id, 'handoff_id');
    if (state.handoffs.some((item) => item.handoff_id === handoffId)) {
      throw factoryError('SF2C2_HANDOFF_ID_REUSE_DENIED', 'handoff_id đã tồn tại.');
    }
    const handoff = withDigest({
      handoff_id: handoffId,
      from_agent_id: agent.agent_id,
      to_agent_id: to.agent_id,
      purpose: requiredText(payload.purpose, 'purpose'),
      artifact_refs: clone(payload.artifact_refs),
      created_at: now,
    });
    state.handoffs.push(handoff);
    this.#appendTrace(state, {
      actorId: agent.agent_id,
      operation: command.operation,
      eventType: 'HANDOFF_CREATED',
      subject: { handoff_id: handoffId, to_agent_id: to.agent_id, artifact_refs: handoff.artifact_refs },
      now,
    });
  }

  #applyOperation(currentState, command, agent, now) {
    if (command.operation === SF2C2_OPERATIONS.CREATE_FACTORY_RUN) {
      if (currentState) throw factoryError('SF2C2_FACTORY_RUN_EXISTS', 'Factory Run đã tồn tại.');
      return this.#createRun(command, agent, now);
    }
    if (!currentState) throw factoryError('SF2C2_FACTORY_RUN_NOT_FOUND', 'Factory Run chưa tồn tại.');
    const state = clone(currentState);
    if (state.factory_run.requirement_id !== command.requirement_id) {
      throw factoryError('SF2C2_REQUIREMENT_SCOPE_MISMATCH', 'Command requirement_id không khớp durable Factory Run.');
    }
    switch (command.operation) {
      case SF2C2_OPERATIONS.CREATE_ARTIFACT_VERSION:
        this.#createGeneralArtifact(state, command, agent, now);
        break;
      case SF2C2_OPERATIONS.RECORD_REVIEW:
        this.#recordReview(state, command, agent, now);
        break;
      case SF2C2_OPERATIONS.RECORD_TEST_EVIDENCE:
        this.#recordTest(state, command, agent, now);
        break;
      case SF2C2_OPERATIONS.RECORD_RELEASE_EVIDENCE:
        this.#recordReleaseEvidence(state, command, agent, now);
        break;
      case SF2C2_OPERATIONS.TRANSITION_GATE:
        this.#transitionGate(state, command, agent, now);
        break;
      case SF2C2_OPERATIONS.CREATE_HANDOFF:
        this.#createHandoff(state, command, agent, now);
        break;
      default:
        throw factoryError('SF2C2_OPERATION_DENIED', 'Operation không thuộc SF2-C2 allowlist.');
    }
    return state;
  }

  async execute(input) {
    assertPlainJsonValue(input);
    if (!sameFields(input, COMMAND_FIELDS)) {
      throw factoryError('SF2C2_COMMAND_INVALID', 'SF2-C2 command sai exact contract.');
    }
    const command = deepFreeze(clone(input));
    requiredIdentifier(command.run_id, 'run_id');
    requiredIdentifier(command.request_id, 'request_id');
    requiredIdentifier(command.requirement_id, 'requirement_id');
    requiredIdentifier(command.actor_id, 'actor_id');
    if (!Object.values(SF2C2_OPERATIONS).includes(command.operation)
      || !Number.isInteger(command.expected_revision) || command.expected_revision < 0) {
      throw factoryError('SF2C2_COMMAND_INVALID', 'Operation/expected_revision không hợp lệ.');
    }
    const agent = this.#agent(command.actor_id);
    this.#assertAgentPolicy(agent, command);

    let prior = null;
    try {
      prior = await this.#durable.recover({
        scope_id: command.run_id,
        request_id: command.request_id,
      });
    } catch (error) {
      if (error?.code !== 'DURABLE_RECOVERY_RECORD_NOT_FOUND') throw error;
    }
    if (prior) {
      verifyStagingFactoryState(prior.transaction_state_record.state);
      const replay = await this.#durable.commit({
        scope_id: command.run_id,
        request_id: command.request_id,
        requirement_id: command.requirement_id,
        expected_revision: command.expected_revision,
        operation: command.operation,
        actor_id: command.actor_id,
        authorization: command.authorization,
        input: { factory_operation: command.operation, payload: command.payload },
        next_state: prior.transaction_state_record.state,
        evidence: command.evidence,
      });
      return deepFreeze({ ...replay, factory_state: clone(replay.state.state) });
    }

    const current = await this.#readState(command.run_id);
    if (current.revision !== command.expected_revision) {
      throw factoryError('STALE_REVISION', 'SF2-C2 durable Factory revision đã stale.', {
        expected_revision: command.expected_revision,
        current_revision: current.revision,
      });
    }
    const now = this.#clock().toISOString();
    const nextState = this.#applyOperation(current.state, command, agent, now);
    const redactedState = redactSensitiveData(nextState);
    if (stableSerialize(redactedState.value) !== stableSerialize(nextState)) {
      throw factoryError(
        'SF2C2_UNREDACTED_SEMANTIC_STATE_DENIED',
        'Semantic state phải được redact trước khi record digest/commit; không được đổi sau digest.',
        { findings: redactedState.findings },
      );
    }
    verifyStagingFactoryState(nextState);
    const result = await this.#durable.commit({
      scope_id: command.run_id,
      request_id: command.request_id,
      requirement_id: command.requirement_id,
      expected_revision: command.expected_revision,
      operation: command.operation,
      actor_id: command.actor_id,
      authorization: command.authorization,
      input: { factory_operation: command.operation, payload: command.payload },
      next_state: nextState,
      evidence: command.evidence,
    });
    return deepFreeze({ ...result, factory_state: clone(result.state.state) });
  }
}

module.exports = {
  StagingDurableFactoryControlPlane,
};
