const assert = require('assert');
const {
  classifyProjectForecast,
  isGcckProject,
  shouldSkipGcckInstallOverdue,
} = require('../src/helpers/projectForecast');

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

console.log('project-forecast-gcck: ok');
