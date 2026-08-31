const { clone } = require('../canonical');
const { callProofService, validateProofClientOptions } = require('./proofHttpClient');

const CAPABILITIES = Object.freeze({
  contract_version: '1.0.0',
  atomic_state_checkpoint_receipt_audit_idempotency_evidence_seal: true,
  compare_and_swap: true,
  unique_scope_request: true,
  consistent_recovery_read: true,
  async_methods: true,
  production_ready: false,
});

class HttpDurableStatePortProof {
  #endpoint;
  #serviceToken;
  #timeoutMs;

  constructor({ endpoint, service_token: serviceToken, timeout_ms: timeoutMs = 2000 } = {}) {
    this.#endpoint = validateProofClientOptions({
      endpoint,
      service_token: serviceToken,
      timeout_ms: timeoutMs,
    });
    this.#serviceToken = serviceToken;
    this.#timeoutMs = timeoutMs;
  }

  #call(method, args = []) {
    return callProofService({
      endpoint: this.#endpoint,
      service_token: this.#serviceToken,
      timeout_ms: this.#timeoutMs,
      service: 'STORE',
      method,
      args,
    });
  }

  getCapabilities() {
    return clone(CAPABILITIES);
  }

  async readScopeState(scopeId) {
    return this.#call('readScopeState', [scopeId]);
  }

  async readCheckpoint(scopeId, revision = null) {
    return this.#call('readCheckpoint', [scopeId, revision]);
  }

  async readReceipt(scopeId, requestId) {
    return this.#call('readReceipt', [scopeId, requestId]);
  }

  async readAuditEntries(scopeId) {
    return this.#call('readAuditEntries', [scopeId]);
  }

  async readIdempotencyRecord(scopeId, requestId) {
    return this.#call('readIdempotencyRecord', [scopeId, requestId]);
  }

  async readEvidenceRecord(scopeId, requestId) {
    return this.#call('readEvidenceRecord', [scopeId, requestId]);
  }

  async readTransactionSeal(scopeId, requestId) {
    return this.#call('readTransactionSeal', [scopeId, requestId]);
  }

  async readRecoverySnapshot({ scope_id: scopeId, request_id: requestId }) {
    return this.#call('readRecoverySnapshot', [{ scope_id: scopeId, request_id: requestId }]);
  }

  async commitAtomicMutation(bundle) {
    return this.#call('commitAtomicMutation', [bundle]);
  }
}

module.exports = {
  HttpDurableStatePortProof,
};
