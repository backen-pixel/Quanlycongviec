import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../lib/api';
import { STATUS_LABELS, STATUS_COLORS, formatVND, formatDate, getInitials, avatarColor } from '../lib/utils';
import { FolderKanban, Phone, Calendar } from 'lucide-react';

const STAGE_STATUS_MAP = {
  consulting: 'consulting',
  design: 'designing',
  quotation: 'quoting',
  contract: 'contract_signed',
  production: 'producing',
  shipping: 'shipping',
  installation: 'installing',
  'customer-care': 'warranty',
};

const STAGE_NAMES = {
  consulting: 'Tư vấn',
  design: 'Thiết kế',
  quotation: 'Báo giá',
  contract: 'Hợp đồng',
  production: 'Sản xuất',
  shipping: 'Vận chuyển',
  installation: 'Lắp đặt',
  'customer-care': 'Chăm sóc KH',
};

export default function StageView() {
  const { slug } = useParams();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const status = STAGE_STATUS_MAP[slug] || slug;

  useEffect(() => {
    setLoading(true);
    api.get('/projects', { params: { status } })
      .then(r => setProjects(r.data.projects || []))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <svg className="animate-spin h-6 w-6 text-gray-400" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
        </svg>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{STAGE_NAMES[slug] || STATUS_LABELS[status] || slug}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{projects.length} dự án ở giai đoạn này</p>
      </div>

      {/* Project cards */}
      {projects.length === 0 ? (
        <div className="text-center py-16">
          <FolderKanban className="h-12 w-12 mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-400">Không có dự án ở giai đoạn này</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {projects.map((p, i) => (
            <div
              key={p.id}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer animate-fade-in"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-sm font-bold text-blue-600">{p.code}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.status] || ''}`}>
                      {STATUS_LABELS[p.status] || p.status}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">{p.name}</h3>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    {p.customers?.full_name && <span>{p.customers.full_name}</span>}
                    {p.customers?.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />{p.customers.phone}
                      </span>
                    )}
                    {p.created_at && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />{formatDate(p.created_at)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-base font-bold text-gray-900">{formatVND(p.estimated_value)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
