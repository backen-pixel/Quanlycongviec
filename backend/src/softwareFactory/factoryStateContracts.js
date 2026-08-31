const { ARTIFACT_TYPES, RUN_STATES } = require('./constants');
const { clone, sha256Digest, stableSerialize } = require('./canonical');
const { verifyArtifactIntegrity } = require('./artifactContracts');
const { factoryError } = require('./errors');
const { assertPlainJsonValue } = require('./plainJson');

const SF2C2_FACTORY_STATE_SCHEMA_VERSION = '1.0.0';

const SF2C2_OPERATIONS = Object.freeze({
  CREATE_FACTORY_RUN: 'SF2C2_CREATE_FACTORY_RUN',
  CREATE_ARTIFACT_VERSION: 'SF2C2_CREATE_ARTIFACT_VERSION',
  RECORD_TEST_EVIDENCE: 'SF2C2_RECORD_TEST_EVIDENCE',
  RECORD_REVIEW: 'SF2C2_RECORD_REVIEW',
  TRANSITION_GATE: 'SF2C2_TRANSITION_GATE',
  CREATE_HANDOFF: 'SF2C2_CREATE_HANDOFF',
  RECORD_RELEASE_EVIDENCE: 'SF2C2_RECORD_RELEASE_EVIDENCE',
});

const STATE_FIELDS = Object.freeze([
  'artifact_versions',
  'factory_run',
  'gate_events',
  'handoffs',
  'latest_artifact_versions',
  'release_evidence',
  'requirement',
  'reviews',
  'schema_version',
  'test_evidence',
  'trace_events',
]);

const ARTIFACT_REF_FIELDS = Object.freeze([
  'artifact_id', 'artifact_type', 'digest', 'version', 'version_id',
]);

function sameFields(value, fields) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('|') === [...fields].sort().join('|'));
}

function requiredText(value, field, code = 'SF2C2_STATE_INVALID') {
  if (typeof value !== 'string' || !value.trim()) {
    throw factoryError(code, 'Thiếu hoặc sai ' + field + '.');
  }
  return value.trim();
}

function assertTimestamp(value, field) {
  requiredText(value, field);
  if (!Number.isFinite(Date.parse(value))) {
    throw factoryError('SF2C2_STATE_INVALID', field + ' phải là ISO timestamp hợp lệ.');
  }
}

function digestRecord(record, digestField = 'record_digest') {
  const { [digestField]: ignored, ...unsigned } = record;
  return sha256Digest(unsigned);
}

function artifactVersionId(artifactId, version) {
  return artifactId + '@' + version;
}

function artifactReference(record) {
  return Object.freeze({
    artifact_id: record.artifact_id,
    artifact_type: record.artifact_type,
    version: record.version,
    version_id: record.version_id,
    digest: record.artifact.artifact_digest,
  });
}

function assertArtifactRefShape(reference, field = 'artifact_ref') {
  if (!sameFields(reference, ARTIFACT_REF_FIELDS)
    || !Number.isInteger(reference.version) || reference.version < 1) {
    throw factoryError('SF2C2_ARTIFACT_REF_INVALID', field + ' sai exact immutable reference contract.');
  }
  for (const key of ['artifact_id', 'artifact_type', 'version_id', 'digest']) {
    requiredText(reference[key], field + '.' + key, 'SF2C2_ARTIFACT_REF_INVALID');
  }
  if (reference.version_id !== artifactVersionId(reference.artifact_id, reference.version)
    || !/^sha256:[a-f0-9]{64}$/.test(reference.digest)) {
    throw factoryError('SF2C2_ARTIFACT_REF_INVALID', field + ' identity/version/digest không canonical.');
  }
  return true;
}

function findArtifactVersion(state, reference) {
  assertArtifactRefShape(reference);
  const record = state.artifact_versions.find((candidate) => (
    candidate.artifact_id === reference.artifact_id
    && candidate.version === reference.version
  ));
  if (!record
    || record.version_id !== reference.version_id
    || record.artifact_type !== reference.artifact_type
    || record.artifact.artifact_digest !== reference.digest) {
    throw factoryError(
      'SF2C2_ARTIFACT_REF_MISMATCH',
      'Artifact reference không khớp immutable persisted version/digest.',
      { reference },
    );
  }
  return record;
}

function assertDigestRecord(record, fields, label) {
  if (!sameFields(record, fields) || record.record_digest !== digestRecord(record)) {
    throw factoryError('SF2C2_SEMANTIC_RECORD_TAMPERED', label + ' sai exact contract/digest.');
  }
}

function verifyArtifactVersions(state) {
  const seenVersions = new Set();
  const latest = {};
  for (const record of state.artifact_versions) {
    assertDigestRecord(record, [
      'artifact', 'artifact_id', 'artifact_type', 'created_at', 'created_by',
      'record_digest', 'subject_ref', 'version', 'version_id',
    ], 'Artifact Version');
    requiredText(record.artifact_id, 'artifact_version.artifact_id');
    requiredText(record.created_by, 'artifact_version.created_by');
    assertTimestamp(record.created_at, 'artifact_version.created_at');
    if (!Number.isInteger(record.version) || record.version < 1
      || record.version_id !== artifactVersionId(record.artifact_id, record.version)
      || seenVersions.has(record.version_id)) {
      throw factoryError('SF2C2_ARTIFACT_VERSION_INVALID', 'Artifact version phải immutable, unique và >= 1.');
    }
    seenVersions.add(record.version_id);
    verifyArtifactIntegrity(record.artifact);
    if (record.artifact.artifact_id !== record.artifact_id
      || record.artifact.artifact_type !== record.artifact_type
      || record.artifact.version !== record.version
      || record.artifact.created_by !== record.created_by
      || record.artifact.created_at !== record.created_at
      || record.artifact.run_id !== state.factory_run.run_id
      || record.artifact.requirement_id !== state.factory_run.requirement_id
      || record.artifact.provenance.captured_by !== record.created_by) {
      throw factoryError('SF2C2_ARTIFACT_VERSION_INVALID', 'Artifact wrapper không khớp canonical Artifact.');
    }
    if (record.subject_ref !== null) assertArtifactRefShape(record.subject_ref, 'subject_ref');
    const currentLatest = latest[record.artifact_id];
    if (currentLatest && record.version !== currentLatest.version + 1) {
      throw factoryError('SF2C2_ARTIFACT_VERSION_GAP', 'Artifact version phải tăng liên tục đúng một đơn vị.');
    }
    if (!currentLatest && record.version !== 1) {
      throw factoryError('SF2C2_ARTIFACT_VERSION_GAP', 'Artifact đầu tiên phải là version 1.');
    }
    latest[record.artifact_id] = artifactReference(record);
  }

  if (stableSerialize(latest) !== stableSerialize(state.latest_artifact_versions)) {
    throw factoryError('SF2C2_LATEST_VERSION_TAMPERED', 'latest_artifact_versions không được caller sửa/rollback.');
  }

  for (const record of state.artifact_versions) {
    if (record.subject_ref !== null) findArtifactVersion(state, record.subject_ref);
    if (record.artifact_type === ARTIFACT_TYPES.REQUIREMENT) continue;
    const parents = record.artifact.provenance.parent_artifact_ids;
    if (!Array.isArray(parents) || parents.length < 1) {
      throw factoryError('SF2C2_PROVENANCE_PARENT_REQUIRED', 'Non-Requirement Artifact cần immutable parent lineage.');
    }
    for (const parentId of parents) {
      const source = record.artifact.provenance.source_refs.find((item) => (
        typeof item.ref === 'string' && item.ref.startsWith('sf-artifact:' + parentId + '@')
      ));
      if (!source) {
        throw factoryError('SF2C2_PROVENANCE_SOURCE_REQUIRED', 'Parent Artifact thiếu versioned source ref.');
      }
      const parent = state.artifact_versions.find((item) => (
        item.artifact_id === parentId
        && source.ref === 'sf-artifact:' + item.version_id
        && source.digest === item.artifact.artifact_digest
      ));
      if (!parent) {
        throw factoryError('SF2C2_PROVENANCE_SOURCE_MISMATCH', 'Parent source ref/digest không khớp persisted version.');
      }
    }
    if (record.version > 1) {
      const previous = state.artifact_versions.find((item) => (
        item.artifact_id === record.artifact_id && item.version === record.version - 1
      ));
      const source = record.artifact.provenance.source_refs.find((item) => (
        item.ref === 'sf-artifact:' + previous?.version_id
        && item.digest === previous?.artifact.artifact_digest
      ));
      if (!previous || !source) {
        throw factoryError('SF2C2_PREVIOUS_VERSION_LINEAGE_REQUIRED', 'Artifact update phải link exact previous version/digest.');
      }
    }
  }
}

function verifyRequirement(state) {
  assertDigestRecord(state.requirement, [
    'artifact_ref', 'created_at', 'created_by', 'record_digest', 'requirement_id',
  ], 'Requirement');
  if (state.requirement.requirement_id !== state.factory_run.requirement_id) {
    throw factoryError('SF2C2_REQUIREMENT_SCOPE_MISMATCH', 'Requirement không khớp Factory Run.');
  }
  assertTimestamp(state.requirement.created_at, 'requirement.created_at');
  const artifact = findArtifactVersion(state, state.requirement.artifact_ref);
  if (artifact.artifact_type !== ARTIFACT_TYPES.REQUIREMENT
    || artifact.version !== 1
    || state.requirement.created_by !== artifact.created_by) {
    throw factoryError('SF2C2_REQUIREMENT_ARTIFACT_INVALID', 'Requirement phải bind RequirementArtifact v1.');
  }
}

function verifyReviewAndTestIndexes(state) {
  const reviewIds = new Set();
  for (const review of state.reviews) {
    assertDigestRecord(review, [
      'artifact_ref', 'record_digest', 'reviewer_id', 'severity', 'status', 'subject_ref',
    ], 'Review evidence');
    const artifact = findArtifactVersion(state, review.artifact_ref);
    const subject = findArtifactVersion(state, review.subject_ref);
    if (artifact.artifact_type !== ARTIFACT_TYPES.REVIEW
      || review.reviewer_id !== artifact.created_by
      || review.reviewer_id === subject.created_by
      || artifact.subject_ref === null
      || stableSerialize(artifact.subject_ref) !== stableSerialize(review.subject_ref)
      || artifact.artifact.payload.reviewer !== review.reviewer_id
      || artifact.artifact.payload.status !== review.status
      || artifact.artifact.payload.severity !== review.severity
      || (review.status === 'PASS' && ['P0', 'P1'].includes(review.severity))
      || reviewIds.has(artifact.version_id)) {
      throw factoryError('SF2C2_REVIEW_EVIDENCE_INVALID', 'Review evidence sai SoD/subject/status/severity.');
    }
    reviewIds.add(artifact.version_id);
  }

  const testIds = new Set();
  for (const evidence of state.test_evidence) {
    assertDigestRecord(evidence, [
      'artifact_ref', 'record_digest', 'status', 'subject_ref', 'test_kind', 'tester_id',
    ], 'Test evidence');
    const artifact = findArtifactVersion(state, evidence.artifact_ref);
    const subject = findArtifactVersion(state, evidence.subject_ref);
    if (artifact.artifact_type !== ARTIFACT_TYPES.TEST
      || evidence.tester_id !== artifact.created_by
      || evidence.tester_id === subject.created_by
      || artifact.subject_ref === null
      || stableSerialize(artifact.subject_ref) !== stableSerialize(evidence.subject_ref)
      || artifact.artifact.payload.test_kind !== evidence.test_kind
      || artifact.artifact.payload.status !== evidence.status
      || testIds.has(artifact.version_id)) {
      throw factoryError('SF2C2_TEST_EVIDENCE_INVALID', 'Test evidence sai SoD/subject/status.');
    }
    testIds.add(artifact.version_id);
  }

  const releaseIds = new Set();
  for (const release of state.release_evidence) {
    assertDigestRecord(release, [
      'artifact_ref', 'record_digest', 'release_authority_id', 'release_status', 'subject_ref',
    ], 'Release evidence');
    const artifact = findArtifactVersion(state, release.artifact_ref);
    const subject = findArtifactVersion(state, release.subject_ref);
    if (artifact.artifact_type !== ARTIFACT_TYPES.RELEASE
      || release.release_authority_id !== artifact.created_by
      || release.release_authority_id === subject.created_by
      || !['CANDIDATE', 'REJECTED'].includes(release.release_status)
      || artifact.artifact.payload.release_status !== release.release_status
      || stableSerialize(artifact.subject_ref) !== stableSerialize(release.subject_ref)
      || releaseIds.has(artifact.version_id)) {
      throw factoryError('SF2C2_RELEASE_EVIDENCE_INVALID', 'Release evidence sai authority/subject/status.');
    }
    releaseIds.add(artifact.version_id);
  }
}

function verifyDigestChain(records, {
  label,
  digest_field: digestField,
  previous_field: previousField,
  required_fields: requiredFields,
}) {
  let previousDigest = null;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!sameFields(record, requiredFields)
      || record.sequence !== index + 1
      || record[previousField] !== previousDigest
      || record[digestField] !== digestRecord(record, digestField)) {
      throw factoryError('SF2C2_' + label + '_TAMPERED', label + ' hash chain không hợp lệ.');
    }
    assertTimestamp(record.timestamp, label + '.timestamp');
    previousDigest = record[digestField];
  }
}

function verifyGateEvents(state) {
  verifyDigestChain(state.gate_events, {
    label: 'GATE_EVENT',
    digest_field: 'event_digest',
    previous_field: 'previous_event_digest',
    required_fields: [
      'actor_id', 'event_digest', 'event_id', 'evidence_refs', 'from_state',
      'previous_event_digest', 'sequence', 'timestamp', 'to_state',
    ],
  });
  let gateState = RUN_STATES.REQUESTED;
  for (const event of state.gate_events) {
    if (event.from_state !== gateState || !Object.values(RUN_STATES).includes(event.to_state)
      || !Array.isArray(event.evidence_refs) || event.evidence_refs.length < 1) {
      throw factoryError('SF2C2_GATE_EVENT_INVALID', 'Gate event sai state/evidence linkage.');
    }
    event.evidence_refs.forEach((reference) => findArtifactVersion(state, reference));
    gateState = event.to_state;
  }
  if (state.factory_run.gate_state !== gateState) {
    throw factoryError('SF2C2_GATE_STATE_TAMPERED', 'Factory Run gate_state không khớp gate event chain.');
  }
}

function verifyHandoffs(state) {
  const ids = new Set();
  for (const handoff of state.handoffs) {
    assertDigestRecord(handoff, [
      'artifact_refs', 'created_at', 'from_agent_id', 'handoff_id', 'purpose',
      'record_digest', 'to_agent_id',
    ], 'Handoff');
    if (ids.has(handoff.handoff_id) || handoff.from_agent_id === handoff.to_agent_id
      || !Array.isArray(handoff.artifact_refs) || handoff.artifact_refs.length < 1) {
      throw factoryError('SF2C2_HANDOFF_INVALID', 'Handoff identity/evidence không hợp lệ.');
    }
    ids.add(handoff.handoff_id);
    assertTimestamp(handoff.created_at, 'handoff.created_at');
    handoff.artifact_refs.forEach((reference) => findArtifactVersion(state, reference));
  }
}

function verifyTraceEvents(state) {
  verifyDigestChain(state.trace_events, {
    label: 'TRACE_EVENT',
    digest_field: 'event_digest',
    previous_field: 'previous_event_digest',
    required_fields: [
      'actor_id', 'event_digest', 'event_id', 'event_type', 'operation',
      'previous_event_digest', 'requirement_id', 'run_id', 'sequence', 'subject', 'timestamp',
    ],
  });
  for (const event of state.trace_events) {
    if (event.run_id !== state.factory_run.run_id
      || event.requirement_id !== state.factory_run.requirement_id) {
      throw factoryError('SF2C2_TRACE_SCOPE_MISMATCH', 'Trace event không khớp Requirement/Run.');
    }
  }
}

function verifyStagingFactoryState(state) {
  assertPlainJsonValue(state);
  if (!sameFields(state, STATE_FIELDS)
    || state.schema_version !== SF2C2_FACTORY_STATE_SCHEMA_VERSION
    || !Array.isArray(state.artifact_versions)
    || !Array.isArray(state.reviews)
    || !Array.isArray(state.test_evidence)
    || !Array.isArray(state.gate_events)
    || !Array.isArray(state.handoffs)
    || !Array.isArray(state.release_evidence)
    || !Array.isArray(state.trace_events)) {
    throw factoryError('SF2C2_STATE_INVALID', 'Durable Factory state sai exact schema.');
  }
  if (!sameFields(state.factory_run, [
    'created_at', 'created_by', 'gate_state', 'requirement_id', 'run_id', 'updated_at',
  ])) {
    throw factoryError('SF2C2_RUN_INVALID', 'Factory Run sai exact contract.');
  }
  requiredText(state.factory_run.run_id, 'factory_run.run_id');
  requiredText(state.factory_run.requirement_id, 'factory_run.requirement_id');
  requiredText(state.factory_run.created_by, 'factory_run.created_by');
  assertTimestamp(state.factory_run.created_at, 'factory_run.created_at');
  assertTimestamp(state.factory_run.updated_at, 'factory_run.updated_at');
  if (!Object.values(RUN_STATES).includes(state.factory_run.gate_state)) {
    throw factoryError('SF2C2_GATE_STATE_INVALID', 'Factory Run gate state không hợp lệ.');
  }
  verifyArtifactVersions(state);
  verifyRequirement(state);
  verifyReviewAndTestIndexes(state);
  verifyGateEvents(state);
  verifyHandoffs(state);
  verifyTraceEvents(state);
  return true;
}

module.exports = {
  ARTIFACT_REF_FIELDS,
  SF2C2_FACTORY_STATE_SCHEMA_VERSION,
  SF2C2_OPERATIONS,
  artifactReference,
  artifactVersionId,
  digestRecord,
  findArtifactVersion,
  sameFields,
  verifyStagingFactoryState,
};
