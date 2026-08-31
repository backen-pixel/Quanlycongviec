'use strict';

const {
  buildManufacturingOrderReadModel,
  todayYmd,
  ymdFromValue,
} = require('./manufacturingScheduleRules');

function deny(reasonCode, details = {}) {
  return {
    decision: 'DENY',
    reason_code: reasonCode,
    domain: 'production',
    details,
  };
}

function assessProductionDeliveryRisk({
  project,
  productionOrder,
  stages,
  asOfDate,
  riskWarningDays = 1,
} = {}) {
  if (!project || typeof project !== 'object') return deny('PROJECT_CONTEXT_MISSING');
  if (!productionOrder || typeof productionOrder !== 'object') {
    return deny('PRODUCTION_ORDER_CONTEXT_MISSING');
  }
  if (String(productionOrder.status || '').toUpperCase() === 'CANCELLED') {
    return deny('PRODUCTION_ORDER_CANCELLED');
  }
  if (!Array.isArray(stages) || !stages.length) return deny('SCHEDULE_CONTEXT_MISSING');

  const deliveryDate = ymdFromValue(productionOrder.delivery_date || project.delivery_date);
  if (!deliveryDate) return deny('DELIVERY_DATE_REQUIRED');
  const effectiveAsOfDate = asOfDate ? ymdFromValue(asOfDate) : todayYmd();
  if (!effectiveAsOfDate) return deny('AS_OF_DATE_INVALID');

  const model = buildManufacturingOrderReadModel(
    { ...productionOrder, delivery_date: deliveryDate },
    stages,
    { asOfYmd: effectiveAsOfDate, riskWarningDays },
  );
  if (!model.current_stage) return deny('ACTIVE_PRODUCTION_STAGE_REQUIRED');

  const riskDrivers = [];
  if (model.current_stage.status === 'BLOCKED') riskDrivers.push('CURRENT_STAGE_BLOCKED');
  if (Number(model.delay_days || 0) > 0) riskDrivers.push('OPEN_STAGE_DELAY');
  if (model.risk_level === 'YELLOW') riskDrivers.push('DELIVERY_WINDOW_AT_RISK');
  if (!riskDrivers.length) riskDrivers.push('NO_ACTIVE_DELAY_SIGNAL');

  return {
    decision: 'PASS',
    reason_code: 'DELIVERY_RISK_ASSESSED',
    domain: 'production',
    facts: {
      assessment_version: 'production_delivery_risk_v1',
      as_of_date: effectiveAsOfDate,
      project: {
        id: project.id,
        code: project.code || null,
        name: project.name || null,
      },
      production_order: {
        id: productionOrder.id,
        code: productionOrder.code || null,
        status: model.status,
      },
      delivery_date: deliveryDate,
      forecast_delivery_date: model.forecast_delivery_date,
      delivery_at_risk: model.delivery_at_risk,
      risk_level: model.risk_level,
      delay_days: model.delay_days,
      current_stage: {
        stage_code: model.current_stage.stage_code,
        label: model.current_stage.label || null,
        status: model.current_stage.status,
        planned_due_at: model.current_stage.planned_due_at || null,
        progress_percent: model.current_stage.progress_percent,
        remaining_days: model.current_stage.remaining_days,
      },
      risk_drivers: riskDrivers,
      control_constraints: {
        read_only: true,
        recommendation_only: true,
        state_change_prohibited: true,
      },
    },
  };
}

module.exports = {
  assessProductionDeliveryRisk,
};
