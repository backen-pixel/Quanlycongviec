import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { Plus, Search, Phone, MapPin } from 'lucide-react';
import { STATUS_LABELS, STATUS_COLORS, PRIORITY_COLORS, PRIORITY_LABELS, formatVND, formatDate } from '../lib/utils';

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get('/projects', { params: { status: filter, search: search || undefined } }).then(r => setProjects(r.data.projects || [])).finally(() => setLoading(false));
  };
  useEffect(load, [filter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Dự Án</h1><p className="text-gray-500 text-sm">Quản lý dự án nội thất tủ bếp</p></div>
        <button className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700"><Plus className="h-4 w-4" /> Tạo Dự Án</button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key==='Enter' && load()} placeholder="Tìm theo mã, tên..." className="w-full h-9 pl-10 pr-3 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex gap-1">
          {['all', 'consulting', 'designing', 'producing', 'installing', 'completed'].map(s => (
            <button key={s} onClick={() => setFilter(s)} className={`h-8 px-3 rounded-lg text-xs font-medium ${filter===s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {s === 'all' ? 'Tất cả' : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {loading ? <div className="text-center py-10 text-gray-400">Đang tải...</div> : (
        <div className="space-y-2">
          {projects.map(p => (
            <Link to={`/projects/${p.id}`} key={p.id} className="block bg-white rounded-xl border p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-blue-600">{p.code}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_COLORS[p.status]}`}>{STATUS_LABELS[p.status]}</span>
                    {p.priority && <span className={`text-[11px] px-2 py-0.5 rounded-full ${PRIORITY_COLORS[p.priority]}`}>{PRIORITY_LABELS[p.priority]}</span>}
                  </div>
                  <h3 className="text-sm font-semibold">{p.name}</h3>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    {p.customers?.full_name && <span>{p.customers.full_name}</span>}
                    {p.customers?.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{p.customers.phone}</span>}
                    {p.customers?.city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{p.customers.city}</span>}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-base font-bold">{p.estimated_value ? formatVND(p.estimated_value) : '-'}</p>
                  <p className="text-[11px] text-gray-400">{formatDate(p.created_at)}</p>
                </div>
              </div>
            </Link>
          ))}
          {!projects.length && <div className="text-center py-10 text-gray-400">Chưa có dự án nào</div>}
        </div>
      )}
    </div>
  );
}
