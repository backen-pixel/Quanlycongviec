/** SLA cột pipeline CRM — dùng chung crm.js, kpi.js, kpiCalculator */

const DEFAULT_PIPELINE_STAGE_SLA_DAYS = 7;

function isPipelineStageSlaDisabled(slaDaysRaw) {
  return slaDaysRaw === 0 || slaDaysRaw === '0';
}

/** Lưu DB: null = mặc định 7 trên UI; 0 = tắt SLA; ≥1 = số ngày. */
function normalizePipelineStageSlaDaysForDb(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n === 0) return 0;
  if (n >= 1) return Math.round(n);
  return null;
}

/** null nếu tắt (0); ngược lại số ngày áp dụng (mặc định 7 khi DB null). */
function effectivePipelineStageSlaDays(slaDaysRaw) {
  if (isPipelineStageSlaDisabled(slaDaysRaw)) return null;
  const n = Number(slaDaysRaw);
  if (Number.isFinite(n) && n >= 1) return Math.round(n);
  return DEFAULT_PIPELINE_STAGE_SLA_DAYS;
}

/** Có SĐT trên lead hoặc customer — khớp Kanban «có số». */
function crmLeadHasPhone(lead) {
  const cust = lead?.customer?.phone;
  const own = lead?.phone;
  const display = lead?.display_phone;
  return !!(
    (cust && String(cust).trim())
    || (own && String(own).trim())
    || (display && String(display).trim())
  );
}

/** Lead chưa có số → không áp dụng SLA cột. */
function crmLeadMissingPhone(lead) {
  return !crmLeadHasPhone(lead);
}

function isSxPipelineStageNoDeadline(stage) {
  return !!stage?.counts_as_completed_revenue;
}

/** Cột «Bỏ quá hạn» hoặc «Đã công» — không ghi nhận quá hạn ngày đặt/giao. */
function shouldIgnoreSxOrderDeliveryOverdue(stage) {
  if (!stage) return false;
  if (isSxPipelineStageNoDeadline(stage)) return true;
  if (isPipelineStageSlaDisabled(stage.sla_days)) return true;
  return false;
}

function isSxProjectDateOverdue(project, dateField) {
  const stage = project?.sx_pipeline_stage;
  if (shouldIgnoreSxOrderDeliveryOverdue(stage)) return false;
  const raw = project?.[dateField];
  if (!raw || project?.status === 'completed') return false;
  return new Date(raw) < new Date();
}

const INTAKE_BUCKET = 'won_pending';

/** Tone SLA cột SX — null nếu không áp dụng (đồng bộ frontend sxPipelineRevenue). */
function getSxPipelineStageSlaTone(stageEnteredAt, stage) {
  if (!stageEnteredAt || !stage) return null;
  if (isSxPipelineStageNoDeadline(stage)) return null;
  if (stage.bucket_slug === INTAKE_BUCKET) return null;
  const slaDays = effectivePipelineStageSlaDays(stage.sla_days);
  if (slaDays == null) return null;
  const deadlineTs = new Date(stageEnteredAt).getTime() + slaDays * 86400000;
  const remainingMs = deadlineTs - Date.now();
  if (remainingMs < 0) return { level: 'overdue', remainingMs, deadlineTs };
  if (remainingMs <= 24 * 3600000) return { level: 'soon', remainingMs, deadlineTs };
  if (remainingMs <= 3 * 24 * 3600000) return { level: 'warn', remainingMs, deadlineTs };
  return { level: 'ok', remainingMs, deadlineTs };
}

function isSxColumnSlaOverdue(project, stage) {
  const tone = getSxPipelineStageSlaTone(
    project?.sx_pipeline_stage_entered_at,
    stage || project?.sx_pipeline_stage,
  );
  return tone?.level === 'overdue';
}

/**
 * Quá hạn ngày giao/SX — khớp frontend `isSxProjectDeliveryDateOverdue`.
 * Ưu tiên: delivery_date → production_deadline → deadline.
 * So sánh theo ngày lịch (không tính «hôm nay đã qua giờ»).
 * Bỏ qua khi cột «Đã công» hoặc sla_days=0 («Bỏ quá hạn»).
 */
function isSxProjectDeliveryDateOverdue(project, stage) {
  const st = stage || project?.sx_pipeline_stage;
  if (shouldIgnoreSxOrderDeliveryOverdue(st)) return false;
  const raw = project?.delivery_date || project?.production_deadline || project?.deadline;
  if (!raw || project?.status === 'completed') return false;
  const t = new Date(raw);
  if (Number.isNaN(t.getTime())) return false;
  const startOfDay = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  return startOfDay(t).getTime() < startOfDay(new Date()).getTime();
}

module.exports = {
  DEFAULT_PIPELINE_STAGE_SLA_DAYS,
  isPipelineStageSlaDisabled,
  normalizePipelineStageSlaDaysForDb,
  effectivePipelineStageSlaDays,
  crmLeadHasPhone,
  crmLeadMissingPhone,
  isSxPipelineStageNoDeadline,
  shouldIgnoreSxOrderDeliveryOverdue,
  isSxProjectDateOverdue,
  getSxPipelineStageSlaTone,
  isSxColumnSlaOverdue,
  isSxProjectDeliveryDateOverdue,
};
