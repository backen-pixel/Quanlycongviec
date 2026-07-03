import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { formatVND, formatKpiLedgerNet } from '../lib/utils';
import { loadXlsx } from '../lib/xlsxLoader';
import { downloadOrgEmployeeExcel } from '../lib/crmOrgEmployeeExcelExport';
import DateRangePickerPopover from '../components/DateRangePickerPopover';
import EmployeeReportPanel, { LeadTypeBreakdownChart, FirstStageSlaChart } from '../components/crm/EmployeeReportPanel';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';
import {
  readStoredDealKhSplitPreference,
  splitDealStagesForCrmTabs,
  storeDealKhSplitPreference,
} from '../lib/crmPipelineTabs';
import {
  BarChart3,
  Building2,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Download,
  FileText,
  MapPin,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
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

/** Chốt = thắng + sau thắng + hoàn thành (cùng một chỉ số). */
function reportClosedWonCount(r) {
  return r?.won_or_later_deal_count ?? r?.won_deal_count ?? 0;
}

function reportClosedWonValue(r) {
  return r?.won_or_later_value ?? r?.won_value ?? r?.completed_value ?? 0;
}

function reportCancelLostTotal(r) {
  return (r?.lost_lead_count ?? 0) + (r?.lost_deal_count ?? 0);
}

function reportCancelTotalCount(r) {
  return (r?.lead_count ?? 0) + (r?.deal_count ?? 0) + (r?.customer_order_count ?? 0);
}

const DEAL_ONLY_METRIC_KEYS = new Set([
  'deal_count',
  'customer_order_count',
  'won_vs_total',
  'delivered_deal_count',
  'on_time_deal_count',
  'late_deal_count',
  'no_evidence_deal_count',
  'on_time_rate_pct',
  'conversion_rate',
  'deal_close_value_rate_pct',
  'quote_deal_count',
  'quote_value',
  'won_or_later_deal_count',
  'won_or_later_value',
  'quote_win_rate_pct',
  'monthly_growth_pct',
  'expected_value',
  'weighted_value',
  'overdue_count',
  'first_stage_on_time_rate_pct',
  'pipeline_value',
  'lost_deal_count',
]);

const LEAD_ONLY_METRIC_KEYS = new Set([
  'lead_count',
  'reception_overdue_count',
]);

function buildDealStackedRows(items, nameKey, max = 12) {
  return (items || [])
    .filter((r) => (r.deal_count || 0) > 0)
    .slice(0, max)
    .map((r) => {
      const closed = reportClosedWonCount(r);
      const open = Math.max(0, (r.deal_count || 0) - closed - (r.lost_deal_count || 0));
      return {
        name: truncLabel(r[nameKey], 14),
        'Đã chốt': closed,
        Thua: r.lost_deal_count || 0,
        'Đang mở': open,
      };
    });
}

function formatVNDShort(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num === 0) return '0';
  if (Math.abs(num) >= 1e9) return `${(num / 1e9).toFixed(1)} tỷ`;
  if (Math.abs(num) >= 1e6) return `${Math.round(num / 1e6)} tr`;
  if (Math.abs(num) >= 1e3) return `${Math.round(num / 1e3)} k`;
  return String(Math.round(num));
}

/** Số tiền KPI: đầy đủ, có thể xuống dòng tại dấu chấm nhóm nghìn. */
function formatVNDKpi(n) {
  return formatVND(n ?? 0).replace(/\./g, '.\u200b');
}

const REPORT_FILTER_SELECT_CLS =
  'h-9 min-w-[6.5rem] max-w-[12rem] flex-1 sm:flex-none sm:max-w-[10rem] rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:opacity-50';

function pctLabel(value, detail) {
  const v = Number(value);
  if (!Number.isFinite(v)) return '—';
  return detail ? `${v}% (${detail})` : `${v}%`;
}

function buildQuoteCloseChartRows(items, nameKey, max = 10) {
  return (items || [])
    .filter((r) => reportCancelTotalCount(r) > 0
      || (r.quote_deal_count || 0) > 0
      || reportClosedWonCount(r) > 0)
    .slice()
    .sort(
      (a, b) => reportClosedWonValue(b) - reportClosedWonValue(a)
        || (b.quote_value || 0) - (a.quote_value || 0),
    )
    .slice(0, max)
    .map((r) => {
      const closedSl = reportClosedWonCount(r);
      const quoteSl = r.quote_deal_count || 0;
      const dealSl = r.deal_count || 0;
      const quoteGt = r.quote_value || 0;
      const closedGt = reportClosedWonValue(r);
      const lostTotal = reportCancelLostTotal(r);
      const totalLd = reportCancelTotalCount(r);
      return {
        name: truncLabel(r[nameKey], 14),
        'GT báo giá': quoteGt,
        'GT chốt': closedGt,
        'Tổng BG': quoteSl,
        'Chốt SL': closedSl,
        Deal: dealSl,
        Lead: r.lead_count || 0,
        'Tổng LD': totalLd,
        'Tỷ lệ chốt/BG': r.quote_win_rate_pct ?? 0,
        'Tỷ lệ chốt/tổng deal': r.conversion_rate ?? 0,
        'GT chốt/BG': r.quote_close_value_rate_pct ?? 0,
        'Tỷ lệ hủy': r.cancel_rate_pct ?? 0,
        'Tăng trưởng': r.monthly_growth_pct,
        _bgRateLabel: pctLabel(r.quote_win_rate_pct ?? 0, `${closedSl}/${quoteSl}`),
        _dealRateLabel: pctLabel(r.conversion_rate ?? 0, `${closedSl}/${dealSl}`),
        _gtRateLabel: pctLabel(r.quote_close_value_rate_pct ?? 0, `${formatVNDShort(closedGt)}/${formatVNDShort(quoteGt)}`),
        _cancelRateLabel: pctLabel(r.cancel_rate_pct ?? 0, `${lostTotal}/${totalLd}`),
        _gtBaoGiaLabel: formatVNDShort(quoteGt),
        _gtChotLabel: formatVNDShort(closedGt),
      };
    });
}

function ChartEmpty({ label = 'Chưa có dữ liệu' }) {
  return <p className="text-sm text-slate-500 py-10 text-center">{label}</p>;
}

function QuoteCloseValueBarChart({ data, title }) {
  const rows = useMemo(() => {
    if (!data?.length) return [];
    const maxQuote = Math.max(...data.map((d) => d['GT báo giá'] || 0), 1);
    return data.map((row, idx) => {
      const quote = row['GT báo giá'] || 0;
      const closed = row['GT chốt'] || 0;
      const rate = quote > 0
        ? Math.round((closed / quote) * 100)
        : Math.round(Number(row['GT chốt/BG']) || 0);
      return {
        ...row,
        rank: idx + 1,
        quote,
        closed,
        rate,
        quotePct: Math.min(100, (quote / maxQuote) * 100),
        closedPct: Math.min(100, (closed / maxQuote) * 100),
      };
    });
  }, [data]);

  if (!rows.length) return null;

  const rateBadgeClass = (rate) => {
    if (rate >= 50) return 'bg-emerald-100 text-emerald-800 ring-emerald-200/80';
    if (rate >= 25) return 'bg-amber-100 text-amber-900 ring-amber-200/80';
    return 'bg-slate-100 text-slate-600 ring-slate-200/80';
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50/80 to-indigo-50/30 p-4 md:p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          {title && <p className="text-sm font-bold text-slate-900">{title}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold">
          <span className="inline-flex items-center gap-1.5 text-amber-900">
            <span className="h-2 w-6 rounded-full bg-gradient-to-r from-amber-300 to-amber-500" aria-hidden />
            GT báo giá
          </span>
          <span className="inline-flex items-center gap-1.5 text-emerald-900">
            <span className="h-2 w-6 rounded-full bg-gradient-to-r from-emerald-400 to-teal-500" aria-hidden />
            GT chốt
          </span>
        </div>
      </div>

      <ul className="space-y-2.5 max-h-[320px] overflow-y-auto pr-0.5 [scrollbar-width:thin]">
        {rows.map((row) => (
          <li
            key={`${row.rank}-${row.name}`}
            className="rounded-xl border border-white/80 bg-white/95 p-3 shadow-sm ring-1 ring-slate-100/80"
          >
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-[11px] font-bold text-white tabular-nums shadow-sm">
                  {row.rank}
                </span>
                <span className="text-sm font-semibold text-slate-800 truncate" title={row.name}>
                  {row.name}
                </span>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ring-1 ${rateBadgeClass(row.rate)}`}
                title="GT chốt / GT báo giá"
              >
                {row.rate}% chốt/BG
              </span>
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-[3.25rem_minmax(0,1fr)_3.5rem] items-center gap-2">
                <span className="text-[10px] font-semibold text-amber-800">Báo giá</span>
                <div className="relative h-3 rounded-full bg-slate-100 overflow-hidden" title={formatVND(row.quote)}>
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 transition-[width] duration-500"
                    style={{ width: `${row.quotePct}%` }}
                  />
                </div>
                <span className="text-right text-[10px] font-bold tabular-nums text-amber-900">
                  {row._gtBaoGiaLabel}
                </span>
              </div>
              <div className="grid grid-cols-[3.25rem_minmax(0,1fr)_3.5rem] items-center gap-2">
                <span className="text-[10px] font-semibold text-emerald-800">Chốt</span>
                <div className="relative h-3 rounded-full bg-slate-100 overflow-hidden" title={formatVND(row.closed)}>
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-500 transition-[width] duration-500"
                    style={{ width: `${row.closedPct}%` }}
                  />
                </div>
                <span className="text-right text-[10px] font-bold tabular-nums text-emerald-900">
                  {row._gtChotLabel}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuoteCloseCountBarChart({ data, title }) {
  const rows = useMemo(() => {
    if (!data?.length) return [];
    const maxBg = Math.max(...data.map((d) => d['Tổng BG'] || 0), 1);
    return data.map((row, idx) => {
      const bg = row['Tổng BG'] || 0;
      const closed = row['Chốt SL'] || 0;
      const pending = Math.max(0, bg - closed);
      const winRate = bg > 0 ? Math.round((closed / bg) * 100) : 0;
      return {
        ...row,
        rank: idx + 1,
        bg,
        closed,
        pending,
        winRate,
        barWidthPct: Math.min(100, (bg / maxBg) * 100),
        closedShare: bg > 0 ? (closed / bg) * 100 : 0,
      };
    });
  }, [data]);

  if (!rows.length) return null;

  const winBadgeClass = (rate) => {
    if (rate >= 50) return 'bg-teal-100 text-teal-900 ring-teal-200/80';
    if (rate >= 25) return 'bg-cyan-100 text-cyan-900 ring-cyan-200/80';
    return 'bg-slate-100 text-slate-600 ring-slate-200/80';
  };

  return (
    <div className="rounded-2xl border border-teal-200/80 bg-gradient-to-br from-white via-teal-50/40 to-cyan-50/50 p-4 md:p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          {title && <p className="text-sm font-bold text-slate-900">{title}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold">
          <span className="inline-flex items-center gap-1.5 text-emerald-900">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" aria-hidden />
            Chốt SL
          </span>
          <span className="inline-flex items-center gap-1.5 text-orange-900">
            <span className="h-2.5 w-2.5 rounded-sm bg-orange-300" aria-hidden />
            BG chưa chốt
          </span>
        </div>
      </div>

      <ul className="space-y-2 max-h-[320px] overflow-y-auto pr-0.5 [scrollbar-width:thin]">
        {rows.map((row) => (
          <li
            key={`${row.rank}-${row.name}`}
            className="rounded-xl border border-teal-100/90 bg-white/95 px-3 py-2.5 shadow-sm ring-1 ring-teal-50"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-teal-600 text-[10px] font-bold text-white tabular-nums">
                  {row.rank}
                </span>
                <span className="text-sm font-semibold text-slate-800 truncate" title={row.name}>
                  {row.name}
                </span>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ring-1 ${winBadgeClass(row.winRate)}`}
                title={`${row.closed}/${row.bg} deal chốt/BG`}
              >
                {row.winRate}% chốt
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 h-4 min-w-0">
                <div
                  className="relative h-full rounded-lg bg-slate-100/80 overflow-hidden"
                  style={{ width: `${row.barWidthPct}%`, minWidth: row.bg > 0 ? '2.5rem' : 0 }}
                  title={`${row.bg} deal BG · ${row.closed} chốt · ${row.pending} chưa chốt`}
                >
                  {row.closed > 0 && (
                    <div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500 to-teal-500"
                      style={{ width: `${row.closedShare}%` }}
                    />
                  )}
                  {row.pending > 0 && (
                    <div
                      className="absolute inset-y-0 bg-orange-200/90"
                      style={{ left: `${row.closedShare}%`, width: `${100 - row.closedShare}%` }}
                    />
                  )}
                </div>
              </div>
              <div className="shrink-0 text-right tabular-nums leading-tight">
                <p className="text-[11px] font-bold text-slate-800">
                  <span className="text-orange-700">{row.bg}</span>
                  <span className="text-slate-400 font-normal mx-0.5">/</span>
                  <span className="text-emerald-700">{row.closed}</span>
                </p>
                <p className="text-[9px] text-slate-500 font-medium">BG / chốt</p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuoteWinRateBarChart({ data, title }) {
  if (!data?.length) return null;
  return (
    <div className="rounded-xl border border-lime-100 bg-lime-50/20 p-4">
      {title && <p className="text-sm font-bold text-slate-800 mb-3">{title}</p>}
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 4, right: 88 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
            <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 10 }} />
            <RechartsTooltip
              formatter={(v, _n, item) => [item?.payload?._bgRateLabel || `${v}%`, 'Tỷ lệ chốt/BG']}
            />
            <Bar dataKey="Tỷ lệ chốt/BG" fill="#84cc16" radius={[0, 4, 4, 0]}>
              <LabelList dataKey="_bgRateLabel" position="right" style={{ fontSize: 10, fill: '#365314' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function DealCloseRateBarChart({ data, title }) {
  if (!data?.length) return null;
  return (
    <div className="rounded-xl border border-violet-100 bg-violet-50/20 p-4">
      {title && <p className="text-sm font-bold text-slate-800 mb-3">{title}</p>}
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 4, right: 88 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
            <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 10 }} />
            <RechartsTooltip
              formatter={(v, _n, item) => [item?.payload?._dealRateLabel || `${v}%`, 'Tỷ lệ chốt/tổng deal']}
            />
            <Bar dataKey="Tỷ lệ chốt/tổng deal" fill="#8b5cf6" radius={[0, 4, 4, 0]}>
              <LabelList dataKey="_dealRateLabel" position="right" style={{ fontSize: 10, fill: '#5b21b6' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function QuoteValueCloseRateBarChart({ data, title }) {
  if (!data?.length) return null;
  return (
    <div className="rounded-xl border border-teal-100 bg-teal-50/20 p-4">
      {title && <p className="text-sm font-bold text-slate-800 mb-3">{title}</p>}
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 4, right: 108 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
            <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 10 }} />
            <RechartsTooltip
              formatter={(v, _n, item) => [item?.payload?._gtRateLabel || `${v}%`, 'GT chốt / GT báo giá']}
            />
            <Bar dataKey="GT chốt/BG" fill="#14b8a6" radius={[0, 4, 4, 0]}>
              <LabelList dataKey="_gtRateLabel" position="right" style={{ fontSize: 10, fill: '#115e59' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function CancelRateBarChart({ data, title }) {
  if (!data?.length) return null;
  return (
    <div className="rounded-xl border border-rose-100 bg-rose-50/20 p-4">
      {title && <p className="text-sm font-bold text-slate-800 mb-3">{title}</p>}
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 4, right: 88 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
            <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 10 }} />
            <RechartsTooltip
              formatter={(v, _n, item) => [item?.payload?._cancelRateLabel || `${v}%`, 'Tỷ lệ hủy']}
            />
            <Bar dataKey="Tỷ lệ hủy" fill="#f43f5e" radius={[0, 4, 4, 0]}>
              <LabelList dataKey="_cancelRateLabel" position="right" style={{ fontSize: 10, fill: '#9f1239' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function GrowthRateBarChart({ data, title }) {
  if (!data?.length) return null;
  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/20 p-4">
      {title && <p className="text-sm font-bold text-slate-800 mb-3">{title}</p>}
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 4, right: 56 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v > 0 ? '+' : ''}${v}%`} />
            <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 10 }} />
            <RechartsTooltip formatter={(v) => [`${v > 0 ? '+' : ''}${v}%`, 'Tăng trưởng GT chốt']} />
            <Bar dataKey="Tăng trưởng" fill="#6366f1" radius={[0, 4, 4, 0]}>
              <LabelList
                dataKey="Tăng trưởng"
                position="right"
                formatter={(v) => `${v > 0 ? '+' : ''}${v}%`}
                style={{ fontSize: 10, fill: '#3730a3' }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function buildCombinedOutcomePie(rows) {
  let closed = 0;
  let bgPending = 0;
  let lost = 0;
  let openOther = 0;

  for (const r of rows || []) {
    const c = reportClosedWonCount(r);
    const q = r.quote_deal_count || 0;
    const d = r.deal_count || 0;
    const lostDeal = r.lost_deal_count || 0;
    const lostLead = r.lost_lead_count || 0;
    const lead = r.lead_count || 0;

    closed += c;
    const bgP = Math.max(0, q - c);
    bgPending += bgP;
    lost += lostLead + lostDeal;
    const dealOpen = Math.max(0, d - c - lostDeal);
    const leadOpen = Math.max(0, lead - lostLead);
    openOther += leadOpen + Math.max(0, dealOpen - bgP);
  }

  return [
    { name: 'Đã chốt', value: closed, color: '#059669' },
    { name: 'BG chưa chốt', value: bgPending, color: '#f59e0b' },
    { name: 'Hủy/thua', value: lost, color: '#f43f5e' },
    { name: 'Đang xử lý', value: openOther, color: '#94a3b8' },
  ].filter((x) => x.value > 0);
}

function buildRatesSummary(rows) {
  let closed = 0;
  let deal = 0;
  let quote = 0;
  let closedGt = 0;
  let quoteGt = 0;
  let lost = 0;
  let total = 0;

  for (const r of rows || []) {
    closed += reportClosedWonCount(r);
    deal += r.deal_count || 0;
    quote += r.quote_deal_count || 0;
    closedGt += reportClosedWonValue(r);
    quoteGt += r.quote_value || 0;
    lost += reportCancelLostTotal(r);
    total += reportCancelTotalCount(r);
  }

  const dealRate = deal > 0 ? Math.round((closed / deal) * 1000) / 10 : 0;
  const bgRate = quote > 0 ? Math.round((closed / quote) * 1000) / 10 : null;
  const gtRate = quoteGt > 0 ? Math.round((closedGt / quoteGt) * 1000) / 10 : null;
  const cancelRate = total > 0 ? Math.round((lost / total) * 1000) / 10 : null;

  return {
    closed,
    deal,
    quote,
    closedGt,
    quoteGt,
    lost,
    total,
    dealRate,
    bgRate,
    gtRate,
    cancelRate,
    dealRateLabel: pctLabel(dealRate, `${closed}/${deal}`),
    bgRateLabel: bgRate != null ? pctLabel(bgRate, `${closed}/${quote}`) : '—',
    gtRateLabel: gtRate != null ? pctLabel(gtRate, `${formatVNDShort(closedGt)}/${formatVNDShort(quoteGt)}`) : '—',
    cancelRateLabel: cancelRate != null ? pctLabel(cancelRate, `${lost}/${total}`) : '—',
  };
}

function EmployeeRatesCombinedPieChart({ rows, title, entityLabel = 'đơn vị' }) {
  const pieData = useMemo(() => buildCombinedOutcomePie(rows), [rows]);
  const rates = useMemo(() => buildRatesSummary(rows), [rows]);
  const singleName = rows?.length === 1 ? (rows[0].full_name || rows[0].company_name || rows[0].region_name) : null;

  if (!pieData.length) return null;

  const totalPie = pieData.reduce((s, x) => s + x.value, 0);

  return (
    <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/40 to-white p-4 md:p-5">
      {title && <p className="text-sm font-bold text-slate-800 mb-1">{title}</p>}
      {singleName && (
        <p className="text-xs text-slate-500 mb-3">{singleName}</p>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-center">
        <div className="min-h-[280px] flex flex-col">
          <div className="h-52 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius="40%"
                  outerRadius="68%"
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="name"
                  label={false}
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} stroke="#fff" strokeWidth={2} />
                  ))}
                </Pie>
                <RechartsTooltip
                  formatter={(v, n) => [`${v} (${totalPie ? Math.round((v / totalPie) * 1000) / 10 : 0}%)`, n]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] leading-snug">
            {pieData.map((entry) => {
              const pct = totalPie ? Math.round((entry.value / totalPie) * 100) : 0;
              return (
                <li key={entry.name} className="flex items-start gap-1.5 min-w-0">
                  <span
                    className="mt-1 w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: entry.color }}
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="font-medium text-slate-800">{entry.name}</span>
                    <span className="text-slate-600 tabular-nums">
                      {' '}
                      · {entry.value} ({pct}%)
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="rounded-lg border border-violet-200 bg-violet-50/80 px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase text-violet-800">Chốt/tổng deal</p>
            <p className="mt-1 text-lg font-extrabold text-violet-950 tabular-nums">{rates.dealRateLabel}</p>
          </div>
          <div className="rounded-lg border border-lime-200 bg-lime-50/80 px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase text-lime-900">Chốt/BG</p>
            <p className="mt-1 text-lg font-extrabold text-lime-950 tabular-nums">{rates.bgRateLabel}</p>
          </div>
          <div className="rounded-lg border border-teal-200 bg-teal-50/80 px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase text-teal-900">GT chốt / GT BG</p>
            <p className="mt-1 text-lg font-extrabold text-teal-950 tabular-nums">{rates.gtRateLabel}</p>
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-50/80 px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase text-rose-900">Tỷ lệ hủy</p>
            <p className="mt-1 text-lg font-extrabold text-rose-950 tabular-nums">{rates.cancelRateLabel}</p>
          </div>
        </div>
      </div>
      {rows?.length > 1 && (
        <p className="mt-3 text-[11px] text-slate-500 text-center">
          Tổng hợp {rows.length} {entityLabel} · biểu đồ phân bổ trạng thái lead/deal
        </p>
      )}
    </div>
  );
}

function renderQuoteFunnelPieLabel(props) {
  const { name, value, percent, x, y, textAnchor } = props;
  if (percent < 0.03) return null;
  return (
    <text
      x={x}
      y={y}
      textAnchor={textAnchor}
      dominantBaseline="central"
      fill="#64748b"
      fontSize={10}
      fontWeight={500}
    >
      {`${name}: ${value} (${Math.round(percent * 100)}%)`}
    </text>
  );
}

function QuoteFunnelPieChart({ data, title }) {
  if (!data?.length) return null;
  return (
    <div className="rounded-xl border border-orange-100 bg-orange-50/20 p-4">
      {title && <p className="text-sm font-bold text-slate-800 mb-3">{title}</p>}
      <div className="h-56 flex items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 8, right: 12, bottom: 8, left: 12 }}>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={44}
              outerRadius={68}
              paddingAngle={2}
              dataKey="value"
              nameKey="name"
              label={renderQuoteFunnelPieLabel}
              labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} stroke="#fff" strokeWidth={2} />
              ))}
            </Pie>
            <RechartsTooltip formatter={(v, n) => [`${v} deal`, n]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function QuoteCloseChartsGrid({ rows, nameKey, entityLabel = 'đơn vị', combinedRatesPie = false }) {
  const chartRows = useMemo(
    () => buildQuoteCloseChartRows(rows, nameKey, 10),
    [rows, nameKey],
  );
  const growthRows = useMemo(
    () => buildQuoteCloseChartRows(rows, nameKey, 10)
      .filter((r) => r['Tăng trưởng'] != null)
      .map((r) => ({ ...r, 'Tăng trưởng': Number(r['Tăng trưởng']) || 0 })),
    [rows, nameKey],
  );
  const hasRates = (rows || []).some((r) => reportCancelTotalCount(r) > 0
    || (r.quote_deal_count || 0) > 0
    || reportClosedWonCount(r) > 0);

  if (!chartRows.length && !growthRows.length && !hasRates) {
    return <ChartEmpty label={`Chưa có dữ liệu báo giá / chốt theo ${entityLabel}`} />;
  }

  return (
    <div className="space-y-4">
      {combinedRatesPie && hasRates && (
        <EmployeeRatesCombinedPieChart
          rows={rows}
          title={`Tỷ lệ báo giá & chốt — ${entityLabel}`}
          entityLabel={entityLabel}
        />
      )}
      {!combinedRatesPie && hasRates && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {chartRows.filter((r) => (r.Deal || 0) > 0).length > 0 && (
            <DealCloseRateBarChart data={chartRows.filter((r) => (r.Deal || 0) > 0)} title={`Tỷ lệ chốt/tổng deal — ${entityLabel}`} />
          )}
          {chartRows.filter((r) => (r['Tổng BG'] || 0) > 0).length > 0 && (
            <QuoteWinRateBarChart data={chartRows.filter((r) => (r['Tổng BG'] || 0) > 0)} title={`Tỷ lệ chốt/BG — ${entityLabel}`} />
          )}
          {chartRows.filter((r) => (r['GT báo giá'] || 0) > 0).length > 0 && (
            <QuoteValueCloseRateBarChart data={chartRows.filter((r) => (r['GT báo giá'] || 0) > 0)} title={`GT chốt / GT báo giá — ${entityLabel}`} />
          )}
          {chartRows.filter((r) => (r['Tổng LD'] || 0) > 0).length > 0 && (
            <CancelRateBarChart data={chartRows.filter((r) => (r['Tổng LD'] || 0) > 0)} title={`Tỷ lệ hủy — ${entityLabel}`} />
          )}
        </div>
      )}
      {chartRows.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <QuoteCloseValueBarChart data={chartRows} title={`GT báo giá vs GT chốt — top ${entityLabel}`} />
          <QuoteCloseCountBarChart data={chartRows} title={`Số deal BG vs chốt — top ${entityLabel}`} />
        </div>
      )}
      {growthRows.length > 0 && (
        <GrowthRateBarChart data={growthRows} title={`Tăng trưởng GT chốt vs kỳ trước — ${entityLabel}`} />
      )}
    </div>
  );
}

function WonVsTotalDealChart({ employees }) {
  const rows = useMemo(() => {
    return (employees || [])
      .filter((r) => r.user_id && (r.deal_count || 0) > 0)
      .map((r) => {
        const won = reportClosedWonCount(r);
        const total = r.deal_count || 0;
        const rate = total > 0 ? Math.round((won / total) * 100) : 0;
        return {
          name: truncLabel(r.full_name, 14),
          won,
          total,
          rate,
        };
      })
      .sort((a, b) => b.rate - a.rate || b.won - a.won)
      .slice(0, 12);
  }, [employees]);

  if (!rows.length) return null;

  return (
    <Section title="Deal thắng / tổng deal" subtitle="Tỷ lệ deal thắng trên tổng deal theo nhân viên">
      <div style={{ height: Math.max(200, rows.length * 36 + 40) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 60 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
            <YAxis type="category" dataKey="name" width={96} tick={{ fontSize: 10 }} />
            <RechartsTooltip
              formatter={(v, n, props) => {
                const r = props.payload;
                if (n === 'won') return [`${r.won}/${r.total} (${r.rate}%)`, 'Thắng/Tổng'];
                return [v, n];
              }}
            />
            <Bar dataKey="won" name="Deal thắng" fill="#059669" radius={[0, 4, 4, 0]}>
              <LabelList
                content={({ x, y, width, height, index }) => {
                  const r = rows[index];
                  if (!r) return null;
                  return (
                    <text x={x + width + 4} y={y + height / 2} dy={4} fontSize={10} fill="#374151">
                      {`${r.won}/${r.total} (${r.rate}%)`}
                    </text>
                  );
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Section>
  );
}

function DeliveryPerformanceChart({ employees }) {
  const rows = useMemo(() => {
    return (employees || [])
      .filter((r) => r.user_id && (r.delivered_deal_count || 0) > 0)
      .map((r) => ({
        name: truncLabel(r.full_name, 14),
        onTime: r.on_time_deal_count || 0,
        late: r.late_deal_count || 0,
        noEvidence: r.no_evidence_deal_count || 0,
        total: r.delivered_deal_count || 0,
        rate: r.on_time_rate_pct != null ? r.on_time_rate_pct : 0,
      }))
      .sort((a, b) => b.rate - a.rate || b.total - a.total)
      .slice(0, 12);
  }, [employees]);

  if (!rows.length) return null;

  return (
    <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/30">
      <p className="text-sm font-bold text-slate-800 mb-3">Hiệu suất giao hàng theo nhân viên</p>
      <div style={{ height: Math.max(200, rows.length * 36 + 40) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 70 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
            <YAxis type="category" dataKey="name" width={96} tick={{ fontSize: 10 }} />
            <RechartsTooltip
              formatter={(v, n) => {
                const labels = { onTime: 'Đúng hạn', late: 'Trễ hạn', noEvidence: 'Thiếu BC' };
                return [v, labels[n] || n];
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              formatter={(v) => {
                const labels = { onTime: 'Đúng hạn', late: 'Trễ hạn', noEvidence: 'Thiếu BC' };
                return labels[v] || v;
              }}
            />
            <Bar dataKey="onTime" name="onTime" stackId="delivery" fill="#059669" />
            <Bar dataKey="late" name="late" stackId="delivery" fill="#e11d48" />
            <Bar dataKey="noEvidence" name="noEvidence" stackId="delivery" fill="#f59e0b" radius={[0, 4, 4, 0]}>
              <LabelList
                content={({ x, y, width, height, index }) => {
                  const r = rows[index];
                  if (!r) return null;
                  const barEnd = x + width;
                  return (
                    <text x={barEnd + 4} y={y + height / 2} dy={4} fontSize={10} fill="#374151">
                      {`${r.rate}%`}
                    </text>
                  );
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
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
    <div className={`@container rounded-xl border p-3 sm:p-4 shadow-sm min-w-0 overflow-hidden ${accent}`}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600 line-clamp-2 leading-tight" title={label}>
        {label}
      </p>
      <p className="mt-1 font-extrabold tabular-nums text-slate-900 leading-snug [overflow-wrap:anywhere] text-[length:clamp(0.9375rem,5.8cqi,1.625rem)]">
        {value}
      </p>
      {showTrend && (
        <p className={`mt-1 text-[10px] font-semibold inline-flex flex-wrap items-center gap-x-0.5 gap-y-0 max-w-full ${up ? 'text-emerald-700' : down ? 'text-red-600' : 'text-slate-500'}`}>
          {up ? <TrendingUp className="w-3 h-3 shrink-0" /> : down ? <TrendingDown className="w-3 h-3 shrink-0" /> : null}
          <span className="whitespace-nowrap">
            {pct != null ? `${pct > 0 ? '+' : ''}${pct}%` : compareKey === 'conversion_rate' ? `${c.delta > 0 ? '+' : ''}${c.delta} điểm` : `${c.delta > 0 ? '+' : ''}${c.delta}`}
          </span>
          <span className="text-slate-400 font-normal">vs kỳ trước</span>
        </p>
      )}
      {sub && (
        <p className="mt-0.5 text-[10px] text-slate-500 line-clamp-2 leading-snug break-words" title={sub}>
          {sub}
        </p>
      )}
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
              <th key={c.key} className={`py-2 px-2 whitespace-pre-line ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
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

/** Cột báo giá / chốt đơn — hiển thị trên mọi bảng phân cấp */
const QUOTE_CLOSE_COLS = [
  { key: 'quote_deal_count', label: 'Tổng BG', align: 'right' },
  {
    key: 'quote_value',
    label: 'GT báo giá',
    align: 'right',
    render: (r) => formatVND(r.quote_value || 0),
  },
  {
    key: 'won_or_later_deal_count',
    label: 'Chốt SL',
    align: 'right',
    render: (r) => reportClosedWonCount(r),
  },
  {
    key: 'won_or_later_value',
    label: 'GT chốt',
    align: 'right',
    render: (r) => formatVND(reportClosedWonValue(r)),
  },
  {
    key: 'quote_win_rate_pct',
    label: 'Tỷ lệ chốt/BG',
    align: 'right',
    render: (r) => (r.quote_win_rate_pct == null ? '—' : `${r.quote_win_rate_pct}%`),
  },
  {
    key: 'monthly_growth_pct',
    label: 'Tăng trưởng',
    align: 'right',
    render: (r) => {
      if (r.monthly_growth_pct == null) return '—';
      const n = Number(r.monthly_growth_pct) || 0;
      return `${n > 0 ? '+' : ''}${n}%`;
    },
  },
];

const METRIC_COLS_BASE = [
  { key: 'lead_count', label: 'Lead', align: 'right' },
  {
    key: 'deal_count',
    label: 'Deal',
    align: 'right',
    render: (r) => (r.deal_count ?? 0) + (r.customer_order_count ?? 0),
  },
  {
    key: 'delivered_deal_count',
    label: 'Số Deal\ntiếp nhận',
    align: 'right',
    render: (r) => (r.deal_count ?? 0) + (r.customer_order_count ?? 0),
  },
  {
    key: 'won_vs_total',
    label: 'Số Deal\nký HĐ thành công',
    align: 'right',
    render: (r) => reportClosedWonCount(r),
  },
  {
    key: 'on_time_deal_count',
    label: 'Đúng hạn (A)',
    align: 'right',
    render: (r) => r.on_time_deal_count ?? 0,
  },
  {
    key: 'late_deal_count',
    label: 'Trễ hạn',
    align: 'right',
    render: (r) => {
      const n = r.late_deal_count ?? 0;
      return n > 0 ? <span className="text-red-600 font-semibold">{n}</span> : '0';
    },
  },
  {
    key: 'no_evidence_deal_count',
    label: 'Thiếu BC (B)',
    align: 'right',
    render: (r) => {
      const n = r.no_evidence_deal_count ?? 0;
      return n > 0 ? <span className="text-amber-600 font-semibold">{n}</span> : '0';
    },
  },
  {
    key: 'on_time_rate_pct',
    label: 'Tỷ lệ đúng hạn',
    align: 'right',
    render: (r) => (r.on_time_rate_pct == null ? '—' : `${r.on_time_rate_pct}%`),
  },
  {
    key: 'conversion_rate',
    label: 'Tỷ lệ chốt/tổng deal',
    align: 'right',
    render: (r) => `${r.conversion_rate ?? 0}%`,
  },
  {
    key: 'deal_close_value_rate_pct',
    label: 'Chốt/tổng deal (GT)',
    align: 'right',
    render: (r) => (r.deal_close_value_rate_pct == null ? '—' : `${r.deal_close_value_rate_pct}%`),
  },
  {
    key: 'cancel_rate_pct',
    label: 'Tỷ lệ hủy',
    align: 'right',
    render: (r) => {
      if (r.cancel_rate_pct == null) return '—';
      const lost = reportCancelLostTotal(r);
      const total = reportCancelTotalCount(r);
      return `${r.cancel_rate_pct}% (${lost}/${total})`;
    },
  },
  ...QUOTE_CLOSE_COLS,
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
  { key: 'lost_deal_count', label: 'Thua', align: 'right' },
];

function buildMetricCols(dealKhSplit, typeView = 'all') {
  const dealCol = dealKhSplit
    ? {
      key: 'deal_count',
      label: 'Deal (pipeline)',
      align: 'right',
      render: (r) => r.deal_count ?? 0,
    }
    : {
      key: 'deal_count',
      label: 'Deal',
      align: 'right',
      render: (r) => (r.deal_count ?? 0) + (r.customer_order_count ?? 0),
    };
  const orderCols = dealKhSplit && typeView !== 'lead'
    ? [{
      key: 'customer_order_count',
      label: 'Đơn hàng',
      align: 'right',
      render: (r) => r.customer_order_count ?? 0,
    }]
    : [];
  const head = METRIC_COLS_BASE.map((c) => (c.key === 'deal_count' ? dealCol : c));
  const insertAt = head.findIndex((c) => c.key === 'deal_count') + 1;
  let cols = [
    ...head.slice(0, insertAt),
    ...orderCols,
    ...head.slice(insertAt),
  ];
  if (typeView === 'lead') {
    cols = cols.filter((c) => !DEAL_ONLY_METRIC_KEYS.has(c.key));
  } else if (typeView === 'deal') {
    cols = cols.filter((c) => !LEAD_ONLY_METRIC_KEYS.has(c.key));
  }
  return cols;
}

function filtersMatchResponse(params, response) {
  if (!response) return false;
  if (response.date_from !== params.date_from || response.date_to !== params.date_to) return false;
  if ((response.type || 'all') !== (params.type || 'all')) return false;
  if (!!response.deal_kh_split !== !!params.deal_kh_split) return false;
  if (String(response.company_id || '') !== String(params.company_id || '')) return false;
  if (String(response.region_id || '') !== String(params.region_id || '')) return false;
  if (String(response.department_id || '') !== String(params.department_id || '')) return false;
  if (String(response.assigned_to || '') !== String(params.assigned_to || '')) return false;
  return true;
}

const LS_ORG_REPORT = 'crm_org_report_filters_v1';
function readOrgReportPersisted() {
  try {
    const raw = localStorage.getItem(LS_ORG_REPORT);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && typeof d === 'object' ? d : null;
  } catch { return null; }
}

export default function CrmOrgOverviewReport() {
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);
  const P0 = useMemo(() => readOrgReportPersisted(), []);
  const [dateFrom, setDateFrom] = useState(() => P0?.dateFrom || defaultMonthRange().from);
  const [dateTo, setDateTo] = useState(() => P0?.dateTo || defaultMonthRange().to);
  const [filter, setFilter] = useState(() => ({
    companyId: P0?.companyId || '',
    departmentId: P0?.departmentId || '',
    userId: P0?.userId || '',
    q: '',
  }));
  const [regionId, setRegionId] = useState(() => P0?.regionId || '');
  const [typeView, setTypeView] = useState(() => P0?.typeView || 'all');
  const [dealKhSplitEnabled, setDealKhSplitEnabled] = useState(() => readStoredDealKhSplitPreference(isAdmin));
  const [hasCustomerTab, setHasCustomerTab] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [rangePickerOpen, setRangePickerOpen] = useState(false);
  const [companyRegions, setCompanyRegions] = useState([]);
  const [companyEmployees, setCompanyEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loadingDepts, setLoadingDepts] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [employeeExcelLoading, setEmployeeExcelLoading] = useState(false);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (typeView !== 'all') n += 1;
    if (filter.companyId) n += 1;
    if (filter.departmentId) n += 1;
    if (regionId) n += 1;
    if (filter.userId) n += 1;
    return n;
  }, [typeView, filter.companyId, filter.departmentId, regionId, filter.userId]);

  const handleFilterChange = useCallback((next) => {
    setFilter((prev) => {
      const companyChanged = next.companyId !== undefined && next.companyId !== prev.companyId;
      const deptChanged = next.departmentId !== undefined && next.departmentId !== prev.departmentId;
      return {
        ...prev,
        ...next,
        departmentId: companyChanged ? '' : (next.departmentId ?? prev.departmentId),
        userId: companyChanged || deptChanged ? '' : (next.userId ?? prev.userId),
      };
    });
    if (next.companyId !== undefined) setRegionId('');
  }, []);

  const reportQueryParams = useMemo(
    () => ({
      date_from: dateFrom,
      date_to: dateTo,
      type: typeView,
      ...(dealKhSplitEnabled ? { deal_kh_split: '1' } : {}),
      ...(filter.companyId ? { company_id: filter.companyId } : {}),
      ...(regionId ? { region_id: regionId } : {}),
      ...(filter.departmentId ? { department_id: filter.departmentId } : {}),
      ...(filter.userId ? { assigned_to: filter.userId } : {}),
    }),
    [dateFrom, dateTo, typeView, dealKhSplitEnabled, filter.companyId, filter.departmentId, filter.userId, regionId],
  );

  const applyDealKhSplit = useCallback((enabled) => {
    setDealKhSplitEnabled(enabled);
    storeDealKhSplitPreference(enabled);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_ORG_REPORT, JSON.stringify({
        dateFrom, dateTo, typeView,
        companyId: filter.companyId, departmentId: filter.departmentId,
        userId: filter.userId, regionId,
      }));
    } catch { /* ignore */ }
  }, [dateFrom, dateTo, typeView, filter.companyId, filter.departmentId, filter.userId, regionId]);

  useEffect(() => {
    let cancel = false;
    api
      .get('/crm/pipeline-stages', { params: { pipeline_type: 'deal' } })
      .then((r) => {
        if (cancel) return;
        const stages = Array.isArray(r.data) ? r.data : [];
        const { postWonStages } = splitDealStagesForCrmTabs(stages);
        setHasCustomerTab(postWonStages.length > 0);
      })
      .catch(() => {
        if (!cancel) setHasCustomerTab(false);
      });
    return () => { cancel = true; };
  }, []);

  useEffect(() => {
    api
      .get('/companies')
      .then((r) => setCompanies(r.data?.companies || r.data || []))
      .catch(() => setCompanies([]));
  }, []);

  useEffect(() => {
    if (!filter.companyId) {
      setDepartments([]);
      return undefined;
    }
    let cancel = false;
    setLoadingDepts(true);
    api
      .get('/departments', { params: { company_id: filter.companyId } })
      .then((r) => {
        if (cancel) return;
        const list = r.data?.departments || r.data || [];
        setDepartments(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancel) setDepartments([]);
      })
      .finally(() => {
        if (!cancel) setLoadingDepts(false);
      });
    return () => { cancel = true; };
  }, [filter.companyId]);

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
    if (!filter.companyId) {
      setCompanyEmployees([]);
      return undefined;
    }
    let cancel = false;
    setLoadingEmployees(true);
    api
      .get('/users', { params: { company_id: filter.companyId } })
      .then((r) => {
        if (cancel) return;
        let list = r.data?.users || r.data || [];
        if (!Array.isArray(list)) list = [];
        if (filter.departmentId) {
          list = list.filter((u) => String(u.department_id) === String(filter.departmentId));
        }
        list.sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || ''), 'vi'));
        setCompanyEmployees(list);
      })
      .catch(() => {
        if (!cancel) setCompanyEmployees([]);
      })
      .finally(() => {
        if (!cancel) setLoadingEmployees(false);
      });
    return () => { cancel = true; };
  }, [filter.companyId, filter.departmentId]);

  useEffect(() => {
    if (!filter.userId) return;
    const ok = companyEmployees.some((u) => String(u.id) === String(filter.userId));
    if (!ok) setFilter((f) => ({ ...f, userId: '' }));
  }, [companyEmployees, filter.userId]);

  useEffect(() => {
    if (!regionId) return;
    const ok = companyRegions.some((reg) => String(reg.id) === String(regionId));
    if (!ok) setRegionId('');
  }, [companyRegions, regionId]);

  const load = useCallback(async (signal) => {
    const params = reportQueryParams;
    setLoading(true);
    setErr(null);
    try {
      const { data: res } = await api.get('/crm/reports/org-overview', {
        params,
        signal,
      });
      if (!filtersMatchResponse(params, res)) return;
      setData(res);
    } catch (e) {
      if (e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError') return;
      setErr(e.response?.data?.error || e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [reportQueryParams]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const dataInSync = filtersMatchResponse(reportQueryParams, data);
  const displayData = dataInSync ? data : null;
  const summary = displayData?.summary || {};
  const compare = displayData?.compare || null;
  const periodPrevious = displayData?.period_previous || null;
  const dealKhSplitActive = !!(displayData?.deal_kh_split ?? dealKhSplitEnabled);
  const metricCols = useMemo(
    () => buildMetricCols(dealKhSplitActive, typeView),
    [dealKhSplitActive, typeView],
  );

  const timelineChart = useMemo(
    () => (displayData?.timeline || []).map((d) => ({
      ...d,
      label: formatViDate(d.date),
    })),
    [displayData],
  );

  const funnelChart = useMemo(
    () => (displayData?.pipeline_funnel || [])
      .filter((s) => (s.count || 0) > 0)
      .slice(0, 12)
      .map((s) => ({
        name: truncLabel(s.name, 18),
        count: s.count || 0,
        value: s.value || 0,
      })),
    [displayData],
  );

  const regionBarChart = useMemo(
    () => (displayData?.by_region || [])
      .slice(0, 10)
      .map((r) => ({
        name: truncLabel(r.region_name, 16),
        value: r.pipeline_value ?? 0,
      })),
    [displayData],
  );

  const leadTypeBarChart = useMemo(
    () => (displayData?.by_lead_type || [])
      .filter((r) => (r.lead_count || 0) + (r.deal_count || 0) + (r.customer_order_count || 0) > 0)
      .slice(0, 12)
      .map((r) => ({
        name: truncLabel(r.lead_type_name, 16),
        Lead: r.lead_count ?? 0,
        Deal: (r.deal_count ?? 0) + (r.customer_order_count ?? 0),
      })),
    [displayData],
  );

  const firstStageSla = useMemo(() => {
    const s = displayData?.summary;
    if (!s?.first_stage_open_count) return null;
    return {
      open_count: s.first_stage_open_count,
      on_time_count: s.first_stage_on_time_count,
      overdue_count: s.first_stage_overdue_count,
      on_time_rate_pct: s.first_stage_on_time_rate_pct,
      overdue_rate_pct: s.first_stage_overdue_rate_pct,
    };
  }, [displayData]);

  const employeeStacked = useMemo(
    () => buildDealStackedRows(displayData?.by_employee, 'full_name', 12),
    [displayData],
  );

  const regionStacked = useMemo(
    () => buildDealStackedRows(displayData?.by_region, 'region_name', 10),
    [displayData],
  );

  const dealOutcomePie = useMemo(() => {
    let won = 0;
    let lost = 0;
    let open = 0;
    for (const r of displayData?.by_employee || []) {
      const totalDeals = (r.deal_count || 0) + (r.customer_order_count || 0);
      won += reportClosedWonCount(r);
      lost += r.lost_deal_count || 0;
      open += Math.max(0, totalDeals - reportClosedWonCount(r) - (r.lost_deal_count || 0));
    }
    return [
      { name: 'Đã chốt', value: won, color: '#059669' },
      { name: 'Thua', value: lost, color: '#e11d48' },
      { name: 'Đang mở', value: open, color: '#0284c7' },
    ].filter((x) => x.value > 0);
  }, [displayData]);

  const quoteFunnelPie = useMemo(() => {
    const quoted = summary.quote_deal_count ?? 0;
    const closed = reportClosedWonCount(summary);
    const pending = Math.max(0, quoted - closed);
    return [
      { name: 'Đã chốt', value: closed, color: '#059669' },
      { name: 'BG chưa chốt', value: pending, color: '#f59e0b' },
    ].filter((x) => x.value > 0);
  }, [summary]);

  const periodCompareChart = useMemo(() => {
    const prev = periodPrevious?.summary;
    if (!prev) return [];
    return [
      {
        name: 'GT báo giá',
        'Kỳ này': summary.quote_value ?? 0,
        'Kỳ trước': prev.quote_value ?? 0,
      },
      {
        name: 'GT chốt',
        'Kỳ này': reportClosedWonValue(summary),
        'Kỳ trước': reportClosedWonValue(prev),
      },
    ];
  }, [summary, periodPrevious]);

  const exportExcel = async () => {
    if (!displayData) return;
    const XLSX = await loadXlsx();
    const wb = XLSX.utils.book_new();
    const sheet = (name, rows, mapFn) => {
      if (!rows?.length) return;
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.map(mapFn)), name);
    };
    sheet('Tom tat', [summary], (r) => ({
      Lead: r.lead_count ?? 0,
      Deal: r.deal_count ?? 0,
      'So Deal tiep nhan': r.delivered_deal_count ?? 0,
      'So Deal ky HD thanh cong': reportClosedWonCount(r),
      Pipeline: r.pipeline_value ?? 0,
      'Ty le chot/tong deal %': r.conversion_rate ?? 0,
      'Ty le chot/tong deal GT %': r.deal_close_value_rate_pct ?? null,
      'Bao gia SL': r.quote_deal_count ?? 0,
      'GT bao gia': r.quote_value ?? 0,
      'Chot SL': reportClosedWonCount(r),
      'Gia tri chot': reportClosedWonValue(r),
      'Ty le chot/BG %': r.quote_win_rate_pct ?? null,
      'Ty le huy %': r.cancel_rate_pct ?? null,
      'Tang truong thang %': r.monthly_growth_pct ?? null,
    }));
    sheet('Cong ty', displayData.by_company, (r) => ({
      'Cong ty': r.company_name,
      Lead: r.lead_count,
      Deal: r.deal_count,
      Pipeline: r.pipeline_value,
      Chot: r.won_deal_count,
      'GT chot': r.won_value,
    }));
    sheet('Khu vuc', displayData.by_region, (r) => ({
      'Khu vuc': r.region_name,
      'Cong ty': r.company_name,
      Lead: r.lead_count,
      Deal: r.deal_count,
      Pipeline: r.pipeline_value,
      Chot: r.won_deal_count,
    }));
    sheet('Nhan vien', displayData.by_employee, (r) => ({
      'Nhan vien': r.full_name,
      'Phong ban': r.department_name,
      Lead: r.lead_count,
      Deal: r.deal_count,
      'So Deal tiep nhan': r.delivered_deal_count ?? 0,
      'So Deal ky HD thanh cong': reportClosedWonCount(r),
      Pipeline: r.pipeline_value,
      'Bao gia SL': r.quote_deal_count,
      'GT bao gia': r.quote_value,
      'Chot SL': reportClosedWonCount(r),
      'Gia tri chot': reportClosedWonValue(r),
      'Ty le chot/tong deal %': r.conversion_rate,
      'Ty le chot/tong deal GT %': r.deal_close_value_rate_pct,
      'Ty le huy %': r.cancel_rate_pct,
      'Ty le chot/BG %': r.quote_win_rate_pct,
      'Tang truong thang %': r.monthly_growth_pct,
      'QH tiep nhan %': r.reception_overdue_rate_pct,
    }));
    sheet('Phan loai', displayData.by_lead_type, (r) => ({
      'Phan loai': r.lead_type_name,
      'Ap dung': r.applies_to,
      Lead: r.lead_count,
      Deal: r.deal_count,
      Pipeline: r.pipeline_value,
      'QH tiep nhan %': r.reception_overdue_rate_pct,
    }));
    XLSX.writeFile(wb, `crm-bc-to-chuc_${dateFrom}_${dateTo}.xlsx`);
  };

  const exportEmployeeExcel = async () => {
    if (!displayData) return;
    setEmployeeExcelLoading(true);
    try {
      const employees = (displayData.by_employee || []).filter((r) => r.user_id);
      if (!employees.length) {
        setErr('Chưa có dữ liệu nhân viên để xuất');
        return;
      }
      const employeeIds = employees.map((r) => r.user_id).join(',');
      const surveyRes = await api.get('/crm/reports/org-overview/survey-visits', {
        params: {
          date_from: dateFrom,
          date_to: dateTo,
          type: typeView,
          employee_ids: employeeIds,
          ...(dealKhSplitEnabled ? { deal_kh_split: '1' } : {}),
          ...(filter.companyId ? { company_id: filter.companyId } : {}),
          ...(regionId ? { region_id: regionId } : {}),
          ...(filter.departmentId ? { department_id: filter.departmentId } : {}),
          ...(filter.userId ? { assigned_to: filter.userId } : {}),
        },
      });
      await downloadOrgEmployeeExcel({
        employees,
        metricCols,
        surveyRows: surveyRes.data?.rows || [],
        dateFrom,
        dateTo,
        typeLabel: typeViewLabel,
        periodLabel: reportPeriodLabel,
      });
    } catch (e) {
      setErr(e.response?.data?.error || e.message || 'Lỗi xuất Excel nhân viên');
    } finally {
      setEmployeeExcelLoading(false);
    }
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
    handleFilterChange({ companyId: String(row.company_id), userId: '' });
    setRegionId('');
    setActiveTab('region');
  };

  const drillToRegion = (row) => {
    if (row.company_id) {
      handleFilterChange({ companyId: String(row.company_id), userId: '' });
    }
    if (row.region_id) setRegionId(String(row.region_id));
    setActiveTab('employee');
  };

  const pipelineQueryParams = useMemo(
    () => ({
      date_from: dateFrom,
      date_to: dateTo,
      type: typeView,
      ...(dealKhSplitEnabled ? { deal_kh_split: '1' } : {}),
      ...(filter.companyId ? { company_id: filter.companyId } : {}),
      ...(regionId ? { region_id: regionId } : {}),
      ...(filter.departmentId ? { department_id: filter.departmentId } : {}),
      ...(filter.userId ? { assigned_to: filter.userId } : {}),
    }),
    [dateFrom, dateTo, typeView, dealKhSplitEnabled, filter.companyId, filter.departmentId, filter.userId, regionId],
  );

  const typeViewLabel = typeView === 'lead' ? 'Chỉ Lead' : typeView === 'deal' ? 'Chỉ Deal' : 'Lead + Deal';

  const reportPeriodLabel = useMemo(() => {
    const from = displayData?.date_from || dateFrom;
    const to = displayData?.date_to || dateTo;
    return `${formatViDate(from)} → ${formatViDate(to)}`;
  }, [displayData?.date_from, displayData?.date_to, dateFrom, dateTo]);

  return (
    <div className="min-w-0 max-w-[1600px] mx-auto space-y-5 pb-8 p-4 md:p-6">
      <div className="rounded-xl bg-white border border-slate-200 shadow-sm px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-indigo-600">Báo cáo CRM · Tổ chức</p>
            <h1 className="mt-0.5 text-lg md:text-xl font-bold text-slate-900 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 ring-1 ring-indigo-100">
                <BarChart3 className="w-4 h-4 text-indigo-600" />
              </span>
              Báo cáo theo công ty / khu vực / NV
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => load(new AbortController().signal)}
              disabled={loading}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Tải lại
            </button>
            <button
              type="button"
              onClick={downloadPdf}
              disabled={pdfLoading || !displayData}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold shadow-sm disabled:opacity-50"
            >
              <FileText className="w-3.5 h-3.5" />
              {pdfLoading ? 'Đang tạo PDF…' : 'Xuất PDF'}
            </button>
            <button
              type="button"
              onClick={exportExcel}
              disabled={!displayData}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              Xuất Excel
            </button>
          </div>
        </div>
      </div>

      <div className="sticky top-0 z-30 ui-solid-white bg-white pb-1 -mx-4 px-4 md:-mx-6 md:px-6 pt-1 border-b border-slate-200/90 shadow-[0_4px_12px_-8px_rgba(15,23,42,0.25)]">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm ui-solid-white">
          <button
            type="button"
            onClick={() => setRangePickerOpen(true)}
            className="inline-flex items-center gap-1.5 h-9 max-w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 hover:border-indigo-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 ui-solid-white shrink-0"
            title="Kỳ báo cáo"
          >
            <CalendarRange className="w-3.5 h-3.5 shrink-0 text-indigo-500" />
            <span className="tabular-nums truncate">
              {formatViDate(dateFrom)} → {formatViDate(dateTo)}
            </span>
            <ChevronDown className="w-3.5 h-3.5 shrink-0 text-slate-400" />
          </button>

          <select
            value={typeView}
            onChange={(e) => setTypeView(e.target.value)}
            className={`${REPORT_FILTER_SELECT_CLS} shrink-0 max-w-[11rem]`}
            aria-label="Phân loại"
          >
            <option value="all">Cả hai (Lead + Deal)</option>
            <option value="lead">Chỉ Lead</option>
            <option value="deal">Chỉ Deal</option>
          </select>

          {hasCustomerTab && (
            <div
              className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shrink-0"
              role="group"
              aria-label="Gộp hoặc tách đơn hàng"
            >
              <button
                type="button"
                onClick={() => applyDealKhSplit(false)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                  !dealKhSplitEnabled
                    ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Gộp
              </button>
              <button
                type="button"
                onClick={() => applyDealKhSplit(true)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                  dealKhSplitEnabled
                    ? 'bg-cyan-50 text-cyan-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Tách đơn hàng
              </button>
            </div>
          )}

          <select
            value={filter.companyId}
            onChange={(e) => handleFilterChange({ companyId: e.target.value })}
            className={REPORT_FILTER_SELECT_CLS}
            aria-label="Công ty"
          >
            <option value="">Tất cả công ty</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
            ))}
          </select>

          <select
            value={filter.departmentId}
            onChange={(e) => handleFilterChange({ departmentId: e.target.value })}
            disabled={!filter.companyId || loadingDepts}
            className={REPORT_FILTER_SELECT_CLS}
            aria-label="Phòng ban"
          >
            <option value="">Tất cả phòng ban</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>

          <select
            value={regionId}
            onChange={(e) => setRegionId(e.target.value)}
            disabled={!filter.companyId}
            className={REPORT_FILTER_SELECT_CLS}
            aria-label="Khu vực"
          >
            <option value="">Tất cả khu vực</option>
            {companyRegions.map((r) => (
              <option key={r.id} value={r.id}>{r.name}{r.code ? ` (${r.code})` : ''}</option>
            ))}
          </select>

          <select
            value={filter.userId}
            onChange={(e) => handleFilterChange({ userId: e.target.value })}
            disabled={!filter.companyId || loadingEmployees}
            className={REPORT_FILTER_SELECT_CLS}
            aria-label="Nhân viên"
          >
            <option value="">{loadingEmployees ? 'Đang tải…' : 'Tất cả nhân viên'}</option>
            {companyEmployees.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name || u.email || u.id}
              </option>
            ))}
          </select>

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setTypeView('all');
                handleFilterChange({ companyId: '', departmentId: '', userId: '' });
                setRegionId('');
              }}
              className="h-9 shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 ui-solid-white"
            >
              Xóa lọc
            </button>
          )}
        </div>
      </div>

      <DateRangePickerPopover
        open={rangePickerOpen}
        title="Chọn khoảng thời gian báo cáo"
        from={dateFrom}
        to={dateTo}
        allowClear={false}
        onClose={() => setRangePickerOpen(false)}
        onChange={({ from, to }) => {
          if (from) setDateFrom(from);
          if (to) setDateTo(to);
          setRangePickerOpen(false);
        }}
      />

      {err && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
      )}

      {loading && !displayData ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="animate-spin h-10 w-10 border-4 border-indigo-600 border-t-transparent rounded-full" />
          <p className="text-sm text-slate-600">Đang tải báo cáo…</p>
        </div>
      ) : displayData ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 [&>*]:min-w-0">
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
                  ? `${summary.reception_overdue_count ?? 0}/${summary.reception_eligible_count} lead · SLA ${displayData?.reception_sla_minutes ?? 15} phút`
                  : 'Chưa có lead trong kỳ'
              }
              accent="border-orange-200 bg-gradient-to-br from-orange-50 to-white"
            />
            <KpiCard
              label="Điểm KPI"
              value={formatKpiLedgerNet(summary.kpi_ledger_net ?? 0)}
              compare={compare}
              compareKey="kpi_ledger_net"
              sub={`${reportPeriodLabel} · sổ cái occurred_at trên lead/deal trong kỳ`}
              accent="border-indigo-200 bg-gradient-to-br from-indigo-50 to-white"
            />
            <KpiCard
              label="Giá trị dự kiến"
              value={formatVNDKpi(summary.expected_value ?? 0)}
              compare={compare}
              compareKey="expected_value"
              accent="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white"
            />
            <KpiCard
              label="Giá trị kỳ vọng"
              value={formatVNDKpi(summary.weighted_value ?? 0)}
              compare={compare}
              compareKey="weighted_value"
              accent="border-amber-200 bg-gradient-to-br from-amber-50 to-white"
            />
            <KpiCard
              label="GT chốt đơn"
              value={formatVNDKpi(reportClosedWonValue(summary))}
              compare={compare}
              compareKey="won_or_later_value"
              sub={`${reportClosedWonCount(summary)} deal · thắng + sau thắng + hoàn thành`}
              accent="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 [&>*]:min-w-0">
            <KpiCard label="Lead" value={summary.lead_count ?? 0} compare={compare} compareKey="lead_count" accent="border-blue-200 bg-blue-50" />
            <KpiCard
              label={dealKhSplitActive ? 'Deal (pipeline)' : 'Deal'}
              value={summary.deal_count ?? 0}
              compare={compare}
              compareKey="deal_count"
              accent="border-cyan-200 bg-cyan-50"
              sub={dealKhSplitActive ? 'Trước cột Thắng + Thua' : undefined}
            />
            {dealKhSplitActive && (
              <KpiCard
                label="Đơn hàng"
                value={summary.customer_order_count ?? 0}
                compare={compare}
                compareKey="customer_order_count"
                sub={formatVND(summary.customer_order_value ?? 0)}
                accent="border-teal-200 bg-teal-50"
              />
            )}
            <KpiCard
              label="Pipeline"
              value={formatVNDKpi(summary.pipeline_value ?? 0)}
              compare={compare}
              compareKey="pipeline_value"
              accent="border-indigo-200 bg-indigo-50"
            />
            <KpiCard
              label="Tỷ lệ chốt/tổng deal"
              value={`${summary.conversion_rate ?? 0}%`}
              compare={compare}
              compareKey="conversion_rate"
              sub={
                summary.deal_close_value_rate_pct != null
                  ? `${reportClosedWonCount(summary)}/${summary.deal_count ?? 0} deal · GT ${summary.deal_close_value_rate_pct}%`
                  : `${reportClosedWonCount(summary)}/${summary.deal_count ?? 0} deal`
              }
              accent="border-slate-200 bg-slate-50"
            />
            <KpiCard
              label="Tỷ lệ hủy"
              value={summary.cancel_rate_pct != null ? `${summary.cancel_rate_pct}%` : '—'}
              sub={`${reportCancelLostTotal(summary)}/${reportCancelTotalCount(summary)} lead+deal thua/hủy`}
              accent="border-rose-200 bg-rose-50"
            />
          </div>

          <div className="rounded-2xl border-2 border-amber-200 bg-gradient-to-br from-amber-50/80 to-white p-4 md:p-5 space-y-3 shadow-sm">
            <div>
              <h2 className="text-base font-bold text-amber-950">Báo giá &amp; chốt đơn</h2>
              <p className="text-xs text-amber-800/80 mt-0.5">
                BG = deal ở cột Báo giá trở về sau · Chốt = thắng + sau thắng + hoàn thành (cùng một chỉ số) · Tăng trưởng so với kỳ trước
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-8 gap-3 [&>*]:min-w-0">
            <KpiCard
              label="Tổng báo giá"
              value={summary.quote_deal_count ?? 0}
              compare={compare}
              compareKey="quote_deal_count"
              accent="border-amber-200 bg-amber-50"
            />
            <KpiCard
              label="GT báo giá"
              value={formatVNDKpi(summary.quote_value ?? 0)}
              compare={compare}
              compareKey="quote_value"
              accent="border-orange-200 bg-orange-50"
            />
            <KpiCard
              label="Deal chốt"
              value={reportClosedWonCount(summary)}
              compare={compare}
              compareKey="won_or_later_deal_count"
              accent="border-emerald-200 bg-emerald-50"
            />
            <KpiCard
              label="Giá trị chốt"
              value={formatVNDKpi(reportClosedWonValue(summary))}
              compare={compare}
              compareKey="won_or_later_value"
              accent="border-green-200 bg-green-50"
            />
            <KpiCard
              label="Tỷ lệ chốt/BG"
              value={summary.quote_win_rate_pct != null ? `${summary.quote_win_rate_pct}%` : '—'}
              sub={summary.quote_close_value_rate_pct != null ? `Theo giá trị: ${summary.quote_close_value_rate_pct}%` : undefined}
              accent="border-lime-200 bg-lime-50"
            />
            <KpiCard
              label="Tỷ lệ chốt/tổng deal"
              value={`${summary.conversion_rate ?? 0}%`}
              sub={
                summary.deal_close_value_rate_pct != null
                  ? `${reportClosedWonCount(summary)}/${summary.deal_count ?? 0} deal · GT ${summary.deal_close_value_rate_pct}%`
                  : `${reportClosedWonCount(summary)}/${summary.deal_count ?? 0} deal`
              }
              accent="border-violet-200 bg-violet-50"
            />
            <KpiCard
              label="Tăng trưởng tháng"
              value={compare?.won_or_later_value?.pct != null ? `${compare.won_or_later_value.pct > 0 ? '+' : ''}${compare.won_or_later_value.pct}%` : '—'}
              sub="Giá trị chốt vs kỳ trước"
              accent="border-indigo-200 bg-indigo-50"
            />
            <KpiCard
              label="Tỷ lệ hủy"
              value={summary.cancel_rate_pct != null ? `${summary.cancel_rate_pct}%` : '—'}
              sub={`${reportCancelLostTotal(summary)}/${reportCancelTotalCount(summary)} thua/hủy`}
              accent="border-rose-200 bg-rose-50"
            />
            </div>
            {(quoteFunnelPie.length > 0 || periodCompareChart.length > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
                {quoteFunnelPie.length > 0 && (
                  <QuoteFunnelPieChart
                    data={quoteFunnelPie}
                    title="Tỉ lệ chốt trong pool báo giá (toàn bộ phạm vi)"
                  />
                )}
                {periodCompareChart.length > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <p className="text-sm font-bold text-slate-800 mb-3">So sánh kỳ này vs kỳ trước</p>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={periodCompareChart} margin={{ left: 8, right: 8, top: 4, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1e6)}M`} />
                          <RechartsTooltip formatter={(v, n) => [formatVND(v), n]} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Bar dataKey="Kỳ này" fill="#6366f1" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Kỳ trước" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            )}
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
              <Section
                title="Hiệu quả báo giá & chốt — theo nhân viên"
                className="lg:col-span-2"
              >
                <QuoteCloseChartsGrid
                  rows={(displayData.by_employee || []).filter((r) => r.user_id)}
                  nameKey="full_name"
                  entityLabel="nhân viên"
                  combinedRatesPie
                />
                <CollapsibleDataList label="bảng số liệu báo giá & chốt">
                  <MetricTable
                  columns={[
                    { key: 'full_name', label: 'Nhân viên', bold: true },
                    { key: 'department_name', label: 'Phòng ban' },
                    ...QUOTE_CLOSE_COLS,
                  ]}
                  rows={(displayData.by_employee || [])
                    .filter((r) => r.user_id)
                    .map((r) => ({ ...r, _key: r.user_id }))}
                  emptyLabel="Chưa có dữ liệu nhân viên trong kỳ"
                />
                </CollapsibleDataList>
              </Section>

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

              <WonVsTotalDealChart employees={displayData?.by_employee || []} />

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
                    rows={(displayData.pipeline_funnel || []).map((r, i) => ({ ...r, _key: r.stage_id || i }))}
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
                      ...metricCols,
                    ]}
                    rows={(displayData.by_region || []).map((r) => ({ ...r, _key: r.region_id || r.region_name }))}
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
                      ...metricCols,
                    ]}
                    rows={(displayData.by_lead_type || []).map((r) => ({ ...r, _key: r.lead_type_id || r.lead_type_name }))}
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
                      ...metricCols,
                    ]}
                    rows={(displayData.by_source || []).map((r) => ({ ...r, _key: r.source_id || r.source_name }))}
                  />
                </CollapsibleDataList>
              </Section>
            </div>
          )}

          {activeTab === 'company' && (
            <Section title="Theo công ty" subtitle="Click dòng để xem khu vực">
              <QuoteCloseChartsGrid rows={displayData.by_company || []} nameKey="company_name" entityLabel="công ty" />
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
                    ...metricCols,
                  ]}
                  rows={(displayData.by_company || []).map((r) => ({ ...r, _key: r.company_id || r.company_name }))}
                  onRowClick={drillToCompany}
                />
              </CollapsibleDataList>
            </Section>
          )}

          {activeTab === 'region' && (
            <Section title="Theo khu vực" subtitle="Click dòng để xem nhân viên">
              <QuoteCloseChartsGrid rows={displayData.by_region || []} nameKey="region_name" entityLabel="khu vực" />
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
                    ...metricCols,
                  ]}
                  rows={(displayData.by_region || []).map((r) => ({ ...r, _key: r.region_id || r.region_name }))}
                  onRowClick={drillToRegion}
                />
              </CollapsibleDataList>
            </Section>
          )}

          {activeTab === 'employee' && (
            <div className="space-y-5">
              <Section
                title="Biểu đồ báo giá & chốt đơn"
                subtitle="GT báo giá vs giá trị chốt, tỷ lệ chốt/BG và tăng trưởng theo nhân viên"
                className="lg:col-span-2"
              >
                <QuoteCloseChartsGrid
                  rows={(displayData.by_employee || []).filter((r) => r.user_id)}
                  nameKey="full_name"
                  entityLabel="nhân viên"
                  combinedRatesPie
                />
              </Section>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <LeadTypeBreakdownChart rows={displayData.by_lead_type || []} />
                <FirstStageSlaChart sla={firstStageSla} />
              </div>

              <Section
                title="Bảng tổng hợp nhân viên"
                subtitle={`Kỳ ${reportPeriodLabel} · ${typeViewLabel} · Lead/deal theo ngày tạo · KPI theo occurred_at trên cùng cohort`}
                actions={(
                  <button
                    type="button"
                    onClick={exportEmployeeExcel}
                    disabled={employeeExcelLoading || !(displayData.by_employee || []).some((r) => r.user_id)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow-sm disabled:opacity-40"
                  >
                    <Download className="w-4 h-4" />
                    {employeeExcelLoading ? 'Đang xuất…' : 'Xuất Excel'}
                  </button>
                )}
              >
                {employeeStacked.length > 0 && (
                  <DealStackedBarChart data={employeeStacked} title="Deal theo nhân viên (chốt / thua / mở)" />
                )}
                <DeliveryPerformanceChart employees={displayData.by_employee || []} />
                <CollapsibleDataList label="bảng số liệu nhân viên" defaultOpen>
                  <MetricTable
                    columns={[
                      { key: 'full_name', label: 'Nhân viên', bold: true },
                      { key: 'department_name', label: 'Phòng ban' },
                      ...metricCols,
                    ]}
                    rows={(displayData.by_employee || [])
                      .filter((r) => r.user_id)
                      .map((r) => ({ ...r, _key: r.user_id }))}
                  />
                </CollapsibleDataList>
              </Section>

              <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 pt-5 pb-3 border-b border-slate-100">
                  <h2 className="text-base font-bold text-slate-900">Chi tiết từng nhân viên</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Chọn thẻ nhân viên để xem biểu đồ pipeline · SLA tiếp nhận: {displayData?.reception_sla_minutes ?? 15} phút
                  </p>
                </div>
                <div className="p-4 md:p-5 min-w-0">
                  <EmployeeReportPanel
                    employees={displayData.by_employee || []}
                    queryParams={pipelineQueryParams}
                    typeView={typeView}
                    receptionSlaMinutes={displayData?.reception_sla_minutes ?? 15}
                    preferRowMetrics
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

function Section({ title, subtitle, children, className = '', actions }) {
  return (
    <div className={`rounded-2xl bg-white border border-slate-200 p-5 shadow-sm space-y-4 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}
