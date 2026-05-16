/** SLA cột pipeline CRM — khớp backend/helpers/crmPipelineSla.js */

export const DEFAULT_PIPELINE_STAGE_SLA_DAYS = 7;

export function isPipelineStageSlaDisabled(slaDaysRaw) {
  return slaDaysRaw === 0 || slaDaysRaw === '0';
}

/** null = không áp dụng SLA (0 hoặc tắt); số > 0 = hạn ngày; null/undefined DB → 7. */
export function effectivePipelineStageSlaDays(slaDaysRaw) {
  if (isPipelineStageSlaDisabled(slaDaysRaw)) return null;
  const n = Number(slaDaysRaw);
  if (Number.isFinite(n) && n >= 1) return Math.round(n);
  return DEFAULT_PIPELINE_STAGE_SLA_DAYS;
}
