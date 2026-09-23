const assert = require('assert');
const {
  kpiBucketForStage,
  vcColumnDashboardKpiKey,
  isVcPipelineStageNoDeadline,
} = require('../src/helpers/vcOverviewKpis');

assert.equal(vcColumnDashboardKpiKey({ name: 'Đang vận chuyển' }), 'shipping');
assert.equal(vcColumnDashboardKpiKey({ name: 'Đang lắp đặt' }), 'installing');
assert.equal(vcColumnDashboardKpiKey({ bucket_slug: 'install_in_progress' }), 'installing');
assert.equal(vcColumnDashboardKpiKey({ name: 'Bảo hành' }), 'warranty');
assert.equal(vcColumnDashboardKpiKey({ name: 'Hoàn thành' }), 'completed');
assert.equal(vcColumnDashboardKpiKey({ bucket_slug: 'install_completed' }), 'completed');
assert.equal(vcColumnDashboardKpiKey({ bucket_slug: 'delivery_pending', name: 'Chờ VC' }), 'shipping');
assert.equal(
  vcColumnDashboardKpiKey({ dashboard_kpi: 'installing', name: 'Đang vận chuyển' }),
  'installing',
  'tick Đang LĐ thắng tên',
);
assert.equal(
  vcColumnDashboardKpiKey({ dashboard_kpi: 'shipping', bucket_slug: 'install_in_progress' }),
  'shipping',
  'tick Đang VC thắng cột LĐ',
);
assert.equal(
  vcColumnDashboardKpiKey({ dashboard_kpi: 'completed', name: 'Đang giao' }),
  'completed',
);
assert.equal(kpiBucketForStage({ dashboard_kpi: 'warranty', name: 'Đang giao' }), 'warranty');
assert.equal(isVcPipelineStageNoDeadline({ clears_deadline: true }), true);
assert.equal(isVcPipelineStageNoDeadline({ dashboard_kpi: 'completed' }), true);
assert.equal(isVcPipelineStageNoDeadline({ name: 'Hoàn thành' }), true);
assert.equal(isVcPipelineStageNoDeadline({ name: 'Đang lắp đặt' }), false);

console.log('vc-column-stage-kpi.test.js OK');
