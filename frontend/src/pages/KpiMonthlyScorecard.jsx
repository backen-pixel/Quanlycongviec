import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatVND } from '../lib/utils';
import { loadXlsx } from '../lib/xlsxLoader';
import { Download, RefreshCw, AlertTriangle, Trophy, Award, ChevronDown, ChevronUp, CheckCircle2, XCircle, Users } from 'lucide-react';
import KpiUserFilter from '../components/KpiUserFilter';
import { KPI_SETTINGS_ROLE_FILTER_OPTIONS } from '../lib/kpiRoleApplies';

const EVENT_LABELS = {
  task_completed: 'Task hoàn thành',
  stage_changed: 'Chuyển stage',
  lead_converted: 'Lead → Deal',
  deal_won: 'Chốt HĐ',
  deal_lost: 'Deal mất',
  sla_breach: 'Vi phạm SLA',
  manual: 'Thủ công',
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
  const [open, setOpen] = useState(false);
  const lead = item.lead;
  const pts = item.total_points;
  return (
    <>
      <tr className="border-b last:border-0 hover:bg-gray-50 cursor-pointer text-sm" onClick={() => setOpen(v => !v)}>
        <td className="px-3 py-2">
          {lead ? (
            <div>
              <Link to={`/crm/leads/${lead.id}`} className="text-blue-600 hover:underline font-medium" onClick={e => e.stopPropagation()}>
                {lead.code || lead.title || lead.id.slice(0, 8)}
              </Link>
              {lead.title && lead.code && <div className="text-xs text-gray-400 truncate max-w-[160px]">{lead.title}</div>}
            </div>
          ) : <span className="text-xs text-gray-400">{item.lead_id.slice(0, 8)}</span>}
        </td>
        <td className="px-3 py-2 text-xs">
          {lead?.stage?.is_won && <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">Đã ký HĐ</span>}
          {lead?.stage?.is_lost && <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">Mất</span>}
          {!lead?.stage?.is_won && !lead?.stage?.is_lost && <span className="text-gray-600">{lead?.stage?.name || '—'}</span>}
        </td>
        <td className="px-3 py-2 text-xs text-right text-gray-500">{lead?.estimated_value ? formatVND(lead.estimated_value) : '—'}</td>
        <td className="px-3 py-2 text-right">
          <span className="text-xs text-emerald-600">+{item.plus_points.toFixed(1)}</span>
          {item.minus_points < 0 && <span className="text-xs text-red-600 ml-1">{item.minus_points.toFixed(1)}</span>}
        </td>
        <td className="px-3 py-2 text-right font-bold">
          <span className={pts > 0 ? 'text-emerald-700' : pts < 0 ? 'text-red-600' : 'text-gray-500'}>
            {pts > 0 ? '+' : ''}{pts.toFixed(1)}
          </span>
        </td>
        <td className="px-2 py-2 text-center text-gray-400">{open ? <ChevronUp className="h-3.5 w-3.5 mx-auto" /> : <ChevronDown className="h-3.5 w-3.5 mx-auto" />}</td>
      </tr>
      {open && item.events.length > 0 && (
        <tr className="bg-gray-50"><td colSpan={6} className="px-4 py-2">
          <div className="space-y-1">
            {item.events.map((ev, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                {ev.on_time === true && <CheckCircle2 className="h-3 w-3 text-emerald-500 flex-shrink-0" />}
                {ev.on_time === false && <XCircle className="h-3 w-3 text-red-500 flex-shrink-0" />}
                {ev.on_time === null && <span className="w-3 h-3 flex-shrink-0" />}
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${EVENT_COLORS[ev.event_type] || 'bg-gray-100'}`}>{EVENT_LABELS[ev.event_type] || ev.event_type}</span>
                {ev.kpi_code && <span className="text-gray-500">KPI {ev.kpi_code}</span>}
                <span className={`font-semibold ml-auto ${Number(ev.points) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {Number(ev.points) > 0 ? '+' : ''}{Number(ev.points).toFixed(1)} điểm
                </span>
              </div>
            ))}
          </div>
        </td></tr>
      )}
    </>
  );
}

function UserDealScorePanel({ userId, periodStart }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    api.get('/kpi/deal-scores', { params: { user_id: userId, period_start: periodStart } })
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [userId, periodStart]);
  if (loading) return <div className="py-4 text-center text-xs text-gray-400">Đang tải…</div>;
  if (!data || !data.deals?.length) return <div className="py-4 text-center text-xs text-gray-400">Chưa có điểm ledger trong kỳ này.</div>;
  return (
    <div>
      <div className="flex items-center gap-4 text-xs mb-2 px-1">
        <span className="text-emerald-600 font-semibold">+{data.summary.total_plus?.toFixed(1)} điểm</span>
        {data.summary.total_minus < 0 && <span className="text-red-600 font-semibold">{data.summary.total_minus?.toFixed(1)} điểm</span>}
        <span className="font-bold text-gray-700 border-l border-gray-200 pl-3">
          Tổng: <span className={data.summary.total_net >= 0 ? 'text-emerald-700' : 'text-red-600'}>
            {data.summary.total_net > 0 ? '+' : ''}{data.summary.total_net?.toFixed(1)}
          </span>
        </span>
      </div>
      <table className="w-full text-xs">
        <thead className="text-[10px] uppercase text-gray-500 border-b">
          <tr>
            <th className="text-left px-3 py-1.5">Deal</th>
            <th className="text-left px-3 py-1.5">Stage</th>
            <th className="text-right px-3 py-1.5">Giá trị</th>
            <th className="text-right px-3 py-1.5">Cộng/Trừ</th>
            <th className="text-right px-3 py-1.5">Tổng</th>
            <th className="w-6" />
          </tr>
        </thead>
        <tbody>{data.deals.map(item => <DealScoreRow key={item.lead_id} item={item} />)}</tbody>
      </table>
    </div>
  );
}

function getDefaultPeriodStart() {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString().slice(0, 10);
}

function fmtKpi(score) {
  const v = score?.actual_value;
  if (v == null) return '—';
  if (score.formula_type === 'revenue') return formatVND(v);
  if (score.formula_type === 'duration') {
    if (score.unit === 'day') return `${(Math.round(v * 10) / 10)} ngày`;
    if (score.unit === 'minute') return `${Math.round(v)} phút`;
  }
  if (score.unit === '%') return `${Math.round(v * 100) / 100}%`;
  if (score.unit === 'count') return Math.round(v);
  return Math.round(v * 100) / 100;
}

function rowTone(scoreEntry) {
  const v = scoreEntry?.capped_score;
  const w = scoreEntry?.weight_used;
  if (v == null || w == null || w === 0) return '';
  const ratio = v / w;
  if (ratio >= 1) return 'bg-emerald-50';
  if (ratio >= 0.8) return 'bg-amber-50';
  return 'bg-red-50';
}

export default function KpiMonthlyScorecard() {
  const { user } = useAuth();
  const isManager = ['admin', 'manager', 'director', 'supervisor', 'superadmin', 'super_admin', 'administrator', 'region_admin'].includes(String(user?.role || '').toLowerCase());
  const [periodStart, setPeriodStart] = useState(getDefaultPeriodStart());
  const [filter, setFilter] = useState({ companyId: '', departmentId: '', q: '', role: '' });
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [defs, setDefs] = useState([]);
  const [err, setErr] = useState(null);
  const [activeTab, setActiveTab] = useState('scorecard'); // 'scorecard' | 'deal-scores'
  const [expandedUser, setExpandedUser] = useState(null);

  const load = async () => {
    if (!isManager) return;
    setLoading(true);
    setErr(null);
    try {
      const params = {
        period_start: periodStart,
        ...(filter.companyId ? { company_id: filter.companyId } : {}),
        ...(filter.departmentId ? { department_id: filter.departmentId } : {}),
        ...(filter.q?.trim() ? { q: filter.q.trim() } : {}),
        ...(filter.role ? { roles: filter.role } : {}),
      };
      const [{ data: d1 }, { data: d2 }] = await Promise.all([
        api.get('/kpi/scorecard', { params }),
        api.get('/kpi/definitions'),
      ]);
      setData(d1);
      setDefs(d2.definitions || []);
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [periodStart]);

  const sortedDefs = useMemo(() => [...defs].sort((a, b) => a.code.localeCompare(b.code)), [defs]);

  const handleExport = async () => {
    if (!data?.users) return;
    const XLSX = await loadXlsx();
    const headers = ['Nhân viên', 'Email', 'Vai trò', 'Tổng điểm', 'Gating'];
    sortedDefs.forEach((d) => {
      headers.push(`${d.code} - ${d.name} (Thực tế)`);
      headers.push(`${d.code} - Điểm`);
    });

    const rows = data.users.map((u) => {
      const scoreMap = Object.fromEntries((u.scores || []).map((s) => [s.kpi_code, s]));
      const row = [
        u.user?.full_name || '—',
        u.user?.email || '',
        u.user?.role || '',
        u.total_score ?? '',
        u.gating_triggered ? `Vi phạm ${u.gating_kpi}` : '',
      ];
      sortedDefs.forEach((d) => {
        const s = scoreMap[d.code];
        row.push(s ? fmtKpi(s) : '—');
        row.push(s?.capped_score ?? '');
      });
      return row;
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `KPI_${periodStart.slice(0, 7)}`);
    XLSX.writeFile(wb, `KPI_TuBep_${periodStart.slice(0, 7)}.xlsx`);
  };

  if (!isManager) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
          Bạn không có quyền xem scorecard tổng. Liên hệ quản lý / admin.
        </div>
      </div>
    );
  }

  const usersSorted = useMemo(() => {
    if (!data?.users) return [];
    return [...data.users].sort((a, b) => (b.total_score ?? -1) - (a.total_score ?? -1));
  }, [data]);

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scorecard KPI tháng (Tủ bếp)</h1>
          <p className="text-sm text-gray-500 mt-0.5">15 KPI × nhân viên — dùng cho cuộc họp giao ban.</p>
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
          <button
            onClick={handleExport}
            disabled={!data?.users?.length}
            className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 flex items-center gap-1 disabled:opacity-50"
          >
            <Download className="w-4 h-4" /> Xuất Excel
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl p-3">
        <KpiUserFilter
          value={filter}
          onChange={setFilter}
        />
        <div className="relative mt-2 max-w-md">
          <Users className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <select
            value={filter.role || ''}
            onChange={(e) => setFilter((f) => ({ ...f, role: e.target.value }))}
            className="w-full pl-8 pr-2 py-1.5 border rounded-lg text-sm bg-white"
            aria-label="Lọc theo vai trò"
          >
            {KPI_SETTINGS_ROLE_FILTER_OPTIONS.map((o) => (
              <option key={o.value || 'all'} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-between gap-2 mt-3">
          <p className="text-xs text-gray-500">
            {data?.users ? `${data.users.length} nhân viên trong kết quả` : 'Lọc danh sách nhân viên hiển thị scorecard.'}
          </p>
          <button onClick={load} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700">
            Áp dụng bộ lọc
          </button>
        </div>
      </div>

      {err && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          Lỗi: {err}
        </div>
      )}

      {/* ── Tabs ── */}
      {data && (
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
          {[
            { id: 'scorecard', label: '15 KPI × Nhân viên' },
            { id: 'deal-scores', label: 'Điểm từng Deal (Ledger)' },
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === t.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400">Đang tính KPI cho tất cả nhân viên… (có thể mất 30-60s)</div>
      ) : data && activeTab === 'scorecard' ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-700 uppercase sticky top-0">
              <tr>
                <th className="text-left px-3 py-3 sticky left-0 bg-gray-50 z-10">Nhân viên</th>
                <th className="text-right px-3 py-3 sticky left-[200px] bg-gray-50 z-10">Tổng</th>
                {sortedDefs.map((d) => (
                  <th key={d.code} className="text-right px-3 py-3 whitespace-nowrap" title={d.name}>
                    <div>{d.code}</div>
                    <div className="font-normal text-[10px] text-gray-500">TS {d.weight}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {usersSorted.map((u, idx) => {
                const scoreMap = Object.fromEntries((u.scores || []).map((s) => [s.kpi_code, s]));
                return (
                  <tr key={u.user?.id || idx} className="border-b last:border-0 hover:bg-blue-50/30">
                    <td className="px-3 py-2 sticky left-0 bg-white">
                      <div className="flex items-center gap-2">
                        {idx < 3 && <Trophy className={`w-4 h-4 ${idx === 0 ? 'text-yellow-500' : idx === 1 ? 'text-gray-400' : 'text-amber-700'}`} />}
                        <div>
                          <div className="font-medium text-gray-900">{u.user?.full_name || '—'}</div>
                          <div className="text-xs text-gray-500">{u.user?.role}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 sticky left-[200px] bg-white text-right font-semibold">
                      <span className={u.gating_triggered ? 'text-red-600' : 'text-gray-900'}>
                        {u.total_score == null ? '—' : `${u.total_score}đ`}
                      </span>
                      {u.gating_triggered && (
                        <div className="text-[10px] text-red-600 flex items-center gap-1 justify-end">
                          <AlertTriangle className="w-3 h-3" /> Cap 70
                        </div>
                      )}
                    </td>
                    {sortedDefs.map((d) => {
                      const s = scoreMap[d.code];
                      return (
                        <td key={d.code} className={`px-3 py-2 text-right whitespace-nowrap ${rowTone(s)}`}>
                          <div className="text-gray-900">{s ? fmtKpi(s) : '—'}</div>
                          <div className="text-[10px] text-gray-500">
                            {s?.capped_score == null ? '' : `${s.capped_score}đ`}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {usersSorted.length === 0 && (
                <tr>
                  <td colSpan={sortedDefs.length + 2} className="text-center text-gray-400 py-12">
                    Không có nhân viên nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : data && activeTab === 'deal-scores' ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Award className="w-4 h-4 text-purple-600" />
            <h2 className="font-semibold text-gray-900">Điểm từng Deal theo nhân viên (CRM Ledger)</h2>
          </div>
          <p className="text-xs text-gray-500">Điểm được ghi tự động từ DB triggers khi task hoàn thành, chuyển stage, chốt / mất deal. Click vào dòng nhân viên để xem chi tiết.</p>
          <div className="space-y-3">
            {usersSorted.map((u, idx) => (
              <div key={u.user?.id || idx} className="border border-gray-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedUser(expandedUser === (u.user?.id || idx) ? null : (u.user?.id || idx))}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {idx < 3 && <Trophy className={`w-4 h-4 ${idx === 0 ? 'text-yellow-500' : idx === 1 ? 'text-gray-400' : 'text-amber-700'}`} />}
                    <span className="font-medium text-gray-900">{u.user?.full_name || '—'}</span>
                    <span className="text-xs text-gray-500">{u.user?.role}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500">
                      KPI 15-chỉ số: <strong className={u.gating_triggered ? 'text-red-600' : 'text-gray-900'}>{u.total_score ?? '—'}đ</strong>
                    </span>
                    {expandedUser === (u.user?.id || idx)
                      ? <ChevronUp className="h-4 w-4 text-gray-400" />
                      : <ChevronDown className="h-4 w-4 text-gray-400" />}
                  </div>
                </button>
                {expandedUser === (u.user?.id || idx) && u.user?.id && (
                  <div className="px-4 pb-4 pt-2">
                    <UserDealScorePanel userId={u.user.id} periodStart={periodStart} />
                  </div>
                )}
              </div>
            ))}
            {usersSorted.length === 0 && (
              <div className="text-center text-gray-400 py-8 text-sm">Không có nhân viên nào.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
