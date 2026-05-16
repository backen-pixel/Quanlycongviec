/** SLA cột pipeline CRM — dùng chung crm.js, kpi.js, kpiCalculator */

const DEFAULT_PIPELINE_STAGE_SLA_DAYS = 7;

function isPipelineStageSlaDisabled(slaDaysRaw) {
  return slaDaysRaw === 0 || slaDaysRaw === '0';
}

/** Lưu DB: null = mặc định 7 trên UI; 0 = tắt SLA; ≥1 = số ngày. */
function normalizePipelineStageSlaDaysForDb(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n === 0) return 0;
  if (n >= 1) return Math.round(n);
  return null;
}

/** null nếu tắt (0); ngược lại số ngày áp dụng (mặc định 7 khi DB null). */
function effectivePipelineStageSlaDays(slaDaysRaw) {
  if (isPipelineStageSlaDisabled(slaDaysRaw)) return null;
  const n = Number(slaDaysRaw);
  if (Number.isFinite(n) && n >= 1) return Math.round(n);
  return DEFAULT_PIPELINE_STAGE_SLA_DAYS;
}

module.exports = {
  DEFAULT_PIPELINE_STAGE_SLA_DAYS,
  isPipelineStageSlaDisabled,
  normalizePipelineStageSlaDaysForDb,
  effectivePipelineStageSlaDays,
};
