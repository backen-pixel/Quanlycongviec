const crypto = require('node:crypto');
const { deepFreeze } = require('./agentRegistry');
const { clone, hmacSha256Digest } = require('./canonical');
const { redactSensitiveData } = require('./evidenceContracts');
const { factoryError } = require('./errors');

const REQUIRED_RUNTIME_METHODS = Object.freeze([
  'invokeTool',
  'collectEvidence',
]);

const AUTHORIZED_EXECUTION_GRANTS = new WeakSet();

function assertRuntimeAdapterContract(adapter) {
  if (!adapter || typeof adapter !== 'object') {
    throw factoryError('RUNTIME_ADAPTER_INVALID', 'Runtime Adapter phải là object.');
  }
  const missing = REQUIRED_RUNTIME_METHODS.filter((method) => typeof adapter[method] !== 'function');
  if (missing.length) {
    throw factoryError('RUNTIME_ADAPTER_CONTRACT_INCOMPLETE', `Runtime Adapter thiếu: ${missing.join(', ')}`, { missing });
  }
  if (typeof adapter.getIdentity === 'function' || typeof adapter.resolveRole === 'function') {
    throw factoryError('RUNTIME_IDENTITY_PROVIDER_DENIED', 'Runtime Adapter không được tự resolve identity/role.');
  }
  if (adapter.canBypassPolicy === true || adapter.canDeployProduction === true) {
    throw factoryError('RUNTIME_ADAPTER_PRIVILEGE_DENIED', 'Runtime Adapter không được bypass policy hoặc deploy production.');
  }
  if (adapter.supportsIdempotency !== true) {
    throw factoryError('RUNTIME_IDEMPOTENCY_REQUIRED', 'Runtime Adapter phải thực thi idempotency_key cho invokeTool.');
  }
  return true;
}

function isAuthorizedExecutionGrant(grant) {
  return Boolean(grant && typeof grant === 'object' && AUTHORIZED_EXECUTION_GRANTS.has(grant));
}

class RuntimeExecutionBoundary {
  #adapter;
  #clock;
  #executions;
  #idempotencyKey;

  constructor({ adapter, clock = () => new Date() } = {}) {
    assertRuntimeAdapterContract(adapter);
    this.#adapter = adapter;
    this.#clock = clock;
    this.#executions = new Map();
    this.#idempotencyKey = crypto.randomBytes(32);
  }

  async execute(authorizedRequest) {
    if (!authorizedRequest || authorizedRequest.policy_verified !== true) {
      throw factoryError('AUTHORIZED_EXECUTION_REQUIRED', 'Runtime chỉ nhận request đã qua policy + run gate.');
    }
    if (typeof authorizedRequest.request_id !== 'string' || !authorizedRequest.request_id.trim()) {
      throw factoryError('RUNTIME_REQUEST_ID_REQUIRED', 'Runtime execution cần request_id đã qua mutation guard.');
    }
    const executionKey = authorizedRequest.run_id + ':' + authorizedRequest.request_id;
    const requestDigest = hmacSha256Digest(this.#idempotencyKey, authorizedRequest);
    let execution = this.#executions.get(executionKey);
    if (execution && execution.request_digest !== requestDigest) {
      throw factoryError('RUNTIME_IDEMPOTENCY_KEY_REUSE_DENIED', 'Runtime request_id đã gắn execution khác.');
    }
    if (!execution) {
      const grant = deepFreeze({
      grant_id: `sf-exec-${crypto.randomUUID()}`,
      nonce: crypto.randomUUID(),
      request_id: authorizedRequest.request_id,
      issued_at: this.#clock().toISOString(),
      principal_id: authorizedRequest.principal_id,
      agent_id: authorizedRequest.agent_id,
      requirement_id: authorizedRequest.requirement_id,
      run_id: authorizedRequest.run_id,
      run_cycle: authorizedRequest.run_cycle,
      tool: authorizedRequest.tool,
      action: authorizedRequest.action,
      path: authorizedRequest.path || null,
      domain_context: authorizedRequest.domain_context || null,
      target_digest: authorizedRequest.target_digest || null,
      });
      AUTHORIZED_EXECUTION_GRANTS.add(grant);
      execution = { grant, request_digest: requestDigest };
      this.#executions.set(executionKey, execution);
    }

    if (!Object.prototype.hasOwnProperty.call(execution, 'result')) {
      const result = await this.#adapter.invokeTool({
        authorization_grant: execution.grant,
        idempotency_key: executionKey,
        tool: authorizedRequest.tool,
        path: authorizedRequest.path || null,
        input: authorizedRequest.input,
      });
      execution.result = clone(redactSensitiveData(result).value);
    }
    if (!Object.prototype.hasOwnProperty.call(execution, 'evidence')) {
      const evidence = await this.#adapter.collectEvidence({
        authorization_grant: execution.grant,
        idempotency_key: executionKey,
        tool: authorizedRequest.tool,
        path: authorizedRequest.path || null,
        result: clone(execution.result),
      });
      execution.evidence = clone(redactSensitiveData(evidence).value);
    }
    return deepFreeze({
      grant: execution.grant,
      result: clone(execution.result),
      evidence: clone(execution.evidence),
    });
  }
}

module.exports = {
  REQUIRED_RUNTIME_METHODS,
  RuntimeExecutionBoundary,
  assertRuntimeAdapterContract,
  isAuthorizedExecutionGrant,
};
