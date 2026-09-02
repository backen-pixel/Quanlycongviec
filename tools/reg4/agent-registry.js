'use strict';

const { createHash, timingSafeEqual } = require('node:crypto');

const STATUSES = Object.freeze({
  DRAFT: 'DRAFT',
  IN_REVIEW: 'IN_REVIEW',
  APPROVED: 'APPROVED',
  BLOCKED: 'BLOCKED',
  RETIRED: 'RETIRED',
});

const ACTOR_ROLES = Object.freeze({
  AUTHOR: 'AUTHOR',
  REVIEWER: 'REVIEWER',
  APPROVER: 'APPROVER',
  REGISTRY_ADMIN: 'REGISTRY_ADMIN',
});

const IMMUTABLE_KEYS = [
  'agent_id',
  'name',
  'version',
  'created_by',
  'permissions',
  'required_tools',
  'prohibited_actions',
  'evidence_references',
];
const REGISTER_KEYS = [...IMMUTABLE_KEYS, 'package_sha256'];
const ACTOR_KEYS = ['actor_id', 'role'];
const TRANSITION_KEYS = ['agent_id', 'version', 'to_status'];
const EVIDENCE_KEYS = ['evidence_id', 'evidence_type', 'result', 'sha256'];
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const AGENT_ID_PATTERN = /^[a-z][a-z0-9._-]{2,63}$/;
const SEMVER_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const TOKEN_PATTERN = /^[a-z0-9][a-z0-9._:/-]{0,127}$/;
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ZERO_SHA256 = '0'.repeat(64);
const MAX_COLLECTION_SIZE = 100;
const MAX_REASON_LENGTH = 500;

const ERROR_REASON_CATALOG = Object.freeze({
  INVALID_INPUT: 'input is invalid',
  INVALID_ACTOR: 'actor context is invalid',
  CREATOR_MISMATCH: 'created_by does not match the registering actor',
  PACKAGE_SHA256_MISMATCH: 'package SHA-256 does not match immutable content',
  AGENT_VERSION_ALREADY_REGISTERED: 'Agent version is already registered',
  IMMUTABLE_VERSION_CONFLICT: 'Agent version already binds different content',
  AGENT_VERSION_NOT_FOUND: 'Agent version is not registered',
  INVALID_STATE_TRANSITION: 'approval-state transition is not allowed',
  ACTOR_NOT_AUTHORIZED: 'actor is not authorized for this operation',
  SELF_APPROVAL_DENIED: 'self-approval is denied',
  REQUIRED_EVIDENCE_MISSING: 'required approval evidence is missing',
});
const ACCEPTED_AUDIT_REASONS = Object.freeze({
  REGISTER: 'REGISTERED',
  TRANSITION: 'STATE_TRANSITIONED',
});
const registryErrorProvenance = new WeakMap();

const TRANSITIONS = Object.freeze({
  [STATUSES.DRAFT]: Object.freeze({
    [STATUSES.IN_REVIEW]: ACTOR_ROLES.REVIEWER,
    [STATUSES.RETIRED]: ACTOR_ROLES.REGISTRY_ADMIN,
  }),
  [STATUSES.IN_REVIEW]: Object.freeze({
    [STATUSES.APPROVED]: ACTOR_ROLES.APPROVER,
    [STATUSES.BLOCKED]: ACTOR_ROLES.REVIEWER,
    [STATUSES.RETIRED]: ACTOR_ROLES.REGISTRY_ADMIN,
  }),
  [STATUSES.BLOCKED]: Object.freeze({
    [STATUSES.RETIRED]: ACTOR_ROLES.REGISTRY_ADMIN,
  }),
  [STATUSES.APPROVED]: Object.freeze({
    [STATUSES.RETIRED]: ACTOR_ROLES.REGISTRY_ADMIN,
  }),
  [STATUSES.RETIRED]: Object.freeze({}),
});

class RegistryError extends Error {
  constructor(code) {
    const canonicalCode = Object.hasOwn(ERROR_REASON_CATALOG, code)
      ? code
      : 'INVALID_INPUT';
    const canonicalMessage = ERROR_REASON_CATALOG[canonicalCode];
    super(canonicalMessage);
    this.name = 'RegistryError';
    this.code = canonicalCode;
    this.correlation_id = null;
    this.stack = `RegistryError: ${canonicalMessage}`;
    registryErrorProvenance.set(this, canonicalCode);
  }
}

function fail(code) {
  throw new RegistryError(code);
}

function isPlainObject(value) {
  try {
    return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
  } catch {
    return false;
  }
}

function provenRegistryErrorCode(error) {
  try {
    return registryErrorProvenance.get(error) || null;
  } catch {
    return null;
  }
}

function normalizeRegistryError(error, fallbackCode) {
  const provenCode = provenRegistryErrorCode(error);
  return new RegistryError(provenCode || fallbackCode);
}

function attachCorrelationId(error, correlationId) {
  error.correlation_id = correlationId;
  return error;
}

function withinValidationBoundary(contextCode, operation) {
  try {
    return operation();
  } catch {
    throw new RegistryError(contextCode);
  }
}

function snapshotExactDataObject(
  value,
  requiredKeys,
  label,
  optionalKeys = [],
  contextCode = 'INVALID_INPUT',
) {
  if (value === null || typeof value !== 'object') fail(contextCode);

  const prototype = withinValidationBoundary(
    contextCode,
    () => Object.getPrototypeOf(value),
  );
  if (prototype !== Object.prototype) fail(contextCode);

  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);
  const ownKeys = withinValidationBoundary(contextCode, () => Reflect.ownKeys(value));
  if (
    ownKeys.some((key) => typeof key !== 'string' || !allowedKeys.has(key)) ||
    requiredKeys.some((key) => !ownKeys.includes(key))
  ) {
    fail(contextCode);
  }

  const snapshot = {};
  for (const key of ownKeys) {
    const descriptor = withinValidationBoundary(
      contextCode,
      () => Object.getOwnPropertyDescriptor(value, key),
    );
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ) {
      fail(contextCode);
    }
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function snapshotDenseDataArray(value, label, minimum) {
  const isArray = withinValidationBoundary('INVALID_INPUT', () => Array.isArray(value));
  if (!isArray) fail('INVALID_INPUT');

  const lengthDescriptor = withinValidationBoundary(
    'INVALID_INPUT',
    () => Object.getOwnPropertyDescriptor(value, 'length'),
  );
  if (!lengthDescriptor || !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value')) {
    fail('INVALID_INPUT');
  }
  const length = lengthDescriptor.value;
  if (!Number.isInteger(length) || length < minimum || length > MAX_COLLECTION_SIZE) {
    fail('INVALID_INPUT');
  }

  const expectedKeys = Array.from({ length }, (_, index) => String(index));
  const ownKeys = withinValidationBoundary('INVALID_INPUT', () => Reflect.ownKeys(value));
  const permitted = new Set([...expectedKeys, 'length']);
  if (ownKeys.some((key) => typeof key !== 'string' || !permitted.has(key))) {
    fail('INVALID_INPUT');
  }

  const snapshot = [];
  for (const key of expectedKeys) {
    const descriptor = withinValidationBoundary(
      'INVALID_INPUT',
      () => Object.getOwnPropertyDescriptor(value, key),
    );
    if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      fail('INVALID_INPUT');
    }
    snapshot.push(descriptor.value);
  }
  return snapshot;
}

function assertAgentId(value, label = 'agent_id') {
  if (typeof value !== 'string' || !AGENT_ID_PATTERN.test(value)) {
    fail('INVALID_INPUT', `${label} is not a canonical Agent identifier`);
  }
  return value;
}

function assertVersion(value) {
  if (typeof value !== 'string' || !SEMVER_PATTERN.test(value)) {
    fail('INVALID_INPUT', 'version must be strict SemVer core');
  }
  return value;
}

function assertToken(value, label) {
  if (
    typeof value !== 'string' ||
    !TOKEN_PATTERN.test(value) ||
    value.includes('..') ||
    value.includes('//') ||
    value.endsWith('/')
  ) {
    fail('INVALID_INPUT', `${label} is not a canonical token`);
  }
  return value;
}

function assertSha256(value, label) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    fail('INVALID_INPUT', `${label} must be exactly 64 lowercase hexadecimal characters`);
  }
  return value;
}

function assertName(value) {
  if (
    typeof value !== 'string' ||
    value !== value.trim() ||
    value !== value.normalize('NFC') ||
    Array.from(value).length < 1 ||
    Array.from(value).length > 120 ||
    /\p{Cc}/u.test(value)
  ) {
    fail('INVALID_INPUT', 'name must be trimmed NFC text of 1 through 120 Unicode characters');
  }
  return value;
}

function copyUniqueTokenArray(value, label, minimum) {
  const source = snapshotDenseDataArray(value, label, minimum);
  const copy = [];
  const seen = new Set();
  for (let index = 0; index < source.length; index += 1) {
    const token = assertToken(source[index], `${label}[${index}]`);
    if (seen.has(token)) {
      fail('INVALID_INPUT', `${label} contains duplicate token ${token}`);
    }
    seen.add(token);
    copy.push(token);
  }
  return copy;
}

function copyEvidenceReferences(value) {
  const source = snapshotDenseDataArray(value, 'evidence_references', 0);
  const copy = [];
  const seenIds = new Set();
  for (let index = 0; index < source.length; index += 1) {
    const reference = source[index];
    const label = `evidence_references[${index}]`;
    const referenceData = snapshotExactDataObject(reference, EVIDENCE_KEYS, label);
    const evidenceId = assertToken(referenceData.evidence_id, `${label}.evidence_id`);
    if (seenIds.has(evidenceId)) {
      fail('INVALID_INPUT', `evidence_references contains duplicate evidence_id ${evidenceId}`);
    }
    if (!['AUTOMATED_TEST', 'INDEPENDENT_REVIEW'].includes(referenceData.evidence_type)) {
      fail('INVALID_INPUT', `${label}.evidence_type is invalid`);
    }
    if (!['PASS', 'FAIL'].includes(referenceData.result)) {
      fail('INVALID_INPUT', `${label}.result is invalid`);
    }
    seenIds.add(evidenceId);
    copy.push({
      evidence_id: evidenceId,
      evidence_type: referenceData.evidence_type,
      result: referenceData.result,
      sha256: assertSha256(referenceData.sha256, `${label}.sha256`),
    });
  }
  return copy;
}

function copyImmutableContent(content) {
  const source = snapshotExactDataObject(content, IMMUTABLE_KEYS, 'package content');
  return {
    agent_id: assertAgentId(source.agent_id),
    name: assertName(source.name),
    version: assertVersion(source.version),
    created_by: assertToken(source.created_by, 'created_by'),
    permissions: copyUniqueTokenArray(source.permissions, 'permissions', 1),
    required_tools: copyUniqueTokenArray(source.required_tools, 'required_tools', 0),
    prohibited_actions: copyUniqueTokenArray(source.prohibited_actions, 'prohibited_actions', 1),
    evidence_references: copyEvidenceReferences(source.evidence_references),
  };
}

function compareAscii(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function canonicalBodyFromCopy(content) {
  const evidenceReferences = content.evidence_references
    .map((reference) => ({
      evidence_id: reference.evidence_id,
      evidence_type: reference.evidence_type,
      result: reference.result,
      sha256: reference.sha256,
    }))
    .sort((left, right) => compareAscii(left.evidence_id, right.evidence_id));

  return {
    schema_version: 'reg4-agent-package/v1',
    agent_id: content.agent_id,
    name: content.name,
    version: content.version,
    created_by: content.created_by,
    permissions: [...content.permissions].sort(compareAscii),
    required_tools: [...content.required_tools].sort(compareAscii),
    prohibited_actions: [...content.prohibited_actions].sort(compareAscii),
    evidence_references: evidenceReferences,
  };
}

function hashJsonBody(body) {
  return createHash('sha256').update(Buffer.from(JSON.stringify(body), 'utf8')).digest('hex');
}

function calculatePackageSha256(content) {
  return hashJsonBody(canonicalBodyFromCopy(copyImmutableContent(content)));
}

function digestMatches(supplied, resolved) {
  return timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(resolved, 'hex'));
}

function assertActor(actor) {
  try {
    const source = snapshotExactDataObject(
      actor,
      ACTOR_KEYS,
      'actor',
      [],
      'INVALID_ACTOR',
    );
    const actorId = assertToken(source.actor_id, 'actor.actor_id');
    if (!Object.values(ACTOR_ROLES).includes(source.role)) {
      fail('INVALID_ACTOR', 'actor.role is invalid');
    }
    return { actor_id: actorId, role: source.role };
  } catch (error) {
    const normalized = normalizeRegistryError(error, 'INVALID_ACTOR');
    if (provenRegistryErrorCode(normalized) === 'INVALID_INPUT') {
      throw new RegistryError('INVALID_ACTOR');
    }
    throw normalized;
  }
}

function assertCanonicalTimestamp(value) {
  if (
    typeof value !== 'string' ||
    !ISO_UTC_PATTERN.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    fail('INVALID_INPUT', 'now() must return a canonical ISO-8601 UTC timestamp');
  }
  return value;
}

function safeDataProperty(value, key) {
  try {
    if (!isPlainObject(value)) return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
    return descriptor.value;
  } catch {
    return null;
  }
}

function safeAgentId(value) {
  return typeof value === 'string' && AGENT_ID_PATTERN.test(value) ? value : null;
}

function safeVersion(value) {
  return typeof value === 'string' && SEMVER_PATTERN.test(value) ? value : null;
}

function safeSha256(value) {
  return typeof value === 'string' && SHA256_PATTERN.test(value) ? value : null;
}

function safeStatus(value) {
  return Object.values(STATUSES).includes(value) ? value : null;
}

function safeActorContext(actor) {
  try {
    const actorId = safeDataProperty(actor, 'actor_id');
    const role = safeDataProperty(actor, 'role');
    return {
      actor_id: typeof actorId === 'string' && TOKEN_PATTERN.test(actorId) ? actorId : null,
      actor_role: Object.values(ACTOR_ROLES).includes(role) ? role : null,
    };
  } catch {
    return { actor_id: null, actor_role: null };
  }
}

function clonePackage(record) {
  return {
    agent_id: record.agent_id,
    name: record.name,
    version: record.version,
    package_sha256: record.package_sha256,
    created_by: record.created_by,
    permissions: [...record.permissions],
    required_tools: [...record.required_tools],
    prohibited_actions: [...record.prohibited_actions],
    evidence_references: record.evidence_references.map((reference) => ({ ...reference })),
    approval_status: record.approval_status,
    timestamps: {
      created_at: record.timestamps.created_at,
      updated_at: record.timestamps.updated_at,
    },
  };
}

function internalKey(agentId, version) {
  return `${agentId.length}:${agentId}${version.length}:${version}`;
}

function createAgentRegistry(options) {
  const optionData = snapshotExactDataObject(options, ['now'], 'registry options');
  if (typeof optionData.now !== 'function') {
    fail('INVALID_INPUT', 'registry options.now must be a function');
  }

  const now = optionData.now;
  const packages = new Map();
  const auditRecords = [];

  function nextTimestamp() {
    return assertCanonicalTimestamp(now());
  }

  function appendAudit(details) {
    const sequence = auditRecords.length + 1;
    const correlationId = `reg4-correlation-${String(sequence).padStart(10, '0')}`;
    const reasonCode = details.outcome === 'ACCEPTED' &&
      Object.hasOwn(ACCEPTED_AUDIT_REASONS, details.operation)
      ? ACCEPTED_AUDIT_REASONS[details.operation]
      : details.outcome === 'REJECTED' && Object.hasOwn(ERROR_REASON_CATALOG, details.reason_code)
        ? details.reason_code
        : 'INVALID_INPUT';
    const previousAuditSha256 = sequence === 1
      ? ZERO_SHA256
      : auditRecords[auditRecords.length - 1].audit_sha256;
    const body = {
      sequence,
      audit_id: `reg4-audit-${String(sequence).padStart(6, '0')}`,
      correlation_id: correlationId,
      operation: details.operation,
      outcome: details.outcome,
      reason_code: reasonCode,
      actor_id: details.actor_id,
      actor_role: details.actor_role,
      agent_id: details.agent_id,
      version: details.version,
      from_status: details.from_status,
      to_status: details.to_status,
      supplied_package_sha256: details.supplied_package_sha256,
      resolved_package_sha256: details.resolved_package_sha256,
      occurred_at: details.occurred_at,
      previous_audit_sha256: previousAuditSha256,
    };
    auditRecords.push({ ...body, audit_sha256: hashJsonBody(body) });
    return correlationId;
  }

  function registerAgentPackage(request, actor) {
    const occurredAt = nextTimestamp();
    const safeActor = safeActorContext(actor);
    let agentId = safeAgentId(safeDataProperty(request, 'agent_id'));
    let version = safeVersion(safeDataProperty(request, 'version'));
    let suppliedPackageSha256 = safeSha256(safeDataProperty(request, 'package_sha256'));
    let resolvedPackageSha256 = null;

    try {
      const validatedActor = assertActor(actor);
      const requestData = snapshotExactDataObject(
        request,
        REGISTER_KEYS,
        'registration request',
      );
      const suppliedDigest = assertSha256(requestData.package_sha256, 'package_sha256');
      const immutableInput = {};
      for (const key of IMMUTABLE_KEYS) immutableInput[key] = requestData[key];
      const immutableContent = copyImmutableContent(immutableInput);

      agentId = immutableContent.agent_id;
      version = immutableContent.version;
      suppliedPackageSha256 = suppliedDigest;

      if (immutableContent.created_by !== validatedActor.actor_id) {
        fail('CREATOR_MISMATCH', 'created_by must equal the registering actor_id');
      }
      if (validatedActor.role !== ACTOR_ROLES.AUTHOR) {
        fail('ACTOR_NOT_AUTHORIZED', 'only an AUTHOR may register an Agent Package');
      }

      const canonicalBody = canonicalBodyFromCopy(immutableContent);
      const calculatedDigest = hashJsonBody(canonicalBody);
      if (!digestMatches(suppliedDigest, calculatedDigest)) {
        fail('PACKAGE_SHA256_MISMATCH', 'supplied package_sha256 does not match package content');
      }

      const key = internalKey(agentId, version);
      const existing = packages.get(key);
      if (existing) {
        resolvedPackageSha256 = existing.package_sha256;
        if (digestMatches(existing.package_sha256, calculatedDigest)) {
          fail('AGENT_VERSION_ALREADY_REGISTERED', 'agent_id and version are already registered');
        }
        fail('IMMUTABLE_VERSION_CONFLICT', 'agent_id and version already bind different content');
      }

      const record = {
        agent_id: immutableContent.agent_id,
        name: immutableContent.name,
        version: immutableContent.version,
        package_sha256: calculatedDigest,
        created_by: immutableContent.created_by,
        permissions: [...canonicalBody.permissions],
        required_tools: [...canonicalBody.required_tools],
        prohibited_actions: [...canonicalBody.prohibited_actions],
        evidence_references: canonicalBody.evidence_references.map((reference) => ({ ...reference })),
        approval_status: STATUSES.DRAFT,
        timestamps: { created_at: occurredAt, updated_at: occurredAt },
      };
      packages.set(key, record);
      resolvedPackageSha256 = calculatedDigest;
      appendAudit({
        operation: 'REGISTER',
        outcome: 'ACCEPTED',
        reason_code: 'REGISTERED',
        actor_id: validatedActor.actor_id,
        actor_role: validatedActor.role,
        agent_id: agentId,
        version,
        from_status: null,
        to_status: STATUSES.DRAFT,
        supplied_package_sha256: suppliedPackageSha256,
        resolved_package_sha256: resolvedPackageSha256,
        occurred_at: occurredAt,
      });
      return clonePackage(record);
    } catch (error) {
      const registryError = normalizeRegistryError(error, 'INVALID_INPUT');
      const existing = agentId && version ? packages.get(internalKey(agentId, version)) : null;
      const correlationId = appendAudit({
        operation: 'REGISTER',
        outcome: 'REJECTED',
        reason_code: provenRegistryErrorCode(registryError),
        actor_id: safeActor.actor_id,
        actor_role: safeActor.actor_role,
        agent_id: agentId,
        version,
        from_status: existing ? existing.approval_status : null,
        to_status: null,
        supplied_package_sha256: suppliedPackageSha256,
        resolved_package_sha256: existing ? existing.package_sha256 : resolvedPackageSha256,
        occurred_at: occurredAt,
      });
      throw attachCorrelationId(registryError, correlationId);
    }
  }

  function transitionApproval(command, actor) {
    const occurredAt = nextTimestamp();
    const safeActor = safeActorContext(actor);
    let agentId = safeAgentId(safeDataProperty(command, 'agent_id'));
    let version = safeVersion(safeDataProperty(command, 'version'));
    let toStatus = safeStatus(safeDataProperty(command, 'to_status'));
    let existing = agentId && version ? packages.get(internalKey(agentId, version)) : null;

    try {
      const validatedActor = assertActor(actor);
      const commandData = snapshotExactDataObject(
        command,
        TRANSITION_KEYS,
        'transition command',
        ['reason'],
      );
      agentId = assertAgentId(commandData.agent_id);
      version = assertVersion(commandData.version);
      if (!Object.values(STATUSES).includes(commandData.to_status)) {
        fail('INVALID_INPUT', 'to_status is invalid');
      }
      toStatus = commandData.to_status;
      if (Object.prototype.hasOwnProperty.call(commandData, 'reason')) {
        if (
          typeof commandData.reason !== 'string' ||
          commandData.reason !== commandData.reason.trim() ||
          commandData.reason.length < 1 ||
          commandData.reason.length > MAX_REASON_LENGTH ||
          /\p{Cc}/u.test(commandData.reason)
        ) {
          fail('INVALID_INPUT', `reason must be trimmed text of 1 through ${MAX_REASON_LENGTH} characters`);
        }
      }

      existing = packages.get(internalKey(agentId, version));
      if (!existing) {
        fail('AGENT_VERSION_NOT_FOUND', 'agent_id and version are not registered');
      }

      const requiredRole = TRANSITIONS[existing.approval_status][toStatus];
      if (!requiredRole) {
        fail('INVALID_STATE_TRANSITION', 'requested approval-state transition is not allowed');
      }
      if (validatedActor.role !== requiredRole) {
        fail('ACTOR_NOT_AUTHORIZED', 'actor role is not authorized for this transition');
      }
      if (
        toStatus === STATUSES.APPROVED &&
        (validatedActor.actor_id === existing.created_by || validatedActor.actor_id === existing.agent_id)
      ) {
        fail('SELF_APPROVAL_DENIED', 'an Agent or its creator cannot approve this package');
      }
      if (toStatus === STATUSES.APPROVED) {
        const hasAutomatedTest = existing.evidence_references.some((reference) =>
          reference.evidence_type === 'AUTOMATED_TEST' && reference.result === 'PASS');
        const hasIndependentReview = existing.evidence_references.some((reference) =>
          reference.evidence_type === 'INDEPENDENT_REVIEW' && reference.result === 'PASS');
        if (!hasAutomatedTest || !hasIndependentReview) {
          fail('REQUIRED_EVIDENCE_MISSING', 'approval requires passing automated test and independent review evidence');
        }
      }

      const fromStatus = existing.approval_status;
      existing.approval_status = toStatus;
      existing.timestamps.updated_at = occurredAt;
      appendAudit({
        operation: 'TRANSITION',
        outcome: 'ACCEPTED',
        reason_code: 'STATE_TRANSITIONED',
        actor_id: validatedActor.actor_id,
        actor_role: validatedActor.role,
        agent_id: agentId,
        version,
        from_status: fromStatus,
        to_status: toStatus,
        supplied_package_sha256: null,
        resolved_package_sha256: existing.package_sha256,
        occurred_at: occurredAt,
      });
      return clonePackage(existing);
    } catch (error) {
      const registryError = normalizeRegistryError(error, 'INVALID_INPUT');
      const correlationId = appendAudit({
        operation: 'TRANSITION',
        outcome: 'REJECTED',
        reason_code: provenRegistryErrorCode(registryError),
        actor_id: safeActor.actor_id,
        actor_role: safeActor.actor_role,
        agent_id: agentId,
        version,
        from_status: existing ? existing.approval_status : null,
        to_status: toStatus,
        supplied_package_sha256: null,
        resolved_package_sha256: existing ? existing.package_sha256 : null,
        occurred_at: occurredAt,
      });
      throw attachCorrelationId(registryError, correlationId);
    }
  }

  function getAgentPackage(agentId, version) {
    assertAgentId(agentId);
    assertVersion(version);
    const record = packages.get(internalKey(agentId, version));
    return record ? clonePackage(record) : null;
  }

  function listAuditRecords() {
    return auditRecords.map((record) => ({ ...record }));
  }

  return Object.freeze({
    registerAgentPackage,
    transitionApproval,
    getAgentPackage,
    listAuditRecords,
  });
}

module.exports = {
  createAgentRegistry,
  calculatePackageSha256,
  STATUSES,
  ACTOR_ROLES,
};
