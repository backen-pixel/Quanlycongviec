import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import api from '../lib/api';
import { Plus, Search, Settings, Phone, Calendar, FolderKanban, Trash2, Filter, X, Building2, User, List, CalendarClock, Pin, ChevronLeft, ChevronRight } from 'lucide-react';
import { togglePin, isPinned } from '../components/PinnedProjectsWidget';
import { STATUS_LABELS, STATUS_COLORS, PRIORITY_COLORS, PRIORITY_LABELS, formatVND, formatDate, getInitials, avatarColor } from '../lib/utils';
import { TourButton } from '../components/WebTour';
import { projectsTour } from '../lib/tourSteps';
import { useTour } from '../components/TourProvider';
import { createProjectTour } from '../lib/guidedTours';

const TIME_FILTERS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'today', label: 'Hôm nay' },
  { id: 'week', label: 'Tuần này' },
  { id: 'month', label: 'Tháng này' },
  { id: 'quarter', label: 'Quý này' },
  { id: 'custom', label: 'Tùy chọn' },
];

const STATUS_COLUMNS = [
  { id: 'pending', label: 'Đang chờ', color: '#6b7280', statuses: ['consulting', 'designing', 'quoting'] },
  { id: 'processing', label: 'Chờ xử lý', color: '#f59e0b', statuses: ['contract_signed'] },
  { id: 'working', label: 'Đang làm', color: '#3b82f6', statuses: ['producing', 'shipping', 'installing'] },
  { id: 'review', label: 'Chờ kiểm tra', color: '#8b5cf6', statuses: [] },
  { id: 'done', label: 'Hoàn thành', color: '#10b981', statuses: ['completed'] },
  { id: 'blocked', label: 'Bị chặn', color: '#ef4444', statuses: [] },
  { id: 'paused', label: 'Tạm hoãn', color: '#64748b', statuses: ['on_hold'] },
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
  const { startTour } = useTour();
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
  const [companies, setCompanies] = useState([]);
  const [allCompanies, setAllCompanies] = useState([]);
  const [companyEmployees, setCompanyEmployees] = useState([]);
  const [taskAssigneeMap, setTaskAssigneeMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [showAdvFilter, setShowAdvFilter] = useState(false);
  const [calMonth, setCalMonth] = useState(new Date());

  const pinToggle = (id) => { togglePin(id); setPinnedSet(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };

  useEffect(() => {
    const ids = JSON.parse(localStorage.getItem('tubep_pinned_projects') || '[]');
    setPinnedSet(new Set(ids));
  }, []);

  const load = () => {
    setLoading(true);
    api.get('/projects', { params: { search: search || undefined, limit: 500 } })
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
    if (!confirm(`Xóa dự án ${code}?`)) return;
    try { await api.delete(`/projects/${id}`); load(); } catch {}
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

  const overdueCount = filtered.filter(p => { const d = p.deadline || p.design_deadline; return d && new Date(d) < new Date() && p.status !== 'completed'; }).length;

  const TABS = [
    { id: 'list', label: 'List' },
    { id: 'kanban', label: 'Kanban' },
    { id: 'deadline', label: 'Deadline' },
    { id: 'planner', label: 'Planner' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'tasks', label: 'Task chats', badge: filtered.length, badgeColor: 'bg-red-500 text-white' },
    { id: 'overdue', label: 'Overdue', badge: overdueCount, badgeColor: 'bg-red-500 text-white' },
    { id: 'comments', label: 'Comments', badge: 0, badgeColor: 'bg-green-500 text-white' },
  ];

  // Drag-and-drop
  const onDragEnd = async (result) => {
    const { draggableId, source, destination } = result;
    if (!destination || (source.droppableId === destination.droppableId && source.index === destination.index)) return;
    const newColId = destination.droppableId;
    const col = STATUS_COLUMNS.find(c => c.id === newColId);
    const newStatus = col?.statuses?.[0] || newColId;
    setProjects(prev => prev.map(p => p.id === draggableId ? { ...p, status: newStatus } : p));
    try { await api.put(`/projects/${draggableId}`, { status: newStatus }); } catch { load(); }
  };

  // Kanban data
  const projectsByStatus = useMemo(() => {
    const data = {}; STATUS_COLUMNS.forEach(col => { data[col.id] = []; });
    filtered.forEach(proj => {
      const status = proj.status || 'consulting';
      let placed = false;
      STATUS_COLUMNS.forEach(col => { if (col.statuses.includes(status)) { data[col.id].push(proj); placed = true; } });
      if (!placed) data['pending'].push(proj);
    });
    return data;
  }, [filtered]);

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

  // Project card component
  const ProjectCard = ({ proj, isDraggable = false, dragProps = {} }) => (
    <Link to={`/projects/${proj.id}`} className="block bg-white rounded-xl border border-gray-200 p-4 hover:shadow-lg hover:border-blue-400 transition-all group" {...(isDraggable ? {} : {})}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-sm font-bold text-blue-600">{proj.code}</span>
        <div className="flex items-center gap-1">
          {proj.current_stage && <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: (proj.current_stage.color || '#666') + '20', color: proj.current_stage.color || '#666' }}>{proj.current_stage.name}</span>}
          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); pinToggle(proj.id); }}
            className={`p-0.5 rounded cursor-pointer ${pinnedSet.has(proj.id) ? 'text-amber-500' : 'text-gray-300 opacity-0 group-hover:opacity-100'}`}>
            <Pin className="h-3 w-3" />
          </button>
        </div>
      </div>
      <h4 className="text-sm font-bold text-gray-900 mb-2 leading-snug group-hover:text-blue-600">{proj.name}</h4>
      {proj.customers?.full_name && <p className="text-xs text-gray-500 mb-1 truncate">👤 {proj.customers.full_name}</p>}
      {proj.company && <p className="text-xs text-indigo-600 font-medium mb-1 truncate">🏢 {proj.company.short_name || proj.company.name}</p>}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
        {proj.deadline ? (
          <p className={`text-xs flex items-center gap-1 ${new Date(proj.deadline) < new Date() && proj.status !== 'completed' ? 'text-red-600 font-bold' : 'text-gray-400'}`}>
            <Calendar className="h-3 w-3" />{formatDate(proj.deadline)}
            {new Date(proj.deadline) < new Date() && proj.status !== 'completed' && <span className="px-1 py-0.5 bg-red-100 rounded text-[9px] font-bold">TRỄ</span>}
          </p>
        ) : <span />}
        {proj.estimated_value > 0 && <p className="text-xs font-bold text-green-600">{formatVND(proj.estimated_value)}</p>}
      </div>
    </Link>
  );

  return (
    <div className="space-y-4 max-w-full">
      {/* Dark gradient header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-blue-900 rounded-2xl p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <CalendarClock className="h-6 w-6" /> Dự Án
              <Settings className="h-4 w-4 text-gray-400 cursor-pointer hover:text-white" />
            </h1>
            <span className="text-sm text-gray-400">{filtered.length} dự án{hasActiveFilters ? ' (đã lọc)' : ''}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => startTour(createProjectTour)} className="h-8 px-3 text-xs font-medium text-blue-300 bg-white/10 hover:bg-white/20 rounded-lg flex items-center gap-1.5 cursor-pointer">🎓</button>
            <TourButton steps={projectsTour} />
            <button onClick={() => navigate('/projects/create')} className="h-9 px-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-bold flex items-center gap-1.5 cursor-pointer shadow-lg">
              <Plus className="h-4 w-4" /> Tạo dự án
            </button>
            <select value={filterPerson} onChange={e => setFilterPerson(e.target.value)} className="h-9 px-3 pr-8 bg-slate-700 text-white border-none rounded-lg text-sm cursor-pointer">
              <option value="all">Tất cả NV ({filtered.length})</option>
              {uniquePersons.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} placeholder="Tìm kiếm..." className="h-9 pl-10 pr-8 bg-slate-700/50 text-white placeholder-gray-400 border border-slate-600 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 w-48" />
              {search && <button onClick={() => { setSearch(''); setTimeout(load, 100); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white cursor-pointer"><X className="h-4 w-4" /></button>}
            </div>
            <button onClick={() => setShowAdvFilter(!showAdvFilter)}
              className={`h-9 px-3 rounded-lg text-sm font-medium flex items-center gap-1.5 cursor-pointer ${hasActiveFilters ? 'bg-blue-500/30 text-blue-300 border border-blue-400/50' : 'bg-white/10 text-gray-400 hover:text-white'}`}>
              <Filter className="h-3.5 w-3.5" /> {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
            </button>
          </div>
        </div>
        {/* Tab bar */}
        <div className="flex items-center gap-1 mt-4 overflow-x-auto">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setViewMode(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap cursor-pointer transition-all flex items-center gap-1.5 ${viewMode === tab.id ? 'bg-white/20 text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}>
              {tab.label}
              {tab.badge > 0 && <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${tab.badgeColor}`}>{tab.badge > 99 ? '99+' : tab.badge}</span>}
            </button>
          ))}
          <div className="flex-1" />
          <button className="text-xs text-gray-400 hover:text-white cursor-pointer whitespace-nowrap">Mark all as read</button>
        </div>
      </div>

      {/* Advanced filters */}
      {showAdvFilter && (
        <div data-tour="project-filters" className="bg-white rounded-xl border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Bộ lọc nâng cao</h3>
            {hasActiveFilters && (
              <button onClick={() => { setFilterTime('all'); setDateFrom(''); setDateTo(''); setFilterDivision('all'); setFilterCompany('all'); setFilterCustomer('all'); setFilterPerson('all'); }}
                className="text-xs text-red-500 hover:text-red-600 cursor-pointer flex items-center gap-1"><X className="h-3 w-3" /> Xóa bộ lọc</button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Thời gian</label>
              <select value={filterTime} onChange={e => { setFilterTime(e.target.value); if (e.target.value !== 'custom') { setDateFrom(''); setDateTo(''); } }} className="w-full h-8 px-2 border rounded-lg text-xs bg-white">
                {TIME_FILTERS.map(tf => <option key={tf.id} value={tf.id}>{tf.label}</option>)}
              </select>
              {(filterTime === 'custom' || dateFrom || dateTo) && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setFilterTime('custom'); }} className="flex-1 h-7 px-2 border rounded text-xs bg-white" />
                  <span className="text-xs text-gray-400">→</span>
                  <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setFilterTime('custom'); }} className="flex-1 h-7 px-2 border rounded text-xs bg-white" />
                </div>
              )}
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Khối</label>
              <select value={filterDivision} onChange={e => setFilterDivision(e.target.value)} className="w-full h-8 px-2 border rounded-lg text-xs bg-white">
                <option value="all">Tất cả khối</option>
                {divisions.map(d => <option key={d.id} value={d.id}>{d.icon || ''} {d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Công ty</label>
              <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)} className="w-full h-8 px-2 border rounded-lg text-xs bg-white">
                <option value="all">Tất cả công ty</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.short_name || c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Nhân viên</label>
              <select value={filterPerson} onChange={e => setFilterPerson(e.target.value)} className="w-full h-8 px-2 border rounded-lg text-xs bg-white">
                <option value="all">Tất cả NV</option>
                {uniquePersons.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Khách hàng</label>
              <select value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)} className="w-full h-8 px-2 border rounded-lg text-xs bg-white">
                <option value="all">Tất cả KH</option>
                {uniqueCustomers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <FolderKanban className="h-12 w-12 mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-400">{hasActiveFilters ? 'Không có dự án phù hợp' : 'Chưa có dự án nào'}</p>
          <button onClick={() => navigate('/projects/create')} className="mt-3 text-sm text-blue-600 font-medium cursor-pointer">+ Tạo dự án</button>
        </div>
      ) : viewMode === 'kanban' ? (
        /* KANBAN with drag-and-drop by status */
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-4">
            {STATUS_COLUMNS.map(col => (
              <div key={col.id} className="flex flex-col flex-shrink-0" style={{ width: '320px' }}>
                <div className="rounded-t-xl p-3 border border-b-0 bg-white" style={{ borderTopColor: col.color, borderTopWidth: '4px' }}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-gray-900">{col.label}</h3>
                    <span className="text-xs text-gray-400 font-medium bg-gray-100 px-2 py-0.5 rounded-full">{projectsByStatus[col.id].length}</span>
                  </div>
                </div>
                <Droppable droppableId={col.id}>
                  {(provided, snapshot) => (
                    <div ref={provided.innerRef} {...provided.droppableProps}
                      className={`flex-1 rounded-b-xl border p-2 space-y-2 overflow-y-auto transition-colors ${snapshot.isDraggingOver ? 'bg-blue-50 border-blue-300' : 'bg-gray-50/50'}`}
                      style={{ minHeight: '200px', maxHeight: '75vh' }}>
                      {projectsByStatus[col.id].map((proj, index) => (
                        <Draggable key={proj.id} draggableId={proj.id} index={index}>
                          {(provided, snapshot) => (
                            <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}
                              className={`${snapshot.isDragging ? 'shadow-2xl rotate-2 z-50' : ''}`}>
                              <ProjectCard proj={proj} />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                      {projectsByStatus[col.id].length === 0 && !snapshot.isDraggingOver && (
                        <div className="text-center py-8 text-xs text-gray-300">Kéo thả dự án vào đây</div>
                      )}
                    </div>
                  )}
                </Droppable>
              </div>
            ))}
          </div>
        </DragDropContext>

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
            { id: 'overdue', label: '🔴 Quá hạn', color: '#EF4444', filter: (p) => { const d = getD(p); return d && new Date(d) < today && p.status !== 'completed'; } },
            { id: 'today', label: '🟠 Hết hạn hôm nay', color: '#F97316', filter: (p) => { const d = getD(p); return d && new Date(d) >= today && new Date(d) < tomorrow; } },
            { id: 'tomorrow', label: '🟡 Ngày mai', color: '#EAB308', filter: (p) => { const d = getD(p); return d && new Date(d) >= tomorrow && new Date(d) < dayAfterTomorrow; } },
            { id: 'next_week', label: '🔵 Tuần sau', color: '#3B82F6', filter: (p) => { const d = getD(p); return d && new Date(d) >= dayAfterTomorrow && new Date(d) < endOfNextWeek; } },
            { id: 'next_month', label: '🟢 Tháng sau', color: '#10B981', filter: (p) => { const d = getD(p); return d && new Date(d) >= endOfNextWeek && new Date(d) < endOfNextMonth; } },
            { id: 'later', label: '⚪ Sau đó / Chưa có hạn', color: '#6B7280', filter: (p) => { const d = getD(p); return !d || new Date(d) >= endOfNextMonth; } },
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
        /* CALENDAR — hiện dự án dạng bar từ ngày tạo → deadline */
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1))} className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"><ChevronLeft className="h-4 w-4" /></button>
            <h3 className="text-lg font-bold text-gray-900">
              {calMonth.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })}
            </h3>
            <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1))} className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"><ChevronRight className="h-4 w-4" /></button>
          </div>
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-t-lg overflow-hidden">
            {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map(d => (
              <div key={d} className="bg-gray-50 p-2 text-center text-xs font-bold text-gray-500">{d}</div>
            ))}
          </div>
          {/* Calendar grid with project bars */}
          <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-b-lg overflow-hidden">
            {calendarData.flat().map((cell, i) => {
              if (!cell) return <div key={i} className="bg-gray-50 min-h-[90px]" />;
              const isToday = cell.date === fmtD(new Date());
              // Find projects that START on this day
              const starting = filtered.filter(p => p.created_at && p.created_at.startsWith(cell.date));
              // Find projects that are ACTIVE on this day (created before, deadline after)
              const active = filtered.filter(p => {
                const s = p.created_at?.substring(0, 10);
                const e = (p.deadline || p.design_deadline || '')?.substring(0, 10);
                return s && e && s < cell.date && e >= cell.date;
              });
              // Find projects that END on this day
              const ending = filtered.filter(p => {
                const e = (p.deadline || p.design_deadline || '')?.substring(0, 10);
                return e === cell.date;
              });
              return (
                <div key={i} className={`bg-white p-1 min-h-[90px] ${isToday ? 'ring-2 ring-inset ring-blue-400' : ''}`}>
                  <div className={`text-[10px] font-medium mb-0.5 ${isToday ? 'text-blue-600 font-bold bg-blue-100 rounded-full w-5 h-5 flex items-center justify-center' : 'text-gray-400'}`}>{cell.day}</div>
                  <div className="space-y-0.5">
                    {/* Starting projects: left-rounded bar */}
                    {starting.slice(0, 2).map(p => (
                      <Link key={`s-${p.id}`} to={`/projects/${p.id}`}
                        className="block text-[8px] px-1 py-0.5 rounded-l-full truncate font-medium hover:opacity-80"
                        style={{ backgroundColor: (p.current_stage?.color || '#3b82f6'), color: '#fff' }}
                        title={`${p.code} — Bắt đầu`}>
                        ▶ {p.code}
                      </Link>
                    ))}
                    {/* Active projects: full bar (no rounding) */}
                    {active.slice(0, 2).map(p => (
                      <Link key={`a-${p.id}`} to={`/projects/${p.id}`}
                        className="block text-[8px] px-1 py-0.5 truncate hover:opacity-80"
                        style={{ backgroundColor: (p.current_stage?.color || '#3b82f6') + '40', color: p.current_stage?.color || '#3b82f6' }}
                        title={p.code}>
                        {p.code}
                      </Link>
                    ))}
                    {/* Ending projects: right-rounded bar */}
                    {ending.slice(0, 2).map(p => {
                      const isOverdue = new Date(cell.date) < new Date() && p.status !== 'completed';
                      return (
                        <Link key={`e-${p.id}`} to={`/projects/${p.id}`}
                          className="block text-[8px] px-1 py-0.5 rounded-r-full truncate font-medium hover:opacity-80"
                          style={{ backgroundColor: isOverdue ? '#ef4444' : (p.current_stage?.color || '#3b82f6'), color: '#fff' }}
                          title={`${p.code} — Hết hạn`}>
                          {p.code} ■
                        </Link>
                      );
                    })}
                    {(starting.length + active.length + ending.length) > 6 && (
                      <div className="text-[8px] text-gray-400 text-center">+{starting.length + active.length + ending.length - 6}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 text-[10px] text-gray-500">
            <span className="flex items-center gap-1"><span className="w-4 h-2 rounded-l-full bg-blue-500 inline-block" /> Bắt đầu</span>
            <span className="flex items-center gap-1"><span className="w-4 h-2 bg-blue-200 inline-block" /> Đang chạy</span>
            <span className="flex items-center gap-1"><span className="w-4 h-2 rounded-r-full bg-blue-500 inline-block" /> Kết thúc</span>
            <span className="flex items-center gap-1"><span className="w-4 h-2 rounded-r-full bg-red-500 inline-block" /> Quá hạn</span>
          </div>
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
