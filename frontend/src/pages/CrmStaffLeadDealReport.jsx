import { useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { formatVND } from '../lib/utils';
import * as XLSX from 'xlsx';
import {
  Download,
  RefreshCw,
  Users,
  CalendarRange,
  X,
  ChevronRight,
  Layers,
  FileText,
  TrendingUp,
  Wallet,
  AlertCircle,
  CheckCircle2,
  Mail,
  PieChart as PieChartIcon,
  Activity,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from 'recharts';
import KpiUserFilter from '../components/KpiUserFilter';
import DateRangePickerPopover from '../components/DateRangePickerPopover';

function formatViDate(iso) {
  if (!iso || typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) return '—';
  const [y, m, d] = iso.trim().split('-');
  return `${d}/${m}/${y}`;
}

function truncLabel(s, max = 28) {
  if (!s) return '—';
  const t = String(s);
  return t.length <= max ? t : `${t.slice(0, Math.max(0, max - 1))}…`;
}

function ChartTooltipMoney({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload ?? payload[0];
  if (!p) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <div className="font-semibold text-slate-800">{p.name}</div>
      <div className="tabular-nums text-slate-700">{formatVND(Number(p.value) || 0)}</div>
      {p.count != null && <div className="text-slate-500">{p.count} deal</div>}
    </div>
  );
}


function pad2(n) {
  return String(n).padStart(2, '0');
}

function defaultMonthRange() {
  const now = new Date();
  const from = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const to = `${end.getFullYear()}-${pad2(end.getMonth() + 1)}-${pad2(end.getDate())}`;
  return { from, to };
}

export default function CrmStaffLeadDealReport() {
  const [dateFrom, setDateFrom] = useState(() => defaultMonthRange().from);
  const [dateTo, setDateTo] = useState(() => defaultMonthRange().to);
  const [filter, setFilter] = useState({ companyId: '', departmentId: '', q: '' });
  /** 'all' | 'lead' | 'deal' — phân loại xem báo cáo */
  const [typeView, setTypeView] = useState('all');
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [detailPdfLoading, setDetailPdfLoading] = useState(false);
  const [rangePickerOpen, setRangePickerOpen] = useState(false);

  const reportQueryParams = useMemo(
    () => ({
      date_from: dateFrom,
      date_to: dateTo,
      ...(typeView !== 'all' ? { type: typeView } : {}),
      ...(filter.companyId ? { company_id: filter.companyId } : {}),
      ...(filter.departmentId ? { department_id: filter.departmentId } : {}),
      ...(filter.q?.trim() ? { q: filter.q.trim() } : {}),
    }),
    [dateFrom, dateTo, typeView, filter.companyId, filter.departmentId, filter.q],
  );

  const downloadMainPdf = async () => {
    setPdfLoading(true);
    try {
      const res = await api.get('/crm/reports/staff-lead-deal/export.pdf', {
        params: reportQueryParams,
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `BAO_CAO_LEAD_DEAL_NV_${dateFrom}_${dateTo}.pdf`;
      a.click();
      URL.revokeObjectURL(href);
    } catch (e) {
      let msg = e.message || 'Lỗi xuất PDF';
      if (e.response?.data instanceof Blob) {
        try {
          const t = await e.response.data.text();
          const j = JSON.parse(t);
          msg = j.error || msg;
        } catch { /* ignore */ }
      } else if (e.response?.data?.error) msg = e.response.data.error;
      setErr(msg);
    } finally {
      setPdfLoading(false);
    }
  };

  const downloadDetailPdf = async () => {
    const uid = detailData?.user_id;
    if (!uid) return;
    setDetailPdfLoading(true);
    try {
      const res = await api.get(`/crm/reports/staff-lead-deal/${uid}/pipelines/export.pdf`, {
        params: {
          date_from: dateFrom,
          date_to: dateTo,
          ...(filter.companyId ? { company_id: filter.companyId } : {}),
        },
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      const slug = (detailData.full_name || 'pipeline').replace(/\s+/g, '_');
      a.download = `BAO_CAO_PIPELINE_${slug}_${dateFrom}_${dateTo}.pdf`;
      a.click();
      URL.revokeObjectURL(href);
    } catch (e) {
      let msg = e.message || 'Lỗi xuất PDF';
      if (e.response?.data instanceof Blob) {
        try {
          const t = await e.response.data.text();
          const j = JSON.parse(t);
          msg = j.error || msg;
        } catch { /* ignore */ }
      } else if (e.response?.data?.error) msg = e.response.data.error;
      setDetailErr(msg);
    } finally {
      setDetailPdfLoading(false);
    }
  };

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data } = await api.get('/crm/reports/staff-lead-deal', { params: reportQueryParams });
      setRows(data.rows || []);
      setMeta({
        date_from: data.date_from,
        date_to: data.date_to,
        company_id: data.company_id,
        basis: data.basis,
      });
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
      setRows([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tự động reload khi đổi phân loại (lead/deal/all) cho UX phản ứng nhanh
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeView]);

  const totals = useMemo(() => {
    const t = {
      lead_count: 0,
      lead_pipeline_value: 0,
      deal_count: 0,
      deal_pipeline_value: 0,
      won_deal_count: 0,
      won_value: 0,
      lost_deal_count: 0,
      lost_value: 0,
    };
    for (const r of rows) {
      t.lead_count += r.lead_count || 0;
      t.lead_pipeline_value += r.lead_pipeline_value || 0;
      t.deal_count += r.deal_count || 0;
      t.deal_pipeline_value += r.deal_pipeline_value || 0;
      t.won_deal_count += r.won_deal_count || 0;
      t.won_value += r.won_value || 0;
      t.lost_deal_count += r.lost_deal_count || 0;
      t.lost_value += r.lost_value || 0;
    }
    return t;
  }, [rows]);

  const detailTotals = useMemo(() => {
    const list = detailData?.pipelines || [];
    const t = {
      lead_count: 0,
      lead_value: 0,
      deal_count: 0,
      deal_value: 0,
      open_deal_count: 0,
      open_value: 0,
      won_deal_count: 0,
      won_value: 0,
      lost_deal_count: 0,
      lost_value: 0,
      total_value: 0,
    };
    for (const p of list) {
      t.lead_count += p.lead_count || 0;
      t.lead_value += p.lead_value || 0;
      t.deal_count += p.deal_count || 0;
      t.deal_value += p.deal_value || 0;
      t.open_deal_count += p.open_deal_count ?? Math.max(0, (p.deal_count || 0) - (p.won_deal_count || 0) - (p.lost_deal_count || 0));
      t.open_value += p.open_value ?? Math.max(0, (p.deal_value || 0) - (p.won_value || 0) - (p.lost_value || 0));
      t.won_deal_count += p.won_deal_count || 0;
      t.won_value += p.won_value || 0;
      t.lost_deal_count += p.lost_deal_count || 0;
      t.lost_value += p.lost_value || 0;
      t.total_value += p.total_value || 0;
    }
    return t;
  }, [detailData]);

  const detailCharts = useMemo(() => {
    const pipelines = detailData?.pipelines || [];
    const summary = detailData?.summary;
    const timeline = detailData?.timeline || [];
    const bars = [...pipelines]
      .sort((a, b) => (b.total_value || 0) - (a.total_value || 0))
      .slice(0, 12)
      .map((p) => ({
        name: truncLabel(p.pipeline_name, 26),
        value: Number(p.total_value) || 0,
      }));
    const outcome =
      summary != null
        ? [
            {
              name: 'Hoàn thành',
              value: Number(summary.project_completed_value ?? summary.completed_value) || 0,
              count: summary.project_completed_count ?? 0,
              color: '#059669',
            },
            {
              name: 'Đang triển khai',
              value: Number(summary.implementation_value ?? 0) || 0,
              count: summary.implementation_count ?? 0,
              color: '#0284c7',
            },
            {
              name: 'Chưa chốt',
              value: Number(summary.pre_contract_value ?? 0) || 0,
              count: summary.pre_contract_count ?? 0,
              color: '#ca8a04',
            },
            {
              name: 'Thua',
              value: Number(summary.lost_value) || 0,
              count: summary.lost_deal_count || 0,
              color: '#e11d48',
            },
          ].filter((x) => x.value > 0 || x.count > 0)
        : [];
    const leadDealMix =
      summary != null
        ? [
            { name: 'Giá trị Lead', value: Number(summary.lead_value) || 0, color: '#6366f1' },
            { name: 'Giá trị Deal', value: Number(summary.deal_value) || 0, color: '#0891b2' },
          ].filter((x) => x.value > 0)
        : [];
    const stacked = [...pipelines]
      .filter((p) => (p.deal_count || 0) > 0)
      .sort((a, b) => (b.deal_count || 0) - (a.deal_count || 0))
      .slice(0, 10)
      .map((p) => {
        const open =
          p.open_deal_count ??
          Math.max(0, (p.deal_count || 0) - (p.won_deal_count || 0) - (p.lost_deal_count || 0));
        return {
          name: truncLabel(p.pipeline_name, 16),
          'Đã ký HĐ': p.won_deal_count || 0,
          Thua: p.lost_deal_count || 0,
          Khác: open,
        };
      });
    return { bars, outcome, leadDealMix, stacked, timeline };
  }, [detailData]);

  const detailSummary = detailData?.summary;

  const openPipelineDetail = async (row) => {
    if (!row?.user_id) return;
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailErr(null);
    setDetailData(null);
    try {
      const params = {
        date_from: reportQueryParams.date_from,
        date_to: reportQueryParams.date_to,
        ...(reportQueryParams.company_id ? { company_id: reportQueryParams.company_id } : {}),
        ...(typeView !== 'all' ? { type: typeView } : {}),
      };
      const { data } = await api.get(`/crm/reports/staff-lead-deal/${row.user_id}/pipelines`, { params });
      setDetailData(data);
    } catch (e) {
      setDetailErr(e.response?.data?.error || e.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const exportDetailExcel = () => {
    const list = detailData?.pipelines || [];
    const stages = detailData?.stage_breakdown || [];
    if (!list.length && !stages.length) return;
    const wb = XLSX.utils.book_new();
    if (list.length) {
      const sheetData = list.map((p) => ({
        Pipeline: p.pipeline_name || '',
        'Số Lead': p.lead_count ?? 0,
        'Giá trị Lead': p.lead_value ?? 0,
        'Số Deal': p.deal_count ?? 0,
        'Giá trị Deal': p.deal_value ?? 0,
        'Tổng giá trị (Lead+Deal)': p.total_value ?? 0,
        'Deal đang mở (SL)': p.open_deal_count ?? 0,
        'Giá trị đang mở': p.open_value ?? 0,
        'Deal chốt (SL)': p.won_deal_count ?? 0,
        'Giá trị chốt': p.won_value ?? 0,
        'Deal thua (SL)': p.lost_deal_count ?? 0,
        'Giá trị thua': p.lost_value ?? 0,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetData), 'Theo pipeline');
    }
    if (stages.length) {
      const stageSheet = stages.map((s) => ({
        Pipeline: s.pipeline_name || '',
        'Funnel Lead/Deal': s.kanban_type_label || '',
        'Giai đoạn': s.stage_name || '',
        'Kết quả deal': s.deal_outcome_label || '',
        'SL Lead': s.lead_count ?? 0,
        'GT Lead': s.lead_value ?? 0,
        'SL Deal': s.deal_count ?? 0,
        'GT Deal': s.deal_value ?? 0,
        'Tổng tại giai đoạn': s.stage_total_value ?? 0,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stageSheet), 'Theo giai doan');
    }
    if (detailData?.summary) {
      const fin = detailData.summary;
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet([
          {
            'GT hoàn thành (slug completed)': fin.project_completed_value ?? fin.completed_value,
            'GT đang triển khai': fin.implementation_value,
            'GT chưa chốt': fin.pre_contract_value,
            'GT đã ký HĐ (is_won)': fin.won_value,
            'Ròng (ký HĐ − thua)': fin.net_won_minus_lost_value ?? (fin.won_value || 0) - (fin.lost_value || 0),
            'Tổng trừ GT thua': fin.total_excluding_lost_value,
            'Tổng pipeline': fin.total_pipeline_value,
          },
        ]),
        'Tom tat tien',
      );
    }
    const slug = (detailData?.full_name || 'chi-tiet').replace(/\s+/g, '_');
    XLSX.writeFile(wb, `crm-pipeline-${slug}_${detailData?.date_from}_${detailData?.date_to}.xlsx`);
  };

  const exportExcel = () => {
    const sheetData = rows.map((r) => ({
      'Nhân viên': r.full_name || '',
      Email: r.email || '',
      'Phòng ban': r.department_name || '',
      'Số Lead': r.lead_count ?? 0,
      'Giá trị pipeline Lead': r.lead_pipeline_value ?? 0,
      'Số Deal': r.deal_count ?? 0,
      'Giá trị pipeline Deal': r.deal_pipeline_value ?? 0,
      'Deal chốt (SL)': r.won_deal_count ?? 0,
      'Giá trị chốt': r.won_value ?? 0,
      'Deal thua (SL)': r.lost_deal_count ?? 0,
      'Giá trị thua': r.lost_value ?? 0,
    }));
    const ws = XLSX.utils.json_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BC nhân viên');
    XLSX.writeFile(
      wb,
      `crm-bao-cao-nhan-vien_${(meta && meta.date_from) || dateFrom}_${(meta && meta.date_to) || dateTo}.xlsx`,
    );
  };

  return (
    <div className="min-w-0 max-w-[1600px] mx-auto space-y-5 pb-8 rounded-3xl border border-indigo-100/50 bg-gradient-to-br from-slate-50 via-indigo-50/35 to-cyan-50/40 p-4 md:p-6 shadow-sm">
      <div className="rounded-2xl bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-600 p-[1px] shadow-lg shadow-indigo-500/20">
        <div className="rounded-2xl bg-gradient-to-br from-slate-900/95 via-indigo-900/90 to-slate-900/95 px-5 py-5 text-white">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200/90">Báo cáo CRM · Lead / Deal</p>
              <h1 className="mt-1 text-2xl md:text-3xl font-bold flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
                  <Users className="w-6 h-6 text-cyan-200" />
                </span>
                Hiệu suất nhân viên
              </h1>
              <p className="mt-2 text-sm text-indigo-100/90 max-w-2xl leading-relaxed">
                Định dạng thống nhất mẫu <strong className="text-white">BÁO CÁO KẾ HOẠCH SALE / KỸ THUẬT</strong> — tiêu đề xanh, bảng có
                tổng hợp KPI. Giá trị <strong className="text-white">estimated_value</strong>. Lọc theo <strong className="text-white">ngày tạo</strong>.
                Click dòng để xem <strong className="text-white">chi tiết pipeline</strong>.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={load}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-medium ring-1 ring-white/20 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Tải lại
              </button>
              <button
                type="button"
                onClick={downloadMainPdf}
                disabled={pdfLoading}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/90 hover:bg-rose-500 text-white text-sm font-semibold shadow-md disabled:opacity-50"
              >
                <FileText className="w-4 h-4" />
                {pdfLoading ? 'Đang tạo PDF…' : 'Xuất PDF chuẩn'}
              </button>
              <button
                type="button"
                onClick={exportExcel}
                disabled={!rows.length}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-semibold shadow-md disabled:opacity-40"
              >
                <Download className="w-4 h-4" />
                Xuất Excel
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white/80 backdrop-blur border border-indigo-100 shadow-md shadow-indigo-500/5 p-4 md:p-5 space-y-3">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1 min-w-[min(100%,280px)]">
            <span className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
              <CalendarRange className="w-4 h-4 text-indigo-500" />
              Kỳ báo cáo (từ → đến)
            </span>
            <button
              type="button"
              onClick={() => setRangePickerOpen(true)}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-indigo-200 bg-white text-sm text-gray-900 shadow-sm hover:border-indigo-400 hover:bg-indigo-50/60 text-left w-full max-w-md transition-colors"
            >
              <span className="tabular-nums font-medium flex-1">
                {formatViDate(dateFrom)} <span className="text-gray-400 mx-0.5">→</span> {formatViDate(dateTo)}
              </span>
              <CalendarRange className="w-4 h-4 text-indigo-600 shrink-0" aria-hidden />
            </button>
          </div>
        </div>
        {/* Phân loại Lead riêng / Deal riêng / Cả hai */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Phân loại</span>
          <div className="inline-flex rounded-xl border border-indigo-200 bg-white p-1 shadow-sm w-fit">
            {[
              { id: 'all', label: 'Cả hai', icon: Layers, color: 'from-indigo-500 to-blue-500' },
              { id: 'lead', label: 'Chỉ Lead', icon: TrendingUp, color: 'from-violet-500 to-indigo-500' },
              { id: 'deal', label: 'Chỉ Deal', icon: Wallet, color: 'from-cyan-500 to-teal-500' },
            ].map((opt) => {
              const Icon = opt.icon;
              const active = typeView === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTypeView(opt.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    active
                      ? `text-white bg-gradient-to-r ${opt.color} shadow`
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  aria-pressed={active}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
        <KpiUserFilter value={filter} onChange={setFilter} />
        <button
          type="button"
          onClick={load}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white text-sm font-semibold shadow-md hover:from-indigo-500 hover:to-blue-500 transition-all"
        >
          Áp dụng bộ lọc
        </button>
      </div>

      <DateRangePickerPopover
        open={rangePickerOpen}
        title="Chọn khoảng thời gian báo cáo"
        from={dateFrom}
        to={dateTo}
        allowClear={false}
        onChange={({ from, to }) => {
          if (from) setDateFrom(from);
          if (to) setDateTo(to);
        }}
        onClose={() => setRangePickerOpen(false)}
      />

      {meta && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-100 px-3 py-1 font-medium text-indigo-800">
            <CalendarRange className="w-3.5 h-3.5" />
            Kỳ: {meta.date_from} → {meta.date_to}
          </span>
          <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-medium border ${
            typeView === 'lead' ? 'bg-violet-50 border-violet-200 text-violet-800'
            : typeView === 'deal' ? 'bg-cyan-50 border-cyan-200 text-cyan-800'
            : 'bg-slate-100 border-slate-200 text-slate-700'
          }`}>
            {typeView === 'lead' ? 'Phân loại: Chỉ Lead' : typeView === 'deal' ? 'Phân loại: Chỉ Deal' : 'Phân loại: Cả Lead & Deal'}
          </span>
          {meta.basis && (
            <span className="rounded-full bg-slate-100 px-3 py-1 border border-slate-200">Cơ sở: {meta.basis}</span>
          )}
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className={`grid grid-cols-2 ${typeView === 'lead' ? 'md:grid-cols-2' : 'md:grid-cols-4'} gap-3`}>
          {typeView !== 'deal' && (
            <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-indigo-700 text-xs font-semibold uppercase tracking-wide">
                <TrendingUp className="w-4 h-4" /> Lead
              </div>
              <p className="mt-1 text-2xl font-bold text-slate-900">{totals.lead_count}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{formatVND(totals.lead_pipeline_value)}</p>
            </div>
          )}
          {typeView !== 'lead' && (
            <>
              <div className="rounded-xl border border-cyan-100 bg-gradient-to-br from-cyan-50 to-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-cyan-800 text-xs font-semibold uppercase tracking-wide">
                  <Wallet className="w-4 h-4" /> Deal
                </div>
                <p className="mt-1 text-2xl font-bold text-slate-900">{totals.deal_count}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{formatVND(totals.deal_pipeline_value)}</p>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-emerald-800 text-xs font-semibold uppercase tracking-wide">
                  <CheckCircle2 className="w-4 h-4" /> Đã ký HĐ
                </div>
                <p className="mt-1 text-2xl font-bold text-emerald-800">{totals.won_deal_count}</p>
                <p className="text-[11px] text-emerald-700/80 mt-0.5">{formatVND(totals.won_value)}</p>
              </div>
              <div className="rounded-xl border border-rose-100 bg-gradient-to-br from-rose-50 to-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-rose-800 text-xs font-semibold uppercase tracking-wide">
                  <AlertCircle className="w-4 h-4" /> Thua
                </div>
                <p className="mt-1 text-2xl font-bold text-rose-900">{totals.lost_deal_count}</p>
                <p className="text-[11px] text-rose-700/80 mt-0.5">{formatVND(totals.lost_value)}</p>
              </div>
            </>
          )}
          {typeView === 'lead' && (
            <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-violet-800 text-xs font-semibold uppercase tracking-wide">
                <Activity className="w-4 h-4" /> NV có lead
              </div>
              <p className="mt-1 text-2xl font-bold text-slate-900">{rows.filter(r => (r.lead_count || 0) > 0).length}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{rows.length} NV trong phạm vi</p>
            </div>
          )}
        </div>
      )}

      {err && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{err}</div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400">Đang tải báo cáo…</div>
      ) : (
        <div className="rounded-2xl border border-indigo-100/80 bg-white overflow-x-auto shadow-lg shadow-indigo-500/10 ring-1 ring-indigo-500/5">
          <table className={`w-full text-sm ${typeView === 'all' ? 'min-w-[1100px]' : 'min-w-[760px]'}`}>
            <thead>
              <tr className="bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-600 text-left text-[11px] uppercase tracking-wider text-white shadow-inner">
                <th className="px-3 py-3.5 font-bold sticky left-0 z-10 border-r border-white/20 bg-gradient-to-r from-indigo-700 to-indigo-600">Nhân viên</th>
                <th className="px-3 py-3.5 font-bold">Phòng ban</th>
                {typeView !== 'deal' && <th className="px-3 py-3.5 font-bold text-right">Số Lead</th>}
                {typeView !== 'deal' && <th className="px-3 py-3.5 font-bold text-right">Giá trị Lead</th>}
                {typeView !== 'lead' && <th className="px-3 py-3.5 font-bold text-right">Số Deal</th>}
                {typeView !== 'lead' && <th className="px-3 py-3.5 font-bold text-right">Giá trị Deal</th>}
                {typeView !== 'lead' && <th className="px-3 py-3.5 font-bold text-right">Đã ký HĐ</th>}
                {typeView !== 'lead' && <th className="px-3 py-3.5 font-bold text-right">GT ký HĐ</th>}
                {typeView !== 'lead' && <th className="px-3 py-3.5 font-bold text-right">Thua</th>}
                {typeView !== 'lead' && <th className="px-3 py-3.5 font-bold text-right">GT thua</th>}
                <th className="px-3 py-3.5 font-bold w-10 text-center" aria-label="Chi tiết" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={typeView === 'all' ? 11 : (typeView === 'lead' ? 5 : 9)} className="px-3 py-10 text-center text-gray-400">
                    Không có dữ liệu trong phạm vi lọc.
                  </td>
                </tr>
              ) : (
                rows.map((r, idx) => (
                  <tr
                    key={r.user_id || r.full_name}
                    onClick={() => r.user_id && openPipelineDetail(r)}
                    className={`border-t border-indigo-100/60 group transition-colors ${
                      r.user_id ? 'cursor-pointer hover:bg-indigo-50/90' : 'hover:bg-slate-50/90'
                    } ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}
                  >
                    <td
                      className={`px-3 py-2.5 sticky left-0 border-r border-indigo-100/80 font-medium text-slate-900 ${
                        r.user_id ? `group-hover:bg-indigo-50/95 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}` : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div>{r.full_name}</div>
                          {r.email && <div className="text-xs text-gray-500 font-normal">{r.email}</div>}
                        </div>
                        {r.user_id && (
                          <ChevronRight className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" aria-hidden />
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">{r.department_name || '—'}</td>
                    {typeView !== 'deal' && <td className="px-3 py-2.5 text-right tabular-nums">{r.lead_count ?? 0}</td>}
                    {typeView !== 'deal' && <td className="px-3 py-2.5 text-right tabular-nums text-xs">{formatVND(r.lead_pipeline_value || 0)}</td>}
                    {typeView !== 'lead' && <td className="px-3 py-2.5 text-right tabular-nums">{r.deal_count ?? 0}</td>}
                    {typeView !== 'lead' && <td className="px-3 py-2.5 text-right tabular-nums text-xs">{formatVND(r.deal_pipeline_value || 0)}</td>}
                    {typeView !== 'lead' && <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700 font-medium">{r.won_deal_count ?? 0}</td>}
                    {typeView !== 'lead' && <td className="px-3 py-2.5 text-right tabular-nums text-xs text-emerald-800">{formatVND(r.won_value || 0)}</td>}
                    {typeView !== 'lead' && <td className="px-3 py-2.5 text-right tabular-nums text-red-700">{r.lost_deal_count ?? 0}</td>}
                    {typeView !== 'lead' && <td className="px-3 py-2.5 text-right tabular-nums text-xs text-red-800">{formatVND(r.lost_value || 0)}</td>}
                    <td className="px-3 py-2.5 text-center text-xs text-gray-400">{r.user_id ? 'Mở' : '—'}</td>
                  </tr>
                ))
              )}
              {rows.length > 0 && (
                <tr className="border-t-2 border-indigo-200 bg-gradient-to-r from-indigo-100/90 via-blue-50 to-cyan-50 font-bold text-slate-900">
                  <td className="px-3 py-3 sticky left-0 bg-indigo-100/90 border-r border-indigo-200" colSpan={2}>
                    Tổng cộng
                  </td>
                  {typeView !== 'deal' && <td className="px-3 py-3 text-right tabular-nums">{totals.lead_count}</td>}
                  {typeView !== 'deal' && <td className="px-3 py-3 text-right tabular-nums text-xs">{formatVND(totals.lead_pipeline_value)}</td>}
                  {typeView !== 'lead' && <td className="px-3 py-3 text-right tabular-nums">{totals.deal_count}</td>}
                  {typeView !== 'lead' && <td className="px-3 py-3 text-right tabular-nums text-xs">{formatVND(totals.deal_pipeline_value)}</td>}
                  {typeView !== 'lead' && <td className="px-3 py-3 text-right tabular-nums text-emerald-800">{totals.won_deal_count}</td>}
                  {typeView !== 'lead' && <td className="px-3 py-3 text-right tabular-nums text-xs text-emerald-900">{formatVND(totals.won_value)}</td>}
                  {typeView !== 'lead' && <td className="px-3 py-3 text-right tabular-nums text-red-800">{totals.lost_deal_count}</td>}
                  {typeView !== 'lead' && <td className="px-3 py-3 text-right tabular-nums text-xs text-red-900">{formatVND(totals.lost_value)}</td>}
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {detailOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pipeline-detail-title"
          onClick={() => setDetailOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-7xl w-full max-h-[92vh] overflow-hidden flex flex-col border border-teal-200/80 ring-1 ring-teal-500/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 px-4 py-3.5 border-b border-teal-100 bg-gradient-to-r from-teal-600 to-cyan-600 text-white">
              <div className="min-w-0">
                <h2 id="pipeline-detail-title" className="text-lg font-bold flex items-center gap-2 text-white">
                  <Layers className="w-5 h-5 text-cyan-100 shrink-0" />
                  Chi tiết theo pipeline
                </h2>
                {detailData && (
                  <p className="text-sm text-teal-50 mt-0.5 truncate">
                    <span className="font-semibold text-white">{detailData.full_name}</span>
                    {detailData.department_name ? ` · ${detailData.department_name}` : ''}
                    <span className="text-cyan-100/95">
                      {' '}
                      · {detailData.date_from} → {detailData.date_to}
                    </span>
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={downloadDetailPdf}
                  disabled={detailPdfLoading || !detailData?.user_id}
                  className="px-3 py-1.5 text-sm font-semibold bg-rose-500 text-white rounded-lg hover:bg-rose-400 disabled:opacity-40 shadow"
                >
                  {detailPdfLoading ? '…' : 'PDF'}
                </button>
                <button
                  type="button"
                  onClick={exportDetailExcel}
                  disabled={!(detailData?.pipelines?.length || detailData?.stage_breakdown?.length)}
                  className="px-3 py-1.5 text-sm font-semibold bg-emerald-500 text-white rounded-lg hover:bg-emerald-400 disabled:opacity-40"
                >
                  Excel
                </button>
                <button
                  type="button"
                  onClick={() => setDetailOpen(false)}
                  className="p-2 rounded-lg hover:bg-white/15 text-white"
                  aria-label="Đóng"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-5">
              {detailLoading && (
                <div className="text-center py-12 text-gray-400">Đang tải chi tiết pipeline…</div>
              )}
              {detailErr && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{detailErr}</div>
              )}
              {!detailLoading && !detailErr && detailData && (
                <>
                  <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 rounded-2xl border border-slate-200/90 bg-gradient-to-r from-slate-50 to-teal-50/40 p-4">
                    <div className="flex items-center gap-2 text-sm text-slate-800 min-w-0">
                      <Mail className="w-4 h-4 text-teal-600 shrink-0" />
                      <span className="truncate font-medium">{detailData.email || '—'}</span>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 border border-slate-200">
                      <Activity className="w-3.5 h-3.5" />
                      Cơ sở thời gian: {detailData.basis || 'created_at'}
                    </span>
                    {detailSummary?.pipeline_count != null && (
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-medium border border-teal-100 text-teal-800">
                        {detailSummary.pipeline_count} pipeline có dữ liệu
                      </span>
                    )}
                    {detailSummary?.win_rate_closed_pct != null && (
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold border border-emerald-100 text-emerald-800">
                        Đã ký HĐ / (ký HĐ + thua): {detailSummary.win_rate_closed_pct}%
                      </span>
                    )}
                    {detailSummary?.win_rate_all_deals_pct != null && (
                      <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs border border-indigo-100 text-indigo-800">
                        Đã ký HĐ / tổng deal: {detailSummary.win_rate_all_deals_pct}%
                      </span>
                    )}
                  </div>

                  {/* Hàng 1: tổng quan (KHÔNG trùng lặp) */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-3 shadow-sm">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-blue-800">Tổng giá trị</p>
                      <p className="mt-1 text-lg font-bold text-slate-900 leading-tight">
                        {formatVND(detailSummary?.total_pipeline_value ?? detailTotals.total_value)}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">Lead + Deal</p>
                    </div>
                    <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-3 shadow-sm">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-800">Lead</p>
                      <p className="mt-1 text-xl font-bold text-slate-900">{detailSummary?.lead_count ?? detailTotals.lead_count}</p>
                      <p className="text-[11px] text-slate-500 tabular-nums">{formatVND(detailSummary?.lead_value ?? detailTotals.lead_value)}</p>
                    </div>
                    <div className="rounded-xl border border-cyan-100 bg-gradient-to-br from-cyan-50 to-white p-3 shadow-sm">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-cyan-900">Deal</p>
                      <p className="mt-1 text-xl font-bold text-slate-900">{detailSummary?.deal_count ?? detailTotals.deal_count}</p>
                      <p className="text-[11px] text-slate-500 tabular-nums">{formatVND(detailSummary?.deal_value ?? detailTotals.deal_value)}</p>
                    </div>
                    <div className="rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-3 shadow-sm">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-sky-900">Đã ký HĐ (cross-cut)</p>
                      <p className="text-[9px] text-sky-800/80 leading-tight mt-0.5">Cờ is_won — đã nằm trong Hoàn thành / Đang triển khai bên dưới</p>
                      <p className="mt-1 text-xl font-bold text-sky-900">{detailSummary?.won_deal_count ?? detailTotals.won_deal_count}</p>
                      <p className="text-[11px] text-sky-800/90 tabular-nums">{formatVND(detailSummary?.won_value ?? detailTotals.won_value)}</p>
                    </div>
                  </div>

                  {/* Hàng 2: PHÂN BỔ deal (4 nhóm exclusive — Σ = Deal count) */}
                  {(() => {
                    const exComp = detailSummary?.project_completed_count ?? 0;
                    const exImpl = detailSummary?.implementation_count ?? 0;
                    const exPre = detailSummary?.pre_contract_count ?? 0;
                    const exLost = detailSummary?.lost_deal_count ?? detailTotals.lost_deal_count ?? 0;
                    const sum4 = exComp + exImpl + exPre + exLost;
                    const dealTot = detailSummary?.deal_count ?? detailTotals.deal_count ?? 0;
                    const sumOk = sum4 === dealTot;
                    return (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-3">
                        <div className="flex items-center justify-between mb-2 px-1 flex-wrap gap-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                            Phân bổ deal theo giai đoạn (4 nhóm — không chồng lấp)
                          </p>
                          <span className={`text-[11px] font-medium tabular-nums px-2 py-0.5 rounded-full border ${sumOk ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                            Σ 4 nhóm = {sum4} {sumOk ? '✓' : `(≠ ${dealTot} deal)`}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="rounded-xl border border-green-200 bg-gradient-to-br from-green-50 to-white p-3 shadow-sm">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-green-900">Hoàn thành</p>
                            <p className="text-[9px] text-green-800/90 leading-tight mt-0.5">Xong HĐ, thu tiền (slug completed)</p>
                            <p className="mt-1 text-lg font-bold text-green-800">{exComp}</p>
                            <p className="text-[11px] text-green-800/90 tabular-nums font-semibold">
                              {formatVND(detailSummary?.project_completed_value ?? detailSummary?.completed_value ?? 0)}
                            </p>
                          </div>
                          <div className="rounded-xl border border-cyan-300 bg-gradient-to-br from-cyan-50 to-white p-3 shadow-sm">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-cyan-950">Đang triển khai</p>
                            <p className="text-[9px] text-cyan-900/85 leading-tight mt-0.5">Sau ký HĐ, trước hoàn thành</p>
                            <p className="mt-1 text-lg font-bold text-cyan-950">{exImpl}</p>
                            <p className="text-[11px] text-cyan-900 tabular-nums font-semibold">
                              {formatVND(detailSummary?.implementation_value ?? 0)}
                            </p>
                          </div>
                          <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-3 shadow-sm">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-amber-950">Chưa chốt</p>
                            <p className="text-[9px] text-amber-900/85 leading-tight mt-0.5">Báo giá, thương lượng, cọc…</p>
                            <p className="mt-1 text-lg font-bold text-amber-950">{exPre}</p>
                            <p className="text-[11px] text-amber-900/90 tabular-nums font-semibold">
                              {formatVND(detailSummary?.pre_contract_value ?? 0)}
                            </p>
                          </div>
                          <div className="rounded-xl border border-rose-200 bg-gradient-to-br from-rose-50 to-white p-3 shadow-sm">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-rose-900">Thua</p>
                            <p className="text-[9px] text-rose-800/85 leading-tight mt-0.5">is_lost / slug lost</p>
                            <p className="mt-1 text-lg font-bold text-rose-900">{exLost}</p>
                            <p className="text-[11px] text-rose-700/90 tabular-nums">{formatVND(detailSummary?.lost_value ?? detailTotals.lost_value)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  {detailSummary != null && (detailSummary.open_deal_count > 0 || detailSummary.open_value > 0) && (
                    <p className="text-[11px] text-slate-600 -mt-2 px-1">
                      Deal <strong>chưa ký HĐ</strong> (chưa cờ won):{' '}
                      <span className="tabular-nums font-medium">{detailSummary.open_deal_count}</span> ·{' '}
                      <span className="tabular-nums">{formatVND(detailSummary.open_value)}</span>
                    </p>
                  )}

                  <div className="rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50/90 via-white to-slate-50 p-4 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-900 mb-1">Kết quả tiền — hoàn thành / triển khai / chốt sale</h3>
                    <p className="text-[11px] text-slate-600 mb-3">
                      <strong>Hoàn thành</strong> = xong HĐ thu tiền (<code className="rounded bg-slate-100 px-0.5">completed</code>).{' '}
                      <strong>Đang triển khai</strong> = sau ký HĐ, trước hoàn thành. <strong>Chưa chốt</strong> = giai đoạn deal trước ký HĐ (slug designing…).{' '}
                      <strong>Ròng (ký HĐ − thua)</strong> theo cờ <code className="rounded bg-slate-100 px-0.5">is_won</code>.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                      <div className="rounded-xl border border-emerald-200 bg-white/90 p-3">
                        <p className="text-[10px] font-bold uppercase text-emerald-900">Hoàn thành (thu tiền)</p>
                        <p className="mt-1 text-lg font-bold text-emerald-800 tabular-nums">
                          {formatVND(detailSummary?.project_completed_value ?? detailSummary?.completed_value ?? 0)}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{detailSummary?.project_completed_count ?? 0} deal</p>
                      </div>
                      <div className="rounded-xl border border-violet-200 bg-white/90 p-3">
                        <p className="text-[10px] font-bold uppercase text-violet-900">Ròng (đã ký HĐ − thua)</p>
                        <p className="mt-1 text-lg font-bold text-violet-900 tabular-nums">
                          {formatVND(detailSummary?.net_won_minus_lost_value ?? (detailSummary?.won_value ?? 0) - (detailSummary?.lost_value ?? 0))}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">GT ký HĐ − GT thua</p>
                      </div>
                      <div className="rounded-xl border border-sky-200 bg-white/90 p-3">
                        <p className="text-[10px] font-bold uppercase text-sky-900">Tổng trừ GT thua</p>
                        <p className="mt-1 text-lg font-bold text-sky-900 tabular-nums">
                          {formatVND(
                            detailSummary?.total_excluding_lost_value ??
                              (detailSummary?.total_pipeline_value ?? detailTotals.total_value) - (detailSummary?.lost_value ?? 0),
                          )}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">Lead + Deal − thua</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white/90 p-3">
                        <p className="text-[10px] font-bold uppercase text-slate-700">Tổng pipeline (gồm thua)</p>
                        <p className="mt-1 text-lg font-bold text-slate-900 tabular-nums">
                          {formatVND(detailSummary?.total_pipeline_value ?? detailTotals.total_value)}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">Lead + mọi Deal trong kỳ</p>
                      </div>
                    </div>
                  </div>

                  {(detailData.stage_breakdown?.length ?? 0) > 0 && (
                    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                      <div className="px-4 py-3 bg-gradient-to-r from-slate-800 to-slate-700 text-white">
                        <h3 className="text-sm font-bold">Chi tiết theo giai đoạn (cột pipeline)</h3>
                        <p className="text-[11px] text-slate-300 mt-0.5">
                          Giá trị estimated_value đang nằm ở từng stage — biết chính xác bao nhiêu tiền trên mỗi cột Kanban
                        </p>
                      </div>
                      {(() => {
                        const sb = detailData.stage_breakdown || [];
                        // Lọc khớp typeView để KHÔNG hiển thị stage rỗng (vd stage chỉ có deal khi typeView=lead)
                        const filtered = sb.filter((s) => {
                          if (typeView === 'lead') return (s.lead_count || 0) > 0;
                          if (typeView === 'deal') return (s.deal_count || 0) > 0;
                          return (s.lead_count || 0) > 0 || (s.deal_count || 0) > 0;
                        });
                        const showLead = typeView !== 'deal';
                        const showDeal = typeView !== 'lead';
                        const sumLeadC = filtered.reduce((a, s) => a + (s.lead_count || 0), 0);
                        const sumLeadV = filtered.reduce((a, s) => a + (s.lead_value || 0), 0);
                        const sumDealC = filtered.reduce((a, s) => a + (s.deal_count || 0), 0);
                        const sumDealV = filtered.reduce((a, s) => a + (s.deal_value || 0), 0);
                        const sumTotal = filtered.reduce((a, s) => {
                          if (typeView === 'lead') return a + (s.lead_value || 0);
                          if (typeView === 'deal') return a + (s.deal_value || 0);
                          return a + (s.stage_total_value || 0);
                        }, 0);
                        // Số cột "Cộng" colSpan = 5 (#, Pipeline, Funnel, Giai đoạn, Kết quả deal)
                        return (
                          <div className="overflow-x-auto">
                            <table className={`w-full text-sm ${typeView === 'all' ? 'min-w-[1050px]' : 'min-w-[820px]'}`}>
                              <thead>
                                <tr className="bg-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-700">
                                  <th className="px-3 py-2 font-semibold">#</th>
                                  <th className="px-3 py-2 font-semibold">Pipeline</th>
                                  <th className="px-3 py-2 font-semibold">Funnel</th>
                                  <th className="px-3 py-2 font-semibold min-w-[140px]">Giai đoạn</th>
                                  {showDeal && <th className="px-3 py-2 font-semibold">Kết quả deal</th>}
                                  {showLead && <th className="px-3 py-2 font-semibold text-right">Lead</th>}
                                  {showLead && <th className="px-3 py-2 font-semibold text-right">GT Lead</th>}
                                  {showDeal && <th className="px-3 py-2 font-semibold text-right">Deal</th>}
                                  {showDeal && <th className="px-3 py-2 font-semibold text-right">GT Deal</th>}
                                  <th className="px-3 py-2 font-semibold text-right bg-violet-50">
                                    {typeView === 'lead' ? 'GT Lead' : typeView === 'deal' ? 'GT Deal' : 'Tổng stage'}
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {filtered.length === 0 ? (
                                  <tr>
                                    <td colSpan={2 + (showLead ? 2 : 0) + (showDeal ? 3 : 0) + 3} className="px-3 py-6 text-center text-slate-400 text-xs">
                                      Không có dữ liệu giai đoạn cho phân loại đang xem.
                                    </td>
                                  </tr>
                                ) : (
                                  filtered.map((s, i) => (
                                    <tr
                                      key={s.stage_id || `none-${i}`}
                                      className={`border-t border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}`}
                                    >
                                      <td className="px-3 py-2 tabular-nums text-slate-500">{i + 1}</td>
                                      <td className="px-3 py-2 text-slate-800">{s.pipeline_name || '—'}</td>
                                      <td className="px-3 py-2 text-xs font-medium text-slate-600">{s.kanban_type_label || '—'}</td>
                                      <td className="px-3 py-2 font-medium text-slate-900">{s.stage_name}</td>
                                      {showDeal && (
                                        <td className="px-3 py-2 text-xs">
                                          {s.deal_outcome_label ? (
                                            <span
                                              className={`rounded-full px-2 py-0.5 font-semibold ${
                                                s.deal_outcome === 'project_completed'
                                                  ? 'bg-green-100 text-green-900 ring-1 ring-green-200'
                                                  : s.deal_outcome === 'implementation'
                                                    ? 'bg-cyan-100 text-cyan-950'
                                                    : s.deal_outcome === 'pre_contract'
                                                      ? 'bg-amber-100 text-amber-950'
                                                      : s.deal_outcome === 'lost'
                                                        ? 'bg-rose-100 text-rose-900'
                                                        : 'bg-slate-100 text-slate-700'
                                              }`}
                                            >
                                              {s.deal_outcome_label}
                                            </span>
                                          ) : (
                                            <span className="text-slate-400">—</span>
                                          )}
                                        </td>
                                      )}
                                      {showLead && <td className="px-3 py-2 text-right tabular-nums">{s.lead_count ?? 0}</td>}
                                      {showLead && <td className="px-3 py-2 text-right tabular-nums text-xs">{formatVND(s.lead_value || 0)}</td>}
                                      {showDeal && <td className="px-3 py-2 text-right tabular-nums">{s.deal_count ?? 0}</td>}
                                      {showDeal && <td className="px-3 py-2 text-right tabular-nums text-xs">{formatVND(s.deal_value || 0)}</td>}
                                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-violet-900 bg-violet-50/50">
                                        {formatVND(
                                          typeView === 'lead' ? (s.lead_value || 0)
                                          : typeView === 'deal' ? (s.deal_value || 0)
                                          : (s.stage_total_value || 0)
                                        )}
                                      </td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                              {filtered.length > 0 && (
                                <tfoot>
                                  <tr className="border-t-2 border-violet-200 bg-violet-50/80 font-bold text-slate-900">
                                    <td colSpan={4 + (showDeal ? 1 : 0)} className="px-3 py-2.5 text-right">
                                      Cộng các giai đoạn (= tổng pipeline)
                                    </td>
                                    {showLead && <td className="px-3 py-2.5 text-right tabular-nums">{sumLeadC}</td>}
                                    {showLead && <td className="px-3 py-2.5 text-right tabular-nums text-xs">{formatVND(sumLeadV)}</td>}
                                    {showDeal && <td className="px-3 py-2.5 text-right tabular-nums">{sumDealC}</td>}
                                    {showDeal && <td className="px-3 py-2.5 text-right tabular-nums text-xs">{formatVND(sumDealV)}</td>}
                                    <td className="px-3 py-2.5 text-right tabular-nums text-violet-950 bg-violet-100/90">
                                      {formatVND(sumTotal)}
                                    </td>
                                  </tr>
                                </tfoot>
                              )}
                            </table>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="rounded-2xl border border-teal-100 bg-white p-4 shadow-sm">
                      <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-1">
                        <PieChartIcon className="w-4 h-4 text-teal-600" />
                        Giá trị pipeline (top)
                      </h3>
                      <p className="text-[11px] text-slate-500 mb-2">Ước tính — Lead + Deal theo từng pipeline</p>
                      <div className="h-[260px] w-full min-h-[220px]">
                        {detailCharts.bars.length ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart layout="vertical" data={detailCharts.bars} margin={{ left: 4, right: 12, top: 4, bottom: 4 }}>
                              <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-slate-200" />
                              <XAxis type="number" tickFormatter={(v) => formatVND(v)} tick={{ fontSize: 10 }} />
                              <YAxis type="category" dataKey="name" width={118} tick={{ fontSize: 10 }} />
                              <RechartsTooltip formatter={(v) => formatVND(v)} />
                              <Bar dataKey="value" fill="#0d9488" radius={[0, 6, 6, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-full flex items-center justify-center text-sm text-slate-400">Không có dữ liệu</div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-teal-100 bg-white p-4 shadow-sm">
                      <h3 className="text-sm font-bold text-slate-800 mb-1">Cơ cấu Deal (theo giá trị)</h3>
                      <p className="text-[11px] text-slate-500 mb-2">Hoàn thành / Đang triển khai / Chưa chốt / Thua — estimated_value</p>
                      <div className="h-[260px] w-full min-h-[220px]">
                        {detailCharts.outcome.filter((x) => x.value > 0).length ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={detailCharts.outcome.filter((x) => x.value > 0)}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                innerRadius={52}
                                outerRadius={88}
                                paddingAngle={2}
                              >
                                {detailCharts.outcome
                                  .filter((x) => x.value > 0)
                                  .map((entry, i) => (
                                    <Cell key={`cell-o-${i}`} fill={entry.color} stroke="#fff" strokeWidth={1} />
                                  ))}
                              </Pie>
                              <RechartsTooltip content={<ChartTooltipMoney />} />
                              <Legend wrapperStyle={{ fontSize: 12 }} />
                            </PieChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-full flex items-center justify-center text-sm text-slate-400">Không có deal trong kỳ</div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-teal-100 bg-white p-4 shadow-sm">
                      <h3 className="text-sm font-bold text-slate-800 mb-1">Lead vs Deal (giá trị)</h3>
                      <p className="text-[11px] text-slate-500 mb-2">So sánh tổng giá trị pipeline Lead và Deal</p>
                      <div className="h-[260px] w-full min-h-[220px]">
                        {detailCharts.leadDealMix.filter((x) => x.value > 0).length ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={detailCharts.leadDealMix.filter((x) => x.value > 0)}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                innerRadius={48}
                                outerRadius={86}
                                paddingAngle={2}
                              >
                                {detailCharts.leadDealMix
                                  .filter((x) => x.value > 0)
                                  .map((entry, i) => (
                                    <Cell key={`cell-ld-${i}`} fill={entry.color} stroke="#fff" strokeWidth={1} />
                                  ))}
                              </Pie>
                              <RechartsTooltip content={<ChartTooltipMoney />} />
                              <Legend wrapperStyle={{ fontSize: 12 }} />
                            </PieChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-full flex items-center justify-center text-sm text-slate-400">Không có giá trị</div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-teal-100 bg-white p-4 shadow-sm">
                      <h3 className="text-sm font-bold text-slate-800 mb-1">Deal theo pipeline (SL)</h3>
                      <p className="text-[11px] text-slate-500 mb-2">Top pipeline — phân bổ chốt / thua / đang mở</p>
                      <div className="h-[260px] w-full min-h-[220px]">
                        {detailCharts.stacked.length ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={detailCharts.stacked} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                              <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200" />
                              <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} height={56} angle={-25} textAnchor="end" />
                              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                              <RechartsTooltip />
                              <Legend wrapperStyle={{ fontSize: 11 }} />
                              <Bar dataKey="Đã ký HĐ" stackId="a" fill="#059669" radius={[0, 0, 0, 0]} />
                              <Bar dataKey="Thua" stackId="a" fill="#e11d48" />
                              <Bar dataKey="Khác" stackId="a" fill="#d97706" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-full flex items-center justify-center text-sm text-slate-400">Không có deal</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-800 mb-1">Xu hướng tạo mới (theo ngày)</h3>
                    <p className="text-[11px] text-slate-500 mb-2">Số lead / deal được tạo trong kỳ (created_at)</p>
                    <div className="h-[280px] w-full min-h-[220px]">
                      {detailCharts.timeline.length ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={detailCharts.timeline}
                            margin={{ top: 8, right: 16, left: 0, bottom: detailCharts.timeline.length > 18 ? 48 : 8 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200" />
                            <XAxis
                              dataKey="date"
                              tick={{ fontSize: 9 }}
                              angle={detailCharts.timeline.length > 12 ? -30 : 0}
                              textAnchor="end"
                              height={detailCharts.timeline.length > 12 ? 46 : 28}
                              interval={detailCharts.timeline.length > 24 ? Math.floor(detailCharts.timeline.length / 14) : 0}
                            />
                            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                            <RechartsTooltip
                              labelFormatter={(l) => `Ngày ${l}`}
                              formatter={(v, name) => [v, name === 'lead_count' ? 'Lead' : 'Deal']}
                            />
                            <Legend />
                            <Line type="monotone" dataKey="lead_count" name="Lead tạo" stroke="#6366f1" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="deal_count" name="Deal tạo" stroke="#0891b2" strokeWidth={2} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-sm text-slate-400">Không có mốc thời gian</div>
                      )}
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-inner bg-white">
                    <table className="w-full text-sm min-w-[1180px]">
                      <thead>
                        <tr className="bg-gradient-to-r from-teal-600 to-cyan-600 text-left text-[11px] uppercase tracking-wider text-white">
                          <th className="px-3 py-2.5 font-bold">Pipeline</th>
                          <th className="px-3 py-2.5 font-bold text-right">Lead</th>
                          <th className="px-3 py-2.5 font-bold text-right">GT Lead</th>
                          <th className="px-3 py-2.5 font-bold text-right">Deal</th>
                          <th className="px-3 py-2.5 font-bold text-right">GT Deal</th>
                          <th className="px-3 py-2.5 font-bold text-right bg-white/15">Tổng pipeline</th>
                          <th className="px-3 py-2.5 font-bold text-right bg-amber-500/25">Mở</th>
                          <th className="px-3 py-2.5 font-bold text-right bg-amber-500/25">GT mở</th>
                          <th className="px-3 py-2.5 font-bold text-right">Chốt</th>
                          <th className="px-3 py-2.5 font-bold text-right">GT chốt</th>
                          <th className="px-3 py-2.5 font-bold text-right">Thua</th>
                          <th className="px-3 py-2.5 font-bold text-right">GT thua</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailData.pipelines.length === 0 ? (
                          <tr>
                            <td colSpan={12} className="px-3 py-8 text-center text-gray-400">
                              Không có lead/deal trong các pipeline (hoặc chưa gán pipeline).
                            </td>
                          </tr>
                        ) : (
                          detailData.pipelines.map((p, idx) => (
                            <tr
                              key={p.pipeline_id || `none-${idx}`}
                              className={`border-t border-gray-100 hover:bg-teal-50/40 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                            >
                              <td className="px-3 py-2.5 font-medium text-gray-900">{p.pipeline_name}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums">{p.lead_count ?? 0}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-xs">{formatVND(p.lead_value || 0)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums">{p.deal_count ?? 0}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-xs">{formatVND(p.deal_value || 0)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-sm font-semibold text-blue-900 bg-blue-50/60">
                                {formatVND(p.total_value || 0)}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-amber-900 font-medium bg-amber-50/40">
                                {p.open_deal_count ??
                                  Math.max(0, (p.deal_count || 0) - (p.won_deal_count || 0) - (p.lost_deal_count || 0))}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-xs text-amber-900 bg-amber-50/30">
                                {formatVND(
                                  p.open_value ??
                                    Math.max(0, (p.deal_value || 0) - (p.won_value || 0) - (p.lost_value || 0)),
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">{p.won_deal_count ?? 0}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-xs text-emerald-800">{formatVND(p.won_value || 0)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-red-700">{p.lost_deal_count ?? 0}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-xs text-red-800">{formatVND(p.lost_value || 0)}</td>
                            </tr>
                          ))
                        )}
                        {detailData.pipelines.length > 0 && (
                          <tr className="border-t-2 border-teal-200 bg-gradient-to-r from-teal-50 to-cyan-50 font-bold text-slate-900">
                            <td className="px-3 py-3">Tổng</td>
                            <td className="px-3 py-3 text-right tabular-nums">{detailTotals.lead_count}</td>
                            <td className="px-3 py-3 text-right tabular-nums text-xs">{formatVND(detailTotals.lead_value)}</td>
                            <td className="px-3 py-3 text-right tabular-nums">{detailTotals.deal_count}</td>
                            <td className="px-3 py-3 text-right tabular-nums text-xs">{formatVND(detailTotals.deal_value)}</td>
                            <td className="px-3 py-3 text-right tabular-nums text-sm text-blue-950 bg-blue-100/80">
                              {formatVND(detailTotals.total_value)}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums text-amber-950 bg-amber-100/80">{detailTotals.open_deal_count}</td>
                            <td className="px-3 py-3 text-right tabular-nums text-xs text-amber-950 bg-amber-100/70">{formatVND(detailTotals.open_value)}</td>
                            <td className="px-3 py-3 text-right tabular-nums text-emerald-900">{detailTotals.won_deal_count}</td>
                            <td className="px-3 py-3 text-right tabular-nums text-xs">{formatVND(detailTotals.won_value)}</td>
                            <td className="px-3 py-3 text-right tabular-nums text-red-900">{detailTotals.lost_deal_count}</td>
                            <td className="px-3 py-3 text-right tabular-nums text-xs">{formatVND(detailTotals.lost_value)}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <p className="text-xs text-slate-500 leading-relaxed">
                    <strong>Hoàn thành</strong>: stage <code className="rounded bg-slate-100 px-1">completed</code> (xong HĐ, thu tiền).{' '}
                    <strong>Đang triển khai</strong>: đã qua ký HĐ theo funnel chuẩn (slug khác designing…negotiating…waiting_deposit), chưa{' '}
                    <code className="rounded bg-slate-100 px-1">completed</code>. <strong>Chưa chốt</strong>: slug báo giá / đàm phán / cọc hoặc chưa cờ won. Giá trị{' '}
                    <code className="rounded bg-slate-100 px-1">estimated_value</code>, kỳ theo <code className="rounded bg-slate-100 px-1">created_at</code>.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
