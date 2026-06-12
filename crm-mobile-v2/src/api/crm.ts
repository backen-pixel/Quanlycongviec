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

type ApiStage = { id?: string; name?: string | null; color?: string | null; icon?: string | null; order_index?: number };
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
  crm_next_open_task_deadline?: string | null;
  next_follow_up_at?: string | null;
  expected_close_date?: string | null;
  stage?: ApiStage | null;
  customer?: { full_name?: string | null; phone?: string | null; address?: string | null } | null;
  company?: { name?: string | null; short_name?: string | null } | null;
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
  return it.crm_next_open_task_deadline || it.next_follow_up_at || it.expected_close_date || null;
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
    .map((s, i) => ({
      id: String(s.id || ''),
      name: s.name || 'Stage',
      icon: s.icon || (type === 'lead' ? '📋' : '💼'),
      color: s.color || '',
      orderIndex: s.order_index ?? i,
    }))
    .filter((s) => s.id);
}

/** Lead/Deal đã phân loại = có stage_id thuộc pipeline đang active. */
export function isClassifiedKanbanItem(item: CrmKanbanItem, stageIds: Set<string>): boolean {
  return item.stageId !== '' && stageIds.has(item.stageId);
}

/** Gắn params lọc chung cho GET /crm/leads. */
function applyListParams(params: Record<string, unknown>, opts?: CrmStageFetchOpts) {
  if (opts?.search?.trim()) params.search = opts.search.trim();
  if (opts?.assignedTo) params.assigned_to = opts.assignedTo;
  if (opts?.phoneFilter) params.phone_filter = opts.phoneFilter;
  if (opts?.dateFrom) params.date_from = opts.dateFrom;
  if (opts?.dateTo) params.date_to = opts.dateTo;
  if (opts?.companyId) params.company_id = opts.companyId;
  if (opts?.regionId && opts.regionId !== '__none__') params.region_id = opts.regionId;
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

/** Tổng số bản ghi từng cột — song song, mỗi cột chỉ lấy limit=1 để đọc total. */
export async function fetchStageCounts(
  type: 'lead' | 'deal',
  stageIds: string[],
  opts?: CrmStageFetchOpts,
): Promise<Record<string, number>> {
  if (!stageIds.length) return {};
  const pairs = await Promise.all(
    stageIds.map(async (stageId) => {
      try {
        const { total } = await fetchCrmRowsForStage(type, stageId, 0, 1, opts);
        return [stageId, total] as const;
      } catch {
        return [stageId, 0] as const;
      }
    }),
  );
  return Object.fromEntries(pairs);
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

/**
 * Khởi tạo cực nhanh (~1–2 request): stages + trang đầu cột active.
 * Không chờ count các cột khác — gọi fetchStageCounts nền sau.
 */
export async function fetchCrmBoardInitial(
  type: 'lead' | 'deal',
  initialStageId?: string,
  opts?: CrmStageFetchOpts,
): Promise<CrmBoardBootstrap> {
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

/** Số bản ghi tối đa trên Planner (khớp SECTION_LIMIT). */
export const PLANNER_FETCH_LIMIT = 30;

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

function resolveStageId(it: ApiLead): string {
  return String(it.stage?.id || it.stage_id || '');
}

/** Chỉ giữ bản ghi đang nằm trong cột pipeline hợp lệ (web không hiện deal lệch stage). */
function inActivePipeline(it: ApiLead, stageIds: Set<string>): boolean {
  const sid = resolveStageId(it);
  return sid !== '' && stageIds.has(sid);
}

export type PlannerData = { leads: PlannerItem[]; deals: PlannerItem[] };

const plannerByDue = (a: PlannerItem, b: PlannerItem) => {
  if (a.dueIso && b.dueIso) return new Date(a.dueIso).getTime() - new Date(b.dueIso).getTime();
  if (a.dueIso) return -1;
  if (b.dueIso) return 1;
  return 0;
};

/** Một trang leads/deals cho Planner — server lọc assigned_to. */
async function fetchPlannerPage(
  type: 'lead' | 'deal',
  userId: string,
  signal?: AbortSignal,
): Promise<{ rows: ApiLead[]; total: number }> {
  const params: Record<string, unknown> = {
    type,
    limit: PLANNER_FETCH_LIMIT,
    offset: 0,
    assigned_to: userId,
  };
  const { data } = await api.get('/crm/leads', { params, signal });
  const { rows, total } = parsePayload(data, PLANNER_FETCH_LIMIT);
  return { rows, total };
}

/** Leads hoặc Deals cá nhân — tối ưu: không gọi pipeline-stages khi total=0. */
export async function fetchPlannerSection(
  type: 'lead' | 'deal',
  userId: string,
  signal?: AbortSignal,
): Promise<PlannerItem[]> {
  const page = await fetchPlannerPage(type, userId, signal);
  if (page.total === 0) return [];
  const stageIds = new Set(
    (await fetchPipelineStagesCached(type, { signal })).map((s) => s.id),
  );
  return page.rows
    .filter((it) => inActivePipeline(it, stageIds))
    .map((it) => toPlannerItem(it, type))
    .sort(plannerByDue);
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

/** Tạo khách hàng + lead/deal. */
export async function createEntity(input: {
  kind: 'lead' | 'deal';
  name: string;
  phone: string;
  value?: number;
  note?: string;
  assigneeId?: string | null;
}): Promise<void> {
  const { data: customer } = await api.post<{ id: string }>('/customers', {
    full_name: input.name.trim() || 'Khách mới',
    phone: input.phone.trim() || null,
  });
  if (input.kind === 'lead') {
    let stageId: string | undefined;
    try {
      const { data: stagesRaw } = await api.get<ApiStage[]>('/crm/pipeline-stages', {
        params: { type: 'lead' },
      });
      const ordered = (Array.isArray(stagesRaw) ? stagesRaw : []).sort(
        (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0),
      );
      stageId = ordered[0]?.id ?? undefined;
    } catch {
      /* để backend tự gán nếu thiếu */
    }
    await api.post('/crm/leads', {
      title: input.name.trim(),
      customer_id: customer?.id || null,
      assigned_to: input.assigneeId || null,
      type: 'lead',
      stage_id: stageId,
      estimated_value: input.value || 0,
      probability: 50,
    });
  } else {
    await api.post('/crm/deals', {
      title: input.name.trim(),
      customer_id: customer?.id || null,
      estimated_value: input.value || 0,
      probability: 50,
      description: input.note?.trim() || null,
    });
  }
}
