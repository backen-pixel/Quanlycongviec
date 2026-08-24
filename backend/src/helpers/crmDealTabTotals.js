/**
 * Tổng tab Deal / Đơn hàng từ stage counts — cùng logic FE `sumCrmDealTabCountsFromStageCounts`.
 * Dùng trong filter-summary để badge Deals hiện cùng lúc Lead (không phụ thuộc FE đã tải stagesDeal).
 */
const { isLostOrCancelledPipelineStage } = require('./crmLostPipelineStage');

function stageOrderIndex(stage) {
  const ord = Number(stage?.order_index);
  return Number.isFinite(ord) ? ord : 999;
}

function groupStagesByPipeline(stages) {
  const map = new Map();
  for (const s of stages || []) {
    const pid = String(s?.pipeline_id || '__none__');
    if (!map.has(pid)) map.set(pid, []);
    map.get(pid).push(s);
  }
  return map;
}

function resolveDealWonAnchorStage(stagesDeal) {
  const won = (stagesDeal || []).filter((s) => !!s?.is_won && !s?.is_lost);
  if (!won.length) return null;
  if (won.length === 1) return won[0];
  return won.reduce((best, s) => (stageOrderIndex(s) > stageOrderIndex(best) ? s : best));
}

function wonAnchorOrderForPipelineStages(stagesInPipe) {
  const wonStage = resolveDealWonAnchorStage(stagesInPipe);
  return wonStage ? stageOrderIndex(wonStage) : null;
}

function sumCrmDealTabCountsFromStageCounts(stagesDeal, countsMap = {}) {
  const stages = Array.isArray(stagesDeal) ? stagesDeal : [];
  const counts = countsMap && typeof countsMap === 'object' ? countsMap : {};
  const stagesByPipeline = groupStagesByPipeline(stages);
  const multiPipeline = stagesByPipeline.size > 1;

  let deal = 0;
  let customer = 0;
  let merged = 0;
  let lost = 0;

  for (const s of stages) {
    if (!s?.id) continue;
    const n = Number(counts[s.id] ?? counts[String(s.id)] ?? 0) || 0;
    if (n <= 0) continue;
    if (isLostOrCancelledPipelineStage(s)) {
      lost += n;
      continue;
    }
    merged += n;

    const pipeStages = multiPipeline
      ? (stagesByPipeline.get(String(s.pipeline_id || '__none__')) || stages)
      : stages;
    const wonAnchorOrder = wonAnchorOrderForPipelineStages(pipeStages);
    if (wonAnchorOrder == null) {
      if (!s.is_won) deal += n;
      else customer += n;
      continue;
    }
    const order = stageOrderIndex(s);
    if (order < wonAnchorOrder) deal += n;
    if (order >= wonAnchorOrder) customer += n;
  }

  const orphan = Number(counts.__none__ ?? counts[''] ?? 0) || 0;
  if (orphan > 0) {
    deal += orphan;
    merged += orphan;
  }

  return { deal, customer, merged, lost, total: merged + lost };
}

/**
 * Cột dùng cho KPI Deal tab (khi tách KH) — trước Thắng + Thua; không gồm cột Thắng.
 * Khớp `preWonStagesForDealStats` ở frontend (lib/crmPipelineTabs.js), có xét theo từng
 * pipeline khi "Tất cả công ty" gộp nhiều pipeline (mỗi pipeline 1 cột Thắng riêng).
 */
function preWonStagesForDealStats(stagesDeal) {
  const stages = Array.isArray(stagesDeal) ? stagesDeal : [];
  const stagesByPipeline = groupStagesByPipeline(stages);
  const multiPipeline = stagesByPipeline.size > 1;
  return stages.filter((s) => {
    if (isLostOrCancelledPipelineStage(s)) return true;
    const pipeStages = multiPipeline
      ? (stagesByPipeline.get(String(s?.pipeline_id || '__none__')) || stages)
      : stages;
    const wonStage = resolveDealWonAnchorStage(pipeStages);
    const wonAnchorOrder = wonStage ? stageOrderIndex(wonStage) : null;
    if (wonAnchorOrder == null) return !s?.is_won;
    if (wonStage && String(s?.id) === String(wonStage.id)) return false;
    return stageOrderIndex(s) < wonAnchorOrder;
  });
}

/**
 * Cột dùng cho KPI tab Khách hàng (khi tách KH) — cột Thắng + các cột sau Thắng
 * (SX, VC, Hoàn thành…), không gồm Thua/Hủy. Khớp `customerTabStages` từ
 * `splitDealStagesForCrmTabs` ở frontend (lib/crmPipelineTabs.js), có xét theo từng
 * pipeline khi "Tất cả công ty" gộp nhiều pipeline.
 */
function postWonStagesForCustomerStats(stagesDeal) {
  const stages = Array.isArray(stagesDeal) ? stagesDeal : [];
  const stagesByPipeline = groupStagesByPipeline(stages);
  const multiPipeline = stagesByPipeline.size > 1;
  return stages.filter((s) => {
    if (isLostOrCancelledPipelineStage(s)) return false;
    const pipeStages = multiPipeline
      ? (stagesByPipeline.get(String(s?.pipeline_id || '__none__')) || stages)
      : stages;
    const wonStage = resolveDealWonAnchorStage(pipeStages);
    const wonAnchorOrder = wonStage ? stageOrderIndex(wonStage) : null;
    if (wonAnchorOrder == null) return false;
    if (wonStage && String(s?.id) === String(wonStage.id)) return true;
    return stageOrderIndex(s) > wonAnchorOrder;
  });
}

module.exports = {
  sumCrmDealTabCountsFromStageCounts,
  preWonStagesForDealStats,
  postWonStagesForCustomerStats,
};
