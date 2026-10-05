const assert = require('assert');
const { cotThieuTuLoi } = require('../src/helpers/projectDeliveryDates');

assert.equal(
  cotThieuTuLoi('column projects.install_occurrence_dates does not exist'),
  'install_occurrence_dates',
);
assert.equal(
  cotThieuTuLoi('column projects.vc_notes does not exist'),
  'vc_notes',
);
assert.equal(
  cotThieuTuLoi("Could not find the 'logistics_cost' column of 'projects' in the schema cache"),
  'logistics_cost',
);
assert.equal(
  cotThieuTuLoi('column projects.delivery_date does not exist'),
  'delivery_date',
);
assert.equal(
  cotThieuTuLoi('duplicate key value violates unique constraint "x"'),
  null,
);
assert.equal(
  cotThieuTuLoi('column projects.khong_co_trong_danh_sach does not exist'),
  null,
);
assert.equal(
  cotThieuTuLoi('column projects.production_deadline does not exist'),
  null,
);
assert.equal(
  cotThieuTuLoi('column projects.vc_notes does not exist'),
  'vc_notes',
);
assert.equal(
  cotThieuTuLoi('column projects.notes does not exist'),
  'notes',
);

/** Cùng điều kiện nhánh PUT /projects/:id: không nhận ra cột thì ném lỗi, không ghi lại. */
function seNemLoi(message, update) {
  const text = String(message || '');
  if (!text.includes('column')) return true;
  const cot = cotThieuTuLoi(text);
  return !cot || !Object.prototype.hasOwnProperty.call(update || {}, cot);
}

assert.equal(
  seNemLoi('column projects.khong_co_trong_danh_sach does not exist', { delivery_date: '2026-10-06' }),
  true,
);
assert.equal(
  seNemLoi('duplicate key value violates unique constraint "x"', { delivery_date: '2026-10-06' }),
  true,
);
assert.equal(
  seNemLoi("Could not find the 'logistics_cost' column of 'projects' in the schema cache", { logistics_cost: 1 }),
  false,
);

console.log('cot-thieu-tu-loi: ok');
process.exit(0);
