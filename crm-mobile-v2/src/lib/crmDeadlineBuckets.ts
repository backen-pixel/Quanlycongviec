/** Cột Deadline CRM — khớp web `CRMViews.DeadlineView` / `crmLeadDeadlineDisplay.js`. */

import { endOfVnCalendarDayAfterEntered } from './vnDate';

export type DeadlineBucketKey =
  | 'overdue'
  | 'today'
  | 'tomorrow'
  | 'this_week'
  | 'next_week'
  | 'in_2_weeks'
  | 'in_3_weeks'
  | 'in_4_weeks'
  | 'in_1_month'
  | 'next_month'
  | 'no_deadline';

export type DeadlineBucketMeta = {
  enabled?: boolean;
  label?: string;
  days?: number;
};

export type DeadlineConfig = {
  company_id?: string | null;
  primary_field?: string | null;
  fallback_field?: string | null;
  buckets?: Partial<Record<DeadlineBucketKey, DeadlineBucketMeta>>;
};

/** Khớp frontend `crmPipelineSla.js` */
const DEFAULT_PIPELINE_STAGE_SLA_DAYS = 7;

function effectivePipelineStageSlaDays(slaDaysRaw: unknown): number | null {
  if (slaDaysRaw === 0 || slaDaysRaw === '0') return null;
  const n = Number(slaDaysRaw);
  if (Number.isFinite(n) && n >= 1) return Math.round(n);
  return DEFAULT_PIPELINE_STAGE_SLA_DAYS;
}

export const DEADLINE_BUCKET_ORDER: DeadlineBucketKey[] = [
  'overdue',
  'today',
  'tomorrow',
  'this_week',
  'next_week',
  'in_2_weeks',
  'in_3_weeks',
  'in_4_weeks',
  'in_1_month',
  'next_month',
  'no_deadline',
];

export const DEADLINE_BUCKET_COLOR: Record<DeadlineBucketKey, string> = {
  overdue: '#f43f5e',
  today: '#f97316',
  tomorrow: '#eab308',
  this_week: '#f59e0b',
  next_week: '#84cc16',
  in_2_weeks: '#0ea5e9',
  in_3_weeks: '#3b82f6',
  in_4_weeks: '#6366f1',
  in_1_month: '#8b5cf6',
  next_month: '#10b981',
  no_deadline: '#9ca3af',
};

export const DEADLINE_BUCKET_DEFAULT_LABEL: Record<DeadlineBucketKey, string> = {
  overdue: 'Quá hạn',
  today: 'Hôm nay',
  tomorrow: 'Ngày mai',
  this_week: 'Tuần này',
  next_week: 'Tuần sau',
  in_2_weeks: 'Trong 2 tuần',
  in_3_weeks: 'Trong 3 tuần',
  in_4_weeks: 'Trong 4 tuần',
  in_1_month: 'Trong 1 tháng',
  next_month: 'Tháng sau',
  no_deadline: 'Không hạn',
};

export function deadlineBucketLabel(
  key: DeadlineBucketKey,
  buckets?: Partial<Record<DeadlineBucketKey, DeadlineBucketMeta>> | null,
): string {
  return buckets?.[key]?.label || DEADLINE_BUCKET_DEFAULT_LABEL[key] || key;
}

export function enabledDeadlineBuckets(
  buckets?: Partial<Record<DeadlineBucketKey, DeadlineBucketMeta>> | null,
): DeadlineBucketKey[] {
  return DEADLINE_BUCKET_ORDER.filter((k) => buckets?.[k]?.enabled !== false);
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** 00:00 ngày hiện tại theo Asia/Ho_Chi_Minh — khớp backend `crmDeadlineStartOfTodayVn`. */
export function crmDeadlineStartOfTodayVnMs(nowMs: number = Date.now()): number {
  const shifted = new Date(nowMs + VN_OFFSET_MS);
  return Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  ) - VN_OFFSET_MS;
}

/**
 * Phân cột theo timestamp hạn — khớp backend/web `crmDeadlineBucketFromTs` (VN).
 */
export function resolveDeadlineBucket(
  deadlineTs: number | null | undefined,
  buckets?: Partial<Record<DeadlineBucketKey, DeadlineBucketMeta>> | null,
  nowMs: number = Date.now(),
): DeadlineBucketKey {
  if (deadlineTs == null || !Number.isFinite(deadlineTs)) return 'no_deadline';

  const dayMs = 24 * 60 * 60 * 1000;
  const startToday = crmDeadlineStartOfTodayVnMs(nowMs);
  const endToday = startToday + dayMs - 1;
  if (deadlineTs < startToday) return 'overdue';
  if (deadlineTs <= endToday) return 'today';
  if (deadlineTs <= endToday + dayMs) return 'tomorrow';

  const vnToday = new Date(startToday + VN_OFFSET_MS);
  const dow = (vnToday.getUTCDay() + 6) % 7; // Mon=0
  const endThisWeek = startToday - dow * dayMs + 7 * dayMs - 1;
  if (deadlineTs <= endThisWeek) return 'this_week';
  if (deadlineTs <= endThisWeek + 7 * dayMs) return 'next_week';

  const days = (key: DeadlineBucketKey, fallback: number) => {
    const value = Number(buckets?.[key]?.days);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  if (deadlineTs <= startToday + days('in_2_weeks', 14) * dayMs) return 'in_2_weeks';
  if (deadlineTs <= startToday + days('in_3_weeks', 21) * dayMs) return 'in_3_weeks';
  if (deadlineTs <= startToday + days('in_4_weeks', 28) * dayMs) return 'in_4_weeks';
  if (deadlineTs <= startToday + days('in_1_month', 30) * dayMs) return 'in_1_month';

  const y = vnToday.getUTCFullYear();
  const m = vnToday.getUTCMonth();
  const nextMonthStart = Date.UTC(y, m + 1, 1) - VN_OFFSET_MS;
  const nextMonthEnd = Date.UTC(y, m + 2, 1) - VN_OFFSET_MS - 1;
  if (deadlineTs >= nextMonthStart && deadlineTs <= nextMonthEnd) return 'next_month';
  return 'in_1_month';
}

export type DeadlineStageMeta = {
  is_won?: boolean | null;
  is_lost?: boolean | null;
  counts_as_completed_revenue?: boolean | null;
  sla_days?: number | null;
  canonical_slug?: string | null;
  deal_report_bucket?: string | null;
};

type DeadlineFieldSource = {
  kanban_deadline_at?: string | null;
  crm_next_open_task_deadline?: string | null;
  expected_close_date?: string | null;
  next_follow_up?: string | null;
  next_follow_up_at?: string | null;
  stage_entered_at?: string | null;
  is_interacted?: boolean | null;
  deadline_disabled_at?: string | null;
  display_phone?: string | null;
  phone?: string | null;
  customer?: { phone?: string | null } | null;
  stage?: DeadlineStageMeta | null;
};

function crmLeadHasPhone(item: DeadlineFieldSource): boolean {
  const cust = item?.customer?.phone;
  const own = item?.phone;
  const display = item?.display_phone;
  return !!(
    (cust && String(cust).trim())
    || (own && String(own).trim())
    || (display && String(display).trim())
  );
}

/** Khớp BE `crmDeadlineTsForRow`: display_phone || phone || customer.phone. */
function crmLeadMissingPhone(item: DeadlineFieldSource): boolean {
  return !crmLeadHasPhone(item);
}

function isNoDeadlineStage(stage?: DeadlineStageMeta | null): boolean {
  if (!stage) return false;
  if (stage.is_won || stage.is_lost || stage.counts_as_completed_revenue) return true;
  if (stage.canonical_slug === 'won' || stage.canonical_slug === 'lost') return true;
  if (stage.deal_report_bucket === 'won' || stage.deal_report_bucket === 'lost') return true;
  return false;
}

/** Khớp web `shouldHideCrmKanbanDeadlineOnCard`. */
function shouldHideDeadline(item: DeadlineFieldSource, stage?: DeadlineStageMeta | null): boolean {
  if (item?.deadline_disabled_at) return true;
  if (crmLeadMissingPhone(item)) return true;
  if (item?.is_interacted) return true;
  if (isNoDeadlineStage(stage || item?.stage)) return true;
  return false;
}

function slaDeadlineTs(
  stageEnteredAt: string | null | undefined,
  stage: DeadlineStageMeta | null | undefined,
  item: DeadlineFieldSource,
): number | null {
  if (crmLeadMissingPhone(item)) return null;
  if (!stageEnteredAt || !stage) return null;
  if (isNoDeadlineStage(stage)) return null;
  const slaDays = effectivePipelineStageSlaDays(stage.sla_days);
  if (slaDays == null) return null;
  return endOfVnCalendarDayAfterEntered(stageEnteredAt, slaDays).getTime();
}

function fieldToSource(field?: string | null): 'kanban' | 'task' | 'expected_close' | null {
  if (field === 'kanban_deadline_at') return 'kanban';
  if (field === 'crm_next_open_task_deadline') return 'task';
  if (field === 'expected_close_date') return 'expected_close';
  return null;
}

/**
 * Gom cột + badge Deadline — khớp BE `crmDeadlineTsForRow` / web
 * `resolveCrmLeadDeadlineBucketSource` (không dùng shouldHide / deadline_disabled_at).
 */
export function resolveDeadlineBucketTs(
  item: DeadlineFieldSource,
  config?: DeadlineConfig | null,
  stageOverride?: DeadlineStageMeta | null,
): { deadlineTs: number | null; source: string | null; forcedNoDeadline: boolean } {
  const stage = stageOverride || item.stage || null;
  if (!crmLeadHasPhone(item) || item?.is_interacted || isNoDeadlineStage(stage)) {
    return { deadlineTs: null, source: null, forcedNoDeadline: true };
  }

  for (const field of ['crm_next_open_task_deadline', 'kanban_deadline_at'] as const) {
    const raw = item[field];
    if (!raw || String(raw).trim() === '') continue;
    const ts = new Date(raw).getTime();
    if (!Number.isNaN(ts)) {
      return {
        deadlineTs: ts,
        source: field === 'crm_next_open_task_deadline' ? 'task' : 'kanban',
        forcedNoDeadline: false,
      };
    }
  }

  const slaTs = slaDeadlineTs(item.stage_entered_at, stage, item);
  if (slaTs != null) return { deadlineTs: slaTs, source: 'sla', forcedNoDeadline: false };

  const cfg = config || {};
  const primary = String(cfg.primary_field || 'crm_next_open_task_deadline');
  const fallback = String(cfg.fallback_field || 'expected_close_date');
  for (const field of [primary, fallback]) {
    if (field === 'crm_next_open_task_deadline' || field === 'kanban_deadline_at') continue;
    let raw: string | null | undefined;
    if (field === 'expected_close_date') raw = item.expected_close_date;
    else if (field === 'next_follow_up') raw = item.next_follow_up;
    else if (field === 'next_follow_up_at') raw = item.next_follow_up_at;
    else continue;
    if (!raw) continue;
    const ts = new Date(raw).getTime();
    if (!Number.isNaN(ts)) {
      return { deadlineTs: ts, source: fieldToSource(field), forcedNoDeadline: false };
    }
  }

  return { deadlineTs: null, source: null, forcedNoDeadline: false };
}

/**
 * ISO hạn để gom cột / badge — khớp web bucket + BE counts.
 * (Hiển thị thẻ vẫn dùng dueIso này; ẩn UI riêng nếu cần shouldHide.)
 */
export function resolveDeadlineIso(
  item: DeadlineFieldSource,
  config?: DeadlineConfig | null,
  stageOverride?: DeadlineStageMeta | null,
): string | null {
  const picked = resolveDeadlineBucketTs(item, config, stageOverride);
  if (picked.deadlineTs == null) return null;
  return new Date(picked.deadlineTs).toISOString();
}

/** @deprecated Giữ export nếu chỗ khác còn gọi — alias bucket resolver. */
export function resolveDeadlineViewIso(
  item: DeadlineFieldSource,
  config?: DeadlineConfig | null,
  stageOverride?: DeadlineStageMeta | null,
): string | null {
  const stage = stageOverride || item.stage || null;
  if (shouldHideDeadline(item, stage)) return null;
  return resolveDeadlineIso(item, config, stageOverride);
}

export function deadlineIsoToTs(iso?: string | null): number | null {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  return Number.isNaN(ts) ? null : ts;
}
