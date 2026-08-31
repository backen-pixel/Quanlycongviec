const { deepFreeze } = require('./agentRegistry');
const { clone, sha256Digest, stableSerialize } = require('./canonical');
const {
  assertAuthorizationVerifierContract,
  verifyAuthorizationDecision,
} = require('./durableAuthorizationContract');
const { assertDurableStatePortContract } = require('./durableStatePort');
const { redactSensitiveData, verifyEvidenceEnvelope } = require('./evidenceContracts');
const { factoryError } = require('./errors');
const {
  createKeyReference,
  assertKeyProviderContract,
  resolveActiveKey,
  signCanonical,
  verifyCanonical,
} = require('./keyManagementContract');
const { assertPlainJsonValue } = require('./plainJson');
const { createRecoveryCheckpoint, validateRecoveryCheckpoint } = require('./stateContracts');

const DURABLE_TRANSACTION_SCHEMA_VERSION = '1.0.0';

function requiredText(value, field, code = 'DURABLE_MUTATION_CONTRACT_INVALID') {
  if (typeof value !== 'string' || !value.trim()) {
    throw factoryError(code, 'Thiếu hoặc sai ' + field + '.');
  }
  return value.trim();
}

function requiredOpaqueText(value, field) {
  const text = requiredText(value, field);
  const redacted = redactSensitiveData({ value: text });
  if (redacted.findings.length || redacted.value.value !== text) {
    throw factoryError('DURABLE_IDENTIFIER_SENSITIVE', field + ' không được chứa secret/PII.');
  }
  return text;
}

function digestRecord(record, digestField) {
  const { [digestField]: ignored, ...unsigned } = record;
  return sha256Digest(unsigned);
}

function durableAuditHash(entry) {
  return digestRecord(entry, 'hash');
}

function assertAuditChain(entries, scopeId) {
  if (!Array.isArray(entries)) throw factoryError('DURABLE_AUDIT_INVALID', 'Audit entries phải là array.');
  let previousHash = null;
  let previousSequence = 0;
  for (const entry of entries) {
    assertPlainJsonValue(entry);
    requiredOpaqueText(entry.scope_id, 'audit.scope_id');
    requiredOpaqueText(entry.request_id, 'audit.request_id');
    requiredOpaqueText(entry.requirement_id, 'audit.requirement_id');
    requiredOpaqueText(entry.operation, 'audit.operation');
    requiredOpaqueText(entry.actor_id, 'audit.actor_id');
    if (entry.scope_id !== scopeId
      || entry.previous_hash !== previousHash
      || entry.sequence !== previousSequence + 1
      || entry.hash !== durableAuditHash(entry)) {
      throw factoryError('DURABLE_AUDIT_TAMPERED', 'Durable audit chain không hợp lệ.');
    }
    previousHash = entry.hash;
    previousSequence = entry.sequence;
  }
  return true;
}

function assertStateCheckpointPair(stateRecord, checkpoint, scopeId, label) {
  const hasState = Boolean(stateRecord);
  const hasCheckpoint = Boolean(checkpoint);
  if (hasState !== hasCheckpoint) {
    throw factoryError('DURABLE_PARTIAL_COMMIT_DETECTED', label + ' state và checkpoint không đồng thời tồn tại.');
  }
  if (!hasState) return true;
  validateRecoveryCheckpoint(checkpoint, { scope_id: scopeId });
  if (stateRecord.state_schema_version !== '1.0.0'
    || stateRecord.scope_id !== scopeId
    || stateRecord.revision !== checkpoint.revision
    || stateRecord.state_digest !== checkpoint.state_digest
    || stateRecord.record_digest !== digestRecord(stateRecord, 'record_digest')) {
    throw factoryError('DURABLE_STATE_TAMPERED', label + ' state record không khớp checkpoint/digest.');
  }
  return true;
}

function assertBaseSnapshot(snapshot, scopeId, requestId) {
  assertPlainJsonValue(snapshot);
  if (!snapshot || snapshot.scope_id !== scopeId || snapshot.request_id !== requestId
    || !Array.isArray(snapshot.audit_entries)) {
    throw factoryError('DURABLE_RECOVERY_SNAPSHOT_INVALID', 'Recovery snapshot sai scope/contract.');
  }
  assertAuditChain(snapshot.audit_entries, scopeId);
  assertStateCheckpointPair(snapshot.state_record, snapshot.checkpoint, scopeId, 'Current');
  assertStateCheckpointPair(
    snapshot.transaction_state_record,
    snapshot.transaction_checkpoint,
    scopeId,
    'Request transaction',
  );
  if (!snapshot.state_record && snapshot.audit_entries.length) {
    throw factoryError('DURABLE_PARTIAL_COMMIT_DETECTED', 'Audit history tồn tại nhưng current state/checkpoint bị thiếu.');
  }
  if (snapshot.state_record) {
    const tip = snapshot.audit_entries.at(-1);
    const previousAudit = snapshot.audit_entries.at(-2) || null;
    if (!tip || tip.revision !== snapshot.state_record.revision
      || tip.transaction_id !== snapshot.state_record.transaction_id
      || tip.state_digest !== snapshot.state_record.record_digest
      || tip.checkpoint_digest !== snapshot.checkpoint.checkpoint_digest
      || snapshot.checkpoint.previous_checkpoint_digest !== (previousAudit?.checkpoint_digest || null)) {
      throw factoryError('DURABLE_CURRENT_TIP_MISMATCH', 'Current state/checkpoint không gắn đúng audit tip/history.');
    }
  }
  if (snapshot.transaction_state_record) {
    const transactionAuditIndex = snapshot.audit_entries.findIndex((entry) => (
      entry.transaction_id === snapshot.transaction_state_record.transaction_id
    ));
    const transactionAudit = snapshot.audit_entries[transactionAuditIndex];
    const previousAudit = transactionAuditIndex > 0 ? snapshot.audit_entries[transactionAuditIndex - 1] : null;
    if (!transactionAudit
      || transactionAudit.request_id !== requestId
      || transactionAudit.revision !== snapshot.transaction_state_record.revision
      || transactionAudit.state_digest !== snapshot.transaction_state_record.record_digest
      || transactionAudit.checkpoint_digest !== snapshot.transaction_checkpoint.checkpoint_digest
      || snapshot.transaction_checkpoint.previous_checkpoint_digest !== (previousAudit?.checkpoint_digest || null)) {
      throw factoryError('DURABLE_TRANSACTION_HISTORY_MISMATCH', 'Historical state/checkpoint không gắn đúng request audit history.');
    }
  }
  return true;
}

function requestRecordPresence(snapshot) {
  return {
    transaction_state: Boolean(snapshot.transaction_state_record),
    transaction_checkpoint: Boolean(snapshot.transaction_checkpoint),
    receipt: Boolean(snapshot.receipt),
    idempotency: Boolean(snapshot.idempotency_record),
    evidence: Boolean(snapshot.evidence_record),
    seal: Boolean(snapshot.transaction_seal),
    audit: snapshot.audit_entries.some((entry) => entry.request_id === snapshot.request_id),
  };
}

function hasAnyRequestRecord(snapshot) {
  return Object.values(requestRecordPresence(snapshot)).some(Boolean);
}

function assertRequestRecordAtomicity(snapshot) {
  const presence = requestRecordPresence(snapshot);
  if (Object.values(presence).some(Boolean) && !Object.values(presence).every(Boolean)) {
    throw factoryError(
      'DURABLE_PARTIAL_COMMIT_DETECTED',
      'Transaction state/checkpoint/receipt/audit/idempotency/evidence không được tồn tại một phần.',
      presence,
    );
  }
  return true;
}

function assertExactTransactionSeal(seal) {
  return Boolean(seal
    && seal.seal_schema_version === '1.0.0'
    && Object.keys(seal).sort().join('|') === [
      'auth_tag',
      'integrity_manifest',
      'key_reference',
      'request_id',
      'revision',
      'scope_id',
      'seal_schema_version',
      'transaction_id',
    ].join('|'));
}

class DurableControlPlaneFoundation {
  #authorizationVerifier;
  #clock;
  #keyProvider;
  #port;

  constructor({
    port,
    key_provider: keyProvider,
    authorization_verifier: authorizationVerifier,
    clock = () => new Date(),
  } = {}) {
    assertDurableStatePortContract(port);
    if (!keyProvider) throw factoryError('KEY_PROVIDER_REQUIRED', 'Durable foundation cần HMAC Key Provider.');
    assertKeyProviderContract(keyProvider);
    assertAuthorizationVerifierContract(authorizationVerifier);
    this.#port = port;
    this.#keyProvider = keyProvider;
    this.#authorizationVerifier = authorizationVerifier;
    this.#clock = clock;
  }

  async #readSnapshot(scopeId, requestId) {
    const snapshot = await this.#port.readRecoverySnapshot({ scope_id: scopeId, request_id: requestId });
    assertBaseSnapshot(snapshot, scopeId, requestId);
    await this.#assertCurrentTipSeal(snapshot);
    assertRequestRecordAtomicity(snapshot);
    await this.#assertHistoryCompleteness(snapshot);
    return snapshot;
  }

  async #assertHistoryCompleteness(snapshot) {
    if (!Array.isArray(snapshot.history_record_sets)
      || snapshot.history_record_sets.length !== snapshot.audit_entries.length) {
      throw factoryError('DURABLE_HISTORY_INCOMPLETE', 'Consistent snapshot phải chứa complete record set cho mọi audit revision.');
    }
    for (let index = 0; index < snapshot.audit_entries.length; index += 1) {
      const audit = snapshot.audit_entries[index];
      const recordSet = snapshot.history_record_sets[index];
      const expectedFields = [
        'checkpoint',
        'evidence_record',
        'idempotency_record',
        'receipt',
        'state_record',
        'transaction_seal',
      ];
      if (!recordSet || Object.keys(recordSet).sort().join('|') !== expectedFields.join('|')) {
        throw factoryError('DURABLE_HISTORY_INCOMPLETE', 'Historical record set sai exact contract.', { revision: audit.revision });
      }
      assertStateCheckpointPair(recordSet.state_record, recordSet.checkpoint, snapshot.scope_id, 'Historical');
      const previousAudit = index > 0 ? snapshot.audit_entries[index - 1] : null;
      if (!recordSet.state_record
        || recordSet.state_record.transaction_id !== audit.transaction_id
        || recordSet.state_record.revision !== audit.revision
        || recordSet.checkpoint.previous_checkpoint_digest !== (previousAudit?.checkpoint_digest || null)) {
        throw factoryError('DURABLE_HISTORY_INCOMPLETE', 'Historical state/checkpoint không khớp audit revision.', { revision: audit.revision });
      }
      await this.#assertStoredSnapshot({
        ...snapshot,
        request_id: audit.request_id,
        transaction_state_record: recordSet.state_record,
        transaction_checkpoint: recordSet.checkpoint,
        receipt: recordSet.receipt,
        idempotency_record: recordSet.idempotency_record,
        evidence_record: recordSet.evidence_record,
        transaction_seal: recordSet.transaction_seal,
      });
    }
    return true;
  }

  async #assertCurrentTipSeal(snapshot) {
    if (!snapshot.state_record) {
      if (snapshot.current_transaction_seal) {
        throw factoryError('DURABLE_PARTIAL_COMMIT_DETECTED', 'Current transaction seal tồn tại nhưng current state/checkpoint bị thiếu.');
      }
      return true;
    }
    const seal = snapshot.current_transaction_seal;
    const tip = snapshot.audit_entries.at(-1);
    const currentReceipt = snapshot.current_receipt;
    const currentIdempotency = snapshot.current_idempotency_record;
    const currentEvidence = snapshot.current_evidence_record;
    if (!currentReceipt || !currentIdempotency || !currentEvidence) {
      throw factoryError('DURABLE_PARTIAL_COMMIT_DETECTED', 'Current tip thiếu receipt/idempotency/evidence complete set.');
    }
    if (currentReceipt.receipt_digest !== digestRecord(currentReceipt, 'receipt_digest')
      || currentIdempotency.idempotency_digest !== digestRecord(currentIdempotency, 'idempotency_digest')
      || currentEvidence.record_digest !== digestRecord(currentEvidence, 'record_digest')
      || currentReceipt.request_id !== tip.request_id
      || currentIdempotency.request_id !== tip.request_id
      || currentEvidence.request_id !== tip.request_id
      || currentReceipt.transaction_id !== tip.transaction_id
      || currentIdempotency.transaction_id !== tip.transaction_id
      || currentEvidence.transaction_id !== tip.transaction_id
      || currentReceipt.committed_revision !== tip.revision
      || currentIdempotency.committed_revision !== tip.revision
      || currentEvidence.revision !== tip.revision
      || currentIdempotency.receipt_digest !== currentReceipt.receipt_digest
      || currentReceipt.evidence_record_digest !== currentEvidence.record_digest) {
      throw factoryError('DURABLE_CURRENT_RECORD_SET_MISMATCH', 'Current receipt/idempotency/evidence không khớp audit tip.');
    }
    verifyEvidenceEnvelope(currentEvidence.envelope);
    const expectedCurrentManifest = {
      scope_id: snapshot.scope_id,
      request_id: tip.request_id,
      transaction_id: tip.transaction_id,
      revision: tip.revision,
      state_record_digest: snapshot.state_record.record_digest,
      checkpoint_digest: snapshot.checkpoint.checkpoint_digest,
      receipt_digest: currentReceipt.receipt_digest,
      audit_hash: tip.hash,
      idempotency_digest: currentIdempotency.idempotency_digest,
      evidence_record_digest: currentEvidence.record_digest,
    };
    if (!assertExactTransactionSeal(seal)
      || seal.scope_id !== snapshot.scope_id
      || seal.request_id !== tip.request_id
      || seal.transaction_id !== snapshot.state_record.transaction_id
      || seal.revision !== snapshot.state_record.revision
      || seal.integrity_manifest.scope_id !== snapshot.scope_id
      || seal.integrity_manifest.request_id !== tip.request_id
      || seal.integrity_manifest.transaction_id !== tip.transaction_id
      || seal.integrity_manifest.revision !== tip.revision
      || seal.integrity_manifest.state_record_digest !== snapshot.state_record.record_digest
      || seal.integrity_manifest.checkpoint_digest !== snapshot.checkpoint.checkpoint_digest
      || seal.integrity_manifest.audit_hash !== tip.hash
      || stableSerialize(seal.integrity_manifest) !== stableSerialize(expectedCurrentManifest)) {
      throw factoryError('DURABLE_CURRENT_SEAL_MISMATCH', 'Current state/checkpoint/audit tip không khớp keyed transaction seal.');
    }
    await verifyCanonical(
      this.#keyProvider,
      seal.key_reference,
      seal.integrity_manifest,
      seal.auth_tag,
    );
    return true;
  }

  #requestMaterial(command, evidenceDigest) {
    const material = {
      scope_id: command.scope_id,
      request_id: command.request_id,
      requirement_id: command.requirement_id,
      expected_revision: command.expected_revision,
      operation: command.operation,
      actor_id: command.actor_id,
      authorization: {
        principal_id: command.authorization.principal_id,
        agent_id: command.authorization.agent_id,
        policy_version: command.authorization.policy_version,
        decision_id: command.authorization.decision_id,
        decision_digest: command.authorization.decision_digest,
      },
      input: command.input,
      next_state: command.next_state,
      evidence_digest: evidenceDigest,
    };
    assertPlainJsonValue(material);
    return material;
  }

  #assertEvidence(command) {
    verifyEvidenceEnvelope(command.evidence);
    if (command.evidence.subject !== command.scope_id + ':' + command.request_id
      || command.evidence.provenance.captured_by !== command.actor_id
      || command.evidence.provenance.policy_version !== command.authorization.policy_version) {
      throw factoryError('DURABLE_EVIDENCE_BINDING_MISMATCH', 'Evidence phải gắn đúng scope/request/Agent/policy.');
    }
    return command.evidence;
  }

  async #assertStoredSnapshot(snapshot) {
    assertRequestRecordAtomicity(snapshot);
    if (!hasAnyRequestRecord(snapshot)) return true;
    const {
      receipt,
      idempotency_record: idempotency,
      evidence_record: evidenceRecord,
      transaction_state_record: transactionState,
      transaction_checkpoint: transactionCheckpoint,
      transaction_seal: transactionSeal,
    } = snapshot;
    if (receipt.receipt_schema_version !== '2.0.0'
      || idempotency.idempotency_schema_version !== '1.0.0'
      || evidenceRecord.evidence_record_schema_version !== '1.0.0'
      || receipt.scope_id !== snapshot.scope_id
      || receipt.request_id !== snapshot.request_id
      || idempotency.scope_id !== receipt.scope_id
      || idempotency.request_id !== receipt.request_id
      || evidenceRecord.scope_id !== receipt.scope_id
      || evidenceRecord.request_id !== receipt.request_id
      || receipt.transaction_id !== idempotency.transaction_id
      || receipt.transaction_id !== evidenceRecord.transaction_id
      || receipt.transaction_id !== transactionState.transaction_id
      || receipt.transaction_id !== transactionSeal.transaction_id
      || transactionSeal.scope_id !== receipt.scope_id
      || transactionSeal.request_id !== receipt.request_id
      || transactionSeal.revision !== receipt.committed_revision
      || !assertExactTransactionSeal(transactionSeal)) {
      throw factoryError('DURABLE_PARTIAL_COMMIT_DETECTED', 'Atomic record identity/transaction không khớp.');
    }
    if (receipt.receipt_digest !== digestRecord(receipt, 'receipt_digest')
      || idempotency.idempotency_digest !== digestRecord(idempotency, 'idempotency_digest')
      || evidenceRecord.record_digest !== digestRecord(evidenceRecord, 'record_digest')
      || idempotency.receipt_digest !== receipt.receipt_digest
      || receipt.evidence_record_digest !== evidenceRecord.record_digest
      || receipt.checkpoint_digest !== transactionCheckpoint.checkpoint_digest
      || receipt.state_record_digest !== transactionState.record_digest) {
      throw factoryError('DURABLE_RECORD_TAMPERED', 'Receipt/idempotency/evidence/state digest không khớp.');
    }
    verifyEvidenceEnvelope(evidenceRecord.envelope);
    if (evidenceRecord.evidence_digest !== evidenceRecord.envelope.evidence_digest
      || receipt.evidence_digest !== evidenceRecord.evidence_digest) {
      throw factoryError('DURABLE_EVIDENCE_TAMPERED', 'Durable evidence digest không khớp.');
    }
    const audit = snapshot.audit_entries.find((entry) => entry.transaction_id === receipt.transaction_id);
    if (!audit || audit.hash !== receipt.audit_hash || audit.request_id !== receipt.request_id
      || audit.request_digest !== receipt.request_digest
      || stableSerialize(audit.key_reference) !== stableSerialize(receipt.key_reference)
      || stableSerialize(receipt.key_reference) !== stableSerialize(idempotency.key_reference)) {
      throw factoryError('DURABLE_AUDIT_RECEIPT_MISMATCH', 'Receipt không gắn đúng durable audit/idempotency event.');
    }
    if (receipt.committed_revision !== transactionState.revision
      || receipt.committed_revision !== transactionCheckpoint.revision
      || receipt.committed_revision !== idempotency.committed_revision
      || receipt.committed_revision !== audit.revision
      || idempotency.status !== 'COMMITTED') {
      throw factoryError('DURABLE_REVISION_MISMATCH', 'State/checkpoint/receipt/audit/idempotency revision không khớp.');
    }
    const expectedManifest = {
      scope_id: receipt.scope_id,
      request_id: receipt.request_id,
      transaction_id: receipt.transaction_id,
      revision: receipt.committed_revision,
      state_record_digest: transactionState.record_digest,
      checkpoint_digest: transactionCheckpoint.checkpoint_digest,
      receipt_digest: receipt.receipt_digest,
      audit_hash: audit.hash,
      idempotency_digest: idempotency.idempotency_digest,
      evidence_record_digest: evidenceRecord.record_digest,
    };
    if (stableSerialize(transactionSeal.integrity_manifest) !== stableSerialize(expectedManifest)
      || stableSerialize(transactionSeal.key_reference) !== stableSerialize(receipt.key_reference)) {
      throw factoryError('DURABLE_TRANSACTION_SEAL_MISMATCH', 'Keyed transaction seal không khớp persisted record set.');
    }
    await verifyCanonical(
      this.#keyProvider,
      transactionSeal.key_reference,
      transactionSeal.integrity_manifest,
      transactionSeal.auth_tag,
    );
    return true;
  }

  async #assertCommittedSnapshot(snapshot, requestMaterial) {
    assertBaseSnapshot(snapshot, requestMaterial.scope_id, requestMaterial.request_id);
    assertRequestRecordAtomicity(snapshot);
    if (!hasAnyRequestRecord(snapshot)) {
      throw factoryError('DURABLE_COMMIT_INDETERMINATE', 'Không tìm thấy atomic records sau commit không xác định.');
    }
    await this.#assertStoredSnapshot(snapshot);
    const {
      receipt,
      idempotency_record: idempotency,
      evidence_record: evidenceRecord,
      transaction_state_record: transactionState,
      transaction_checkpoint: transactionCheckpoint,
    } = snapshot;
    if (receipt.receipt_schema_version !== '2.0.0'
      || idempotency.idempotency_schema_version !== '1.0.0'
      || evidenceRecord.evidence_record_schema_version !== '1.0.0'
      || receipt.scope_id !== requestMaterial.scope_id
      || receipt.request_id !== requestMaterial.request_id
      || idempotency.scope_id !== receipt.scope_id
      || idempotency.request_id !== receipt.request_id
      || evidenceRecord.scope_id !== receipt.scope_id
      || evidenceRecord.request_id !== receipt.request_id
      || receipt.transaction_id !== idempotency.transaction_id
      || receipt.transaction_id !== evidenceRecord.transaction_id
      || receipt.transaction_id !== transactionState.transaction_id) {
      throw factoryError('DURABLE_PARTIAL_COMMIT_DETECTED', 'Atomic record identity/transaction không khớp.');
    }
    if (receipt.requirement_id !== requestMaterial.requirement_id
      || receipt.operation !== requestMaterial.operation
      || receipt.actor_id !== requestMaterial.actor_id
      || receipt.previous_revision !== requestMaterial.expected_revision
      || receipt.committed_revision !== requestMaterial.expected_revision + 1
      || idempotency.status !== 'COMMITTED'
      || idempotency.committed_revision !== receipt.committed_revision) {
      throw factoryError('DURABLE_REQUEST_BINDING_MISMATCH', 'Durable records không gắn đúng request/actor/revision/status.');
    }
    if (receipt.receipt_digest !== digestRecord(receipt, 'receipt_digest')
      || idempotency.idempotency_digest !== digestRecord(idempotency, 'idempotency_digest')
      || evidenceRecord.record_digest !== digestRecord(evidenceRecord, 'record_digest')
      || idempotency.receipt_digest !== receipt.receipt_digest
      || receipt.evidence_record_digest !== evidenceRecord.record_digest
      || receipt.checkpoint_digest !== transactionCheckpoint.checkpoint_digest
      || receipt.state_record_digest !== transactionState.record_digest) {
      throw factoryError('DURABLE_RECORD_TAMPERED', 'Receipt/idempotency/evidence/state digest không khớp.');
    }
    verifyEvidenceEnvelope(evidenceRecord.envelope);
    if (evidenceRecord.evidence_digest !== evidenceRecord.envelope.evidence_digest
      || receipt.evidence_digest !== evidenceRecord.evidence_digest) {
      throw factoryError('DURABLE_EVIDENCE_TAMPERED', 'Durable evidence digest không khớp.');
    }
    const audit = snapshot.audit_entries.find((entry) => entry.transaction_id === receipt.transaction_id);
    if (!audit || audit.hash !== receipt.audit_hash || audit.request_id !== receipt.request_id
      || audit.requirement_id !== requestMaterial.requirement_id
      || audit.operation !== requestMaterial.operation
      || audit.actor_id !== requestMaterial.actor_id
      || audit.request_digest !== receipt.request_digest
      || stableSerialize(audit.key_reference) !== stableSerialize(receipt.key_reference)) {
      throw factoryError('DURABLE_AUDIT_RECEIPT_MISMATCH', 'Receipt không gắn đúng durable audit event.');
    }
    if (receipt.committed_revision !== transactionState.revision
      || receipt.committed_revision !== transactionCheckpoint.revision
      || receipt.committed_revision !== audit.revision) {
      throw factoryError('DURABLE_REVISION_MISMATCH', 'State/checkpoint/receipt/audit revision không khớp.');
    }
    const keyReference = idempotency.key_reference;
    await verifyCanonical(this.#keyProvider, keyReference, requestMaterial, idempotency.request_digest);
    const expectedRedactedState = redactSensitiveData(requestMaterial.next_state).value;
    if (sha256Digest(expectedRedactedState) !== transactionState.state_digest) {
      throw factoryError('DURABLE_REQUEST_STATE_MISMATCH', 'Persisted state không khớp redacted next_state đã được HMAC bind.');
    }
    if (receipt.request_digest !== idempotency.request_digest
      || stableSerialize(receipt.key_reference) !== stableSerialize(keyReference)) {
      throw factoryError('DURABLE_IDEMPOTENCY_RECORD_MISMATCH', 'Receipt và idempotency record không khớp HMAC key/digest.');
    }
    return true;
  }

  #result(snapshot, { replayed, recovered }) {
    return deepFreeze({
      replayed,
      recovered,
      state: clone(snapshot.transaction_state_record),
      checkpoint: clone(snapshot.transaction_checkpoint),
      receipt: clone(snapshot.receipt),
      idempotency_record: clone(snapshot.idempotency_record),
      evidence_record: clone(snapshot.evidence_record),
      transaction_seal: clone(snapshot.transaction_seal),
      audit_event: clone(snapshot.audit_entries.find((entry) => (
        entry.transaction_id === snapshot.receipt.transaction_id
      ))),
    });
  }

  async #resolveIndeterminate(command, requestMaterial) {
    const snapshot = await this.#readSnapshot(command.scope_id, command.request_id);
    if (!hasAnyRequestRecord(snapshot)) {
      throw factoryError('DURABLE_COMMIT_INDETERMINATE', 'Commit outcome không xác định và không có atomic record; fail closed.');
    }
    await this.#assertCommittedSnapshot(snapshot, requestMaterial);
    return this.#result(snapshot, { replayed: false, recovered: true });
  }

  async commit(command) {
    assertPlainJsonValue(command);
    const submittedCommand = command;
    command = deepFreeze(clone(command));
    requiredOpaqueText(command?.scope_id, 'scope_id');
    requiredOpaqueText(command?.request_id, 'request_id');
    requiredOpaqueText(command?.requirement_id, 'requirement_id');
    requiredOpaqueText(command?.operation, 'operation');
    requiredOpaqueText(command?.actor_id, 'actor_id');
    if (!Number.isInteger(command.expected_revision) || command.expected_revision < 0) {
      throw factoryError('EXPECTED_REVISION_REQUIRED', 'expected_revision phải là integer >= 0.');
    }
    const verifiedAuthorization = await verifyAuthorizationDecision(
      this.#authorizationVerifier,
      command.authorization,
      {
        scope_id: command.scope_id,
        request_id: command.request_id,
        requirement_id: command.requirement_id,
        operation: command.operation,
        agent_id: command.actor_id,
      },
    );
    for (const field of ['decision_id', 'principal_id', 'policy_version']) {
      requiredOpaqueText(verifiedAuthorization[field], 'authorization.' + field);
    }
    if (stableSerialize(submittedCommand) !== stableSerialize(command)) {
      throw factoryError('DURABLE_COMMAND_TOCTOU_DENIED', 'Mutation command đã bị thay đổi trong lúc chờ async authorization verification.');
    }
    command = { ...command, authorization: verifiedAuthorization };
    const evidence = this.#assertEvidence(command);
    redactSensitiveData(command.input);
    const stateResult = redactSensitiveData(command.next_state);
    const requestMaterial = this.#requestMaterial(command, evidence.evidence_digest);
    const snapshot = await this.#readSnapshot(command.scope_id, command.request_id);

    if (hasAnyRequestRecord(snapshot)) {
      await this.#assertCommittedSnapshot(snapshot, requestMaterial);
      return this.#result(snapshot, { replayed: true, recovered: false });
    }

    const currentRevision = snapshot.state_record?.revision || 0;
    if (currentRevision !== command.expected_revision) {
      throw factoryError('STALE_REVISION', 'Durable state revision đã thay đổi.', {
        expected_revision: command.expected_revision,
        current_revision: currentRevision,
      });
    }

    const nextRevision = currentRevision + 1;
    const activeKey = await resolveActiveKey(this.#keyProvider);
    const requestDigest = await signCanonical(this.#keyProvider, activeKey.reference, requestMaterial);
    const transactionId = 'sf-dtx-' + sha256Digest({
      scope_id: command.scope_id,
      request_id: command.request_id,
      request_digest: requestDigest,
      revision: nextRevision,
    }).slice(-24);
    const committedAt = this.#clock().toISOString();
    const checkpoint = createRecoveryCheckpoint({
      scope_id: command.scope_id,
      revision: nextRevision,
      state: stateResult.value,
      previous_checkpoint_digest: snapshot.checkpoint?.checkpoint_digest || null,
    });
    const stateBase = {
      state_schema_version: '1.0.0',
      scope_id: command.scope_id,
      revision: nextRevision,
      transaction_id: transactionId,
      state: clone(checkpoint.state),
      state_digest: checkpoint.state_digest,
      updated_at: committedAt,
    };
    const stateRecord = deepFreeze({ ...stateBase, record_digest: sha256Digest(stateBase) });
    const evidenceBase = {
      evidence_record_schema_version: '1.0.0',
      scope_id: command.scope_id,
      request_id: command.request_id,
      revision: nextRevision,
      transaction_id: transactionId,
      evidence_digest: evidence.evidence_digest,
      envelope: clone(evidence),
    };
    const evidenceRecord = deepFreeze({ ...evidenceBase, record_digest: sha256Digest(evidenceBase) });
    const previousAudit = snapshot.audit_entries.at(-1) || null;
    const auditBase = {
      audit_schema_version: '1.0.0',
      event_id: 'sf-durable-audit-' + transactionId,
      sequence: nextRevision,
      timestamp: committedAt,
      event_type: 'DURABLE_MUTATION_COMMITTED',
      scope_id: command.scope_id,
      requirement_id: command.requirement_id,
      request_id: command.request_id,
      transaction_id: transactionId,
      revision: nextRevision,
      actor_id: command.actor_id,
      principal_id: command.authorization.principal_id,
      policy_version: command.authorization.policy_version,
      decision_id: command.authorization.decision_id,
      operation: command.operation,
      request_digest: requestDigest,
      key_reference: createKeyReference(activeKey.descriptor),
      state_digest: stateRecord.record_digest,
      checkpoint_digest: checkpoint.checkpoint_digest,
      evidence_digest: evidence.evidence_digest,
      previous_hash: previousAudit?.hash || null,
    };
    const auditEvent = deepFreeze({ ...auditBase, hash: sha256Digest(auditBase) });
    const receiptBase = {
      receipt_schema_version: '2.0.0',
      scope_id: command.scope_id,
      requirement_id: command.requirement_id,
      request_id: command.request_id,
      transaction_id: transactionId,
      operation: command.operation,
      actor_id: command.actor_id,
      previous_revision: currentRevision,
      committed_revision: nextRevision,
      request_digest: requestDigest,
      key_reference: createKeyReference(activeKey.descriptor),
      state_record_digest: stateRecord.record_digest,
      checkpoint_digest: checkpoint.checkpoint_digest,
      audit_hash: auditEvent.hash,
      evidence_digest: evidence.evidence_digest,
      evidence_record_digest: evidenceRecord.record_digest,
      committed_at: committedAt,
    };
    const receipt = deepFreeze({ ...receiptBase, receipt_digest: sha256Digest(receiptBase) });
    const idempotencyBase = {
      idempotency_schema_version: '1.0.0',
      scope_id: command.scope_id,
      request_id: command.request_id,
      transaction_id: transactionId,
      status: 'COMMITTED',
      request_digest: requestDigest,
      key_reference: createKeyReference(activeKey.descriptor),
      receipt_digest: receipt.receipt_digest,
      committed_revision: nextRevision,
    };
    const idempotencyRecord = deepFreeze({
      ...idempotencyBase,
      idempotency_digest: sha256Digest(idempotencyBase),
    });
    const integrityManifest = {
      scope_id: command.scope_id,
      request_id: command.request_id,
      transaction_id: transactionId,
      revision: nextRevision,
      state_record_digest: stateRecord.record_digest,
      checkpoint_digest: checkpoint.checkpoint_digest,
      receipt_digest: receipt.receipt_digest,
      audit_hash: auditEvent.hash,
      idempotency_digest: idempotencyRecord.idempotency_digest,
      evidence_record_digest: evidenceRecord.record_digest,
    };
    const transactionSeal = deepFreeze({
      seal_schema_version: '1.0.0',
      scope_id: command.scope_id,
      request_id: command.request_id,
      transaction_id: transactionId,
      revision: nextRevision,
      key_reference: createKeyReference(activeKey.descriptor),
      integrity_manifest: integrityManifest,
      auth_tag: await signCanonical(this.#keyProvider, activeKey.reference, integrityManifest),
    });
    const bundleBase = {
      transaction_schema_version: DURABLE_TRANSACTION_SCHEMA_VERSION,
      transaction_id: transactionId,
      scope_id: command.scope_id,
      request_id: command.request_id,
      expected_revision: currentRevision,
      next_revision: nextRevision,
      state_record: stateRecord,
      checkpoint,
      receipt,
      audit_event: auditEvent,
      idempotency_record: idempotencyRecord,
      evidence_record: evidenceRecord,
      transaction_seal: transactionSeal,
    };
    const bundle = deepFreeze({ ...bundleBase, bundle_digest: sha256Digest(bundleBase) });

    let outcome;
    try {
      outcome = await this.#port.commitAtomicMutation(bundle);
    } catch (error) {
      return this.#resolveIndeterminate(command, requestMaterial);
    }
    if (outcome?.status === 'CONFLICT') {
      const conflictSnapshot = await this.#readSnapshot(command.scope_id, command.request_id);
      if (hasAnyRequestRecord(conflictSnapshot)) {
        await this.#assertCommittedSnapshot(conflictSnapshot, requestMaterial);
        return this.#result(conflictSnapshot, { replayed: true, recovered: false });
      }
      throw factoryError('CONCURRENT_MUTATION_DENIED', 'Durable CAS từ chối worker commit cùng revision.', {
        expected_revision: currentRevision,
        current_revision: outcome.current_revision,
      });
    }
    if (outcome?.status !== 'COMMITTED') {
      return this.#resolveIndeterminate(command, requestMaterial);
    }
    const committedSnapshot = await this.#readSnapshot(command.scope_id, command.request_id);
    await this.#assertCommittedSnapshot(committedSnapshot, requestMaterial);
    return this.#result(committedSnapshot, { replayed: false, recovered: false });
  }

  async recover({ scope_id: scopeId, request_id: requestId }) {
    requiredOpaqueText(scopeId, 'scope_id');
    requiredOpaqueText(requestId, 'request_id');
    const snapshot = await this.#readSnapshot(scopeId, requestId);
    if (!hasAnyRequestRecord(snapshot)) {
      throw factoryError('DURABLE_RECOVERY_RECORD_NOT_FOUND', 'Không có durable transaction records cho request cần recover.');
    }
    await this.#assertStoredSnapshot(snapshot);
    return deepFreeze(clone(snapshot));
  }

  async readCurrentState({ scope_id: scopeId }) {
    requiredOpaqueText(scopeId, 'scope_id');
    const readRequestId = 'sf-current-read-' + sha256Digest({ scope_id: scopeId }).slice(-24);
    const snapshot = await this.#readSnapshot(scopeId, readRequestId);
    if (!snapshot.state_record) return null;
    const auditTip = snapshot.audit_entries.at(-1);
    return deepFreeze({
      state_schema_version: snapshot.state_record.state_schema_version,
      scope_id: scopeId,
      revision: snapshot.state_record.revision,
      transaction_id: snapshot.state_record.transaction_id,
      state: clone(snapshot.state_record.state),
      state_digest: snapshot.state_record.state_digest,
      checkpoint_digest: snapshot.checkpoint.checkpoint_digest,
      audit_tip_hash: auditTip.hash,
    });
  }
}

module.exports = {
  DURABLE_TRANSACTION_SCHEMA_VERSION,
  DurableControlPlaneFoundation,
  durableAuditHash,
};
