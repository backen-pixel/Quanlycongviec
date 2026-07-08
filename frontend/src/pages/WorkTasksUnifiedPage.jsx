import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { useModuleAccess } from '../shared/context/ModuleAccessContext';
import { isAdminLike, isCompanyScopedAdmin } from '../lib/adminRole';
import UnifiedTaskRow from '../components/UnifiedTaskRow';
import WorkTasksStatusKanban from '../components/WorkTasksStatusKanban';
import WorkTasksKanbanColumnModal from '../components/WorkTasksKanbanColumnModal';
import WorkTaskFormModal from '../components/WorkTaskFormModal';
import DateRangePickerPopover from '../components/DateRangePickerPopover';
import SearchInlineFilterChips, { SearchClearButton } from '../components/SearchInlineFilterChips';
import WorkTasksFilterPanel, { WORK_TASKS_FILTER_TABS_META } from '../components/WorkTasksFilterPanel';
import { CRM_TIME_PRESETS, getCrmDateRangeFromPreset } from '../lib/crmDateRangePresets';
import {
  Layers, LayoutGrid, List, AlertTriangle, Search, RefreshCw,
  CheckCircle2, Clock, Filter, Plus, Columns3,
} from 'lucide-react';
import {
  readStoredWorkTasksFilters,
  storeWorkTasksFilters,
  readStoredWorkTasksFilterPanelPos,
  storeWorkTasksFilterPanelPos,
  groupTasksByModule,
  filterVisibleModuleColumns,
  resolveCompaniesForModuleFilter,
  resolveDefaultWorkTasksFilterCompany,
  STATUS_FILTER_OPTIONS,
  TASK_KIND_OPTIONS,
  isTaskDone,
  resolveStatusForApi,
  resolveColumnStatusKey,
  readStoredKanbanColumns,
  storeKanbanColumns,
  serializeKanbanColumns,
  mergeKanbanColumnStyles,
  getEffectiveKanbanColumns,
  createCustomKanbanColumn,
  ensureKanbanColumns,
  getDeadlineKanbanColumns,
} from '../lib/workTasksDashboardUtils';

const VIEW_MODES = [
  { id: 'kanban', icon: LayoutGrid, label: 'Kanban' },
  { id: 'list', icon: List, label: 'Danh sách' },
  { id: 'deadline', icon: AlertTriangle, label: 'Deadline' },
];

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
  const [filterLead, setFilterLead] = useState(stored.filterLead || '');
  const [leadOptions, setLeadOptions] = useState([]);
  const [leadOptionsLoading, setLeadOptionsLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState(stored.filterStatus || '');
  const [filterKind, setFilterKind] = useState(stored.filterKind || '');
  const [filterModule, setFilterModule] = useState(stored.filterModule || '');
  const [filterOpenOnly, setFilterOpenOnly] = useState(stored.filterOpenOnly !== false);
  const [timePreset, setTimePreset] = useState(stored.timePreset || '');
  const [dateFrom, setDateFrom] = useState(stored.dateFrom || '');
  const [dateTo, setDateTo] = useState(stored.dateTo || '');
  const [showDateRangePicker, setShowDateRangePicker] = useState(false);
  const [showAdvFilter, setShowAdvFilter] = useState(false);
  const [filterTab, setFilterTab] = useState('employee');
  const [filterPanelPos, setFilterPanelPos] = useState(() => readStoredWorkTasksFilterPanelPos());
  const [searchFocused, setSearchFocused] = useState(false);
  const filterPanelRef = useRef(null);
  const filterPanelDragRef = useRef(null);
  const [taskModal, setTaskModal] = useState(null);
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskDeleting, setTaskDeleting] = useState(false);
  const [kanbanColumnDefs, setKanbanColumnDefs] = useState(() => ensureKanbanColumns(readStoredKanbanColumns()));

  useEffect(() => {
    setKanbanColumnDefs((prev) => {
      const ensured = ensureKanbanColumns(prev);
      const prevJson = JSON.stringify(serializeKanbanColumns(prev));
      const nextJson = JSON.stringify(serializeKanbanColumns(ensured));
      if (prevJson !== nextJson) {
        storeKanbanColumns(serializeKanbanColumns(ensured));
        return ensured;
      }
      return prev;
    });
  }, []);
  const [columnModal, setColumnModal] = useState(null);

  const deadlineKanbanColumns = useMemo(() => getDeadlineKanbanColumns(), []);

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

  const companiesModuleFilter = useMemo(
    () => resolveCompaniesForModuleFilter(filterModule),
    [filterModule],
  );

  useEffect(() => {
    if (!isAdmin && !isCompanyScoped) return;
    const params = companiesModuleFilter ? { for_module: companiesModuleFilter } : {};
    api.get('/companies', { params })
      .then((r) => {
        const list = Array.isArray(r.data?.companies || r.data) ? (r.data?.companies || r.data) : [];
        setCompanies(list);
        if (isAdmin && !isCompanyScoped) {
          setFilterCompany((prev) => resolveDefaultWorkTasksFilterCompany(list, prev));
        }
      })
      .catch(() => setCompanies([]));
  }, [isAdmin, isCompanyScoped, companiesModuleFilter]);

  useEffect(() => {
    const params = {};
    if (effectiveCompanyId) params.company_id = effectiveCompanyId;
    api.get('/users', { params })
      .then((r) => setUsers(Array.isArray(r.data) ? r.data : r.data?.users || []))
      .catch(() => setUsers([]));
  }, [effectiveCompanyId]);

  useEffect(() => {
    storeWorkTasksFilters({
      viewMode, search, filterCompany, filterAssignee, filterLead, filterStatus,
      filterKind, filterModule, filterOpenOnly, timePreset, dateFrom, dateTo,
    });
  }, [viewMode, search, filterCompany, filterAssignee, filterLead, filterStatus, filterKind, filterModule, filterOpenOnly, timePreset, dateFrom, dateTo]);

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

  useEffect(() => {
    if (!filterAssignee) {
      setLeadOptions([]);
      setFilterLead('');
      return undefined;
    }
    let cancelled = false;
    setLeadOptionsLoading(true);
    const params = { assignee_id: filterAssignee };
    if (effectiveCompanyId) params.company_id = effectiveCompanyId;
    api.get('/work-tasks/lead-options', { params })
      .then((r) => {
        if (cancelled) return;
        const leads = Array.isArray(r.data?.leads) ? r.data.leads : [];
        setLeadOptions(leads);
        setFilterLead((prev) => (prev && leads.some((ld) => String(ld.id) === String(prev)) ? prev : ''));
      })
      .catch(() => {
        if (!cancelled) {
          setLeadOptions([]);
          setFilterLead('');
        }
      })
      .finally(() => {
        if (!cancelled) setLeadOptionsLoading(false);
      });
    return () => { cancelled = true; };
  }, [filterAssignee, effectiveCompanyId]);

  const buildParams = useCallback(() => {
    const params = { page_size: 500 };
    if (search.trim()) params.q = search.trim();
    if (effectiveCompanyId) params.company_id = effectiveCompanyId;
    else if (filterCompany) params.company_id = filterCompany;
    if (filterLead) params.lead_id = filterLead;
    else if (filterAssignee) params.assignee_id = filterAssignee;
    if (filterStatus) params.status = filterStatus;
    if (filterKind) params.task_kind = filterKind;
    if (filterModule) params.module_key = filterModule;
    if (dateRange.from) params.date_from = dateRange.from;
    if (dateRange.to) params.date_to = dateRange.to;
    return params;
  }, [search, effectiveCompanyId, filterCompany, filterAssignee, filterLead, filterStatus, filterKind, filterModule, filterOpenOnly, dateRange]);

  const load = useCallback(async () => {
    if (timePreset === 'custom' && (!dateFrom || !dateTo)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const params = buildParams();
      const summaryParams = { ...params };
      delete summaryParams.module_key;
      delete summaryParams.page_size;

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
  }, [buildParams, effectiveCompanyId, filterCompany, filterAssignee, filterLead, dateRange, timePreset, dateFrom, dateTo]);

  useEffect(() => { void load(); }, [load]);

  const visibleColumns = useMemo(
    () => filterVisibleModuleColumns(canAccessModule),
    [canAccessModule],
  );

  const visibleKanbanColumns = useMemo(
    () => getEffectiveKanbanColumns(filterOpenOnly, kanbanColumnDefs),
    [kanbanColumnDefs, filterOpenOnly],
  );

  const persistKanbanColumns = useCallback((cols) => {
    const merged = ensureKanbanColumns(cols);
    setKanbanColumnDefs(merged);
    storeKanbanColumns(serializeKanbanColumns(merged));
  }, []);

  const filteredTasks = useMemo(() => {
    if (!search.trim()) return tasks;
    const q = search.trim().toLowerCase();
    return tasks.filter((t) =>
      (t.title || '').toLowerCase().includes(q)
      || (t.project_code || '').toLowerCase().includes(q)
      || (t.lead_title || '').toLowerCase().includes(q),
    );
  }, [tasks, search]);

  const stats = useMemo(() => ({
    total: summary?.total ?? filteredTasks.length,
    open: summary?.open ?? filteredTasks.filter((t) => !isTaskDone(t.status)).length,
    overdue: summary?.overdue ?? filteredTasks.filter((t) => t.deadline && new Date(t.deadline) < new Date() && !isTaskDone(t.status)).length,
    done: summary?.done ?? filteredTasks.filter((t) => isTaskDone(t.status)).length,
    byModule: summary?.by_module || {},
  }), [summary, filteredTasks]);

  const moduleChipCounts = useMemo(() => {
    const fromSummary = stats.byModule;
    const fallback = groupTasksByModule(filteredTasks, { openOnly: filterOpenOnly });
    const counts = {};
    for (const col of visibleColumns) {
      counts[col.key] = fromSummary[col.key] ?? fallback[col.key]?.length ?? 0;
    }
    return counts;
  }, [stats.byModule, filteredTasks, filterOpenOnly, visibleColumns]);

  const allModulesCount = useMemo(
    () => Object.values(moduleChipCounts).reduce((sum, n) => sum + (n || 0), 0),
    [moduleChipCounts],
  );

  const patchTaskStatus = useCallback(async (task, columnKey) => {
    const statusKey = resolveColumnStatusKey(visibleKanbanColumns, columnKey);
    const next = resolveStatusForApi(task, statusKey);
    const body = { status: next };
    if (task.lead_id) body.lead_id = task.lead_id;
    try {
      await api.patch(`/work-tasks/${task.source}/${task.source_id}`, body);
      void load();
    } catch (err) {
      const msg = err.response?.data?.error
        || (err.code === 'ERR_NETWORK' ? 'Không kết nối được server — kiểm tra backend đang chạy port 4000' : null)
        || err.message
        || 'Không cập nhật được trạng thái';
      throw new Error(msg);
    }
  }, [load, visibleKanbanColumns]);

  const patchDealStatus = useCallback(async (dealTasks, columnKey) => {
    const statusKey = resolveColumnStatusKey(visibleKanbanColumns, columnKey);
    const errors = [];
    for (const task of dealTasks) {
      try {
        const next = resolveStatusForApi(task, statusKey);
        const body = { status: next };
        if (task.lead_id) body.lead_id = task.lead_id;
        await api.patch(`/work-tasks/${task.source}/${task.source_id}`, body);
      } catch (err) {
        errors.push(task.title || task.unified_id);
      }
    }
    void load();
    if (errors.length) {
      throw new Error(`Không cập nhật được ${errors.length} nhiệm vụ trong deal`);
    }
  }, [load, visibleKanbanColumns]);

  const patchTaskFields = useCallback(async (task, payload) => {
    const body = { ...payload };
    if (body.deadline === null) body.deadline = null;
    if (task.source === 'task' && body.deadline) {
      body.due_date = body.deadline;
      delete body.deadline;
    }
    await api.patch(`/work-tasks/${task.source}/${task.source_id}`, body);
    void load();
  }, [load]);

  const handleTaskFormSave = async ({ mode, task, payload }) => {
    setTaskSaving(true);
    try {
      if (mode === 'create') {
        const { source, lead_id, company_id, title, description, status, priority, deadline, assignee_id, due_date } = payload;
        const body = { title, description, status, priority, assignee_id };
        if (source === 'task') {
          body.due_date = due_date || deadline || null;
          body.task_type = 'personal';
        } else {
          body.deadline = deadline || null;
        }
        if (company_id) body.company_id = company_id;
        await api.post('/work-tasks', { source, lead_id, ...body });
      } else {
        await patchTaskFields(task, payload);
      }
      setTaskModal(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Không lưu được nhiệm vụ');
    } finally {
      setTaskSaving(false);
    }
  };

  const handleTaskFormDelete = async (task) => {
    if (!task) return;
    if (!window.confirm(`Xóa nhiệm vụ «${task.title}»?`)) return;
    setTaskDeleting(true);
    try {
      await api.delete(`/work-tasks/${task.source}/${task.source_id}`);
      setTaskModal(null);
      void load();
    } catch (err) {
      alert(err.response?.data?.error || 'Không xóa được nhiệm vụ');
    } finally {
      setTaskDeleting(false);
    }
  };

  const handleStatusChange = async (task, kanbanKey) => {
    try {
      await patchTaskStatus(task, kanbanKey || 'done');
    } catch { /* ignore */ }
  };

  const handleColumnSave = ({ label, statusKey, colorId }) => {
    if (columnModal?.mode === 'edit' && columnModal.column) {
      persistKanbanColumns(kanbanColumnDefs.map((c) => (
        c.key === columnModal.column.key
          ? mergeKanbanColumnStyles({ ...c, label, statusKey, colorId })
          : c
      )));
    } else {
      persistKanbanColumns([...kanbanColumnDefs, createCustomKanbanColumn({ label, statusKey, colorId })]);
    }
    setColumnModal(null);
  };

  const handleColumnDelete = (col) => {
    if (!col || col.isSystem) return;
    if (!window.confirm(`Xóa cột «${col.label}»? Nhiệm vụ trong cột sẽ hiển thị theo trạng thái tương ứng.`)) return;
    persistKanbanColumns(kanbanColumnDefs.filter((c) => c.key !== col.key));
    setColumnModal(null);
  };

  const resetFilters = useCallback(() => {
    setSearch('');
    setFilterStatus('');
    setFilterKind('');
    setFilterModule('');
    setFilterLead('');
    setTimePreset('');
    setDateFrom('');
    setDateTo('');
    setFilterOpenOnly(true);
    if (isAdmin && !isCompanyScoped) {
      setFilterAssignee('');
      setFilterCompany(resolveDefaultWorkTasksFilterCompany(companies, ''));
    } else {
      setFilterAssignee(user?.id ? String(user.id) : '');
    }
  }, [isAdmin, isCompanyScoped, user?.id, companies]);

  const openFilterPanel = useCallback(() => {
    setShowAdvFilter((open) => !open);
    if (!showAdvFilter) setFilterTab('employee');
  }, [showAdvFilter]);

  const closeFilterPanel = useCallback(() => {
    setShowAdvFilter(false);
    setShowDateRangePicker(false);
  }, []);

  const beginFilterPanelDrag = useCallback((e) => {
    if (e.button !== 0) return;
    const panel = filterPanelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const originX = filterPanelPos?.x ?? rect.left;
    const originY = filterPanelPos?.y ?? rect.top;
    filterPanelDragRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      originX,
      originY,
      width: rect.width,
      height: rect.height,
    };
    if (!filterPanelPos) setFilterPanelPos({ x: originX, y: originY });
    e.preventDefault();
  }, [filterPanelPos]);

  useEffect(() => {
    const onMove = (e) => {
      const drag = filterPanelDragRef.current;
      if (!drag?.dragging) return;
      const margin = 8;
      const maxX = Math.max(margin, window.innerWidth - drag.width - margin);
      const maxY = Math.max(margin, window.innerHeight - drag.height - margin);
      const x = Math.min(maxX, Math.max(margin, drag.originX + (e.clientX - drag.startX)));
      const y = Math.min(maxY, Math.max(margin, drag.originY + (e.clientY - drag.startY)));
      setFilterPanelPos({ x, y });
    };
    const onUp = () => {
      const drag = filterPanelDragRef.current;
      if (!drag?.dragging) return;
      drag.dragging = false;
      setFilterPanelPos((pos) => {
        if (pos) storeWorkTasksFilterPanelPos(pos);
        return pos;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  useEffect(() => {
    if (!showAdvFilter) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !showDateRangePicker) closeFilterPanel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showAdvFilter, showDateRangePicker, closeFilterPanel]);

  const activeFilterChips = useMemo(() => {
    const chips = [];
    const push = (key, label, onClear) => chips.push({ key, label, onClear });

    if (search.trim()) {
      push('search', `Tìm: “${search.trim()}”`, () => setSearch(''));
    }
    if (isAdmin && !isCompanyScoped && filterCompany) {
      const name = companies.find((c) => String(c.id) === String(filterCompany))?.short_name
        || companies.find((c) => String(c.id) === String(filterCompany))?.name
        || filterCompany;
      push('company', `Công ty: ${name}`, () => {
        setFilterCompany(resolveDefaultWorkTasksFilterCompany(companies, ''));
        setFilterAssignee('');
      });
    }
    if (filterAssignee && (isAdmin || String(filterAssignee) !== String(user?.id || ''))) {
      const name = users.find((u) => String(u.id) === String(filterAssignee))?.full_name || filterAssignee;
      push('assignee', `NV: ${name}`, () => {
        setFilterAssignee('');
        setFilterLead('');
      });
    }
    if (filterLead) {
      const ld = leadOptions.find((l) => String(l.id) === String(filterLead));
      const label = ld
        ? `${ld.type === 'deal' ? 'Deal' : 'Lead'}: ${ld.code ? `${ld.code} — ` : ''}${ld.title}`
        : `Lead/Deal: ${filterLead}`;
      push('lead', label, () => setFilterLead(''));
    }
    if (filterStatus) {
      const label = STATUS_FILTER_OPTIONS.find((o) => o.value === filterStatus)?.label || filterStatus;
      push('status', `Trạng thái: ${label}`, () => setFilterStatus(''));
    }
    if (filterKind) {
      const label = TASK_KIND_OPTIONS.find((o) => o.value === filterKind)?.label || filterKind;
      push('kind', `Loại: ${label}`, () => setFilterKind(''));
    }
    if (filterModule) {
      const col = visibleColumns.find((c) => c.key === filterModule);
      push('module', `Module: ${col?.label || filterModule}`, () => setFilterModule(''));
    }
    if (!filterOpenOnly) {
      push('openOnly', 'Gồm việc đã đóng', () => setFilterOpenOnly(true));
    }
    if (timePreset) {
      push('time', `Thời gian: ${CRM_TIME_PRESETS.find((p) => p.key === timePreset)?.label || timePreset}`, () => {
        setTimePreset('');
        setDateFrom('');
        setDateTo('');
      });
    }
    return chips;
  }, [
    search, filterCompany, filterAssignee, filterLead, filterStatus, filterKind, filterModule,
    filterOpenOnly, timePreset, isAdmin, isCompanyScoped, companies, users, user?.id, visibleColumns, leadOptions,
  ]);

  const inlineFilterChips = useMemo(
    () => activeFilterChips.filter((c) => c.key !== 'search'),
    [activeFilterChips],
  );

  const filterTabCounts = useMemo(() => ({
    employee: [filterCompany, filterAssignee && (isAdmin || String(filterAssignee) !== String(user?.id || '')), filterLead].filter(Boolean).length,
    task: [filterStatus, filterKind, !filterOpenOnly].filter(Boolean).length,
    display: timePreset ? 1 : 0,
  }), [filterCompany, filterAssignee, filterLead, filterStatus, filterKind, filterOpenOnly, timePreset, isAdmin, user?.id]);

  const filterTabs = useMemo(
    () => WORK_TASKS_FILTER_TABS_META.map((tab) => ({ ...tab, count: filterTabCounts[tab.id] || 0 })),
    [filterTabCounts],
  );

  const filterPanelActive = filterTabCounts.employee + filterTabCounts.task + filterTabCounts.display > 0
    || filterModule;

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
            onClick={() => setTaskModal({ mode: 'create', defaultStatus: 'pending' })}
            className="h-8 px-3 rounded-lg bg-blue-600 text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-blue-700 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />Thêm việc
          </button>
          {viewMode === 'kanban' && (
            <button
              type="button"
              onClick={() => setColumnModal({ mode: 'create' })}
              className="h-8 px-3 rounded-lg border border-violet-300 bg-violet-50 text-violet-800 text-xs font-semibold flex items-center gap-1.5 hover:bg-violet-100 cursor-pointer"
            >
              <Columns3 className="h-3.5 w-3.5" />Thêm cột
            </button>
          )}
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

      {/* Thanh tìm kiếm & bộ lọc — giống CRM dashboard */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-1 px-2.5 py-1.5 sm:px-3">
          <div
            className={`group/search flex items-center shrink-0 flex-1 min-w-0 max-w-none sm:max-w-[22rem] lg:max-w-[28rem] rounded-md border transition-colors ${
              searchFocused
                ? 'border-violet-400 bg-white ring-1 ring-violet-200/60'
                : search.trim()
                  ? 'border-violet-300 bg-violet-50/80'
                  : inlineFilterChips.length && !showAdvFilter
                    ? 'border-violet-200 bg-violet-50/40'
                    : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="relative flex-1 min-w-0 flex items-center gap-1 pl-7 pr-1">
              <Search
                className={`absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none transition-colors ${
                  searchFocused || search.trim() ? 'text-violet-600' : 'text-slate-400'
                }`}
              />
              {!showAdvFilter && inlineFilterChips.length > 0 && (
                <SearchInlineFilterChips
                  chips={inlineFilterChips}
                  opacityClass={
                    searchFocused ? 'opacity-40' : search.trim() ? 'opacity-35' : 'opacity-45 group-hover/search:opacity-100'
                  }
                  onClearChip={(chip) => chip.onClear()}
                  onClearAll={resetFilters}
                  showClearAll={inlineFilterChips.length > 1}
                />
              )}
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
                placeholder="Tìm tiêu đề, dự án, lead..."
                className={`flex-1 min-w-[3.5rem] h-8 bg-transparent border-0 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 ${search ? 'pr-7' : ''}`}
              />
              {search && (
                <SearchClearButton onClick={() => { setSearch(''); setSearchFocused(false); }} />
              )}
            </div>
            <div className="shrink-0 pr-1">
              <button
                type="button"
                onClick={openFilterPanel}
                aria-expanded={showAdvFilter}
                className={`relative h-6 w-6 flex items-center justify-center rounded border transition-colors cursor-pointer ${
                  showAdvFilter || filterPanelActive
                    ? 'bg-violet-100 text-violet-700 border-violet-300'
                    : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100 hover:text-slate-700'
                }`}
                title={showAdvFilter ? 'Thu gọn bộ lọc' : 'Bộ lọc nâng cao'}
                aria-label="Bộ lọc"
              >
                <Filter className="h-3 w-3" />
                {filterPanelActive && (
                  <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-violet-600 ring-1 ring-white" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <WorkTasksFilterPanel
        open={showAdvFilter}
        panelRef={filterPanelRef}
        panelPos={filterPanelPos}
        onDragStart={beginFilterPanelDrag}
        onClose={closeFilterPanel}
        filterTab={filterTab}
        onFilterTabChange={setFilterTab}
        filterTabs={filterTabs}
        isAdmin={isAdmin}
        isCompanyScoped={isCompanyScoped}
        companies={companies}
        users={users}
        userCompanyId={userCompanyId}
        companyDisplayName={companyDisplayName}
        filterCompany={filterCompany}
        onFilterCompanyChange={(v) => {
          setFilterCompany(v);
          setFilterAssignee('');
          setFilterLead('');
        }}
        filterAssignee={filterAssignee}
        onFilterAssigneeChange={(v) => {
          setFilterAssignee(v);
          setFilterLead('');
        }}
        filterLead={filterLead}
        onFilterLeadChange={setFilterLead}
        leadOptions={leadOptions}
        leadOptionsLoading={leadOptionsLoading}
        filterStatus={filterStatus}
        onFilterStatusChange={setFilterStatus}
        filterKind={filterKind}
        onFilterKindChange={setFilterKind}
        filterOpenOnly={filterOpenOnly}
        onFilterOpenOnlyChange={setFilterOpenOnly}
        timePreset={timePreset}
        onTimePresetChange={handleTimePresetChange}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onOpenDatePicker={() => setShowDateRangePicker(true)}
        onResetFilters={resetFilters}
        onResetPosition={() => {
          setFilterPanelPos(null);
          storeWorkTasksFilterPanelPos(null);
        }}
      />

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
          className={`text-xs px-3 py-1.5 rounded-full border cursor-pointer transition-colors inline-flex items-center gap-1.5 ${
            !filterModule ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-200 hover:border-blue-300'
          }`}
        >
          Tất cả module
          {allModulesCount > 0 && (
            <span className={`text-[10px] font-bold px-1.5 rounded-full ${
              !filterModule ? 'bg-white/25' : 'bg-gray-100 text-gray-700'
            }`}>{allModulesCount}</span>
          )}
        </button>
        {visibleColumns.map((col) => {
          const count = moduleChipCounts[col.key] ?? 0;
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

      {/* KANBAN — cột trạng thái, nhóm theo deal/dự án */}
      {viewMode === 'kanban' && (
        <>
          <p className="text-xs text-gray-500 -mt-2">
            <strong>{visibleKanbanColumns.length} cột</strong> · Kéo <strong>icon ≡</strong> trên deal để chuyển cả nhóm (kể cả NV hoàn thành) · Kéo từng thẻ hoặc nhấp đúp để sửa / ghi chú & file.
          </p>
          <WorkTasksStatusKanban
            tasks={filteredTasks}
            openOnly={filterOpenOnly}
            columnDefs={visibleKanbanColumns}
            onPatchStatus={patchTaskStatus}
            onPatchDealStatus={patchDealStatus}
            onTaskClick={(task) => setTaskModal({ mode: 'edit', task })}
            onAddTask={(column) => setTaskModal({ mode: 'create', defaultStatus: column?.statusKey || 'pending' })}
            onAddColumn={() => setColumnModal({ mode: 'create' })}
            onEditColumn={(column) => setColumnModal({ mode: 'edit', column })}
          />
        </>
      )}

      {/* LIST */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-xl border divide-y overflow-y-auto" style={{ maxHeight: '640px' }}>
          {(filterOpenOnly ? filteredTasks.filter((t) => !isTaskDone(t.status)) : filteredTasks).length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-10">Không có nhiệm vụ phù hợp bộ lọc</p>
          ) : (filterOpenOnly ? filteredTasks.filter((t) => !isTaskDone(t.status)) : filteredTasks).map((t) => (
            <UnifiedTaskRow key={t.unified_id} task={t} onStatusChange={handleStatusChange} compact />
          ))}
        </div>
      )}

      {/* DEADLINE — 5 cột hạn tự động */}
      {viewMode === 'deadline' && (
        <>
          <p className="text-xs text-gray-500 -mt-2">
            <strong>5 cột deadline</strong> · Deal <strong>ẩn mặc định</strong> — bấm để mở · Nhấp đúp thẻ để sửa.
          </p>
          <WorkTasksStatusKanban
            tasks={filteredTasks}
            openOnly={filterOpenOnly}
            columnDefs={deadlineKanbanColumns}
            groupMode="deadline"
            readOnly
            showAddColumn={false}
            showAddTask={false}
            allowColumnEdit={false}
            onTaskClick={(task) => setTaskModal({ mode: 'edit', task })}
          />
        </>
      )}

      <WorkTaskFormModal
        open={!!taskModal}
        mode={taskModal?.mode || 'edit'}
        task={taskModal?.task || null}
        defaultStatus={taskModal?.defaultStatus || 'pending'}
        statusOptions={kanbanColumnDefs}
        defaultLeadId={filterLead}
        defaultAssigneeId={filterAssignee}
        defaultCompanyId={effectiveCompanyId}
        leadOptions={leadOptions}
        users={users}
        saving={taskSaving}
        deleting={taskDeleting}
        onClose={() => setTaskModal(null)}
        onSave={handleTaskFormSave}
        onDelete={handleTaskFormDelete}
      />

      <WorkTasksKanbanColumnModal
        open={!!columnModal}
        mode={columnModal?.mode || 'create'}
        column={columnModal?.column || null}
        existingColumns={kanbanColumnDefs}
        onClose={() => setColumnModal(null)}
        onSave={handleColumnSave}
        onDelete={handleColumnDelete}
      />
    </div>
  );
}
