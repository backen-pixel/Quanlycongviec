import { api } from '../api/client';
import type {
  KanbanStage,
  PersonalPlanner,
  ProductionBoard,
  ProductionDashboard,
  ProductionProject,
} from '../types';

const LOGISTICS_STAGE_SLUGS = new Set(['delivery', 'installation', 'customer-care']);
const LOGISTICS_STATUSES = new Set(['shipping', 'installing', 'warranty', 'completed']);
const INTAKE_BUCKET = 'delivery_pending';

export function mapProjectRow(raw: Record<string, unknown>): ProductionProject {
  const customer = (raw.customer || {}) as { full_name?: string; phone?: string };
  const stage = (raw.current_stage || {}) as { id?: string; name?: string; slug?: string };
  const logisticsPerson = (raw.logistics_person || {}) as { id?: string; full_name?: string };
  const installerPerson = (raw.installer_person || {}) as { id?: string; full_name?: string };
  const productionPerson = (raw.production_person || {}) as { id?: string; full_name?: string };
  const company = (raw.company || raw.logistics_company || {}) as { id?: string; short_name?: string; name?: string };
  const workshopType = (raw.workshop_type || {}) as { id?: string; name?: string };
  const crmDeals = Array.isArray(raw.crm_deals) ? (raw.crm_deals as Array<Record<string, unknown>>) : [];
  const dealWithRegion = crmDeals.find((d) => d && (d.region_id || d.crm_region));
  const crmRegion = (dealWithRegion?.crm_region || {}) as { id?: string; name?: string };
  return {
    id: String(raw.id || ''),
    code: String(raw.code || ''),
    name: String(raw.name || raw.code || 'Dự án VC'),
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
    vc_intake: Boolean(raw.vc_intake),
    vc_kanban_column_id: (raw.vc_kanban_column_id as string) ?? null,
    current_stage_id: (raw.current_stage_id as string) ?? stage.id ?? null,
    workshop_type_id: (raw.workshop_type_id as string) ?? workshopType.id ?? null,
    stage_name: stage.name ?? null,
    stage_slug: stage.slug ?? null,
    logistics_person_id: logisticsPerson.id ?? (raw.logistics_person_id as string) ?? null,
    logistics_person_name: logisticsPerson.full_name ?? null,
    installer_person_id: installerPerson.id ?? (raw.installer_person_id as string) ?? null,
    installer_person_name: installerPerson.full_name ?? null,
    production_person_id: productionPerson.id ?? null,
    production_person_name: productionPerson.full_name ?? null,
    company_name: company.short_name || company.name || null,
    company_id: (raw.logistics_company_id as string) ?? (raw.company_id as string) ?? company.id ?? null,
    workshop_type_name: workshopType.name ?? null,
    region_id: (dealWithRegion?.region_id as string) ?? crmRegion.id ?? null,
    region_name: crmRegion.name ?? null,
    crm_deals: crmDeals.map((d) => ({
      id: d.id != null ? String(d.id) : undefined,
      type: d.type != null ? String(d.type) : undefined,
      external_company_name: d.external_company_name != null ? String(d.external_company_name) : null,
      external_catalog_id: d.external_catalog_id != null ? String(d.external_catalog_id) : null,
    })),
  };
}

function mapStageRow(raw: Record<string, unknown>, index: number): KanbanStage {
  const wfStage = (raw.workflow_stage || {}) as { id?: string; slug?: string };
  return {
    id: String(raw.id || ''),
    name: String(raw.name || `Cột ${index + 1}`),
    color: (raw.color as string) ?? null,
    icon: (raw.icon as string) ?? null,
    order_index: Number(raw.order_index ?? index),
    bucket_slug: (raw.bucket_slug as string) ?? null,
    workflow_stage_id: (raw.workflow_stage_id as string) ?? wfStage.id ?? null,
    count: raw.count != null ? Number(raw.count) : undefined,
    total_value: raw.total_value != null ? Number(raw.total_value) : undefined,
  };
}

/** Resolve cột Kanban VC — replicate enrichOneLogisticsProject (backend). */
export function resolveColumnId(
  project: ProductionProject,
  sortedStages: KanbanStage[],
): string | null {
  const intakeCol = sortedStages.find((c) => c.bucket_slug === INTAKE_BUCKET);
  const firstCol = sortedStages[0] || null;
  const colIdSet = new Set(sortedStages.map((c) => String(c.id)));
  const stageSlug = project.stage_slug || null;
  const status = project.status;
  let matchedCol: KanbanStage | null = null;

  if (project.vc_kanban_column_id && colIdSet.has(String(project.vc_kanban_column_id))) {
    matchedCol = sortedStages.find((c) => String(c.id) === String(project.vc_kanban_column_id)) || null;
  }

  if (!matchedCol) {
    for (const col of sortedStages) {
      if (col.bucket_slug === INTAKE_BUCKET) continue;
      const wsSlug = col.workflow_stage_id
        ? sortedStages.find((s) => s.workflow_stage_id === col.workflow_stage_id)?.bucket_slug
        : null;
      if (stageSlug && (col.bucket_slug === stageSlug || wsSlug === stageSlug)) {
        matchedCol = col;
        break;
      }
      if (status && col.bucket_slug === status) {
        matchedCol = col;
        break;
      }
    }
  }

  const inScope = (status && LOGISTICS_STATUSES.has(status))
    || (stageSlug && LOGISTICS_STAGE_SLUGS.has(stageSlug));
  if (!matchedCol && inScope) {
    matchedCol = intakeCol || firstCol;
  }

  return matchedCol?.id || project.vc_kanban_column_id || null;
}

export type BoardFilters = {
  companyId?: string;
  dealCompanyId?: string;
  workshopTypeId?: string;
};

const PROJECTS_PAGE_LIMIT = 200;
const PROJECTS_MAX_PAGES = 40;
const PROJECTS_FETCH_CONCURRENCY = 5;

async function fetchAllProjects(noCache = false, filters: BoardFilters = {}): Promise<ProductionProject[]> {
  const buildParams = (page: number): Record<string, unknown> => {
    const params: Record<string, unknown> = { page, limit: PROJECTS_PAGE_LIMIT };
    if (noCache) params._t = Date.now();
    if (filters.companyId) params.company_id = filters.companyId;
    if (filters.workshopTypeId) params.workshop_type_id = filters.workshopTypeId;
    return params;
  };
  const getPage = async (page: number) => {
    const { data } = await api.get<{
      projects?: Array<Record<string, unknown>>;
      totalPages?: number;
      total?: number;
    }>('/logistics/projects', { params: buildParams(page) });
    const rows = Array.isArray(data?.projects) ? data.projects : [];
    const total = Number(data?.total || rows.length);
    const totalPages = Math.max(1, Math.ceil(total / PROJECTS_PAGE_LIMIT));
    return { rows, totalPages };
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

export async function fetchLogisticsBoard(noCache = false, filters: BoardFilters = {}): Promise<ProductionBoard> {
  const stageParams: Record<string, unknown> = {};
  if (noCache) stageParams._t = Date.now();
  if (filters.companyId) stageParams.company_id = filters.companyId;
  if (filters.workshopTypeId) stageParams.workshop_type_id = filters.workshopTypeId;

  const dashParams: Record<string, unknown> = {};
  if (noCache) dashParams._t = Date.now();
  if (filters.companyId) dashParams.company_id = filters.companyId;
  if (filters.workshopTypeId) dashParams.workshop_type_id = filters.workshopTypeId;

  const [stageRes, projects, dashRes] = await Promise.all([
    api
      .get<Array<Record<string, unknown>>>('/logistics/pipeline-stages', {
        params: Object.keys(stageParams).length ? stageParams : undefined,
      })
      .then((r) => (Array.isArray(r.data) ? r.data : []))
      .catch(() => [] as Array<Record<string, unknown>>),
    fetchAllProjects(noCache, filters),
    api
      .get<{ kpis?: ProductionDashboard; pipeline?: unknown[] }>('/logistics/dashboard', {
        params: Object.keys(dashParams).length ? dashParams : undefined,
      })
      .catch(() => ({ data: { kpis: null } })),
  ]);

  const stages = stageRes.map((s, i) => mapStageRow(s, i)).sort((a, b) => a.order_index - b.order_index);
  const kpis = dashRes.data?.kpis ?? null;

  const resolved = projects.map((p) => ({
    ...p,
    resolved_column_id: p.vc_kanban_column_id && stages.some((s) => String(s.id) === String(p.vc_kanban_column_id))
      ? p.vc_kanban_column_id
      : resolveColumnId(p, stages),
  }));
  return { stages, projects: resolved, kpis };
}

/** Alias tương thích màn hình copy từ vc-mobile. */
export const fetchProductionBoard = fetchLogisticsBoard;

export async function fetchProductionProject(projectId: string): Promise<ProductionProject> {
  const { data } = await api.get<{ project?: Record<string, unknown> }>(
    `/logistics/projects/${projectId}`,
  );
  const raw = (data?.project ?? data) as Record<string, unknown>;
  return mapProjectRow(raw);
}

export async function moveProjectToStage(
  projectId: string,
  targetStageId: string,
  options: { currentStageId?: string | null; isIntake?: boolean; companyId?: string | null } = {},
): Promise<{ vc_kanban_column_id?: string; current_stage_id?: string | null }> {
  if (options.isIntake) {
    const { data } = await api.patch(`/logistics/projects/${projectId}/stage`, { move_to_intake: true });
    return {
      vc_kanban_column_id: data?.project?.vc_kanban_column_id ?? targetStageId,
      current_stage_id: data?.project?.current_stage_id ?? null,
    };
  }
  const { data } = await api.patch(`/logistics/projects/${projectId}/stage`, {
    vc_stage_id: targetStageId,
  });
  return {
    vc_kanban_column_id: data?.project?.vc_kanban_column_id ?? targetStageId,
    current_stage_id: data?.project?.current_stage_id ?? null,
  };
}

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

/** Planner VC — dùng board làm nguồn (backend chưa có /logistics/planner/me). */
export async function fetchPersonalPlanner(): Promise<PersonalPlanner> {
  return { columns: [], items: [] };
}

export type CompanyOption = { id: string; name: string };

export async function fetchCompanies(): Promise<CompanyOption[]> {
  const { data } = await api.get<{ companies?: unknown[] } | unknown[]>(
    '/companies',
    { params: { for_module: 'logistics' } },
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

export type CommentAttachment = {
  url: string;
  name: string;
  mime?: string;
  size?: number;
};

export type ProjectComment = {
  id: string;
  project_id?: string;
  lead_id?: string;
  user_id: string;
  parent_id?: string | null;
  content: string;
  created_at: string;
  updated_at?: string | null;
  attachments?: CommentAttachment[];
  user?: ProjectCommentUser;
  reactions?: {
    summary: { emoji: string; count: number }[];
    mine: string | null;
  };
};

export function isCommentImageAttachment(att: CommentAttachment): boolean {
  const mime = String(att.mime || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp|bmp|heic|heif|avif|svg)$/i.test(att.name || att.url || '');
}

function mapCommentAttachment(raw: unknown): CommentAttachment | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const url = String(a.url || a.file_url || '').trim();
  if (!url) return null;
  return {
    url,
    name: String(a.name || a.file_name || 'file').trim() || 'file',
    mime: String(a.type || a.mime_type || '').trim() || undefined,
    size: Number.isFinite(Number(a.size ?? a.file_size)) ? Number(a.size ?? a.file_size) : undefined,
  };
}

function mapCommentAttachments(raw: unknown): CommentAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(mapCommentAttachment).filter(Boolean) as CommentAttachment[];
}

/** Deal CRM gắn dự án — bình luận dùng crm_lead_comments (đồng bộ tab deal). */
export function resolveProjectDealId(project?: {
  crm_deals?: Array<{ id?: string; type?: string } | null> | null;
  crm_lead_id?: string | null;
} | null): string | null {
  if (!project) return null;
  if (project.crm_lead_id) return String(project.crm_lead_id);
  const deals = Array.isArray(project.crm_deals) ? project.crm_deals : [];
  const deal = deals.find((d) => String(d?.type || '') === 'deal') || deals[0];
  return deal?.id ? String(deal.id) : null;
}

export function partitionProjectsByCommentSource(projects: ProductionProject[] = []) {
  const projectOnlyIds: string[] = [];
  const leadIds: string[] = [];
  const leadIdToProjectId: Record<string, string> = {};
  for (const p of projects || []) {
    const pid = p?.id ? String(p.id) : '';
    if (!pid) continue;
    const leadId = resolveProjectDealId(p);
    if (leadId) {
      leadIds.push(leadId);
      leadIdToProjectId[leadId] = pid;
    } else {
      projectOnlyIds.push(pid);
    }
  }
  return {
    projectOnlyIds: [...new Set(projectOnlyIds)],
    leadIds: [...new Set(leadIds)],
    leadIdToProjectId,
  };
}

function mapCommentRow(raw: Record<string, unknown>): ProjectComment {
  const user = (raw.user || {}) as Record<string, unknown>;
  const reactions = (raw.reactions || { summary: [], mine: null }) as ProjectComment['reactions'];
  return {
    id: String(raw.id || ''),
    project_id: raw.project_id != null ? String(raw.project_id) : undefined,
    lead_id: raw.lead_id != null ? String(raw.lead_id) : undefined,
    user_id: String(raw.user_id || ''),
    parent_id: raw.parent_id != null && raw.parent_id !== '' ? String(raw.parent_id) : null,
    content: String(raw.content || raw.body || ''),
    created_at: String(raw.created_at || ''),
    updated_at: raw.updated_at != null ? String(raw.updated_at) : null,
    attachments: mapCommentAttachments(raw.attachments),
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

/** Bình luận deal CRM — cùng nguồn với tab Bình luận trên LeadDetail. */
export async function fetchDealComments(dealId: string): Promise<ProjectComment[]> {
  const { data } = await api.get<unknown>(`/crm/leads/${dealId}/comments`);
  const list = Array.isArray(data) ? data : [];
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

export async function fetchDealCommentIndex(
  leadIds: string[],
): Promise<Record<string, CommentIndexEntry>> {
  const ids = [...new Set(leadIds.map(String).filter(Boolean))];
  if (!ids.length) return {};
  const { data } = await api.get<Record<string, CommentIndexEntry>>('/crm/lead-comments/index', {
    params: { lead_ids: ids.join(',') },
  });
  return data && typeof data === 'object' ? data : {};
}

/** Badge bình luận Kanban: có deal → crm_lead_comments; không deal → project_comments. */
export async function fetchCommentsIndexForProjects(
  projects: ProductionProject[],
): Promise<Record<string, CommentIndexEntry>> {
  const { projectOnlyIds, leadIds, leadIdToProjectId } = partitionProjectsByCommentSource(projects);
  const merged: Record<string, CommentIndexEntry> = {};

  if (projectOnlyIds.length) {
    Object.assign(merged, await fetchProjectCommentIndex(projectOnlyIds).catch(() => ({})));
  }
  if (leadIds.length) {
    const leadIndex = (await fetchDealCommentIndex(leadIds).catch(() => ({}))) as Record<string, CommentIndexEntry>;
    for (const leadId of leadIds) {
      const meta = leadIndex[leadId] || leadIndex[String(leadId)];
      const pid = leadIdToProjectId[leadId];
      if (pid && meta) merged[pid] = meta;
    }
  }
  return merged;
}

export async function postProjectComment(
  projectId: string,
  content: string,
  parentId?: string | null,
  attachments?: CommentAttachment[],
): Promise<ProjectComment> {
  const payload: {
    content: string;
    parent_id?: string;
    attachments?: { file_url: string; file_name: string; mime_type?: string; file_size?: number }[];
  } = { content: content.trim() };
  if (parentId) payload.parent_id = parentId;
  if (attachments?.length) {
    payload.attachments = attachments.map((a) => ({
      file_url: a.url,
      file_name: a.name,
      mime_type: a.mime,
      file_size: a.size,
    }));
  }
  const { data } = await api.post<{ comment?: unknown } & Record<string, unknown>>(
    `/projects/${projectId}/comments`,
    payload,
  );
  const row = (data?.comment ?? data) as Record<string, unknown>;
  return mapCommentRow(row);
}

export async function postDealComment(
  dealId: string,
  content: string,
  parentId?: string | null,
  attachments?: CommentAttachment[],
): Promise<ProjectComment> {
  const payload: {
    body: string;
    parent_id?: number | string;
    attachments?: { url: string; name: string; type?: string; size?: number }[];
  } = { body: content.trim() };
  if (parentId) {
    const n = Number(parentId);
    payload.parent_id = Number.isFinite(n) && n > 0 ? n : parentId;
  }
  if (attachments?.length) {
    payload.attachments = attachments.map((a) => ({
      url: a.url,
      name: a.name,
      type: a.mime,
      size: a.size,
    }));
  }
  const { data } = await api.post<Record<string, unknown>>(`/crm/leads/${dealId}/comments`, payload);
  return mapCommentRow((data || {}) as Record<string, unknown>);
}

export async function uploadCommentFiles(
  files: { uri: string; name: string; mime: string }[],
): Promise<CommentAttachment[]> {
  if (!files.length) return [];
  const { postMultipart } = await import('../api/client');
  const form = new FormData();
  for (const f of files) {
    form.append('files', { uri: f.uri, name: f.name, type: f.mime } as unknown as Blob);
  }
  const { data: up } = await postMultipart<{
    files: { file_url?: string; file_name?: string; file_size?: number; mime_type?: string }[];
  }>('/upload', form);
  return (up?.files || [])
    .filter((u) => u.file_url)
    .map((u) => ({
      url: String(u.file_url),
      name: String(u.file_name || 'file'),
      mime: u.mime_type || undefined,
      size: u.file_size != null ? Number(u.file_size) : undefined,
    }));
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

export async function toggleDealCommentReaction(
  commentId: string,
  emoji: string,
): Promise<ProjectComment['reactions']> {
  const { data } = await api.put<ProjectComment['reactions']>(
    `/crm/lead-comments/${commentId}/reaction`,
    { emoji },
  );
  return data || { summary: [], mine: null };
}

export async function fetchWorkshopTypes(
  companyId?: string | null,
  _clientCompanyId?: string | null,
): Promise<WorkshopTypeOption[]> {
  if (!companyId) return [];
  const params: Record<string, string> = { company_id: companyId, module: 'logistics' };
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

export async function fetchClientCompanies(_workshopCompanyId: string): Promise<ClientCompanyOption[]> {
  return [];
}

export async function fetchWorkshopOptionsForDeal(_dealCompanyId: string): Promise<CompanyOption[]> {
  return [];
}

export type ExternalCompanyOption = { id: string; name: string };

export async function fetchExternalCompanies(_companyId: string): Promise<ExternalCompanyOption[]> {
  return [];
}

export type RegionOption = { id: string; name: string; divisionName?: string | null };

export async function fetchCompanyRegions(
  companyId: string,
  opts?: { forModule?: 'production' | 'crm' | 'logistics' | null },
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

export async function createWorkshopIntake(_input: WorkshopIntakeInput): Promise<WorkshopIntakeResult> {
  return {};
}
