import { api } from './client';

export type AssignmentStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type AssignmentPriority = 'low' | 'medium' | 'high' | 'urgent';

export type AssignmentUser = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  avatar?: string | null;
};

export type AssignmentLead = {
  id: string;
  code?: string | null;
  title?: string | null;
  type?: string | null;
};

export type CrmAssignment = {
  id: string;
  company_id?: string | null;
  title?: string | null;
  description?: string | null;
  status?: AssignmentStatus | string | null;
  priority?: AssignmentPriority | string | null;
  deadline?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
  column_id?: string | null;
  crm_task_id?: string | null;
  crm_task?: { id?: string; title?: string | null; status?: string | null } | null;
  assignment_module?: string | null;
  task_source_type?: string | null;
  employee_error_module?: string | null;
  assignee_id?: string | null;
  assignee?: AssignmentUser | null;
  assignees?: AssignmentUser[];
  created_by?: AssignmentUser | null;
  company?: { id: string; name?: string | null; short_name?: string | null } | null;
  lead?: AssignmentLead | null;
};

export type AssignmentColumn = {
  id: string;
  name?: string | null;
  order_index?: number | null;
};

export type CreateLeadAssignmentPayload = {
  title: string;
  description?: string | null;
  priority?: string;
  status?: string;
  column_id?: string | null;
  deadline?: string | null;
  assignee_ids: string[];
  assignment_module?: 'crm' | 'production' | 'logistics' | string;
  company_id?: string | null;
  task_source_type: 'customer_request' | 'employee_error' | string;
  employee_error_module?: string | null;
};

export type CreateLeadAssignmentResult = {
  assignment: CrmAssignment;
  taskId: string | null;
};

export type UpdateAssignmentPayload = Partial<{
  title: string;
  description: string | null;
  priority: string;
  status: string;
  column_id: string | null;
  deadline: string | null;
  assignee_ids: string[];
  assignment_module: string;
  task_source_type: string;
  employee_error_module: string | null;
}>;

export type AssignmentLookupUser = {
  id: string;
  full_name?: string | null;
  email?: string | null;
};

export type AssignmentLookups = {
  departments: { id: string; name?: string | null }[];
  regions: { id: string; name?: string | null }[];
  users: AssignmentLookupUser[];
};

export const STATUS_STAGE_LABEL: Record<string, string> = {
  pending: 'Chưa làm',
  in_progress: 'Đang làm',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
};

export const PRIORITY_LABEL: Record<string, string> = {
  low: 'Thấp',
  medium: 'TB',
  high: 'Cao',
  urgent: 'Gấp',
};

export type FetchAssignmentsParams = {
  company_id?: string;
  assignee_id?: string;
  priority?: string;
  /** Lọc theo status trên server (pending | in_progress | completed). */
  status?: string;
  /** Segment mobile: pending | in_progress | completed (ưu tiên hơn status đơn). */
  status_group?: 'pending' | 'in_progress' | 'completed' | string;
  q?: string;
  /** Phân trang mobile — backend chỉ cắt khi có limit (>0). */
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
};

export type CrmAssignmentStats = {
  pending: number;
  in_progress: number;
  completed: number;
  overdue: number;
  total: number;
};

/** Khớp web `computeTaskStats` (CRMAssignmentsPage). */
export function computeAssignmentStats(tasks: CrmAssignment[]): CrmAssignmentStats {
  const list = Array.isArray(tasks) ? tasks : [];
  const norm = (status: string | null | undefined) => {
    const s = String(status || 'pending').toLowerCase();
    if (s === 'completed' || s === 'done') return 'completed';
    if (s === 'in_progress' || s === 'doing') return 'in_progress';
    return 'pending'; // cancelled / todo / null → pending
  };
  const pending = list.filter((t) => {
    const s = norm(t.status);
    const raw = String(t.status || '').toLowerCase();
    return s === 'pending' || raw === 'cancelled';
  }).length;
  const in_progress = list.filter((t) => norm(t.status) === 'in_progress').length;
  const completed = list.filter((t) => norm(t.status) === 'completed').length;
  const overdue = list.filter(
    (t) => t.deadline && new Date(t.deadline).getTime() < Date.now() && norm(t.status) !== 'completed',
  ).length;
  return { total: list.length, pending, in_progress, completed, overdue };
}

export async function fetchCrmAssignments(params: FetchAssignmentsParams = {}): Promise<CrmAssignment[]> {
  const status =
    params.status
    || (params.status_group === 'in_progress' || params.status_group === 'doing'
      ? 'in_progress'
      : params.status_group === 'completed' || params.status_group === 'done'
        ? 'completed'
        : params.status_group === 'pending'
          ? 'pending'
          : undefined);
  const { data } = await api.get<{ assignments?: CrmAssignment[] }>('/crm/assignments', {
    params: {
      assignment_module: 'crm',
      company_id: params.company_id || undefined,
      assignee_id: params.assignee_id || undefined,
      priority: params.priority || undefined,
      // Chỉ gửi status enum hợp lệ — tránh status_group làm API cũ/lỗi enum.
      status: status || undefined,
      q: params.q?.trim() || undefined,
      limit: params.limit != null && params.limit > 0 ? params.limit : undefined,
      offset: params.offset != null && params.offset > 0 ? params.offset : undefined,
    },
    signal: params.signal,
  });
  return Array.isArray(data?.assignments) ? data.assignments : [];
}

/**
 * KPI đủ (không cắt theo trang list).
 * Ưu tiên GET /crm/assignments/stats; nếu lỗi (enum/deploy) → phân trang nhẹ rồi compute.
 */
export async function fetchCrmAssignmentStats(
  params: Omit<FetchAssignmentsParams, 'limit' | 'offset' | 'status' | 'status_group'> = {},
): Promise<CrmAssignmentStats> {
  const shared = {
    company_id: params.company_id || undefined,
    assignee_id: params.assignee_id || undefined,
    priority: params.priority || undefined,
    q: params.q?.trim() || undefined,
  };
  try {
    const { data } = await api.get<Partial<CrmAssignmentStats>>('/crm/assignments/stats', {
      params: {
        assignment_module: 'crm',
        ...shared,
      },
      signal: params.signal,
      headers: { 'x-no-cache': '1' },
    });
    const next = {
      pending: Number(data?.pending) || 0,
      in_progress: Number(data?.in_progress) || 0,
      completed: Number(data?.completed) || 0,
      overdue: Number(data?.overdue) || 0,
      total: Number(data?.total) || 0,
    };
    // 200 nhưng toàn 0 trong khi list có data → vẫn dùng next; fallback chỉ khi request lỗi.
    return next;
  } catch {
    // Fallback an toàn khi /stats 500 (enum done/doing trên bản backend cũ).
    const pageSize = 100;
    const maxPages = 20; // tối đa ~2000 dòng
    const rows: CrmAssignment[] = [];
    for (let page = 0; page < maxPages; page += 1) {
      const chunk = await fetchCrmAssignments({
        ...shared,
        limit: pageSize,
        offset: page * pageSize,
        signal: params.signal,
      });
      rows.push(...chunk);
      if (chunk.length < pageSize) break;
    }
    return computeAssignmentStats(rows);
  }
}

export async function fetchCrmAssignmentLookups(
  companyId?: string,
  signal?: AbortSignal,
): Promise<AssignmentLookups> {
  const { data } = await api.get<AssignmentLookups>('/crm/assignments/lookups', {
    params: companyId ? { company_id: companyId } : undefined,
    signal,
  });
  return {
    departments: Array.isArray(data?.departments) ? data.departments : [],
    regions: Array.isArray(data?.regions) ? data.regions : [],
    users: Array.isArray(data?.users) ? data.users : [],
  };
}

export async function fetchLeadAssignments(
  leadId: string,
  signal?: AbortSignal,
): Promise<CrmAssignment[]> {
  const { data } = await api.get<{ assignments?: CrmAssignment[] }>(
    `/crm/leads/${leadId}/assignments`,
    { signal },
  );
  return Array.isArray(data?.assignments) ? data.assignments : [];
}

export async function fetchAssignmentColumns(signal?: AbortSignal): Promise<AssignmentColumn[]> {
  const { data } = await api.get<{ columns?: AssignmentColumn[] }>('/crm/assignments/columns', {
    signal,
  });
  return Array.isArray(data?.columns) ? data.columns : [];
}

export async function createLeadAssignment(
  leadId: string,
  payload: CreateLeadAssignmentPayload,
): Promise<CreateLeadAssignmentResult> {
  const { data } = await api.post<{
    assignment?: CrmAssignment;
    task?: { id?: string };
  }>(`/crm/leads/${leadId}/assignments`, payload);
  const assignment = data?.assignment || (data as unknown as CrmAssignment);
  const taskId =
    data?.task?.id
    || assignment?.crm_task_id
    || assignment?.crm_task?.id
    || null;
  return {
    assignment,
    taskId: taskId ? String(taskId) : null,
  };
}

export function assignmentTaskId(a?: CrmAssignment | null): string | null {
  if (!a) return null;
  const id = a.crm_task_id || a.crm_task?.id;
  return id ? String(id) : null;
}

/**
 * Phân công gắn crm_task (module CRM) → tab Nhiệm vụ.
 * Phân công Giao việc thuần / SX-VC → tab Không gian chung.
 */
export function resolveAssignmentLeadNav(a: CrmAssignment): {
  initialTab: 'tasks' | 'shared-workspace';
  focusTaskId?: string;
  focusAssignmentId?: string;
} {
  const taskId = assignmentTaskId(a);
  const mod = String(a.assignment_module || 'crm').toLowerCase();
  if (taskId && (mod === 'crm' || mod === '')) {
    return { initialTab: 'tasks', focusTaskId: taskId };
  }
  return { initialTab: 'shared-workspace', focusAssignmentId: String(a.id) };
}

export async function updateCrmAssignment(
  assignmentId: string,
  payload: UpdateAssignmentPayload,
): Promise<CrmAssignment> {
  const { data } = await api.put<CrmAssignment>(`/crm/assignments/${assignmentId}`, payload);
  return data;
}

export async function deleteCrmAssignment(assignmentId: string): Promise<void> {
  await api.delete(`/crm/assignments/${assignmentId}`);
}
