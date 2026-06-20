import { useEffect, useMemo, useState } from 'react';
import api from '../../lib/api';
import { formatVND } from '../../lib/utils';
import { loadXlsx } from '../../lib/xlsxLoader';
import {
  Activity,
  Download,
  FileText,
  Layers,
  Mail,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

function truncLabel(s, max = 22) {
  if (!s) return '—';
  const t = String(s);
  return t.length <= max ? t : `${t.slice(0, Math.max(0, max - 1))}…`;
}

const STACK_COLORS = {
  'Đã chốt': '#059669',
  Thua: '#e11d48',
  'Đang mở': '#0284c7',
};

/**
 * Modal chi tiết pipeline theo nhân viên (dùng chung BC tổ chức + BC Lead/Deal NV).
 */
export default function CrmStaffPipelineDetailModal({
  open,
  onClose,
  userId,
  userLabel = '',
  queryParams = {},
  typeView = 'all',
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [data, setData] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    if (!open || !userId) return undefined;
    let cancel = false;
    (async () => {
      setLoading(true);
      setErr(null);
      setData(null);
      try {
        const params = {
          date_from: queryParams.date_from,
          date_to: queryParams.date_to,
          ...(queryParams.company_id ? { company_id: queryParams.company_id } : {}),
          ...(queryParams.region_id ? { region_id: queryParams.region_id } : {}),
          ...(typeView !== 'all' ? { type: typeView } : {}),
        };
        const { data: res } = await api.get(`/crm/reports/staff-lead-deal/${userId}/pipelines`, { params });
        if (!cancel) setData(res);
      } catch (e) {
        if (!cancel) setErr(e.response?.data?.error || e.message);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [open, userId, queryParams.date_from, queryParams.date_to, queryParams.company_id, queryParams.region_id, typeView]);

  const summary = data?.summary;
  const pipelines = data?.pipelines || [];

  const stackedChart = useMemo(
    () => pipelines
      .filter((p) => (p.deal_count || 0) > 0)
      .sort((a, b) => (b.deal_count || 0) - (a.deal_count || 0))
      .slice(0, 10)
      .map((p) => {
        const open = p.open_deal_count ?? Math.max(0, (p.deal_count || 0) - (p.won_deal_count || 0) - (p.lost_deal_count || 0));
        return {
          name: truncLabel(p.pipeline_name, 16),
          'Đã chốt': p.won_deal_count || 0,
          Thua: p.lost_deal_count || 0,
          'Đang mở': open,
        };
      }),
    [pipelines],
  );

  const downloadPdf = async () => {
    if (!userId) return;
    setPdfLoading(true);
    try {
      const res = await api.get(`/crm/reports/staff-lead-deal/${userId}/pipelines/export.pdf`, {
        params: {
          date_from: queryParams.date_from,
          date_to: queryParams.date_to,
          ...(queryParams.company_id ? { company_id: queryParams.company_id } : {}),
        },
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      const slug = (data?.full_name || userLabel || 'pipeline').replace(/\s+/g, '_');
      a.download = `BAO_CAO_PIPELINE_${slug}_${queryParams.date_from}_${queryParams.date_to}.pdf`;
      a.click();
      URL.revokeObjectURL(href);
    } catch (e) {
      setErr(e.response?.data?.error || e.message || 'Lỗi xuất PDF');
    } finally {
      setPdfLoading(false);
    }
  };

  const exportExcel = async () => {
    if (!pipelines.length) return;
    const XLSX = await loadXlsx();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        pipelines.map((p) => ({
          Pipeline: p.pipeline_name || '',
          Lead: p.lead_count ?? 0,
          'GT Lead': p.lead_value ?? 0,
          Deal: p.deal_count ?? 0,
          'GT Deal': p.deal_value ?? 0,
          'Tổng GT': p.total_value ?? 0,
          'Chốt SL': p.won_deal_count ?? 0,
          'GT chốt': p.won_value ?? 0,
          'Thua SL': p.lost_deal_count ?? 0,
        })),
      ),
      'Pipeline',
    );
    const slug = (data?.full_name || userLabel || 'chi-tiet').replace(/\s+/g, '_');
    XLSX.writeFile(wb, `crm-pipeline-${slug}_${queryParams.date_from}_${queryParams.date_to}.xlsx`);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col border border-teal-200/80"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3.5 border-b border-teal-100 bg-gradient-to-r from-teal-600 to-cyan-600 text-white">
          <div className="min-w-0">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Layers className="w-5 h-5 shrink-0" />
              Chi tiết pipeline — {data?.full_name || userLabel || 'Nhân viên'}
            </h2>
            {data && (
              <p className="text-sm text-teal-50 mt-0.5 truncate">
                {data.department_name ? `${data.department_name} · ` : ''}
                {data.date_from} → {data.date_to}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={downloadPdf}
              disabled={pdfLoading || !userId}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-semibold bg-rose-500 rounded-lg disabled:opacity-40"
            >
              <FileText className="w-4 h-4" />
              {pdfLoading ? '…' : 'PDF'}
            </button>
            <button
              type="button"
              onClick={exportExcel}
              disabled={!pipelines.length}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-semibold bg-emerald-500 rounded-lg disabled:opacity-40"
            >
              <Download className="w-4 h-4" />
              Excel
            </button>
            <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/15" aria-label="Đóng">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4">
          {loading && <p className="text-center py-12 text-slate-400">Đang tải chi tiết…</p>}
          {err && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
          )}
          {!loading && !err && data && (
            <>
              <div className="flex flex-wrap gap-2 text-sm">
                {data.email && (
                  <span className="inline-flex items-center gap-1.5 text-slate-700">
                    <Mail className="w-4 h-4 text-teal-600" />
                    {data.email}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                  <Activity className="w-3.5 h-3.5" />
                  Cơ sở: {data.basis || 'created_at'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
                  <p className="text-[10px] font-bold uppercase text-blue-800">Tổng pipeline</p>
                  <p className="mt-1 text-lg font-bold tabular-nums">{formatVND(summary?.total_pipeline_value ?? 0)}</p>
                </div>
                <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3">
                  <p className="text-[10px] font-bold uppercase text-indigo-800">Lead</p>
                  <p className="mt-1 text-xl font-bold">{summary?.lead_count ?? 0}</p>
                  <p className="text-xs tabular-nums text-slate-600">{formatVND(summary?.lead_value ?? 0)}</p>
                </div>
                <div className="rounded-xl border border-cyan-100 bg-cyan-50 p-3">
                  <p className="text-[10px] font-bold uppercase text-cyan-900">Deal</p>
                  <p className="mt-1 text-xl font-bold">{summary?.deal_count ?? 0}</p>
                  <p className="text-xs tabular-nums text-slate-600">{formatVND(summary?.deal_value ?? 0)}</p>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                  <p className="text-[10px] font-bold uppercase text-emerald-800">Đã chốt</p>
                  <p className="mt-1 text-xl font-bold">{summary?.won_deal_count ?? 0}</p>
                  <p className="text-xs tabular-nums text-emerald-700">{formatVND(summary?.won_value ?? 0)}</p>
                </div>
              </div>

              {stackedChart.length > 0 && (
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-sm font-bold text-slate-800 mb-3">Deal theo pipeline (chốt / thua / mở)</p>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stackedChart} layout="vertical" margin={{ left: 4, right: 12 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                        <YAxis type="category" dataKey="name" width={96} tick={{ fontSize: 10 }} />
                        <RechartsTooltip />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        {Object.entries(STACK_COLORS).map(([key, color]) => (
                          <Bar key={key} dataKey={key} stackId="deal" fill={color} radius={key === 'Đang mở' ? [0, 4, 4, 0] : undefined} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] font-bold uppercase bg-slate-50 text-slate-600">
                      <th className="py-2 px-3 text-left">Pipeline</th>
                      <th className="py-2 px-2 text-right">Lead</th>
                      <th className="py-2 px-2 text-right">Deal</th>
                      <th className="py-2 px-2 text-right">Tổng GT</th>
                      <th className="py-2 px-2 text-right">Chốt</th>
                      <th className="py-2 px-2 text-right">Thua</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pipelines.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500">Chưa có dữ liệu pipeline</td>
                      </tr>
                    ) : (
                      pipelines.map((p, idx) => (
                        <tr key={p.pipeline_id || idx} className={idx % 2 ? 'bg-slate-50/50' : ''}>
                          <td className="py-2.5 px-3 font-medium text-slate-900">{p.pipeline_name || '—'}</td>
                          <td className="py-2.5 px-2 text-right tabular-nums">{p.lead_count ?? 0}</td>
                          <td className="py-2.5 px-2 text-right tabular-nums">{p.deal_count ?? 0}</td>
                          <td className="py-2.5 px-2 text-right tabular-nums text-xs">{formatVND(p.total_value ?? 0)}</td>
                          <td className="py-2.5 px-2 text-right tabular-nums text-emerald-700">{p.won_deal_count ?? 0}</td>
                          <td className="py-2.5 px-2 text-right tabular-nums text-red-600">{p.lost_deal_count ?? 0}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
