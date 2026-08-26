process.env.NODE_ENV = 'test';
process.env.REDIS_DISABLED = '1';

const assert = require('assert/strict');
const {
  DONE_STATUSES,
  effectiveCompanyId,
  resolveModuleKey,
  buildUnifiedTasksMetricPayload,
} = require('../src/helpers/unifiedTasksQuery');

function run() {
  const companyId = '00000000-0000-4000-8000-000000000010';
  assert.equal(effectiveCompanyId({ role: 'employee', company_id: companyId }, null), companyId);
  assert.equal(effectiveCompanyId({ role: 'admin' }, companyId), companyId);

  assert.equal(resolveModuleKey({ source: 'crm_task', task_kind: 'CRM-Lead' }), 'crm');
  assert.equal(resolveModuleKey({ source: 'task', task_kind: 'Dự án' }), 'production');
  assert.equal(resolveModuleKey({ source: 'crm_assignment', task_kind: 'Giao việc' }), 'assignment');

  const payload = buildUnifiedTasksMetricPayload({
    total: 5401,
    overdue: 43,
    done: 1300,
    pending: 2000,
    inProgress: 1800,
    crm: 1700,
    production: 2200,
    logistics: 300,
    assignment: 900,
    personal: 200,
  }, {
    version: 'work_kpi_v1',
    source: 'unified_tasks_v',
    company_id: companyId,
    terminal_statuses: DONE_STATUSES,
  });

  assert.equal(payload.total, 5401, 'KPI không được cắt ở mốc 3.000 bản ghi');
  assert.equal(payload.open, 4101);
  assert.equal(payload.by_module.other, 101);
  assert.equal(payload.by_status.other, 301);
  assert.equal(payload.metric_contract.company_id, companyId);
  assert.deepEqual(payload.metric_contract.terminal_statuses, ['done', 'completed', 'cancelled']);

  console.log('business-os-work-kpi: all passed');
}

try {
  run();
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
