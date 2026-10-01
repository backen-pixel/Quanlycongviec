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

function scheduleEditTouchesKanbanDeadline(body) {
  if (!body) return false;
  return body.install_date !== undefined
    || body.delivery_date !== undefined
    || body.install_occurrence_dates !== undefined
    || body.installOccurrenceDates !== undefined
    || body.sx_reception_date !== undefined
    || body.production_finish_date !== undefined;
}

/**
 * Mốc để tính hạn thẻ phải là ngày vừa sửa.
 * Ngày lắp VC / ngày lắp SX đè lịch nhiều buổi đang lưu.
 * Chỉ sửa ngày hoàn thiện thì giữ mốc lắp (hạn nhóm hoàn thiện xử lý riêng).
 */
function anchorProjectForDateEdit(savedRow, body) {
  const row = { ...(savedRow || {}) };
  if (!body) return row;
  if (body.install_date !== undefined) {
    row.install_occurrence_dates = [];
    return row;
  }
  if (body.delivery_date !== undefined) {
    row.install_occurrence_dates = [];
    row.install_date = null;
    return row;
  }
  return row;
}

function isoDeadlineFromYmd(ymd, companyId) {
  const day = String(ymd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const iso = companyDeadlineIsoFromYmd(day, companyId);
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function onlyFinishDateEdit(body) {
  return !!(body
    && body.production_finish_date !== undefined
    && body.install_date === undefined
    && body.delivery_date === undefined
    && body.install_occurrence_dates === undefined
    && body.installOccurrenceDates === undefined);
}

/**
 * Hạn thẻ sau khi sửa ngày trong chi tiết.
 * Cột tắt hạn → xóa hạn thẻ.
 * Sửa ngày lắp → tính lại theo nhóm cột từ đúng ngày đó.
 * Sửa riêng ngày hoàn thiện → hạn thẻ = ngày hoàn thiện khi cột thuộc hoàn thiện hoặc chưa gán nhóm.
 * Cột không có nhóm → hạn thẻ = ngày hoàn thiện, không giữ hạn cũ.
 */
function deadlinePatchAfterScheduleEdit(projectRow, stage, siblingStages, body) {
  if (stage && (stage.clears_deadline || stage.is_handover_to_logistics)) {
    return { sx_kanban_deadline_at: null, sx_kanban_deadline_reason: null };
  }
  const group = sxStageDeadlineGroup(stage, siblingStages);
  if (onlyFinishDateEdit(body) && (!group || group === 'finishing')) {
    const iso = isoDeadlineFromYmd(projectRow?.production_finish_date, projectRow?.company_id);
    if (!iso) return { sx_kanban_deadline_at: null, sx_kanban_deadline_reason: null };
    return { sx_kanban_deadline_at: iso, sx_kanban_deadline_reason: AUTO_REASON };
  }
  const anchored = anchorProjectForDateEdit(projectRow, body);
  const computed = computeSxInstallPlanDeadline(anchored, stage, siblingStages);
  if (computed?.iso) {
    return {
      sx_kanban_deadline_at: new Date(computed.iso).toISOString(),
      sx_kanban_deadline_reason: computed.reason,
    };
  }
  // Nhóm đã gán nhưng không còn ngày kết thúc (vd. kế hoạch đã lố) → bỏ hạn cũ.
  if (group) return { sx_kanban_deadline_at: null, sx_kanban_deadline_reason: null };
  const finishIso = isoDeadlineFromYmd(anchored.production_finish_date, projectRow?.company_id)
    || isoDeadlineFromYmd(anchored.delivery_date, projectRow?.company_id);
  if (finishIso) {
    return { sx_kanban_deadline_at: finishIso, sx_kanban_deadline_reason: AUTO_REASON };
  }
  return { sx_kanban_deadline_at: null, sx_kanban_deadline_reason: null };
}

module.exports = {
  AUTO_REASON,
  isAutoInstallPlanDeadlineReason,
  computeSxInstallPlanDeadline,
  applyComputedDeadlineToProjectUpd,
  scheduleEditTouchesKanbanDeadline,
  deadlinePatchAfterScheduleEdit,
};
