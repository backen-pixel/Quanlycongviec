import {
  memo, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, Bell, Building2, CalendarClock, CalendarDays, CalendarOff, Clock3, Factory, Loader2, RefreshCw, Search, Sun, Target, Truck, X,
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
import { crmDeadlineBucketFromTs } from '../lib/crmLeadDeadlineDisplay';
import { avatarColor, formatDate, getStaffInitials } from '../lib/utils';

const MODULES = [
  { key: 'crm', label: 'CRM', icon: Target, kinds: new Set(['CRM-Deal', 'CRM-Lead']) },
  { key: 'sx', label: 'Sản xuất', icon: Factory, kinds: new Set(['SX', 'Dự án']) },
  { key: 'vc', label: 'VC-LĐ', icon: Truck, kinds: new Set(['VC']) },
];

const COLUMNS = [
  {
    key: 'overdue',
    label: 'Quá hạn',
    icon: AlertTriangle,
    header: 'bg-red-50 text-red-800 border-red-100',
    dateCls: 'text-red-600',
    kpiCls: 'text-red-600',
    empty: 'Không có nhiệm vụ quá hạn',
  },
  {
    key: 'today',
    label: 'Hôm nay',
    icon: Sun,
    header: 'bg-orange-50 text-orange-800 border-orange-100',
    dateCls: 'text-orange-700',
    kpiCls: 'text-orange-600',
    empty: 'Không có nhiệm vụ hạn hôm nay',
  },
  {
    key: 'tomorrow',
    label: 'Ngày mai',
    icon: Clock3,
    header: 'bg-amber-50 text-amber-800 border-amber-100',
    dateCls: 'text-amber-700',
    kpiCls: 'text-amber-600',
    empty: 'Không có nhiệm vụ hạn ngày mai',
  },
  {
    key: 'this_week',
    label: 'Trong tuần',
    icon: CalendarDays,
    header: 'bg-sky-50 text-sky-800 border-sky-100',
    dateCls: 'text-sky-700',
    kpiCls: 'text-sky-600',
    empty: 'Không có nhiệm vụ hạn trong tuần',
  },
  {
    key: 'next_week',
    label: 'Tuần sau',
    icon: CalendarClock,
    header: 'bg-teal-50 text-teal-800 border-teal-100',
    dateCls: 'text-teal-700',
    kpiCls: 'text-teal-600',
    empty: 'Không có nhiệm vụ hạn tuần sau',
  },
  {
    key: 'no_deadline',
    label: 'Chưa có hạn',
    icon: CalendarOff,
    header: 'bg-slate-50 text-slate-700 border-slate-200',
    dateCls: 'text-slate-400',
    kpiCls: 'text-slate-500',
    empty: 'Không có nhiệm vụ chưa có hạn',
  },
];

const COLUMN_BY_KEY = Object.fromEntries(COLUMNS.map((column) => [column.key, column]));

function deadlineBucketOf(task, nowMs = Date.now()) {
  const dueMs = task?.deadline ? new Date(task.deadline).getTime() : null;
  if (dueMs == null || !Number.isFinite(dueMs)) return 'no_deadline';
  const raw = crmDeadlineBucketFromTs(dueMs, null, nowMs);
  if (raw === 'overdue' || raw === 'today' || raw === 'tomorrow' || raw === 'this_week' || raw === 'no_deadline') {
    return raw;
  }
  return 'next_week';
}

function moduleOf(task) {
  return MODULES.find((module) => module.kinds.has(String(task?.task_kind || ''))) || null;
}

function projectLabel(task) {
  const code = String(task?.project_code || '').trim();
  const name = String(task?.project_name || '').trim();
  if (code && name) return `${code} · ${name}`;
  return code || name || task?.lead_title || 'Chưa gắn dự án';
}

function overviewCardHref(task) {
  const projectId = String(task?.project_id || '').trim();
  const moduleKey = task?._module?.key || '';
  if (projectId) {
    if (moduleKey === 'vc') return `/vc/projects/${projectId}`;
    if (moduleKey === 'crm' && task.lead_id) return `/crm/leads/${task.lead_id}`;
    return `/sx/projects/${projectId}`;
  }
  if (task?.lead_id) return `/crm/leads/${task.lead_id}`;
  return getDeepLink(task);
}

const TaskCard = memo(function TaskCard({ task, canRemind, showModule }) {
  const [reminding, setReminding] = useState(false);
  const [reminded, setReminded] = useState(false);
  const href = overviewCardHref(task);
  const responsibleName = task.assignee_name || task.effective_assignee_name || '';
  const module = task._module;
  const bucket = COLUMN_BY_KEY[task._bucket] || COLUMN_BY_KEY.no_deadline;
  const completed = Number(task.child_completed || 0);
  const total = Number(task.child_total || 0);
  const pct = total ? Math.round((completed / total) * 100) : 0;
  const projectCode = String(task.project_code || '').trim();
  const projectName = String(task.project_name || task.lead_title || '').trim();
  const placeBits = [task.company_name, task.region_name].filter(Boolean).join(' · ');

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
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            {showModule && (
              <span className="text-[9px] font-bold uppercase tracking-wide text-gray-400 shrink-0">
                {module?.label}
              </span>
            )}
            {projectCode ? (
              <span className="text-[11px] font-semibold text-teal-700 truncate">{projectCode}</span>
            ) : (
              <span className="text-[11px] text-gray-400">Chưa có mã</span>
            )}
          </div>
          <h3 className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2 mt-0.5">{task.title}</h3>
        </div>
        <span className={`shrink-0 text-[10px] font-semibold tabular-nums ${bucket.dateCls}`}>
          {task.deadline ? formatDate(task.deadline) : '—'}
        </span>
      </div>
      {projectName ? (
        <p className="text-[11px] text-gray-600 truncate mt-1" title={projectLabel(task)}>{projectName}</p>
      ) : (
        <p className="text-[11px] text-gray-400 truncate mt-1">Chưa gắn dự án</p>
      )}
      {placeBits ? (
        <p className="text-[10px] text-gray-400 truncate">{placeBits}</p>
      ) : null}
      <div className="mt-2 flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[10px] font-semibold tabular-nums text-gray-600 shrink-0">
          {completed}/{total}
        </span>
      </div>
    </>
  );

  const personRow = responsibleName ? (
    <div className="flex items-center gap-1.5 min-w-0 flex-1" title={responsibleName}>
      <span
        className="h-6 w-6 rounded-full text-[8px] font-bold text-white flex items-center justify-center shrink-0"
        style={{ backgroundColor: avatarColor(responsibleName) }}
      >
        {getStaffInitials(responsibleName)}
      </span>
      <span className="text-[11px] font-medium leading-tight text-gray-700 truncate">
        {responsibleName}
      </span>
    </div>
  ) : (
    <span className="text-[11px] text-gray-400">Chưa có người phụ trách</span>
  );

  return (
    <article
      data-project-task-card={task.id}
      className={`rounded-lg border border-gray-100 bg-white p-2.5 shadow-sm hover:border-blue-200 hover:shadow transition-all ${href ? 'cursor-pointer' : ''}`}
    >
      {href ? <Link to={href} className="block">{body}</Link> : body}
      <div className="mt-2 pt-2 border-t border-gray-50 min-h-7 flex items-center gap-2">
        {href ? <Link to={href} className="flex items-center gap-1.5 min-w-0 flex-1">{personRow}</Link> : personRow}
        {canRemind && (
          <button
            type="button"
            onClick={handleRemind}
            disabled={reminding || reminded || !task.category_id}
            className="ml-auto inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 text-[10px] font-semibold text-amber-700 hover:bg-amber-100 disabled:cursor-default disabled:opacity-60"
            title="Gửi thông báo nhắc người chịu trách nhiệm hoàn thành danh mục này"
          >
            {reminding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bell className="h-3 w-3" />}
            {reminded ? 'Đã nhắc' : reminding ? 'Đang gửi' : 'Nhắc'}
          </button>
        )}
      </div>
    </article>
  );
});

const KanbanColumn = memo(function KanbanColumn({
  column, tasks, focused, canRemind, showModule,
}) {
  const Icon = column.icon;
  const scrollRef = useRef(null);
  const [scrollReady, setScrollReady] = useState(false);
  useEffect(() => { setScrollReady(true); }, []);
  const renderTaskCard = useCallback(
    (task) => <TaskCard task={task} canRemind={canRemind} showModule={showModule} />,
    [canRemind, showModule],
  );
  return (
    <section className={`rounded-xl border bg-gray-50/70 overflow-hidden min-w-[260px] w-[280px] shrink-0 ${
      focused ? 'ring-2 ring-red-300 border-red-200' : 'border-gray-100'
    }`}
    >
      <header className={`px-3 py-2.5 flex items-center gap-2 border-b ${column.header}`}>
        <Icon className="h-4 w-4 shrink-0" />
        <h2 className="text-sm font-bold truncate">{column.label}</h2>
        <span className="ml-auto text-[11px] font-bold bg-white/80 rounded-full px-2 py-0.5 tabular-nums">{tasks.length}</span>
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
            <Icon className="mx-auto mb-2 h-4 w-4 text-gray-300" />
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
  const projectFilter = String(searchParams.get('project') || '').trim();
  const projectCodeParam = String(searchParams.get('code') || '').trim();
  const focusRisk = (() => {
    const raw = searchParams.get('risk') || '';
    if (raw === 'warning') return 'today';
    if (raw === 'normal') return 'this_week';
    return raw;
  })();
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
    if (projectFilter) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('project');
      nextParams.delete('code');
      setSearchParams(nextParams, { replace: true });
    }
  }, [canPickCompany, projectFilter, searchParams, setSearchParams]);

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
      if (projectFilter) params.project_id = projectFilter;
      else if (companyFilter) params.company_id = companyFilter;
      const res = await api.get('/work-tasks/project-overview', { params });
      setTasks(res.data?.tasks || []);
      setStats(res.data?.stats || { total: 0, warning: 0, overdue: 0, by_module: {} });
      setFilterOptions(res.data?.filter_options || { companies: [], regions: [] });
    } catch (e) {
      setError(e?.response?.data?.error || 'Không tải được tổng quan nhiệm vụ');
    } finally {
      setLoading(false);
    }
  }, [companiesReady, companyFilter, fixedModuleKey, projectFilter]);

  useEffect(() => { load(); }, [load]);

  const prepared = useMemo(() => {
    const nowMs = Date.now();
    return tasks
      .map((task) => ({
        ...task,
        id: task.unified_id,
        _module: moduleOf(task),
        _bucket: deadlineBucketOf(task, nowMs),
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
    if (riskFilter !== 'all' && task._bucket !== riskFilter) return false;
    if (progressFilter === 'not_started' && Number(task.child_completed || 0) !== 0) return false;
    if (progressFilter === 'in_progress' && (
      Number(task.child_completed || 0) <= 0
      || Number(task.child_completed || 0) >= Number(task.child_total || 0)
    )) return false;
    if (regionFilter && String(task.region_id || '') !== regionFilter) return false;
    if (assigneeFilter && String(task.effective_assignee_id || '') !== assigneeFilter) return false;
    if (projectFilter && String(task.project_id || '') !== projectFilter) return false;
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
    prepared, progressFilter, projectFilter, regionFilter, riskFilter,
  ]);

  const tasksByBucket = useMemo(() => Object.fromEntries(
    COLUMNS.map((column) => [
      column.key,
      visibleTasks.filter((task) => task._bucket === column.key),
    ]),
  ), [visibleTasks]);

  const visibleStats = useMemo(() => ({
    total: visibleTasks.length,
    ...Object.fromEntries(COLUMNS.map((column) => [column.key, tasksByBucket[column.key]?.length || 0])),
  }), [tasksByBucket, visibleTasks.length]);

  const activeAdvancedFilters = [
    riskFilter !== 'all',
    progressFilter !== 'all',
    !!regionFilter,
    !!assigneeFilter,
    !!deadlineFrom,
    !!deadlineTo,
    !!projectFilter,
  ].filter(Boolean).length;

  const clearProjectFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('project');
    next.delete('code');
    setSearchParams(next, { replace: true });
  };

  const resetAdvancedFilters = () => {
    setRiskFilter('all');
    setProgressFilter('all');
    applyCompany(defaultCompanyId(companyOptions, user, canPickCompany));
    setAssigneeFilter('');
    setDeadlineFrom('');
    setDeadlineTo('');
    if (projectFilter) clearProjectFilter();
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
  const projectChipLabel = projectCodeParam
    || prepared.find((task) => String(task.project_id || '') === projectFilter)?.project_code
    || projectFilter;
  const activeFilterChips = [
    projectFilter && {
      key: 'project',
      label: `Dự án: ${projectChipLabel}`,
      clear: clearProjectFilter,
    },
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
      label: `Hạn: ${COLUMN_BY_KEY[riskFilter]?.label || riskFilter}`,
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

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {COLUMNS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setRiskFilter((current) => (current === item.key ? 'all' : item.key))}
            className={`rounded-xl border bg-white p-3 md:p-4 shadow-sm text-left cursor-pointer ${
              riskFilter === item.key ? 'border-blue-300 ring-2 ring-blue-100' : 'border-gray-100'
            }`}
          >
            <p className="text-[11px] md:text-xs text-gray-500 truncate">{item.label}</p>
            <p className={`text-xl md:text-2xl font-bold mt-1 ${item.kpiCls}`}>
              {loading ? '…' : visibleStats[item.key]}
            </p>
          </button>
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
        <div className="flex gap-3 overflow-x-auto pb-1 items-start [scrollbar-width:thin]">
          {COLUMNS.map((column) => (
            <KanbanColumn
              key={column.key}
              column={column}
              tasks={tasksByBucket[column.key] || []}
              focused={focusRisk === column.key}
              canRemind={canRemind}
              showModule={!fixedModuleKey}
            />
          ))}
        </div>
      )}
    </div>
  );
}
