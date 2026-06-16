import { api } from './client';

export type EventStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled';

export type AppEvent = {
  id: string;
  title: string;
  status: EventStatus;
  eventType: string;
  typeName: string;
  typeIcon: string;
  typeColor: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  location: string | null;
  assigneeName: string | null;
  creatorName: string | null;
  leadTitle: string | null;
  leadCode: string | null;
  customerName: string | null;
};

type ApiEvent = {
  id: string;
  title?: string | null;
  status?: string | null;
  event_type?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  all_day?: boolean | null;
  location?: string | null;
  event_type_ref?: { name?: string | null; icon?: string | null; color?: string | null; slug?: string | null } | null;
  assignee?: { full_name?: string | null } | null;
  creator?: { full_name?: string | null } | null;
  lead?: { title?: string | null; code?: string | null } | null;
  customer?: { full_name?: string | null } | null;
};

export const EVENT_STATUS_META: Record<EventStatus, { label: string; tone: 'blue' | 'amber' | 'green' | 'red' }> = {
  planned: { label: 'Đã lên kế hoạch', tone: 'blue' },
  in_progress: { label: 'Đang thực hiện', tone: 'amber' },
  completed: { label: 'Hoàn thành', tone: 'green' },
  cancelled: { label: 'Đã hủy', tone: 'red' },
};

function normalizeStatus(s?: string | null): EventStatus {
  if (s === 'in_progress' || s === 'completed' || s === 'cancelled') return s;
  return 'planned';
}

function mapEvent(e: ApiEvent): AppEvent {
  const ref = e.event_type_ref || {};
  return {
    id: e.id,
    title: e.title || 'Sự kiện',
    status: normalizeStatus(e.status),
    eventType: e.event_type || ref.slug || 'other',
    typeName: ref.name || e.event_type || 'Sự kiện',
    typeIcon: ref.icon || '📋',
    typeColor: ref.color || '#6B7280',
    startTime: e.start_time ?? null,
    endTime: e.end_time ?? null,
    allDay: !!e.all_day,
    location: e.location ?? null,
    assigneeName: e.assignee?.full_name ?? null,
    creatorName: e.creator?.full_name ?? null,
    leadTitle: e.lead?.title ?? null,
    leadCode: e.lead?.code ?? null,
    customerName: e.customer?.full_name ?? null,
  };
}

/** Lấy sự kiện theo khoảng ngày (YYYY-MM-DD). Dùng cho cả tuần & tháng. */
export async function fetchEventsRange(opts: {
  dateFrom: string;
  dateTo: string;
  companyId?: string;
  search?: string;
  status?: EventStatus | '';
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

  const { data } = await api.get<{ events?: ApiEvent[] }>('/events', { params, signal: opts.signal });
  return (data?.events || []).map(mapEvent);
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
