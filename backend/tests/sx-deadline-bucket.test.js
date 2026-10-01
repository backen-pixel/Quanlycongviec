const assert = require('assert');
const { resolveSxDeadlineBucketKey } = require('../src/helpers/sxKanbanSummary');

const today = '2026-09-22';

assert.equal(
  resolveSxDeadlineBucketKey(
    { delivery_date: '2026-09-17', status: 'producing' },
    { name: 'ĐƠN HÀNG ĐÃ GIAO' },
    today,
  ),
  'none',
  'Chưa đặt deadline trên thẻ thì không vào Quá hạn',
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
  'none',
  'Chỉ có hạn hoàn thiện, chưa đặt deadline thẻ',
);

assert.equal(
  resolveSxDeadlineBucketKey(
    { sx_kanban_deadline_at: '2026-09-17T10:30:00Z', status: 'producing' },
    { name: 'Sản xuất' },
    today,
  ),
  'overdue',
  'Thẻ đã đặt deadline quá ngày thì vào Quá hạn',
);

assert.equal(
  resolveSxDeadlineBucketKey(
    { sx_kanban_deadline_at: '2026-09-18T10:30:00Z', production_finish_date: '2026-10-01', status: 'producing' },
    { name: 'Tiếp nhận đơn hàng về SX', clears_deadline: true },
    today,
  ),
  'none',
  'Cột Tắt hạn không đếm quá hạn',
);

assert.equal(
  resolveSxDeadlineBucketKey(
    { production_finish_date: '2026-09-18', status: 'producing' },
    { name: 'Sản xuất' },
    today,
  ),
  'none',
  'Ngày hoàn thiện không thay deadline thẻ',
);

console.log('sx-deadline-bucket: OK');
