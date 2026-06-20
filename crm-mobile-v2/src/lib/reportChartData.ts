import type { EmployeeReportRow, OrgReportRow, ReportPipelineFunnelRow, ReportTimelineRow } from '../api/employeeReport';
import { formatViDateIso } from './reportFormat';

export const STACK_COLORS = {
  won: '#059669',
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
  lost: number;
  open: number;
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
      const open = Math.max(0, (r.deal_count || 0) - (r.won_deal_count || 0) - (r.lost_deal_count || 0));
      const name = nameKey === 'full_name'
        ? truncLabel((r as EmployeeReportRow).full_name, 14)
        : truncLabel((r as OrgReportRow).region_name, 14);
      return {
        name,
        won: r.won_deal_count || 0,
        lost: r.lost_deal_count || 0,
        open,
      };
    });
}

export type PieSegment = { name: string; value: number; color: string };

export function buildDealOutcomePie(byEmployee: EmployeeReportRow[]): PieSegment[] {
  let won = 0;
  let lost = 0;
  let open = 0;
  for (const r of byEmployee || []) {
    won += r.won_deal_count || 0;
    lost += r.lost_deal_count || 0;
    open += Math.max(0, (r.deal_count || 0) - (r.won_deal_count || 0) - (r.lost_deal_count || 0));
  }
  return [
    { name: 'Đã chốt', value: won, color: STACK_COLORS.won },
    { name: 'Thua', value: lost, color: STACK_COLORS.lost },
    { name: 'Đang mở', value: open, color: STACK_COLORS.open },
  ].filter((x) => x.value > 0);
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
