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
  q?: string;
  signal?: AbortSignal;
};

export async function fetchCrmAssignments(params: FetchAssignmentsParams = {}): Promise<CrmAssignment[]> {
  const { data } = await api.get<{ assignments?: CrmAssignment[] }>('/crm/assignments', {
    params: {
      assignment_module: 'crm',
      company_id: params.company_id || undefined,
      assignee_id: params.assignee_id || undefined,
      priority: params.priority || undefined,
      q: params.q?.trim() || undefined,
    },
    signal: params.signal,
  });
  return Array.isArray(data?.assignments) ? data.assignments : [];
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
