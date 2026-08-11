import { api } from '../api/client';
import { isCrmProductionTaskDone } from './projectDetailApi';
import type { AuthUserLite } from './productionFilters';
import type { CrmTask, PersonRef } from '../types';

/** Section key cho Giao việc không gắn deal. */
export const ASSIGNMENT_SECTION_ID = '__giao_viec__';

export type WorkLeadRef = {
  id: string;
  title?: string | null;
  code?: string | null;
  project_id?: string | null;
  type?: string | null;
  customer?: { id?: string; full_name?: string | null } | null;
};

export type WorkTask = CrmTask & {
  lead_id: string;
  lead?: WorkLeadRef | null;
  /** Luôn từ Giao việc Sản xuất (crm_assignments). */
  source?: 'crm_task' | 'assignment';
  crm_task_id?: string | null;
  assignment_module?: string | null;
  assignee_id?: string | null;
  description?: string | null;
  column_id?: string | null;
  company_id?: string | null;
};

export type WorkTasksQuery = {
  /** null/undefined = không lọc người (team). Có id = chỉ việc của người đó. */
  assigneeId?: string | null;
  companyId?: string | null;
  /** pending | in_progress | completed — lọc phía server. */
  status?: string | null;
  /** Quá hạn: chưa xong + deadline < đầu ngày hôm nay. */
  overdue?: boolean;
  /** Phân trang — mặc định mobile dùng 200. */
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
};

export type WorkTasksPage = {
  tasks: WorkTask[];
  hasMore: boolean;
  offset: number;
  limit: number;
};

/** Giới hạn mặc định mỗi lần tải — tránh 1 GET hàng nghìn dòng. */
export const WORK_TASKS_PAGE_SIZE = 200;

function mapPerson(raw: unknown): PersonRef | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = r.id != null ? String(r.id) : '';
  if (!id) return null;
  return {
    id,
    full_name: r.full_name != null ? String(r.full_name) : r.fullName != null ? String(r.fullName) : null,
    avatar: r.avatar != null ? String(r.avatar) : null,
  };
}

/** Nhãn deal/lead giống web Giao việc SX. */
export function assignmentDealCardLabel(lead?: WorkLeadRef | null): string {
  if (!lead) return '';
  const code = String(lead.code || '').trim();
  const title = String(lead.title || '').trim();
  const isDeal = String(lead.type || '').toLowerCase() === 'deal';
  if (isDeal) {
    if (code && title) return `${code} — ${title}`;
    return title || code || 'Deal';
  }
  if (code && title) return `${code} · ${title}`;
  return title || code || '';
}

function mapAssignmentToWorkTask(raw: Record<string, unknown>): WorkTask {
  const leadRaw = raw.lead && typeof raw.lead === 'object' ? (raw.lead as Record<string, unknown>) : null;
  const crmTask =
    raw.crm_task && typeof raw.crm_task === 'object' ? (raw.crm_task as Record<string, unknown>) : null;
  const leadId = String(raw.lead_id || leadRaw?.id || ASSIGNMENT_SECTION_ID);
  const module = raw.assignment_module != null ? String(raw.assignment_module) : 'production';
  const assigneesRaw = Array.isArray(raw.assignees) ? raw.assignees : [];
  const assignees = assigneesRaw.map(mapPerson).filter(Boolean) as PersonRef[];
  const assignee = mapPerson(raw.assignee) || assignees[0] || null;
  const stageSlug =
    (crmTask?.stage_slug != null ? String(crmTask.stage_slug) : null)
    || (raw.stage_slug != null ? String(raw.stage_slug) : null);

  return {
    id: String(raw.id || ''),
    lead_id: leadId,
    title: String(raw.title || crmTask?.title || 'Nhiệm vụ được giao'),
    status: String(raw.status || 'pending'),
    stage_slug: stageSlug,
    deadline: raw.deadline != null ? String(raw.deadline) : null,
    due_date: raw.deadline != null ? String(raw.deadline) : null,
    description: raw.description != null ? String(raw.description) : null,
    priority: raw.priority != null ? String(raw.priority) : null,
    source: 'assignment',
    crm_task_id: raw.crm_task_id != null ? String(raw.crm_task_id) : null,
    assignment_module: module,
    column_id: raw.column_id != null ? String(raw.column_id) : null,
    company_id: raw.company_id != null ? String(raw.company_id) : null,
    // Lấy max giữa CRM task và assignment — tránh 0 từ một phía che mất file thật.
    file_count: Math.max(
      Number(crmTask?.file_count ?? 0),
      Number(raw.file_count ?? 0),
    ),
    attachment_count: Math.max(
      Number(crmTask?.attachment_count ?? crmTask?.file_count ?? 0),
      Number(raw.attachment_count ?? raw.file_count ?? 0),
    ),
    assignee_id: raw.assignee_id != null ? String(raw.assignee_id) : assignee?.id || null,
    assignee,
    assignees,
    lead: leadRaw
      ? {
          id: String(leadRaw.id || ''),
          title: leadRaw.title != null ? String(leadRaw.title) : null,
          code: leadRaw.code != null ? String(leadRaw.code) : null,
          project_id: leadRaw.project_id != null ? String(leadRaw.project_id) : null,
          type: leadRaw.type != null ? String(leadRaw.type) : null,
          customer: null,
        }
      : leadId === ASSIGNMENT_SECTION_ID
        ? {
            id: ASSIGNMENT_SECTION_ID,
            title: 'Giao việc sản xuất',
            code: 'GIAO VIỆC',
            project_id: null,
            type: null,
            customer: null,
          }
        : null,
  };
}

/** Khớp role admin trang Giao việc SX trên web. */
export function canViewTeamWork(user?: AuthUserLite | null): boolean {
  const role = String(user?.role || '').trim().toLowerCase();
  return role === 'admin'
    || role === 'manager'
    || role === 'sales_admin'
    || role === 'crm_production_admin'
    || role === 'production_admin';
}

export function isTaskPending(status: string): boolean {
  const s = String(status || 'pending');
  return s === 'pending' || s === 'todo';
}

export function isTaskInProgress(status: string): boolean {
  return String(status || '') === 'in_progress';
}

export function isTaskDone(status: string): boolean {
  return isCrmProductionTaskDone(status);
}

export function statusPillLabel(status: string): string {
  if (isTaskDone(status)) return 'Hoàn thành';
  if (isTaskInProgress(status)) return 'Đang làm';
  return 'Chưa làm';
}

export function nextTaskStatus(status: string): string {
  const cur = String(status || 'pending');
  if (isTaskDone(cur)) return 'in_progress';
  if (isTaskPending(cur)) return 'in_progress';
  return 'completed';
}

export function priorityLabel(priority?: string | null): string | null {
  const p = String(priority || '').toLowerCase();
  if (p === 'high' || p === 'urgent') return 'Cao';
  if (p === 'medium' || p === 'normal') return 'TB';
  if (p === 'low') return 'Thấp';
  return priority ? String(priority) : null;
}

export function stageSlugLabel(slug?: string | null): string | null {
  if (!slug) return null;
  const s = String(slug).trim();
  if (!s) return null;

  // Slug tổng hợp từ id cột (pl_*_<uuid8> / sx_pl_…) — không phải tên hiển thị.
  if (/^(sx_)?pl_([a-z0-9_]+_)?[a-f0-9]{8}$/i.test(s)) return null;

  if (s.startsWith('sx_')) {
    const label = s
      .slice(3)
      .split('_')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    // VD: «Pl 5ae60298» / «Pi abcdef12» — mã rút gọn, không dùng làm nhãn.
    if (/^[A-Za-z]{1,4}\s+[a-f0-9]{6,}$/i.test(label)) return null;
    return label || null;
  }

  if (/^[A-Za-z]{1,4}\s+[a-f0-9]{6,}$/i.test(s)) return null;
  return s;
}

export function taskDueIso(task: WorkTask): string | null {
  return task.deadline || task.due_date || null;
}

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function isTaskOverdue(task: WorkTask): boolean {
  if (isTaskDone(task.status)) return false;
  const raw = taskDueIso(task);
  if (!raw) return false;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return false;
  const start = startOfLocalDay(new Date());
  const due = startOfLocalDay(d);
  return due.getTime() < start.getTime();
}

/** Hạn (deadline/due_date) trùng ngày local với `day`. */
export function isTaskDueOnDay(task: WorkTask, day: Date = new Date()): boolean {
  const raw = taskDueIso(task);
  if (!raw) return false;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return false;
  return startOfLocalDay(d).getTime() === startOfLocalDay(day).getTime();
}

/**
 * Overview «Công việc của tôi hôm nay»:
 * - Việc mở: quá hạn, đến hạn hôm nay, hoặc chưa có hạn (vẫn trên bàn hôm nay).
 * - Việc xong: chỉ khi hạn là hôm nay (proxy khi thiếu completed_at).
 */
export function isTaskForOverviewToday(task: WorkTask, day: Date = new Date()): boolean {
  if (isTaskDone(task.status)) return isTaskDueOnDay(task, day);
  if (isTaskOverdue(task) || isTaskDueOnDay(task, day)) return true;
  return !taskDueIso(task);
}

export function formatTaskDeadline(iso?: string | null): string {
  if (!iso) return 'Chưa có hạn';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Chưa có hạn';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/**
 * Công việc SX = đúng nguồn Giao việc Sản xuất trên web (`/sx/assignments`).
 * GET /crm/assignments?assignment_module=production&limit=&offset=
 */
export async function fetchProductionWorkTasksPage(
  query: WorkTasksQuery = {},
): Promise<WorkTasksPage> {
  const limit = Math.min(Math.max(Number(query.limit) || WORK_TASKS_PAGE_SIZE, 1), 500);
  const offset = Math.max(Number(query.offset) || 0, 0);
  const params: Record<string, string | number> = {
    assignment_module: 'production',
    limit,
    offset,
  };
  if (query.assigneeId) params.assignee_id = query.assigneeId;
  if (query.companyId) params.company_id = query.companyId;
  if (query.status) params.status = String(query.status);
  if (query.overdue) params.overdue = 1;

  const { data } = await api.get<{
    assignments?: unknown[];
    has_more?: boolean;
  }>('/crm/assignments', { params, signal: query.signal });
  const list = Array.isArray(data?.assignments) ? data.assignments : Array.isArray(data) ? data : [];
  const tasks = list
    .map((row) => mapAssignmentToWorkTask(row as Record<string, unknown>))
    .filter((t) => t.id);
  const hasMore = data?.has_more != null ? Boolean(data.has_more) : tasks.length >= limit;
  return { tasks, hasMore, offset, limit };
}

/** Tương thích cũ — tải 1 trang đầu (không còn full dump). */
export async function fetchProductionWorkTasks(query: WorkTasksQuery = {}): Promise<WorkTask[]> {
  const page = await fetchProductionWorkTasksPage(query);
  return page.tasks;
}

/** Overview «của tôi» — cùng nguồn Giao việc SX (1 trang). */
export async function fetchMyProductionTasks(
  userId: string,
  opts?: { signal?: AbortSignal },
): Promise<WorkTask[]> {
  return fetchProductionWorkTasks({
    assigneeId: userId,
    limit: WORK_TASKS_PAGE_SIZE,
    offset: 0,
    signal: opts?.signal,
  });
}

/** Cập nhật trạng thái qua API Giao việc (đồng bộ pipeline nếu có crm_task_id). */
export async function updateWorkTaskStatus(
  _dealId: string,
  taskId: string,
  status: string,
  source: 'crm_task' | 'assignment' = 'assignment',
): Promise<WorkTask> {
  if (source === 'crm_task') {
    const { data } = await api.put<Record<string, unknown>>(`/crm/leads/${_dealId}/tasks/${taskId}`, {
      status,
      skip_completion_evidence: true,
    });
    return mapAssignmentToWorkTask({
      ...(data || {}),
      id: taskId,
      status,
      lead_id: _dealId,
      assignment_module: 'production',
    });
  }
  const { data } = await api.put<{ assignment?: Record<string, unknown> }>(
    `/crm/assignments/${taskId}`,
    { status },
  );
  const row = (data?.assignment || data || {}) as Record<string, unknown>;
  return mapAssignmentToWorkTask({ ...row, id: taskId, status });
}

export type WorkAssigneeOption = {
  id: string;
  name: string;
};

export function collectAssigneeOptions(tasks: WorkTask[]): WorkAssigneeOption[] {
  const map = new Map<string, string>();
  for (const t of tasks) {
    const people =
      t.assignees && t.assignees.length
        ? t.assignees
        : t.assignee
          ? [t.assignee]
          : [];
    for (const p of people) {
      const id = p?.id;
      if (!id) continue;
      const name = p.full_name?.trim() || 'Không tên';
      if (!map.has(id)) map.set(id, name);
    }
    const aid = t.assignee_id;
    if (aid && !map.has(aid)) {
      map.set(aid, t.assignee?.full_name?.trim() || 'Không tên');
    }
  }
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

export type DealTaskSection = {
  leadId: string;
  code: string;
  title: string;
  projectId?: string | null;
  customerName?: string | null;
  tasks: WorkTask[];
};

export function groupTasksByDeal(tasks: WorkTask[]): DealTaskSection[] {
  const map = new Map<string, DealTaskSection>();
  for (const task of tasks) {
    const leadId = task.lead_id || ASSIGNMENT_SECTION_ID;
    let section = map.get(leadId);
    if (!section) {
      const isAssignmentBucket = leadId === ASSIGNMENT_SECTION_ID;
      section = {
        leadId,
        code: isAssignmentBucket
          ? 'GIAO VIỆC'
          : task.lead?.code?.trim() || `DEAL-${leadId.slice(0, 8)}`,
        title: isAssignmentBucket
          ? 'Công việc được giao'
          : task.lead?.title?.trim() || 'Nhiệm vụ sản xuất',
        projectId: task.lead?.project_id ?? null,
        customerName: task.lead?.customer?.full_name ?? null,
        tasks: [],
      };
      map.set(leadId, section);
    }
    section.tasks.push(task);
  }

  return [...map.values()]
    .map((section) => ({
      ...section,
      tasks: [...section.tasks].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)),
    }))
    .sort((a, b) => {
      if (a.leadId === ASSIGNMENT_SECTION_ID) return -1;
      if (b.leadId === ASSIGNMENT_SECTION_ID) return 1;
      return a.code.localeCompare(b.code, 'vi');
    });
}

/** Id nhiệm vụ pipeline để focus trong chi tiết dự án. */
export function workTaskFocusCrmId(task: WorkTask): string | null {
  if (task.crm_task_id) return String(task.crm_task_id);
  if (task.source === 'crm_task' && task.id) return String(task.id);
  return null;
}

/**
 * Đính kèm file từ tab Công việc — ưu tiên crm_task (đồng bộ pipeline),
 * không có thì upload vào crm_assignment_files (kind=sub).
 */
export async function uploadWorkTaskFile(
  task: WorkTask,
  file: { uri: string; name: string; mime: string },
): Promise<void> {
  const dealId =
    task.lead_id && task.lead_id !== ASSIGNMENT_SECTION_ID ? String(task.lead_id) : '';
  const crmTaskId = workTaskFocusCrmId(task);

  if (dealId && crmTaskId) {
    const { uploadCrmTaskFiles } = await import('./projectDetailApi');
    await uploadCrmTaskFiles(dealId, crmTaskId, [file]);
    return;
  }

  // Giao việc độc lập / chưa gắn pipeline task
  const { postMultipart } = await import('../api/client');
  const form = new FormData();
  form.append('file', { uri: file.uri, name: file.name, type: file.mime } as unknown as Blob);
  form.append('kind', 'sub');
  await postMultipart(`/crm/assignments/${task.id}/files`, form, { timeoutMs: 180000 });
}

/** Task có được giao cho userId không (assignee chính hoặc multi-assignee). */
export function taskAssignedToUser(task: WorkTask, userId: string): boolean {
  if (!userId) return false;
  if (String(task.assignee_id || '') === String(userId)) return true;
  if (String(task.assignee?.id || '') === String(userId)) return true;
  return (task.assignees || []).some((a) => String(a?.id || '') === String(userId));
}
