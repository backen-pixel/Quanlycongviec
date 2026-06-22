import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { formatVND, formatKpiLedgerNet } from '../lib/utils';
import { loadXlsx } from '../lib/xlsxLoader';
import KpiUserFilter from '../components/KpiUserFilter';
import DateRangePickerPopover from '../components/DateRangePickerPopover';
import EmployeeReportPanel, { LeadTypeBreakdownChart, FirstStageSlaChart } from '../components/crm/EmployeeReportPanel';
import {
  BarChart3,
  Building2,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Download,
  FileText,
  Layers,
  MapPin,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

const STACK_COLORS = {
  'Đã chốt': '#059669',
  Thua: '#e11d48',
  'Đang mở': '#0284c7',
};

function buildDealStackedRows(items, nameKey, max = 12) {
  return (items || [])
    .filter((r) => (r.deal_count || 0) > 0)
    .slice(0, max)
    .map((r) => {
      const open = Math.max(0, (r.deal_count || 0) - (r.won_deal_count || 0) - (r.lost_deal_count || 0));
      return {
        name: truncLabel(r[nameKey], 14),
        'Đã chốt': r.won_deal_count || 0,
        Thua: r.lost_deal_count || 0,
        'Đang mở': open,
      };
    });
}

function DealStackedBarChart({ data, title }) {
  if (!data?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/30">
      {title && <p className="text-sm font-bold text-slate-800 mb-3">{title}</p>}
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 4, right: 12 }}>
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
  );
}

const TABS = [
  { id: 'overview', label: 'Tổng quan', icon: BarChart3 },
  { id: 'company', label: 'Công ty', icon: Building2 },
  { id: 'region', label: 'Khu vực', icon: MapPin },
  { id: 'employee', label: 'Nhân viên', icon: Users },
];

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

function formatViDate(iso) {
  if (!iso || typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) return '—';
  const [y, m, d] = iso.trim().split('-');
  return `${d}/${m}/${y}`;
}

function truncLabel(s, max = 24) {
  if (!s) return '—';
  const t = String(s);
  return t.length <= max ? t : `${t.slice(0, Math.max(0, max - 1))}…`;
}

function KpiCard({ label, value, sub, accent = 'border-blue-300 bg-blue-50', compareKey, compare }) {
  const c = compareKey && compare?.[compareKey];
  const pct = c?.pct;
  const showTrend = c && (c.delta !== 0 || pct !== 0);
  const up = (pct ?? c?.delta ?? 0) > 0;
  const down = (pct ?? c?.delta ?? 0) < 0;
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${accent}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-900">{value}</p>
      {showTrend && (
        <p className={`mt-1 text-xs font-semibold inline-flex items-center gap-0.5 ${up ? 'text-emerald-700' : down ? 'text-red-600' : 'text-slate-500'}`}>
          {up ? <TrendingUp className="w-3.5 h-3.5" /> : down ? <TrendingDown className="w-3.5 h-3.5" /> : null}
          {pct != null ? `${pct > 0 ? '+' : ''}${pct}%` : compareKey === 'conversion_rate' ? `${c.delta > 0 ? '+' : ''}${c.delta} điểm` : `${c.delta > 0 ? '+' : ''}${c.delta}`}
          <span className="text-slate-400 font-normal ml-0.5">vs kỳ trước</span>
        </p>
      )}
      {sub && <p className="mt-0.5 text-xs text-slate-600">{sub}</p>}
    </div>
  );
}

function CollapsibleDataList({ label = 'Bảng số liệu', defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:text-indigo-900"
      >
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        {open ? 'Ẩn' : 'Hiện'} {label}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

function MetricTable({ columns, rows, onRowClick, emptyLabel = 'Chưa có dữ liệu' }) {
  if (!rows?.length) {
    return <p className="text-center text-sm text-slate-500 py-8">{emptyLabel}</p>;
  }
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
            {columns.map((c) => (
              <th key={c.key} className={`py-2 px-2 ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={row._key ?? idx}
              className={`border-t border-slate-100 ${onRowClick ? 'cursor-pointer hover:bg-indigo-50/60' : 'hover:bg-slate-50/70'}`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`py-2.5 px-2 tabular-nums ${c.align === 'right' ? 'text-right font-semibold' : 'text-left'} ${c.bold ? 'font-semibold text-slate-900' : 'text-slate-700'}`}
                >
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const METRIC_COLS = [
  { key: 'lead_count', label: 'Lead', align: 'right' },
  { key: 'deal_count', label: 'Deal', align: 'right' },
  {
    key: 'expected_value',
    label: 'Dự kiến',
    align: 'right',
    render: (r) => formatVND(r.expected_value || 0),
  },
  {
    key: 'weighted_value',
    label: 'Kỳ vọng',
    align: 'right',
    render: (r) => formatVND(r.weighted_value || 0),
  },
  {
    key: 'won_value',
    label: 'Thắng',
    align: 'right',
    render: (r) => formatVND(r.won_value || 0),
  },
  {
    key: 'completed_value',
    label: 'Hoàn thành',
    align: 'right',
    render: (r) => formatVND(r.completed_value || 0),
  },
  {
    key: 'overdue_count',
    label: 'Quá hạn SLA',
    align: 'right',
    render: (r) => {
      const n = r.overdue_count ?? 0;
      const pct = r.overdue_rate_pct;
      return pct != null ? `${n} (${pct}%)` : String(n);
    },
  },
  {
    key: 'reception_overdue_count',
    label: 'QH tiếp nhận',
    align: 'right',
    render: (r) => {
      const n = r.reception_overdue_count ?? 0;
      const pct = r.reception_overdue_rate_pct;
      const eligible = r.reception_eligible_count ?? 0;
      if (!eligible) return '—';
      return pct != null ? `${n}/${eligible} (${pct}%)` : String(n);
    },
  },
  {
    key: 'first_stage_on_time_rate_pct',
    label: 'Cột 1 (đúng/QH)',
    align: 'right',
    render: (r) => {
      const open = r.first_stage_open_count ?? 0;
      if (!open) return '—';
      return `${r.first_stage_on_time_rate_pct ?? 0}% / ${r.first_stage_overdue_rate_pct ?? 0}%`;
    },
  },
  {
    key: 'kpi_ledger_net',
    label: 'Điểm KPI',
    align: 'right',
    render: (r) => formatKpiLedgerNet(r.kpi_ledger_net),
  },
  {
    key: 'pipeline_value',
    label: 'Pipeline',
    align: 'right',
    render: (r) => formatVND(r.pipeline_value ?? (r.lead_pipeline_value || 0) + (r.deal_pipeline_value || 0)),
  },
  { key: 'won_deal_count', label: 'Chốt SL', align: 'right' },
  { key: 'lost_deal_count', label: 'Thua', align: 'right' },
  {
    key: 'conversion_rate',
    label: 'Tỷ lệ chốt',
    align: 'right',
    render: (r) => `${r.conversion_rate ?? 0}%`,
  },
];

export default function CrmOrgOverviewReport() {
  const [dateFrom, setDateFrom] = useState(() => defaultMonthRange().from);
  const [dateTo, setDateTo] = useState(() => defaultMonthRange().to);
  const [filter, setFilter] = useState({ companyId: '', departmentId: '', q: '' });
  const [regionId, setRegionId] = useState('');
  const [typeView, setTypeView] = useState('all');
  const [activeTab, setActiveTab] = useState('overview');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [rangePickerOpen, setRangePickerOpen] = useState(false);
  const [companyRegions, setCompanyRegions] = useState([]);
  const [pdfLoading, setPdfLoading] = useState(false);

  const reportQueryParams = useMemo(
    () => ({
      date_from: dateFrom,
      date_to: dateTo,
      ...(typeView !== 'all' ? { type: typeView } : {}),
      ...(filter.companyId ? { company_id: filter.companyId } : {}),
      ...(regionId ? { region_id: regionId } : {}),
      ...(filter.departmentId ? { department_id: filter.departmentId } : {}),
    }),
    [dateFrom, dateTo, typeView, filter.companyId, filter.departmentId, regionId],
  );

  useEffect(() => {
    if (!filter.companyId) {
      setCompanyRegions([]);
      return undefined;
    }
    let cancel = false;
    api
      .get('/crm/company-regions', { params: { company_id: filter.companyId, for_module: 'crm' } })
      .then((r) => {
        if (!cancel) setCompanyRegions(Array.isArray(r.data) ? r.data : []);
      })
      .catch(() => {
        if (!cancel) setCompanyRegions([]);
      });
    return () => { cancel = true; };
  }, [filter.companyId]);

  useEffect(() => {
    if (!regionId) return;
    const ok = companyRegions.some((reg) => String(reg.id) === String(regionId));
    if (!ok) setRegionId('');
  }, [companyRegions, regionId]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data: res } = await api.get('/crm/reports/org-overview', { params: reportQueryParams });
      setData(res);
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [reportQueryParams]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = data?.summary || {};
  const compare = data?.compare || null;
  const periodPrevious = data?.period_previous || null;

  const timelineChart = useMemo(
    () => (data?.timeline || []).map((d) => ({
      ...d,
      label: formatViDate(d.date),
    })),
    [data],
  );

  const funnelChart = useMemo(
    () => (data?.pipeline_funnel || [])
      .filter((s) => (s.count || 0) > 0)
      .slice(0, 12)
      .map((s) => ({
        name: truncLabel(s.name, 18),
        count: s.count || 0,
        value: s.value || 0,
      })),
    [data],
  );

  const regionBarChart = useMemo(
    () => (data?.by_region || [])
      .slice(0, 10)
      .map((r) => ({
        name: truncLabel(r.region_name, 16),
        value: r.pipeline_value ?? 0,
      })),
    [data],
  );

  const leadTypeBarChart = useMemo(
    () => (data?.by_lead_type || [])
      .filter((r) => (r.lead_count || 0) + (r.deal_count || 0) > 0)
      .slice(0, 12)
      .map((r) => ({
        name: truncLabel(r.lead_type_name, 16),
        Lead: r.lead_count ?? 0,
        Deal: r.deal_count ?? 0,
      })),
    [data],
  );

  const firstStageSla = useMemo(() => {
    const s = data?.summary;
    if (!s?.first_stage_open_count) return null;
    return {
      open_count: s.first_stage_open_count,
      on_time_count: s.first_stage_on_time_count,
      overdue_count: s.first_stage_overdue_count,
      on_time_rate_pct: s.first_stage_on_time_rate_pct,
      overdue_rate_pct: s.first_stage_overdue_rate_pct,
    };
  }, [data]);

  const employeeStacked = useMemo(
    () => buildDealStackedRows(data?.by_employee, 'full_name', 12),
    [data],
  );

  const regionStacked = useMemo(
    () => buildDealStackedRows(data?.by_region, 'region_name', 10),
    [data],
  );

  const dealOutcomePie = useMemo(() => {
    let won = 0;
    let lost = 0;
    let open = 0;
    for (const r of data?.by_employee || []) {
      won += r.won_deal_count || 0;
      lost += r.lost_deal_count || 0;
      open += Math.max(0, (r.deal_count || 0) - (r.won_deal_count || 0) - (r.lost_deal_count || 0));
    }
    return [
      { name: 'Đã chốt', value: won, color: '#059669' },
      { name: 'Thua', value: lost, color: '#e11d48' },
      { name: 'Đang mở', value: open, color: '#0284c7' },
    ].filter((x) => x.value > 0);
  }, [data]);

  const exportExcel = async () => {
    if (!data) return;
    const XLSX = await loadXlsx();
    const wb = XLSX.utils.book_new();
    const sheet = (name, rows, mapFn) => {
      if (!rows?.length) return;
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.map(mapFn)), name);
    };
    sheet('Tom tat', [summary], (r) => ({
      Lead: r.lead_count ?? 0,
      Deal: r.deal_count ?? 0,
      'Pipeline': r.pipeline_value ?? 0,
      'Chot SL': r.won_deal_count ?? 0,
      'GT chot': r.won_value ?? 0,
      'Ty le chot %': r.conversion_rate ?? 0,
    }));
    sheet('Cong ty', data.by_company, (r) => ({
      'Cong ty': r.company_name,
      Lead: r.lead_count,
      Deal: r.deal_count,
      Pipeline: r.pipeline_value,
      Chot: r.won_deal_count,
      'GT chot': r.won_value,
    }));
    sheet('Khu vuc', data.by_region, (r) => ({
      'Khu vuc': r.region_name,
      'Cong ty': r.company_name,
      Lead: r.lead_count,
      Deal: r.deal_count,
      Pipeline: r.pipeline_value,
      Chot: r.won_deal_count,
    }));
    sheet('Nhan vien', data.by_employee, (r) => ({
      'Nhan vien': r.full_name,
      'Phong ban': r.department_name,
      Lead: r.lead_count,
      Deal: r.deal_count,
      Pipeline: r.pipeline_value,
      Chot: r.won_deal_count,
      'QH tiep nhan %': r.reception_overdue_rate_pct,
    }));
    sheet('Phan loai', data.by_lead_type, (r) => ({
      'Phan loai': r.lead_type_name,
      'Ap dung': r.applies_to,
      Lead: r.lead_count,
      Deal: r.deal_count,
      Pipeline: r.pipeline_value,
      'QH tiep nhan %': r.reception_overdue_rate_pct,
    }));
    XLSX.writeFile(wb, `crm-bc-to-chuc_${dateFrom}_${dateTo}.xlsx`);
  };

  const downloadPdf = async () => {
    setPdfLoading(true);
    try {
      const res = await api.get('/crm/reports/org-overview/export.pdf', {
        params: reportQueryParams,
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `BAO_CAO_TO_CHUC_${dateFrom}_${dateTo}.pdf`;
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

  const drillToCompany = (row) => {
    if (!row.company_id) return;
    setFilter((f) => ({ ...f, companyId: String(row.company_id) }));
    setRegionId('');
    setActiveTab('region');
  };

  const drillToRegion = (row) => {
    if (row.company_id) {
      setFilter((f) => ({ ...f, companyId: String(row.company_id) }));
    }
    if (row.region_id) setRegionId(String(row.region_id));
    setActiveTab('employee');
  };

  const pipelineQueryParams = useMemo(
    () => ({
      date_from: dateFrom,
      date_to: dateTo,
      ...(filter.companyId ? { company_id: filter.companyId } : {}),
      ...(regionId ? { region_id: regionId } : {}),
    }),
    [dateFrom, dateTo, filter.companyId, regionId],
  );

  return (
    <div className="min-w-0 max-w-[1600px] mx-auto space-y-5 pb-8 p-4 md:p-6">
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-600">Báo cáo CRM · Tổ chức</p>
            <h1 className="mt-1 text-2xl md:text-3xl font-bold text-slate-900 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 ring-1 ring-indigo-100">
                <BarChart3 className="w-6 h-6 text-indigo-600" />
              </span>
              Báo cáo theo công ty / khu vực / NV
            </h1>
            <p className="mt-2 text-sm text-slate-600 max-w-2xl leading-relaxed">
              Số liệu lead/deal theo <strong className="text-slate-900">ngày tạo</strong>. Click dòng công ty hoặc khu vực để drill-down.
              {periodPrevious?.date_from && (
                <span className="block mt-1 text-slate-500 text-xs">
                  So sánh với kỳ trước: {formatViDate(periodPrevious.date_from)} → {formatViDate(periodPrevious.date_to)}
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Tải lại
            </button>
            <button
              type="button"
              onClick={downloadPdf}
              disabled={pdfLoading || !data}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold shadow-sm disabled:opacity-50"
            >
              <FileText className="w-4 h-4" />
              {pdfLoading ? 'Đang tạo PDF…' : 'Xuất PDF'}
            </button>
            <button
              type="button"
              onClick={exportExcel}
              disabled={!data}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-40"
            >
              <Download className="w-4 h-4" />
              Xuất Excel
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4 md:p-5 space-y-4">
        <div className="flex flex-col gap-1 min-w-[min(100%,280px)]">
          <span className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
            <CalendarRange className="w-4 h-4 text-indigo-500" />
            Kỳ báo cáo
          </span>
          <button
            type="button"
            onClick={() => setRangePickerOpen(true)}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-indigo-200 bg-white text-sm text-left max-w-md hover:border-indigo-400"
          >
            <span className="tabular-nums font-medium">
              {formatViDate(dateFrom)} → {formatViDate(dateTo)}
            </span>
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Phân loại</span>
          <div className="inline-flex rounded-xl border border-indigo-200 bg-white p-1 shadow-sm w-fit">
            {[
              { id: 'all', label: 'Cả hai', icon: Layers },
              { id: 'lead', label: 'Chỉ Lead', icon: TrendingUp },
              { id: 'deal', label: 'Chỉ Deal', icon: Wallet },
            ].map((opt) => {
              const Icon = opt.icon;
              const active = typeView === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTypeView(opt.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${
                    active ? 'text-white bg-indigo-600 shadow' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <KpiUserFilter value={filter} onChange={setFilter} />

        <label className="block max-w-xs">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Khu vực</span>
          <select
            value={regionId}
            onChange={(e) => setRegionId(e.target.value)}
            disabled={!filter.companyId}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-50"
          >
            <option value="">Tất cả khu vực</option>
            {companyRegions.map((r) => (
              <option key={r.id} value={r.id}>{r.name}{r.code ? ` (${r.code})` : ''}</option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white text-sm font-semibold shadow-md disabled:opacity-50"
        >
          Áp dụng bộ lọc
        </button>
      </div>

      <DateRangePickerPopover
        open={rangePickerOpen}
        title="Chọn khoảng thời gian báo cáo"
        from={dateFrom}
        to={dateTo}
        onClose={() => setRangePickerOpen(false)}
        onApply={({ from, to }) => {
          setDateFrom(from);
          setDateTo(to);
          setRangePickerOpen(false);
        }}
      />

      {err && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
      )}

      {loading && !data ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="animate-spin h-10 w-10 border-4 border-indigo-600 border-t-transparent rounded-full" />
          <p className="text-sm text-slate-600">Đang tải báo cáo…</p>
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-3">
            <KpiCard
              label="Quá hạn SLA"
              value={summary.overdue_count ?? 0}
              compare={compare}
              compareKey="overdue_count"
              sub={summary.overdue_rate_pct != null ? `${summary.overdue_rate_pct}% trên ${summary.open_count ?? 0} đang mở` : `${summary.open_count ?? 0} đang mở`}
              accent="border-rose-200 bg-gradient-to-br from-rose-50 to-white"
            />
            <KpiCard
              label="Quá hạn tiếp nhận"
              value={
                summary.reception_overdue_rate_pct != null
                  ? `${summary.reception_overdue_rate_pct}%`
                  : '—'
              }
              compare={compare}
              compareKey="reception_overdue_count"
              sub={
                summary.reception_eligible_count
                  ? `${summary.reception_overdue_count ?? 0}/${summary.reception_eligible_count} lead · SLA ${data?.reception_sla_minutes ?? 15} phút`
                  : 'Chưa có lead trong kỳ'
              }
              accent="border-orange-200 bg-gradient-to-br from-orange-50 to-white"
            />
            <KpiCard
              label="Điểm KPI (tháng)"
              value={formatKpiLedgerNet(summary.kpi_ledger_net ?? 0)}
              compare={compare}
              compareKey="kpi_ledger_net"
              sub={data?.kpi_ledger_period_start ? `Kỳ ${formatViDate(data.kpi_ledger_period_start)}` : 'Sổ cái CRM'}
              accent="border-indigo-200 bg-gradient-to-br from-indigo-50 to-white"
            />
            <KpiCard
              label="Giá trị dự kiến"
              value={formatVND(summary.expected_value ?? 0)}
              compare={compare}
              compareKey="expected_value"
              accent="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white"
            />
            <KpiCard
              label="Giá trị kỳ vọng"
              value={formatVND(summary.weighted_value ?? 0)}
              compare={compare}
              compareKey="weighted_value"
              accent="border-amber-200 bg-gradient-to-br from-amber-50 to-white"
            />
            <KpiCard
              label="GT thắng (ký HĐ)"
              value={formatVND(summary.won_value ?? 0)}
              compare={compare}
              compareKey="won_value"
              sub={`${summary.won_deal_count ?? 0} deal`}
              accent="border-sky-200 bg-gradient-to-br from-sky-50 to-white"
            />
            <KpiCard
              label="GT hoàn thành"
              value={formatVND(summary.completed_value ?? 0)}
              compare={compare}
              compareKey="completed_value"
              sub={`${summary.completed_deal_count ?? 0} deal`}
              accent="border-violet-200 bg-gradient-to-br from-violet-50 to-white"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Lead" value={summary.lead_count ?? 0} compare={compare} compareKey="lead_count" accent="border-blue-200 bg-blue-50" />
            <KpiCard label="Deal" value={summary.deal_count ?? 0} compare={compare} compareKey="deal_count" accent="border-cyan-200 bg-cyan-50" />
            <KpiCard
              label="Pipeline"
              value={formatVND(summary.pipeline_value ?? 0)}
              compare={compare}
              compareKey="pipeline_value"
              accent="border-indigo-200 bg-indigo-50"
            />
            <KpiCard
              label="Tỷ lệ chốt"
              value={`${summary.conversion_rate ?? 0}%`}
              compare={compare}
              compareKey="conversion_rate"
              sub={`${summary.lost_deal_count ?? 0} deal thua`}
              accent="border-slate-200 bg-slate-50"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                    active
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Section title="Xu hướng theo ngày" subtitle="Lead / Deal tạo mới trong kỳ" className="lg:col-span-2">
                {timelineChart.length > 0 ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={timelineChart} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                        <YAxis yAxisId="left" tick={{ fontSize: 11 }} allowDecimals={false} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1e6)}M`} />
                        <RechartsTooltip
                          formatter={(v, name) => {
                            if (name === 'GT chốt') return [formatVND(v), name];
                            return [v, name];
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Line yAxisId="left" type="monotone" dataKey="lead_count" name="Lead" stroke="#6366f1" strokeWidth={2} dot={false} />
                        <Line yAxisId="left" type="monotone" dataKey="deal_count" name="Deal" stroke="#0891b2" strokeWidth={2} dot={false} />
                        <Line yAxisId="right" type="monotone" dataKey="won_value" name="GT chốt" stroke="#059669" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 py-6 text-center">Chưa có dữ liệu xu hướng</p>
                )}
                <CollapsibleDataList label="bảng số liệu theo ngày">
                  <MetricTable
                    columns={[
                      { key: 'label', label: 'Ngày', bold: true },
                      { key: 'lead_count', label: 'Lead', align: 'right' },
                      { key: 'deal_count', label: 'Deal', align: 'right' },
                      { key: 'won_value', label: 'GT chốt', align: 'right', render: (r) => formatVND(r.won_value || 0) },
                      { key: 'pipeline_value', label: 'Pipeline', align: 'right', render: (r) => formatVND(r.pipeline_value || 0) },
                    ]}
                    rows={timelineChart.map((r) => ({ ...r, _key: r.date }))}
                  />
                </CollapsibleDataList>
              </Section>

              <Section title="Kết quả Deal" subtitle="Chốt / thua / đang mở (toàn bộ NV trong phạm vi)">
                {dealOutcomePie.length > 0 ? (
                  <div className="h-52 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={dealOutcomePie}
                          cx="50%"
                          cy="50%"
                          innerRadius={48}
                          outerRadius={72}
                          paddingAngle={2}
                          dataKey="value"
                          nameKey="name"
                        >
                          {dealOutcomePie.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} stroke="#fff" strokeWidth={2} />
                          ))}
                        </Pie>
                        <RechartsTooltip formatter={(v, n) => [`${v} deal`, n]} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 py-6 text-center">Chưa có deal trong kỳ</p>
                )}
                {employeeStacked.length > 0 && (
                  <DealStackedBarChart data={employeeStacked.slice(0, 8)} title="Top NV — phân bổ deal" />
                )}
              </Section>

              <Section title="Phễu pipeline" subtitle="Số lead/deal theo giai đoạn">
                {funnelChart.length > 0 ? (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={funnelChart} layout="vertical" margin={{ left: 8, right: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                        <RechartsTooltip formatter={(v, n) => [n === 'count' ? `${v} cơ hội` : formatVND(v), n === 'count' ? 'Số lượng' : 'Giá trị']} />
                        <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 py-6 text-center">Chưa có dữ liệu pipeline</p>
                )}
                <CollapsibleDataList label="bảng số liệu pipeline">
                  <MetricTable
                    columns={[
                      { key: 'name', label: 'Giai đoạn', bold: true, render: (r) => `${r.icon || ''} ${r.name}`.trim() },
                      { key: 'count', label: 'SL', align: 'right' },
                      { key: 'value', label: 'Giá trị', align: 'right', render: (r) => formatVND(r.value || 0) },
                    ]}
                    rows={(data.pipeline_funnel || []).map((r, i) => ({ ...r, _key: r.stage_id || i }))}
                  />
                </CollapsibleDataList>
              </Section>

              <Section title="Theo khu vực" subtitle="Top giá trị pipeline">
                {regionBarChart.length > 0 ? (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={regionBarChart}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1e6)}M`} />
                        <RechartsTooltip formatter={(v) => [formatVND(v), 'Pipeline']} />
                        <Bar dataKey="value" fill="#0891b2" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : null}
                <CollapsibleDataList label="bảng số liệu theo khu vực">
                  <MetricTable
                    columns={[
                      { key: 'region_name', label: 'Khu vực', bold: true },
                      { key: 'company_name', label: 'Công ty' },
                      ...METRIC_COLS,
                    ]}
                    rows={(data.by_region || []).map((r) => ({ ...r, _key: r.region_id || r.region_name }))}
                    onRowClick={drillToRegion}
                  />
                </CollapsibleDataList>
              </Section>

              <Section title="Theo phân loại Lead/Deal" subtitle="Theo loại đã cấu hình tại Pipeline → Phân loại (crm_lead_types)" className="lg:col-span-2">
                {leadTypeBarChart.length > 0 ? (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={leadTypeBarChart}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={56} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <RechartsTooltip />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="Lead" stackId="ld" fill="#6366f1" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="Deal" stackId="ld" fill="#0891b2" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 py-6 text-center">Chưa có lead/deal gắn phân loại trong kỳ</p>
                )}
                <CollapsibleDataList label="bảng số liệu theo phân loại">
                  <MetricTable
                    columns={[
                      {
                        key: 'lead_type_name',
                        label: 'Phân loại',
                        bold: true,
                        render: (r) => (
                          <span className="inline-flex items-center gap-1.5">
                            {r.lead_type_color && (
                              <span
                                className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: r.lead_type_color }}
                              />
                            )}
                            {r.lead_type_name}
                          </span>
                        ),
                      },
                      {
                        key: 'applies_to',
                        label: 'Áp dụng',
                        render: (r) => {
                          const v = r.applies_to;
                          if (v === 'lead') return 'Lead';
                          if (v === 'deal') return 'Deal';
                          if (v === 'both') return 'Lead & Deal';
                          return '—';
                        },
                      },
                      ...METRIC_COLS,
                    ]}
                    rows={(data.by_lead_type || []).map((r) => ({ ...r, _key: r.lead_type_id || r.lead_type_name }))}
                  />
                </CollapsibleDataList>
              </Section>

              <Section title="Theo nguồn Lead" subtitle="Hiệu quả kênh marketing" className="lg:col-span-2">
                <CollapsibleDataList label="bảng số liệu theo nguồn">
                  <MetricTable
                    columns={[
                      {
                        key: 'source_name',
                        label: 'Nguồn',
                        bold: true,
                        render: (r) => (
                          <span>{r.source_icon ? `${r.source_icon} ` : ''}{r.source_name}</span>
                        ),
                      },
                      ...METRIC_COLS,
                    ]}
                    rows={(data.by_source || []).map((r) => ({ ...r, _key: r.source_id || r.source_name }))}
                  />
                </CollapsibleDataList>
              </Section>
            </div>
          )}

          {activeTab === 'company' && (
            <Section title="Theo công ty" subtitle="Click dòng để xem khu vực">
              <CollapsibleDataList label="bảng số liệu theo công ty">
                <MetricTable
                  columns={[
                    {
                      key: 'company_name',
                      label: 'Công ty',
                      bold: true,
                      render: (r) => (
                        <span className="inline-flex items-center gap-1">
                          {r.company_name}
                          {r.company_id && <ChevronRight className="w-3.5 h-3.5 text-indigo-500" />}
                        </span>
                      ),
                    },
                    ...METRIC_COLS,
                  ]}
                  rows={(data.by_company || []).map((r) => ({ ...r, _key: r.company_id || r.company_name }))}
                  onRowClick={drillToCompany}
                />
              </CollapsibleDataList>
            </Section>
          )}

          {activeTab === 'region' && (
            <Section title="Theo khu vực" subtitle="Click dòng để xem nhân viên">
              {regionStacked.length > 0 && (
                <DealStackedBarChart data={regionStacked} title="Deal theo khu vực (chốt / thua / mở)" />
              )}
              <CollapsibleDataList label="bảng số liệu theo khu vực">
                <MetricTable
                  columns={[
                    {
                      key: 'region_name',
                      label: 'Khu vực',
                      bold: true,
                      render: (r) => (
                        <span className="inline-flex items-center gap-1">
                          {r.region_name}
                          {r.region_id && <ChevronRight className="w-3.5 h-3.5 text-indigo-500" />}
                        </span>
                      ),
                    },
                    { key: 'company_name', label: 'Công ty' },
                    ...METRIC_COLS,
                  ]}
                  rows={(data.by_region || []).map((r) => ({ ...r, _key: r.region_id || r.region_name }))}
                  onRowClick={drillToRegion}
                />
              </CollapsibleDataList>
            </Section>
          )}

          {activeTab === 'employee' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <LeadTypeBreakdownChart rows={data.by_lead_type || []} />
                <FirstStageSlaChart sla={firstStageSla} />
              </div>

              <Section title="Bảng tổng hợp nhân viên" subtitle="Lead/deal, quá hạn tiếp nhận và SLA cột đầu pipeline (lead/deal đang mở ở cột 1)">
                {employeeStacked.length > 0 && (
                  <DealStackedBarChart data={employeeStacked} title="Deal theo nhân viên (chốt / thua / mở)" />
                )}
                <CollapsibleDataList label="bảng số liệu nhân viên" defaultOpen>
                  <MetricTable
                    columns={[
                      { key: 'full_name', label: 'Nhân viên', bold: true },
                      { key: 'department_name', label: 'Phòng ban' },
                      ...METRIC_COLS,
                    ]}
                    rows={(data.by_employee || [])
                      .filter((r) => r.user_id)
                      .map((r) => ({ ...r, _key: r.user_id }))}
                  />
                </CollapsibleDataList>
              </Section>

              <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 pt-5 pb-3 border-b border-slate-100">
                  <h2 className="text-base font-bold text-slate-900">Chi tiết từng nhân viên</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Chọn thẻ nhân viên để xem biểu đồ pipeline · SLA tiếp nhận: {data?.reception_sla_minutes ?? 15} phút
                  </p>
                </div>
                <div className="p-4 md:p-5 min-w-0">
                  <EmployeeReportPanel
                    employees={data.by_employee || []}
                    queryParams={pipelineQueryParams}
                    typeView={typeView}
                    receptionSlaMinutes={data?.reception_sla_minutes ?? 15}
                  />
                </div>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function Section({ title, subtitle, children, className = '' }) {
  return (
    <div className={`rounded-2xl bg-white border border-slate-200 p-5 shadow-sm space-y-4 ${className}`}>
      <div>
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
