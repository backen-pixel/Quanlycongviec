const assert = require('assert');
const { installAnchorPatchFromBody, installAnchorPersistPatch } = require('../src/helpers/projectDeliveryDates');
const { resolveSxPlanInstallYmd } = require('../src/helpers/sxWorkshopSchedule');
const { computeSxInstallPlanDeadline } = require('../src/helpers/sxInstallPlanKanbanDeadline');

const HCB = '18c2563f-3495-498d-8199-23200c9f420e';

function rowAfterEdit(saved, body) {
  const update = { ...saved };
  for (const key of ['install_date', 'delivery_date', 'production_finish_date', 'production_deadline']) {
    if (body[key] !== undefined) update[key] = body[key];
  }
  return { ...update, ...installAnchorPatchFromBody(body) };
}

function finishingYmd(row) {
  const computed = computeSxInstallPlanDeadline(row, { deadline_group: 'finishing' });
  return computed?.endYmd || null;
}

const saved = {
  company_id: HCB,
  sx_reception_date: '2026-08-01',
  install_occurrence_dates: ['2026-09-08', '2026-09-09'],
  install_date: '2026-09-08T14:00:00+07:00',
  delivery_date: '2026-09-08',
};

assert.equal(resolveSxPlanInstallYmd(saved), '2026-09-08');
assert.equal(finishingYmd(saved), '2026-09-06');

const crmBody = {
  install_date: '2026-10-10T09:30:00+07:00',
  delivery_date: '2026-10-10',
  install_occurrence_dates: ['2026-10-10', '2026-10-11'],
  production_finish_date: '2026-10-08',
  production_deadline: '2026-10-08',
};
const afterCrm = rowAfterEdit(saved, crmBody);
assert.deepEqual(afterCrm.install_occurrence_dates, ['2026-10-10', '2026-10-11']);
assert.equal(resolveSxPlanInstallYmd(afterCrm), '2026-10-10');
assert.equal(finishingYmd(afterCrm), '2026-10-08');

const sxBody = { delivery_date: '2026-10-20', production_finish_date: '2026-10-18', production_deadline: '2026-10-18' };
const sxPersist = installAnchorPersistPatch(sxBody);
assert.deepEqual(sxPersist.install_occurrence_dates, ['2026-10-20']);
assert.equal(String(sxPersist.install_date).slice(0, 10), '2026-10-20');
assert.deepEqual(installAnchorPersistPatch(crmBody).install_occurrence_dates, ['2026-10-10', '2026-10-11']);
const afterSx = rowAfterEdit(saved, sxBody);
assert.deepEqual(afterSx.install_occurrence_dates, ['2026-10-20']);
assert.equal(String(afterSx.install_date).slice(0, 10), '2026-10-20');
assert.equal(resolveSxPlanInstallYmd(afterSx), '2026-10-20');
assert.equal(finishingYmd(afterSx), '2026-10-18');

const bothDatesOnly = { install_date: '2026-11-02T14:00:00+07:00', delivery_date: '2026-11-02' };
const afterBoth = rowAfterEdit(saved, bothDatesOnly);
assert.deepEqual(afterBoth.install_occurrence_dates, ['2026-11-02']);
assert.equal(resolveSxPlanInstallYmd(afterBoth), '2026-11-02');
assert.equal(finishingYmd(afterBoth), '2026-10-31');

const persistClearedEmpty = installAnchorPersistPatch({ delivery_date: '' });
assert.deepEqual(persistClearedEmpty.install_occurrence_dates, []);
const persistClearedNull = installAnchorPersistPatch({ delivery_date: null });
assert.deepEqual(persistClearedNull.install_occurrence_dates, []);

const cleared = rowAfterEdit(saved, { delivery_date: null });
assert.deepEqual(cleared.install_occurrence_dates, []);
assert.equal(cleared.install_date, null);
assert.equal(resolveSxPlanInstallYmd(cleared), '');

console.log('sx-install-anchor-deadline: ok');
process.exit(0);
