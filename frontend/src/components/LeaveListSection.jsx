import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { loadLeaveScheduleUi, patchLeaveScheduleUi } from '../lib/leaveScheduleStorage';
import { CRM_TIME_PRESETS, getCrmDateRangeFromPreset } from '../lib/crmDateRangePresets';
import { useLeaveFilterActions } from '../lib/useLeaveFilterActions';
import { downloadLeavesExcel } from '../lib/leaveScheduleExport';
import {
  leaveTypeMeta,
  leaveTypeDisplayLabel,
  halfDayDisplayLabel,
  formatLeaveDateWithWeekday,
  fmtCreatedAt,
} from '../lib/leaveScheduleUtils';
import DateRangePickerPopover from './DateRangePickerPopover';
import ScopeFilterBar from '../shared/components/ScopeFilterBar';
import LeaveActiveFilterBar from './LeaveActiveFilterBar';
import {
  Loader2, Plus, Filter, X, Clock, CalendarRange, MapPin, FileSpreadsheet,
  MoreHorizontal, Pencil, Trash2, Users, CalendarDays, ListChecks, Search,
} from 'lucide-react';

export default function LeaveListSection({
  companyId,
  departmentId,
  isSystemAdmin,
  scope,
  currentUser,
  isManager,
  persistUi = false,
}) {
  const navigate = useNavigate();
  const initialUi = useMemo(() => (persistUi ? loadLeaveScheduleUi() : null), [persistUi]);

  const [leaves, setLeaves] = useState([]);
  const [users, setUsers] = useState([]);
  const [regions, setRegions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showDateRangePicker, setShowDateRangePicker] = useState(false);
  const [rowMenuOpenId, setRowMenuOpenId] = useState(null);

  const [timePreset, setTimePreset] = useState(() => initialUi?.listTimePreset ?? 'this_year');
  const [rangeFrom, setRangeFrom] = useState(() => initialUi?.listRangeFrom ?? '');
  const [rangeTo, setRangeTo] = useState(() => initialUi?.listRangeTo ?? '');
  const [filterUserId, setFilterUserId] = useState(() => initialUi?.filterUserId ?? '');
  const [filterRegionId, setFilterRegionId] = useState(() => initialUi?.filterRegionId ?? '');

  const persistUiPatch = useCallback((patch) => {
    if (persistUi) patchLeaveScheduleUi(patch);
  }, [persistUi]);

  const changeFilterUser = useCallback((v) => {
    setFilterUserId(v);
    persistUiPatch({ filterUserId: v });
  }, [persistUiPatch]);

  const changeFilterRegion = useCallback((v) => {
    setFilterRegionId(v);
    persistUiPatch({ filterRegionId: v });
  }, [persistUiPatch]);

  const persistTimeRange = useCallback((preset, from, to) => {
    persistUiPatch({ listTimePreset: preset, listRangeFrom: from, listRangeTo: to });
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

  const effectiveRange = useMemo(() => {
    if (rangeFrom || rangeTo) return { from: rangeFrom, to: rangeTo };
    if (timePreset) return getCrmDateRangeFromPreset(timePreset);
    return { from: '', to: '' };
  }, [rangeFrom, rangeTo, timePreset]);

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
    showCalendarMonth: false,
    changeFilterRegion,
    changeFilterUser,
    handleTimePresetChange,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data } = await api.get('/kpi/leaves', { params: buildLeaveQueryParams() });
      setLeaves(data?.leaves || []);
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
      setLeaves([]);
    } finally {
      setLoading(false);
    }
  }, [buildLeaveQueryParams]);

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
    Promise.all([
      isManager
        ? api.get('/kpi/users', { params: userParams }).then((r) => r.data?.users || []).catch(() => [])
        : api.get('/users', { params: { company_id: companyId } }).then((r) => r.data?.users || r.data || []).catch(() => []),
      api.get('/crm/company-regions', { params: { company_id: companyId } }).then((r) => (Array.isArray(r.data) ? r.data : [])).catch(() => []),
    ]).then(([u, rg]) => {
      setUsers(u);
      setRegions(rg);
    });
  }, [isManager, companyId, departmentId]);

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

  const deleteLeave = async (id) => {
    if (!window.confirm('Xóa đơn nghỉ này? Hành động không thể hoàn tác.')) return;
    try {
      await api.delete(`/kpi/leaves/${id}`);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi xóa');
    }
  };

  const sortedRows = useMemo(
    () => [...leaves].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
    [leaves],
  );

  const filteredRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return sortedRows;
    return sortedRows.filter((l) => {
      const hay = [
        l.user?.full_name,
        l.user?.email,
        l.reason,
        leaveTypeDisplayLabel(l.leave_type),
        halfDayDisplayLabel(l.half_day),
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [sortedRows, searchText]);

  const handleExportExcel = useCallback(async () => {
    setExporting(true);
    try {
      const rowsToExport = searchText.trim() ? filteredRows : leaves;
      const ok = await downloadLeavesExcel(rowsToExport, {
        sheetName: 'Danh sách nghỉ',
        filenamePrefix: 'danh_sach_nghi',
        title: 'DANH SÁCH ĐƠN NGHỈ',
        from: effectiveRange.from,
        to: effectiveRange.to,
      });
      if (!ok) {
        alert('Không có đơn nghỉ nào trong phạm vi đang xem để xuất.');
      }
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi xuất Excel');
    } finally {
      setExporting(false);
    }
  }, [searchText, filteredRows, leaves, effectiveRange.from, effectiveRange.to]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const staffIds = new Set(leaves.map((l) => l.user_id).filter(Boolean));
    return {
      total: leaves.length,
      active: staffIds.size,
      upcoming: leaves.filter((l) => l.start_date >= today).length,
      halfDay: leaves.filter((l) => l.half_day && l.half_day !== 'full').length,
    };
  }, [leaves]);

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
              <button
                type="button"
                onClick={() => { setRowMenuOpenId(null); navigate('/crm/leaves', { state: { editLeaveId: l.id } }); }}
                className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-violet-50 hover:text-violet-700 cursor-pointer inline-flex items-center gap-2"
              >
                <Pencil className="h-3.5 w-3.5" /> Sửa trên lịch
              </button>
            )}
            {canDeleteLeave(l) && (
              <button
                type="button"
                onClick={() => { setRowMenuOpenId(null); deleteLeave(l.id); }}
                className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 cursor-pointer inline-flex items-center gap-2"
              >
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Tổng đơn', value: stats.total, icon: ListChecks, color: 'text-violet-600 bg-violet-50' },
          { label: 'Nhân viên', value: stats.active, icon: CalendarDays, color: 'text-emerald-600 bg-emerald-50' },
          { label: 'Sắp tới', value: stats.upcoming, icon: Clock, color: 'text-sky-600 bg-sky-50' },
          { label: 'Nửa ngày', value: stats.halfDay, icon: Users, color: 'text-pink-600 bg-pink-50' },
        ].map((item) => (
          <div key={item.label} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl inline-flex items-center justify-center ${item.color}`}>
              <item.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500">{item.label}</p>
              <p className="text-xl font-bold text-gray-900 tabular-nums">{item.value}</p>
            </div>
          </div>
        ))}
      </div>

      <LeaveActiveFilterBar chips={activeFilterChips} onClearAll={hasActiveFilters ? clearFilters : undefined} />

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-[15px] font-bold text-gray-900">Danh sách đơn nghỉ</h2>
            <p className="text-xs text-gray-500 mt-0.5">{filteredRows.length} đơn trong phạm vi đang xem</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <input
                type="search"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Tìm nhân viên, lý do…"
                className="h-9 pl-9 pr-3 rounded-lg border border-gray-200 text-sm min-w-[200px] bg-white"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowFilterPanel((v) => !v)}
              className={`relative h-9 px-3.5 inline-flex items-center gap-1.5 rounded-lg border text-sm font-medium cursor-pointer ${
                showFilterPanel
                  ? 'border-violet-300 bg-violet-50 text-violet-700'
                  : hasActiveFilters
                    ? 'border-violet-200 bg-white text-violet-700 hover:border-violet-300'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-violet-300'
              }`}
            >
              <Filter className="h-4 w-4" /> Bộ lọc
              {hasActiveFilters && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-violet-600" />
              )}
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={exporting}
              className="h-9 px-3 inline-flex items-center gap-1.5 text-sm font-medium border border-emerald-300 text-emerald-700 rounded-lg bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 cursor-pointer"
              title="Xuất danh sách đang xem ra Excel"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              Xuất Excel
            </button>
            <button
              type="button"
              onClick={() => navigate('/crm/leaves', { state: { openCreate: true } })}
              className="h-9 px-3.5 inline-flex items-center gap-1.5 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 cursor-pointer"
            >
              <Plus className="h-4 w-4" /> Tạo đơn
            </button>
          </div>
        </div>

        {showFilterPanel && (
          <div className="border-b border-gray-100 bg-gray-50/60 px-4 py-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Tùy chọn lọc</p>
              <button
                type="button"
                onClick={() => setShowFilterPanel(false)}
                className="h-8 px-2.5 inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer"
              >
                <X className="h-4 w-4" /> Đóng
              </button>
            </div>
            {scope && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
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
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="block text-[10px] font-medium text-gray-500 mb-0.5 flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Khu vực
                </label>
                <select
                  value={filterRegionId}
                  onChange={(e) => changeFilterRegion(e.target.value)}
                  disabled={!companyId}
                  className="h-9 px-3 border rounded-lg text-sm min-w-[150px] disabled:bg-gray-100 bg-white"
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
              <div>
                <label className="block text-[10px] font-medium text-gray-500 mb-0.5 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Thời gian
                </label>
                <select
                  value={timePreset}
                  onChange={(e) => handleTimePresetChange(e.target.value)}
                  className="h-9 px-3 rounded-lg text-sm border bg-white min-w-[150px]"
                >
                  {CRM_TIME_PRESETS.map((p) => (
                    <option key={p.key || 'all'} value={p.key}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-gray-500 mb-0.5 flex items-center gap-1">
                  <CalendarRange className="h-3 w-3" /> Khoảng ngày
                </label>
                <button
                  type="button"
                  onClick={() => setShowDateRangePicker(true)}
                  className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg text-sm font-medium border bg-white border-gray-200 hover:border-violet-300 cursor-pointer"
                >
                  <CalendarRange className="h-3.5 w-3.5" />
                  {rangeFrom || rangeTo ? `${rangeFrom || '...'} → ${rangeTo || '...'}` : 'Chọn ngày…'}
                </button>
              </div>
            </div>
            {hasActiveFilters && (
              <div className="pt-1 border-t border-gray-100 flex justify-end">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs font-semibold text-red-600 hover:underline cursor-pointer"
                >
                  Xóa tất cả lọc
                </button>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-violet-600" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 border-b border-gray-100 bg-gray-50/80">
                  <th className="text-left px-5 py-3">Nhân viên</th>
                  <th className="text-left px-5 py-3">Ngày nghỉ</th>
                  <th className="text-left px-5 py-3">Loại nghỉ</th>
                  <th className="text-left px-5 py-3">Thời gian</th>
                  <th className="text-left px-5 py-3">Ghi chú</th>
                  <th className="text-left px-5 py-3">Tạo lúc</th>
                  <th className="text-right px-5 py-3">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center text-gray-400 py-16">
                      Không có đơn nghỉ phù hợp bộ lọc.
                    </td>
                  </tr>
                ) : filteredRows.map((l) => {
                  const typeColor = leaveTypeMeta(l.leave_type).color;
                  return (
                    <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50/70">
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-gray-900">{l.user?.full_name || '—'}</p>
                        <p className="text-xs text-gray-500 truncate max-w-[180px]">{l.user?.email || ''}</p>
                      </td>
                      <td className="px-5 py-3.5 text-gray-800 whitespace-nowrap">
                        {formatLeaveDateWithWeekday(l.start_date, l.end_date)}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: typeColor }} />
                          {leaveTypeDisplayLabel(l.leave_type)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-gray-600">{halfDayDisplayLabel(l.half_day)}</td>
                      <td className="px-5 py-3.5 text-gray-600 max-w-[220px] truncate" title={l.reason}>{l.reason || '—'}</td>
                      <td className="px-5 py-3.5 text-gray-500 tabular-nums whitespace-nowrap">{fmtCreatedAt(l.created_at)}</td>
                      <td className="px-5 py-3.5 text-right">{renderLeaveRowMenu(l)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DateRangePickerPopover
        open={showDateRangePicker}
        title="Chọn khoảng thời gian danh sách nghỉ"
        from={rangeFrom}
        to={rangeTo}
        onChange={({ from, to }) => {
          setRangeFrom(from || '');
          setRangeTo(to || '');
          setTimePreset(from || to ? 'custom' : 'this_year');
          persistTimeRange(from || to ? 'custom' : 'this_year', from || '', to || '');
        }}
        onClose={() => setShowDateRangePicker(false)}
      />
    </div>
  );
}
