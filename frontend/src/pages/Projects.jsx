import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import ProjectCreateModal from '../components/ProjectCreateModal';
import { Plus, Search, Phone, MapPin, Calendar, FolderKanban, Trash2, Filter, X, Building2, User } from 'lucide-react';
import { STATUS_LABELS, STATUS_COLORS, PRIORITY_COLORS, PRIORITY_LABELS, formatVND, formatDate } from '../lib/utils';

const TIME_FILTERS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'today', label: 'Hôm nay' },
  { id: 'week', label: 'Tuần này' },
  { id: 'month', label: 'Tháng này' },
  { id: 'quarter', label: 'Quý này' },
  { id: 'year', label: 'Năm nay' },
];

function filterByTime(items, tf) {
  if (tf === 'all') return items;
  const now = new Date(), start = new Date();
  if (tf === 'today') start.setHours(0,0,0,0);
  else if (tf === 'week') { start.setDate(now.getDate()-now.getDay()); start.setHours(0,0,0,0); }
  else if (tf === 'month') { start.setDate(1); start.setHours(0,0,0,0); }
  else if (tf === 'quarter') { start.setMonth(Math.floor(now.getMonth()/3)*3,1); start.setHours(0,0,0,0); }
  else if (tf === 'year') { start.setMonth(0,1); start.setHours(0,0,0,0); }
  return items.filter(i => { const d = i.created_at ? new Date(i.created_at) : null; return d && d >= start; });
}

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterTime, setFilterTime] = useState('all');
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterCustomer, setFilterCustomer] = useState('all');
  const [filterPerson, setFilterPerson] = useState('all');
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showAdvFilter, setShowAdvFilter] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/projects', { params: { status: filterStatus, search: search || undefined, limit: 200 } })
      .then(r => setProjects(r.data.projects || []))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, [filterStatus]);
  useEffect(() => {
    api.get('/companies/my/list').then(r => setCompanies(r.data.companies || [])).catch(() => {});
  }, []);

  const deleteProject = async (e, id, code) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Xóa dự án ${code}? Tất cả tasks sẽ bị xóa theo.`)) return;
    try { await api.delete(`/projects/${id}`); load(); } catch { }
  };

  const statuses = ['all', 'consulting', 'designing', 'quoting', 'contract_signed', 'producing', 'installing', 'completed'];

  // Apply client-side filters
  let filtered = filterByTime(projects, filterTime);
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

  const hasActiveFilters = filterCompany !== 'all' || filterCustomer !== 'all' || filterPerson !== 'all' || filterTime !== 'all';

  return (
    <div className="space-y-5 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dự Án</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filtered.length} dự án{hasActiveFilters ? ' (đã lọc)' : ''}
          </p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="h-9 px-4 bg-[var(--color-primary-600)] text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-[var(--color-primary-700)] transition-colors cursor-pointer">
          <Plus className="h-4 w-4" /> Tạo dự án
        </button>
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

      {/* Status tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 overflow-x-auto">
        {statuses.map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`h-8 px-3 rounded-md text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
              filterStatus === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {s === 'all' ? 'Tất cả' : STATUS_LABELS[s] || s}
          </button>
        ))}
      </div>

      {/* Advanced filters panel */}
      {showAdvFilter && (
        <div className="bg-white rounded-xl border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Bộ lọc nâng cao</h3>
            {hasActiveFilters && (
              <button onClick={() => { setFilterTime('all'); setFilterCompany('all'); setFilterCustomer('all'); setFilterPerson('all'); }}
                className="text-xs text-red-500 hover:text-red-600 cursor-pointer flex items-center gap-1"><X className="h-3 w-3" /> Xóa bộ lọc</button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Time */}
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1"><Calendar className="h-3 w-3 inline mr-1" />Thời gian</label>
              <select value={filterTime} onChange={e => setFilterTime(e.target.value)} className="w-full h-8 px-2 border rounded-lg text-xs bg-white">
                {TIME_FILTERS.map(tf => <option key={tf.id} value={tf.id}>{tf.label}</option>)}
              </select>
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

      {/* Project list */}
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
          <p className="text-sm text-gray-400">{hasActiveFilters ? 'Không có dự án phù hợp bộ lọc' : 'Chưa có dự án nào'}</p>
          {hasActiveFilters && (
            <button onClick={() => { setFilterTime('all'); setFilterCompany('all'); setFilterCustomer('all'); setFilterPerson('all'); }}
              className="mt-2 text-xs text-blue-600 hover:text-blue-700 cursor-pointer">Xóa bộ lọc</button>
          )}
          <button onClick={() => setShowCreate(true)} className="mt-3 block mx-auto text-sm text-blue-600 hover:text-blue-700 font-medium cursor-pointer">
            + Tạo dự án
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((p, i) => (
            <Link to={`/projects/${p.id}`} key={p.id}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-gray-300 transition-all animate-fade-in group"
              style={{ animationDelay: `${i * 30}ms` }}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-sm font-bold text-blue-600">{p.code}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.status] || ''}`}>
                      {STATUS_LABELS[p.status] || p.status}
                    </span>
                    {p.priority && (
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[p.priority] || ''}`}>
                        {PRIORITY_LABELS[p.priority]}
                      </span>
                    )}
                    {p.current_stage && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full text-white font-medium" style={{ backgroundColor: p.current_stage.color }}>
                        {p.current_stage.name}
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">{p.name}</h3>
                  <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                    {p.company && <span className="flex items-center gap-1 text-indigo-600 font-medium">🏢 {p.company.short_name || p.company.name}</span>}
                    {p.customers?.full_name && <span>👤 {p.customers.full_name}</span>}
                    {p.customers?.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{p.customers.phone}</span>}
                    {p.created_at && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(p.created_at)}</span>}
                    {p.sales_person && <span>Sales: {p.sales_person.full_name}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0 flex items-start gap-2">
                  <p className="text-base font-bold text-gray-900">{formatVND(p.estimated_value)}</p>
                  <button onClick={(e) => deleteProject(e, p.id, p.code)}
                    className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-500 cursor-pointer transition-all">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <ProjectCreateModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={load} />
    </div>
  );
}
