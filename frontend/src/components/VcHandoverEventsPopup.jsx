/**
 * Popup lịch sự kiện gắn deal — UI giống trang Sự kiện;
 * tạo đồng thời ngày VC + lắp đặt; ngày VC = giao hàng SX.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
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

const SX_BUSY_THRESHOLD = 4;
const VC_BUSY_THRESHOLD = 4;
const INSTALL_BUSY_THRESHOLD = 4;

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

/** Quy định: ngày lắp đặt phải = hoặc sau ngày VC */
function assertInstallOnOrAfterVc(vcYmd, installYmd) {
  if (!vcYmd || !installYmd) return { ok: true };
  if (compareYmd(installYmd, vcYmd) >= 0) return { ok: true };
  return {
    ok: false,
    message:
      `Ngày lắp đặt (${formatDayLabel(installYmd)}) phải bằng hoặc sau ngày nhận hàng VC `
      + `(${formatDayLabel(vcYmd)}).`,
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
  site_visit: { name: 'Khảo sát', icon: '📍', color: '#3b82f6' },
  video_shoot: { name: 'Đi quay hình', icon: '🎥', color: '#7C3AED' },
};

const STATUS_LABEL = {
  planned: 'Đã lên lịch',
  confirmed: 'Đã xác nhận',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
  in_progress: 'Đang diễn ra',
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
 *  pickMode?: boolean,
 *  pickTarget?: 'pickup'|'arrive'|'install'|'both',
 *  anchorPickupAt?: string|null,
 *  anchorArriveAt?: string|null,
 *  anchorInstallAt?: string|null,
 *  onPickDate?: (datetimeLocal: string) => void,
 *  onPickDates?: (dates: { pickupAt: string, installAt: string, vcArriveAt?: string }) => void,
 *  onClose: () => void,
 * }} props
 */
export default function VcHandoverEventsPopup({
  leadId = null,
  projectId = null,
  companyId = null,
  eventIds = [],
  focusDate = null,
  pickMode = false,
  pickTarget = 'both',
  anchorPickupAt = null,
  anchorArriveAt = null,
  anchorInstallAt = null,
  onPickDate = null,
  onPickDates = null,
  onClose,
}) {
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
  const [scheduleNotes, setScheduleNotes] = useState('');
  const [createSxDelivery, setCreateSxDelivery] = useState(true);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const idList = useMemo(
    () => [...new Set((eventIds || []).filter(Boolean).map(String))],
    [eventIds],
  );

  const loadDeal = useCallback(async () => {
    const byId = new Map();
    const fetches = [];
    const base = {
      modules: 'production,logistics',
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
      const mod = String(e.module || '').toLowerCase();
      return !mod || mod === 'production' || mod === 'logistics' || mod === 'general'
        || String(e.event_type || '') === 'installation'
        || String(e.event_type || '') === 'pickup'
        || String(e.event_type || '') === 'delivery';
    });
    list.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    setDealEvents(list);
  }, [leadId, projectId, idList]);

  const loadMonth = useCallback(async () => {
    const params = {
      month: cursor.month,
      year: cursor.year,
      modules: 'production,logistics',
    };
    try {
      const { data } = await api.get('/events/calendar', { params });
      const list = Array.isArray(data) ? data : (data?.events || []);
      setMonthEvents(Array.isArray(list) ? list : []);
    } catch {
      try {
        const lastDay = new Date(cursor.year, cursor.month, 0).getDate();
        const from = `${cursor.year}-${pad(cursor.month)}-01`;
        const to = `${cursor.year}-${pad(cursor.month)}-${pad(lastDay)}`;
        const { data } = await api.get('/events', {
          params: {
            modules: 'production,logistics',
            date_from: from,
            date_to: to,
            limit: 300,
            include_as_participant: '1',
          },
        });
        setMonthEvents(Array.isArray(data?.events) ? data.events : []);
      } catch {
        setMonthEvents([]);
      }
    }
  }, [cursor.month, cursor.year]);

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
  }, [anchorPickupAt, anchorInstallAt]);

  const calendarEvents = useMemo(() => {
    const byId = new Map();
    for (const e of monthEvents) if (e?.id) byId.set(String(e.id), e);
    for (const e of dealEvents) if (e?.id) byId.set(String(e.id), e);
    return [...byId.values()];
  }, [monthEvents, dealEvents]);

  /** 3 sự kiện tạm (chưa lưu DB) — hiện trên lịch khi đang chọn ngày / chờ xác nhận. */
  const draftEvents = useMemo(() => {
    const hasRealHandoverEvents = idList.length > 0;
    if (hasRealHandoverEvents && !pickMode) return [];

    const pickupIso = toPreviewIso(vcAt) || toPreviewIso(anchorPickupAt);
    const arriveIso = toPreviewIso(arriveAt) || toPreviewIso(anchorArriveAt) || pickupIso;
    const installIso = toPreviewIso(installAt) || toPreviewIso(anchorInstallAt) || arriveIso || pickupIso;
    if (!pickupIso) return [];

    const pickupDay = parseDay(pickupIso);
    const installDay = parseDay(installIso);
    const sameDay = !!(pickupDay && installDay && pickupDay === installDay);

    const drafts = [
      {
        id: '__draft_sx_delivery__',
        _draft: true,
        module: 'production',
        event_type: 'delivery',
        title: 'Giao hàng xưởng (tạm)',
        short_label: 'SX tạm',
        start_time: pickupIso,
        status: 'planned',
        color: '#7c3aed',
      },
      {
        id: '__draft_vc_pickup__',
        _draft: true,
        module: 'logistics',
        event_type: 'pickup',
        title: 'VC tới nơi LĐ (tạm)',
        short_label: 'VC tạm',
        start_time: arriveIso || pickupIso,
        status: 'planned',
        color: '#ea580c',
      },
      {
        id: '__draft_install__',
        _draft: true,
        module: 'logistics',
        event_type: 'installation',
        title: sameDay ? 'Lắp đặt (tạm · cùng ngày VC)' : 'Lắp đặt (tạm)',
        short_label: 'Lắp tạm',
        start_time: installIso || pickupIso,
        status: 'planned',
        color: '#d97706',
      },
    ];
    return drafts;
  }, [vcAt, arriveAt, installAt, anchorPickupAt, anchorArriveAt, anchorInstallAt, idList, pickMode]);

  const filteredCalendarEvents = useMemo(() => {
    const base = moduleTab === 'all'
      ? calendarEvents
      : calendarEvents.filter((e) => String(e.module || '').toLowerCase() === moduleTab);
    const drafts = moduleTab === 'all'
      ? draftEvents
      : draftEvents.filter((e) => String(e.module || '').toLowerCase() === moduleTab);
    return [...base, ...drafts];
  }, [calendarEvents, draftEvents, moduleTab]);

  const eventsByDayNum = useMemo(() => {
    const map = {};
    const { year, month } = cursor;
    for (const ev of filteredCalendarEvents) {
      if (String(ev.status || '') === 'cancelled') continue;
      const ymd = parseDay(ev.start_time);
      if (!ymd) continue;
      const [y, m, d] = ymd.split('-').map(Number);
      if (y !== year || m !== month) continue;
      if (!map[d]) map[d] = [];
      map[d].push(ev);
    }
    return map;
  }, [filteredCalendarEvents, cursor]);

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
      const day = parseDay(ev.start_time);
      if (!day) continue;
      map.set(day, (map.get(day) || 0) + 1);
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

  const openScheduleForDay = (ymd) => {
    setSelectedDay(ymd);
    setVcAt(ymdToLocal(ymd, 9));
    setArriveAt(ymdToLocal(ymd, 11));
    setInstallAt(ymdToLocal(ymd, 14));
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

    // Chọn ngày VC → mở form giờ VC + tới nơi + lắp (mặc định cùng ngày), có thể chỉnh rồi Áp dụng
    if (pickTarget === 'pickup' || pickTarget === 'both') {
      if (!confirmBusyVcDay(ymd)) return;
      const existingInstallDay = parseDay(anchorInstallAt)
        || parseDay(installAt)
        || parseDay(datetimeLocalValueToIso(installAt) || '');
      setVcAt(ymdToLocal(ymd, 9));
      if (existingInstallDay && compareYmd(existingInstallDay, ymd) >= 0) {
        setInstallAt(anchorInstallAt || installAt || ymdToLocal(existingInstallDay, 14));
        const arriveDay = parseDay(anchorArriveAt) || existingInstallDay;
        setArriveAt(
          (arriveDay && compareYmd(arriveDay, ymd) >= 0 && compareYmd(arriveDay, existingInstallDay) <= 0)
            ? (anchorArriveAt || arriveAt || ymdToLocal(arriveDay, 11))
            : ymdToLocal(ymd, 11),
        );
      } else {
        setArriveAt(ymdToLocal(ymd, 11));
        setInstallAt(ymdToLocal(ymd, 14));
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
      return;
    }

    // Chọn lại ngày lắp đặt (≥ VC)
    if (pickTarget === 'install') {
      const vcDay = parseDay(anchorPickupAt)
        || parseDay(datetimeLocalValueToIso(anchorPickupAt) || '')
        || (anchorPickupAt && String(anchorPickupAt).match(/^(\d{4}-\d{2}-\d{2})/)?.[1])
        || null;
      if (!vcDay) {
        alert('Chọn ngày nhận hàng VC trước, rồi mới chọn ngày lắp đặt.');
        return;
      }
      const chk = assertInstallOnOrAfterVc(vcDay, ymd);
      if (!chk.ok) {
        alert(chk.message);
        return;
      }
      if (!confirmBusyInstallDay(ymd)) return;
      // Giữ giờ lắp đang có (nếu có), không thì 14:00
      let hour = 14;
      let minute = 0;
      const prev = String(installAt || '').match(/T(\d{2}):(\d{2})/);
      if (prev) {
        hour = Number(prev[1]);
        minute = Number(prev[2]);
      }
      setVcAt(anchorPickupAt || ymdToLocal(vcDay, 9));
      setInstallAt(ymdToLocal(ymd, hour, minute));
      const arriveDay = parseDay(arriveAt) || parseDay(anchorArriveAt);
      if (!arriveDay || compareYmd(arriveDay, ymd) > 0) {
        setArriveAt(ymdToLocal(ymd, 11));
      } else {
        setArriveAt(anchorArriveAt || arriveAt || ymdToLocal(arriveDay, 11));
      }
      setShowSchedule(true);
    }
  };

  const applyPickedDatesToCard = () => {
    if (!vcAt) {
      alert('Chọn ngày nhận hàng / VC');
      return;
    }
    const vcDay = parseDay(datetimeLocalValueToIso(vcAt) || vcAt);
    if (pickTarget !== 'install' && pickTarget !== 'arrive' && !confirmBusyVcDay(vcDay)) return;
    let nextInstall = installAt || '';
    if (!nextInstall && vcDay) nextInstall = ymdToLocal(vcDay, 14);
    let nextArrive = arriveAt || '';
    if (!nextArrive && vcDay) nextArrive = ymdToLocal(vcDay, 11);
    if (nextInstall) {
      const installDay = parseDay(datetimeLocalValueToIso(nextInstall) || nextInstall);
      const chk = assertInstallOnOrAfterVc(vcDay, installDay);
      if (!chk.ok) {
        alert(chk.message);
        return;
      }
      if (pickTarget === 'install' || pickTarget === 'both' || pickTarget === 'pickup') {
        if (!confirmBusyInstallDay(installDay)) return;
      }
    }
    if (nextArrive) {
      const arriveDay = parseDay(datetimeLocalValueToIso(nextArrive) || nextArrive);
      if (arriveDay && vcDay && compareYmd(arriveDay, vcDay) < 0) {
        alert('VC tới nơi LĐ phải bằng hoặc sau ngày nhận hàng.');
        return;
      }
      if (nextInstall) {
        const installDay = parseDay(datetimeLocalValueToIso(nextInstall) || nextInstall);
        if (arriveDay && installDay && compareYmd(arriveDay, installDay) > 0) {
          alert('VC tới nơi LĐ phải bằng hoặc trước ngày lắp đặt.');
          return;
        }
      }
    }
    if (typeof onPickDates === 'function') {
      onPickDates({ pickupAt: vcAt, installAt: nextInstall, vcArriveAt: nextArrive });
      return;
    }
    if (typeof onPickDate === 'function') {
      onPickDate(
        pickTarget === 'install' ? nextInstall
          : pickTarget === 'arrive' ? nextArrive
            : vcAt,
      );
      return;
    }
    onClose?.();
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

    let installIso = null;
    if (installAt) {
      installIso = datetimeLocalValueToIso(installAt);
      if (!installIso) {
        alert('Ngày lắp đặt không hợp lệ');
        return;
      }
    }

    const installDay = installIso ? parseDay(installIso) : null;
    const orderChk = assertInstallOnOrAfterVc(vcDay, installDay);
    if (!orderChk.ok) {
      alert(orderChk.message);
      return;
    }
    const sameDay = !!(vcDay && installDay && vcDay === installDay);
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
          await postEvent({
            title: 'Lắp đặt',
            event_type: installSlug,
            module: 'logistics',
            start_time: installIso,
            description: noteLine || undefined,
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
    production: dealEvents.filter((e) => String(e.module || '').toLowerCase() === 'production').length,
    logistics: dealEvents.filter((e) => String(e.module || '').toLowerCase() === 'logistics').length,
  }), [dealEvents]);

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === cursor.year && today.getMonth() + 1 === cursor.month;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Đóng" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[min(94vh,820px)] flex flex-col rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden">
        {/* Header — giống trang Sự kiện */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-blue-50/70 via-white to-orange-50/50 shrink-0">
          <Calendar className="h-4 w-4 text-blue-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gray-900">
              {pickMode ? 'Chọn ngày trên lịch' : 'Lịch sự kiện SX & VC/LĐ'}
            </p>
            <p className="text-[11px] text-gray-500 truncate">
              {pickMode
                ? (pickTarget === 'install'
                  ? 'Ngày xám = ngày VC đã chọn · bấm ngày ≥ VC để chọn lắp đặt · khung đứt = lịch tạm'
                  : pickTarget === 'pickup'
                    ? 'Bấm một ngày — lịch tạm SX/VC/Lắp hiện trên ô ngày (chưa tạo)'
                    : 'Bấm ngày hoặc + để chọn — lịch tạm SX/VC/Lắp hiện trên lịch')
                : (loading
                  ? 'Đang tải…'
                  : draftEvents.length
                    ? `${dealEvents.length} sự kiện deal · ${draftEvents.length} lịch tạm đề xuất`
                    : `${dealEvents.length} sự kiện deal · tháng này ${filteredCalendarEvents.length} mốc`)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-gray-100 text-gray-600 inline-flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-3 pt-2 flex gap-1 shrink-0">
          {[
            { id: 'all', label: `Tất cả` },
            { id: 'production', label: `SX (${counts.production})` },
            { id: 'logistics', label: `VC/LĐ (${counts.logistics})` },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setModuleTab(t.id)}
              className={`h-7 px-2.5 rounded-lg text-[11px] font-semibold border ${
                moduleTab === t.id
                  ? 'bg-blue-600 text-white border-blue-600'
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
                    const isWeekend = i % 7 === 0;
                    const sxBusy = (sxCountByDay.get(ymd) || 0) >= SX_BUSY_THRESHOLD;
                    const vcBusy = (vcCountByDay.get(ymd) || 0) >= VC_BUSY_THRESHOLD;
                    const installBusy = (installCountByDay.get(ymd) || 0) >= INSTALL_BUSY_THRESHOLD;
                    const dayBusy = pickMode
                      ? (pickTarget === 'install' ? installBusy : (vcBusy || sxBusy))
                      : (sxBusy || vcBusy || installBusy);
                    const cellBg = isSelected
                      ? ''
                      : isVcAnchor
                        ? 'bg-gray-200/90'
                        : isTodayCell
                          ? 'bg-blue-50/40'
                          : dayBusy
                            ? 'bg-amber-50/50'
                            : 'bg-white';
                    return (
                      <div
                        key={ymd}
                        role="presentation"
                        className={`group relative rounded-lg border flex flex-col overflow-hidden transition cursor-pointer min-h-[72px] ${
                          isSelected
                            ? 'ring-2 ring-blue-500 ring-offset-1 border-blue-300 shadow-md bg-white'
                            : isVcAnchor
                              ? 'border-gray-400 border-dashed hover:border-gray-500'
                              : 'border-gray-200 hover:border-blue-300 hover:shadow-sm'
                        } ${cellBg}`}
                        title={
                          isVcAnchor
                            ? 'Ngày nhận hàng VC đã chọn'
                            : dayBusy
                              ? `VC ${vcCountByDay.get(ymd) || 0} · SX ${sxCountByDay.get(ymd) || 0} · Lắp ${installCountByDay.get(ymd) || 0}`
                              : undefined
                        }
                        onClick={() => applyPickedDay(ymd)}
                      >
                        <div className={`flex items-center justify-between px-1 py-0.5 border-b ${isVcAnchor ? 'border-gray-300' : 'border-gray-100'}`}>
                          <span
                            className={`text-[11px] font-bold w-5 h-5 inline-flex items-center justify-center rounded-full tabular-nums ${
                              isVcAnchor
                                ? 'bg-gray-500 text-white'
                                : isTodayCell
                                  ? 'bg-blue-600 text-white'
                                  : isWeekend ? 'text-rose-600' : 'text-gray-800'
                            }`}
                          >
                            {day}
                          </span>
                          {isVcAnchor ? (
                            <span className="text-[8px] font-bold uppercase tracking-wide text-gray-600 pr-0.5">VC</span>
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
                          {dayEvents.slice(0, 3).map((ev) => {
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
                                  title={`${ev.title} — ${formatTime(ev.start_time)} (chưa tạo trên lịch)`}
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
                          {dayEvents.length > 3 && (
                            <div className="text-[9px] font-semibold text-gray-500 px-1">+{dayEvents.length - 3}</div>
                          )}
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
                        Có lịch tạm (chưa tạo)
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

      {/* Form chọn ngày VC + lắp đặt */}
      {showSchedule && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-3">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Đóng" onClick={() => setShowSchedule(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl border border-orange-100 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-orange-100 bg-orange-50/80">
              <Truck className="h-4 w-4 text-orange-600" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-orange-900">
                  {pickMode ? 'Xác nhận ngày nhận hàng & lắp đặt' : 'Tạo lịch nhận hàng & lắp đặt'}
                </p>
                <p className="text-[11px] text-orange-700/80">
                  {pickMode
                    ? 'Áp dụng vào thẻ bàn giao · lắp đặt ≥ ngày VC'
                    : 'Ngày VC đồng thời là ngày giao hàng SX'}
                </p>
              </div>
              <button type="button" onClick={() => setShowSchedule(false)} className="h-8 w-8 rounded-lg hover:bg-orange-100 inline-flex items-center justify-center">
                <X className="h-4 w-4 text-orange-800" />
              </button>
            </div>
            <div className="p-4 space-y-3">
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
                    // Mặc định: tới nơi 11:00 + lắp 14:00 cùng ngày VC nếu chưa có / đang cùng ngày cũ
                    if (!installAt || !installDay || installDay === parseDay(datetimeLocalValueToIso(vcAt) || vcAt)) {
                      if (nextDay) setInstallAt(ymdToLocal(nextDay, 14));
                    } else if (nextDay && installDay && compareYmd(installDay, nextDay) < 0) {
                      setInstallAt(ymdToLocal(nextDay, 14));
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
                  Ngày / giờ lắp đặt
                  <span className="font-normal text-gray-400"> (mặc định cùng ngày VC — có thể đổi)</span>
                </label>
                <input
                  type="datetime-local"
                  value={installAt}
                  onChange={(e) => setInstallAt(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                {pickMode && (
                  <p className="mt-1 text-[10px] text-gray-500">
                    Lắp ≥ nhận hàng · VC tới nơi nằm giữa hai mốc. Có thể chọn lại từ thẻ bàn giao.
                  </p>
                )}
                {installAt && !pickMode && (
                  <button
                    type="button"
                    className="mt-1 text-[11px] text-gray-500 hover:text-red-600"
                    onClick={() => setInstallAt('')}
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
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowSchedule(false)}
                  className="flex-1 h-10 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Huỷ
                </button>
                <button
                  type="button"
                  disabled={savingSchedule}
                  onClick={() => void saveSchedule()}
                  className="flex-1 h-10 rounded-lg bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                >
                  {savingSchedule ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {pickMode ? 'Áp dụng ngày' : 'Tạo sự kiện'}
                </button>
              </div>
            </div>
          </div>
        </div>
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
