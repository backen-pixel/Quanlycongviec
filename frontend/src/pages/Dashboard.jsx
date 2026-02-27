import { useState, useEffect } from 'react';
import api from '../lib/api';
import { FolderKanban, CheckSquare, AlertTriangle, TrendingUp } from 'lucide-react';
import { STATUS_LABELS, STATUS_COLORS, PRIORITY_LABELS, formatVND } from '../lib/utils';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard').then(r => setData(r.data)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Đang tải...</div>;
  if (!data) return null;
  const { stats, pipeline, taskCounts, recentProjects } = data;

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Dashboard</h1><p className="text-gray-500 text-sm">Tổng quan quản lý công việc</p></div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: 'Tổng dự án', value: stats.totalProjects, icon: FolderKanban, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { title: 'Đang hoạt động', value: stats.activeProjects, icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50' },
          { title: 'Task đang làm', value: taskCounts?.in_progress || 0, icon: CheckSquare, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { title: 'Quá hạn', value: stats.overdueCount, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
        ].map(s => (
          <div key={s.title} className="bg-white rounded-xl border p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div><p className="text-sm text-gray-500">{s.title}</p><p className="text-3xl font-bold mt-1">{s.value}</p></div>
              <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center`}><s.icon className={`h-5 w-5 ${s.color}`} /></div>
            </div>
          </div>
        ))}
      </div>

      {/* Pipeline */}
      {pipeline && (
        <div className="bg-white rounded-xl border p-5 shadow-sm">
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-blue-600" /> Quy Trình Sản Xuất</h2>
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {pipeline.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2">
                <div className="flex flex-col items-center min-w-[80px]">
                  <div className="w-12 h-12 rounded-xl text-white font-bold flex items-center justify-center text-lg shadow" style={{ backgroundColor: s.color }}>{s.count}</div>
                  <p className="mt-1 text-[11px] text-gray-600 text-center">{s.name}</p>
                </div>
                {i < pipeline.length - 1 && <div className="w-6 h-0.5 bg-gray-200 shrink-0 mt-[-12px]" />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Projects */}
      {recentProjects && (
        <div className="bg-white rounded-xl border p-5 shadow-sm">
          <h2 className="text-sm font-semibold mb-3">Dự Án Gần Đây</h2>
          <div className="space-y-2">
            {recentProjects.map(p => (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 cursor-pointer">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-blue-600">{p.code}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_COLORS[p.status]}`}>{STATUS_LABELS[p.status]}</span>
                  </div>
                  <p className="text-sm text-gray-600">{p.customers?.full_name} — {p.name}</p>
                </div>
                <p className="text-sm font-semibold">{p.estimated_value ? formatVND(p.estimated_value) : ''}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
