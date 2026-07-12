/**
 * Pure functions tính điểm KPI — KHÔNG phụ thuộc DB.
 * Dùng cho cả production và unit test.
 *
 * Công thức theo file Excel KPI_CRM_SalesAdmin_Deal_TuBep.xlsx (sheet "Cong thuc tinh diem").
 */

const SCORE_CAP_RATIO = 1.2;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * computeScore({ formula_type, actual, target, weight }) → { raw_score, capped_score }
 *
 * - actual hoặc target null/undefined hoặc target=0 → trả null (không tính)
 * - increasing/quantity/revenue: ratio = actual/target
 * - decreasing/duration: ratio = actual<=0 ? 1.2 : target/actual
 * - capped tại 1.2 × weight (vượt mục tiêu vẫn chỉ tính tối đa 120%)
 */
function computeScore({ formula_type, actual, target, weight }) {
  if (actual == null || target == null || target === 0) {
    return { raw_score: null, capped_score: null };
  }
  const w = num(weight);
  let ratio = 0;
  switch (formula_type) {
    case 'increasing':
    case 'quantity':
    case 'revenue':
      ratio = actual / target;
      break;
    case 'decreasing':
    case 'duration':
      ratio = actual <= 0 ? SCORE_CAP_RATIO : target / actual;
      break;
    default:
      ratio = 0;
  }
  const cappedRatio = Math.min(ratio, SCORE_CAP_RATIO);
  return {
    raw_score: Math.round(ratio * w * 100) / 100,
    capped_score: Math.round(Math.max(0, cappedRatio) * w * 100) / 100,
  };
}

module.exports = { computeScore, SCORE_CAP_RATIO };
