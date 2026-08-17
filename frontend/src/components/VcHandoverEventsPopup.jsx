/**
 * Popup lịch sự kiện gắn deal — UI giống trang Sự kiện;
 * tạo đồng thời ngày VC + lắp đặt; ngày VC = giao hàng SX.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeftRight,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Factory,
  Loader2,
  Plus,
  Truck,
  X,
} from 'lucide-react';
import api from '../lib/api';
import { datetimeLocalValueToIso } from '../lib/datetimeLocal';
import EventCreateModal from './EventCreateModal';
import MultiDayDatePicker from './MultiDayDatePicker';

const SX_BUSY_THRESHOLD = 4;
const VC_BUSY_THRESHOLD = 4;
const INSTALL_BUSY_THRESHOLD = 4;
/** Tránh `eventIds = []` tạo mảng mới mỗi render → vòng lặp load. */
const EMPTY_EVENT_IDS = Object.freeze([]);

function pad(n) {
  return String(n).padStart(2, '0');
}

function toYmd(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDay(iso) {
  if (!iso) return null;
  const s = String(iso).trim();
  if (!s) return null;
  try {
    const d = new Date(s.length === 10 ? `${s}T12:00:00+07:00` : s);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  } catch {
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
  }
}

function formatTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Ho_Chi_Minh',
    });
  } catch {
    return '';
  }
}

function formatDayLabel(ymd) {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** So sánh ngày lịch (YYYY-MM-DD): -1 / 0 / 1 */
function compareYmd(a, b) {
  if (!a || !b) return 0;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Quy định: ngày lấy hàng VC phải = hoặc sau ngày lắp (cùng ngày được phép) */
function assertPickupOnOrAfterInstall(installYmd, pickupYmd) {
  if (!installYmd || !pickupYmd) return { ok: true };
  if (compareYmd(pickupYmd, installYmd) >= 0) return { ok: true };
  return {
    ok: false,
    message:
      `Ngày lấy hàng VC (${formatDayLabel(pickupYmd)}) phải bằng hoặc sau ngày lắp đặt `
      + `(${formatDayLabel(installYmd)}). Có thể cùng ngày, không được trước ngày lắp.`,
  };
}

/** ymd + giờ mặc định 09:00 → datetime-local */
function ymdToLocal(ymd, hour = 9, minute = 0) {
  if (!ymd) return '';
  return `${ymd}T${pad(hour)}:${pad(minute)}`;
}

function collectEventsFromPayload(payload, byId) {
  if (!payload) return;
  if (Array.isArray(payload?.events)) {
    for (const e of payload.events) if (e?.id) byId.set(String(e.id), e);
  } else if (Array.isArray(payload)) {
    for (const e of payload) if (e?.id) byId.set(String(e.id), e);
  } else if (payload?.id) {
    byId.set(String(payload.id), payload);
  } else if (payload?.event?.id) {
    byId.set(String(payload.event.id), payload.event);
  }
}

const TYPE_FALLBACK = {
  pickup: { name: 'Lấy hàng', icon: '📦', color: '#f97316' },
  delivery: { name: 'Giao hàng', icon: '🚚', color: '#ea580c' },
  installation: { name: 'Lắp đặt', icon: '🔧', color: '#d97706' },
  production_finish: { name: 'Hoàn thiện SX', icon: '✅', color: '#4f46e5' },
  site_visit: { name: 'Khảo sát', icon: '📍', color: '#3b82f6' },
  video_shoot: { name: 'Đi quay hình', icon: '🎥', color: '#7C3AED' },
};

/** Chỉ lịch vận hành SX/VC: lắp đặt · lấy hàng · giao hàng · hoàn thiện (ẩn khảo sát CRM…). */
const OPS_SCHEDULE_TYPES = new Set(['installation', 'pickup', 'delivery', 'production_finish']);

function isOpsScheduleEvent(ev) {
  if (!ev) return false;
  const t = String(ev.event_type || '').toLowerCase();
  if (OPS_SCHEDULE_TYPES.has(t)) return true;
  // site_visit / khảo = khảo sát — luôn ẩn
  if (t === 'site_visit' || t === 'survey' || t === 'video_shoot') return false;
  const blob = [
    ev.title,
    ev.name,
    ev.event_type_name,
    ev.type_name,
    ev.description,
  ].filter(Boolean).join(' ').toLowerCase();
  if (/khảo\s*sát|khao\s*sat|\bsurvey\b|tư\s*vấn|hẹn\s*gặp|hen\s*gap|ký\s*hđ|hợp\s*đồng|quay\s*hình/.test(blob)) {
    return false;
  }
  if (/lắp\s*đặt|lap\s*dat|\binstall/.test(blob)) return true;
  if (/giao\s*hàng|giao\s*hang|\bdelivery\b/.test(blob)) return true;
  if (/lấy\s*hàng|lay\s*hang|\bpickup\b|nhận\s*hàng/.test(blob)) return true;
  if (/hoàn\s*thiện|hoan\s*thien/.test(blob)) return true;
  return false;
}

const STATUS_LABEL = {
  planned: 'Dự kiến',
  confirmed: 'Áp dụng',
  in_progress: 'Áp dụng',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
};

const MONTH_NAMES = ['', 'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];

function resolveTypeSlug(eventTypes, slugs) {
  for (const slug of slugs) {
    if (eventTypes.some((t) => t.slug === slug)) return slug;
  }
  return slugs[0] || 'pickup';
}

/** Chuẩn hoá datetime-local / ISO → ISO string để vẽ lịch tạm */
function toPreviewIso(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    return datetimeLocalValueToIso(s) || null;
  }
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

/**
 * @param {{
 *  leadId?: string|null,
 *  projectId?: string|null,
 *  companyId?: string|null,
 *  eventIds?: string[],
 *  focusDate?: string|null,
 *  focusNonce?: number,
 *  pickMode?: boolean,
 *  pickTarget?: 'pickup'|'arrive'|'install'|'both',
 *  anchorPickupAt?: string|null,
 *  anchorArriveAt?: string|null,
 *  anchorInstallAt?: string|null,
 *  anchorFinishAt?: string|null,
 *  onPickDate?: (datetimeLocal: string) => void,
 *  onPickDates?: (dates: { pickupAt: string, installAt: string, vcArriveAt?: string, installOccurrenceDates?: string[] }) => void,
 *  anchorInstallOccurrenceDates?: string[],
 *  onClose: () => void,
 * }} props
 */
export default function VcHandoverEventsPopup({
  leadId = null,
  projectId = null,
  companyId = null,
  eventIds = EMPTY_EVENT_IDS,
  focusDate = null,
  focusNonce = 0,
  pickMode = false,
  pickTarget = 'both',
  anchorPickupAt = null,
  anchorArriveAt = null,
  anchorInstallAt = null,
  anchorFinishAt = null,
  anchorInstallOccurrenceDates = null,
  onPickDate = null,
  onPickDates = null,
  /** Nhúng trong form (không overlay fullscreen) */
  embedded = false,
  /** Chỉ hiện lắp đặt / lấy hàng / giao hàng / hoàn thiện — ẩn khảo sát CRM… */
  opsScheduleOnly = false,
  onClose,
}) {
  const scheduleOnly = opsScheduleOnly || pickMode;
  const initialDay = parseDay(focusDate) || toYmd(new Date());
  const [cursor, setCursor] = useState(() => {
    const [y, m] = initialDay.split('-').map(Number);
    return { year: y, month: m };
  });
  const [selectedDay, setSelectedDay] = useState(initialDay);
  const [moduleTab, setModuleTab] = useState('all');
  const [dealEvents, setDealEvents] = useState([]);
  const [monthEvents, setMonthEvents] = useState([]);
  const [eventTypes, setEventTypes] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState('');
  const [toast, setToast] = useState('');
  const [editEvent, setEditEvent] = useState(null);
  const [showEdit, setShowEdit] = useState(false);

  /** Form tạo VC + lắp đặt (+ SX giao hàng) */
  const [showSchedule, setShowSchedule] = useState(false);
  const [vcAt, setVcAt] = useState(() => anchorPickupAt || ymdToLocal(initialDay, 9));
  const [arriveAt, setArriveAt] = useState(() => anchorArriveAt || ymdToLocal(initialDay, 11));
  const [installAt, setInstallAt] = useState(() => anchorInstallAt || ymdToLocal(initialDay, 14));
  const [installOccurrenceDates, setInstallOccurrenceDates] = useState(() => {
    const occ = Array.isArray(anchorInstallOccurrenceDates)
      ? [...anchorInstallOccurrenceDates].map((d) => String(d).slice(0, 10)).filter(Boolean).sort()
      : [];
    if (occ.length) return occ;
    const day = parseDay(anchorInstallAt) || initialDay;
    return day ? [day] : [];
  });
  const [scheduleNotes, setScheduleNotes] = useState('');
  const [createSxDelivery, setCreateSxDelivery] = useState(true);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const idList = useMemo(
    () => [...new Set((Array.isArray(eventIds) ? eventIds : EMPTY_EVENT_IDS).filter(Boolean).map(String))],
    [eventIds],
  );

  const loadDeal = useCallback(async () => {
    const byId = new Map();
    const fetches = [];
    const base = {
      modules: 'crm,production,logistics',
      limit: 200,
      include_as_participant: '1',
    };
    if (leadId) {
      fetches.push(api.get('/events', { params: { ...base, lead_id: leadId } }).catch(() => null));
    }
    for (const id of idList.slice(0, 12)) {
      fetches.push(api.get(`/events/${id}`).catch(() => null));
    }
    if (!leadId && !idList.length && projectId) {
      fetches.push(api.get('/events', { params: { ...base, limit: 100 } }).catch(() => null));
    }
    if (!fetches.length) {
      setDealEvents([]);
      return;
    }
    const parts = await Promise.all(fetches);
    for (const part of parts) {
      if (!part) continue;
      collectEventsFromPayload(part.data, byId);
    }
    let list = [...byId.values()];
    if (leadId || projectId || idList.length) {
      list = list.filter((e) => {
        if (idList.includes(String(e.id))) return true;
        if (leadId && String(e.lead_id || '') === String(leadId)) return true;
        if (projectId && String(e.project_id || '') === String(projectId)) return true;
        return false;
      });
    }
    list = list.filter((e) => {
      if (scheduleOnly) return isOpsScheduleEvent(e);
      const mod = String(e.module || '').toLowerCase();
      return !mod || mod === 'crm' || mod === 'production' || mod === 'logistics' || mod === 'general'
        || String(e.event_type || '') === 'installation'
        || String(e.event_type || '') === 'pickup'
        || String(e.event_type || '') === 'delivery';
    });
    list.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    setDealEvents(list);
  }, [leadId, projectId, idList, scheduleOnly]);

  const loadMonth = useCallback(async () => {
    const params = {
      month: cursor.month,
      year: cursor.year,
      modules: scheduleOnly ? 'production,logistics' : 'crm,production,logistics',
      include_as_participant: '1',
    };
    if (companyId) params.company_id = companyId;
    try {
      const { data } = await api.get('/events/calendar', { params });
      const list = Array.isArray(data) ? data : (data?.events || []);
      const rows = Array.isArray(list) ? list : [];
      setMonthEvents(scheduleOnly ? rows.filter(isOpsScheduleEvent) : rows);
    } catch {
      try {
        const lastDay = new Date(cursor.year, cursor.month, 0).getDate();
        const from = `${cursor.year}-${pad(cursor.month)}-01`;
        const to = `${cursor.year}-${pad(cursor.month)}-${pad(lastDay)}`;
        const { data } = await api.get('/events', {
          params: {
            modules: scheduleOnly ? 'production,logistics' : 'crm,production,logistics',
            date_from: from,
            date_to: to,
            limit: 300,
            include_as_participant: '1',
            ...(companyId ? { company_id: companyId } : {}),
          },
        });
        const rows = Array.isArray(data?.events) ? data.events : [];
        setMonthEvents(scheduleOnly ? rows.filter(isOpsScheduleEvent) : rows);
      } catch {
        setMonthEvents([]);
      }
    }
  }, [cursor.month, cursor.year, scheduleOnly, companyId]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [typeRes] = await Promise.all([
        api.get('/events/event-types').catch(() => ({ data: [] })),
        loadDeal(),
        loadMonth(),
      ]);
      setEventTypes(Array.isArray(typeRes.data) ? typeRes.data : (typeRes.data?.types || []));
    } catch (e) {
      setErr(e?.response?.data?.error || e?.message || 'Không tải được lịch sự kiện');
      setDealEvents([]);
      setMonthEvents([]);
    } finally {
      setLoading(false);
    }
  }, [loadDeal, loadMonth]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (scheduleOnly && moduleTab === 'crm') setModuleTab('all');
  }, [scheduleOnly, moduleTab]);

  useEffect(() => {
    api.get('/users', { params: { limit: 300 } })
      .then((r) => {
        const d = r.data;
        const list = Array.isArray(d) ? d : (d?.users || d?.data || []);
        setUsers(Array.isArray(list) ? list : []);
      })
      .catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Đồng bộ ngày đề xuất từ thẻ bàn giao → form/preview trên lịch.
  useEffect(() => {
    if (anchorPickupAt) {
      const local = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(anchorPickupAt))
        ? String(anchorPickupAt).slice(0, 16)
        : ymdToLocal(parseDay(anchorPickupAt) || '', 9);
      if (local) setVcAt(local);
    }
    if (anchorInstallAt) {
      const local = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(anchorInstallAt))
        ? String(anchorInstallAt).slice(0, 16)
        : ymdToLocal(parseDay(anchorInstallAt) || '', 14);
      if (local) setInstallAt(local);
    }
    const occ = Array.isArray(anchorInstallOccurrenceDates)
      ? [...anchorInstallOccurrenceDates].map((d) => String(d).slice(0, 10)).filter(Boolean).sort()
      : [];
    if (occ.length) setInstallOccurrenceDates(occ);
    else if (anchorInstallAt) {
      const day = parseDay(anchorInstallAt) || String(anchorInstallAt).slice(0, 10);
      if (day) setInstallOccurrenceDates((prev) => (prev.length ? prev : [day]));
    }
  }, [anchorPickupAt, anchorInstallAt, anchorInstallOccurrenceDates]);

  // Bấm «Lịch» / đổi ngày-giờ / đổi chế độ Lắp|Lấy hàng → lịch nhảy đúng tháng & ngày.
  useEffect(() => {
    const preferred = pickTarget === 'pickup'
      ? (parseDay(focusDate) || parseDay(anchorPickupAt) || parseDay(anchorInstallAt))
      : pickTarget === 'install'
        ? (parseDay(focusDate) || parseDay(anchorInstallAt) || parseDay(anchorPickupAt))
        : (parseDay(focusDate) || parseDay(anchorInstallAt) || parseDay(anchorPickupAt));
    if (!preferred) return;
    setSelectedDay(preferred);
    const [y, m] = preferred.split('-').map(Number);
    if (y && m) setCursor({ year: y, month: m });
  }, [focusDate, focusNonce, pickTarget, anchorPickupAt, anchorInstallAt]);

  const calendarEvents = useMemo(() => {
    const byId = new Map();
    for (const e of monthEvents) if (e?.id) byId.set(String(e.id), e);
    for (const e of dealEvents) if (e?.id) byId.set(String(e.id), e);
    return [...byId.values()];
  }, [monthEvents, dealEvents]);

  /** Sự kiện tạm (chưa lưu / đang chỉnh trên form) — hiện khi chọn ngày hoặc đang sửa lịch. */
  const draftEvents = useMemo(() => {
    const hasRealHandoverEvents = idList.length > 0;
    // Có sự kiện DB rồi: chỉ hiện lại bản tạm khi đang chọn/sửa (pickMode).
    if (hasRealHandoverEvents && !pickMode) return [];

    const pickupIso = toPreviewIso(vcAt) || toPreviewIso(anchorPickupAt);
    const arriveIso = toPreviewIso(arriveAt) || toPreviewIso(anchorArriveAt) || pickupIso;
    const installIso = toPreviewIso(installAt) || toPreviewIso(anchorInstallAt) || arriveIso || pickupIso;
    const finishIso = toPreviewIso(anchorFinishAt)
      || (() => {
        const installDay = parseDay(installIso);
        if (!installDay) return null;
        const d = new Date(`${installDay}T12:00:00+07:00`);
        if (Number.isNaN(d.getTime())) return null;
        d.setDate(d.getDate() - 2);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}T17:00:00+07:00`;
      })();
    if (!pickupIso && !installIso && !finishIso) return [];

    const pickupDay = parseDay(pickupIso);
    const installDay = parseDay(installIso);
    const sameDay = !!(pickupDay && installDay && pickupDay === installDay);

    const drafts = [];
    if (finishIso) {
      drafts.push({
        id: '__draft_sx_finish__',
        _draft: true,
        module: 'production',
        event_type: 'production_finish',
        title: 'Hoàn thiện SX (tạm)',
        short_label: 'HT SX',
        start_time: finishIso,
        status: 'planned',
        color: '#4f46e5',
        occurrence_dates: [parseDay(finishIso)].filter(Boolean),
      });
    }
    if (pickupIso) {
      drafts.push({
        id: '__draft_vc_pickup__',
        _draft: true,
        module: 'logistics',
        event_type: 'pickup',
        title: 'Lấy hàng (tạm)',
        short_label: 'Lấy tạm',
        start_time: arriveIso || pickupIso,
        status: 'planned',
        color: '#ea580c',
      });
    }
    if (installIso) {
      drafts.push({
        id: '__draft_install__',
        _draft: true,
        module: 'logistics',
        event_type: 'installation',
        title: sameDay ? 'Lắp đặt (tạm · cùng ngày lấy hàng)' : 'Lắp đặt (tạm)',
        short_label: 'Lắp tạm',
        start_time: installIso || pickupIso,
        status: 'planned',
        color: '#d97706',
        occurrence_dates: installOccurrenceDates.length ? installOccurrenceDates : undefined,
      });
    }
    return drafts;
  }, [vcAt, arriveAt, installAt, installOccurrenceDates, anchorPickupAt, anchorArriveAt, anchorInstallAt, anchorFinishAt, idList, pickMode]);

  const filteredCalendarEvents = useMemo(() => {
    let scoped = scheduleOnly
      ? calendarEvents.filter(isOpsScheduleEvent)
      : calendarEvents;

    // Đang sửa/chọn ngày: ẩn sự kiện ops thật của đúng deal/dự án → hiện lại lịch tạm theo form.
    if (pickMode && draftEvents.length) {
      const idSet = new Set(idList.map(String));
      scoped = scoped.filter((e) => {
        if (!e || e._draft) return true;
        if (idSet.has(String(e.id))) return false;
        if (projectId && String(e.project_id || '') === String(projectId) && isOpsScheduleEvent(e)) {
          return false;
        }
        if (
          !projectId
          && leadId
          && String(e.lead_id || '') === String(leadId)
          && isOpsScheduleEvent(e)
        ) {
          return false;
        }
        return true;
      });
    }

    const base = moduleTab === 'all'
      ? scoped
      : scoped.filter((e) => String(e.module || '').toLowerCase() === moduleTab);
    const drafts = moduleTab === 'all'
      ? draftEvents
      : draftEvents.filter((e) => String(e.module || '').toLowerCase() === moduleTab);
    // Lịch tạm lên trước để luôn thấy trên ô ngày (không bị slice cắt mất)
    return [...drafts, ...base];
  }, [calendarEvents, draftEvents, moduleTab, scheduleOnly, pickMode, projectId, leadId, idList]);

  const eventYmdsInViewMonth = (ev) => {
    const { year, month } = cursor;
    const occ = Array.isArray(ev?.occurrence_dates)
      ? ev.occurrence_dates.map((d) => String(d).slice(0, 10)).filter(Boolean)
      : [];
    const ymds = occ.length ? occ : [parseDay(ev.start_time)].filter(Boolean);
    return ymds.filter((ymd) => {
      const [y, m] = String(ymd).split('-').map(Number);
      return y === year && m === month;
    });
  };

  const eventsByDayNum = useMemo(() => {
    const map = {};
    for (const ev of filteredCalendarEvents) {
      if (String(ev.status || '') === 'cancelled') continue;
      for (const ymd of eventYmdsInViewMonth(ev)) {
        const d = Number(String(ymd).slice(8, 10));
        if (!d) continue;
        if (!map[d]) map[d] = [];
        map[d].push(ev);
      }
    }
    return map;
  }, [filteredCalendarEvents, cursor]); // eslint-disable-line react-hooks/exhaustive-deps

  const sxCountByDay = useMemo(() => {
    const map = new Map();
    for (const ev of [...calendarEvents, ...draftEvents]) {
      if (String(ev.status || '') === 'cancelled') continue;
      if (String(ev.module || '').toLowerCase() !== 'production') continue;
      const day = parseDay(ev.start_time);
      if (!day) continue;
      map.set(day, (map.get(day) || 0) + 1);
    }
    return map;
  }, [calendarEvents, draftEvents]);

  /** Lịch vận chuyển / nhận hàng VC (module logistics hoặc pickup/delivery) */
  const vcCountByDay = useMemo(() => {
    const map = new Map();
    for (const ev of [...calendarEvents, ...draftEvents]) {
      if (String(ev.status || '') === 'cancelled') continue;
      const mod = String(ev.module || '').toLowerCase();
      const t = String(ev.event_type || '').toLowerCase();
      const isVc = mod === 'logistics' || t === 'pickup' || t === 'delivery';
      if (!isVc || t === 'installation') continue;
      const day = parseDay(ev.start_time);
      if (!day) continue;
      map.set(day, (map.get(day) || 0) + 1);
    }
    return map;
  }, [calendarEvents, draftEvents]);

  /** Lịch lắp đặt */
  const installCountByDay = useMemo(() => {
    const map = new Map();
    for (const ev of [...calendarEvents, ...draftEvents]) {
      if (String(ev.status || '') === 'cancelled') continue;
      if (String(ev.event_type || '').toLowerCase() !== 'installation') continue;
      const occ = Array.isArray(ev.occurrence_dates)
        ? ev.occurrence_dates.map((d) => String(d).slice(0, 10)).filter(Boolean)
        : [];
      const days = occ.length ? occ : [parseDay(ev.start_time)].filter(Boolean);
      for (const day of days) map.set(day, (map.get(day) || 0) + 1);
    }
    return map;
  }, [calendarEvents, draftEvents]);

  const selectedDayNum = useMemo(() => {
    if (!selectedDay) return null;
    const [y, m, d] = selectedDay.split('-').map(Number);
    if (y !== cursor.year || m !== cursor.month) return null;
    return d;
  }, [selectedDay, cursor]);

  const selectedDayEvents = useMemo(() => {
    if (!selectedDayNum) return [];
    return [...(eventsByDayNum[selectedDayNum] || [])].sort(
      (a, b) => new Date(a.start_time) - new Date(b.start_time),
    );
  }, [eventsByDayNum, selectedDayNum]);

  const dealIds = useMemo(() => new Set(dealEvents.map((e) => String(e.id))), [dealEvents]);

  /** Ngày VC đã chọn trên thẻ — tô xám khi đang chọn ngày lắp đặt */
  const vcAnchorYmd = useMemo(() => {
    if (!anchorPickupAt) return null;
    return parseDay(anchorPickupAt)
      || parseDay(datetimeLocalValueToIso(anchorPickupAt) || '')
      || (String(anchorPickupAt).match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || null);
  }, [anchorPickupAt]);

  /** Ngày lắp đã chọn trên form — tô teal khi đang chọn / xem */
  const installAnchorYmd = useMemo(() => {
    if (!anchorInstallAt) return null;
    return parseDay(anchorInstallAt)
      || parseDay(datetimeLocalValueToIso(anchorInstallAt) || '')
      || (String(anchorInstallAt).match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || null);
  }, [anchorInstallAt]);

  const selectedSxBusy = (sxCountByDay.get(selectedDay) || 0) >= SX_BUSY_THRESHOLD;
  const selectedSxCount = sxCountByDay.get(selectedDay) || 0;
  const selectedVcCount = vcCountByDay.get(selectedDay) || 0;
  const selectedInstallCount = installCountByDay.get(selectedDay) || 0;
  const selectedVcBusy = selectedVcCount >= VC_BUSY_THRESHOLD;
  const selectedInstallBusy = selectedInstallCount >= INSTALL_BUSY_THRESHOLD;

  /** Nhắc khi ngày VC dày lịch vận chuyển hoặc giao hàng xưởng */
  const confirmBusyVcDay = (ymd) => {
    if (!ymd) return true;
    const vc = vcCountByDay.get(ymd) || 0;
    const sx = sxCountByDay.get(ymd) || 0;
    const parts = [];
    if (vc >= VC_BUSY_THRESHOLD) {
      parts.push(`${vc} lịch vận chuyển / nhận hàng VC (≥ ${VC_BUSY_THRESHOLD})`);
    }
    if (sx >= SX_BUSY_THRESHOLD) {
      parts.push(`${sx} lịch giao hàng / sự kiện xưởng SX (≥ ${SX_BUSY_THRESHOLD})`);
    }
    if (!parts.length) return true;
    return window.confirm(
      `Ngày ${formatDayLabel(ymd)} đang khá dày lịch:\n• ${parts.join('\n• ')}\n\nVẫn chọn ngày này làm ngày nhận hàng VC?`,
    );
  };

  /** Nhắc khi ngày lắp đặt đã nhiều lịch lắp */
  const confirmBusyInstallDay = (ymd) => {
    if (!ymd) return true;
    const n = installCountByDay.get(ymd) || 0;
    if (n < INSTALL_BUSY_THRESHOLD) return true;
    return window.confirm(
      `Ngày ${formatDayLabel(ymd)} đã có ${n} lịch lắp đặt (≥ ${INSTALL_BUSY_THRESHOLD}).\n`
      + 'Đội lắp có thể quá tải — vẫn chọn ngày này?',
    );
  };

  const monthCells = useMemo(() => {
    const { year, month } = cursor;
    const firstDow = new Date(year, month - 1, 1).getDay(); // 0=CN — giống trang Sự kiện
    const daysInMonth = new Date(year, month, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDow; i += 1) cells.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  const typeInfo = (ev) => {
    const slug = ev.event_type || '';
    const fromDb = eventTypes.find((t) => t.slug === slug);
    if (fromDb) return fromDb;
    return TYPE_FALLBACK[slug] || { name: slug || 'Sự kiện', icon: '📋', color: '#6B7280' };
  };

  const moduleBadge = (mod) => {
    const m = String(mod || '').toLowerCase();
    if (m === 'production') return { label: 'SX', cls: 'bg-violet-100 text-violet-800', Icon: Factory };
    if (m === 'logistics') return { label: 'VC/LĐ', cls: 'bg-orange-100 text-orange-800', Icon: Truck };
    return { label: m || '—', cls: 'bg-gray-100 text-gray-600', Icon: Calendar };
  };

  const hmFromLocal = (v, fallbackH = 14, fallbackM = 0) => {
    const m = String(v || '').match(/T(\d{2}):(\d{2})/);
    return m ? { h: Number(m[1]), mi: Number(m[2]) } : { h: fallbackH, mi: fallbackM };
  };

  const applyInstallOcc = (dates) => {
    const sorted = [...(dates || [])]
      .map((d) => String(d || '').slice(0, 10))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort();
    setInstallOccurrenceDates(sorted);
    if (!sorted.length) {
      setInstallAt('');
      return;
    }
    const { h, mi } = hmFromLocal(installAt, 14, 0);
    setInstallAt(ymdToLocal(sorted[0], h, mi));
    // Lấy hàng phải ≥ ngày lắp đầu
    const vcDay = parseDay(datetimeLocalValueToIso(vcAt) || vcAt) || String(vcAt || '').slice(0, 10);
    if (vcDay && compareYmd(vcDay, sorted[0]) < 0) {
      const ph = String(vcAt || '').match(/T(\d{2}:\d{2})/)?.[1] || '08:00';
      setVcAt(`${sorted[0]}T${ph}`);
    }
    const last = sorted[sorted.length - 1];
    const arriveDay = parseDay(datetimeLocalValueToIso(arriveAt) || arriveAt);
    if (arriveDay && arriveDay > last) setArriveAt(ymdToLocal(sorted[0], 11));
  };

  const openScheduleForDay = (ymd) => {
    setSelectedDay(ymd);
    setVcAt(ymdToLocal(ymd, 9));
    setArriveAt(ymdToLocal(ymd, 11));
    setInstallAt(ymdToLocal(ymd, 14));
    setInstallOccurrenceDates([ymd]);
    setCreateSxDelivery(true);
    setShowSchedule(true);
  };

  /** Chọn 1 ngày trên lịch → trả về thẻ bàn giao */
  const applyPickedDay = (ymd) => {
    if (!pickMode) {
      setSelectedDay(ymd);
      return;
    }
    setSelectedDay(ymd);

    // Chỉ chọn lấy hàng → áp dụng ngay (không mở form xác nhận)
    if (pickTarget === 'pickup') {
      const installDay = parseDay(anchorInstallAt)
        || parseDay(installAt)
        || parseDay(datetimeLocalValueToIso(installAt) || '')
        || (anchorInstallAt && String(anchorInstallAt).match(/^(\d{4}-\d{2}-\d{2})/)?.[1])
        || null;
      if (installDay && compareYmd(ymd, installDay) < 0) {
        alert(
          `Ngày lấy hàng VC phải bằng hoặc sau ngày lắp đặt (${formatDayLabel(installDay)}). `
          + 'Có thể cùng ngày, không được trước ngày lắp.',
        );
        return;
      }
      const hm = String(vcAt || anchorPickupAt || '').match(/T(\d{2}:\d{2})/)?.[1] || '08:00';
      const local = `${ymd}T${hm}`;
      setVcAt(local);
      if (typeof onPickDates === 'function') {
        onPickDates({ pickupAt: local });
      } else if (typeof onPickDate === 'function') {
        onPickDate(local);
      }
      return;
    }

    // Chỉ chọn lắp đặt → áp dụng ngay (lắp có thể trước lấy hàng; nếu lấy hàng đang trước lắp thì kéo lấy hàng theo)
    if (pickTarget === 'install') {
      const vcDay = parseDay(anchorPickupAt)
        || parseDay(datetimeLocalValueToIso(anchorPickupAt) || '')
        || (anchorPickupAt && String(anchorPickupAt).match(/^(\d{4}-\d{2}-\d{2})/)?.[1])
        || null;
      let hour = 14;
      let minute = 0;
      const prev = String(installAt || anchorInstallAt || '').match(/T(\d{2}):(\d{2})/);
      if (prev) {
        hour = Number(prev[1]);
        minute = Number(prev[2]);
      }
      const local = ymdToLocal(ymd, hour, minute);
      setInstallAt(local);
      setInstallOccurrenceDates([ymd]);
      let nextPickup = vcDay ? (anchorPickupAt || ymdToLocal(vcDay, 8)) : null;
      if (vcDay && compareYmd(vcDay, ymd) < 0) {
        nextPickup = ymdToLocal(ymd, 8);
        setVcAt(nextPickup);
      } else if (vcDay) {
        setVcAt(nextPickup);
      }
      if (typeof onPickDates === 'function') {
        onPickDates({
          installAt: local,
          ...(nextPickup ? { pickupAt: nextPickup } : {}),
          installOccurrenceDates: [ymd],
        });
      } else if (typeof onPickDate === 'function') {
        onPickDate(local);
      }
      return;
    }

    // Cả hai → mở form giờ để chỉnh rồi Áp dụng
    if (pickTarget === 'both') {
      const existingInstallDay = parseDay(anchorInstallAt)
        || parseDay(installAt)
        || parseDay(datetimeLocalValueToIso(installAt) || '');
      setVcAt(ymdToLocal(ymd, 9));
      // Lấy hàng ≥ lắp: giữ ngày lắp nếu ≤ ngày lấy hàng vừa chọn
      if (existingInstallDay && compareYmd(existingInstallDay, ymd) <= 0) {
        setInstallAt(anchorInstallAt || installAt || ymdToLocal(existingInstallDay, 14));
        setInstallOccurrenceDates((prev) => {
          const kept = (prev.length ? prev : [existingInstallDay]).filter((d) => d <= ymd);
          return kept.length ? kept : [existingInstallDay];
        });
        const arriveDay = parseDay(anchorArriveAt) || existingInstallDay;
        setArriveAt(
          (arriveDay && compareYmd(arriveDay, existingInstallDay) >= 0 && compareYmd(arriveDay, ymd) <= 0)
            ? (anchorArriveAt || arriveAt || ymdToLocal(arriveDay, 11))
            : ymdToLocal(ymd, 11),
        );
      } else {
        setArriveAt(ymdToLocal(ymd, 11));
        setInstallAt(ymdToLocal(ymd, 14));
        setInstallOccurrenceDates([ymd]);
      }
      setCreateSxDelivery(true);
      setShowSchedule(true);
      return;
    }

    // Chọn VC tới nơi LĐ (≥ nhận hàng, ≤ lắp)
    if (pickTarget === 'arrive') {
      const vcDay = parseDay(anchorPickupAt)
        || parseDay(datetimeLocalValueToIso(anchorPickupAt) || '')
        || (anchorPickupAt && String(anchorPickupAt).match(/^(\d{4}-\d{2}-\d{2})/)?.[1])
        || null;
      if (!vcDay) {
        alert('Chọn ngày nhận hàng trước, rồi mới chọn VC tới nơi LĐ.');
        return;
      }
      if (compareYmd(ymd, vcDay) < 0) {
        alert(`VC tới nơi LĐ phải bằng hoặc sau ngày nhận hàng (${formatDayLabel(vcDay)}).`);
        return;
      }
      const installDay = parseDay(anchorInstallAt)
        || parseDay(installAt)
        || parseDay(datetimeLocalValueToIso(installAt) || '');
      if (installDay && compareYmd(ymd, installDay) > 0) {
        alert(`VC tới nơi LĐ phải bằng hoặc trước ngày lắp đặt (${formatDayLabel(installDay)}).`);
        return;
      }
      let hour = 11;
      let minute = 0;
      const prev = String(arriveAt || anchorArriveAt || '').match(/T(\d{2}):(\d{2})/);
      if (prev) {
        hour = Number(prev[1]);
        minute = Number(prev[2]);
      }
      setVcAt(anchorPickupAt || ymdToLocal(vcDay, 9));
      setArriveAt(ymdToLocal(ymd, hour, minute));
      setInstallAt(anchorInstallAt || installAt || ymdToLocal(installDay || ymd, 14));
      setShowSchedule(true);
    }
  };

  const applyPickedDatesToCard = () => {
    const installOnly = pickTarget === 'install';
    const arriveOnly = pickTarget === 'arrive';

    let nextInstall = installAt || '';
    let nextArrive = arriveAt || '';
    let nextPickup = vcAt || '';

    const occRaw = (installOccurrenceDates.length
      ? [...installOccurrenceDates]
      : (nextInstall ? [String(nextInstall).slice(0, 10)] : [])
    ).map((d) => String(d).slice(0, 10)).filter(Boolean).sort();

    if (installOnly) {
      if (!nextInstall && !occRaw.length) {
        alert('Chọn ngày lắp đặt trên lịch, rồi bấm Áp dụng ngày.');
        return;
      }
    } else if (arriveOnly) {
      if (!nextArrive) {
        alert('Chọn ngày VC tới nơi LĐ, rồi bấm Áp dụng ngày.');
        return;
      }
    } else if (!nextPickup && !nextInstall && !occRaw.length) {
      alert('Chọn ngày trên lịch, rồi bấm Áp dụng ngày.');
      return;
    }

    // Thiếu lấy hàng nhưng đã có lắp → mặc định 08:00 cùng ngày lắp
    if (!installOnly && !arriveOnly && !nextPickup && (nextInstall || occRaw[0])) {
      const day = occRaw[0] || String(nextInstall).slice(0, 10);
      nextPickup = `${day}T08:00`;
    }

    let vcDay = nextPickup
      ? (parseDay(datetimeLocalValueToIso(nextPickup) || nextPickup) || String(nextPickup).slice(0, 10) || null)
      : null;

    if (!nextInstall && (occRaw[0] || vcDay)) {
      nextInstall = ymdToLocal(occRaw[0] || vcDay, 14);
    }
    if (!nextArrive && vcDay) {
      nextArrive = ymdToLocal(vcDay, 11);
    }

    let occ = [...occRaw];
    if (!occ.length && nextInstall) occ = [String(nextInstall).slice(0, 10)];

    // Tự chỉnh lấy hàng >= ngày lắp đầu (không chặn nút bằng alert)
    const firstInstall = occ[0] || null;
    if (firstInstall && vcDay && compareYmd(vcDay, firstInstall) < 0 && !arriveOnly) {
      nextPickup = `${firstInstall}T${String(nextPickup || '').match(/T(\d{2}:\d{2})/)?.[1] || '08:00'}`;
      vcDay = firstInstall;
    }
    if (occ.length) {
      const hm = String(nextInstall || '').match(/T(\d{2}:\d{2})/)?.[1] || '14:00';
      nextInstall = `${occ[0]}T${hm}`;
    }

    if (installOnly && nextInstall && !nextPickup) {
      nextPickup = `${String(nextInstall).slice(0, 10)}T08:00`;
      vcDay = String(nextInstall).slice(0, 10);
    }

    // Đồng bộ «tới nơi» nằm giữa lấy hàng và lắp
    if (nextArrive && nextInstall) {
      const arriveDay = parseDay(datetimeLocalValueToIso(nextArrive) || nextArrive);
      const installDay = parseDay(datetimeLocalValueToIso(nextInstall) || nextInstall);
      if (vcDay && arriveDay && compareYmd(arriveDay, vcDay) < 0) {
        nextArrive = ymdToLocal(vcDay, 11);
      } else if (arriveDay && installDay && compareYmd(arriveDay, installDay) > 0) {
        nextArrive = ymdToLocal(installDay, 11);
      }
    } else if (!nextArrive && vcDay) {
      nextArrive = ymdToLocal(vcDay, 11);
    }

    const finalInstallDay = nextInstall
      ? (parseDay(datetimeLocalValueToIso(nextInstall) || nextInstall) || String(nextInstall).slice(0, 10))
      : null;
    const orderChk = assertPickupOnOrAfterInstall(finalInstallDay, vcDay);
    if (!orderChk.ok) {
      alert(orderChk.message);
      return;
    }

    try {
      if (typeof onPickDates === 'function') {
        onPickDates({
          pickupAt: nextPickup || undefined,
          installAt: nextInstall || undefined,
          vcArriveAt: nextArrive || undefined,
          installOccurrenceDates: occ,
        });
      } else if (typeof onPickDate === 'function') {
        onPickDate(
          installOnly ? (nextInstall || nextPickup)
            : arriveOnly ? nextArrive
              : (nextPickup || nextInstall),
        );
      } else {
        onClose?.();
      }
    } catch (err) {
      console.error('[VcHandoverEventsPopup] apply pick:', err);
      alert(err?.message || 'Không áp dụng được ngày đã chọn.');
      return;
    }
    setShowSchedule(false);
  };

  const postEvent = async (body) => {
    const payload = { ...body, status: 'planned' };
    if (leadId) payload.lead_id = leadId;
    if (projectId) payload.project_id = projectId;
    if (companyId) payload.company_id = companyId;
    await api.post('/events', payload);
  };

  const saveSchedule = async () => {
    if (pickMode) {
      applyPickedDatesToCard();
      return;
    }
    if (!vcAt) {
      alert('Chọn ngày nhận hàng / VC');
      return;
    }
    const vcIso = datetimeLocalValueToIso(vcAt);
    if (!vcIso) {
      alert('Ngày VC không hợp lệ');
      return;
    }
    const vcDay = parseDay(vcIso);
    const sxCount = sxCountByDay.get(vcDay) || 0;
    if (createSxDelivery && sxCount >= SX_BUSY_THRESHOLD) {
      const ok = window.confirm(
        `Ngày ${formatDayLabel(vcDay)} đã có ${sxCount} sự kiện Sản xuất (≥ ${SX_BUSY_THRESHOLD}).\n`
        + 'Vẫn tạo lịch giao hàng SX cùng ngày VC?',
      );
      if (!ok) return;
    }

    const occ = (installOccurrenceDates.length
      ? [...installOccurrenceDates]
      : (installAt ? [String(installAt).slice(0, 10)] : [])
    ).map((d) => String(d).slice(0, 10)).filter(Boolean).sort();
    if (occ.length && vcDay && compareYmd(vcDay, occ[0]) < 0) {
      alert('Ngày lấy hàng VC phải bằng hoặc sau ngày lắp đặt (có thể cùng ngày).');
      return;
    }

    let installIso = null;
    if (occ.length || installAt) {
      const hm = String(installAt || '').match(/T(\d{2}:\d{2})/)?.[1] || '14:00';
      const firstLocal = occ.length ? `${occ[0]}T${hm}` : installAt;
      installIso = datetimeLocalValueToIso(firstLocal);
      if (!installIso) {
        alert('Ngày lắp đặt không hợp lệ');
        return;
      }
    }
    const installDay = occ[0] || parseDay(installIso);
    const orderChk = assertPickupOnOrAfterInstall(installDay, vcDay);
    if (!orderChk.ok) {
      alert(orderChk.message);
      return;
    }
    const multiInstall = occ.length > 1;
    const sameDay = !multiInstall && !!(vcDay && installDay && vcDay === installDay);
    const pickupSlug = resolveTypeSlug(eventTypes, ['pickup', 'delivery']);
    const installSlug = resolveTypeSlug(eventTypes, ['installation', 'pickup']);
    const deliverySlug = resolveTypeSlug(eventTypes, ['delivery', 'pickup']);
    const noteLine = scheduleNotes.trim() ? `\n${scheduleNotes.trim()}` : '';

    setSavingSchedule(true);
    try {
      if (installIso && sameDay) {
        await postEvent({
          title: 'VC/LĐ: nhận hàng & lắp đặt',
          event_type: pickupSlug,
          module: 'logistics',
          start_time: vcIso,
          description: `Nhận hàng và lắp đặt cùng ngày.${noteLine}`,
        });
      } else {
        await postEvent({
          title: 'Nhận hàng / lấy hàng — VC/LĐ',
          event_type: pickupSlug,
          module: 'logistics',
          start_time: vcIso,
          description: noteLine || undefined,
        });
        if (installIso) {
          const hm = String(installAt || '').match(/T(\d{2}:\d{2})/)?.[1] || '14:00';
          const lastIso = occ.length > 1
            ? datetimeLocalValueToIso(`${occ[occ.length - 1]}T${hm}`)
            : null;
          await postEvent({
            title: 'Lắp đặt',
            event_type: installSlug,
            module: 'logistics',
            start_time: installIso,
            end_time: lastIso || undefined,
            occurrence_dates: occ.length ? occ : undefined,
            description: [
              noteLine || null,
              occ.length > 1 ? `Ngày lắp: ${occ.map((d) => d.split('-').reverse().join('/')).join(', ')}` : null,
            ].filter(Boolean).join('\n') || undefined,
          });
        }
      }

      // Ngày VC = ngày giao hàng cho Sản xuất
      if (createSxDelivery) {
        await postEvent({
          title: 'Giao hàng — Sản xuất',
          event_type: deliverySlug,
          module: 'production',
          start_time: vcIso,
          description: `Đồng bộ ngày nhận hàng VC/LĐ.${noteLine}`,
        });
      }

      setToast(
        installIso
          ? (sameDay
            ? 'Đã tạo sự kiện VC+lắp đặt (cùng ngày) và giao hàng SX'
            : 'Đã tạo sự kiện VC, lắp đặt và giao hàng SX')
          : 'Đã tạo sự kiện nhận hàng VC và giao hàng SX',
      );
      setShowSchedule(false);
      setScheduleNotes('');
      await load();
      if (vcDay) setSelectedDay(vcDay);
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || 'Không tạo được sự kiện');
    } finally {
      setSavingSchedule(false);
    }
  };

  const moveModule = async (ev, targetModule) => {
    const cur = String(ev.module || '').toLowerCase();
    if (cur === targetModule) return;
    const label = targetModule === 'production' ? 'Sản xuất' : 'VC/LĐ';
    if (targetModule === 'production') {
      const day = parseDay(ev.start_time);
      const sxCount = (sxCountByDay.get(day) || 0) + (cur === 'production' ? 0 : 1);
      if (sxCount >= SX_BUSY_THRESHOLD) {
        const ok = window.confirm(
          `Chuyển sang Sản xuất: ngày đó sẽ có khoảng ${sxCount} sự kiện SX.\nVẫn chuyển?`,
        );
        if (!ok) return;
      }
    }
    setBusyId(String(ev.id));
    try {
      await api.put(`/events/${ev.id}`, { module: targetModule });
      setToast(`Đã chuyển sự kiện sang khối ${label}`);
      await load();
    } catch (e) {
      setToast(e?.response?.data?.error || e?.message || 'Không chuyển được khối sự kiện');
    } finally {
      setBusyId('');
    }
  };

  const counts = useMemo(() => ({
    all: dealEvents.length,
    crm: dealEvents.filter((e) => String(e.module || '').toLowerCase() === 'crm').length,
    production: dealEvents.filter((e) => String(e.module || '').toLowerCase() === 'production').length,
    logistics: dealEvents.filter((e) => String(e.module || '').toLowerCase() === 'logistics').length,
  }), [dealEvents]);

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === cursor.year && today.getMonth() + 1 === cursor.month;

  return (
    <div className={embedded
      ? 'relative w-full h-full min-h-0 flex flex-col bg-white overflow-hidden'
      : 'fixed inset-0 z-[220] flex items-center justify-center p-3 sm:p-4'}
    >
      {!embedded && (
        <button type="button" className="absolute inset-0 bg-black/40" aria-label="Đóng" onClick={onClose} />
      )}
      <div className={embedded
        ? 'relative w-full h-full min-h-0 flex flex-col overflow-hidden'
        : 'relative w-full max-w-2xl max-h-[min(94vh,820px)] flex flex-col rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden'}
      >
        {/* Header — giống trang Sự kiện */}
        <div className={`flex items-center gap-2 px-4 py-3 border-b border-gray-100 shrink-0 ${
          embedded
            ? 'bg-gradient-to-r from-orange-50 via-white to-teal-50'
            : 'bg-gradient-to-r from-blue-50/70 via-white to-orange-50/50'
        }`}>
          <Calendar className={`h-4 w-4 ${embedded ? 'text-orange-600' : 'text-blue-600'}`} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gray-900">
              {pickMode ? 'Lịch sự kiện — chọn ngày' : 'Lịch sự kiện SX & VC/LĐ'}
            </p>
            <p className="text-[11px] text-gray-500 truncate">
              {pickMode
                ? (pickTarget === 'install'
                  ? 'Bấm một ngày → chọn lắp đặt ngay (không mở form)'
                  : pickTarget === 'pickup'
                    ? 'Bấm một ngày → chọn lấy hàng ngay (không mở form)'
                    : 'Bấm ngày để mở form chỉnh giờ lấy hàng + lắp')
                : (loading
                  ? 'Đang tải…'
                  : draftEvents.length
                    ? `${dealEvents.length} sự kiện deal · ${draftEvents.length} lịch tạm đề xuất`
                    : `${dealEvents.length} sự kiện deal · tháng này ${filteredCalendarEvents.length} mốc`)}
            </p>
          </div>
          {!embedded && (
            <button type="button" onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-gray-100 text-gray-600 inline-flex items-center justify-center">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="px-3 pt-2 flex flex-wrap gap-1 shrink-0">
          {(scheduleOnly
            ? [
              { id: 'all', label: 'Tất cả' },
              { id: 'production', label: `Sản xuất (${counts.production})` },
              { id: 'logistics', label: `VC/LĐ (${counts.logistics})` },
            ]
            : [
              { id: 'all', label: 'Tất cả' },
              { id: 'crm', label: `CRM (${counts.crm})` },
              { id: 'production', label: `Sản xuất (${counts.production})` },
              { id: 'logistics', label: `VC/LĐ (${counts.logistics})` },
            ]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setModuleTab(t.id)}
              className={`h-7 px-2.5 rounded-lg text-[11px] font-semibold border ${
                moduleTab === t.id
                  ? (t.id === 'crm'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : t.id === 'production'
                      ? 'bg-teal-600 text-white border-teal-600'
                      : t.id === 'logistics'
                        ? 'bg-orange-600 text-white border-orange-600'
                        : 'bg-slate-800 text-white border-slate-800')
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {(selectedSxBusy || selectedVcBusy || selectedInstallBusy) && (
          <div className="mx-3 mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 shrink-0 space-y-0.5">
            <p className="font-semibold">⚠️ Ngày {formatDayLabel(selectedDay)} đang dày lịch:</p>
            {selectedVcBusy && (
              <p>• Vận chuyển / nhận hàng VC: <strong>{selectedVcCount}</strong> (≥ {VC_BUSY_THRESHOLD})</p>
            )}
            {selectedSxBusy && (
              <p>• Giao hàng / sự kiện xưởng SX: <strong>{selectedSxCount}</strong> (≥ {SX_BUSY_THRESHOLD})</p>
            )}
            {selectedInstallBusy && (
              <p>• Lắp đặt: <strong>{selectedInstallCount}</strong> (≥ {INSTALL_BUSY_THRESHOLD})</p>
            )}
          </div>
        )}
        {toast ? (
          <div className="mx-3 mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] text-emerald-800 shrink-0">
            {toast}
          </div>
        ) : null}

        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Calendar — layout giống trang Sự kiện */}
          <div className="m-3 rounded-2xl border border-gray-200 shadow-sm overflow-hidden bg-white">
            <div className="flex items-center justify-between gap-3 px-3 py-2 bg-gradient-to-r from-blue-50/70 via-white to-blue-50/70 border-b border-gray-100">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  title="Tháng trước"
                  className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-600 hover:bg-white hover:text-blue-600"
                  onClick={() => setCursor((c) => {
                    const m = c.month - 1;
                    return m < 1 ? { year: c.year - 1, month: 12 } : { year: c.year, month: m };
                  })}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <h2 className="text-sm font-bold text-gray-900 px-1 tabular-nums">
                  {MONTH_NAMES[cursor.month]} {cursor.year}
                </h2>
                <button
                  type="button"
                  title="Tháng sau"
                  className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-600 hover:bg-white hover:text-blue-600"
                  onClick={() => setCursor((c) => {
                    const m = c.month + 1;
                    return m > 12 ? { year: c.year + 1, month: 1 } : { year: c.year, month: m };
                  })}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <span className="text-[11px] text-gray-500">{filteredCalendarEvents.length} sự kiện</span>
            </div>

            {loading ? (
              <div className="flex justify-center py-12 text-blue-500 gap-2 text-sm">
                <Loader2 className="h-5 w-5 animate-spin" /> Đang tải…
              </div>
            ) : err ? (
              <p className="text-sm text-red-600 py-8 text-center">{err}</p>
            ) : (
              <div className="p-2 sm:p-3">
                <div className="grid grid-cols-7 mb-1">
                  {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map((d, i) => (
                    <div key={d} className={`text-center text-[11px] font-bold py-1 uppercase tracking-wide ${i === 0 ? 'text-rose-500' : 'text-gray-500'}`}>
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {monthCells.map((day, i) => {
                    if (!day) {
                      return <div key={`e-${i}`} className="rounded-lg bg-gray-50/40 border border-dashed border-gray-100 min-h-[72px]" />;
                    }
                    const ymd = `${cursor.year}-${pad(cursor.month)}-${pad(day)}`;
                    const dayEvents = eventsByDayNum[day] || [];
                    const isTodayCell = isCurrentMonth && day === today.getDate();
                    const isSelected = ymd === selectedDay;
                    const isVcAnchor = !!(vcAnchorYmd && ymd === vcAnchorYmd);
                    const isInstallAnchor = !!(installAnchorYmd && ymd === installAnchorYmd);
                    const isWeekend = i % 7 === 0;
                    const sxBusy = (sxCountByDay.get(ymd) || 0) >= SX_BUSY_THRESHOLD;
                    const vcBusy = (vcCountByDay.get(ymd) || 0) >= VC_BUSY_THRESHOLD;
                    const installBusy = (installCountByDay.get(ymd) || 0) >= INSTALL_BUSY_THRESHOLD;
                    const dayBusy = pickMode
                      ? (pickTarget === 'install' ? installBusy : (vcBusy || sxBusy))
                      : (sxBusy || vcBusy || installBusy);
                    const cellBg = isSelected
                      ? ''
                      : isInstallAnchor && pickTarget !== 'pickup'
                        ? 'bg-teal-100/80'
                        : isVcAnchor && pickTarget !== 'install'
                          ? 'bg-sky-100/80'
                          : isVcAnchor
                            ? 'bg-gray-200/90'
                            : isTodayCell
                              ? 'bg-blue-50/40'
                              : dayBusy
                                ? 'bg-amber-50/50'
                                : 'bg-white';
                    const anchorTitle = isInstallAnchor && isVcAnchor
                      ? 'Ngày lắp + lấy hàng đã chọn'
                      : isInstallAnchor
                        ? 'Ngày lắp đặt đã chọn'
                        : isVcAnchor
                          ? 'Ngày nhận hàng VC đã chọn'
                          : null;
                    return (
                      <div
                        key={ymd}
                        role="presentation"
                        className={`group relative rounded-lg border flex flex-col overflow-hidden transition cursor-pointer min-h-[72px] ${
                          isSelected
                            ? 'ring-2 ring-blue-500 ring-offset-1 border-blue-300 shadow-md bg-white'
                            : isInstallAnchor && pickTarget !== 'pickup'
                              ? 'border-teal-400 border-dashed hover:border-teal-500'
                              : isVcAnchor
                                ? 'border-sky-400 border-dashed hover:border-sky-500'
                                : 'border-gray-200 hover:border-blue-300 hover:shadow-sm'
                        } ${cellBg}`}
                        title={
                          anchorTitle
                            || (dayBusy
                              ? `VC ${vcCountByDay.get(ymd) || 0} · SX ${sxCountByDay.get(ymd) || 0} · Lắp ${installCountByDay.get(ymd) || 0}`
                              : undefined)
                        }
                        onClick={() => applyPickedDay(ymd)}
                      >
                        <div className={`flex items-center justify-between px-1 py-0.5 border-b ${
                          isInstallAnchor && pickTarget !== 'pickup'
                            ? 'border-teal-200'
                            : isVcAnchor
                              ? 'border-sky-200'
                              : 'border-gray-100'
                        }`}>
                          <span
                            className={`text-[11px] font-bold w-5 h-5 inline-flex items-center justify-center rounded-full tabular-nums ${
                              isInstallAnchor && pickTarget !== 'pickup'
                                ? 'bg-teal-600 text-white'
                                : isVcAnchor
                                  ? 'bg-sky-600 text-white'
                                  : isTodayCell
                                    ? 'bg-blue-600 text-white'
                                    : isWeekend ? 'text-rose-600' : 'text-gray-800'
                            }`}
                          >
                            {day}
                          </span>
                          {isInstallAnchor && isVcAnchor ? (
                            <span className="text-[8px] font-bold uppercase tracking-wide text-teal-700 pr-0.5">L+VC</span>
                          ) : isInstallAnchor && pickTarget !== 'pickup' ? (
                            <span className="text-[8px] font-bold uppercase tracking-wide text-teal-700 pr-0.5">Lắp</span>
                          ) : isVcAnchor ? (
                            <span className="text-[8px] font-bold uppercase tracking-wide text-sky-700 pr-0.5">VC</span>
                          ) : (!pickMode || pickTarget === 'both') ? (
                            <button
                              type="button"
                              data-create-btn
                              title={pickMode ? `Chọn ngày ${day}` : `Tạo lịch ngày ${day}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                openScheduleForDay(ymd);
                              }}
                              className="w-5 h-5 inline-flex items-center justify-center rounded text-blue-600 hover:bg-blue-50 opacity-50 group-hover:opacity-100"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </div>
                        <div className="flex-1 min-h-0 p-0.5 space-y-0.5 overflow-hidden">
                          {(() => {
                            const drafts = dayEvents.filter((e) => e._draft);
                            const reals = dayEvents.filter((e) => !e._draft);
                            const shown = [...drafts, ...reals].slice(0, Math.max(3, Math.min(drafts.length + 1, 4)));
                            return (
                              <>
                                {shown.map((ev) => {
                            const t = typeInfo(ev);
                            const isDraft = !!ev._draft;
                            const isDeal = !isDraft && dealIds.has(String(ev.id));
                            const color = ev.color || t.color || '#3B82F6';
                            if (isDraft) {
                              return (
                                <div
                                  key={ev.id}
                                  className="w-full text-left text-[9px] leading-tight px-1 py-0.5 rounded truncate font-semibold border border-dashed"
                                  style={{
                                    backgroundColor: `${color}18`,
                                    color,
                                    borderColor: `${color}88`,
                                  }}
                                  title={`${ev.title} — ${formatTime(ev.start_time)} (đang chỉnh / chưa lưu)`}
                                >
                                  {t.icon} {ev.short_label || ev.title}
                                </div>
                              );
                            }
                            return (
                              <button
                                key={ev.id}
                                type="button"
                                className="w-full text-left text-[9px] leading-tight px-1 py-0.5 rounded truncate font-medium"
                                style={{
                                  backgroundColor: `${color}22`,
                                  color,
                                  outline: isDeal ? '1px solid currentColor' : undefined,
                                }}
                                title={`${ev.title} — ${formatTime(ev.start_time)}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditEvent(ev);
                                  setShowEdit(true);
                                }}
                              >
                                {t.icon} {ev.title}
                              </button>
                            );
                                })}
                                {dayEvents.length > shown.length && (
                                  <div className="text-[9px] font-semibold text-gray-500 px-1">+{dayEvents.length - shown.length}</div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Chi tiết ngày đã chọn */}
                <div className="mt-4 border-t pt-3">
                  <h3 className="text-sm font-bold text-gray-800 mb-2 flex flex-wrap items-center gap-2">
                    <span>📅 {formatDayLabel(selectedDay)}</span>
                    <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                      {selectedDayEvents.length} sự kiện
                    </span>
                    {selectedDayEvents.some((e) => e._draft) && (
                      <span className="text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                        {pickMode ? 'Lịch tạm theo form đang sửa' : 'Có lịch tạm (chưa tạo)'}
                      </span>
                    )}
                  </h3>
                  {selectedDayEvents.length === 0 ? (
                    <p className="text-sm text-gray-400 py-4 text-center border border-dashed border-gray-200 rounded-xl bg-gray-50">
                      {pickMode
                        ? 'Bấm một ô ngày trên lịch để chọn — lịch tạm SX/VC/Lắp sẽ hiện trên ô ngày.'
                        : 'Không có sự kiện trong ngày này — bấm + trên ô ngày để tạo lịch nhận hàng & lắp đặt.'}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {selectedDayEvents.map((ev) => {
                        const t = typeInfo(ev);
                        const badge = moduleBadge(ev.module);
                        const BadgeIcon = badge.Icon;
                        const curMod = String(ev.module || '').toLowerCase();
                        const isDraft = !!ev._draft;
                        const isDeal = !isDraft && dealIds.has(String(ev.id));
                        const color = ev.color || t.color || '#3B82F6';
                        return (
                          <div
                            key={ev.id}
                            className={`rounded-xl border px-3 py-2.5 ${
                              isDraft
                                ? 'border-dashed border-amber-300 bg-amber-50/50'
                                : isDeal ? 'border-orange-100 bg-orange-50/40' : 'border-gray-100 bg-gray-50/80'
                            }`}
                          >
                            <button
                              type="button"
                              className="w-full text-left"
                              disabled={isDraft}
                              onClick={() => {
                                if (isDraft) return;
                                setEditEvent(ev);
                                setShowEdit(true);
                              }}
                            >
                              <div className="flex items-start gap-2">
                                <span
                                  className="h-9 w-9 rounded-lg flex items-center justify-center text-base shrink-0"
                                  style={{ backgroundColor: `${color}22` }}
                                >
                                  {t.icon || '📋'}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded ${badge.cls}`}>
                                      <BadgeIcon className="h-2.5 w-2.5" /> {badge.label}
                                    </span>
                                    {isDraft && (
                                      <span className="text-[9px] font-bold uppercase tracking-wide text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                                        Tạm
                                      </span>
                                    )}
                                    {isDeal && <span className="text-[9px] font-semibold text-emerald-700">Deal này</span>}
                                    <span className="text-[10px] font-semibold text-gray-500">{t.name || ev.event_type}</span>
                                  </div>
                                  <p className="text-sm font-bold text-gray-900 truncate">{ev.title}</p>
                                  <p className="text-[11px] text-gray-600 mt-0.5">
                                    {formatTime(ev.start_time)}
                                    {isDraft
                                      ? ' · Chưa tạo trên lịch (sau khi VC/LĐ xác nhận)'
                                      : (ev.status ? ` · ${STATUS_LABEL[ev.status] || ev.status}` : '')}
                                  </p>
                                </div>
                              </div>
                            </button>
                            {isDeal && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {curMod !== 'logistics' && (
                                  <button
                                    type="button"
                                    disabled={busyId === String(ev.id)}
                                    onClick={() => moveModule(ev, 'logistics')}
                                    className="h-7 px-2 rounded-md border border-orange-200 bg-white text-[10px] font-semibold text-orange-800 inline-flex items-center gap-1 hover:bg-orange-50 disabled:opacity-50"
                                  >
                                    {busyId === String(ev.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowLeftRight className="h-3 w-3" />}
                                    → VC/LĐ
                                  </button>
                                )}
                                {curMod !== 'production' && (
                                  <button
                                    type="button"
                                    disabled={busyId === String(ev.id)}
                                    onClick={() => moveModule(ev, 'production')}
                                    className="h-7 px-2 rounded-md border border-violet-200 bg-white text-[10px] font-semibold text-violet-800 inline-flex items-center gap-1 hover:bg-violet-50 disabled:opacity-50"
                                  >
                                    {busyId === String(ev.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowLeftRight className="h-3 w-3" />}
                                    → SX
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Form chọn ngày — portal lên body, trên modal cha (z-200) để không bị overflow/đè */}
      {showSchedule && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[260] flex items-center justify-center p-3 sm:p-5">
          <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" aria-label="Đóng" onClick={() => setShowSchedule(false)} />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-orange-100 overflow-hidden max-h-[min(92vh,720px)] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-orange-100 bg-orange-50/80 shrink-0">
              <Truck className="h-4 w-4 text-orange-600" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-orange-900">
                  {pickMode ? 'Xác nhận ngày nhận hàng & lắp đặt' : 'Tạo lịch nhận hàng & lắp đặt'}
                </p>
                <p className="text-[11px] text-orange-700/80">
                  {pickMode
                    ? (pickTarget === 'install'
                      ? 'Áp dụng ngày lắp đặt vào form kế hoạch'
                      : pickTarget === 'pickup'
                        ? 'Áp dụng ngày lấy hàng vào form kế hoạch'
                        : 'Áp dụng vào form · lấy hàng ≥ ngày lắp')
                    : 'Ngày VC đồng thời là ngày giao hàng SX'}
                </p>
              </div>
              <button type="button" onClick={() => setShowSchedule(false)} className="h-8 w-8 rounded-lg hover:bg-orange-100 inline-flex items-center justify-center">
                <X className="h-4 w-4 text-orange-800" />
              </button>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto flex-1 min-h-0">
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">
                  Ngày / giờ nhận hàng (lấy hàng)
                </label>
                <input
                  type="datetime-local"
                  value={vcAt}
                  disabled={pickMode && (pickTarget === 'install' || pickTarget === 'arrive')}
                  onChange={(e) => {
                    const next = e.target.value;
                    setVcAt(next);
                    const nextDay = parseDay(datetimeLocalValueToIso(next) || next);
                    const installDay = parseDay(datetimeLocalValueToIso(installAt) || installAt);
                    const arriveDay = parseDay(datetimeLocalValueToIso(arriveAt) || arriveAt);
                    // Lấy hàng ≥ lắp: nếu chọn lấy hàng trước ngày lắp → kéo lấy hàng = ngày lắp
                    if (nextDay && installDay && compareYmd(nextDay, installDay) < 0) {
                      const hm = String(next).match(/T(\d{2}:\d{2})/)?.[1] || '08:00';
                      setVcAt(`${installDay}T${hm}`);
                      return;
                    }
                    // Chưa có lắp → mặc định lắp + tới nơi cùng ngày lấy hàng
                    if (!installAt || !installDay) {
                      if (nextDay) {
                        setInstallAt(ymdToLocal(nextDay, 14));
                        setInstallOccurrenceDates([nextDay]);
                      }
                    }
                    if (!arriveAt || !arriveDay || arriveDay === parseDay(datetimeLocalValueToIso(vcAt) || vcAt)) {
                      if (nextDay) setArriveAt(ymdToLocal(nextDay, 11));
                    } else if (nextDay && arriveDay && compareYmd(arriveDay, nextDay) < 0) {
                      setArriveAt(ymdToLocal(nextDay, 11));
                    }
                  }}
                  className="w-full h-10 px-3 rounded-lg border border-orange-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:bg-gray-50 disabled:text-gray-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">
                  VC tới nơi LĐ
                  <span className="font-normal text-gray-400"> (xe tới địa điểm lắp)</span>
                </label>
                <input
                  type="datetime-local"
                  value={arriveAt}
                  disabled={pickMode && pickTarget === 'install'}
                  onChange={(e) => setArriveAt(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-sky-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:bg-gray-50 disabled:text-gray-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">
                  Ngày lắp đặt (nhiều ngày)
                  <span className="font-normal text-gray-400"> — liên tiếp hoặc cách ngày</span>
                </label>
                <p className="text-[10px] text-gray-500 mb-1.5">
                  Bấm chọn từng ngày (≥ nhận hàng). Có thể 3 ngày liền hoặc 1, 3, 5…
                </p>
                <MultiDayDatePicker
                  selectedYmds={installOccurrenceDates}
                  onChange={applyInstallOcc}
                  anchorYmd={installOccurrenceDates[0] || String(installAt || vcAt || '').slice(0, 10)}
                  hint="Chọn một hoặc nhiều ngày lắp (liên tiếp hoặc ngắt quãng). Lấy hàng VC ≥ ngày lắp đầu."
                />
                {(installOccurrenceDates.length || installAt) ? (
                  <label className="mt-2 flex items-center gap-2 text-[11px] text-gray-600">
                    <span className="shrink-0 font-semibold">Giờ lắp (mỗi ngày)</span>
                    <input
                      type="time"
                      value={String(installAt || '').match(/T(\d{2}:\d{2})/)?.[1] || '14:00'}
                      onChange={(e) => {
                        const hhmm = e.target.value || '14:00';
                        const dates = installOccurrenceDates.length
                          ? installOccurrenceDates
                          : [String(installAt || vcAt || '').slice(0, 10)].filter(Boolean);
                        if (!dates.length) return;
                        setInstallAt(`${dates[0]}T${hhmm}`);
                      }}
                      className="h-8 px-2 border border-gray-200 rounded-md bg-white"
                    />
                  </label>
                ) : null}
                {pickMode && (
                  <p className="mt-1 text-[10px] text-gray-500">
                    Lấy hàng ≥ ngày lắp · VC tới nơi nằm giữa lấy hàng và ngày lắp đầu.
                  </p>
                )}
                {(installOccurrenceDates.length || installAt) && !pickMode && (
                  <button
                    type="button"
                    className="mt-1 text-[11px] text-gray-500 hover:text-red-600"
                    onClick={() => { setInstallAt(''); setInstallOccurrenceDates([]); }}
                  >
                    Bỏ ngày lắp đặt
                  </button>
                )}
              </div>
              {!pickMode && (
              <label className="flex items-start gap-2 rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createSxDelivery}
                  onChange={(e) => setCreateSxDelivery(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-[11px] text-violet-900">
                  <strong>Tạo sự kiện giao hàng SX</strong> cùng ngày nhận hàng VC
                  <span className="block text-violet-700/80 mt-0.5">
                    Ngày VC = ngày xưởng giao hàng / lấy hàng cho sản xuất.
                  </span>
                </span>
              </label>
              )}
              {!pickMode && (
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Ghi chú</label>
                <textarea
                  value={scheduleNotes}
                  onChange={(e) => setScheduleNotes(e.target.value)}
                  rows={2}
                  placeholder="Ghi chú lịch giao nhận…"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none"
                />
              </div>
              )}
            </div>
              <div className="flex gap-2 p-4 pt-2 border-t border-orange-100 bg-white shrink-0">
                <button
                  type="button"
                  onClick={() => setShowSchedule(false)}
                  className="flex-1 h-10 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Huỷ
                </button>
                <button
                  type="button"
                  disabled={savingSchedule && !pickMode}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (pickMode) {
                      applyPickedDatesToCard();
                      return;
                    }
                    void saveSchedule();
                  }}
                  className="flex-1 h-10 rounded-lg bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                >
                  {savingSchedule && !pickMode ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {pickMode ? 'Áp dụng ngày' : 'Tạo sự kiện'}
                </button>
              </div>
          </div>
        </div>,
        document.body,
      )}

      {showEdit && (
        <EventCreateModal
          event={editEvent}
          eventTypes={eventTypes}
          users={users}
          defaultCompanyId={companyId || ''}
          defaultModule={String(editEvent?.module || 'logistics') === 'production' ? 'production' : 'logistics'}
          allowedModules={['production', 'logistics']}
          allowGeneralModule={false}
          defaultLeadId={leadId || ''}
          lockLead={!!leadId}
          onClose={() => { setShowEdit(false); setEditEvent(null); }}
          onSaved={() => {
            setShowEdit(false);
            setEditEvent(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
