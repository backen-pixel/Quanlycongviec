const assert = require('assert');
const {
  moduleKeyForOwnerLane,
  earliestOpenChildDeadline,
  resolveOverviewGroupDeadline,
  collectOpenChildDeadlineStamps,
  bucketStampRows,
  indexSxCrmCompletion,
  workshopChildDone,
  deadlineGroupForWorkshopChild,
  sxInstallPlanDeadlineIso,
  earliestSxPlanDeadline,
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
assert.equal(sxDeadline, null);

const sxWorkshopDueIgnored = resolveOverviewGroupDeadline({
  lane: 'production',
  project: {
    status: 'producing',
    production_deadline: '2026-09-16',
    delivery_date: '2026-09-18',
  },
  openChildren: [{ source: 'task', deadline: '2026-09-12T10:30:00.000Z' }],
});
assert.equal(sxWorkshopDueIgnored, null);

const sxFromCrmTask = resolveOverviewGroupDeadline({
  lane: 'production',
  project: {
    status: 'producing',
    production_deadline: '2026-09-16',
    delivery_date: '2026-09-18',
  },
  openChildren: [
    { source: 'task', deadline: '2026-09-01T10:30:00.000Z' },
    { source: 'crm_task', deadline: '2026-09-12T10:30:00.000Z' },
    { source: 'crm_assignment', deadline: '2026-09-20T10:30:00.000Z' },
  ],
});
assert.equal(sxFromCrmTask, '2026-09-12T10:30:00.000Z');

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

const planProject = {
  company_id: '18c2563f-3495-498d-8199-23200c9f420e',
  install_date: '2026-10-03T07:00:00.000Z',
  sx_reception_date: '2026-09-11',
  sx_schedule_slip_days: 0,
};
assert.equal(sxInstallPlanDeadlineIso(planProject, 'planning'), '2026-09-27T17:30:00.000+07:00');
assert.equal(sxInstallPlanDeadlineIso(planProject, 'cabinet'), '2026-09-29T17:30:00.000+07:00');
assert.equal(
  earliestSxPlanDeadline(planProject, ['cabinet', 'planning']),
  '2026-09-27T17:30:00.000+07:00',
);
assert.equal(sxInstallPlanDeadlineIso(planProject, ''), null);

const { computeSxInstallPlanDeadline } = require('../src/helpers/sxInstallPlanKanbanDeadline');
const { companyWorkEndMsFromRaw } = require('../src/helpers/companyDeadlineClock');
const movedInstall = {
  company_id: '18c2563f-3495-498d-8199-23200c9f420e',
  install_date: '2026-10-10T14:00:00+07:00',
};
const cabinetCard = computeSxInstallPlanDeadline(movedInstall, {
  deadline_group: 'cabinet',
  group_key: 'gia_cong',
});
assert.equal(cabinetCard.endYmd, '2026-10-06');
assert.equal(cabinetCard.iso, '2026-10-06T17:30:00.000+07:00');
const morning = new Date('2026-10-06T09:10:00+07:00').getTime();
const afterWork = new Date('2026-10-06T17:31:00+07:00').getTime();
const dueMs = companyWorkEndMsFromRaw('2026-10-06T00:00:00.000Z', movedInstall.company_id);
assert.ok(dueMs > morning);
assert.ok(dueMs < afterWork);

const leadProject = new Map([['lead-1', 'proj-1']]);
const crmIndex = indexSxCrmCompletion([
  { lead_id: 'lead-1', title: 'Sơn', status: 'completed', stage_slug: 'sx_gia_cong', production_pipeline_stage_id: 'stage-cabinet' },
  { lead_id: 'lead-1', title: 'Vẽ và lên kế hoạch sản xuất', status: 'pending', stage_slug: 'sx_tiep_nhan', production_pipeline_stage_id: 'stage-plan' },
  { lead_id: 'lead-1', title: 'Ngoài xưởng', status: 'completed', stage_slug: 'deal_new' },
], leadProject);
assert.equal(workshopChildDone({ project_id: 'proj-1', title: 'Sơn', status: 'todo' }, crmIndex), true);
assert.equal(workshopChildDone({ project_id: 'proj-1', title: 'Vẽ và lên kế hoạch sản xuất', status: 'todo' }, crmIndex), false);
assert.equal(workshopChildDone({ project_id: 'proj-1', title: 'Ngoài xưởng', status: 'todo' }, crmIndex), false);
const stages = new Map([
  ['stage-plan', { id: 'stage-plan', group_key: 'tiep_nhan', deadline_group: null }],
  ['stage-cabinet', { id: 'stage-cabinet', group_key: 'gia_cong', deadline_group: 'cabinet' }],
]);
assert.equal(
  deadlineGroupForWorkshopChild({ project_id: 'proj-1', title: 'Vẽ và lên kế hoạch sản xuất' }, crmIndex, stages),
  'planning',
);
assert.equal(
  deadlineGroupForWorkshopChild({ project_id: 'proj-1', title: 'Sơn' }, crmIndex, stages),
  'cabinet',
);

console.log('project-overview-deadline: OK');
