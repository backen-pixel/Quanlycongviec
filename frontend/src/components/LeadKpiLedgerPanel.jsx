import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';
import { BarChart3, Loader2, RefreshCw } from 'lucide-react';

function defaultMonthStart() {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString().slice(0, 10);
}

const EVENT_LABELS = {
  task_completed: 'Hoàn thành task',
  stage_changed: 'Đổi giai đoạn',
  deal_won: 'Deal thắng',
  deal_lost: 'Deal thua',
  sla_breach: 'Vi phạm SLA',
  manual: 'Điều chỉnh thủ công',
};

function fmtPoints(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const x = Number(n);
  const s = x.toLocaleString('vi-VN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
  return x > 0 ? `+${s}` : s;
}

export default function LeadKpiLedgerPanel({ leadId }) {
  const [periodStart, setPeriodStart] = useState(defaultMonthStart());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [payload, setPayload] = useState(null);

  const load = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    setErr(null);
    try {
      const { data } = await api.get(`/kpi/lead-ledger/${leadId}`, {
        params: { period_start: periodStart, period_type: 'monthly' },
      });
      setPayload(data);
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [leadId, periodStart]);

  useEffect(() => { load(); }, [load]);

  const s = payload?.summary;
  const entries = payload?.entries || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <BarChart3 className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            Điểm theo <strong>sổ cái CRM</strong> (sự kiện task, stage, won/lost, SLA…) trong kỳ — khác với bảng điểm KPI nhóm A (theo nhân viên + kỳ).
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 flex items-center gap-1.5">
            Kỳ
            <input
              type="month"
              value={periodStart.slice(0, 7)}
              onChange={(e) => setPeriodStart(`${e.target.value}-01`)}
              className="px-2 py-1 border border-gray-200 rounded text-sm"
            />
          </label>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Tải lại
          </button>
        </div>
      </div>

      {err && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</div>
      )}

      {loading && !payload ? (
        <div className="flex items-center justify-center gap-2 py-10 text-gray-500 text-sm">
          <Loader2 className="w-5 h-5 animate-spin" /> Đang tải sổ cái…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/80 px-3 py-2 text-center">
              <p className="text-[10px] uppercase text-emerald-800/80">Cộng</p>
              <p className="text-lg font-bold text-emerald-700">{fmtPoints(s?.total_plus ?? 0)}</p>
            </div>
            <div className="rounded-lg border border-red-100 bg-red-50/80 px-3 py-2 text-center">
              <p className="text-[10px] uppercase text-red-800/80">Trừ</p>
              <p className="text-lg font-bold text-red-700">{fmtPoints(s?.total_minus ?? 0)}</p>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50/80 px-3 py-2 text-center">
              <p className="text-[10px] uppercase text-blue-800/80">Ròng kỳ</p>
              <p className="text-lg font-bold text-blue-800">{fmtPoints(s?.total_net ?? 0)}</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-center">
              <p className="text-[10px] uppercase text-gray-600">Sự kiện</p>
              <p className="text-lg font-bold text-gray-800">{s?.event_count ?? 0}</p>
            </div>
          </div>

          {entries.length === 0 ? (
            <p className="text-sm text-gray-500 border border-dashed border-gray-200 rounded-lg px-4 py-6 text-center">
              Chưa có bản ghi sổ cái trong tháng này. Điểm chỉ xuất hiện khi có sự kiện (hoàn thành task, đổi stage, thắng/thua, vi phạm SLA…).
            </p>
          ) : (
            <div className="border border-gray-100 rounded-lg overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-600 sticky top-0 z-[1]">
                  <tr>
                    <th className="text-left px-2 py-2 font-medium">Thời điểm</th>
                    <th className="text-left px-2 py-2 font-medium">Sự kiện</th>
                    <th className="text-left px-2 py-2 font-medium">KPI</th>
                    <th className="text-right px-2 py-2 font-medium">Điểm</th>
                    <th className="text-left px-2 py-2 font-medium min-w-[140px]">Lý do</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((row) => (
                    <tr key={row.id} className="border-t border-gray-50 hover:bg-blue-50/40">
                      <td className="px-2 py-1.5 whitespace-nowrap text-gray-600">
                        {row.occurred_at ? new Date(row.occurred_at).toLocaleString('vi-VN') : '—'}
                      </td>
                      <td className="px-2 py-1.5">
                        {EVENT_LABELS[row.event_type] || row.event_type}
                        {row.on_time === true && <span className="ml-1 text-emerald-600">· đúng hạn</span>}
                        {row.on_time === false && <span className="ml-1 text-amber-700">· trễ</span>}
                      </td>
                      <td className="px-2 py-1.5 font-mono text-[11px]">{row.source_kpi_code || '—'}</td>
                      <td className={`px-2 py-1.5 text-right font-semibold ${Number(row.points) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {fmtPoints(row.points)}
                      </td>
                      <td className="px-2 py-1.5 text-gray-600 max-w-[280px] truncate" title={row.reason || ''}>
                        {row.reason || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
