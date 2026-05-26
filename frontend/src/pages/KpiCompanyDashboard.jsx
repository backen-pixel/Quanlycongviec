import { useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  BarChart3, Users, AlertTriangle, Award, TrendingUp, TrendingDown,
  RefreshCw, Filter, ShieldAlert, Clock, X, ChevronRight, Loader2,
  UserMinus, Activity, Trophy,
} from 'lucide-react';
import KpiUserFilter from '../components/KpiUserFilter';
import { usePresence, UserPresenceAvatar } from '../shared/context/PresenceContext';
import { getInitials, avatarColor } from '../lib/utils';
import { KPI_IMPROVEMENT_HINTS } from '../lib/kpiGroupATestMatrix';
import {
  fmtNumber,
  HeatmapCellRich,
  KpiGroupStackedBarChart,
  KpiRankingBarChart,
  KpiStatusDistributionBarChart,
  KpiStatusPieChart,
  KpiTrendLineChart,
  UserKpiDetailBarChart,
} from '../components/kpi/KpiCompanyOverviewCharts';

function defaultMonthStart() {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString().slice(0, 10);
}

const fmt = fmtNumber;

/** Gợi ý một dòng cho cột bảng nhân viên (bổ sung modal chi tiết). */
function quickHintForRow(r) {
  if (r.gating) {
    const code = r.gating_kpi;
    const hint = code && KPI_IMPROVEMENT_HINTS[code];
    return hint || KPI_IMPROVEMENT_HINTS.A4;
  }
  const A_CODES = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'];
  let worstCode = null;
  let worstRatio = 1.01;
  for (const code of A_CODES) {
    const s = r.scores_by_code?.[code];
    if (!s || s.ratio == null) continue;
    if (s.ratio < worstRatio) {
      worstRatio = s.ratio;
      worstCode = code;
    }
  }
  if (worstCode && worstRatio < 0.95 && KPI_IMPROVEMENT_HINTS[worstCode]) {
    return `${worstCode}: ${KPI_IMPROVEMENT_HINTS[worstCode]}`;
  }
  const slaTotal = (r.leads_over_sla || 0) + (r.tasks_overdue || 0);
  if (slaTotal > 0) {
    return `${slaTotal} lead/task quá SLA — ưu tiên xử lý; giảm ảnh hưởng A4–A6.`;
  }
  if ((r.total_score || 0) >= 100) return 'Duy trì nhịp; có thể chia sẻ best practice.';
  if ((r.total_score || 0) <= 0) return 'Chưa có điểm kỳ này — hoàn thành nhiệm vụ/đẩy deal hoặc nhờ quản lý «Tính lại KPI».';
  return '—';
}

function StatCard({ icon: Icon, label, value, suffix, hint, color = 'blue', trend }) {
  const palette = {
    blue: 'from-blue-500 to-blue-600 text-blue-100',
    emerald: 'from-emerald-500 to-emerald-600 text-emerald-100',
    amber: 'from-amber-500 to-amber-600 text-amber-100',
    red: 'from-red-500 to-red-600 text-red-100',
    purple: 'from-purple-500 to-purple-600 text-purple-100',
    slate: 'from-slate-500 to-slate-600 text-slate-100',
  }[color] || 'from-gray-500 to-gray-600 text-gray-100';
  return (
    <div className={`bg-gradient-to-br ${palette} rounded-xl shadow-sm p-4 text-white`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide opacity-90">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}{suffix && <span className="text-base font-medium ml-1 opacity-90">{suffix}</span>}</p>
          {hint && <p className="text-[11px] opacity-80 mt-1">{hint}</p>}
        </div>
        <Icon className="w-7 h-7 opacity-90" />
      </div>
      {trend != null && (
        <div className="mt-2 flex items-center gap-1 text-xs">
          {trend > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          <span>{trend > 0 ? '+' : ''}{fmt(trend, 1)} so kỳ trước</span>
        </div>
      )}
    </div>
  );
}

function ScoreBar({ score, max = 100 }) {
  const pct = Math.min(100, Math.max(0, (score / max) * 100));
  const color = pct >= 100 ? 'bg-emerald-500' : pct >= 80 ? 'bg-blue-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex min-w-[120px] max-w-[200px] items-center gap-2">
      <div className="relative h-2 min-w-[72px] flex-1 overflow-hidden rounded-full bg-gray-100">
        <div className={`absolute inset-y-0 left-0 ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-gray-600">{Math.round(pct)}%</span>
    </div>
  );
}

function UserDetailModal({ user, definitions, onClose }) {
  if (!user) return null;
  const groups = ['A', 'B', 'C'];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div>
            <h3 className="text-lg font-bold">{user.user.full_name || user.user.email}</h3>
            <p className="text-xs text-gray-500">
              {user.user.department?.name || '—'} · {user.user.role}
              {user.on_leave_today && <span className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] text-purple-700">Đang nghỉ</span>}
              {user.gating && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] text-red-700">Gating {user.gating_kpi}</span>}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg bg-blue-50 p-3">
              <p className="text-xs text-gray-600">Tổng điểm</p>
              <p className="text-2xl font-bold text-blue-700">{fmt(user.total_score, 1)}</p>
              {user.gating && <p className="text-[10px] text-red-600">cap 70 do {user.gating_kpi}</p>}
            </div>
            <div className="rounded-lg bg-amber-50 p-3">
              <p className="text-xs text-gray-600">Nhóm A</p>
              <p className="text-xl font-bold text-amber-700">{fmt(user.group_totals.A, 1)}</p>
              <p className="text-[10px] text-gray-500">tốc độ & kỷ luật</p>
            </div>
            <div className="rounded-lg bg-emerald-50 p-3">
              <p className="text-xs text-gray-600">Nhóm B</p>
              <p className="text-xl font-bold text-emerald-700">{fmt(user.group_totals.B, 1)}</p>
              <p className="text-[10px] text-gray-500">chuyển đổi</p>
            </div>
            <div className="rounded-lg bg-purple-50 p-3">
              <p className="text-xs text-gray-600">Nhóm C</p>
              <p className="text-xl font-bold text-purple-700">{fmt(user.group_totals.C, 1)}</p>
              <p className="text-[10px] text-gray-500">kết quả</p>
            </div>
          </div>

          <UserKpiDetailBarChart user={user} definitions={definitions} />

          {groups.map((g) => {
            const gDefs = definitions.filter((d) => d.group_code === g);
            return (
              <div key={g}>
                <h4 className="mb-2 text-sm font-semibold">Nhóm {g}</h4>
                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-700">
                      <tr>
                        <th className="px-3 py-2 text-left">Mã</th>
                        <th className="px-3 py-2 text-left">KPI</th>
                        <th className="px-3 py-2 text-right">Thực tế</th>
                        <th className="px-3 py-2 text-right">Mục tiêu</th>
                        <th className="px-3 py-2 text-right">Weight</th>
                        <th className="px-3 py-2 text-right">Điểm</th>
                        <th className="px-3 py-2">% đạt</th>
                        <th className="min-w-[180px] px-3 py-2 text-left">Gợi ý</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gDefs.map((d) => {
                        const s = user.scores_by_code[d.code];
                        const hint = KPI_IMPROVEMENT_HINTS[d.code];
                        const showHint = hint && (!s || s.ratio == null || Number(s.ratio) < 0.95);
                        return (
                          <tr key={d.code} className="border-t">
                            <td className="px-3 py-1.5 font-mono text-xs">{d.code}</td>
                            <td className="px-3 py-1.5">{d.name}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-xs">{s?.actual != null ? fmt(s.actual, 2) : '—'}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-xs text-gray-500">{s?.target != null ? fmt(s.target, 2) : '—'}</td>
                            <td className="px-3 py-1.5 text-right text-xs text-gray-500">{d.weight}</td>
                            <td className="px-3 py-1.5 text-right font-bold">{s ? fmt(s.capped, 1) : '0'}</td>
                            <td className="px-3 py-1.5">
                              <HeatmapCellRich
                                ratio={s?.ratio}
                                kpiCode={d.code}
                                kpiName={d.name}
                                score={s}
                                definition={d}
                              />
                            </td>
                            <td className="px-3 py-1.5 text-[10px] leading-snug text-gray-600">
                              {showHint ? hint : <span className="text-gray-300">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function KpiCompanyDashboard() {
  const { user: currentUser } = useAuth();
  const role = String(currentUser?.role || '').toLowerCase();
  const isManagerStrict = ['admin', 'manager', 'director', 'supervisor', 'superadmin', 'super_admin', 'administrator', 'region_admin'].includes(role);
  const canViewDashboard =
    isManagerStrict
    || (role === 'sales_admin' && currentUser?.company_id != null && String(currentUser.company_id).trim() !== '');

  const [periodStart, setPeriodStart] = useState(defaultMonthStart());
  const [filter, setFilter] = useState({ companyId: '', departmentId: '', q: '' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [sortBy, setSortBy] = useState('total_score');
  const [sortDir, setSortDir] = useState('desc');
  const [recomputing, setRecomputing] = useState(false);
  const [tab, setTab] = useState('table');

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const params = {
        period_start: periodStart, period_type: 'monthly', trend_months: 6,
        ...(filter.companyId ? { company_id: filter.companyId } : {}),
        ...(!filter.companyId && role === 'sales_admin' && currentUser?.company_id
          ? { company_id: String(currentUser.company_id) }
          : {}),
        ...(filter.departmentId ? { department_id: filter.departmentId } : {}),
        ...(filter.q?.trim() ? { q: filter.q.trim() } : {}),
      };
      const { data: res } = await api.get('/kpi/company-overview', { params });
      setData(res);
    } catch (e) { setErr(e.response?.data?.error || e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (canViewDashboard) load(); /* eslint-disable-next-line */ }, [periodStart, filter.companyId, filter.departmentId, filter.q]);

  const recompute = async () => {
    setRecomputing(true);
    try {
      await api.post('/kpi/recompute', {
        period_type: 'monthly', period_start: periodStart,
        company_id: filter.companyId || null,
        department_id: filter.departmentId || null,
        q: filter.q?.trim() || null,
      });
      await load();
    } catch (e) { setErr(e.response?.data?.error || e.message); }
    finally { setRecomputing(false); }
  };

  const presenceUserIds = useMemo(
    () => (data?.rows || []).map((r) => r.user?.id).filter(Boolean).slice(0, 150),
    [data?.rows],
  );
  usePresence(presenceUserIds, { enabled: presenceUserIds.length > 0 });

  const sortedRows = useMemo(() => {
    if (!data?.rows) return [];
    const rows = [...data.rows];
    rows.sort((a, b) => {
      const k = sortBy;
      let av = a[k], bv = b[k];
      if (k === 'name') { av = a.user.full_name || ''; bv = b.user.full_name || ''; }
      if (k === 'department') { av = a.user.department?.name || ''; bv = b.user.department?.name || ''; }
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? (av || 0) - (bv || 0) : (bv || 0) - (av || 0);
    });
    return rows;
  }, [data, sortBy, sortDir]);

  const setSort = (col) => {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(col); setSortDir(col === 'name' || col === 'department' ? 'asc' : 'desc'); }
  };

  if (!canViewDashboard) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Chỉ quản lý hoặc Sales Admin (đã gán công ty) xem được dashboard này.
        </div>
      </div>
    );
  }

  const stats = data?.stats || {};
  const definitions = data?.definitions || [];
  const groupColors = { A: 'bg-amber-50 border-amber-200', B: 'bg-emerald-50 border-emerald-200', C: 'bg-purple-50 border-purple-200' };

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-7 w-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">KPI nhân viên — Tổng quan</h1>
            <p className="text-sm text-gray-500">Theo dõi tình hình KPI của toàn bộ nhân viên trong công ty</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="month" value={periodStart.slice(0, 7)}
            onChange={(e) => setPeriodStart(`${e.target.value}-01`)}
            className="rounded-lg border px-3 py-1.5 text-sm" />
          <button type="button" onClick={load} className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Tải lại
          </button>
          {isManagerStrict && (
          <button type="button" onClick={recompute} disabled={recomputing}
            className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
            {recomputing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Tính lại KPI
          </button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-3">
        <div className="mb-2 flex items-center gap-2 text-xs text-gray-600"><Filter className="h-3.5 w-3.5" /> Bộ lọc</div>
        <KpiUserFilter value={filter} onChange={setFilter} />
      </div>

      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      {loading && !data ? (
        <div className="flex items-center justify-center gap-2 py-12 text-center text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" /> Đang tải dữ liệu KPI…
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
            <StatCard icon={Users} color="blue" label="Tổng NV" value={stats.total_users} hint={`${stats.scored_users} đã có điểm`} />
            <StatCard icon={Award} color="emerald" label="Điểm TB" value={fmt(stats.avg_total, 1)} suffix="đ" hint="Trung bình NV có điểm" />
            <StatCard icon={Trophy} color="purple" label="NV xuất sắc" value={stats.elite_count} hint="≥ 100 điểm" />
            <StatCard icon={ShieldAlert} color="red" label="Bị gating" value={stats.gating_count} hint="A4 < 80% → cap 70đ" />
            <StatCard icon={AlertTriangle} color="amber" label="Lead/Task quá SLA" value={stats.leads_over_sla_total + stats.tasks_overdue_total}
              hint={`${stats.leads_over_sla_total} lead · ${stats.tasks_overdue_total} task`} />
            <StatCard icon={UserMinus} color="slate" label="Đang nghỉ phép" value={stats.on_leave_today_count} hint="Hôm nay" />
          </div>

          <div className="flex gap-1 overflow-x-auto border-b border-gray-200">
            {[
              { id: 'table', label: 'Bảng nhân viên', icon: Users },
              { id: 'heatmap', label: 'Heatmap KPI', icon: Activity },
              { id: 'charts', label: 'Biểu đồ NV', icon: BarChart3 },
              { id: 'trend', label: 'Xu hướng', icon: TrendingUp },
              { id: 'alerts', label: `Cảnh báo (${stats.leads_over_sla_total + stats.tasks_overdue_total})`, icon: AlertTriangle },
            ].map((t) => {
              const Ic = t.icon;
              return (
                <button key={t.id} type="button" onClick={() => setTab(t.id)}
                  className={`flex shrink-0 items-center gap-1.5 border-b-2 -mb-px px-3 py-2 text-sm font-medium sm:px-4 ${
                    tab === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}>
                  <Ic className="h-3.5 w-3.5" />{t.label}
                </button>
              );
            })}
          </div>

          {tab === 'table' && (
            <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-700">
                  <tr>
                    <th className="cursor-pointer px-3 py-2.5 text-left hover:bg-gray-100" onClick={() => setSort('name')}>Nhân viên</th>
                    <th className="cursor-pointer px-3 py-2.5 text-left hover:bg-gray-100" onClick={() => setSort('department')}>Phòng ban</th>
                    <th className="cursor-pointer px-3 py-2.5 text-right hover:bg-gray-100" onClick={() => setSort('total_score')}>Tổng điểm</th>
                    <th className="px-3 py-2.5 text-left">Tiến độ</th>
                    <th className={`cursor-pointer px-3 py-2.5 text-right hover:bg-gray-100 ${groupColors.A}`}>A</th>
                    <th className={`cursor-pointer px-3 py-2.5 text-right hover:bg-gray-100 ${groupColors.B}`}>B</th>
                    <th className={`cursor-pointer px-3 py-2.5 text-right hover:bg-gray-100 ${groupColors.C}`}>C</th>
                    <th className="cursor-pointer px-3 py-2.5 text-right hover:bg-gray-100" onClick={() => setSort('leads_over_sla')}>Quá SLA</th>
                    <th className="px-3 py-2.5 text-center">Trạng thái</th>
                    <th className="min-w-[200px] max-w-[320px] px-3 py-2.5 text-left">Gợi ý nhanh</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.length === 0 ? (
                    <tr><td colSpan={11} className="py-8 text-center text-gray-400">Không có nhân viên khớp bộ lọc.</td></tr>
                  ) : sortedRows.map((r) => {
                    const status = r.gating ? 'gating' : r.total_score >= 100 ? 'elite' : r.total_score >= 80 ? 'good' : r.total_score >= 60 ? 'warning' : r.total_score > 0 ? 'weak' : 'no_data';
                    const statusLabel = {
                      elite: { l: 'Xuất sắc', c: 'bg-emerald-100 text-emerald-700' },
                      good: { l: 'Tốt', c: 'bg-blue-100 text-blue-700' },
                      warning: { l: 'Cần cải thiện', c: 'bg-amber-100 text-amber-700' },
                      weak: { l: 'Yếu', c: 'bg-red-100 text-red-700' },
                      gating: { l: 'Gating', c: 'bg-red-200 text-red-800' },
                      no_data: { l: 'Chưa có', c: 'bg-gray-100 text-gray-600' },
                    }[status];
                    return (
                      <tr key={r.user.id} className="cursor-pointer border-t hover:bg-blue-50/30" onClick={() => setSelectedUser(r)}>
                        <td className="px-3 py-2 font-medium">
                          <div className="flex items-center gap-2">
                            <UserPresenceAvatar user={r.user} size="sm">
                              <div
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                                style={{ backgroundColor: avatarColor(r.user.full_name || r.user.email) }}
                              >
                                {getInitials(r.user.full_name || r.user.email || '?')}
                              </div>
                            </UserPresenceAvatar>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate">{r.user.full_name || r.user.email}</span>
                                {r.on_leave_today && <UserMinus className="h-3.5 w-3.5 shrink-0 text-purple-500" />}
                              </div>
                              <div className="text-[11px] text-gray-500 truncate">{r.user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-700">{r.user.department?.name || '—'}</td>
                        <td className="px-3 py-2 text-right">
                          <span className={`text-base font-bold ${r.total_score >= 100 ? 'text-emerald-600' : r.total_score >= 80 ? 'text-blue-600' : r.total_score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                            {fmt(r.total_score, 1)}
                          </span>
                          {r.gating && <div className="text-[10px] text-red-600">cap 70 ({r.gating_kpi})</div>}
                        </td>
                        <td className="px-3 py-2"><ScoreBar score={r.total_score} /></td>
                        <td className={`px-3 py-2 text-right font-mono text-xs ${groupColors.A}`}>{fmt(r.group_totals.A, 1)}</td>
                        <td className={`px-3 py-2 text-right font-mono text-xs ${groupColors.B}`}>{fmt(r.group_totals.B, 1)}</td>
                        <td className={`px-3 py-2 text-right font-mono text-xs ${groupColors.C}`}>{fmt(r.group_totals.C, 1)}</td>
                        <td className="px-3 py-2 text-right text-xs">
                          {(r.leads_over_sla + r.tasks_overdue) > 0 ? (
                            <span className="font-bold text-red-600">{r.leads_over_sla + r.tasks_overdue}</span>
                          ) : <span className="text-gray-400">0</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusLabel.c}`}>{statusLabel.l}</span>
                        </td>
                        <td className="max-w-[320px] px-3 py-2 align-top text-xs text-gray-600">
                          <span className="line-clamp-3" title={quickHintForRow(r)}>{quickHintForRow(r)}</span>
                        </td>
                        <td className="px-3 py-2"><ChevronRight className="h-4 w-4 text-gray-400" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'heatmap' && (
            <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
              <div className="border-b px-3 py-2 text-xs text-gray-600">
                Hover ô để xem tên KPI, thực tế / mục tiêu / điểm. <span className="text-emerald-700">Xanh ≥ 100%</span> · <span className="text-amber-700">Vàng 70–85%</span> · <span className="text-red-700">Đỏ &lt; 50%</span>
              </div>
              <table className="text-sm">
                <thead className="bg-gray-50 text-xs">
                  <tr>
                    <th className="sticky left-0 z-10 min-w-[180px] bg-gray-50 px-3 py-2 text-left">Nhân viên</th>
                    {definitions.map((d) => (
                      <th key={d.code} className={`px-1 py-2 ${groupColors[d.group_code]}`} title={d.name}>
                        <div className="font-mono text-[11px]">{d.code}</div>
                        <div className="text-[9px] text-gray-500">w{d.weight}</div>
                      </th>
                    ))}
                    <th className="px-2 py-2 text-right">Tổng</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((r) => (
                    <tr key={r.user.id} className="cursor-pointer border-t hover:bg-blue-50/30" onClick={() => setSelectedUser(r)}>
                      <td className="sticky left-0 z-10 bg-white px-3 py-1.5 text-xs">
                        <div className="font-medium">{r.user.full_name || r.user.email}</div>
                        <div className="text-[10px] text-gray-500">{r.user.department?.name || '—'}</div>
                      </td>
                      {definitions.map((d) => {
                        const s = r.scores_by_code[d.code];
                        return (
                          <td key={d.code} className="px-1 py-1.5">
                            <HeatmapCellRich
                              ratio={s?.ratio}
                              kpiCode={d.code}
                              kpiName={d.name}
                              score={s}
                              definition={d}
                            />
                          </td>
                        );
                      })}
                      <td className="px-2 py-1.5 text-right font-bold">{fmt(r.total_score, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'charts' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                <KpiRankingBarChart rows={sortedRows} onSelectUser={setSelectedUser} />
                <KpiGroupStackedBarChart rows={sortedRows} onSelectUser={setSelectedUser} />
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <KpiStatusDistributionBarChart rows={sortedRows} />
                <KpiStatusPieChart rows={sortedRows} />
              </div>
            </div>
          )}

          {tab === 'trend' && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <KpiTrendLineChart trend={data.trend} />
              <div className="rounded-xl border border-gray-100 bg-white p-3">
                <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                  <Trophy className="h-4 w-4 text-amber-600" /> Top & Bottom 5
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1.5 text-xs font-semibold text-emerald-700">Top 5</p>
                    {sortedRows.slice(0, 5).map((r, i) => (
                      <div key={r.user.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-gray-50" onClick={() => setSelectedUser(r)}>
                        <span className="w-4 text-gray-400">{i + 1}</span>
                        <span className="flex-1 truncate">{r.user.full_name || r.user.email}</span>
                        <span className="font-bold text-emerald-700">{fmt(r.total_score, 1)}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-semibold text-red-700">Bottom 5 (có điểm)</p>
                    {[...sortedRows].filter((r) => r.total_score > 0).reverse().slice(0, 5).map((r, i) => (
                      <div key={r.user.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-gray-50" onClick={() => setSelectedUser(r)}>
                        <span className="w-4 text-gray-400">{i + 1}</span>
                        <span className="flex-1 truncate">{r.user.full_name || r.user.email}</span>
                        <span className="font-bold text-red-600">{fmt(r.total_score, 1)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'alerts' && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-red-100 bg-white">
                <div className="flex items-center gap-2 border-b bg-red-50 px-3 py-2">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <h3 className="text-sm font-semibold">Lead quá SLA ({stats.leads_over_sla_total})</h3>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {(data.alerts.leads_over_sla || []).length === 0 ? (
                    <div className="py-6 text-center text-sm text-gray-400">Không có lead nào quá SLA</div>
                  ) : data.alerts.leads_over_sla.map((l) => (
                    <div key={l.id} className="border-b px-3 py-2 text-xs hover:bg-red-50/30">
                      <div className="flex justify-between">
                        <span className="font-medium">{l.code || l.id.slice(0, 8)}</span>
                        <span className="text-red-600">SLA {l.sla_days} ngày</span>
                      </div>
                      <div className="truncate text-gray-600">{l.title || '—'}</div>
                      <div className="text-[10px] text-gray-500">stage: {l.stage} · vào stage: {new Date(l.stage_entered_at).toLocaleDateString('vi-VN')}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-amber-100 bg-white">
                <div className="flex items-center gap-2 border-b bg-amber-50 px-3 py-2">
                  <Clock className="h-4 w-4 text-amber-600" />
                  <h3 className="text-sm font-semibold">Task quá deadline ({stats.tasks_overdue_total})</h3>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {(data.alerts.tasks_overdue || []).length === 0 ? (
                    <div className="py-6 text-center text-sm text-gray-400">Không có task quá hạn</div>
                  ) : data.alerts.tasks_overdue.map((tk) => (
                    <div key={tk.id} className="border-b px-3 py-2 text-xs hover:bg-amber-50/30">
                      <div className="truncate font-medium">{tk.title}</div>
                      <div className="text-[10px] text-amber-700">deadline: {new Date(tk.deadline).toLocaleString('vi-VN')}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-purple-100 bg-white lg:col-span-2">
                <div className="flex items-center gap-2 border-b bg-purple-50 px-3 py-2">
                  <UserMinus className="h-4 w-4 text-purple-600" />
                  <h3 className="text-sm font-semibold">NV đang nghỉ phép hôm nay ({stats.on_leave_today_count})</h3>
                </div>
                <div className="flex flex-wrap gap-2 p-3">
                  {(data.alerts.on_leave_today || []).length === 0 ? (
                    <span className="text-sm text-gray-400">Không có NV nghỉ hôm nay</span>
                  ) : data.alerts.on_leave_today.map((l, i) => (
                    <div key={i} className="rounded-lg bg-purple-50 px-3 py-1.5 text-xs">
                      <span className="font-medium">{l.user?.full_name || l.user?.email || l.user_id?.slice(0, 8)}</span>
                      <span className="ml-2 text-gray-500">{l.start_date} → {l.end_date}</span>
                      <span className="ml-2 text-purple-700">{l.leave_type}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      ) : null}

      <UserDetailModal user={selectedUser} definitions={definitions} onClose={() => setSelectedUser(null)} />
    </div>
  );
}
