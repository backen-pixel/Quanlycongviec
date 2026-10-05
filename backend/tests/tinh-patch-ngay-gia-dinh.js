const assert = require('assert');
const { tinhPatchNgayGiaDinh } = require('../src/helpers/placeProjectAtWorkshops');

const coNgay = tinhPatchNgayGiaDinh(
  { delivery_date: '2026-10-20' },
  { choPhepXoaNgay: false },
);
assert.equal(coNgay.delivery_date, '2026-10-20');
assert.equal(coNgay.production_deadline, '2026-10-20');

const chanXoa = tinhPatchNgayGiaDinh(
  { delivery_date: null },
  { choPhepXoaNgay: false },
);
assert.equal(Object.prototype.hasOwnProperty.call(chanXoa, 'delivery_date'), false);

const choXoa = tinhPatchNgayGiaDinh(
  { delivery_date: null },
  { choPhepXoaNgay: true },
);
assert.equal(Object.prototype.hasOwnProperty.call(choXoa, 'delivery_date'), true);
assert.equal(choXoa.delivery_date, null);

const chanXoaFinish = tinhPatchNgayGiaDinh(
  { production_finish_date: null },
  { choPhepXoaNgay: false },
);
assert.equal(Object.prototype.hasOwnProperty.call(chanXoaFinish, 'production_finish_date'), false);

const rong = tinhPatchNgayGiaDinh({}, { choPhepXoaNgay: false });
assert.equal(Object.keys(rong).length, 0);

const saiDinhDang = tinhPatchNgayGiaDinh(
  { delivery_date: '20/10/2026' },
  { choPhepXoaNgay: false },
);
assert.equal(Object.prototype.hasOwnProperty.call(saiDinhDang, 'delivery_date'), false);
assert.equal(saiDinhDang.delivery_date, undefined);

const chiHan = tinhPatchNgayGiaDinh({ production_deadline: '2026-10-02' });
assert.equal(chiHan.production_deadline, '2026-10-02');
assert.equal(Object.prototype.hasOwnProperty.call(chiHan, 'delivery_date'), false);

const hanVaHoanThien = tinhPatchNgayGiaDinh({
  production_deadline: '2026-10-02',
  production_finish_date: '2026-10-02',
});
assert.equal(hanVaHoanThien.production_deadline, '2026-10-02');
assert.equal(hanVaHoanThien.production_finish_date, '2026-10-02');

const chanXoaHan = tinhPatchNgayGiaDinh(
  { production_deadline: null },
  { choPhepXoaNgay: false },
);
assert.equal(Object.prototype.hasOwnProperty.call(chanXoaHan, 'production_deadline'), false);

const choXoaHan = tinhPatchNgayGiaDinh(
  { production_deadline: null },
  { choPhepXoaNgay: true },
);
assert.equal(Object.prototype.hasOwnProperty.call(choXoaHan, 'production_deadline'), true);
assert.equal(choXoaHan.production_deadline, null);

const giaoMacDinhHan = tinhPatchNgayGiaDinh({ delivery_date: '2026-10-06' });
assert.equal(giaoMacDinhHan.production_deadline, '2026-10-06');

const giaoVaHanRieng = tinhPatchNgayGiaDinh({ delivery_date: '2026-10-06', production_deadline: '2026-10-04' });
assert.equal(giaoVaHanRieng.delivery_date, '2026-10-06');
assert.equal(giaoVaHanRieng.production_deadline, '2026-10-04');

const giaoVaHanNull = tinhPatchNgayGiaDinh(
  { delivery_date: '2026-10-06', production_deadline: null },
  { choPhepXoaNgay: false },
);
assert.equal(giaoVaHanNull.production_deadline, '2026-10-06');

console.log('tinh-patch-ngay-gia-dinh: ok');
process.exit(0);
