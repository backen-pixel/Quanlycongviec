'use strict';

const { assessProductionDeliveryRisk } = require('../rules/productionDeliveryRiskRules');

const FORBIDDEN_REPOSITORY_METHODS = [
  'from',
  'query',
  'sql',
  'insert',
  'update',
  'delete',
  'upsert',
  'rpc',
  'execute',
];

function deny(reasonCode, details = {}) {
  return {
    decision: 'DENY',
    reason_code: reasonCode,
    domain: 'production',
    details,
  };
}

function inProjectDataScope(dataScope, projectId) {
  if (!Array.isArray(dataScope?.project_ids)) return true;
  return dataScope.project_ids.map(String).includes(String(projectId));
}

function assertTypedReadRepository(repository) {
  if (!repository || typeof repository.loadAssessmentInput !== 'function') {
    throw new TypeError('Production delay-risk service requires loadAssessmentInput().');
  }
  const forbidden = FORBIDDEN_REPOSITORY_METHODS.filter((method) => method in repository);
  if (forbidden.length) {
    throw new TypeError('Generic database repository methods are forbidden: ' + forbidden.join(', '));
  }
}

function createProductionDeliveryRiskApplicationService({ repository } = {}) {
  assertTypedReadRepository(repository);

  return Object.freeze({
    name: 'production.delivery-risk-assessment',
    mode: 'READ_ONLY',

    async execute({ scope, input } = {}) {
      if (!scope?.tenant_id) return deny('TENANT_CONTEXT_REQUIRED');
      if (!scope?.company_id) return deny('COMPANY_CONTEXT_REQUIRED');
      if (!scope?.user_id) return deny('ACTOR_CONTEXT_REQUIRED');
      if (!input?.project_id) return deny('PROJECT_ID_REQUIRED');
      if (!inProjectDataScope(scope.data_scope, input.project_id)) {
        return deny('DATA_SCOPE_DENIED', { project_id: input.project_id });
      }

      let loaded;
      try {
        loaded = await repository.loadAssessmentInput({
          tenant_id: scope.tenant_id,
          company_id: scope.company_id,
          project_id: input.project_id,
          production_order_id: input.production_order_id || null,
        });
      } catch (_error) {
        return deny('APPLICATION_SERVICE_UNAVAILABLE');
      }
      if (!loaded) return deny('RESOURCE_NOT_FOUND');

      const { project, production_order: productionOrder, stages } = loaded;
      if (!project || !productionOrder) return deny('RESOURCE_CONTEXT_INCOMPLETE');
      if (String(project.id || '') !== String(input.project_id)) {
        return deny('PROJECT_SCOPE_INVALID');
      }
      if (input.production_order_id
        && String(productionOrder.id || '') !== String(input.production_order_id)) {
        return deny('PRODUCTION_ORDER_SCOPE_INVALID');
      }
      if (String(productionOrder.project_id || '') !== String(project.id || '')) {
        return deny('RESOURCE_RELATION_INVALID');
      }
      if (String(project.tenant_id || '') !== String(scope.tenant_id)
        || String(productionOrder.tenant_id || '') !== String(scope.tenant_id)) {
        return deny('TENANT_SCOPE_INVALID');
      }
      if (String(project.company_id || '') !== String(scope.company_id)
        || String(productionOrder.company_id || '') !== String(scope.company_id)) {
        return deny('COMPANY_SCOPE_INVALID');
      }

      return assessProductionDeliveryRisk({
        project,
        productionOrder,
        stages,
        asOfDate: input.as_of_date || null,
        riskWarningDays: Number(scope.policy?.risk_warning_days ?? 1),
      });
    },
  });
}

module.exports = {
  FORBIDDEN_REPOSITORY_METHODS,
  assertTypedReadRepository,
  createProductionDeliveryRiskApplicationService,
};
