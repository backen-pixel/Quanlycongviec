import type { EmployeePipelineRow, EmployeeReportRow, EmployeeTimelineRow } from '../api/employeeReport';
import type { DealStackedRow, PieSegment } from './reportChartData';
import { STACK_COLORS, truncLabel } from './reportChartData';
import { formatViDateIso } from './reportFormat';

export function buildEmployeeTimelineChart(timeline: EmployeeTimelineRow[]) {
  return (timeline || []).map((d) => ({
    ...d,
    label: formatViDateIso(d.date),
  }));
}

export function buildConversionPie(
  summary: Record<string, number | null | undefined> | undefined,
  row?: Partial<EmployeeReportRow>,
): PieSegment[] {
  const leads = summary?.lead_count ?? row?.lead_count ?? 0;
  const deals = summary?.deal_count ?? row?.deal_count ?? 0;
  const lostLeads = summary?.lost_lead_count ?? row?.lost_lead_count ?? 0;
  const lostDeals = summary?.lost_deal_count ?? row?.lost_deal_count ?? 0;
  const openLeads = Math.max(0, Number(leads) - Number(lostLeads));
  const activeDeals = Math.max(0, Number(deals) - Number(lostDeals));
  const cancelTotal = Number(lostLeads) + Number(lostDeals);
  if (!leads && !deals) return [];
  return [
    { name: 'Deal', value: activeDeals, color: '#0891b2' },
    { name: 'Lead mở', value: openLeads, color: '#c7d2fe' },
    { name: 'Hủy', value: cancelTotal, color: '#e11d48' },
  ].filter((x) => x.value > 0);
}

export function buildEmployeeDealOutcomePie(
  summary: Record<string, number | null | undefined> | undefined,
  row?: Partial<EmployeeReportRow>,
): PieSegment[] {
  const won = summary?.won_deal_count ?? row?.won_deal_count ?? 0;
  const lost = summary?.lost_deal_count ?? row?.lost_deal_count ?? 0;
  const deals = summary?.deal_count ?? row?.deal_count ?? 0;
  const open = Math.max(0, Number(deals) - Number(won) - Number(lost));
  return [
    { name: 'Chốt', value: Number(won), color: STACK_COLORS.won },
    { name: 'Thua', value: Number(lost), color: STACK_COLORS.lost },
    { name: 'Đang mở', value: open, color: STACK_COLORS.open },
  ].filter((x) => x.value > 0);
}

export function computeConversionRates(
  summary: Record<string, number | null | undefined> | undefined,
  row?: Partial<EmployeeReportRow>,
) {
  const leads = Number(summary?.lead_count ?? row?.lead_count ?? 0);
  const deals = Number(summary?.deal_count ?? row?.deal_count ?? 0);
  const leadToDealPct = leads > 0 ? Math.round((deals / leads) * 1000) / 10 : null;
  const lost = Number(summary?.lost_lead_count ?? row?.lost_lead_count ?? 0)
    + Number(summary?.lost_deal_count ?? row?.lost_deal_count ?? 0);
  const total = leads + deals;
  const cancelPct = total > 0 ? Math.round((lost / total) * 1000) / 10 : null;
  const overduePct = summary?.overdue_rate_pct ?? row?.overdue_rate_pct ?? null;
  return { leadToDealPct, cancelPct, overduePct };
}

export function buildPipelineValueBars(pipelines: EmployeePipelineRow[], max = 8) {
  return pipelines
    .slice()
    .sort((a, b) => (b.total_value || 0) - (a.total_value || 0))
    .slice(0, max)
    .map((p) => ({
      name: truncLabel(p.pipeline_name, 14),
      value: p.total_value || 0,
    }));
}

export function buildPipelineStackedRows(pipelines: EmployeePipelineRow[], max = 8): DealStackedRow[] {
  return pipelines
    .filter((p) => (p.deal_count || 0) > 0)
    .slice(0, max)
    .map((p) => {
      const open = p.open_deal_count ?? Math.max(0, (p.deal_count || 0) - (p.won_deal_count || 0) - (p.lost_deal_count || 0));
      return {
        name: truncLabel(p.pipeline_name, 12),
        won: p.won_deal_count || 0,
        lost: p.lost_deal_count || 0,
        open,
      };
    });
}
