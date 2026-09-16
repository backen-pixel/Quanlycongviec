const assert = require('assert');
const {
  classifyProjectForecast,
  isGcckProject,
  shouldSkipGcckInstallOverdue,
  isHcbCanhKinhProject,
  isSxHoanThanhColumn,
} = require('../src/helpers/projectForecast');
const { HUCABI_COMPANY_ID } = require('../src/helpers/companyDeadlineClock');

const past = new Date();
past.setDate(past.getDate() - 39);

assert.equal(isGcckProject({ name: 'GCCK-ANH TỈNH-0966744954' }), true);
assert.equal(isGcckProject({ workshop_type: { name: 'Cánh kính' }, name: 'Khác' }), true);
assert.equal(isGcckProject({ name: 'TỦ BẾP - SALAH' }), false);

const gcckDone = {
  project: { name: 'GCCK-ANH TỈNH', workshop_type: { name: 'Cánh kính' } },
  sxStage: { name: 'Hoàn thành' },
};
assert.equal(shouldSkipGcckInstallOverdue(gcckDone.project, gcckDone.sxStage), true);
assert.equal(shouldSkipGcckInstallOverdue(gcckDone.project, { name: 'Hoàn thiện' }), true);
assert.equal(classifyProjectForecast(past.toISOString(), gcckDone).forecast, 'on_track');
assert.equal(classifyProjectForecast(past.toISOString(), gcckDone).delay_days, 0);

assert.equal(
  classifyProjectForecast(past.toISOString(), {
    project: { name: 'GCCK-ANH TỈNH' },
    sxStage: { name: 'sản xuất' },
  }).forecast,
  'late',
);

assert.equal(
  classifyProjectForecast(past.toISOString(), {
    project: { workshop_type: { name: 'Tủ bếp' }, name: 'TỦ BẾP - A' },
    sxStage: { name: 'Hoàn thành' },
  }).forecast,
  'late',
);

assert.equal(isHcbCanhKinhProject({
  name: 'GCCK-ANH TỈNH',
  company_id: HUCABI_COMPANY_ID,
  workshop_type: { name: 'Cánh kính' },
}), true);
assert.equal(isHcbCanhKinhProject({
  name: 'GCCK-ANH TỈNH',
  company_id: 'other-company',
  workshop_type: { name: 'Cánh kính' },
}), false);
assert.equal(isHcbCanhKinhProject({
  name: 'TỦ BẾP - A',
  company_id: HUCABI_COMPANY_ID,
  workshop_type: { name: 'Tủ bếp' },
}), false);

assert.equal(isSxHoanThanhColumn({ name: 'Hoàn thành', counts_as_collected_revenue: true }), true);
assert.equal(isSxHoanThanhColumn({ name: 'Đợi thanh toán', counts_as_completed_revenue: true }), false);
assert.equal(isSxHoanThanhColumn({ name: 'Chờ giao hàng', group_key: 'hoan_thien' }), false);

console.log('project-forecast-gcck: ok');
