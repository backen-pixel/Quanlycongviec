import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { Globe, Users, Building2, BarChart3, Plus, ChevronRight, Puzzle, ArrowUpRight } from 'lucide-react';
import { TIER_LABELS, TIER_COLORS } from '../../lib/platformConstants';

export default function PlatformDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/platform/stats/overview'),
      api.get('/platform/tenants'),
    ]).then(([{ data: s }, { data: t }]) => {
      setStats(s);
      setTenants(t);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin h-8 w-8 border-3 border-teal-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const statCards = [
    { label: 'Hệ sinh thái', value: stats?.total_tenants || 0, sub: `${stats?.active_tenants || 0} hoạt động`, icon: Globe, color: 'from-teal-500 to-teal-600', link: '/platform/tenants' },
    { label: 'Tổng người dùng', value: stats?.total_users || 0, sub: 'Toàn nền tảng', icon: Users, color: 'from-blue-500 to-blue-600', link: '/platform/users' },
    { label: 'Tổng công ty', value: stats?.total_companies || 0, sub: 'Tất cả HST', icon: Building2, color: 'from-indigo-500 to-indigo-600', link: '/platform/stats' },
  ];

  const recentTenants = tenants.slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {statCards.map((c) => (
          <div
            key={c.label}
            onClick={() => c.link && navigate(c.link)}
            className={`bg-white border rounded-2xl p-5 hover:shadow-md transition-all ${c.link ? 'cursor-pointer' : ''}`}
          >
            <div className="flex items-start justify-between">
              <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${c.color} flex items-center justify-center shadow-sm`}>
                <c.icon className="h-5 w-5 text-white" />
              </div>
              {c.link && <ArrowUpRight className="h-4 w-4 text-gray-300" />}
            </div>
            <div className="mt-4">
              <div className="text-3xl font-bold text-gray-900">{c.value}</div>
              <div className="text-sm text-gray-500 mt-0.5">{c.label}</div>
              <div className="text-xs text-gray-400 mt-1">{c.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-1 bg-white border rounded-2xl p-5">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-teal-600" />
            Phân bổ theo gói
          </h3>
          <div className="space-y-2">
            {Object.entries(TIER_LABELS).map(([tier, label]) => {
              const count = stats?.tier_breakdown?.[tier] || 0;
              const total = stats?.total_tenants || 1;
              const pct = Math.round((count / total) * 100);
              return (
                <div key={tier} className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${TIER_COLORS[tier]}`} style={{ minWidth: 72, textAlign: 'center' }}>{label}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm font-medium text-gray-600 w-8 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="md:col-span-2 bg-white border rounded-2xl p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Truy cập nhanh</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Quản lý Hệ sinh thái', desc: 'Xem, tạo, sửa tenant', icon: Globe, to: '/platform/tenants', color: 'text-teal-600 bg-teal-50' },
              { label: 'Gói thuê bao', desc: 'Hạn sử dụng & giới hạn', icon: BarChart3, to: '/platform/billing', color: 'text-emerald-600 bg-emerald-50' },
              { label: 'Tính năng theo gói', desc: 'Ma trận module × tier', icon: Puzzle, to: '/platform/tier-features', color: 'text-purple-600 bg-purple-50' },
              { label: 'Người dùng toàn bộ', desc: 'Tìm users mọi HST', icon: Users, to: '/platform/users', color: 'text-indigo-600 bg-indigo-50' },
            ].map((item) => (
              <button
                key={item.to}
                type="button"
                onClick={() => navigate(item.to)}
                className="flex items-center gap-3 p-3.5 rounded-xl border hover:border-teal-200 hover:bg-teal-50/30 transition-colors text-left cursor-pointer"
              >
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${item.color}`}>
                  <item.icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-900">{item.label}</div>
                  <div className="text-xs text-gray-500">{item.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-semibold text-gray-900">Hệ sinh thái gần đây</h3>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/platform/tenants', { state: { showCreate: true } })}
              className="text-sm text-teal-600 hover:text-teal-700 cursor-pointer flex items-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" /> Tạo mới
            </button>
            <button type="button" onClick={() => navigate('/platform/tenants')} className="text-sm text-gray-500 hover:text-gray-700 cursor-pointer flex items-center gap-1">
              Xem tất cả <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="divide-y">
          {recentTenants.map((t) => (
            <div
              key={t.id}
              onClick={() => navigate(`/platform/tenants/${t.id}`)}
              className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-teal-50 flex items-center justify-center">
                  <Globe className="h-4 w-4 text-teal-600" />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">{t.name}</div>
                  <div className="text-xs text-gray-400">{t.slug}</div>
                </div>
              </div>
              <div className="flex items-center gap-5">
                <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${TIER_COLORS[t.tier] || 'bg-gray-50'}`}>
                  {TIER_LABELS[t.tier] || t.tier}
                </span>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{t.user_count || 0}</span>
                  <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{t.company_count || 0}</span>
                </div>
                <span className={`h-2 w-2 rounded-full ${t.is_active ? 'bg-green-500' : 'bg-red-400'}`} />
                <ChevronRight className="h-4 w-4 text-gray-300" />
              </div>
            </div>
          ))}
          {recentTenants.length === 0 && (
            <div className="px-5 py-8 text-center text-gray-400 text-sm">Chưa có hệ sinh thái nào</div>
          )}
        </div>
      </div>
    </div>
  );
}
