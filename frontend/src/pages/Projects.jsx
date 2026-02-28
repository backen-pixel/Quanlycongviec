import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import ProjectCreateModal from '../components/ProjectCreateModal';
import { Plus, Search, Phone, MapPin, Calendar, FolderKanban, Trash2 } from 'lucide-react';
import { STATUS_LABELS, STATUS_COLORS, PRIORITY_COLORS, PRIORITY_LABELS, formatVND, formatDate } from '../lib/utils';

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/projects', { params: { status: filter, search: search || undefined } })
      .then(r => setProjects(r.data.projects || []))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, [filter]);

  const deleteProject = async (e, id, code) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Xóa dự án ${code}? Tất cả tasks sẽ bị xóa theo.`)) return;
    try {
      await api.delete(`/projects/${id}`);
      load();
    } catch { }
  };

  const statuses = ['all', 'consulting', 'designing', 'quoting', 'contract_signed', 'producing', 'installing', 'completed'];

  return (
    <div className="space-y-5 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dự Án</h1>
          <p className="text-sm text-gray-500 mt-0.5">Quản lý dự án nội thất tủ bếp</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="h-9 px-4 bg-[var(--color-primary-600)] text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-[var(--color-primary-700)] transition-colors cursor-pointer">
          <Plus className="h-4 w-4" /> Tạo dự án
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()}
            placeholder="Tìm theo mã, tên dự án..."
            className="w-full h-9 pl-10 pr-3 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-all"
          />
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 overflow-x-auto">
          {statuses.map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`h-8 px-3 rounded-md text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                filter === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {s === 'all' ? 'Tất cả' : STATUS_LABELS[s] || s}
            </button>
          ))}
        </div>
      </div>

      {/* Project list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <svg className="animate-spin h-6 w-6 text-gray-400" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
          </svg>
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16">
          <FolderKanban className="h-12 w-12 mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-400">Chưa có dự án nào</p>
          <button onClick={() => setShowCreate(true)} className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium cursor-pointer">
            + Tạo dự án đầu tiên
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {projects.map((p, i) => (
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
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    {p.company && <span className="flex items-center gap-1 text-indigo-600 font-medium">🏢 {p.company.short_name || p.company.name}</span>}
                    {p.customers?.full_name && <span>{p.customers.full_name}</span>}
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
