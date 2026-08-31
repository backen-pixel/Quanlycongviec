const crypto = require('node:crypto');
const { deepFreeze } = require('./agentRegistry');
const { factoryError } = require('./errors');

const AUTHENTICATED_CONTEXTS = new WeakMap();
const RESOLVED_AGENT_IDENTITIES = new WeakSet();
const RESOLVED_HUMAN_IDENTITIES = new WeakSet();

function assertFutureExpiry(record, now) {
  if (!record || !Number.isFinite(record.expires_at_ms) || record.expires_at_ms <= now.getTime()) {
    throw factoryError('AUTHENTICATED_CONTEXT_EXPIRED', 'Authenticated principal context đã hết hạn.');
  }
}

class SoftwareFactoryIdentityBoundary {
  #clock;
  #contextTtlMs;
  #resolveTrustedPrincipal;

  constructor({
    resolveTrustedPrincipal,
    clock = () => new Date(),
    contextTtlMs = 5 * 60 * 1000,
  } = {}) {
    if (typeof resolveTrustedPrincipal !== 'function') {
      throw factoryError(
        'TRUSTED_PRINCIPAL_RESOLVER_REQUIRED',
        'Identity Boundary cần trusted principal resolver từ backend composition root.',
      );
    }
    if (!Number.isFinite(Number(contextTtlMs)) || Number(contextTtlMs) <= 0) {
      throw factoryError('IDENTITY_CONTEXT_TTL_INVALID', 'Identity context TTL phải lớn hơn 0.');
    }
    this.#resolveTrustedPrincipal = resolveTrustedPrincipal;
    this.#clock = clock;
    this.#contextTtlMs = Number(contextTtlMs);
  }

  #resolve(assertion) {
    let principal;
    try {
      principal = this.#resolveTrustedPrincipal(assertion);
    } catch (_error) {
      throw factoryError('PRINCIPAL_AUTHENTICATION_FAILED', 'Không xác thực được trusted principal.');
    }
    if (!principal || typeof principal !== 'object') {
      throw factoryError('PRINCIPAL_AUTHENTICATION_FAILED', 'Không xác thực được trusted principal.');
    }
    return principal;
  }

  #issueContext(kind, principal) {
    const issuedAt = this.#clock();
    const expiresAt = new Date(issuedAt.getTime() + this.#contextTtlMs);
    const context = deepFreeze({
      context_id: `sf-auth-${crypto.randomUUID()}`,
      context_type: kind === 'agent' ? 'AUTHENTICATED_AGENT_CONTEXT' : 'AUTHENTICATED_HUMAN_CONTEXT',
      issued_at: issuedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    });
    AUTHENTICATED_CONTEXTS.set(context, {
      boundary: this,
      kind,
      principal: deepFreeze({ ...principal }),
      expires_at_ms: expiresAt.getTime(),
    });
    return context;
  }

  authenticateAgent(principalAssertion) {
    const principal = this.#resolve(principalAssertion);
    if (principal.principal_type !== 'software_factory_agent'
      || typeof principal.principal_id !== 'string'
      || !principal.principal_id.trim()
      || typeof principal.agent_id !== 'string'
      || !principal.agent_id.trim()) {
      throw factoryError(
        'SOFTWARE_FACTORY_AGENT_AUTHENTICATION_DENIED',
        'Trusted principal không phải Software Factory Agent.',
      );
    }
    return this.#issueContext('agent', principal);
  }

  authenticateHuman(principalAssertion) {
    const principal = this.#resolve(principalAssertion);
    if (principal.principal_type !== 'human'
      || typeof principal.principal_id !== 'string'
      || !principal.principal_id.trim()
      || typeof principal.authority !== 'string'
      || !principal.authority.trim()) {
      throw factoryError('HUMAN_AUTHENTICATION_DENIED', 'Trusted principal không phải human approver.');
    }
    return this.#issueContext('human', principal);
  }

  #contextRecord(context, expectedKind) {
    const record = context && typeof context === 'object' ? AUTHENTICATED_CONTEXTS.get(context) : null;
    if (!record || record.boundary !== this || record.kind !== expectedKind) {
      throw factoryError('AUTHENTICATED_CONTEXT_REQUIRED', 'Cần authenticated principal context đúng boundary.');
    }
    assertFutureExpiry(record, this.#clock());
    return record;
  }

  resolveAgentContext(context) {
    const record = this.#contextRecord(context, 'agent');
    const identity = deepFreeze({
      principal_id: record.principal.principal_id,
      agent_instance_id: record.principal.agent_instance_id || record.principal.principal_id,
      agent_id: record.principal.agent_id,
      identity_namespace: 'software_factory',
      authenticated: true,
    });
    RESOLVED_AGENT_IDENTITIES.add(identity);
    return identity;
  }

  resolveHumanContext(context) {
    const record = this.#contextRecord(context, 'human');
    const identity = deepFreeze({
      principal_id: record.principal.principal_id,
      authority: record.principal.authority,
      identity_type: 'human',
      authenticated: true,
    });
    RESOLVED_HUMAN_IDENTITIES.add(identity);
    return identity;
  }
}

function isAuthenticatedAgentIdentity(identity) {
  return Boolean(identity && typeof identity === 'object' && RESOLVED_AGENT_IDENTITIES.has(identity));
}

function isAuthenticatedHumanIdentity(identity) {
  return Boolean(identity && typeof identity === 'object' && RESOLVED_HUMAN_IDENTITIES.has(identity));
}

module.exports = {
  SoftwareFactoryIdentityBoundary,
  isAuthenticatedAgentIdentity,
  isAuthenticatedHumanIdentity,
};
