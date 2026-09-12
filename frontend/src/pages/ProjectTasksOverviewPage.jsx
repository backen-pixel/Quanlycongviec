import {
  memo, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, Bell, Building2, CheckCircle2, Clock3, Factory, Loader2, RefreshCw, Search, Target, Truck, X,
} from 'lucide-react';
import api from '../lib/api';
import { canSendTaskRemind, getDeepLink } from '../components/UnifiedTaskRow';
import { AdvFilterButton } from '../components/SearchInlineFilterChips';
import ProjectTasksFilterPanel from '../components/ProjectTasksFilterPanel';
import KanbanColumnVirtualList from '../components/KanbanColumnVirtualList';
import { useAuth } from '../lib/auth';
import { isAdminLike, isCompanyScopedAdmin } from '../lib/adminRole';
import { peekCompaniesPrefetch, prefetchCompanies } from '../lib/companiesPrefetch';
import { resolveDefaultCrmAdminCompanyId, setStoredCrmFilterCompanyId } from '../lib/crmCompanyFilter';
import { avatarColor, formatDate, getStaffInitials } from '../lib/utils';

const WARNING_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

const MODULES = [
  { key: 'crm', label: 'CRM', icon: Target, kinds: new Set(['CRM-Deal', 'CRM-Lead']) },
  { key: 'sx', label: 'Sản xuất', icon: Factory, kinds: new Set(['SX', 'Dự án']) },
  { key: 'vc', label: 'VC-LĐ', icon: Truck, kinds: new Set(['VC']) },
];

const COLUMNS = [
  {
    key: 'normal',
    label: 'Đang thực hiện',
    icon: CheckCircle2,
    header: 'bg-blue-50 text-blue-800 border-blue-100',
    dot: 'bg-blue-500',
    empty: 'Không có nhiệm vụ đang thực hiện',
  },
  {
    key: 'warning',
    label: 'Cảnh báo',
    icon: Clock3,
    header: 'bg-amber-50 text-amber-800 border-amber-100',
    dot: 'bg-amber-500',
    empty: 'Không có nhiệm vụ hạn trong 3 ngày',
  },
  {
    key: 'overdue',
    label: 'Quá hạn',
    icon: AlertTriangle,
    header: 'bg-red-50 text-red-800 border-red-100',
    dot: 'bg-red-500',
    empty: 'Không có nhiệm vụ quá hạn',
  },
];

function moduleOf(task) {
  return MODULES.find((module) => module.kinds.has(String(task?.task_kind || ''))) || null;
}

function riskOf(task, nowMs) {
  if (!task?.deadline) return 'normal';
  const dueMs = new Date(task.deadline).getTime();
  if (!Number.isFinite(dueMs)) return 'normal';
  if (dueMs < nowMs) return 'overdue';
  return dueMs - nowMs <= WARNING_WINDOW_MS ? 'warning' : 'normal';
}

function projectLabel(task) {
  const code = String(task?.project_code || '').trim();
  const name = String(task?.project_name || '').trim();
  if (code && name) return `${code} · ${name}`;
  return code || name || task?.lead_title || 'Chưa gắn dự án';
}

const TaskCard = memo(function TaskCard({ task, canRemind }) {
  const [reminding, setReminding] = useState(false);
  const [reminded, setReminded] = useState(false);
  const href = getDeepLink(task);
  const responsibleName = task.assignee_name || task.effective_assignee_name || '';
  const module = task._module;
  const risk = task._risk;

  const handleRemind = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (reminding || reminded) return;
    setReminding(true);
    try {
      const response = await api.post('/work-tasks/project-overview/remind-complete', {
        project_id: task.project_id,
        title: task.title,
        category_id: task.category_id,
        owner_lane: task.owner_lane,
      });
      if (!(response.data?.sent > 0)) {
        alert('Đã gán người phụ trách nhưng chưa gửi được thông báo.');
        return;
      }
      setReminded(true);
      window.setTimeout(() => setReminded(false), 4000);
    } catch (error) {
      alert(error?.response?.data?.error || 'Không gửi được nhắc nhiệm vụ');
    } finally {
      setReminding(false);
    }
  };

  const body = (
    <>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${
          risk === 'overdue' ? 'bg-red-500' : risk === 'warning' ? 'bg-amber-500' : 'bg-blue-500'
        }`}
        />
        <span className="text-[9px] font-bold uppercase tracking-wide text-gray-500">{module?.label}</span>
        {task.deadline && (
          <span className={`ml-auto inline-flex items-center gap-1 text-[10px] font-medium ${
            risk === 'overdue' ? 'text-red-600' : risk === 'warning' ? 'text-amber-700' : 'text-gray-500'
          }`}
          >
            <Clock3 className="h-3 w-3" />
            {formatDate(task.deadline)}
          </span>
        )}
      </div>
      <h3 className="text-sm font-semibold text-gray-900 line-clamp-2">{task.title}</h3>
      <p className="text-[11px] text-gray-500 truncate mt-1">{projectLabel(task)}</p>
      <div className="mt-2">
        <div className="flex items-center justify-between gap-2 text-[10px]">
          <span className="font-semibold text-gray-700">
            {task.child_completed || 0}/{task.child_total || 0} nhiệm vụ
          </span>
          <span className="text-gray-400">Tiến độ</span>
        </div>
        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mt-1">
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{
              width: `${task.child_total
                ? Math.round(((task.child_completed || 0) / task.child_total) * 100)
                : 0}%`,
            }}
          />
        </div>
      </div>
    </>
  );

  return (
    <article
      data-project-task-card={task.id}
      className="rounded-lg border border-gray-100 bg-white p-3 shadow-sm hover:border-blue-200 hover:shadow transition-all"
    >
      {href ? <Link to={href} className="block">{body}</Link> : body}
      <div className="mt-2 min-h-7 flex items-center gap-2">
        {responsibleName ? (
          <div className="flex items-center gap-1.5 min-w-0 flex-1" title={responsibleName}>
            <span
              className="h-6 w-6 rounded-full text-[8px] font-bold text-white flex items-center justify-center shrink-0"
              style={{ backgroundColor: avatarColor(responsibleName) }}
            >
              {getStaffInitials(responsibleName)}
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold leading-tight text-gray-700 line-clamp-2">
                {responsibleName}
              </span>
            </span>
          </div>
        ) : (
          <span className="text-[11px] text-gray-400">Chưa có người phụ trách</span>
        )}
        {canRemind && (
          <button
            type="button"
            onClick={handleRemind}
            disabled={reminding || reminded || !task.category_id}
            className="ml-auto inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 text-[10px] font-semibold text-amber-700 hover:bg-amber-100 disabled:cursor-default disabled:opacity-60"
            title="Gửi thông báo nhắc người chịu trách nhiệm hoàn thành danh mục này"
          >
            {reminding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bell className="h-3 w-3" />}
            {reminded ? 'Đã nhắc' : reminding ? 'Đang gửi' : 'Nhắc nhở'}
          </button>
        )}
      </div>
    </article>
  );
});

const KanbanColumn = memo(function KanbanColumn({
  column, tasks, focused, canRemind,
}) {
  const Icon = column.icon;
  const scrollRef = useRef(null);
  const [scrollReady, setScrollReady] = useState(false);
  useEffect(() => { setScrollReady(true); }, []);
  const renderTaskCard = useCallback(
    (task) => <TaskCard task={task} canRemind={canRemind} />,
    [canRemind],
  );
  return (
    <section className={`rounded-xl border bg-gray-50/70 overflow-hidden min-w-0 ${
      focused ? 'ring-2 ring-red-300 border-red-200' : 'border-gray-100'
    }`}
    >
      <header className={`px-3 py-3 flex items-center gap-2 border-b ${column.header}`}>
        <Icon className="h-4 w-4" />
        <h2 className="text-sm font-bold">{column.label}</h2>
        <span className="ml-auto text-[11px] font-bold bg-white/80 rounded-full px-2 py-0.5">{tasks.length}</span>
      </header>
      <div ref={scrollRef} className="p-2 max-h-[calc(100vh-330px)] min-h-72 overflow-y-auto [scrollbar-width:thin]">
        {tasks.length ? (scrollReady && (
          <KanbanColumnVirtualList
            items={tasks}
            columnScrollRef={scrollRef}
            compact
            cardDomAttr="data-project-task-card"
            renderCard={renderTaskCard}
          />
        )) : (
          <div className="py-12 text-center">
            <span className={`mx-auto mb-2 block h-2 w-2 rounded-full ${column.dot}`} />
            <p className="text-xs text-gray-400">{column.empty}</p>
          </div>
        )}
      </div>
    </section>
  );
});

function defaultCompanyId(list, user, canPickCompany) {
  if (canPickCompany) return resolveDefaultCrmAdminCompanyId(list) || (list[0]?.id ? String(list[0].id) : '');
  const ownId = user?.company_id != null ? String(user.company_id).trim() : '';
  if (ownId && list.some((company) => String(company.id) === ownId)) return ownId;
  return ownId || (list[0]?.id ? String(list[0].id) : '');
}

export default function ProjectTasksOverviewPage({ fixedModule = '' }) {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = isAdminLike(user);
  const isCompanyScoped = isCompanyScopedAdmin(user);
  const canPickCompany = isAdmin && !isCompanyScoped;
  const fixedModuleKey = MODULES.some((module) => module.key === fixedModule) ? fixedModule : '';
  const fixedModuleConfig = MODULES.find((module) => module.key === fixedModuleKey) || null;
  const FixedModuleIcon = fixedModuleConfig?.icon;
  const moduleParam = searchParams.get('module') || 'all';
  const focusRisk = searchParams.get('risk') || '';
  const activeModule = fixedModuleKey
    || (moduleParam === 'all' || MODULES.some((m) => m.key === moduleParam) ? moduleParam : 'all');
  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState({ total: 0, warning: 0, overdue: 0, by_module: {} });
  const [companies, setCompanies] = useState(() => peekCompaniesPrefetch() || []);
  const [companiesReady, setCompaniesReady] = useState(() => !!(peekCompaniesPrefetch() || []).length);
  const [filterOptions, setFilterOptions] = useState({ companies: [], regions: [] });
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [riskFilter, setRiskFilter] = useState('all');
  const [progressFilter, setProgressFilter] = useState('all');
  const [companyFilter, setCompanyFilter] = useState(() => {
    const prefetched = peekCompaniesPrefetch() || [];
    return defaultCompanyId(prefetched, user, canPickCompany);
  });
  const [regionFilter, setRegionFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [deadlineFrom, setDeadlineFrom] = useState('');
  const [deadlineTo, setDeadlineTo] = useState('');
  const canRemind = canSendTaskRemind(user);
  const applyCompany = useCallback((value) => {
    const next = String(value || '');
    setCompanyFilter(next);
    setRegionFilter('');
    if (canPickCompany && next) setStoredCrmFilterCompanyId(next);
  }, [canPickCompany]);

  useEffect(() => {
    let cancelled = false;
    prefetchCompanies(api).then((list) => {
      if (cancelled) return;
      setCompanies(list);
      setCompanyFilter((prev) => {
        if (prev && list.some((company) => String(company.id) === String(prev))) return prev;
        return defaultCompanyId(list, user, canPickCompany);
      });
      setCompaniesReady(true);
    }).catch(() => {
      if (!cancelled) {
        setCompanies([]);
        setCompaniesReady(true);
      }
    });
    return () => { cancelled = true; };
  }, [canPickCompany, user]);

  const load = useCallback(async () => {
    if (!companiesReady) return;
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (fixedModuleKey) params.module = fixedModuleKey;
      if (companyFilter) params.company_id = companyFilter;
      const res = await api.get('/work-tasks/project-overview', { params });
      setTasks(res.data?.tasks || []);
      setStats(res.data?.stats || { total: 0, warning: 0, overdue: 0, by_module: {} });
      setFilterOptions(res.data?.filter_options || { companies: [], regions: [] });
    } catch (e) {
      setError(e?.response?.data?.error || 'Không tải được tổng quan nhiệm vụ');
    } finally {
      setLoading(false);
    }
  }, [companiesReady, companyFilter, fixedModuleKey]);

  useEffect(() => { load(); }, [load]);

  const prepared = useMemo(() => {
    const nowMs = Date.now();
    return tasks
      .map((task) => ({
        ...task,
        id: task.unified_id,
        _module: moduleOf(task),
        _risk: riskOf(task, nowMs),
      }))
      .filter((task) => task._module);
  }, [tasks]);

  const assigneeOptions = useMemo(() => {
    const byId = new Map();
    prepared.forEach((task) => {
      const id = String(task.effective_assignee_id || '');
      const name = task.effective_assignee_name || task.assignee_name;
      if (id && name) byId.set(id, name);
    });
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }, [prepared]);
  const moduleScopedTasks = useMemo(() => (
    activeModule === 'all'
      ? prepared
      : prepared.filter((task) => task._module.key === activeModule)
  ), [activeModule, prepared]);
  const companyOptions = useMemo(() => {
    const fromPrefetch = companies.length ? companies : (filterOptions.companies || []);
    return [...fromPrefetch].sort((a, b) => (
      String(a.short_name || a.name || '').localeCompare(String(b.short_name || b.name || ''), 'vi')
    ));
  }, [companies, filterOptions.companies]);
  const regionOptions = useMemo(() => {
    const availableIds = new Set(
      moduleScopedTasks.map((task) => String(task.region_id || '')).filter(Boolean),
    );
    return (filterOptions.regions || [])
      .filter((region) => availableIds.has(String(region.id)))
      .filter((region) => !companyFilter || String(region.company_id || '') === companyFilter)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'vi'));
  }, [companyFilter, filterOptions.regions, moduleScopedTasks]);

  useEffect(() => {
    if (regionFilter && !regionOptions.some((region) => String(region.id) === regionFilter)) {
      setRegionFilter('');
    }
  }, [regionFilter, regionOptions]);

  useEffect(() => {
    setRegionFilter('');
    setAssigneeFilter('');
  }, [companyFilter]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleTasks = useMemo(() => prepared.filter((task) => {
    if (activeModule !== 'all' && task._module.key !== activeModule) return false;
    if (riskFilter !== 'all' && task._risk !== riskFilter) return false;
    if (progressFilter === 'not_started' && Number(task.child_completed || 0) !== 0) return false;
    if (progressFilter === 'in_progress' && (
      Number(task.child_completed || 0) <= 0
      || Number(task.child_completed || 0) >= Number(task.child_total || 0)
    )) return false;
    if (regionFilter && String(task.region_id || '') !== regionFilter) return false;
    if (assigneeFilter && String(task.effective_assignee_id || '') !== assigneeFilter) return false;
    const deadlineMs = task.deadline ? new Date(task.deadline).getTime() : null;
    if (deadlineFrom && (!deadlineMs || deadlineMs < new Date(`${deadlineFrom}T00:00:00`).getTime())) return false;
    if (deadlineTo && (!deadlineMs || deadlineMs > new Date(`${deadlineTo}T23:59:59.999`).getTime())) return false;
    if (!normalizedQuery) return true;
    return [
      task.title, task.project_code, task.project_name, task.lead_title,
      task.assignee_name, task.effective_assignee_name, task.company_name, task.region_name,
    ].filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery);
  }), [
    activeModule, assigneeFilter, deadlineFrom, deadlineTo, normalizedQuery,
    prepared, progressFilter, regionFilter, riskFilter,
  ]);

  const tasksByRisk = useMemo(() => Object.fromEntries(
    COLUMNS.map((column) => [
      column.key,
      visibleTasks.filter((task) => task._risk === column.key),
    ]),
  ), [visibleTasks]);

  const visibleStats = useMemo(() => ({
    total: visibleTasks.length,
    warning: tasksByRisk.warning?.length || 0,
    overdue: tasksByRisk.overdue?.length || 0,
  }), [tasksByRisk, visibleTasks.length]);

  const activeAdvancedFilters = [
    riskFilter !== 'all',
    progressFilter !== 'all',
    !!regionFilter,
    !!assigneeFilter,
    !!deadlineFrom,
    !!deadlineTo,
  ].filter(Boolean).length;

  const resetAdvancedFilters = () => {
    setRiskFilter('all');
    setProgressFilter('all');
    applyCompany(defaultCompanyId(companyOptions, user, canPickCompany));
    setAssigneeFilter('');
    setDeadlineFrom('');
    setDeadlineTo('');
  };

  const setModule = (moduleKey) => {
    const next = new URLSearchParams(searchParams);
    if (moduleKey === 'all') next.delete('module'); else next.set('module', moduleKey);
    setSearchParams(next, { replace: true });
  };

  const selectedCompany = companyOptions
    .find((company) => String(company.id) === companyFilter);
  const selectedRegion = (filterOptions.regions || [])
    .find((region) => String(region.id) === regionFilter);
  const selectedAssignee = assigneeOptions
    .find((person) => String(person.id) === assigneeFilter);
  const activeFilterChips = [
    !fixedModuleKey && activeModule !== 'all' && {
      key: 'module',
      label: `Module: ${MODULES.find((module) => module.key === activeModule)?.label || activeModule}`,
      clear: () => setModule('all'),
    },
    normalizedQuery && {
      key: 'query',
      label: `Tìm kiếm: ${query.trim()}`,
      clear: () => setQuery(''),
    },
    riskFilter !== 'all' && {
      key: 'risk',
      label: `Tình trạng hạn: ${
        riskFilter === 'normal' ? 'Đang thực hiện' : riskFilter === 'warning' ? 'Cảnh báo trong 3 ngày' : 'Quá hạn'
      }`,
      clear: () => setRiskFilter('all'),
    },
    progressFilter !== 'all' && {
      key: 'progress',
      label: `Tiến độ: ${progressFilter === 'not_started' ? 'Chưa bắt đầu' : 'Đang làm'}`,
      clear: () => setProgressFilter('all'),
    },
    canPickCompany && companyFilter && companyFilter !== defaultCompanyId(companyOptions, user, canPickCompany) && {
      key: 'company',
      label: `Công ty: ${selectedCompany?.short_name || selectedCompany?.name || companyFilter}`,
      clear: () => applyCompany(defaultCompanyId(companyOptions, user, canPickCompany)),
    },
    regionFilter && {
      key: 'region',
      label: `Khu vực: ${selectedRegion?.name || regionFilter}`,
      clear: () => setRegionFilter(''),
    },
    assigneeFilter && {
      key: 'assignee',
      label: `Nhân viên: ${selectedAssignee?.name || assigneeFilter}`,
      clear: () => setAssigneeFilter(''),
    },
    deadlineFrom && {
      key: 'deadline-from',
      label: `Hạn từ: ${formatDate(deadlineFrom)}`,
      clear: () => setDeadlineFrom(''),
    },
    deadlineTo && {
      key: 'deadline-to',
      label: `Hạn đến: ${formatDate(deadlineTo)}`,
      clear: () => setDeadlineTo(''),
    },
  ].filter(Boolean);

  const clearAllVisibleFilters = () => {
    resetAdvancedFilters();
    setQuery('');
    if (!fixedModuleKey) setModule('all');
  };

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-5">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {fixedModuleConfig ? `Quản lý nhiệm vụ ${fixedModuleConfig.label}` : 'Tổng quan nhiệm vụ dự án'}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {fixedModuleConfig
                ? `Các danh mục nhiệm vụ thuộc module ${fixedModuleConfig.label} của dự án còn hoạt động`
                : 'Chỉ hiển thị nhiệm vụ của dự án còn hoạt động trong từng module'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canPickCompany && companyOptions.length > 0 && (
              <div className="relative">
                <Building2 className="h-4 w-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  value={companyFilter}
                  onChange={(event) => applyCompany(event.target.value)}
                  className="h-9 pl-8 pr-3 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300"
                >
                  <option value="">Tất cả công ty</option>
                  {companyOptions.map((company) => (
                    <option key={company.id} value={company.id}>{company.short_name || company.name}</option>
                  ))}
                </select>
              </div>
            )}
            <AdvFilterButton
              open={filtersOpen}
              active={activeAdvancedFilters > 0}
              onClick={() => setFiltersOpen((current) => !current)}
            />
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 inline-flex items-center gap-1.5 hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Làm mới
            </button>
          </div>
        </div>
        {activeFilterChips.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap" aria-label="Các bộ lọc đang áp dụng">
            <span className="text-[11px] font-semibold text-gray-500 mr-0.5">Đang lọc:</span>
            {activeFilterChips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex h-7 max-w-full items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 text-[11px] font-semibold text-violet-700"
                title={chip.label}
              >
                <span className="max-w-[260px] truncate">{chip.label}</span>
                <button
                  type="button"
                  onClick={chip.clear}
                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-violet-500 hover:bg-violet-200 hover:text-violet-800"
                  aria-label={`Bỏ lọc ${chip.label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {activeFilterChips.length > 1 && (
              <button
                type="button"
                onClick={clearAllVisibleFilters}
                className="h-7 px-2 text-[11px] font-semibold text-gray-500 hover:text-red-600"
              >
                Xóa tất cả
              </button>
            )}
          </div>
        )}
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      {filtersOpen && (
        <ProjectTasksFilterPanel
          onClose={() => setFiltersOpen(false)}
          onReset={resetAdvancedFilters}
          storageKey={`projectTasksFilterPanelPosition:${fixedModuleKey || 'all'}`}
          riskFilter={riskFilter}
          setRiskFilter={setRiskFilter}
          progressFilter={progressFilter}
          setProgressFilter={setProgressFilter}
          companyFilter={companyFilter}
          setCompanyFilter={applyCompany}
          companyOptions={companyOptions}
          regionFilter={regionFilter}
          setRegionFilter={setRegionFilter}
          regionOptions={regionOptions}
          assigneeFilter={assigneeFilter}
          setAssigneeFilter={setAssigneeFilter}
          assigneeOptions={assigneeOptions}
          deadlineFrom={deadlineFrom}
          setDeadlineFrom={setDeadlineFrom}
          deadlineTo={deadlineTo}
          setDeadlineTo={setDeadlineTo}
        />
      )}

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Đang thực hiện', value: Math.max(0, visibleStats.total - visibleStats.warning - visibleStats.overdue), cls: 'text-blue-600' },
          { label: 'Cảnh báo trong 3 ngày', value: visibleStats.warning, cls: 'text-amber-600' },
          { label: 'Quá hạn', value: visibleStats.overdue, cls: 'text-red-600' },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-gray-100 bg-white p-3 md:p-4 shadow-sm">
            <p className="text-[11px] md:text-xs text-gray-500 truncate">{item.label}</p>
            <p className={`text-xl md:text-2xl font-bold mt-1 ${item.cls}`}>{loading ? '…' : item.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm flex items-center gap-3 flex-wrap">
        {fixedModuleConfig ? (
          <div className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700">
            {FixedModuleIcon && <FixedModuleIcon className="h-3.5 w-3.5" />}
            {fixedModuleConfig.label} · {visibleStats.total}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 overflow-x-auto">
          {[{ key: 'all', label: 'Tất cả module' }, ...MODULES].map((module) => {
            const Icon = module.icon;
            const count = module.key === 'all' ? stats.total : (stats.by_module?.[module.key] || 0);
            return (
              <button
                key={module.key}
                type="button"
                onClick={() => setModule(module.key)}
                className={`h-9 px-3 rounded-lg text-xs font-semibold border inline-flex items-center gap-1.5 shrink-0 cursor-pointer ${
                  activeModule === module.key
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                }`}
              >
                {Icon && <Icon className="h-3.5 w-3.5" />}
                {module.label} · {count}
              </button>
            );
          })}
          </div>
        )}
        <div className="relative flex-1 min-w-[220px] max-w-md ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm nhiệm vụ hoặc dự án…"
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
      </div>

      {loading && !tasks.length ? (
        <div className="py-16 text-center text-sm text-gray-400">
          {!companiesReady
            ? 'Đang tải danh sách công ty…'
            : companyFilter
              ? `Đang tải nhiệm vụ của ${selectedCompany?.short_name || selectedCompany?.name || 'công ty đã chọn'}…`
              : 'Đang tải nhiệm vụ dự án đang hoạt động…'}
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-4 items-start">
          {COLUMNS.map((column) => (
            <KanbanColumn
              key={column.key}
              column={column}
              tasks={tasksByRisk[column.key] || []}
              focused={focusRisk === column.key}
              canRemind={canRemind}
            />
          ))}
        </div>
      )}
    </div>
  );
}
