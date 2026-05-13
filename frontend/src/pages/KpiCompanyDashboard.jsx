import { useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  BarChart3, Users, AlertTriangle, Award, TrendingUp, TrendingDown,
  RefreshCw, Filter, ShieldAlert, Clock, X, ChevronRight, Loader2,
  CheckCircle2, UserMinus, Activity, Trophy, Target,
} from 'lucide-react';
import KpiUserFilter from '../components/KpiUserFilter';

function defaultMonthStart() {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString().slice(0, 10);
}

function fmt(n, digits = 1) {
  if (n == null || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString('vi-VN', { maximumFractionDigits: digits });
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
    <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden min-w-[80px]">
      <div className={`absolute inset-y-0 left-0 ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function HeatmapCell({ ratio }) {
  if (ratio == null) return <div className="w-8 h-6 bg-gray-100 rounded" title="—" />;
  const r = Math.min(1.2, ratio);
  let bg = 'bg-red-200', text = 'text-red-800';
  if (r >= 1) { bg = 'bg-emerald-300'; text = 'text-emerald-900'; }
  else if (r >= 0.85) { bg = 'bg-emerald-100'; text = 'text-emerald-800'; }
  else if (r >= 0.7) { bg = 'bg-amber-100'; text = 'text-amber-800'; }
  else if (r >= 0.5) { bg = 'bg-orange-200'; text = 'text-orange-900'; }
  return (
    <div className={`w-10 h-7 ${bg} ${text} rounded text-[10px] font-mono flex items-center justify-center`}
      title={`${(r * 100).toFixed(0)}%`}>
      {(r * 100).toFixed(0)}
    </div>
  );
}

function TrendChart({ data }) {
  if (!data || data.length === 0) return <div className="text-xs text-gray-400 text-center py-6">Chưa có dữ liệu xu hướng</div>;
  const max = Math.max(120, ...data.map((d) => d.avg_total));
  const min = Math.min(0, ...data.map((d) => d.avg_total));
  const W = 100, H = 40;
  const xStep = data.length > 1 ? W / (data.length - 1) : 0;
  const points = data.map((d, i) => {
    const x = i * xStep;
    const y = H - ((d.avg_total - min) / (max - min || 1)) * H;
    return { x, y, ...d };
  });
  const path = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
          <Activity className="w-4 h-4 text-blue-600" /> Xu hướng điểm KPI trung bình
        </h3>
        <span className="text-xs text-gray-500">{data.length} kỳ gần nhất</span>
      </div>
      <svg viewBox={`-2 -4 ${W + 4} ${H + 8}`} className="w-full h-40">
        <line x1="0" y1={H} x2={W} y2={H} stroke="#e5e7eb" strokeWidth="0.3" />
        <line x1="0" y1={H - ((100 - min) / (max - min || 1)) * H} x2={W}
          y2={H - ((100 - min) / (max - min || 1)) * H}
          stroke="#10b981" strokeDasharray="1,1" strokeWidth="0.3" opacity="0.5" />
        <path d={path} fill="none" stroke="#3b82f6" strokeWidth="0.6" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="0.8" fill="#3b82f6" />
            <text x={p.x} y={p.y - 1.5} fontSize="2.4" textAnchor="middle" fill="#374151">{p.avg_total.toFixed(0)}</text>
            <text x={p.x} y={H + 4} fontSize="2.2" textAnchor="middle" fill="#9ca3af">{p.period_start.slice(2, 7)}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function UserDetailModal({ user, definitions, onClose }) {
  if (!user) return null;
  const groups = ['A', 'B', 'C'];
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <div>
            <h3 className="font-bold text-lg">{user.user.full_name || user.user.email}</h3>
            <p className="text-xs text-gray-500">
              {user.user.department?.name || '—'} · {user.user.role}
              {user.on_leave_today && <span className="ml-2 px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-[10px]">Đang nghỉ</span>}
              {user.gating && <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px]">Gating {user.gating_kpi}</span>}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-xs text-gray-600">Tổng điểm</p>
              <p className="text-2xl font-bold text-blue-700">{fmt(user.total_score, 1)}</p>
              {user.gating && <p className="text-[10px] text-red-600">cap 70 do {user.gating_kpi}</p>}
            </div>
            <div className="bg-amber-50 rounded-lg p-3">
              <p className="text-xs text-gray-600">Nhóm A</p>
              <p className="text-xl font-bold text-amber-700">{fmt(user.group_totals.A, 1)}</p>
              <p className="text-[10px] text-gray-500">tốc độ & kỷ luật</p>
            </div>
            <div className="bg-emerald-50 rounded-lg p-3">
              <p className="text-xs text-gray-600">Nhóm B</p>
              <p className="text-xl font-bold text-emerald-700">{fmt(user.group_totals.B, 1)}</p>
              <p className="text-[10px] text-gray-500">chuyển đổi</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-3">
              <p className="text-xs text-gray-600">Nhóm C</p>
              <p className="text-xl font-bold text-purple-700">{fmt(user.group_totals.C, 1)}</p>
              <p className="text-[10px] text-gray-500">kết quả</p>
            </div>
          </div>

          {groups.map((g) => {
            const gDefs = definitions.filter((d) => d.group_code === g);
            return (
              <div key={g}>
                <h4 className="text-sm font-semibold mb-2">Nhóm {g}</h4>
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-700">
                      <tr>
                        <th className="text-left px-3 py-2">Mã</th>
                        <th className="text-left px-3 py-2">KPI</th>
                        <th className="text-right px-3 py-2">Thực tế</th>
                        <th className="text-right px-3 py-2">Mục tiêu</th>
                        <th className="text-right px-3 py-2">Weight</th>
                        <th className="text-right px-3 py-2">Điểm</th>
                        <th className="px-3 py-2">% đạt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gDefs.map((d) => {
                        const s = user.scores_by_code[d.code];
                        return (
                          <tr key={d.code} className="border-t">
                            <td className="px-3 py-1.5 font-mono text-xs">{d.code}</td>
                            <td className="px-3 py-1.5">{d.name}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-xs">{s?.actual != null ? fmt(s.actual, 2) : '—'}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-xs text-gray-500">{s?.target != null ? fmt(s.target, 2) : '—'}</td>
                            <td className="px-3 py-1.5 text-right text-xs text-gray-500">{d.weight}</td>
                            <td className="px-3 py-1.5 text-right font-bold">{s ? fmt(s.capped, 1) : '0'}</td>
                            <td className="px-3 py-1.5"><HeatmapCell ratio={s?.ratio} /></td>
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
  const isManager = ['admin', 'manager', 'director', 'supervisor', 'superadmin', 'super_admin', 'administrator'].includes(role);

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
        ...(filter.departmentId ? { department_id: filter.departmentId } : {}),
        ...(filter.q?.trim() ? { q: filter.q.trim() } : {}),
      };
      const { data } = await api.get('/kpi/company-overview', { params });
      setData(data);
    } catch (e) { setErr(e.response?.data?.error || e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (isManager) load(); /* eslint-disable-next-line */ }, [periodStart, filter.companyId, filter.departmentId, filter.q]);

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

  if (!isManager) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
          Chỉ admin / manager xem được dashboard này.
        </div>
      </div>
    );
  }

  const stats = data?.stats || {};
  const definitions = data?.definitions || [];
  const groupColors = { A: 'bg-amber-50 border-amber-200', B: 'bg-emerald-50 border-emerald-200', C: 'bg-purple-50 border-purple-200' };

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-7 h-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">KPI nhân viên — Tổng quan</h1>
            <p className="text-sm text-gray-500">Theo dõi tình hình KPI của toàn bộ nhân viên trong công ty</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" value={periodStart.slice(0, 7)}
            onChange={(e) => setPeriodStart(`${e.target.value}-01`)}
            className="px-3 py-1.5 border rounded-lg text-sm" />
          <button onClick={load} className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50 flex items-center gap-1">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Tải lại
          </button>
          <button onClick={recompute} disabled={recomputing}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
            {recomputing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Tính lại KPI
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl p-3">
        <div className="flex items-center gap-2 text-xs text-gray-600 mb-2"><Filter className="w-3.5 h-3.5" /> Bộ lọc</div>
        <KpiUserFilter value={filter} onChange={setFilter} />
      </div>

      {err && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{err}</div>}

      {loading && !data ? (
        <div className="text-center py-12 text-gray-400 flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Đang tải dữ liệu KPI…
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <StatCard icon={Users} color="blue" label="Tổng NV" value={stats.total_users} hint={`${stats.scored_users} đã có điểm`} />
            <StatCard icon={Award} color="emerald" label="Điểm TB" value={fmt(stats.avg_total, 1)} suffix="đ" hint="Trung bình NV có điểm" />
            <StatCard icon={Trophy} color="purple" label="NV xuất sắc" value={stats.elite_count} hint="≥ 100 điểm" />
            <StatCard icon={ShieldAlert} color="red" label="Bị gating" value={stats.gating_count} hint="A4 < 80% → cap 70đ" />
            <StatCard icon={AlertTriangle} color="amber" label="Lead/Task quá SLA" value={stats.leads_over_sla_total + stats.tasks_overdue_total}
              hint={`${stats.leads_over_sla_total} lead · ${stats.tasks_overdue_total} task`} />
            <StatCard icon={UserMinus} color="slate" label="Đang nghỉ phép" value={stats.on_leave_today_count} hint="Hôm nay" />
          </div>

          <div className="flex gap-1 border-b border-gray-200">
            {[
              { id: 'table', label: 'Bảng nhân viên', icon: Users },
              { id: 'heatmap', label: 'Heatmap KPI', icon: Activity },
              { id: 'trend', label: 'Xu hướng', icon: TrendingUp },
              { id: 'alerts', label: `Cảnh báo (${stats.leads_over_sla_total + stats.tasks_overdue_total})`, icon: AlertTriangle },
            ].map((t) => {
              const Ic = t.icon;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-1.5 ${
                    tab === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}>
                  <Ic className="w-3.5 h-3.5" />{t.label}
                </button>
              );
            })}
          </div>

          {tab === 'table' && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-700 uppercase">
                  <tr>
                    <th className="text-left px-3 py-2.5 cursor-pointer hover:bg-gray-100" onClick={() => setSort('name')}>Nhân viên</th>
                    <th className="text-left px-3 py-2.5 cursor-pointer hover:bg-gray-100" onClick={() => setSort('department')}>Phòng ban</th>
                    <th className="text-right px-3 py-2.5 cursor-pointer hover:bg-gray-100" onClick={() => setSort('total_score')}>Tổng điểm</th>
                    <th className="text-left px-3 py-2.5">Tiến độ</th>
                    <th className={`text-right px-3 py-2.5 cursor-pointer hover:bg-gray-100 ${groupColors.A}`}>A</th>
                    <th className={`text-right px-3 py-2.5 cursor-pointer hover:bg-gray-100 ${groupColors.B}`}>B</th>
                    <th className={`text-right px-3 py-2.5 cursor-pointer hover:bg-gray-100 ${groupColors.C}`}>C</th>
                    <th className="text-right px-3 py-2.5 cursor-pointer hover:bg-gray-100" onClick={() => setSort('leads_over_sla')}>Quá SLA</th>
                    <th className="text-center px-3 py-2.5">Trạng thái</th>
                    <th className="px-3 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.length === 0 ? (
                    <tr><td colSpan={10} className="text-center text-gray-400 py-8">Không có nhân viên khớp bộ lọc.</td></tr>
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
                      <tr key={r.user.id} className="border-t hover:bg-blue-50/30 cursor-pointer" onClick={() => setSelectedUser(r)}>
                        <td className="px-3 py-2 font-medium">
                          <div className="flex items-center gap-2">
                            {r.user.full_name || r.user.email}
                            {r.on_leave_today && <UserMinus className="w-3.5 h-3.5 text-purple-500" />}
                          </div>
                          <div className="text-[11px] text-gray-500">{r.user.email}</div>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-700">{r.user.department?.name || '—'}</td>
                        <td className="px-3 py-2 text-right">
                          <span className={`font-bold text-base ${r.total_score >= 100 ? 'text-emerald-600' : r.total_score >= 80 ? 'text-blue-600' : r.total_score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
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
                            <span className="text-red-600 font-bold">{r.leads_over_sla + r.tasks_overdue}</span>
                          ) : <span className="text-gray-400">0</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${statusLabel.c}`}>{statusLabel.l}</span>
                        </td>
                        <td className="px-3 py-2"><ChevronRight className="w-4 h-4 text-gray-400" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'heatmap' && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
              <div className="px-3 py-2 text-xs text-gray-600 border-b">
                Mỗi ô = % đạt KPI (capped/weight). <span className="text-emerald-700">Xanh ≥ 100%</span> · <span className="text-amber-700">Vàng 70-85%</span> · <span className="text-red-700">Đỏ &lt; 50%</span>
              </div>
              <table className="text-sm">
                <thead className="bg-gray-50 text-xs">
                  <tr>
                    <th className="text-left px-3 py-2 sticky left-0 bg-gray-50 z-10 min-w-[180px]">Nhân viên</th>
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
                    <tr key={r.user.id} className="border-t hover:bg-blue-50/30 cursor-pointer" onClick={() => setSelectedUser(r)}>
                      <td className="px-3 py-1.5 sticky left-0 bg-white z-10 text-xs">
                        <div className="font-medium">{r.user.full_name || r.user.email}</div>
                        <div className="text-[10px] text-gray-500">{r.user.department?.name || '—'}</div>
                      </td>
                      {definitions.map((d) => {
                        const s = r.scores_by_code[d.code];
                        return <td key={d.code} className="px-1 py-1.5"><HeatmapCell ratio={s?.ratio} /></td>;
                      })}
                      <td className="px-2 py-1.5 text-right font-bold">{fmt(r.total_score, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'trend' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <TrendChart data={data.trend} />
              <div className="bg-white border border-gray-100 rounded-xl p-3">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-3">
                  <Trophy className="w-4 h-4 text-amber-600" /> Top & Bottom 5
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-emerald-700 font-semibold mb-1.5">Top 5</p>
                    {sortedRows.slice(0, 5).map((r, i) => (
                      <div key={r.user.id} className="flex items-center gap-2 py-1 text-xs cursor-pointer hover:bg-gray-50 rounded px-1" onClick={() => setSelectedUser(r)}>
                        <span className="w-4 text-gray-400">{i + 1}</span>
                        <span className="flex-1 truncate">{r.user.full_name || r.user.email}</span>
                        <span className="font-bold text-emerald-700">{fmt(r.total_score, 1)}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="text-xs text-red-700 font-semibold mb-1.5">Bottom 5 (có điểm)</p>
                    {[...sortedRows].filter((r) => r.total_score > 0).reverse().slice(0, 5).map((r, i) => (
                      <div key={r.user.id} className="flex items-center gap-2 py-1 text-xs cursor-pointer hover:bg-gray-50 rounded px-1" onClick={() => setSelectedUser(r)}>
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="bg-white border border-red-100 rounded-xl">
                <div className="px-3 py-2 border-b bg-red-50 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  <h3 className="text-sm font-semibold">Lead quá SLA ({stats.leads_over_sla_total})</h3>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {(data.alerts.leads_over_sla || []).length === 0 ? (
                    <div className="text-center py-6 text-gray-400 text-sm">Không có lead nào quá SLA</div>
                  ) : data.alerts.leads_over_sla.map((l) => (
                    <div key={l.id} className="px-3 py-2 border-b hover:bg-red-50/30 text-xs">
                      <div className="flex justify-between">
                        <span className="font-medium">{l.code || l.id.slice(0, 8)}</span>
                        <span className="text-red-600">SLA {l.sla_days} ngày</span>
                      </div>
                      <div className="text-gray-600 truncate">{l.title || '—'}</div>
                      <div className="text-[10px] text-gray-500">stage: {l.stage} · vào stage: {new Date(l.stage_entered_at).toLocaleDateString('vi-VN')}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-amber-100 rounded-xl">
                <div className="px-3 py-2 border-b bg-amber-50 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600" />
                  <h3 className="text-sm font-semibold">Task quá deadline ({stats.tasks_overdue_total})</h3>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {(data.alerts.tasks_overdue || []).length === 0 ? (
                    <div className="text-center py-6 text-gray-400 text-sm">Không có task quá hạn</div>
                  ) : data.alerts.tasks_overdue.map((t) => (
                    <div key={t.id} className="px-3 py-2 border-b hover:bg-amber-50/30 text-xs">
                      <div className="font-medium truncate">{t.title}</div>
                      <div className="text-[10px] text-amber-700">deadline: {new Date(t.deadline).toLocaleString('vi-VN')}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-purple-100 rounded-xl lg:col-span-2">
                <div className="px-3 py-2 border-b bg-purple-50 flex items-center gap-2">
                  <UserMinus className="w-4 h-4 text-purple-600" />
                  <h3 className="text-sm font-semibold">NV đang nghỉ phép hôm nay ({stats.on_leave_today_count})</h3>
                </div>
                <div className="p-3 flex flex-wrap gap-2">
                  {(data.alerts.on_leave_today || []).length === 0 ? (
                    <span className="text-sm text-gray-400">Không có NV nghỉ hôm nay</span>
                  ) : data.alerts.on_leave_today.map((l, i) => (
                    <div key={i} className="px-3 py-1.5 bg-purple-50 rounded-lg text-xs">
                      <span className="font-medium">{l.user?.full_name || l.user?.email || l.user_id?.slice(0, 8)}</span>
                      <span className="text-gray-500 ml-2">{l.start_date} → {l.end_date}</span>
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
