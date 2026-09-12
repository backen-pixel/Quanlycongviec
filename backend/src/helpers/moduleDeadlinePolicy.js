/**
 * Chính sách deadline dùng chung cho CRM, Sản xuất và VC/LĐ.
 *
 * Đây là lớp dẫn xuất: không ghi DB và không thay đổi các cột hiện có.
 * Mọi API/KPI/notification nên chọn hạn qua helper này để tránh mỗi nơi một thứ tự.
 */

const {
  companyWorkEndMsOnYmd,
  companyWorkEndMsFromRaw,
  vnYmdFromTs,
} = require('./companyDeadlineClock');
const { endOfCalendarDayAfterEntered } = require('./crmReportDateBounds');
const {
  effectivePipelineStageSlaDays,
  crmLeadMissingPhone,
  shouldIgnoreSxOrderDeliveryOverdue,
  projectLooksShippedForOverdue,
  isSxPipelineStageNoDeadline,
} = require('./crmPipelineSla');

const MODULE = Object.freeze({
  CRM: 'crm',
  PRODUCTION: 'production',
  LOGISTICS: 'logistics',
});

const DAY_MS = 24 * 60 * 60 * 1000;
const PROJECT_DEADLINE_FIELDS_BY_COMPLETION = Object.freeze({
  crm: [],
  production: [
    'sx_kanban_deadline_at',
    'sx_kanban_deadline_reason',
    'production_deadline',
    'production_finish_date',
  ],
  logistics: [],
  project_final: [
    'deadline',
    'production_deadline',
    'design_deadline',
    'sx_kanban_deadline_at',
    'sx_kanban_deadline_reason',
  ],
});

function stageOf(item, explicitStage, moduleKey) {
  if (explicitStage) return explicitStage;
  if (moduleKey === MODULE.CRM) return item?.stage || item?._stage || null;
  if (moduleKey === MODULE.PRODUCTION) return item?.sx_pipeline_stage || null;
  return item?.vc_pipeline_stage || item?.logistics_pipeline_stage || null;
}

function foldVi(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .toLowerCase()
    .trim();
}

function isCrmTerminalStage(stage) {
  if (!stage) return false;
  if (stage.is_won || stage.is_lost || stage.counts_as_completed_revenue) return true;
  const slug = String(stage.canonical_slug || stage.slug || '').toLowerCase();
  if (['won', 'lost', 'completed', 'done'].includes(slug)) return true;
  return ['won', 'lost'].includes(String(stage.deal_report_bucket || '').toLowerCase());
}

function isLogisticsFinalStage(stage) {
  if (!stage) return false;
  const slug = String(stage.bucket_slug || stage.slug || '').toLowerCase().trim();
  if (['completed', 'done', 'install_completed'].includes(slug)) return true;
  const name = foldVi(stage.name);
  return name === 'hoan thanh'
    || name === 'hoan thien'
    || name.startsWith('hoan thanh ')
    || name.startsWith('hoan thien ');
}

function companyRef(item) {
  return item?.company_id || item?.company || item?.logistics_company_id || item?.logistics_company || null;
}

/**
 * DATE-only được chốt tại giờ kết thúc công ty; timestamp có giờ giữ nguyên.
 */
function deadlineTsFromRaw(raw, itemOrCompany) {
  if (raw == null || raw === '') return null;
  const text = String(raw).trim();
  const dateOnly = text.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dateOnly) return companyWorkEndMsOnYmd(dateOnly[1], companyRef(itemOrCompany) || itemOrCompany);
  return companyWorkEndMsFromRaw(raw, companyRef(itemOrCompany) || itemOrCompany);
}

function candidate(raw, source, item) {
  const deadlineTs = deadlineTsFromRaw(raw, item);
  if (deadlineTs == null || !Number.isFinite(deadlineTs)) return null;
  return {
    source,
    raw,
    deadlineTs,
    deadlineAt: new Date(deadlineTs).toISOString(),
  };
}

function resolveCrmDeadline(item, stage) {
  if (!item || item.deadline_disabled_at || item.is_interacted) return null;
  if (crmLeadMissingPhone(item) || isCrmTerminalStage(stage)) return null;

  const task = candidate(item.crm_next_open_task_deadline, 'task', item);
  if (task) return task;
  const manual = candidate(item.kanban_deadline_at, 'kanban', item);
  if (manual) return manual;

  const slaDays = effectivePipelineStageSlaDays(stage?.sla_days);
  if (item.stage_entered_at && slaDays != null) {
    const slaAt = endOfCalendarDayAfterEntered(
      item.stage_entered_at,
      slaDays,
      companyRef(item),
    );
    const sla = candidate(slaAt?.toISOString(), 'sla', item);
    if (sla) return sla;
  }

  return candidate(item.expected_close_date, 'expected_close', item);
}

function resolveProductionDeadline(item, stage) {
  if (!item || item.status === 'completed') return null;
  if (isSxPipelineStageNoDeadline(stage)
    || shouldIgnoreSxOrderDeliveryOverdue(stage)
    || projectLooksShippedForOverdue(item)) {
    return null;
  }
  return candidate(item.sx_kanban_deadline_at, 'sx_kanban', item)
    || candidate(item.production_finish_date, 'production_finish', item)
    || candidate(item.production_deadline, 'production', item)
    || candidate(item.delivery_date, 'delivery', item)
    || candidate(item.deadline, 'project', item);
}

function resolveLogisticsDeadline(item, stage) {
  if (!item || item.status === 'completed' || isLogisticsFinalStage(stage)) return null;
  return candidate(item.install_date, 'install', item)
    || candidate(item.delivery_date, 'delivery', item)
    || candidate(item.deadline, 'project', item);
}

function deadlineState(deadlineTs, nowMs = Date.now()) {
  if (deadlineTs == null || !Number.isFinite(deadlineTs)) {
    return { level: 'none', remainingMs: null };
  }
  const remainingMs = deadlineTs - nowMs;
  if (remainingMs < 0) return { level: 'overdue', remainingMs };
  if (remainingMs <= DAY_MS) return { level: 'soon', remainingMs };
  if (remainingMs <= 3 * DAY_MS) return { level: 'warning', remainingMs };
  return { level: 'ok', remainingMs };
}

function resolveModuleDeadline(moduleKey, item, opts = {}) {
  const key = String(moduleKey || '').toLowerCase();
  const stage = stageOf(item, opts.stage, key);
  let picked = null;
  if (key === MODULE.CRM) picked = resolveCrmDeadline(item, stage);
  else if (key === MODULE.PRODUCTION) picked = resolveProductionDeadline(item, stage);
  else if (key === MODULE.LOGISTICS) picked = resolveLogisticsDeadline(item, stage);
  const state = deadlineState(picked?.deadlineTs ?? null, opts.nowMs);
  return {
    module: key,
    source: picked?.source || null,
    raw: picked?.raw || null,
    deadlineAt: picked?.deadlineAt || null,
    deadlineTs: picked?.deadlineTs ?? null,
    state: state.level,
    remainingMs: state.remainingMs,
  };
}

function startOfVnDayMs(nowMs = Date.now()) {
  const ymd = vnYmdFromTs(nowMs);
  return ymd ? new Date(`${ymd}T00:00:00+07:00`).getTime() : null;
}

function deadlineBucket(deadlineTs, nowMs = Date.now()) {
  if (deadlineTs == null || !Number.isFinite(deadlineTs)) return 'none';
  const start = startOfVnDayMs(nowMs);
  if (start == null) return 'none';
  const dueYmd = vnYmdFromTs(deadlineTs);
  const todayYmd = vnYmdFromTs(nowMs);
  if (deadlineTs < nowMs) return 'overdue';
  if (dueYmd === todayYmd) return 'today';

  const diffDays = Math.floor((new Date(`${dueYmd}T00:00:00+07:00`).getTime() - start) / DAY_MS);
  const vnToday = new Date(start + 7 * 60 * 60 * 1000);
  const dow = vnToday.getUTCDay() === 0 ? 7 : vnToday.getUTCDay();
  const daysToEndOfWeek = 7 - dow;
  if (diffDays <= daysToEndOfWeek) return 'this_week';
  if (diffDays <= daysToEndOfWeek + 7) return 'next_week';
  const y = vnToday.getUTCFullYear();
  const m = vnToday.getUTCMonth();
  const endThisMonth = Date.UTC(y, m + 1, 1) - 7 * 60 * 60 * 1000 - 1;
  if (deadlineTs <= endThisMonth) return 'this_month';
  return 'later';
}

function withEffectiveModuleDeadline(moduleKey, item, opts = {}) {
  const resolved = resolveModuleDeadline(moduleKey, item, opts);
  return {
    ...item,
    effective_deadline_module: resolved.module,
    effective_deadline_at: resolved.deadlineAt,
    effective_deadline_source: resolved.source,
    deadline_state: resolved.state,
    deadline_bucket: deadlineBucket(resolved.deadlineTs, opts.nowMs),
  };
}

function projectDeadlinePatchOnModuleDone(moduleKey, nowIso = new Date().toISOString()) {
  const fields = PROJECT_DEADLINE_FIELDS_BY_COMPLETION[String(moduleKey || '').toLowerCase()] || [];
  return fields.reduce((patch, field) => {
    patch[field] = null;
    return patch;
  }, { updated_at: nowIso });
}

module.exports = {
  MODULE,
  PROJECT_DEADLINE_FIELDS_BY_COMPLETION,
  isCrmTerminalStage,
  isLogisticsFinalStage,
  deadlineTsFromRaw,
  deadlineState,
  deadlineBucket,
  resolveModuleDeadline,
  resolveCrmDeadline,
  resolveProductionDeadline,
  resolveLogisticsDeadline,
  withEffectiveModuleDeadline,
  projectDeadlinePatchOnModuleDone,
};
