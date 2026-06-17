import { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../lib/api';
import { loadLeaveScheduleUi, patchLeaveScheduleUi } from '../lib/leaveScheduleStorage';
import {
  CRM_TIME_PRESETS,
  getCrmDateRangeFromPreset,
} from '../lib/crmDateRangePresets';
import DateRangePickerPopover from './DateRangePickerPopover';
import ScopeFilterBar from '../shared/components/ScopeFilterBar';
import * as XLSX from 'xlsx';
import {
  Calendar, ChevronLeft, ChevronRight, Loader2, UserMinus, ClipboardCheck,
  Plus, Check, X, Trash2, Clock, FileSpreadsheet, CalendarRange, Filter, MapPin, Pencil,
} from 'lucide-react';

const LEAVE_TYPES = [
  { v: 'paid', l: 'Phép có lương', color: '#8B5CF6' },
  { v: 'unpaid', l: 'Phép không lương', color: '#6B7280' },
  { v: 'sick', l: 'Nghỉ ốm', color: '#EF4444' },
  { v: 'business_trip', l: 'Công tác', color: '#3B82F6' },
  { v: 'remote', l: 'Làm từ xa', color: '#10B981' },
  { v: 'other', l: 'Khác', color: '#F59E0B' },
];
const HALF_DAY = [
  { v: 'full', l: 'Cả ngày' },
  { v: 'morning', l: 'Sáng' },
  { v: 'afternoon', l: 'Chiều' },
];
const STATUS_MAP = {
  pending: {
    label: 'Chờ duyệt',
    cls: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
    chipCls: 'bg-yellow-400 text-yellow-950',
    rowBorder: 'border-l-yellow-400',
  },
  approved: {
    label: 'Đã duyệt',
    cls: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
    chipCls: 'bg-emerald-500 text-white',
    rowBorder: 'border-l-emerald-500',
  },
  rejected: {
    label: 'Từ chối',
    cls: 'bg-red-100 text-red-800 border border-red-300',
    chipCls: 'bg-red-500 text-white',
    rowBorder: 'border-l-red-500',
  },
  cancelled: {
    label: 'Đã hủy',
    cls: 'bg-gray-100 text-gray-600 border border-gray-200',
    chipCls: 'bg-gray-400 text-white',
    rowBorder: 'border-l-gray-400',
  },
};

const STATUS_FILTER_OPTIONS = [
  { v: '', l: 'Tất cả TT', activeCls: 'bg-purple-100 border-purple-300 text-purple-800' },
  { v: 'pending', l: 'Chờ duyệt', activeCls: 'bg-yellow-100 border-yellow-400 text-yellow-900' },
  { v: 'approved', l: 'Đã duyệt', activeCls: 'bg-emerald-100 border-emerald-400 text-emerald-900' },
  { v: 'rejected', l: 'Từ chối', activeCls: 'bg-red-100 border-red-400 text-red-900' },
  { v: 'cancelled', l: 'Đã hủy', activeCls: 'bg-gray-100 border-gray-300 text-gray-700' },
];

function leaveStatusMeta(status) {
  return STATUS_MAP[status] || STATUS_MAP.pending;
}

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

export default function EventsOffLeaveSection({
  mode,
  onModeChange,
  companyId,
  departmentId,
  isSystemAdmin,
  scope,
  currentUser,
  isManager,
  persistUi = false,
}) {
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
  const [statusFilter, setStatusFilter] = useState(() => {
    if (persistUi && initialUi?.statusFilter != null) return initialUi.statusFilter;
    return isManager ? 'pending' : '';
  });
  const [filterUserId, setFilterUserId] = useState(() => initialUi?.filterUserId ?? '');
  const [filterRegionId, setFilterRegionId] = useState(() => initialUi?.filterRegionId ?? '');
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingLeaveId, setEditingLeaveId] = useState(null);
  /** Khu vực trong form tạo — đồng bộ từ bộ lọc danh sách khi mở form */
  const [createFormRegionId, setCreateFormRegionId] = useState('');
  const [createFormUsers, setCreateFormUsers] = useState([]);

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
    return isOwn && l.status === 'pending';
  }, [isManager, currentUser?.id]);

  const canDeleteLeave = useCallback((l) => {
    const isOwn = String(l.user_id) === String(currentUser?.id);
    if (isManager) return true;
    return isOwn && l.status === 'pending';
  }, [isManager, currentUser?.id]);

  const persistUiPatch = useCallback((patch) => {
    if (persistUi) patchLeaveScheduleUi(patch);
  }, [persistUi]);

  const changeMonth = useCallback((nextMonth, nextYear) => {
    setMonth(nextMonth);
    setYear(nextYear);
    persistUiPatch({ month: nextMonth, year: nextYear });
  }, [persistUiPatch]);

  const changeStatusFilter = useCallback((v) => {
    setStatusFilter(v);
    persistUiPatch({ statusFilter: v });
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
    if (mode === 'calendar') return monthBounds;
    return { from: '', to: '' };
  }, [rangeFrom, rangeTo, mode, monthBounds]);

  const buildLeaveQueryParams = useCallback((extra = {}) => {
    const p = { ...extra };
    if (effectiveRange.from) p.from = effectiveRange.from;
    if (effectiveRange.to) p.to = effectiveRange.to;
    if (companyId) p.company_id = companyId;
    if (departmentId) p.department_id = departmentId;
    if (filterRegionId) p.region_id = filterRegionId;
    if (filterUserId) p.user_id = filterUserId;
    if (statusFilter) p.status = statusFilter;
    return p;
  }, [effectiveRange.from, effectiveRange.to, companyId, departmentId, filterRegionId, filterUserId, statusFilter]);

  const hasScopeFilters = !!(filterUserId || filterRegionId || departmentId || (isSystemAdmin && companyId));
  const hasActiveFilters = hasScopeFilters || !!(timePreset || rangeFrom || rangeTo || statusFilter);

  const clearFilters = useCallback(() => {
    handleTimePresetChange('');
    changeStatusFilter('');
    changeFilterUser('');
    changeFilterRegion('');
  }, [handleTimePresetChange, changeStatusFilter, changeFilterUser, changeFilterRegion]);

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
    changeFilterUser('');
    changeFilterRegion('');
  }, [companyId, departmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!companyId) {
      setUsers([]);
      setRegions([]);
      return;
    }
    const userParams = { company_id: companyId };
    if (departmentId) userParams.department_id = departmentId;
    if (filterRegionId) userParams.region_id = filterRegionId;
    Promise.all([
      isManager
        ? api.get('/kpi/users', { params: userParams }).then((r) => r.data?.users || []).catch(() => [])
        : api.get('/users', { params: { company_id: companyId } }).then((r) => r.data?.users || r.data || []).catch(() => []),
      api.get('/crm/company-regions', { params: { company_id: companyId } }).then((r) => (Array.isArray(r.data) ? r.data : [])).catch(() => []),
    ]).then(([u, rg]) => {
      setUsers(u);
      setRegions(rg);
    });
  }, [isManager, companyId, departmentId, filterRegionId]);

  /** NV trong form tạo — lọc theo công ty / phòng / khu vực của form */
  useEffect(() => {
    if (!showCreateForm || !isManager || !companyId) {
      setCreateFormUsers([]);
      return;
    }
    const params = { company_id: companyId };
    if (departmentId) params.department_id = departmentId;
    if (createFormRegionId) params.region_id = createFormRegionId;
    api.get('/kpi/users', { params })
      .then((r) => setCreateFormUsers(r.data?.users || []))
      .catch(() => setCreateFormUsers([]));
  }, [showCreateForm, isManager, companyId, departmentId, createFormRegionId]);

  useEffect(() => {
    if (!showCreateForm) return;
    setForm((f) => (f.user_id ? { ...f, user_id: '' } : f));
  }, [companyId, departmentId, createFormRegionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredLeaves = useMemo(() => [...leaves], [leaves]);

  const calendarLeaves = useMemo(
    () => filteredLeaves.filter((l) => ['approved', 'pending', 'rejected', 'cancelled'].includes(l.status)),
    [filteredLeaves],
  );

  const leavesByDay = useMemo(() => {
    const map = {};
    calendarLeaves.forEach((l) => {
      expandLeaveToDays(l, year, month).forEach((d) => {
        if (!map[d]) map[d] = [];
        map[d].push(l);
      });
    });
    return map;
  }, [calendarLeaves, year, month]);

  const monthHolidays = useMemo(() => holidaysForMonth(holidays, year, month), [holidays, year, month]);
  const holidaysByDay = useMemo(() => {
    const m = {};
    monthHolidays.forEach((h) => { m[h.day] = h; });
    return m;
  }, [monthHolidays]);

  const pendingCount = useMemo(
    () => leaves.filter((l) => l.status === 'pending').length,
    [leaves],
  );

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

  const updateStatus = async (id, status) => {
    try {
      await api.patch(`/kpi/leaves/${id}`, { status });
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi cập nhật');
    }
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
    if (!String(form.reason || '').trim()) {
      setErr('Nhập lý do nghỉ');
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
        if (isManager && form.status) patch.status = form.status;
        await api.patch(`/kpi/leaves/${editingLeaveId}`, patch);
      } else {
        await api.post('/kpi/leaves', {
          user_id: targetUserId,
          start_date: form.start_date,
          end_date: form.end_date,
          leave_type: form.leave_type,
          half_day: form.half_day,
          reason: String(form.reason).trim(),
          status: isManager ? (form.status || 'approved') : 'pending',
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
      if (rows.length === 0) {
        alert('Không có đơn nghỉ nào trong khoảng thời gian/bộ lọc để xuất.');
        return;
      }
      const sheetRows = rows.map((l, idx) => ({
        STT: idx + 1,
        Nhân_viên: l.user?.full_name || '',
        Email: l.user?.email || '',
        Từ_ngày: l.start_date || '',
        Đến_ngày: l.end_date || '',
        Loại_nghỉ: leaveTypeMeta(l.leave_type).l,
        Buổi: HALF_DAY.find((h) => h.v === l.half_day)?.l || l.half_day,
        Trạng_thái: STATUS_MAP[l.status]?.label || l.status,
        Lý_do: l.reason || '',
        Ngày_tạo: fmtCreatedAt(l.created_at),
      }));
      const ws = XLSX.utils.json_to_sheet(sheetRows);
      ws['!cols'] = [
        { wch: 5 }, { wch: 22 }, { wch: 26 }, { wch: 12 }, { wch: 12 },
        { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 36 }, { wch: 18 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Lịch nghỉ');
      const fromStamp = effectiveRange.from || 'all';
      const toStamp = effectiveRange.to || 'all';
      XLSX.writeFile(wb, `lich_nghi_${fromStamp}_${toStamp}.xlsx`);
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi xuất Excel');
    } finally {
      setExporting(false);
    }
  };

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;

  const approvalRows = useMemo(
    () => [...filteredLeaves].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
    [filteredLeaves],
  );

  const createFormBlock = showCreateForm && (
    <div className="bg-purple-50/40 border border-purple-100 rounded-xl p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-sm font-semibold text-purple-900 flex items-center gap-1.5">
          {editingLeaveId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {editingLeaveId ? 'Sửa đơn nghỉ' : 'Tạo lịch nghỉ'}
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
            <select
              value={form.user_id}
              onChange={(e) => setForm({ ...form, user_id: e.target.value })}
              disabled={!companyId}
              className="w-full px-2 py-1.5 border rounded-lg text-sm bg-white disabled:bg-gray-100"
            >
              <option value="">— Chọn NV —</option>
              {createFormUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
              ))}
            </select>
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
              value={createFormUsers.find((u) => String(u.id) === String(form.user_id))?.full_name
                || users.find((u) => String(u.id) === String(form.user_id))?.full_name
                || form.user_id?.slice(0, 8) || '—'}
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
        {isManager && (
          <div className="lg:col-span-2">
            <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Trạng thái</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="w-full px-2 py-1.5 border rounded-lg text-sm bg-white"
            >
              {editingLeaveId ? (
                <>
                  <option value="pending">Chờ duyệt</option>
                  <option value="approved">Đã duyệt</option>
                  <option value="rejected">Từ chối</option>
                  <option value="cancelled">Đã hủy</option>
                </>
              ) : (
                <>
                  <option value="approved">Duyệt ngay</option>
                  <option value="pending">Chờ duyệt</option>
                </>
              )}
            </select>
          </div>
        )}
        <div className="lg:col-span-12">
          <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Lý do nghỉ *</label>
          <input
            type="text"
            placeholder="VD: Nghỉ phép về quê, khám bệnh…"
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
            {editingLeaveId ? 'Lưu thay đổi' : (isManager && form.status === 'approved' ? 'Tạo & duyệt' : 'Gửi đơn nghỉ')}
          </button>
        </div>
      </div>
    </div>
  );

  const filterToolbar = (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <details open className="border-b border-gray-100">
        <summary className="list-none cursor-pointer select-none flex items-center justify-between gap-2 px-4 py-2 bg-gray-50/90 hover:bg-gray-100/90">
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
                onClick={(e) => { e.preventDefault(); clearFilters(); }}
                className="h-7 px-2.5 text-[11px] font-medium text-red-600 hover:bg-red-50 rounded-md cursor-pointer"
              >
                × Xoá lọc
              </button>
            )}
            <span className="text-[10px] text-gray-400 hidden sm:inline">Click để gập/mở</span>
          </div>
        </summary>
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
            {mode === 'calendar' && (
              <div>
                <label className="block text-[10px] font-medium text-gray-500 mb-0.5 flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Tháng lịch
                </label>
                <div className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg text-sm border bg-gray-100 text-gray-700 border-gray-200 tabular-nums">
                  {monthBounds.from} → {monthBounds.to}
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5 items-center">
              {STATUS_FILTER_OPTIONS.map((f) => (
                <button
                  key={f.v || 'all'}
                  type="button"
                  onClick={() => changeStatusFilter(f.v)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer ${
                    statusFilter === f.v ? f.activeCls : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {f.l}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={exporting}
              className="ml-auto h-9 px-3 inline-flex items-center gap-1.5 text-sm font-medium border border-emerald-300 text-emerald-700 rounded-lg bg-white hover:bg-emerald-50 disabled:opacity-50 cursor-pointer"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              Xuất Excel
            </button>
          </div>
        </div>
      </details>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex bg-purple-100 rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => onModeChange('calendar')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 cursor-pointer transition ${
              mode === 'calendar' ? 'bg-white shadow text-purple-700' : 'text-purple-600 hover:text-purple-800'
            }`}
          >
            <Calendar className="h-4 w-4" /> Lịch off
          </button>
          <button
            type="button"
            onClick={() => onModeChange('approval')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 cursor-pointer transition ${
              mode === 'approval' ? 'bg-white shadow text-purple-700' : 'text-purple-600 hover:text-purple-800'
            }`}
          >
            <ClipboardCheck className="h-4 w-4" /> Duyệt nghỉ
            {pendingCount > 0 && (
              <span className="ml-0.5 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold">
                {pendingCount}
              </span>
            )}
          </button>
        </div>
        <button
          type="button"
          onClick={() => (showCreateForm ? closeCreateForm() : openCreateForm())}
          className={`h-9 px-4 rounded-lg text-sm font-medium flex items-center gap-1.5 cursor-pointer ${
            showCreateForm
              ? 'bg-white border border-purple-300 text-purple-700 hover:bg-purple-50'
              : 'bg-purple-600 text-white hover:bg-purple-700'
          }`}
        >
          {showCreateForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showCreateForm ? 'Đóng form' : 'Tạo đơn nghỉ'}
        </button>
      </div>

      {filterToolbar}

      {err && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{err}</div>
      )}

      {createFormBlock}

      {mode === 'calendar' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-gradient-to-r from-purple-50/70 via-white to-purple-50/70 border-b border-gray-100">
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={prevMonth} className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-600 hover:bg-white hover:text-purple-600 cursor-pointer">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <h2 className="text-base font-bold text-gray-900">{MONTH_NAMES[month - 1]} {year}</h2>
              <button type="button" onClick={nextMonth} className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-600 hover:bg-white hover:text-purple-600 cursor-pointer">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <span className="text-[11px] text-gray-500">{calendarLeaves.length} đơn · {monthHolidays.length} ngày lễ</span>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-purple-500" /></div>
          ) : (
            <div className="p-3 sm:p-4">
              <div className="grid grid-cols-7 mb-1">
                {DAY_NAMES.map((d, i) => (
                  <div key={d} className={`text-center text-[11px] font-bold py-1.5 ${i === 6 ? 'text-rose-500' : 'text-gray-500'}`}>{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {cells.map((day, i) => {
                  if (!day) {
                    return <div key={`e-${i}`} className="rounded-lg bg-gray-50/40 border border-dashed border-gray-100 min-h-[88px]" />;
                  }
                  const dayLeaves = leavesByDay[day] || [];
                  const holiday = holidaysByDay[day];
                  const isToday = isCurrentMonth && day === today.getDate();
                  const isSelected = day === selectedDay;
                  const isWeekend = i % 7 >= 5;
                  return (
                    <div
                      key={day}
                      role="presentation"
                      onClick={() => setSelectedDay(day)}
                      className={`rounded-lg border min-h-[88px] p-1 flex flex-col cursor-pointer transition ${
                        isSelected ? 'ring-2 ring-purple-500 border-purple-300 shadow-md' : 'border-gray-200 hover:border-purple-300'
                      } ${isToday ? 'bg-purple-50/50' : isWeekend ? 'bg-gray-50/60' : 'bg-white'}`}
                    >
                      <div className="flex items-center justify-between px-0.5">
                        <span className={`text-[11px] font-bold w-5 h-5 inline-flex items-center justify-center rounded-full ${
                          isToday ? 'bg-purple-600 text-white' : 'text-gray-800'
                        }`}>{day}</span>
                        {holiday && <span className="text-[9px]" title={holiday.name}>🎉</span>}
                      </div>
                      <div className="flex-1 space-y-0.5 mt-0.5 overflow-hidden">
                        {holiday && (
                          <div className="text-[9px] px-1 py-0.5 rounded bg-rose-100 text-rose-700 truncate" title={holiday.name}>
                            {holiday.name}
                          </div>
                        )}
                        {dayLeaves.slice(0, 3).map((l) => {
                          const st = leaveStatusMeta(l.status);
                          const name = l.user?.full_name || l.user?.email || 'NV';
                          return (
                            <div
                              key={`${l.id}-${day}`}
                              className={`text-[9px] px-1 py-0.5 rounded truncate font-medium ${st.chipCls}`}
                              title={`${name} — ${st.label}`}
                            >
                              {name.split(' ').slice(-1)[0]}
                            </div>
                          );
                        })}
                        {dayLeaves.length > 3 && (
                          <div className="text-[9px] text-gray-500 font-medium px-1">+{dayLeaves.length - 3}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {selectedDay && (
                <div className="mt-4 p-3 rounded-xl bg-purple-50/60 border border-purple-100">
                  <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-gray-800">
                      Ngày {pad(selectedDay)}/{pad(month)}/{year}
                      {selectedHoliday && <span className="ml-2 text-rose-600 font-normal">— {selectedHoliday.name}</span>}
                    </h3>
                    <button
                      type="button"
                      onClick={() => prefillFormForDay(selectedDay)}
                      className="h-7 px-2.5 text-xs font-medium bg-purple-600 text-white rounded-md hover:bg-purple-700 cursor-pointer"
                    >
                      + Tạo nghỉ ngày này
                    </button>
                  </div>
                  {selectedDayLeaves.length === 0 ? (
                    <p className="text-xs text-gray-500">Không có ai nghỉ trong ngày này.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {selectedDayLeaves.map((l) => {
                        const st = leaveStatusMeta(l.status);
                        return (
                          <li key={l.id} className={`flex items-center gap-2 text-sm bg-white rounded-lg px-2.5 py-1.5 border border-gray-100 border-l-4 ${st.rowBorder}`}>
                            <UserMinus className="h-3.5 w-3.5 text-purple-500 shrink-0" />
                            <span className="font-medium text-gray-800">{l.user?.full_name || l.user?.email || '—'}</span>
                            <span className="text-xs text-gray-500">{leaveTypeMeta(l.leave_type).l}</span>
                            <span className="text-xs text-gray-400 truncate max-w-[120px]" title={l.reason}>{l.reason || '—'}</span>
                            <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-medium ${st.cls}`}>{st.label}</span>
                            {(canEditLeave(l) || canDeleteLeave(l)) && (
                              <div className="inline-flex gap-0.5 shrink-0">
                                {canEditLeave(l) && (
                                  <button type="button" onClick={() => openEditForm(l)} title="Sửa"
                                    className="p-1 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded cursor-pointer">
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                )}
                                {canDeleteLeave(l) && (
                                  <button type="button" onClick={() => deleteLeave(l.id)} title="Xóa"
                                    className="p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer">
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-gray-600">
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-yellow-400" /> Chờ duyệt</span>
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-500" /> Đã duyệt</span>
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-500" /> Từ chối</span>
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-gray-400" /> Đã hủy</span>
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-rose-200" /> Ngày lễ</span>
              </div>
            </div>
          )}
        </div>
      )}

      {mode === 'approval' && (
        <div className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-purple-500" /></div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-700 uppercase">
                  <tr>
                    <th className="text-left px-3 py-2.5">Nhân viên</th>
                    <th className="text-left px-3 py-2.5">Từ ngày</th>
                    <th className="text-left px-3 py-2.5">Đến ngày</th>
                    <th className="text-left px-3 py-2.5">Loại</th>
                    <th className="text-left px-3 py-2.5">Buổi</th>
                    <th className="text-left px-3 py-2.5">Trạng thái</th>
                    <th className="text-left px-3 py-2.5">Lý do</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {approvalRows.length === 0 ? (
                    <tr><td colSpan={8} className="text-center text-gray-400 py-8">Không có đơn nghỉ phù hợp bộ lọc.</td></tr>
                  ) : approvalRows.map((l) => {
                    const st = leaveStatusMeta(l.status);
                    return (
                      <tr key={l.id} className={`border-t hover:bg-gray-50 border-l-4 ${st.rowBorder}`}>
                        <td className="px-3 py-2 font-medium">{l.user?.full_name || l.user?.email || l.user_id?.slice(0, 8)}</td>
                        <td className="px-3 py-2 font-mono text-xs">{l.start_date}</td>
                        <td className="px-3 py-2 font-mono text-xs">{l.end_date}</td>
                        <td className="px-3 py-2 text-xs">{leaveTypeMeta(l.leave_type).l}</td>
                        <td className="px-3 py-2 text-xs">{HALF_DAY.find((h) => h.v === l.half_day)?.l}</td>
                        <td className="px-3 py-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.cls}`}>{st.label}</span>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600 max-w-[200px]" title={l.reason}>{l.reason || '—'}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <div className="inline-flex gap-1">
                            {isManager && l.status === 'pending' && (
                              <>
                                <button type="button" onClick={() => updateStatus(l.id, 'approved')}
                                  className="px-2 py-1 bg-emerald-600 text-white rounded text-xs hover:bg-emerald-700 inline-flex items-center gap-0.5 cursor-pointer">
                                  <Check className="h-3 w-3" /> Duyệt
                                </button>
                                <button type="button" onClick={() => updateStatus(l.id, 'rejected')}
                                  className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200 inline-flex items-center gap-0.5 cursor-pointer">
                                  <X className="h-3 w-3" /> Từ chối
                                </button>
                              </>
                            )}
                            {canEditLeave(l) && (
                              <button type="button" onClick={() => openEditForm(l)} title="Sửa đơn"
                                className="px-2 py-1 text-purple-700 hover:bg-purple-50 rounded text-xs cursor-pointer inline-flex items-center gap-0.5">
                                <Pencil className="h-3 w-3" /> Sửa
                              </button>
                            )}
                            {canDeleteLeave(l) && (
                              <button type="button" onClick={() => deleteLeave(l.id)} title="Xóa đơn"
                                className="px-2 py-1 text-red-600 hover:bg-red-50 rounded text-xs cursor-pointer inline-flex items-center gap-0.5">
                                <Trash2 className="h-3 w-3" /> Xóa
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
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
