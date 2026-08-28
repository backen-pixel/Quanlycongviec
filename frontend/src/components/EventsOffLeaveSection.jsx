import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../lib/api';
import { loadLeaveScheduleUi, patchLeaveScheduleUi } from '../lib/leaveScheduleStorage';
import { useLeaveFilterActions } from '../lib/useLeaveFilterActions';
import { downloadLeavesExcel } from '../lib/leaveScheduleExport';
import { fetchLeaveCompanyStaff } from '../lib/leaveStaffApi';
import LeaveActiveFilterBar from './LeaveActiveFilterBar';
import LeaveStaffSearchSelect from './LeaveStaffSearchSelect';
import {
  leavePersonCalendarLabel,
  leavePersonDisplayName,
  resolveLeaveUser,
  buildLeaveUsersById,
  leaveTypeAndHalfLabel,
  formatLeaveNote,
  resolveLeaveCalendarChipKind,
} from '../lib/leaveScheduleUtils';
import {
  CRM_TIME_PRESETS,
  getCrmDateRangeFromPreset,
} from '../lib/crmDateRangePresets';
import DateRangePickerPopover from './DateRangePickerPopover';
import ResponsiveTable from './ResponsiveTable';
import ScopeFilterBar from '../shared/components/ScopeFilterBar';
import {
  Calendar, ChevronLeft, ChevronRight, Loader2, UserMinus,
  Plus, X, Trash2, Clock, FileSpreadsheet, CalendarRange, Filter, MapPin, Pencil,
  MoreHorizontal, CalendarPlus,
} from 'lucide-react';

const LEAVE_TYPES = [
  { v: 'paid', l: 'Phép có lương', color: '#8B5CF6' },
  { v: 'unpaid', l: 'Phép không lương', color: '#6B7280' },
  { v: 'sick', l: 'Nghỉ ốm', color: '#EF4444' },
  { v: 'business_trip', l: 'Công tác', color: '#3B82F6' },
  { v: 'remote', l: 'Làm online', color: '#10B981' },
  { v: 'other', l: 'Khác', color: '#F59E0B' },
];
const HALF_DAY = [
  { v: 'full', l: 'Cả ngày' },
  { v: 'morning', l: 'Sáng' },
  { v: 'afternoon', l: 'Chiều' },
];
const MONTH_NAMES = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
];
const DAY_NAMES = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

const EMPTY_FORM = {
  user_id: '',
  start_date: '',
  end_date: '',
  leave_type: 'paid',
  half_day: 'full',
  reason: '',
  status: 'pending',
};

function leaveTypeMeta(v) {
  return LEAVE_TYPES.find((t) => t.v === v) || LEAVE_TYPES[LEAVE_TYPES.length - 1];
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function isoDate(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function expandLeaveToDays(leave, year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStart = isoDate(year, month, 1);
  const monthEnd = isoDate(year, month, daysInMonth);
  const start = leave.start_date > monthStart ? leave.start_date : monthStart;
  const end = leave.end_date < monthEnd ? leave.end_date : monthEnd;
  const out = [];
  if (start > end) return out;
  const cur = new Date(`${start}T12:00:00`);
  const endD = new Date(`${end}T12:00:00`);
  while (cur <= endD) {
    out.push(cur.getDate());
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function holidaysForMonth(holidays, year, month) {
  const out = [];
  (holidays || []).forEach((h) => {
    const d = String(h.holiday_date || '');
    if (h.repeat_yearly) {
      const [, mm, dd] = d.split('-');
      if (Number(mm) === month) out.push({ day: Number(dd), name: h.name, id: h.id });
    } else if (d.startsWith(`${year}-${pad(month)}-`)) {
      out.push({ day: Number(d.split('-')[2]), name: h.name, id: h.id });
    }
  });
  return out;
}

function fmtCreatedAt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const WEEKDAY_LABELS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

function leaveTypeDisplayLabel(v) {
  if (v === 'paid') return 'Nghỉ phép';
  if (v === 'remote') return 'Làm online';
  return leaveTypeMeta(v).l;
}

function halfDayDisplayLabel(v) {
  if (v === 'morning') return 'Buổi sáng';
  if (v === 'afternoon') return 'Buổi chiều';
  return 'Cả ngày';
}

function formatLeaveDateWithWeekday(startDate, endDate) {
  if (!startDate) return '—';
  const d = new Date(`${startDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return startDate;
  const dateText = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const weekday = WEEKDAY_LABELS[d.getDay()];
  if (!endDate || endDate === startDate) return `${dateText} (${weekday})`;
  const end = new Date(`${endDate}T12:00:00`);
  const endText = end.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${dateText} → ${endText}`;
}

function formatUpcomingDateBlock(isoDateStr) {
  if (!isoDateStr) return { day: '—', month: '' };
  const d = new Date(`${isoDateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return { day: '—', month: '' };
  return {
    day: String(d.getDate()).padStart(2, '0'),
    month: `TH ${d.getMonth() + 1}`,
  };
}

function buildDayCalendarChips(dayLeaves, holiday, usersById, currentUser) {
  const chips = [];
  if (holiday) {
    chips.push({
      key: `h-${holiday.id}`,
      kind: 'holiday',
      label: holiday.name || 'Ngày lễ',
      title: holiday.name || 'Ngày lễ',
    });
  }
  const active = (dayLeaves || []);
  active.slice(0, 4).forEach((l) => {
    const kind = resolveLeaveCalendarChipKind(l);
    const typeLabel = leaveTypeAndHalfLabel(l);
    const person = leavePersonCalendarLabel(l, usersById, currentUser);
    const user = resolveLeaveUser(l, usersById, currentUser);
    chips.push({
      key: String(l.id),
      kind,
      person,
      typeLabel,
      label: `${person} · ${typeLabel}`,
      title: `${user?.full_name || person} — ${formatLeaveNote(l)}`,
      leave: l,
    });
  });
  if (active.length > 4) {
    chips.push({
      key: 'more',
      kind: 'more',
      label: `+${active.length - 4} người`,
      title: `${active.length} đơn nghỉ trong ngày`,
    });
  }
  return chips;
}

function LeaveCreateSticker() {
  return (
    <div className="shrink-0 w-[76px] h-[76px]" aria-hidden>
      <svg viewBox="0 0 76 76" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-sm">
        <circle cx="38" cy="38" r="36" fill="#F5F3FF" />
        <circle cx="38" cy="38" r="36" stroke="#EDE9FE" strokeWidth="1.5" />
        <rect x="16" y="20" width="36" height="34" rx="5" fill="#fff" stroke="#8B5CF6" strokeWidth="1.5" />
        <rect x="16" y="20" width="36" height="11" rx="5" fill="#8B5CF6" />
        <rect x="16" y="26" width="36" height="5" fill="#7C3AED" />
        <line x1="24" y1="16" x2="24" y2="24" stroke="#A78BFA" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="44" y1="16" x2="44" y2="24" stroke="#A78BFA" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="26" cy="38" r="2" fill="#C4B5FD" />
        <circle cx="34" cy="38" r="2" fill="#C4B5FD" />
        <circle cx="42" cy="38" r="2" fill="#C4B5FD" />
        <circle cx="26" cy="46" r="2" fill="#DDD6FE" />
        <circle cx="34" cy="46" r="2.5" fill="#8B5CF6" />
        <circle cx="42" cy="46" r="2" fill="#DDD6FE" />
        <ellipse cx="58" cy="58" rx="10" ry="4" fill="#BBF7D0" opacity="0.7" />
        <path d="M58 52 C54 48 50 54 52 58 C54 62 58 64 62 58 C64 54 60 48 58 52Z" fill="#4ADE80" />
        <path d="M62 50 C66 46 68 52 65 56 C63 58 60 56 62 50Z" fill="#22C55E" />
        <rect x="54" y="54" width="8" height="9" rx="1.5" fill="#FB923C" />
        <path d="M12 58 L18 52 L22 56 L28 48 L34 54" stroke="#F472B6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
      </svg>
    </div>
  );
}

function LeaveLegendPanel() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <h3 className="text-[15px] font-bold text-gray-900 mb-3">Chú thích</h3>
      <ul className="space-y-3">
        <li className="flex gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-violet-600 mt-1 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-gray-900">Nghỉ phép</p>
            <p className="text-xs text-gray-500 mt-0.5">Nghỉ nguyên ngày</p>
          </div>
        </li>
        <li className="flex gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-pink-400 mt-1 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-gray-900">Nửa ngày</p>
            <p className="text-xs text-gray-500 mt-0.5">Nghỉ 1 buổi (sáng hoặc chiều)</p>
          </div>
        </li>
        <li className="flex gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-gray-900">Làm online</p>
            <p className="text-xs text-gray-500 mt-0.5">Làm việc từ xa (cả ngày hoặc nửa ngày)</p>
          </div>
        </li>
        <li className="flex gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-orange-400 mt-1 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-gray-900">Ngày lễ</p>
            <p className="text-xs text-gray-500 mt-0.5">Ngày nghỉ lễ, tết</p>
          </div>
        </li>
        <li className="flex gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-gray-400 mt-1 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-gray-900">Hôm nay</p>
            <p className="text-xs text-gray-500 mt-0.5">Ngày hiện tại</p>
          </div>
        </li>
      </ul>
    </div>
  );
}

export default function EventsOffLeaveSection({
  companyId,
  departmentId,
  isSystemAdmin,
  scope,
  currentUser,
  isManager,
  persistUi = false,
}) {
  const location = useLocation();
  const initialUi = useMemo(() => (persistUi ? loadLeaveScheduleUi() : null), [persistUi]);
  const [month, setMonth] = useState(() => initialUi?.month ?? new Date().getMonth() + 1);
  const [year, setYear] = useState(() => initialUi?.year ?? new Date().getFullYear());
  const [leaves, setLeaves] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [users, setUsers] = useState([]);
  const [regions, setRegions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [showDateRangePicker, setShowDateRangePicker] = useState(false);
  const [timePreset, setTimePreset] = useState(() => initialUi?.timePreset ?? '');
  const [rangeFrom, setRangeFrom] = useState(() => initialUi?.rangeFrom ?? '');
  const [rangeTo, setRangeTo] = useState(() => initialUi?.rangeTo ?? '');
  const [filterUserId, setFilterUserId] = useState(() => initialUi?.filterUserId ?? '');
  const [filterRegionId, setFilterRegionId] = useState(() => initialUi?.filterRegionId ?? '');
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingLeaveId, setEditingLeaveId] = useState(null);
  /** Khu vực trong form tạo — đồng bộ từ bộ lọc danh sách khi mở form */
  const [createFormRegionId, setCreateFormRegionId] = useState('');
  const [createFormUsers, setCreateFormUsers] = useState([]);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [rowMenuOpenId, setRowMenuOpenId] = useState(null);

  const openCreateForm = useCallback((prefill = null) => {
    setEditingLeaveId(null);
    setCreateFormRegionId(filterRegionId || '');
    setShowCreateForm(true);
    setErr(null);
    setForm({ ...EMPTY_FORM, user_id: isManager ? '' : (currentUser?.id || ''), ...(prefill || {}) });
  }, [filterRegionId, isManager, currentUser?.id]);

  const openEditForm = useCallback((leave) => {
    setEditingLeaveId(leave.id);
    setCreateFormRegionId(filterRegionId || '');
    setShowCreateForm(true);
    setErr(null);
    setForm({
      user_id: leave.user_id || '',
      start_date: leave.start_date || '',
      end_date: leave.end_date || '',
      leave_type: leave.leave_type || 'paid',
      half_day: leave.half_day || 'full',
      reason: leave.reason || '',
      status: leave.status || 'pending',
    });
  }, [filterRegionId]);

  const closeCreateForm = useCallback(() => {
    setShowCreateForm(false);
    setEditingLeaveId(null);
    setCreateFormRegionId('');
    setForm({ ...EMPTY_FORM, user_id: isManager ? '' : (currentUser?.id || '') });
  }, [isManager, currentUser?.id]);

  const canEditLeave = useCallback((l) => {
    const isOwn = String(l.user_id) === String(currentUser?.id);
    if (isManager) return true;
    return isOwn;
  }, [isManager, currentUser?.id]);

  const canDeleteLeave = useCallback((l) => {
    const isOwn = String(l.user_id) === String(currentUser?.id);
    if (isManager) return true;
    return isOwn;
  }, [isManager, currentUser?.id]);

  const persistUiPatch = useCallback((patch) => {
    if (persistUi) patchLeaveScheduleUi(patch);
  }, [persistUi]);

  const changeMonth = useCallback((nextMonth, nextYear) => {
    setMonth(nextMonth);
    setYear(nextYear);
    persistUiPatch({ month: nextMonth, year: nextYear });
  }, [persistUiPatch]);

  const changeFilterUser = useCallback((v) => {
    setFilterUserId(v);
    persistUiPatch({ filterUserId: v });
  }, [persistUiPatch]);

  const changeFilterRegion = useCallback((v) => {
    setFilterRegionId(v);
    persistUiPatch({ filterRegionId: v });
  }, [persistUiPatch]);

  const persistTimeRange = useCallback((preset, from, to) => {
    persistUiPatch({ timePreset: preset, rangeFrom: from, rangeTo: to });
  }, [persistUiPatch]);

  const handleTimePresetChange = useCallback((preset) => {
    setTimePreset(preset);
    if (preset === 'custom') {
      setShowDateRangePicker(true);
      return;
    }
    if (preset === '') {
      setRangeFrom('');
      setRangeTo('');
      persistTimeRange('', '', '');
      return;
    }
    const range = getCrmDateRangeFromPreset(preset);
    setRangeFrom(range.from);
    setRangeTo(range.to);
    persistTimeRange(preset, range.from, range.to);
  }, [persistTimeRange]);

  const monthBounds = useMemo(() => {
    const last = new Date(year, month, 0).getDate();
    return { from: isoDate(year, month, 1), to: isoDate(year, month, last) };
  }, [month, year]);

  /** Khoảng ngày dùng cho API / lọc danh sách / xuất Excel */
  const effectiveRange = useMemo(() => {
    if (rangeFrom || rangeTo) return { from: rangeFrom, to: rangeTo };
    return monthBounds;
  }, [rangeFrom, rangeTo, monthBounds]);

  const buildLeaveQueryParams = useCallback((extra = {}) => {
    const p = { ...extra };
    if (effectiveRange.from) p.from = effectiveRange.from;
    if (effectiveRange.to) p.to = effectiveRange.to;
    if (companyId) p.company_id = companyId;
    if (departmentId) p.department_id = departmentId;
    if (filterRegionId) p.region_id = filterRegionId;
    if (filterUserId) p.user_id = filterUserId;
    return p;
  }, [effectiveRange.from, effectiveRange.to, companyId, departmentId, filterRegionId, filterUserId]);

  const showCalendarMonthChip = false;

  const { activeFilterChips, hasActiveFilters, clearFilters } = useLeaveFilterActions({
    scope,
    isSystemAdmin,
    filterRegionId,
    filterUserId,
    timePreset,
    rangeFrom,
    rangeTo,
    regions,
    users,
    month,
    year,
    showCalendarMonth: showCalendarMonthChip,
    changeFilterRegion,
    changeFilterUser,
    handleTimePresetChange,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const leaveParams = buildLeaveQueryParams();
      const [leaveRes, holRes] = await Promise.all([
        api.get('/kpi/leaves', { params: leaveParams }),
        api.get('/kpi/holidays', { params: companyId ? { company_id: companyId } : {} }),
      ]);
      setLeaves(leaveRes.data?.leaves || []);
      setHolidays(holRes.data?.holidays || []);
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
      setLeaves([]);
    } finally {
      setLoading(false);
    }
  }, [buildLeaveQueryParams, companyId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (location.state?.openCreate) openCreateForm();
  }, [location.state?.openCreate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    changeFilterUser('');
    changeFilterRegion('');
  }, [companyId, departmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!companyId) {
      setUsers([]);
      setRegions([]);
      return;
    }
    Promise.all([
      fetchLeaveCompanyStaff(companyId, {
        departmentId: departmentId || '',
        regionId: filterRegionId || '',
      }).catch(() => []),
      api.get('/crm/company-regions', { params: { company_id: companyId } }).then((r) => (Array.isArray(r.data) ? r.data : [])).catch(() => []),
    ]).then(([u, rg]) => {
      setUsers(u);
      setRegions(rg);
    });
  }, [companyId, departmentId, filterRegionId]);

  /** NV trong form tạo — theo công ty (+ khu vực form); không khóa theo phòng ban bộ lọc danh sách. */
  useEffect(() => {
    if (!showCreateForm || !isManager || !companyId) {
      setCreateFormUsers([]);
      return;
    }
    let cancelled = false;
    fetchLeaveCompanyStaff(companyId, {
      departmentId: '',
      regionId: createFormRegionId || '',
    })
      .then((list) => { if (!cancelled) setCreateFormUsers(list); })
      .catch(() => { if (!cancelled) setCreateFormUsers([]); });
    return () => { cancelled = true; };
  }, [showCreateForm, isManager, companyId, createFormRegionId]);

  useEffect(() => {
    if (!showCreateForm) return;
    setForm((f) => (f.user_id ? { ...f, user_id: '' } : f));
  }, [companyId, departmentId, createFormRegionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredLeaves = useMemo(() => [...leaves], [leaves]);

  const usersById = useMemo(
    () => buildLeaveUsersById(users, filteredLeaves, currentUser),
    [users, filteredLeaves, currentUser],
  );

  const enrichedLeaves = useMemo(
    () => filteredLeaves.map((l) => {
      const user = resolveLeaveUser(l, usersById, currentUser);
      if (user && (user.full_name || user.email)) {
        return { ...l, user };
      }
      return l;
    }),
    [filteredLeaves, usersById, currentUser],
  );

  const leavesByDay = useMemo(() => {
    const map = {};
    enrichedLeaves.forEach((l) => {
      expandLeaveToDays(l, year, month).forEach((d) => {
        if (!map[d]) map[d] = [];
        map[d].push(l);
      });
    });
    return map;
  }, [enrichedLeaves, year, month]);

  const monthHolidays = useMemo(() => holidaysForMonth(holidays, year, month), [holidays, year, month]);
  const holidaysByDay = useMemo(() => {
    const m = {};
    monthHolidays.forEach((h) => { m[h.day] = h; });
    return m;
  }, [monthHolidays]);

  const selectedDayLeaves = selectedDay ? (leavesByDay[selectedDay] || []) : [];
  const selectedHoliday = selectedDay ? holidaysByDay[selectedDay] : null;

  const prevMonth = () => {
    if (month === 1) changeMonth(12, year - 1);
    else changeMonth(month - 1, year);
    setSelectedDay(null);
  };
  const nextMonth = () => {
    if (month === 12) changeMonth(1, year + 1);
    else changeMonth(month + 1, year);
    setSelectedDay(null);
  };

  const prefillFormForDay = (day) => {
    const d = isoDate(year, month, day);
    openCreateForm({
      start_date: d,
      end_date: d,
      user_id: isManager ? '' : (currentUser?.id || ''),
    });
  };

  const deleteLeave = async (id) => {
    if (!window.confirm('Xóa đơn nghỉ này? Hành động không thể hoàn tác.')) return;
    try {
      await api.delete(`/kpi/leaves/${id}`);
      if (editingLeaveId === id) closeCreateForm();
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi xóa');
    }
  };

  const submitRequest = async () => {
    const targetUserId = isManager && form.user_id ? form.user_id : currentUser?.id;
    if (!editingLeaveId && !targetUserId) {
      setErr(isManager ? 'Chọn nhân viên' : 'Không xác định được tài khoản');
      return;
    }
    if (!form.start_date || !form.end_date) {
      setErr('Chọn ngày nghỉ từ — đến');
      return;
    }
    if (form.end_date < form.start_date) {
      setErr('Ngày kết thúc phải ≥ ngày bắt đầu');
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      if (editingLeaveId) {
        const patch = {
          start_date: form.start_date,
          end_date: form.end_date,
          leave_type: form.leave_type,
          half_day: form.half_day,
          reason: String(form.reason).trim(),
        };
        await api.patch(`/kpi/leaves/${editingLeaveId}`, patch);
      } else {
        await api.post('/kpi/leaves', {
          user_id: targetUserId,
          start_date: form.start_date,
          end_date: form.end_date,
          leave_type: form.leave_type,
          half_day: form.half_day,
          reason: String(form.reason).trim(),
        });
      }
      closeCreateForm();
      load();
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const { data } = await api.get('/kpi/leaves', { params: buildLeaveQueryParams() });
      const rows = data?.leaves || [];
      const ok = await downloadLeavesExcel(rows, {
        sheetName: 'Lịch nghỉ',
        filenamePrefix: 'lich_nghi',
        title: 'LỊCH NGHỈ PHÉP',
        from: effectiveRange.from,
        to: effectiveRange.to,
      });
      if (!ok) {
        alert('Không có đơn nghỉ nào trong khoảng thời gian/bộ lọc để xuất.');
      }
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi xuất Excel');
    } finally {
      setExporting(false);
    }
  };

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const prevMonthLastDay = new Date(year, month - 1, 0).getDate();

  const calendarGrid = useMemo(() => {
    const grid = [];
    for (let i = firstDayOfWeek - 1; i >= 0; i -= 1) {
      const d = prevMonthLastDay - i;
      const pm = month === 1 ? 12 : month - 1;
      const py = month === 1 ? year - 1 : year;
      grid.push({ day: d, month: pm, year: py, inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d += 1) {
      grid.push({ day: d, month, year, inMonth: true });
    }
    let nextDay = 1;
    const nm = month === 12 ? 1 : month + 1;
    const ny = month === 12 ? year + 1 : year;
    while (grid.length % 7 !== 0) {
      grid.push({ day: nextDay, month: nm, year: ny, inMonth: false });
      nextDay += 1;
    }
    return grid;
  }, [daysInMonth, firstDayOfWeek, prevMonthLastDay, month, year]);

  const today = new Date();

  const recentRows = useMemo(
    () => [...enrichedLeaves].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
    [enrichedLeaves],
  );

  const todayIso = useMemo(() => {
    const t = new Date();
    return isoDate(t.getFullYear(), t.getMonth() + 1, t.getDate());
  }, []);

  const upcomingLeaves = useMemo(() => (
    [...enrichedLeaves]
      .filter((l) => l.end_date >= todayIso)
      .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))
  ), [enrichedLeaves, todayIso]);

  const editingLeave = useMemo(
    () => (editingLeaveId ? enrichedLeaves.find((l) => l.id === editingLeaveId) : null),
    [editingLeaveId, enrichedLeaves],
  );

  const RECENT_LIMIT = 5;
  const UPCOMING_LIMIT = 4;

  const displayedUpcoming = showAllUpcoming ? upcomingLeaves : upcomingLeaves.slice(0, UPCOMING_LIMIT);
  const displayedRecent = showAllRecent ? recentRows : recentRows.slice(0, RECENT_LIMIT);
  const canExpandRecent = recentRows.length > RECENT_LIMIT;
  const canExpandUpcoming = upcomingLeaves.length > UPCOMING_LIMIT;

  const goToday = () => {
    const t = new Date();
    changeMonth(t.getMonth() + 1, t.getFullYear());
    setSelectedDay(t.getDate());
  };

  const monthYearOptions = useMemo(() => {
    const opts = [];
    const base = new Date(year, month - 1, 1);
    for (let i = -6; i <= 6; i += 1) {
      const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
      opts.push({
        key: `${d.getFullYear()}-${d.getMonth() + 1}`,
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        label: `Tháng ${d.getMonth() + 1}, ${d.getFullYear()}`,
      });
    }
    return opts;
  }, [month, year]);

  const createFormBlock = showCreateForm && (
    <div className="bg-white">
      <div className="flex items-center justify-between gap-2 mb-4">
        <p className="text-base font-bold text-gray-900 flex items-center gap-2">
          {editingLeaveId ? <Pencil className="h-5 w-5 text-violet-600" /> : <CalendarPlus className="h-5 w-5 text-violet-600" />}
          {editingLeaveId ? 'Sửa đơn nghỉ' : 'Tạo đơn nghỉ mới'}
        </p>
        <button
          type="button"
          onClick={closeCreateForm}
          className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-white hover:text-gray-800 cursor-pointer"
          title="Đóng"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {isManager && !editingLeaveId && (
        <div className="mb-3 p-3 bg-white/80 border border-purple-100 rounded-lg space-y-2">
          <p className="text-[10px] font-semibold text-purple-800 uppercase tracking-wide">Phạm vi tạo đơn</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {scope && (
              <ScopeFilterBar
                scope={{
                  ...scope,
                  showCompany: isSystemAdmin,
                  showDepartment: true,
                  showSearch: false,
                  showDateRange: false,
                }}
                companyLabel="Công ty"
                companyAllowAll={isSystemAdmin}
                emptyCompanyLabel={isSystemAdmin ? 'Tất cả công ty' : '—'}
                departmentDisabledWithoutCompany={!isSystemAdmin && !companyId}
                className="lg:col-span-2"
              />
            )}
            <label className="block">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Khu vực
              </span>
              <select
                value={createFormRegionId}
                onChange={(e) => {
                  setCreateFormRegionId(e.target.value);
                  setForm((f) => ({ ...f, user_id: '' }));
                }}
                disabled={!companyId}
                className="mt-0.5 w-full h-9 px-2 rounded-lg border border-slate-200 text-sm bg-white disabled:opacity-50"
              >
                <option value="">Tất cả khu vực</option>
                {regions.map((rg) => (
                  <option key={rg.id} value={rg.id}>{rg.name}{rg.code ? ` (${rg.code})` : ''}</option>
                ))}
              </select>
            </label>
          </div>
          {!companyId && (
            <p className="text-xs text-amber-700">Chọn công ty để lọc nhân viên khi tạo đơn.</p>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
        {isManager && !editingLeaveId && (
          <div className="lg:col-span-3">
            <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Nhân viên</label>
            <LeaveStaffSearchSelect
              users={createFormUsers}
              value={form.user_id}
              onChange={(id) => setForm({ ...form, user_id: id })}
              disabled={!companyId}
              placeholder="— Chọn / tìm NV —"
            />
            {companyId && createFormUsers.length === 0 && (
              <p className="text-[10px] text-gray-500 mt-0.5">Không có NV khớp phạm vi đã chọn.</p>
            )}
          </div>
        )}
        {isManager && editingLeaveId && (
          <div className="lg:col-span-3">
            <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Nhân viên</label>
            <input
              type="text"
              readOnly
              value={leavePersonDisplayName(editingLeave || { user_id: form.user_id }, usersById, currentUser)}
              className="w-full px-2 py-1.5 border rounded-lg text-sm bg-gray-100 text-gray-700"
            />
          </div>
        )}
        <div className={isManager ? 'lg:col-span-2' : 'lg:col-span-3'}>
          <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Nghỉ từ ngày</label>
          <input
            type="date"
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            className="w-full px-2 py-1.5 border rounded-lg text-sm bg-white"
          />
        </div>
        <div className={isManager ? 'lg:col-span-2' : 'lg:col-span-3'}>
          <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Đến ngày</label>
          <input
            type="date"
            value={form.end_date}
            onChange={(e) => setForm({ ...form, end_date: e.target.value })}
            className="w-full px-2 py-1.5 border rounded-lg text-sm bg-white"
          />
        </div>
        <div className="lg:col-span-2">
          <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Loại nghỉ</label>
          <select
            value={form.leave_type}
            onChange={(e) => setForm({ ...form, leave_type: e.target.value })}
            className="w-full px-2 py-1.5 border rounded-lg text-sm bg-white"
          >
            {LEAVE_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
        </div>
        <div className="lg:col-span-2">
          <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Buổi</label>
          <select
            value={form.half_day}
            onChange={(e) => setForm({ ...form, half_day: e.target.value })}
            className="w-full px-2 py-1.5 border rounded-lg text-sm bg-white"
          >
            {HALF_DAY.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
        </div>
        <div className="lg:col-span-12">
          <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Ghi chú</label>
          <input
            type="text"
            placeholder="VD: Về quê, khám bệnh… (loại nghỉ và buổi tự hiển thị kèm)"
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            className="w-full px-2 py-1.5 border rounded-lg text-sm bg-white"
          />
        </div>
        <div className="lg:col-span-12 flex justify-end gap-2">
          {editingLeaveId && canDeleteLeave({ id: editingLeaveId, user_id: form.user_id, status: form.status }) && (
            <button
              type="button"
              onClick={() => deleteLeave(editingLeaveId)}
              className="h-9 px-4 text-red-600 hover:bg-red-50 border border-red-200 rounded-lg text-sm font-medium cursor-pointer inline-flex items-center gap-1.5"
            >
              <Trash2 className="h-4 w-4" /> Xóa
            </button>
          )}
          <button
            type="button"
            onClick={closeCreateForm}
            className="h-9 px-4 text-gray-600 hover:bg-white border border-gray-200 rounded-lg text-sm font-medium cursor-pointer"
          >
            Đóng
          </button>
          <button
            type="button"
            onClick={submitRequest}
            disabled={submitting}
            className="h-9 px-4 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : editingLeaveId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {editingLeaveId ? 'Lưu thay đổi' : 'Gửi đơn nghỉ'}
          </button>
        </div>
      </div>
    </div>
  );

  const filterToolbar = (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-gray-50/90 border-b border-gray-100">
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-700 uppercase tracking-wide">
          <Filter className="h-3.5 w-3.5" /> Bộ lọc
          {hasActiveFilters && (
            <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded-full normal-case">
              Đang lọc
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="h-7 px-2.5 text-[11px] font-medium text-red-600 hover:bg-red-50 rounded-md cursor-pointer"
            >
              × Xoá lọc
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowFilterPanel(false)}
            className="h-8 px-2.5 inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg cursor-pointer"
            aria-label="Đóng bộ lọc"
          >
            <X className="h-4 w-4" /> Đóng
          </button>
        </div>
      </div>
      <div className="px-4 py-3 bg-gray-50/60 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            {scope && (
              <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                <ScopeFilterBar
                  scope={{
                    ...scope,
                    showCompany: isSystemAdmin,
                    showDepartment: true,
                    showSearch: false,
                    showDateRange: false,
                  }}
                  companyLabel="Công ty"
                  companyAllowAll={isSystemAdmin}
                  emptyCompanyLabel={isSystemAdmin ? 'Tất cả công ty' : '—'}
                  departmentDisabledWithoutCompany={!isSystemAdmin && !companyId}
                />
              </div>
            )}
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-0.5 flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Khu vực
              </label>
              <select
                value={filterRegionId}
                onChange={(e) => changeFilterRegion(e.target.value)}
                disabled={!companyId}
                className="h-9 px-3 border rounded-lg text-sm min-w-[150px] disabled:bg-gray-100 bg-white"
                title={!companyId ? 'Chọn công ty để lọc khu vực' : ''}
              >
                <option value="">Tất cả khu vực</option>
                {regions.map((rg) => (
                  <option key={rg.id} value={rg.id}>{rg.name}{rg.code ? ` (${rg.code})` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Nhân viên</label>
              <select
                value={filterUserId}
                onChange={(e) => changeFilterUser(e.target.value)}
                disabled={!companyId}
                className="h-9 px-3 border rounded-lg text-sm min-w-[160px] disabled:bg-gray-100 bg-white"
              >
                <option value="">Tất cả nhân viên</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-2 pt-1 border-t border-gray-100">
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-0.5 flex items-center gap-1">
                <Clock className="h-3 w-3" /> Thời gian
              </label>
              <div className="relative">
                <select
                  value={timePreset}
                  onChange={(e) => handleTimePresetChange(e.target.value)}
                  className={`h-9 pl-9 pr-8 rounded-lg text-sm font-medium border appearance-none cursor-pointer min-w-[150px] ${
                    timePreset || rangeFrom || rangeTo
                      ? 'bg-purple-50 text-purple-700 border-purple-200'
                      : 'bg-white text-gray-700 border-gray-200'
                  }`}
                >
                  {CRM_TIME_PRESETS.map((p) => (
                    <option key={p.key || 'all'} value={p.key}>{p.label}</option>
                  ))}
                </select>
                <Clock className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none ${
                  timePreset || rangeFrom || rangeTo ? 'text-purple-500' : 'text-gray-400'
                }`} />
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
                    : 'bg-white text-gray-700 border-gray-200 hover:border-purple-300'
                }`}
              >
                <CalendarRange className="h-3.5 w-3.5" />
                {rangeFrom || rangeTo ? (
                  <span className="tabular-nums text-xs">{rangeFrom || '...'} → {rangeTo || '...'}</span>
                ) : (
                  <span className="text-gray-500 text-xs">Chọn ngày…</span>
                )}
              </button>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-0.5 flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Tháng lịch
              </label>
              <div className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg text-sm border bg-gray-100 text-gray-700 border-gray-200 tabular-nums">
                {monthBounds.from} → {monthBounds.to}
              </div>
            </div>
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={exporting}
              className="ml-auto h-9 px-3 inline-flex items-center gap-1.5 text-sm font-medium border border-emerald-300 text-emerald-700 rounded-lg bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 cursor-pointer"
              title="Xuất lịch theo bộ lọc hiện tại"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              Xuất Excel
            </button>
          </div>
        </div>
    </div>
  );

  const renderLeaveRowMenu = (l) => (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setRowMenuOpenId((prev) => (prev === l.id ? null : l.id));
        }}
        className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
        aria-label="Tùy chọn"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {rowMenuOpenId === l.id && (
        <>
          <button type="button" className="fixed inset-0 z-10 cursor-default" aria-label="Đóng menu" onClick={() => setRowMenuOpenId(null)} />
          <div className="absolute right-0 z-20 mt-1 w-40 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
            {canEditLeave(l) && (
              <button type="button" onClick={() => { setRowMenuOpenId(null); openEditForm(l); }}
                className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-violet-50 hover:text-violet-700 cursor-pointer inline-flex items-center gap-2">
                <Pencil className="h-3.5 w-3.5" /> Sửa
              </button>
            )}
            {canDeleteLeave(l) && (
              <button type="button" onClick={() => { setRowMenuOpenId(null); deleteLeave(l.id); }}
                className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 cursor-pointer inline-flex items-center gap-2">
                <Trash2 className="h-3.5 w-3.5" /> Xóa
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      {err && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{err}</div>
      )}

      {showFilterPanel && filterToolbar}

      <LeaveActiveFilterBar chips={activeFilterChips} onClearAll={hasActiveFilters ? clearFilters : undefined} />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-5 items-start">
          <div className="space-y-5 min-w-0">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
                <div className="flex items-center gap-1">
                  <button type="button" onClick={prevMonth} className="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-violet-700 cursor-pointer">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <h2 className="min-w-[150px] text-center text-[15px] font-bold text-gray-900 tabular-nums">
                    Tháng {month}, {year}
                  </h2>
                  <button type="button" onClick={nextMonth} className="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-violet-700 cursor-pointer">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                {/* Mobile: lưới 2 cột cho 4 nút đều nhau — trước đó flex-wrap + select
                    min-w-[140px] làm chúng rơi thành 3 hàng lệch nhau. */}
                <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:flex-wrap sm:items-center">
                  <button type="button" onClick={goToday}
                    className="h-9 px-3.5 inline-flex items-center justify-center sm:justify-start gap-1.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:border-violet-300 hover:text-violet-700 cursor-pointer">
                    <Calendar className="h-4 w-4 text-violet-600" /> Hôm nay
                  </button>
                  <select
                    value={`${year}-${month}`}
                    onChange={(e) => {
                      const [y, m] = e.target.value.split('-').map(Number);
                      changeMonth(m, y);
                      setSelectedDay(null);
                    }}
                    className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 cursor-pointer w-full sm:w-auto sm:min-w-[140px]"
                    aria-label="Chọn tháng"
                  >
                    {monthYearOptions.map((opt) => (
                      <option key={opt.key} value={opt.key}>{opt.label}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => setShowFilterPanel((v) => !v)}
                    className={`relative h-9 px-3.5 inline-flex items-center gap-1.5 rounded-lg border text-sm font-medium cursor-pointer ${
                      showFilterPanel
                        ? 'border-violet-300 bg-violet-50 text-violet-700'
                        : hasActiveFilters
                          ? 'border-violet-200 bg-white text-violet-700 hover:border-violet-300'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-violet-300 hover:text-violet-700'
                    }`}>
                    <Filter className="h-4 w-4" />
                    Bộ lọc
                    {hasActiveFilters && (
                      <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-violet-600" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleExportExcel}
                    disabled={exporting}
                    className="h-9 px-3 inline-flex items-center gap-1.5 text-sm font-medium border border-emerald-300 text-emerald-700 rounded-lg bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 cursor-pointer"
                    title="Xuất lịch tháng đang xem ra Excel"
                  >
                    {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                    Xuất Excel
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-violet-600" /></div>
              ) : (
                <div className="px-2 pb-4 pt-1">
                  <div className="grid grid-cols-7">
                    {DAY_NAMES.map((d, i) => (
                      <div key={d} className={`text-center text-xs font-semibold py-2.5 ${i >= 5 ? 'text-red-500' : 'text-gray-500'}`}>{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 border border-gray-100 rounded-xl overflow-hidden">
                    {calendarGrid.map((cell, i) => {
                      const isWeekendCol = i % 7 >= 5;
                      const isSunday = i % 7 === 6;
                      const isCurrentMonthCell = cell.inMonth && cell.month === month && cell.year === year;
                      const dayLeaves = isCurrentMonthCell ? (leavesByDay[cell.day] || []) : [];
                      const holiday = isCurrentMonthCell ? holidaysByDay[cell.day] : null;
                      const isTodayCell = isCurrentMonthCell
                        && today.getFullYear() === year
                        && today.getMonth() + 1 === month
                        && today.getDate() === cell.day;
                      const isSelected = isCurrentMonthCell && cell.day === selectedDay;
                      const chips = isCurrentMonthCell
                        ? buildDayCalendarChips(dayLeaves, holiday, usersById, currentUser)
                        : [];
                      return (
                        <div
                          key={`${cell.year}-${cell.month}-${cell.day}-${i}`}
                          role="presentation"
                          onClick={() => {
                            if (!isCurrentMonthCell) {
                              changeMonth(cell.month, cell.year);
                              setSelectedDay(cell.day);
                              return;
                            }
                            setSelectedDay(cell.day);
                          }}
                          onDoubleClick={(e) => {
                            if (!isCurrentMonthCell) return;
                            e.stopPropagation();
                            prefillFormForDay(cell.day);
                          }}
                          className={`min-h-[62px] sm:min-h-[112px] border-b border-r border-gray-100 p-1 sm:p-2 flex flex-col cursor-pointer transition ${
                            isWeekendCol ? 'bg-rose-50/50' : 'bg-white'
                          } ${isSelected ? 'ring-2 ring-inset ring-violet-500 z-[1] bg-violet-50/20' : 'hover:bg-violet-50/25'} ${
                            !isCurrentMonthCell ? 'opacity-60' : ''
                          }`}
                        >
                          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold tabular-nums ${
                            isSelected
                              ? 'bg-violet-600 text-white'
                              : isTodayCell
                                ? 'bg-gray-400 text-white'
                                : !isCurrentMonthCell
                                  ? 'text-gray-300'
                                  : isSunday
                                    ? 'text-red-500'
                                    : 'text-gray-800'
                          }`}>{cell.day}</span>
                          {/* Mobile: ô chỉ rộng ~42px, không đủ cho chip tên (bị xuống dòng,
                              không đọc được) → hiện chấm + số lượng, bấm ngày xem chi tiết bên dưới. */}
                          {chips.length > 0 && (
                            <div className="sm:hidden mt-1 flex items-center gap-1">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${holiday ? 'bg-orange-400' : 'bg-violet-600'}`} />
                              <span className="text-[10px] font-semibold text-gray-600 tabular-nums">{dayLeaves.length || chips.length}</span>
                            </div>
                          )}
                          <div className="hidden sm:block mt-1.5 space-y-1 flex-1 min-w-0">
                            {chips.map((chip) => (
                              <div
                                key={chip.key}
                                role={chip.leave ? 'button' : undefined}
                                tabIndex={chip.leave ? 0 : undefined}
                                onClick={(e) => {
                                  if (chip.leave) {
                                    e.stopPropagation();
                                    openEditForm(chip.leave);
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (chip.leave && (e.key === 'Enter' || e.key === ' ')) {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    openEditForm(chip.leave);
                                  }
                                }}
                                className={`text-[10px] leading-tight px-2 py-1 rounded-md font-medium min-w-0 ${
                                  chip.kind === 'holiday'
                                    ? 'bg-orange-100 text-orange-800 truncate'
                                    : chip.kind === 'remote'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : chip.kind === 'half'
                                        ? 'bg-pink-100 text-pink-800'
                                        : chip.kind === 'more'
                                          ? 'bg-gray-100 text-gray-600 truncate'
                                          : 'bg-violet-600 text-white'
                                } ${chip.leave ? 'cursor-pointer hover:opacity-90' : ''}`}
                                title={chip.title || chip.label}
                              >
                                {chip.person ? (
                                  <>
                                    <div className="font-semibold truncate">{chip.person}</div>
                                    <div className="truncate opacity-90">{chip.typeLabel || chip.label}</div>
                                  </>
                                ) : (
                                  <div className="truncate">{chip.label}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Mobile: ô lịch chỉ hiện số — chi tiết ngày đang chọn nằm ở đây.
                      Dùng selectedDayLeaves/selectedHoliday vốn đã tính sẵn nhưng chưa hiển thị ở đâu. */}
                  {selectedDay && (
                    <div className="sm:hidden mt-3 rounded-xl border border-gray-200 bg-white p-3">
                      <p className="text-xs font-bold text-gray-900 mb-2">
                        Ngày {selectedDay}/{month}/{year}
                        <span className="ml-1.5 font-medium text-gray-400">
                          · {selectedDayLeaves.length} người nghỉ
                        </span>
                      </p>
                      {selectedHoliday && (
                        <p className="mb-2 rounded-md bg-orange-100 px-2 py-1 text-[11px] font-medium text-orange-800">
                          {selectedHoliday.name || selectedHoliday.title || 'Ngày lễ'}
                        </p>
                      )}
                      {selectedDayLeaves.length === 0 ? (
                        <p className="text-xs text-gray-400">Không có ai nghỉ trong ngày này.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {selectedDayLeaves.map((lv) => (
                            <li key={lv.id}>
                              <button
                                type="button"
                                onClick={() => openEditForm(lv)}
                                className="w-full text-left rounded-lg border border-gray-100 bg-gray-50/70 px-2.5 py-2 active:bg-gray-100 cursor-pointer"
                              >
                                <span className="block text-xs font-semibold text-gray-900 truncate">
                                  {usersById?.[String(lv.user_id)]?.full_name || lv.user_name || 'Nhân viên'}
                                </span>
                                <span className="block text-[11px] text-gray-500 truncate">
                                  {[lv.leave_type_label || lv.leave_type, lv.note].filter(Boolean).join(' · ') || '—'}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-violet-600" /> Nghỉ phép</span>
                    <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-pink-400" /> Nửa ngày</span>
                    <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-400" /> Ngày lễ</span>
                    <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-400" /> Hôm nay</span>
                  </div>
                </div>
              )}
            </div>

            {/* Bảng đơn nghỉ gần đây */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div>
                  <h3 className="text-[15px] font-bold text-gray-900 inline-flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-violet-600" />
                    Đơn nghỉ gần đây
                  </h3>
                  {recentRows.length > 0 && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {showAllRecent || !canExpandRecent
                        ? `${recentRows.length} đơn`
                        : `Hiển thị ${RECENT_LIMIT} / ${recentRows.length} đơn`}
                    </p>
                  )}
                </div>
                {canExpandRecent && (
                  <button
                    type="button"
                    onClick={() => setShowAllRecent((v) => !v)}
                    className="text-sm font-semibold text-violet-600 hover:text-violet-800 cursor-pointer shrink-0"
                  >
                    {showAllRecent ? 'Thu gọn' : `Xem tất cả (${recentRows.length})`}
                  </button>
                )}
              </div>
              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-violet-600" /></div>
              ) : (
                <div className={showAllRecent && canExpandRecent ? 'max-h-[420px] overflow-y-auto' : ''}>
                  <ResponsiveTable
                    rows={displayedRecent}
                    rowKey={(l) => l.id}
                    empty="Chưa có đơn nghỉ nào."
                    cardClassName="mx-3"
                    columns={[
                      {
                        key: 'person',
                        header: 'Nhân viên',
                        primary: true,
                        cellClassName: 'px-5 py-3.5',
                        cell: (l) => {
                          const personName = leavePersonDisplayName(l, usersById, currentUser);
                          return (
                            <>
                              <span className="block font-semibold text-gray-900">{personName}</span>
                              {l.user?.email && personName !== l.user.email && (
                                <span className="block text-xs text-gray-500 truncate max-w-[160px]">{l.user.email}</span>
                              )}
                            </>
                          );
                        },
                      },
                      {
                        key: 'date',
                        header: 'Ngày nghỉ',
                        secondary: true,
                        cellClassName: 'px-5 py-3.5 text-gray-800 whitespace-nowrap',
                        cell: (l) => formatLeaveDateWithWeekday(l.start_date, l.end_date),
                      },
                      {
                        key: 'type',
                        header: 'Loại nghỉ',
                        cellClassName: 'px-5 py-3.5',
                        cell: (l) => (
                          <span className="inline-flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: leaveTypeMeta(l.leave_type).color }} />
                            <span className="font-medium text-gray-800">{leaveTypeDisplayLabel(l.leave_type)}</span>
                          </span>
                        ),
                      },
                      {
                        key: 'half',
                        header: 'Thời gian',
                        cellClassName: 'px-5 py-3.5 text-gray-600',
                        cell: (l) => halfDayDisplayLabel(l.half_day),
                      },
                      {
                        key: 'note',
                        header: 'Ghi chú',
                        cellClassName: 'px-5 py-3.5 text-gray-600 max-w-[280px] truncate',
                        cell: (l) => <span title={formatLeaveNote(l)}>{formatLeaveNote(l)}</span>,
                      },
                      {
                        key: 'created',
                        header: 'Tạo lúc',
                        hideOnMobile: true,
                        cellClassName: 'px-5 py-3.5 text-gray-500 tabular-nums whitespace-nowrap',
                        cell: (l) => fmtCreatedAt(l.created_at),
                      },
                      {
                        key: 'actions',
                        header: 'Thao tác',
                        align: 'right',
                        cellClassName: 'px-5 py-3.5 text-right',
                        cell: (l) => renderLeaveRowMenu(l),
                      },
                    ]}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Sidebar phải */}
          <div className="space-y-4 xl:sticky xl:top-4">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div>
                  <h3 className="text-[15px] font-bold text-gray-900">Sắp tới</h3>
                  {upcomingLeaves.length > 0 && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {showAllUpcoming || !canExpandUpcoming
                        ? `${upcomingLeaves.length} lịch`
                        : `Hiển thị ${UPCOMING_LIMIT} / ${upcomingLeaves.length} lịch`}
                    </p>
                  )}
                </div>
                {canExpandUpcoming && (
                  <button
                    type="button"
                    onClick={() => setShowAllUpcoming((v) => !v)}
                    className="text-sm font-semibold text-violet-600 hover:text-violet-800 cursor-pointer shrink-0"
                  >
                    {showAllUpcoming ? 'Thu gọn' : `Xem tất cả (${upcomingLeaves.length})`}
                  </button>
                )}
              </div>
              <div className={`divide-y divide-gray-100 ${showAllUpcoming && canExpandUpcoming ? 'max-h-[360px] overflow-y-auto' : ''}`}>
                {displayedUpcoming.length === 0 ? (
                  <p className="px-5 py-8 text-sm text-gray-400 text-center">Không có lịch nghỉ sắp tới.</p>
                ) : displayedUpcoming.map((l) => {
                  const dateBlock = formatUpcomingDateBlock(l.start_date);
                  const typeColor = leaveTypeMeta(l.leave_type).color;
                  const personName = leavePersonDisplayName(l, usersById, currentUser);
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => openEditForm(l)}
                      className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-violet-50/40 cursor-pointer"
                    >
                      <div className="w-12 h-12 shrink-0 rounded-xl bg-violet-100 flex flex-col items-center justify-center">
                        <div className="text-lg font-bold text-violet-700 leading-none tabular-nums">{dateBlock.day}</div>
                        <div className="text-[9px] font-bold text-violet-500 uppercase mt-0.5 tracking-wide">{dateBlock.month}</div>
                      </div>
                      <span className="w-px self-stretch bg-gray-200 shrink-0" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-gray-900 truncate mb-0.5">{personName}</p>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: typeColor }} />
                          <span className="text-xs text-gray-600 truncate">{formatLeaveNote(l)}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-[16px] font-bold text-gray-900">Tạo đơn nghỉ mới</h3>
                  <p className="mt-2 text-xs leading-relaxed text-gray-500">
                    Ghi nhận ngày nghỉ của bạn để quản lý lịch làm việc hiệu quả hơn.
                  </p>
                </div>
                <LeaveCreateSticker />
              </div>
              <button
                type="button"
                onClick={() => openCreateForm()}
                className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 text-white text-sm font-bold hover:bg-violet-700 shadow-sm cursor-pointer"
              >
                <Plus className="h-4 w-4" /> Tạo đơn nghỉ
              </button>
            </div>

            <LeaveLegendPanel />
          </div>
        </div>

      {showCreateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={closeCreateForm}>
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-gray-200" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 sm:p-5">{createFormBlock}</div>
          </div>
        </div>
      )}

      <DateRangePickerPopover
        open={showDateRangePicker}
        title="Chọn khoảng thời gian lịch nghỉ"
        from={rangeFrom}
        to={rangeTo}
        onChange={({ from, to }) => {
          setRangeFrom(from || '');
          setRangeTo(to || '');
          setTimePreset(from || to ? 'custom' : '');
          persistTimeRange(from || to ? 'custom' : '', from || '', to || '');
        }}
        onClose={() => setShowDateRangePicker(false)}
      />
    </div>
  );
}
