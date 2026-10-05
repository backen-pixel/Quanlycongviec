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

console.log('tinh-patch-ngay-gia-dinh: ok');
