const assert = require('assert');
const { sxColumnStageKpiKey } = require('../src/helpers/sxPipelineRevenue');

assert.equal(sxColumnStageKpiKey(null), null);
assert.equal(sxColumnStageKpiKey({ bucket_slug: 'won_pending' }), null);
assert.equal(sxColumnStageKpiKey({ is_handover_to_logistics: true, name: 'Bàn giao VC' }), 'awaiting_delivery');
assert.equal(sxColumnStageKpiKey({ name: 'ĐƠN HÀNG ĐÃ GIAO' }), 'shipped');
assert.equal(sxColumnStageKpiKey({ bucket_slug: 'delivered' }), 'shipped');
assert.equal(sxColumnStageKpiKey({ counts_as_completed_revenue: true, name: 'Công nợ' }), null);
assert.equal(sxColumnStageKpiKey({ counts_as_collected_revenue: true, name: 'Đã thu' }), null);
assert.equal(sxColumnStageKpiKey({ name: 'ĐANG SX THÙNG' }), 'producing');
assert.equal(
  sxColumnStageKpiKey({ name: 'ĐANG SX THÙNG', is_handover_to_logistics: true }),
  'awaiting_delivery',
  'cột bàn giao VC thắng tên',
);
assert.equal(
  sxColumnStageKpiKey({ dashboard_kpi: 'producing', is_handover_to_logistics: true, name: 'Bàn giao VC' }),
  'producing',
  'tick Đang SX thắng cờ bàn giao',
);
assert.equal(
  sxColumnStageKpiKey({ dashboard_kpi: 'shipped', name: 'ĐANG SX THÙNG' }),
  'shipped',
  'tick Đã VC thắng tên',
);
assert.equal(
  sxColumnStageKpiKey({ dashboard_kpi: 'awaiting_delivery', counts_as_completed_revenue: true }),
  'awaiting_delivery',
  'tick Chờ VC thắng cờ công nợ',
);
assert.equal(sxColumnStageKpiKey({ dashboard_kpi: '', name: 'ĐANG SX THÙNG' }), 'producing');
assert.equal(sxColumnStageKpiKey({ dashboard_kpi: 'nope', name: 'ĐƠN HÀNG ĐÃ GIAO' }), 'shipped');

console.log('sx-column-stage-kpi.test.js OK');
