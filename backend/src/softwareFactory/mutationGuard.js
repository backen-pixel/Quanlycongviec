const crypto = require('node:crypto');
const { deepFreeze } = require('./agentRegistry');
const { clone, hmacSha256Digest, sha256Digest } = require('./canonical');
const { redactSensitiveData } = require('./evidenceContracts');
const { factoryError } = require('./errors');

function requiredText(value, field) {
  const normalized = String(value || '').trim();
  if (!normalized) throw factoryError('MUTATION_CONTRACT_REQUIRED', 'Thiếu ' + field + ' trong mutation contract.');
  return normalized;
}

class SoftwareFactoryMutationGuard {
  #activeScopes;
  #idempotencyKey;
  #receipts;

  constructor({ idempotencyKey = crypto.randomBytes(32) } = {}) {
    const key = Buffer.isBuffer(idempotencyKey) ? Buffer.from(idempotencyKey) : Buffer.from(String(idempotencyKey || ''));
    if (key.length < 32) throw factoryError('IDEMPOTENCY_KEY_INVALID', 'Idempotency HMAC key phải tối thiểu 32 bytes.');
    this.#activeScopes = new Set();
    this.#idempotencyKey = key;
    this.#receipts = new Map();
  }

  begin({ scope_id: scopeIdInput, request_id: requestIdInput, expected_revision: expectedRevision, current_revision: currentRevision, operation, actor_id: actorId, input }) {
    const scopeId = requiredText(scopeIdInput, 'scope_id');
    const requestId = requiredText(requestIdInput, 'request_id');
    const operationName = requiredText(operation, 'operation');
    const actor = requiredText(actorId, 'actor_id');
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      throw factoryError('EXPECTED_REVISION_REQUIRED', 'expected_revision phải là integer >= 0.');
    }
    if (!Number.isInteger(currentRevision) || currentRevision < 0) {
      throw factoryError('CURRENT_REVISION_INVALID', 'current_revision không hợp lệ.');
    }
    redactSensitiveData(input);
    const requestDigest = hmacSha256Digest(this.#idempotencyKey, {
      scope_id: scopeId,
      request_id: requestId,
      expected_revision: expectedRevision,
      operation: operationName,
      actor_id: actor,
      input,
    });
    const receiptKey = scopeId + ':' + requestId;
    const existing = this.#receipts.get(receiptKey);
    if (existing) {
      if (existing.request_digest !== requestDigest) {
        throw factoryError('IDEMPOTENCY_KEY_REUSE_DENIED', 'request_id đã được dùng cho mutation khác.');
      }
      return deepFreeze({ replayed: true, receipt: existing, result: clone(existing.result) });
    }
    if (this.#activeScopes.has(scopeId)) {
      throw factoryError('CONCURRENT_MUTATION_DENIED', 'Scope đang có mutation chưa hoàn tất.');
    }
    if (expectedRevision !== currentRevision) {
      throw factoryError('STALE_REVISION', 'expected_revision không khớp revision hiện tại.', {
        expected_revision: expectedRevision,
        current_revision: currentRevision,
      });
    }
    this.#activeScopes.add(scopeId);
    return deepFreeze({
      replayed: false,
      token: {
        scope_id: scopeId,
        request_id: requestId,
        operation: operationName,
        actor_id: actor,
        expected_revision: expectedRevision,
        request_digest: requestDigest,
        receipt_key: receiptKey,
      },
    });
  }

  complete(token, { new_revision: newRevision, result }) {
    if (!token || !this.#activeScopes.has(token.scope_id)) {
      throw factoryError('MUTATION_TOKEN_INVALID', 'Mutation token không còn active.');
    }
    if (!Number.isInteger(newRevision) || newRevision !== token.expected_revision + 1) {
      throw factoryError('MUTATION_REVISION_INVALID', 'Mutation phải tăng revision đúng một đơn vị.');
    }
    const receipt = deepFreeze({
      scope_id: token.scope_id,
      request_id: token.request_id,
      operation: token.operation,
      actor_id: token.actor_id,
      previous_revision: token.expected_revision,
      revision: newRevision,
      request_digest: token.request_digest,
      result_digest: sha256Digest(redactSensitiveData(result).value),
      result: clone(redactSensitiveData(result).value),
    });
    this.#receipts.set(token.receipt_key, receipt);
    this.#activeScopes.delete(token.scope_id);
    return receipt;
  }

  abort(token) {
    if (token?.scope_id) this.#activeScopes.delete(token.scope_id);
  }

  getReceipt(scopeId, requestId) {
    return this.#receipts.get(String(scopeId) + ':' + String(requestId)) || null;
  }
}

module.exports = {
  SoftwareFactoryMutationGuard,
};
