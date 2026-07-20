import { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  isAdminLike,
  isCompanyScopedAdmin,
  isSystemAdmin as checkSystemAdmin,
  isProductionAdmin,
  isLogisticsAdmin,
} from '../lib/adminRole';
import { getStoredCrmFilterCompanyId } from '../lib/crmCompanyFilter';
import { formatDate } from '../lib/utils';
import {
  Calendar, List, Plus, Search, Filter, MapPin, Clock, Users, MessageSquare,
  Check, X, ChevronLeft, ChevronRight, Settings, Trash2, Edit3, Send, CheckCircle2,
  XCircle, AlertCircle, Loader2, Building2, Ban, BarChart3, Table2, FileSpreadsheet,
  CalendarRange,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import DateRangePickerPopover from '../components/DateRangePickerPopover';
import EventCreateModal, { EVENT_MODULE_OPTIONS } from '../components/EventCreateModal';

import ScopeFilterBar from '../shared/components/ScopeFilterBar';
import { useScopeFilter } from '../shared/hooks/useScopeFilter';
import { useModuleAccess } from '../shared/context/ModuleAccessContext';

export { EVENT_MODULE_OPTIONS };

const STATUS_MAP = {
  planned: { label: 'Đã lên kế hoạch', color: 'bg-blue-100 text-blue-700', icon: Clock },
  in_progress: { label: 'Đang thực hiện', color: 'bg-amber-100 text-amber-700', icon: AlertCircle },
  completed: { label: 'Hoàn thành', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  cancelled: { label: 'Đã hủy', color: 'bg-red-100 text-red-700', icon: XCircle },
};

function moduleMeta(v) {
  return EVENT_MODULE_OPTIONS.find((o) => o.value === String(v || '')) || EVENT_MODULE_OPTIONS[1];
}

function formatTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}
function formatDateVN(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}
function getDayOfWeek(isoStr) {
  return new Date(isoStr).toLocaleDateString('vi-VN', { weekday: 'short' }).toUpperCase();
}
function getDayNum(isoStr) {
  return new Date(isoStr).getDate();
}
function getMonthYear(isoStr) {
  return new Date(isoStr).toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
}
function isSameDay(d1, d2) {
  const a = new Date(d1), b = new Date(d2);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function isToday(isoStr) { return isSameDay(isoStr, new Date()); }

/** Ngày theo múi giờ VN (YYYY-MM-DD) — đồng bộ với backend /events/calendar. */
function vnDateKey(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

function vnDayInMonth(isoStr, year, month1to12) {
  const key = vnDateKey(isoStr);
  if (!key) return null;
  const pad = (n) => String(n).padStart(2, '0');
  const prefix = `${year}-${pad(month1to12)}`;
  if (!key.startsWith(prefix)) return null;
  return parseInt(key.slice(-2), 10);
}

/** Khoảng ngày theo preset (đồng bộ style với CRM Dashboard). YYYY-MM-DD theo local. */
function getEventsDateRange(preset) {
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case 'today':
      return { from: iso(today), to: iso(today) };
    case 'this_week': {
      const dow = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { from: iso(monday), to: iso(sunday) };
    }
    case 'last_week': {
      const dow = today.getDay();
      const thisMon = new Date(today);
      thisMon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
      const lastMon = new Date(thisMon);
      lastMon.setDate(thisMon.getDate() - 7);
      const lastSun = new Date(lastMon);
      lastSun.setDate(lastMon.getDate() + 6);
      return { from: iso(lastMon), to: iso(lastSun) };
    }
    case 'this_month': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { from: iso(first), to: iso(last) };
    }
    case 'last_month': {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: iso(first), to: iso(last) };
    }
    case 'this_quarter': {
      const qm = Math.floor(now.getMonth() / 3) * 3;
      const first = new Date(now.getFullYear(), qm, 1);
      const last = new Date(now.getFullYear(), qm + 3, 0);
      return { from: iso(first), to: iso(last) };
    }
    case 'this_year':
      return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
    default:
      return { from: '', to: '' };
  }
}

const EVENTS_TIME_PRESETS = [
  { key: '', label: 'Tất cả' },
  { key: 'today', label: 'Hôm nay' },
  { key: 'this_week', label: 'Tuần này' },
  { key: 'last_week', label: 'Tuần trước' },
  { key: 'this_month', label: 'Tháng này' },
  { key: 'last_month', label: 'Tháng trước' },
  { key: 'this_quarter', label: 'Quý này' },
  { key: 'this_year', label: 'Năm này' },
  { key: 'custom', label: 'Tùy chỉnh…' },
];

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════
export default function EventsFeedPage() {
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);
  /** Admin chọn công ty (admin tổng / platform_admin — khớp CRM Dashboard, không chỉ isSystemAdmin). */
  const canPickCompany = isAdmin && !isCompanyScopedAdmin(user);
  const isSystemAdmin = checkSystemAdmin(user);
  const scope = useScopeFilter({
    storageKey: 'crm_events',
    showCompany: true,
    showDepartment: false,
    showSearch: false,
    autoDefaultCompany: false,
    persist: true,
  });
  const filterCompanyId = scope.companyId;
  const companies = scope.companies;

  const { moduleAccess, canAccessModule } = useModuleAccess();

  /**
   * Khối user được phép xem sự kiện:
   * - Admin / allowAll → null = không lọc (xem tất cả khối).
   * - User thường → chỉ những khối có quyền + luôn thêm 'general' (sự kiện chung công ty).
   */
  const allowedModules = useMemo(() => {
    if (!moduleAccess || moduleAccess.allowAll || isAdmin || isSystemAdmin) return null;
    if (isProductionAdmin(user)) return ['general', 'production'];
    if (isLogisticsAdmin(user)) return ['general', 'logistics'];
    const list = ['general'];
    if (canAccessModule('crm')) list.push('crm');
    if (canAccessModule('production')) list.push('production');
    if (canAccessModule('logistics')) list.push('logistics');
    return list;
  }, [moduleAccess, isAdmin, isSystemAdmin, canAccessModule, user]);

  const [searchParams, setSearchParams] = useSearchParams();
  const initialModule = useMemo(() => {
    const v = String(searchParams.get('module') || '').toLowerCase();
    return EVENT_MODULE_OPTIONS.some((o) => o.value === v) ? v : '';
  }, [searchParams]);
  const [filterModule, setFilterModule] = useState(initialModule);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!filterModule) return;
    if (allowedModules && !allowedModules.includes(filterModule)) {
      setFilterModule('');
    }
  }, [filterModule, allowedModules]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (filterModule) next.set('module', filterModule);
    else next.delete('module');
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [filterModule]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!canPickCompany || filterCompanyId) return;
    const stored = getStoredCrmFilterCompanyId();
    if (stored) scope.setCompanyId(stored);
  }, [canPickCompany, filterCompanyId, scope.setCompanyId]);

  const listParams = useMemo(
    () => {
      const p = canPickCompany && filterCompanyId ? { company_id: filterCompanyId } : {};
      if (filterModule) p.module = filterModule;
      else if (allowedModules && allowedModules.length) p.modules = allowedModules.join(',');
      return p;
    },
    [canPickCompany, filterCompanyId, filterModule, allowedModules],
  );

  /** Danh sách nhân viên cho filter / form sự kiện — chỉ trong một công ty (không «tất cả» xuyên hệ thống). */
  const effectiveCompanyIdForUsers = useMemo(() => {
    if (canPickCompany && filterCompanyId) return filterCompanyId;
    const cid = user?.company_id != null ? String(user.company_id).trim() : '';
    return cid || '';
  }, [canPickCompany, filterCompanyId, user?.company_id]);

  const [view, setView] = useState('calendar'); // feed | calendar | list | types — mặc định Lịch khi vào trang
  const [events, setEvents] = useState([]);
  const [eventTypes, setEventTypes] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [calLoading, setCalLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterRegionId, setFilterRegionId] = useState('');
  const [regions, setRegions] = useState([]);
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [timePreset, setTimePreset] = useState('');
  const [showDateRangePicker, setShowDateRangePicker] = useState(false);
  const [totalEvents, setTotalEvents] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [editEvent, setEditEvent] = useState(null);
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calEvents, setCalEvents] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  /** Mức hiển thị lịch: 'hidden' (ẩn để feed full) | 'compact' (mini) | 'full' (đầy đủ). Lưu localStorage. */
  const [calendarMode, setCalendarMode] = useState(() => {
    try { return localStorage.getItem('events_calendar_mode') || 'full'; } catch { return 'full'; }
  });
  useEffect(() => {
    try { localStorage.setItem('events_calendar_mode', calendarMode); } catch { /* ignore */ }
  }, [calendarMode]);
  const [createPresetDay, setCreatePresetDay] = useState(null);
  const currentUser = user || {};

  useEffect(() => {
    setFilterUser('');
    setFilterRegionId('');
  }, [effectiveCompanyIdForUsers]);

  useEffect(() => {
    loadEventTypes();
  }, []);

  useEffect(() => {
    if (!effectiveCompanyIdForUsers) {
      setUsers([]);
      setRegions([]);
      return;
    }
    api
      .get('/users', { params: { company_id: effectiveCompanyIdForUsers } })
      .then((r) => setUsers(r.data.users || r.data || []))
      .catch(() => setUsers([]));
    api
      .get('/crm/company-regions', { params: { company_id: effectiveCompanyIdForUsers } })
      .then((r) => setRegions(Array.isArray(r.data) ? r.data : []))
      .catch(() => setRegions([]));
  }, [effectiveCompanyIdForUsers]);

  const monthRangeBounds = useMemo(() => {
    const y = calYear;
    const m = calMonth;
    const pad = (n) => String(n).padStart(2, '0');
    const last = new Date(y, m, 0).getDate();
    return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` };
  }, [calMonth, calYear]);

  /** Tab Lịch: feed lọc đúng theo tháng đang xem trên lịch */
  useEffect(() => {
    if (view !== 'calendar') return;
    setRangeFrom(monthRangeBounds.from);
    setRangeTo(monthRangeBounds.to);
  }, [view, monthRangeBounds.from, monthRangeBounds.to]);

  useEffect(() => {
    if (view !== 'feed' && view !== 'calendar' && view !== 'list') return;
    loadFeed();
    if (view === 'calendar') loadCalendar();
  }, [view, filterType, filterStatus, filterUser, filterRegionId, calMonth, calYear, listParams, rangeFrom, rangeTo]);

  // Debounce search 300ms — tự tìm khi gõ, không cần Enter
  useEffect(() => {
    if (view !== 'feed' && view !== 'calendar' && view !== 'list') return undefined;
    const t = setTimeout(() => {
      loadFeed();
      if (view === 'calendar') loadCalendar();
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const loadEventTypes = () => api.get('/events/event-types').then(r => setEventTypes(r.data || [])).catch(() => {});

  const loadFeed = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const params = { limit: 500, ...listParams };
      if (filterType) params.type = filterType;
      if (filterStatus) params.status = filterStatus;
      if (filterUser) params.user_id = filterUser;
      if (filterRegionId) params.region_id = filterRegionId;
      if (rangeFrom) params.date_from = rangeFrom;
      if (rangeTo) params.date_to = rangeTo;
      if (search) params.search = search;
      const { data } = await api.get('/events', { params });
      setEvents(data.events || []);
      setTotalEvents(typeof data.total === 'number' ? data.total : (data.events || []).length);
    } catch (e) {
      console.error(e);
      setEvents([]);
      setTotalEvents(0);
      setLoadError(e.response?.data?.error || e.message || 'Không tải được danh sách sự kiện');
    }
    setLoading(false);
  };

  const loadCalendar = async () => {
    setCalLoading(true);
    try {
      const params = { month: calMonth, year: calYear, ...listParams };
      if (filterType) params.type = filterType;
      if (filterStatus) params.status = filterStatus;
      if (filterUser) params.user_id = filterUser;
      if (filterRegionId) params.region_id = filterRegionId;
      if (search) params.search = search;
      const { data } = await api.get('/events/calendar', { params });
      setCalEvents(data || []);
    } catch (e) {
      console.error(e);
      setCalEvents([]);
      if (!loadError) {
        setLoadError(e.response?.data?.error || e.message || 'Không tải được lịch sự kiện');
      }
    }
    setCalLoading(false);
  };

  const refreshEventsData = () => {
    if (view === 'feed' || view === 'calendar' || view === 'list') {
      loadFeed();
      if (view === 'calendar') loadCalendar();
    }
  };

  const handleRespond = async (eventId, status) => {
    try {
      await api.put(`/events/${eventId}/respond`, { status });
      refreshEventsData();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Xóa sự kiện này? (Hành động không thể hoàn tác)')) return;
    try {
      await api.delete(`/events/${id}`);
      refreshEventsData();
    } catch (e) { alert('Lỗi xóa'); }
  };

  /** Hủy sự kiện (mềm) — đổi status='cancelled' + lưu lý do (không xóa khỏi DB). */
  const handleCancel = async (id, reason) => {
    const r = String(reason || '').trim();
    if (!r) { alert('Vui lòng nhập lý do hủy'); return; }
    try {
      await api.put(`/events/${id}`, { status: 'cancelled', cancel_reason: r });
      refreshEventsData();
    } catch (e) { alert(e?.response?.data?.error || 'Lỗi hủy sự kiện'); }
  };

  const handleStatusChange = async (id, status) => {
    try {
      await api.put(`/events/${id}`, { status });
      refreshEventsData();
    } catch (e) { alert('Lỗi'); }
  };

  const clearFilters = () => {
    setSearch('');
    setFilterType('');
    setFilterStatus('');
    setFilterUser('');
    setFilterRegionId('');
    setFilterModule('');
    setTimePreset('');
    setLoadError('');
    if (view === 'calendar') {
      setRangeFrom(monthRangeBounds.from);
      setRangeTo(monthRangeBounds.to);
    } else {
      setRangeFrom('');
      setRangeTo('');
    }
  };

  /**
   * Đổi preset thời gian (giống CRM Dashboard).
   * - 'custom' → mở popover lịch.
   * - '' → xóa khoảng ngày.
   * - khác → resolve preset → set rangeFrom/rangeTo.
   */
  const handleTimePresetChange = (preset) => {
    setTimePreset(preset);
    if (preset === 'custom') {
      setShowDateRangePicker(true);
      return;
    }
    if (preset === '') {
      setRangeFrom('');
      setRangeTo('');
      return;
    }
    const range = getEventsDateRange(preset);
    setRangeFrom(range.from);
    setRangeTo(range.to);
  };

  /** Label hiển thị cho chip thời gian đang chọn (chỉ hiện khi không phải 'Tất cả'). */
  const timeFilterLabel = useMemo(() => {
    if (!timePreset && !(rangeFrom || rangeTo)) return '';
    if (timePreset && timePreset !== 'custom') {
      return EVENTS_TIME_PRESETS.find((p) => p.key === timePreset)?.label || '';
    }
    if (rangeFrom || rangeTo) {
      return `${rangeFrom || '...'} → ${rangeTo || '...'}`;
    }
    return '';
  }, [timePreset, rangeFrom, rangeTo]);

  const hasActiveFilters = !!(search || filterType || filterStatus || filterUser || filterRegionId
    || filterModule
    || (canPickCompany && filterCompanyId)
    || rangeFrom || rangeTo);

  const activeFilterHints = useMemo(() => {
    const hints = [];
    if (filterModule) hints.push(`khối ${moduleMeta(filterModule).label}`);
    if (canPickCompany && filterCompanyId) {
      const co = companies.find((c) => String(c.id) === String(filterCompanyId));
      hints.push(`công ty ${co?.short_name || co?.name || filterCompanyId}`);
    }
    if (view === 'calendar' && (rangeFrom || rangeTo)) {
      hints.push(`tháng ${calMonth}/${calYear}`);
    } else if (rangeFrom || rangeTo) {
      hints.push(`thời gian ${rangeFrom || '...'} → ${rangeTo || '...'}`);
    }
    if (filterRegionId) hints.push('khu vực người tạo');
    if (filterType) hints.push('loại sự kiện');
    if (filterStatus) hints.push('trạng thái');
    if (filterUser) hints.push('người tạo');
    if (search.trim()) hints.push(`tìm "${search.trim()}"`);
    return hints;
  }, [
    filterModule, canPickCompany, filterCompanyId, companies, view, rangeFrom, rangeTo,
    calMonth, calYear, filterRegionId, filterType, filterStatus, filterUser, search,
  ]);

  const viewAllTimeEvents = () => {
    setTimePreset('');
    setRangeFrom('');
    setRangeTo('');
    if (view === 'calendar') setView('feed');
  };

  /**
   * Xuất Excel danh sách sự kiện theo bộ lọc hiện tại (đặc biệt là khoảng thời gian).
   * Mặc định kéo tối đa 5000 sự kiện cho 1 lần xuất — đủ cho hầu hết khoảng thời gian.
   * File được đặt tên theo khoảng ngày + công ty (nếu có).
   */
  const [exporting, setExporting] = useState(false);
  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const params = { limit: 5000, ...listParams };
      if (filterType) params.type = filterType;
      if (filterStatus) params.status = filterStatus;
      if (filterUser) params.user_id = filterUser;
      if (filterRegionId) params.region_id = filterRegionId;
      if (rangeFrom) params.date_from = rangeFrom;
      if (rangeTo) params.date_to = rangeTo;
      if (search) params.search = search;
      const { data } = await api.get('/events', { params });
      const rows = data?.events || [];
      if (rows.length === 0) {
        alert('Không có sự kiện nào trong khoảng thời gian/bộ lọc để xuất.');
        return;
      }
      const typeBySlug = new Map(eventTypes.map((t) => [t.slug, t]));
      const fmtDT = (iso) => {
        if (!iso) return '';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleString('vi-VN', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        });
      };
      const sheetRows = rows.map((ev, idx) => {
        const typeInfo = typeBySlug.get(ev.event_type) || ev.event_type_ref || {};
        const mm = moduleMeta(ev.module);
        const statusInfo = STATUS_MAP[ev.status] || { label: ev.status || '' };
        const parts = ev.participants || [];
        const confirmed = parts.filter((p) => p.status === 'confirmed');
        const declined = parts.filter((p) => p.status === 'declined');
        const pending = parts.filter((p) => p.status === 'pending');
        const partNames = parts.map((p) => p.user?.full_name).filter(Boolean).join(', ');
        return {
          'STT': idx + 1,
          'Tiêu_đề': ev.title || '',
          'Loại_sự_kiện': typeInfo.name || ev.event_type || '',
          'Khối': mm.label || '',
          'Trạng_thái': statusInfo.label || ev.status || '',
          'Bắt_đầu': fmtDT(ev.start_time),
          'Kết_thúc': fmtDT(ev.end_time),
          'Địa_điểm': ev.location || '',
          'Người_tạo': ev.creator?.full_name || '',
          'Người_phụ_trách': ev.assignee?.full_name || '',
          'Khách_hàng': ev.customer?.full_name || '',
          'SĐT_KH': ev.customer?.phone || '',
          'Mã_Deal_Lead': ev.lead?.code || '',
          'Tên_Deal_Lead': ev.lead?.title || '',
          'Dự_án': ev.project ? `${ev.project.code ? ev.project.code + ' — ' : ''}${ev.project.name || ''}` : '',
          'Mô_tả': ev.description || '',
          'Kết_quả': ev.result || '',
          'Lý_do_hủy': ev.status === 'cancelled' ? (ev.cancel_reason || '') : '',
          'Số_người_tham_dự': parts.length,
          'Đã_xác_nhận': confirmed.length,
          'Chờ_phản_hồi': pending.length,
          'Đã_từ_chối': declined.length,
          'Danh_sách_tham_dự': partNames,
          'Ngày_tạo': fmtDT(ev.created_at),
        };
      });
      const ws = XLSX.utils.json_to_sheet(sheetRows, { cellDates: false });
      const headers = Object.keys(sheetRows[0] || {});
      ws['!cols'] = headers.map((h) => {
        if (h === 'STT') return { wch: 5 };
        if (h === 'Tiêu_đề' || h === 'Mô_tả' || h === 'Kết_quả' || h === 'Lý_do_hủy' || h === 'Danh_sách_tham_dự') return { wch: 32 };
        if (h.startsWith('Số_') || h.startsWith('Đã_') || h === 'Chờ_phản_hồi') return { wch: 12 };
        if (h.includes('thời') || h === 'Bắt_đầu' || h === 'Kết_thúc' || h === 'Ngày_tạo') return { wch: 18 };
        return { wch: 18 };
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sự kiện');
      const fromStamp = (rangeFrom || '').replace(/-/g, '') || 'all';
      const toStamp = (rangeTo || '').replace(/-/g, '') || 'all';
      const coName = canPickCompany && filterCompanyId
        ? (companies?.find((c) => String(c.id) === String(filterCompanyId))?.short_name
            || companies?.find((c) => String(c.id) === String(filterCompanyId))?.name)
        : '';
      const coPart = coName ? `_${String(coName).replace(/[^\p{L}\d_-]+/gu, '_')}` : '';
      XLSX.writeFile(wb, `su_kien${coPart}_${fromStamp}_${toStamp}.xlsx`);
    } catch (e) {
      console.error(e);
      alert(e?.response?.data?.error || 'Lỗi xuất Excel');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">{loadError}</p>
            <p className="text-xs mt-1 text-red-700">Thử xóa bộ lọc hoặc đổi khối / công ty / tháng đang xem.</p>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Calendar className="h-6 w-6 text-blue-600" /> Sự kiện
          </h1>
          <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
            <span>
              {totalEvents > (events || []).length && (events || []).length >= 500
                ? `Hiển thị ${(events || []).length} / ${totalEvents} sự kiện (giới hạn 500)`
                : `${totalEvents || (events || []).length} sự kiện`}
              {view === 'calendar' && (
                <span className="text-gray-400"> — khoảng {monthRangeBounds.from} → {monthRangeBounds.to}</span>
              )}
            </span>
            {view !== 'calendar' && timeFilterLabel && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-purple-100 text-purple-700 rounded-md text-[11px] font-medium border border-purple-200">
                <Clock className="h-3 w-3" />
                {timeFilterLabel}
                <button
                  type="button"
                  onClick={() => handleTimePresetChange('')}
                  className="ml-0.5 hover:text-purple-900 cursor-pointer"
                  title="Bỏ lọc thời gian"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/*
           * Bộ chuyển khối CHỈ hiển thị cho admin (xem được mọi khối).
           * Nhân viên thường tự lọc theo các khối mình có quyền — không cần UI.
           */}
          {(isAdmin || isSystemAdmin) && (
            <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg p-1 shadow-sm" title="Lọc theo khối">
              {EVENT_MODULE_OPTIONS
                .map((m) => {
                  const active = filterModule === m.value;
                  return (
                    <button
                      key={m.value || 'all'}
                      type="button"
                      onClick={() => setFilterModule(m.value)}
                      className={`px-2.5 h-7 inline-flex items-center gap-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                        active ? `${m.color} border` : 'text-gray-600 hover:bg-gray-50 border border-transparent'
                      }`}
                      title={m.label}
                    >
                      <span>{m.emoji}</span>
                      <span className="hidden lg:inline">{m.label}</span>
                    </button>
                  );
                })}
            </div>
          )}
          {!(isAdmin || isSystemAdmin) && filterModule && (
            <div className="flex items-center gap-2 px-2.5 h-9 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-xs">
              <span>{moduleMeta(filterModule).emoji} Khối: {moduleMeta(filterModule).label}</span>
              <button
                type="button"
                onClick={() => setFilterModule('')}
                className="font-semibold underline cursor-pointer hover:text-amber-950"
              >
                Xem tất cả khối
              </button>
            </div>
          )}
          {canPickCompany && (
            <div className="flex items-center gap-2 h-9 px-2.5 rounded-lg border border-indigo-200 bg-indigo-50/70 shadow-sm min-w-[220px]">
              <Building2 className="h-4 w-4 text-indigo-600 shrink-0" aria-hidden />
              <div className="flex-1 min-w-0 [&_label]:!m-0 [&_label>span]:!hidden [&_select]:!mt-0 [&_select]:h-7 [&_select]:py-1 [&_select]:text-xs [&_select]:font-semibold [&_select]:border-indigo-200 [&_select]:bg-white [&_select]:text-indigo-900">
                <ScopeFilterBar
                  scope={{ ...scope, showDepartment: false, showSearch: false, showDateRange: false }}
                  companyLabel=""
                  companyAllowAll
                />
              </div>
            </div>
          )}
          <Link
            to="/crm/leaves"
            className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold border border-purple-200 bg-purple-50 text-purple-800 shadow-sm hover:bg-purple-100 hover:border-purple-300 transition-colors"
          >
            <CalendarRange className="h-4 w-4 text-purple-600 shrink-0" /> Lịch nghỉ
          </Link>
          <Link
            to="/crm/events/overview"
            className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold border border-blue-200 bg-blue-50 text-blue-800 shadow-sm hover:bg-blue-100 hover:border-blue-300 transition-colors"
          >
            <BarChart3 className="h-4 w-4 text-blue-600 shrink-0" /> Tổng quan
          </Link>
          {/* View toggle */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
          <button onClick={() => setView('calendar')} className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 cursor-pointer transition ${view === 'calendar' ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>
              <Calendar className="h-4 w-4" /> Lịch
            </button>
            <button onClick={() => setView('feed')} className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 cursor-pointer transition ${view === 'feed' ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>
              <List className="h-4 w-4" /> Feed
            </button>
            <button onClick={() => setView('list')} className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 cursor-pointer transition ${view === 'list' ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>
              <Table2 className="h-4 w-4" /> Danh sách
            </button>
            <button onClick={() => setView('types')} className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 cursor-pointer transition ${view === 'types' ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>
              <Settings className="h-4 w-4" /> Loại
            </button>
          </div>
          {(view === 'feed' || view === 'calendar' || view === 'list') && (
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={exporting}
              title={`Xuất Excel sự kiện${rangeFrom || rangeTo ? ` (${rangeFrom || '...'} → ${rangeTo || '...'})` : ' (theo bộ lọc)'}`}
              className="h-9 px-3 inline-flex items-center gap-1.5 text-sm font-medium border border-emerald-300 text-emerald-700 rounded-lg bg-white hover:bg-emerald-50 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              Xuất Excel
            </button>
          )}
          <button onClick={() => {
            if (canPickCompany && !filterCompanyId) {
              alert('Chọn công ty ở bộ lọc phía trên trước khi tạo sự kiện — nếu không, sự kiện sẽ không hiện trên lịch khi đang lọc theo công ty.');
              return;
            }
            setEditEvent(null);
            setCreatePresetDay(null);
            setShowCreate(true);
          }}
            className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer">
            <Plus className="h-4 w-4" /> Tạo sự kiện
          </button>
        </div>
      </div>

      {/* Feed: chỉ bộ lọc + danh sách; Lịch: thêm khối lịch tháng phía trên; List: bảng + xuất Excel */}
      {(view === 'feed' || view === 'calendar' || view === 'list') && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {/* Toolbar bộ lọc — compact 1 hàng, scroll ngang nếu chật */}
          <details open className="border-b border-gray-100">
            <summary className="list-none cursor-pointer select-none flex items-center justify-between gap-2 px-4 py-2 bg-gray-50/90 hover:bg-gray-100/90">
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-700 uppercase tracking-wide">
                <Filter className="h-3.5 w-3.5" /> Bộ lọc
                {view === 'calendar' && (
                  <span className="font-normal normal-case text-gray-500">(theo tháng đang chọn)</span>
                )}
                {hasActiveFilters && (
                  <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-full normal-case">
                    Đang lọc
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); clearFilters(); }}
                    className="h-7 px-2.5 text-[11px] font-medium text-red-600 hover:bg-red-50 rounded-md cursor-pointer"
                  >
                    × Xoá lọc
                  </button>
                )}
                <span className="text-[10px] text-gray-400 hidden sm:inline">Click để gập/mở</span>
              </div>
            </summary>
            <div className="px-4 py-3 bg-gray-50/60">
              <div className="flex flex-wrap items-end gap-2">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Tìm kiếm</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Gõ để tìm…"
                      className="w-full h-9 pl-10 pr-8 border rounded-lg text-sm"
                    />
                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 inline-flex items-center justify-center text-gray-400 hover:text-gray-700 cursor-pointer"
                        title="Xoá tìm kiếm"
                      >×</button>
                    )}
                  </div>
                </div>
                {view !== 'calendar' && (
                  <>
                    <div>
                      <label className="block text-[10px] font-medium text-gray-500 mb-0.5 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Thời gian
                      </label>
                      <div className="relative">
                        <select
                          value={timePreset}
                          onChange={(e) => handleTimePresetChange(e.target.value)}
                          className={`h-9 pl-9 pr-8 rounded-lg text-sm font-medium border appearance-none cursor-pointer transition min-w-[150px] ${
                            timePreset || rangeFrom || rangeTo
                              ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          {EVENTS_TIME_PRESETS.map((p) => (
                            <option key={p.key} value={p.key}>{p.label}</option>
                          ))}
                        </select>
                        <Clock className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none ${timePreset || rangeFrom || rangeTo ? 'text-purple-500' : 'text-gray-400'}`} />
                        <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 rotate-90 pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-gray-500 mb-0.5 flex items-center gap-1">
                        <CalendarRange className="h-3 w-3" /> Khoảng ngày
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowDateRangePicker(true)}
                        className={`h-9 px-3 inline-flex items-center gap-1.5 rounded-lg text-sm font-medium border transition cursor-pointer ${
                          rangeFrom || rangeTo
                            ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-purple-300 hover:bg-gray-50'
                        }`}
                        title="Mở lịch chọn khoảng ngày"
                      >
                        <CalendarRange className="h-3.5 w-3.5" />
                        {rangeFrom || rangeTo ? (
                          <span className="tabular-nums">{rangeFrom || '...'} → {rangeTo || '...'}</span>
                        ) : (
                          <span className="text-gray-500">Chọn ngày…</span>
                        )}
                        {(rangeFrom || rangeTo) && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              setTimePreset('');
                              setRangeFrom('');
                              setRangeTo('');
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                setTimePreset('');
                                setRangeFrom('');
                                setRangeTo('');
                              }
                            }}
                            className="ml-1 -mr-1 p-0.5 rounded hover:bg-purple-200 text-purple-600 cursor-pointer"
                            title="Xóa khoảng ngày"
                          >
                            <X className="h-3 w-3" />
                          </span>
                        )}
                      </button>
                    </div>
                  </>
                )}
                {view === 'calendar' && (
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5 flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Tháng đang xem
                    </label>
                    <div
                      className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg text-sm border bg-gray-100 text-gray-700 border-gray-200 tabular-nums"
                      title="Đổi tháng trên lịch để đổi khoảng ngày"
                    >
                      <Calendar className="h-3.5 w-3.5 text-gray-500" />
                      {monthRangeBounds.from} → {monthRangeBounds.to}
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Loại</label>
                  <select value={filterType} onChange={e => setFilterType(e.target.value)} className="h-9 px-3 border rounded-lg text-sm min-w-[120px]">
                    <option value="">Tất cả loại</option>
                    {eventTypes.map(t => <option key={t.slug} value={t.slug}>{t.icon} {t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Trạng thái</label>
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="h-9 px-3 border rounded-lg text-sm min-w-[130px]">
                    <option value="">Tất cả</option>
                    {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Người tạo / phụ trách</label>
                  <select value={filterUser} onChange={e => setFilterUser(e.target.value)} className="h-9 px-3 border rounded-lg text-sm min-w-[140px]" title="Hiện sự kiện người này tạo hoặc được giao phụ trách">
                    <option value="">Tất cả</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-0.5 flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Khu vực (tạo / phụ trách)
                  </label>
                  <select
                    value={filterRegionId}
                    onChange={e => setFilterRegionId(e.target.value)}
                    disabled={!effectiveCompanyIdForUsers}
                    className="h-9 px-3 border rounded-lg text-sm min-w-[150px] disabled:bg-gray-100"
                    title={!effectiveCompanyIdForUsers ? 'Chọn công ty (admin) để lọc khu vực' : 'Lọc sự kiện theo khu vực của người tạo hoặc người phụ trách'}
                  >
                    <option value="">Tất cả khu vực</option>
                    {regions.map((rg) => (
                      <option key={rg.id} value={rg.id}>{rg.name}{rg.code ? ` (${rg.code})` : ''}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </details>

          <div className={`p-4 ${view === 'calendar' ? 'space-y-4' : ''}`}>
            {view === 'calendar' && calendarMode !== 'hidden' && (
              <CalendarView
                month={calMonth} year={calYear} events={calEvents} eventTypes={eventTypes}
                loading={calLoading} selectedDay={selectedDay}
                mode={calendarMode}
                onModeChange={setCalendarMode}
                onPrevMonth={() => { if (calMonth === 1) { setCalMonth(12); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); }}
                onNextMonth={() => { if (calMonth === 12) { setCalMonth(1); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); }}
                onSelectDay={setSelectedDay}
                onOpenCreateForDay={(day) => {
                  if (canPickCompany && !filterCompanyId) {
                    alert('Chọn công ty ở bộ lọc phía trên trước khi tạo sự kiện.');
                    return;
                  }
                  setEditEvent(null);
                  setCreatePresetDay({ year: calYear, month: calMonth, day });
                  setSelectedDay(day);
                  setShowCreate(true);
                }}
                onEdit={(ev) => { setEditEvent(ev); setCreatePresetDay(null); setShowCreate(true); }}
              />
            )}
            {view === 'calendar' && calendarMode === 'hidden' && (
              <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-blue-50 border border-blue-100">
                <span className="text-xs text-blue-800 flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5" /> Lịch đang ẩn — feed có toàn bộ chỗ trống
                </span>
                <div className="flex gap-1">
                  <button onClick={() => setCalendarMode('compact')}
                    className="h-7 px-2.5 text-[11px] font-semibold rounded-md bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 cursor-pointer">
                    📅 Thu gọn
                  </button>
                  <button onClick={() => setCalendarMode('full')}
                    className="h-7 px-2.5 text-[11px] font-semibold rounded-md bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 cursor-pointer">
                    📆 Mở rộng
                  </button>
                </div>
              </div>
            )}
            {view === 'list' ? (
              <EventListView
                events={events}
                eventTypes={eventTypes}
                loading={loading}
                rangeFrom={rangeFrom}
                rangeTo={rangeTo}
                loadError={loadError}
                emptyHints={activeFilterHints}
                onClearFilters={clearFilters}
                onViewAllTime={viewAllTimeEvents}
                onEdit={(ev) => { setEditEvent(ev); setCreatePresetDay(null); setShowCreate(true); }}
                onDelete={handleDelete}
                onCancel={handleCancel}
                onStatusChange={handleStatusChange}
                currentUser={currentUser}
              />
            ) : (
              <div>
                <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                  <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <List className="h-4 w-4 text-gray-500" /> Feed sự kiện
                    <span className="text-xs font-normal text-gray-400">({events.length} sự kiện)</span>
                  </h2>
                  {events.length > 6 && (
                    <span className="text-[11px] text-gray-400">Cuộn dọc để xem thêm</span>
                  )}
                </div>
                {/* Vùng cuộn — chiều cao phụ thuộc chế độ lịch:
                    hidden  → feed full (chừa 260px cho header/filter)
                    compact → lịch chỉ ~280px (chừa 540px)
                    full    → lịch ~720px (chừa 740px khi nhiều tuần)
                    Layout: GRID 2 cột song song trên ≥lg để hiển thị nhiều sự kiện hơn 1 viewport. */}
                <div
                  className="overflow-y-auto pr-1 [scrollbar-width:thin]"
                  style={{
                    maxHeight: view === 'calendar'
                      ? calendarMode === 'hidden' ? 'calc(100vh - 260px)'
                        : calendarMode === 'compact' ? 'calc(100vh - 540px)'
                          : 'calc(100vh - 740px)'
                      : 'calc(100vh - 300px)',
                    minHeight: 320,
                  }}
                >
                  {loading ? (
                    <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>
                  ) : events.length === 0 ? (
                    <EventsEmptyState
                      loadError={loadError}
                      hints={activeFilterHints}
                      onClearFilters={clearFilters}
                      onViewAllTime={viewAllTimeEvents}
                      showViewAllTime={!!(rangeFrom || rangeTo)}
                    />
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {events.map(ev => (
                        <EventCard key={ev.id} event={ev} eventTypes={eventTypes} currentUser={currentUser}
                          onRespond={handleRespond} onDelete={handleDelete} onCancel={handleCancel}
                          onStatusChange={handleStatusChange}
                          onEdit={() => { setEditEvent(ev); setShowCreate(true); }} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Event Types Manager */}
      {view === 'types' && (
        <EventTypesManager types={eventTypes} onReload={loadEventTypes} />
      )}

      {/* Create/Edit Modal */}
      {showCreate && (
        <EventCreateModal
          event={editEvent}
          presetDay={editEvent ? null : createPresetDay}
          eventTypes={eventTypes}
          users={users}
          defaultCompanyId={filterCompanyId || user?.company_id || ''}
          defaultModule={filterModule || (allowedModules && allowedModules.find((m) => m !== 'general')) || 'crm'}
          allowedModules={isAdmin || isSystemAdmin ? null : allowedModules}
          allowGeneralModule={isAdmin || isSystemAdmin}
          onClose={() => { setShowCreate(false); setEditEvent(null); setCreatePresetDay(null); }}
          onSaved={() => { setShowCreate(false); setEditEvent(null); setCreatePresetDay(null); refreshEventsData(); }}
        />
      )}

      {/* Date range picker — chung style với CRM Dashboard */}
      <DateRangePickerPopover
        open={showDateRangePicker}
        title="Chọn khoảng thời gian sự kiện"
        from={rangeFrom}
        to={rangeTo}
        onChange={({ from, to }) => {
          setRangeFrom(from || '');
          setRangeTo(to || '');
          setTimePreset(from || to ? 'custom' : '');
        }}
        onClose={() => setShowDateRangePicker(false)}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// EMPTY STATE — gợi ý khi không có sự kiện
// ═══════════════════════════════════════════════════════════════
function EventsEmptyState({ loadError, hints, onClearFilters, onViewAllTime, showViewAllTime }) {
  return (
    <div className="text-center py-16 text-gray-400">
      <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
      {loadError ? (
        <p className="text-sm text-red-600 font-medium">{loadError}</p>
      ) : (
        <p className="text-sm">Không có sự kiện phù hợp bộ lọc</p>
      )}
      {hints?.length > 0 && (
        <p className="text-xs mt-2 text-gray-500 max-w-md mx-auto">
          Đang lọc: {hints.join(' · ')}
        </p>
      )}
      <p className="text-xs mt-2 text-gray-400 max-w-md mx-auto">
        Tab Lịch mặc định chỉ hiển thị sự kiện trong tháng đang chọn — thử chuyển tháng hoặc mở tab Feed với «Tất cả» thời gian.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
        {showViewAllTime && (
          <button
            type="button"
            onClick={onViewAllTime}
            className="h-8 px-3 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
          >
            Xem tất cả thời gian
          </button>
        )}
        <button
          type="button"
          onClick={onClearFilters}
          className="h-8 px-3 text-xs font-medium rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 cursor-pointer"
        >
          Xóa bộ lọc
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// EVENT CARD — Bitrix24-style Feed Card
// ═══════════════════════════════════════════════════════════════
function EventCard({ event: ev, eventTypes, currentUser, onRespond, onDelete, onCancel, onStatusChange, onEdit }) {
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState([]);
  const [showComments, setShowComments] = useState(false);
  const [sending, setSending] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  /** Quyền hủy/xóa: chỉ người tạo (`created_by`) hoặc admin. */
  const canManage = isAdminLike(currentUser)
    || String(ev.created_by || '') === String(currentUser?.id || '');

  const typeInfo = eventTypes.find(t => t.slug === ev.event_type) || ev.event_type_ref || { icon: '📋', name: ev.event_type, color: '#6B7280' };
  const statusInfo = STATUS_MAP[ev.status] || STATUS_MAP.planned;
  const confirmed = (ev.participants || []).filter(p => p.status === 'confirmed');
  const declined = (ev.participants || []).filter(p => p.status === 'declined');
  const pending = (ev.participants || []).filter(p => p.status === 'pending');
  const myParticipation = (ev.participants || []).find(p => p.user_id === currentUser.id);

  const loadComments = async () => {
    try {
      const { data } = await api.get(`/events/${ev.id}/comments`);
      setComments(data || []);
    } catch (e) {}
  };

  const submitComment = async () => {
    if (!comment.trim()) return;
    setSending(true);
    try {
      const { data } = await api.post(`/events/${ev.id}/comments`, { content: comment });
      setComments(prev => [...prev, data]);
      setComment('');
    } catch (e) { alert('Lỗi'); }
    setSending(false);
  };

  return (
    <div className="bg-white rounded-xl border shadow-sm hover:shadow-md transition-shadow flex flex-col h-full">
      {/* Header — Creator info (gọn) */}
      <div className="flex items-start justify-between px-3.5 pt-3 pb-1.5 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700 shrink-0">
            {ev.creator?.avatar ? <img src={ev.creator.avatar} className="w-8 h-8 rounded-full object-cover" /> :
              (ev.creator?.full_name || '?').charAt(0)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-[12px] min-w-0 flex-wrap">
              <span className="font-semibold text-gray-900 truncate">{ev.creator?.full_name || 'Người dùng'}</span>
              <span className="text-gray-400 font-normal shrink-0">· tạo</span>
            </div>
            <p className="text-[10px] text-gray-500 leading-tight truncate">
              Phụ trách: <span className="font-medium text-gray-700">{ev.assignee?.full_name || '—'}</span>
            </p>
            <p className="text-[10px] text-gray-400 leading-tight">{formatDateVN(ev.created_at)}, {formatTime(ev.created_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
          <button onClick={onEdit} title="Sửa" className="p-1 text-gray-400 hover:text-blue-600 rounded cursor-pointer"><Edit3 className="h-3.5 w-3.5" /></button>
          {canManage && ev.status !== 'cancelled' && ev.status !== 'completed' && typeof onCancel === 'function' && (
            <button
              onClick={() => { setCancelReason(ev.cancel_reason || ''); setShowCancelModal(true); }}
              title="Hủy sự kiện (kèm lý do)"
              className="p-1 text-gray-400 hover:text-amber-600 rounded cursor-pointer"
            >
              <Ban className="h-3.5 w-3.5" />
            </button>
          )}
          {canManage && (
            <button onClick={() => onDelete(ev.id)} title="Xóa sự kiện" className="p-1 text-gray-400 hover:text-red-500 rounded cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
          )}
        </div>
      </div>
      {/* Module chip — 1 hàng mỏng, không ăn chỗ */}
      <div className="px-3.5 pb-1">
        {(() => {
          const mm = moduleMeta(ev.module);
          return (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border ${mm.color}`}
              title={`Khối: ${mm.label}`}
            >
              {mm.emoji} {mm.label}
            </span>
          );
        })()}
      </div>
      {/* Lý do hủy — hiển thị khi đã cancel */}
      {ev.status === 'cancelled' && ev.cancel_reason && (
        <div className="mx-3.5 mb-1.5 rounded-lg border border-red-200 bg-red-50/70 px-2.5 py-1 text-[11px] text-red-700">
          <span className="font-semibold">Lý do hủy:</span> {ev.cancel_reason}
        </div>
      )}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowCancelModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Ban className="h-4 w-4 text-amber-600" /> Hủy sự kiện
            </h3>
            <p className="text-xs text-gray-500">Sự kiện sẽ chuyển sang trạng thái «Đã hủy» và lưu lý do — không bị xóa khỏi hệ thống.</p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={4}
              autoFocus
              placeholder="Nhập lý do hủy (bắt buộc)…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-400 outline-none"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                Đóng
              </button>
              <button
                type="button"
                disabled={!cancelReason.trim()}
                onClick={async () => {
                  await onCancel(ev.id, cancelReason);
                  setShowCancelModal(false);
                }}
                className="px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                Xác nhận hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Event body — Bitrix style with date block (compact) */}
      <div className="px-3.5 pb-3 flex gap-2.5 flex-1 min-h-0">
        {/* Date block */}
        <div className="flex-shrink-0 w-12 text-center">
          <div className="bg-blue-600 text-white text-[9px] font-bold py-0.5 rounded-t-md uppercase">
            {getDayOfWeek(ev.start_time)}
          </div>
          <div className="border border-t-0 rounded-b-md py-1">
            <span className="text-xl font-bold leading-none" style={{ color: '#000000' }}>{getDayNum(ev.start_time)}</span>
          </div>
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0 space-y-1">
          {/* Title */}
          <p className="text-[13px] font-bold text-gray-900 leading-snug line-clamp-2" title={ev.title}>
            <span className="mr-1">{typeInfo.icon}</span>{ev.title}
          </p>
          {/* Datetime */}
          <p className="text-[11px] text-gray-600 flex items-center gap-1">
            <Clock className="h-3 w-3 text-gray-400 shrink-0" />
            <span className="truncate">{(() => {
              const startLabel = isToday(ev.start_time) ? 'Hôm nay' : formatDateVN(ev.start_time);
              const startTime = formatTime(ev.start_time);
              if (!ev.end_time) return `${startLabel}, ${startTime}`;
              const sameDay = isSameDay(ev.start_time, ev.end_time);
              const endTime = formatTime(ev.end_time);
              if (sameDay) return `${startLabel}, ${startTime} — ${endTime}`;
              const endLabel = isToday(ev.end_time) ? 'Hôm nay' : formatDateVN(ev.end_time);
              return `${startLabel}, ${startTime} → ${endLabel}, ${endTime}`;
            })()}</span>
          </p>
          {ev.location && (
            <p className="text-[11px] text-gray-600 flex items-center gap-1 truncate" title={ev.location}>
              <MapPin className="h-3 w-3 text-gray-400 shrink-0" />
              <span className="truncate">{ev.location}</span>
            </p>
          )}
          {ev.lead && (
            <p className="text-[11px] truncate">
              <span className="text-gray-500">Deal: </span>
              <Link to={`/crm/leads/${ev.lead.id}`} className="text-blue-600 hover:underline font-medium">
                {ev.lead.code} — {ev.lead.title}
              </Link>
            </p>
          )}
          {ev.customer && (
            <p className="text-[11px] text-gray-600 truncate">
              <span className="text-gray-500">KH: </span>
              {ev.customer.full_name} {ev.customer.phone ? `(${ev.customer.phone})` : ''}
            </p>
          )}
          {ev.description && <p className="text-[11px] text-gray-600 line-clamp-2">{ev.description}</p>}
          {ev.result && <p className="text-[11px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded line-clamp-2">📝 {ev.result}</p>}

          {/* Participants — chip nhỏ */}
          {(confirmed.length > 0 || declined.length > 0) && (
            <div className="flex items-center gap-3 pt-0.5">
              {confirmed.length > 0 && (
                <div className="flex items-center gap-1">
                  <Check className="h-3 w-3 text-emerald-500" />
                  <div className="flex -space-x-1">
                    {confirmed.slice(0, 4).map(p => (
                      <div key={p.id} title={p.user?.full_name} className="w-5 h-5 rounded-full bg-emerald-100 border border-white flex items-center justify-center text-[9px] font-bold text-emerald-700">
                        {p.user?.avatar ? <img src={p.user.avatar} className="w-5 h-5 rounded-full object-cover" /> : (p.user?.full_name || '?').charAt(0)}
                      </div>
                    ))}
                    {confirmed.length > 4 && (
                      <div className="w-5 h-5 rounded-full bg-emerald-50 border border-white flex items-center justify-center text-[9px] font-bold text-emerald-700">
                        +{confirmed.length - 4}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {declined.length > 0 && (
                <div className="flex items-center gap-1">
                  <X className="h-3 w-3 text-red-500" />
                  <div className="flex -space-x-1">
                    {declined.slice(0, 3).map(p => (
                      <div key={p.id} title={p.user?.full_name} className="w-5 h-5 rounded-full bg-red-100 border border-white flex items-center justify-center text-[9px] font-bold text-red-700">
                        {p.user?.avatar ? <img src={p.user.avatar} className="w-5 h-5 rounded-full object-cover" /> : (p.user?.full_name || '?').charAt(0)}
                      </div>
                    ))}
                    {declined.length > 3 && (
                      <div className="w-5 h-5 rounded-full bg-red-50 border border-white flex items-center justify-center text-[9px] font-bold text-red-700">
                        +{declined.length - 3}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="px-3.5 pb-2 flex items-center gap-1.5 flex-wrap">
        {/* Confirm/Decline for current user */}
        {(!myParticipation || myParticipation.status === 'pending') && (
          <>
            <button onClick={() => onRespond(ev.id, 'confirmed')}
              className="h-7 px-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded text-[11px] font-bold uppercase tracking-wide cursor-pointer">
              Xác nhận
            </button>
            <button onClick={() => onRespond(ev.id, 'declined')}
              className="h-7 px-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded text-[11px] font-bold uppercase tracking-wide cursor-pointer">
              Từ chối
            </button>
          </>
        )}
        {myParticipation?.status === 'confirmed' && (
          <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1"><Check className="h-3 w-3" /> Đã xác nhận</span>
        )}
        {myParticipation?.status === 'declined' && (
          <span className="text-[11px] text-red-500 font-medium flex items-center gap-1"><X className="h-3 w-3" /> Đã từ chối</span>
        )}

        {/* Status quick actions */}
        {ev.status === 'planned' && ev.created_by === currentUser.id && (
          <button onClick={() => onStatusChange(ev.id, 'in_progress')}
            className="text-[11px] text-amber-600 hover:underline cursor-pointer font-medium">▶ Bắt đầu</button>
        )}
        {ev.status === 'in_progress' && (
          <button onClick={() => onStatusChange(ev.id, 'completed')}
            className="text-[11px] text-emerald-600 hover:underline cursor-pointer font-medium">✅ Hoàn thành</button>
        )}
      </div>

      {/* Comments section — compact footer */}
      <div className="border-t px-3.5 py-1.5 mt-auto">
        <div className="flex items-center gap-3 text-[11px] text-gray-500">
          <button onClick={() => { setShowComments(!showComments); if (!showComments) loadComments(); }}
            className="hover:text-blue-600 cursor-pointer flex items-center gap-1">
            <MessageSquare className="h-3 w-3" /> Bình luận
          </button>
          <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {(ev.participants || []).length}</span>
        </div>

        {showComments && (
          <div className="mt-2 space-y-1.5">
            {comments.map(c => (
              <div key={c.id} className="flex gap-1.5">
                <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-[9px] font-bold text-gray-500 flex-shrink-0">
                  {(c.user?.full_name || '?').charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] font-semibold text-gray-700">{c.user?.full_name}</span>
                  <p className="text-[12px] text-gray-600 break-words">{c.content}</p>
                </div>
              </div>
            ))}
            <div className="flex gap-1.5 mt-1.5">
              <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[9px] font-bold text-blue-600 flex-shrink-0">
                {(currentUser.full_name || '?').charAt(0)}
              </div>
              <div className="flex-1 flex gap-1">
                <input value={comment} onChange={e => setComment(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submitComment()}
                  placeholder="Thêm bình luận..." className="flex-1 h-7 px-2 border rounded-lg text-xs" />
                <button onClick={submitComment} disabled={sending}
                  className="h-7 px-2 bg-blue-600 text-white rounded-lg cursor-pointer disabled:opacity-50">
                  <Send className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Chi tiết một sự kiện trong khung « ngày đã chọn » (lịch) — đủ trường như feed
// ═══════════════════════════════════════════════════════════════
function SelectedDayEventDetail({ ev, eventTypes, onEdit }) {
  const typeInfo = eventTypes.find((t) => t.slug === ev.event_type) || ev.event_type_ref || { icon: '📋', name: ev.event_type, color: '#6B7280' };
  const statusInfo = STATUS_MAP[ev.status] || STATUS_MAP.planned;
  const confirmed = (ev.participants || []).filter((p) => p.status === 'confirmed');
  const declined = (ev.participants || []).filter((p) => p.status === 'declined');
  const pending = (ev.participants || []).filter((p) => p.status === 'pending');

  const timeRange = (() => {
    const startLabel = isToday(ev.start_time) ? 'Hôm nay' : formatDateVN(ev.start_time);
    const startTime = formatTime(ev.start_time);
    if (!ev.end_time) return `${startLabel}, ${startTime}`;
    const sameDay = isSameDay(ev.start_time, ev.end_time);
    const endTime = formatTime(ev.end_time);
    if (sameDay) return `${startLabel}, ${startTime} — ${endTime}`;
    const endLabel = isToday(ev.end_time) ? 'Hôm nay' : formatDateVN(ev.end_time);
    return `${startLabel}, ${startTime} → ${endLabel}, ${endTime}`;
  })();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onEdit(ev)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onEdit(ev);
        }
      }}
      className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-blue-200 hover:shadow-md transition text-left cursor-pointer"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl"
            style={{ backgroundColor: `${typeInfo.color || '#3B82F6'}22`, color: typeInfo.color || '#3B82F6' }}
          >
            {typeInfo.icon || '📋'}
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{typeInfo.name || 'Sự kiện'}</p>
            <p className="text-base font-bold text-gray-900 break-words">{ev.title}</p>
          </div>
        </div>
        <span className={`text-[10px] px-2.5 py-1 rounded-full font-semibold shrink-0 ${statusInfo.color}`}>{statusInfo.label}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4">
        <div className="flex sm:flex-col items-center sm:items-center gap-2 sm:w-16 shrink-0">
          <div className="bg-blue-600 text-white text-[10px] font-bold py-0.5 px-2 rounded-t-lg uppercase text-center w-full">
            {getDayOfWeek(ev.start_time)}
          </div>
          <div className="border border-t-0 rounded-b-lg py-2 text-center w-full">
            <span className="text-2xl font-bold text-gray-900">{getDayNum(ev.start_time)}</span>
          </div>
        </div>
        <div className="space-y-2 text-sm min-w-0">
          <div className="flex flex-wrap gap-x-2 gap-y-1">
            <span className="text-xs text-gray-500 shrink-0">Thời gian:</span>
            <span className="text-gray-800 font-medium">{timeRange}</span>
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-1">
            <span className="text-xs text-gray-500 shrink-0">Người tạo:</span>
            <span className="text-gray-800">{ev.creator?.full_name || '—'}</span>
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-1">
            <span className="text-xs text-gray-500 shrink-0">Người phụ trách:</span>
            <span className="text-gray-800">{ev.assignee?.full_name || '—'}</span>
          </div>
          {ev.location && (
            <div className="flex flex-wrap gap-x-2 gap-y-1 items-start">
              <span className="text-xs text-gray-500 shrink-0">Địa điểm:</span>
              <span className="text-gray-800 flex items-start gap-1">
                <MapPin className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" /> {ev.location}
              </span>
            </div>
          )}
          {ev.lead && (
            <div className="flex flex-wrap gap-x-2 gap-y-1 items-start">
              <span className="text-xs text-gray-500 shrink-0">Deal / Lead:</span>
              <Link
                to={`/crm/leads/${ev.lead.id}`}
                onClick={(e) => e.stopPropagation()}
                className="text-blue-600 hover:underline font-medium"
              >
                {ev.lead.code} — {ev.lead.title}
              </Link>
            </div>
          )}
          {ev.customer && (
            <div className="flex flex-wrap gap-x-2 gap-y-1">
              <span className="text-xs text-gray-500 shrink-0">Khách hàng:</span>
              <span className="text-gray-800">
                {ev.customer.full_name}
                {ev.customer.phone ? ` (${ev.customer.phone})` : ''}
              </span>
            </div>
          )}
          {ev.project && (
            <div className="flex flex-wrap gap-x-2 gap-y-1">
              <span className="text-xs text-gray-500 shrink-0">Dự án:</span>
              <span className="text-gray-800">{ev.project.code ? `${ev.project.code} — ` : ''}{ev.project.name}</span>
            </div>
          )}
          {ev.description && <p className="text-gray-600 text-sm whitespace-pre-wrap">{ev.description}</p>}
          {ev.result && (
            <p className="text-sm text-emerald-800 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-100">📝 Kết quả: {ev.result}</p>
          )}
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 pt-1 border-t border-gray-100">
            {(confirmed.length > 0 || declined.length > 0 || pending.length > 0) && (
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                Tham dự:{' '}
                {confirmed.length > 0 && <span className="text-emerald-600 font-medium">{confirmed.length} xác nhận</span>}
                {pending.length > 0 && <span className="text-amber-600 font-medium ml-1">{pending.length} chờ</span>}
                {declined.length > 0 && <span className="text-red-600 font-medium ml-1">{declined.length} từ chối</span>}
              </span>
            )}
          </div>
        </div>
      </div>
      <p className="text-[11px] text-blue-600 font-medium mt-3">Nhấn để sửa sự kiện</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CALENDAR VIEW — Monthly grid
// ═══════════════════════════════════════════════════════════════
function CalendarView({ month, year, events, eventTypes, loading, selectedDay, onPrevMonth, onNextMonth, onSelectDay, onOpenCreateForDay, onEdit, mode = 'full', onModeChange }) {
  // mode: 'compact' (mini grid, không hiện tên event — gợi ý dot màu) | 'full' (default)
  const isCompact = mode === 'compact';
  const selectedDayDetailRef = useRef(null);
  const [scrollToDetailNonce, setScrollToDetailNonce] = useState(0);

  useLayoutEffect(() => {
    if (scrollToDetailNonce === 0) return;
    const el = selectedDayDetailRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [scrollToDetailNonce, selectedDay]);

  const monthNames = ['', 'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
    'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];
  const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

  // Build calendar grid
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;

  const cells = [];
  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // Pad end
  while (cells.length % 7 !== 0) cells.push(null);

  // Group events by day (múi giờ VN, đúng tháng đang xem)
  const eventsByDay = {};
  events.forEach(ev => {
    const d = vnDayInMonth(ev.start_time, year, month);
    if (!d) return;
    if (!eventsByDay[d]) eventsByDay[d] = [];
    eventsByDay[d].push(ev);
  });

  const selectedDayEvents = selectedDay
    ? [...(eventsByDay[selectedDay] || [])].sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
    : [];

  // Số event hiển thị / chiều cao cell theo mode
  const maxChipsPerCell = isCompact ? 0 : 3;
  const cellMinH = isCompact ? 44 : 100;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Calendar header — toolbar hiện đại */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-gradient-to-r from-blue-50/70 via-white to-blue-50/70 border-b border-gray-100">
        <div className="flex items-center gap-1.5">
          <button onClick={onPrevMonth} title="Tháng trước"
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-600 hover:bg-white hover:text-blue-600 hover:shadow-sm cursor-pointer transition">
            <ChevronLeft className="h-4.5 w-4.5" />
          </button>
          <h2 className="text-base sm:text-lg font-bold text-gray-900 px-2 tabular-nums">{monthNames[month]} {year}</h2>
          <button onClick={onNextMonth} title="Tháng sau"
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-600 hover:bg-white hover:text-blue-600 hover:shadow-sm cursor-pointer transition">
            <ChevronRight className="h-4.5 w-4.5" />
          </button>
          {!isCurrentMonth && (
            <button
              onClick={() => {
                const t = new Date();
                if (t.getMonth() + 1 < month || t.getFullYear() < year) onPrevMonth();
                else onNextMonth();
              }}
              className="hidden sm:inline-flex ml-1 h-7 px-2.5 text-[11px] font-semibold rounded-md bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 cursor-pointer"
              title="Về tháng hiện tại"
            >Hôm nay</button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-500 hidden md:inline">{events.length} sự kiện</span>
          {/* Toggle 3 mức hiển thị: Ẩn / Thu gọn / Mở rộng */}
          {onModeChange && (
            <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => onModeChange('hidden')}
                title="Ẩn lịch — dành chỗ cho feed"
                className="h-7 px-2.5 text-[11px] font-semibold rounded-md text-gray-600 hover:bg-white cursor-pointer transition"
              >👁️‍🗨️ Ẩn</button>
              <button
                onClick={() => onModeChange('compact')}
                className={`h-7 px-2.5 text-[11px] font-semibold rounded-md cursor-pointer transition ${
                  isCompact ? 'bg-white shadow-sm text-blue-700 ring-1 ring-blue-200' : 'text-gray-600 hover:bg-white'
                }`}
                title="Thu gọn — chỉ hiện chấm màu cho ngày có event"
              >📅 Thu gọn</button>
              <button
                onClick={() => onModeChange('full')}
                className={`h-7 px-2.5 text-[11px] font-semibold rounded-md cursor-pointer transition ${
                  !isCompact ? 'bg-white shadow-sm text-blue-700 ring-1 ring-blue-200' : 'text-gray-600 hover:bg-white'
                }`}
                title="Mở rộng — hiện tên event trong từng ngày"
              >📆 Mở rộng</button>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-blue-500" /></div>
      ) : (
        <div className="p-3 sm:p-4">
          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {dayNames.map((d, i) => (
              <div key={d} className={`text-center text-[11px] font-bold py-1.5 uppercase tracking-wide ${
                i === 0 ? 'text-rose-500' : 'text-gray-500'
              }`}>{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              const dayEvents = day ? (eventsByDay[day] || []) : [];
              const isTodayCell = isCurrentMonth && day === today.getDate();
              const isSelected = day === selectedDay;
              const isWeekend = i % 7 === 0; // CN
              if (!day) {
                return <div key={i} className="rounded-lg bg-gray-50/40 border border-dashed border-gray-100" style={{ minHeight: cellMinH }} />;
              }
              return (
                <div
                  key={i}
                  role="presentation"
                  className={`group relative rounded-lg border flex flex-col overflow-hidden transition cursor-pointer ${
                    isSelected
                      ? 'ring-2 ring-blue-500 ring-offset-1 border-blue-300 shadow-md'
                      : 'border-gray-200 hover:border-blue-300 hover:shadow-sm'
                  } ${isTodayCell ? 'bg-blue-50/40' : 'bg-white'}`}
                  style={{ minHeight: cellMinH }}
                  onClick={(e) => {
                    if (e.target.closest?.('[data-cal-event-chip]') || e.target.closest?.('[data-create-btn]')) return;
                    onSelectDay(day);
                    setScrollToDetailNonce((n) => n + 1);
                  }}
                >
                  {/* Header dòng ngày */}
                  <div className={`flex items-center justify-between px-1.5 py-1 ${isCompact ? '' : 'border-b border-gray-100'}`}>
                    <span
                      className={`text-[12px] font-bold w-6 h-6 inline-flex items-center justify-center rounded-full shrink-0 tabular-nums ${
                        isTodayCell
                          ? 'bg-blue-600 text-white shadow-sm'
                          : isWeekend ? 'text-rose-600' : 'text-gray-800'
                      }`}
                    >{day}</span>
                    {/* Compact: gom event thành dots màu, max 4 */}
                    {isCompact && dayEvents.length > 0 && (
                      <div className="flex items-center gap-0.5">
                        {dayEvents.slice(0, 4).map((ev) => {
                          const typeInfo = eventTypes.find((t) => t.slug === ev.event_type) || ev.event_type_ref || {};
                          return (
                            <span
                              key={ev.id}
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: typeInfo.color || '#3B82F6' }}
                              title={`${ev.title} (${formatTime(ev.start_time)})`}
                            />
                          );
                        })}
                        {dayEvents.length > 4 && (
                          <span className="text-[9px] font-bold text-gray-500 ml-0.5">+{dayEvents.length - 4}</span>
                        )}
                      </div>
                    )}
                    <button
                      type="button"
                      data-create-btn
                      onClick={(e) => { e.stopPropagation(); onSelectDay(day); onOpenCreateForDay(day); }}
                      className={`w-5 h-5 inline-flex items-center justify-center rounded text-blue-600 hover:bg-blue-50 cursor-pointer transition ${
                        isCompact ? 'opacity-0 group-hover:opacity-100' : 'opacity-50 hover:opacity-100'
                      }`}
                      title={`Tạo sự kiện ngày ${day}`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Body — danh sách event (chỉ hiện ở mode full) */}
                  {!isCompact && (
                    <div className="flex-1 min-h-0 p-0.5 space-y-0.5 overflow-hidden">
                      {dayEvents.slice(0, maxChipsPerCell).map(ev => {
                        const typeInfo = eventTypes.find(t => t.slug === ev.event_type) || ev.event_type_ref || {};
                        return (
                          <div
                            key={ev.id}
                            data-cal-event-chip
                            className="text-[10px] leading-tight px-1 py-0.5 rounded truncate font-medium hover:shadow-sm transition"
                            style={{ backgroundColor: (typeInfo.color || '#3B82F6') + '22', color: typeInfo.color || '#3B82F6' }}
                            title={`${ev.title} — ${formatTime(ev.start_time)} — Nhấn để sửa`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectDay(day);
                              setScrollToDetailNonce((n) => n + 1);
                              onEdit(ev);
                            }}
                          >
                            {typeInfo.icon} {ev.title}
                          </div>
                        );
                      })}
                      {dayEvents.length > maxChipsPerCell && (
                        <div className="text-[10px] font-semibold text-gray-500 px-1">+{dayEvents.length - maxChipsPerCell} khác</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Selected day detail — cuộn tới đây khi bấm « Xem lịch » */}
          {selectedDay && (
            <div
              ref={selectedDayDetailRef}
              id="events-calendar-day-detail"
              className="mt-4 border-t pt-4 scroll-mt-24"
            >
              <h3 className="text-sm font-bold text-gray-800 mb-3 flex flex-wrap items-center gap-2">
                <span>📅 Ngày {selectedDay}/{month}/{year}</span>
                <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                  {selectedDayEvents.length} sự kiện
                </span>
              </h3>
              <p className="text-xs text-gray-500 mb-3">
                Khảo sát / lịch trong ngày — đủ thông tin; nhấn thẻ để chỉnh sửa.
              </p>
              {selectedDayEvents.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center border border-dashed border-gray-200 rounded-xl bg-gray-50">
                  Không có sự kiện trong ngày này
                </p>
              ) : (
                <div className="space-y-4">
                  {selectedDayEvents.map((ev) => (
                    <SelectedDayEventDetail key={ev.id} ev={ev} eventTypes={eventTypes} onEdit={onEdit} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// EVENT LIST VIEW — Bảng danh sách sự kiện kèm hành động nhanh
// ═══════════════════════════════════════════════════════════════
function EventListView({
  events, eventTypes, loading, rangeFrom, rangeTo, loadError, emptyHints,
  onClearFilters, onViewAllTime, onEdit, onDelete, onCancel, onStatusChange, currentUser,
}) {
  const [sortKey, setSortKey] = useState('start_time');
  const [sortDir, setSortDir] = useState('desc');
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');

  const typeBySlug = useMemo(() => new Map(eventTypes.map((t) => [t.slug, t])), [eventTypes]);

  const sorted = useMemo(() => {
    const arr = [...events];
    const dir = sortDir === 'asc' ? 1 : -1;
    const cmpStr = (a, b) => String(a || '').localeCompare(String(b || ''), 'vi', { sensitivity: 'base' });
    arr.sort((a, b) => {
      let av; let bv;
      switch (sortKey) {
        case 'title': av = a.title; bv = b.title; return dir * cmpStr(av, bv);
        case 'type':
          av = (typeBySlug.get(a.event_type)?.name) || a.event_type || '';
          bv = (typeBySlug.get(b.event_type)?.name) || b.event_type || '';
          return dir * cmpStr(av, bv);
        case 'status': return dir * cmpStr(a.status, b.status);
        case 'module': return dir * cmpStr(a.module, b.module);
        case 'assignee': return dir * cmpStr(a.assignee?.full_name, b.assignee?.full_name);
        case 'creator': return dir * cmpStr(a.creator?.full_name, b.creator?.full_name);
        case 'customer': return dir * cmpStr(a.customer?.full_name, b.customer?.full_name);
        case 'location': return dir * cmpStr(a.location, b.location);
        case 'start_time':
        default: {
          const at = a.start_time ? new Date(a.start_time).getTime() : 0;
          const bt = b.start_time ? new Date(b.start_time).getTime() : 0;
          return dir * (at - bt);
        }
      }
    });
    return arr;
  }, [events, sortKey, sortDir, typeBySlug]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'start_time' ? 'desc' : 'asc');
    }
  };
  const sortIndicator = (key) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  const headerBtn = (key, label, extra = '') => (
    <button
      type="button"
      onClick={() => toggleSort(key)}
      className={`inline-flex items-center gap-0.5 font-semibold uppercase tracking-wide ${sortKey === key ? 'text-blue-700' : 'text-gray-600'} hover:text-blue-700`}
    >
      {label}{sortIndicator(key)}{extra && <span className="ml-1">{extra}</span>}
    </button>
  );

  const fmtDateTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return `${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' })} ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Table2 className="h-4 w-4 text-gray-500" /> Danh sách sự kiện
          <span className="text-xs font-normal text-gray-400">
            ({events.length} sự kiện{rangeFrom || rangeTo ? ` · ${rangeFrom || '...'} → ${rangeTo || '...'}` : ''})
          </span>
        </h2>
        <span className="text-[11px] text-gray-400">Click tiêu đề cột để sắp xếp</span>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <div
          className="overflow-auto"
          style={{ maxHeight: 'calc(100vh - 340px)', minHeight: 320 }}
        >
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>
          ) : sorted.length === 0 ? (
            <EventsEmptyState
              loadError={loadError}
              hints={emptyHints}
              onClearFilters={onClearFilters}
              onViewAllTime={onViewAllTime}
              showViewAllTime={!!(rangeFrom || rangeTo)}
            />
          ) : (
            <table className="w-full text-sm min-w-max border-separate border-spacing-0">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide">
                  {[
                    { k: 'start_time', label: 'Thời gian' },
                    { k: 'title', label: 'Tiêu đề' },
                    { k: 'type', label: 'Loại' },
                    { k: 'module', label: 'Khối' },
                    { k: 'status', label: 'Trạng thái' },
                    { k: 'assignee', label: 'Phụ trách' },
                    { k: 'creator', label: 'Người tạo' },
                    { k: 'customer', label: 'Khách hàng' },
                    { k: 'location', label: 'Địa điểm' },
                  ].map((c) => (
                    <th
                      key={c.k}
                      className="px-3 py-2.5 font-semibold whitespace-nowrap bg-gray-100 border-b border-gray-300 sticky top-0 z-20"
                    >
                      {headerBtn(c.k, c.label)}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap bg-gray-100 border-b border-gray-300 sticky top-0 z-20 text-right">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="[&_tr:not(:last-child)>td]:border-b [&_tr>td]:border-gray-200">
                {sorted.map((ev) => {
                  const typeInfo = typeBySlug.get(ev.event_type) || ev.event_type_ref
                    || { icon: '📋', name: ev.event_type, color: '#6B7280' };
                  const statusInfo = STATUS_MAP[ev.status] || STATUS_MAP.planned;
                  const mm = moduleMeta(ev.module);
                  const canManage = isAdminLike(currentUser)
                    || String(ev.created_by || '') === String(currentUser?.id || '');
                  return (
                    <tr
                      key={ev.id}
                      onClick={() => onEdit(ev)}
                      className="hover:bg-blue-50/60 cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 tabular-nums">
                        <div className="font-medium text-gray-900">{fmtDateTime(ev.start_time)}</div>
                        {ev.end_time && (
                          <div className="text-[10px] text-gray-400">→ {fmtDateTime(ev.end_time)}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-800 max-w-[320px]">
                        <div className="font-semibold text-gray-900 truncate" title={ev.title}>
                          <span className="mr-1">{typeInfo.icon}</span>{ev.title}
                        </div>
                        {ev.description && (
                          <div className="text-[11px] text-gray-500 truncate" title={ev.description}>{ev.description}</div>
                        )}
                        {ev.lead && (
                          <div className="text-[11px] text-blue-600 truncate" title={`${ev.lead.code} — ${ev.lead.title}`}>
                            🔗 {ev.lead.code} — {ev.lead.title}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs">
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium text-[10px]"
                          style={{ backgroundColor: `${typeInfo.color || '#6B7280'}22`, color: typeInfo.color || '#6B7280' }}
                        >
                          {typeInfo.icon} {typeInfo.name}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium text-[10px] border ${mm.color}`}>
                          {mm.emoji} {mm.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium text-[10px] ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                        {ev.status === 'cancelled' && ev.cancel_reason && (
                          <div className="text-[10px] text-red-600 max-w-[200px] truncate mt-0.5" title={ev.cancel_reason}>
                            Lý do: {ev.cancel_reason}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700">
                        {ev.assignee?.full_name || <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700">
                        {ev.creator?.full_name || <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 max-w-[200px] truncate" title={ev.customer?.full_name || ''}>
                        {ev.customer?.full_name
                          ? `${ev.customer.full_name}${ev.customer.phone ? ` · ${ev.customer.phone}` : ''}`
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 max-w-[200px] truncate" title={ev.location || ''}>
                        {ev.location || <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-right">
                        <div className="inline-flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                          {ev.status === 'planned' && (
                            <button
                              onClick={() => onStatusChange(ev.id, 'in_progress')}
                              title="Bắt đầu"
                              className="p-1 text-amber-600 hover:bg-amber-50 rounded cursor-pointer"
                            >▶</button>
                          )}
                          {ev.status === 'in_progress' && (
                            <button
                              onClick={() => onStatusChange(ev.id, 'completed')}
                              title="Hoàn thành"
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => onEdit(ev)}
                            title="Sửa"
                            className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded cursor-pointer"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          {canManage && ev.status !== 'cancelled' && ev.status !== 'completed' && (
                            <button
                              onClick={() => { setCancelTarget(ev); setCancelReason(ev.cancel_reason || ''); }}
                              title="Hủy sự kiện"
                              className="p-1 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded cursor-pointer"
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {canManage && (
                            <button
                              onClick={() => onDelete(ev.id)}
                              title="Xóa sự kiện"
                              className="p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500 flex flex-wrap justify-between gap-x-4 gap-y-1 border-t">
          <span>Hiển thị: {sorted.length.toLocaleString('vi-VN')} sự kiện</span>
          {(rangeFrom || rangeTo) && (
            <span>Khoảng: {rangeFrom || '...'} → {rangeTo || '...'}</span>
          )}
        </div>
      </div>

      {cancelTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setCancelTarget(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Ban className="h-4 w-4 text-amber-600" /> Hủy sự kiện
            </h3>
            <p className="text-xs text-gray-500">
              Sự kiện «{cancelTarget.title}» sẽ chuyển sang trạng thái «Đã hủy» và lưu lý do — không bị xóa khỏi hệ thống.
            </p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={4}
              autoFocus
              placeholder="Nhập lý do hủy (bắt buộc)…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-400 outline-none"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
              >Đóng</button>
              <button
                type="button"
                disabled={!cancelReason.trim()}
                onClick={async () => {
                  await onCancel(cancelTarget.id, cancelReason);
                  setCancelTarget(null);
                }}
                className="px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >Xác nhận hủy</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// EVENT TYPES MANAGER — CRUD loại sự kiện
// ═══════════════════════════════════════════════════════════════
function EventTypesManager({ types, onReload }) {
  const [form, setForm] = useState({ name: '', icon: '📋', color: '#6B7280', stage_slug: '', description: '' });
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  const STAGE_OPTIONS = [
    { value: '', label: '— Không liên kết —' },
    { value: 'consulting', label: 'Tư vấn' },
    { value: 'design', label: 'Thiết kế' },
    { value: 'quotation', label: 'Báo giá' },
    { value: 'contract', label: 'Hợp đồng' },
    { value: 'production', label: 'Sản xuất' },
    { value: 'shipping', label: 'Giao hàng' },
    { value: 'installation', label: 'Lắp đặt' },
    { value: 'customer-care', label: 'Chăm sóc KH' },
  ];

  const save = async () => {
    if (!form.name.trim()) return alert('Nhập tên loại sự kiện');
    setSaving(true);
    try {
      if (editId) {
        await api.put(`/events/event-types/${editId}`, form);
      } else {
        await api.post('/events/event-types', form);
      }
      setForm({ name: '', icon: '📋', color: '#6B7280', stage_slug: '', description: '' });
      setEditId(null);
      onReload();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setSaving(false);
  };

  const startEdit = (t) => {
    setEditId(t.id);
    setForm({ name: t.name, icon: t.icon || '📋', color: t.color || '#6B7280', stage_slug: t.stage_slug || '', description: t.description || '' });
  };

  const handleDelete = async (id) => {
    if (!confirm('Xóa loại sự kiện này?')) return;
    try { await api.delete(`/events/event-types/${id}`); onReload(); }
    catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  return (
    <div className="bg-white rounded-xl border p-6">
      <h2 className="text-lg font-bold text-gray-900 mb-4">⚙️ Quản lý loại sự kiện</h2>

      {/* Add/Edit form */}
      <div className="flex flex-wrap items-end gap-3 mb-6 p-4 bg-gray-50 rounded-lg">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Icon</label>
          <input value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
            className="w-16 h-9 px-2 border rounded-lg text-center text-lg" />
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="text-xs font-medium text-gray-600 block mb-1">Tên loại *</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="VD: Khảo sát" className="w-full h-9 px-3 border rounded-lg text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Màu</label>
          <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
            className="w-9 h-9 rounded-lg border cursor-pointer" />
        </div>
        <div className="min-w-[140px]">
          <label className="text-xs font-medium text-gray-600 block mb-1">Giai đoạn liên kết</label>
          <select value={form.stage_slug} onChange={e => setForm(f => ({ ...f, stage_slug: e.target.value }))}
            className="w-full h-9 px-2 border rounded-lg text-sm">
            {STAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <button onClick={save} disabled={saving}
          className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50">
          {editId ? '💾 Cập nhật' : '➕ Thêm'}
        </button>
        {editId && (
          <button onClick={() => { setEditId(null); setForm({ name: '', icon: '📋', color: '#6B7280', stage_slug: '', description: '' }); }}
            className="h-9 px-3 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm cursor-pointer">Hủy</button>
        )}
      </div>

      {/* Types list */}
      <div className="space-y-2">
        {types.map(t => (
          <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg"
              style={{ backgroundColor: (t.color || '#6B7280') + '20' }}>{t.icon}</div>
            <div className="flex-1">
              <span className="text-sm font-semibold text-gray-900">{t.name}</span>
              {t.stage_slug && <span className="text-xs text-gray-400 ml-2">→ {t.stage_slug}</span>}
              {t.is_system && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded ml-2">Mặc định</span>}
            </div>
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: t.color || '#6B7280' }} />
            <button onClick={() => startEdit(t)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded cursor-pointer"><Edit3 className="h-4 w-4" /></button>
            {!t.is_system && (
              <button onClick={() => handleDelete(t.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded cursor-pointer"><Trash2 className="h-4 w-4" /></button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
