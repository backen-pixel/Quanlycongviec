import { useState, useEffect } from 'react';
import api from '../lib/api';
import { FolderKanban, CheckSquare, AlertTriangle, TrendingUp, ArrowRight } from 'lucide-react';
import { STATUS_LABELS, STATUS_COLORS, formatVND } from '../lib/utils';

function StatCard({ title, value, icon: Icon, color, bgColor }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{value ?? 0}</p>
        </div>
        <div className={`w-11 h-11 rounded-xl ${bgColor} flex items-center justify-center`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      </div>
    </div>
  );
}

function PipelineBar({ pipeline }) {
  if (!pipeline?.length) return null;
  const maxCount = Math.max(...pipeline.map(s => s.count), 1);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-blue-600" />
          Quy trình sản xuất
        </h2>
      </div>
      <div className="space-y-3">
        {pipeline.map(stage => (
          <div key={stage.id} className="flex items-center gap-3">
            <span className="text-xs text-gray-600 w-20 shrink-0 truncate">{stage.name}</span>
            <div className="flex-1 h-7 bg-gray-100 rounded-lg overflow-hidden relative">
              <div
                className="h-full rounded-lg transition-all duration-500 flex items-center px-2"
                style={{
                  width: `${Math.max((stage.count / maxCount) * 100, stage.count > 0 ? 8 : 0)}%`,
                  backgroundColor: stage.color || '#3b82f6',
                }}
              >
                {stage.count > 0 && (
                  <span className="text-[11px] font-bold text-white">{stage.count}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentProjects({ projects }) {
  if (!projects?.length) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-900">Dự án gần đây</h2>
      </div>
      <div className="divide-y divide-gray-100">
        {projects.map(p => (
          <div key={p.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0 hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors cursor-pointer">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-bold text-blue-600">{p.code}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-600'}`}>
                  {STATUS_LABELS[p.status] || p.status}
                </span>
              </div>
              <p className="text-sm text-gray-700 truncate">{p.name}</p>
              <p className="text-xs text-gray-400">{p.customers?.full_name}</p>
            </div>
            <div className="text-right shrink-0 ml-4">
              <p className="text-sm font-semibold text-gray-900">{formatVND(p.estimated_value)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard')
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <p className="text-sm">Không thể tải dữ liệu</p>
      </div>
    );
  }

  const { stats, pipeline, taskCounts, recentProjects } = data;

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Tổng quan hoạt động</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Tổng dự án" value={stats?.totalProjects} icon={FolderKanban} color="text-indigo-600" bgColor="bg-indigo-50" />
        <StatCard title="Đang hoạt động" value={stats?.activeProjects} icon={TrendingUp} color="text-blue-600" bgColor="bg-blue-50" />
        <StatCard title="Task đang làm" value={taskCounts?.in_progress} icon={CheckSquare} color="text-emerald-600" bgColor="bg-emerald-50" />
        <StatCard title="Quá hạn" value={stats?.overdueCount} icon={AlertTriangle} color="text-red-600" bgColor="bg-red-50" />
      </div>

      {/* Pipeline + Recent */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PipelineBar pipeline={pipeline} />
        <RecentProjects projects={recentProjects} />
      </div>
    </div>
  );
}
