const assert = require('assert');
const {
  isSxDeliveredStage,
  isSxPipelineStageNoDeadline,
  isSxProjectDateOverdue,
  isSxProjectDeliveryDateOverdue,
} = require('../src/helpers/crmPipelineSla');

const deliveredStages = [
  { name: 'ĐƠN HÀNG ĐÃ GIAO' },
  { name: 'ĐÃ GIAO - CHỜ CHỐT CN, XUẤT HD' },
  { name: 'Giao xong' },
  { bucket_slug: 'delivered' },
  { bucket_slug: 'delivery_done' },
];

for (const stage of deliveredStages) {
  assert.equal(isSxDeliveredStage(stage), true, `Không nhận diện cột đã giao: ${JSON.stringify(stage)}`);
  assert.equal(isSxPipelineStageNoDeadline(stage), true);
  assert.equal(isSxProjectDateOverdue({
    company_id: 'test',
    status: 'producing',
    delivery_date: '2020-01-01',
    sx_pipeline_stage: stage,
  }, 'delivery_date'), false);
  assert.equal(isSxProjectDeliveryDateOverdue({
    company_id: 'test',
    status: 'producing',
    delivery_date: '2020-01-01',
    sx_pipeline_stage: stage,
  }, stage), false);
}

for (const stage of [
  { name: 'Đang giao' },
  { name: 'Đóng gói chờ giao hàng' },
  { bucket_slug: 'delivery' },
]) {
  assert.equal(isSxDeliveredStage(stage), false, `Nhận diện nhầm cột chưa giao: ${JSON.stringify(stage)}`);
}

console.log('sx-delivered-overdue-guard: OK');
