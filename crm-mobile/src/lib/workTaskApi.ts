import { api } from '../api/client';
import type {
  WorkTask,
  WorkTaskComment,
  WorkTaskParticipant,
  WorkTaskPriority,
  WorkTaskStatus,
} from '../types/workTask';

export type WorkTaskListQuery = {
  scope?: 'all' | 'my' | 'overdue';
  status?: WorkTaskStatus | null;
  priority?: WorkTaskPriority | null;
  search?: string;
  project_id?: string | null;
  assignee_id?: string | null;
  task_type?: 'project' | 'personal' | null;
  page?: number;
  page_size?: number;
};

export type WorkTaskListResponse = {
  tasks: WorkTask[];
  total?: number;
  page?: number;
  page_size?: number;
};

export async function listWorkTasks(
  q: WorkTaskListQuery,
): Promise<WorkTaskListResponse> {
  const scope = q.scope || 'all';
  const path =
    scope === 'my' ? '/tasks/my'
      : scope === 'overdue' ? '/tasks/overdue'
        : '/tasks';
  const params: Record<string, string | number> = {};
  if (scope === 'all') {
    if (q.status) params.status = q.status;
    if (q.priority) params.priority = q.priority;
    if (q.search) params.search = q.search;
    if (q.project_id) params.project_id = q.project_id;
    if (q.assignee_id) params.assignee_id = q.assignee_id;
    if (q.task_type) params.task_type = q.task_type;
  }
  params.page = q.page ?? 1;
  params.page_size = q.page_size ?? 30;
  const { data } = await api.get<WorkTaskListResponse>(path, { params });
  return {
    tasks: Array.isArray(data?.tasks) ? data.tasks : [],
    total: data?.total,
    page: data?.page,
    page_size: data?.page_size,
  };
}

export async function getWorkTask(id: string): Promise<WorkTask | null> {
  const { data } = await api.get<{ task: WorkTask }>(`/tasks/${id}`);
  return data?.task || null;
}

export type CreateWorkTaskPayload = {
  title: string;
  description?: string | null;
  priority?: WorkTaskPriority;
  status?: WorkTaskStatus;
  assignee_id?: string | null;
  due_date?: string | null;
  start_date?: string | null;
  estimated_hours?: number | null;
  task_type?: 'project' | 'personal';
  project_id?: string | null;
  participants?: { user_id: string; role?: 'participant' | 'observer' }[];
};

export async function createWorkTask(payload: CreateWorkTaskPayload): Promise<WorkTask> {
  const { data } = await api.post<{ task: WorkTask }>('/tasks', payload);
  return data.task;
}

export type UpdateWorkTaskPayload = Partial<{
  title: string;
  description: string | null;
  notes: string | null;
  status: WorkTaskStatus;
  priority: WorkTaskPriority;
  assignee_id: string | null;
  supervisor_id: string | null;
  due_date: string | null;
  start_date: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
}>;

export async function updateWorkTask(
  id: string,
  payload: UpdateWorkTaskPayload,
): Promise<WorkTask> {
  const { data } = await api.put<{ task: WorkTask }>(`/tasks/${id}`, payload);
  return data.task;
}

export async function updateWorkTaskStatus(
  id: string,
  status: WorkTaskStatus,
): Promise<WorkTask> {
  const { data } = await api.patch<{ task: WorkTask }>(`/tasks/${id}/status`, { status });
  return data.task;
}

export async function deleteWorkTask(id: string): Promise<void> {
  await api.delete(`/tasks/${id}`);
}

export async function listWorkTaskComments(taskId: string): Promise<WorkTaskComment[]> {
  const { data } = await api.get<{ comments: WorkTaskComment[] }>(`/tasks/${taskId}/comments`);
  return Array.isArray(data?.comments) ? data.comments : [];
}

export async function postWorkTaskComment(
  taskId: string,
  content: string,
): Promise<WorkTaskComment> {
  const { data } = await api.post<{ comment: WorkTaskComment }>(
    `/tasks/${taskId}/comments`,
    { content },
  );
  return data.comment;
}

export async function listWorkTaskParticipants(taskId: string): Promise<WorkTaskParticipant[]> {
  const { data } = await api.get<{ participants: WorkTaskParticipant[] }>(
    `/tasks/${taskId}/participants`,
  );
  return Array.isArray(data?.participants) ? data.participants : [];
}

export async function addWorkTaskParticipant(
  taskId: string,
  userId: string,
  role: 'participant' | 'observer' = 'participant',
): Promise<WorkTaskParticipant> {
  const { data } = await api.post<{ participant: WorkTaskParticipant }>(
    `/tasks/${taskId}/participants`,
    { user_id: userId, role },
  );
  return data.participant;
}

export async function removeWorkTaskParticipant(taskId: string, userId: string): Promise<void> {
  await api.delete(`/tasks/${taskId}/participants/${userId}`);
}

export type WorkTaskUserOption = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  avatar?: string | null;
  role?: string | null;
  position?: string | null;
};

export async function searchUsersForAssign(search?: string): Promise<WorkTaskUserOption[]> {
  const params: Record<string, string> = {};
  if (search && search.trim()) params.search = search.trim();
  const { data } = await api.get<{ users: WorkTaskUserOption[] }>('/users', { params });
  return Array.isArray(data?.users) ? data.users : [];
}
