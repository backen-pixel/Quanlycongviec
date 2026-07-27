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

/**
 * Phân cột theo timestamp hạn — copy logic web `resolveBucket`.
 */
export function resolveDeadlineBucket(
  deadlineTs: number | null | undefined,
  buckets?: Partial<Record<DeadlineBucketKey, DeadlineBucketMeta>> | null,
): DeadlineBucketKey {
  if (deadlineTs == null || Number.isNaN(deadlineTs)) return 'no_deadline';

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endOfToday = startOfToday + 86400000 - 1;
  if (deadlineTs < startOfToday) return 'overdue';
  if (deadlineTs <= endOfToday) return 'today';

  const endOfTomorrow = endOfToday + 86400000;
  if (deadlineTs <= endOfTomorrow) return 'tomorrow';

  // Tuần bắt đầu Thứ Hai — «Tuần này» = sau ngày mai đến hết tuần
  const dow = (now.getDay() + 6) % 7;
  const startOfThisWeek = startOfToday - dow * 86400000;
  const endOfThisWeek = startOfThisWeek + 7 * 86400000 - 1;
  if (deadlineTs <= endOfThisWeek) return 'this_week';
  const endOfNextWeek = endOfThisWeek + 7 * 86400000;
  if (deadlineTs <= endOfNextWeek) return 'next_week';

  const inDays = (n: number) => startOfToday + n * 86400000;
  const d2 = buckets?.in_2_weeks?.days ?? 14;
  const d3 = buckets?.in_3_weeks?.days ?? 21;
  const d4 = buckets?.in_4_weeks?.days ?? 28;
  const d1m = buckets?.in_1_month?.days ?? 30;
  if (deadlineTs <= inDays(d2)) return 'in_2_weeks';
  if (deadlineTs <= inDays(d3)) return 'in_3_weeks';
  if (deadlineTs <= inDays(d4)) return 'in_4_weeks';
  if (deadlineTs <= inDays(d1m)) return 'in_1_month';

  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  const endOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 1).getTime() - 1;
  if (deadlineTs >= startOfNextMonth && deadlineTs <= endOfNextMonth) return 'next_month';
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

function crmLeadMissingPhone(item: DeadlineFieldSource): boolean {
  if (item && Object.prototype.hasOwnProperty.call(item, 'display_phone')) {
    return !item.display_phone || !String(item.display_phone).trim();
  }
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
 * Khớp web `resolveCrmLeadEffectiveDeadlineSource`:
 * Deadline nhiệm vụ → Deadline tự setup → SLA cột.
 */
function resolveEffectiveDeadlineTs(
  item: DeadlineFieldSource,
  stage: DeadlineStageMeta | null,
): { deadlineTs: number | null; source: string | null } {
  if (shouldHideDeadline(item, stage)) {
    return { deadlineTs: null, source: null };
  }

  const taskIso = item.crm_next_open_task_deadline;
  if (taskIso != null && String(taskIso).trim() !== '') {
    const ts = new Date(taskIso).getTime();
    if (!Number.isNaN(ts)) return { deadlineTs: ts, source: 'task' };
  }

  const manual = item.kanban_deadline_at;
  if (manual != null && String(manual).trim() !== '') {
    const ts = new Date(manual).getTime();
    if (!Number.isNaN(ts)) return { deadlineTs: ts, source: 'kanban' };
  }

  const slaTs = slaDeadlineTs(item.stage_entered_at, stage, item);
  if (slaTs != null) return { deadlineTs: slaTs, source: 'sla' };

  return { deadlineTs: null, source: null };
}

/**
 * Nguồn hạn view Deadline — khớp web `resolveCrmLeadDeadlineViewSource`
 * (task → kanban → SLA; rồi config primary/fallback chỉ cho expected_close).
 */
export function resolveDeadlineIso(
  item: DeadlineFieldSource,
  config?: DeadlineConfig | null,
  stageOverride?: DeadlineStageMeta | null,
): string | null {
  const stage = stageOverride || item.stage || null;
  const primary = resolveEffectiveDeadlineTs(item, stage);
  if (primary.deadlineTs != null) {
    return new Date(primary.deadlineTs).toISOString();
  }

  if (shouldHideDeadline(item, stage)) return null;

  const cfg = config || {};
  const readTs = (field?: string | null): number | null => {
    if (!field) return null;
    let v: string | null | undefined;
    if (field === 'kanban_deadline_at') v = item.kanban_deadline_at;
    else if (field === 'crm_next_open_task_deadline') v = item.crm_next_open_task_deadline;
    else if (field === 'expected_close_date') v = item.expected_close_date;
    else return null;
    if (!v) return null;
    const ts = new Date(v).getTime();
    return Number.isNaN(ts) ? null : ts;
  };

  const primaryField = cfg.primary_field || 'crm_next_open_task_deadline';
  const fallbackField = cfg.fallback_field || 'expected_close_date';
  const pTs = readTs(primaryField);
  const pSrc = fieldToSource(primaryField);
  if (pTs != null && pSrc !== 'task' && pSrc !== 'kanban') {
    return new Date(pTs).toISOString();
  }
  const fTs = readTs(fallbackField);
  const fSrc = fieldToSource(fallbackField);
  if (fTs != null && fSrc !== 'task' && fSrc !== 'kanban') {
    return new Date(fTs).toISOString();
  }

  return null;
}

export function deadlineIsoToTs(iso?: string | null): number | null {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  return Number.isNaN(ts) ? null : ts;
}
