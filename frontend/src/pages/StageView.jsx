import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../lib/api';
import { STATUS_LABELS, STATUS_COLORS } from '../lib/utils';

const STAGE_STATUS_MAP = { consulting:'consulting', design:'designing', quotation:'quoting', contract:'contract_signed', production:'producing', shipping:'shipping', installation:'installing', 'customer-care':'warranty' };

export default function StageView() {
  const { slug } = useParams();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const status = STAGE_STATUS_MAP[slug] || slug;

  useEffect(() => {
    setLoading(true);
    api.get('/projects', { params: { status } }).then(r => setProjects(r.data.projects || [])).finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Đang tải...</div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{STATUS_LABELS[status] || slug}</h1>
        <p className="text-gray-500 text-sm">{projects.length} dự án ở giai đoạn này</p>
      </div>
      <div className="space-y-2">
        {projects.map(p => (
          <div key={p.id} className="bg-white rounded-xl border p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-bold text-blue-600">{p.code}</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_COLORS[p.status]}`}>{STATUS_LABELS[p.status]}</span>
            </div>
            <h3 className="text-sm font-semibold">{p.name}</h3>
            <p className="text-xs text-gray-500 mt-1">{p.customers?.full_name} — {p.customers?.phone}</p>
          </div>
        ))}
        {!projects.length && <div className="text-center py-10 text-gray-400">Không có dự án ở giai đoạn này</div>}
      </div>
    </div>
  );
}
