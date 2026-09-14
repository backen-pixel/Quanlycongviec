const assert = require('assert');
const { buildSxInstallBackPlan, endYmdForDeadlineGroup, resolveSxPlanInstallYmd } = require('../src/helpers/sxWorkshopSchedule');
const { computeSxInstallPlanDeadline } = require('../src/helpers/sxInstallPlanKanbanDeadline');

assert.equal(resolveSxPlanInstallYmd({ install_date: '2026-09-20', delivery_date: '2026-09-18' }), '2026-09-20');
assert.equal(resolveSxPlanInstallYmd({ delivery_date: '2026-09-18' }), '2026-09-18');
assert.equal(
  resolveSxPlanInstallYmd({ install_occurrence_dates: ['2026-09-22', '2026-09-23'], install_date: '2026-09-20' }),
  '2026-09-22',
);

const plan = buildSxInstallBackPlan('2026-09-20', { startYmd: '2026-09-01' });
assert.equal(plan.packing.endYmd, '2026-09-19');
assert.equal(plan.finishing.endYmd, '2026-09-18');
assert.equal(plan.cabinet.endYmd, '2026-09-16');
assert.equal(plan.planning.endYmd, '2026-09-14');
assert.equal(endYmdForDeadlineGroup(plan, 'cabinet'), '2026-09-16');

const computed = computeSxInstallPlanDeadline(
  {
    company_id: '18c2563f-3495-498d-8199-23200c9f420e',
    install_date: '2026-09-20',
    sx_reception_date: '2026-09-01',
  },
  { deadline_group: 'finishing' },
);
assert.ok(computed.iso.includes('2026-09-18T17:30:00'));
assert.equal(computed.reason, 'Tính từ ngày lắp (kế hoạch SX)');

console.log('sx-install-back-plan: ok');
