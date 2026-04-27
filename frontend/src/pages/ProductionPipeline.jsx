import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { formatVND, formatDate, getInitials, avatarColor } from '../lib/utils';
import { Search, Filter, FolderKanban } from 'lucide-react';

const DEFAULT_STAGES = [
  { slug: 'production', name: 'Sản xuất', color: '#EA580C', icon: '🏭' },
  { slug: 'delivery', name: 'VC & Lắp đặt', color: '#F97316', icon: '🚚' },
  { slug: 'customer-care', name: 'CSKH', color: '#FDBA74', icon: '🤝' },
];

export default function ProductionPipeline() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/production/dashboard');
      setProjects(data.projects || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const grouped = {};
  DEFAULT_STAGES.forEach(s => { grouped[s.slug] = []; });
  projects.forEach(p => {
    const slug = p.current_stage?.slug || 'production';
    if (grouped[slug]) grouped[slug].push(p);
    else grouped['production'].push(p);
  });

  // Apply search filter
  const matchSearch = (p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (p.name || '').toLowerCase().includes(q) ||
      (p.code || '').toLowerCase().includes(q) ||
      (p.customer_name || '').toLowerCase().includes(q);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-10 w-10 border-4 border-orange-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 space-y-6">
      <div>
        <p className="text-xs text-gray-500 font-semibold">XƯỞNG / Pipeline sản xuất</p>
        <h1 className="text-2xl font-bold text-gray-900">Pipeline sản xuất</h1>
        <p className="text-sm text-gray-500 mt-1">Kanban theo giai đoạn sản xuất — kéo thả sắp tới</p>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm deal, mã dự án, khách hàng..."
          className="w-full h-10 pl-10 pr-4 border border-gray-200 rounded-lg text-sm"
        />
      </div>

      {/* Kanban Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {DEFAULT_STAGES.map(stage => {
          const items = (grouped[stage.slug] || []).filter(matchSearch);
          return (
            <div key={stage.slug} className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderTopColor: stage.color, borderTopWidth: 3 }}>
                <span className="text-lg">{stage.icon}</span>
                <h3 className="font-semibold text-gray-900">{stage.name}</h3>
                <span className="ml-auto text-xs font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{items.length}</span>
              </div>
              <div className="p-3 space-y-2 max-h-[600px] overflow-y-auto">
                {items.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 py-6">Trống</p>
                ) : items.map(p => (
                  <Link key={p.id} to={`/sx/projects/${p.id}`}
                    className="block rounded-lg border border-gray-200 p-3 hover:border-orange-300 hover:shadow-sm transition">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">{p.code}</span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        p.priority === 'high' ? 'bg-red-100 text-red-700' :
                        p.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {p.priority === 'high' ? '🔴 Cao' : p.priority === 'medium' ? '🟡 TB' : '🟢 Thấp'}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                 <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                      <span>{p.customer_name || '—'}</span>
                      <span>{formatVND(p.estimated_value)}</span>
                    </div>
                    {p.deadline && (
                      <p className={`text-[10px] mt-1 ${new Date(p.deadline) < new Date() ? 'text-red-600 font-bold' : 'text-gray-400'}`}>
                        Hạn: {formatDate(p.deadline)}
                      </p>
                    )}
                    {/* Progress bar */}
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-orange-500 h-full transition-all" style={{ width: `${p.taskProgress || 0}%` }} />
                      </div>
                  <span className="text-[10px] font-bold text-orange-600">{p.taskProgress || 0}%</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
