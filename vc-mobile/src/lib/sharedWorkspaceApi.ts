import { api } from '../api/client';
import type { CrmTask, PersonRef } from '../types';
import { fetchLeadMembers as fetchLeadMembersBase, updateCrmTask } from './projectDetailApi';

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
  project_id?: string | null;
  project_code?: string | null;
  project_name?: string | null;
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
  column_id?: string | null;
  deadline?: string | null;
  assignee_ids: string[];
  assignment_module?: 'crm' | 'production' | 'logistics' | string;
  company_id?: string | null;
  task_source_type: 'customer_request' | 'employee_error' | string;
  employee_error_module?: string | null;
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

export type SharedWorkspaceMember = {
  user_id: string;
  role?: string | null;
  user?: (PersonRef & { role?: string | null; drive_module?: string | null }) | null;
};

export type SharedCrmTask = CrmTask & {
  shared_view?: string | null;
  lead_id?: string;
};

export type SharedInboxTask = {
  id: string;
  title?: string | null;
  status?: string | null;
  deadline?: string | null;
  priority?: string | null;
  lead_id?: string | null;
  kind?: string | null;
  lead?: AssignmentLead | null;
  assignee?: AssignmentUser | null;
  owner_company_name?: string | null;
  executor_company_name?: string | null;
  assignment_module?: string | null;
};

export async function fetchLeadAssignments(leadId: string): Promise<CrmAssignment[]> {
  const { data } = await api.get<{ assignments?: CrmAssignment[] }>(
    `/crm/leads/${leadId}/assignments`,
  );
  return Array.isArray(data?.assignments) ? data.assignments : [];
}

export async function fetchAssignmentColumns(): Promise<AssignmentColumn[]> {
  const { data } = await api.get<{ columns?: AssignmentColumn[] }>('/crm/assignments/columns');
  return Array.isArray(data?.columns) ? data.columns : [];
}

export async function createLeadAssignment(
  leadId: string,
  payload: CreateLeadAssignmentPayload,
): Promise<CrmAssignment> {
  const { data } = await api.post<{ assignment?: CrmAssignment } | CrmAssignment>(
    `/crm/leads/${leadId}/assignments`,
    payload,
  );
  const row = (data as { assignment?: CrmAssignment })?.assignment || (data as CrmAssignment);
  return row;
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

export async function fetchSharedWorkspaceMembers(leadId: string): Promise<SharedWorkspaceMember[]> {
  const { data } = await api.get<unknown>(`/crm/leads/${leadId}/members`);
  const list = Array.isArray(data) ? data : [];
  return list.map((row) => {
    const r = row as Record<string, unknown>;
    const userRaw = (r.user && typeof r.user === 'object')
      ? (r.user as Record<string, unknown>)
      : null;
    return {
      user_id: String(r.user_id || userRaw?.id || ''),
      role: r.role != null ? String(r.role) : null,
      user: userRaw
        ? {
            id: userRaw.id != null ? String(userRaw.id) : undefined,
            full_name: userRaw.full_name != null ? String(userRaw.full_name) : null,
            avatar: userRaw.avatar != null ? String(userRaw.avatar) : null,
            email: userRaw.email != null ? String(userRaw.email) : null,
            role: userRaw.role != null ? String(userRaw.role) : null,
            drive_module: userRaw.drive_module != null ? String(userRaw.drive_module) : null,
          }
        : null,
    };
  }).filter((m) => m.user_id);
}

/** Nhiệm vụ giao chéo công ty trên deal — task_company_scope=shared. */
export async function fetchSharedDealTasks(
  leadId: string,
  taskScope: 'logistics' | 'production' | 'crm' = 'logistics',
): Promise<SharedCrmTask[]> {
  const { data } = await api.get<unknown>(`/crm/leads/${leadId}/tasks`, {
    params: { task_scope: taskScope, task_company_scope: 'shared' },
  });
  const list = Array.isArray(data) ? data : [];
  return list.map((row) => {
    const r = row as Record<string, unknown>;
    const assignee = (r.assignee && typeof r.assignee === 'object')
      ? (r.assignee as PersonRef)
      : null;
    const assignees = Array.isArray(r.assignees)
      ? (r.assignees as PersonRef[])
      : (assignee ? [assignee] : []);
    return {
      id: String(r.id || ''),
      title: String(r.title || ''),
      status: String(r.status || 'pending'),
      deadline: r.deadline != null ? String(r.deadline) : null,
      priority: r.priority != null ? String(r.priority) : null,
      shared_view: r.shared_view != null ? String(r.shared_view) : null,
      assignee,
      assignees,
    };
  }).filter((t) => t.id);
}

export async function updateSharedDealTask(
  leadId: string,
  taskId: string,
  updates: { status?: string },
): Promise<SharedCrmTask> {
  const updated = await updateCrmTask(leadId, taskId, updates);
  return updated as SharedCrmTask;
}

/** Inbox tab Công việc → Không gian chung (việc deal giao cho tôi). */
export async function fetchPrivateDealInboxTasks(
  assignmentModule: 'logistics' | 'production' | 'crm' = 'logistics',
): Promise<SharedInboxTask[]> {
  const { data } = await api.get<{ tasks?: SharedInboxTask[] }>(
    '/crm/assignments/private-deal-tasks',
    { params: { assignment_module: assignmentModule } },
  );
  return Array.isArray(data?.tasks) ? data.tasks : [];
}

export type AssignmentLookupUser = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  avatar?: string | null;
  role?: string | null;
};

export async function fetchAssignmentLookups(companyId?: string | null): Promise<{
  users: AssignmentLookupUser[];
}> {
  const params: Record<string, string> = {};
  if (companyId) params.company_id = companyId;
  const { data } = await api.get<{ users?: AssignmentLookupUser[] }>('/crm/assignments/lookups', {
    params,
  });
  return {
    users: Array.isArray(data?.users)
      ? data.users.map((u) => ({
          id: String(u.id),
          full_name: u.full_name ?? null,
          email: u.email ?? null,
          avatar: u.avatar ?? null,
          role: u.role ?? null,
        })).filter((u) => u.id)
      : [],
  };
}

export type CreateCrmAssignmentPayload = {
  title: string;
  description?: string | null;
  priority?: string;
  deadline?: string | null;
  assignee_ids: string[];
  column_id?: string | null;
  company_id?: string | null;
  lead_id?: string | null;
  assignment_module?: 'crm' | 'production' | 'logistics' | string;
  task_source_type?: string;
};

/** Giao việc board VC — POST /crm/assignments (không bắt buộc gắn deal). */
export async function createCrmAssignment(payload: CreateCrmAssignmentPayload): Promise<CrmAssignment> {
  const { data } = await api.post<{ assignment?: CrmAssignment } | CrmAssignment>(
    '/crm/assignments',
    {
      assignment_module: 'logistics',
      task_source_type: 'customer_request',
      ...payload,
    },
  );
  const row = (data as { assignment?: CrmAssignment })?.assignment || (data as CrmAssignment);
  return row;
}

export async function fetchLogisticsAssignments(opts: {
  companyId?: string | null;
  assigneeId?: string | null;
  limit?: number;
  offset?: number;
} = {}): Promise<CrmAssignment[]> {
  const params: Record<string, string> = { assignment_module: 'logistics' };
  if (opts.companyId) params.company_id = opts.companyId;
  if (opts.assigneeId) params.assignee_id = opts.assigneeId;
  if (opts.limit) params.limit = String(opts.limit);
  if (opts.offset) params.offset = String(opts.offset);
  const { data } = await api.get<{ assignments?: CrmAssignment[] }>('/crm/assignments', { params });
  return Array.isArray(data?.assignments) ? data.assignments : [];
}

export { fetchLeadMembersBase };
