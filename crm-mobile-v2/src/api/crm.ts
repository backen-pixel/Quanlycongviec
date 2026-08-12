import { colorFromName, dateLabel, initialsFromName } from '../lib/media';
import { daysSince, formatVnd } from '../lib/format';
import {
  crmDeadlineStartOfTodayVnMs,
  resolveDeadlineBucket,
  resolveDeadlineIso,
  type DeadlineBucketKey,
  type DeadlineConfig,
  type DeadlineStageMeta,
} from '../lib/crmDeadlineBuckets';
import {
  isDeadlineMembershipStage,
  splitDealStagesForCrmTabsMulti,
} from '../lib/crmPipelineTabs';
import { getDeadlinePerfLimits } from '../lib/devicePerf';
import { api } from './client';
import { fetchCrmCompanies as fetchCrmCompaniesMeta } from './crmMeta';
import type {
  CrmBoard,
  CrmHubData,
  CrmKanbanItem,
  CrmPipelineStage,
  CrmStageCache,
  Deal,
  Lead,
  LeadTemp,
  PlannerItem,
} from '../types';

type ApiStage = {
  id?: string;
  name?: string | null;
  color?: string | null;
  icon?: string | null;
  order_index?: number;
  pipeline_id?: string | null;
  pipeline_type?: string | null;
  is_won?: boolean | null;
  is_lost?: boolean | null;
  counts_as_expected_revenue?: boolean | null;
  counts_as_completed_revenue?: boolean | null;
  requires_deadline?: boolean | null;
  canonical_slug?: string | null;
  deal_report_bucket?: string | null;
  sla_days?: number | null;
};
type ApiLead = {
  id: string;
  code?: string | null;
  title?: string | null;
  type?: string | null;
  install_address?: string | null;
  phone?: string | null;
  display_phone?: string | null;
  estimated_value?: number | null;
  created_at?: string | null;
  assigned_to?: string | null;
  lead_owner_id?: string | null;
  stage_id?: string | null;
  region_id?: string | null;
  stage_entered_at?: string | null;
  is_interacted?: boolean | null;
  deadline_disabled_at?: string | null;
  kanban_deadline_at?: string | null;
  crm_next_open_task_deadline?: string | null;
  next_follow_up?: string | null;
  next_follow_up_at?: string | null;
  expected_close_date?: string | null;
  project_id?: string | null;
  sx_pipeline_stage?: {
    id?: string | null;
    name?: string | null;
    color?: string | null;
    icon?: string | null;
  } | null;
  vc_pipeline_stage?: {
    id?: string | null;
    name?: string | null;
    color?: string | null;
    icon?: string | null;
  } | null;
  stage?: ApiStage | null;
  customer?: { full_name?: string | null; phone?: string | null; address?: string | null } | null;
  company?: { id?: string | null; name?: string | null; short_name?: string | null } | null;
  company_id?: string | null;
  assignee?: { id?: string | null; full_name?: string | null } | null;
  lead_owner?: { id?: string | null; full_name?: string | null } | null;
  source?: { name?: string | null } | null;
};

function tempFromStage(name?: string | null): LeadTemp {
  const s = (name || '').toLowerCase();
  if (/hot|nóng/.test(s)) return 'hot';
  if (/warm|ấm/.test(s)) return 'warm';
  if (/cold|lạnh|nguội/.test(s)) return 'cold';
  return 'new';
}

function ownerOf(it: ApiLead): string {
  return it.assignee?.full_name || it.lead_owner?.full_name || 'Chưa giao';
}

function ownerIdOf(it: ApiLead): string {
  return (
    it.assigned_to ||
    it.assignee?.id ||
    it.lead_owner_id ||
    it.lead_owner?.id ||
    'unassigned'
  );
}

function dueOf(it: ApiLead): string | null {
  // Ưu tiên "Deadline thẻ" (kanban_deadline_at) — đồng bộ với web Kanban,
  // sau đó tới deadline task mở, follow-up, rồi expected_close_date.
  return (
    it.kanban_deadline_at ||
    it.crm_next_open_task_deadline ||
    it.next_follow_up ||
    it.next_follow_up_at ||
    it.expected_close_date ||
    null
  );
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const PAGE_SIZE = 25;
/** Số bản ghi mỗi lần tải cho một cột kanban — nhỏ = first paint nhanh hơn. */
export const KANBAN_PAGE_SIZE = 20;

const STAGES_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_STAGES_CACHE = 24;
const stagesCache = new Map<string, { stages: CrmPipelineStage[]; at: number }>();
const stagesInflight = new Map<string, Promise<CrmPipelineStage[]>>();

/** Xóa entry hết hạn + giữ tối đa `maxEntries` (cũ nhất bị đá). */
function pruneTimedMap<T extends { at: number }>(
  map: Map<string, T>,
  ttlMs: number,
  maxEntries: number,
): void {
  const now = Date.now();
  for (const [k, v] of map) {
    if (now - v.at >= ttlMs) map.delete(k);
  }
  if (map.size <= maxEntries) return;
  const ranked = [...map.entries()].sort((a, b) => a[1].at - b[1].at);
  const drop = ranked.length - maxEntries;
  for (let i = 0; i < drop; i++) map.delete(ranked[i][0]);
}

export function peekPipelineStagesCached(
  type: 'lead' | 'deal',
  opts?: CrmStageFetchOpts,
): CrmPipelineStage[] | null {
  const key = stagesCacheKey(type, opts);
  const hit = stagesCache.get(key);
  if (hit && Date.now() - hit.at < STAGES_CACHE_TTL_MS) return hit.stages;
  return null;
}

function stagesCacheKey(type: 'lead' | 'deal', opts?: CrmStageFetchOpts): string {
  return [
    type,
    opts?.pipelineId || '',
    opts?.companyId || '',
    opts?.regionId || '',
  ].join('|');
}

/** Cache tổng/badge phải gồm bộ lọc list — tránh warm (không SĐT) đè Hub (Có SĐT). */
function totalsCacheKey(type: 'lead' | 'deal', opts?: CrmStageFetchOpts): string {
  return [
    'totals',
    type,
    opts?.pipelineId || '',
    opts?.companyId || '',
    opts?.regionId || '',
    opts?.phoneFilter || '',
    opts?.assignedTo || '',
    opts?.dateFrom || '',
    opts?.dateTo || '',
    opts?.search || '',
  ].join('|');
}

async function fetchPipelineStagesCached(
  type: 'lead' | 'deal',
  opts?: CrmStageFetchOpts,
): Promise<CrmPipelineStage[]> {
  const key = stagesCacheKey(type, opts);
  const hit = stagesCache.get(key);
  if (hit && Date.now() - hit.at < STAGES_CACHE_TTL_MS) return hit.stages;
  let pending = stagesInflight.get(key);
  if (!pending) {
    pending = fetchPipelineStagesUncached(type, { ...opts, signal: undefined })
      .then((stages) => {
        stagesCache.set(key, { stages, at: Date.now() });
        pruneTimedMap(stagesCache, STAGES_CACHE_TTL_MS, MAX_STAGES_CACHE);
        return stages;
      })
      .finally(() => {
        if (stagesInflight.get(key) === pending) stagesInflight.delete(key);
      });
    stagesInflight.set(key, pending);
  }
  return pending;
}

/** Xóa cache stages (sau refresh thủ công nếu cần). */
export function invalidatePipelineStagesCache(type?: 'lead' | 'deal', opts?: CrmStageFetchOpts) {
  if (type && opts) {
    stagesCache.delete(stagesCacheKey(type, opts));
    stagesInflight.delete(stagesCacheKey(type, opts));
    return;
  }
  if (type) {
    for (const key of stagesCache.keys()) {
      if (key.startsWith(`${type}|`)) stagesCache.delete(key);
    }
    for (const key of [...stagesInflight.keys()]) {
      if (key.startsWith(`${type}|`)) stagesInflight.delete(key);
    }
    return;
  }
  stagesCache.clear();
  stagesInflight.clear();
}

export type CrmStageFetchOpts = {
  signal?: AbortSignal;
  search?: string;
  assignedTo?: string;
  phoneFilter?: '' | 'has_phone' | 'no_phone';
  dateFrom?: string;
  dateTo?: string;
  companyId?: string;
  regionId?: string;
  pipelineId?: string;
  /** Kanban bootstrap: bỏ đếm toàn pipeline — trả stages + trang đầu ngay. */
  skipCounts?: boolean;
  /** Kanban bootstrap: bỏ deadline task + user flags + production staff enrich. */
  lite?: boolean;
};

export type CrmStagePage = {
  items: CrmKanbanItem[];
  hasMore: boolean;
  nextOffset: number;
  total: number;
};

export type CrmBoardBootstrap = {
  stages: CrmPipelineStage[];
  stageCounts: Record<string, number>;
  initialStageId: string;
  initialPage: CrmStagePage;
  /** Có khi dùng GET /crm/kanban-bootstrap — tránh thêm request listTotal. */
  listTotal?: number;
};

export type CrmPage<T> = { data: T[]; hasMore: boolean; total: number; nextOffset: number };

function parsePayload(
  payload: unknown,
  pageLimit = PAGE_SIZE,
): { rows: ApiLead[]; hasMore: boolean; total: number; nextOffset: number } {
  const p = (payload ?? {}) as Record<string, unknown>;
  const rows = (Array.isArray(p) ? p : Array.isArray(p.data) ? p.data : []) as ApiLead[];
  const total = typeof p.total === 'number' ? p.total : rows.length;
  const nextOffset = typeof p.nextOffset === 'number' ? p.nextOffset : rows.length;
  const hasMore =
    typeof p.hasMore === 'boolean'
      ? p.hasMore
      : typeof p.total === 'number'
        ? nextOffset < (p.total as number)
        : rows.length >= pageLimit;
  return { rows, hasMore, total, nextOffset };
}

function mapKanbanItem(it: ApiLead, kind: 'lead' | 'deal'): CrmKanbanItem {
  const owner = ownerOf(it);
  const ownerId = ownerIdOf(it);
  const due = dueOf(it);
  const overdue = !!due && new Date(due).getTime() < startOfToday();
  const stageId = String(it.stage?.id || it.stage_id || '');
  return {
    id: it.id,
    kind,
    code: it.code || (kind === 'lead' ? 'LEAD' : 'DEAL'),
    title: it.title || (kind === 'lead' ? 'Lead chưa đặt tên' : 'Deal chưa đặt tên'),
    stageId,
    regionId: String(it.region_id || ''),
    stageName: it.stage?.name || (kind === 'lead' ? 'Mới' : 'Deal mới'),
    stageColor: it.stage?.color || '',
    stageIcon: it.stage?.icon || undefined,
    contactName: it.customer?.full_name || '—',
    phone: it.customer?.phone || it.phone || '',
    companyName: it.company?.name || it.company?.short_name || undefined,
    companyId: String(it.company_id || it.company?.id || ''),
    sourceLabel: it.source?.name || undefined,
    valueLabel: (() => {
      const label = formatVnd(it.estimated_value);
      return label !== 'Chưa định giá' ? label : undefined;
    })(),
    estimatedValue: it.estimated_value == null || Number.isNaN(Number(it.estimated_value))
      ? null
      : Number(it.estimated_value),
    temp: kind === 'lead' ? tempFromStage(it.stage?.name) : undefined,
    ownerId,
    assignedToId: String(it.assigned_to || it.assignee?.id || ''),
    leadOwnerId: String(it.lead_owner_id || it.lead_owner?.id || ''),
    ownerName: owner,
    ownerInitials: initialsFromName(owner),
    ownerColor: colorFromName(owner),
    createdAt: it.created_at,
    dueIso: due,
    overdue,
    isInteracted: !!it.is_interacted,
    projectId: it.project_id ? String(it.project_id) : null,
    sxPipelineStage: it.sx_pipeline_stage
      ? {
          id: it.sx_pipeline_stage.id != null ? String(it.sx_pipeline_stage.id) : null,
          name: it.sx_pipeline_stage.name || null,
          color: it.sx_pipeline_stage.color || null,
          icon: it.sx_pipeline_stage.icon || null,
        }
      : null,
    vcPipelineStage: it.vc_pipeline_stage
      ? {
          id: it.vc_pipeline_stage.id != null ? String(it.vc_pipeline_stage.id) : null,
          name: it.vc_pipeline_stage.name || null,
          color: it.vc_pipeline_stage.color || null,
          icon: it.vc_pipeline_stage.icon || null,
        }
      : null,
  };
}

function mapLead(it: ApiLead): Lead {
  const owner = ownerOf(it);
  const days = daysSince(it.created_at);
  const temp = tempFromStage(it.stage?.name);
  return {
    id: it.id,
    code: it.code || 'LEAD',
    title: it.title || 'Lead chưa đặt tên',
    source: it.source?.name ? `[${it.source.name}]` : '',
    location: it.install_address || it.customer?.address || it.company?.short_name || '—',
    contactName: it.customer?.full_name || '—',
    phone: it.customer?.phone || it.phone || '',
    temp,
    status: it.stage?.name || 'Mới',
    date: dateLabel(it.created_at),
    deadlineLabel: `${days} ngày trong pipeline`,
    overdue: days > 30,
    ownerName: owner,
    ownerInitials: initialsFromName(owner),
    ownerColor: colorFromName(owner),
  };
}

function mapDeal(it: ApiLead): Deal {
  const owner = ownerOf(it);
  const days = daysSince(it.created_at);
  return {
    id: it.id,
    code: it.code || 'DEAL',
    title: it.title || 'Deal chưa đặt tên',
    value: formatVnd(it.estimated_value),
    stage: it.stage?.name || 'Deal mới',
    location: it.install_address || it.customer?.address || it.company?.short_name || '—',
    contactName: it.customer?.full_name || '—',
    phone: it.customer?.phone || it.phone || '',
    date: dateLabel(it.created_at),
    deadlineLabel: `${days} ngày đàm phán`,
    overdue: days > 30,
    ownerName: owner,
    ownerInitials: initialsFromName(owner),
    ownerColor: colorFromName(owner),
  };
}

/** Lấy danh sách cột pipeline CRM (theo công ty / khu vực / pipeline_id nếu có). */
/** Lấy danh sách cột pipeline CRM (theo công ty / khu vực / pipeline_id nếu có). */
async function fetchPipelineStagesUncached(
  type: 'lead' | 'deal',
  opts?: CrmStageFetchOpts,
): Promise<CrmPipelineStage[]> {
  const params: Record<string, string> = { type };
  if (opts?.pipelineId) {
    params.pipeline_id = opts.pipelineId;
  } else if (opts?.companyId) {
    params.company_id = opts.companyId;
    if (opts.regionId && opts.regionId !== '__none__') params.region_id = opts.regionId;
  }
  const { data } = await api.get<ApiStage[]>('/crm/pipeline-stages', {
    params,
    signal: opts?.signal,
  });
  const rows = Array.isArray(data) ? data : [];
  return rows
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    .map((s, i) => mapApiStageFields(s, type, i))
    .filter((s) => s.id);
}

/** Public: có cache TTL — dùng cho Hub badge / warm. */
export async function fetchPipelineStages(
  type: 'lead' | 'deal',
  opts?: CrmStageFetchOpts,
): Promise<CrmPipelineStage[]> {
  return fetchPipelineStagesCached(type, opts);
}

/** Lead/Deal đã phân loại = có stage_id thuộc pipeline đang active. */
export function isClassifiedKanbanItem(item: CrmKanbanItem, stageIds: Set<string>): boolean {
  return item.stageId !== '' && stageIds.has(item.stageId);
}

/** Gắn params lọc chung cho GET /crm/leads và batch kanban. */
function applyListParams(params: Record<string, unknown>, opts?: CrmStageFetchOpts) {
  if (opts?.search?.trim()) params.search = opts.search.trim();
  if (opts?.assignedTo) params.assigned_to = opts.assignedTo;
  if (opts?.phoneFilter) params.phone_filter = opts.phoneFilter;
  if (opts?.dateFrom) params.date_from = opts.dateFrom;
  if (opts?.dateTo) params.date_to = opts.dateTo;
  if (opts?.companyId) params.company_id = opts.companyId;
  // Khớp web `resolveCrmRegionFilterQuery`: «Chưa gán» → region_unassigned=1 (không gửi region_id).
  if (opts?.regionId === '__none__') params.region_unassigned = '1';
  else if (opts?.regionId) params.region_id = opts.regionId;
  if (opts?.skipCounts) params.skip_counts = '1';
  if (opts?.lite) params.lite = '1';
}

function crmListQueryParams(type: 'lead' | 'deal', opts?: CrmStageFetchOpts): Record<string, unknown> {
  const params: Record<string, unknown> = { type };
  applyListParams(params, opts);
  return params;
}

function mapApiStageFields(s: ApiStage, type: 'lead' | 'deal', i: number): CrmPipelineStage {
  return {
    id: String(s.id || ''),
    name: s.name || 'Stage',
    icon: s.icon || (type === 'lead' ? '📋' : '💼'),
    color: s.color || '',
    orderIndex: s.order_index ?? i,
    pipelineId: s.pipeline_id || null,
    isWon: !!s.is_won,
    isLost: !!s.is_lost,
    countsAsExpectedRevenue: !!s.counts_as_expected_revenue,
    countsAsCompletedRevenue: !!s.counts_as_completed_revenue,
    requiresDeadline: !!s.requires_deadline,
    canonicalSlug: s.canonical_slug || null,
    dealReportBucket: s.deal_report_bucket || null,
    slaDays: s.sla_days == null ? null : Number(s.sla_days),
  };
}

function mapApiStages(rows: ApiStage[], type: 'lead' | 'deal'): CrmPipelineStage[] {
  const list = Array.isArray(rows) ? rows : [];
  return list
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    .map((s, i) => mapApiStageFields(s, type, i))
    .filter((s) => s.id);
}

/** Một trang leads/deals theo cột pipeline (server-side stage_id). */
async function fetchCrmRowsForStage(
  type: 'lead' | 'deal',
  stageId: string,
  offset: number,
  limit: number,
  opts?: CrmStageFetchOpts,
): Promise<{ rows: ApiLead[]; hasMore: boolean; nextOffset: number; total: number }> {
  const params: Record<string, unknown> = { type, stage_id: stageId, limit, offset };
  applyListParams(params, opts);
  const { data } = await api.get('/crm/leads', { params, signal: opts?.signal });
  return parsePayload(data, limit);
}

/** Trang bản ghi chưa có giai đoạn hợp lệ (không gửi stage_id). */
async function fetchCrmOrphanRows(
  type: 'lead' | 'deal',
  validStageIds: Set<string>,
  offset: number,
  limit: number,
  opts?: CrmStageFetchOpts,
): Promise<{ rows: ApiLead[]; hasMore: boolean; nextOffset: number; total: number }> {
  const params: Record<string, unknown> = { type, limit: limit * 3, offset };
  applyListParams(params, opts);
  const { data } = await api.get('/crm/leads', { params, signal: opts?.signal });
  const parsed = parsePayload(data, limit * 3);
  const orphans = parsed.rows.filter((it) => {
    const sid = String(it.stage?.id || it.stage_id || '');
    return sid === '' || !validStageIds.has(sid);
  });
  const page = orphans.slice(0, limit);
  return {
    rows: page,
    hasMore: parsed.hasMore || orphans.length > limit,
    nextOffset: offset + page.length,
    total: page.length,
  };
}

/** Tổng số bản ghi từng cột — 1 request batch (RPC GROUP BY), fallback N request nếu API cũ. */
const STAGE_COUNT_CONCURRENCY = 4;

async function fetchStageCountsLegacy(
  type: 'lead' | 'deal',
  stageIds: string[],
  opts?: CrmStageFetchOpts,
): Promise<Record<string, number>> {
  if (!stageIds.length) return {};
  const results: Record<string, number> = {};
  for (let i = 0; i < stageIds.length; i += STAGE_COUNT_CONCURRENCY) {
    const chunk = stageIds.slice(i, i + STAGE_COUNT_CONCURRENCY);
    const pairs = await Promise.all(
      chunk.map(async (stageId) => {
        try {
          const { total } = await fetchCrmRowsForStage(type, stageId, 0, 1, opts);
          return [stageId, total] as const;
        } catch {
          return [stageId, 0] as const;
        }
      }),
    );
    for (const [stageId, total] of pairs) results[stageId] = total;
  }
  return results;
}

type StageCountsBatch = {
  counts: Record<string, number>;
  values: Record<string, number>;
  weightedValues: Record<string, number>;
  total: number;
};

const totalsInflight = new Map<string, Promise<StageCountsBatch>>();

/** Đếm + tổng GT theo cột pipeline trong 1 API call. */
export async function fetchCrmStageCountsBatch(
  type: 'lead' | 'deal',
  opts?: CrmStageFetchOpts,
): Promise<StageCountsBatch> {
  const key = totalsCacheKey(type, opts);
  const pending = totalsInflight.get(key);
  if (pending) return pending;

  const run = (async (): Promise<StageCountsBatch> => {
    const params = crmListQueryParams(type, opts);
    const { data } = await api.get<{
      counts?: Record<string, number>;
      values?: Record<string, number>;
      weighted_values?: Record<string, number>;
      total?: number;
    }>('/crm/stage-counts', { params, signal: opts?.signal });
    const result: StageCountsBatch = {
      counts: data?.counts && typeof data.counts === 'object' ? data.counts : {},
      values: data?.values && typeof data.values === 'object' ? data.values : {},
      weightedValues: data?.weighted_values && typeof data.weighted_values === 'object'
        ? data.weighted_values
        : {},
      total: typeof data?.total === 'number' ? data.total : 0,
    };
    setCrmTotalsCache(type, opts, result);
    return result;
  })().finally(() => {
    if (totalsInflight.get(key) === run) totalsInflight.delete(key);
  });

  totalsInflight.set(key, run);
  return run;
}

export async function fetchStageCounts(
  type: 'lead' | 'deal',
  stageIds: string[],
  opts?: CrmStageFetchOpts,
): Promise<Record<string, number>> {
  if (!stageIds.length) return {};
  try {
    const batch = await fetchCrmStageCountsBatch(type, opts);
    const picked: Record<string, number> = {};
    for (const id of stageIds) {
      if (batch.counts[id] !== undefined) picked[id] = batch.counts[id];
    }
    if (Object.keys(picked).length === stageIds.length) return picked;
    const missing = stageIds.filter((id) => picked[id] === undefined);
    const extra = missing.length ? await fetchStageCountsLegacy(type, missing, opts) : {};
    return { ...picked, ...extra };
  } catch {
    return fetchStageCountsLegacy(type, stageIds, opts);
  }
}

/**
 * Tổng lead/deal theo bộ lọc hiện tại (không lọc 1 stage).
 * Ưu tiên /crm/stage-counts — cùng nguồn với badge «Tất cả» trên List.
 * Tránh GET /crm/leads?limit=1: luồng legacy phone_filter ước lượng total sai (hay thành 2 khi chỉ có 1).
 */
export async function fetchCrmListTotal(
  type: 'lead' | 'deal',
  opts?: CrmStageFetchOpts,
): Promise<number> {
  try {
    const batch = await fetchCrmStageCountsBatch(type, opts);
    if (opts?.signal?.aborted) return 0;
    return batch.total;
  } catch {
    /* stage-counts 400 với vài bộ lọc legacy → fallback list */
  }
  const params: Record<string, unknown> = { type, limit: KANBAN_PAGE_SIZE, offset: 0 };
  applyListParams(params, opts);
  const { data } = await api.get('/crm/leads', { params, signal: opts?.signal });
  return parsePayload(data, KANBAN_PAGE_SIZE).total;
}

/** Trang danh sách Lead/Deal (có hoặc không lọc stage) — dùng màn list tab. */
export async function fetchCrmListPage(
  type: 'lead' | 'deal',
  offset: number,
  limit = KANBAN_PAGE_SIZE,
  opts?: CrmStageFetchOpts & { stageId?: string },
): Promise<CrmStagePage> {
  const params: Record<string, unknown> = { type, limit, offset };
  if (opts?.stageId) params.stage_id = opts.stageId;
  applyListParams(params, opts);
  const { data } = await api.get('/crm/leads', { params, signal: opts?.signal });
  const page = parsePayload(data, limit);
  return {
    items: page.rows.map((it) => mapKanbanItem(it, type)),
    hasMore: page.hasMore,
    nextOffset: page.nextOffset,
    total: page.total,
  };
}

/** Gợi ý tìm nhanh (dropdown) — tối đa `limit` lead/deal khớp search, không theo cột. */
export async function fetchCrmSearchSuggest(
  type: 'lead' | 'deal',
  query: string,
  opts?: CrmStageFetchOpts,
  limit = 10,
): Promise<{ items: CrmKanbanItem[]; total: number }> {
  const q = query.trim();
  if (q.length < 2) return { items: [], total: 0 };
  const page = await fetchCrmListPage(type, 0, limit, {
    ...opts,
    search: q,
    lite: true,
    skipCounts: true,
  });
  return { items: page.items, total: page.total };
}

const LIST_ALL_PAGE_SIZE = 500;
/** Soft cap — tránh tải hàng nghìn bản ghi vào RAM nếu còn chỗ gọi hàm này. */
const LIST_ALL_MAX_ROWS = 1500;

/**
 * @deprecated Ưu tiên stage-counts / phân trang. Chỉ dùng khi thật sự cần dump có giới hạn.
 * Tải lead/deal theo bộ lọc (phân trang) — dừng khi hết hoặc đạt LIST_ALL_MAX_ROWS.
 */
export async function fetchCrmListRowsAll(
  type: 'lead' | 'deal',
  opts?: CrmStageFetchOpts,
): Promise<Array<{ stage_id?: string | null; stage?: { id?: string }; company_id?: string | null }>> {
  const rows: Array<{ stage_id?: string | null; stage?: { id?: string }; company_id?: string | null }> = [];
  let offset = 0;
  while (rows.length < LIST_ALL_MAX_ROWS) {
    const limit = Math.min(LIST_ALL_PAGE_SIZE, LIST_ALL_MAX_ROWS - rows.length);
    const params: Record<string, unknown> = { type, limit, offset, lite: '1' };
    applyListParams(params, opts);
    const { data } = await api.get('/crm/leads', { params, signal: opts?.signal });
    const page = parsePayload(data, limit);
    rows.push(...page.rows);
    if (!page.hasMore || page.rows.length === 0) break;
    offset = page.nextOffset;
  }
  return rows;
}

/** Tải một trang bản ghi của cột (đã lọc phân loại). */
export async function fetchCrmStagePage(
  type: 'lead' | 'deal',
  stageId: string,
  offset: number,
  limit = KANBAN_PAGE_SIZE,
  opts?: CrmStageFetchOpts,
  validStageIds?: Set<string>,
): Promise<CrmStagePage> {
  const isOrphan = stageId === '__orphan_no_stage__';
  const { rows, hasMore, nextOffset, total } = isOrphan
    ? await fetchCrmOrphanRows(type, validStageIds ?? new Set(), offset, limit, opts)
    : await fetchCrmRowsForStage(type, stageId, offset, limit, opts);
  const stageIds = new Set(isOrphan ? [] : [stageId]);
  const items = rows
    .map((it) => mapKanbanItem(it, type))
    .filter((it) => (isOrphan ? true : isClassifiedKanbanItem(it, stageIds)));
  return { items, hasMore, nextOffset, total: isOrphan ? items.length : total };
}

/** Bootstrap kanban — 1 request: stages + counts + trang đầu cột active. */
async function fetchCrmKanbanBootstrapRemote(
  type: 'lead' | 'deal',
  initialStageId?: string,
  opts?: CrmStageFetchOpts,
): Promise<CrmBoardBootstrap | null> {
  const params: Record<string, unknown> = {
    ...crmListQueryParams(type, opts),
    limit: KANBAN_PAGE_SIZE,
  };
  if (initialStageId) params.stage_id = initialStageId;
  const { data } = await api.get<{
    stages?: ApiStage[];
    stageCounts?: Record<string, number>;
    listTotal?: number;
    initialStageId?: string;
    initialPage?: {
      data?: ApiLead[];
      total?: number;
      hasMore?: boolean;
      nextOffset?: number;
    };
  }>('/crm/kanban-bootstrap', { params, signal: opts?.signal });

  const stages = mapApiStages(data?.stages || [], type);
  if (!stages.length) return null;

  const sid =
    data?.initialStageId && stages.some((s) => s.id === data.initialStageId)
      ? data.initialStageId
      : initialStageId && stages.some((s) => s.id === initialStageId)
        ? initialStageId
        : stages[0].id;
  const ip = data?.initialPage || {};
  const rows = Array.isArray(ip.data) ? ip.data : [];
  const items = rows.map((it) => mapKanbanItem(it, type));
  const total = typeof ip.total === 'number' ? ip.total : items.length;
  const nextOffset = typeof ip.nextOffset === 'number' ? ip.nextOffset : items.length;

  const key = stagesCacheKey(type, opts);
  stagesCache.set(key, { stages, at: Date.now() });
  // skip_counts: server trả listTotal = tổng 1 cột — không cache/hiển thị như tổng pipeline.
  const listTotal = opts?.skipCounts
    ? undefined
    : (typeof data?.listTotal === 'number' ? data.listTotal : undefined);
  const stageCounts = data?.stageCounts && typeof data.stageCounts === 'object'
    ? data.stageCounts
    : { [sid]: total };

  setCrmBootstrapCache(type, initialStageId, opts, {
    stages,
    stageCounts,
    listTotal,
    initialStageId: sid,
    initialPage: {
      items,
      hasMore: typeof ip.hasMore === 'boolean' ? ip.hasMore : nextOffset < total,
      nextOffset,
      total,
    },
  });

  return {
    stages,
    stageCounts,
    listTotal,
    initialStageId: sid,
    initialPage: {
      items,
      hasMore: typeof ip.hasMore === 'boolean' ? ip.hasMore : nextOffset < total,
      nextOffset,
      total,
    },
  };
}

/**
 * Khởi tạo cực nhanh: ưu tiên GET /crm/kanban-bootstrap (1 round-trip),
 * fallback stages cache + trang đầu cột.
 */
export async function fetchCrmBoardInitial(
  type: 'lead' | 'deal',
  initialStageId?: string,
  opts?: CrmStageFetchOpts,
): Promise<CrmBoardBootstrap> {
  const fastOpts: CrmStageFetchOpts = {
    ...opts,
    skipCounts: opts?.skipCounts ?? true,
    lite: opts?.lite ?? true,
  };
  const cached = peekCrmBootstrapCache(type, initialStageId, fastOpts);
  if (cached?.stages.length) return cached;

  try {
    const remote = await fetchCrmKanbanBootstrapRemote(type, initialStageId, fastOpts);
    if (remote?.stages.length) return remote;
  } catch {
    /* fallback bên dưới */
  }

  const cachedStages = peekPipelineStagesCached(type, opts);
  if (cachedStages?.length) {
    const sid =
      initialStageId && cachedStages.some((s) => s.id === initialStageId)
        ? initialStageId
        : cachedStages[0].id;
    const initialPage = await fetchCrmStagePage(type, sid, 0, KANBAN_PAGE_SIZE, opts);
    return {
      stages: cachedStages,
      stageCounts: { [sid]: initialPage.total },
      initialStageId: sid,
      initialPage,
    };
  }

  const stages = await fetchPipelineStagesCached(type, opts);
  if (!stages.length) {
    return {
      stages: [],
      stageCounts: {},
      initialStageId: '',
      initialPage: { items: [], hasMore: false, nextOffset: 0, total: 0 },
    };
  }
  const sid =
    initialStageId && stages.some((s) => s.id === initialStageId)
      ? initialStageId
      : stages[0].id;
  const initialPage = await fetchCrmStagePage(type, sid, 0, KANBAN_PAGE_SIZE, opts);
  return {
    stages,
    stageCounts: { [sid]: initialPage.total },
    initialStageId: sid,
    initialPage,
  };
}

/** Làm nóng cache pipeline + bootstrap + tổng số Lead/Deal (gọi sớm từ Menu). */
export async function warmCrmHubPipelines(companyId?: string, signal?: AbortSignal): Promise<void> {
  const opts: CrmStageFetchOpts = { companyId, signal, skipCounts: true, lite: true };
  void warmCrmHubStageCounts(companyId, signal);
  await Promise.all([
    fetchPipelineStagesCached('lead', opts),
    fetchPipelineStagesCached('deal', opts),
    warmCrmHubBootstrap(companyId, signal),
  ]);
}

/** Prefetch tổng + badge cột — cùng mặc định Có SĐT như Hub. */
export function warmCrmHubStageCounts(companyId?: string, signal?: AbortSignal): void {
  const opts: CrmStageFetchOpts = {
    companyId,
    signal,
    lite: true,
    phoneFilter: 'has_phone',
  };
  void Promise.all([
    fetchCrmStageCountsBatch('lead', opts).catch(() => null),
    fetchCrmStageCountsBatch('deal', opts).catch(() => null),
  ]);
}

/** Prefetch kanban bootstrap lite — cùng mặc định Có SĐT như Hub để mở tab không miss cache. */
export async function warmCrmHubBootstrap(companyId?: string, signal?: AbortSignal): Promise<void> {
  const opts: CrmStageFetchOpts = {
    companyId,
    signal,
    skipCounts: true,
    lite: true,
    phoneFilter: 'has_phone',
  };
  await Promise.all([
    fetchCrmBoardInitial('lead', undefined, opts).catch(() => null),
    fetchCrmBoardInitial('deal', undefined, opts).catch(() => null),
  ]);
}

/** Prefetch trang đầu các cột lân cận — chuyển cột không phải chờ mạng. */
export async function prefetchCrmNeighborStages(
  type: 'lead' | 'deal',
  stages: CrmPipelineStage[],
  centerStageId: string,
  opts?: CrmStageFetchOpts,
): Promise<Record<string, CrmStageCache>> {
  const idx = stages.findIndex((s) => s.id === centerStageId);
  if (idx < 0) return {};
  const neighborIds = [stages[idx - 1]?.id, stages[idx + 1]?.id].filter(Boolean) as string[];
  if (!neighborIds.length) return {};
  const validStageIds = new Set(stages.map((s) => s.id));
  const entries = await Promise.all(
    neighborIds.map(async (stageId) => {
      try {
        const page = await fetchCrmStagePage(type, stageId, 0, KANBAN_PAGE_SIZE, opts, validStageIds);
        return [
          stageId,
          {
            items: page.items,
            hasMore: page.hasMore,
            nextOffset: page.nextOffset,
            loaded: true,
          } satisfies CrmStageCache,
        ] as const;
      } catch {
        return null;
      }
    }),
  );
  return Object.fromEntries(entries.filter(Boolean) as [string, CrmStageCache][]);
}

const HUB_CACHE_TTL_MS = 3 * 60 * 1000;
const BOOTSTRAP_CACHE_TTL_MS = 2 * 60 * 1000;
const TOTALS_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_HUB_CACHE = 16;
const MAX_BOOTSTRAP_CACHE = 24;
const MAX_TOTALS_CACHE = 32;
const hubCache = new Map<string, { snapshot: CrmHubCacheSnapshot; at: number }>();
const bootstrapCache = new Map<string, { boot: CrmBoardBootstrap; at: number }>();
const totalsCache = new Map<string, { counts: Record<string, number>; total: number; at: number }>();

function setCrmTotalsCache(
  type: 'lead' | 'deal',
  opts: CrmStageFetchOpts | undefined,
  batch: { counts: Record<string, number>; total: number },
): void {
  totalsCache.set(totalsCacheKey(type, opts), { ...batch, at: Date.now() });
  pruneTimedMap(totalsCache, TOTALS_CACHE_TTL_MS, MAX_TOTALS_CACHE);
}

/** Tổng + badge cột đã cache — hiển thị ngay khi mở lại CrmHub. */
export function peekCrmTotalsCache(
  type: 'lead' | 'deal',
  opts?: CrmStageFetchOpts,
): { counts: Record<string, number>; total: number } | null {
  const hit = totalsCache.get(totalsCacheKey(type, opts));
  if (!hit || Date.now() - hit.at >= TOTALS_CACHE_TTL_MS) return null;
  return { counts: hit.counts, total: hit.total };
}

export function invalidateCrmTotalsCache(): void {
  totalsCache.clear();
  totalsInflight.clear();
}

function bootstrapCacheKey(
  type: 'lead' | 'deal',
  initialStageId: string | undefined,
  opts?: CrmStageFetchOpts,
): string {
  return [
    type,
    initialStageId || '',
    opts?.skipCounts ? '1' : '0',
    opts?.lite ? '1' : '0',
    opts?.phoneFilter || '',
    opts?.assignedTo || '',
    opts?.dateFrom || '',
    opts?.dateTo || '',
    opts?.search || '',
    stagesCacheKey(type, opts),
  ].join('|');
}

function peekCrmBootstrapCache(
  type: 'lead' | 'deal',
  initialStageId: string | undefined,
  opts?: CrmStageFetchOpts,
): CrmBoardBootstrap | null {
  const key = bootstrapCacheKey(type, initialStageId, opts);
  const hit = bootstrapCache.get(key);
  if (!hit || Date.now() - hit.at >= BOOTSTRAP_CACHE_TTL_MS) return null;
  return hit.boot;
}

function setCrmBootstrapCache(
  type: 'lead' | 'deal',
  initialStageId: string | undefined,
  opts: CrmStageFetchOpts | undefined,
  boot: CrmBoardBootstrap,
): void {
  bootstrapCache.set(bootstrapCacheKey(type, initialStageId, opts), { boot, at: Date.now() });
  pruneTimedMap(bootstrapCache, BOOTSTRAP_CACHE_TTL_MS, MAX_BOOTSTRAP_CACHE);
}

export function invalidateCrmBootstrapCache(): void {
  bootstrapCache.clear();
}

export type CrmHubCacheSnapshot = {
  data: CrmHubData;
  activeStageId: string;
  activeIndex: number;
};

function hubCacheKey(userId: string, type: 'lead' | 'deal', filterKey: string): string {
  return `${userId}|${type}|${filterKey}`;
}

export function peekCrmHubCache(
  userId: string,
  type: 'lead' | 'deal',
  filterKey: string,
): CrmHubCacheSnapshot | null {
  const hit = hubCache.get(hubCacheKey(userId, type, filterKey));
  if (!hit || Date.now() - hit.at >= HUB_CACHE_TTL_MS) return null;
  return hit.snapshot;
}

export function setCrmHubCache(
  userId: string,
  type: 'lead' | 'deal',
  filterKey: string,
  snapshot: CrmHubCacheSnapshot,
): void {
  hubCache.set(hubCacheKey(userId, type, filterKey), { snapshot, at: Date.now() });
  pruneTimedMap(hubCache, HUB_CACHE_TTL_MS, MAX_HUB_CACHE);
}

export function invalidateCrmHubCache(userId?: string): void {
  if (!userId) {
    hubCache.clear();
    bootstrapCache.clear();
    totalsCache.clear();
    stagesCache.clear();
    return;
  }
  for (const key of hubCache.keys()) {
    if (key.startsWith(`${userId}|`)) hubCache.delete(key);
  }
}

/**
 * Dọn cache in-memory hết hạn / vượt hạn mức — gọi khi app vào nền (session dài).
 */
export function evictStaleCrmCaches(): void {
  pruneTimedMap(stagesCache, STAGES_CACHE_TTL_MS, MAX_STAGES_CACHE);
  pruneTimedMap(hubCache, HUB_CACHE_TTL_MS, MAX_HUB_CACHE);
  pruneTimedMap(bootstrapCache, BOOTSTRAP_CACHE_TTL_MS, MAX_BOOTSTRAP_CACHE);
  pruneTimedMap(totalsCache, TOTALS_CACHE_TTL_MS, MAX_TOTALS_CACHE);
  evictStalePlannerCache();
}

/**
 * Khởi tạo đầy đủ (chậm hơn) — stages + count mọi cột + trang đầu.
 * @deprecated Ưu tiên fetchCrmBoardInitial + fetchStageCounts nền.
 */
export async function fetchCrmBoardBootstrap(
  type: 'lead' | 'deal',
  initialStageId?: string,
  opts?: CrmStageFetchOpts,
): Promise<CrmBoardBootstrap> {
  const initial = await fetchCrmBoardInitial(type, initialStageId, opts);
  if (!initial.stages.length) return initial;
  const stageCounts = await fetchStageCounts(
    type,
    initial.stages.map((s) => s.id),
    opts,
  );
  return { ...initial, stageCounts: { ...stageCounts, ...initial.stageCounts } };
}

/** @deprecated Dùng fetchCrmBoardBootstrap + fetchCrmStagePage */
export async function fetchCrmBoard(type: 'lead' | 'deal', signal?: AbortSignal): Promise<CrmBoard> {
  const boot = await fetchCrmBoardBootstrap(type, undefined, { signal });
  return { stages: boot.stages, items: boot.initialPage.items };
}

export type CrmSxProductionTarget = {
  production_company_id: string;
  workshop_type_id: string;
};

export type ProductionCompanyOption = {
  id: string;
  name: string;
  shortName?: string | null;
};

export type WorkshopProjectTypeOption = {
  id: string;
  name: string;
  companyId?: string | null;
};

const sxCompaniesCache = new Map<string, ProductionCompanyOption[]>();
const sxCompaniesInflight = new Map<string, Promise<ProductionCompanyOption[]>>();
const workshopTypesCache = new Map<string, WorkshopProjectTypeOption[]>();
const workshopTypesInflight = new Map<string, Promise<WorkshopProjectTypeOption[]>>();

function sxCompanyCacheKey(crmCompanyId?: string | null): string {
  return String(crmCompanyId || '').trim() || '__all__';
}

function mapProductionCompanies(data: unknown): ProductionCompanyOption[] {
  const rows = Array.isArray(data)
    ? data
    : Array.isArray((data as { companies?: unknown })?.companies)
      ? (data as { companies: unknown[] }).companies
      : Array.isArray((data as { data?: unknown })?.data)
        ? (data as { data: unknown[] }).data
        : [];
  return (rows as Record<string, unknown>[])
    .map((r) => {
      const id = String(r.id || r.company_id || '');
      if (!id) return null;
      const name = String(r.name || r.short_name || r.company_name || 'Công ty SX');
      return {
        id,
        name,
        shortName: r.short_name != null ? String(r.short_name) : null,
      } satisfies ProductionCompanyOption;
    })
    .filter(Boolean) as ProductionCompanyOption[];
}

function mapWorkshopTypes(data: unknown): WorkshopProjectTypeOption[] {
  const rows = Array.isArray(data)
    ? data
    : Array.isArray((data as { types?: unknown })?.types)
      ? (data as { types: unknown[] }).types
      : Array.isArray((data as { data?: unknown })?.data)
        ? (data as { data: unknown[] }).data
        : [];
  return (rows as Record<string, unknown>[])
    .map((r) => {
      const id = String(r.id || '');
      if (!id) return null;
      return {
        id,
        name: String(r.name || 'Phân loại'),
        companyId: r.company_id != null ? String(r.company_id) : null,
      } satisfies WorkshopProjectTypeOption;
    })
    .filter(Boolean) as WorkshopProjectTypeOption[];
}

/** Cache đồng bộ — mở modal SX không phải chờ mạng nếu đã prefetch. */
export function peekCrmProductionCompanies(
  crmCompanyId?: string | null,
): ProductionCompanyOption[] | null {
  const key = sxCompanyCacheKey(crmCompanyId);
  return sxCompaniesCache.has(key) ? sxCompaniesCache.get(key)! : null;
}

/** Prefetch nền danh sách công ty SX (gọi khi mở «Chuyển cột» deal). */
export function prefetchCrmProductionCompanies(crmCompanyId?: string | null): void {
  void fetchCrmProductionCompanies(crmCompanyId).catch(() => undefined);
}

/** Công ty SX được phép chọn khi ký HĐ — GET /crm/production-companies. */
export async function fetchCrmProductionCompanies(
  crmCompanyId?: string | null,
): Promise<ProductionCompanyOption[]> {
  const key = sxCompanyCacheKey(crmCompanyId);
  const cached = sxCompaniesCache.get(key);
  if (cached) return cached;
  const inflight = sxCompaniesInflight.get(key);
  if (inflight) return inflight;
  const params: Record<string, string> = {};
  if (crmCompanyId) params.company_id = String(crmCompanyId);
  const p = api
    .get<unknown>('/crm/production-companies', { params })
    .then((r) => {
      const list = mapProductionCompanies(r.data);
      sxCompaniesCache.set(key, list);
      return list;
    })
    .finally(() => {
      sxCompaniesInflight.delete(key);
    });
  sxCompaniesInflight.set(key, p);
  return p;
}

/** Phân loại / module SX — GET /workshop/project-types?module=production. */
export async function fetchWorkshopProjectTypes(
  productionCompanyId: string,
): Promise<WorkshopProjectTypeOption[]> {
  if (!productionCompanyId) return [];
  const key = String(productionCompanyId);
  const cached = workshopTypesCache.get(key);
  if (cached) return cached;
  const inflight = workshopTypesInflight.get(key);
  if (inflight) return inflight;
  const p = api
    .get<unknown>('/workshop/project-types', {
      params: { company_id: productionCompanyId, module: 'production' },
    })
    .then((r) => {
      const list = mapWorkshopTypes(r.data);
      workshopTypesCache.set(key, list);
      return list;
    })
    .finally(() => {
      workshopTypesInflight.delete(key);
    });
  workshopTypesInflight.set(key, p);
  return p;
}

/** Chuyển lead/deal sang cột pipeline khác. */
export async function moveCrmItemStage(
  id: string,
  stageId: string,
  extra?: {
    kanbanDeadlineAt?: string | null;
    productionCompanyId?: string | null;
    workshopTypeId?: string | null;
    targets?: CrmSxProductionTarget[];
  },
): Promise<void> {
  const body: Record<string, unknown> = { stage_id: stageId };
  if (extra?.kanbanDeadlineAt) {
    body.kanban_deadline_at = extra.kanbanDeadlineAt;
  }
  if (extra?.targets?.length) {
    body.targets = extra.targets;
    body.production_company_id = extra.targets[0].production_company_id;
    body.workshop_type_id = extra.targets[0].workshop_type_id;
  } else {
    if (extra?.productionCompanyId) body.production_company_id = extra.productionCompanyId;
    if (extra?.workshopTypeId) body.workshop_type_id = extra.workshopTypeId;
  }
  await api.patch(`/crm/leads/${id}/stage`, body);
}

/** Chuyển Lead → Deal (cột thắng) — khớp web POST /crm/leads/:id/convert-to-deal. */
export async function convertLeadToDeal(
  leadId: string,
  opts?: { regionId?: string | null; companyId?: string | null },
): Promise<{ id: string; code?: string }> {
  const body: Record<string, unknown> = {};
  if (opts?.regionId) body.region_id = opts.regionId;
  if (opts?.companyId) body.company_id = opts.companyId;
  const { data } = await api.post<{ id: string; code?: string }>(
    `/crm/leads/${leadId}/convert-to-deal`,
    body,
  );
  return { id: data?.id, code: data?.code };
}

/** Đặt / xóa deadline thẻ (kanban_deadline_at) — khớp web PATCH /crm/leads/:id/deadline. */
export async function setCrmKanbanDeadline(
  leadId: string,
  dateYmd: string | null,
  opts?: { reason?: string },
): Promise<void> {
  await api.patch(`/crm/leads/${leadId}/deadline`, {
    kanban_deadline_at: dateYmd ? deadlineDateToIso(dateYmd) : null,
    reason: (opts?.reason || '').trim(),
  });
}

/** Bật/tắt «đã tương tác» — POST/DELETE /crm/leads/:id/interacted. */
export async function setCrmLeadInteracted(leadId: string, next: boolean): Promise<void> {
  if (next) await api.post(`/crm/leads/${leadId}/interacted`);
  else await api.delete(`/crm/leads/${leadId}/interacted`);
}

/** Gán / đổi người phụ trách lead/deal (assigned_to ↔ lead_owner_id trên server). */
export async function updateCrmAssignee(
  leadId: string,
  assignedTo: string | null,
): Promise<{ assignedToId: string; ownerName: string }> {
  const { data } = await api.put<{
    assigned_to?: string | null;
    lead_owner_id?: string | null;
    assignee?: { id?: string | null; full_name?: string | null } | null;
    lead_owner?: { id?: string | null; full_name?: string | null } | null;
  }>(`/crm/leads/${leadId}`, { assigned_to: assignedTo });

  const assignedToId = String(
    data?.assigned_to || data?.assignee?.id || data?.lead_owner_id || data?.lead_owner?.id || assignedTo || '',
  );
  const ownerName =
    data?.assignee?.full_name ||
    data?.lead_owner?.full_name ||
    (assignedTo ? '—' : 'Chưa gán');

  return { assignedToId, ownerName };
}

/** Lấy một trang leads (dùng cho infinite scroll trong CrmHub). */
export async function fetchLeadsPage(
  offset: number,
  limit = PAGE_SIZE,
  signal?: AbortSignal,
): Promise<CrmPage<Lead>> {
  const { data } = await api.get('/crm/leads', { params: { type: 'lead', limit, offset }, signal });
  const { rows, hasMore, total, nextOffset } = parsePayload(data);
  return { data: rows.map(mapLead), hasMore, total, nextOffset };
}

/** Lấy một trang deals (dùng cho infinite scroll trong CrmHub). */
export async function fetchDealsPage(
  offset: number,
  limit = PAGE_SIZE,
  signal?: AbortSignal,
): Promise<CrmPage<Deal>> {
  const { data } = await api.get('/crm/leads', { params: { type: 'deal', limit, offset }, signal });
  const { rows, hasMore, total, nextOffset } = parsePayload(data);
  return { data: rows.map(mapDeal), hasMore, total, nextOffset };
}

function toPlannerItem(it: ApiLead, kind: 'lead' | 'deal'): PlannerItem {
  const owner = ownerOf(it);
  const ownerId = ownerIdOf(it);
  const due = dueOf(it);
  const overdue = !!due && new Date(due).getTime() < startOfToday();
  const days = daysSince(it.created_at);
  const deadlineLabel = due
    ? `Hẹn ${dateLabel(due)}`
    : kind === 'lead'
      ? `${days} ngày trong pipeline`
      : `${days} ngày đàm phán`;
  return {
    id: it.id,
    kind,
    code: it.code || (kind === 'lead' ? 'LEAD' : 'DEAL'),
    title: it.title || (kind === 'lead' ? 'Lead chưa đặt tên' : 'Deal chưa đặt tên'),
    status: it.stage?.name || (kind === 'lead' ? 'Mới' : 'Deal mới'),
    stageId: resolveStageId(it) || undefined,
    companyId: String(it.company_id || it.company?.id || '') || undefined,
    contactName: it.customer?.full_name || '—',
    phone: it.customer?.phone || it.phone || '',
    location: it.install_address || it.customer?.address || it.company?.short_name || '—',
    valueLabel: kind === 'deal' ? formatVnd(it.estimated_value) : undefined,
    temp: kind === 'lead' ? tempFromStage(it.stage?.name) : undefined,
    ownerId,
    assignedToId: String(it.assigned_to || it.assignee?.id || ''),
    leadOwnerId: String(it.lead_owner_id || it.lead_owner?.id || ''),
    ownerName: owner,
    ownerInitials: initialsFromName(owner),
    ownerColor: colorFromName(owner),
    deadlineLabel,
    dueIso: due,
    overdue,
    projectId: it.project_id ? String(it.project_id) : null,
  };
}

function resolveStageId(it: ApiLead): string {
  return String(it.stage?.id || it.stage_id || '');
}

/**
 * Chỉ giữ bản ghi đang "thực hiện": thuộc cột pipeline hợp lệ và CHƯA ở
 * giai đoạn Thắng/Hoàn thành hoặc Thua/Hủy (Planner cá nhân chỉ hiện việc đang làm).
 */
function inActivePipeline(it: ApiLead, stageById: Map<string, CrmPipelineStage>, type: 'lead' | 'deal'): boolean {
  const sid = resolveStageId(it);
  if (sid === '') return false;
  const stage = stageById.get(sid);
  if (!stage) return false;
  if (stage.isWon || stage.isLost) return false;
  const pt = it.stage?.pipeline_type;
  if (pt && pt !== type) return false;
  return true;
}

/** Khớp bộ lọc «Phụ trách» trên web CRM. */
function isMineCrmRow(it: ApiLead, userId: string, type: 'lead' | 'deal'): boolean {
  const uid = userId.toLowerCase();
  if (type === 'deal') {
    return String(it.assigned_to || '').toLowerCase() === uid;
  }
  const ids = [it.assigned_to, it.lead_owner_id, it.assignee?.id, it.lead_owner?.id]
    .filter(Boolean)
    .map((x) => String(x).toLowerCase());
  return ids.includes(uid);
}

export type PlannerFetchOpts = {
  signal?: AbortSignal;
  companyId?: string;
  /**
   * Phạm vi phụ trách:
   * - không truyền / undefined → dùng `userId` của hàm (Planner cá nhân)
   * - string → lọc đúng NV đó
   * - null → tất cả NV (admin)
   */
  assignedTo?: string | null;
};

/** Bộ lọc Planner — có SĐT + công ty; phụ trách theo opts.assignedTo. */
export function buildPlannerFetchOpts(userId: string, opts?: PlannerFetchOpts): CrmStageFetchOpts {
  const assignedTo =
    opts && Object.prototype.hasOwnProperty.call(opts, 'assignedTo')
      ? (opts.assignedTo || undefined)
      : userId;
  return {
    ...(assignedTo ? { assignedTo } : {}),
    companyId: opts?.companyId,
    phoneFilter: 'has_phone',
    lite: true,
    signal: opts?.signal,
  };
}

/** Tổng lead/deal — cùng nguồn badge CRM Hub / Planner. */
export async function fetchPlannerSectionTotal(
  type: 'lead' | 'deal',
  userId: string,
  opts?: PlannerFetchOpts,
): Promise<number> {
  const batch = await fetchCrmStageCountsBatch(type, buildPlannerFetchOpts(userId, opts));
  return batch.total;
}

/** Một trang leads/deals cho Planner — server lọc assigned_to (nếu có). */
async function fetchPlannerPage(
  type: 'lead' | 'deal',
  userId: string,
  offset: number,
  limit: number,
  opts?: PlannerFetchOpts,
): Promise<{ rows: ApiLead[]; hasMore: boolean; total: number; nextOffset: number }> {
  const params: Record<string, unknown> = { type, limit, offset };
  applyListParams(params, buildPlannerFetchOpts(userId, opts));
  const { data } = await api.get('/crm/leads', { params, signal: opts?.signal });
  return parsePayload(data, limit);
}

async function fetchPlannerStageLookup(
  type: 'lead' | 'deal',
  opts?: Pick<PlannerFetchOpts, 'companyId' | 'signal'>,
): Promise<Map<string, CrmPipelineStage>> {
  const stages = await fetchPipelineStagesCached(type, {
    companyId: opts?.companyId,
    signal: opts?.signal,
  });
  return new Map(stages.map((s) => [s.id, s]));
}

function filterRowsForPlannerKanban(
  rows: ApiLead[],
  type: 'lead' | 'deal',
  userId: string,
  stageById: Map<string, CrmPipelineStage>,
  opts?: PlannerFetchOpts,
): ApiLead[] {
  if (!rows.length) return [];
  const viewAll =
    opts && Object.prototype.hasOwnProperty.call(opts, 'assignedTo') && opts.assignedTo == null;
  const scopeId =
    opts && typeof opts.assignedTo === 'string' && opts.assignedTo
      ? opts.assignedTo
      : userId;
  return rows.filter((it) => {
    if (!inActivePipeline(it, stageById, type)) return false;
    if (viewAll) return true;
    return isMineCrmRow(it, scopeId, type);
  });
}

/** Tổng đang thực hiện (loại Thắng/Hoàn thành + Thua/Hủy) — dùng cho badge Planner. */
async function fetchPlannerActiveTotal(
  type: 'lead' | 'deal',
  userId: string,
  stageById: Map<string, CrmPipelineStage>,
  opts?: PlannerFetchOpts,
): Promise<number> {
  try {
    const batch = await fetchCrmStageCountsBatch(type, buildPlannerFetchOpts(userId, opts));
    let sum = 0;
    for (const [stageId, stage] of stageById) {
      if (stage.isWon || stage.isLost) continue;
      sum += batch.counts[stageId] || 0;
    }
    return sum;
  } catch {
    return 0;
  }
}

export type PlannerData = { leads: PlannerItem[]; deals: PlannerItem[] };

const plannerByDue = (a: PlannerItem, b: PlannerItem) => {
  if (a.dueIso && b.dueIso) return new Date(a.dueIso).getTime() - new Date(b.dueIso).getTime();
  if (a.dueIso) return -1;
  if (b.dueIso) return 1;
  return 0;
};

const PLANNER_CACHE_TTL_MS = 90 * 1000;
/** Focus lại Planner: chỉ silent refresh khi cache đã cũ hơn ngưỡng này. */
export const PLANNER_SILENT_REFRESH_AFTER_MS = 30 * 1000;
const MAX_PLANNER_CACHE = 8;
const plannerCache = new Map<string, { data: PlannerData; at: number }>();

/** Key cache theo user đăng nhập + phạm vi phụ trách. */
export function plannerCacheKey(userId: string, opts?: PlannerFetchOpts): string {
  if (opts && Object.prototype.hasOwnProperty.call(opts, 'assignedTo')) {
    if (opts.assignedTo == null) return `${userId}|all`;
    if (opts.assignedTo) return `${userId}|u:${opts.assignedTo}`;
  }
  return `${userId}|mine`;
}

function evictStalePlannerCache(): void {
  pruneTimedMap(plannerCache, PLANNER_CACHE_TTL_MS * 2, MAX_PLANNER_CACHE);
}

/** Đọc cache planner đồng bộ — kể cả khi stale, để hiện ngay trước khi refresh nền. */
export function peekPlannerCache(userId: string, opts?: PlannerFetchOpts): PlannerData | null {
  return plannerCache.get(plannerCacheKey(userId, opts))?.data ?? null;
}

/** Cache còn hạn TTL đầy đủ (90s). */
export function isPlannerCacheFresh(userId: string, opts?: PlannerFetchOpts): boolean {
  const hit = plannerCache.get(plannerCacheKey(userId, opts));
  return !!(hit && Date.now() - hit.at < PLANNER_CACHE_TTL_MS);
}

/** Tuổi cache (ms) — null nếu không có. */
export function plannerCacheAgeMs(userId: string, opts?: PlannerFetchOpts): number | null {
  const hit = plannerCache.get(plannerCacheKey(userId, opts));
  if (!hit) return null;
  return Date.now() - hit.at;
}

export function invalidatePlannerCache(userId?: string) {
  if (!userId) {
    plannerCache.clear();
    return;
  }
  for (const key of [...plannerCache.keys()]) {
    if (key === userId || key.startsWith(`${userId}|`)) plannerCache.delete(key);
  }
}

/** Ghi cache sau khi tải từng section (Planner refresh nền). */
export function setPlannerCache(userId: string, data: PlannerData, opts?: PlannerFetchOpts) {
  plannerCache.set(plannerCacheKey(userId, opts), { data, at: Date.now() });
  evictStalePlannerCache();
}

/** Số bản ghi mỗi lần tải từ server cho Planner. */
export const PLANNER_FETCH_LIMIT = 40;
/** Giới hạn buffer client — tránh RAM/lag khi NV có hàng nghìn lead/deal. */
export const PLANNER_MAX_BUFFER = 100;
/** Buffer lớn hơn khi admin xem tất cả NV. */
export const PLANNER_MAX_BUFFER_ALL = 400;
/** Deadline: ưu tiên bucket-pages; buffer chỉ giữ card đã tải theo cột (vuốt lên). */
export const DEADLINE_MAX_BUFFER = 400;
/** Fallback first-paint (stage drain) — giữ thấp nếu còn dùng. */
export const DEADLINE_FIRST_PAINT_LIMIT = 80;
/** Fallback sync nền — không drain hàng nghìn thẻ. */
export const DEADLINE_BG_SYNC_LIMIT = 200;

export type PlannerSectionPage = {
  items: PlannerItem[];
  total: number;
  hasMore: boolean;
  nextOffset: number;
  /**
   * Tổng «đang thực hiện» chính xác (stage-counts) — resolve nền, không chặn first paint.
   * Chỉ có ở trang offset=0.
   */
  totalPromise?: Promise<number>;
};

/**
 * Deadline tab: cùng nguồn view Deadline trên web CRM
 * (task → kanban → SLA → expected_close; bỏ Thắng/Thua/DT hoàn thành / deadline tắt).
 * Bộ lọc giống Hub/web: phone, assignee, company, region, dates, search.
 * Deal + tách KH: chỉ cột pre-Thắng (khớp web tab Deal Deadline).
 */
export type DeadlineFetchOpts = CrmStageFetchOpts & {
  /** Cấu hình cột/hạn từ GET /crm/settings/deadline-config */
  deadlineConfig?: DeadlineConfig | null;
  /**
   * Tách Deal / Đơn hàng — khớp web `dealKhSplitEnabled`.
   * true → Deadline Deal chỉ pre-Thắng (không gồm cột sau Thắng).
   */
  dealKhSplitEnabled?: boolean;
  /**
   * Khi không chọn company_id (admin «Tất cả công ty») — chỉ giữ deal/lead
   * thuộc khối CRM. Khớp web `restrictToCrmModuleCompanies`.
   */
  allowedCompanyIds?: string[] | null;
  /**
   * Callback tiến độ — UI hiện sớm trước khi drain hết cột mở.
   * Gọi mỗi khi đủ `progressEvery` bản ghi (và lần cuối).
   */
  onProgress?: (partial: PlannerSectionPage) => void;
  /** Số bản ghi giữa các lần onProgress (mặc định 250). */
  progressEvery?: number;
  /**
   * Chỉ lấy trang đầu mỗi cột mở — first-paint ~3–5s thay vì drain hết pipeline.
   * Gọi lại với offset=items.length (không firstPaintOnly) để drain nền phần còn lại.
   */
  firstPaintOnly?: boolean;
};

/** Config đổi hiếm khi — cache để khỏi mất round-trip trước mỗi lần drain cột mở. */
const DEADLINE_CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;
const deadlineConfigCache = new Map<string, { cfg: DeadlineConfig; at: number }>();

export async function fetchDeadlineConfig(
  companyId?: string | null,
  signal?: AbortSignal,
): Promise<DeadlineConfig> {
  const cacheKey = companyId || '__all__';
  const cached = deadlineConfigCache.get(cacheKey);
  if (cached && Date.now() - cached.at < DEADLINE_CONFIG_CACHE_TTL_MS) return cached.cfg;

  const params: Record<string, string> = {};
  if (companyId) params.company_id = companyId;
  try {
    const { data } = await api.get<DeadlineConfig>('/crm/settings/deadline-config', {
      params,
      signal,
    });
    const cfg = data || {
      primary_field: 'crm_next_open_task_deadline',
      fallback_field: 'expected_close_date',
      buckets: {},
    };
    deadlineConfigCache.set(cacheKey, { cfg, at: Date.now() });
    return cfg;
  } catch {
    if (cached) return cached.cfg;
    return {
      primary_field: 'crm_next_open_task_deadline',
      fallback_field: 'expected_close_date',
      buckets: {},
    };
  }
}

export function invalidateDeadlineConfigCache(): void {
  deadlineConfigCache.clear();
}

/** Cột mở theo embed stage — fallback khi không lấy được pipeline stages. */
function isOpenDeadlineRow(it: ApiLead): boolean {
  const st = it.stage;
  const sid = String(st?.id || it.stage_id || '');
  if (!sid) return false;
  return isDeadlineMembershipStage({
    id: sid,
    name: st?.name || '',
    icon: '',
    color: '',
    orderIndex: 0,
    isWon: !!st?.is_won,
    isLost: !!st?.is_lost,
    countsAsCompletedRevenue: !!st?.counts_as_completed_revenue,
    canonicalSlug: st?.canonical_slug || null,
    dealReportBucket: st?.deal_report_bucket || null,
    slaDays: st?.sla_days == null ? null : Number(st.sla_days),
  });
}

function stageMetaFromLead(
  it: ApiLead,
  stageLookup?: Map<string, CrmPipelineStage>,
): DeadlineStageMeta | null {
  const sid = resolveStageId(it);
  const fromBoard = sid && stageLookup ? stageLookup.get(sid) : undefined;
  const st = it.stage;
  if (!st && !sid) return null;
  return {
    is_won: fromBoard?.isWon ?? st?.is_won ?? null,
    is_lost: fromBoard?.isLost ?? st?.is_lost ?? null,
    counts_as_completed_revenue:
      fromBoard?.countsAsCompletedRevenue ?? st?.counts_as_completed_revenue ?? null,
    sla_days: fromBoard?.slaDays ?? st?.sla_days ?? null,
    canonical_slug: fromBoard?.canonicalSlug ?? st?.canonical_slug ?? null,
    deal_report_bucket: fromBoard?.dealReportBucket ?? st?.deal_report_bucket ?? null,
  };
}

function toDeadlineItem(
  it: ApiLead,
  kind: 'lead' | 'deal',
  cfg?: DeadlineConfig | null,
  stageLookup?: Map<string, CrmPipelineStage>,
): PlannerItem {
  const owner = ownerOf(it);
  const ownerId = ownerIdOf(it);
  const due = resolveDeadlineIso(it, cfg, stageMetaFromLead(it, stageLookup));
  const overdue = !!due && new Date(due).getTime() < crmDeadlineStartOfTodayVnMs();
  const deadlineLabel = due ? dateLabel(due) : 'Chưa hẹn';
  return {
    id: it.id,
    kind,
    code: it.code || (kind === 'lead' ? 'LEAD' : 'DEAL'),
    title: it.title || (kind === 'lead' ? 'Lead chưa đặt tên' : 'Deal chưa đặt tên'),
    status: it.stage?.name || (kind === 'lead' ? 'Mới' : 'Deal mới'),
    stageId: resolveStageId(it) || undefined,
    companyId: String(it.company_id || it.company?.id || '') || undefined,
    contactName: it.customer?.full_name || '—',
    phone: it.customer?.phone || it.phone || '',
    location: it.install_address || it.customer?.address || it.company?.short_name || '—',
    valueLabel: kind === 'deal' ? formatVnd(it.estimated_value) : undefined,
    temp: kind === 'lead' ? tempFromStage(it.stage?.name) : undefined,
    ownerId,
    assignedToId: String(it.assigned_to || it.assignee?.id || ''),
    leadOwnerId: String(it.lead_owner_id || it.lead_owner?.id || ''),
    ownerName: owner,
    ownerInitials: initialsFromName(owner),
    ownerColor: colorFromName(owner),
    deadlineLabel,
    dueIso: due,
    overdue,
    projectId: it.project_id ? String(it.project_id) : null,
  };
}

/** Page size khi còn dùng path drain (fallback) — server max 2000. */
const DEADLINE_DRAIN_PAGE = 80;
/** Trang đầu mỗi cột (fallback drain). */
const DEADLINE_FIRST_PAGE = 20;
/** Máy yếu: trang đầu nhỏ hơn. */
const DEADLINE_FIRST_PAGE_LOW = 12;
/** Số trang tối đa mỗi cột mở (fallback). */
const DEADLINE_STAGE_MAX_PAGES = 8;
/** Song song stage khi drain (máy yếu lấy từ devicePerf). */
const DEADLINE_STAGE_FETCH_CONCURRENCY = 3;
/** Phát UI sớm sau N bản ghi đầu. */
const DEADLINE_PROGRESS_EVERY = 80;

/**
 * Stage được đưa vào Deadline — khớp web DeadlineView + backend `crmDeadlineStageExcluded`:
 * - Lead: không Thắng/Thua/DT hoàn thành (flag/slug/bucket; không name-regex KPI)
 * - Deal + tách KH: dealTabStages đủ điều kiện Deadline (pre-Thắng + lost-by-name vẫn vào nếu web có)
 * - Deal gộp: mọi cột đủ điều kiện Deadline
 */
function resolveDeadlineOpenStages(
  type: 'lead' | 'deal',
  stages: CrmPipelineStage[],
  dealKhSplitEnabled?: boolean,
): CrmPipelineStage[] {
  if (type === 'deal' && dealKhSplitEnabled) {
    /** Khớp web: dealKanbanStages = dealTabStages, rồi bỏ won/lost/completed. */
    const { dealTabStages } = splitDealStagesForCrmTabsMulti(stages);
    return dealTabStages.filter(isDeadlineMembershipStage);
  }
  return stages.filter(isDeadlineMembershipStage);
}

/**
 * Bộ lọc list dùng chung cho Deadline (danh sách card + đếm badge cột).
 * Lite giống Kanban — đủ task/kanban/SLA fields + display_phone + deadline_disabled_at;
 * server vẫn attach `is_interacted` qua user flags.
 * Search/due lọc trên client — không gửi search lên API (tránh reload nặng khi gõ).
 */
function buildDeadlineListOpts(opts?: DeadlineFetchOpts): CrmStageFetchOpts {
  return {
    search: undefined,
    assignedTo: opts?.assignedTo,
    phoneFilter: opts?.phoneFilter,
    dateFrom: opts?.dateFrom,
    dateTo: opts?.dateTo,
    companyId: opts?.companyId,
    // Giữ `__none__` để applyListParams gửi region_unassigned=1 (khớp web).
    regionId: opts?.regionId,
    lite: true,
    skipCounts: true,
    signal: opts?.signal,
  };
}

/**
 * Tải Lead/Deal cho tab Deadline — cùng bộ lọc Hub/web,
 * membership khớp Deadline web (tách KH Deal). Phân cột theo giờ VN
 * (`resolveDeadlineBucket` / `crmDeadlineStartOfTodayVnMs`).
 * Tải theo từng cột mở (stage_id) để không bỏ sót khi Lead/Deal > buffer cũ.
 */
export async function fetchDeadlineSectionPage(
  type: 'lead' | 'deal',
  offset = 0,
  limit = PLANNER_FETCH_LIMIT,
  opts?: DeadlineFetchOpts,
): Promise<PlannerSectionPage> {
  const perf = getDeadlinePerfLimits();
  const stageConcurrency = perf.stageConcurrency || DEADLINE_STAGE_FETCH_CONCURRENCY;
  const firstPageSize = perf.tier === 'low' ? DEADLINE_FIRST_PAGE_LOW : DEADLINE_FIRST_PAGE;
  const regionRaw = opts?.regionId;
  const regionNone = regionRaw === '__none__';
  const listOpts = buildDeadlineListOpts(opts);

  const stages = await fetchPipelineStagesCached(type, {
    companyId: opts?.companyId,
    regionId: regionNone ? undefined : opts?.regionId,
    signal: opts?.signal,
  });
  const openStages = resolveDeadlineOpenStages(type, stages, opts?.dealKhSplitEnabled);
  const stageLookup = new Map(stages.map((s) => [s.id, s]));
  /** Khớp web: admin «Tất cả» vẫn chỉ khối CRM (`/companies?for_module=crm`). */
  const allowedCompanies =
    !listOpts.companyId && opts?.allowedCompanyIds?.length
      ? new Set(opts.allowedCompanyIds.map(String).filter(Boolean))
      : null;

  const target = Math.min(Math.max(limit, PLANNER_FETCH_LIMIT), DEADLINE_MAX_BUFFER);
  const cfg = opts?.deadlineConfig;
  const collected: ApiLead[] = [];
  const seen = new Set<string>();
  let truncated = false;
  const progressEvery = Math.max(50, opts?.progressEvery ?? perf.progressEvery ?? DEADLINE_PROGRESS_EVERY);
  let lastProgressAt = 0;

  const acceptRow = (row: ApiLead): boolean => {
    if (seen.has(row.id)) return false;
    if (allowedCompanies) {
      const cid = String(row.company_id || row.company?.id || '');
      if (!cid || !allowedCompanies.has(cid)) return false;
    }
    if (regionNone) {
      const rid = String(row.region_id || '');
      if (rid) return false;
    }
    return true;
  };

  const emitProgress = (done: boolean) => {
    if (!opts?.onProgress) return;
    // Máy yếu: bỏ map+sort giữa chừng (O(n log n) trên JS thread) — chỉ đẩy lần cuối.
    if (!done && perf.tier === 'low') return;
    if (!done && collected.length - lastProgressAt < progressEvery) return;
    lastProgressAt = collected.length;
    const items = collected
      .map((it) => toDeadlineItem(it, type, cfg, stageLookup))
      .sort(plannerByDue);
    opts.onProgress({
      items,
      total: collected.length,
      hasMore: !done || truncated,
      nextOffset: offset + collected.length,
    });
  };

  /**
   * Tải theo từng cột mở — tránh lệch Lead khi API type=lead lẫn Thắng/Thua
   * và buffer cũ cắt sớm (trước đây 2000/3910).
   * Chạy song song vài cột để Lead ~3–4k không bị treo lâu.
   * `offset` > 0: bỏ qua các bản ghi đầu (load more).
   */
  let skipLeft = Math.max(0, offset);
  if (openStages.length) {
    const stageQueues = openStages.map((stage) => ({ stage, cursor: 0, hasMore: true, pages: 0 }));

    const pullOneStage = async (slot: (typeof stageQueues)[number]) => {
      if (!slot.hasMore || slot.pages >= DEADLINE_STAGE_MAX_PAGES) {
        slot.hasMore = false;
        return [] as ApiLead[];
      }
      // Trang đầu (khi tải mới, offset=0) nhỏ hơn → round-trip nhanh, first-paint sớm hơn.
      const pageSize = slot.pages === 0 && offset === 0 ? firstPageSize : DEADLINE_DRAIN_PAGE;
      const page = await fetchCrmRowsForStage(
        type,
        slot.stage.id,
        slot.cursor,
        pageSize,
        listOpts,
      );
      slot.pages += 1;
      slot.cursor = page.nextOffset;
      if (!page.rows.length) {
        slot.hasMore = false;
        return [] as ApiLead[];
      }
      slot.hasMore = page.hasMore && slot.pages < DEADLINE_STAGE_MAX_PAGES;
      if (page.hasMore && slot.pages >= DEADLINE_STAGE_MAX_PAGES) truncated = true;
      return page.rows || [];
    };

    const ingestRows = (rows: ApiLead[]): boolean => {
      for (const row of rows) {
        if (!acceptRow(row)) continue;
        if (skipLeft > 0) {
          skipLeft -= 1;
          seen.add(row.id);
          continue;
        }
        seen.add(row.id);
        collected.push(row);
        if (collected.length >= target) {
          truncated = true;
          return true;
        }
      }
      return false;
    };

    if (opts?.firstPaintOnly) {
      /** Một trang đầu mỗi cột mở — vài round-trip song song, không drain hết pipeline. */
      while (stageQueues.some((s) => s.hasMore && s.pages === 0)) {
        if (opts?.signal?.aborted) break;
        const batch = stageQueues
          .filter((s) => s.hasMore && s.pages === 0)
          .slice(0, stageConcurrency);
        if (!batch.length) break;
        const batches = await Promise.all(batch.map((s) => pullOneStage(s)));
        for (const rows of batches) {
          if (ingestRows(rows)) break;
        }
        emitProgress(false);
        if (truncated) break;
      }
      if (stageQueues.some((s) => s.hasMore)) truncated = true;
    } else while (collected.length < target) {
      if (opts?.signal?.aborted) break;
      const active = stageQueues.filter((s) => s.hasMore).slice(0, stageConcurrency);
      if (!active.length) break;
      const batches = await Promise.all(active.map((s) => pullOneStage(s)));
      let gotAny = false;
      for (const rows of batches) {
        for (const row of rows) {
          if (!acceptRow(row)) continue;
          gotAny = true;
          if (skipLeft > 0) {
            skipLeft -= 1;
            seen.add(row.id);
            continue;
          }
          seen.add(row.id);
          collected.push(row);
          if (collected.length >= target) {
            truncated = true;
            break;
          }
        }
        if (truncated) break;
      }
      emitProgress(false);
      if (truncated) break;
      if (!gotAny && !stageQueues.some((s) => s.hasMore)) break;
    }
    if (!opts?.firstPaintOnly && stageQueues.some((s) => s.hasMore)) truncated = true;
  } else {
    /** Fallback: không lấy được stages — quét list + lọc cột mở. */
    let cursor = 0;
    let apiHasMore = true;
    let pages = 0;
    const maxPages = DEADLINE_STAGE_MAX_PAGES * 2;
    while (collected.length < target && apiHasMore && pages < maxPages) {
      if (opts?.signal?.aborted) break;
      const params: Record<string, unknown> = {
        type,
        limit: DEADLINE_DRAIN_PAGE,
        offset: cursor,
      };
      applyListParams(params, listOpts);
      const { data } = await api.get('/crm/leads', { params, signal: opts?.signal });
      const page = parsePayload(data, DEADLINE_DRAIN_PAGE);
      pages += 1;
      apiHasMore = page.hasMore;
      cursor = page.nextOffset;
      if (!page.rows.length) break;
      for (const row of page.rows) {
        if (!acceptRow(row)) continue;
        if (!isOpenDeadlineRow(row)) continue;
        if (skipLeft > 0) {
          skipLeft -= 1;
          seen.add(row.id);
          continue;
        }
        seen.add(row.id);
        collected.push(row);
        if (collected.length >= target) {
          truncated = true;
          break;
        }
      }
    }
    if (apiHasMore) truncated = true;
  }

  const items = collected
    .map((it) => toDeadlineItem(it, type, cfg, stageLookup))
    .sort(plannerByDue);

  const finalPage: PlannerSectionPage = {
    items,
    total: collected.length,
    hasMore: truncated,
    nextOffset: offset + collected.length,
  };
  if (opts?.onProgress) {
    lastProgressAt = collected.length;
    opts.onProgress(finalPage);
  }
  return finalPage;
}

/**
 * Cache kết quả Deadline (theo kind + bộ lọc) — vào lại tab hiện ngay dữ liệu cũ
 * (giống Kanban Hub) trong khi tải nền, thay vì luôn hiện màn "Đang tải…".
 */
const DEADLINE_RESULT_CACHE_TTL_MS = 90 * 1000;
const MAX_DEADLINE_RESULT_CACHE = 12;
const deadlineResultCache = new Map<string, { data: PlannerSectionPage; at: number }>();

function deadlineResultCacheKey(kind: 'lead' | 'deal', filterKey: string): string {
  return `${kind}|${filterKey}`;
}

/** Đọc cache đồng bộ — kể cả khi stale, để hiện ngay trước khi refresh nền. */
export function peekDeadlineResultCache(
  kind: 'lead' | 'deal',
  filterKey: string,
): PlannerSectionPage | null {
  return deadlineResultCache.get(deadlineResultCacheKey(kind, filterKey))?.data ?? null;
}

export function deadlineResultCacheAgeMs(kind: 'lead' | 'deal', filterKey: string): number | null {
  const hit = deadlineResultCache.get(deadlineResultCacheKey(kind, filterKey));
  if (!hit) return null;
  return Date.now() - hit.at;
}

export function setDeadlineResultCache(
  kind: 'lead' | 'deal',
  filterKey: string,
  data: PlannerSectionPage,
): void {
  deadlineResultCache.set(deadlineResultCacheKey(kind, filterKey), { data, at: Date.now() });
  pruneTimedMap(deadlineResultCache, DEADLINE_RESULT_CACHE_TTL_MS * 2, MAX_DEADLINE_RESULT_CACHE);
}

export function invalidateDeadlineResultCache(): void {
  deadlineResultCache.clear();
}

/* ------------------------------------------------------------------ *
 * Badge cột Deadline — POST `/crm/deadline-bucket-counts` (RPC server).
 * Không quét nghìn dòng trên client (tránh nghẽn mạng/RAM máy yếu).
 * ------------------------------------------------------------------ */

export type DeadlineBucketCountMap = Partial<Record<DeadlineBucketKey, number>>;

export type DeadlineBucketCounts = {
  counts: DeadlineBucketCountMap;
  total: number;
  overdue: number;
  /** false = chạm trần an toàn / bị hủy → số chỉ là cận dưới. */
  complete: boolean;
  at: number;
};

const DEADLINE_COUNTS_TTL_MS = 90 * 1000;
const MAX_DEADLINE_COUNTS_CACHE = 12;

const deadlineBucketCountsCache = new Map<string, { data: DeadlineBucketCounts; at: number }>();
const deadlineBucketCountsInflight = new Map<string, Promise<DeadlineBucketCounts>>();

function deadlineCountsCacheKey(kind: 'lead' | 'deal', filterKey: string): string {
  return `${kind}|${filterKey}`;
}

/** Đọc cache đồng bộ — vào lại tab hiện badge đúng ngay (giống stageCounts của Hub). */
export function peekDeadlineBucketCounts(
  kind: 'lead' | 'deal',
  filterKey: string,
): DeadlineBucketCounts | null {
  return deadlineBucketCountsCache.get(deadlineCountsCacheKey(kind, filterKey))?.data ?? null;
}

export function isDeadlineBucketCountsFresh(
  kind: 'lead' | 'deal',
  filterKey: string,
  maxAgeMs = DEADLINE_COUNTS_TTL_MS,
): boolean {
  const hit = deadlineBucketCountsCache.get(deadlineCountsCacheKey(kind, filterKey));
  if (!hit?.data.complete) return false;
  return Date.now() - hit.at < maxAgeMs;
}

export function invalidateDeadlineBucketCounts(): void {
  deadlineBucketCountsCache.clear();
}

async function fetchDeadlineBucketCountsFromApi(
  type: 'lead' | 'deal',
  opts?: DeadlineFetchOpts,
): Promise<DeadlineBucketCounts> {
  const regionNone = opts?.regionId === '__none__';
  const listOpts = buildDeadlineListOpts(opts);
  const stages = await fetchPipelineStagesCached(type, {
    companyId: opts?.companyId,
    regionId: regionNone ? undefined : opts?.regionId,
    signal: opts?.signal,
  });
  const openStages = resolveDeadlineOpenStages(type, stages, opts?.dealKhSplitEnabled);
  const openStageIds = openStages.map((s) => s.id).filter(Boolean);
  const cfg = opts?.deadlineConfig;

  const params = crmListQueryParams(type, listOpts);
  const body: { stage_ids?: string[]; config: Record<string, unknown> } = {
    config: cfg || {},
  };
  if (listOpts.companyId && openStageIds.length) {
    body.stage_ids = openStageIds;
  }

  try {
    const { data } = await api.post<{
      counts?: DeadlineBucketCountMap;
      total?: number;
      complete?: boolean;
    }>(
      '/crm/deadline-bucket-counts',
      body,
      { params, signal: opts?.signal, timeout: 120000 },
    );
    if (data?.counts && typeof data.counts === 'object') {
      const counts = { ...data.counts };
      const overdue = Number(counts.overdue) || 0;
      const total = Number.isFinite(Number(data.total))
        ? Number(data.total)
        : Object.values(counts).reduce((s, n) => s + (Number(n) || 0), 0);
      return {
        counts,
        total,
        overdue,
        complete: data.complete !== false,
        at: Date.now(),
      };
    }
  } catch {
    /* không fallback quét client */
  }

  return {
    counts: {},
    total: 0,
    overdue: 0,
    complete: false,
    at: Date.now(),
  };
}

/**
 * Số đếm từng cột Deadline theo bộ lọc hiện tại — dùng cho badge cột.
 * Cache 90s + gộp request trùng, giống `fetchCrmStageCountsBatch` của Kanban.
 */
export async function fetchDeadlineBucketCounts(
  type: 'lead' | 'deal',
  filterKey: string,
  opts?: DeadlineFetchOpts & { force?: boolean },
): Promise<DeadlineBucketCounts> {
  const key = deadlineCountsCacheKey(type, filterKey);
  if (!opts?.force) {
    const hit = deadlineBucketCountsCache.get(key);
    if (hit?.data.complete && Date.now() - hit.at < DEADLINE_COUNTS_TTL_MS) return hit.data;
    const inflight = deadlineBucketCountsInflight.get(key);
    if (inflight) return inflight;
  } else {
    deadlineBucketCountsCache.delete(key);
    deadlineBucketCountsInflight.delete(key);
  }

  const run = fetchDeadlineBucketCountsFromApi(type, { ...opts, signal: undefined })
    .then((res) => {
      if (res.complete) {
        deadlineBucketCountsCache.set(key, { data: res, at: res.at });
        pruneTimedMap(deadlineBucketCountsCache, DEADLINE_COUNTS_TTL_MS * 2, MAX_DEADLINE_COUNTS_CACHE);
      }
      return res;
    })
    .finally(() => {
      if (deadlineBucketCountsInflight.get(key) === run) deadlineBucketCountsInflight.delete(key);
    });
  deadlineBucketCountsInflight.set(key, run);
  return run;
}

export type DeadlineBucketPageResult = {
  items: PlannerItem[];
  total: number;
  nextOffset: number;
  hasMore: boolean;
};

/**
 * Tải card theo cột Deadline — khớp web POST `/crm/deadline-bucket-pages`
 * (stamp `deadline_bucket` để gom cột đúng badge).
 */
export async function fetchDeadlineBucketPages(
  type: 'lead' | 'deal',
  requests: Array<{ bucket: DeadlineBucketKey; offset?: number; limit?: number }>,
  opts?: DeadlineFetchOpts,
): Promise<Record<string, DeadlineBucketPageResult>> {
  const listOpts = buildDeadlineListOpts(opts);
  const regionNone = opts?.regionId === '__none__';
  const stages = await fetchPipelineStagesCached(type, {
    companyId: opts?.companyId,
    regionId: regionNone ? undefined : opts?.regionId,
    signal: opts?.signal,
  });
  const openStages = resolveDeadlineOpenStages(type, stages, opts?.dealKhSplitEnabled);
  const stageLookup = new Map(stages.map((s) => [s.id, s]));
  const stageIds = openStages.map((s) => s.id).filter(Boolean);
  if (!requests.length) return {};
  // Không chọn công ty: server tự lấy toàn bộ stage (giống deadline-bucket-counts).
  // Gửi subset stage_ids sẽ lệch badge 23 vs list 1 card.
  if (listOpts.companyId && !stageIds.length) return {};

  const payloadRequests = requests
    .map((r) => ({
      bucket: r.bucket,
      offset: Math.max(0, Number(r.offset) || 0),
      limit: Math.min(Math.max(Number(r.limit) || 15, 1), 20),
    }))
    .slice(0, 6);

  const params = crmListQueryParams(type, listOpts);
  const body: {
    buckets: typeof payloadRequests;
    config: Record<string, unknown>;
    stage_ids?: string[];
  } = {
    buckets: payloadRequests,
    config: opts?.deadlineConfig || {},
  };
  if (listOpts.companyId && stageIds.length) body.stage_ids = stageIds;

  const { data } = await api.post<{
    pages?: Record<string, {
      data?: ApiLead[];
      total?: number;
      nextOffset?: number;
      hasMore?: boolean;
    }>;
  }>(
    '/crm/deadline-bucket-pages',
    body,
    { params, signal: opts?.signal },
  );

  const cfg = opts?.deadlineConfig;
  const pages = data?.pages || {};
  const out: Record<string, DeadlineBucketPageResult> = {};
  for (const [bucket, page] of Object.entries(pages)) {
    const rows = Array.isArray(page?.data) ? page.data : [];
    const stamped = bucket as DeadlineBucketKey;
    out[bucket] = {
      items: rows.map((row) => ({
        ...toDeadlineItem(row, type, cfg, stageLookup),
        deadlineBucket: stamped,
      })),
      total: Number(page?.total) || 0,
      nextOffset: Number(page?.nextOffset) || 0,
      hasMore: !!page?.hasMore,
    };
  }
  return out;
}

/** Leads hoặc Deals cá nhân — có phân trang server. Chỉ hiện bản ghi đang thực hiện. */
export async function fetchPlannerSectionPage(
  type: 'lead' | 'deal',
  userId: string,
  offset = 0,
  limit = PLANNER_FETCH_LIMIT,
  opts?: PlannerFetchOpts,
): Promise<PlannerSectionPage> {
  const [page, stageById] = await Promise.all([
    fetchPlannerPage(type, userId, offset, limit, opts),
    fetchPlannerStageLookup(type, opts),
  ]);
  const filtered = page.rows.length
    ? filterRowsForPlannerKanban(page.rows, type, userId, stageById, opts)
    : [];
  const items = filtered
    .map((it) => toPlannerItem(it, type))
    .sort(plannerByDue);

  // First paint: không chờ /crm/stage-counts (hay chậm hơn list).
  // Total tạm = số item đã lọc; nếu còn trang → dùng page.total làm sàn ước lượng.
  const provisionalTotal = offset === 0
    ? (page.hasMore ? Math.max(items.length, page.total || 0) : items.length)
    : page.total;

  const totalPromise = offset === 0
    ? fetchPlannerActiveTotal(type, userId, stageById, opts)
    : undefined;

  return {
    items,
    total: provisionalTotal,
    hasMore: page.hasMore,
    nextOffset: page.nextOffset,
    totalPromise,
  };
}

/** Leads hoặc Deals cá nhân — trang đầu (tương thích cũ). */
export async function fetchPlannerSection(
  type: 'lead' | 'deal',
  userId: string,
  signal?: AbortSignal,
  opts?: Omit<PlannerFetchOpts, 'signal'>,
): Promise<PlannerItem[]> {
  const page = await fetchPlannerSectionPage(type, userId, 0, PLANNER_FETCH_LIMIT, { ...opts, signal });
  return page.items;
}

/** Lấy Leads + Deals cá nhân — song song, cache 90s, bỏ qua stages khi rỗng. */
export async function fetchPlanner(
  userId: string,
  signal?: AbortSignal,
  opts?: { force?: boolean },
): Promise<PlannerData> {
  if (!opts?.force && isPlannerCacheFresh(userId)) {
    const cached = peekPlannerCache(userId);
    if (cached) return cached;
  }
  const [leads, deals] = await Promise.all([
    fetchPlannerSection('lead', userId, signal),
    fetchPlannerSection('deal', userId, signal),
  ]);
  const data = { leads, deals };
  setPlannerCache(userId, data);
  return data;
}

export type CrmStats = { totalLeads: number; totalDeals: number };

export async function fetchCrmStats(): Promise<CrmStats> {
  try {
    const [l, d] = await Promise.all([
      api.get('/crm/leads', { params: { type: 'lead', limit: 1, offset: 0 } }),
      api.get('/crm/leads', { params: { type: 'deal', limit: 1, offset: 0 } }),
    ]);
    const lt = (l.data?.total as number) ?? 0;
    const dt = (d.data?.total as number) ?? 0;
    return { totalLeads: lt, totalDeals: dt };
  } catch {
    return { totalLeads: 0, totalDeals: 0 };
  }
}

// ---------------------------------------------------------------------------
// Meta cho form Tạo Lead/Deal (đồng bộ với web): công ty, khu vực, nguồn,
// loại, người giới thiệu, người phụ trách.
// ---------------------------------------------------------------------------

export type CrmOption = { id: string; name: string };
export type CrmCompanyOption = CrmOption & { shortName?: string; divisionUnitId?: string | null };
export type CrmLeadTypeOption = CrmOption & { appliesTo: string };

function asArray<T = unknown>(data: unknown, ...keys: string[]): T[] {
  if (Array.isArray(data)) return data as T[];
  const obj = (data ?? {}) as Record<string, unknown>;
  for (const k of keys) {
    if (Array.isArray(obj[k])) return obj[k] as T[];
  }
  return [];
}

/** Danh sách công ty cho module CRM — cùng cache/inflight với crmMeta. */
export async function fetchCrmCompanies(signal?: AbortSignal): Promise<CrmCompanyOption[]> {
  const rows = await fetchCrmCompaniesMeta(signal);
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    shortName: c.short_name || undefined,
    divisionUnitId: c.division_unit_id != null ? String(c.division_unit_id) : null,
  }));
}

/** Khu vực theo công ty (load sau khi chọn công ty). */
export async function fetchCrmCompanyRegions(
  companyId: string,
  divisionUnitId?: string | null,
  signal?: AbortSignal,
): Promise<CrmOption[]> {
  if (!companyId) return [];
  const params: Record<string, string> = { company_id: companyId, for_module: 'crm' };
  if (divisionUnitId) params.division_unit_id = divisionUnitId;
  const { data } = await api.get('/crm/company-regions', { params, signal });
  return asArray<Record<string, unknown>>(data, 'regions')
    .filter((r) => r.is_active !== false)
    .map((r) => ({ id: String(r.id), name: String(r.name || 'Khu vực') }));
}

/** Nguồn theo công ty. */
export async function fetchCrmSources(companyId: string, signal?: AbortSignal): Promise<CrmOption[]> {
  if (!companyId) return [];
  const { data } = await api.get('/crm/sources', { params: { company_id: companyId }, signal });
  return asArray<Record<string, unknown>>(data, 'sources')
    .filter((s) => s.is_active !== false)
    .map((s) => ({ id: String(s.id), name: String(s.name || 'Nguồn') }));
}

/** Loại Lead/Deal theo công ty, lọc theo applies_to. */
export async function fetchCrmLeadTypes(
  companyId: string,
  kind: 'lead' | 'deal',
  signal?: AbortSignal,
): Promise<CrmLeadTypeOption[]> {
  if (!companyId) return [];
  const { data } = await api.get('/crm/lead-types', { params: { company_id: companyId }, signal });
  return asArray<Record<string, unknown>>(data, 'lead_types', 'types')
    .filter((t) => String(t.company_id || '') === String(companyId))
    .filter((t) => {
      const a = String(t.applies_to || 'both');
      return a === 'both' || a === kind;
    })
    .filter((t) => t.is_active !== false)
    .map((t) => ({ id: String(t.id), name: String(t.name || 'Loại'), appliesTo: String(t.applies_to || 'both') }));
}

/** Người giới thiệu theo công ty. */
export async function fetchCrmReferrers(companyId: string, signal?: AbortSignal): Promise<CrmOption[]> {
  if (!companyId) return [];
  const { data } = await api.get('/crm/referrers', { params: { company_id: companyId }, signal });
  return asArray<Record<string, unknown>>(data, 'items', 'referrers')
    .map((r) => ({ id: String(r.id), name: String(r.name || '') }))
    .filter((r) => r.name);
}

/** Người dùng (người phụ trách) — lọc theo công ty nếu có. */
export async function fetchCrmCompanyUsers(
  companyId?: string | null,
  signal?: AbortSignal,
): Promise<CrmOption[]> {
  const params: Record<string, string> = {};
  if (companyId) params.company_id = companyId;
  const { data } = await api.get('/users', { params, signal });
  return asArray<Record<string, unknown>>(data, 'users')
    .filter((u) => u.is_active !== false)
    .map((u) => ({ id: String(u.id), name: String(u.full_name || u.email || 'Người dùng') }));
}

export type CreateCrmInput = {
  kind: 'lead' | 'deal';
  title: string;
  companyId?: string | null;
  regionId?: string | null;
  installAddress?: string;
  sourceId?: string | null;
  leadTypeId?: string | null;
  /** Tên người giới thiệu (backend upsert), chỉ gửi khi có chọn/nhập. */
  referrerName?: string | null;
  value?: number;
  note?: string;
  assignedTo?: string | null;
  /** Hạn (expected_close_date) dạng yyyy-mm-dd. */
  deadline?: string | null;
  probability?: number;
  customer: { name: string; phone?: string; email?: string; company?: string };
};

/**
 * Tạo khách hàng + Lead/Deal — đồng bộ payload với web:
 * POST /customers → POST /crm/leads | /crm/deals.
 */
export async function createCrmEntity(input: CreateCrmInput): Promise<{ id: string; code?: string }> {
  const companyId = input.companyId || null;
  const installAddress = input.installAddress?.trim() || null;

  // customers.phone là NOT NULL trên DB — gửi '' thay vì null khi chưa có SĐT.
  const customerPayload: Record<string, unknown> = {
    full_name: input.customer.name.trim() || 'Khách mới',
    phone: input.customer.phone?.trim() || '',
    company: input.customer.company?.trim() || null,
  };
  if (input.customer.email?.trim()) customerPayload.email = input.customer.email.trim();
  if (installAddress) customerPayload.address = installAddress;
  if (companyId) customerPayload.company_id = companyId;

  const { data: cRes } = await api.post<{ customer?: { id?: string }; id?: string }>(
    '/customers',
    customerPayload,
  );
  const customerId = cRes?.customer?.id || cRes?.id || null;

  const base: Record<string, unknown> = {
    title: input.title.trim(),
    customer_id: customerId,
    source_id: input.sourceId || null,
    company_id: companyId,
    region_id: input.regionId || null,
    lead_type_id: input.leadTypeId || null,
    estimated_value: input.value || 0,
    probability: input.probability ?? 50,
    install_address: installAddress,
  };
  if (input.note?.trim()) base.description = input.note.trim();
  if (input.assignedTo) base.assigned_to = input.assignedTo;
  if (input.referrerName && input.referrerName.trim()) base.referrer_name = input.referrerName.trim();
  // Lưu ý: KHÔNG gửi expected_close_date. Deadline ghi qua PATCH .../deadline
  // (kanban_deadline_at) để đồng bộ với "Deadline thẻ" trên web (tránh deadline trùng).

  let created: { id: string; code?: string };
  if (input.kind === 'lead') {
    let stageId: string | undefined;
    try {
      const params: Record<string, string> = { type: 'lead' };
      if (companyId) params.company_id = companyId;
      const { data: stagesRaw } = await api.get<ApiStage[]>('/crm/pipeline-stages', { params });
      const ordered = (Array.isArray(stagesRaw) ? stagesRaw : []).sort(
        (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0),
      );
      stageId = ordered[0]?.id ?? undefined;
    } catch {
      /* để backend tự gán nếu thiếu */
    }
    const { data } = await api.post<{ id: string; code?: string }>('/crm/leads', {
      ...base,
      type: 'lead',
      stage_id: stageId,
    });
    created = { id: data?.id, code: data?.code };
  } else {
    const { data } = await api.post<{ id: string; code?: string }>('/crm/deals', base);
    created = { id: data?.id, code: data?.code };
  }

  // Đặt "Deadline thẻ" giống web (PATCH /crm/leads/:id/deadline → kanban_deadline_at).
  if (input.deadline && created.id) {
    try {
      await api.patch(`/crm/leads/${created.id}/deadline`, {
        kanban_deadline_at: deadlineDateToIso(input.deadline),
        reason: '',
      });
    } catch {
      /* không chặn việc tạo nếu set deadline lỗi */
    }
  }

  return created;
}

/** yyyy-mm-dd → ISO datetime tại 09:00 giờ địa phương (khớp datetime web). */
function deadlineDateToIso(date: string): string {
  const d = new Date(`${date}T09:00:00`);
  if (Number.isNaN(d.getTime())) return new Date(date).toISOString();
  return d.toISOString();
}
