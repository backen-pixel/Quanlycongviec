const { callProofService, validateProofClientOptions } = require('./proofHttpClient');

class HttpKmsKeyProviderProof {
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
      service: 'KMS',
      method,
      args,
    });
  }

  async getActiveKey(options = {}) {
    return this.#call('getActiveKey', [options]);
  }

  async getKey(options) {
    return this.#call('getKey', [options]);
  }

  async sign(options) {
    return this.#call('sign', [options]);
  }

  async verify(options) {
    return this.#call('verify', [options]);
  }

  async listAuditEvents(options = {}) {
    return this.#call('listAuditEvents', [options]);
  }

  async rotateKey(options) {
    return this.#call('rotateKey', [options]);
  }

  async revokeKey(options) {
    return this.#call('revokeKey', [options]);
  }
}

module.exports = {
  HttpKmsKeyProviderProof,
};
