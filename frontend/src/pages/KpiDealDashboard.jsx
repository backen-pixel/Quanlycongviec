import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatVND } from '../lib/utils';
import {
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  DollarSign,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import KpiUserFilter from '../components/KpiUserFilter';

const FUNNEL_LABELS = {
  designing: 'Thiết kế',
  quoted: 'Đã báo giá',
  negotiating: 'Đàm phán',
  waiting_deposit: 'Chờ cọc',
  contract_signed: 'Đã ký HĐ',
  producing: 'Sản xuất',
  installing: 'Lắp đặt',
  completed: 'Hoàn thành',
  lost: 'Mất',
};

function getDefaultPeriodStart() {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString().slice(0, 10);
}

function statusToneByRatio(actual, target, formula) {
  if (actual == null || target == null) return 'bg-gray-100 text-gray-600';
  const isInc = ['increasing', 'quantity', 'revenue'].includes(formula);
  const ratio = isInc ? actual / target : target / Math.max(actual, 0.0001);
  if (ratio >= 1) return 'bg-emerald-100 text-emerald-700';
  if (ratio >= 0.8) return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

function fmtKpiValue(kpi) {
  const v = kpi.actual_value;
  if (v == null) return '—';
  if (kpi.formula_type === 'revenue') return formatVND(v);
  if (kpi.formula_type === 'duration') {
    if (kpi.unit === 'day') return `${(Math.round(v * 10) / 10)} ngày`;
    if (kpi.unit === 'minute') return `${Math.round(v)} phút`;
  }
  if (kpi.unit === '%') return `${Math.round(v * 100) / 100}%`;
  if (kpi.unit === 'count') return Math.round(v);
  return Math.round(v * 100) / 100;
}

function KpiCard({ kpi }) {
  const tone = statusToneByRatio(kpi.actual_value, kpi.target_value, kpi.formula_type);
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">{kpi.kpi_code}</p>
          <h3 className="font-semibold text-sm text-gray-900 mt-0.5">{kpi.kpi_name}</h3>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tone}`}>
          {kpi.capped_score == null ? '—' : `${kpi.capped_score}đ`}
        </span>
      </div>
      <p className="text-2xl font-bold text-gray-900 mt-3">{fmtKpiValue(kpi)}</p>
      <p className="text-xs text-gray-500 mt-1">
        Mục tiêu: {kpi.target_value == null ? '—' : kpi.formula_type === 'revenue' ? formatVND(kpi.target_value) : `${kpi.target_value}${kpi.unit === '%' ? '%' : kpi.unit === 'day' ? ' ngày' : ''}`}
        {' · '}TS {kpi.weight_used}
      </p>
    </div>
  );
}

export default function KpiDealDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [periodStart, setPeriodStart] = useState(getDefaultPeriodStart());
  const [targetUserId, setTargetUserId] = useState(user?.id || '');
  const [filter, setFilter] = useState({ companyId: '', departmentId: '', q: '' });
  const [users, setUsers] = useState([]);
  const isManager = ['admin', 'manager', 'director', 'supervisor', 'superadmin'].includes(String(user?.role || '').toLowerCase());

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data: r } = await api.get('/kpi/dashboard/deal', {
        params: { user_id: targetUserId || user?.id, period_start: periodStart },
      });
      setData(r);
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isManager) return;
    const t = setTimeout(() => {
      const params = {
        ...(filter.companyId ? { company_id: filter.companyId } : {}),
        ...(filter.departmentId ? { department_id: filter.departmentId } : {}),
        ...(filter.q?.trim() ? { q: filter.q.trim() } : {}),
      };
      api.get('/kpi/users', { params })
        .then((r) => setUsers(r.data?.users || []))
        .catch(() => setUsers([]));
    }, 300);
    return () => clearTimeout(t);
  }, [isManager, filter.companyId, filter.departmentId, filter.q]);

  useEffect(() => {
    if (user?.id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, periodStart, targetUserId]);

  const funnelData = useMemo(() => {
    if (!data?.funnel) return [];
    return Object.entries(data.funnel).map(([slug, count]) => ({
      stage: FUNNEL_LABELS[slug] || slug,
      count,
    }));
  }, [data]);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">KPI Bộ phận Deal (Tủ bếp)</h1>
          <p className="text-sm text-gray-500 mt-0.5">Chuyển đổi báo giá, ký HD, doanh số.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="month"
            value={periodStart.slice(0, 7)}
            onChange={(e) => setPeriodStart(`${e.target.value}-01`)}
            className="px-3 py-2 border rounded-lg text-sm"
          />
          <button onClick={load} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-1">
            <RefreshCw className="w-4 h-4" /> Tính lại
          </button>
        </div>
      </div>

      {isManager && (
        <div className="bg-white border border-gray-100 rounded-xl p-3 space-y-2">
          <KpiUserFilter value={filter} onChange={setFilter} />
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs text-gray-600">Nhân viên ({users.length}):</label>
            <select
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              className="px-3 py-1.5 border rounded-lg text-sm flex-1 min-w-[240px]"
            >
              <option value={user?.id}>— Của tôi —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name || u.email}{u.department?.name ? ` · ${u.department.name}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {err && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          Lỗi: {err}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400">Đang tính KPI…</div>
      ) : data ? (
        <>
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs text-emerald-700 uppercase tracking-wide">Tổng điểm KPI tháng</p>
              <p className="text-3xl font-bold text-emerald-900 mt-1">
                {data.total_score == null ? '—' : `${data.total_score}đ`}
                <span className="text-base font-normal text-emerald-700 ml-1">/ 100</span>
              </p>
            </div>
            {data.gating?.triggered && (
              <div className="bg-red-100 border border-red-300 px-3 py-2 rounded-lg flex items-center gap-2 text-sm text-red-800 max-w-md">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>Vi phạm KPI gating <strong>{data.gating.kpi_code}</strong>. Tổng KPI bị giới hạn 70 điểm.</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(data.kpis || []).map((k) => (
              <KpiCard key={k.kpi_code} kpi={k} />
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <h3 className="font-semibold text-sm text-gray-900">Phễu Deal trong tháng</h3>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={funnelData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="stage" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#059669" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <h3 className="font-semibold text-sm text-gray-900">
                  Deal sắp quá SLA ({data.alerts?.deals_near_sla?.length || 0})
                </h3>
              </div>
              <div className="overflow-y-auto max-h-64">
                {(data.alerts?.deals_near_sla || []).length === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center">Không có deal vượt 70% SLA.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-xs text-gray-500 uppercase border-b">
                      <tr>
                        <th className="text-left py-2">Mã / Tiêu đề</th>
                        <th className="text-left py-2">Stage</th>
                        <th className="text-left py-2">Vào stage</th>
                        <th className="text-right py-2">Giá trị</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.alerts.deals_near_sla || []).map((d) => (
                        <tr key={d.id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="py-2">
                            <Link to={`/crm/leads/${d.id}`} className="text-blue-600 hover:underline">
                              {d.code || d.title || '—'}
                            </Link>
                          </td>
                          <td className="py-2 text-xs text-gray-700">{d.stage?.name || '—'}</td>
                          <td className="py-2 text-xs text-gray-700">
                            {d.stage_entered_at ? new Date(d.stage_entered_at).toLocaleDateString('vi-VN') : '—'}
                          </td>
                          <td className="py-2 text-xs text-gray-700 text-right">
                            {d.estimated_value ? formatVND(d.estimated_value) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-16 text-gray-400">Chưa có dữ liệu.</div>
      )}
    </div>
  );
}
