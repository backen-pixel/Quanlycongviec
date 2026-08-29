import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike, isCompanyScopedAdmin } from '../lib/adminRole';
import { formatDate, formatVND } from '../lib/utils';
import KanbanColumnVirtualList from '../components/KanbanColumnVirtualList';
import ResponsiveTable from '../components/ResponsiveTable';
import { WorkUnifiedOpenTabProvider, workUnifiedPath } from '../components/WorkUnifiedOpenTabMenu';
import {
  RefreshCw, Plus, FileText, Package, ChevronLeft, ChevronRight,
  List, LayoutGrid, Clock, Phone, Calendar, EyeOff, Eye, X, Search, Users,
} from 'lucide-react';
import SearchInlineFilterChips, { SearchClearButton, AdvFilterButton, searchGroupClass } from '../components/SearchInlineFilterChips';
import WorkUnifiedFilterPanel, {
  WORK_UNIFIED_TIME_PRESETS,
  WORK_UNIFIED_REGION_NONE,
  getWorkUnifiedPresetDateRange,
  loadWorkUnifiedEmployees,
  filterWorkUnifiedStaff,
} from '../components/WorkUnifiedFilterFields';

const PAGE_SIZE = 20;

const KANBAN_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#ec4899', '#6366f1'];

/** Gom hạn Work Unified — khớp Deadline SX: Quá hạn / Hôm nay / tuần / tháng / sau tháng này. */
const WU_DEADLINE_BUCKETS = [
  { key: 'overdue', label: 'Quá hạn', color: '#dc2626' },
  { key: 'today', label: 'Hôm nay', color: '#ea580c' },
  { key: 'this_week', label: 'Tuần này', color: '#d97706' },
  { key: 'next_week', label: 'Tuần sau', color: '#0891b2' },
  { key: 'this_month', label: 'Tháng này', color: '#0d9488' },
  { key: 'later', label: 'Sau tháng này', color: '#475569' },
  { key: 'none', label: 'Chưa có deadline', color: '#9ca3af' },
];

function wuDeadlineRaw(it) {
  return it?.deadline || it?.production_deadline || it?.delivery_date || it?.install_date || null;
}

function startOfLocalDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function resolveWuDeadlineBucket(it, todayMs = Date.now()) {
  const raw = wuDeadlineRaw(it);
  if (!raw) return 'none';
  const t = new Date(raw);
  if (!Number.isFinite(t.getTime())) return 'none';
  const today = startOfLocalDay(new Date(todayMs));
  const diffDays = Math.floor((startOfLocalDay(t).getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return 'overdue';
  if (diffDays === 0) return 'today';
  const dow = today.getDay() === 0 ? 7 : today.getDay();
  const daysToEndOfWeek = 7 - dow;
  if (diffDays <= daysToEndOfWeek) return 'this_week';
  if (diffDays <= daysToEndOfWeek + 7) return 'next_week';
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  endOfMonth.setHours(23, 59, 59, 999);
  if (t.getTime() <= endOfMonth.getTime()) return 'this_month';
  return 'later';
}

const FORECAST_TABS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'on_track', label: 'Đúng tiến độ' },
  { key: 'at_risk', label: 'Nguy cơ trễ' },
  { key: 'late', label: 'Trễ hạn' },
];

const FORECAST_BADGE_CLS = {
  on_track: 'bg-emerald-50 text-emerald-700',
  at_risk: 'bg-amber-50 text-amber-700',
  late: 'bg-red-50 text-red-700',
  unknown: 'bg-gray-100 text-gray-500',
};

function forecastLabel(it) {
  if (it.forecast === 'late') return `Trễ hạn ${it.delay_days || 0} ngày`;
  if (it.forecast === 'at_risk') return 'Nguy cơ trễ';
  if (it.forecast === 'on_track') return 'Đúng tiến độ';
  return 'Chưa có hạn';
}

const MODULE_BADGE_CLS = {
  crm: 'bg-emerald-600 text-white',
  sx: 'bg-orange-600 text-white',
  vc: 'bg-amber-600 text-white',
};

function shortDate(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.slice(-2).map((p) => p[0]).join('').toUpperCase();
}

function WorkUnifiedListProjectLink({ it }) {
  const fullName = String(it.name || '').trim();
  return (
    <Link
      to={workUnifiedPath(it.id)}
      data-wu-open-tab={it.id}
      title={fullName || undefined}
      className="block min-w-0"
    >
      <span className="text-sm font-semibold text-blue-700 hover:underline truncate block">{fullName || '—'}</span>
      <span className="text-xs text-gray-500 truncate mt-0.5 block">{it.code}</span>
    </Link>
  );
}

function WorkKanbanCard({ it }) {
  const modules = [
    it.has_crm && { key: 'crm', label: 'CRM' },
    it.has_sx && { key: 'sx', label: 'SX' },
    it.has_vc && { key: 'vc', label: 'VC' },
  ].filter(Boolean);
  const isMultiModule = modules.length >= 2;

  const people = [it.person1_name, it.person2_name].filter(Boolean);

  const dateBits = [];
  if (it.production_deadline) dateBits.push(`Hạn SX ${shortDate(it.production_deadline)}`);
  if (it.delivery_date) dateBits.push(`Giao ${shortDate(it.delivery_date)}`);
  if (it.install_date) dateBits.push(`Lắp ${shortDate(it.install_date)}`);

  const overdue = it.forecast === 'late';
  const atRisk = it.forecast === 'at_risk';
  const dateTone = overdue ? 'text-red-600' : atRisk ? 'text-amber-600' : 'text-gray-500';

  return (
    <Link
      to={workUnifiedPath(it.id)}
      data-wu-open-tab={it.id}
      title="Chuột phải để mở tab mới"
      className="block rounded-lg border border-gray-100 bg-white px-2.5 py-2 shadow-sm hover:shadow-md hover:border-gray-200 transition-shadow space-y-1"
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-xs font-bold text-violet-700 truncate">{it.code}</span>
        {isMultiModule && (
          <span className="shrink-0 text-[9px] font-semibold px-1 py-0.5 rounded-full bg-violet-50 text-violet-700 whitespace-nowrap">
            ĐA MODULE
          </span>
        )}
      </div>
      <p className="text-xs font-bold text-gray-900 leading-snug line-clamp-1" title={it.name}>{it.name}</p>
      {(it.deal_code || people[0]) && (
        <p className="text-[11px] text-gray-500 flex items-center gap-1 min-w-0">
          <FileText className="h-3 w-3 shrink-0 text-gray-400" />
          <span className="truncate">{[it.deal_code, people[0]].filter(Boolean).join(' · ')}</span>
        </p>
      )}
      {dateBits.length > 0 && (
        <p className={`text-[11px] flex items-center gap-1 min-w-0 ${dateTone}`}>
          <Clock className="h-3 w-3 shrink-0" />
          <span className="truncate">{dateBits.join(' · ')}</span>
        </p>
      )}
      {(it.customer_name || it.customer_phone) && (
        <p className="text-[11px] text-gray-500 flex items-center gap-1 min-w-0">
          <Phone className="h-3 w-3 shrink-0 text-gray-400" />
          <span className="truncate">{[it.customer_name, it.customer_phone].filter(Boolean).join(' · ')}</span>
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 min-w-0">
          {people.length > 0 && (
            <span className="h-4 w-4 rounded-full bg-blue-500 text-white text-[8px] font-bold flex items-center justify-center shrink-0" title={people.join(', ')}>
              {initials(people[0])}
            </span>
          )}
          {modules.map((m) => (
            <span key={m.key} className={`text-[9px] font-bold px-1 py-0.5 rounded ${MODULE_BADGE_CLS[m.key]}`}>
              {m.label}
            </span>
          ))}
        </div>
        {it.value ? (
          <span className="text-xs font-bold text-emerald-600 whitespace-nowrap shrink-0">{formatVND(it.value)}</span>
        ) : null}
      </div>
    </Link>
  );
}

/** 1 cột Kanban — tự quản ref cuộn riêng để ảo hoá (@tanstack/react-virtual) khi cột có nhiều thẻ (>=8). */
function WorkKanbanColumn({ col }) {
  const scrollRef = useRef(null);
  // Chỉ mount KanbanColumnVirtualList sau khi scrollRef đã gắn vào DOM (tick kế tiếp) —
  // tránh useVirtualizer khởi tạo lúc scrollRef.current còn null, khiến getVirtualItems() rỗng.
  const [scrollReady, setScrollReady] = useState(false);
  useEffect(() => { setScrollReady(true); }, []);
  return (
    <div
      data-col-slug={col.slug}
      className="flex flex-col flex-shrink-0 w-[260px] h-full min-h-[28rem] rounded-xl border border-gray-100 bg-gray-50/70 overflow-hidden"
    >
      <div className="h-1 w-full shrink-0" style={{ backgroundColor: col.color }} aria-hidden />
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-white border-b border-gray-100 shrink-0">
        <span className="text-xs font-bold text-gray-700 truncate flex items-center gap-1.5 min-w-0">
          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: col.color }} />
          <span className="truncate">{col.label}</span>
        </span>
        <span
          className="text-[11px] font-bold tabular-nums px-2 py-0.5 rounded-full shrink-0"
          style={{ backgroundColor: `${col.color}18`, color: col.color }}
        >
          {col.items.length}
        </span>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 p-2 overflow-y-auto"
      >
        {col.items.length === 0 ? (
          <div className="text-center py-8 text-[11px] text-gray-300 border border-dashed border-gray-200 rounded-lg bg-white/40">
            Không có dự án
          </div>
        ) : scrollReady ? (
          <KanbanColumnVirtualList
            items={col.items}
            columnScrollRef={scrollRef}
            compact
            renderCard={(it) => <WorkKanbanCard it={it} />}
          />
        ) : null}
      </div>
    </div>
  );
}

const WEEKDAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function parseDateStr(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function CalendarEventLink({ ev, className, children, title }) {
  return (
    <Link
      to={workUnifiedPath(ev.itemId)}
      data-wu-open-tab={ev.itemId}
      title={title || 'Chuột phải để mở tab mới'}
      className={className || 'block rounded-lg border border-gray-200 bg-white p-2.5 hover:shadow-sm hover:border-gray-300 transition-shadow'}
    >
      {children}
    </Link>
  );
}

function CalendarDayFeed({ activeDay, isExplicitSelection, events, onClear, onShiftDay, onPickDate, toneClass }) {
  const d = parseDateStr(activeDay);
  const weekday = d ? WEEKDAY_SHORT[d.getDay()] : '';
  const dayNum = d ? d.getDate() : '';
  const fullLabel = d
    ? d.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/60 p-3">
      <div className="flex items-center justify-between mb-2.5 gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={() => onShiftDay(-1)}
            title="Ngày trước"
            className="shrink-0 h-7 w-7 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 cursor-pointer"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <div className="shrink-0 w-11 rounded-lg text-center py-1 bg-white border border-gray-200">
            <p className="text-[9px] font-bold uppercase leading-tight text-gray-400">{weekday}</p>
            <p className="text-base font-bold leading-none text-gray-800">{dayNum}</p>
          </div>
          <button
            type="button"
            onClick={() => onShiftDay(1)}
            title="Ngày sau"
            className="shrink-0 h-7 w-7 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 cursor-pointer"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <div className="min-w-0 ml-1">
            <p className="text-sm font-bold text-gray-900 capitalize truncate">{fullLabel}</p>
            <p className="text-xs text-gray-500">{events.length} mốc trong ngày</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <input
            type="date"
            value={activeDay || ''}
            onChange={(e) => e.target.value && onPickDate(e.target.value)}
            title="Chọn ngày bất kỳ"
            className="h-7 px-1.5 text-xs border border-gray-200 rounded-md text-gray-600 bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-violet-200"
          />
          {isExplicitSelection && (
            <button
              type="button"
              onClick={onClear}
              title="Bỏ chọn — quay về hôm nay"
              className="shrink-0 h-7 w-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {events.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-6">Không có mốc SX/Giao/Lắp nào trong ngày này.</p>
      ) : (
        <div className="space-y-2">
          {events.map((ev) => (
            <CalendarEventLink key={ev.id} ev={ev}>
              <div className="flex items-center gap-1.5 flex-wrap mb-1">
                <Package className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                <span className="text-sm font-bold text-gray-900">{ev.code}</span>
                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full border ${toneClass(ev)}`}>{ev.label}</span>
                {ev.overdue && (
                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">Quá hạn</span>
                )}
              </div>
              <p className="text-sm font-semibold text-gray-800 line-clamp-1" title={ev.name}>{ev.name}</p>
              {(ev.dealCode || ev.stageLabel) && (
                <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5 min-w-0">
                  <FileText className="h-3 w-3 shrink-0 text-gray-400" />
                  <span className="truncate">{[ev.dealCode, ev.stageLabel].filter(Boolean).join(' · ')}</span>
                </p>
              )}
              {(ev.customerName || ev.customerPhone) && (
                <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5 min-w-0">
                  <Phone className="h-3 w-3 shrink-0 text-gray-400" />
                  <span className="truncate">{[ev.customerName, ev.customerPhone].filter(Boolean).join(' · ')}</span>
                </p>
              )}
              <div className="flex items-center gap-2 flex-wrap mt-1.5">
                {ev.modules.map((m) => (
                  <span
                    key={m}
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      m === 'CRM' ? 'bg-emerald-600 text-white' : m === 'SX' ? 'bg-orange-600 text-white' : 'bg-amber-600 text-white'
                    }`}
                  >
                    {m}
                  </span>
                ))}
                {ev.person && <span className="text-xs text-gray-500">· {ev.person}</span>}
              </div>
            </CalendarEventLink>
          ))}
        </div>
      )}
    </div>
  );
}

export default function WorkUnifiedOverviewPage() {
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);
  const isCompanyScoped = isCompanyScopedAdmin(user);
  const canPickCompany = isAdmin && !isCompanyScoped;
  const [searchParams] = useSearchParams();

  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const lockedCompanyLabel = useMemo(() => {
    const cid = user?.company_id != null ? String(user.company_id).trim() : '';
    const c = companies.find((x) => String(x.id) === cid);
    return c?.short_name || c?.name || 'Công ty của bạn';
  }, [user?.company_id, companies]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [forecastFilter, setForecastFilter] = useState(() => {
    const f = String(searchParams.get('forecast') || '').trim();
    return FORECAST_TABS.some((t) => t.key === f) ? f : 'all';
  });
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState('list');
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [calendarMode, setCalendarMode] = useState('sx');
  const [selectedDay, setSelectedDay] = useState(null);
  const [showCalendarGrid, setShowCalendarGrid] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterUserId, setFilterUserId] = useState('');
  const [filterRegionId, setFilterRegionId] = useState('');
  const [timePreset, setTimePreset] = useState('');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [users, setUsers] = useState([]);
  const [regions, setRegions] = useState([]);
  const searchBoxRef = useRef(null);
  const resultsCardRef = useRef(null);
  const kanbanBoardRef = useRef(null);
  const pageMountedRef = useRef(false);

  useEffect(() => {
    api.get('/companies', { params: { for_module: 'crm' } }).then((res) => {
      const list = Array.isArray(res.data) ? res.data : (res.data?.companies || []);
      setCompanies(list);
    }).catch(() => setCompanies([]));
  }, []);

  const effectiveCompanyIdForUsers = useMemo(() => {
    if (canPickCompany) return companyId || '';
    const cid = user?.company_id != null ? String(user.company_id).trim() : '';
    return cid || '';
  }, [canPickCompany, companyId, user?.company_id]);

  useEffect(() => {
    let cancelled = false;
    const cid = effectiveCompanyIdForUsers;
    if (!cid && !canPickCompany) {
      setUsers([]);
      return undefined;
    }
    if (!cid && canPickCompany && companies.length === 0) {
      setUsers([]);
      return undefined;
    }
    loadWorkUnifiedEmployees({
      companyId: cid,
      companies,
      canPickCompany,
    }).then((list) => {
      if (!cancelled) setUsers(list);
    }).catch(() => {
      if (!cancelled) setUsers([]);
    });
    return () => { cancelled = true; };
  }, [effectiveCompanyIdForUsers, canPickCompany, companies]);

  useEffect(() => {
    const params = {};
    if (effectiveCompanyIdForUsers) {
      params.company_id = effectiveCompanyIdForUsers;
    } else if (canPickCompany && companies.length > 0) {
      params.company_ids = companies.map((c) => c.id).join(',');
    } else {
      setRegions([]);
      return;
    }
    api.get('/crm/company-regions', { params })
      .then((r) => setRegions((Array.isArray(r.data) ? r.data : []).filter((rg) => rg.is_active !== false)))
      .catch(() => setRegions([]));
  }, [effectiveCompanyIdForUsers, canPickCompany, companies]);

  useEffect(() => {
    setFilterUserId('');
    setFilterRegionId('');
  }, [effectiveCompanyIdForUsers]);

  useEffect(() => {
    if (!filterUserId) return;
    const ok = filterWorkUnifiedStaff(users, { companyId, regionId: filterRegionId })
      .some((u) => String(u.id) === String(filterUserId));
    if (!ok) setFilterUserId('');
  }, [users, companyId, filterRegionId, filterUserId]);

  /** Debounce ô tìm kiếm 300ms — tránh gọi API/lọc lại toàn bộ danh sách trên mỗi phím gõ (quan trọng khi công ty có hàng nghìn dự án). */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const handleTimePresetChange = (preset) => {
    setTimePreset(preset);
    const range = getWorkUnifiedPresetDateRange(preset);
    setRangeFrom(range.from);
    setRangeTo(range.to);
  };

  const activeFilterCount = [
    !!filterUserId, !!filterRegionId, !!timePreset, canPickCompany && !!companyId,
  ].filter(Boolean).length;

  const wuInlineFilterChips = useMemo(() => {
    const chips = [];
    if (canPickCompany && companyId) {
      const c = companies.find((x) => String(x.id) === String(companyId));
      chips.push({
        key: 'company',
        label: c?.short_name || c?.name || 'Công ty',
        onClear: () => setCompanyId(''),
      });
    }
    if (filterUserId) {
      const u = users.find((x) => String(x.id) === String(filterUserId));
      chips.push({
        key: 'user',
        label: u?.full_name || 'Nhân viên',
        onClear: () => setFilterUserId(''),
      });
    }
    if (filterRegionId === WORK_UNIFIED_REGION_NONE) {
      chips.push({
        key: 'region',
        label: 'Chưa gán khu vực',
        onClear: () => setFilterRegionId(''),
      });
    } else if (filterRegionId) {
      const rg = regions.find((x) => String(x.id) === String(filterRegionId));
      chips.push({
        key: 'region',
        label: rg?.name || 'Khu vực',
        onClear: () => setFilterRegionId(''),
      });
    }
    if (timePreset) {
      const t = WORK_UNIFIED_TIME_PRESETS.find((x) => x.key === timePreset);
      chips.push({
        key: 'time',
        label: t?.label || 'Thời gian',
        onClear: () => handleTimePresetChange(''),
      });
    }
    return chips;
  }, [canPickCompany, companyId, companies, filterUserId, users, filterRegionId, regions, timePreset]);

  const emptyResultsMessage = useMemo(() => {
    if (filterRegionId === WORK_UNIFIED_REGION_NONE) {
      return 'Không có dự án nào chưa gán khu vực.';
    }
    if (filterRegionId) {
      const regionName = regions.find((r) => String(r.id) === String(filterRegionId))?.name;
      return `Không có dự án nào thuộc khu vực${regionName ? ` "${regionName}"` : ' này'}.`;
    }
    return 'Không có dự án phù hợp bộ lọc.';
  }, [filterRegionId, regions]);

  const clearAdvancedFilters = () => {
    setFilterUserId('');
    setFilterRegionId('');
    setTimePreset('');
    setRangeFrom('');
    setRangeTo('');
    if (canPickCompany) setCompanyId('');
  };

  useEffect(() => { setPage(1); }, [stageFilter, forecastFilter, companyId, debouncedSearch, filterUserId, filterRegionId, rangeFrom, rangeTo]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (stageFilter) params.stage = stageFilter;
      if (forecastFilter !== 'all') params.forecast = forecastFilter;
      if (canPickCompany && companyId) params.company_id = companyId;
      if (debouncedSearch) params.search = debouncedSearch;
      if (filterUserId) params.user_id = filterUserId;
      if (filterRegionId) params.region_id = filterRegionId;
      if (rangeFrom) params.date_from = rangeFrom;
      if (rangeTo) params.date_to = rangeTo;
      // Chỉ phân trang ở view Danh sách — Kanban / Deadline / Planner / Lịch cần đủ tập đã lọc.
      if (viewMode === 'list') {
        params.page = page;
        params.page_size = PAGE_SIZE;
      }
      const res = await api.get('/management/work-unified', { params });
      setData(res.data);
    } catch (e) {
      setError(e?.response?.data?.error || 'Không tải được dữ liệu dự án');
    } finally {
      setLoading(false);
    }
  }, [
    stageFilter, forecastFilter, canPickCompany, companyId, debouncedSearch,
    filterUserId, filterRegionId, rangeFrom, rangeTo, viewMode, page,
  ]);

  useEffect(() => { load(); }, [load]);

  /**
   * Có dữ liệu mới (đổi filter/trang/company/view...) và có kết quả → tự cuộn tới khung
   * kết quả để người dùng thấy ngay, không phải tự cuộn tay. Bỏ qua lần tải đầu (mount).
   */
  useEffect(() => {
    if (!data) return;
    if (!pageMountedRef.current) { pageMountedRef.current = true; return; }
    if (viewMode !== 'list') return;
    if ((data.items || []).length > 0) {
      resultsCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [data, viewMode]);

  const companyName = useMemo(() => {
    if (canPickCompany) {
      if (!companyId) return 'tất cả công ty';
      return companies.find((c) => String(c.id) === String(companyId))?.name || 'công ty đã chọn';
    }
    return companies.find((c) => String(c.id) === String(user?.company_id))?.name || companies[0]?.name || 'công ty bạn';
  }, [canPickCompany, companyId, companies, user?.company_id]);

  const stages = data?.stages || [];
  // Ở view Danh sách, backend đã trả đúng 1 trang (page/page_size) + total của toàn bộ tập đã lọc.
  // Ở Kanban / Deadline / Planner / Lịch, backend trả đủ tập đã lọc (không phân trang).
  const items = data?.items || [];
  const stats = data?.stats || { total: 0, on_track: 0, at_risk: 0, late: 0 };
  const totalFiltered = data?.total ?? items.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
  const pageStart = (page - 1) * PAGE_SIZE;
  const pageItems = items;

  const kanbanColumns = useMemo(() => {
    const bySlug = new Map();
    stages.forEach((s, i) => {
      bySlug.set(s.slug, { slug: s.slug, label: s.label, color: KANBAN_COLORS[i % KANBAN_COLORS.length], items: [] });
    });
    const unassigned = { slug: '__none', label: 'Chưa xác định', color: '#9ca3af', items: [] };
    items.forEach((it) => {
      const col = it.current_stage_slug && bySlug.get(it.current_stage_slug);
      if (col) col.items.push(it);
      else unassigned.items.push(it);
    });
    const cols = Array.from(bySlug.values());
    if (unassigned.items.length) cols.push(unassigned);
    return cols;
  }, [stages, items]);

  const deadlineColumns = useMemo(() => {
    const out = WU_DEADLINE_BUCKETS.map((b) => ({
      slug: b.key,
      label: b.label,
      color: b.color,
      items: [],
    }));
    const byKey = new Map(out.map((c) => [c.slug, c]));
    items.forEach((it) => {
      const key = resolveWuDeadlineBucket(it);
      (byKey.get(key) || byKey.get('none')).items.push(it);
    });
    out.forEach((col) => {
      col.items.sort((a, b) => String(wuDeadlineRaw(a) || '').localeCompare(String(wuDeadlineRaw(b) || '')));
    });
    return out;
  }, [items]);

  const plannerColumns = useMemo(() => {
    const map = new Map();
    const unassigned = { slug: '__none', label: 'Chưa gán', color: '#9ca3af', items: [] };
    items.forEach((it) => {
      const name = String(it.assignee_name || it.person1_name || '').trim();
      if (!name) {
        unassigned.items.push(it);
        return;
      }
      if (!map.has(name)) {
        map.set(name, {
          slug: name,
          label: name,
          color: KANBAN_COLORS[map.size % KANBAN_COLORS.length],
          items: [],
        });
      }
      map.get(name).items.push(it);
    });
    const cols = Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'vi'));
    if (unassigned.items.length) cols.push(unassigned);
    return cols;
  }, [items]);

  /**
   * Đang tìm kiếm ở view Kanban → dự án khớp có thể nằm ở cột đã cuộn khuất bên phải.
   * Tự cuộn ngang bảng Kanban tới cột đầu tiên có kết quả để người dùng thấy ngay.
   */
  useEffect(() => {
    if (viewMode !== 'kanban' || !debouncedSearch) return;
    const target = kanbanColumns.find((c) => c.items.length > 0);
    if (!target || !kanbanBoardRef.current) return;
    const raf = requestAnimationFrame(() => {
      const el = kanbanBoardRef.current?.querySelector(`[data-col-slug="${window.CSS?.escape ? CSS.escape(target.slug) : target.slug}"]`);
      el?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    });
    return () => cancelAnimationFrame(raf);
  }, [viewMode, debouncedSearch, kanbanColumns]);

  const calendarEventsByDay = useMemo(() => {
    const map = new Map();
    const dayKey = (raw) => {
      if (!raw) return null;
      const s = String(raw);
      return s.length >= 10 ? s.substring(0, 10) : null;
    };
    const todayStr = dayKey(new Date().toISOString());
    items.forEach((it) => {
      const modules = [it.has_crm && 'CRM', it.has_sx && 'SX', it.has_vc && 'VC'].filter(Boolean);
      const person = it.person1_name || it.person2_name || null;
      const addEvent = (kind, label, at, tone) => {
        const dateStr = dayKey(at);
        if (!dateStr) return;
        if (!map.has(dateStr)) map.set(dateStr, []);
        map.get(dateStr).push({
          id: `${it.id}-${kind}`,
          itemId: it.id,
          code: it.code,
          name: it.name,
          label,
          modules,
          person,
          dealCode: it.deal_code,
          customerName: it.customer_name,
          customerPhone: it.customer_phone,
          stageLabel: it.current_stage_label,
          tone,
          overdue: dateStr < todayStr,
        });
      };
      if (calendarMode === 'sx') {
        addEvent('deadline', 'Hạn SX', it.production_deadline, 'deadline');
      } else {
        addEvent('delivery', 'Giao', it.delivery_date, 'delivery');
        addEvent('install', 'Lắp', it.install_date, 'install');
      }
    });
    const order = { deadline: 0, delivery: 1, install: 2 };
    map.forEach((list) => list.sort((a, b) => (order[a.tone] ?? 9) - (order[b.tone] ?? 9)));
    return map;
  }, [items, calendarMode]);

  const calendarWeeks = useMemo(() => {
    const y = calMonth.getFullYear();
    const m = calMonth.getMonth();
    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const weeks = [];
    let week = new Array(firstDay).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      week.push({ day: d, date: dateStr });
      if (week.length === 7) { weeks.push(week); week = []; }
    }
    if (week.length > 0) { while (week.length < 7) week.push(null); weeks.push(week); }
    return weeks;
  }, [calMonth]);

  const calendarToneClass = (ev) => {
    if (ev.overdue) return 'bg-red-50 text-red-700 border-red-200';
    if (ev.tone === 'deadline') return 'bg-green-50 text-green-700 border-green-200';
    if (ev.tone === 'delivery') return 'bg-yellow-50 text-yellow-700 border-yellow-200';
    if (ev.tone === 'install') return 'bg-purple-50 text-purple-700 border-purple-200';
    return 'bg-blue-50 text-blue-700 border-blue-200';
  };

  const todayDateStr = new Date().toISOString().substring(0, 10);

  const applySelectedDay = (d) => {
    if (!d) return;
    const y = d.getFullYear();
    const m = d.getMonth();
    const day = d.getDate();
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDay(dateStr);
    setCalMonth((cm) => (cm.getFullYear() === y && cm.getMonth() === m) ? cm : new Date(y, m, 1));
  };
  const shiftSelectedDay = (delta) => {
    const base = parseDateStr(selectedDay || todayDateStr);
    if (!base) return;
    base.setDate(base.getDate() + delta);
    applySelectedDay(base);
  };
  const pickSelectedDay = (dateStr) => applySelectedDay(parseDateStr(dateStr));

  // Khoá chiều cao bằng màn hình CHỈ cho Kanban/Lịch — các view đó cần đáy cố định để cột
  // tự cuộn. Dạng Danh sách mà khoá thì phần trên (tiêu đề + 10 công đoạn + KPI) ăn mất
  // ~313px, danh sách chỉ còn ~454px cho 1.287px nội dung → xem được rất ít dòng.
  return (
    <WorkUnifiedOpenTabProvider>
    <div className={`flex flex-col gap-3 w-full pb-3 ${
      viewMode === 'list'
        ? 'min-h-[calc(100vh-0.75rem)]'
        : 'h-[calc(100vh-0.75rem)] max-h-[calc(100vh-0.75rem)] overflow-hidden'
    }`}>
      <div className="shrink-0">
        <h1 className="text-xl font-bold" style={{ color: '#111827' }}>Work Unified</h1>
        <p className="text-sm mt-0.5" style={{ color: '#6b7280' }}>
          Danh sách toàn bộ dự án của {companyName}, xuyên suốt từ lúc chốt khách hàng đến khi bàn giao
        </p>
      </div>

      <div className="sticky top-0 z-30 shrink-0 flex items-center justify-between flex-wrap gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2.5 shadow-sm">
        <div ref={searchBoxRef} className="relative flex-1 min-w-0 max-w-none sm:max-w-[22rem] lg:max-w-[28rem]">
            <div
              className={`group/search flex items-center shrink-0 w-full rounded-md border transition-colors ${
                searchGroupClass({
                  focused: searchFocused,
                  hasQuery: !!search.trim(),
                  hasChips: wuInlineFilterChips.length > 0,
                  panelOpen: filterPanelOpen,
                })
              }`}
            >
              <div className="relative flex-1 min-w-0 flex items-center gap-1 pl-7 pr-1">
                <Search
                  className={`absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none transition-colors ${
                    searchFocused || search.trim() ? 'text-violet-600' : 'text-slate-400'
                  }`}
                />
                {!filterPanelOpen && wuInlineFilterChips.length > 0 && (
                  <SearchInlineFilterChips
                    chips={wuInlineFilterChips}
                    opacityClass={
                      searchFocused ? 'opacity-40' : search.trim() ? 'opacity-35' : 'opacity-45 group-hover/search:opacity-100'
                    }
                    onClearChip={(chip) => { chip.onClear(); }}
                    onClearAll={clearAdvancedFilters}
                    showClearAll={wuInlineFilterChips.length > 1}
                  />
                )}
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setSearchFocused(true);
                  }}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
                  placeholder="Tìm mã, tên dự án, khách hàng, deal..."
                  className={`flex-1 min-w-[3.5rem] h-8 bg-transparent border-0 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 ${search ? 'pr-7' : ''}`}
                />
                {search && (
                  <SearchClearButton onClick={() => { setSearch(''); setSearchFocused(false); }} />
                )}
              </div>
              <div className="shrink-0 pr-1">
                <AdvFilterButton
                  open={filterPanelOpen}
                  active={activeFilterCount > 0}
                  onClick={() => setFilterPanelOpen((v) => !v)}
                />
              </div>
            </div>

            {filterPanelOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setFilterPanelOpen(false)} />
                <WorkUnifiedFilterPanel
                  onClose={() => setFilterPanelOpen(false)}
                  canPickCompany={canPickCompany}
                  lockedCompanyLabel={lockedCompanyLabel}
                  companies={companies}
                  companyId={companyId}
                  onCompanyChange={setCompanyId}
                  users={users}
                  filterUserId={filterUserId}
                  onUserChange={setFilterUserId}
                  regions={regions}
                  filterRegionId={filterRegionId}
                  onRegionChange={setFilterRegionId}
                  timePreset={timePreset}
                  onTimePresetChange={handleTimePresetChange}
                  activeFilterCount={activeFilterCount}
                  onClear={clearAdvancedFilters}
                />
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
          <Link
            to="/projects/create"
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            Tạo dự án
          </Link>
          </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>
      )}

      <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm shrink-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">
          {stages.length} công đoạn
        </p>
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setStageFilter('')}
            className={`shrink-0 text-xs font-medium px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${
              !stageFilter ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            Tất cả
          </button>
          {stages.map((s) => (
            <button
              key={s.slug}
              type="button"
              onClick={() => setStageFilter(s.slug)}
              className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${
                stageFilter === s.slug ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${stageFilter === s.slug ? 'bg-white' : 'bg-blue-400'}`} />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
        {[
          { key: 'all', label: 'Đang thực hiện', value: stats.total, valueCls: 'text-gray-900' },
          { key: 'on_track', label: 'Đúng tiến độ', value: stats.on_track, valueCls: 'text-emerald-600' },
          { key: 'at_risk', label: 'Nguy cơ trễ', value: stats.at_risk, valueCls: 'text-amber-600' },
          { key: 'late', label: 'Trễ hạn', value: stats.late, valueCls: 'text-red-600' },
        ].map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={() => setForecastFilter(card.key)}
            className={`rounded-xl border bg-white px-4 py-3 shadow-sm text-left cursor-pointer transition-colors ${
              forecastFilter === card.key ? 'border-emerald-400 ring-1 ring-emerald-200' : 'border-gray-100 hover:border-gray-200'
            }`}
          >
            <p className="text-xs text-gray-500">{card.label}</p>
            <p className={`text-2xl font-bold mt-1 ${card.valueCls}`}>{loading ? '…' : card.value}</p>
          </button>
        ))}
      </div>

      <div ref={resultsCardRef} className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between gap-2 p-2 border-b border-gray-100 flex-wrap shrink-0">
          <div className="flex items-center gap-1 overflow-x-auto">
            {FORECAST_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setForecastFilter(t.key)}
                className={`shrink-0 text-sm font-medium px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                  forecastFilter === t.key ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t.label} · {t.key === 'all' ? stats.total : stats[t.key] || 0}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 shrink-0 rounded-lg border border-gray-200 p-0.5 overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              title="Xem dạng danh sách"
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md cursor-pointer transition-colors ${
                viewMode === 'list' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <List className="h-3.5 w-3.5" />
              Danh sách
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              title="Xem dạng Kanban theo công đoạn"
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md cursor-pointer transition-colors ${
                viewMode === 'kanban' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Kanban
            </button>
            <button
              type="button"
              onClick={() => setViewMode('deadline')}
              title="Xem dạng Deadline — gom theo hạn bàn giao / hạn SX"
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md cursor-pointer transition-colors ${
                viewMode === 'deadline' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              Deadline
            </button>
            <button
              type="button"
              onClick={() => setViewMode('planner')}
              title="Xem dạng Planner — gom theo người phụ trách"
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md cursor-pointer transition-colors ${
                viewMode === 'planner' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              Planner
            </button>
            <div className="relative group">
              <button
                type="button"
                onClick={() => setViewMode('calendar')}
                title="Xem dạng Lịch — hover để chọn Lịch SX / VC-LĐ"
                className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md cursor-pointer transition-colors ${
                  viewMode === 'calendar'
                    ? calendarMode === 'sx' ? 'bg-green-600 text-white' : 'bg-purple-600 text-white'
                    : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                <Calendar className="h-3.5 w-3.5" />
                {viewMode === 'calendar' ? (calendarMode === 'sx' ? 'Lịch SX' : 'Lịch VC-LĐ') : 'Lịch'}
              </button>
              {/* pt-1 (không phải mt-1) để vùng đệm vẫn nằm trong hitbox hover — tránh mất hover khi rê chuột xuống */}
              <div className="hidden group-hover:block absolute right-0 top-full pt-1 z-20 min-w-[140px]">
                <div className="flex flex-col gap-0.5 p-1 rounded-lg border border-gray-200 bg-white shadow-lg">
                  <button
                    type="button"
                    onClick={() => { setViewMode('calendar'); setCalendarMode('sx'); }}
                    className={`text-left text-xs font-medium px-2.5 py-1.5 rounded-md cursor-pointer transition-colors ${
                      viewMode === 'calendar' && calendarMode === 'sx' ? 'bg-green-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Lịch SX
                  </button>
                  <button
                    type="button"
                    onClick={() => { setViewMode('calendar'); setCalendarMode('vc'); }}
                    className={`text-left text-xs font-medium px-2.5 py-1.5 rounded-md cursor-pointer transition-colors ${
                      viewMode === 'calendar' && calendarMode === 'vc' ? 'bg-purple-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Lịch VC-LĐ
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {viewMode === 'calendar' ? (
          <div className="p-4 flex-1 min-h-0 overflow-y-auto">
            <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCalMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                  className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <h3 className="text-base font-bold text-gray-900">
                  {(() => {
                    const label = calMonth.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
                    return label.charAt(0).toUpperCase() + label.slice(1);
                  })()}
                </h3>
                <button
                  type="button"
                  onClick={() => setCalMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                  className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowCalendarGrid((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer"
              >
                {showCalendarGrid ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {showCalendarGrid ? 'Ẩn' : 'Hiện'}
              </button>
            </div>

            {loading ? (
              <div className="px-4 py-8 text-center text-gray-400 text-sm">Đang tải...</div>
            ) : (
              <>
                {showCalendarGrid && (
                  <>
                    <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-t-lg overflow-hidden">
                      {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map((d) => (
                        <div key={d} className="bg-gray-50 p-2 text-center text-xs font-bold text-gray-500">{d}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-b-lg overflow-hidden">
                      {calendarWeeks.flat().map((cell, i) => {
                        if (!cell) return <div key={i} className="bg-gray-50 min-h-[110px]" />;
                        const isToday = cell.date === todayDateStr;
                        const isSelected = cell.date === selectedDay;
                        const events = calendarEventsByDay.get(cell.date) || [];
                        const MAX_SHOW = 3;
                        const shown = events.slice(0, MAX_SHOW);
                        const more = events.length - shown.length;
                        return (
                          <div
                            key={i}
                            onClick={() => setSelectedDay(cell.date)}
                            className={`bg-white p-1.5 min-h-[110px] flex flex-col cursor-pointer transition-colors hover:bg-gray-50/80 ${
                              isSelected ? 'ring-2 ring-inset ring-violet-500 bg-violet-50/40' : isToday ? 'ring-2 ring-inset ring-blue-400' : ''
                            }`}
                          >
                            <div className={`text-[11px] font-semibold mb-1 ${isToday ? 'text-blue-600 font-bold bg-blue-100 rounded-full w-6 h-6 flex items-center justify-center' : 'text-gray-500'}`}>
                              {cell.day}
                            </div>
                            <div className="space-y-1 flex-1">
                              {shown.map((ev) => (
                                <CalendarEventLink
                                  key={ev.id}
                                  ev={ev}
                                  className={`block rounded-md border px-1 py-0.5 hover:brightness-95 transition-[filter] ${calendarToneClass(ev)}`}
                                  title={[ev.code, ev.name, ev.label, ev.stageLabel, ev.modules.join(' · '), ev.person, 'Chuột phải: mở tab mới'].filter(Boolean).join(' — ')}
                                >
                                  <div className="flex items-center justify-between gap-0.5">
                                    <span className="text-[9px] font-extrabold font-mono truncate">{ev.code}</span>
                                    <span className="text-[8px] font-bold uppercase opacity-90 shrink-0">{ev.label}</span>
                                  </div>
                                  <p className="text-[9px] font-semibold leading-tight line-clamp-2 opacity-95">{ev.name}</p>
                                  {ev.modules.length > 0 && (
                                    <div className="flex items-center gap-0.5 mt-0.5 flex-wrap">
                                      {ev.modules.map((m) => (
                                        <span
                                          key={m}
                                          className={`text-[7px] font-extrabold px-0.5 rounded ${
                                            m === 'CRM' ? 'bg-emerald-100 text-emerald-800' : m === 'SX' ? 'bg-orange-100 text-orange-800' : 'bg-amber-100 text-amber-900'
                                          }`}
                                        >
                                          {m}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </CalendarEventLink>
                              ))}
                              {more > 0 && (
                                <div className="text-[9px] text-center font-semibold text-slate-500 bg-slate-50 rounded border border-slate-200 py-0.5">
                                  +{more} mốc nữa
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-3 text-[10px] text-gray-600">
                      {calendarMode === 'sx' ? (
                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500 inline-block" /> Hạn SX</span>
                      ) : (
                        <>
                          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-500 inline-block" /> Giao</span>
                          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-purple-500 inline-block" /> Lắp</span>
                        </>
                      )}
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500 inline-block" /> Quá hạn</span>
                      <span className="text-slate-400">Click 1 ngày để xem chi tiết bên dưới · click thẻ để mở dự án</span>
                    </div>
                  </>
                )}

                <CalendarDayFeed
                  activeDay={selectedDay || todayDateStr}
                  isExplicitSelection={!!selectedDay}
                  events={calendarEventsByDay.get(selectedDay || todayDateStr) || []}
                  onClear={() => { setSelectedDay(null); setCalMonth(() => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), 1); }); }}
                  onShiftDay={shiftSelectedDay}
                  onPickDate={pickSelectedDay}
                  toneClass={calendarToneClass}
                />
              </>
            )}
          </div>
        ) : viewMode === 'kanban' || viewMode === 'deadline' || viewMode === 'planner' ? (
          <div className="p-3 flex-1 min-h-0">
            {loading ? (
              <div className="px-4 py-8 text-center text-gray-400 text-sm">Đang tải...</div>
            ) : items.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-400 text-sm">{emptyResultsMessage}</div>
            ) : (
              <div ref={viewMode === 'kanban' ? kanbanBoardRef : undefined} className="flex gap-3 overflow-x-auto h-full min-h-[28rem] items-stretch">
                {(viewMode === 'kanban' ? kanbanColumns : viewMode === 'deadline' ? deadlineColumns : plannerColumns).map((col) => (
                  <WorkKanbanColumn key={col.slug} col={col} />
                ))}
              </div>
            )}
          </div>
        ) : (
        <>
        {/* Không cuộn trong khung nữa — để bảng trải hết và cuộn theo trang,
            nếu không danh sách bị bóp còn ~454px trong khi nội dung cao 1.287px. */}
        <div>
        {loading ? (
          <p className="px-4 py-8 text-center text-gray-400 text-sm">Đang tải...</p>
        ) : (
          <ResponsiveTable
            rows={pageItems}
            rowKey={(it) => it.id}
            empty={emptyResultsMessage}
            tableClassName="min-w-[960px] table-fixed"
            colWidths={['w-[18%]', 'w-[16%]', 'w-[20%]', 'w-[8%]', 'w-[13%]', 'w-[13%]', 'w-[12%]']}
            columns={[
              {
                key: 'project',
                header: 'Dự án',
                primary: true,
                cellClassName: 'px-4 py-3 align-top',
                cell: (it) => <WorkUnifiedListProjectLink it={it} />,
              },
              {
                key: 'customer',
                header: 'Khách hàng → Deal',
                secondary: true,
                cellClassName: 'px-4 py-3 align-top',
                cell: (it) => (
                  <>
                    <span className="text-sm text-gray-800 truncate block" title={it.customer_name || ''}>{it.customer_name || '—'}</span>
                    {it.deal_code && (
                      <span className="text-xs text-violet-600 truncate block mt-0.5" title={it.deal_title || ''}>{it.deal_code}</span>
                    )}
                  </>
                ),
              },
              {
                key: 'stage',
                header: 'Công đoạn hiện tại',
                cellClassName: 'px-4 py-3 align-top',
                cell: (it) => (
                  <>
                    <span className="flex items-center gap-0.5 mb-1">
                      {it.flow.map((s) => (
                        <span
                          key={s.key}
                          title={s.label}
                          className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                            s.status === 'done' ? 'bg-emerald-500' : s.status === 'current' ? 'bg-blue-500' : 'bg-gray-200'
                          }`}
                        />
                      ))}
                    </span>
                    <span className="text-xs text-gray-600 truncate block">{it.current_stage_label || '—'}</span>
                  </>
                ),
              },
              {
                key: 'progress',
                header: 'Tiến độ',
                cellClassName: 'px-4 py-3 align-top text-gray-700 font-medium',
                cell: (it) => `${it.progress_pct}%`,
              },
              {
                key: 'forecast',
                header: 'Trạng thái',
                cellClassName: 'px-4 py-3 align-top',
                cell: (it) => (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${FORECAST_BADGE_CLS[it.forecast]}`}>
                    {forecastLabel(it)}
                  </span>
                ),
              },
              {
                key: 'assignee',
                header: 'Người phụ trách',
                cellClassName: 'px-4 py-3 align-top text-gray-600 truncate',
                cell: (it) => it.assignee_name || '—',
              },
              {
                key: 'deadline',
                header: 'Hạn bàn giao',
                cellClassName: 'px-4 py-3 align-top text-gray-600 whitespace-nowrap',
                cell: (it) => (it.deadline ? formatDate(it.deadline) : '—'),
              },
            ]}
          />
        )}
        </div>

        {!loading && totalFiltered > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              Hiển thị <span className="font-medium text-gray-700">{pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, totalFiltered)}</span> trong tổng số{' '}
              <span className="font-medium text-gray-700">{totalFiltered}</span> dự án
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Trang trước"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="h-8 w-8 rounded-full border border-gray-200 bg-white text-gray-600 flex items-center justify-center disabled:opacity-40 cursor-pointer hover:bg-gray-50"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm text-gray-600 px-1">
                Trang <span className="font-medium text-gray-800">{page}</span> / {totalPages}
              </span>
              <button
                type="button"
                aria-label="Trang sau"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="h-8 w-8 rounded-full border border-gray-200 bg-white text-gray-600 flex items-center justify-center disabled:opacity-40 cursor-pointer hover:bg-gray-50"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
        </>
        )}
      </div>
    </div>
    </WorkUnifiedOpenTabProvider>
  );
}
