import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import api from '../lib/api';
import {
  Plus, Search, Phone, Calendar, FolderKanban, X, User, List,
  CalendarClock, Pin, ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  LayoutGrid, AlertTriangle, BarChart3, Filter, Trash2,
  Factory, Truck, Briefcase, CheckSquare, Settings2, MessageSquare,
  GripVertical, RotateCcw, Clock,
} from 'lucide-react';
import { togglePin, isPinned } from '../components/PinnedProjectsWidget';
import { STATUS_LABELS, STATUS_COLORS, PRIORITY_COLORS, PRIORITY_LABELS, formatVND, formatDate, getInitials, avatarColor } from '../lib/utils';
import {
  projectStatusForStageSlug,
  resolveProjectKanbanStageId,
  isProjectDeliveryStage,
} from '../lib/projectDeliveryStages';
import ViewModeDropdownMenu from '../components/ViewModeDropdownMenu';
import SearchInlineFilterChips, { SearchClearButton } from '../components/SearchInlineFilterChips';
import {
  SX_FILTER_FIELD_CLS,
  SX_FILTER_SELECT_CLS,
  SX_FILTER_LABEL_CLS,
} from '../components/WorkshopDashboardFilterPanel';
import { KanbanBoardEdgeScrollChrome } from '../lib/kanbanEdgeScrollControls';
import { UI_KANBAN_FIXED_CLASS } from '../lib/kanbanColumnTheme';

// Kanban cột = workflow_stages (không còn STATUS_COLUMNS)
const LS_PROJECTS_KPI_PANEL_OPEN = 'projects_kpi_panel_open';
const LS_PROJECTS_FILTER_PANEL_POS = 'projects_filter_panel_pos';

function readStoredProjectsFilterPanelPos() {
  try {
    const raw = localStorage.getItem(LS_PROJECTS_FILTER_PANEL_POS);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') return parsed;
  } catch { /* ignore */ }
  return null;
}

function storeProjectsFilterPanelPos(pos) {
  try {
    if (pos) localStorage.setItem(LS_PROJECTS_FILTER_PANEL_POS, JSON.stringify(pos));
    else localStorage.removeItem(LS_PROJECTS_FILTER_PANEL_POS);
  } catch { /* ignore */ }
}

function readKpiPanelOpen() {
  try {
    const v = localStorage.getItem(LS_PROJECTS_KPI_PANEL_OPEN);
    if (v === '0') return false;
    if (v === '1') return true;
  } catch { /* ignore */ }
  return true;
}

const TIME_FILTERS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'today', label: 'Hôm nay' },
  { id: 'week', label: 'Tuần này' },
  { id: 'month', label: 'Tháng này' },
  { id: 'quarter', label: 'Quý này' },
  { id: 'custom', label: 'Tùy chọn' },
];

function fmtD(d) { return d.toISOString().slice(0,10); }

function filterByTime(items, tf, dFrom, dTo) {
  if (tf === 'all' && !dFrom && !dTo) return items;
  if (tf === 'custom' || (dFrom || dTo)) {
    return items.filter(i => {
      const d = i.created_at ? new Date(i.created_at) : null;
      if (!d) return false;
      if (dFrom && d < new Date(dFrom)) return false;
      if (dTo) { const t = new Date(dTo); t.setHours(23,59,59,999); if (d > t) return false; }
      return true;
    });
  }
  const now = new Date(), start = new Date();
  if (tf === 'today') start.setHours(0,0,0,0);
  else if (tf === 'week') { start.setDate(now.getDate()-now.getDay()); start.setHours(0,0,0,0); }
  else if (tf === 'month') { start.setDate(1); start.setHours(0,0,0,0); }
  else if (tf === 'quarter') { start.setMonth(Math.floor(now.getMonth()/3)*3,1); start.setHours(0,0,0,0); }
  return items.filter(i => { const d = i.created_at ? new Date(i.created_at) : null; return d && d >= start; });
}

export default function Projects() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('kanban');
  const [pinnedSet, setPinnedSet] = useState(new Set());
  const [filterTime, setFilterTime] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterDivision, setFilterDivision] = useState('all');
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterCustomer, setFilterCustomer] = useState('all');
  const [filterPerson, setFilterPerson] = useState('all');
  const [divisions, setDivisions] = useState([]);
  const [plannerColumns, setPlannerColumns] = useState([]);
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [latestComments, setLatestComments] = useState([]);
  const [calendarEmployee, setCalendarEmployee] = useState('all');
  const [companies, setCompanies] = useState([]);
  const [allCompanies, setAllCompanies] = useState([]);
  const [companyEmployees, setCompanyEmployees] = useState([]);
  const [taskAssigneeMap, setTaskAssigneeMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [showAdvFilter, setShowAdvFilter] = useState(false);
  const [filterPanelPos, setFilterPanelPos] = useState(() => readStoredProjectsFilterPanelPos());
  const filterPanelRef = useRef(null);
  const filterPanelDragRef = useRef(null);
  const [calMonth, setCalMonth] = useState(new Date());
  const [kpiPanelOpen, setKpiPanelOpen] = useState(readKpiPanelOpen);
  const [moduleKpis, setModuleKpis] = useState(null);
  const [workflowStages, setWorkflowStages] = useState([]);

  const toggleKpiPanel = () => {
    setKpiPanelOpen((open) => {
      const next = !open;
      try { localStorage.setItem(LS_PROJECTS_KPI_PANEL_OPEN, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };

  const pinToggle = (id) => { togglePin(id); setPinnedSet(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };

  useEffect(() => {
    const ids = JSON.parse(localStorage.getItem('tubep_pinned_projects') || '[]');
    setPinnedSet(new Set(ids));
  }, []);

  const loadModuleKpis = (companyId) => {
    const params = {};
    if (companyId && companyId !== 'all') params.company_id = companyId;
    api.get('/management/overview', { params })
      .then((r) => setModuleKpis(r.data?.kpis || null))
      .catch(() => setModuleKpis(null));
  };

  const load = (searchOverride) => {
    setLoading(true);
    const q = searchOverride !== undefined ? searchOverride : search;
    api.get('/projects', { params: { search: q || undefined, limit: 500 } })
      .then(r => {
        setProjects(r.data.projects || []);
        const projectIds = (r.data.projects || []).map(p => p.id);
        if (projectIds.length > 0) {
          api.get('/tasks', { params: { project_ids: projectIds.join(','), limit: 5000, fields: 'id,project_id,assignee_id' } })
            .then(tr => {
              const map = {};
              (tr.data.tasks || []).forEach(t => {
                if (t.assignee_id) {
                  if (!map[t.project_id]) map[t.project_id] = new Set();
                  map[t.project_id].add(t.assignee_id);
                }
              });
              Object.keys(map).forEach(k => { map[k] = [...map[k]]; });
              setTaskAssigneeMap(map);
            }).catch(() => {});
        }
      })
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);
  useEffect(() => { loadModuleKpis(filterCompany); }, [filterCompany]);

  useEffect(() => {
    api.get('/stages', { params: { company_id: '' } })
      .then((r) => {
        const list = (r.data.stages || [])
          .filter(isProjectDeliveryStage)
          .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
        setWorkflowStages(list);
      })
      .catch(() => setWorkflowStages([]));
  }, []);

  // Load planner board when switching to planner view
  const loadPlanner = () => {
    setPlannerLoading(true);
    const params = {};
    if (filterCompany !== 'all') params.company_id = filterCompany;
    api.get('/tasks/planner/board', { params })
      .then(r => setPlannerColumns(r.data.columns || []))
      .catch(() => setPlannerColumns([]))
      .finally(() => setPlannerLoading(false));
  };
  useEffect(() => { if (viewMode === 'planner') loadPlanner(); }, [viewMode, filterCompany]);

  // Load latest comments
  const loadComments = () => {
    api.get('/projects/latest-comments', { params: { limit: 20 } })
      .then(r => setLatestComments(r.data.comments || []))
      .catch(() => setLatestComments([]));
  };
  useEffect(() => { if (viewMode === 'comments') loadComments(); }, [viewMode]);

  useEffect(() => {
    api.get('/divisions').then(r => setDivisions(r.data.divisions || [])).catch(() => {});
    api.get('/companies').then(r => {
      const cos = r.data.companies || [];
      setAllCompanies(cos); setCompanies(cos);
    }).catch(() => api.get('/companies/my/list').then(r => {
      const cos = r.data.companies || [];
      setAllCompanies(cos); setCompanies(cos);
    }).catch(() => {}));
  }, []);

  useEffect(() => {
    if (filterDivision && filterDivision !== 'all') {
      const filtered = allCompanies.filter(c => c.division_unit_id === filterDivision);
      setCompanies(filtered);
      if (filterCompany !== 'all' && !filtered.find(c => c.id === filterCompany)) setFilterCompany('all');
    } else {
      setCompanies(allCompanies);
    }
  }, [filterDivision, allCompanies]);

  useEffect(() => {
    if (filterCompany && filterCompany !== 'all') {
      loadRelevantEmployees([filterCompany]);
    } else if (filterDivision && filterDivision !== 'all') {
      const divCompanyIds = allCompanies.filter(c => c.division_unit_id === filterDivision).map(c => c.id);
      if (divCompanyIds.length > 0) loadRelevantEmployees(divCompanyIds);
      else setCompanyEmployees([]);
    } else {
      setCompanyEmployees([]);
    }
    setFilterPerson('all');
  }, [filterCompany, filterDivision, projects, taskAssigneeMap]);

  const loadRelevantEmployees = (companyIds) => {
    const relevantProjects = projects.filter(p => companyIds.includes(p.company_id) || companyIds.includes(p.company?.id));
    const creatorIds = new Set(relevantProjects.map(p => p.created_by).filter(Boolean));
    relevantProjects.forEach(p => { (taskAssigneeMap[p.id] || []).forEach(uid => creatorIds.add(uid)); });
    if (creatorIds.size === 0) { setCompanyEmployees([]); return; }
    const employees = []; const seen = new Set();
    relevantProjects.forEach(p => {
      [p.sales_person, p.designer, p.project_manager, p.created_by_user].forEach(per => {
        if (per?.id && creatorIds.has(per.id) && !seen.has(per.id)) { seen.add(per.id); employees.push({ id: per.id, full_name: per.full_name }); }
      });
    });
    const remaining = [...creatorIds].filter(id => !seen.has(id));
    if (remaining.length > 0 && companyIds[0]) {
      api.get(`/companies/${companyIds[0]}/employees`).then(r => {
        (r.data.employees || []).forEach(emp => { if (creatorIds.has(emp.id) && !seen.has(emp.id)) { seen.add(emp.id); employees.push(emp); } });
        setCompanyEmployees([...employees]);
      }).catch(() => setCompanyEmployees([...employees]));
    } else { setCompanyEmployees(employees); }
  };

  const deleteProject = async (e, id, code) => {
    e.preventDefault(); e.stopPropagation();
    const msg = `⚠️ Xóa dự án "${code}"?\n\nSẽ xóa luôn tất cả nhiệm vụ, lead/deal liên kết, tài liệu.\nHành động này KHÔNG THỂ hoàn tác!`;
    if (!confirm(msg)) return;
    try { await api.delete(`/projects/${id}`); load(); } catch (err) {
      alert('Lỗi xóa: ' + (err.response?.data?.error || err.message));
    }
  };

  // Filters
  let filtered = filterByTime(projects, filterTime, dateFrom, dateTo);
  if (filterDivision !== 'all') {
    const divCompanyIds = allCompanies.filter(c => c.division_unit_id === filterDivision).map(c => c.id);
    filtered = filtered.filter(p => divCompanyIds.includes(p.company_id) || divCompanyIds.includes(p.company?.id));
  }
  if (filterCompany !== 'all') filtered = filtered.filter(p => p.company_id === filterCompany || p.company?.id === filterCompany);
  if (filterCustomer !== 'all') filtered = filtered.filter(p => p.customer_id === filterCustomer);
  if (filterPerson !== 'all') filtered = filtered.filter(p => {
    const pp = [p.sales_person_id, p.designer_id, p.project_manager_id, p.consulting_person_id, p.design_person_id, p.quotation_person_id, p.contract_person_id, p.production_person_id, p.shipping_person_id, p.installation_person_id, p.care_person_id, p.supervisor_id, p.created_by];
    if (pp.includes(filterPerson)) return true;
    return (taskAssigneeMap[p.id] || []).includes(filterPerson);
  });

  const uniqueCustomers = []; const seenCust = new Set();
  projects.forEach(p => { if (p.customers?.id && !seenCust.has(p.customers.id)) { seenCust.add(p.customers.id); uniqueCustomers.push({ id: p.customers.id, name: p.customers.full_name }); } });

  const uniquePersons = []; const seenPerson = new Set();
  if (companyEmployees.length > 0) {
    companyEmployees.forEach(emp => { if (emp?.id && !seenPerson.has(emp.id)) { seenPerson.add(emp.id); uniquePersons.push({ id: emp.id, name: emp.full_name }); } });
  } else {
    projects.forEach(p => { [p.sales_person, p.designer, p.project_manager].forEach(per => { if (per?.id && !seenPerson.has(per.id)) { seenPerson.add(per.id); uniquePersons.push({ id: per.id, name: per.full_name }); } }); });
  }

  const hasActiveFilters = filterDivision !== 'all' || filterCompany !== 'all' || filterCustomer !== 'all' || filterPerson !== 'all' || filterTime !== 'all' || dateFrom || dateTo;

  const overdueCount = filtered.filter((p) => {
    const d = p.schedule?.at || p.deadline || p.design_deadline || p.production_deadline || p.delivery_date || p.dates?.deal_task_deadline;
    return d && new Date(d) < new Date() && p.status !== 'completed';
  }).length;

  const kpi = useMemo(() => {
    const now = new Date();
    let working = 0;
    let done = 0;
    let overdue = 0;
    let noDeadline = 0;
    let valueSum = 0;
    for (const p of filtered) {
      const st = p.status || '';
      if (st === 'completed' || st === 'warranty') done += 1;
      else if (st && st !== 'on_hold') working += 1;
      const d = p.deadline || p.design_deadline;
      if (!d) noDeadline += 1;
      else if (new Date(d) < now && st !== 'completed') overdue += 1;
      valueSum += Number(p.estimated_value) || 0;
    }
    return {
      total: filtered.length,
      working,
      done,
      overdue,
      noDeadline,
      valueSum,
    };
  }, [filtered]);

  const VIEW_MODES = useMemo(() => [
    { id: 'kanban', label: 'Kanban', hint: 'Cột giai đoạn giao hàng dự án', icon: LayoutGrid },
    { id: 'list', label: 'Danh sách', hint: 'Bảng dự án dạng list', icon: List },
    { id: 'deadline', label: 'Theo hạn', hint: 'Nhóm theo quá hạn / hôm nay / tuần', icon: CalendarClock },
    { id: 'planner', label: 'Planner', hint: 'Phân công theo người', icon: User },
    { id: 'calendar', label: 'Lịch', hint: 'Deadline theo tháng', icon: Calendar },
    { id: 'tasks', label: 'Chat nhiệm vụ', hint: 'Trao đổi trên task dự án', icon: CheckSquare },
    { id: 'comments', label: 'Bình luận', hint: 'Comment mới trên dự án', icon: MessageSquare },
  ], []);
  const ALT_VIEW_MODES = useMemo(
    () => VIEW_MODES.filter((v) => v.id !== 'kanban'),
    [VIEW_MODES],
  );
  const [showViewModeMenu, setShowViewModeMenu] = useState(false);
  const viewModeTriggerRef = useRef(null);
  const kanbanWrapRef = useRef(null);
  const kanbanScrollRef = useRef(null);
  const [kanbanDragging, setKanbanDragging] = useState(false);

  const nudgeKanban = (dir) => {
    const sc = kanbanScrollRef.current;
    if (!sc) return;
    const step = 300;
    sc.scrollLeft = Math.max(
      0,
      Math.min(sc.scrollWidth - sc.clientWidth, sc.scrollLeft + (dir === 'right' ? step : -step)),
    );
  };

  const clearAllFilters = () => {
    setFilterTime('all');
    setDateFrom('');
    setDateTo('');
    setFilterDivision('all');
    setFilterCompany('all');
    setFilterCustomer('all');
    setFilterPerson('all');
  };

  const closeProjectsFilterPanel = useCallback(() => {
    setShowAdvFilter(false);
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
        if (pos) storeProjectsFilterPanelPos(pos);
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
      if (e.key === 'Escape') closeProjectsFilterPanel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showAdvFilter, closeProjectsFilterPanel]);

  const inlineFilterChips = useMemo(() => {
    const chips = [];
    if (filterCompany !== 'all') {
      const c = companies.find((x) => String(x.id) === String(filterCompany));
      chips.push({
        id: 'company',
        label: c?.short_name || c?.name || 'Công ty',
        onClear: () => setFilterCompany('all'),
      });
    }
    if (filterTime !== 'all' || dateFrom || dateTo) {
      const tf = TIME_FILTERS.find((t) => t.id === filterTime);
      let label = tf?.label || 'Thời gian';
      if (filterTime === 'custom' || dateFrom || dateTo) {
        label = [dateFrom, dateTo].filter(Boolean).join(' → ') || 'Tùy chọn';
      }
      chips.push({
        id: 'time',
        label,
        onClear: () => { setFilterTime('all'); setDateFrom(''); setDateTo(''); },
      });
    }
    if (filterDivision !== 'all') {
      const d = divisions.find((x) => String(x.id) === String(filterDivision));
      chips.push({
        id: 'division',
        label: d?.name || 'Khối',
        onClear: () => setFilterDivision('all'),
      });
    }
    if (filterPerson !== 'all') {
      const u = uniquePersons.find((x) => String(x.id) === String(filterPerson));
      chips.push({
        id: 'person',
        label: u?.name || 'NV',
        onClear: () => setFilterPerson('all'),
      });
    }
    if (filterCustomer !== 'all') {
      const c = uniqueCustomers.find((x) => String(x.id) === String(filterCustomer));
      chips.push({
        id: 'customer',
        label: c?.name || 'KH',
        onClear: () => setFilterCustomer('all'),
      });
    }
    return chips;
  }, [
    filterCompany, filterTime, dateFrom, dateTo, filterDivision, filterPerson, filterCustomer,
    companies, divisions, uniquePersons, uniqueCustomers,
  ]);

  // Drag-and-drop — chuyển current_stage_id (+ map status legacy)
  const onDragEnd = async (result) => {
    const { draggableId, source, destination } = result;
    if (!destination || (source.droppableId === destination.droppableId && source.index === destination.index)) return;
    const stageId = destination.droppableId;
    const stage = workflowStages.find((s) => String(s.id) === String(stageId));
    if (!stage) return;
    const newStatus = projectStatusForStageSlug(stage.slug);
    setProjects((prev) => prev.map((p) => (
      p.id === draggableId
        ? { ...p, current_stage_id: stage.id, current_stage: stage, status: newStatus }
        : p
    )));
    try {
      await api.put(`/projects/${draggableId}/stage`, {
        stage_slug: stage.slug,
        new_status: newStatus,
      });
    } catch {
      load();
    }
  };

  // Kanban data — cột = workflow_stages active
  const projectsByStage = useMemo(() => {
    const data = {};
    workflowStages.forEach((col) => { data[col.id] = []; });
    const fallbackId = workflowStages[0]?.id;
    filtered.forEach((proj) => {
      const stageId = resolveProjectKanbanStageId(proj, workflowStages) || fallbackId;
      if (stageId && data[stageId]) data[stageId].push(proj);
      else if (fallbackId) data[fallbackId].push(proj);
    });
    return data;
  }, [filtered, workflowStages]);

  const visibleKanbanColumns = useMemo(() => workflowStages, [workflowStages]);

  // Planner data
  // (Planner data loaded from API via loadPlanner)

  // Calendar data
  const calendarData = useMemo(() => {
    const y = calMonth.getFullYear(), m = calMonth.getMonth();
    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const weeks = [];
    let week = new Array(firstDay).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const dayProjects = filtered.filter(p => {
        const dl = p.deadline || p.design_deadline;
        return dl && dl.startsWith(dateStr);
      });
      week.push({ day: d, date: dateStr, projects: dayProjects });
      if (week.length === 7) { weeks.push(week); week = []; }
    }
    if (week.length > 0) { while (week.length < 7) week.push(null); weeks.push(week); }
    return weeks;
  }, [filtered, calMonth]);

  // Gantt data
  // (Gantt removed — Calendar now shows project bars)

  // Project card — dải CRM/SX/VC luôn hiện + chi tiết từng module (dễ phân biệt đa module)
  const ProjectCard = ({ proj }) => {
    const mods = proj.modules || {};
    const origin = proj.origin || null;
    const dates = proj.dates || {};
    const schedule = proj.schedule || null;

    const deadlineAt = schedule?.at
      || proj.deadline
      || dates.deadline
      || dates.sx_kanban_deadline_at
      || dates.production_deadline
      || dates.design_deadline
      || dates.delivery_date
      || dates.install_date
      || dates.deal_kanban_deadline_at
      || dates.deal_task_deadline
      || dates.expected_close_date
      || null;
    const deadlineTs = deadlineAt ? new Date(deadlineAt).getTime() : NaN;
    const hasDeadline = Number.isFinite(deadlineTs);
    const overdue = hasDeadline && deadlineTs < Date.now() && proj.status !== 'completed';
    const soon = hasDeadline && !overdue && deadlineTs <= Date.now() + 3 * 86400000;
    const deadlineTone = overdue
      ? 'bg-red-50 border-red-200 text-red-700'
      : soon
        ? 'bg-amber-50 border-amber-200 text-amber-800'
        : 'bg-slate-50 border-slate-200 text-slate-700';
    const deadlineLabel = schedule?.label || 'Hạn';

    const moduleDefs = [
      {
        key: 'crm',
        label: 'CRM',
        short: 'CRM',
        active: !!mods.crm?.active,
        company: mods.crm?.company?.short_name || mods.crm?.company?.name || null,
        person: mods.crm?.person || null,
        role: mods.crm?.person_role || 'Kinh doanh',
        stage: null,
        on: {
          pill: 'bg-emerald-600 text-white border-emerald-700 shadow-sm',
          row: 'bg-emerald-50/90 border-emerald-200',
          bar: 'bg-emerald-600',
          badge: 'bg-emerald-600 text-white',
        },
        off: {
          pill: 'bg-white text-slate-400 border-slate-200 border-dashed',
        },
      },
      {
        key: 'sx',
        label: 'SX',
        short: 'SX',
        active: !!mods.production?.active,
        company: mods.production?.company?.short_name
          || mods.production?.company?.name
          || proj.company?.short_name
          || proj.company?.name
          || null,
        person: mods.production?.person || proj.production_person || null,
        role: mods.production?.person_role || 'Sản xuất',
        stage: proj.sx_kanban_stage?.name
          || (proj.current_stage?.slug && ['production', 'materials'].includes(proj.current_stage.slug)
            ? proj.current_stage.name
            : null),
        on: {
          pill: 'bg-orange-600 text-white border-orange-700 shadow-sm',
          row: 'bg-orange-50/90 border-orange-200',
          bar: 'bg-orange-600',
          badge: 'bg-orange-600 text-white',
        },
        off: {
          pill: 'bg-white text-slate-400 border-slate-200 border-dashed',
        },
      },
      {
        key: 'vc',
        label: 'VC',
        short: 'VC',
        active: !!mods.logistics?.active,
        company: mods.logistics?.company?.short_name || mods.logistics?.company?.name || null,
        person: mods.logistics?.person
          || proj.logistics_person
          || proj.shipping_person
          || proj.installation_person
          || null,
        role: mods.logistics?.person_role || 'Vận chuyển / Lắp',
        stage: proj.vc_kanban_stage?.name
          || (proj.current_stage?.slug && ['delivery', 'installation', 'acceptance'].includes(proj.current_stage.slug)
            ? proj.current_stage.name
            : null),
        on: {
          pill: 'bg-amber-600 text-white border-amber-700 shadow-sm',
          row: 'bg-amber-50/90 border-amber-200',
          bar: 'bg-amber-600',
          badge: 'bg-amber-600 text-white',
        },
        off: {
          pill: 'bg-white text-slate-400 border-slate-200 border-dashed',
        },
      },
    ];

    // Fallback khi enrich chưa có modules
    if (mods.crm == null && mods.production == null && mods.logistics == null) {
      moduleDefs[0].active = false;
      moduleDefs[1].active = !!(proj.company_id || proj.sx_kanban_column_id);
      moduleDefs[2].active = !!(proj.logistics_company_id || proj.vc_kanban_column_id);
      if (moduleDefs[1].active) {
        moduleDefs[1].company = proj.company?.short_name || proj.company?.name || null;
        moduleDefs[1].person = proj.production_person || null;
      }
      if (moduleDefs[2].active) {
        moduleDefs[2].person = proj.logistics_person || proj.shipping_person || proj.installation_person || null;
      }
    }

    const activeModules = moduleDefs.filter((m) => m.active);
    const multiModule = activeModules.length >= 2;

    const orderDate = dates.order_date || proj.order_date;
    const deliveryDate = dates.delivery_date || dates.production_deadline || proj.delivery_date || proj.production_deadline;
    const installDate = dates.install_date || proj.install_date;

    return (
      <Link
        to={`/projects/${proj.id}?tab=overview`}
        className={`block rounded-xl border bg-white p-3 transition-all group hover:shadow-md hover:border-violet-300 ${
          overdue ? 'border-red-200 ring-1 ring-red-100' : 'border-slate-200/90'
        }`}
      >
        {/* Dải module luôn 3 ô — nhìn 1 phát biết dự án chạm CRM / SX / VC */}
        <div className="flex items-center gap-1 mb-2" title="Module đang gắn với dự án">
          {moduleDefs.map((m) => (
            <span
              key={m.key}
              className={`flex-1 text-center text-[10px] font-extrabold tracking-wide rounded-md border px-1 py-1 ${
                m.active ? m.on.pill : m.off.pill
              }`}
            >
              {m.short}
            </span>
          ))}
        </div>

        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[11px] font-bold text-violet-700 font-mono truncate">{proj.code}</span>
            {multiModule && (
              <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 border border-violet-200">
                Đa module
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); pinToggle(proj.id); }}
            className={`p-0.5 rounded cursor-pointer shrink-0 ${
              pinnedSet.has(proj.id) ? 'text-amber-500' : 'text-slate-300 opacity-0 group-hover:opacity-100'
            }`}
            title={pinnedSet.has(proj.id) ? 'Bỏ ghim' : 'Ghim'}
          >
            <Pin className="h-3 w-3" />
          </button>
        </div>

        <h4 className="text-[13px] font-bold text-slate-900 leading-snug line-clamp-2 group-hover:text-violet-700 mb-1.5">
          {proj.name}
        </h4>

        <div className="mb-1.5 text-[10px] leading-snug">
          {origin?.kind === 'crm_deal' ? (
            <p className="truncate text-emerald-800 font-semibold" title={[origin.deal_code, origin.deal_title].filter(Boolean).join(' — ')}>
              Từ CRM
              {origin.deal_code && <span className="ml-1 font-mono">{origin.deal_code}</span>}
              {origin.created_by?.full_name && (
                <span className="font-medium text-slate-500"> · {origin.created_by.full_name}</span>
              )}
            </p>
          ) : (
            <p className="truncate text-slate-600 font-medium">
              {origin?.label || 'Tạo thủ công'}
              {origin?.created_by?.full_name && (
                <span className="text-slate-500"> · {origin.created_by.full_name}</span>
              )}
            </p>
          )}
        </div>

        {hasDeadline ? (
          <div className="mb-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${deadlineTone}`}
              title={`${deadlineLabel}: ${formatDate(deadlineAt)}`}
            >
              <Clock className="h-3 w-3" strokeWidth={2.4} />
              <span className="uppercase tracking-wide font-extrabold">{deadlineLabel}</span>
              <span className="opacity-70">·</span>
              {overdue ? `Quá hạn ${formatDate(deadlineAt)}` : `Hạn ${formatDate(deadlineAt)}`}
            </span>
          </div>
        ) : null}

        {(orderDate || deliveryDate || installDate) && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {orderDate && (
              <span className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 tabular-nums">
                Đặt {formatDate(orderDate)}
              </span>
            )}
            {deliveryDate && (
              <span className="inline-flex items-center rounded border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-700 tabular-nums">
                Giao {formatDate(deliveryDate)}
              </span>
            )}
            {installDate && (
              <span className="inline-flex items-center rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-800 tabular-nums">
                Lắp {formatDate(installDate)}
              </span>
            )}
          </div>
        )}

        {/* Chi tiết từng module đang active — màu + vạch trái tách biệt */}
        {activeModules.length > 0 && (
          <div className="space-y-1 mb-1.5">
            {activeModules.map((row) => (
              <div
                key={row.key}
                className={`flex items-stretch gap-0 rounded-md border overflow-hidden ${row.on.row}`}
              >
                <span className={`w-1 shrink-0 ${row.on.bar}`} aria-hidden />
                <div className="flex items-center gap-1.5 px-1.5 py-1 min-w-0 flex-1">
                  <span className={`text-[9px] font-extrabold shrink-0 px-1.5 py-0.5 rounded ${row.on.badge}`}>
                    {row.label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold truncate text-slate-900">
                      {row.person?.full_name || <span className="font-medium text-slate-400">Chưa gán</span>}
                    </p>
                    <p className="text-[9px] font-medium text-slate-600 truncate">
                      {[row.stage, row.role, row.company].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {(proj.customers?.full_name || proj.customers?.phone) && (
          <p className="text-[11px] leading-snug min-w-0 truncate mb-1" title={[proj.customers?.full_name, proj.customers?.phone].filter(Boolean).join(' · ')}>
            {proj.customers?.full_name && (
              <span className="font-medium text-slate-800">{proj.customers.full_name}</span>
            )}
            {proj.customers?.full_name && proj.customers?.phone && (
              <span className="text-slate-300 mx-1">·</span>
            )}
            {proj.customers?.phone && (
              <span className="font-mono tabular-nums text-slate-700">{proj.customers.phone}</span>
            )}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 mt-1.5 pt-1.5 border-t border-slate-100">
          <span className="text-[10px] font-medium text-slate-500 truncate">
            {activeModules.length
              ? `${activeModules.length} module · ${activeModules.map((m) => m.short).join(' · ')}`
              : 'Chưa gắn module'}
          </span>
          {proj.estimated_value > 0 && (
            <span className="text-[11px] font-bold text-emerald-600 tabular-nums shrink-0">
              {formatVND(proj.estimated_value)}
            </span>
          )}
        </div>
      </Link>
    );
  };

  return (
    <div className="min-h-screen space-y-2">
      <div className="ui-solid-white rounded-xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
        {/* Hàng 1 — tab + hành động */}
        <div className="border-b border-slate-200/60">
          <div className="flex items-center justify-between gap-1.5 flex-wrap px-2.5 py-1 sm:px-3 bg-slate-50/50">
            <div className="flex items-center gap-1 min-w-0">
              <div data-tour="pipeline-tabs" className="inline-flex gap-px p-0.5 bg-slate-200/60 border border-slate-300/50 rounded-lg shrink-0">
                <button
                  type="button"
                  className="rounded-md font-semibold transition-colors flex items-center gap-1 px-2 py-1 text-[11px] whitespace-nowrap bg-white text-blue-700 shadow-sm"
                >
                  Dự án {filtered.length}
                </button>
              </div>
              {overdueCount > 0 && (
                <span className="inline-flex items-center gap-1 h-6 px-1.5 rounded-md bg-red-50 border border-red-200 text-red-600 text-[10px] font-bold">
                  <AlertTriangle className="h-3 w-3" /> {overdueCount}
                </span>
              )}
              <span className="text-[10px] text-slate-400 hidden sm:inline">
                Cập nhật {new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => navigate('/workflow-settings')}
                className="h-7 px-2.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                title="Thêm / đổi tên / ẩn / sắp xếp cột Kanban"
              >
                <Settings2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Cấu hình cột</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/projects/create')}
                className="h-7 px-2.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer shadow-sm"
              >
                <Plus className="h-3.5 w-3.5" /> Thêm dự án
              </button>
            </div>
          </div>

          {/* Hàng 2 — chuẩn CRM/SX: tìm kiếm + lọc | chế độ xem */}
          <div
            data-tour="projects-toolbar"
            className="flex flex-wrap items-center gap-1.5 px-2.5 py-1.5 sm:px-3 border-t border-slate-200/50 bg-white"
          >
            <div
              className={`group/search flex items-center flex-1 min-w-[12rem] max-w-none sm:max-w-[22rem] lg:max-w-[28rem] rounded-md border transition-colors ${
                showAdvFilter
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
                  className={`absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none ${
                    search.trim() || showAdvFilter ? 'text-violet-600' : 'text-slate-400'
                  }`}
                />
                {!showAdvFilter && inlineFilterChips.length > 0 && (
                  <SearchInlineFilterChips
                    chips={inlineFilterChips}
                    opacityClass={
                      search.trim() ? 'opacity-35' : 'opacity-45 group-hover/search:opacity-100'
                    }
                    onClearChip={(chip) => chip.onClear()}
                    onClearAll={clearAllFilters}
                    showClearAll={inlineFilterChips.length > 1}
                  />
                )}
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && load()}
                  placeholder="Tìm mã, tên dự án, khách hàng…"
                  className={`flex-1 min-w-[3.5rem] h-8 bg-transparent border-0 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 ${search ? 'pr-7' : ''}`}
                />
                {search && (
                  <SearchClearButton onClick={() => { setSearch(''); load(); }} />
                )}
              </div>
              <div className="shrink-0 pr-1">
                <button
                  type="button"
                  data-tour="projects-filter"
                  onClick={() => setShowAdvFilter((v) => !v)}
                  aria-expanded={showAdvFilter}
                  className={`relative h-6 w-6 flex items-center justify-center rounded border transition-colors cursor-pointer ${
                    showAdvFilter || hasActiveFilters
                      ? 'bg-violet-100 text-violet-700 border-violet-300'
                      : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100 hover:text-slate-700'
                  }`}
                  title={showAdvFilter ? 'Thu gọn bộ lọc' : 'Bộ lọc nâng cao'}
                >
                  <Filter className="h-3 w-3" />
                  {hasActiveFilters && (
                    <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-violet-600 ring-1 ring-white" />
                  )}
                </button>
              </div>
            </div>

            <div
              data-tour="projects-view-mode"
              className="flex items-center gap-0.5 shrink-0 ml-auto pl-1 border-l border-slate-200/80"
            >
              <div className="inline-flex items-center gap-px p-0.5 rounded-md bg-slate-100 border border-slate-200/80">
                <button
                  type="button"
                  onClick={() => setViewMode('kanban')}
                  className={`h-8 px-2 rounded-md text-xs font-medium inline-flex items-center gap-1 cursor-pointer transition-colors shrink-0 ${
                    viewMode === 'kanban'
                      ? 'bg-white text-violet-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Kanban</span>
                </button>
                <div className="relative">
                  <button
                    ref={viewModeTriggerRef}
                    type="button"
                    data-tour="projects-view-mode-more"
                    onClick={() => setShowViewModeMenu((v) => !v)}
                    className={`h-8 px-2 rounded-md text-xs font-medium inline-flex items-center gap-1 cursor-pointer transition-colors shrink-0 ${
                      viewMode !== 'kanban'
                        ? 'bg-white text-violet-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Chọn dạng giao diện khác"
                    aria-expanded={showViewModeMenu}
                    aria-label="Chế độ xem khác"
                  >
                    {(() => {
                      const active = ALT_VIEW_MODES.find((v) => v.id === viewMode);
                      const Icon = active?.icon || List;
                      return (
                        <>
                          <Icon className="h-3.5 w-3.5" />
                          <span className="hidden md:inline max-w-[6.5rem] truncate">
                            {active?.label || 'Khác'}
                          </span>
                          <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${showViewModeMenu ? 'rotate-180' : ''}`} />
                        </>
                      );
                    })()}
                  </button>
                  <ViewModeDropdownMenu
                    open={showViewModeMenu}
                    onClose={() => setShowViewModeMenu(false)}
                    anchorRef={viewModeTriggerRef}
                    modes={ALT_VIEW_MODES}
                    activeId={viewMode}
                    theme="violet"
                    onSelect={(id) => {
                      setViewMode(id);
                      setShowViewModeMenu(false);
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* KPI — theo module: Dự án · CRM · SX · VC · Task */}
        <section data-tour="projects-kpis" className="border-t border-slate-200/60 bg-slate-50/30">
          <button
            type="button"
            onClick={toggleKpiPanel}
            aria-expanded={kpiPanelOpen}
            className="w-full flex items-center gap-1.5 px-2.5 py-1 sm:px-3 text-left cursor-pointer transition-colors hover:bg-slate-100/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-inset"
          >
            <BarChart3 className="h-3.5 w-3.5 shrink-0 text-violet-600" aria-hidden />
            <span className="text-[11px] font-semibold text-slate-800 shrink-0 whitespace-nowrap">
              KPI<span className="ml-1 font-medium text-blue-600">· Đa module</span>
            </span>
            {!kpiPanelOpen && (
              <span className="text-[10px] text-slate-500 truncate ml-2">
                {kpi.total} DA
                {moduleKpis ? (
                  <> · {moduleKpis.crm_deals || 0} deal · {moduleKpis.sx_active || 0} SX · {(moduleKpis.vc_active || 0) + (moduleKpis.install_active || 0)} VC · {moduleKpis.overdue_tasks || 0} task trễ</>
                ) : (
                  <> · {kpi.overdue} quá hạn · {kpi.done} xong</>
                )}
              </span>
            )}
            <span className="shrink-0 ml-auto flex items-center gap-0.5 text-[10px] font-medium text-slate-500">
              <span className="hidden sm:inline">{kpiPanelOpen ? 'Thu gọn' : 'Mở rộng'}</span>
              {kpiPanelOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </span>
          </button>
          {kpiPanelOpen && (
            <div className="border-t border-violet-100/70 bg-white/40 px-2 sm:px-3 pb-2.5 pt-2 space-y-2">
              <div className="grid items-stretch gap-2 grid-cols-1 md:grid-cols-2 xl:grid-cols-5">
                <ModuleKpiGroup
                  title="Dự án"
                  icon={<FolderKanban className="h-3.5 w-3.5" />}
                  tone="violet"
                  href="/projects"
                  items={[
                    { label: 'Tổng', value: kpi.total },
                    { label: 'Đang làm', value: kpi.working },
                    { label: 'Quá hạn', value: kpi.overdue, alert: kpi.overdue > 0 },
                    { label: 'Hoàn thành', value: kpi.done },
                  ]}
                  footer={kpi.valueSum > 0 ? `GT: ${formatVND(kpi.valueSum)}` : null}
                />
                <ModuleKpiGroup
                  title="CRM"
                  icon={<Briefcase className="h-3.5 w-3.5" />}
                  tone="emerald"
                  href="/crm/dashboard"
                  items={[
                    { label: 'Lead', value: moduleKpis?.crm_leads ?? '—' },
                    { label: 'Deal', value: moduleKpis?.crm_deals ?? '—' },
                    { label: 'Won', value: moduleKpis?.crm_won ?? '—' },
                    { label: 'Quá hạn', value: moduleKpis?.crm_overdue ?? '—', alert: (moduleKpis?.crm_overdue || 0) > 0 },
                  ]}
                  footer={moduleKpis?.pipeline_value != null ? `Pipeline: ${formatVND(moduleKpis.pipeline_value)}` : null}
                />
                <ModuleKpiGroup
                  title="Sản xuất"
                  icon={<Factory className="h-3.5 w-3.5" />}
                  tone="orange"
                  href="/sx"
                  items={[
                    { label: 'Đang SX', value: moduleKpis?.sx_active ?? '—' },
                    { label: 'Tiếp nhận', value: moduleKpis?.sx_intake ?? '—' },
                    { label: 'Quá hạn', value: moduleKpis?.sx_overdue ?? '—', alert: (moduleKpis?.sx_overdue || 0) > 0 },
                  ]}
                />
                <ModuleKpiGroup
                  title="VC / Lắp đặt"
                  icon={<Truck className="h-3.5 w-3.5" />}
                  tone="amber"
                  href="/vc"
                  items={[
                    { label: 'VC', value: moduleKpis?.vc_active ?? '—' },
                    { label: 'Lắp', value: moduleKpis?.install_active ?? '—' },
                    { label: 'VC trễ', value: moduleKpis?.vc_overdue ?? '—', alert: (moduleKpis?.vc_overdue || 0) > 0 },
                    { label: 'Lắp trễ', value: moduleKpis?.install_overdue ?? '—', alert: (moduleKpis?.install_overdue || 0) > 0 },
                  ]}
                />
                <ModuleKpiGroup
                  title="Nhiệm vụ"
                  icon={<CheckSquare className="h-3.5 w-3.5" />}
                  tone="sky"
                  href="/work/unified"
                  items={[
                    { label: 'Đang mở', value: moduleKpis?.open_tasks ?? '—' },
                    { label: 'Quá hạn', value: moduleKpis?.overdue_tasks ?? '—', alert: (moduleKpis?.overdue_tasks || 0) > 0 },
                    { label: 'Chưa hạn', value: kpi.noDeadline },
                  ]}
                />
              </div>
              <p className="text-[10px] text-slate-400 px-0.5">
                Số liệu CRM / SX / VC / Task lấy từ toàn hệ (theo công ty đang lọc). Khối Dự án theo danh sách đang hiển thị.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Bộ lọc — panel nổi kéo được (chuẩn CRM) */}
      {showAdvFilter && (
        <div
          ref={filterPanelRef}
          data-tour="projects-filter-panel"
          className="ui-solid-white fixed z-[75] max-sm:left-4 max-sm:right-4 max-sm:bottom-4 max-sm:top-auto w-[min(100vw-2rem,400px)] max-h-[min(calc(100vh-5rem),620px)] flex flex-col rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden animate-fade-in"
          style={filterPanelPos
            ? { left: filterPanelPos.x, top: filterPanelPos.y }
            : { top: '4.5rem', right: '1rem' }}
          role="region"
          aria-label="Bộ lọc dự án"
        >
          <div
            className="shrink-0 px-3 pt-2.5 pb-2 border-b border-gray-200 bg-white cursor-grab active:cursor-grabbing select-none"
            onMouseDown={beginFilterPanelDrag}
          >
            <div className="flex items-center gap-2">
              <GripVertical className="h-4 w-4 shrink-0 text-violet-400" title="Kéo để di chuyển" />
              <Filter className="h-4 w-4 shrink-0 text-violet-600" aria-hidden />
              <p className="text-sm font-bold text-violet-950 tracking-tight flex-1 min-w-0">Bộ lọc</p>
              <button
                type="button"
                data-tour="projects-filter-close"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={closeProjectsFilterPanel}
                className="h-7 w-7 rounded-md text-violet-500 hover:text-violet-800 hover:bg-violet-200/60 cursor-pointer flex items-center justify-center shrink-0 transition-colors"
                aria-label="Thu gọn bộ lọc"
                title="Thu gọn"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2.5 bg-white [scrollbar-width:thin] space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="min-w-0">
                <label className={SX_FILTER_LABEL_CLS}>Công ty</label>
                <select
                  value={filterCompany}
                  onChange={(e) => setFilterCompany(e.target.value)}
                  className={SX_FILTER_SELECT_CLS}
                >
                  <option value="all">Tất cả công ty</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
                  ))}
                </select>
              </div>
              <div className="min-w-0">
                <label className={SX_FILTER_LABEL_CLS}>Thời gian</label>
                <select
                  value={filterTime}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFilterTime(v);
                    if (v !== 'custom') { setDateFrom(''); setDateTo(''); }
                  }}
                  className={SX_FILTER_SELECT_CLS}
                >
                  {TIME_FILTERS.map((tf) => (
                    <option key={tf.id} value={tf.id}>{tf.label}</option>
                  ))}
                </select>
              </div>
              <div className="min-w-0">
                <label className={SX_FILTER_LABEL_CLS}>Khối</label>
                <select value={filterDivision} onChange={(e) => setFilterDivision(e.target.value)} className={SX_FILTER_SELECT_CLS}>
                  <option value="all">Tất cả khối</option>
                  {divisions.map((d) => <option key={d.id} value={d.id}>{d.icon || ''} {d.name}</option>)}
                </select>
              </div>
              <div className="min-w-0">
                <label className={SX_FILTER_LABEL_CLS}>Nhân viên</label>
                <select value={filterPerson} onChange={(e) => setFilterPerson(e.target.value)} className={SX_FILTER_SELECT_CLS}>
                  <option value="all">Tất cả NV</option>
                  {uniquePersons.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div className="min-w-0 sm:col-span-2">
                <label className={SX_FILTER_LABEL_CLS}>Khách hàng</label>
                <select value={filterCustomer} onChange={(e) => setFilterCustomer(e.target.value)} className={SX_FILTER_SELECT_CLS}>
                  <option value="all">Tất cả KH</option>
                  {uniqueCustomers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            {(filterTime === 'custom' || dateFrom || dateTo) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="min-w-0">
                  <label className={SX_FILTER_LABEL_CLS}>Từ ngày</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => { setDateFrom(e.target.value); setFilterTime('custom'); }}
                    className={SX_FILTER_FIELD_CLS}
                  />
                </div>
                <div className="min-w-0">
                  <label className={SX_FILTER_LABEL_CLS}>Đến ngày</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => { setDateTo(e.target.value); setFilterTime('custom'); }}
                    className={SX_FILTER_FIELD_CLS}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-gray-200 bg-white px-3 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={clearAllFilters}
                className="h-8 px-3 rounded-lg border border-violet-300 bg-white text-xs font-semibold text-violet-700 hover:bg-violet-100 cursor-pointer transition-colors inline-flex items-center gap-1 shadow-sm"
              >
                <RotateCcw className="h-3 w-3" />
                Đặt lại
              </button>
              {filterPanelPos && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterPanelPos(null);
                    storeProjectsFilterPanelPos(null);
                  }}
                  className="ml-auto h-8 px-2.5 rounded-lg text-[11px] font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-200/60 cursor-pointer transition-colors"
                >
                  Về mặc định
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200/90">
          <FolderKanban className="h-12 w-12 mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-400">{hasActiveFilters ? 'Không có dự án phù hợp' : 'Chưa có dự án nào'}</p>
          <button onClick={() => navigate('/projects/create')} className="mt-3 text-sm text-blue-600 font-medium cursor-pointer">+ Tạo dự án</button>
        </div>
      ) : viewMode === 'kanban' ? (
        /* KANBAN — cột = workflow_stages + kéo thả đổi stage */
        workflowStages.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-slate-200/90">
            <FolderKanban className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-500 mb-1">Chưa có giai đoạn workflow active</p>
            <button
              type="button"
              onClick={() => navigate('/workflow-settings')}
              className="mt-2 text-sm text-blue-600 font-medium cursor-pointer"
            >
              Cấu hình cột quy trình →
            </button>
          </div>
        ) : (
        <DragDropContext
          onDragStart={() => setKanbanDragging(true)}
          onDragEnd={(result) => {
            setKanbanDragging(false);
            onDragEnd(result);
          }}
        >
          <div
            ref={kanbanWrapRef}
            className={`relative min-h-[min(700px,calc(100vh-128px))] ${UI_KANBAN_FIXED_CLASS}`}
          >
            <KanbanBoardEdgeScrollChrome
              wrapRef={kanbanWrapRef}
              scrollRef={kanbanScrollRef}
              isDraggingCard={kanbanDragging}
              onNudgeLeft={() => nudgeKanban('left')}
              onNudgeRight={() => nudgeKanban('right')}
              leftTitle="Giữ chuột trên mép để cuộn chậm sang trái — bấm để cuộn nhanh — kéo thẻ tới mép để tự cuộn"
              rightTitle="Giữ chuột trên mép để cuộn chậm sang phải — bấm để cuộn nhanh — kéo thẻ tới mép để tự cuộn"
            />
            <div
              ref={kanbanScrollRef}
              className="flex gap-3 overflow-x-auto pb-3 px-1 [scrollbar-width:thin] [scrollbar-gutter:stable]"
            >
            {visibleKanbanColumns.map((col) => {
              const count = projectsByStage[col.id]?.length || 0;
              const colColor = col.color || '#6b7280';
              return (
                <div
                  key={col.id}
                  className="flex flex-col flex-shrink-0 w-[280px] sm:w-[300px] rounded-2xl border border-slate-200/90 bg-slate-50/80 overflow-hidden shadow-sm"
                >
                  <div
                    className="sticky top-0 z-10 px-3 py-2.5 bg-white/95 backdrop-blur border-b border-slate-100 flex items-center justify-between gap-2"
                    style={{ boxShadow: `inset 0 3px 0 0 ${colColor}` }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: colColor }}
                      />
                      <h3 className="text-[13px] font-bold text-slate-800 truncate">
                        {col.icon ? `${col.icon} ` : ''}{col.name}
                      </h3>
                    </div>
                    <span
                      className="text-[11px] font-bold tabular-nums px-2 py-0.5 rounded-full shrink-0"
                      style={{ backgroundColor: `${colColor}18`, color: colColor }}
                    >
                      {count}
                    </span>
                  </div>
                  <Droppable droppableId={String(col.id)}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex-1 p-2 space-y-2 overflow-y-auto transition-colors ${
                          snapshot.isDraggingOver ? 'bg-violet-50/80' : ''
                        }`}
                        style={{ minHeight: '180px', maxHeight: 'calc(100vh - 280px)' }}
                      >
                        {(projectsByStage[col.id] || []).map((proj, index) => (
                          <Draggable key={proj.id} draggableId={String(proj.id)} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={snapshot.isDragging ? 'shadow-xl rotate-1 z-50' : ''}
                              >
                                <ProjectCard proj={proj} />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                        {count === 0 && !snapshot.isDraggingOver && (
                          <div className="text-center py-10 text-[11px] text-slate-300 border border-dashed border-slate-200 rounded-xl bg-white/40">
                            Kéo dự án vào đây
                          </div>
                        )}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
            </div>
          </div>
        </DragDropContext>
        )

      ) : viewMode === 'deadline' ? (
        /* DEADLINE - Kanban theo hạn: Quá hạn / Hôm nay / Ngày mai / Tuần sau / Tháng sau */
        (() => {
          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
          const dayAfterTomorrow = new Date(tomorrow); dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
          const endOfNextWeek = new Date(today); endOfNextWeek.setDate(endOfNextWeek.getDate() + (7 - endOfNextWeek.getDay()) + 7);
          const endOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0);
          const getD = (p) => p.deadline || p.design_deadline || p.install_date || null;

          const DEADLINE_COLS = [
            { id: 'overdue', label: 'Quá hạn', color: '#EF4444', filter: (p) => { const d = getD(p); return d && new Date(d) < today && p.status !== 'completed'; } },
            { id: 'today', label: 'Hết hạn hôm nay', color: '#F97316', filter: (p) => { const d = getD(p); return d && new Date(d) >= today && new Date(d) < tomorrow; } },
            { id: 'tomorrow', label: 'Ngày mai', color: '#EAB308', filter: (p) => { const d = getD(p); return d && new Date(d) >= tomorrow && new Date(d) < dayAfterTomorrow; } },
            { id: 'next_week', label: 'Tuần sau', color: '#3B82F6', filter: (p) => { const d = getD(p); return d && new Date(d) >= dayAfterTomorrow && new Date(d) < endOfNextWeek; } },
            { id: 'next_month', label: 'Tháng sau', color: '#10B981', filter: (p) => { const d = getD(p); return d && new Date(d) >= endOfNextWeek && new Date(d) < endOfNextMonth; } },
            { id: 'later', label: 'Sau đó / Chưa có hạn', color: '#6B7280', filter: (p) => { const d = getD(p); return !d || new Date(d) >= endOfNextMonth; } },
          ];

          const deadlineData = {};
          DEADLINE_COLS.forEach(c => { deadlineData[c.id] = []; });
          filtered.forEach(proj => {
            let placed = false;
            for (const c of DEADLINE_COLS) { if (c.filter(proj)) { deadlineData[c.id].push(proj); placed = true; break; } }
            if (!placed) deadlineData['later'].push(proj);
          });

          return (
            <div className="flex gap-3 overflow-x-auto pb-4">
              {DEADLINE_COLS.map(col => (
                <div key={col.id} className="flex flex-col flex-shrink-0" style={{ width: '280px' }}>
                  <div className="rounded-t-xl p-3 border border-b-0 bg-white" style={{ borderTopColor: col.color, borderTopWidth: '4px' }}>
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-gray-900">{col.label}</h3>
                      <span className="text-xs text-gray-400 font-medium bg-gray-100 px-2 py-0.5 rounded-full">{deadlineData[col.id].length}</span>
                    </div>
                  </div>
                  <div className="flex-1 rounded-b-xl border p-2 space-y-2 bg-gray-50/50 overflow-y-auto" style={{ minHeight: '200px', maxHeight: '75vh' }}>
                    {deadlineData[col.id].map(proj => <ProjectCard key={proj.id} proj={proj} />)}
                    {deadlineData[col.id].length === 0 && <div className="text-center py-8 text-xs text-gray-300">Trống</div>}
                  </div>
                </div>
              ))}
            </div>
          );
        })()

      ) : viewMode === 'planner' ? (
        /* PLANNER - Bitrix-style: mỗi nhân viên 1 cột, kéo thả sắp xếp */
        plannerLoading ? (
          <div className="flex items-center justify-center py-16"><div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>
        ) : plannerColumns.length === 0 ? (
          <div className="text-center py-16">
            <User className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-400">Chưa có nhiệm vụ nào được phân công</p>
          </div>
        ) : (
          <DragDropContext onDragEnd={async (result) => {
            const { draggableId, source, destination } = result;
            if (!destination) return;
            const srcCol = source.droppableId;
            const dstCol = destination.droppableId;
            // Clone columns
            const newCols = plannerColumns.map(c => ({ ...c, tasks: [...c.tasks] }));
            const srcColData = newCols.find(c => c.user.id === srcCol);
            const dstColData = newCols.find(c => c.user.id === dstCol);
            if (!srcColData || !dstColData) return;
            // Remove from source
            const [moved] = srcColData.tasks.splice(source.index, 1);
            // Add to destination
            dstColData.tasks.splice(destination.index, 0, moved);
            setPlannerColumns(newCols);
            // Save order to backend
            try {
              if (srcCol === dstCol) {
                await api.put('/tasks/planner/reorder', { assignee_id: dstCol, new_order: dstColData.tasks.map(t => t.id) });
              } else {
                // Moved to different person
                await api.put('/tasks/planner/reorder', { task_id: draggableId, assignee_id: dstCol, new_order: dstColData.tasks.map(t => t.id) });
                if (srcColData.tasks.length > 0) {
                  await api.put('/tasks/planner/reorder', { assignee_id: srcCol, new_order: srcColData.tasks.map(t => t.id) });
                }
              }
            } catch { loadPlanner(); }
          }}>
            <div className="flex gap-3 overflow-x-auto pb-4">
              {plannerColumns.map(col => {
                const completedCount = col.tasks.filter(t => t.status === 'done' || t.status === 'completed').length;
                return (
                  <div key={col.user.id} className="flex flex-col flex-shrink-0" style={{ width: '300px' }}>
                    {/* Employee header */}
                    <div className="rounded-t-xl p-3 border border-b-0 bg-white" style={{ borderTopColor: '#3b82f6', borderTopWidth: '4px' }}>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: avatarColor(col.user.full_name) }}>
                          {getInitials(col.user.full_name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-bold text-gray-900 truncate">{col.user.full_name}</h3>
                          <p className="text-[10px] text-gray-400">{col.tasks.length} nhiệm vụ · {completedCount} xong</p>
                        </div>
                      </div>
                      {/* Progress bar */}
                      <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: col.tasks.length > 0 ? `${(completedCount / col.tasks.length) * 100}%` : '0%' }} />
                      </div>
                    </div>
                    <Droppable droppableId={col.user.id}>
                      {(provided, snapshot) => (
                        <div ref={provided.innerRef} {...provided.droppableProps}
                          className={`flex-1 rounded-b-xl border p-2 space-y-2 overflow-y-auto transition-colors ${snapshot.isDraggingOver ? 'bg-blue-50 border-blue-300' : 'bg-gray-50/50'}`}
                          style={{ minHeight: '200px', maxHeight: '75vh' }}>
                          {col.tasks.map((task, index) => {
                            const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done' && task.status !== 'completed';
                            return (
                              <Draggable key={task.id} draggableId={task.id} index={index}>
                                {(provided, snapshot) => (
                                  <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}
                                    className={`${snapshot.isDragging ? 'shadow-2xl rotate-1 z-50' : ''}`}>
                                    <Link to={task.project ? `/projects/${task.project.id}` : '#'}
                                      className={`block bg-white rounded-lg border p-3 hover:shadow-md transition-all group cursor-grab active:cursor-grabbing ${isOverdue ? 'border-red-200 bg-red-50/30' : 'border-gray-200'}`}>
                                      {/* Task title */}
                                      <h5 className="text-xs font-bold text-gray-900 mb-1 leading-snug">{task.title}</h5>
                                      {/* Project info or Personal badge */}
                                      {task.project ? (
                                        <p className="text-[10px] text-blue-600 font-medium mb-1 truncate">📋 {task.project.code} — {task.project.name}</p>
                                      ) : task.task_type === 'personal' ? (
                                        <p className="text-[10px] text-purple-600 font-medium mb-1">👤 Nhiệm vụ cá nhân</p>
                                      ) : null}
                                      {/* Status + Priority */}
                                      <div className="flex items-center gap-1 flex-wrap mb-1">
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${task.status === 'done' || task.status === 'completed' ? 'bg-green-100 text-green-700' : task.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                                          {task.status === 'done' || task.status === 'completed' ? '✅ Xong' : task.status === 'in_progress' ? '🔄 Đang làm' : '⏳ Chờ'}
                                        </span>
                                        {task.priority && (
                                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${task.priority === 'high' || task.priority === 'urgent' ? 'bg-red-100 text-red-700' : task.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>
                                            {task.priority === 'urgent' ? '🔥' : task.priority === 'high' ? '⬆️' : task.priority === 'medium' ? '➡️' : '⬇️'}
                                          </span>
                                        )}
                                      </div>
                                      {/* Due date */}
                                      {task.due_date && (
                                        <p className={`text-[10px] flex items-center gap-1 ${isOverdue ? 'text-red-600 font-bold' : 'text-gray-400'}`}>
                                          <Calendar className="h-2.5 w-2.5" />{formatDate(task.due_date)}
                                          {isOverdue && <span className="px-1 py-0.5 bg-red-100 rounded text-[8px] font-bold">TRỄ</span>}
                                        </p>
                                      )}
                                    </Link>
                                  </div>
                                )}
                              </Draggable>
                            );
                          })}
                          {provided.placeholder}
                          {col.tasks.length === 0 && !snapshot.isDraggingOver && (
                            <div className="text-center py-8 text-xs text-gray-300">Kéo nhiệm vụ vào đây</div>
                          )}
                        </div>
                      )}
                    </Droppable>
                  </div>
                );
              })}
            </div>
          </DragDropContext>
        )

      ) : viewMode === 'calendar' ? (
        /* CALENDAR — đủ thông tin: mã + tên + module + loại mốc */
        (() => {
          let calProjects = filtered;
          if (calendarEmployee !== 'all') {
            calProjects = filtered.filter((p) => {
              const pp = [
                p.sales_person_id, p.designer_id, p.project_manager_id, p.created_by,
                p.consulting_person_id, p.design_person_id, p.quotation_person_id,
                p.contract_person_id, p.production_person_id, p.shipping_person_id,
                p.installation_person_id, p.care_person_id, p.supervisor_id,
              ];
              if (pp.includes(calendarEmployee)) return true;
              return (taskAssigneeMap[p.id] || []).includes(calendarEmployee);
            });
          }

          const dayKey = (raw) => {
            if (!raw) return null;
            const s = String(raw);
            return s.length >= 10 ? s.substring(0, 10) : null;
          };

          /** Mốc trên ngày — ưu tiên schedule / dates đã enrich */
          const eventsOnDay = (dateStr) => {
            const out = [];
            for (const p of calProjects) {
              const dates = p.dates || {};
              const mods = p.modules || {};
              const moduleBits = [
                mods.crm?.active && 'CRM',
                mods.production?.active && 'SX',
                mods.logistics?.active && 'VC',
              ].filter(Boolean);
              if (!moduleBits.length) {
                if (p.company_id || p.sx_kanban_column_id) moduleBits.push('SX');
                if (p.logistics_company_id || p.vc_kanban_column_id) moduleBits.push('VC');
              }
              const person = mods.crm?.person?.full_name
                || mods.production?.person?.full_name
                || mods.logistics?.person?.full_name
                || p.sales_person?.full_name
                || p.production_person?.full_name
                || null;
              const stageName = p.current_stage?.name || STATUS_LABELS[p.status] || null;
              const stageColor = p.current_stage?.color || '#6366f1';

              const push = (kind, label, at, tone) => {
                if (dayKey(at) !== dateStr) return;
                out.push({
                  id: `${p.id}-${kind}`,
                  projectId: p.id,
                  code: p.code,
                  name: p.name,
                  kind,
                  label,
                  modules: moduleBits,
                  person,
                  stageName,
                  stageColor,
                  tone,
                  overdue: kind === 'deadline'
                    && dateStr < fmtD(new Date())
                    && p.status !== 'completed'
                    && p.status !== 'warranty',
                });
              };

              push('start', 'Bắt đầu', p.created_at, 'start');
              push('order', 'Đặt hàng', dates.order_date || p.order_date, 'order');
              push(
                'deadline',
                p.schedule?.label || 'Hạn',
                p.schedule?.at || dates.deadline || p.deadline || dates.design_deadline || p.design_deadline,
                'deadline',
              );
              push('delivery', 'Giao', dates.delivery_date || p.delivery_date || dates.production_deadline || p.production_deadline, 'delivery');
              push('install', 'Lắp', dates.install_date || p.install_date, 'install');
            }
            // Ưu tiên hạn / giao / lắp trước «đang chạy»
            const order = { deadline: 0, delivery: 1, install: 2, order: 3, start: 4 };
            out.sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9));
            return out;
          };

          const toneClass = (ev) => {
            if (ev.overdue) return 'bg-red-600 text-white border-red-700';
            if (ev.tone === 'deadline') return 'bg-violet-600 text-white border-violet-700';
            if (ev.tone === 'delivery') return 'bg-teal-600 text-white border-teal-700';
            if (ev.tone === 'install') return 'bg-sky-600 text-white border-sky-700';
            if (ev.tone === 'order') return 'bg-slate-700 text-white border-slate-800';
            return 'bg-blue-600 text-white border-blue-700';
          };

          const MAX_SHOW = 4;

          return (
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center justify-between mb-4">
            <button type="button" onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1))} className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"><ChevronLeft className="h-4 w-4" /></button>
            <div className="text-center">
              <h3 className="text-lg font-bold text-gray-900">
                {calMonth.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })}
              </h3>
              <select value={calendarEmployee} onChange={(e) => setCalendarEmployee(e.target.value)}
                className="mt-1 h-7 px-2 border rounded-lg text-xs bg-white cursor-pointer">
                <option value="all">👥 Tất cả nhân viên</option>
                {uniquePersons.map((u) => <option key={u.id} value={u.id}>👤 {u.name}</option>)}
              </select>
            </div>
            <button type="button" onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1))} className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-t-lg overflow-hidden">
            {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map((d) => (
              <div key={d} className="bg-gray-50 p-2 text-center text-xs font-bold text-gray-500">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-b-lg overflow-hidden">
            {calendarData.flat().map((cell, i) => {
              if (!cell) return <div key={i} className="bg-gray-50 min-h-[120px]" />;
              const isToday = cell.date === fmtD(new Date());
              const events = eventsOnDay(cell.date);
              const shown = events.slice(0, MAX_SHOW);
              const more = events.length - shown.length;
              return (
                <div
                  key={i}
                  className={`bg-white p-1.5 min-h-[120px] flex flex-col ${isToday ? 'ring-2 ring-inset ring-blue-400' : ''}`}
                >
                  <div className={`text-[11px] font-semibold mb-1 ${isToday ? 'text-blue-600 font-bold bg-blue-100 rounded-full w-6 h-6 flex items-center justify-center' : 'text-gray-500'}`}>
                    {cell.day}
                  </div>
                  <div className="space-y-1 flex-1">
                    {shown.map((ev) => (
                      <Link
                        key={ev.id}
                        to={`/projects/${ev.projectId}?tab=overview`}
                        className={`block rounded-md border px-1 py-0.5 hover:opacity-90 transition-opacity ${toneClass(ev)}`}
                        title={[
                          ev.code,
                          ev.name,
                          ev.label,
                          ev.stageName,
                          ev.modules.join(' · '),
                          ev.person,
                        ].filter(Boolean).join(' — ')}
                      >
                        <div className="flex items-center justify-between gap-0.5">
                          <span className="text-[9px] font-extrabold font-mono truncate">{ev.code}</span>
                          <span className="text-[8px] font-bold uppercase opacity-90 shrink-0">{ev.label}</span>
                        </div>
                        <p className="text-[9px] font-semibold leading-tight line-clamp-2 opacity-95">
                          {ev.name}
                        </p>
                        <div className="flex items-center gap-0.5 mt-0.5 flex-wrap">
                          {ev.modules.map((m) => (
                            <span
                              key={m}
                              className={`text-[7px] font-extrabold px-0.5 rounded ${
                                m === 'CRM' ? 'bg-emerald-100 text-emerald-800'
                                  : m === 'SX' ? 'bg-orange-100 text-orange-800'
                                    : 'bg-amber-100 text-amber-900'
                              }`}
                            >
                              {m}
                            </span>
                          ))}
                        </div>
                        {(ev.stageName || ev.person) && (
                          <p className="text-[8px] opacity-90 truncate mt-0.5">
                            {[ev.stageName, ev.person].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </Link>
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
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-600 inline-block" /> Bắt đầu</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-700 inline-block" /> Đặt hàng</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-violet-600 inline-block" /> Hạn</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-teal-600 inline-block" /> Giao</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-sky-600 inline-block" /> Lắp</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-600 inline-block" /> Quá hạn</span>
            <span className="text-slate-400">Hover thẻ để xem đủ · click mở dự án</span>
          </div>
        </div>
          );
        })()

      ) : viewMode === 'comments' ? (
        /* COMMENTS — tin nhắn trao đổi mới nhất */
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-gray-700">💬 Trao đổi mới nhất</h3>
          {latestComments.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-400">Chưa có trao đổi nào</div>
          ) : (
            latestComments.map(c => (
              <Link key={c.id} to={`/projects/${c.project_id}?tab=chat`}
                className="block bg-white rounded-xl border p-4 hover:shadow-md hover:border-blue-400 transition-all group">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: avatarColor(c.user?.full_name || 'U') }}>
                    {getInitials(c.user?.full_name || 'U')}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-bold text-gray-900">{c.user?.full_name || 'Unknown'}</span>
                      <span className="text-[10px] text-gray-400">{formatDate(c.created_at)}</span>
                    </div>
                    <p className="text-sm text-gray-700 line-clamp-2">{c.content}</p>
                    <p className="text-[10px] text-blue-600 font-medium mt-1 flex items-center gap-1">
                      📋 {c.project?.code} — {c.project?.name}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400 group-hover:text-blue-600">→</span>
                </div>
              </Link>
            ))
          )}
        </div>

      ) : (
        /* LIST VIEW */
        <div className="space-y-2">
          {filtered.map(p => (
            <Link to={`/projects/${p.id}`} key={p.id} className="block bg-white rounded-xl border p-4 hover:shadow-md transition-all group">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-sm font-bold text-blue-600">{p.code}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.status] || ''}`}>{STATUS_LABELS[p.status] || p.status}</span>
                    {p.priority && <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[p.priority]}`}>{PRIORITY_LABELS[p.priority]}</span>}
                  </div>
                  <h3 className="text-base font-bold text-gray-900 mb-1">{p.name}</h3>
                  <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                    {p.company && <span className="text-indigo-600 font-medium">🏢 {p.company.short_name || p.company.name}</span>}
                    {p.customers?.full_name && <span>👤 {p.customers.full_name}</span>}
                    {p.customers?.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{p.customers.phone}</span>}
                    {p.deadline && <span className={new Date(p.deadline) < new Date() && p.status !== 'completed' ? 'text-red-600 font-bold' : ''}><Calendar className="h-3 w-3 inline" /> {formatDate(p.deadline)}</span>}
                    {p.created_at && <span className="text-gray-400"><Calendar className="h-3 w-3 inline" /> {formatDate(p.created_at)}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0 flex items-start gap-2">
                  <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); pinToggle(p.id); }}
                    className={`p-1 rounded-lg cursor-pointer ${pinnedSet.has(p.id) ? 'bg-amber-100 text-amber-600' : 'text-gray-300 hover:bg-gray-100 hover:text-gray-500'}`}>
                    <Pin className="h-4 w-4" />
                  </button>
                  <p className="text-base font-bold text-gray-900">{formatVND(p.estimated_value)}</p>
                  <button onClick={(e) => deleteProject(e, p.id, p.code)}
                    className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-500 cursor-pointer">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ModuleKpiGroup({ title, icon, tone = 'violet', href, items = [], footer }) {
  const tones = {
    violet: { border: 'border-violet-200/90', head: 'bg-violet-50 text-violet-800', icon: 'text-violet-600' },
    emerald: { border: 'border-emerald-200/90', head: 'bg-emerald-50 text-emerald-800', icon: 'text-emerald-600' },
    orange: { border: 'border-orange-200/90', head: 'bg-orange-50 text-orange-800', icon: 'text-orange-600' },
    amber: { border: 'border-amber-200/90', head: 'bg-amber-50 text-amber-900', icon: 'text-amber-700' },
    sky: { border: 'border-sky-200/90', head: 'bg-sky-50 text-sky-800', icon: 'text-sky-600' },
  };
  const t = tones[tone] || tones.violet;
  return (
    <div className={`rounded-xl border ${t.border} bg-white shadow-sm overflow-hidden flex flex-col min-h-[96px]`}>
      <div className={`flex items-center justify-between gap-1 px-2.5 py-1.5 ${t.head}`}>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold">
          <span className={t.icon}>{icon}</span>
          {title}
        </span>
        {href && (
          <Link to={href} className="text-[10px] font-medium opacity-70 hover:opacity-100 hover:underline">
            Mở →
          </Link>
        )}
      </div>
      <div className="grid grid-cols-2 gap-px bg-slate-100/80 flex-1">
        {items.map((it) => (
          <div key={it.label} className="bg-white px-2 py-1.5 text-center">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 truncate">{it.label}</p>
            <p className={`text-sm font-bold tabular-nums leading-tight ${it.alert ? 'text-red-600' : 'text-slate-900'}`}>
              {typeof it.value === 'number' ? it.value.toLocaleString('vi-VN') : it.value}
            </p>
          </div>
        ))}
      </div>
      {footer && (
        <p className="px-2 py-1 text-[10px] text-slate-500 border-t border-slate-100 truncate" title={footer}>
          {footer}
        </p>
      )}
    </div>
  );
}
