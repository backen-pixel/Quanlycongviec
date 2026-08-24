import { api } from '../api/client';
import type { LeadMember } from './projectDetailApi';
import { invalidateWorkTasksCache } from './workTasksApi';
import {
  QUERY_TTL_MEDIUM,
  QUERY_TTL_SHORT,
  cachedQuery,
  invalidateQuery,
  invalidateQueryPrefix,
} from './queryCache';

const K_LEAD_ASSIGN = 'sx:leadAssignments:';
const K_LEAD_MEMBERS = 'sx:leadMembers:';
const K_ASSIGN_COLUMNS = 'sx:assignmentColumns';

export function leadSharedAssignmentsCacheKey(leadId: string): string {
  return `${K_LEAD_ASSIGN}${leadId}`;
}

export function leadSharedMembersCacheKey(leadId: string): string {
  return `${K_LEAD_MEMBERS}${leadId}`;
}

export function invalidateLeadSharedAssignmentsCache(leadId?: string | null): void {
  if (leadId) invalidateQuery(leadSharedAssignmentsCacheKey(String(leadId)));
  else invalidateQueryPrefix(K_LEAD_ASSIGN);
}

export function invalidateLeadSharedMembersCache(leadId?: string | null): void {
  if (leadId) invalidateQuery(leadSharedMembersCacheKey(String(leadId)));
  else invalidateQueryPrefix(K_LEAD_MEMBERS);
}

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

export type PhatSinhKind = 'tempered_glass' | 'glass_unpainted' | 'glass_painted' | '';

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
  department_id?: string | null;
  phat_sinh_kind?: string | null;
  executor_company_id?: string | null;
  assignee_id?: string | null;
  assignee?: SharedWorkspacePerson | null;
  assignees?: SharedWorkspacePerson[];
  crm_task?: { id?: string; notes?: string | null } | null;
};

export type ParticipantCompany = {
  id: string;
  label?: string | null;
  name?: string | null;
  short_name?: string | null;
  roles?: string[];
};

export type DepartmentItem = {
  id: string;
  name: string;
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
  /** Xưởng nhận chọn trên form — ưu tiên khi lọc NV khối SX. */
  executorCompanyId?: string | null;
};

export type CreateSharedAssignmentPayload = {
  title: string;
  description?: string | null;
  priority?: AssignPriority;
  status?: AssignStatus;
  column_id?: string | null;
  deadline?: string | null;
  assignee_ids: string[];
  assignment_module: AssignModule;
  company_id?: string | null;
  task_source_type: TaskSourceType;
  employee_error_module?: AssignModule | null;
  phat_sinh_kind?: string | null;
  department_id?: string | null;
  executor_company_id?: string | null;
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
  phat_sinh_kind?: string | null;
  department_id?: string | null;
  executor_company_id?: string | null;
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
    department_id: row.department_id != null ? String(row.department_id) : null,
    phat_sinh_kind: row.phat_sinh_kind != null ? String(row.phat_sinh_kind) : null,
    executor_company_id: row.executor_company_id != null ? String(row.executor_company_id) : null,
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
  if (moduleId === 'production') {
    return scope.executorCompanyId || scope.sxCompanyId || scope.companyId || null;
  }
  if (moduleId === 'logistics') return scope.vcCompanyId || scope.companyId || null;
  if (moduleId === 'crm') return scope.companyId || null;
  return scope.companyId || null;
}

export function phatSinhKindLabel(kind?: string | null): string | null {
  if (kind === 'tempered_glass') return 'Kính CL';
  if (kind === 'glass_unpainted') return 'Kính không sơn';
  if (kind === 'glass_painted') return 'Kính có sơn';
  return null;
}

/** Gợi ý hạn từ SLA kính (xấp xỉ lịch làm việc — backend vẫn có thể tinh chỉnh). */
export function suggestPhatSinhDeadline(
  kind: string,
  cfg?: {
    deadline_clock?: { hour?: number; minute?: number };
    cutoff_clock?: { hour?: number; minute?: number };
    tempered_glass_days?: number;
  } | null,
): Date | null {
  if (!kind) return null;
  const dh = Number(cfg?.deadline_clock?.hour);
  const dm = Number(cfg?.deadline_clock?.minute);
  const hour = Number.isFinite(dh) ? dh : 17;
  const minute = Number.isFinite(dm) ? dm : 30;
  const ch = Number(cfg?.cutoff_clock?.hour);
  const cm = Number(cfg?.cutoff_clock?.minute);
  const cutoffH = Number.isFinite(ch) ? ch : 12;
  const cutoffM = Number.isFinite(cm) ? cm : 0;

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const addDays = (base: Date, n: number) => {
    const d = new Date(base);
    d.setDate(d.getDate() + n);
    return d;
  };
  let day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (kind === 'tempered_glass') {
    const days = Number(cfg?.tempered_glass_days) > 0 ? Number(cfg?.tempered_glass_days) : 3;
    day = addDays(day, days);
  } else if (kind === 'glass_unpainted') {
    if (nowMin >= cutoffH * 60 + cutoffM) day = addDays(day, 1);
  } else if (kind === 'glass_painted') {
    if (nowMin >= hour * 60 + minute) day = addDays(day, 1);
  } else {
    return null;
  }
  day.setHours(hour, minute, 0, 0);
  return day;
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

export async function fetchLeadSharedAssignments(
  leadId: string,
  opts?: { force?: boolean; signal?: AbortSignal },
): Promise<SharedWorkspaceAssignment[]> {
  const id = String(leadId);
  return cachedQuery<SharedWorkspaceAssignment[]>({
    key: leadSharedAssignmentsCacheKey(id),
    ttlMs: QUERY_TTL_SHORT,
    force: opts?.force,
    signal: opts?.signal,
    fetcher: async () => {
      const { data } = await api.get<{ assignments?: unknown[] }>(`/crm/leads/${id}/assignments`);
      const list = Array.isArray(data?.assignments) ? data.assignments : [];
      return list.map((row) => mapAssignment(row as Record<string, unknown>));
    },
  });
}

export async function fetchSharedWorkspaceMembers(
  leadId: string,
  opts?: { force?: boolean; signal?: AbortSignal },
): Promise<SharedWorkspaceMember[]> {
  const id = String(leadId);
  return cachedQuery<SharedWorkspaceMember[]>({
    key: leadSharedMembersCacheKey(id),
    ttlMs: QUERY_TTL_SHORT,
    force: opts?.force,
    signal: opts?.signal,
    fetcher: async () => {
      const { data } = await api.get<unknown>(`/crm/leads/${id}/members`);
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
    },
  });
}

export async function fetchAssignmentColumns(
  opts?: { force?: boolean; signal?: AbortSignal },
): Promise<AssignmentColumn[]> {
  return cachedQuery<AssignmentColumn[]>({
    key: K_ASSIGN_COLUMNS,
    ttlMs: QUERY_TTL_MEDIUM,
    force: opts?.force,
    signal: opts?.signal,
    fetcher: async () => {
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
    },
  });
}

export async function createLeadSharedAssignment(
  leadId: string,
  payload: CreateSharedAssignmentPayload,
): Promise<{ assignment: SharedWorkspaceAssignment; taskId: string | null }> {
  const { data } = await api.post<{
    assignment?: Record<string, unknown>;
    task?: { id?: string };
  }>(`/crm/leads/${leadId}/assignments`, payload);
  const row = (data?.assignment || {}) as Record<string, unknown>;
  const assignment = mapAssignment(row);
  const taskId = data?.task?.id != null
    ? String(data.task.id)
    : (assignment.crm_task_id || assignment.crm_task?.id || null);
  invalidateWorkTasksCache();
  invalidateLeadSharedAssignmentsCache(leadId);
  return { assignment, taskId };
}

export async function fetchProjectParticipantCompanies(
  projectId: string,
): Promise<ParticipantCompany[]> {
  const { data } = await api.get<{ companies?: unknown[] }>(
    `/production/projects/${projectId}/participant-companies`,
  );
  const list = Array.isArray(data?.companies) ? data.companies : [];
  return list.map((row) => {
    const r = row as Record<string, unknown>;
    const roles = Array.isArray(r.roles) ? r.roles.map(String) : [];
    return {
      id: String(r.id || ''),
      label: r.label != null ? String(r.label) : null,
      name: r.name != null ? String(r.name) : null,
      short_name: r.short_name != null ? String(r.short_name) : null,
      roles,
    };
  }).filter((c) => c.id);
}

export async function fetchDepartments(companyId: string): Promise<DepartmentItem[]> {
  const { data } = await api.get<{ departments?: unknown[] } | unknown[]>(
    '/departments',
    { params: { company_id: companyId } },
  );
  const list = Array.isArray(data)
    ? data
    : (Array.isArray((data as { departments?: unknown[] })?.departments)
      ? (data as { departments: unknown[] }).departments
      : []);
  return list.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id || ''),
      name: String(r.name || 'Bộ phận'),
    };
  }).filter((d) => d.id);
}

export async function fetchScheduleConfig(companyId: string): Promise<Record<string, unknown>> {
  const { data } = await api.get<Record<string, unknown>>(
    '/production/schedule-config',
    { params: { company_id: companyId } },
  );
  return data && typeof data === 'object' ? data : {};
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
  const mapped = mapAssignment({ ...row, id: assignmentId });
  invalidateWorkTasksCache();
  invalidateLeadSharedAssignmentsCache(mapped.lead_id || null);
  return mapped;
}

export async function deleteSharedAssignment(assignmentId: string): Promise<void> {
  await api.delete(`/crm/assignments/${assignmentId}`);
  invalidateWorkTasksCache();
  invalidateLeadSharedAssignmentsCache();
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

/* ── Giao việc board SX (tạo phân công production) ── */

export const PRIORITY_LABEL: Record<string, string> = {
  low: 'Thấp',
  medium: 'TB',
  high: 'Cao',
  urgent: 'Gấp',
};

export type DealPickerItem = {
  id: string;
  code?: string | null;
  title?: string | null;
  type?: string | null;
  project_id?: string | null;
  company_id?: string | null;
  customer?: { full_name?: string | null } | null;
  project?: { id?: string; code?: string | null; name?: string | null } | null;
};

export type AssignmentLookupUser = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  avatar?: string | null;
  role?: string | null;
};

export type CreateCrmAssignmentPayload = {
  title: string;
  description?: string | null;
  priority?: string;
  status?: string;
  deadline?: string | null;
  assignee_ids: string[];
  column_id?: string | null;
  company_id?: string | null;
  lead_id?: string | null;
  assignment_module?: AssignModule | string;
  task_source_type?: string;
  schedule_enabled?: boolean;
  scheduled_start?: string | null;
  recurrence_enabled?: boolean;
  recurrence_type?: string | null;
  recurrence_interval?: number | null;
  recurrence_end_at?: string | null;
};

export async function fetchDealPicker(opts: {
  q?: string;
  companyId?: string | null;
  assigneeId?: string | null;
  limit?: number;
  forModule?: AssignModule | string;
} = {}): Promise<DealPickerItem[]> {
  const params: Record<string, string> = {
    type: 'deal',
    for_module: String(opts.forModule || 'production'),
    limit: String(opts.limit && opts.limit > 0 ? Math.min(opts.limit, 50) : 20),
  };
  if (opts.q?.trim()) params.q = opts.q.trim();
  if (opts.companyId) params.company_id = opts.companyId;
  if (opts.assigneeId) params.assignee_id = opts.assigneeId;
  const { data } = await api.get<{ results?: DealPickerItem[]; total?: number }>('/crm/leads/picker', { params });
  return Array.isArray(data?.results) ? data.results : [];
}

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
      ? data.users
        .map((u) => ({
          id: String(u.id),
          full_name: u.full_name ?? null,
          email: u.email ?? null,
          avatar: u.avatar ?? null,
          role: u.role ?? null,
        }))
        .filter((u) => u.id)
      : [],
  };
}

/** Giao việc SX — POST /crm/assignments (module production). */
export async function createCrmAssignment(
  payload: CreateCrmAssignmentPayload,
): Promise<{ id?: string; scheduleId?: string }> {
  const { data } = await api.post<Record<string, unknown>>(
    '/crm/assignments',
    {
      assignment_module: 'production',
      task_source_type: 'customer_request',
      ...payload,
    },
  );
  invalidateWorkTasksCache();
  if (payload.lead_id) invalidateLeadSharedAssignmentsCache(String(payload.lead_id));
  const assignment = (data?.assignment && typeof data.assignment === 'object')
    ? data.assignment as { id?: string }
    : null;
  const schedule = (data?.schedule && typeof data.schedule === 'object')
    ? data.schedule as { id?: string }
    : null;
  return {
    id: assignment?.id != null
      ? String(assignment.id)
      : (data?.id != null ? String(data.id) : undefined),
    scheduleId: schedule?.id != null ? String(schedule.id) : undefined,
  };
}

/** File yêu cầu sau khi tạo assignment (hoặc schedule). */
export async function uploadAssignmentReqFiles(
  targetId: string,
  files: { uri: string; name: string; mime: string }[],
  opts?: { schedule?: boolean },
): Promise<void> {
  if (!targetId || !files.length) return;
  const { postMultipart } = await import('../api/client');
  const base = opts?.schedule
    ? `/crm/assignments/schedules/${targetId}/files`
    : `/crm/assignments/${targetId}/files`;
  for (const f of files) {
    const form = new FormData();
    form.append('file', { uri: f.uri, name: f.name, type: f.mime } as unknown as Blob);
    form.append('kind', 'req');
    await postMultipart(base, form);
  }
}
