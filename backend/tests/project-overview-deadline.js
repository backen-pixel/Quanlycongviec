const assert = require('assert');
const {
  moduleKeyForOwnerLane,
  earliestOpenChildDeadline,
  resolveOverviewGroupDeadline,
  collectOpenChildDeadlineStamps,
  bucketStampRows,
} = require('../src/helpers/projectOverviewDeadline');

assert.equal(moduleKeyForOwnerLane('sales'), 'crm');
assert.equal(moduleKeyForOwnerLane('logistics'), 'logistics');
assert.equal(moduleKeyForOwnerLane('production'), 'production');
assert.equal(moduleKeyForOwnerLane('other'), 'production');

assert.equal(earliestOpenChildDeadline([]), null);
assert.equal(earliestOpenChildDeadline([{ deadline: '2026-09-20' }, { deadline: '2026-09-10' }]), '2026-09-10');

const sxDeadline = resolveOverviewGroupDeadline({
  lane: 'production',
  project: {
    status: 'producing',
    production_deadline: '2026-09-16',
    delivery_date: '2026-09-18',
  },
  openChildren: [{ deadline: null }],
});
assert.ok(sxDeadline);
assert.equal(String(sxDeadline).slice(0, 10), '2026-09-16');

const sxWhenVcLinked = resolveOverviewGroupDeadline({
  lane: 'production',
  project: {
    status: 'producing',
    production_deadline: '2026-09-16',
    vc_kanban_column_id: 'vc-col',
    logistics_company_id: 'vc-co',
  },
  openChildren: [],
});
assert.equal(sxWhenVcLinked, null);

const vcAfterSxGiao = resolveOverviewGroupDeadline({
  lane: 'logistics',
  project: {
    status: 'shipping',
    logistics_company_id: 'vc-co',
    install_date: '2026-09-18T07:00:00.000Z',
  },
  openChildren: [],
});
assert.ok(vcAfterSxGiao);
assert.equal(String(vcAfterSxGiao).slice(0, 10), '2026-09-18');

const sxDoneColumn = resolveOverviewGroupDeadline({
  lane: 'production',
  project: { status: 'producing', production_deadline: '2026-09-16' },
  sxStage: { counts_as_collected_revenue: true, name: 'HOÀN THÀNH' },
  openChildren: [{ deadline: '2026-09-20T10:00:00.000Z' }],
});
assert.equal(sxDoneColumn, '2026-09-20T10:00:00.000Z');

const vcDeadline = resolveOverviewGroupDeadline({
  lane: 'logistics',
  project: {
    status: 'shipping',
    logistics_company_id: 'vc-co',
    install_date: '2026-09-18T07:00:00.000Z',
    delivery_date: '2026-09-18',
  },
  openChildren: [],
});
assert.ok(vcDeadline);
assert.equal(String(vcDeadline).slice(0, 10), '2026-09-18');

const crmDeadline = resolveOverviewGroupDeadline({
  lane: 'sales',
  lead: {
    phone: '0900000000',
    kanban_deadline_at: '2026-09-22T17:00:00.000Z',
    stage: { sla_days: 7 },
  },
  openChildren: [],
});
assert.equal(crmDeadline, '2026-09-22T17:00:00.000Z');

const emptyFallback = resolveOverviewGroupDeadline({
  lane: 'production',
  project: { status: 'producing' },
  openChildren: [],
});
assert.equal(emptyFallback, null);

const stamps = collectOpenChildDeadlineStamps('2026-09-16T10:30:00.000Z', [
  { source: 'task', source_id: 'a', deadline: null },
  { source: 'task', source_id: 'b', deadline: '2026-09-10T00:00:00.000Z' },
  { source: 'crm_task', source_id: 'c', deadline: null },
  { source: 'other', source_id: 'd', deadline: null },
]);
assert.equal(stamps.length, 2);
assert.equal(stamps[0].source, 'task');
assert.equal(stamps[0].id, 'a');
assert.equal(stamps[1].source, 'crm_task');
assert.equal(bucketStampRows(stamps).length, 2);

console.log('project-overview-deadline: OK');
