/** Production domain rules: backward scheduling, progress, delay và risk. */
const VN_TZ = 'Asia/Ho_Chi_Minh';

const STAGE_STATUSES = new Set(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'DELAYED', 'BLOCKED']);
const RISK_LEVELS = new Set(['GREEN', 'YELLOW', 'RED']);
const DURATION_MODES = new Set(['FIXED', 'REMAINDER', 'MILESTONE']);

const DEFAULT_MANUFACTURING_SCHEDULE_RULES = Object.freeze([
  Object.freeze({ stage_code: 'MAIN_PRODUCTION', label: 'Sản xuất/Gia công', order_index: 1, duration_mode: 'REMAINDER', duration_days: null }),
  Object.freeze({ stage_code: 'FINISHING', label: 'Hoàn thiện', order_index: 2, duration_mode: 'FIXED', duration_days: 1 }),
  Object.freeze({ stage_code: 'QUALITY', label: 'KCS', order_index: 3, duration_mode: 'FIXED', duration_days: 1 }),
  Object.freeze({ stage_code: 'PACKING', label: 'Đóng gói', order_index: 4, duration_mode: 'FIXED', duration_days: 1 }),
  Object.freeze({ stage_code: 'READY_DELIVERY', label: 'Sẵn sàng giao', order_index: 5, duration_mode: 'MILESTONE', duration_days: 0 }),
  Object.freeze({ stage_code: 'DELIVERY', label: 'Giao hàng', order_index: 6, duration_mode: 'FIXED', duration_days: 1 }),
]);

function ymdFromValue(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() + 1 !== m || date.getUTCDate() !== d) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function todayYmd(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-CA', { timeZone: VN_TZ });
}

function addCalendarDays(ymd, delta) {
  const normalized = ymdFromValue(ymd);
  if (!normalized) return null;
  const date = new Date(`${normalized}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Number(delta || 0));
  return date.toISOString().slice(0, 10);
}

function diffCalendarDays(fromYmd, toYmd) {
  const from = ymdFromValue(fromYmd);
  const to = ymdFromValue(toYmd);
  if (!from || !to) return null;
  return Math.round((Date.parse(`${to}T12:00:00.000Z`) - Date.parse(`${from}T12:00:00.000Z`)) / 86400000);
}

function normalizeStageCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/_+/g, '_');
}

function normalizeScheduleRules(input) {
  const source = Array.isArray(input) && input.length ? input : DEFAULT_MANUFACTURING_SCHEDULE_RULES;
  if (source.length < 2 || source.length > 20) {
    return { ok: false, code: 'INVALID_STAGE_RULE_COUNT', error: 'Cấu hình phải có từ 2 đến 20 công đoạn.' };
  }

  const seen = new Set();
  const rules = [];
  for (let index = 0; index < source.length; index += 1) {
    const raw = source[index] || {};
    const stageCode = normalizeStageCode(raw.stage_code);
    const label = String(raw.label || '').trim();
    const durationMode = String(raw.duration_mode || '').trim().toUpperCase();
    const durationRaw = raw.duration_days;
    const durationDays = durationRaw == null || durationRaw === '' ? null : Number(durationRaw);
    if (!stageCode || !label || seen.has(stageCode)) {
      return { ok: false, code: 'INVALID_STAGE_RULE', error: `Công đoạn thứ ${index + 1} thiếu mã/tên hoặc bị trùng mã.` };
    }
    if (!DURATION_MODES.has(durationMode)) {
      return { ok: false, code: 'INVALID_DURATION_MODE', error: `Công đoạn ${label} có cách phân bổ thời gian không hợp lệ.` };
    }
    if (durationMode === 'FIXED' && (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365)) {
      return { ok: false, code: 'INVALID_FIXED_DURATION', error: `Công đoạn ${label} phải có số ngày cố định từ 1 đến 365.` };
    }
    if (durationMode === 'MILESTONE' && !(durationDays == null || durationDays === 0)) {
      return { ok: false, code: 'INVALID_MILESTONE_DURATION', error: `Mốc ${label} không được tiêu thụ ngày lead time.` };
    }
    if (durationMode === 'REMAINDER' && durationDays != null) {
      return { ok: false, code: 'INVALID_REMAINDER_DURATION', error: `Công đoạn ${label} phải nhận phần thời gian còn lại.` };
    }
    seen.add(stageCode);
    rules.push({
      stage_code: stageCode,
      label,
      order_index: index + 1,
      duration_mode: durationMode,
      duration_days: durationMode === 'FIXED' ? durationDays : (durationMode === 'MILESTONE' ? 0 : null),
    });
  }

  if (rules.filter((rule) => rule.duration_mode === 'REMAINDER').length !== 1) {
    return { ok: false, code: 'REMAINDER_STAGE_REQUIRED', error: 'Cấu hình phải có đúng một công đoạn nhận phần thời gian còn lại.' };
  }
  const delivery = rules.find((rule) => rule.stage_code === 'DELIVERY');
  if (!delivery || delivery.order_index !== rules.length || delivery.duration_mode !== 'FIXED' || delivery.duration_days !== 1) {
    return { ok: false, code: 'DELIVERY_STAGE_REQUIRED', error: 'Công đoạn cuối phải là DELIVERY và chiếm một ngày giao hàng.' };
  }
  return { ok: true, rules };
}

function buildBackwardSchedule({ deliveryDate, leadTimeDays, rules, calendarMode = 'CALENDAR_DAYS' }) {
  const deliveryYmd = ymdFromValue(deliveryDate);
  const leadDays = Number(leadTimeDays);
  if (!deliveryYmd) return { ok: false, code: 'INVALID_DELIVERY_DATE', error: 'Ngày giao hàng không hợp lệ.' };
  if (!Number.isInteger(leadDays) || leadDays < 1 || leadDays > 365) {
    return { ok: false, code: 'INVALID_LEAD_TIME', error: 'Lead time phải là số nguyên từ 1 đến 365 ngày.' };
  }
  if (calendarMode !== 'CALENDAR_DAYS') {
    return { ok: false, code: 'UNSUPPORTED_CALENDAR_MODE', error: 'Lát cắt hiện tại chỉ hỗ trợ ngày lịch.' };
  }
  const normalized = normalizeScheduleRules(rules);
  if (!normalized.ok) return normalized;

  const fixedDays = normalized.rules
    .filter((rule) => rule.duration_mode === 'FIXED')
    .reduce((sum, rule) => sum + rule.duration_days, 0);
  const remainderDays = leadDays - fixedDays;
  if (remainderDays < 1) {
    return {
      ok: false,
      code: 'LEAD_TIME_TOO_SHORT',
      error: `Lead time tối thiểu là ${fixedDays + 1} ngày với cấu hình công đoạn hiện tại.`,
      minimum_lead_time_days: fixedDays + 1,
    };
  }

  const stagesByCode = new Map();
  let cursor = deliveryYmd;
  for (const rule of [...normalized.rules].reverse()) {
    const durationDays = rule.duration_mode === 'REMAINDER'
      ? remainderDays
      : (rule.duration_mode === 'MILESTONE' ? 0 : rule.duration_days);
    if (rule.duration_mode === 'MILESTONE') {
      stagesByCode.set(rule.stage_code, {
        ...rule,
        duration_days: 0,
        planned_start_at: cursor,
        planned_due_at: cursor,
      });
      continue;
    }
    const start = addCalendarDays(cursor, -(durationDays - 1));
    stagesByCode.set(rule.stage_code, {
      ...rule,
      duration_days: durationDays,
      planned_start_at: start,
      planned_due_at: cursor,
    });
    cursor = addCalendarDays(start, -1);
  }

  const stages = normalized.rules.map((rule) => stagesByCode.get(rule.stage_code));
  const first = stages[0];
  return {
    ok: true,
    calendar_mode: calendarMode,
    delivery_date: deliveryYmd,
    lead_time_days: leadDays,
    planned_start_at: first.planned_start_at,
    planned_due_at: deliveryYmd,
    production_finish_date: (stages.find((stage) => stage.stage_code === 'PACKING') || stages[stages.length - 2]).planned_due_at,
    rules: normalized.rules,
    stages,
  };
}

function evaluateStageProgress(stage, { asOfYmd = todayYmd(), riskWarningDays = 1 } = {}) {
  const dueYmd = ymdFromValue(stage?.planned_due_at);
  const actualCompletedYmd = ymdFromValue(stage?.actual_completed_at);
  const progress = Math.max(0, Math.min(100, Number(stage?.progress_percent) || 0));
  const persistedStatus = STAGE_STATUSES.has(String(stage?.status || '').toUpperCase())
    ? String(stage.status).toUpperCase()
    : 'NOT_STARTED';
  let delayDays = 0;
  if (dueYmd && actualCompletedYmd) delayDays = Math.max(0, diffCalendarDays(dueYmd, actualCompletedYmd) || 0);
  else if (dueYmd && asOfYmd) delayDays = Math.max(0, diffCalendarDays(dueYmd, asOfYmd) || 0);

  let status = persistedStatus;
  if (actualCompletedYmd || persistedStatus === 'COMPLETED' || progress === 100) status = 'COMPLETED';
  else if (persistedStatus === 'BLOCKED') status = 'BLOCKED';
  else if (delayDays > 0) status = 'DELAYED';
  else if (stage?.actual_start_at || progress > 0 || persistedStatus === 'IN_PROGRESS') status = 'IN_PROGRESS';
  else status = 'NOT_STARTED';

  const remainingDays = dueYmd && asOfYmd ? diffCalendarDays(asOfYmd, dueYmd) : null;
  let riskLevel = 'GREEN';
  if (status !== 'COMPLETED' && (status === 'BLOCKED' || delayDays > 0)) riskLevel = 'RED';
  else if (status !== 'COMPLETED' && remainingDays != null && remainingDays <= Math.max(0, Number(riskWarningDays) || 0)) riskLevel = 'YELLOW';

  return {
    ...stage,
    progress_percent: status === 'COMPLETED' ? 100 : progress,
    status,
    delay_days: delayDays,
    risk_level: RISK_LEVELS.has(riskLevel) ? riskLevel : 'GREEN',
    remaining_days: remainingDays,
  };
}

function buildManufacturingOrderReadModel(order, stages, { asOfYmd = todayYmd(), riskWarningDays = 1 } = {}) {
  const activeStages = (stages || [])
    .filter((stage) => stage?.is_active !== false)
    .sort((a, b) => Number(a.order_index || 0) - Number(b.order_index || 0))
    .map((stage) => evaluateStageProgress(stage, { asOfYmd, riskWarningDays }));
  const current = activeStages.find((stage) => stage.status !== 'COMPLETED') || activeStages[activeStages.length - 1] || null;
  // Delay đã được xử lý ở một công đoạn hoàn tất vẫn được giữ trên công đoạn để đo hiệu suất,
  // nhưng không tự động đẩy dự báo giao của cả đơn. Dự báo chỉ dựa trên phần việc còn mở.
  const maxDelay = activeStages
    .filter((stage) => stage.status !== 'COMPLETED')
    .reduce((max, stage) => Math.max(max, Number(stage.delay_days) || 0), 0);
  const hasBlocked = activeStages.some((stage) => stage.status === 'BLOCKED');
  const hasYellow = activeStages.some((stage) => stage.risk_level === 'YELLOW');
  const allCompleted = activeStages.length > 0 && activeStages.every((stage) => stage.status === 'COMPLETED');
  const riskLevel = maxDelay > 0 || hasBlocked ? 'RED' : (hasYellow ? 'YELLOW' : 'GREEN');
  const deliveryDate = ymdFromValue(order?.delivery_date);
  return {
    ...order,
    status: allCompleted ? 'COMPLETED' : (hasBlocked ? 'BLOCKED' : (activeStages.some((stage) => stage.status === 'IN_PROGRESS' || stage.status === 'DELAYED') ? 'IN_PROGRESS' : (order?.status || 'PLANNED'))),
    current_stage_code: current?.stage_code || null,
    current_stage: current,
    stages: activeStages,
    delay_days: maxDelay,
    risk_level: riskLevel,
    forecast_delivery_date: deliveryDate && maxDelay > 0 ? addCalendarDays(deliveryDate, maxDelay) : deliveryDate,
    delivery_at_risk: riskLevel !== 'GREEN',
  };
}

function buildManufacturingControlCenter({
  orders = [],
  stagesByOrder = {},
  asOfYmd = todayYmd(),
  riskWarningDays = 1,
  riskWarningDaysByCompany = {},
} = {}) {
  const items = orders.map((order) => buildManufacturingOrderReadModel(
    order,
    stagesByOrder[String(order.id)] || [],
    {
      asOfYmd,
      riskWarningDays: riskWarningDaysByCompany[String(order.company_id)] ?? riskWarningDays,
    },
  ));
  const todayDue = items.flatMap((item) => item.stages
    .filter((stage) => stage.planned_due_at === asOfYmd && stage.status !== 'COMPLETED')
    .map((stage) => ({ ...item, focus_stage: stage })));
  const delayed = items.filter((item) => item.delay_days > 0 || item.current_stage?.status === 'DELAYED')
    .sort((a, b) => (b.delay_days || 0) - (a.delay_days || 0));
  const atRisk = items.filter((item) => item.risk_level === 'YELLOW');
  return {
    version: 'manufacturing_schedule_control_v1',
    as_of_date: asOfYmd,
    stats: {
      total: items.length,
      today_due: todayDue.length,
      delayed: delayed.length,
      at_risk: atRisk.length,
      delivery_at_risk: items.filter((item) => item.delivery_at_risk).length,
    },
    groups: { today_due: todayDue, delayed, at_risk: atRisk },
    items,
  };
}

function validateStageExecutionPatch(stage, payload = {}) {
  const currentStatus = String(stage?.status || 'NOT_STARTED').toUpperCase();
  const requestedStatus = String(payload.status || currentStatus).toUpperCase();
  if (!STAGE_STATUSES.has(requestedStatus)) {
    return { ok: false, code: 'INVALID_STAGE_STATUS', error: 'Trạng thái công đoạn không hợp lệ.' };
  }
  if (currentStatus === 'COMPLETED' && requestedStatus !== 'COMPLETED' && !String(payload.reopen_reason || '').trim()) {
    return { ok: false, code: 'REOPEN_REASON_REQUIRED', error: 'Mở lại công đoạn đã hoàn thành phải có lý do.' };
  }
  const progress = payload.progress_percent == null ? Number(stage?.progress_percent || 0) : Number(payload.progress_percent);
  if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
    return { ok: false, code: 'INVALID_PROGRESS', error: 'Tiến độ phải là số nguyên từ 0 đến 100.' };
  }
  if (requestedStatus === 'COMPLETED' && progress !== 100 && payload.progress_percent != null) {
    return { ok: false, code: 'COMPLETED_PROGRESS_REQUIRED', error: 'Công đoạn hoàn thành phải đạt 100%.' };
  }
  return {
    ok: true,
    status: requestedStatus,
    progress_percent: requestedStatus === 'COMPLETED' ? 100 : progress,
    reopen_reason: String(payload.reopen_reason || '').trim() || null,
  };
}

module.exports = {
  DEFAULT_MANUFACTURING_SCHEDULE_RULES,
  STAGE_STATUSES,
  addCalendarDays,
  diffCalendarDays,
  todayYmd,
  ymdFromValue,
  normalizeScheduleRules,
  buildBackwardSchedule,
  evaluateStageProgress,
  buildManufacturingOrderReadModel,
  buildManufacturingControlCenter,
  validateStageExecutionPatch,
};
