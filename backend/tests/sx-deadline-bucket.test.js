const assert = require('assert');
const { resolveSxDeadlineBucketKey } = require('../src/helpers/sxKanbanSummary');

const today = '2026-09-22';

assert.equal(
  resolveSxDeadlineBucketKey(
    { delivery_date: '2026-09-17', status: 'producing' },
    { name: 'ĐƠN HÀNG ĐÃ GIAO' },
    today,
  ),
  null,
  'Cột Đã giao không đếm delivery_date lịch sử là quá hạn',
);

assert.equal(
  resolveSxDeadlineBucketKey(
    {
      production_finish_date: '2026-09-18',
      delivery_date: '2026-09-20',
      status: 'producing',
    },
    { name: 'KT KCS SẢN PHẨM, TÍNH CN', is_handover_to_logistics: true },
    today,
  ),
  'overdue',
  'Chờ bàn giao chưa giao thật vẫn hiện Quá hạn',
);

assert.equal(
  resolveSxDeadlineBucketKey(
    { delivery_date: '2026-09-17', status: 'producing', logistics_company_id: 'vc1' },
    { name: 'Sản xuất' },
    today,
  ),
  null,
  'Đã sang VC thì hết hạn SX',
);

assert.equal(
  resolveSxDeadlineBucketKey(
    { delivery_date: '2026-09-17', status: 'completed' },
    { name: 'Sản xuất' },
    today,
  ),
  null,
  'status completed hết hạn SX',
);

assert.equal(
  resolveSxDeadlineBucketKey(
    { production_finish_date: '2026-09-18', status: 'producing' },
    { name: 'Tiếp nhận đơn hàng về SX', clears_deadline: true },
    today,
  ),
  null,
  'Cột Tắt hạn không đếm quá hạn',
);

assert.equal(
  resolveSxDeadlineBucketKey(
    { production_finish_date: '2026-09-18', status: 'producing' },
    { name: 'Sản xuất' },
    today,
  ),
  'overdue',
);

console.log('sx-deadline-bucket: OK');
