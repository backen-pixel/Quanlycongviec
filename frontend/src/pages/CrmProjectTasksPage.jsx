import {
  memo, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, Bell, CalendarClock, CalendarDays, CalendarOff, CheckCircle2, ChevronDown, ChevronRight, Circle, ClipboardList, Clock3, Layers, LayoutGrid, Loader2, RefreshCw, Search, Sun, Target, X,
} from 'lucide-react';
import api from '../lib/api';
import { canSendTaskRemind, getDeepLink } from '../components/UnifiedTaskRow';
import { AdvFilterButton } from '../components/SearchInlineFilterChips';
import ProjectTasksFilterPanel from '../components/ProjectTasksFilterPanel';
import {
  filterWorkUnifiedStaff,
  loadWorkUnifiedEmployees,
  normalizeWorkUnifiedUserIds,
  WORK_UNIFIED_REGION_NONE,
} from '../components/WorkUnifiedFilterFields';
import KanbanColumnVirtualList from '../components/KanbanColumnVirtualList';
import WorkshopPipelineKanbanScroll from '../components/WorkshopPipelineKanbanScroll';
import { useAuth } from '../lib/auth';
import { isAdminLike, isCompanyScopedAdmin } from '../lib/adminRole';
import { peekCompaniesPrefetch, prefetchCompanies } from '../lib/companiesPrefetch';
import { resolveDefaultCrmAdminCompanyId, setStoredCrmFilterCompanyId } from '../lib/crmCompanyFilter';
import { crmDeadlineBucketFromTs } from '../lib/crmLeadDeadlineDisplay';
import { companyWorkEndMsFromRaw, companyWorkEndMsOnYmd, vnYmdFromTs } from '../lib/companyDeadlineClock';
import { avatarColor, formatDate, getStaffInitials } from '../lib/utils';
import { assignmentsHrefForProject, projectDetailPathForModule } from '../lib/assignmentSourceLink';

/**
 * Trang «Quản lý nhiệm vụ CRM» — bản riêng của CRM.
 *
 * Tách khỏi `ProjectTasksOverviewPage` (trang dùng chung cho Sản xuất / Vận chuyển
 * và trang tổng quan đa module) để sửa giao diện CRM không đụng tới hai module kia.
 * Vì vậy ở đây chỉ còn đường đi của CRM: không có bộ lọc xưởng, không có lọc công ty
 * đặt hàng, không có phân loại xưởng và không gọi `/work-tasks/team-project-tasks`
 * (API đó chỉ hiểu dự án SX/VC) — kiểu xem «Theo deal» gom thẳng từ danh sách đã tải.
 */
const MODULE_KEY = 'crm';
const MODULE_LABEL = 'CRM';

const MODULES = [
  { key: 'crm', label: MODULE_LABEL, icon: Target, kinds: new Set(['CRM-Deal', 'CRM-Lead']) },
];

const COLUMNS = [
  {
    key: 'overdue',
    label: 'Quá hạn',
    icon: AlertTriangle,
    header: 'bg-red-50 text-red-800 border-red-100',
    dateCls: 'text-red-600',
    empty: 'Không có nhiệm vụ quá hạn',
  },
  {
    key: 'today',
    label: 'Hôm nay',
    icon: Sun,
    header: 'bg-orange-50 text-orange-800 border-orange-100',
    dateCls: 'text-orange-700',
    empty: 'Không có nhiệm vụ hạn hôm nay',
  },
  {
    key: 'tomorrow',
    label: 'Ngày mai',
    icon: Clock3,
    header: 'bg-amber-50 text-amber-800 border-amber-100',
    dateCls: 'text-amber-700',
    empty: 'Không có nhiệm vụ hạn ngày mai',
  },
  {
    key: 'this_week',
    label: 'Trong tuần',
    icon: CalendarDays,
    header: 'bg-sky-50 text-sky-800 border-sky-100',
    dateCls: 'text-sky-700',
    empty: 'Không có nhiệm vụ hạn trong tuần',
  },
  {
    key: 'next_week',
    label: 'Tuần sau',
    icon: CalendarClock,
    header: 'bg-teal-50 text-teal-800 border-teal-100',
    dateCls: 'text-teal-700',
    empty: 'Không có nhiệm vụ hạn tuần sau',
  },
  {
    key: 'no_deadline',
    label: 'Chưa có hạn',
    icon: CalendarOff,
    header: 'bg-slate-50 text-slate-700 border-slate-200',
    dateCls: 'text-slate-400',
    empty: 'Không có nhiệm vụ chưa có hạn',
  },
];

const COLUMN_BY_KEY = Object.fromEntries(COLUMNS.map((column) => [column.key, column]));

const STATUS_COLUMNS = [
  {
    key: 'pending',
    label: 'Chưa làm',
    icon: Circle,
    header: 'bg-slate-50 text-slate-700 border-slate-200',
    empty: 'Không có nhiệm vụ chưa làm',
  },
  {
    key: 'in_progress',
    label: 'Đang làm',
    icon: Clock3,
    header: 'bg-blue-50 text-blue-800 border-blue-100',
    empty: 'Không có nhiệm vụ đang làm',
  },
  {
    key: 'completed',
    label: 'Đã làm',
    icon: CheckCircle2,
    header: 'bg-emerald-50 text-emerald-800 border-emerald-100',
    empty: 'Không có nhiệm vụ đã làm',
  },
];

function progressLaneOf(task) {
  const done = Number(task?.child_completed || 0);
  const total = Number(task?.child_total || 0);
  if (total > 0 && done >= total) return 'completed';
  if (done > 0) return 'in_progress';
  return 'pending';
}

function deadlineBucketOf(task, nowMs = Date.now()) {
  const rawDeadline = task?.deadline;
  if (!rawDeadline) return 'no_deadline';
  const company = task.company_id || task.company;
  const dueMs = companyWorkEndMsFromRaw(rawDeadline, company) ?? new Date(rawDeadline).getTime();
  if (!Number.isFinite(dueMs)) return 'no_deadline';
  const dueYmd = vnYmdFromTs(dueMs);
  const todayYmd = vnYmdFromTs(nowMs);
  if (dueYmd && todayYmd && dueYmd < todayYmd) return 'overdue';
  if (dueYmd && dueYmd === todayYmd) {
    const endMs = companyWorkEndMsOnYmd(dueYmd, company);
    if (endMs != null && nowMs > endMs) return 'overdue';
    return 'today';
  }
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

function assignmentPageModuleOf(task) {
  const moduleKey = task?._module?.key || '';
  if (moduleKey === 'vc') return 'logistics';
  if (moduleKey === 'crm') return 'crm';
  return 'production';
}

function overviewAssignmentsHref(task) {
  const projectId = String(task?.project_id || '').trim();
  const pageModule = assignmentPageModuleOf(task);
  if (projectId) {
    return assignmentsHrefForProject(pageModule, {
      projectId,
      projectCode: String(task?.project_code || '').trim(),
    });
  }
  if (task?.lead_id) {
    return assignmentsHrefForProject(pageModule, { leadId: task.lead_id });
  }
  return null;
}

function overviewProjectHref(task) {
  const projectId = String(task?.project_id || '').trim();
  const pageModule = assignmentPageModuleOf(task);
  if (pageModule === 'crm' && task?.lead_id) return `/crm/leads/${task.lead_id}`;
  if (projectId) return projectDetailPathForModule(pageModule, projectId);
  if (task?.lead_id) return `/crm/leads/${task.lead_id}`;
  return getDeepLink(task);
}

function overviewProjectLinkTitle(task) {
  const pageModule = assignmentPageModuleOf(task);
  if (pageModule === 'logistics') return 'Mở dự án Lắp đặt';
  if (pageModule === 'crm') return 'Mở lead / deal';
  return 'Mở dự án';
}

const TaskCard = memo(function TaskCard({ task, canRemind, showModule }) {
  const [reminding, setReminding] = useState(false);
  const [reminded, setReminded] = useState(false);
  const href = overviewProjectHref(task);
  const assignmentsHref = overviewAssignmentsHref(task);
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
      {href ? (
        <Link to={href} className="block" title={overviewProjectLinkTitle(task)}>{body}</Link>
      ) : body}
      <div className="mt-2 pt-2 border-t border-gray-50 min-h-7 flex items-center gap-2">
        {href ? <Link to={href} className="flex items-center gap-1.5 min-w-0 flex-1" title={overviewProjectLinkTitle(task)}>{personRow}</Link> : personRow}
        <div className="ml-auto flex items-center gap-1 shrink-0">
          {assignmentsHref && (
            <Link
              to={assignmentsHref}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 text-[10px] font-semibold text-indigo-800 hover:bg-indigo-100"
              title="Giao việc của dự án"
            >
              <ClipboardList className="h-3 w-3" />
              Công việc
            </Link>
          )}
          {canRemind && (
            <button
              type="button"
              onClick={handleRemind}
              disabled={reminding || reminded || !task.category_id}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 text-[10px] font-semibold text-amber-700 hover:bg-amber-100 disabled:cursor-default disabled:opacity-60"
              title="Gửi thông báo nhắc người chịu trách nhiệm hoàn thành danh mục này"
            >
              {reminding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bell className="h-3 w-3" />}
              {reminded ? 'Đã nhắc' : reminding ? 'Đang gửi' : 'Nhắc'}
            </button>
          )}
        </div>
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
      {/* Trừ phần trên cột: tiêu đề + hàng module/tìm kiếm + header cột. Dưới lg khung app còn
          thanh trên `pt-12` (48px) nên trừ thêm. */}
      <div ref={scrollRef} className="p-2 max-h-[calc(100vh-374px)] lg:max-h-[calc(100vh-326px)] min-h-72 overflow-y-auto [scrollbar-width:thin]">
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

const PROJECT_TASK_STATUS_LABEL = {
  pending: 'Chưa làm',
  todo: 'Chưa làm',
  in_progress: 'Đang làm',
  completed: 'Xong',
  done: 'Xong',
};

/** Gom danh sách việc (đã sắp theo nhóm dự án từ máy chủ, hoặc đã lọc sẵn ở trang CRM) thành từng dự án, giữ nguyên thứ tự. */
function groupTasksByProject(rows) {
  const map = new Map();
  for (const task of rows) {
    const key = String(task.project_id || task.lead_id || 'none');
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        project_id: task.project_id || null,
        lead_id: task.lead_id || null,
        // Chỉ có ở trang CRM (nhóm từ `visibleTasks`, đã gắn `_module`) — trang SX nhóm từ
        // `team-project-tasks` không có cột này nên mặc định về «production» như cũ.
        module: task._module || null,
        code: String(task.project_code || '').trim(),
        name: String(task.project_name || task.lead_title || '').trim(),
        tasks: [],
      };
      map.set(key, group);
    }
    group.tasks.push(task);
  }
  return [...map.values()];
}

/**
 * Một dự án = một dòng, bấm để mở danh sách công việc chưa xong — cùng cách gom và cùng nguồn số liệu
 * (`GET /work-tasks/team-project-tasks`) với tab Công việc của app.
 */
const ProjectGroupRow = memo(function ProjectGroupRow({
  group, expanded, onToggle, nowMs, showOverdue = true, showCreated = false,
}) {
  const total = group.tasks.length;
  // Mục «Chưa giao»: hạn cũ của việc mẫu không có ý nghĩa nên không tính / không tô đỏ quá hạn.
  const overdue = showOverdue
    ? group.tasks.filter((task) => task.deadline && new Date(task.deadline).getTime() < nowMs).length
    : 0;
  const noDeadline = group.tasks.filter((task) => !task.deadline).length;
  const doing = group.tasks.filter((task) => String(task.status || '').toLowerCase() === 'in_progress').length;
  // Nhóm từ trang CRM (có `group.module`) → mở lead/deal; nhóm từ trang SX (team-project-tasks, không có `module`) → mở dự án SX như cũ.
  const isCrmGroup = group.module?.key === 'crm';
  const href = isCrmGroup
    ? (group.lead_id ? `/crm/leads/${group.lead_id}` : null)
    : (group.project_id ? projectDetailPathForModule('production', group.project_id) : null);
  const openLabel = isCrmGroup ? 'Mở lead/deal' : 'Mở dự án';
  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50/70">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer"
          aria-expanded={expanded}
        >
          {expanded
            ? <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
            : <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />}
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-gray-900">
              {group.code ? <span className="text-teal-700">{group.code}</span> : <span className="text-gray-400">Chưa có mã</span>}
              {group.name ? <span> · {group.name}</span> : null}
            </span>
            <span className="block text-[11px] text-gray-500">
              {total} việc chưa xong
              {doing ? <span> · {doing} đang làm</span> : null}
              {noDeadline ? <span> · {noDeadline} không hạn</span> : null}
            </span>
          </span>
        </button>
        {overdue > 0 ? (
          <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700 tabular-nums">
            Quá hạn {overdue}
          </span>
        ) : null}
        {href ? (
          <Link
            to={href}
            className="shrink-0 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50"
            title={openLabel}
          >
            {openLabel}
          </Link>
        ) : null}
      </div>
      {expanded ? (
        <ul className="border-t border-gray-100 bg-gray-50/50 divide-y divide-gray-100">
          {group.tasks.map((task) => {
            const due = task.deadline ? new Date(task.deadline).getTime() : null;
            const isOver = showOverdue && due != null && due < nowMs;
            const status = String(task.status || '').toLowerCase();
            return (
              <li key={task.unified_id || task.id} className="flex items-center gap-3 px-3 py-2 pl-9 text-xs">
                <span className="min-w-0 flex-1 truncate font-medium text-gray-800" title={task.title}>{task.title}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  status === 'in_progress' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'
                }`}
                >
                  {PROJECT_TASK_STATUS_LABEL[status] || task.status || '—'}
                </span>
                {task.closed_on_deal ? (
                  <span
                    className="shrink-0 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500 ring-1 ring-slate-200"
                    title="Đã giao người ở bảng việc xưởng, nhưng việc cùng tên ở deal đã xong — không tính quá hạn"
                  >
                    Xong ở deal
                  </span>
                ) : null}
                <span className={`w-20 shrink-0 text-right tabular-nums ${isOver ? 'font-semibold text-red-600' : 'text-gray-500'}`}>
                  {task.deadline ? formatDate(task.deadline) : 'Không hạn'}
                </span>
                {showCreated && task.created_at ? (
                  <span className="hidden w-24 shrink-0 text-right tabular-nums text-gray-400 sm:block" title="Ngày tạo">
                    Tạo {formatDate(task.created_at)}
                  </span>
                ) : null}
                <span className="hidden w-32 shrink-0 truncate text-right text-gray-500 sm:block" title={task.assignee_name || ''}>
                  {task.assignee_name || 'Chưa có người nhận'}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
});

function defaultCompanyId(list, user, canPickCompany) {
  if (canPickCompany) return resolveDefaultCrmAdminCompanyId(list) || (list[0]?.id ? String(list[0].id) : '');
  const ownId = user?.company_id != null ? String(user.company_id).trim() : '';
  if (ownId && list.some((company) => String(company.id) === ownId)) return ownId;
  return ownId || (list[0]?.id ? String(list[0].id) : '');
}

export default function CrmProjectTasksPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = isAdminLike(user);
  const isCompanyScoped = isCompanyScopedAdmin(user);
  const companiesModule = '';
  const staffFilterModule = 'all';
  const canPickCompany = isAdmin && !isCompanyScoped;
  const projectFilter = String(searchParams.get('project') || '').trim();
  const projectCodeParam = String(searchParams.get('code') || '').trim();
  const focusRisk = (() => {
    const raw = searchParams.get('risk') || '';
    if (raw === 'warning') return 'today';
    if (raw === 'normal') return 'this_week';
    return raw;
  })();
  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState({ total: 0, warning: 0, overdue: 0, by_module: {} });
  const [companies, setCompanies] = useState(() => peekCompaniesPrefetch(companiesModule) || []);
  const [companiesReady, setCompaniesReady] = useState(() => !!(peekCompaniesPrefetch(companiesModule) || []).length);
  const [filterOptions, setFilterOptions] = useState({ companies: [], regions: [] });
  const [regions, setRegions] = useState([]);
  const [staffUsers, setStaffUsers] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [boardView, setBoardView] = useState(() => {
    try {
      const saved = sessionStorage.getItem(`projectTasksBoard:${MODULE_KEY}`);
      if (saved === 'project') return 'project';
      return saved === 'kanban' ? 'kanban' : 'deadline';
    } catch {
      return 'deadline';
    }
  });
  const [riskFilter, setRiskFilter] = useState('all');
  const [progressFilter, setProgressFilter] = useState('all');
  const [companyFilter, setCompanyFilter] = useState(() => {
    const prefetched = peekCompaniesPrefetch(companiesModule) || [];
    return defaultCompanyId(prefetched, user, canPickCompany);
  });
  const [regionFilter, setRegionFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState([]);
  const [deadlineFrom, setDeadlineFrom] = useState('');
  const [deadlineTo, setDeadlineTo] = useState('');
  const canRemind = canSendTaskRemind(user);
  const applyCompany = useCallback((value) => {
    const next = String(value || '');
    setCompanyFilter(next);
    setRegionFilter('');
    setAssigneeFilter([]);
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
    prefetchCompanies(api, { forModule: companiesModule }).then((list) => {
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
  }, [canPickCompany, companiesModule, user]);

  const load = useCallback(async () => {
    if (!companiesReady) return;
    setLoading(true);
    setError('');
    try {
      const params = { module: MODULE_KEY };
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
  }, [companiesReady, companyFilter, projectFilter]);

  useEffect(() => { load(); }, [load]);

  // ---- Kiểu xem «Theo deal»: gom lại từ `visibleTasks` đã tải sẵn. Không gọi
  // `/work-tasks/team-project-tasks` — API đó chỉ dành cho quản lý và chỉ hiểu dự án SX/VC ----
  const crmProjectView = boardView === 'project';
  const [expandedProjects, setExpandedProjects] = useState({});

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

  const companyOptions = useMemo(() => {
    const list = companies.length ? companies : (filterOptions.companies || []);
    return [...list].sort((a, b) => (
      String(a.short_name || a.name || '').localeCompare(String(b.short_name || b.name || ''), 'vi')
    ));
  }, [companies, filterOptions.companies]);
  const staffCompanyId = canPickCompany
    ? companyFilter
    : String(user?.company_id || companyFilter || '');

  useEffect(() => {
    let cancelled = false;
    const params = {};
    if (staffCompanyId) params.company_id = staffCompanyId;
    else if (canPickCompany && companies.length > 0) {
      params.company_ids = companies.map((company) => company.id).join(',');
    } else {
      setRegions([]);
      return undefined;
    }
    if (staffFilterModule !== 'all') params.for_module = staffFilterModule;
    api.get('/crm/company-regions', { params })
      .then((res) => {
        if (cancelled) return;
        setRegions((Array.isArray(res.data) ? res.data : []).filter((region) => region.is_active !== false));
      })
      .catch(() => {
        if (!cancelled) setRegions([]);
      });
    return () => { cancelled = true; };
  }, [canPickCompany, companies, staffCompanyId, staffFilterModule]);

  useEffect(() => {
    let cancelled = false;
    loadWorkUnifiedEmployees({
      companyId: staffCompanyId,
      companies: companyOptions,
      canPickCompany,
      forModule: staffFilterModule,
    }).then((list) => {
      if (!cancelled) setStaffUsers(list);
    }).catch(() => {
      if (!cancelled) setStaffUsers([]);
    });
    return () => { cancelled = true; };
  }, [canPickCompany, companyOptions, staffCompanyId, staffFilterModule]);

  const assigneeOptions = useMemo(() => (
    filterWorkUnifiedStaff(staffUsers, {
      companyId: companyFilter,
      regionId: regionFilter,
    })
      .map((userRow) => ({
        id: String(userRow.id),
        name: String(userRow.full_name || '').trim(),
        company_name: userRow.company_name || '',
      }))
      .filter((person) => person.id && person.name)
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
  ), [companyFilter, regionFilter, staffUsers]);
  const regionOptions = useMemo(() => {
    const source = regions.length ? regions : (filterOptions.regions || []);
    return source
      .filter((region) => !companyFilter || String(region.company_id || '') === companyFilter)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'vi'));
  }, [companyFilter, filterOptions.regions, regions]);

  useEffect(() => {
    if (
      regionFilter
      && regionFilter !== WORK_UNIFIED_REGION_NONE
      && !regionOptions.some((region) => String(region.id) === regionFilter)
    ) {
      setRegionFilter('');
    }
  }, [regionFilter, regionOptions]);

  useEffect(() => {
    const selected = normalizeWorkUnifiedUserIds(assigneeFilter);
    if (!selected.length || !assigneeOptions.length) return;
    const allowed = new Set(assigneeOptions.map((person) => String(person.id)));
    const next = selected.filter((id) => allowed.has(String(id)));
    if (next.length !== selected.length) setAssigneeFilter(next);
  }, [assigneeFilter, assigneeOptions]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleTasks = useMemo(() => prepared.filter((task) => {
    if (riskFilter !== 'all' && task._bucket !== riskFilter) return false;
    if (progressFilter === 'not_started' && Number(task.child_completed || 0) !== 0) return false;
    if (progressFilter === 'in_progress' && (
      Number(task.child_completed || 0) <= 0
      || Number(task.child_completed || 0) >= Number(task.child_total || 0)
    )) return false;
    if (companyFilter && task.company_id && String(task.company_id) !== companyFilter) return false;
    if (regionFilter === WORK_UNIFIED_REGION_NONE) {
      if (task.region_id) return false;
    } else if (regionFilter && String(task.region_id || '') !== regionFilter) return false;
    const selectedAssignees = normalizeWorkUnifiedUserIds(assigneeFilter);
    if (selectedAssignees.length) {
      const taskPeople = new Set([
        task.effective_assignee_id, task.assignee_id, task.module_owner_id,
      ].map((id) => String(id || '')).filter(Boolean));
      if (!selectedAssignees.some((id) => taskPeople.has(id))) return false;
    }
    if (projectFilter && String(task.project_id || '') !== projectFilter) return false;
    const deadlineMs = task.deadline ? new Date(task.deadline).getTime() : null;
    if (deadlineFrom && (!deadlineMs || deadlineMs < new Date(`${deadlineFrom}T00:00:00`).getTime())) return false;
    if (deadlineTo && (!deadlineMs || deadlineMs > new Date(`${deadlineTo}T23:59:59.999`).getTime())) return false;
    if (!normalizedQuery) return true;
    const hay = [
      task.title, task.project_code, task.project_name, task.lead_title,
      task.assignee_name, task.effective_assignee_name, task.company_name, task.region_name,
    ].filter(Boolean).join(' ').toLowerCase();
    return normalizedQuery.split(/\s+/).filter(Boolean).every((token) => hay.includes(token));
  }), [
    assigneeFilter, companyFilter, deadlineFrom, deadlineTo, normalizedQuery,
    prepared, progressFilter, projectFilter, regionFilter, riskFilter,
  ]);

  // Chỉ còn việc chưa xong — khớp nghĩa "X việc chưa xong" mà ProjectGroupRow hiển thị.
  const crmProjectGroups = useMemo(() => {
    const unfinished = visibleTasks.filter((task) => (
      !['completed', 'done'].includes(String(task.status || '').toLowerCase())
    ));
    return groupTasksByProject(unfinished);
  }, [visibleTasks]);

  const tasksByBucket = useMemo(() => Object.fromEntries(
    COLUMNS.map((column) => [
      column.key,
      visibleTasks.filter((task) => task._bucket === column.key),
    ]),
  ), [visibleTasks]);

  const tasksByStatus = useMemo(() => Object.fromEntries(
    STATUS_COLUMNS.map((column) => [
      column.key,
      visibleTasks.filter((task) => progressLaneOf(task) === column.key),
    ]),
  ), [visibleTasks]);

  const boardColumns = boardView === 'kanban' ? STATUS_COLUMNS : COLUMNS;
  const boardGroups = boardView === 'kanban' ? tasksByStatus : tasksByBucket;

  const visibleStats = useMemo(() => ({
    total: visibleTasks.length,
    ...Object.fromEntries(COLUMNS.map((column) => [column.key, tasksByBucket[column.key]?.length || 0])),
  }), [tasksByBucket, visibleTasks.length]);

  const kpiStats = useMemo(() => {
    let notStarted = 0;
    let inProgress = 0;
    let completed = 0;
    visibleTasks.forEach((task) => {
      const done = Number(task.child_completed || 0);
      const total = Number(task.child_total || 0);
      if (total > 0 && done >= total) completed += 1;
      else if (done > 0) inProgress += 1;
      else notStarted += 1;
    });
    return {
      total: visibleTasks.length,
      notStarted,
      inProgress,
      completed,
      overdue: tasksByBucket.overdue?.length || 0,
    };
  }, [tasksByBucket.overdue, visibleTasks]);

  const shownKpi = kpiStats;

  const selectedCompany = companyOptions
    .find((company) => String(company.id) === companyFilter);
  const selectedRegion = regionOptions
    .find((region) => String(region.id) === regionFilter);
  const lockedCompanyLabel = selectedCompany?.short_name
    || selectedCompany?.name
    || 'Công ty của bạn';
  const companyFilterActive = canPickCompany
    && companyFilter !== defaultCompanyId(companyOptions, user, canPickCompany);
  const selectedAssignees = useMemo(() => {
    const ids = normalizeWorkUnifiedUserIds(assigneeFilter);
    const byId = new Map(assigneeOptions.map((person) => [String(person.id), person]));
    return ids.map((id) => byId.get(id) || { id, name: id });
  }, [assigneeFilter, assigneeOptions]);

  const activeAdvancedFilters = [
    riskFilter !== 'all',
    progressFilter !== 'all',
    companyFilterActive,
    !!regionFilter,
    selectedAssignees.length > 0,
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
    setAssigneeFilter([]);
    setRegionFilter('');
    setDeadlineFrom('');
    setDeadlineTo('');
    if (projectFilter) clearProjectFilter();
  };

  const projectChipLabel = projectCodeParam
    || prepared.find((task) => String(task.project_id || '') === projectFilter)?.project_code
    || projectFilter;
  const activeFilterChips = [
    projectFilter && {
      key: 'project',
      label: `Dự án: ${projectChipLabel}`,
      clear: clearProjectFilter,
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
    companyFilterActive && {
      key: 'company',
      label: companyFilter
        ? `Công ty: ${selectedCompany?.short_name || selectedCompany?.name || companyFilter}`
        : 'Công ty: Tất cả',
      clear: () => applyCompany(defaultCompanyId(companyOptions, user, canPickCompany)),
    },
    regionFilter && {
      key: 'region',
      label: regionFilter === WORK_UNIFIED_REGION_NONE
        ? 'Khu vực: Chưa gán'
        : `Khu vực: ${selectedRegion?.name || regionFilter}`,
      clear: () => setRegionFilter(''),
    },
    ...selectedAssignees.map((person) => ({
      key: `assignee:${person.id}`,
      label: `Nhân viên: ${person.name}`,
      clear: () => setAssigneeFilter((prev) => (
        normalizeWorkUnifiedUserIds(prev).filter((id) => String(id) !== String(person.id))
      )),
    })),
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
  };

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-5">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {`Quản lý nhiệm vụ ${MODULE_LABEL}`}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {`Các danh mục nhiệm vụ thuộc module ${MODULE_LABEL} của dự án còn hoạt động`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-gray-200 bg-white p-0.5" role="group" aria-label="Kiểu xem">
              {[
                { id: 'kanban', label: 'Kanban', icon: LayoutGrid },
                { id: 'deadline', label: 'Hạn', icon: CalendarDays },
                { id: 'project', label: 'Theo deal', icon: Layers },
              ].map((mode) => {
                const Icon = mode.icon;
                const active = boardView === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => {
                      setBoardView(mode.id);
                      try { sessionStorage.setItem(`projectTasksBoard:${MODULE_KEY}`, mode.id); } catch { /* bỏ qua */ }
                    }}
                    className={`h-9 px-2.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                      active ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {mode.label}
                  </button>
                );
              })}
            </div>
            <AdvFilterButton
              open={filtersOpen}
              active={activeAdvancedFilters > 0}
              onClick={() => setFiltersOpen((current) => !current)}
            />
            <button
              type="button"
              onClick={() => load()}
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

      <div className="rounded-2xl border border-slate-200/90 bg-white shadow-md ring-1 ring-slate-900/[0.04] overflow-hidden">
        <div className="border-b border-indigo-100/70 bg-white/40 px-2 sm:px-3 py-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {[
            { key: 'total', label: 'Tổng', value: shownKpi.total, icon: ClipboardList, iconBg: 'bg-violet-100', iconColor: 'text-violet-700', active: riskFilter === 'all' && progressFilter === 'all', onClick: () => { setRiskFilter('all'); setProgressFilter('all'); } },
            { key: 'not_started', label: 'Chưa làm', value: shownKpi.notStarted, icon: Circle, iconBg: 'bg-slate-100', iconColor: 'text-slate-600', active: progressFilter === 'not_started', onClick: () => { setProgressFilter((v) => (v === 'not_started' ? 'all' : 'not_started')); setRiskFilter('all'); } },
            { key: 'in_progress', label: 'Đang làm', value: shownKpi.inProgress, icon: Clock3, iconBg: 'bg-blue-100', iconColor: 'text-blue-700', active: progressFilter === 'in_progress', onClick: () => { setProgressFilter((v) => (v === 'in_progress' ? 'all' : 'in_progress')); setRiskFilter('all'); } },
            { key: 'completed', label: 'Đã làm', value: shownKpi.completed, icon: CheckCircle2, iconBg: 'bg-emerald-100', iconColor: 'text-emerald-700', active: false, onClick: null },
            { key: 'overdue', label: 'Quá hạn', value: shownKpi.overdue, icon: AlertTriangle, iconBg: 'bg-red-100', iconColor: 'text-red-700', active: riskFilter === 'overdue', onClick: () => { setRiskFilter((v) => (v === 'overdue' ? 'all' : 'overdue')); setProgressFilter('all'); } },
          ].map((kpi) => (
            <button
              key={kpi.key}
              type="button"
              onClick={kpi.onClick || undefined}
              disabled={!kpi.onClick}
              className={`group relative h-full min-w-0 flex items-center gap-2 rounded-xl border bg-white px-2.5 py-2 shadow-sm ${
                kpi.active ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-slate-200'
              } ${kpi.onClick ? 'cursor-pointer hover:shadow-md' : 'cursor-default'}`}
            >
              <span className={`shrink-0 grid h-8 w-8 place-items-center rounded-lg ${kpi.iconBg} ${kpi.iconColor}`}>
                <kpi.icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-[9px] font-semibold uppercase tracking-wide text-slate-500">{kpi.label}</span>
                <span className="block text-lg font-bold leading-tight tabular-nums text-slate-900">{kpi.value}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {filtersOpen && (
        <ProjectTasksFilterPanel
          onClose={() => setFiltersOpen(false)}
          onReset={resetAdvancedFilters}
          storageKey={`projectTasksFilterPanelPosition:${MODULE_KEY}`}
          riskFilter={riskFilter}
          setRiskFilter={setRiskFilter}
          progressFilter={progressFilter}
          setProgressFilter={setProgressFilter}
          canPickCompany={canPickCompany}
          lockedCompanyLabel={lockedCompanyLabel}
          companyFilterActive={companyFilterActive}
          companyFilter={companyFilter}
          setCompanyFilter={applyCompany}
          companyOptions={companyOptions}
          allowAllCompanies
          showWorkshopScope={false}
          showDealCompanyFilter={false}
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

      <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Bấm vào đây, gõ từng chữ để tìm mã TB, dự án, khách, SĐT…"
            className="w-full h-10 pl-9 pr-24 rounded-lg border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {normalizedQuery ? (
              <span className="text-[11px] font-semibold tabular-nums text-slate-500">
                {visibleStats.total}
              </span>
            ) : null}
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="p-1 rounded text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="Xóa tìm kiếm"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {crmProjectView ? (
        <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          {loading && !tasks.length ? (
            <div className="py-16 text-center text-sm text-gray-400">Đang tải nhiệm vụ theo deal…</div>
          ) : !crmProjectGroups.length ? (
            <div className="py-16 text-center text-sm text-gray-400">Không có nhiệm vụ chưa xong nào trong phạm vi này</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {crmProjectGroups.map((group) => (
                <ProjectGroupRow
                  key={group.key}
                  group={group}
                  expanded={!!expandedProjects[group.key]}
                  onToggle={() => setExpandedProjects((prev) => ({ ...prev, [group.key]: !prev[group.key] }))}
                  nowMs={Date.now()}
                />
              ))}
            </div>
          )}
        </div>
      ) : loading && !tasks.length ? (
        <div className="py-16 text-center text-sm text-gray-400">
          {!companiesReady
            ? 'Đang tải danh sách công ty…'
            : companyFilter
              ? `Đang tải nhiệm vụ của ${selectedCompany?.short_name || selectedCompany?.name || 'công ty đã chọn'}…`
              : 'Đang tải nhiệm vụ dự án đang hoạt động…'}
        </div>
      ) : (
        <WorkshopPipelineKanbanScroll
          cardSelector="[data-project-task-card]"
          columnScrollMode="off"
        >
          <div className="flex min-w-max gap-3 items-start px-0.5">
            {boardColumns.map((column) => (
              <KanbanColumn
                key={column.key}
                column={column}
                tasks={boardGroups[column.key] || []}
                focused={focusRisk === column.key}
                canRemind={canRemind}
                showModule={false}
              />
            ))}
          </div>
        </WorkshopPipelineKanbanScroll>
      )}
    </div>
  );
}
