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
  assignee?: AssignmentUser | null;
  assignees?: AssignmentUser[];
  created_by?: AssignmentUser | null;
  company?: { id: string; name?: string | null; short_name?: string | null } | null;
  lead?: AssignmentLead | null;
};

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
