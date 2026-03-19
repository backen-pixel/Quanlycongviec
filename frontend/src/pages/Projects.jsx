import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Plus, Search, Phone, MapPin, Calendar, FolderKanban, Trash2, Filter, X, Building2, User, LayoutGrid, List, Clock, PlayCircle, CheckSquare, AlertCircle, CalendarClock, Pin } from 'lucide-react';
import { togglePin, isPinned } from '../components/PinnedProjectsWidget';
import { STATUS_LABELS, STATUS_COLORS, PRIORITY_COLORS, PRIORITY_LABELS, formatVND, formatDate, getInitials, avatarColor } from '../lib/utils';

const TIME_FILTERS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'today', label: 'Hôm nay' },
  { id: 'week', label: 'Tuần này' },
  { id: 'month', label: 'Tháng này' },
  { id: 'quarter', label: 'Quý này' },
  { id: 'custom', label: 'Tùy chọn' },
];

function fmtD(d) { return d.toISOString().slice(0,10); }
function defRange() { const n=new Date(); return { from: fmtD(new Date(n.getFullYear(),n.getMonth(),1)), to: fmtD(new Date(n.getFullYear(),n.getMonth()+1,0)) }; }

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

// Fallback stages (used if API hasn't loaded yet)
const DEFAULT_KANBAN_STAGES = [
  { slug: 'consulting', label: 'Tư vấn', color: '#8B5CF6', path: '/stage/consulting' },
  { slug: 'design', label: 'Thiết kế', color: '#EC4899', path: '/stage/design' },
  { slug: 'quotation', label: 'Báo giá', color: '#F59E0B', path: '/stage/quotation' },
  { slug: 'contract', label: 'Hợp đồng', color: '#10B981', path: '/stage/contract' },
  { slug: 'production', label: 'Sản xuất', color: '#F97316', path: '/stage/production' },
  { slug: 'shipping', label: 'Vận chuyển', color: '#06B6D4', path: '/stage/shipping' },
  { slug: 'installation', label: 'Lắp đặt', color: '#3B82F6', path: '/stage/installation' },
  { slug: 'customer-care', label: 'CSKH', color: '#EF4444', path: '/stage/customer-care' },
];

// Helper: get current_stage slug from project
function projStageSlug(p) {
  return p.current_stage?.slug || '';
}

export default function Projects() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('kanban'); // 'list' | 'kanban' | 'plan'
  const [pinnedSet, setPinnedSet] = useState(new Set());

  const pinToggle = (id) => { togglePin(id); setPinnedSet(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };

  useEffect(() => {
    const ids = JSON.parse(localStorage.getItem('tubep_pinned_projects') || '[]');
    setPinnedSet(new Set(ids));
  }, []);
  const [filterTime, setFilterTime] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterCustomer, setFilterCustomer] = useState('all');
  const [filterPerson, setFilterPerson] = useState('all');
  const [companies, setCompanies] = useState([]);
  const [companyEmployees, setCompanyEmployees] = useState([]);
  const [taskAssigneeMap, setTaskAssigneeMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [showAdvFilter, setShowAdvFilter] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/projects', { params: { search: search || undefined, limit: 500 } })
      .then(r => {
        setProjects(r.data.projects || []);
        // Load task assignee mapping: project_id → [user_id, ...]
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
              // Convert sets to arrays
              Object.keys(map).forEach(k => { map[k] = [...map[k]]; });
              setTaskAssigneeMap(map);
            })
            .catch(() => {});
        }
      })
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

    useEffect(() => {
    // Load companies
    api.get('/companies').then(r => setCompanies(r.data.companies || []))
      .catch(() => api.get('/companies/my/list').then(r => setCompanies(r.data.companies || [])).catch(() => {}));
  }, []);

  // Load employees when company filter changes
  useEffect(() => {
    if (filterCompany && filterCompany !== 'all') {
      api.get(`/companies/${filterCompany}/employees`)
        .then(r => setCompanyEmployees(r.data.employees || []))
        .catch(() => setCompanyEmployees([]));
    } else {
      setCompanyEmployees([]);
    }
    setFilterPerson('all'); // Reset person filter when company changes
  }, [filterCompany]);

  const deleteProject = async (e, id, code) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Xóa dự án ${code}? Tất cả tasks sẽ bị xóa theo.`)) return;
    try { await api.delete(`/projects/${id}`); load(); } catch { }
  };

  // Apply client-side filters
  let filtered = filterByTime(projects, filterTime, dateFrom, dateTo);
  if (filterCompany !== 'all') filtered = filtered.filter(p => p.company_id === filterCompany || p.company?.id === filterCompany);
  if (filterCustomer !== 'all') filtered = filtered.filter(p => p.customer_id === filterCustomer);
  if (filterPerson !== 'all') filtered = filtered.filter(p => {
    // Check project-level person fields
    const projectPersons = [
      p.sales_person_id, p.designer_id, p.project_manager_id,
      p.consulting_person_id, p.design_person_id, p.quotation_person_id,
      p.contract_person_id, p.production_person_id, p.shipping_person_id,
      p.installation_person_id, p.care_person_id, p.supervisor_id, p.created_by
    ];
    if (projectPersons.includes(filterPerson)) return true;
    // Check task assignees
    const assignees = taskAssigneeMap[p.id] || [];
    return assignees.includes(filterPerson);
  });

  // Extract unique customers and persons from projects for filter dropdowns
  const uniqueCustomers = [];
  const seenCust = new Set();
  projects.forEach(p => {
    if (p.customers?.id && !seenCust.has(p.customers.id)) {
      seenCust.add(p.customers.id);
      uniqueCustomers.push({ id: p.customers.id, name: p.customers.full_name });
    }
  });

  const uniquePersons = [];
  const seenPerson = new Set();
  if (companyEmployees.length > 0) {
    // When company is selected: show employees from that company
    companyEmployees.forEach(emp => {
      if (emp?.id && !seenPerson.has(emp.id)) {
        seenPerson.add(emp.id);
        uniquePersons.push({ id: emp.id, name: emp.full_name });
      }
    });
  } else {
    // No company selected: build from project person fields + task assignees
    projects.forEach(p => {
      [p.sales_person, p.designer, p.project_manager].forEach(per => {
        if (per?.id && !seenPerson.has(per.id)) {
          seenPerson.add(per.id);
          uniquePersons.push({ id: per.id, name: per.full_name });
        }
      });
    });
    // Also add unique assignees from tasks
    Object.values(taskAssigneeMap).forEach(assignees => {
      assignees.forEach(uid => {
        if (!seenPerson.has(uid)) {
          seenPerson.add(uid);
          // Try to find the name from projects data
          let name = null;
          for (const p of projects) {
            for (const per of [p.sales_person, p.designer, p.project_manager]) {
              if (per?.id === uid) { name = per.full_name; break; }
            }
            if (name) break;
          }
          uniquePersons.push({ id: uid, name: name || uid.slice(0, 8) + '...' });
        }
      });
    });
  }

  const hasActiveFilters = filterCompany !== 'all' || filterCustomer !== 'all' || filterPerson !== 'all' || filterTime !== 'all' || dateFrom || dateTo;

  return (
    <div className="space-y-5 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Dự Án</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">{filtered.length} dự án{hasActiveFilters ? ' (đã lọc)' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setViewMode('kanban')} className={`h-8 px-2.5 rounded-md flex items-center gap-1 text-xs font-medium cursor-pointer ${viewMode === 'kanban' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
              <LayoutGrid className="h-3.5 w-3.5" /> Kanban
            </button>
            <button onClick={() => setViewMode('list')} className={`h-8 px-2.5 rounded-md flex items-center gap-1 text-xs font-medium cursor-pointer ${viewMode === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
              <List className="h-3.5 w-3.5" /> Danh sách
            </button>
            <button onClick={() => setViewMode('plan')} className={`h-8 px-2.5 rounded-md flex items-center gap-1 text-xs font-medium cursor-pointer ${viewMode === 'plan' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
              <CalendarClock className="h-3.5 w-3.5" /> Kế hoạch
            </button>
          </div>
          <button onClick={() => navigate('/projects/create')}
            className="h-9 px-3 sm:px-4 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-blue-700 cursor-pointer">
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Tạo dự án</span>
          </button>
        </div>
      </div>

      {/* Search + Status */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()}
            placeholder="Tìm theo mã, tên dự án..."
            className="w-full h-9 pl-10 pr-3 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white" />
        </div>
        <button onClick={() => setShowAdvFilter(!showAdvFilter)}
          className={`h-9 px-3 rounded-lg text-sm font-medium flex items-center gap-1.5 cursor-pointer border ${hasActiveFilters ? 'bg-blue-50 border-blue-300 text-blue-600' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
          <Filter className="h-3.5 w-3.5" /> Bộ lọc
          {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-blue-500" />}
        </button>
      </div>

      {/* Advanced filters panel */}
      {showAdvFilter && (
        <div className="bg-white rounded-xl border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Bộ lọc nâng cao</h3>
            {hasActiveFilters && (
              <button onClick={() => { setFilterTime('all'); setDateFrom(''); setDateTo(''); setFilterCompany('all'); setFilterCustomer('all'); setFilterPerson('all'); }}
                className="text-xs text-red-500 hover:text-red-600 cursor-pointer flex items-center gap-1"><X className="h-3 w-3" /> Xóa bộ lọc</button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Time */}
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1"><Calendar className="h-3 w-3 inline mr-1" />Thời gian</label>
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
            {/* Company */}
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1"><Building2 className="h-3 w-3 inline mr-1" />Công ty</label>
              <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)} className="w-full h-8 px-2 border rounded-lg text-xs bg-white">
                <option value="all">Tất cả công ty</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.short_name || c.name}</option>)}
              </select>
            </div>
            {/* Customer */}
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1"><User className="h-3 w-3 inline mr-1" />Khách hàng</label>
              <select value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)} className="w-full h-8 px-2 border rounded-lg text-xs bg-white">
                <option value="all">Tất cả KH</option>
                {uniqueCustomers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            {/* Person */}
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1"><User className="h-3 w-3 inline mr-1" />NV chịu trách nhiệm</label>
              <select value={filterPerson} onChange={e => setFilterPerson(e.target.value)} className="w-full h-8 px-2 border rounded-lg text-xs bg-white">
                <option value="all">Tất cả NV</option>
                {uniquePersons.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Project views */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <svg className="animate-spin h-6 w-6 text-gray-400" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
          </svg>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <FolderKanban className="h-12 w-12 mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-400">{hasActiveFilters ? 'Không có dự án phù hợp' : 'Chưa có dự án nào'}</p>
          <button onClick={() => navigate('/projects/create')} className="mt-3 text-sm text-blue-600 font-medium cursor-pointer">+ Tạo dự án</button>
        </div>
      ) : viewMode === 'kanban' ? (
        /* PROJECT STATUS KANBAN */
        (() => {
          const STATUS_COLUMNS = [
            { id: 'pending', label: 'Đang chờ', color: '#6b7280', statuses: ['consulting', 'designing', 'quoting'] },
            { id: 'processing', label: 'Chờ xử lý', color: '#f59e0b', statuses: ['contract_signed'] },
            { id: 'working', label: 'Đang làm', color: '#3b82f6', statuses: ['producing', 'shipping', 'installing'] },
            { id: 'review', label: 'Chờ kiểm tra', color: '#8b5cf6', statuses: [] },
            { id: 'done', label: 'Hoàn thành', color: '#10b981', statuses: ['completed'] },
            { id: 'blocked', label: 'Bị chặn', color: '#ef4444', statuses: [] },
            { id: 'paused', label: 'Tạm hoãn', color: '#64748b', statuses: ['on_hold'] },
          ];
          const projectsByStatus = {};
          STATUS_COLUMNS.forEach(col => { projectsByStatus[col.id] = []; });
          filtered.forEach(proj => {
            const status = proj.status || 'consulting';
            let placed = false;
            STATUS_COLUMNS.forEach(col => {
              if (col.statuses.includes(status)) { projectsByStatus[col.id].push(proj); placed = true; }
            });
            if (!placed) projectsByStatus['pending'].push(proj);
          });
          return (
            <div className="flex gap-4 overflow-x-auto pb-4">
              {STATUS_COLUMNS.map(col => (
                <div key={col.id} className="flex flex-col flex-shrink-0" style={{ width: '360px' }}>
                  <div className="rounded-t-xl p-4 border border-b-0 bg-white" style={{ borderTopColor: col.color, borderTopWidth: '4px' }}>
                    <h3 className="text-base font-bold text-gray-900">{col.label}</h3>
                    <span className="text-sm text-gray-400">{projectsByStatus[col.id].length} dự án</span>
                  </div>
                  <div className="flex-1 rounded-b-xl border p-3 space-y-3 bg-gray-50/50 overflow-y-auto" style={{ height: '75vh' }}>
                    {projectsByStatus[col.id].map(proj => (
                      <Link to={`/projects/${proj.id}`} key={proj.id} className="block bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg hover:border-blue-400 transition-all group">
                        {/* Header: Code + Stage */}
                        <div className="flex items-start justify-between gap-2 mb-4">
                          <span className="text-base font-bold text-blue-600 flex-shrink-0">{proj.code}</span>
                          {proj.current_stage && (
                            <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ backgroundColor: proj.current_stage.color + '20', color: proj.current_stage.color }}>
                              {proj.current_stage.name}
                            </span>
                          )}
                        </div>
                        
                        {/* Project Name */}
                        <h3 className="text-lg font-bold text-gray-900 mb-4 leading-snug">{proj.name}</h3>
                        
                        {/* Customer */}
                        {proj.customers?.full_name && (
                          <div className="flex items-center gap-3 mb-3 p-2 rounded-lg bg-gray-50">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                              {proj.customers.full_name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-gray-900 truncate">{proj.customers.full_name}</p>
                              {proj.customers.phone && <p className="text-xs text-gray-500 mt-0.5">{proj.customers.phone}</p>}
                            </div>
                          </div>
                        )}
                        
                        {/* Company */}
                        {proj.company && (
                          <div className="flex items-center gap-2 mb-3 p-2.5 rounded-lg bg-indigo-50 border border-indigo-100">
                            <Building2 className="h-5 w-5 text-indigo-600 flex-shrink-0" />
                            <span className="text-sm font-bold text-indigo-900 truncate">{proj.company.short_name || proj.company.name}</span>
                          </div>
                        )}
                        
                        {/* Deadline */}
                        {proj.deadline && (
                          <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-orange-50 border border-orange-100">
                            <Calendar className="h-4 w-4 text-orange-600" />
                            <span className={`text-sm font-semibold ${new Date(proj.deadline) < new Date() ? 'text-red-600' : 'text-orange-900'}`}>
                              {formatDate(proj.deadline)}
                            </span>
                          </div>
                        )}
                        
                        {/* Responsible Person */}
                        {proj.responsible_person && (
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: avatarColor(proj.responsible_person.full_name) }}>
                              {getInitials(proj.responsible_person.full_name)}
                            </div>
                            <span className="text-sm font-medium text-gray-700 truncate">{proj.responsible_person.full_name}</span>
                          </div>
                        )}
                        
                        {/* Value */}
                        {proj.estimated_value && (
                          <div className="mt-4 pt-4 border-t border-gray-100">
                            <p className="text-base font-bold text-green-600">{formatVND(proj.estimated_value)}</p>
                          </div>
                        )}
                      </Link>
                    ))}
                    {projectsByStatus[col.id].length === 0 && <div className="text-center py-16 text-xs text-gray-300">Trống</div>}
                  </div>
                </div>
              ))}
            </div>
          );
        })()
      ) : viewMode === 'plan' ? (
        /* PLAN VIEW - Kanban theo deadline */
        (() => {
          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
          const endOfWeek = new Date(today); endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
          const endOfNextWeek = new Date(endOfWeek); endOfNextWeek.setDate(endOfNextWeek.getDate() + 7);

          const getDeadline = (p) => {
            return p.design_deadline || p.install_date || p.deadline || null;
          };

          const PLAN_COLUMNS = [
            { id: 'overdue', label: '🔴 Quá hạn', color: '#EF4444', filter: (p) => { const d = getDeadline(p); return d && new Date(d) < today && p.status !== 'completed' && p.status !== 'warranty'; } },
            { id: 'today', label: '🟠 Hạn hôm nay', color: '#F97316', filter: (p) => { const d = getDeadline(p); return d && new Date(d) >= today && new Date(d) < tomorrow; } },
            { id: 'this_week', label: '🟡 Hạn tuần này', color: '#EAB308', filter: (p) => { const d = getDeadline(p); return d && new Date(d) >= tomorrow && new Date(d) < endOfWeek; } },
            { id: 'next_week', label: '🔵 Hạn tuần sau', color: '#3B82F6', filter: (p) => { const d = getDeadline(p); return d && new Date(d) >= endOfWeek && new Date(d) < endOfNextWeek; } },
            { id: 'later', label: '⚪ Hạn sau đó', color: '#6B7280', filter: (p) => { const d = getDeadline(p); return (d && new Date(d) >= endOfNextWeek) || !d; } },
          ];

          const planData = {};
          PLAN_COLUMNS.forEach(col => { planData[col.id] = []; });
          filtered.forEach(proj => {
            let placed = false;
            for (const col of PLAN_COLUMNS) {
              if (col.filter(proj)) { planData[col.id].push(proj); placed = true; break; }
            }
            if (!placed) planData['later'].push(proj);
          });

          return (
            <div className="flex gap-4 overflow-x-auto pb-4">
              {PLAN_COLUMNS.map(col => (
                <div key={col.id} className="flex flex-col flex-shrink-0" style={{ width: '320px' }}>
                  <div className="rounded-t-xl p-4 border border-b-0 bg-white" style={{ borderTopColor: col.color, borderTopWidth: '4px' }}>
                    <h3 className="text-base font-bold text-gray-900">{col.label}</h3>
                    <span className="text-sm text-gray-400">{planData[col.id].length} dự án</span>
                  </div>
                  <div className="flex-1 rounded-b-xl border p-3 space-y-3 bg-gray-50/50 overflow-y-auto" style={{ height: '70vh' }}>
                    {planData[col.id].map(proj => {
                      const deadline = getDeadline(proj);
                      const isOverdue = deadline && new Date(deadline) < today && proj.status !== 'completed' && proj.status !== 'warranty';
                      return (
                        <Link to={`/projects/${proj.id}`} key={proj.id} className="block bg-white rounded-xl border border-gray-200 p-4 hover:shadow-lg hover:border-blue-400 transition-all group">
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <span className="text-sm font-bold text-blue-600">{proj.code}</span>
                            {proj.current_stage && (
                              <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: proj.current_stage.color + '20', color: proj.current_stage.color }}>
                                {proj.current_stage.name}
                              </span>
                            )}
                          </div>
                          <h4 className="text-sm font-bold text-gray-900 mb-2 group-hover:text-blue-600 leading-snug">{proj.name}</h4>
                          {proj.customers?.full_name && (
                            <p className="text-xs text-gray-500 mb-2 flex items-center gap-1"><User className="h-3 w-3" />{proj.customers.full_name}</p>
                          )}
                          {proj.company && (
                            <p className="text-xs text-indigo-600 font-medium mb-2 flex items-center gap-1"><Building2 className="h-3 w-3" />{proj.company.short_name || proj.company.name}</p>
                          )}
                          {deadline && (
                            <div className={`flex items-center gap-1.5 text-xs font-medium mt-2 pt-2 border-t border-gray-100 ${isOverdue ? 'text-red-600' : 'text-gray-500'}`}>
                              <Calendar className="h-3.5 w-3.5" />
                              <span>{formatDate(deadline)}</span>
                              {isOverdue && <span className="ml-1 px-1.5 py-0.5 bg-red-100 rounded text-[10px] font-bold">QUÁ HẠN</span>}
                            </div>
                          )}
                          {proj.estimated_value > 0 && (
                            <p className="text-sm font-bold text-green-600 mt-2">{formatVND(proj.estimated_value)}</p>
                          )}
                        </Link>
                      );
                    })}
                    {planData[col.id].length === 0 && <div className="text-center py-16 text-xs text-gray-300">Trống</div>}
                  </div>
                </div>
              ))}
            </div>
          );
        })()
      ) : (
        /* List view */
        <div className="grid gap-3">
          {filtered.map(p => (
            <Link to={`/projects/${p.id}`} key={p.id} className="bg-white rounded-xl border p-4 hover:shadow-md transition-all group">
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
                    {p.created_at && <span><Calendar className="h-3 w-3 inline" /> {formatDate(p.created_at)}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0 flex items-start gap-2">
                  <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); pinToggle(p.id); }}
                    className={`p-1 rounded-lg cursor-pointer transition-all ${pinnedSet.has(p.id) ? 'bg-amber-100 text-amber-600' : 'text-gray-300 hover:bg-gray-100 hover:text-gray-500'}`}
                    title={pinnedSet.has(p.id) ? 'Bỏ ghim' : 'Ghim'}>
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
