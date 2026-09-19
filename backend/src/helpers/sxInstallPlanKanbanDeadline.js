/**
 * Ghi hạn Kanban SX từ kế hoạch lắp (không chỉ hiện panel).
 * Nhóm cột: planning / cabinet / finishing / packing.
 */

const { companyDeadlineIsoFromYmd } = require('./companyDeadlineClock');
const {
  ymdFromUnknownDate,
  resolveSxPlanInstallYmd,
  buildSxInstallBackPlan,
  endYmdForDeadlineGroup,
  sxStageDeadlineGroup,
} = require('./sxWorkshopSchedule');

const AUTO_REASON = 'Tính từ ngày lắp (kế hoạch SX)';

function isAutoInstallPlanDeadlineReason(reason) {
  const s = String(reason || '').trim();
  return !s || s === AUTO_REASON;
}

function computeSxInstallPlanDeadline(project, stage, siblingStages = null) {
  const group = sxStageDeadlineGroup(stage, siblingStages);
  if (!group) return null;
  const installYmd = resolveSxPlanInstallYmd(project);
  if (!installYmd) return null;
  const startYmd = ymdFromUnknownDate(project?.sx_reception_date)
    || ymdFromUnknownDate(project?.created_at);
  const plan = buildSxInstallBackPlan(installYmd, {
    startYmd,
    slipDays: project?.sx_schedule_slip_days,
  });
  const endYmd = endYmdForDeadlineGroup(plan, group);
  if (!endYmd) return null;
  const iso = companyDeadlineIsoFromYmd(endYmd, project?.company_id);
  if (!iso) return null;
  return {
    iso,
    endYmd,
    group,
    reason: AUTO_REASON,
    productionFinishYmd: plan.productionFinishYmd || null,
  };
}

function applyComputedDeadlineToProjectUpd(projectUpd, computed, { isCompletedCol, hasDeadlineInput }) {
  if (!projectUpd || isCompletedCol || hasDeadlineInput || !computed?.iso) return projectUpd;
  projectUpd.sx_kanban_deadline_at = new Date(computed.iso).toISOString();
  projectUpd.sx_kanban_deadline_reason = computed.reason;
  return projectUpd;
}

module.exports = {
  AUTO_REASON,
  isAutoInstallPlanDeadlineReason,
  computeSxInstallPlanDeadline,
  applyComputedDeadlineToProjectUpd,
};
