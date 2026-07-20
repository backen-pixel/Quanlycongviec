import type { OrgReportRow } from '../api/employeeReport';
import { formatVndShort } from './reportFormat';

/**
 * GT pipeline trên card tổng quan — không gồm deal thua.
 * Dùng cohort (GT hồ sơ kỳ) nếu có; trừ lost_value.
 */
export function reportPipelineKpiValue(summary: OrgReportRow): number {
  const base = Number(summary.cohort_pipeline_value ?? summary.pipeline_value ?? 0) || 0;
  const lost = Number(summary.lost_value ?? 0) || 0;
  return Math.max(0, base - lost);
}

/** Deal tạo trong kỳ — không gồm deal thua. */
export function reportDealKpiCount(summary: OrgReportRow): number {
  const deals = Number(summary.deal_count ?? 0) || 0;
  const lost = Number(summary.lost_deal_count ?? 0) || 0;
  return Math.max(0, deals - lost);
}

export function reportDealKpiSub(): string {
  return 'Không gồm thua';
}

/** DT dự kiến — khớp BC web (summary.expected_value). */
export function reportExpectedKpiValue(summary: OrgReportRow): number {
  return Number(summary.expected_value ?? 0) || 0;
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
