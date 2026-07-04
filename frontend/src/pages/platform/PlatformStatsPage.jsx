import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { BarChart3, Globe, Users, Building2 } from 'lucide-react';
import { TIER_LABELS } from '../../lib/platformConstants';

export default function PlatformStatsPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/platform/stats/overview')
      .then(({ data }) => setStats(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <div className="animate-spin h-8 w-8 border-3 border-teal-600 border-t-transparent rounded-full" />
      </div>
    );
  }
  if (!stats) return <div className="flex items-center justify-center h-64 text-gray-500">Không tải được thống kê</div>;

  const cards = [
    { label: 'Tổng hệ sinh thái', value: stats.total_tenants, icon: Globe, color: 'text-teal-600 bg-teal-50' },
    { label: 'Đang hoạt động', value: stats.active_tenants, icon: Globe, color: 'text-green-600 bg-green-50' },
    { label: 'Tổng users', value: stats.total_users, icon: Users, color: 'text-blue-600 bg-blue-50' },
    { label: 'Tổng công ty', value: stats.total_companies, icon: Building2, color: 'text-purple-600 bg-purple-50' },
  ];

  const inactive = (stats.total_tenants || 0) - (stats.active_tenants || 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-teal-600" />
          Thống kê Nền tảng
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">Số liệu tổng hợp toàn hệ thống</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-white border rounded-2xl p-5">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center mb-3 ${c.color}`}>
              <c.icon className="h-5 w-5" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{c.value}</div>
            <div className="text-sm text-gray-500 mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {stats.tier_breakdown && Object.keys(stats.tier_breakdown).length > 0 && (
          <div className="bg-white border rounded-2xl p-5">
            <h3 className="font-semibold mb-4">Phân bổ theo gói</h3>
            <div className="space-y-3">
              {Object.entries(TIER_LABELS).map(([tier, label]) => {
                const count = stats.tier_breakdown[tier] || 0;
                const total = stats.total_tenants || 1;
                const pct = Math.round((count / total) * 100);
                return (
                  <div key={tier} className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 w-24">{label}</span>
                    <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-teal-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-sm font-semibold text-gray-700 w-10 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="bg-white border rounded-2xl p-5">
          <h3 className="font-semibold mb-4">Tóm tắt</h3>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">TB users / HST</dt>
              <dd className="font-medium text-gray-900">
                {stats.total_tenants ? Math.round(stats.total_users / stats.total_tenants) : 0}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">TB công ty / HST</dt>
              <dd className="font-medium text-gray-900">
                {stats.total_tenants ? Math.round(stats.total_companies / stats.total_tenants) : 0}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">HST tạm dừng</dt>
              <dd className="font-medium text-gray-900">{inactive}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Tỷ lệ hoạt động</dt>
              <dd className="font-medium text-gray-900">
                {stats.total_tenants ? Math.round((stats.active_tenants / stats.total_tenants) * 100) : 0}%
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
