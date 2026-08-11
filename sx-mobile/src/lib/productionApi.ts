import axios from 'axios';
import { api } from '../api/client';
import { normalizeCommentAttachments } from './commentAttachments';
import { boardCacheKey, setCachedBoard, applyPendingPatchesToProjects, clearPendingProjectPatches } from './productionBoardCache';
import type {
  KanbanStage,
  PersonalPlanner,
  ProductionBoard,
  ProductionProject,
} from '../types';

/** Request bị hủy (đổi filter / unmount) — không hiện lỗi UI. */
export function isAbortError(e: unknown): boolean {
  if (axios.isCancel(e)) return true;
  if (!e || typeof e !== 'object') return false;
  const err = e as { name?: string; code?: string; message?: string };
  return (
    err.name === 'AbortError'
    || err.name === 'CanceledError'
    || err.code === 'ERR_CANCELED'
    || /aborted|canceled|cancelled/i.test(String(err.message || ''))
  );
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const err = new Error('Aborted');
  err.name = 'AbortError';
  throw err;
}

function abortError(): Error {
  const err = new Error('Aborted');
  err.name = 'AbortError';
  return err;
}

function waitForAbort(signal?: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (!signal) return;
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    signal.addEventListener('abort', () => reject(abortError()), { once: true });
  });
}

export function mapProjectRow(raw: Record<string, unknown>): ProductionProject {
  const customer = (raw.customer || {}) as { full_name?: string; phone?: string };
  const stage = (raw.current_stage || {}) as { id?: string; name?: string; slug?: string };
  const productionPerson = (raw.production_person || {}) as { id?: string; full_name?: string };
  const company = (raw.company || {}) as { id?: string; short_name?: string; name?: string };
  const workshopType = (raw.workshop_type || {}) as { id?: string; name?: string };
  const sxPipe = (raw.sx_pipeline_stage || {}) as { id?: string; progress_percent?: number | null };
  const crmDeals = Array.isArray(raw.crm_deals) ? (raw.crm_deals as Array<Record<string, unknown>>) : [];
  const dealWithRegion = crmDeals.find((d) => d && (d.region_id || d.crm_region));
  const crmRegion = (dealWithRegion?.crm_region || {}) as { id?: string; name?: string };
  const sxCol =
    (raw.sx_kanban_column_id as string)
    || (sxPipe.id ? String(sxPipe.id) : null)
    || null;
  return {
    id: String(raw.id || ''),
    code: String(raw.code || ''),
    name: String(raw.name || raw.code || 'Dự án sản xuất'),
    customer_name: customer.full_name ?? (raw.customer_name as string) ?? null,
    customer_phone: customer.phone ?? null,
    status: (raw.status as string) || null,
    priority: (raw.priority as string) || null,
    deadline: (raw.deadline as string) || null,
    production_deadline: (raw.production_deadline as string) || null,
    order_date: (raw.order_date as string) || null,
    delivery_date: (raw.delivery_date as string) || null,
    created_at: (raw.created_at as string) || null,
    updated_at: (raw.updated_at as string) || null,
    estimated_value: Number(raw.estimated_value || 0),
    production_value:
      raw.production_value != null && raw.production_value !== ''
        ? Number(raw.production_value)
        : null,
    deposit_amount:
      raw.deposit_amount != null && raw.deposit_amount !== ''
        ? Number(raw.deposit_amount)
        : null,
    progress: Number(raw.progress || 0),
    sx_pipeline_percent:
      raw.sx_pipeline_percent != null && raw.sx_pipeline_percent !== ''
        ? Number(raw.sx_pipeline_percent)
        : sxPipe.progress_percent != null && Number.isFinite(Number(sxPipe.progress_percent))
          ? Number(sxPipe.progress_percent)
          : null,
    task_total: Number(raw.task_total || 0),
    done_tasks: Number(raw.done_tasks || 0),
    is_overdue: Boolean(raw.is_overdue),
    is_delivery_overdue: Boolean(raw.is_delivery_overdue),
    is_production_overdue: Boolean(raw.is_production_overdue),
    sx_intake: Boolean(raw.sx_intake),
    sx_won_deal: Boolean(raw.sx_won_deal),
    sx_enriched: Boolean(raw.sx_enriched),
    current_stage_id: (raw.current_stage_id as string) ?? stage.id ?? null,
    workshop_type_id: (raw.workshop_type_id as string) ?? workshopType.id ?? null,
    sx_kanban_column_id: sxCol,
    stage_name: stage.name ?? null,
    stage_slug: stage.slug ?? null,
    production_person_id: productionPerson.id ?? null,
    production_person_name: productionPerson.full_name ?? null,
    company_name: company.short_name || company.name || null,
    company_id: (raw.company_id as string) ?? company.id ?? null,
    workshop_type_name: workshopType.name ?? null,
    logistics_company_id:
      (raw.logistics_company_id as string)
      ?? ((raw.logistics_company as { id?: string } | undefined)?.id ?? null),
    vc_kanban_column_id: (raw.vc_kanban_column_id as string) || null,
    region_id: (dealWithRegion?.region_id as string) ?? crmRegion.id ?? null,
    region_name: crmRegion.name ?? null,
    crm_deals: crmDeals.map((d) => ({
      id: d.id != null ? String(d.id) : undefined,
      type: d.type != null ? String(d.type) : undefined,
      external_company_name: d.external_company_name != null ? String(d.external_company_name) : null,
      external_catalog_id: d.external_catalog_id != null ? String(d.external_catalog_id) : null,
      sx_pipeline_stage_id: d.sx_pipeline_stage_id != null ? String(d.sx_pipeline_stage_id) : null,
    })),
  };
}

function mapStageRow(raw: Record<string, unknown>, index: number): KanbanStage {
  const wfStage = (raw.workflow_stage || {}) as { id?: string; slug?: string };
  const slugRaw = raw.slug != null && String(raw.slug).trim()
    ? String(raw.slug)
    : (wfStage.slug != null && String(wfStage.slug).trim() ? String(wfStage.slug) : null);
  return {
    id: String(raw.id || ''),
    name: String(raw.name || `Cột ${index + 1}`),
    color: (raw.color as string) ?? null,
    icon: (raw.icon as string) ?? null,
    order_index: Number(raw.order_index ?? index),
    slug: slugRaw,
    bucket_slug: (raw.bucket_slug as string) ?? null,
    workflow_stage_id: (raw.workflow_stage_id as string) ?? wfStage.id ?? null,
    workshop_type_id: (raw.workshop_type_id as string) ?? null,
    is_handover_to_logistics: Boolean(raw.is_handover_to_logistics),
    counts_as_completed_revenue: Boolean(raw.counts_as_completed_revenue),
    counts_as_collected_revenue: Boolean(raw.counts_as_collected_revenue),
    sla_days: raw.sla_days != null && raw.sla_days !== '' ? Number(raw.sla_days) : null,
    progress_percent:
      raw.progress_percent != null && raw.progress_percent !== ''
        ? Number(raw.progress_percent)
        : null,
    count: raw.count != null ? Number(raw.count) : undefined,
    total_value: raw.total_value != null ? Number(raw.total_value) : undefined,
  };
}

/** Status do cột SX slug sinh ra — khớp web SX_STAGE_SLUG_STATUS. */
const SX_STAGE_SLUG_STATUS: Record<string, string> = {
  production: 'producing',
  delivery: 'shipping',
  'customer-care': 'warranty',
};

/** Khớp web sxStageSlugOf: workflow_stage.slug || slug. */
function sxStageSlugOf(col: KanbanStage | null | undefined): string | null {
  if (!col) return null;
  const s = col.slug != null ? String(col.slug).trim() : '';
  return s || null;
}

function sxStatusComesFromColumn(
  project: ProductionProject,
  col: KanbanStage | null | undefined,
): boolean {
  const slug = sxStageSlugOf(col);
  if (!slug) return false;
  return SX_STAGE_SLUG_STATUS[slug] === String(project?.status || '');
}

/** Chỉ ép cột bàn giao VC khi status phản ánh luồng VC thật — khớp web shouldForceSxHandoverColumn. */
function shouldForceSxHandoverColumn(
  project: ProductionProject,
  pinned: KanbanStage | null | undefined,
): boolean {
  const st = String(project?.status || '');
  if (!st) return false;
  const inLogistics = Boolean(project.vc_kanban_column_id || project.logistics_company_id);
  if (st === 'completed') return inLogistics;
  if (st === 'installing' || st === 'warranty') return true;
  if (st === 'shipping') {
    if (pinned && sxStatusComesFromColumn(project, pinned)) return false;
    return true;
  }
  return false;
}

/** Index cột — tránh filter/find O(n) trên mỗi dự án khi board lớn. */
type StageIndex = {
  byId: Map<string, KanbanStage>;
  byWorkflow: Map<string, KanbanStage[]>;
  handoverByWorkshop: Map<string, KanbanStage>;
  handoverGlobal: KanbanStage | null;
  handoverFirst: KanbanStage | null;
  intake: KanbanStage | null;
  first: KanbanStage | null;
};

function buildStageIndex(stages: KanbanStage[]): StageIndex {
  const byId = new Map<string, KanbanStage>();
  const byWorkflow = new Map<string, KanbanStage[]>();
  const handoverByWorkshop = new Map<string, KanbanStage>();
  let handoverGlobal: KanbanStage | null = null;
  let handoverFirst: KanbanStage | null = null;
  let intake: KanbanStage | null = null;

  for (const s of stages) {
    byId.set(String(s.id), s);
    if (s.bucket_slug === 'won_pending' && !intake) intake = s;
    if (s.workflow_stage_id) {
      const key = String(s.workflow_stage_id);
      const list = byWorkflow.get(key);
      if (list) list.push(s);
      else byWorkflow.set(key, [s]);
    }
    if (s.is_handover_to_logistics) {
      if (!handoverFirst) handoverFirst = s;
      const wkt = s.workshop_type_id ? String(s.workshop_type_id) : '';
      if (wkt) {
        if (!handoverByWorkshop.has(wkt)) handoverByWorkshop.set(wkt, s);
      } else if (!handoverGlobal) {
        handoverGlobal = s;
      }
    }
  }

  return {
    byId,
    byWorkflow,
    handoverByWorkshop,
    handoverGlobal,
    handoverFirst,
    intake,
    first: stages[0] || null,
  };
}

function resolveSxHandoverColumnIdIndexed(
  index: StageIndex,
  project: ProductionProject,
  preferredColId: string | null = null,
): string | null {
  if (preferredColId && index.byId.has(String(preferredColId))) return preferredColId;
  if (!index.handoverFirst) return null;
  const wktId = project.workshop_type_id || null;
  if (wktId) {
    const typed = index.handoverByWorkshop.get(String(wktId));
    if (typed) return typed.id;
  }
  if (index.handoverGlobal) return index.handoverGlobal.id;
  return index.handoverFirst.id;
}

/**
 * Resolve cột hiển thị Kanban — khớp web `colIdFor` + fallback intake.
 * Khi chưa có sx_kanban_column_id: thêm lead-first giống BE enrich
 * (web luôn enrich trước nên colIdFor không cần bước này).
 */
export function resolveColumnId(
  project: ProductionProject,
  sortedStages: KanbanStage[],
  stageIndex?: StageIndex,
): string | null {
  const index = stageIndex || buildStageIndex(sortedStages);
  const intake = index.intake;

  // Ép cột bàn giao VC chỉ khi shouldForce (không ép completed thuần SX).
  {
    const pinned = project.sx_kanban_column_id && index.byId.has(String(project.sx_kanban_column_id))
      ? index.byId.get(String(project.sx_kanban_column_id))
      : null;
    if (shouldForceSxHandoverColumn(project, pinned)) {
      let preferred: string | null = null;
      if (pinned?.is_handover_to_logistics) preferred = project.sx_kanban_column_id || null;
      const handoverId = resolveSxHandoverColumnIdIndexed(index, project, preferred);
      if (handoverId) return handoverId;
    }
  }

  if (project.sx_kanban_column_id && index.byId.has(String(project.sx_kanban_column_id))) {
    return String(project.sx_kanban_column_id);
  }

  // Khớp BE enrich khi cột DB/enrich trống: lead sx_pipeline_stage_id trước workflow.
  // Tránh 1 deal «Kiểm tra chép» trên web bị đẩy sang «Tiếp nhận» trên app.
  {
    const deals = Array.isArray(project.crm_deals) ? project.crm_deals : [];
    const primaryDeal = deals.find((d) => String(d?.type || '') === 'deal') || deals[0] || null;
    const leadColId = primaryDeal?.sx_pipeline_stage_id || null;
    if (leadColId && index.byId.has(String(leadColId))) return String(leadColId);
  }

  const cid = project.current_stage_id;
  if (cid) {
    const wfMatches = index.byWorkflow.get(String(cid)) || [];
    if (wfMatches.length === 1) return wfMatches[0].id;
    if (wfMatches.length > 1) {
      const deals = Array.isArray(project.crm_deals) ? project.crm_deals : [];
      const primaryDeal = deals.find((d) => String(d?.type || '') === 'deal') || deals[0] || null;
      const leadColId = primaryDeal?.sx_pipeline_stage_id || null;
      const ids = new Set(wfMatches.map((m) => String(m.id)));
      if (project.sx_kanban_column_id && ids.has(String(project.sx_kanban_column_id))) {
        return String(project.sx_kanban_column_id);
      }
      if (leadColId && ids.has(String(leadColId))) return String(leadColId);
      return [...wfMatches].sort((a, b) => a.order_index - b.order_index)[0]?.id || null;
    }
  }

  if (project.sx_won_deal || project.sx_intake) {
    return intake?.id || index.first?.id || null;
  }

  return intake?.id || index.first?.id || null;
}

/** Cột «Đã công» hoặc sla_days=0 — khớp web `shouldIgnoreSxOrderDeliveryOverdue`. */
function shouldIgnoreSxOrderDeliveryOverdue(stage: KanbanStage | null | undefined): boolean {
  if (!stage) return false;
  if (stage.counts_as_completed_revenue) return true;
  if (stage.sla_days === 0) return true;
  return false;
}

/**
 * Quá hạn KPI/card — khớp web `isSxProjectDeliveryDateOverdue`.
 * Ngày: delivery_date → production_deadline → deadline.
 * So sánh theo ngày lịch (khớp cột Deadline trên web).
 */
export function isSxProjectDeliveryDateOverdue(
  project: ProductionProject,
  stages: KanbanStage[],
  stageIndex?: StageIndex,
): boolean {
  // Khớp web: ưu tiên sx_kanban_column_id (sau attach = cột resolve).
  const colId = project.sx_kanban_column_id ?? project.resolved_column_id ?? null;
  const index = stageIndex || buildStageIndex(stages);
  const stage = colId ? index.byId.get(String(colId)) : undefined;
  if (shouldIgnoreSxOrderDeliveryOverdue(stage)) return false;
  const raw = project.delivery_date || project.production_deadline || project.deadline;
  if (!raw || project.status === 'completed') return false;
  const t = new Date(raw);
  if (Number.isNaN(t.getTime())) return false;
  const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  return startOfDay(t).getTime() < startOfDay(new Date()).getTime();
}

export type BoardFilters = {
  /** Lọc theo công ty xưởng SX (company_id). */
  companyId?: string;
  /** Lọc theo công ty đặt hàng CRM (deal_company_id). */
  dealCompanyId?: string;
  /**
   * Lọc theo phân loại (workshop_type_id).
   * Phải gửi kèm GET /production/projects để BE enrich đúng cột (không gộp pipeline mọi loại).
   */
  workshopTypeId?: string;
};

export type ProductionBoardSummary = {
  total: number;
  producing: number;
  awaitingDelivery: number;
  shipped: number;
  overdue: number;
};

/** KPI Tổng / Đang SX / Chờ VC / Đã VC / Quá hạn — cùng filter với Kanban (summary=1). */
export async function fetchProductionBoardSummary(
  filters?: BoardFilters,
  bustCache = false,
  signal?: AbortSignal,
): Promise<ProductionBoardSummary | null> {
  const params: Record<string, string | number> = {
    summary: 1,
    view: 'mobile',
  };
  if (filters?.companyId) params.company_id = filters.companyId;
  if (filters?.dealCompanyId) params.deal_company_id = filters.dealCompanyId;
  if (filters?.workshopTypeId) params.workshop_type_id = filters.workshopTypeId;
  try {
    throwIfAborted(signal);
    const { data } = await api.get<{
      total?: number;
      deadline_counts?: { overdue?: number };
      stage_kpis?: {
        producing?: number;
        awaiting_delivery?: number;
        shipped?: number;
      };
    }>('/production/projects', {
      params,
      signal,
      ...(bustCache ? { headers: { 'x-no-cache': '1' } } : {}),
    });
    throwIfAborted(signal);
    const sk = data?.stage_kpis;
    if (!sk || typeof sk !== 'object') return null;
    return {
      total: Number(data?.total) || 0,
      producing: Number(sk.producing) || 0,
      awaitingDelivery: Number(sk.awaiting_delivery) || 0,
      shipped: Number(sk.shipped) || 0,
      overdue: Number(data?.deadline_counts?.overdue) || 0,
    };
  } catch (e) {
    if (isAbortError(e)) throw e;
    return null;
  }
}

/**
 * Tải board: stages + trang dự án đầu song song → UI sớm;
 * các trang còn lại tải nền (onPartial cập nhật dần).
 * BE tối đa limit=500/trang — khớp mặc định web.
 * `view=mobile` → payload/enrich nhẹ phía BE.
 *
 * Shared inflight theo filter: Overview + Kanban cùng lúc chỉ 1 mạng;
 * signal của từng màn chỉ bỏ apply UI, không hủy tải dùng chung (trừ bustCache).
 *
 * @param bustCache true chỉ khi user kéo refresh — silent/init dùng HTTP cache 20s.
 */
const PROJECTS_PAGE_LIMIT = 500;
const PROJECTS_MAX_PAGES = 12;
const PROJECTS_FETCH_CONCURRENCY = 4;

function attachColumnsIndexed(
  list: ProductionProject[],
  stages: KanbanStage[],
  index: StageIndex,
): ProductionProject[] {
  return list.map((p) => {
    const beColRaw = p.sx_kanban_column_id;
    let finalKpiCol: string | null;
    let sxIntake: boolean;

    if (p.sx_enriched) {
      finalKpiCol = beColRaw != null && beColRaw !== '' ? String(beColRaw) : null;
      sxIntake = Boolean(p.sx_intake);
    } else if (beColRaw != null && beColRaw !== '') {
      finalKpiCol = String(beColRaw);
      sxIntake = Boolean(p.sx_intake);
    } else {
      finalKpiCol = null;
      sxIntake = false;
    }

    const withKpi: ProductionProject = {
      ...p,
      sx_kanban_column_id: finalKpiCol,
      sx_intake: sxIntake,
    };
    let displayColId = resolveColumnId(withKpi, stages, index);
    if (finalKpiCol && index.byId.has(String(finalKpiCol))) {
      displayColId = String(finalKpiCol);
    }

    const col = displayColId && index.byId.has(String(displayColId))
      ? index.byId.get(String(displayColId))
      : undefined;
    const pipelinePct =
      withKpi.sx_pipeline_percent != null && Number.isFinite(Number(withKpi.sx_pipeline_percent))
        ? Number(withKpi.sx_pipeline_percent)
        : col?.progress_percent != null && Number.isFinite(Number(col.progress_percent))
          ? Number(col.progress_percent)
          : null;

    const withCol = {
      ...withKpi,
      resolved_column_id: displayColId || finalKpiCol,
      sx_pipeline_percent: pipelinePct,
    };
    return {
      ...withCol,
      is_overdue: isSxProjectDeliveryDateOverdue(withCol, stages, index),
    };
  });
}

export type FetchBoardOptions = {
  /** Gọi sau trang đầu (và mỗi lô nền) — UI hiện sớm. */
  onPartial?: (board: ProductionBoard) => void;
  /** false = chỉ ~500 dự án đầu. Mặc định true. */
  loadRemaining?: boolean;
  /** Hủy apply UI khi đổi filter / unmount — shared fetch vẫn chạy tới complete. */
  signal?: AbortSignal;
};

type InflightBoard = {
  promise: Promise<ProductionBoard>;
  partialListeners: Set<(board: ProductionBoard) => void>;
};

const inflightBoards = new Map<string, InflightBoard>();

function emitPartialTo(listeners: Set<(board: ProductionBoard) => void>, board: ProductionBoard) {
  for (const fn of [...listeners]) {
    try {
      fn(board);
    } catch {
      /* ignore listener errors */
    }
  }
}

async function fetchProductionBoardInternal(
  bustCache: boolean,
  filters: BoardFilters,
  loadRemaining: boolean,
  partialListeners: Set<(board: ProductionBoard) => void>,
): Promise<ProductionBoard> {
  const stageParams: Record<string, unknown> = { all: 'false' };
  if (bustCache) stageParams._t = Date.now();
  if (filters.companyId) stageParams.company_id = filters.companyId;
  if (filters.workshopTypeId) stageParams.workshop_type_id = filters.workshopTypeId;

  const buildProjectParams = (page: number): Record<string, unknown> => {
    const params: Record<string, unknown> = {
      page,
      limit: PROJECTS_PAGE_LIMIT,
      view: 'mobile',
    };
    if (bustCache) params._t = Date.now();
    if (filters.companyId) params.company_id = filters.companyId;
    if (filters.dealCompanyId) params.deal_company_id = filters.dealCompanyId;
    if (filters.workshopTypeId) params.workshop_type_id = filters.workshopTypeId;
    return params;
  };

  const getPage = async (page: number) => {
    const { data } = await api.get<{
      projects?: Array<Record<string, unknown>>;
      totalPages?: number;
    }>('/production/projects', { params: buildProjectParams(page) });
    return {
      rows: Array.isArray(data?.projects) ? data.projects : [],
      totalPages: Number(data?.totalPages || 1),
    };
  };

  const [stageOutcome, first] = await Promise.all([
    api
      .get<Array<Record<string, unknown>>>('/production/pipeline-stages', {
        params: Object.keys(stageParams).length ? stageParams : undefined,
      })
      .then((r) => ({
        rows: Array.isArray(r.data) ? r.data : ([] as Array<Record<string, unknown>>),
        ok: true as const,
      }))
      .catch((e) => {
        console.warn('[sx board] pipeline-stages failed', e);
        return { rows: [] as Array<Record<string, unknown>>, ok: false as const };
      }),
    getPage(1),
  ]);

  const stages = stageOutcome.rows
    .map((s, i) => mapStageRow(s, i))
    .sort((a, b) => a.order_index - b.order_index);
  const stageIndex = buildStageIndex(stages);

  if (!stageOutcome.ok && stages.length === 0 && first.rows.length > 0) {
    throw new Error('Không tải được cột pipeline. Kiểm tra mạng và thử lại.');
  }

  let attached: ProductionProject[] = [];
  const beTotalPages = Math.max(1, first.totalPages);
  const truncated = beTotalPages > PROJECTS_MAX_PAGES;
  const totalPages = Math.min(beTotalPages, PROJECTS_MAX_PAGES);

  const emitAttached = (pagingDone: boolean) => {
    // Re-apply socket patches — tránh trang sau ghi đè cột vừa kéo.
    attached = applyPendingPatchesToProjects(attached, stages);
    const board: ProductionBoard = {
      stages,
      projects: attached,
      kpis: null,
      truncated,
    };
    // Truncated → không complete (silent skip sẽ che dữ liệu thiếu).
    const complete = pagingDone && !truncated;
    setCachedBoard(filters, board, { complete });
    emitPartialTo(partialListeners, board);
    return board;
  };

  if (bustCache) clearPendingProjectPatches();

  attached = attachColumnsIndexed(first.rows.map(mapProjectRow), stages, stageIndex);
  const hasMore = loadRemaining && totalPages > 1 && first.rows.length >= PROJECTS_PAGE_LIMIT;
  if (!hasMore) {
    return emitAttached(true);
  }

  // Partial: UI sớm nhưng không đánh fresh / không ghi disk.
  emitAttached(false);

  const remaining: number[] = [];
  for (let p = 2; p <= totalPages; p += 1) remaining.push(p);

  for (let i = 0; i < remaining.length; i += PROJECTS_FETCH_CONCURRENCY) {
    const batch = remaining.slice(i, i + PROJECTS_FETCH_CONCURRENCY);
    const results = await Promise.all(batch.map((p) => getPage(p)));
    const newRows: ProductionProject[] = [];
    for (const r of results) {
      for (const row of r.rows) newRows.push(mapProjectRow(row));
    }
    if (newRows.length) {
      attached = attached.concat(attachColumnsIndexed(newRows, stages, stageIndex));
      const done = i + PROJECTS_FETCH_CONCURRENCY >= remaining.length;
      emitAttached(done);
    }
  }

  return emitAttached(true);
}

export async function fetchProductionBoard(
  bustCache = false,
  filters: BoardFilters = {},
  options: FetchBoardOptions = {},
): Promise<ProductionBoard> {
  const loadRemaining = options.loadRemaining !== false;
  const signal = options.signal;
  throwIfAborted(signal);

  const dedupeKey = `${boardCacheKey(filters)}|b${bustCache ? 1 : 0}|r${loadRemaining ? 1 : 0}`;

  let entry = !bustCache ? inflightBoards.get(dedupeKey) : undefined;
  if (!entry) {
    const partialListeners = new Set<(board: ProductionBoard) => void>();
    const promise = fetchProductionBoardInternal(
      bustCache,
      filters,
      loadRemaining,
      partialListeners,
    ).finally(() => {
      if (inflightBoards.get(dedupeKey) === created) inflightBoards.delete(dedupeKey);
    });
    const created: InflightBoard = { promise, partialListeners };
    entry = created;
    if (!bustCache) inflightBoards.set(dedupeKey, created);
  }

  if (options.onPartial) entry.partialListeners.add(options.onPartial);
  try {
    if (!signal) return await entry.promise;
    return await Promise.race([entry.promise, waitForAbort(signal)]);
  } finally {
    if (options.onPartial) entry.partialListeners.delete(options.onPartial);
  }
}

export async function fetchProductionProject(projectId: string): Promise<ProductionProject> {
  const { data } = await api.get<{ project?: Record<string, unknown> }>(
    `/production/projects/${projectId}`,
  );
  const raw = (data?.project ?? data) as Record<string, unknown>;
  return mapProjectRow(raw);
}

/**
 * Chuyển dự án sang cột Kanban khác.
 * Backend: PATCH /production/projects/:id/stage
 *  - production_pipeline_stage_id: cột đích
 *  - current_sx_pipeline_stage_id: cột hiện tại (để gate chặn chuyển tiến nếu còn nhiệm vụ)
 *  - move_to_intake: true nếu đích là cột "chờ vào xưởng"
 */
export async function moveProjectToStage(
  projectId: string,
  targetStageId: string,
  options: { currentStageId?: string | null; isIntake?: boolean; companyId?: string | null } = {},
): Promise<{ sx_kanban_column_id?: string; current_stage_id?: string | null }> {
  if (options.isIntake) {
    const { data } = await api.patch(`/production/projects/${projectId}/stage`, { move_to_intake: true });
    return {
      sx_kanban_column_id: data?.project?.sx_kanban_column_id ?? targetStageId,
      current_stage_id: data?.project?.current_stage_id ?? null,
    };
  }
  const { data } = await api.patch(`/production/projects/${projectId}/stage`, {
    production_pipeline_stage_id: targetStageId,
    current_sx_pipeline_stage_id: options.currentStageId ?? null,
    company_id: options.companyId || undefined,
  });
  return {
    sx_kanban_column_id: data?.pipeline_stage_id ?? data?.project?.sx_kanban_column_id ?? targetStageId,
    current_stage_id: data?.project?.current_stage_id ?? null,
  };
}

/** Gắn phân loại xưởng cho dự án — khớp web PUT /projects/:id { workshop_type_id }. */
export async function assignProjectWorkshopType(
  projectId: string,
  workshopTypeId: string,
): Promise<ProductionProject> {
  const { data } = await api.put<{ project?: Record<string, unknown> }>(
    `/projects/${projectId}`,
    { workshop_type_id: workshopTypeId },
  );
  const raw = (data?.project ?? data) as Record<string, unknown>;
  return mapProjectRow(raw);
}

export type CreateDealInput = {
  title: string;
  estimatedValue?: number | null;
  customerName?: string | null;
  customerPhone?: string | null;
  notes?: string | null;
  companyId?: string | null;
};

/**
 * Tạo Deal mới (CRM). Nếu có tên khách → tạo customer trước rồi gắn customer_id.
 * Backend tự resolve company/pipeline/stage; chỉ `title` là bắt buộc.
 */
export async function createDeal(input: CreateDealInput): Promise<{ id: string; code?: string }> {
  let customerId: string | null = null;
  const name = input.customerName?.trim();
  if (name) {
    try {
      const { data: cust } = await api.post('/crm/customers', {
        full_name: name,
        phone: input.customerPhone?.trim() || null,
        company_id: input.companyId || undefined,
      });
      customerId = cust?.id ?? null;
    } catch {
      // Không tạo được khách thì vẫn tạo deal (không chặn).
      customerId = null;
    }
  }

  const payload: Record<string, unknown> = { title: input.title.trim() };
  if (input.estimatedValue != null && !Number.isNaN(input.estimatedValue)) {
    payload.estimated_value = input.estimatedValue;
  }
  if (customerId) payload.customer_id = customerId;
  if (input.notes?.trim()) payload.notes = input.notes.trim();
  if (input.companyId) payload.company_id = input.companyId;

  const { data } = await api.post('/crm/deals', payload);
  return { id: String(data?.id || ''), code: data?.code };
}

/** Planner cá nhân của user hiện tại (cột + item tự sắp xếp trên web). */
export async function fetchPersonalPlanner(): Promise<PersonalPlanner> {
  const { data } = await api.get<{
    columns?: Array<Record<string, unknown>>;
    items?: Array<Record<string, unknown>>;
  }>('/production/planner/me');
  const columns = Array.isArray(data?.columns)
    ? data.columns.map((c) => ({
        id: String(c.id),
        name: String(c.name || 'Cột'),
        color: (c.color as string) ?? null,
        position: Number(c.position ?? 0),
      }))
    : [];
  const items = Array.isArray(data?.items)
    ? data.items.map((it) => ({
        id: String(it.id),
        column_id: String(it.column_id),
        project_id: String(it.project_id),
        position: Number(it.position ?? 0),
      }))
    : [];
  return { columns, items };
}

export type CompanyOption = { id: string; name: string };

export async function fetchCompanies(): Promise<CompanyOption[]> {
  const { data } = await api.get<{ companies?: unknown[] } | unknown[]>(
    '/companies',
    { params: { for_module: 'production' } },
  );
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.companies)
      ? data.companies
      : [];
  return list.map((c) => {
    const row = c as Record<string, unknown>;
    return {
      id: String(row.id || ''),
      name: String(row.short_name || row.name || row.id || ''),
    };
  }).filter((c) => c.id);
}

export type WorkshopTypeOption = { id: string; name: string };

export type CommentIndexEntry = {
  count: number;
  last_at: string | null;
  last_user_id: string | null;
};

export type ProjectCommentUser = {
  id?: string;
  full_name?: string;
  avatar?: string | null;
};

export type ProjectComment = {
  id: string;
  project_id?: string;
  user_id: string;
  parent_id?: string | null;
  content: string;
  created_at: string;
  updated_at?: string | null;
  attachments?: import('./commentAttachments').CommentAttachment[];
  user?: ProjectCommentUser;
  reactions?: {
    summary: { emoji: string; count: number }[];
    mine: string | null;
  };
};

function mapCommentRow(raw: Record<string, unknown>): ProjectComment {
  const user = (raw.user || {}) as Record<string, unknown>;
  const reactions = (raw.reactions || { summary: [], mine: null }) as ProjectComment['reactions'];
  return {
    id: String(raw.id || ''),
    project_id: raw.project_id != null ? String(raw.project_id) : undefined,
    user_id: String(raw.user_id || ''),
    parent_id: raw.parent_id != null && raw.parent_id !== '' ? String(raw.parent_id) : null,
    content: String(raw.content || ''),
    created_at: String(raw.created_at || ''),
    updated_at: raw.updated_at != null ? String(raw.updated_at) : null,
    attachments: normalizeCommentAttachments(raw.attachments),
    user: {
      id: user.id != null ? String(user.id) : undefined,
      full_name: user.full_name != null ? String(user.full_name) : undefined,
      avatar: user.avatar != null ? String(user.avatar) : null,
    },
    reactions: {
      summary: Array.isArray(reactions?.summary) ? reactions!.summary : [],
      mine: reactions?.mine ?? null,
    },
  };
}

export async function fetchProjectComments(projectId: string): Promise<ProjectComment[]> {
  const { data } = await api.get<{ comments?: unknown[] }>(`/projects/${projectId}/comments`);
  const list = Array.isArray(data?.comments) ? data.comments : [];
  return list.map((row) => mapCommentRow(row as Record<string, unknown>));
}

export async function fetchProjectCommentIndex(
  projectIds: string[],
): Promise<Record<string, CommentIndexEntry>> {
  const ids = [...new Set(projectIds.map(String).filter(Boolean))];
  if (!ids.length) return {};
  // Chia nhỏ khi nhiều id (tránh URL quá dài).
  const CHUNK = 80;
  const out: Record<string, CommentIndexEntry> = {};
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    try {
      const { data } = await api.get<Record<string, CommentIndexEntry>>('/projects/comments/index', {
        params: { project_ids: chunk.join(',') },
      });
      if (data && typeof data === 'object') Object.assign(out, data);
    } catch {
      // ignore chunk errors
    }
  }
  return out;
}

export async function postProjectComment(
  projectId: string,
  content: string,
  parentId?: string | null,
  attachments?: import('./commentAttachments').CommentAttachment[] | null,
): Promise<ProjectComment> {
  const payload: {
    content: string;
    parent_id?: string;
    attachments?: import('./commentAttachments').CommentAttachment[];
  } = { content: content.trim() };
  if (parentId) payload.parent_id = parentId;
  if (attachments?.length) payload.attachments = attachments;
  const { data } = await api.post<{ comment?: unknown } & Record<string, unknown>>(
    `/projects/${projectId}/comments`,
    payload,
  );
  const row = (data?.comment ?? data) as Record<string, unknown>;
  return mapCommentRow(row);
}

export async function toggleProjectCommentReaction(
  projectId: string,
  commentId: string,
  emoji: string,
): Promise<ProjectComment['reactions']> {
  const { data } = await api.put<ProjectComment['reactions']>(
    `/projects/${projectId}/comments/${commentId}/reaction`,
    { emoji },
  );
  return data || { summary: [], mine: null };
}

export async function fetchWorkshopTypes(
  companyId?: string | null,
  clientCompanyId?: string | null,
): Promise<WorkshopTypeOption[]> {
  if (!companyId) return [];
  const params: Record<string, string> = { company_id: companyId, module: 'production' };
  if (clientCompanyId) params.client_company_id = clientCompanyId;
  const { data } = await api.get<unknown>('/workshop/project-types', { params });
  const list = Array.isArray(data) ? data : [];
  return list.map((t) => {
    const row = t as Record<string, unknown>;
    return { id: String(row.id || ''), name: String(row.name || row.id || '') };
  }).filter((t) => t.id);
}

export type ClientCompanyOption = {
  id: string;
  name: string;
  short_name?: string | null;
  client_company_id?: string | null;
  external_catalog_id?: string | null;
  source?: string;
};

/** Công ty đặt hàng (CRM + danh mục ngoài) — GET /production/client-companies */
export async function fetchClientCompanies(workshopCompanyId: string): Promise<ClientCompanyOption[]> {
  const { data } = await api.get<{ items?: unknown[] }>('/production/client-companies', {
    params: { company_id: workshopCompanyId },
  });
  const list = Array.isArray(data?.items) ? data.items : [];
  return list.map((c) => {
    const row = c as Record<string, unknown>;
    return {
      id: String(row.id || ''),
      name: String(row.name || row.short_name || row.id || ''),
      short_name: row.short_name != null ? String(row.short_name) : null,
      client_company_id: row.client_company_id != null ? String(row.client_company_id) : null,
      external_catalog_id: row.external_catalog_id != null ? String(row.external_catalog_id) : null,
      source: row.source != null ? String(row.source) : undefined,
    };
  }).filter((c) => c.id);
}

/** Xưởng thích hợp khi đã chọn công ty đặt hàng — GET /production/workshop-options */
export async function fetchWorkshopOptionsForDeal(dealCompanyId: string): Promise<CompanyOption[]> {
  const { data } = await api.get<{ workshops?: unknown[] }>('/production/workshop-options', {
    params: { deal_company_id: dealCompanyId },
  });
  const list = Array.isArray(data?.workshops) ? data.workshops : [];
  return list.map((c) => {
    const row = c as Record<string, unknown>;
    return {
      id: String(row.id || ''),
      name: String(row.short_name || row.name || row.id || ''),
    };
  }).filter((c) => c.id);
}

export type ExternalCompanyOption = { id: string; name: string };

export async function fetchExternalCompanies(companyId: string): Promise<ExternalCompanyOption[]> {
  const { data } = await api.get<{ items?: unknown[] }>('/production/external-companies', {
    params: { company_id: companyId },
  });
  const list = Array.isArray(data?.items) ? data.items : [];
  return list.map((c) => {
    const row = c as Record<string, unknown>;
    return { id: String(row.id || ''), name: String(row.name || row.id || '') };
  }).filter((c) => c.id);
}

export type RegionOption = { id: string; name: string; divisionName?: string | null };

/**
 * Khu vực thuộc công ty. Mặc định không lọc for_module để hiện đủ khu vực đã cấu hình
 * (for_module=production thường chỉ còn 1 khu vực nếu khối SX không bao phủ hết).
 */
export async function fetchCompanyRegions(
  companyId: string,
  opts?: { forModule?: 'production' | 'crm' | null },
): Promise<RegionOption[]> {
  const params: Record<string, string> = { company_id: companyId };
  if (opts?.forModule) params.for_module = opts.forModule;
  const { data } = await api.get<unknown>('/crm/company-regions', { params });
  const list = Array.isArray(data) ? data : [];
  return list
    .filter((r) => (r as Record<string, unknown>).is_active !== false)
    .map((r) => {
      const row = r as Record<string, unknown>;
      const division = (row.division || {}) as Record<string, unknown>;
      const divisionName = division.short_name || division.name || null;
      return {
        id: String(row.id || ''),
        name: String(row.name || row.id || ''),
        divisionName: divisionName ? String(divisionName) : null,
      };
    })
    .filter((r) => r.id);
}

export type WorkshopIntakeInput = {
  title: string;
  company_id: string;
  workshop_type_id: string;
  region_id?: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  install_address?: string | null;
  estimated_value?: number;
  description?: string | null;
  external_company_name?: string | null;
};

export type WorkshopIntakeResult = {
  project_id?: string;
  project_code?: string;
  project_name?: string;
  deal_id?: string;
  deal_code?: string;
  timing?: {
    total_ms?: number;
    api_total_ms?: number;
    phases_ms?: Record<string, number>;
    route_invalidate_ms?: number;
    route_emit_ms?: number;
  };
};

/** Tạo đến xưởng trực tiếp trên Kanban SX — không qua pipeline CRM. */
export async function createWorkshopIntake(input: WorkshopIntakeInput): Promise<WorkshopIntakeResult> {
  const { data } = await api.post<WorkshopIntakeResult>('/production/workshop-intake', {
    title: input.title.trim(),
    company_id: input.company_id,
    workshop_type_id: input.workshop_type_id,
    region_id: input.region_id || null,
    customer_name: input.customer_name.trim(),
    customer_phone: input.customer_phone.trim(),
    customer_email: input.customer_email?.trim() || null,
    install_address: input.install_address?.trim() || null,
    estimated_value: input.estimated_value ?? 0,
    description: input.description?.trim() || null,
    external_company_name: input.external_company_name?.trim() || null,
  });
  return data || {};
}
