import { api } from './client';

export type EventStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled';

export type AppEvent = {
  id: string;
  title: string;
  description: string | null;
  status: EventStatus;
  eventType: string;
  typeName: string;
  typeIcon: string;
  typeColor: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  location: string | null;
  module: string;
  companyId: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  createdBy: string | null;
  creatorName: string | null;
  leadId: string | null;
  leadTitle: string | null;
  leadCode: string | null;
  customerName: string | null;
  cancelReason: string | null;
  participantIds: string[];
};

type ApiEvent = {
  id: string;
  title?: string | null;
  description?: string | null;
  status?: string | null;
  event_type?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  all_day?: boolean | null;
  location?: string | null;
  module?: string | null;
  company_id?: string | null;
  assignee_id?: string | null;
  created_by?: string | null;
  lead_id?: string | null;
  cancel_reason?: string | null;
  event_type_ref?: { name?: string | null; icon?: string | null; color?: string | null; slug?: string | null } | null;
  assignee?: { id?: string | null; full_name?: string | null } | null;
  creator?: { id?: string | null; full_name?: string | null } | null;
  lead?: { id?: string | null; title?: string | null; code?: string | null } | null;
  customer?: { full_name?: string | null } | null;
  participants?: { user_id?: string | null }[] | null;
};

export const EVENT_STATUS_META: Record<EventStatus, { label: string; tone: 'blue' | 'amber' | 'green' | 'red' }> = {
  planned: { label: 'Đã lên kế hoạch', tone: 'blue' },
  in_progress: { label: 'Đang thực hiện', tone: 'amber' },
  completed: { label: 'Hoàn thành', tone: 'green' },
  cancelled: { label: 'Đã hủy', tone: 'red' },
};

export const EVENT_MODULE_OPTIONS = [
  { value: '', label: 'Tất cả khối', emoji: '🌐' },
  { value: 'crm', label: 'Kinh doanh', emoji: '💼' },
  { value: 'production', label: 'Sản xuất', emoji: '🏭' },
  { value: 'logistics', label: 'Lắp đặt', emoji: '🚚' },
  { value: 'general', label: 'Chung công ty', emoji: '🏢' },
] as const;

export type EventWritePayload = {
  title: string;
  event_type?: string;
  description?: string | null;
  location?: string | null;
  start_time: string;
  end_time?: string | null;
  all_day?: boolean;
  status?: EventStatus;
  module?: string;
  company_id?: string;
  assignee_id?: string | null;
  lead_id?: string | null;
  participant_ids?: string[];
  cancel_reason?: string | null;
};

function normalizeStatus(s?: string | null): EventStatus {
  if (s === 'in_progress' || s === 'completed' || s === 'cancelled') return s;
  return 'planned';
}

export function mapEvent(e: ApiEvent): AppEvent {
  const ref = e.event_type_ref || {};
  return {
    id: e.id,
    title: e.title || 'Sự kiện',
    description: e.description ?? null,
    status: normalizeStatus(e.status),
    eventType: e.event_type || ref.slug || 'other',
    typeName: ref.name || e.event_type || 'Sự kiện',
    typeIcon: ref.icon || '📋',
    typeColor: ref.color || '#6B7280',
    startTime: e.start_time ?? null,
    endTime: e.end_time ?? null,
    allDay: !!e.all_day,
    location: e.location ?? null,
    module: e.module || 'crm',
    companyId: e.company_id ? String(e.company_id) : null,
    assigneeId: e.assignee_id ? String(e.assignee_id) : e.assignee?.id ? String(e.assignee.id) : null,
    assigneeName: e.assignee?.full_name ?? null,
    createdBy: e.created_by ? String(e.created_by) : e.creator?.id ? String(e.creator.id) : null,
    creatorName: e.creator?.full_name ?? null,
    leadId: e.lead_id ? String(e.lead_id) : e.lead?.id ? String(e.lead.id) : null,
    leadTitle: e.lead?.title ?? null,
    leadCode: e.lead?.code ?? null,
    customerName: e.customer?.full_name ?? null,
    cancelReason: e.cancel_reason ?? null,
    participantIds: (e.participants || []).map((p) => String(p.user_id || '')).filter(Boolean),
  };
}

export function eventsApiError(e: unknown, fallback = 'Có lỗi xảy ra'): string {
  const ax = e as { response?: { data?: { error?: string } }; message?: string };
  return ax?.response?.data?.error || ax?.message || fallback;
}

/** Lấy sự kiện theo khoảng ngày (YYYY-MM-DD). Dùng cho cả tuần & tháng. */
export async function fetchEventsRange(opts: {
  dateFrom: string;
  dateTo: string;
  companyId?: string;
  search?: string;
  status?: EventStatus | '';
  type?: string;
  module?: string;
  userId?: string;
  regionId?: string;
  signal?: AbortSignal;
}): Promise<AppEvent[]> {
  const params: Record<string, string | number> = {
    date_from: opts.dateFrom,
    date_to: opts.dateTo,
    limit: 500,
  };
  if (opts.companyId) params.company_id = opts.companyId;
  if (opts.search?.trim()) params.search = opts.search.trim();
  if (opts.status) params.status = opts.status;
  if (opts.type) params.type = opts.type;
  if (opts.module) params.module = opts.module;
  if (opts.userId) params.user_id = opts.userId;
  if (opts.regionId) params.region_id = opts.regionId;

  const { data } = await api.get<{ events?: ApiEvent[] }>('/events', { params, signal: opts.signal });
  return (data?.events || []).map(mapEvent);
}

export async function fetchEventById(id: string, signal?: AbortSignal): Promise<AppEvent> {
  const { data } = await api.get<ApiEvent>(`/events/${id}`, { signal });
  return mapEvent(data);
}

export async function createEvent(payload: EventWritePayload): Promise<AppEvent> {
  const { data } = await api.post<ApiEvent>('/events', payload);
  return mapEvent(data);
}

export async function updateEvent(id: string, payload: Partial<EventWritePayload> & { status?: EventStatus }): Promise<AppEvent> {
  const { data } = await api.put<ApiEvent>(`/events/${id}`, payload);
  return mapEvent(data);
}

export async function cancelEvent(id: string, cancelReason: string): Promise<AppEvent> {
  return updateEvent(id, { status: 'cancelled', cancel_reason: cancelReason.trim() });
}

export async function deleteEvent(id: string): Promise<void> {
  await api.delete(`/events/${id}`);
}

export type EventType = {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
};

export async function fetchEventTypes(signal?: AbortSignal): Promise<EventType[]> {
  try {
    const { data } = await api.get<EventType[]>('/events/event-types', { signal });
    return Array.isArray(data)
      ? data.map((t) => ({
          id: String(t.id),
          name: t.name || 'Loại',
          slug: t.slug || '',
          icon: t.icon || '📋',
          color: t.color || '#6B7280',
        }))
      : [];
  } catch {
    return [];
  }
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** ISO → `YYYY-MM-DDTHH:mm` (giờ máy local), khớp web datetime-local. */
export function isoToLocalDatetimeValue(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** `YYYY-MM-DDTHH:mm` → ISO UTC. */
export function localDatetimeValueToIso(localValue?: string | null): string | null {
  if (!localValue || !String(localValue).trim()) return null;
  const m = String(localValue)
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

export function defaultEventStartLocal(day?: Date): string {
  const d = day ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0, 0, 0) : new Date();
  if (!day) {
    d.setMinutes(d.getMinutes() + 60);
    d.setSeconds(0, 0);
    d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15);
    if (d <= new Date()) d.setMinutes(d.getMinutes() + 15);
  }
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function addHoursLocalDatetime(localValue: string, hours: number): string {
  const iso = localDatetimeValueToIso(localValue);
  if (!iso) return localValue;
  const d = new Date(iso);
  d.setHours(d.getHours() + hours);
  return isoToLocalDatetimeValue(d.toISOString());
}
