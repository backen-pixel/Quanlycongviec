import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { formatVND } from '../lib/utils';
import { ClipboardCheck, Factory, ChevronRight } from 'lucide-react';

export default function ProductionApprovalsPage() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/production/projects', { params: { limit: 200 } });
      setProjects(data?.projects || []);
    } catch (e) {
      console.error(e);
      setProjects([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin h-10 w-10 border-4 border-teal-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold text-teal-700 uppercase tracking-wide mb-1">Xưởng / Duyệt</p>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ClipboardCheck className="h-7 w-7 text-teal-600" />
          Duyệt theo deal
        </h1>
        <p className="text-sm text-slate-600 mt-2 max-w-2xl">
          Yêu cầu duyệt gắn với <strong>dự án xưởng</strong> (cùng hệ thống với CRM). Mở chi tiết deal → tab duyệt để gửi hoặc xử lý.
          Danh sách dưới đây là các deal đang ở khối sản xuất.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Mã</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Deal / dự án</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Giai đoạn</th>
              <th className="text-right px-4 py-3 font-semibold text-slate-600">Giá trị</th>
              <th className="text-right px-4 py-3 font-semibold text-slate-600">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {projects.map((p) => (
              <tr key={p.id} className="hover:bg-teal-50/40">
                <td className="px-4 py-3 font-mono font-semibold text-teal-700">{p.code}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{p.name}</div>
                  <div className="text-xs text-slate-500">{p.customer?.full_name || '—'}</div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className="text-xs px-2 py-1 rounded-full text-white font-medium"
                    style={{ backgroundColor: p.current_stage?.color || '#0d9488' }}
                  >
                    {p.current_stage?.name || '—'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-emerald-700 font-medium">{formatVND(p.estimated_value)}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    to={`/sx/projects/${p.id}?tab=approvals`}
                    className="inline-flex items-center gap-1 text-teal-700 font-medium hover:underline"
                  >
                    Chi tiết và duyệt <ChevronRight className="h-4 w-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!projects.length && (
          <div className="py-16 text-center text-slate-400">
            <Factory className="h-12 w-12 mx-auto mb-2 opacity-40" />
            <p>Chưa có dự án xưởng.</p>
          </div>
        )}
      </div>

    </div>
  );
}
