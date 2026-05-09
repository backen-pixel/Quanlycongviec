import { useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatVND } from '../lib/utils';
import * as XLSX from 'xlsx';
import { Download, RefreshCw, AlertTriangle, Trophy } from 'lucide-react';
import KpiUserFilter from '../components/KpiUserFilter';

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
  const isManager = ['admin', 'manager', 'director', 'supervisor', 'superadmin'].includes(String(user?.role || '').toLowerCase());
  const [periodStart, setPeriodStart] = useState(getDefaultPeriodStart());
  const [filter, setFilter] = useState({ companyId: '', departmentId: '', q: '' });
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [defs, setDefs] = useState([]);
  const [err, setErr] = useState(null);

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

  const handleExport = () => {
    if (!data?.users) return;
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

      {loading ? (
        <div className="text-center py-16 text-gray-400">Đang tính KPI cho tất cả nhân viên… (có thể mất 30-60s)</div>
      ) : data ? (
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
      ) : null}
    </div>
  );
}
