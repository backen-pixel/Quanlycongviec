import { api } from '../api/client';
import { isCrmProductionTaskDone } from './projectDetailApi';
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

export async function fetchMyLogisticsTasks(userId: string): Promise<WorkTask[]> {
  const { data } = await api.get<unknown[]>('/crm/tasks/overview', {
    params: {
      assignee_id: userId,
      task_scope: 'logistics',
    },
  });
  const list = Array.isArray(data) ? data : [];
  return list
    .map((row) => mapWorkTask(row as Record<string, unknown>))
    .filter((t) => t.id && t.lead_id);
}

/** @deprecated alias — VC mobile dùng logistics */
export async function fetchMyProductionTasks(userId: string): Promise<WorkTask[]> {
  return fetchMyLogisticsTasks(userId);
}

/** Cập nhật trạng thái nhanh từ tab Công việc — không bắt minh chứng. */
export async function updateWorkTaskStatus(
  dealId: string,
  taskId: string,
  status: string,
): Promise<WorkTask> {
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
