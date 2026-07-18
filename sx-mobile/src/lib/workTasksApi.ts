import { api } from '../api/client';
import { isCrmProductionTaskDone } from './projectDetailApi';
import type { CrmTask } from '../types';

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
  /** crm_task (pipeline) hoặc assignment (Giao việc web). */
  source?: 'crm_task' | 'assignment';
  crm_task_id?: string | null;
  assignment_module?: string | null;
};

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
    source: 'crm_task',
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

function mapAssignmentToWorkTask(raw: Record<string, unknown>): WorkTask {
  const leadRaw = raw.lead && typeof raw.lead === 'object' ? (raw.lead as Record<string, unknown>) : null;
  const leadId = String(raw.lead_id || leadRaw?.id || ASSIGNMENT_SECTION_ID);
  const module = raw.assignment_module != null ? String(raw.assignment_module) : null;
  return {
    id: String(raw.id || ''),
    lead_id: leadId,
    title: String(raw.title || 'Nhiệm vụ được giao'),
    status: String(raw.status || 'pending'),
    deadline: raw.deadline != null ? String(raw.deadline) : null,
    due_date: raw.deadline != null ? String(raw.deadline) : null,
    description: raw.description != null ? String(raw.description) : null,
    priority: raw.priority != null ? String(raw.priority) : null,
    source: 'assignment',
    crm_task_id: raw.crm_task_id != null ? String(raw.crm_task_id) : null,
    assignment_module: module,
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
            title: module === 'crm' ? 'Giao việc CRM' : 'Giao việc sản xuất',
            code: 'GIAO VIỆC',
            project_id: null,
            type: null,
            customer: null,
          }
        : null,
  };
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

async function fetchPipelineTasks(userId: string): Promise<WorkTask[]> {
  const { data } = await api.get<unknown[]>('/crm/tasks/overview', {
    params: {
      assignee_id: userId,
      task_scope: 'production',
    },
  });
  const list = Array.isArray(data) ? data : [];
  return list
    .map((row) => mapWorkTask(row as Record<string, unknown>))
    .filter((t) => t.id && t.lead_id);
}

async function fetchAssignedWork(userId: string): Promise<WorkTask[]> {
  // Không lọc module — Giao việc CRM hoặc SX trên web đều hiện trên app xưởng.
  const { data } = await api.get<{ assignments?: unknown[] }>('/crm/assignments', {
    params: { assignee_id: userId },
  });
  const list = Array.isArray(data?.assignments) ? data.assignments : Array.isArray(data) ? data : [];
  return list
    .map((row) => mapAssignmentToWorkTask(row as Record<string, unknown>))
    .filter((t) => t.id);
}

/**
 * Công việc của tôi = nhiệm vụ pipeline SX (crm_tasks) + Giao việc web (crm_assignments).
 * Trước đây chỉ đọc crm_tasks → việc tạo từ trang Giao việc không bao giờ hiện.
 */
export async function fetchMyProductionTasks(userId: string): Promise<WorkTask[]> {
  const [pipeline, assigned] = await Promise.all([
    fetchPipelineTasks(userId).catch(() => [] as WorkTask[]),
    fetchAssignedWork(userId).catch(() => [] as WorkTask[]),
  ]);

  const pipelineIds = new Set(pipeline.map((t) => t.id));
  // Bỏ assignment đã gắn crm_task trùng (tránh double).
  const extra = assigned.filter((a) => {
    if (a.crm_task_id && pipelineIds.has(a.crm_task_id)) return false;
    return true;
  });

  return [...pipeline, ...extra];
}

/** Cập nhật trạng thái — pipeline task hoặc Giao việc (assignment). */
export async function updateWorkTaskStatus(
  dealId: string,
  taskId: string,
  status: string,
  source: 'crm_task' | 'assignment' = 'crm_task',
): Promise<WorkTask> {
  if (source === 'assignment') {
    const { data } = await api.put<{ assignment?: Record<string, unknown> }>(
      `/crm/assignments/${taskId}`,
      { status },
    );
    const row = (data?.assignment || data || {}) as Record<string, unknown>;
    return mapAssignmentToWorkTask({ ...row, id: taskId, status });
  }
  const { data } = await api.put<Record<string, unknown>>(`/crm/leads/${dealId}/tasks/${taskId}`, {
    status,
    skip_completion_evidence: true,
  });
  return mapWorkTask({ ...(data || {}), lead_id: dealId, id: taskId, status });
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
