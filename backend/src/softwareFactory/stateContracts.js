const { deepFreeze } = require('./agentRegistry');
const { clone, hmacSha256Digest, sha256Digest } = require('./canonical');
const { redactSensitiveData } = require('./evidenceContracts');
const { factoryError } = require('./errors');

const REQUIRED_STATE_PORT_METHODS = Object.freeze([
  'readCheckpoint',
  'readReceipt',
  'commitMutation',
]);

function assertStatePortContract(port) {
  if (!port || typeof port !== 'object') {
    throw factoryError('STATE_PORT_INVALID', 'State Port phải là object.');
  }
  const missing = REQUIRED_STATE_PORT_METHODS.filter((method) => typeof port[method] !== 'function');
  if (missing.length) {
    throw factoryError('STATE_PORT_CONTRACT_INCOMPLETE', 'State Port thiếu: ' + missing.join(', ') + '.', { missing });
  }
  if (port.isProductionAdapter === true || port.databaseClient || port.supabase) {
    throw factoryError('REAL_PERSISTENCE_ADAPTER_DENIED', 'SF2-A không cho phép persistence/database adapter thật.');
  }
  return true;
}

function checkpointDigest(checkpoint) {
  const { checkpoint_digest: ignored, ...unsigned } = checkpoint;
  return sha256Digest(unsigned);
}

function createRecoveryCheckpoint({ scope_id: scopeId, revision, state, previous_checkpoint_digest: previousDigest = null, recovery_status: recoveryStatus = 'CLEAN' }) {
  if (!scopeId || !Number.isInteger(revision) || revision < 0) {
    throw factoryError('RECOVERY_CHECKPOINT_INVALID', 'Checkpoint thiếu scope/revision hợp lệ.');
  }
  if (!['CLEAN', 'RECOVERED'].includes(recoveryStatus)) {
    throw factoryError('RECOVERY_STATE_INVALID', 'recovery_status không hợp lệ.');
  }
  const redactedState = redactSensitiveData(state).value;
  const unsigned = {
    checkpoint_schema_version: '1.0.0',
    scope_id: String(scopeId),
    revision,
    previous_checkpoint_digest: previousDigest,
    recovery_status: recoveryStatus,
    state: clone(redactedState),
    state_digest: sha256Digest(redactedState),
  };
  return deepFreeze({ ...unsigned, checkpoint_digest: sha256Digest(unsigned) });
}

function validateRecoveryCheckpoint(checkpoint, { scope_id: expectedScope = null, minimum_revision: minimumRevision = 0 } = {}) {
  if (!checkpoint || typeof checkpoint !== 'object') {
    throw factoryError('RECOVERY_CHECKPOINT_REQUIRED', 'Không có recovery checkpoint.');
  }
  if (checkpoint.checkpoint_schema_version !== '1.0.0'
    || !Number.isInteger(checkpoint.revision)
    || checkpoint.revision < minimumRevision
    || (expectedScope && checkpoint.scope_id !== expectedScope)) {
    throw factoryError('RECOVERY_CHECKPOINT_INVALID', 'Recovery checkpoint sai scope/version/revision.');
  }
  if (!['CLEAN', 'RECOVERED'].includes(checkpoint.recovery_status)) {
    throw factoryError('RECOVERY_STATE_INVALID', 'Recovery state không được phép.');
  }
  if (checkpoint.state_digest !== sha256Digest(checkpoint.state)
    || checkpoint.checkpoint_digest !== checkpointDigest(checkpoint)) {
    throw factoryError('RECOVERY_CHECKPOINT_TAMPERED', 'Recovery checkpoint digest không khớp.');
  }
  return true;
}

class SoftwareFactoryStateCoordinator {
  #idempotencyKey;
  #port;
  #scopeId;

  constructor({ port, scope_id: scopeId, idempotency_key: idempotencyKey }) {
    assertStatePortContract(port);
    if (!scopeId) throw factoryError('STATE_SCOPE_REQUIRED', 'State Coordinator cần scope_id.');
    const key = Buffer.isBuffer(idempotencyKey) ? Buffer.from(idempotencyKey) : Buffer.from(String(idempotencyKey || ''));
    if (key.length < 32) throw factoryError('IDEMPOTENCY_KEY_INVALID', 'State Coordinator cần HMAC key tối thiểu 32 bytes.');
    this.#idempotencyKey = key;
    this.#port = port;
    this.#scopeId = String(scopeId);
  }

  recover() {
    const checkpoint = this.#port.readCheckpoint(this.#scopeId);
    if (!checkpoint) return null;
    validateRecoveryCheckpoint(checkpoint, { scope_id: this.#scopeId });
    return checkpoint;
  }

  commit({ request_id: requestId, expected_revision: expectedRevision, operation, input, state }) {
    if (!requestId || !operation || !Number.isInteger(expectedRevision) || expectedRevision < 0) {
      throw factoryError('STATE_MUTATION_CONTRACT_INVALID', 'State mutation thiếu request/revision/operation.');
    }
    const sanitizedInput = redactSensitiveData(input).value;
    const sanitizedState = redactSensitiveData(state).value;
    const requestDigest = hmacSha256Digest(this.#idempotencyKey, {
      scope_id: this.#scopeId,
      request_id: requestId,
      expected_revision: expectedRevision,
      operation,
      input,
      state,
    });
    const existing = this.#port.readReceipt(this.#scopeId, requestId);
    if (existing) {
      if (existing.request_digest !== requestDigest) {
        throw factoryError('STATE_REPLAY_MISMATCH', 'request_id đã gắn mutation khác.');
      }
      const checkpoint = this.recover();
      if (!checkpoint
        || existing.receipt_schema_version !== '1.0.0'
        || existing.scope_id !== this.#scopeId
        || existing.request_id !== requestId
        || existing.committed_revision !== checkpoint.revision
        || existing.checkpoint_digest !== checkpoint.checkpoint_digest) {
        throw factoryError('STATE_RECEIPT_CHECKPOINT_MISMATCH', 'Receipt và recovery checkpoint không tạo thành atomic commit hợp lệ.');
      }
      return deepFreeze({ replayed: true, receipt: existing, checkpoint });
    }
    const current = this.#port.readCheckpoint(this.#scopeId);
    if (current) validateRecoveryCheckpoint(current, { scope_id: this.#scopeId });
    const currentRevision = current?.revision || 0;
    if (currentRevision !== expectedRevision) {
      throw factoryError('STALE_REVISION', 'State revision đã thay đổi.', {
        expected_revision: expectedRevision,
        current_revision: currentRevision,
      });
    }
    const checkpoint = createRecoveryCheckpoint({
      scope_id: this.#scopeId,
      revision: currentRevision + 1,
      state: sanitizedState,
      previous_checkpoint_digest: current?.checkpoint_digest || null,
      recovery_status: 'CLEAN',
    });
    const receipt = deepFreeze({
      receipt_schema_version: '1.0.0',
      scope_id: this.#scopeId,
      request_id: requestId,
      operation,
      request_digest: requestDigest,
      committed_revision: checkpoint.revision,
      checkpoint_digest: checkpoint.checkpoint_digest,
    });
    const outcome = this.#port.commitMutation({
      scope_id: this.#scopeId,
      expected_revision: expectedRevision,
      checkpoint,
      receipt,
    });
    if (!outcome || outcome.committed !== true) {
      throw factoryError('CONCURRENT_MUTATION_DENIED', 'State Port từ chối compare-and-swap mutation.');
    }
    return deepFreeze({ replayed: false, receipt, checkpoint });
  }
}

module.exports = {
  REQUIRED_STATE_PORT_METHODS,
  SoftwareFactoryStateCoordinator,
  assertStatePortContract,
  createRecoveryCheckpoint,
  validateRecoveryCheckpoint,
};
