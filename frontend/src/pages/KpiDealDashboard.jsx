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
  Award,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
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

const EVENT_LABELS = {
  task_completed: 'Task hoàn thành',
  stage_changed: 'Chuyển stage',
  lead_converted: 'Lead → Deal',
  deal_won: 'Chốt hợp đồng',
  deal_lost: 'Deal mất',
  sla_breach: 'Vi phạm SLA',
  manual: 'Điều chỉnh thủ công',
};

const EVENT_COLORS = {
  task_completed: 'bg-blue-100 text-blue-700',
  stage_changed: 'bg-indigo-100 text-indigo-700',
  lead_converted: 'bg-teal-100 text-teal-800',
  deal_won: 'bg-emerald-100 text-emerald-700',
  deal_lost: 'bg-red-100 text-red-700',
  sla_breach: 'bg-orange-100 text-orange-700',
  manual: 'bg-gray-100 text-gray-600',
};

function DealScoreRow({ item }) {
  const [expanded, setExpanded] = useState(false);
  const lead = item.lead;
  const pts = item.total_points;
  const isWon = lead?.stage?.is_won;
  const isLost = lead?.stage?.is_lost;

  return (
    <>
      <tr
        className="border-b last:border-0 hover:bg-gray-50 cursor-pointer"
        onClick={() => setExpanded(v => !v)}
      >
        <td className="px-3 py-2.5">
          {lead ? (
            <div>
              <Link
                to={`/crm/leads/${lead.id}`}
                className="text-blue-600 hover:underline font-medium text-sm"
                onClick={e => e.stopPropagation()}
              >
                {lead.code || lead.title || lead.id.slice(0, 8)}
              </Link>
              {lead.title && lead.code && (
                <div className="text-xs text-gray-500 truncate max-w-[180px]">{lead.title}</div>
              )}
            </div>
          ) : (
            <span className="text-xs text-gray-400">{item.lead_id.slice(0, 8)}</span>
          )}
        </td>
        <td className="px-3 py-2.5 text-xs text-gray-600">
          {isWon && <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-xs font-medium">Đã ký HĐ</span>}
          {isLost && <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-medium">Mất</span>}
          {!isWon && !isLost && <span className="text-gray-600">{lead?.stage?.name || '—'}</span>}
        </td>
        <td className="px-3 py-2.5 text-right text-xs text-gray-500">
          {lead?.estimated_value ? formatVND(lead.estimated_value) : '—'}
        </td>
        <td className="px-3 py-2.5 text-right">
          <span className="text-xs text-emerald-600">+{item.plus_points.toFixed(1)}</span>
          {item.minus_points < 0 && (
            <span className="text-xs text-red-600 ml-1">{item.minus_points.toFixed(1)}</span>
          )}
        </td>
        <td className="px-3 py-2.5 text-right">
          <span className={`font-bold text-sm ${pts > 0 ? 'text-emerald-700' : pts < 0 ? 'text-red-600' : 'text-gray-500'}`}>
            {pts > 0 ? '+' : ''}{pts.toFixed(1)}
          </span>
        </td>
        <td className="px-3 py-2.5 text-center text-gray-400">
          {expanded ? <ChevronUp className="h-4 w-4 mx-auto" /> : <ChevronDown className="h-4 w-4 mx-auto" />}
        </td>
      </tr>
      {expanded && item.events.length > 0 && (
        <tr className="bg-gray-50">
          <td colSpan={6} className="px-4 py-2">
            <div className="space-y-1">
              {item.events.map((ev, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  {ev.on_time === true && <CheckCircle2 className="h-3 w-3 text-emerald-500 flex-shrink-0" />}
                  {ev.on_time === false && <XCircle className="h-3 w-3 text-red-500 flex-shrink-0" />}
                  {ev.on_time === null && <span className="w-3 h-3 flex-shrink-0" />}
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${EVENT_COLORS[ev.event_type] || 'bg-gray-100 text-gray-600'}`}>
                    {EVENT_LABELS[ev.event_type] || ev.event_type}
                  </span>
                  {ev.kpi_code && <span className="text-gray-500">KPI {ev.kpi_code}</span>}
                  <span className={`font-semibold ml-auto ${Number(ev.points) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {Number(ev.points) > 0 ? '+' : ''}{Number(ev.points).toFixed(1)} điểm
                  </span>
                  {ev.reason && <span className="text-gray-400 truncate max-w-[200px]">{ev.reason}</span>}
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
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
  const [dealScores, setDealScores] = useState(null);
  const [loadingDeals, setLoadingDeals] = useState(false);
  const [err, setErr] = useState(null);
  const [periodStart, setPeriodStart] = useState(getDefaultPeriodStart());
  const [targetUserId, setTargetUserId] = useState(user?.id || '');
  const [filter, setFilter] = useState({ companyId: '', departmentId: '', q: '' });
  const [users, setUsers] = useState([]);
  const isManager = ['admin', 'manager', 'director', 'supervisor', 'superadmin'].includes(String(user?.role || '').toLowerCase());

  const load = async () => {
    setLoading(true);
    setErr(null);
    const uid = targetUserId || user?.id;
    try {
      const [{ data: r }, { data: ds }] = await Promise.all([
        api.get('/kpi/dashboard/deal', { params: { user_id: uid, period_start: periodStart } }),
        api.get('/kpi/deal-scores', { params: { user_id: uid, period_start: periodStart } }),
      ]);
      setData(r);
      setDealScores(ds);
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
      setData(null);
      setDealScores(null);
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
    const rid = String(user?.role || '').toLowerCase();
    if (rid === 'sales_admin' && !isManager) {
      setLoading(false);
      setData(null);
      setDealScores(null);
      return;
    }
    if (user?.id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role, isManager, periodStart, targetUserId]);

  const funnelData = useMemo(() => {
    if (!data?.funnel) return [];
    return Object.entries(data.funnel).map(([slug, count]) => ({
      stage: FUNNEL_LABELS[slug] || slug,
      count,
    }));
  }, [data]);

  const dealDashboardNudgedAway =
    String(user?.role || '').toLowerCase() === 'sales_admin' && !isManager;

  if (dealDashboardNudgedAway) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-900">
          <h1 className="text-lg font-semibold text-amber-950">KPI Deal (Tủ bếp)</h1>
          <p className="mt-2 leading-relaxed">
            Bộ chỉ số deal (báo giá → ký hợp đồng, doanh số, SLA stage…) được chấm cho vai trò{' '}
            <strong>kinh doanh / phụ trách deal</strong>. Tài khoản <strong>Sales Admin</strong> dùng dashboard KPI riêng
            (tiếp cận lead, chất lượng dữ liệu, B1…).
          </p>
          <Link
            to="/crm/kpi/sales-admin"
            className="inline-flex items-center gap-1 mt-4 text-indigo-700 font-medium hover:underline"
          >
            Mở KPI Sales Admin (Tủ bếp) →
          </Link>
        </div>
      </div>
    );
  }

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

          {/* ── Tổng điểm từng Deal (CRM Ledger) ── */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-purple-600" />
                <h3 className="font-semibold text-sm text-gray-900">
                  Tổng điểm từng Deal (CRM Ledger)
                </h3>
                {dealScores?.deals?.length > 0 && (
                  <span className="text-xs text-gray-400">{dealScores.deals.length} deal</span>
                )}
              </div>
              {dealScores?.summary && (
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-emerald-600 font-semibold">+{dealScores.summary.total_plus?.toFixed(1) ?? '0'} điểm</span>
                  {dealScores.summary.total_minus < 0 && (
                    <span className="text-red-600 font-semibold">{dealScores.summary.total_minus?.toFixed(1)} điểm</span>
                  )}
                  <span className="font-bold text-gray-800 border-l border-gray-200 pl-3">
                    Tổng: <span className={dealScores.summary.total_net >= 0 ? 'text-emerald-700' : 'text-red-600'}>
                      {dealScores.summary.total_net > 0 ? '+' : ''}{dealScores.summary.total_net?.toFixed(1) ?? '0'} điểm
                    </span>
                  </span>
                </div>
              )}
            </div>

            {!dealScores || dealScores.deals?.length === 0 ? (
              <div className="py-6 text-center text-sm text-gray-400">
                Chưa có điểm ledger trong tháng này.
                <p className="text-xs mt-1 text-gray-300">Điểm được ghi tự động khi hoàn thành task, chuyển stage, chốt / mất deal.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-gray-500 uppercase border-b bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2">Deal</th>
                      <th className="text-left px-3 py-2">Stage hiện tại</th>
                      <th className="text-right px-3 py-2">Giá trị</th>
                      <th className="text-right px-3 py-2">Cộng / Trừ</th>
                      <th className="text-right px-3 py-2">Tổng điểm</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {dealScores.deals.map((item) => (
                      <DealScoreRow key={item.lead_id} item={item} />
                    ))}
                  </tbody>
                  <tfoot className="border-t bg-gray-50 text-xs font-semibold">
                    <tr>
                      <td colSpan={3} className="px-3 py-2 text-gray-600">
                        Tổng ({dealScores.deals.length} deal)
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="text-emerald-600">+{dealScores.summary.total_plus?.toFixed(1)}</span>
                        {dealScores.summary.total_minus < 0 && (
                          <span className="text-red-600 ml-1">{dealScores.summary.total_minus?.toFixed(1)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className={dealScores.summary.total_net >= 0 ? 'text-emerald-700' : 'text-red-600'}>
                          {dealScores.summary.total_net > 0 ? '+' : ''}{dealScores.summary.total_net?.toFixed(1)}
                        </span>
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="text-center py-16 text-gray-400">Chưa có dữ liệu.</div>
      )}
    </div>
  );
}
