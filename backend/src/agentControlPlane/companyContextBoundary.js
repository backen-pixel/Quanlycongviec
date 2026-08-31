'use strict';

const { deepFreeze, digest } = require('./immutable');
const { controlPlaneError } = require('./errors');
const { identityRecordFor } = require('./identityBoundary');

const COMPANY_CONTEXT_RECORDS = new WeakMap();

function requiredText(value, code, label) {
  const normalized = String(value || '').trim();
  if (!normalized) throw controlPlaneError(code, label + ' is required in Company Context.');
  return normalized;
}

function requiredList(value, code, label) {
  if (!Array.isArray(value)) throw controlPlaneError(code, label + ' must be an array.');
  const normalized = [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
  if (!normalized.length) throw controlPlaneError(code, label + ' cannot be empty.');
  return normalized;
}

function requiredObject(value, code, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw controlPlaneError(code, label + ' must be an object.');
  }
  return value;
}

function companyContextRecordFor(context) {
  const record = context && typeof context === 'object' ? COMPANY_CONTEXT_RECORDS.get(context) : null;
  if (!record) {
    throw controlPlaneError(
      'IMMUTABLE_COMPANY_CONTEXT_REQUIRED',
      'Governed Agent Path requires Company Context issued by the trusted boundary.',
    );
  }
  identityRecordFor(record.identity);
  return record;
}

class CompanyContextBoundary {
  #resolveTrustedCompanyContext;

  constructor({ resolveTrustedCompanyContext } = {}) {
    if (typeof resolveTrustedCompanyContext !== 'function') {
      throw controlPlaneError(
        'TRUSTED_COMPANY_CONTEXT_RESOLVER_REQUIRED',
        'Company Context Boundary requires a trusted Business OS resolver.',
      );
    }
    this.#resolveTrustedCompanyContext = resolveTrustedCompanyContext;
  }

  async resolveForRun(identity) {
    const identityRecord = identityRecordFor(identity);
    let resolved;
    try {
      resolved = await this.#resolveTrustedCompanyContext({
        tenant_id: identity.tenant_id,
        company_id: identity.company_id,
        user_id: identity.actor_user_id,
      });
    } catch (_error) {
      throw controlPlaneError('COMPANY_CONTEXT_RESOLUTION_FAILED', 'Business OS could not resolve Company Context.');
    }
    if (!resolved || typeof resolved !== 'object') {
      throw controlPlaneError('COMPANY_SCOPE_INVALID', 'Company does not exist in the trusted Business OS scope.');
    }

    const tenantId = requiredText(resolved.tenant_id, 'TENANT_CONTEXT_REQUIRED', 'tenant_id');
    const companyId = requiredText(resolved.company_id, 'COMPANY_CONTEXT_REQUIRED', 'company_id');
    const userId = requiredText(resolved.user_id, 'ACTOR_CONTEXT_REQUIRED', 'user_id');
    if (tenantId !== identity.tenant_id) {
      throw controlPlaneError('TENANT_SCOPE_INVALID', 'Resolved tenant does not match Agent Identity.');
    }
    if (companyId !== identity.company_id) {
      throw controlPlaneError('COMPANY_SCOPE_INVALID', 'Resolved company does not match Agent Identity.');
    }
    if (userId !== identity.actor_user_id) {
      throw controlPlaneError('ACTOR_SCOPE_INVALID', 'Resolved user does not match Agent Identity.');
    }

    const contextData = {
      ecosystem_id: requiredText(resolved.ecosystem_id, 'ECOSYSTEM_CONTEXT_REQUIRED', 'ecosystem_id'),
      tenant_id: tenantId,
      company_id: companyId,
      user_id: userId,
      role: requiredText(resolved.role, 'USER_ROLE_CONTEXT_REQUIRED', 'role'),
      department: requiredText(resolved.department, 'DEPARTMENT_CONTEXT_REQUIRED', 'department'),
      permissions: requiredList(resolved.permissions, 'COMPANY_PERMISSIONS_REQUIRED', 'permissions'),
      policy: requiredObject(resolved.policy, 'COMPANY_POLICY_REQUIRED', 'policy'),
      process_kpi_context: requiredObject(
        resolved.process_kpi_context,
        'PROCESS_KPI_CONTEXT_REQUIRED',
        'process_kpi_context',
      ),
      data_scope: requiredObject(resolved.data_scope, 'DATA_SCOPE_REQUIRED', 'data_scope'),
      enabled_capabilities: requiredList(
        resolved.enabled_capabilities,
        'ENABLED_CAPABILITIES_REQUIRED',
        'enabled_capabilities',
      ),
    };
    const context = deepFreeze({
      ...contextData,
      immutable: true,
      identity_digest: identity.identity_digest,
      context_digest: digest(contextData),
    });
    COMPANY_CONTEXT_RECORDS.set(context, {
      boundary: this,
      identity: identityRecord.identity,
      context,
    });
    return context;
  }

  assert(context, identity) {
    const record = companyContextRecordFor(context);
    if (record.boundary !== this) {
      throw controlPlaneError('COMPANY_CONTEXT_BOUNDARY_MISMATCH', 'Company Context belongs to another boundary.');
    }
    if (record.identity !== identity) {
      throw controlPlaneError('COMPANY_CONTEXT_CHANGED', 'Company Context cannot be replaced during an Agent Run.');
    }
    return record.context;
  }
}

module.exports = {
  CompanyContextBoundary,
  companyContextRecordFor,
};
