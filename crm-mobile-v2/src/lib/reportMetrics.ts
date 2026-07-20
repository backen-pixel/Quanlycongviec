import type { EmployeeReportRow, OrgReportRow } from '../api/employeeReport';

type DealOutcomeSource = Partial<OrgReportRow> & {
  open_deal_count?: number | null;
  win_rate_all_deals_pct?: number | null;
};

/** Chốt = thắng + sau thắng + hoàn thành (cùng chỉ số BC web). */
export function reportClosedWonCount(r?: Partial<OrgReportRow> | null): number {
  return Number(r?.won_or_later_deal_count ?? r?.won_deal_count ?? 0) || 0;
}

export function reportClosedWonValue(r?: Partial<OrgReportRow> | null): number {
  return Number(r?.won_or_later_value ?? r?.won_value ?? r?.completed_value ?? 0) || 0;
}

/**
 * Deal đang mở.
 * - BC tổ chức (deal_kh_split): deal_count đã là pipeline mở.
 * - Chi tiết NV (staff-pipelines): ưu tiên open_deal_count (đã tách chốt/thua).
 */
export function reportOpenDealCount(r?: DealOutcomeSource | null): number {
  if (r?.open_deal_count != null && Number.isFinite(Number(r.open_deal_count))) {
    return Math.max(0, Number(r.open_deal_count) || 0);
  }
  return Math.max(0, Number(r?.deal_count ?? 0) || 0);
}

/** Mẫu số tỷ lệ chốt/tổng deal — khớp web/backend. */
export function reportDealConversionDenom(r?: DealOutcomeSource | null): number {
  const closed = reportClosedWonCount(r);
  const lost = Number(r?.lost_deal_count ?? 0) || 0;
  if (r?.open_deal_count != null && Number.isFinite(Number(r.open_deal_count))) {
    return Math.max(0, closed + (Number(r.open_deal_count) || 0) + lost);
  }
  return Math.max(0,
    (Number(r?.deal_count ?? 0) || 0)
    + (Number(r?.customer_order_count ?? 0) || 0)
    + lost,
  );
}

/** Tỷ lệ chốt % — ưu tiên conversion_rate backend. */
export function reportDealConversionRate(r?: DealOutcomeSource | null): number {
  const fromApi = r?.conversion_rate;
  if (fromApi != null && Number.isFinite(Number(fromApi))) {
    return Math.round(Number(fromApi));
  }
  if (r?.win_rate_all_deals_pct != null && Number.isFinite(Number(r.win_rate_all_deals_pct))) {
    return Math.round(Number(r.win_rate_all_deals_pct));
  }
  const denom = reportDealConversionDenom(r);
  const closed = reportClosedWonCount(r);
  return denom > 0 ? Math.round((closed / denom) * 100) : 0;
}

export function reportCancelLostTotal(r?: Partial<OrgReportRow> | null): number {
  return (Number(r?.lost_lead_count ?? 0) || 0) + (Number(r?.lost_deal_count ?? 0) || 0);
}

export function reportCancelTotalCount(r?: Partial<OrgReportRow> | null): number {
  return (Number(r?.lead_count ?? 0) || 0)
    + (Number(r?.deal_count ?? 0) || 0)
    + (Number(r?.customer_order_count ?? 0) || 0)
    + (Number(r?.lost_deal_count ?? 0) || 0);
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
