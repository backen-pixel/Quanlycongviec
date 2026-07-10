/** Cột pipeline deal/lead coi là Thua / Hủy — không tính tổng deal và GT pipeline. */
const LOST_PIPELINE_STAGE_NAME_RE =
  /(hủy\s*deal|thua\s*\/\s*hủy|^\s*hủy\s*$|^\s*thua\s*\.?\s*$|chê\s*gi[aá]|khách\s*hủy|từ\s*chối|rớt|\blost\b|mất\s*deal)/i;

export function isLostOrCancelledPipelineStage(stage) {
  if (!stage) return false;
  if (stage.is_lost || stage.canonical_slug === 'lost' || stage.deal_report_bucket === 'lost') return true;
  const name = String(stage.name || '').trim();
  return LOST_PIPELINE_STAGE_NAME_RE.test(name);
}

/** Đếm deal không nằm ở cột Thua/Hủy. */
export function countDealsExcludingLostStages(deals, stagesDeal, resolveStage) {
  const resolve = typeof resolveStage === 'function'
    ? resolveStage
    : (deal) => {
      const sid = deal?.stage_id;
      if (!sid || !Array.isArray(stagesDeal)) return deal?.stage || null;
      return stagesDeal.find((s) => String(s.id) === String(sid)) || deal?.stage || null;
    };
  let n = 0;
  for (const deal of deals || []) {
    if (!isLostOrCancelledPipelineStage(resolve(deal))) n += 1;
  }
  return n;
}

export function countLostDealsInStages(deals, stagesDeal, resolveStage) {
  const total = Array.isArray(deals) ? deals.length : 0;
  return Math.max(0, total - countDealsExcludingLostStages(deals, stagesDeal, resolveStage));
}
