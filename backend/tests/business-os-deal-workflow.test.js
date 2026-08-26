process.env.NODE_ENV = 'test';
process.env.REDIS_DISABLED = '1';

const assert = require('node:assert/strict');
const {
  STAGE_DEFINITIONS,
  normalizeStageAutomation,
  buildDealWorkflowFunnelKpi,
} = require('../src/helpers/businessOsDealWorkflow');

const survey = normalizeStageAutomation({ company_id: 'company-1' }, null, 'survey');
assert.equal(survey.stage_key, 'survey');
assert.equal(survey.task_items.length, 3);
assert.equal(survey.task_items.every((task) => task.blocks_stage_advance), true);
assert.equal(survey.task_items.some((task) => task.completion_requires_file_or_note), true);
assert.equal(survey.sla_policy.duration_minutes, 1440);

const design = normalizeStageAutomation({ company_id: 'company-1' }, null, 'design');
assert.equal(design.stage_key, 'design');
assert.equal(design.task_items.length, 3);
assert.equal(design.sla_policy.duration_minutes, 1920);
assert.equal(STAGE_DEFINITIONS.design.label, 'Thiết kế');

const designReview = normalizeStageAutomation({ company_id: 'company-1' }, null, 'design_review');
assert.equal(designReview.stage_key, 'design_review');
assert.equal(designReview.task_items.length, 3);
assert.equal(designReview.task_items.filter((task) => task.completion_requires_file_or_note).length, 2);
assert.equal(designReview.sla_policy.duration_minutes, 480);

const records = [
  { id: 'deal-1', type: 'deal' },
  { id: 'deal-2', type: 'deal' },
  { id: 'deal-3', type: 'deal' },
  { id: 'lead-1', type: 'lead' },
];
const instances = [
  {
    record_id: 'deal-1',
    current_stage_key: 'design_completed',
    survey_started_at: '2026-08-20T01:00:00.000Z',
    survey_completed_at: '2026-08-20T03:00:00.000Z',
    design_started_at: '2026-08-20T03:00:00.000Z',
    design_completed_at: '2026-08-20T07:00:00.000Z',
  },
  { record_id: 'deal-2', current_stage_key: 'survey', survey_started_at: '2026-08-21T01:00:00.000Z' },
  {
    record_id: 'deal-3',
    current_stage_key: 'design_completed',
    workflow_path: 'customer_design',
    design_review_started_at: '2026-08-22T01:00:00.000Z',
    design_review_completed_at: '2026-08-22T05:00:00.000Z',
    design_completed_at: '2026-08-22T05:00:00.000Z',
  },
];
const funnel = buildDealWorkflowFunnelKpi({ records, instances });
assert.equal(funnel.deal_records, 3);
assert.equal(funnel.workflow_started, 3);
assert.equal(funnel.survey_started, 2);
assert.equal(funnel.survey_completed, 1);
assert.equal(funnel.design_review_started, 1);
assert.equal(funnel.design_review_completed, 1);
assert.equal(funnel.design_completed, 2);
assert.equal(funnel.workflow_selection_rate_pct, 100);
assert.equal(funnel.customer_design_share_pct, 33.3);
assert.equal(funnel.deal_to_survey_rate_pct, 66.7);
assert.equal(funnel.survey_completion_rate_pct, 50);
assert.equal(funnel.survey_to_design_ready_rate_pct, 100);
assert.equal(funnel.design_review_completion_rate_pct, 100);
assert.equal(funnel.quote_ready_rate_pct, 66.7);
assert.equal(funnel.average_survey_hours, 2);
assert.equal(funnel.average_design_hours, 4);
assert.equal(funnel.average_design_review_hours, 4);

const quotationDownstream = buildDealWorkflowFunnelKpi({
  records: [{ id: 'deal-quote', type: 'deal' }],
  instances: [{
    record_id: 'deal-quote',
    current_stage_key: 'quotation',
    workflow_path: 'customer_design',
    design_review_started_at: '2026-08-23T01:00:00.000Z',
    design_review_completed_at: '2026-08-23T02:00:00.000Z',
    design_completed_at: '2026-08-23T02:00:00.000Z',
    quotation_started_at: '2026-08-23T03:00:00.000Z',
  }],
});
assert.equal(quotationDownstream.design_completed, 1, 'Stage downstream không được làm mất KPI thiết kế hoàn tất');
assert.equal(quotationDownstream.design_review_completed, 1);
assert.equal(quotationDownstream.quotation_started, 1);
assert.equal(quotationDownstream.quote_started_rate_pct, 100);

const orderDownstream = buildDealWorkflowFunnelKpi({
  records: [{ id: 'deal-order', type: 'deal' }],
  instances: [{
    record_id: 'deal-order',
    current_stage_key: 'order',
    workflow_path: 'full_service',
    quotation_started_at: '2026-08-24T01:00:00.000Z',
    negotiation_started_at: '2026-08-24T02:00:00.000Z',
    quotation_accepted_at: '2026-08-24T03:00:00.000Z',
    order_started_at: '2026-08-24T04:00:00.000Z',
  }],
});
assert.equal(orderDownstream.quotation_started, 1);
assert.equal(orderDownstream.negotiation_started, 1);
assert.equal(orderDownstream.quotation_accepted, 1);
assert.equal(orderDownstream.order_started, 1);
assert.equal(orderDownstream.quote_acceptance_rate_pct, 100);
assert.equal(orderDownstream.order_creation_rate_pct, 100);

const productionDownstream = buildDealWorkflowFunnelKpi({
  records: [{ id: 'deal-production', type: 'deal' }],
  instances: [{
    record_id: 'deal-production',
    current_stage_key: 'production',
    workflow_path: 'customer_design',
    project_started_at: '2026-08-25T01:00:00.000Z',
    production_started_at: '2026-08-25T02:00:00.000Z',
  }],
});
assert.equal(productionDownstream.order_started, 1, 'Downstream phải giữ mốc Đơn hàng');
assert.equal(productionDownstream.project_started, 1);
assert.equal(productionDownstream.production_started, 1);
assert.equal(productionDownstream.project_creation_rate_pct, 100);
assert.equal(productionDownstream.production_handover_rate_pct, 100);

const installationCompleted = buildDealWorkflowFunnelKpi({
  records: [{ id: 'deal-completed', type: 'deal' }],
  instances: [{
    record_id: 'deal-completed',
    current_stage_key: 'completed',
    workflow_path: 'full_service',
    delivery_ready_at: '2026-08-26T01:00:00.000Z',
    installation_started_at: '2026-08-26T02:00:00.000Z',
    installation_completed_at: '2026-08-26T06:00:00.000Z',
  }],
});
assert.equal(installationCompleted.production_started, 1, 'Stage bàn giao phải giữ toàn bộ mốc upstream');
assert.equal(installationCompleted.delivery_ready, 1);
assert.equal(installationCompleted.installation_started, 1);
assert.equal(installationCompleted.installation_completed, 1);
assert.equal(installationCompleted.production_ready_rate_pct, 100);
assert.equal(installationCompleted.installation_handover_rate_pct, 100);
assert.equal(installationCompleted.installation_completion_rate_pct, 100);

console.log('business-os-deal-workflow.test: OK');
