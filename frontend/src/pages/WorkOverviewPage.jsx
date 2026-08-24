import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike, isCompanyScopedAdmin } from '../lib/adminRole';
import { vnTodayYmd } from '../lib/vnDate';
import { formatDate } from '../lib/utils';
import UnifiedTaskRow from '../components/UnifiedTaskRow';
import { RefreshCw, Building2 } from 'lucide-react';

const WEEKDAY_LABELS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

function pad2(n) { return String(n).padStart(2, '0'); }

function greetingForHour(h) {
  if (h < 11) return 'Chào buổi sáng';
  if (h < 14) return 'Chào buổi trưa';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

function formatMoneyShort(v) {
  const n = Number(v) || 0;
  if (n >= 1e9) {
    let val = (n / 1e9).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    return `${val.replace('.', ',')} tỷ đ`;
  }
  if (n >= 1e6) return `${Math.round(n / 1e6).toLocaleString('vi-VN')} triệu đ`;
  return `${n.toLocaleString('vi-VN')} đ`;
}

const RISK_BADGE_CLS = {
  overdue: 'bg-red-50 text-red-700',
  warning: 'bg-amber-50 text-amber-700',
};

const RISK_BAR_CLS = {
  overdue: 'bg-red-500',
  warning: 'bg-emerald-500',
};

export default function WorkOverviewPage() {
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);
  const isCompanyScoped = isCompanyScopedAdmin(user);
  const canPickCompany = isAdmin && !isCompanyScoped;

  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [overview, setOverview] = useState(null);
  const [todayTasks, setTodayTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/companies', { params: { for_module: 'crm' } }).then((res) => {
      const list = Array.isArray(res.data) ? res.data : (res.data?.companies || []);
      setCompanies(list);
      if (list.length > 0) setCompanyId((prev) => prev || list[0].id);
    }).catch(() => setCompanies([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const today = vnTodayYmd();
      const scopeParams = canPickCompany && companyId ? { company_id: companyId } : {};
      const [overviewRes, tasksRes] = await Promise.all([
        api.get('/management/work-overview', { params: scopeParams }),
        api.get('/work-tasks', {
          params: {
            date_from: `${today}T00:00:00+07:00`,
            date_to: `${today}T23:59:59+07:00`,
            open_only: '1',
            page_size: 20,
            ...scopeParams,
          },
        }),
      ]);
      setOverview(overviewRes.data);
      setTodayTasks(tasksRes.data?.tasks || []);
    } catch (e) {
      setError(e?.response?.data?.error || 'Không tải được dữ liệu tổng quan');
    } finally {
      setLoading(false);
    }
  }, [canPickCompany, companyId]);

  useEffect(() => { load(); }, [load]);

  const companyName = useMemo(() => {
    if (canPickCompany) {
      if (!companyId) return 'tất cả công ty';
      return companies.find((c) => String(c.id) === String(companyId))?.name || 'công ty đã chọn';
    }
    return companies.find((c) => String(c.id) === String(user?.company_id))?.name || companies[0]?.name || 'công ty bạn';
  }, [canPickCompany, companyId, companies, user?.company_id]);

  const now = useMemo(() => new Date(), []);
  const revenueLabel = `Doanh thu tháng ${now.getMonth() + 1} (đến ${pad2(now.getDate())}/${pad2(now.getMonth() + 1)})`;
  const subtitleDate = `${WEEKDAY_LABELS[now.getDay()]}, ${pad2(now.getDate())}/${pad2(now.getMonth() + 1)}/${now.getFullYear()}`;

  const stats = [
    { key: 'active', label: 'Dự án đang thực hiện', value: overview?.projects_active, cls: 'text-gray-900' },
    { key: 'revenue', label: revenueLabel, value: overview ? formatMoneyShort(overview.revenue_this_month) : null, cls: 'text-emerald-600' },
    { key: 'overdue', label: 'Công việc quá hạn', value: overview?.overdue_tasks, cls: 'text-red-600' },
    { key: 'customers', label: 'Khách hàng mới tháng này', value: overview?.new_customers_this_month, cls: 'text-gray-900' },
  ];

  const trend = overview?.revenue_trend || [];
  const maxTrend = Math.max(1, ...trend.map((t) => t.total));

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          {/* Màu chữ khóa cố định — không đổi theo theme/hình nền người dùng chọn ở Cài đặt > Giao diện */}
          <h1 className="text-xl font-bold" style={{ color: '#111827' }}>
            {greetingForHour(now.getHours())}, {user?.full_name || ''}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: '#6b7280' }}>
            Toàn cảnh hoạt động của {companyName} · {subtitleDate}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canPickCompany && companies.length > 0 && (
            <div className="relative">
              <Building2 className="h-4 w-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                className="h-9 pl-8 pr-3 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300"
              >
                <option value="">Tất cả công ty</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
                ))}
              </select>
            </div>
          )}
          {!canPickCompany && (user?.company_id) && (
            <div className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-blue-100 bg-blue-50 text-sm font-medium text-blue-800">
              <Building2 className="h-4 w-4" />
              {companyName}
            </div>
          )}
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.key} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className={`text-2xl font-bold mt-1.5 ${s.cls}`}>{loading ? '…' : (s.value ?? 0)}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-800 mb-4">Doanh thu 6 tháng gần đây</h2>
        {trend.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">Chưa có dữ liệu</p>
        ) : (
          <div className="flex items-end gap-4 h-40">
            {trend.map((t, idx) => {
              const h = Math.max(6, Math.round((t.total / maxTrend) * 140));
              const shade = 0.25 + (idx / Math.max(1, trend.length - 1)) * 0.75;
              return (
                <div key={t.label} className="flex-1 flex flex-col items-center justify-end h-full">
                  <div
                    className="w-full max-w-10 rounded-t-md"
                    style={{ height: `${h}px`, backgroundColor: `rgba(16,163,74,${shade})` }}
                    title={formatMoneyShort(t.total)}
                  />
                  <p className="text-xs text-gray-500 mt-2">{t.label}{t.is_current ? '*' : ''}</p>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-[11px] text-gray-400 text-right mt-2">
          * Tháng {now.getMonth() + 1} tính đến {pad2(now.getDate())}/{pad2(now.getMonth() + 1)} — chưa hết tháng
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-800">Dự án cần chú ý</h2>
            <Link to="/work/unified" className="text-xs text-blue-600 hover:text-blue-800 font-medium">Xem tất cả</Link>
          </div>
          {loading ? (
            <p className="text-sm text-gray-400 py-6 text-center">Đang tải...</p>
          ) : (overview?.projects_at_risk || []).length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">Không có dự án nào cần chú ý.</p>
          ) : (
            <div className="space-y-3">
              {overview.projects_at_risk.map((p) => (
                <div key={p.id} className="border border-gray-100 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-sm text-gray-900">{p.code} · {p.name}</p>
                    <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full ${RISK_BADGE_CLS[p.risk.level]}`}>
                      {p.risk.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Hạn bàn giao {formatDate(p.deadline)}</p>
                  {p.progress_pct != null && (
                    <div className="mt-2">
                      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${RISK_BAR_CLS[p.risk.level]}`}
                          style={{ width: `${p.progress_pct}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-gray-400 mt-1">{p.progress_pct}% hoàn thành</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-800">Việc cần làm hôm nay</h2>
            <Link to="/work/unified" className="text-xs text-blue-600 hover:text-blue-800 font-medium">Xem tất cả</Link>
          </div>
          {loading ? (
            <p className="text-sm text-gray-400 py-6 text-center">Đang tải...</p>
          ) : todayTasks.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">Không có việc nào hạn hôm nay.</p>
          ) : (
            <div className="space-y-2">
              {todayTasks.map((t) => <UnifiedTaskRow key={t.unified_id} task={t} compact />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
