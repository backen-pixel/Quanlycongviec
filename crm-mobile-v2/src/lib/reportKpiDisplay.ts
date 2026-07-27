import type { OrgReportRow } from '../api/employeeReport';
import { formatVndShort } from './reportFormat';

/**
 * GT pipeline trên card tổng quan — khớp web org-overview.
 * Backend đã loại lost_value khỏi pipeline_value (Lead + Deal pipeline + Đơn hàng).
 * Dùng cohort nếu hub sync đã ghi đè pipeline_value bằng open-weighted.
 */
export function reportPipelineKpiValue(summary: OrgReportRow): number {
  return Number(summary.cohort_pipeline_value ?? summary.pipeline_value ?? 0) || 0;
}

/**
 * Deal (pipeline) trong kỳ — khớp web khi deal_kh_split=1.
 * Backend đã không cộng deal thua vào deal_count.
 */
export function reportDealKpiCount(summary: OrgReportRow): number {
  return Number(summary.deal_count ?? 0) || 0;
}

export function reportDealKpiSub(): string {
  return 'Không gồm thua / ĐH';
}

export function reportPipelineKpiSub(): string {
  return 'Không gồm deal thua';
}

/** DT dự kiến — khớp BC web (summary.expected_value). */
export function reportExpectedKpiValue(summary: OrgReportRow): number {
  return Number(summary.expected_value ?? 0) || 0;
}

/** GT kỳ vọng (weighted × xác suất) — khớp BC web «Giá trị kỳ vọng». */
export function reportWeightedKpiValue(summary: OrgReportRow): number {
  return Number(
    summary.weighted_value
      ?? summary.open_pipeline_value
      ?? 0,
  ) || 0;
}

export function formatReportDealKpi(summary: OrgReportRow): string {
  return String(reportDealKpiCount(summary));
}

export function formatReportPipelineKpi(summary: OrgReportRow): string {
  return formatVndShort(reportPipelineKpiValue(summary));
}

export function formatReportExpectedKpi(summary: OrgReportRow): string {
  return formatVndShort(reportExpectedKpiValue(summary));
}

export function formatReportWeightedKpi(summary: OrgReportRow): string {
  return formatVndShort(reportWeightedKpiValue(summary));
}

export function reportWeightedKpiSub(): string {
  return 'Deal × xác suất';
}
