import type { EmployeeReportRow, OrgReportRow } from '../api/employeeReport';

/** Chốt = thắng + sau thắng + hoàn thành (cùng chỉ số BC web). */
export function reportClosedWonCount(r?: Partial<OrgReportRow> | null): number {
  return Number(r?.won_or_later_deal_count ?? r?.won_deal_count ?? 0) || 0;
}

export function reportClosedWonValue(r?: Partial<OrgReportRow> | null): number {
  return Number(r?.won_or_later_value ?? r?.won_value ?? r?.completed_value ?? 0) || 0;
}

export function reportOpenDealCount(r?: Partial<OrgReportRow> | null): number {
  const closed = reportClosedWonCount(r);
  const lost = Number(r?.lost_deal_count ?? 0) || 0;
  const deals = Number(r?.deal_count ?? 0) || 0;
  return Math.max(0, deals - closed - lost);
}

export function reportCancelLostTotal(r?: Partial<OrgReportRow> | null): number {
  return (Number(r?.lost_lead_count ?? 0) || 0) + (Number(r?.lost_deal_count ?? 0) || 0);
}

export function reportCancelTotalCount(r?: Partial<OrgReportRow> | null): number {
  return (Number(r?.lead_count ?? 0) || 0) + (Number(r?.deal_count ?? 0) || 0);
}

/** KPI tiến độ GT: ưu tiên tỷ lệ backend, fallback tính từ số liệu. */
export function reportKpiValueProgressPct(summary?: Partial<OrgReportRow> | null): number {
  const fromBackend = summary?.deal_close_value_rate_pct;
  if (fromBackend != null && Number.isFinite(Number(fromBackend))) {
    return Math.min(100, Math.max(0, Math.round(Number(fromBackend))));
  }
  const goal = Number(summary?.expected_value ?? 0) || 0;
  const achieved = reportClosedWonValue(summary);
  if (goal <= 0) return 0;
  return Math.min(100, Math.round((achieved / goal) * 100));
}
