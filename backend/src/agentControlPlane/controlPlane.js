'use strict';

const crypto = require('node:crypto');
const { deepFreeze } = require('./immutable');
const { AgentControlPlaneError, controlPlaneError } = require('./errors');
const { resolveGovernedTool, validateToolInput } = require('./governedToolRegistry');

const RUN_RECORDS = new WeakMap();
const FORBIDDEN_REASONER_METHODS = [
  'invokeTool',
  'query',
  'sql',
  'from',
  'insert',
  'update',
  'delete',
  'execute',
];

function assertReasoner(reasoner) {
  if (!reasoner || typeof reasoner.recommend !== 'function') {
    throw controlPlaneError('RECOMMENDATION_REASONER_REQUIRED', 'CP1 requires a recommendation reasoner.');
  }
  const forbidden = FORBIDDEN_REASONER_METHODS.filter((method) => method in reasoner);
  if (forbidden.length) {
    throw controlPlaneError(
      'RECOMMENDATION_REASONER_PRIVILEGE_DENIED',
      'Reasoner cannot expose tool or database methods.',
      { forbidden },
    );
  }
}

function validateRecommendation(output) {
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    throw controlPlaneError('RECOMMENDATION_OUTPUT_INVALID', 'Recommendation must be an object.');
  }
  if (output.auto_execute === true || output.mutation || output.tool_calls || output.commands) {
    throw controlPlaneError(
      'RECOMMENDATION_OUTPUT_FORBIDDEN',
      'CP1 recommendation cannot contain execution or mutation instructions.',
    );
  }
  const summary = String(output.summary || '').trim();
  if (!summary || summary.length > 2000) {
    throw controlPlaneError('RECOMMENDATION_SUMMARY_INVALID', 'Recommendation summary is required.');
  }
  if (!Array.isArray(output.actions) || output.actions.length < 1 || output.actions.length > 10) {
    throw controlPlaneError('RECOMMENDATION_ACTIONS_INVALID', 'Recommendation requires 1 to 10 actions.');
  }
  const actions = output.actions.map((action) => String(action || '').trim());
  if (actions.some((action) => !action || action.length > 500)) {
    throw controlPlaneError('RECOMMENDATION_ACTION_INVALID', 'Recommendation action is invalid.');
  }
  const confidence = output.confidence == null ? null : Number(output.confidence);
  if (confidence != null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) {
    throw controlPlaneError('RECOMMENDATION_CONFIDENCE_INVALID', 'Recommendation confidence must be between 0 and 1.');
  }
  return deepFreeze({
    summary,
    actions,
    confidence,
    mode: 'RECOMMEND_ONLY',
  });
}

function errorCode(error) {
  return error instanceof AgentControlPlaneError && error.code
    ? error.code
    : 'CONTROL_PLANE_INTERNAL_DENY';
}

class AgentControlPlane {
  #identityBoundary;
  #companyContextBoundary;
  #applicationService;
  #reasoner;
  #auditLedger;

  constructor({
    identityBoundary,
    companyContextBoundary,
    applicationService,
    reasoner,
    auditLedger,
  } = {}) {
    if (!identityBoundary
      || typeof identityBoundary.authenticate !== 'function'
      || typeof identityBoundary.assert !== 'function') {
      throw controlPlaneError('IDENTITY_BOUNDARY_REQUIRED', 'Agent Identity Boundary is required.');
    }
    if (!companyContextBoundary
      || typeof companyContextBoundary.resolveForRun !== 'function'
      || typeof companyContextBoundary.assert !== 'function') {
      throw controlPlaneError('COMPANY_CONTEXT_BOUNDARY_REQUIRED', 'Company Context Boundary is required.');
    }
    if (!applicationService || typeof applicationService.execute !== 'function') {
      throw controlPlaneError('APPLICATION_SERVICE_REQUIRED', 'Typed Application Service is required.');
    }
    if (!applicationService.name || applicationService.mode !== 'READ_ONLY') {
      throw controlPlaneError(
        'APPLICATION_SERVICE_CONTRACT_DENIED',
        'CP1 only accepts a named READ_ONLY Application Service.',
      );
    }
    if (!auditLedger || typeof auditLedger.append !== 'function' || typeof auditLedger.trace !== 'function') {
      throw controlPlaneError('AUDIT_LEDGER_REQUIRED', 'Agent audit ledger is required.');
    }
    assertReasoner(reasoner);
    this.#identityBoundary = identityBoundary;
    this.#companyContextBoundary = companyContextBoundary;
    this.#applicationService = applicationService;
    this.#reasoner = reasoner;
    this.#auditLedger = auditLedger;
  }

  #append(event) {
    return this.#auditLedger.append(event);
  }

  #auditBase(record, requestId = null) {
    if (!record) return { request_id: requestId };
    return {
      run_id: record.run_id,
      request_id: requestId,
      requested_by_user_id: record.identity.actor_user_id,
      requested_by_actor_type: record.identity.actor_type,
      agent_id: record.identity.agent_id,
      agent_version: record.identity.agent_version,
      tenant_id: record.context.tenant_id,
      company_id: record.context.company_id,
      data_scope: record.context.data_scope,
      domain: record.identity.domain,
    };
  }

  #recordFor(runHandle) {
    const record = runHandle && typeof runHandle === 'object' ? RUN_RECORDS.get(runHandle) : null;
    if (!record) {
      throw controlPlaneError(
        'AGENT_RUN_CONTEXT_INVALID',
        'Governed calls require the original immutable Agent Run handle.',
      );
    }
    this.#identityBoundary.assert(record.identity);
    this.#companyContextBoundary.assert(record.context, record.identity);
    return record;
  }

  async startRun(principalAssertion) {
    let identity;
    try {
      identity = await this.#identityBoundary.authenticate(principalAssertion);
      const context = await this.#companyContextBoundary.resolveForRun(identity);
      this.#identityBoundary.assert(identity);
      this.#companyContextBoundary.assert(context, identity);
      const runId = 'cp1-run-' + crypto.randomUUID();
      const runHandle = deepFreeze({
        run_id: runId,
        control_plane: 'CP1',
        immutable: true,
      });
      const record = {
        run_id: runId,
        identity,
        context,
      };
      RUN_RECORDS.set(runHandle, record);
      this.#append({
        ...this.#auditBase(record),
        event_type: 'AGENT_RUN_STARTED',
        reason_code: 'TRUSTED_CONTEXT_RESOLVED',
        metadata: {
          identity_digest: identity.identity_digest,
          context_digest: context.context_digest,
          runtime_environment: identity.runtime_environment,
          decision_level: identity.decision_level,
        },
      });
      return runHandle;
    } catch (error) {
      this.#append({
        event_type: 'CONTROL_PLANE_DENIED',
        agent_id: identity?.agent_id || null,
        agent_version: identity?.agent_version || null,
        tenant_id: identity?.tenant_id || null,
        company_id: identity?.company_id || null,
        requested_by_user_id: identity?.actor_user_id || null,
        decision: 'DENY',
        reason_code: errorCode(error),
        metadata: { stage: 'START_RUN' },
      });
      throw error;
    }
  }

  describeRun(runHandle) {
    const record = this.#recordFor(runHandle);
    return deepFreeze({
      run_id: record.run_id,
      agent_id: record.identity.agent_id,
      agent_version: record.identity.agent_version,
      domain: record.identity.domain,
      decision_level: record.identity.decision_level,
      tenant_id: record.context.tenant_id,
      company_id: record.context.company_id,
      context_digest: record.context.context_digest,
      immutable: true,
    });
  }

  async invoke(runHandle, request = {}) {
    let record;
    let requestId = 'cp1-request-' + crypto.randomUUID();
    let toolDefinition;
    try {
      record = this.#recordFor(runHandle);
      if (request.company_context && request.company_context !== record.context) {
        throw controlPlaneError('COMPANY_CONTEXT_CHANGED', 'Company Context cannot change during a Run.');
      }
      if (request.input?.tenant_id
        && String(request.input.tenant_id) !== String(record.context.tenant_id)) {
        throw controlPlaneError('COMPANY_CONTEXT_CHANGED', 'Tenant cannot change during a Run.');
      }
      if (request.input?.company_id
        && String(request.input.company_id) !== String(record.context.company_id)) {
        throw controlPlaneError('COMPANY_CONTEXT_CHANGED', 'Company cannot change during a Run.');
      }

      toolDefinition = resolveGovernedTool(request.tool);
      const input = validateToolInput(toolDefinition, request.input);
      if (this.#applicationService.name !== toolDefinition.application_service
        || this.#applicationService.mode !== 'READ_ONLY') {
        throw controlPlaneError(
          'APPLICATION_SERVICE_CONTRACT_DENIED',
          'Governed tool is not bound to its approved READ_ONLY Application Service.',
        );
      }
      if (!toolDefinition.allowed_agent_domains.includes(record.identity.domain)) {
        throw controlPlaneError('AGENT_DOMAIN_DENIED', 'Agent domain is not permitted for this tool.');
      }
      if (!toolDefinition.allowed_decision_levels.includes(record.identity.decision_level)) {
        throw controlPlaneError('AGENT_DECISION_LEVEL_DENIED', 'Agent decision level is not permitted.');
      }
      if (!record.identity.capabilities.includes(toolDefinition.capability)
        || !record.context.enabled_capabilities.includes(toolDefinition.capability)) {
        throw controlPlaneError('AGENT_NOT_AUTHORIZED', 'Required Agent capability is not enabled.');
      }
      if (!record.identity.permission_scope.includes(toolDefinition.permission)
        || !record.context.permissions.includes(toolDefinition.permission)) {
        throw controlPlaneError('PERMISSION_MISSING', 'Required permission is missing.');
      }
      if (record.context.policy.agent_access_enabled !== true) {
        throw controlPlaneError('AGENT_NOT_AUTHORIZED', 'Company policy does not enable governed Agent access.');
      }

      this.#append({
        ...this.#auditBase(record, requestId),
        event_type: 'AGENT_REQUEST_ACCEPTED',
        tool: toolDefinition.name,
        application_service: toolDefinition.application_service,
        metadata: {
          input,
          mode: toolDefinition.mode,
        },
      });

      const rawDomainResult = await this.#applicationService.execute({
        scope: {
          ecosystem_id: record.context.ecosystem_id,
          tenant_id: record.context.tenant_id,
          company_id: record.context.company_id,
          user_id: record.context.user_id,
          permissions: record.context.permissions,
          policy: record.context.policy,
          process_kpi_context: record.context.process_kpi_context,
          data_scope: record.context.data_scope,
          enabled_capabilities: record.context.enabled_capabilities,
        },
        input,
      });
      const domainResult = deepFreeze(rawDomainResult);
      if (!domainResult || !['PASS', 'DENY'].includes(domainResult.decision)) {
        throw controlPlaneError('DOMAIN_DECISION_INVALID', 'Domain must return PASS or DENY.');
      }

      this.#append({
        ...this.#auditBase(record, requestId),
        event_type: 'DOMAIN_DECISION_RECORDED',
        tool: toolDefinition.name,
        application_service: toolDefinition.application_service,
        domain: domainResult.domain || toolDefinition.domain,
        decision: domainResult.decision,
        reason_code: domainResult.reason_code || 'DOMAIN_REASON_REQUIRED',
        metadata: {
          project_id: input.project_id,
          production_order_id: input.production_order_id,
        },
      });

      if (domainResult.decision === 'DENY') {
        return deepFreeze({
          run_id: record.run_id,
          request_id: requestId,
          decision: 'DENY',
          reason_code: domainResult.reason_code,
          recommendation: null,
        });
      }

      let recommendation = null;
      if (record.identity.decision_level === 'RECOMMEND') {
        const reasonerOutput = await this.#reasoner.recommend({
          facts: domainResult.facts,
          company_context: {
            process_kpi_context: record.context.process_kpi_context,
            policy: record.context.policy,
          },
          agent: {
            agent_id: record.identity.agent_id,
            agent_version: record.identity.agent_version,
            role: record.identity.role,
            domain: record.identity.domain,
          },
        });
        recommendation = validateRecommendation(reasonerOutput);
        this.#append({
          ...this.#auditBase(record, requestId),
          event_type: 'AGENT_RECOMMENDATION_RECORDED',
          tool: toolDefinition.name,
          application_service: toolDefinition.application_service,
          decision: 'PASS',
          reason_code: domainResult.reason_code,
          recommendation,
        });
      }

      return deepFreeze({
        run_id: record.run_id,
        request_id: requestId,
        decision: 'PASS',
        reason_code: domainResult.reason_code,
        facts: domainResult.facts,
        recommendation,
        mode: record.identity.decision_level,
      });
    } catch (error) {
      this.#append({
        ...this.#auditBase(record, requestId),
        event_type: 'CONTROL_PLANE_DENIED',
        tool: toolDefinition?.name || String(request.tool || '') || null,
        application_service: toolDefinition?.application_service || null,
        decision: 'DENY',
        reason_code: errorCode(error),
        metadata: { stage: 'INVOKE' },
      });
      throw error;
    }
  }

  getAuditTrace(runHandle) {
    const record = this.#recordFor(runHandle);
    return this.#auditLedger.trace(record.run_id);
  }

  verifyAuditChain() {
    return typeof this.#auditLedger.verifyChain === 'function'
      ? this.#auditLedger.verifyChain()
      : false;
  }
}

module.exports = {
  AgentControlPlane,
  FORBIDDEN_REASONER_METHODS,
  assertReasoner,
  validateRecommendation,
};
