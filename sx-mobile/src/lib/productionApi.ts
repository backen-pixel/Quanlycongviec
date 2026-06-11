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
  const deadline = (raw.deadline as string) || null;
  const status = (raw.status as string) || null;
  return {
    id: String(raw.id || ''),
    code: String(raw.code || ''),
    name: String(raw.name || raw.code || 'Dự án sản xuất'),
    customer_name: customer.full_name ?? (raw.customer_name as string) ?? null,
    customer_phone: customer.phone ?? null,
    status,
    priority: (raw.priority as string) || null,
    deadline,
    production_deadline: (raw.production_deadline as string) || null,
    estimated_value: Number(raw.estimated_value || 0),
    progress: Number(raw.progress || 0),
    task_total: Number(raw.task_total || 0),
    done_tasks: Number(raw.done_tasks || 0),
    is_overdue: raw.is_overdue != null
      ? Boolean(raw.is_overdue)
      : Boolean(deadline && status !== 'completed' && new Date(deadline) < new Date()),
    sx_intake: Boolean(raw.sx_intake),
    sx_won_deal: Boolean(raw.sx_won_deal),
    current_stage_id: (raw.current_stage_id as string) ?? stage.id ?? null,
    workshop_type_id: (raw.workshop_type_id as string) ?? workshopType.id ?? null,
    sx_kanban_column_id: (raw.sx_kanban_column_id as string) ?? null,
    stage_name: stage.name ?? null,
    stage_slug: stage.slug ?? null,
    production_person_id: productionPerson.id ?? (raw.production_person_id as string) ?? null,
    production_person_name: productionPerson.full_name ?? null,
    company_name: company.short_name || company.name || null,
    company_id: (raw.company_id as string) ?? company.id ?? null,
    workshop_type_name: workshopType.name ?? null,
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
    is_handover_to_logistics: Boolean(raw.is_handover_to_logistics),
    count: raw.count != null ? Number(raw.count) : undefined,
    total_value: raw.total_value != null ? Number(raw.total_value) : undefined,
  };
}

const VC_STATUSES = new Set(['shipping', 'installing', 'warranty']);

/**
 * Resolve cột Kanban cho 1 dự án trên pipeline hiện hành (client-side) — replicate
 * `kanbanColumnIdForProject`/`colIdFor` của web để mobile & web đồng bộ tuyệt đối.
 */
export function resolveColumnId(
  project: ProductionProject,
  sortedStages: KanbanStage[],
): string | null {
  const handover = sortedStages.find((s) => s.is_handover_to_logistics === true);
  const intake = sortedStages.find((s) => s.bucket_slug === 'won_pending');

  if (project.status && VC_STATUSES.has(project.status) && handover) return handover.id;

  if (
    project.sx_kanban_column_id &&
    sortedStages.some((s) => String(s.id) === String(project.sx_kanban_column_id))
  ) {
    return project.sx_kanban_column_id;
  }

  const cid = project.current_stage_id;
  if (cid) {
    const wfMatches = sortedStages.filter(
      (col) => col.workflow_stage_id && String(col.workflow_stage_id) === String(cid),
    );
    if (wfMatches.length === 1) return wfMatches[0].id;
  }

  if (project.sx_won_deal || project.sx_intake) {
    return intake?.id || sortedStages[0]?.id || null;
  }
  return null;
}

/** Tham số lọc board — khớp web ProductionDashboard (company + phân loại). */
export type ProductionBoardFilters = {
  companyId?: string | null;
  workshopTypeId?: string | null;
};

type BoardCacheEntry = { at: number; data: ProductionBoard };
const boardCache = new Map<string, BoardCacheEntry>();
const BOARD_CACHE_MS = 20_000;

function boardCacheKey(filters: ProductionBoardFilters): string {
  return `${filters.companyId || '_'}|${filters.workshopTypeId || '_'}`;
}

function buildBoardQueryParams(filters: ProductionBoardFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.companyId) params.company_id = String(filters.companyId);
  if (filters.workshopTypeId && filters.workshopTypeId !== 'none') {
    params.workshop_type_id = String(filters.workshopTypeId);
  } else if (filters.workshopTypeId === 'none') {
    params.workshop_type_id = 'none';
  }
  return params;
}

/** Xóa cache board (sau khi kéo thẻ / realtime). */
export function invalidateProductionBoardCache(): void {
  boardCache.clear();
}

/**
 * Tải board tối ưu — 1 request `/production/dashboard`:
 *  - Cột Kanban (pipeline) đã lọc theo công ty + phân loại
 *  - Dự án đã lọc + enrich sx_kanban_column_id trên server
 *  - KPI đồng bộ cùng phạm vi lọc
 */
export async function fetchProductionBoard(
  noCache = false,
  filters: ProductionBoardFilters = {},
): Promise<ProductionBoard> {
  const cacheKey = boardCacheKey(filters);
  if (!noCache) {
    const hit = boardCache.get(cacheKey);
    if (hit && Date.now() - hit.at < BOARD_CACHE_MS) return hit.data;
  }

  const params = buildBoardQueryParams(filters);
  if (noCache) params._t = String(Date.now());

  const { data } = await api.get<{
    kpis?: ProductionDashboard;
    pipeline?: Array<Record<string, unknown>>;
    projects?: Array<Record<string, unknown>>;
  }>('/production/dashboard', { params });

  const stages = (Array.isArray(data?.pipeline) ? data.pipeline : [])
    .map((s, i) => mapStageRow(s, i))
    .sort((a, b) => a.order_index - b.order_index);

  const projects = (Array.isArray(data?.projects) ? data.projects : []).map((raw) => {
    const p = mapProjectRow(raw);
    const colId = p.sx_kanban_column_id && stages.some((s) => String(s.id) === String(p.sx_kanban_column_id))
      ? p.sx_kanban_column_id
      : resolveColumnId(p, stages);
    return { ...p, resolved_column_id: colId };
  });

  const result: ProductionBoard = {
    stages,
    projects,
    kpis: data?.kpis ?? null,
  };

  boardCache.set(cacheKey, { at: Date.now(), data: result });
  return result;
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
  const { data } = await api.get<unknown>('/companies', { params: { for_module: 'production' } });
  const list = Array.isArray(data) ? data : [];
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

export async function fetchWorkshopTypes(companyId?: string | null): Promise<WorkshopTypeOption[]> {
  if (!companyId) return [];
  const { data } = await api.get<unknown>('/workshop/project-types', {
    params: { company_id: companyId, module: 'production' },
  });
  const list = Array.isArray(data) ? data : [];
  return list.map((t) => {
    const row = t as Record<string, unknown>;
    return { id: String(row.id || ''), name: String(row.name || row.id || '') };
  }).filter((t) => t.id);
}
