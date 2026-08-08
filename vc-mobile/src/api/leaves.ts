import { api } from './client';

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | string;

export type LeaveItem = {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  leave_type: string;
  half_day?: string | null;
  reason?: string | null;
  status: LeaveStatus;
  created_at?: string | null;
  user?: { id?: string; full_name?: string; email?: string } | null;
};

export const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: 'Phép năm',
  unpaid: 'Không lương',
  sick: 'Ốm',
  remote: 'Online',
  business: 'Công tác',
  other: 'Khác',
};

export function leaveTypeLabel(type?: string | null): string {
  const t = String(type || 'other');
  return LEAVE_TYPE_LABELS[t] || t;
}

export function leaveStatusLabel(status?: string | null): string {
  const s = String(status || '');
  if (s === 'approved') return 'Đã duyệt';
  if (s === 'pending') return 'Chờ duyệt';
  if (s === 'rejected') return 'Từ chối';
  if (s === 'cancelled') return 'Đã hủy';
  return s || '—';
}

export async function fetchLeaves(params?: {
  from?: string;
  to?: string;
  status?: string;
  company_id?: string;
}): Promise<LeaveItem[]> {
  const { data } = await api.get<{ leaves?: LeaveItem[] }>('/kpi/leaves', { params: params || {} });
  return Array.isArray(data?.leaves) ? data.leaves : [];
}

export async function createLeave(input: {
  start_date: string;
  end_date: string;
  leave_type: string;
  half_day?: string | null;
  reason?: string | null;
}): Promise<LeaveItem> {
  const { data } = await api.post<LeaveItem>('/kpi/leaves', input);
  return data;
}

export async function deleteLeave(id: string): Promise<void> {
  await api.delete(`/kpi/leaves/${id}`);
}
