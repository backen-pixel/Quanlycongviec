const test = require('node:test');
const assert = require('node:assert/strict');
const { buildExecutiveIntelligence } = require('../src/helpers/executiveIntelligenceReadModel');

function finance(overrides = {}) {
  return {
    version: 'project_finance_v1',
    status: 'complete',
    revenue: { forecast: 120000000 },
    cost: { forecast: 80000000 },
    receivables: { outstanding: 30000000 },
    payables: { outstanding: 15000000 },
    profitability: { forecast_complete: true, forecast_profit: 40000000 },
    warnings: [],
    ...overrides,
  };
}

function operations() {
  const late = {
    project_id: 'project-1',
    code: 'TB-001',
    name: 'Căn hộ A',
    deadline: '2026-08-20',
    attention_reasons: ['Sản xuất quá hạn'],
    production_person: { id: 'user-1', full_name: 'Anh Xưởng' },
  };
  return {
    metric_contract: { version: 'operations_kpi_v1' },
    stats: {
      unique_projects: 2,
      attention: 1,
      production_overdue: 1,
      delivery_overdue: 0,
      installation_overdue: 0,
    },
    queues: { all: [late, { project_id: 'project-2', code: 'TB-002', attention_reasons: [] }], attention: [late] },
  };
}

function overview() {
  return {
    metric_contract: { version: 'operations_kpi_v1' },
    kpis: { pipeline_value: 500000000, crm_leads: 20, crm_deals: 8, crm_won: 3, open_tasks: 12, overdue_tasks: 2 },
    urgent: { crm_deal_overdue: 1, overdue_tasks: 2 },
  };
}

test('executive_intelligence_v1 ưu tiên rủi ro Project và luôn kèm evidence', () => {
  const result = buildExecutiveIntelligence({
    companyId: 'company-1',
    overview: overview(),
    operations: operations(),
    financeByProject: new Map([
      ['project-1', finance({ warnings: [{ key: 'receivable_overdue', severity: 'high', count: 1, message: '1 hóa đơn khách hàng quá hạn thu' }] })],
      ['project-2', finance()],
    ]),
    generatedAt: new Date('2026-08-26T00:00:00.000Z'),
  });

  assert.equal(result.version, 'executive_intelligence_v1');
  assert.equal(result.mode, 'read_recommend');
  assert.equal(result.metrics.active_projects, 2);
  assert.equal(result.metrics.forecast_profit, 80000000);
  assert.ok(result.risks.some((risk) => risk.id === 'operation:project-1'));
  assert.ok(result.risks.some((risk) => risk.id === 'finance:project-1:receivable_overdue'));
  assert.ok(result.recommendations.every((item) => item.evidence.length > 0));
  assert.ok(result.recommendations.every((item) => item.requires_human_review === true));
  assert.equal(result.guardrails.write_enabled, false);
});

test('không công bố lợi nhuận danh mục khi một Project thiếu nguồn chi phí', () => {
  const result = buildExecutiveIntelligence({
    companyId: 'company-1',
    overview: overview(),
    operations: operations(),
    financeByProject: {
      'project-1': finance(),
      'project-2': finance({
        status: 'partial',
        profitability: { forecast_complete: false, forecast_profit: 10000000 },
      }),
    },
  });

  assert.equal(result.coverage.finance_portfolio_complete, false);
  assert.equal(result.coverage.finance_partial_projects, 1);
  assert.equal(result.metrics.forecast_cost, null);
  assert.equal(result.metrics.forecast_profit, null);
  assert.match(result.coverage.finance_note, /Không công bố lợi nhuận/);
});

test('không biến cảnh báo tổng hợp thành hành động ghi dữ liệu', () => {
  const result = buildExecutiveIntelligence({ overview: overview(), operations: { stats: {}, queues: { all: [], attention: [] } } });
  const sales = result.recommendations.find((item) => item.domain === 'sales');
  assert.equal(sales.mode, 'read_recommend');
  assert.equal(sales.project_id, null);
  assert.match(sales.href, /business-os\/sales/);
  assert.equal(result.guardrails.external_send_enabled, false);
});
