import { colorFromName, dateLabel, initialsFromName } from '../lib/media';
import { daysSince, formatVnd } from '../lib/format';
import { api } from './client';
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
  pipeline_type?: string | null;
  is_won?: boolean | null;
  is_lost?: boolean | null;
  counts_as_expected_revenue?: boolean | null;
};
type ApiLead = {
  id: string;
  code?: string | null;
  title?: string | null;
  type?: string | null;
  install_address?: string | null;
  phone?: string | null;
  estimated_value?: number | null;
  created_at?: string | null;
  assigned_to?: string | null;
  lead_owner_id?: string | null;
  stage_id?: string | null;
  region_id?: string | null;
  kanban_deadline_at?: string | null;
  crm_next_open_task_deadline?: string | null;
  next_follow_up?: string | null;
  next_follow_up_at?: string | null;
  expected_close_date?: string | null;
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
const stagesCache = new Map<string, { stages: CrmPipelineStage[]; at: number }>();

function peekPipelineStagesCached(
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

async function fetchPipelineStagesCached(
  type: 'lead' | 'deal',
  opts?: CrmStageFetchOpts,
): Promise<CrmPipelineStage[]> {
  const key = stagesCacheKey(type, opts);
  const hit = stagesCache.get(key);
  if (hit && Date.now() - hit.at < STAGES_CACHE_TTL_MS) return hit.stages;
  const stages = await fetchPipelineStages(type, opts);
  stagesCache.set(key, { stages, at: Date.now() });
  return stages;
}

/** Xóa cache stages (sau refresh thủ công nếu cần). */
export function invalidatePipelineStagesCache(type?: 'lead' | 'deal', opts?: CrmStageFetchOpts) {
  if (type && opts) {
    stagesCache.delete(stagesCacheKey(type, opts));
    return;
  }
  if (type) {
    for (const key of stagesCache.keys()) {
      if (key.startsWith(`${type}|`)) stagesCache.delete(key);
    }
    return;
  }
  stagesCache.clear();
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
    valueLabel: kind === 'deal' ? formatVnd(it.estimated_value) : undefined,
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
export async function fetchPipelineStages(
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
  if (opts?.regionId && opts.regionId !== '__none__') params.region_id = opts.regionId;
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
    isWon: !!s.is_won,
    isLost: !!s.is_lost,
    countsAsExpectedRevenue: !!s.counts_as_expected_revenue,
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

/** Đếm + tổng GT theo cột pipeline trong 1 API call. */
export async function fetchCrmStageCountsBatch(
  type: 'lead' | 'deal',
  opts?: CrmStageFetchOpts,
): Promise<{
  counts: Record<string, number>;
  values: Record<string, number>;
  weightedValues: Record<string, number>;
  total: number;
}> {
  const params = crmListQueryParams(type, opts);
  const { data } = await api.get<{
    counts?: Record<string, number>;
    values?: Record<string, number>;
    weighted_values?: Record<string, number>;
    total?: number;
  }>(
    '/crm/stage-counts',
    { params, signal: opts?.signal },
  );
  const result = {
    counts: data?.counts && typeof data.counts === 'object' ? data.counts : {},
    values: data?.values && typeof data.values === 'object' ? data.values : {},
    weightedValues: data?.weighted_values && typeof data.weighted_values === 'object'
      ? data.weighted_values
      : {},
    total: typeof data?.total === 'number' ? data.total : 0,
  };
  setCrmTotalsCache(type, opts, result);
  return result;
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

/** Tổng lead/deal theo bộ lọc hiện tại — khớp KPI «Tổng» trên web (không lọc stage_id). */
export async function fetchCrmListTotal(
  type: 'lead' | 'deal',
  opts?: CrmStageFetchOpts,
): Promise<number> {
  const params: Record<string, unknown> = { type, limit: 1, offset: 0 };
  applyListParams(params, opts);
  const { data } = await api.get('/crm/leads', { params, signal: opts?.signal });
  return parsePayload(data, 1).total;
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
  setCrmBootstrapCache(type, initialStageId, opts, {
    stages,
    stageCounts: data?.stageCounts && typeof data.stageCounts === 'object' ? data.stageCounts : { [sid]: total },
    listTotal: typeof data?.listTotal === 'number' ? data.listTotal : undefined,
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
    stageCounts: data?.stageCounts && typeof data.stageCounts === 'object' ? data.stageCounts : { [sid]: total },
    listTotal: typeof data?.listTotal === 'number' ? data.listTotal : undefined,
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

/** Prefetch tổng + badge cột — mở tab Leads/Deals hiện số ngay. */
export function warmCrmHubStageCounts(companyId?: string, signal?: AbortSignal): void {
  const opts: CrmStageFetchOpts = { companyId, signal, lite: true };
  void Promise.all([
    fetchCrmStageCountsBatch('lead', opts).catch(() => null),
    fetchCrmStageCountsBatch('deal', opts).catch(() => null),
  ]);
}

/** Prefetch kanban bootstrap lite — mở CrmHub hiển thị ngay không chờ mạng. */
export async function warmCrmHubBootstrap(companyId?: string, signal?: AbortSignal): Promise<void> {
  const opts: CrmStageFetchOpts = { companyId, signal, skipCounts: true, lite: true };
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
const hubCache = new Map<string, { snapshot: CrmHubCacheSnapshot; at: number }>();
const bootstrapCache = new Map<string, { boot: CrmBoardBootstrap; at: number }>();
const totalsCache = new Map<string, { counts: Record<string, number>; total: number; at: number }>();

function totalsCacheKey(type: 'lead' | 'deal', opts?: CrmStageFetchOpts): string {
  return `totals|${type}|${stagesCacheKey(type, opts)}`;
}

function setCrmTotalsCache(
  type: 'lead' | 'deal',
  opts: CrmStageFetchOpts | undefined,
  batch: { counts: Record<string, number>; total: number },
): void {
  totalsCache.set(totalsCacheKey(type, opts), { ...batch, at: Date.now() });
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
}

export function invalidateCrmHubCache(userId?: string): void {
  if (!userId) {
    hubCache.clear();
    bootstrapCache.clear();
    totalsCache.clear();
    return;
  }
  for (const key of hubCache.keys()) {
    if (key.startsWith(`${userId}|`)) hubCache.delete(key);
  }
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

/** Chuyển lead/deal sang cột pipeline khác. */
export async function moveCrmItemStage(id: string, stageId: string): Promise<void> {
  await api.patch(`/crm/leads/${id}/stage`, { stage_id: stageId });
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
    contactName: it.customer?.full_name || '—',
    phone: it.customer?.phone || it.phone || '',
    location: it.install_address || it.customer?.address || it.company?.short_name || '—',
    valueLabel: kind === 'deal' ? formatVnd(it.estimated_value) : undefined,
    temp: kind === 'lead' ? tempFromStage(it.stage?.name) : undefined,
    ownerId,
    ownerName: owner,
    ownerInitials: initialsFromName(owner),
    ownerColor: colorFromName(owner),
    deadlineLabel,
    dueIso: due,
    overdue,
  };
}

function resolveStageId(it: ApiLead): string {
  return String(it.stage?.id || it.stage_id || '');
}

/** Chỉ giữ bản ghi đang nằm trong cột pipeline hợp lệ (web không hiện deal lệch stage). */
function inActivePipeline(it: ApiLead, stageIds: Set<string>, type: 'lead' | 'deal'): boolean {
  const sid = resolveStageId(it);
  if (sid === '' || !stageIds.has(sid)) return false;
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
};

/** Bộ lọc Planner — khớp tab CRM «Của tôi» (assigned_to + có SĐT + công ty). */
export function buildPlannerFetchOpts(userId: string, opts?: PlannerFetchOpts): CrmStageFetchOpts {
  return {
    assignedTo: userId,
    companyId: opts?.companyId,
    phoneFilter: 'has_phone',
    lite: true,
    signal: opts?.signal,
  };
}

/** Tổng lead/deal cá nhân — cùng nguồn với badge CRM Hub. */
export async function fetchPlannerSectionTotal(
  type: 'lead' | 'deal',
  userId: string,
  opts?: PlannerFetchOpts,
): Promise<number> {
  const batch = await fetchCrmStageCountsBatch(type, buildPlannerFetchOpts(userId, opts));
  return batch.total;
}

/** Một trang leads/deals cho Planner — server lọc assigned_to. */
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

async function filterRowsForPlannerKanban(
  rows: ApiLead[],
  type: 'lead' | 'deal',
  userId: string,
  opts?: PlannerFetchOpts,
): Promise<ApiLead[]> {
  if (!rows.length) return [];
  const stageIds = new Set(
    (await fetchPipelineStagesCached(type, {
      companyId: opts?.companyId,
      signal: opts?.signal,
    })).map((s) => s.id),
  );
  return rows.filter((it) => isMineCrmRow(it, userId, type) && inActivePipeline(it, stageIds, type));
}

export type PlannerData = { leads: PlannerItem[]; deals: PlannerItem[] };

const plannerByDue = (a: PlannerItem, b: PlannerItem) => {
  if (a.dueIso && b.dueIso) return new Date(a.dueIso).getTime() - new Date(b.dueIso).getTime();
  if (a.dueIso) return -1;
  if (b.dueIso) return 1;
  return 0;
};

const PLANNER_CACHE_TTL_MS = 90 * 1000;
const plannerCache = new Map<string, { data: PlannerData; at: number }>();

/** Đọc cache planner đồng bộ — dùng hiển thị ngay trước khi refresh nền. */
export function peekPlannerCache(userId: string): PlannerData | null {
  const hit = plannerCache.get(userId);
  if (!hit || Date.now() - hit.at >= PLANNER_CACHE_TTL_MS) return null;
  return hit.data;
}

export function invalidatePlannerCache(userId?: string) {
  if (userId) plannerCache.delete(userId);
  else plannerCache.clear();
}

/** Ghi cache sau khi tải từng section (Planner refresh nền). */
export function setPlannerCache(userId: string, data: PlannerData) {
  plannerCache.set(userId, { data, at: Date.now() });
}

/** Số bản ghi mỗi lần tải từ server cho Planner. */
export const PLANNER_FETCH_LIMIT = 40;

export type PlannerSectionPage = {
  items: PlannerItem[];
  total: number;
  hasMore: boolean;
  nextOffset: number;
};

/** Leads hoặc Deals cá nhân — có phân trang server. */
export async function fetchPlannerSectionPage(
  type: 'lead' | 'deal',
  userId: string,
  offset = 0,
  limit = PLANNER_FETCH_LIMIT,
  opts?: PlannerFetchOpts,
): Promise<PlannerSectionPage> {
  const page = await fetchPlannerPage(type, userId, offset, limit, opts);
  if (!page.rows.length) {
    return { items: [], total: 0, hasMore: false, nextOffset: page.nextOffset };
  }
  const filtered = await filterRowsForPlannerKanban(page.rows, type, userId, opts);
  const items = filtered
    .map((it) => toPlannerItem(it, type))
    .sort(plannerByDue);
  return {
    items,
    total: page.total,
    hasMore: page.hasMore,
    nextOffset: page.nextOffset,
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
  if (!opts?.force) {
    const cached = peekPlannerCache(userId);
    if (cached) return cached;
  }
  const [leads, deals] = await Promise.all([
    fetchPlannerSection('lead', userId, signal),
    fetchPlannerSection('deal', userId, signal),
  ]);
  const data = { leads, deals };
  plannerCache.set(userId, { data, at: Date.now() });
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

/** Danh sách công ty cho module CRM. */
export async function fetchCrmCompanies(signal?: AbortSignal): Promise<CrmCompanyOption[]> {
  const { data } = await api.get('/companies', { params: { for_module: 'crm' }, signal });
  return asArray<Record<string, unknown>>(data, 'companies').map((c) => ({
    id: String(c.id),
    name: String(c.name || c.short_name || 'Công ty'),
    shortName: c.short_name ? String(c.short_name) : undefined,
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

  const customerPayload: Record<string, unknown> = {
    full_name: input.customer.name.trim() || 'Khách mới',
    phone: input.customer.phone?.trim() || null,
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
