import { effectivePipelineStageSlaDays } from './crmPipelineSla';
import { endOfVnCalendarDayAfterEntered } from './vnDate';

/** Cột pipeline Thắng — deal đã chốt, không tính/hiển thị deadline. */
export function isCrmPipelineStageWon(stage) {
  if (!stage) return false;
  if (stage.is_won) return true;
  if (stage.canonical_slug === 'won') return true;
  if (stage.deal_report_bucket === 'won') return true;
  return false;
}

/** Cột tích «doanh thu đã hoàn thành» — không tính/hiển thị deadline. */
export function isCrmPipelineStageCompletedRevenue(stage) {
  return !!stage?.counts_as_completed_revenue;
}

/** Cột không theo dõi deadline (Thắng / Thua / Hoàn thành doanh thu). */
export function isCrmPipelineStageNoDeadline(stage) {
  return isCrmPipelineStageWon(stage)
    || isCrmPipelineStageLost(stage)
    || isCrmPipelineStageCompletedRevenue(stage);
}

/** Có SĐT trên lead hoặc customer (khớp lọc Kanban «có số»). */
export function crmLeadHasPhone(item) {
  const cust = item?.customer?.phone;
  const own = item?.phone;
  const display = item?.display_phone;
  return !!(
    (cust && String(cust).trim())
    || (own && String(own).trim())
    || (display && String(display).trim())
  );
}

/**
 * Lead «chưa có số» để bỏ deadline/quá hạn trên thẻ.
 * Khớp backend `crmDeadlineTsForRow`: display_phone || phone || customer.phone.
 */
export function crmLeadMissingPhone(item) {
  return !crmLeadHasPhone(item);
}

/**
 * Ẩn badge deadline / quá hạn trên thẻ Kanban khi:
 * - lead/deal chưa có SĐT
 * - user tick «đã tương tác»
 * - cột Thắng/Thua/Hoàn thành doanh thu
 */
export function shouldHideCrmKanbanDeadlineOnCard(item, stage) {
  if (item?.deadline_disabled_at) return true;
  if (crmLeadMissingPhone(item)) return true;
  if (item?.is_interacted) return true;
  const st = stage || item?.stage;
  if (isCrmPipelineStageNoDeadline(st)) return true;
  return false;
}

/** Cột pipeline Thua / Mất — không đưa vào view Deadline. */
export function isCrmPipelineStageLost(stage) {
  if (!stage) return false;
  if (stage.is_lost) return true;
  if (stage.canonical_slug === 'lost') return true;
  if (stage.deal_report_bucket === 'lost') return true;
  return false;
}

/** Nguồn hạn hiển thị trên thẻ lead/deal CRM */
export const CRM_DEADLINE_SOURCE_META = {
  kanban: {
    label: 'Deadline tự setup',
    shortLabel: 'Setup',
    className: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  task: {
    label: 'Deadline nhiệm vụ',
    shortLabel: 'NV',
    className: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  sla: {
    label: 'SLA cột',
    shortLabel: 'SLA',
    className: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  expected_close: {
    label: 'Ngày chốt dự kiến',
    shortLabel: 'Chốt',
    className: 'bg-violet-50 text-violet-700 border-violet-200',
  },
};

/** Map source nội bộ (kể cả alias `deadline` trên Kanban) → meta hiển thị. */
export function getCrmDeadlineSourceMeta(source) {
  if (!source) return null;
  if (source === 'deadline') return CRM_DEADLINE_SOURCE_META.kanban;
  return CRM_DEADLINE_SOURCE_META[source] || null;
}

/**
 * Hạn SLA cột.
 * @param {string} stageEnteredAt
 * @param {object} stage
 * @param {object} [leadItem] — nếu truyền và chưa có SĐT → null (tắt SLA)
 */
export function getPipelineStageSlaDeadlineTs(stageEnteredAt, stage, leadItem) {
  if (leadItem != null && crmLeadMissingPhone(leadItem)) return null;
  if (!stageEnteredAt || !stage) return null;
  if (isCrmPipelineStageNoDeadline(stage)) return null;
  const slaDays = effectivePipelineStageSlaDays(stage.sla_days);
  if (slaDays == null) return null;
  // Khớp backend: cuối ngày lịch VN sau slaDays (không dùng entered + N*24h).
  return endOfVnCalendarDayAfterEntered(stageEnteredAt, slaDays).getTime();
}

/**
 * Thứ tự ưu tiên hạn hiệu lực trên lead/deal:
 * 1) Deadline nhiệm vụ (NV CRM đang mở có Ngày hẹn)
 * 2) Deadline tự setup (kanban_deadline_at / Deadline thẻ)
 * 3) SLA cột
 */
export function resolveCrmLeadEffectiveDeadlineSource(item, stage) {
  const st = stage || item?.stage || item?._stage;
  if (item?.deadline_disabled_at) {
    return { source: null, deadlineTs: null, disabled: true };
  }
  if (shouldHideCrmKanbanDeadlineOnCard(item, st)) {
    return { source: null, deadlineTs: null };
  }

  const taskIso = item?.crm_next_open_task_deadline;
  if (taskIso != null && taskIso !== '') {
    const ts = new Date(taskIso).getTime();
    if (!Number.isNaN(ts)) return { source: 'task', deadlineTs: ts };
  }

  const manual = item?.kanban_deadline_at;
  if (manual != null && manual !== '') {
    const ts = new Date(manual).getTime();
    if (!Number.isNaN(ts)) return { source: 'kanban', deadlineTs: ts };
  }

  const slaTs = getPipelineStageSlaDeadlineTs(item?.stage_entered_at, st, item);
  if (slaTs != null) return { source: 'sla', deadlineTs: slaTs };

  return { source: null, deadlineTs: null };
}

/** @deprecated Dùng resolveCrmLeadEffectiveDeadlineSource — giữ alias tương thích. */
export function resolveCrmLeadKanbanScheduleSource(item, stage) {
  return resolveCrmLeadEffectiveDeadlineSource(item, stage);
}

function fieldToDeadlineSource(field) {
  if (field === 'kanban_deadline_at') return 'kanban';
  if (field === 'crm_next_open_task_deadline') return 'task';
  if (field === 'expected_close_date') return 'expected_close';
  return null;
}

/** Định dạng thời gian còn lại / quá hạn (ms, dương). */
export function formatCrmRemainingMs(ms) {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return '';
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(h / 24);
  const hr = h % 24;
  if (d > 0) return `${d} ngày ${hr} giờ`;
  if (h > 0) return `${h} giờ`;
  const m = Math.floor(ms / 60000);
  return m > 0 ? `${m} phút` : '< 1 phút';
}

/** Mức urgency: overdue (<0) | soon (≤24h) | warn (≤3 ngày) | ok */
export function getCrmDeadlineUrgencyFromTs(deadlineTs) {
  if (deadlineTs == null || Number.isNaN(deadlineTs)) {
    return { level: 'ok', remainingMs: null, deadlineTs: null };
  }
  const remainingMs = deadlineTs - Date.now();
  if (remainingMs < 0) return { level: 'overdue', remainingMs, deadlineTs };
  if (remainingMs <= 24 * 3600000) return { level: 'soon', remainingMs, deadlineTs };
  if (remainingMs <= 3 * 24 * 3600000) return { level: 'warn', remainingMs, deadlineTs };
  return { level: 'ok', remainingMs, deadlineTs };
}

export function getCrmDeadlineUrgencyFromIso(iso) {
  if (iso == null || iso === '') return getCrmDeadlineUrgencyFromTs(null);
  return getCrmDeadlineUrgencyFromTs(new Date(iso).getTime());
}

/** Class Tailwind cho badge Còn / Sắp / Quá hạn */
export function getCrmDeadlineUrgencyBadgeClass(level, { pulseOverdue = true } = {}) {
  switch (level) {
    case 'overdue':
      return [
        'bg-red-600 text-white border-red-700 font-bold shadow-md shadow-red-500/40',
        pulseOverdue ? 'animate-pulse ring-2 ring-red-400/60' : 'ring-1 ring-red-500/50',
      ].join(' ');
    case 'soon':
      return 'bg-orange-500 text-white border-orange-600 font-bold shadow-md shadow-orange-500/35 ring-2 ring-orange-300/50';
    case 'warn':
      return 'bg-amber-300 text-amber-950 border-amber-500 font-semibold shadow-sm';
    default:
      return 'bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold';
  }
}

/** View Deadline: theo cấu hình primary / fallback công ty. */
export function pickDeadlineConfigValueWithSource(item, primary, fallback) {
  const readTs = (field) => {
    if (!field) return null;
    const v = item[field];
    if (!v) return null;
    const ts = new Date(v).getTime();
    return Number.isNaN(ts) ? null : ts;
  };
  const p = readTs(primary);
  if (p != null) return { deadlineTs: p, source: fieldToDeadlineSource(primary) };
  const f = readTs(fallback);
  if (f != null) return { deadlineTs: f, source: fieldToDeadlineSource(fallback) };
  return { deadlineTs: null, source: null };
}

/**
 * View Deadline Dashboard + thẻ Kanban: khớp backend `crmDeadlineTsForRow`
 * — nhiệm vụ → kanban → SLA → primary/fallback config (vd. expected_close_date).
 */
export function resolveCrmLeadDeadlineViewSource(item, stage, config) {
  const st = stage || item?._stage || item?.stage;
  if (item?.deadline_disabled_at) {
    return { deadlineTs: null, source: null, disabled: true };
  }
  if (shouldHideCrmKanbanDeadlineOnCard(item, st)) {
    return { deadlineTs: null, source: null };
  }

  const taskIso = item?.crm_next_open_task_deadline;
  if (taskIso != null && taskIso !== '') {
    const ts = new Date(taskIso).getTime();
    if (!Number.isNaN(ts)) return { source: 'task', deadlineTs: ts };
  }

  const manual = item?.kanban_deadline_at;
  if (manual != null && manual !== '') {
    const ts = new Date(manual).getTime();
    if (!Number.isNaN(ts)) return { source: 'kanban', deadlineTs: ts };
  }

  const slaTs = getPipelineStageSlaDeadlineTs(item?.stage_entered_at, st, item);
  if (slaTs != null) return { source: 'sla', deadlineTs: slaTs };

  const cfg = config || {};
  const primary = String(cfg.primary_field || 'crm_next_open_task_deadline');
  const fallback = String(cfg.fallback_field || 'expected_close_date');
  for (const field of [primary, fallback]) {
    if (field === 'crm_next_open_task_deadline' || field === 'kanban_deadline_at') continue;
    const raw = item?.[field];
    if (!raw) continue;
    const ts = new Date(raw).getTime();
    if (!Number.isNaN(ts)) {
      return { deadlineTs: ts, source: fieldToDeadlineSource(field) };
    }
  }

  return { deadlineTs: null, source: null };
}

/**
 * Gom cột Deadline view — khớp BE `crmDeadlineTsForRow` / RPC counts.
 * Không dùng `shouldHide` / `deadline_disabled_at` (BE counts cũng không).
 */
export function resolveCrmLeadDeadlineBucketSource(item, stage, config) {
  const st = stage || item?._stage || item?.stage;
  const hasPhone = crmLeadHasPhone(item);
  if (!hasPhone || item?.is_interacted || isCrmPipelineStageNoDeadline(st)) {
    return { deadlineTs: null, source: null, forcedNoDeadline: true };
  }

  for (const field of ['crm_next_open_task_deadline', 'kanban_deadline_at']) {
    const raw = item?.[field];
    if (!raw) continue;
    const ts = new Date(raw).getTime();
    if (!Number.isNaN(ts)) {
      return {
        deadlineTs: ts,
        source: field === 'crm_next_open_task_deadline' ? 'task' : 'kanban',
        forcedNoDeadline: false,
      };
    }
  }

  const slaTs = getPipelineStageSlaDeadlineTs(item?.stage_entered_at, st, item);
  if (slaTs != null) return { deadlineTs: slaTs, source: 'sla', forcedNoDeadline: false };

  const cfg = config || {};
  const primary = String(cfg.primary_field || 'crm_next_open_task_deadline');
  const fallback = String(cfg.fallback_field || 'expected_close_date');
  for (const field of [primary, fallback]) {
    if (field === 'crm_next_open_task_deadline' || field === 'kanban_deadline_at') continue;
    const raw = item?.[field];
    if (!raw) continue;
    const ts = new Date(raw).getTime();
    if (!Number.isNaN(ts)) {
      return { deadlineTs: ts, source: fieldToDeadlineSource(field), forcedNoDeadline: false };
    }
  }

  return { deadlineTs: null, source: null, forcedNoDeadline: false };
}

/**
 * Đầu ngày VN (ms epoch) — khớp backend `crmDeadlineStartOfTodayVn`.
 */
export function crmDeadlineStartOfTodayVnMs(nowMs = Date.now()) {
  const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
  const shifted = new Date(nowMs + VN_OFFSET_MS);
  return Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  ) - VN_OFFSET_MS;
}

/**
 * Phân bucket Deadline — khớp backend `crmDeadlineBucketFromTs` / RPC 473 (Asia/Ho_Chi_Minh).
 */
export function crmDeadlineBucketFromTs(deadlineTs, buckets, nowMs = Date.now()) {
  if (deadlineTs == null || !Number.isFinite(deadlineTs)) return 'no_deadline';
  const dayMs = 24 * 60 * 60 * 1000;
  const startToday = crmDeadlineStartOfTodayVnMs(nowMs);
  const endToday = startToday + dayMs - 1;
  if (deadlineTs < startToday) return 'overdue';
  if (deadlineTs <= endToday) return 'today';
  if (deadlineTs <= endToday + dayMs) return 'tomorrow';

  const vnToday = new Date(startToday + 7 * 60 * 60 * 1000);
  const dow = (vnToday.getUTCDay() + 6) % 7; // Mon=0
  const endThisWeek = startToday - dow * dayMs + 7 * dayMs - 1;
  if (deadlineTs <= endThisWeek) return 'this_week';
  if (deadlineTs <= endThisWeek + 7 * dayMs) return 'next_week';

  const days = (key, fallback) => {
    const value = Number(buckets?.[key]?.days);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  if (deadlineTs <= startToday + days('in_2_weeks', 14) * dayMs) return 'in_2_weeks';
  if (deadlineTs <= startToday + days('in_3_weeks', 21) * dayMs) return 'in_3_weeks';
  if (deadlineTs <= startToday + days('in_4_weeks', 28) * dayMs) return 'in_4_weeks';
  if (deadlineTs <= startToday + days('in_1_month', 30) * dayMs) return 'in_1_month';

  const y = vnToday.getUTCFullYear();
  const m = vnToday.getUTCMonth();
  const nextMonthStart = Date.UTC(y, m + 1, 1) - 7 * 60 * 60 * 1000;
  const nextMonthEnd = Date.UTC(y, m + 2, 1) - 7 * 60 * 60 * 1000 - 1;
  if (deadlineTs >= nextMonthStart && deadlineTs <= nextMonthEnd) return 'next_month';
  return 'in_1_month';
}

export const CRM_DEADLINE_BUCKET_KEYS = [
  'overdue', 'today', 'tomorrow', 'this_week', 'next_week',
  'in_2_weeks', 'in_3_weeks', 'in_4_weeks', 'in_1_month',
  'next_month', 'no_deadline',
];

/** Alias cũ — dùng crmDeadlineBucketFromTs. */
export function resolveCrmDeadlineBucket(deadlineTs, buckets, nowMs = Date.now()) {
  return crmDeadlineBucketFromTs(deadlineTs, buckets, nowMs);
}
