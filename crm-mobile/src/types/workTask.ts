/**
 * Mirror `backend/src/routes/tasks.js` — quản lý công việc (giao việc, dự án).
 * Khác với `crm-mobile/src/types/crm.ts` (CRM lead-level tasks).
 */

export type WorkTaskStatus =
  | 'pending'
  | 'todo'
  | 'in_progress'
  | 'review'
  | 'done'
  | 'blocked'
  | 'deferred';

export type WorkTaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export type WorkTaskType = 'project' | 'personal';

export type WorkTaskUser = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  avatar?: string | null;
};

export type WorkTaskProjectRef = {
  id: string;
  code?: string | null;
  name?: string | null;
};

export type WorkTaskStageRef = {
  id: string;
  name?: string | null;
  color?: string | null;
};

export type WorkTaskComment = {
  id: string;
  task_id?: string;
  user_id?: string;
  content: string;
  attachments?: unknown[];
  created_at?: string | null;
  user?: WorkTaskUser | null;
};

export type WorkTaskChecklist = {
  id: string;
  task_id?: string;
  title: string;
  is_done?: boolean | null;
  order_index?: number | null;
  notes?: string | null;
};

export type WorkTaskParticipant = {
  id?: string;
  task_id?: string;
  user_id: string;
  role: 'participant' | 'observer' | string;
  user?: WorkTaskUser | null;
};

export type WorkTask = {
  id: string;
  project_id?: string | null;
  stage_id?: string | null;
  workflow_line_id?: string | null;
  title: string;
  description?: string | null;
  notes?: string | null;
  priority: WorkTaskPriority;
  status: WorkTaskStatus;
  assignee_id?: string | null;
  supervisor_id?: string | null;
  created_by_id?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  completed_at?: string | null;
  estimated_hours?: number | null;
  actual_hours?: number | null;
  order_index?: number | null;
  task_type?: WorkTaskType | null;
  attachments?: unknown[] | null;
  created_at?: string | null;
  updated_at?: string | null;
  projects?: WorkTaskProjectRef | null;
  assignee?: WorkTaskUser | null;
  creator?: WorkTaskUser | null;
  stage?: WorkTaskStageRef | null;
  participants?: WorkTaskParticipant[];
  checklists?: WorkTaskChecklist[];
  comments?: WorkTaskComment[];
};

export const WORK_TASK_STATUS_LABEL: Record<WorkTaskStatus, string> = {
  pending: 'Đang chờ',
  todo: 'Chờ xử lý',
  in_progress: 'Đang làm',
  review: 'Chờ kiểm tra',
  done: 'Hoàn thành',
  blocked: 'Bị chặn',
  deferred: 'Tạm hoãn',
};

export const WORK_TASK_STATUS_COLOR: Record<WorkTaskStatus, string> = {
  pending: '#94A3B8',
  todo: '#64748B',
  in_progress: '#1D5BD7',
  review: '#F59E0B',
  done: '#059669',
  blocked: '#EF4444',
  deferred: '#A855F7',
};

export const WORK_TASK_PRIORITY_LABEL: Record<WorkTaskPriority, string> = {
  low: 'Thấp',
  medium: 'Trung bình',
  high: 'Cao',
  urgent: 'Gấp',
};

export const WORK_TASK_PRIORITY_COLOR: Record<WorkTaskPriority, string> = {
  low: '#3B82F6',
  medium: '#F59E0B',
  high: '#F97316',
  urgent: '#EF4444',
};

export const WORK_TASK_STATUS_ORDER: WorkTaskStatus[] = [
  'pending',
  'todo',
  'in_progress',
  'review',
  'done',
  'blocked',
  'deferred',
];

export const WORK_TASK_PRIORITY_ORDER: WorkTaskPriority[] = [
  'low',
  'medium',
  'high',
  'urgent',
];
