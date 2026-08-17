import { api } from '../api/client';
import { isCrmProductionTaskDone } from './projectDetailApi';
import type { AuthUserLite } from './productionFilters';
import type { CrmTask } from '../types';

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
  crm_task_id?: string | null;
  _workshop_project_task?: boolean;
};

export type WorkTasksQuery = {
  /** null/undefined = không lọc người (team). Có id = chỉ việc của người đó. */
  assigneeId?: string | null;
  companyId?: string | null;
  /** Opt-in sau filter JS phía server. */
  limit?: number;
  offset?: number;
};

export const WORK_TASKS_PAGE_SIZE = 50;

export type WorkTaskCounts = {
  pending: number;
  inProgress: number;
  done: number;
};

export type WorkTasksPage = {
  tasks: WorkTask[];
  hasMore: boolean;
  total: number | null;
  counts: WorkTaskCounts | null;
};

/** Nhãn deal/lead giống web Giao việc VC. */
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

/** Khớp role admin trang Giao việc VC trên web. */
export function canViewTeamWork(user?: AuthUserLite | null): boolean {
  const role = String(user?.role || '').trim().toLowerCase();
  return role === 'admin'
    || role === 'manager'
    || role === 'sales_admin'
    || role === 'crm_production_admin'
    || role === 'production_admin';
}

function mapWorkTask(raw: Record<string, unknown>): WorkTask {
  const leadRaw = raw.lead && typeof raw.lead === 'object' ? (raw.lead as Record<string, unknown>) : null;
  const customerRaw =
    leadRaw?.customer && typeof leadRaw.customer === 'object'
      ? (leadRaw.customer as Record<string, unknown>)
      : null;

  return {
    id: String(raw.id || ''),
    lead_id: String(raw.lead_id || leadRaw?.id || ''),
    title: String(raw.title || ''),
    status: String(raw.status || 'pending'),
    stage_slug: raw.stage_slug != null ? String(raw.stage_slug) : null,
    order_index: raw.order_index != null ? Number(raw.order_index) : undefined,
    deadline: raw.deadline != null ? String(raw.deadline) : null,
    due_date: raw.due_date != null ? String(raw.due_date) : null,
    description: raw.description != null ? String(raw.description) : null,
    priority: raw.priority != null ? String(raw.priority) : null,
    crm_task_id: raw.crm_task_id != null ? String(raw.crm_task_id) : null,
    file_count: raw.file_count != null ? Number(raw.file_count) : undefined,
    attachment_count: raw.attachment_count != null ? Number(raw.attachment_count) : undefined,
    _workshop_project_task: raw._workshop_project_task === true || raw.source === 'workshop',
    source: raw._workshop_project_task === true || raw.source === 'workshop' ? 'workshop' : 'crm',
    metadata: raw.metadata && typeof raw.metadata === 'object'
      ? (raw.metadata as Record<string, unknown>)
      : null,
    lead: leadRaw
      ? {
          id: String(leadRaw.id || raw.lead_id || ''),
          title: leadRaw.title != null ? String(leadRaw.title) : null,
          code: leadRaw.code != null ? String(leadRaw.code) : null,
          project_id: leadRaw.project_id != null ? String(leadRaw.project_id) : null,
          type: leadRaw.type != null ? String(leadRaw.type) : null,
          customer: customerRaw
            ? {
                id: customerRaw.id != null ? String(customerRaw.id) : undefined,
                full_name: customerRaw.full_name != null ? String(customerRaw.full_name) : null,
              }
            : null,
        }
      : null,
  };
}

/** Chỉ nhiệm vụ VC/LĐ — loại CRM sales («Báo giá», «Chốt sản xuất», …). */
export function isLogisticsWorkTask(
  task: Pick<WorkTask, 'stage_slug' | 'source' | '_workshop_project_task' | 'metadata'>,
): boolean {
  if (task.source === 'workshop' || task._workshop_project_task) return true;
  const slug = String(task.stage_slug || '');
  if (slug.startsWith('vc_')) return true;
  const meta = task.metadata && typeof task.metadata === 'object' ? task.metadata : null;
  if (!meta) return false;
  return meta.workshop_module === 'logistics' || meta.workshop_area === 'logistics';
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

function headerInt(headers: Record<string, unknown> | undefined, name: string): number | null {
  const raw = headers?.[name] ?? headers?.[name.toLowerCase()];
  if (raw == null || raw === '') return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

function headerHasMore(headers: Record<string, unknown> | undefined, fallback: boolean): boolean {
  const raw = String(headers?.['x-has-more'] ?? headers?.['X-Has-More'] ?? '').toLowerCase();
  if (raw === '1' || raw === 'true') return true;
  if (raw === '0' || raw === 'false') return false;
  return fallback;
}

/**
 * Nhiệm vụ VC — GET /crm/tasks/overview?task_scope=logistics
 * assigneeId rỗng/null = xem cả team (khi user có quyền canViewTeamWork).
 */
export async function fetchLogisticsWorkTasksPage(
  query: WorkTasksQuery = {},
): Promise<WorkTasksPage> {
  const limit = query.limit && query.limit > 0 ? query.limit : undefined;
  const offset = query.offset && query.offset > 0 ? query.offset : 0;
  const params: Record<string, string> = { task_scope: 'logistics' };
  if (query.assigneeId) params.assignee_id = query.assigneeId;
  if (query.companyId) params.company_id = query.companyId;
  if (limit) params.limit = String(limit);
  if (limit && offset) params.offset = String(offset);

  const res = await api.get<unknown[]>('/crm/tasks/overview', { params });
  const list = Array.isArray(res.data) ? res.data : [];
  const headers = res.headers as Record<string, unknown> | undefined;
  const tasks = list
    .map((row) => mapWorkTask(row as Record<string, unknown>))
    .filter((t) => t.id && t.lead_id && isLogisticsWorkTask(t));
  const pending = headerInt(headers, 'x-count-pending');
  const inProgress = headerInt(headers, 'x-count-in-progress');
  const done = headerInt(headers, 'x-count-done');
  return {
    tasks,
    hasMore: limit ? headerHasMore(headers, list.length >= limit) : false,
    total: headerInt(headers, 'x-total'),
    counts:
      pending != null || inProgress != null || done != null
        ? {
            pending: pending || 0,
            inProgress: inProgress || 0,
            done: done || 0,
          }
        : null,
  };
}

export async function fetchLogisticsWorkTasks(query: WorkTasksQuery = {}): Promise<WorkTask[]> {
  const page = await fetchLogisticsWorkTasksPage(query);
  return page.tasks;
}

export async function fetchMyLogisticsTasks(
  userId: string,
  extra: Omit<WorkTasksQuery, 'assigneeId'> = {},
): Promise<WorkTask[]> {
  return fetchLogisticsWorkTasks({ ...extra, assigneeId: userId });
}

/** @deprecated alias — VC mobile dùng logistics */
export async function fetchMyProductionTasks(userId: string): Promise<WorkTask[]> {
  return fetchMyLogisticsTasks(userId);
}

/** @deprecated alias — VC mobile dùng logistics */
export async function fetchProductionWorkTasks(query: WorkTasksQuery = {}): Promise<WorkTask[]> {
  return fetchLogisticsWorkTasks(query);
}

/** Cập nhật trạng thái nhanh từ tab Công việc — không bắt minh chứng. */
export async function updateWorkTaskStatus(
  dealId: string,
  taskId: string,
  status: string,
  opts?: { workshop?: boolean },
): Promise<WorkTask> {
  if (opts?.workshop) {
    const { updateWorkshopTask } = await import('./projectDetailApi');
    const updated = await updateWorkshopTask(taskId, { status });
    return {
      ...updated,
      lead_id: dealId,
      _workshop_project_task: true,
      source: 'workshop',
    } as WorkTask;
  }
  const { data } = await api.put<Record<string, unknown>>(`/crm/leads/${dealId}/tasks/${taskId}`, {
    status,
    skip_completion_evidence: true,
  });
  return mapWorkTask({ ...(data || {}), lead_id: dealId, id: taskId, status });
}

export function isWorkTaskWorkshop(task: Pick<WorkTask, 'source' | '_workshop_project_task'>): boolean {
  return task.source === 'workshop' || task._workshop_project_task === true;
}

/** Đính kèm từ tab Công việc — đồng bộ chi tiết dự án (CRM hoặc workshop). */
export async function uploadWorkTaskFile(
  task: WorkTask,
  file: { uri: string; name: string; mime: string },
): Promise<void> {
  const dealId = task.lead_id ? String(task.lead_id) : '';
  const taskId = workTaskFocusCrmId(task) || String(task.id || '');
  if (!taskId) throw new Error('Thiếu id nhiệm vụ');

  if (isWorkTaskWorkshop(task)) {
    const { uploadWorkshopTaskFiles } = await import('./projectDetailApi');
    await uploadWorkshopTaskFiles(taskId, [file]);
    return;
  }
  if (!dealId) throw new Error('Thiếu deal để đính kèm');
  const { uploadCrmTaskFiles } = await import('./projectDetailApi');
  await uploadCrmTaskFiles(dealId, taskId, [file]);
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
    const leadId = task.lead_id;
    if (!leadId) continue;
    let section = map.get(leadId);
    if (!section) {
      section = {
        leadId,
        code: task.lead?.code?.trim() || `DEAL-${leadId.slice(0, 8)}`,
        title: task.lead?.title?.trim() || 'Nhiệm vụ vận chuyển lắp đặt',
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
    .sort((a, b) => a.code.localeCompare(b.code, 'vi'));
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
  const s = String(slug);
  if (s.startsWith('vc_')) {
    return s
      .slice(3)
      .split('_')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
  return s;
}

export function taskDueIso(task: WorkTask): string | null {
  return task.deadline || task.due_date || null;
}

export function isTaskOverdue(task: WorkTask): boolean {
  if (isTaskDone(task.status)) return false;
  const raw = taskDueIso(task);
  if (!raw) return false;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return false;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const due = new Date(d);
  due.setHours(0, 0, 0, 0);
  return due.getTime() < start.getTime();
}

export function formatTaskDeadline(iso?: string | null): string {
  if (!iso) return 'Chưa có hạn';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Chưa có hạn';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Id nhiệm vụ pipeline để focus trong chi tiết dự án. */
export function workTaskFocusCrmId(task: WorkTask): string | null {
  if (task.crm_task_id) return String(task.crm_task_id);
  return task.id ? String(task.id) : null;
}
