import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { useModuleAccess } from '../shared/context/ModuleAccessContext';
import { isAdminLike, isCompanyScopedAdmin } from '../lib/adminRole';
import { formatDate, PRIORITY_LABELS, PRIORITY_COLORS } from '../lib/utils';
import UnifiedTaskRow, { getDeepLink } from '../components/UnifiedTaskRow';
import DateRangePickerPopover from '../components/DateRangePickerPopover';
import { CRM_TIME_PRESETS, getCrmDateRangeFromPreset } from '../lib/crmDateRangePresets';
import {
  Layers, LayoutGrid, List, AlertTriangle, Search, RefreshCw,
  Building2, X, CheckCircle2, Circle, Clock, Calendar, User, Filter,
} from 'lucide-react';
import {
  readStoredWorkTasksFilters,
  storeWorkTasksFilters,
  groupTasksByModule,
  groupTasksByDeadline,
  filterVisibleModuleColumns,
  TASK_KIND_OPTIONS,
  STATUS_FILTER_OPTIONS,
  DEADLINE_BUCKETS,
  isTaskDone,
  resolveModuleKey,
} from '../lib/workTasksDashboardUtils';

const VIEW_MODES = [
  { id: 'kanban', icon: LayoutGrid, label: 'Kanban' },
  { id: 'list', icon: List, label: 'Danh sách' },
  { id: 'deadline', icon: AlertTriangle, label: 'Deadline' },
];

const filterLabelCls = 'block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1';
const filterSelectCls = 'w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs outline-none focus:border-blue-400';
const filterFieldCls = 'w-full h-9 px-2.5 rounded-lg border border-slate-200 text-xs';

function WorkTaskCard({ task, onStatusChange, compact = false }) {
  const deepLink = getDeepLink(task);
  const overdue = task.deadline && new Date(task.deadline) < new Date() && !isTaskDone(task.status);
  const modKey = resolveModuleKey(task);

  return (
    <div className={`bg-white rounded-lg border border-gray-100 shadow-sm hover:shadow-md hover:border-blue-200 transition-all ${compact ? 'p-2' : 'p-3'}`}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => onStatusChange?.(task)}
          className="shrink-0 mt-0.5 cursor-pointer"
          title="Đổi trạng thái"
        >
          {isTaskDone(task.status)
            ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            : task.status === 'in_progress'
              ? <Clock className="h-4 w-4 text-blue-500" />
              : <Circle className="h-4 w-4 text-gray-300" />}
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${isTaskDone(task.status) ? 'line-through text-gray-400' : 'text-gray-900'}`}>
            {task.title}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            {task.project_code && (
              <span className="text-[10px] text-gray-500">{task.project_code}</span>
            )}
            {task.lead_title && (
              <span className="text-[10px] text-indigo-600 truncate max-w-[120px]">{task.lead_title}</span>
            )}
            {task.deadline && (
              <span className={`text-[10px] inline-flex items-center gap-0.5 ${overdue ? 'text-red-600 font-bold' : 'text-gray-400'}`}>
                <Calendar className="h-2.5 w-2.5" />{formatDate(task.deadline)}
              </span>
            )}
            {task.priority && (
              <span className={`text-[9px] px-1 py-0.5 rounded font-medium ${PRIORITY_COLORS[task.priority] || 'bg-gray-100 text-gray-600'}`}>
                {PRIORITY_LABELS[task.priority] || task.priority}
              </span>
            )}
          </div>
        </div>
        {deepLink && (
          <Link to={deepLink} className="shrink-0 text-[10px] text-blue-600 hover:underline" title="Mở module gốc">
            →
          </Link>
        )}
      </div>
    </div>
  );
}

export default function WorkTasksUnifiedPage() {
  const { user } = useAuth();
  const { canAccessModule } = useModuleAccess();
  const isAdmin = isAdminLike(user);
  const isCompanyScoped = isCompanyScopedAdmin(user);
  const userCompanyId = user?.company_id ? String(user.company_id) : '';
  const stored = readStoredWorkTasksFilters();

  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [summary, setSummary] = useState(null);
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [viewMode, setViewMode] = useState(stored.viewMode || 'kanban');
  const [search, setSearch] = useState(stored.search || '');
  const [filterCompany, setFilterCompany] = useState(stored.filterCompany || '');
  const [filterAssignee, setFilterAssignee] = useState(stored.filterAssignee || '');
  const [filterStatus, setFilterStatus] = useState(stored.filterStatus || '');
  const [filterKind, setFilterKind] = useState(stored.filterKind || '');
  const [filterModule, setFilterModule] = useState(stored.filterModule || '');
  const [filterOpenOnly, setFilterOpenOnly] = useState(stored.filterOpenOnly !== false);
  const [timePreset, setTimePreset] = useState(stored.timePreset || '');
  const [dateFrom, setDateFrom] = useState(stored.dateFrom || '');
  const [dateTo, setDateTo] = useState(stored.dateTo || '');
  const [showDateRangePicker, setShowDateRangePicker] = useState(false);

  const effectiveCompanyId = useMemo(() => {
    if (isCompanyScoped && userCompanyId) return userCompanyId;
    if (isAdmin && filterCompany) return filterCompany;
    if (!isAdmin && userCompanyId) return userCompanyId;
    return '';
  }, [isAdmin, isCompanyScoped, filterCompany, userCompanyId]);

  useEffect(() => {
    if (isCompanyScoped && userCompanyId) setFilterCompany(userCompanyId);
  }, [isCompanyScoped, userCompanyId]);

  useEffect(() => {
    if (!user?.id) return;
    if (!isAdmin) setFilterAssignee((prev) => prev || String(user.id));
  }, [user?.id, isAdmin]);

  useEffect(() => {
    if (!isAdmin && !isCompanyScoped) return;
    api.get('/companies', { params: { for_module: 'crm' } })
      .then((r) => setCompanies(Array.isArray(r.data?.companies || r.data) ? (r.data?.companies || r.data) : []))
      .catch(() => setCompanies([]));
  }, [isAdmin, isCompanyScoped]);

  useEffect(() => {
    const params = {};
    if (effectiveCompanyId) params.company_id = effectiveCompanyId;
    api.get('/users', { params })
      .then((r) => setUsers(Array.isArray(r.data) ? r.data : r.data?.users || []))
      .catch(() => setUsers([]));
  }, [effectiveCompanyId]);

  useEffect(() => {
    storeWorkTasksFilters({
      viewMode, search, filterCompany, filterAssignee, filterStatus,
      filterKind, filterModule, filterOpenOnly, timePreset, dateFrom, dateTo,
    });
  }, [viewMode, search, filterCompany, filterAssignee, filterStatus, filterKind, filterModule, filterOpenOnly, timePreset, dateFrom, dateTo]);

  const dateRange = useMemo(() => {
    if (!timePreset) return { from: '', to: '' };
    if (timePreset === 'custom') {
      if (!dateFrom || !dateTo) return { from: '', to: '' };
      return { from: dateFrom, to: dateTo };
    }
    return getCrmDateRangeFromPreset(timePreset);
  }, [timePreset, dateFrom, dateTo]);

  const handleTimePresetChange = (preset) => {
    setTimePreset(preset);
    if (preset === 'custom') {
      setShowDateRangePicker(true);
      return;
    }
    const range = getCrmDateRangeFromPreset(preset);
    setDateFrom(range.from);
    setDateTo(range.to);
  };

  const buildParams = useCallback(() => {
    const params = { page_size: 500 };
    if (search.trim()) params.q = search.trim();
    if (effectiveCompanyId) params.company_id = effectiveCompanyId;
    else if (filterCompany) params.company_id = filterCompany;
    if (filterAssignee) params.assignee_id = filterAssignee;
    if (filterStatus) params.status = filterStatus;
    if (filterKind) params.task_kind = filterKind;
    if (filterModule) params.module_key = filterModule;
    if (filterOpenOnly) params.open_only = '1';
    if (dateRange.from) params.date_from = dateRange.from;
    if (dateRange.to) params.date_to = dateRange.to;
    return params;
  }, [search, effectiveCompanyId, filterCompany, filterAssignee, filterStatus, filterKind, filterModule, filterOpenOnly, dateRange]);

  const load = useCallback(async () => {
    if (timePreset === 'custom' && (!dateFrom || !dateTo)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const params = buildParams();
      const summaryParams = {};
      if (effectiveCompanyId) summaryParams.company_id = effectiveCompanyId;
      else if (filterCompany) summaryParams.company_id = filterCompany;
      if (filterAssignee) summaryParams.assignee_id = filterAssignee;
      if (dateRange.from) summaryParams.date_from = dateRange.from;
      if (dateRange.to) summaryParams.date_to = dateRange.to;

      const [tasksRes, summaryRes] = await Promise.all([
        api.get('/work-tasks', { params }),
        api.get('/work-tasks/summary', { params: summaryParams }),
      ]);
      setTasks(tasksRes.data?.tasks || []);
      setSummary(summaryRes.data || null);
    } catch {
      setTasks([]);
      setSummary(null);
    }
    setLoading(false);
  }, [buildParams, effectiveCompanyId, filterCompany, filterAssignee, dateRange, timePreset, dateFrom, dateTo]);

  useEffect(() => { void load(); }, [load]);

  const visibleColumns = useMemo(
    () => filterVisibleModuleColumns(canAccessModule),
    [canAccessModule],
  );

  const filteredTasks = useMemo(() => {
    if (!search.trim()) return tasks;
    const q = search.trim().toLowerCase();
    return tasks.filter((t) =>
      (t.title || '').toLowerCase().includes(q)
      || (t.project_code || '').toLowerCase().includes(q)
      || (t.lead_title || '').toLowerCase().includes(q),
    );
  }, [tasks, search]);

  const moduleGroups = useMemo(
    () => groupTasksByModule(filteredTasks, { openOnly: filterOpenOnly }),
    [filteredTasks, filterOpenOnly],
  );

  const deadlineGroups = useMemo(
    () => groupTasksByDeadline(filteredTasks, { openOnly: filterOpenOnly }),
    [filteredTasks, filterOpenOnly],
  );

  const stats = useMemo(() => ({
    total: summary?.total ?? filteredTasks.length,
    open: summary?.open ?? filteredTasks.filter((t) => !isTaskDone(t.status)).length,
    overdue: summary?.overdue ?? filteredTasks.filter((t) => t.deadline && new Date(t.deadline) < new Date() && !isTaskDone(t.status)).length,
    done: summary?.done ?? filteredTasks.filter((t) => isTaskDone(t.status)).length,
    byModule: summary?.by_module || {},
  }), [summary, filteredTasks]);

  const handleStatusChange = async (task) => {
    const st = String(task.status || '').toLowerCase();
    let next = 'done';
    if (task.source === 'crm_task' || task.source === 'crm_assignment') {
      next = st === 'pending' ? 'in_progress' : 'completed';
    } else {
      next = st === 'pending' ? 'in_progress' : 'done';
    }
    try {
      await api.patch(`/work-tasks/${task.source}/${task.source_id}`, { status: next });
      void load();
    } catch { /* ignore */ }
  };

  const hasFilters = filterStatus || filterAssignee || filterKind || filterModule || search || timePreset
    || (isAdmin && !isCompanyScoped && filterCompany);
  const clearFilters = () => {
    setSearch('');
    setFilterStatus('');
    setFilterKind('');
    setFilterModule('');
    setTimePreset('');
    setDateFrom('');
    setDateTo('');
    if (isAdmin && !isCompanyScoped) {
      setFilterAssignee('');
      setFilterCompany('');
    } else {
      setFilterAssignee(user?.id ? String(user.id) : '');
    }
  };

  const companyDisplayName = useMemo(() => {
    if (!userCompanyId) return 'Công ty của bạn';
    const co = companies.find((c) => String(c.id) === String(userCompanyId));
    return co?.short_name || co?.name || 'Công ty của bạn';
  }, [companies, userCompanyId]);

  if (loading && !tasks.length) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Layers className="h-7 w-7 text-blue-600" />
            Công việc tổng hợp
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Nhiệm vụ từ CRM, Sản xuất, Vận chuyển, Giao việc — theo quyền module của bạn
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            {VIEW_MODES.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setViewMode(v.id)}
                className={`h-8 px-3 rounded-md text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${
                  viewMode === v.id ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-200'
                }`}
              >
                <v.icon className="h-3.5 w-3.5" />{v.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="h-8 w-8 flex items-center justify-center rounded-lg border bg-white hover:bg-gray-50 cursor-pointer"
            title="Làm mới"
          >
            <RefreshCw className={`h-4 w-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Tổng', value: stats.total, icon: List, accent: 'bg-slate-500', gradient: 'from-slate-100 via-gray-50 to-white', border: 'border-slate-300' },
          { label: 'Đang mở', value: stats.open, icon: Clock, accent: 'bg-blue-500', gradient: 'from-blue-100 via-sky-50 to-white', border: 'border-blue-300' },
          { label: 'Quá hạn', value: stats.overdue, icon: AlertTriangle, accent: 'bg-red-500', gradient: 'from-red-100 via-rose-50 to-white', border: 'border-red-300' },
          { label: 'Hoàn thành', value: stats.done, icon: CheckCircle2, accent: 'bg-emerald-500', gradient: 'from-emerald-100 via-green-50 to-white', border: 'border-emerald-300' },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className={`relative overflow-hidden bg-gradient-to-br ${kpi.gradient} border ${kpi.border} rounded-2xl p-4 shadow-sm`}>
              <div className={`absolute top-0 left-0 right-0 h-1 ${kpi.accent}`} />
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-white/70 flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5 text-gray-700" />
                </div>
                <div>
                  <p className="text-2xl font-extrabold text-gray-900 leading-none">{kpi.value}</p>
                  <p className="text-xs font-semibold mt-1 text-gray-600 uppercase tracking-wide">{kpi.label}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Module chips */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilterModule('')}
          className={`text-xs px-3 py-1.5 rounded-full border cursor-pointer transition-colors ${
            !filterModule ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-200 hover:border-blue-300'
          }`}
        >
          Tất cả module
        </button>
        {visibleColumns.map((col) => {
          const count = stats.byModule[col.key] ?? moduleGroups[col.key]?.length ?? 0;
          return (
            <button
              key={col.key}
              type="button"
              onClick={() => setFilterModule(filterModule === col.key ? '' : col.key)}
              className={`text-xs px-3 py-1.5 rounded-full border cursor-pointer transition-colors inline-flex items-center gap-1.5 ${
                filterModule === col.key ? 'bg-blue-600 text-white border-blue-600' : `${col.bg} hover:opacity-90`
              }`}
            >
              <span>{col.emoji}</span>
              <span>{col.label}</span>
              {count > 0 && (
                <span className={`text-[10px] font-bold px-1.5 rounded-full ${
                  filterModule === col.key ? 'bg-white/25' : 'bg-white/80 text-gray-700'
                }`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bộ lọc chính — Công ty, Nhân viên, Thời gian (giống CRM) */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {isAdmin && !isCompanyScoped && companies.length > 0 && (
            <div className="min-w-0">
              <label className={filterLabelCls}>Công ty</label>
              <div className="relative">
                <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <select
                  value={filterCompany}
                  onChange={(e) => {
                    setFilterCompany(e.target.value);
                    setFilterAssignee('');
                  }}
                  className={`${filterSelectCls} pl-8 ${filterCompany ? 'border-blue-300 bg-blue-50/50 text-blue-800' : ''}`}
                >
                  <option value="">Tất cả công ty</option>
                  {companies.map((co) => (
                    <option key={co.id} value={co.id}>{co.short_name || co.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          {!isAdmin && userCompanyId && (
            <div className="min-w-0">
              <label className={filterLabelCls}>Công ty</label>
              <div className={`${filterFieldCls} flex items-center bg-blue-50/80 border-blue-200 text-blue-800 cursor-default`}>
                {companyDisplayName}
              </div>
            </div>
          )}
          {isCompanyScoped && userCompanyId && (
            <div className="min-w-0">
              <label className={filterLabelCls}>Công ty</label>
              <div className={`${filterFieldCls} flex items-center bg-indigo-50/80 border-indigo-200 text-indigo-900 cursor-default truncate`} title="Admin phạm vi một công ty">
                {companyDisplayName}
              </div>
            </div>
          )}

          <div className="min-w-0">
            <label className={filterLabelCls}>Nhân viên</label>
            <div className="relative">
              <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <select
                value={filterAssignee}
                onChange={(e) => setFilterAssignee(e.target.value)}
                className={`${filterSelectCls} pl-8 ${filterAssignee ? 'border-emerald-300 bg-emerald-50/50 text-emerald-800' : ''}`}
              >
                <option value="">{isAdmin ? 'Tất cả nhân viên' : 'Tất cả NV'}</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
          </div>

          <div className="min-w-0">
            <label className={filterLabelCls}>Thời gian (deadline)</label>
            <div className="relative">
              <Clock className={`absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none ${timePreset ? 'text-violet-500' : 'text-slate-400'}`} />
              <select
                value={timePreset}
                onChange={(e) => {
                  handleTimePresetChange(e.target.value);
                  if (e.target.value === 'custom') setShowDateRangePicker(true);
                }}
                className={`${filterSelectCls} pl-8 ${timePreset ? 'border-violet-300 bg-violet-50/50 text-violet-800' : ''}`}
              >
                {CRM_TIME_PRESETS.map((p) => (
                  <option key={p.key || 'all'} value={p.key}>{p.label}</option>
                ))}
              </select>
            </div>
            {timePreset === 'custom' && (
              <button
                type="button"
                onClick={() => setShowDateRangePicker(true)}
                className={`mt-1.5 ${filterFieldCls} flex items-center gap-2 text-left cursor-pointer hover:border-violet-300 hover:bg-violet-50/40 w-full`}
              >
                <Calendar className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                {dateFrom && dateTo ? `${dateFrom} → ${dateTo}` : 'Chọn ngày bắt đầu / kết thúc'}
              </button>
            )}
          </div>
        </div>

        {/* Bộ lọc phụ */}
        <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-gray-100">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm tiêu đề, dự án, lead..."
              className="w-full h-9 pl-9 pr-3 rounded-lg border text-sm outline-none focus:border-blue-500"
            />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="h-9 px-3 rounded-lg border text-xs">
            {STATUS_FILTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={filterKind} onChange={(e) => setFilterKind(e.target.value)} className="h-9 px-3 rounded-lg border text-xs">
            {TASK_KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filterOpenOnly}
              onChange={(e) => setFilterOpenOnly(e.target.checked)}
              className="rounded border-gray-300"
            />
            Chỉ việc mở
          </label>
          {hasFilters && (
            <button type="button" onClick={clearFilters} className="h-9 px-3 text-xs text-red-500 hover:bg-red-50 rounded-lg cursor-pointer flex items-center gap-1">
              <X className="h-3 w-3" />Xóa lọc
            </button>
          )}
          <button type="button" onClick={() => void load()} className="h-9 px-3 bg-gray-900 text-white rounded-lg text-xs cursor-pointer inline-flex items-center gap-1">
            <Filter className="h-3.5 w-3.5" />Lọc
          </button>
        </div>
      </div>

      {showDateRangePicker && (
        <DateRangePickerPopover
          open={showDateRangePicker}
          from={dateFrom}
          to={dateTo}
          onChange={({ from, to }) => {
            setDateFrom(from || '');
            setDateTo(to || '');
            setTimePreset('custom');
          }}
          onClose={() => setShowDateRangePicker(false)}
        />
      )}

      {/* KANBAN — cột theo module */}
      {viewMode === 'kanban' && (
        <div className="flex gap-3 overflow-x-auto pb-2 min-h-[420px] [scrollbar-width:thin]">
          {visibleColumns
            .filter((col) => !filterModule || col.key === filterModule)
            .map((col) => {
              const colTasks = moduleGroups[col.key] || [];
              if (!colTasks.length && filterModule && filterModule !== col.key) return null;
              return (
                <div key={col.key} className={`shrink-0 w-[280px] flex flex-col rounded-xl border ${col.bg}`}>
                  <div className="px-3 py-2.5 border-b border-black/5 flex items-center justify-between">
                    <span className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                      <span>{col.emoji}</span>{col.label}
                    </span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white/80 text-gray-700">{colTasks.length}</span>
                  </div>
                  <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-320px)] [scrollbar-width:thin]">
                    {colTasks.length === 0 ? (
                      <p className="text-center text-xs text-gray-400 py-6">Không có NV</p>
                    ) : colTasks.map((t) => (
                      <WorkTaskCard key={t.unified_id} task={t} onStatusChange={handleStatusChange} compact />
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* LIST */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-xl border divide-y overflow-y-auto" style={{ maxHeight: '640px' }}>
          {filteredTasks.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-10">Không có nhiệm vụ phù hợp bộ lọc</p>
          ) : filteredTasks.map((t) => (
            <UnifiedTaskRow key={t.unified_id} task={t} onStatusChange={handleStatusChange} compact />
          ))}
        </div>
      )}

      {/* DEADLINE */}
      {viewMode === 'deadline' && (
        <div className="space-y-3">
          {DEADLINE_BUCKETS.filter((g) => (deadlineGroups[g.key] || []).length > 0).map((group) => (
            <div key={group.key} className={`border rounded-xl ${group.color}`}>
              <div className="px-4 py-2 font-semibold text-sm flex items-center justify-between">
                <span>{group.label} <span className="text-gray-400 font-normal">({deadlineGroups[group.key].length})</span></span>
              </div>
              <div className="bg-white rounded-b-xl overflow-y-auto p-2 space-y-2" style={{ maxHeight: '480px' }}>
                {deadlineGroups[group.key].map((t) => (
                  <WorkTaskCard key={t.unified_id} task={t} onStatusChange={handleStatusChange} />
                ))}
              </div>
            </div>
          ))}
          {DEADLINE_BUCKETS.every((g) => !(deadlineGroups[g.key] || []).length) && (
            <p className="text-center text-sm text-gray-400 py-10">Không có nhiệm vụ theo deadline</p>
          )}
        </div>
      )}
    </div>
  );
}
