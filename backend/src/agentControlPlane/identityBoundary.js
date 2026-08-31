'use strict';

const crypto = require('node:crypto');
const { deepFreeze, digest } = require('./immutable');
const { controlPlaneError } = require('./errors');

const IDENTITY_RECORDS = new WeakMap();
const ALLOWED_DECISION_LEVELS = new Set(['READ_ONLY', 'RECOMMEND']);
const ALLOWED_RUNTIME_ENVIRONMENTS = new Set(['TEST', 'DEVELOPMENT', 'STAGING']);

function requiredText(value, code, label) {
  const normalized = String(value || '').trim();
  if (!normalized) throw controlPlaneError(code, label + ' is required.');
  return normalized;
}

function requiredList(value, code, label) {
  if (!Array.isArray(value)) throw controlPlaneError(code, label + ' must be an array.');
  const normalized = [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
  if (!normalized.length) throw controlPlaneError(code, label + ' cannot be empty.');
  return normalized;
}

function identityRecordFor(identity) {
  const record = identity && typeof identity === 'object' ? IDENTITY_RECORDS.get(identity) : null;
  if (!record) {
    throw controlPlaneError(
      'AUTHENTICATED_AGENT_IDENTITY_REQUIRED',
      'Governed Agent Path requires identity issued by the trusted Identity Boundary.',
    );
  }
  if (record.expires_at_ms <= record.clock().getTime()) {
    throw controlPlaneError('AGENT_IDENTITY_EXPIRED', 'Agent Identity has expired.');
  }
  return record;
}

class AgentIdentityBoundary {
  #resolveTrustedAgent;
  #clock;
  #ttlMs;

  constructor({
    resolveTrustedAgent,
    clock = () => new Date(),
    ttlMs = 5 * 60 * 1000,
  } = {}) {
    if (typeof resolveTrustedAgent !== 'function') {
      throw controlPlaneError(
        'TRUSTED_AGENT_RESOLVER_REQUIRED',
        'Agent Identity Boundary requires a trusted backend resolver.',
      );
    }
    if (!Number.isFinite(Number(ttlMs)) || Number(ttlMs) <= 0) {
      throw controlPlaneError('AGENT_IDENTITY_TTL_INVALID', 'Agent Identity TTL must be positive.');
    }
    this.#resolveTrustedAgent = resolveTrustedAgent;
    this.#clock = clock;
    this.#ttlMs = Number(ttlMs);
  }

  async authenticate(principalAssertion) {
    let resolved;
    try {
      resolved = await this.#resolveTrustedAgent(principalAssertion);
    } catch (_error) {
      throw controlPlaneError('AGENT_IDENTITY_AUTHENTICATION_FAILED', 'Trusted Agent authentication failed.');
    }
    if (!resolved || typeof resolved !== 'object' || resolved.principal_type !== 'business_agent') {
      throw controlPlaneError('AGENT_IDENTITY_AUTHENTICATION_DENIED', 'Principal is not a trusted Business Agent.');
    }

    const issuedAt = this.#clock();
    const expiresAt = new Date(issuedAt.getTime() + this.#ttlMs);
    const decisionLevel = requiredText(
      resolved.decision_level,
      'AGENT_DECISION_LEVEL_REQUIRED',
      'decision_level',
    ).toUpperCase();
    if (!ALLOWED_DECISION_LEVELS.has(decisionLevel)) {
      throw controlPlaneError(
        'AGENT_DECISION_LEVEL_DENIED',
        'CP1 only permits READ_ONLY or RECOMMEND.',
      );
    }
    const runtimeEnvironment = requiredText(
      resolved.runtime_environment,
      'AGENT_RUNTIME_ENVIRONMENT_REQUIRED',
      'runtime_environment',
    ).toUpperCase();
    if (!ALLOWED_RUNTIME_ENVIRONMENTS.has(runtimeEnvironment)) {
      throw controlPlaneError(
        'AGENT_RUNTIME_ENVIRONMENT_DENIED',
        'CP1 does not permit production Agent runtime.',
      );
    }

    const identityData = {
      identity_id: 'cp1-identity-' + crypto.randomUUID(),
      principal_id: requiredText(resolved.principal_id, 'AGENT_PRINCIPAL_REQUIRED', 'principal_id'),
      agent_id: requiredText(resolved.agent_id, 'AGENT_ID_REQUIRED', 'agent_id'),
      agent_version: requiredText(resolved.agent_version, 'AGENT_VERSION_REQUIRED', 'agent_version'),
      role: requiredText(resolved.role, 'AGENT_ROLE_REQUIRED', 'role'),
      domain: requiredText(resolved.domain, 'AGENT_DOMAIN_REQUIRED', 'domain'),
      capabilities: requiredList(resolved.capabilities, 'AGENT_CAPABILITIES_REQUIRED', 'capabilities'),
      decision_level: decisionLevel,
      tenant_id: requiredText(resolved.tenant_id, 'TENANT_CONTEXT_REQUIRED', 'tenant_id'),
      company_id: requiredText(resolved.company_id, 'COMPANY_CONTEXT_REQUIRED', 'company_id'),
      actor_user_id: requiredText(resolved.actor_user_id, 'ACTOR_CONTEXT_REQUIRED', 'actor_user_id'),
      actor_type: String(resolved.actor_type || 'USER').trim().toUpperCase(),
      permission_scope: requiredList(
        resolved.permission_scope,
        'AGENT_PERMISSION_SCOPE_REQUIRED',
        'permission_scope',
      ),
      runtime_environment: runtimeEnvironment,
      issued_at: issuedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    };
    const identity = deepFreeze({
      ...identityData,
      authenticated: true,
      identity_digest: digest(identityData),
    });
    IDENTITY_RECORDS.set(identity, {
      boundary: this,
      clock: this.#clock,
      expires_at_ms: expiresAt.getTime(),
      identity,
    });
    return identity;
  }

  assert(identity) {
    const record = identityRecordFor(identity);
    if (record.boundary !== this) {
      throw controlPlaneError('AGENT_IDENTITY_BOUNDARY_MISMATCH', 'Agent Identity belongs to another boundary.');
    }
    return record.identity;
  }
}

module.exports = {
  ALLOWED_DECISION_LEVELS,
  ALLOWED_RUNTIME_ENVIRONMENTS,
  AgentIdentityBoundary,
  identityRecordFor,
};
