const { ARTIFACT_TYPES } = require('./constants');
const { deepFreeze } = require('./agentRegistry');
const { clone, sha256Digest } = require('./canonical');
const { redactSensitiveData, validateProvenance } = require('./evidenceContracts');
const { factoryError } = require('./errors');

const REQUIRED_PAYLOAD_FIELDS = Object.freeze({
  [ARTIFACT_TYPES.REQUIREMENT]: [
    'objective', 'business_context', 'scope', 'out_of_scope',
    'acceptance_criteria', 'risks', 'definition_of_done',
  ],
  [ARTIFACT_TYPES.ARCHITECTURE]: [
    'affected_domains', 'domain_owner', 'application_services', 'orchestration',
    'schema_impact', 'api_impact', 'permission_impact', 'tenant_impact',
    'migration_required', 'adr_required', 'test_strategy',
  ],
  [ARTIFACT_TYPES.IMPLEMENTATION]: [
    'files_changed', 'reason', 'implementation_summary', 'tests_added',
    'migration_added', 'known_risks',
  ],
  [ARTIFACT_TYPES.REVIEW]: [
    'reviewer', 'findings', 'severity', 'architectural_conflicts',
    'security_conflicts', 'status',
  ],
  [ARTIFACT_TYPES.TEST]: [
    'test_kind', 'tests_run', 'passed', 'failed', 'skipped',
    'fixture', 'cleanup', 'evidence', 'status',
  ],
  [ARTIFACT_TYPES.RELEASE]: [
    'commit', 'tag', 'baseline', 'database_state', 'migration_state',
    'backup', 'recovery_point', 'approvals', 'release_status',
  ],
});

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function assertNonEmptyString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw factoryError('ARTIFACT_FIELD_REQUIRED', `Artifact thiếu ${field}.`);
  }
}

function assertArray(value, field, { min = 0 } = {}) {
  if (!Array.isArray(value) || value.length < min) {
    throw factoryError('ARTIFACT_SEMANTIC_INVALID', field + ' phải là array hợp lệ.');
  }
}

function assertBoolean(value, field) {
  if (typeof value !== 'boolean') {
    throw factoryError('ARTIFACT_SEMANTIC_INVALID', field + ' phải là boolean.');
  }
}

function assertEnum(value, field, allowed) {
  if (!allowed.includes(value)) {
    throw factoryError('ARTIFACT_SEMANTIC_INVALID', field + ' không thuộc enum cho phép.');
  }
}

function validateArtifactSemantics(type, payload, createdBy) {
  if (type === ARTIFACT_TYPES.REQUIREMENT) {
    assertNonEmptyString(payload.objective, 'payload.objective');
    assertNonEmptyString(payload.business_context, 'payload.business_context');
    assertArray(payload.scope, 'payload.scope', { min: 1 });
    assertArray(payload.out_of_scope, 'payload.out_of_scope');
    assertArray(payload.acceptance_criteria, 'payload.acceptance_criteria', { min: 1 });
    assertArray(payload.risks, 'payload.risks');
    assertArray(payload.definition_of_done, 'payload.definition_of_done', { min: 1 });
  }
  if (type === ARTIFACT_TYPES.ARCHITECTURE) {
    assertArray(payload.affected_domains, 'payload.affected_domains', { min: 1 });
    assertNonEmptyString(payload.domain_owner, 'payload.domain_owner');
    assertArray(payload.application_services, 'payload.application_services');
    ['orchestration', 'schema_impact', 'api_impact', 'permission_impact', 'tenant_impact'].forEach((field) => (
      assertNonEmptyString(payload[field], 'payload.' + field)
    ));
    assertBoolean(payload.migration_required, 'payload.migration_required');
    assertBoolean(payload.adr_required, 'payload.adr_required');
    assertArray(payload.test_strategy, 'payload.test_strategy', { min: 1 });
  }
  if (type === ARTIFACT_TYPES.IMPLEMENTATION) {
    assertArray(payload.files_changed, 'payload.files_changed', { min: 1 });
    assertNonEmptyString(payload.reason, 'payload.reason');
    assertNonEmptyString(payload.implementation_summary, 'payload.implementation_summary');
    assertArray(payload.tests_added, 'payload.tests_added');
    assertBoolean(payload.migration_added, 'payload.migration_added');
    assertArray(payload.known_risks, 'payload.known_risks');
  }
  if (type === ARTIFACT_TYPES.REVIEW) {
    assertNonEmptyString(payload.reviewer, 'payload.reviewer');
    if (payload.reviewer !== createdBy) {
      throw factoryError('REVIEWER_PROVENANCE_MISMATCH', 'ReviewArtifact reviewer không khớp authenticated creator.');
    }
    assertArray(payload.findings, 'payload.findings');
    assertEnum(payload.severity, 'payload.severity', ['NONE', 'P0', 'P1', 'P2', 'P3']);
    assertArray(payload.architectural_conflicts, 'payload.architectural_conflicts');
    assertArray(payload.security_conflicts, 'payload.security_conflicts');
    assertEnum(payload.status, 'payload.status', ['PASS', 'BLOCKED', 'CHANGES_REQUESTED']);
  }
  if (type === ARTIFACT_TYPES.TEST) {
    assertEnum(payload.test_kind, 'payload.test_kind', ['AUTOMATED', 'SECURITY', 'ADVERSARIAL', 'UAT', 'RECOVERY']);
    assertArray(payload.tests_run, 'payload.tests_run', { min: 1 });
    if (!Number.isFinite(Number(payload.passed)) || Number(payload.passed) < 0) {
      throw factoryError('ARTIFACT_SEMANTIC_INVALID', 'payload.passed không hợp lệ.');
    }
    if (!(Array.isArray(payload.failed) || (Number.isFinite(Number(payload.failed)) && Number(payload.failed) >= 0))) {
      throw factoryError('ARTIFACT_SEMANTIC_INVALID', 'payload.failed không hợp lệ.');
    }
    if (!Number.isFinite(Number(payload.skipped)) || Number(payload.skipped) < 0) {
      throw factoryError('ARTIFACT_SEMANTIC_INVALID', 'payload.skipped không hợp lệ.');
    }
    assertNonEmptyString(payload.fixture, 'payload.fixture');
    assertNonEmptyString(payload.cleanup, 'payload.cleanup');
    assertArray(payload.evidence, 'payload.evidence', { min: 1 });
    assertEnum(payload.status, 'payload.status', ['PASS', 'FAIL', 'NOT_REQUIRED']);
    const failedCount = Array.isArray(payload.failed) ? payload.failed.length : Number(payload.failed);
    if (payload.status === 'PASS' && failedCount > 0) {
      throw factoryError('ARTIFACT_SEMANTIC_INVALID', 'TestArtifact PASS không được có failed test.');
    }
  }
  if (type === ARTIFACT_TYPES.RELEASE) {
    ['commit', 'tag', 'baseline', 'database_state', 'migration_state', 'backup', 'recovery_point'].forEach((field) => (
      assertNonEmptyString(payload[field], 'payload.' + field)
    ));
    assertArray(payload.approvals, 'payload.approvals');
    assertEnum(payload.release_status, 'payload.release_status', ['CANDIDATE', 'REJECTED']);
  }
}

function validateArtifactInput(input) {
  assertNonEmptyString(input?.artifact_id, 'artifact_id');
  assertNonEmptyString(input?.requirement_id, 'requirement_id');
  assertNonEmptyString(input?.run_id, 'run_id');
  assertNonEmptyString(input?.created_by, 'created_by');

  if (!REQUIRED_PAYLOAD_FIELDS[input?.type]) {
    throw factoryError('ARTIFACT_TYPE_INVALID', `Artifact type không hợp lệ: ${input?.type}`);
  }
  if (!input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) {
    throw factoryError('ARTIFACT_PAYLOAD_INVALID', 'Artifact payload phải là object.');
  }

  const missing = REQUIRED_PAYLOAD_FIELDS[input.type].filter((field) => !hasOwn(input.payload, field));
  if (missing.length) {
    throw factoryError('ARTIFACT_CONTRACT_INCOMPLETE', `Artifact ${input.type} thiếu: ${missing.join(', ')}`, { missing });
  }
  validateProvenance(input.provenance);
}

function createArtifact(input, clock = () => new Date()) {
  validateArtifactInput(input);
  const payloadResult = redactSensitiveData(input.payload);
  const provenanceResult = validateProvenance(input.provenance);
  validateArtifactSemantics(input.type, payloadResult.value, input.created_by);
  const base = {
    artifact_id: input.artifact_id,
    artifact_type: input.type,
    requirement_id: input.requirement_id,
    run_id: input.run_id,
    created_by: input.created_by,
    created_at: clock().toISOString(),
    version: Number(input.version || 1),
    run_cycle: Number(input.run_cycle || 0),
    payload: clone(payloadResult.value),
    provenance: clone(provenanceResult.provenance),
    redactions: [...provenanceResult.redactions, ...payloadResult.findings],
    payload_digest: sha256Digest(payloadResult.value),
    provenance_digest: provenanceResult.provenance_digest,
  };
  return deepFreeze({ ...base, artifact_digest: sha256Digest(base) });
}

function verifyArtifactIntegrity(artifact) {
  if (!artifact || typeof artifact !== 'object') {
    throw factoryError('ARTIFACT_INTEGRITY_INVALID', 'Artifact integrity input không hợp lệ.');
  }
  const { artifact_digest: artifactDigest, ...base } = artifact;
  if (base.payload_digest !== sha256Digest(base.payload)
    || base.provenance_digest !== sha256Digest(base.provenance)
    || artifactDigest !== sha256Digest(base)) {
    throw factoryError('ARTIFACT_TAMPERED', 'Artifact digest không khớp nội dung/provenance.');
  }
  validateArtifactSemantics(base.artifact_type, base.payload, base.created_by);
  validateProvenance(base.provenance);
  return true;
}

module.exports = {
  REQUIRED_PAYLOAD_FIELDS,
  createArtifact,
  validateArtifactInput,
  validateArtifactSemantics,
  verifyArtifactIntegrity,
};
