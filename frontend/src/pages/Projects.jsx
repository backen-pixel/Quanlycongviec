import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import ProjectCreateModal from '../components/ProjectCreateModal';
import { Plus, Search, Phone, MapPin, Calendar, FolderKanban, Trash2, Filter, X, Building2, User, LayoutGrid, List } from 'lucide-react';
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
  const [filterStage, setFilterStage] = useState('all'); // 'all' | stage slug
  const [viewMode, setViewMode] = useState('kanban');
  const [stageTasks, setStageTasks] = useState([]); // tasks for selected stage tab // 'list' | 'kanban'
  const [filterTime, setFilterTime] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterCustomer, setFilterCustomer] = useState('all');
  const [filterPerson, setFilterPerson] = useState('all');
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showAdvFilter, setShowAdvFilter] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/projects', { params: { search: search || undefined, limit: 500 } })
      .then(r => setProjects(r.data.projects || []))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  // Load stages from API (for dynamic workflow)
  const [stageMap, setStageMap] = useState({});
  const [KANBAN_STAGES, setKanbanStages] = useState(DEFAULT_KANBAN_STAGES);
  useEffect(() => {
    api.get('/users/stages').then(r => {
      const m = {};
      const stages = (r.data.stages || []).sort((a, b) => a.order_index - b.order_index);
      stages.forEach(s => { m[s.slug] = s; });
      setStageMap(m);
      if (stages.length > 0) {
        setKanbanStages(stages.map(s => ({
          slug: s.slug,
          label: s.name,
          color: s.color || '#3B82F6',
          path: `/stage/${s.slug}`,
          id: s.id,
        })));
      }
    }).catch(() => {});
  }, []);

  // Load tasks for specific stage tab
  useEffect(() => {
    if (filterStage === 'all') { setStageTasks([]); return; }
    const stage = stageMap[filterStage];
    if (!stage?.id) { setStageTasks([]); return; }
    api.get('/tasks', { params: { stage_id: stage.id, limit: 500 } })
      .then(r => setStageTasks(r.data.tasks || []))
      .catch(() => setStageTasks([]));
  }, [filterStage, stageMap]);
  useEffect(() => {
    // Load companies — try full list first (admin), fallback to my companies
    api.get('/companies').then(r => setCompanies(r.data.companies || []))
      .catch(() => api.get('/companies/my/list').then(r => setCompanies(r.data.companies || [])).catch(() => {}));
  }, []);

  const deleteProject = async (e, id, code) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Xóa dự án ${code}? Tất cả tasks sẽ bị xóa theo.`)) return;
    try { await api.delete(`/projects/${id}`); load(); } catch { }
  };

  const STAGE_TABS = useMemo(() => {
    const tabs = [{ id: 'all', label: 'Tất cả' }];
    KANBAN_STAGES.forEach(s => {
      tabs.push({ id: s.slug, label: s.label, color: s.color });
    });
    return tabs;
  }, [KANBAN_STAGES]);

  // Apply client-side filters
  let filtered = filterByTime(projects, filterTime, dateFrom, dateTo);
  // Filter by stage slug (using current_stage.slug)
  if (filterStage !== 'all') {
    filtered = filtered.filter(p => projStageSlug(p) === filterStage);
  }
  if (filterCompany !== 'all') filtered = filtered.filter(p => p.company_id === filterCompany);
  if (filterCustomer !== 'all') filtered = filtered.filter(p => p.customer_id === filterCustomer);
  if (filterPerson !== 'all') filtered = filtered.filter(p =>
    p.sales_person_id === filterPerson || p.designer_id === filterPerson || p.project_manager_id === filterPerson
  );

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
  projects.forEach(p => {
    [p.sales_person, p.designer, p.project_manager].forEach(per => {
      if (per?.id && !seenPerson.has(per.id)) {
        seenPerson.add(per.id);
        uniquePersons.push({ id: per.id, name: per.full_name });
      }
    });
  });

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
          </div>
          <button onClick={() => setShowCreate(true)}
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

      {/* Stage tabs */}
      <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5 overflow-x-auto no-scrollbar">
        {STAGE_TABS.map(s => {
          const count = s.id === 'all' ? filtered.length : filtered.filter(p => projStageSlug(p) === s.id).length;
          return (
            <button key={s.id} onClick={() => setFilterStage(s.id)}
              className={`h-8 px-2.5 sm:px-3 rounded-md text-[11px] sm:text-xs font-medium transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                filterStage === s.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {s.color && <span className="w-1.5 h-1.5 rounded-full hidden sm:inline-block" style={{ backgroundColor: s.color }} />}
              {s.label}
              {count > 0 && <span className="text-[9px] bg-gray-200 text-gray-600 px-1 rounded-full">{count}</span>}
            </button>
          );
        })}
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
          <button onClick={() => setShowCreate(true)} className="mt-3 text-sm text-blue-600 font-medium cursor-pointer">+ Tạo dự án</button>
        </div>
      ) : filterStage === 'all' ? (
        /* ═══ TAB TẤT CẢ: Kanban overview / List ═══ */
        viewMode === 'kanban' ? (
          <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: '400px' }}>
            {KANBAN_STAGES.map(stage => {
              const stageProjects = filtered.filter(p => projStageSlug(p) === stage.slug);
              return (
                <div key={stage.slug} className="shrink-0 w-60 sm:w-72 flex flex-col">
                  <div className="rounded-t-xl p-2.5 sm:p-3 border border-b-0 flex items-center gap-2" style={{ backgroundColor: stage.color + '15', borderColor: stage.color + '30' }}>
                    <div className="w-2 h-8 rounded-full" style={{ backgroundColor: stage.color }} />
                    <div className="flex-1 min-w-0">
                      <Link to={stage.path} className="text-xs sm:text-sm font-bold text-gray-900 hover:text-blue-600">{stage.label}</Link>
                      <p className="text-[10px] text-gray-500">{stageProjects.length} DA</p>
                    </div>
                    <span className="text-lg font-bold" style={{ color: stage.color }}>{stageProjects.length}</span>
                  </div>
                  <div className="flex-1 rounded-b-xl border p-2 space-y-2 bg-gray-50/50 overflow-y-auto max-h-[65vh]" style={{ borderColor: stage.color + '30' }}>
                    {stageProjects.length > 0 ? stageProjects.map(p => (
                      <Link to={`/projects/${p.id}`} key={p.id}
                        className="block bg-white rounded-lg border p-3 hover:shadow-md hover:border-blue-300 transition-all">
                        <h3 className="text-sm sm:text-base font-bold text-gray-900 leading-tight mb-1">{p.name}</h3>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-xs font-bold text-blue-600">{p.code}</span>
                          {p.priority && <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${PRIORITY_COLORS[p.priority]}`}>{PRIORITY_LABELS[p.priority]}</span>}
                        </div>
                        {p.customers?.full_name && <p className="text-xs text-gray-600">👤 {p.customers.full_name}</p>}
                        {p.company && <p className="text-[10px] text-indigo-600 font-medium">🏢 {p.company.short_name || p.company.name}</p>}
                        {p.estimated_value && <p className="text-xs font-bold text-emerald-600 mt-1">{formatVND(p.estimated_value)}</p>}
                      </Link>
                    )) : (
                      <div className="flex items-center justify-center h-16 text-xs text-gray-400">Trống</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List view for Tất cả */
          <div className="grid gap-3">
            {filtered.map((p, i) => (
              <Link to={`/projects/${p.id}`} key={p.id}
                className="bg-white rounded-xl border p-4 sm:p-5 hover:shadow-md hover:border-gray-300 transition-all group">
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
        )
      ) : (
        /* ═══ TAB QUY TRÌNH CỤ THỂ: cột = nhiệm vụ (gộp cùng tên), thẻ = DA ═══ */
        (() => {
          const currentStage = KANBAN_STAGES.find(s => s.slug === filterStage);
          const stageProjects = filtered.filter(p => projStageSlug(p) === filterStage);
          const projMap = {};
          stageProjects.forEach(p => { projMap[p.id] = p; });

          // Count how many projects have each task title
          const titleProjCount = {}; // { title: Set<projectId> }
          stageTasks.forEach(t => {
            if (!t.project_id) return;
            if (!titleProjCount[t.title]) titleProjCount[t.title] = new Set();
            titleProjCount[t.title].add(t.project_id);
          });

          // Template tasks = title appears in >= 40% of projects with tasks
          const projsWithTasks = new Set(stageTasks.map(t => t.project_id));
          const totalWithTasks = projsWithTasks.size || 1;
          const templateTitles = new Set();
          Object.entries(titleProjCount).forEach(([title, pids]) => {
            if (pids.size >= totalWithTasks * 0.4) templateTitles.add(title);
          });

          // Build columns: group tasks by title
          const colMap = {}; // { title: { title, tasks: [], isTemplate, projectIds: Set } }
          stageTasks.forEach(t => {
            const key = t.title || 'Khác';
            if (!colMap[key]) colMap[key] = { title: key, tasks: [], isTemplate: templateTitles.has(key), projectIds: new Set() };
            colMap[key].tasks.push(t);
            if (t.project_id) colMap[key].projectIds.add(t.project_id);
          });

          // Sort: template columns first (by frequency desc), then custom columns
          const columns = Object.values(colMap).sort((a, b) => {
            if (a.isTemplate !== b.isTemplate) return a.isTemplate ? -1 : 1;
            return b.projectIds.size - a.projectIds.size;
          });

          // Orphan projects
          const orphanProjects = stageProjects.filter(p => !projsWithTasks.has(p.id));

          return (
            <div className="space-y-3">
              {/* Stage header */}
              <div className="flex items-center gap-3">
                <div className="w-3 h-10 rounded-full" style={{ backgroundColor: currentStage?.color || '#3b82f6' }} />
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{currentStage?.label || filterStage}</h2>
                  <p className="text-xs text-gray-500">{stageProjects.length} dự án · {stageTasks.length} nhiệm vụ · {columns.filter(c => c.isTemplate).length} NV mẫu</p>
                </div>
                <Link to={currentStage?.path || '#'} className="ml-auto h-8 px-3 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium flex items-center gap-1 hover:bg-blue-100 cursor-pointer">
                  Mở quy trình →
                </Link>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 text-[10px] text-gray-500">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: currentStage?.color || '#3b82f6' }} /> NV mẫu</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-400" /> NV thêm riêng</span>
              </div>

              {columns.length > 0 || orphanProjects.length > 0 ? (
                <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: '300px' }}>
                  {columns.map((col, ci) => {
                    const colColor = col.isTemplate ? (currentStage?.color || '#3b82f6') : '#f59e0b';
                    const uniqueProjects = [...col.projectIds].map(pid => projMap[pid]).filter(Boolean);
                    const doneCount = col.tasks.filter(t => t.status === 'done').length;
                    return (
                      <div key={ci} className="shrink-0 w-64 sm:w-72 flex flex-col">
                        {/* Column header = task name */}
                        <div className="rounded-t-xl p-3 border border-b-0 flex items-center gap-2" style={{ backgroundColor: colColor + '12', borderColor: colColor + '30' }}>
                          <div className="w-1.5 h-7 rounded-full" style={{ backgroundColor: colColor }} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <h3 className="text-sm font-bold text-gray-900 truncate">{col.title}</h3>
                              {!col.isTemplate && <span className="text-[8px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium shrink-0">thêm</span>}
                            </div>
                            <p className="text-[10px] text-gray-500">{uniqueProjects.length} DA · {doneCount}/{col.tasks.length} xong</p>
                          </div>
                        </div>
                        {/* Cards = projects */}
                        <div className="flex-1 rounded-b-xl border p-2 space-y-2 overflow-y-auto max-h-[60vh]" style={{ borderColor: colColor + '30', backgroundColor: colColor + '05' }}>
                          {uniqueProjects.length > 0 ? uniqueProjects.map(p => {
                            const pTask = col.tasks.find(t => t.project_id === p.id);
                            return (
                              <Link to={`/projects/${p.id}`} key={p.id}
                                className="block bg-white rounded-lg border border-gray-200 p-3 hover:shadow-md hover:border-blue-300 transition-all">
                                <h4 className="text-sm sm:text-base font-bold text-gray-900 leading-tight mb-1">{p.name}</h4>
                                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                  <span className="text-xs font-bold text-blue-600">{p.code}</span>
                                  {pTask && <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                                    pTask.status === 'done' ? 'bg-emerald-100 text-emerald-700' :
                                    pTask.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                                  }`}>{pTask.status === 'done' ? '✓ Xong' : pTask.status === 'in_progress' ? '▶ Đang làm' : '⏳ Chờ'}</span>}
                                </div>
                                {p.customers?.full_name && <p className="text-xs text-gray-600">👤 {p.customers.full_name}</p>}
                                {pTask?.assignee && (
                                  <div className="flex items-center gap-1.5 mt-1.5">
                                    <div className="h-5 w-5 rounded-full flex items-center justify-center text-white text-[7px] font-bold"
                                      style={{ backgroundColor: avatarColor(pTask.assignee.full_name) }}>{getInitials(pTask.assignee.full_name)}</div>
                                    <span className="text-[10px] text-gray-500">{pTask.assignee.full_name}</span>
                                  </div>
                                )}
                              </Link>
                            );
                          }) : (
                            <div className="flex items-center justify-center h-12 text-xs text-gray-400">Trống</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {/* Orphan column */}
                  {orphanProjects.length > 0 && (
                    <div className="shrink-0 w-64 sm:w-72 flex flex-col">
                      <div className="rounded-t-xl p-3 border border-b-0 bg-gray-50" style={{ borderColor: '#d1d5db' }}>
                        <h3 className="text-sm font-bold text-gray-500">Chưa có nhiệm vụ</h3>
                        <p className="text-[10px] text-gray-400">{orphanProjects.length} DA</p>
                      </div>
                      <div className="flex-1 rounded-b-xl border p-2 space-y-2 bg-gray-50/50 overflow-y-auto max-h-[60vh]" style={{ borderColor: '#d1d5db' }}>
                        {orphanProjects.map(p => (
                          <Link to={`/projects/${p.id}`} key={p.id}
                            className="block bg-white rounded-lg border p-3 hover:shadow-md transition-all">
                            <h4 className="text-sm font-bold text-gray-900 mb-0.5">{p.name}</h4>
                            <span className="text-xs text-blue-600 font-bold">{p.code}</span>
                            {p.customers?.full_name && <p className="text-xs text-gray-500 mt-0.5">👤 {p.customers.full_name}</p>}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-10 text-gray-400">
                  <p className="text-sm">Chưa có nhiệm vụ nào cho quy trình này</p>
                  <Link to={currentStage?.path || '#'} className="mt-2 inline-block text-sm text-blue-600 font-medium">Mở quy trình để tạo →</Link>
                </div>
              )}
            </div>
          );
        })()
      )}

      <ProjectCreateModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={load} />
    </div>
  );
}
