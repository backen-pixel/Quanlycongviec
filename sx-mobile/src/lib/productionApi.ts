import { api } from '../api/client';
import type {
  KanbanStage,
  PersonalPlanner,
  ProductionBoard,
  ProductionDashboard,
  ProductionProject,
} from '../types';

export function mapProjectRow(raw: Record<string, unknown>): ProductionProject {
  const customer = (raw.customer || {}) as { full_name?: string; phone?: string };
  const stage = (raw.current_stage || {}) as { id?: string; name?: string; slug?: string };
  const productionPerson = (raw.production_person || {}) as { id?: string; full_name?: string };
  const company = (raw.company || {}) as { id?: string; short_name?: string; name?: string };
  const workshopType = (raw.workshop_type || {}) as { id?: string; name?: string };
  const crmDeals = Array.isArray(raw.crm_deals) ? (raw.crm_deals as Array<Record<string, unknown>>) : [];
  const dealWithRegion = crmDeals.find((d) => d && (d.region_id || d.crm_region));
  const crmRegion = (dealWithRegion?.crm_region || {}) as { id?: string; name?: string };
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
    created_at: (raw.created_at as string) || null,
    estimated_value: Number(raw.estimated_value || 0),
    progress: Number(raw.progress || 0),
    task_total: Number(raw.task_total || 0),
    done_tasks: Number(raw.done_tasks || 0),
    is_overdue: Boolean(raw.is_overdue),
    sx_intake: Boolean(raw.sx_intake),
    sx_won_deal: Boolean(raw.sx_won_deal),
    current_stage_id: (raw.current_stage_id as string) ?? stage.id ?? null,
    workshop_type_id: (raw.workshop_type_id as string) ?? workshopType.id ?? null,
    sx_kanban_column_id: (raw.sx_kanban_column_id as string) ?? null,
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
  const wfStage = (raw.workflow_stage || {}) as { id?: string };
  return {
    id: String(raw.id || ''),
    name: String(raw.name || `Cột ${index + 1}`),
    color: (raw.color as string) ?? null,
    icon: (raw.icon as string) ?? null,
    order_index: Number(raw.order_index ?? index),
    bucket_slug: (raw.bucket_slug as string) ?? null,
    workflow_stage_id: (raw.workflow_stage_id as string) ?? wfStage.id ?? null,
    workshop_type_id: (raw.workshop_type_id as string) ?? null,
    is_handover_to_logistics: Boolean(raw.is_handover_to_logistics),
    counts_as_completed_revenue: Boolean(raw.counts_as_completed_revenue),
    counts_as_collected_revenue: Boolean(raw.counts_as_collected_revenue),
    count: raw.count != null ? Number(raw.count) : undefined,
    total_value: raw.total_value != null ? Number(raw.total_value) : undefined,
  };
}

const VC_STATUSES = new Set(['shipping', 'installing', 'warranty', 'completed']);

/** Chọn cột bàn giao VC theo phân loại — khớp web `resolveSxHandoverColumnId`. */
function resolveSxHandoverColumnId(
  stages: KanbanStage[],
  project: ProductionProject,
  preferredColId: string | null = null,
): string | null {
  const stageIds = new Set(stages.map((s) => String(s.id)));
  if (preferredColId && stageIds.has(String(preferredColId))) return preferredColId;
  const handoverCols = stages.filter((s) => s.is_handover_to_logistics === true);
  if (!handoverCols.length) return null;
  const wktId = project.workshop_type_id || null;
  if (wktId) {
    const typed = handoverCols.find((s) => String(s.workshop_type_id || '') === String(wktId));
    if (typed) return typed.id;
  }
  const globalHo = handoverCols.find((s) => !s.workshop_type_id);
  if (globalHo) return globalHo.id;
  return handoverCols[0].id;
}

/**
 * Resolve cột Kanban — khớp web ProductionDashboard `colIdFor` + fallback intake.
 * Không để null (card biến mất) khi đã có stages.
 */
export function resolveColumnId(
  project: ProductionProject,
  sortedStages: KanbanStage[],
): string | null {
  const intake = sortedStages.find((s) => s.bucket_slug === 'won_pending');

  if (project.status && VC_STATUSES.has(project.status)) {
    let preferred: string | null = null;
    if (
      project.sx_kanban_column_id
      && sortedStages.some((s) => String(s.id) === String(project.sx_kanban_column_id))
    ) {
      const pinned = sortedStages.find((s) => String(s.id) === String(project.sx_kanban_column_id));
      if (pinned?.is_handover_to_logistics) preferred = project.sx_kanban_column_id;
    }
    const handoverId = resolveSxHandoverColumnId(sortedStages, project, preferred);
    if (handoverId) return handoverId;
  }

  if (
    project.sx_kanban_column_id
    && sortedStages.some((s) => String(s.id) === String(project.sx_kanban_column_id))
  ) {
    return project.sx_kanban_column_id;
  }

  const cid = project.current_stage_id;
  if (cid) {
    const wfMatches = sortedStages.filter(
      (col) => col.workflow_stage_id && String(col.workflow_stage_id) === String(cid),
    );
    if (wfMatches.length === 1) return wfMatches[0].id;
    if (wfMatches.length > 1) {
      const deals = Array.isArray(project.crm_deals) ? project.crm_deals : [];
      const primaryDeal = deals.find((d) => String(d?.type || '') === 'deal') || deals[0] || null;
      const leadColId = primaryDeal?.sx_pipeline_stage_id || null;
      const ids = new Set(wfMatches.map((m) => String(m.id)));
      if (project.sx_kanban_column_id && ids.has(String(project.sx_kanban_column_id))) {
        return project.sx_kanban_column_id;
      }
      if (leadColId && ids.has(String(leadColId))) return leadColId;
      return [...wfMatches].sort((a, b) => a.order_index - b.order_index)[0]?.id || null;
    }
  }

  if (project.sx_won_deal || project.sx_intake) {
    return intake?.id || sortedStages[0]?.id || null;
  }

  // Fallback giống web: không để card mất khỏi board
  return intake?.id || sortedStages[0]?.id || null;
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

/**
 * Lấy toàn bộ dự án sản xuất (đủ trang) từ /production/projects.
 * Tối ưu cho dữ liệu lớn (vài nghìn card): tải trang 1 để biết tổng số trang,
 * rồi tải các trang còn lại SONG SONG theo từng lô (concurrency có giới hạn) thay vì
 * tuần tự — giảm độ trễ mạng từ N×round-trip xuống còn ~ceil(N/CONCURRENCY)×round-trip.
 */
const PROJECTS_PAGE_LIMIT = 200;
const PROJECTS_MAX_PAGES = 40;
const PROJECTS_FETCH_CONCURRENCY = 5;

async function fetchAllProjects(noCache = false, filters: BoardFilters = {}): Promise<ProductionProject[]> {
  const buildParams = (page: number): Record<string, unknown> => {
    const params: Record<string, unknown> = { page, limit: PROJECTS_PAGE_LIMIT };
    if (noCache) params._t = Date.now();
    if (filters.companyId) params.company_id = filters.companyId;
    if (filters.dealCompanyId) params.deal_company_id = filters.dealCompanyId;
    if (filters.workshopTypeId) params.workshop_type_id = filters.workshopTypeId;
    return params;
  };
  const getPage = async (page: number) => {
    const { data } = await api.get<{
      projects?: Array<Record<string, unknown>>;
      totalPages?: number;
    }>('/production/projects', { params: buildParams(page) });
    return {
      rows: Array.isArray(data?.projects) ? data.projects : [],
      totalPages: Number(data?.totalPages || 1),
    };
  };

  const first = await getPage(1);
  const out: ProductionProject[] = first.rows.map(mapProjectRow);
  const totalPages = Math.min(first.totalPages, PROJECTS_MAX_PAGES);
  if (totalPages <= 1 || first.rows.length < PROJECTS_PAGE_LIMIT) return out;

  const remaining: number[] = [];
  for (let p = 2; p <= totalPages; p += 1) remaining.push(p);

  for (let i = 0; i < remaining.length; i += PROJECTS_FETCH_CONCURRENCY) {
    const batch = remaining.slice(i, i + PROJECTS_FETCH_CONCURRENCY);
    const results = await Promise.all(batch.map((p) => getPage(p)));
    results.forEach((r) => {
      for (const row of r.rows) out.push(mapProjectRow(row));
    });
  }
  return out;
}

/**
 * Tải board đồng bộ với web:
 *  - Cột Kanban từ /production/pipeline-stages (lọc theo companyId + workshopTypeId)
 *  - Dự án từ /production/projects (cùng companyId + dealCompanyId + workshopTypeId)
 *  - KPI từ /production/dashboard (best-effort)
 * Resolve cột client-side (giống web) và gắn vào resolved_column_id.
 */
export async function fetchProductionBoard(noCache = false, filters: BoardFilters = {}): Promise<ProductionBoard> {
  const stageParams: Record<string, unknown> = {};
  if (noCache) stageParams._t = Date.now();
  if (filters.companyId) stageParams.company_id = filters.companyId;
  if (filters.workshopTypeId) stageParams.workshop_type_id = filters.workshopTypeId;

  const dashParams: Record<string, unknown> = {};
  if (noCache) dashParams._t = Date.now();
  if (filters.companyId) dashParams.company_id = filters.companyId;
  if (filters.dealCompanyId) dashParams.deal_company_id = filters.dealCompanyId;

  // Khớp web: luôn gửi workshop_type_id xuống /projects để BE enrich đúng cột theo phân loại.
  const projectFilters: BoardFilters = {
    companyId: filters.companyId,
    dealCompanyId: filters.dealCompanyId,
    workshopTypeId: filters.workshopTypeId,
  };

  const [stageRes, projects, kpis] = await Promise.all([
    api
      .get<Array<Record<string, unknown>>>('/production/pipeline-stages', {
        params: Object.keys(stageParams).length ? stageParams : undefined,
      })
      .then((r) => (Array.isArray(r.data) ? r.data : []))
      .catch(() => [] as Array<Record<string, unknown>>),
    fetchAllProjects(noCache, projectFilters),
    api
      .get<{ kpis?: ProductionDashboard }>('/production/dashboard', {
        params: Object.keys(dashParams).length ? dashParams : undefined,
      })
      .then((r) => r.data?.kpis ?? null)
      .catch(() => null),
  ]);

  const stages = stageRes.map((s, i) => mapStageRow(s, i)).sort((a, b) => a.order_index - b.order_index);

  const resolved = projects.map((p) => {
    const colId = resolveColumnId(p, stages);
    return {
      ...p,
      // Đồng bộ với web: sau resolve, sx_kanban_column_id = cột hiển thị (KPI + bucket dùng chung).
      sx_kanban_column_id: colId,
      resolved_column_id: colId,
    };
  });
  return { stages, projects: resolved, kpis };
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
  const { data } = await api.get<Record<string, CommentIndexEntry>>('/projects/comments/index', {
    params: { project_ids: ids.join(',') },
  });
  return data && typeof data === 'object' ? data : {};
}

export async function postProjectComment(
  projectId: string,
  content: string,
  parentId?: string | null,
): Promise<ProjectComment> {
  const payload: { content: string; parent_id?: string } = { content: content.trim() };
  if (parentId) payload.parent_id = parentId;
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

/** Xưởng thực hiện khi đã chọn công ty đặt hàng — GET /production/workshop-options */
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
};

/** Tạo đơn xưởng trực tiếp trên Kanban SX — không qua pipeline CRM. */
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
