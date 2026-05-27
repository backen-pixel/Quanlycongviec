import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { TrendingUp, ArrowRight, AlertCircle } from 'lucide-react';

export default function DivisionsListPage() {
  const [divisions, setDivisions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDivisions();
  }, []);

  const loadDivisions = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/divisions');
      setDivisions(data.divisions || []);
    } catch (err) {
      console.error('Failed to load divisions:', err);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-500">Đang tải các khối...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">🏢 Quản Lý Theo Khối</h1>
        <p className="text-gray-600">Chọn khối để xem dashboard chi tiết</p>
      </div>

      {/* Division Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {divisions.map(division => (
          <DivisionCard key={division.id} division={division} />
        ))}
      </div>

      {divisions.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">Chưa có khối nào. Vui lòng tạo khối từ Ecosystem.</p>
        </div>
      )}
    </div>
  );
}

function DivisionCard({ division }) {
  const { stats } = division;
  const hasAlerts = stats.alerts > 0;

  return (
    <Link
      to={`/divisions/${division.id}`}
      className="block bg-white rounded-xl border-2 border-gray-200 p-6 hover:shadow-xl hover:border-blue-300 transition-all duration-300 group"
    >
      {/* Icon & Name */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-4xl group-hover:scale-110 transition-transform">
          {division.icon || '🏢'}
        </span>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
            {division.name}
          </h3>
          <p className="text-xs text-gray-500">{division.slug}</p>
        </div>
        {hasAlerts && (
          <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full">
            {stats.alerts} ⚠️
          </span>
        )}
      </div>

      {/* Description */}
      {division.description && (
        <p className="text-sm text-gray-600 mb-4 line-clamp-2">{division.description}</p>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatBadge label="Dự án" value={stats.projects} icon="📁" color="blue" />
        <StatBadge label="Công việc" value={stats.tasks} icon="✅" color="emerald" />
        <StatBadge label="Nhân sự" value={stats.members} icon="👥" color="purple" />
        <StatBadge 
          label="Cảnh báo" 
          value={stats.alerts} 
          icon="⚠️" 
          color={stats.alerts > 0 ? "red" : "gray"} 
        />
      </div>

      {/* View Button */}
      <div className="flex items-center justify-center gap-2 text-blue-600 font-medium text-sm group-hover:gap-3 transition-all">
        <span>Xem chi tiết</span>
        <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
      </div>
    </Link>
  );
}

function StatBadge({ label, value, icon, color }) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    purple: 'bg-purple-50 text-purple-700',
    red: 'bg-red-50 text-red-700',
    gray: 'bg-gray-50 text-gray-700',
  };

  return (
    <div className={`${colorClasses[color]} rounded-lg p-3`}>
      <div className="text-xs font-medium opacity-75 mb-1">{label}</div>
      <div className="flex items-center gap-1.5">
        <span className="text-lg">{icon}</span>
        <span className="text-xl font-bold">{value}</span>
      </div>
    </div>
  );
}
