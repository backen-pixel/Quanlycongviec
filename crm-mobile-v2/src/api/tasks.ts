import { colorFromName, initialsFromName, timeLabel } from '../lib/media';
import { Colors } from '../theme';
import { api } from './client';
import type { Assignee, PlannerTask, TaskKind } from '../types';

type ApiUser = { id: string; full_name?: string | null; email?: string | null; role?: string | null };
type ApiTask = {
  id: string;
  title: string;
  status?: string | null;
  priority?: string | null;
  due_date?: string | null;
  start_date?: string | null;
  assignee_id?: string | null;
  assignee?: { id?: string; full_name?: string | null } | null;
  projects?: { code?: string | null } | null;
};

function kindFromTitle(title: string): TaskKind {
  const s = (title || '').toLowerCase();
  if (/gọi|call|điện/.test(s)) return 'call';
  if (/khảo sát|hẹn|gặp|meeting/.test(s)) return 'meeting';
  if (/báo giá|quote|định giá/.test(s)) return 'quote';
  return 'followup';
}

export async function fetchUsers(): Promise<Assignee[]> {
  const { data } = await api.get<{ users?: ApiUser[] }>('/users');
  const list = Array.isArray(data?.users) ? data.users : [];
  return list.map((u): Assignee => {
    const name = u.full_name || u.email || 'Người dùng';
    return {
      id: u.id,
      name,
      initials: initialsFromName(name),
      color: colorFromName(name),
      role: u.role || 'Nhân viên',
    };
  });
}

export async function fetchMyTasks(signal?: AbortSignal): Promise<PlannerTask[]> {
  const { data } = await api.get<{ tasks?: ApiTask[] }>('/tasks', {
    params: { page: 1, page_size: 50 },
    signal,
  });
  const list = Array.isArray(data?.tasks) ? data.tasks : [];
  const now = Date.now();
  return list.map((t): PlannerTask => {
    const due = t.due_date || t.start_date;
    const done = t.status === 'done';
    const overdue = !done && !!due && new Date(due).getTime() < now;
    return {
      id: t.id,
      time: timeLabel(due) || '--:--',
      title: t.title || 'Công việc',
      kind: kindFromTitle(t.title),
      linkedCode: t.projects?.code || undefined,
      assigneeId: t.assignee_id || t.assignee?.id || 'unknown',
      done,
      overdue,
    };
  });
}

export const ASSIGNEE_FALLBACK_COLOR = Colors.blue;
