/**
 * Port sang backend của logic phân loại bucket KPI Deal dùng ở CRM Dashboard (frontend
 * `computeDashboardDealKpis` trong CRMDashboard.jsx). Tính trên tổng hợp THEO STAGE (count,
 * value_sum, weighted_value_sum từ RPC `crm_filter_summary`) — không cần tải từng deal —
 * vì mọi quy tắc phân loại chỉ phụ thuộc thuộc tính của STAGE, không phụ thuộc từng deal
 * (ngoại trừ estimated_value/weighted_value đã được cộng sẵn theo stage).
 *
 * Giữ nguyên tên hàm/luật nghiệp vụ khớp 1-1 với bản gốc ở frontend để không lệch số liệu.
 */
const { isLostOrCancelledPipelineStage } = require('./crmLostPipelineStage');

const DIACRITIC_MARK_RE = new RegExp('[̀-ͯ]', 'g');

function isCrmDealStageHoanThanhName(name) {
  const ascii = String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITIC_MARK_RE, '');
  return ascii.includes('hoan thanh');
}

function hasExplicitCompletedRevenueStage(stagesDeal) {
  return Array.isArray(stagesDeal) && stagesDeal.some((s) => !!s?.counts_as_completed_revenue);
}

function hasExplicitExpectedRevenueStage(stagesDeal) {
  return Array.isArray(stagesDeal)
    && stagesDeal.some((s) => !!s?.counts_as_expected_revenue && !isLostOrCancelledPipelineStage(s));
}

function stageIsRevenueCompleted(st, stagesDeal) {
  if (!st) return false;
  if (st.is_lost || st.canonical_slug === 'lost' || st.deal_report_bucket === 'lost') return false;
  if (hasExplicitCompletedRevenueStage(stagesDeal)) return !!st.counts_as_completed_revenue;
  if (st.deal_report_bucket === 'completed') return true;
  if (st.canonical_slug === 'completed') return true;
  if (st.name && isCrmDealStageHoanThanhName(st.name)) return true;
  return false;
}

function pickDealWonStages(stagesDeal) {
  if (!Array.isArray(stagesDeal) || !stagesDeal.length) return [];
  const hasExplicitCompleted = hasExplicitCompletedRevenueStage(stagesDeal);
  const notLostOrCompleted = (s) => {
    if (!s || s.is_lost) return false;
    if (s.canonical_slug === 'lost' || s.deal_report_bucket === 'lost') return false;
    if (hasExplicitCompleted) return !s.counts_as_completed_revenue;
    if (s.canonical_slug === 'completed' || s.deal_report_bucket === 'completed') return false;
    if (s.name && isCrmDealStageHoanThanhName(s.name)) return false;
    return true;
  };
  const explicit = stagesDeal.filter((s) => !!s?.counts_as_won_revenue && notLostOrCompleted(s));
  if (explicit.length) return explicit;
  return stagesDeal.filter((s) => !!s?.is_won && notLostOrCompleted(s));
}

const CRM_DEAL_PRE_CONTRACT_SLUGS = new Set([
  'designing',
  'quoted',
  'negotiating',
  'waiting_deposit',
]);

function classifyDealStageForDashboardKpi(st) {
  if (!st) return 'pre_contract';
  if (isLostOrCancelledPipelineStage(st)) return 'lost';
  const slug = st.canonical_slug || null;
  const bucket = st.deal_report_bucket || null;
  if (bucket === 'lost') return 'lost';
  if (bucket === 'completed') return 'project_completed';
  if (bucket === 'implementation') return 'implementation';
  if (bucket === 'pre_contract') return 'pre_contract';
  if (slug === 'completed') return 'project_completed';
  if (slug && CRM_DEAL_PRE_CONTRACT_SLUGS.has(slug)) return 'pre_contract';
  if (!slug && !st.is_won) return 'pre_contract';
  return 'implementation';
}

function dealDashboardKpiBucketForStage(st, stagesDeal) {
  if (stageIsRevenueCompleted(st, stagesDeal)) return 'project_completed';
  return classifyDealStageForDashboardKpi(st);
}

/**
 * Tính đủ các ô KPI Deal (bản gộp — khớp `computeDashboardDealKpis(deals, stagesDeal, stagesDeal)`
 * ở frontend khi KHÔNG bật tách tab Khách hàng) trên TOÀN BỘ deal khớp bộ lọc, dùng tổng hợp
 * theo stage (`counts`/`valueSums`/`weightedValueSums`, khoá bằng stage_id dạng string) thay vì
 * duyệt từng deal — nên không bị giới hạn bởi số thẻ Kanban client đã tải.
 */
function computeDashboardDealKpisFromStageAggregates(stagesDeal, counts, valueSums, weightedValueSums) {
  const stages = Array.isArray(stagesDeal) ? stagesDeal : [];
  const wonStages = pickDealWonStages(stages);
  const wonStageIds = new Set(wonStages.map((s) => String(s.id)));
  const hasExplicitExpected = hasExplicitExpectedRevenueStage(stages);

  let total_deals = 0;
  let deal_processing = 0;
  let deal_lost = 0;
  let project_active = 0;
  let project_completed = 0;
  let won_deals = 0;
  let won_value = 0;
  let completed_revenue_deals = 0;
  let completed_revenue_value = 0;
  let pipeline_estimated_value = 0;
  let expected_value = 0;

  for (const s of stages) {
    if (!s?.id) continue;
    const sid = String(s.id);
    const cnt = Number(counts[sid] ?? counts[s.id] ?? 0) || 0;
    if (!cnt) continue;
    const valueSum = Number(valueSums[sid] ?? valueSums[s.id] ?? 0) || 0;
    const weightedSum = Number(weightedValueSums[sid] ?? weightedValueSums[s.id] ?? 0) || 0;

    const isLost = isLostOrCancelledPipelineStage(s);
    if (!isLost) total_deals += cnt;

    const bucket = dealDashboardKpiBucketForStage(s, stages);
    if (bucket === 'pre_contract') deal_processing += cnt;
    else if (bucket === 'lost') deal_lost += cnt;
    else if (bucket === 'implementation') project_active += cnt;
    else if (bucket === 'project_completed') project_completed += cnt;

    const isWon = wonStageIds.has(sid);
    if (isWon) {
      won_deals += cnt;
      won_value += valueSum;
    }

    const isRevenueCompleted = stageIsRevenueCompleted(s, stages);
    if (isRevenueCompleted) {
      completed_revenue_deals += cnt;
      completed_revenue_value += valueSum;
    }

    const countsTowardExpected = hasExplicitExpected
      ? (!isLost && !isWon && !isRevenueCompleted && !!s.counts_as_expected_revenue)
      : (!isLost && !isWon && !isRevenueCompleted);
    if (countsTowardExpected) {
      pipeline_estimated_value += valueSum;
      expected_value += weightedSum;
    }
  }

  return {
    total_deals,
    deal_processing,
    deal_lost,
    project_active,
    project_completed,
    won_deals,
    won_value,
    completed_revenue_deals,
    completed_revenue_value,
    pipeline_estimated_value,
    expected_value: Math.round(expected_value),
  };
}

module.exports = {
  computeDashboardDealKpisFromStageAggregates,
};
