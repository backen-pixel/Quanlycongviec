import type { FirstStageSla, LeadTypeReportRow } from '../api/employeeReport';
import type { EmployeeReportRow, OrgReportRow, ReportPipelineFunnelRow, ReportTimelineRow } from '../api/employeeReport';
import { formatViDateIso } from './reportFormat';
import {
  reportClosedWonCount,
  reportOpenDealCount,
} from './reportMetrics';

export const STACK_COLORS = {
  won: '#059669',
  completed: '#7c3aed',
  lost: '#e11d48',
  open: '#0284c7',
} as const;

export const CHART_COLORS = {
  lead: '#6366f1',
  deal: '#0891b2',
  wonValue: '#059669',
  pipeline: '#0891b2',
  grid: '#e2e8f0',
} as const;

export function truncLabel(s: string | null | undefined, max = 14): string {
  if (!s) return '—';
  const t = String(s);
  return t.length <= max ? t : `${t.slice(0, Math.max(0, max - 1))}…`;
}

export function buildTimelineChart(timeline: ReportTimelineRow[]) {
  return (timeline || []).map((d) => ({
    ...d,
    label: formatViDateIso(d.date),
  }));
}

export function buildFunnelChart(funnel: ReportPipelineFunnelRow[], max = 12) {
  return (funnel || [])
    .filter((s) => (s.count || 0) > 0)
    .slice(0, max)
    .map((s) => ({
      name: truncLabel(s.name, 16),
      count: s.count || 0,
      value: s.value || 0,
      color: s.color || CHART_COLORS.lead,
    }));
}

export function buildRegionBarChart(byRegion: OrgReportRow[], max = 10) {
  return (byRegion || [])
    .slice(0, max)
    .map((r) => ({
      name: truncLabel(r.region_name, 12),
      value: r.pipeline_value ?? 0,
    }));
}

export type DealStackedRow = {
  name: string;
  won: number;
  completed: number;
  lost: number;
  open: number;
  completion_rate_pct?: number | null;
};

export function buildDealStackedRows(
  items: Array<EmployeeReportRow | OrgReportRow>,
  nameKey: 'full_name' | 'region_name',
  max = 10,
): DealStackedRow[] {
  return (items || [])
    .filter((r) => (r.deal_count || 0) > 0)
    .slice(0, max)
    .map((r) => {
      const closed = reportClosedWonCount(r);
      const open = reportOpenDealCount(r);
      const name = nameKey === 'full_name'
        ? truncLabel((r as EmployeeReportRow).full_name, 14)
        : truncLabel((r as OrgReportRow).region_name, 14);
      return {
        name,
        won: closed,
        completed: 0,
        lost: r.lost_deal_count || 0,
        open,
      };
    });
}

export type PieSegment = { name: string; value: number; color: string };

/** Donut kết quả deal — lấy từ summary (toàn phạm vi, khớp BC web). */
export function buildDealOutcomePieFromSummary(summary: OrgReportRow): PieSegment[] {
  const closed = reportClosedWonCount(summary);
  const lost = summary.lost_deal_count || 0;
  const open = reportOpenDealCount(summary);
  return [
    { name: 'Đã chốt', value: closed, color: STACK_COLORS.won },
    { name: 'Thua', value: lost, color: STACK_COLORS.lost },
    { name: 'Đang mở', value: open, color: STACK_COLORS.open },
  ].filter((x) => x.value > 0);
}

/** Donut theo tổng NV (fallback khi không có summary). */
export function buildDealOutcomePie(byEmployee: EmployeeReportRow[]): PieSegment[] {
  let won = 0;
  let lost = 0;
  let open = 0;
  for (const r of byEmployee || []) {
    won += reportClosedWonCount(r);
    lost += r.lost_deal_count || 0;
    open += reportOpenDealCount(r);
  }
  return [
    { name: 'Đã chốt', value: won, color: STACK_COLORS.won },
    { name: 'Thua', value: lost, color: STACK_COLORS.lost },
    { name: 'Đang mở', value: open, color: STACK_COLORS.open },
  ].filter((x) => x.value > 0);
}

export function buildLeadTypeChartData(rows: LeadTypeReportRow[], max = 12) {
  return (rows || [])
    .filter((r) => (r.lead_count || 0) + (r.deal_count || 0) > 0)
    .slice(0, max)
    .map((r) => ({
      name: truncLabel(r.lead_type_name, 14),
      lead: r.lead_count ?? 0,
      deal: r.deal_count ?? 0,
      color: r.lead_type_color || undefined,
    }));
}

export function buildFirstStageSlaPie(sla: FirstStageSla | null | undefined): PieSegment[] {
  const onTime = sla?.on_time_count ?? 0;
  const overdue = sla?.overdue_count ?? 0;
  if (!onTime && !overdue) return [];
  return [
    { name: 'Đúng hạn', value: onTime, color: '#059669' },
    { name: 'Quá hạn', value: overdue, color: '#e11d48' },
  ].filter((x) => x.value > 0);
}

export function buildFirstStageSlaFromSummary(summary: Partial<OrgReportRow> | null | undefined): FirstStageSla | null {
  const open = Number(summary?.first_stage_open_count ?? 0);
  if (!open) return null;
  return {
    open_count: open,
    on_time_count: Number(summary?.first_stage_on_time_count ?? 0),
    overdue_count: Number(summary?.first_stage_overdue_count ?? 0),
    on_time_rate_pct: summary?.first_stage_on_time_rate_pct ?? null,
    overdue_rate_pct: summary?.first_stage_overdue_rate_pct ?? null,
  };
}

export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(value));
  const n = value / pow;
  if (n <= 1) return pow;
  if (n <= 2) return 2 * pow;
  if (n <= 5) return 5 * pow;
  return 10 * pow;
}

export function formatAxisShort(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (Math.abs(value) >= 1e6) return `${Math.round(value / 1e6)}M`;
  if (Math.abs(value) >= 1e3) return `${Math.round(value / 1e3)}K`;
  return String(Math.round(value));
}
