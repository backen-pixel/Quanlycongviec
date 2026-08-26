process.env.NODE_ENV = 'test';
process.env.REDIS_DISABLED = '1';

const assert = require('node:assert/strict');
const {
  canStartQuotationFromStage,
  quotationEventIdempotencyKey,
  commercialEventIdempotencyKey,
  quotationTargetStage,
  canAdvanceCommercialStage,
  normalizeQuotationSummary,
  normalizeProjectSummary,
} = require('../src/helpers/businessOsCommercialWorkflow');

assert.equal(canStartQuotationFromStage('design_completed'), true);
assert.equal(canStartQuotationFromStage('design'), false);
assert.equal(canStartQuotationFromStage('quotation'), false);
assert.equal(quotationEventIdempotencyKey('quote-1'), 'sales-quotation-created-quote-1');
assert.equal(commercialEventIdempotencyKey('quotation', 'quote-1', 'negotiation'), 'sales-commercial-quotation-quote-1-negotiation');
assert.equal(quotationTargetStage('draft'), 'quotation');
assert.equal(quotationTargetStage('sent'), 'negotiation');
assert.equal(quotationTargetStage('rejected'), 'negotiation');
assert.equal(quotationTargetStage('accepted'), 'order_ready');
assert.equal(quotationTargetStage('converted'), null, 'Converted không được thay thế bằng chứng đơn hàng thật');
assert.equal(canAdvanceCommercialStage('quotation', 'negotiation'), true);
assert.equal(canAdvanceCommercialStage('quotation', 'order_ready'), true, 'Cho phép khách duyệt ngay không bắt buộc trạng thái sent');
assert.equal(canAdvanceCommercialStage('order_ready', 'negotiation'), false, 'Không hồi quy process khi sửa trạng thái chứng từ');
assert.equal(canAdvanceCommercialStage('order_ready', 'order'), true);
assert.equal(canAdvanceCommercialStage('order', 'project'), true);
assert.equal(canAdvanceCommercialStage('project', 'production'), true);
assert.equal(canAdvanceCommercialStage('production', 'delivery_ready'), true);
assert.equal(canAdvanceCommercialStage('delivery_ready', 'installation'), true);
assert.equal(canAdvanceCommercialStage('installation', 'completed'), true);
assert.equal(canAdvanceCommercialStage('production', 'project'), false);

assert.deepEqual(normalizeQuotationSummary({
  id: 'quote-1',
  code: 'BG0001',
  title: 'Báo giá tủ bếp',
  status: 'draft',
  total: '125000000',
  created_at: '2026-08-26T00:00:00.000Z',
}), {
  id: 'quote-1',
  code: 'BG0001',
  title: 'Báo giá tủ bếp',
  status: 'draft',
  total: 125000000,
  created_at: '2026-08-26T00:00:00.000Z',
  updated_at: null,
});

assert.deepEqual(normalizeProjectSummary({
  id: 'project-1',
  code: 'TB-2026-001',
  name: 'Dự án tủ bếp',
  status: 'new',
  company_id: 'company-1',
}), {
  id: 'project-1',
  code: 'TB-2026-001',
  name: 'Dự án tủ bếp',
  status: 'new',
  company_id: 'company-1',
  construction_start_date: null,
  expected_production_start_date: null,
  production_deadline: null,
  delivery_date: null,
  install_date: null,
  logistics_company_id: null,
  vc_kanban_column_id: null,
  vc_handover_status: null,
  created_at: null,
  updated_at: null,
});

console.log('business-os-commercial-workflow.test: OK');
