import { api } from '../api/client';
import type { LeadMember } from './projectDetailApi';
import { invalidateWorkTasksCache } from './workTasksApi';

export type AssignModule = 'crm' | 'production' | 'logistics';
export type ModuleTab = 'all' | AssignModule;
export type AssignStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type AssignPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskSourceType = 'customer_request' | 'employee_error';

export type SharedWorkspacePerson = {
  id: string;
  full_name?: string | null;
  avatar?: string | null;
  email?: string | null;
  role?: string | null;
  drive_module?: string | null;
  company_id?: string | null;
};

export type SharedWorkspaceMember = {
  user_id: string;
  role?: string;
  company_id?: string | null;
  user?: SharedWorkspacePerson | null;
};

export type SharedWorkspaceAssignment = {
  id: string;
  title: string;
  description?: string | null;
  status: AssignStatus;
  priority?: AssignPriority | string | null;
  deadline?: string | null;
  column_id?: string | null;
  lead_id?: string | null;
  crm_task_id?: string | null;
  assignment_module?: AssignModule | string | null;
  task_source_type?: TaskSourceType | string | null;
  employee_error_module?: AssignModule | string | null;
  assignee_id?: string | null;
  assignee?: SharedWorkspacePerson | null;
  assignees?: SharedWorkspacePerson[];
  crm_task?: { id?: string; notes?: string | null } | null;
};

export type AssignmentColumn = {
  id: string;
  name: string;
  color?: string | null;
};

export type SpawnedDealItem = {
  id: string;
  code?: string | null;
  title?: string | null;
  created_at?: string | null;
  stage?: { id?: string; name?: string | null; color?: string | null } | null;
};

export type CompanyScope = {
  companyId?: string | null;
  sxCompanyId?: string | null;
  vcCompanyId?: string | null;
};

export type CreateSharedAssignmentPayload = {
  title: string;
  description?: string | null;
  priority?: AssignPriority;
  column_id?: string | null;
  deadline?: string | null;
  assignee_ids: string[];
  assignment_module: AssignModule;
  company_id?: string | null;
  task_source_type: TaskSourceType;
  employee_error_module?: AssignModule | null;
};

export type UpdateSharedAssignmentPayload = {
  title?: string;
  description?: string | null;
  priority?: AssignPriority;
  status?: AssignStatus;
  column_id?: string | null;
  deadline?: string | null;
  assignee_ids?: string[];
  assignment_module?: AssignModule;
  task_source_type?: TaskSourceType;
  employee_error_module?: AssignModule | null;
};

const LOGISTICS_ROLES = new Set([
  'logistics_admin', 'logistics', 'driver', 'installer', 'shipping',
]);
const PRODUCTION_ROLES = new Set([
  'production_admin', 'production_staff', 'production', 'crm_production_admin', 'crm_production_staff',
]);
const CRM_ROLES = new Set([
  'sales', 'sales_admin', 'customer_care', 'designer', 'manager', 'staff', 'admin',
  'accounting', 'ketoan', 'region_admin', 'crm_production_admin', 'crm_production_staff',
]);

function mapPerson(raw: unknown): SharedWorkspacePerson | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (p.id == null) return null;
  return {
    id: String(p.id),
    full_name: p.full_name != null ? String(p.full_name) : null,
    avatar: p.avatar != null ? String(p.avatar) : null,
    email: p.email != null ? String(p.email) : null,
    role: p.role != null ? String(p.role) : null,
    drive_module: p.drive_module != null ? String(p.drive_module) : null,
    company_id: p.company_id != null ? String(p.company_id) : null,
  };
}

function mapAssignment(row: Record<string, unknown>): SharedWorkspaceAssignment {
  const assigneesRaw = Array.isArray(row.assignees) ? row.assignees : [];
  const assignees = assigneesRaw.map(mapPerson).filter(Boolean) as SharedWorkspacePerson[];
  const crmTask = row.crm_task && typeof row.crm_task === 'object'
    ? row.crm_task as Record<string, unknown>
    : null;
  return {
    id: String(row.id || ''),
    title: String(row.title || 'Không tên'),
    description: row.description != null ? String(row.description) : null,
    status: (String(row.status || 'pending') as AssignStatus),
    priority: row.priority != null ? String(row.priority) : null,
    deadline: row.deadline != null ? String(row.deadline) : null,
    column_id: row.column_id != null ? String(row.column_id) : null,
    lead_id: row.lead_id != null ? String(row.lead_id) : null,
    crm_task_id: row.crm_task_id != null ? String(row.crm_task_id) : null,
    assignment_module: row.assignment_module != null ? String(row.assignment_module) : null,
    task_source_type: row.task_source_type != null ? String(row.task_source_type) : null,
    employee_error_module: row.employee_error_module != null ? String(row.employee_error_module) : null,
    assignee_id: row.assignee_id != null ? String(row.assignee_id) : null,
    assignee: mapPerson(row.assignee),
    assignees,
    crm_task: crmTask
      ? {
          id: crmTask.id != null ? String(crmTask.id) : undefined,
          notes: crmTask.notes != null ? String(crmTask.notes) : null,
        }
      : null,
  };
}

/** Giống web `memberModulesFromUser`. */
export function memberModulesFromUser(user?: SharedWorkspacePerson | LeadMember['user'] | null): AssignModule[] {
  if (!user) return ['crm'];
  const drive = String((user as SharedWorkspacePerson).drive_module || '').trim().toLowerCase();
  if (drive === 'vc' || drive === 'logistics') return ['logistics'];
  if (drive === 'sx' || drive === 'production') return ['production'];
  if (drive === 'crm') return ['crm'];

  const r = String((user as SharedWorkspacePerson).role || '').trim().toLowerCase();
  if (LOGISTICS_ROLES.has(r)) return ['logistics'];
  if (r === 'production_admin' || r === 'production_staff' || r === 'production') return ['production'];
  if (r === 'crm_production_admin' || r === 'crm_production_staff') return ['crm', 'production'];
  if (CRM_ROLES.has(r) || !r) return ['crm'];
  if (PRODUCTION_ROLES.has(r)) return ['production'];
  return ['crm'];
}

export function assignmentModuleLabel(mod?: string | null): string {
  if (mod === 'production') return 'SX';
  if (mod === 'logistics') return 'LD';
  return 'CRM';
}

export function taskSourceLabel(type?: string | null): string | null {
  if (type === 'employee_error') return 'Lỗi NV';
  if (type === 'customer_request') return 'Từ KH';
  return null;
}

export function errorModuleLabel(mod?: string | null): string | null {
  if (mod === 'production') return 'Xưởng';
  if (mod === 'logistics') return 'Lắp đặt';
  if (mod === 'crm') return 'CRM';
  return null;
}

export function statusLabel(status?: string | null): string {
  if (status === 'in_progress') return 'Đang làm';
  if (status === 'completed') return 'Xong';
  if (status === 'cancelled') return 'Hủy';
  return 'Chờ';
}

export function priorityLabel(priority?: string | null): string {
  if (priority === 'low') return 'Thấp';
  if (priority === 'high') return 'Cao';
  if (priority === 'urgent') return 'Gấp';
  return 'TB';
}

export function companyIdForAssignModule(moduleId: string, scope: CompanyScope): string | null {
  if (moduleId === 'production') return scope.sxCompanyId || scope.companyId || null;
  if (moduleId === 'logistics') return scope.vcCompanyId || scope.companyId || null;
  if (moduleId === 'crm') return scope.companyId || null;
  return scope.companyId || null;
}

function memberBelongsToCompany(member: SharedWorkspaceMember, scopeCompanyId: string | null): boolean {
  if (!scopeCompanyId) return true;
  const uidCompany = member?.user?.company_id ?? member?.company_id ?? null;
  if (!uidCompany) return true;
  return String(uidCompany) === String(scopeCompanyId);
}

function memberBelongsToModule(member: SharedWorkspaceMember, moduleId: string): boolean {
  if (!moduleId || moduleId === 'all') return true;
  return memberModulesFromUser(member?.user || null).includes(moduleId as AssignModule);
}

export function memberMatchesAssignPool(
  member: SharedWorkspaceMember,
  moduleId: string,
  companyScope: CompanyScope,
): boolean {
  if (!moduleId || moduleId === 'all') return true;
  const cid = companyIdForAssignModule(moduleId, companyScope);
  if (!memberBelongsToCompany(member, cid)) return false;
  if (memberBelongsToModule(member, moduleId)) return true;
  if ((moduleId === 'logistics' || moduleId === 'production') && cid) {
    const uidCompany = member?.user?.company_id ?? member?.company_id ?? null;
    return !!(uidCompany && String(uidCompany) === String(cid));
  }
  return false;
}

export function assignmentBelongsToModule(
  assignment: SharedWorkspaceAssignment,
  moduleId: string,
  memberByUserId: Map<string, SharedWorkspaceMember>,
): boolean {
  if (!moduleId || moduleId === 'all') return true;
  const stored = String(assignment?.assignment_module || '').toLowerCase();
  if (stored === 'crm' || stored === 'production' || stored === 'logistics') {
    return stored === moduleId;
  }
  const people = assignment?.assignees?.length
    ? assignment.assignees
    : (assignment?.assignee ? [assignment.assignee] : []);
  if (!people.length) return false;
  return people.some((u) => {
    const mem = memberByUserId.get(String(u.id));
    const src = mem?.user || mem || u;
    return memberModulesFromUser(src as SharedWorkspacePerson).includes(moduleId as AssignModule);
  });
}

export function nextAssignStatus(status?: string | null): AssignStatus {
  if (status === 'completed') return 'pending';
  if (status === 'pending') return 'in_progress';
  return 'completed';
}

export async function fetchLeadSharedAssignments(leadId: string): Promise<SharedWorkspaceAssignment[]> {
  const { data } = await api.get<{ assignments?: unknown[] }>(`/crm/leads/${leadId}/assignments`);
  const list = Array.isArray(data?.assignments) ? data.assignments : [];
  return list.map((row) => mapAssignment(row as Record<string, unknown>));
}

export async function fetchSharedWorkspaceMembers(leadId: string): Promise<SharedWorkspaceMember[]> {
  const { data } = await api.get<unknown>(`/crm/leads/${leadId}/members`);
  const list = Array.isArray(data) ? data : [];
  return list.map((row) => {
    const r = row as Record<string, unknown>;
    const user = mapPerson(r.user);
    return {
      user_id: String(r.user_id || user?.id || ''),
      role: r.role != null ? String(r.role) : undefined,
      company_id: r.company_id != null ? String(r.company_id) : (user?.company_id ?? null),
      user,
    };
  }).filter((m) => m.user_id);
}

export async function fetchAssignmentColumns(): Promise<AssignmentColumn[]> {
  const { data } = await api.get<{ columns?: unknown[] }>('/crm/assignments/columns');
  const list = Array.isArray(data?.columns) ? data.columns : [];
  return list.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id || ''),
      name: String(r.name || 'Cột'),
      color: r.color != null ? String(r.color) : null,
    };
  }).filter((c) => c.id);
}

export async function createLeadSharedAssignment(
  leadId: string,
  payload: CreateSharedAssignmentPayload,
): Promise<SharedWorkspaceAssignment> {
  const { data } = await api.post<{ assignment?: Record<string, unknown> }>(
    `/crm/leads/${leadId}/assignments`,
    payload,
  );
  const row = (data?.assignment || data || {}) as Record<string, unknown>;
  invalidateWorkTasksCache();
  return mapAssignment(row);
}

export async function updateSharedAssignment(
  assignmentId: string,
  payload: UpdateSharedAssignmentPayload,
): Promise<SharedWorkspaceAssignment> {
  const { data } = await api.put<{ assignment?: Record<string, unknown> }>(
    `/crm/assignments/${assignmentId}`,
    payload,
  );
  const row = (data?.assignment || data || {}) as Record<string, unknown>;
  invalidateWorkTasksCache();
  return mapAssignment({ ...row, id: assignmentId });
}

export async function deleteSharedAssignment(assignmentId: string): Promise<void> {
  await api.delete(`/crm/assignments/${assignmentId}`);
  invalidateWorkTasksCache();
}

export async function fetchSpawnedAdditionalDeals(parentDealId: string): Promise<SpawnedDealItem[]> {
  const { data } = await api.get<{ items?: unknown[] }>(`/crm/deals/${parentDealId}/spawned-additional`);
  const list = Array.isArray(data?.items) ? data.items : [];
  return list.map((row) => {
    const r = row as Record<string, unknown>;
    const stage = r.stage && typeof r.stage === 'object' ? r.stage as Record<string, unknown> : null;
    return {
      id: String(r.id || ''),
      code: r.code != null ? String(r.code) : null,
      title: r.title != null ? String(r.title) : null,
      created_at: r.created_at != null ? String(r.created_at) : null,
      stage: stage
        ? {
            id: stage.id != null ? String(stage.id) : undefined,
            name: stage.name != null ? String(stage.name) : null,
            color: stage.color != null ? String(stage.color) : null,
          }
        : null,
    };
  }).filter((x) => x.id);
}

export function formatAssignDeadline(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}
