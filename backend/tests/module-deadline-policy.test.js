const assert = require('assert');
const {
  MODULE,
  deadlineTsFromRaw,
  deadlineState,
  projectDeadlinePatchOnModuleDone,
  resolveModuleDeadline,
} = require('../src/helpers/moduleDeadlinePolicy');
const {
  crmTaskMatchesModule,
  workshopTaskMatchesModule,
} = require('../src/helpers/completeOpenWorkOnModuleDone');

const future = (days) => new Date(Date.now() + days * 86400000).toISOString();
const past = (days) => new Date(Date.now() - days * 86400000).toISOString();

// CRM: task hiện hành -> hạn thẻ -> SLA -> ngày chốt.
const crmBase = {
  phone: '0900000000',
  stage_entered_at: past(1),
  crm_next_open_task_deadline: future(1),
  kanban_deadline_at: future(2),
  expected_close_date: future(10),
};
assert.equal(resolveModuleDeadline(MODULE.CRM, crmBase, {
  stage: { sla_days: 7 },
}).source, 'task');
assert.equal(resolveModuleDeadline(MODULE.CRM, {
  ...crmBase,
  crm_next_open_task_deadline: null,
}, { stage: { sla_days: 7 } }).source, 'kanban');
assert.equal(resolveModuleDeadline(MODULE.CRM, {
  ...crmBase,
  crm_next_open_task_deadline: null,
  kanban_deadline_at: null,
}, { stage: { sla_days: 7 } }).source, 'sla');
assert.equal(resolveModuleDeadline(MODULE.CRM, {
  ...crmBase,
  crm_next_open_task_deadline: null,
  kanban_deadline_at: null,
  stage_entered_at: null,
}, { stage: { sla_days: 7 } }).source, 'expected_close');

for (const hidden of [
  { phone: null },
  { phone: '1', deadline_disabled_at: future(0) },
  { phone: '1', is_interacted: true },
]) {
  assert.equal(resolveModuleDeadline(MODULE.CRM, {
    ...crmBase,
    ...hidden,
    customer: null,
  }, { stage: { sla_days: 7 } }).deadlineAt, null);
}
assert.equal(resolveModuleDeadline(MODULE.CRM, crmBase, {
  stage: { is_won: true, sla_days: 7 },
}).deadlineAt, null);

// SX: hạn thẻ -> hoàn thiện -> hạn SX -> giao -> hạn chung.
const sx = {
  status: 'producing',
  sx_kanban_deadline_at: future(1),
  production_finish_date: future(2),
  production_deadline: future(3),
  delivery_date: future(4),
  deadline: future(5),
};
assert.equal(resolveModuleDeadline(MODULE.PRODUCTION, sx).source, 'sx_kanban');
assert.equal(resolveModuleDeadline(MODULE.PRODUCTION, {
  ...sx,
  sx_kanban_deadline_at: null,
}).source, 'production_finish');
assert.equal(resolveModuleDeadline(MODULE.PRODUCTION, sx, {
  stage: { sla_days: 0 },
}).deadlineAt, null);
assert.equal(resolveModuleDeadline(MODULE.PRODUCTION, {
  ...sx,
  logistics_company_id: 'linked',
}).deadlineAt, null);

// VC/LĐ: lắp -> giao -> hạn chung; hoàn thành thì tắt.
const vc = { status: 'shipping', install_date: future(1), delivery_date: future(2), deadline: future(3) };
assert.equal(resolveModuleDeadline(MODULE.LOGISTICS, vc).source, 'install');
assert.equal(resolveModuleDeadline(MODULE.LOGISTICS, { ...vc, install_date: null }).source, 'delivery');
assert.equal(resolveModuleDeadline(MODULE.LOGISTICS, { ...vc, status: 'completed' }).deadlineAt, null);

// DATE-only dùng giờ kết thúc công ty 17:30 VN.
assert.equal(
  new Date(deadlineTsFromRaw('2030-01-02', { company_id: 'test' })).toISOString(),
  '2030-01-02T10:30:00.000Z',
);
assert.equal(deadlineState(Date.now() - 1).level, 'overdue');
assert.equal(deadlineState(Date.now() + 3600000).level, 'soon');

const sxDonePatch = projectDeadlinePatchOnModuleDone('production', future(0));
assert.equal(sxDonePatch.sx_kanban_deadline_at, null);
assert.equal(sxDonePatch.production_deadline, null);
assert.equal('delivery_date' in sxDonePatch, false);
assert.equal('install_date' in sxDonePatch, false);
assert.equal('kanban_deadline_at' in sxDonePatch, false);
const finalPatch = projectDeadlinePatchOnModuleDone('project_final', future(0));
assert.equal(finalPatch.deadline, null);
assert.equal(finalPatch.production_deadline, null);
assert.equal('delivery_date' in finalPatch, false);
assert.equal('install_date' in finalPatch, false);

// Phân vùng task khi hoàn thành module.
assert.equal(crmTaskMatchesModule({ stage_slug: 'sx_cat_go' }, 'production'), true);
assert.equal(crmTaskMatchesModule({ stage_slug: 'vc_lay_hang' }, 'production'), false);
assert.equal(crmTaskMatchesModule({ stage_slug: 'crm_tu_van' }, 'crm'), true);
assert.equal(workshopTaskMatchesModule({
  title: 'Lắp đặt tại công trình',
  metadata: { workshop_area: 'logistics' },
}, 'logistics'), true);
assert.equal(workshopTaskMatchesModule({
  title: 'Cắt ván sản xuất',
  metadata: { workshop_area: 'production' },
}, 'production'), true);

// Luồng liên module: sửa CRM không ghi đè SX/VC.
const linked = {
  crm: { ...crmBase },
  project: { ...sx, install_date: future(6) },
};
const sxBefore = resolveModuleDeadline(MODULE.PRODUCTION, linked.project).deadlineAt;
const vcBefore = resolveModuleDeadline(MODULE.LOGISTICS, linked.project).deadlineAt;
const crmChanged = resolveModuleDeadline(MODULE.CRM, {
  ...linked.crm,
  crm_next_open_task_deadline: future(8),
  kanban_deadline_at: future(8),
}, { stage: { sla_days: 7 } });
assert.equal(crmChanged.source, 'task');
assert.equal(resolveModuleDeadline(MODULE.PRODUCTION, linked.project).deadlineAt, sxBefore);
assert.equal(resolveModuleDeadline(MODULE.LOGISTICS, linked.project).deadlineAt, vcBefore);

// Hoàn thành SX chỉ xóa trường SX; ngày giao/lắp và CRM còn nguyên.
const afterSxDone = { ...linked.project, ...projectDeadlinePatchOnModuleDone('production', future(0)) };
assert.equal(afterSxDone.sx_kanban_deadline_at, null);
assert.equal(afterSxDone.production_deadline, null);
assert.equal(afterSxDone.delivery_date, linked.project.delivery_date);
assert.equal(afterSxDone.install_date, linked.project.install_date);
assert.equal(linked.crm.kanban_deadline_at, crmBase.kanban_deadline_at);

// Hoàn tất lắp đặt: trạng thái cuối làm cả ba resolver ngừng phát deadline.
const finalProject = {
  ...afterSxDone,
  ...projectDeadlinePatchOnModuleDone('project_final', future(0)),
  status: 'completed',
};
const finalCrm = { ...linked.crm, deadline_disabled_at: future(0) };
assert.equal(resolveModuleDeadline(MODULE.CRM, finalCrm, { stage: { sla_days: 7 } }).deadlineAt, null);
assert.equal(resolveModuleDeadline(MODULE.PRODUCTION, finalProject).deadlineAt, null);
assert.equal(resolveModuleDeadline(MODULE.LOGISTICS, finalProject).deadlineAt, null);
assert.equal(finalProject.delivery_date, linked.project.delivery_date);
assert.equal(finalProject.install_date, linked.project.install_date);

console.log('module-deadline-policy: OK');
