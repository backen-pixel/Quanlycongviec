const test = require('node:test');
const assert = require('node:assert/strict');
const { buildProjectFinanceReadModel } = require('../src/helpers/projectFinanceReadModel');

test('project_finance_v1 tách P&L, dòng tiền, phải thu và phải trả', () => {
  const result = buildProjectFinanceReadModel({
    project: { id: 'project-1', estimated_value: 100_000_000 },
    orders: [{ id: 'order-1', total: 100_000_000, status: 'confirmed' }],
    commercialChanges: [{ id: 'change-1', estimated_value: 10_000_000, stage: { is_won: true } }],
    invoices: [{ id: 'invoice-1', total: 80_000_000, paid_amount: 50_000_000, status: 'issued' }],
    customerPayments: [{ id: 'payment-1', amount: 50_000_000 }],
    purchaseRequests: [{ id: 'request-1', expected_price: 45_000_000, status: 'confirmed' }],
    purchaseOrders: [{ id: 'po-1', total: 40_000_000, status: 'ordered' }],
    supplierBills: [{ id: 'bill-1', purchase_order_id: 'po-1', total: 30_000_000, paid_amount: 20_000_000, status: 'partial_paid' }],
    supplierPayments: [{ id: 'supplier-payment-1', amount: 20_000_000 }],
    expenses: [
      { id: 'expense-1', amount: 5_000_000, status: 'confirmed' },
      { id: 'mirrored-bill-expense', supplier_bill_id: 'bill-1', amount: 30_000_000, status: 'confirmed' },
    ],
    now: new Date('2026-08-26T00:00:00Z'),
  });

  assert.equal(result.version, 'project_finance_v1');
  assert.equal(result.revenue.forecast, 110_000_000);
  assert.equal(result.revenue.invoiced, 80_000_000);
  assert.equal(result.receivables.outstanding, 30_000_000);
  assert.equal(result.cost.planned, 45_000_000);
  assert.equal(result.cost.committed, 40_000_000);
  assert.equal(result.cost.actual, 35_000_000);
  assert.equal(result.cost.unbilled_commitment, 10_000_000);
  assert.equal(result.cost.uncommitted_plan, 5_000_000);
  assert.equal(result.cost.forecast, 50_000_000);
  assert.equal(result.payables.outstanding, 10_000_000);
  assert.equal(result.profitability.forecast_profit, 60_000_000);
  assert.equal(result.profitability.forecast_margin_pct, 54.5);
  assert.equal(result.profitability.forecast_complete, true);
  assert.equal(result.cashflow.net, 25_000_000);
});

test('project_finance_v1 không tính nháp/hủy và cảnh báo quá hạn, biên thấp', () => {
  const result = buildProjectFinanceReadModel({
    project: { id: 'project-2', estimated_value: 50_000_000 },
    invoices: [
      { id: 'issued', total: 40_000_000, paid_amount: 10_000_000, due_date: '2026-08-20', status: 'issued' },
      { id: 'draft', total: 99_000_000, status: 'draft' },
      { id: 'cancelled', total: 99_000_000, status: 'cancelled' },
    ],
    purchaseRequests: [{ id: 'late-request', expected_price: 30_000_000, status: 'delayed' }],
    purchaseOrders: [{ id: 'late-po', total: 30_000_000, status: 'ordered', expected_date: '2026-08-19' }],
    supplierBills: [{ id: 'late-bill', purchase_order_id: 'late-po', total: 30_000_000, paid_amount: 0, due_date: '2026-08-18', status: 'confirmed' }],
    expenses: [{ id: 'expense', amount: 15_000_000, status: 'confirmed' }],
    now: new Date('2026-08-26T00:00:00Z'),
  });

  assert.equal(result.revenue.invoiced, 40_000_000);
  assert.equal(result.receivables.overdue_count, 1);
  assert.equal(result.payables.overdue_count, 1);
  assert.equal(result.profitability.forecast_profit, 5_000_000);
  assert.equal(result.profitability.forecast_margin_pct, 10);
  assert.deepEqual(result.warnings.map((item) => item.key).sort(), [
    'low_margin', 'payable_overdue', 'procurement_delayed', 'purchase_order_late', 'receivable_overdue',
  ]);
});

test('project_finance_v1 báo partial khi migration phải trả chưa sẵn sàng', () => {
  const result = buildProjectFinanceReadModel({
    project: { id: 'project-3', estimated_value: 25_000_000 },
    sourceAvailability: { supplier_payables: false, purchasing: false },
    now: new Date('2026-08-26T00:00:00Z'),
  });

  assert.equal(result.status, 'partial');
  assert.equal(result.availability.supplier_payables, false);
  assert.equal(result.revenue.forecast, 25_000_000);
  assert.equal(result.profitability.forecast_complete, false);
});
