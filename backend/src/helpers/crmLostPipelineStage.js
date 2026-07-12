/** Cột pipeline deal/lead coi là Thua / Hủy — không tính tổng deal và GT pipeline. */
const LOST_PIPELINE_STAGE_NAME_RE =
  /(hủy\s*deal|thua\s*\/\s*hủy|^\s*hủy\s*$|^\s*thua\s*\.?\s*$|chê\s*gi[aá]|khách\s*hủy|từ\s*chối|rớt|\blost\b|mất\s*deal)/i;

function isLostOrCancelledPipelineStage(stage) {
  if (!stage) return false;
  if (stage.is_lost || stage.canonical_slug === 'lost' || stage.deal_report_bucket === 'lost') return true;
  const name = String(stage.name || '').trim();
  return LOST_PIPELINE_STAGE_NAME_RE.test(name);
}

module.exports = {
  LOST_PIPELINE_STAGE_NAME_RE,
  isLostOrCancelledPipelineStage,
};
