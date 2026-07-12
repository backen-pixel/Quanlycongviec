/**
 * Tách Deal / Đơn hàng — cùng logic báo cáo tổ chức (orgReportDealSplitBuckets).
 */
const { supabase } = require('../config/supabase');

function buildWonStageOrderByPipeline(stageMap) {
  const byPipe = {};
  for (const st of Object.values(stageMap || {})) {
    if (!st?.pipeline_id) continue;
    if (st.is_lost || st.canonical_slug === 'lost' || st.deal_report_bucket === 'lost') continue;
    if (!st.is_won) continue;
    const pid = String(st.pipeline_id);
    const ord = Number(st.order_index);
    const order = Number.isFinite(ord) ? ord : 999;
    if (!Number.isFinite(byPipe[pid]) || order > byPipe[pid]) {
      byPipe[pid] = order;
    }
  }
  return byPipe;
}

function orgReportDealSplitBuckets(st, wonStageOrderByPipe) {
  if (!st) return { inDealTab: true, inCustomerTab: false };
  if (st.is_lost || st.canonical_slug === 'lost' || st.deal_report_bucket === 'lost') {
    return { inDealTab: true, inCustomerTab: false };
  }
  const pid = st.pipeline_id ? String(st.pipeline_id) : null;
  const ordRaw = Number(st.order_index);
  const ord = Number.isFinite(ordRaw) ? ordRaw : 999;
  const anchor = pid ? wonStageOrderByPipe?.[pid] : null;
  if (!Number.isFinite(anchor)) return { inDealTab: true, inCustomerTab: false };
  return {
    inDealTab: ord < anchor,
    inCustomerTab: ord >= anchor,
  };
}

function orgReportDealIsClosedWon(st, wonStageOrderByPipe) {
  if (!st || st.is_lost) return false;
  const slug = st.canonical_slug || null;
  if (slug === 'lost' || st.deal_report_bucket === 'lost') return false;
  const pid = st.pipeline_id ? String(st.pipeline_id) : null;
  const ordRaw = Number(st.order_index);
  const ord = Number.isFinite(ordRaw) ? ordRaw : 999;
  if (pid && Number.isFinite(wonStageOrderByPipe?.[pid])) {
    return ord >= wonStageOrderByPipe[pid];
  }
  return !!st.is_won;
}

/** Gom stage map + won anchor theo pipeline từ danh sách lead/deal rows. */
async function loadDealKhSplitContext(leads) {
  const pipelineIds = new Set();
  for (const l of leads || []) {
    const pid = l.stage?.pipeline_id || l.pipeline_id;
    if (pid) pipelineIds.add(String(pid));
  }
  if (!pipelineIds.size) {
    return { stageMap: {}, wonStageOrderByPipe: {}, dealKhSplitAvailable: false };
  }
  const { data: stages, error } = await supabase
    .from('crm_pipeline_stages')
    .select('id, pipeline_id, order_index, is_won, is_lost, canonical_slug, deal_report_bucket, pipeline_type')
    .in('pipeline_id', [...pipelineIds]);
  if (error) throw new Error(error.message);
  const stageMap = Object.create(null);
  for (const s of stages || []) stageMap[s.id] = s;
  const wonStageOrderByPipe = buildWonStageOrderByPipeline(stageMap);
  const dealKhSplitAvailable = Object.keys(wonStageOrderByPipe).length > 0;
  return { stageMap, wonStageOrderByPipe, dealKhSplitAvailable };
}

function resolveLeadStage(lead, stageMap) {
  const embedded = lead.stage || null;
  if (embedded?.order_index != null && embedded?.pipeline_id) return embedded;
  const sid = lead.stage_id || embedded?.id;
  if (sid && stageMap[sid]) return stageMap[sid];
  return embedded;
}

/** Phân loại 1 deal row — trả metrics khớp org overview. */
function classifyDealRowForKhSplit(lead, stageMap, wonStageOrderByPipe, dealKhSplit) {
  const val = Number(lead.estimated_value) || 0;
  const st = resolveLeadStage(lead, stageMap);
  if (!dealKhSplit) {
    return {
      inDealTab: true,
      inCustomerTab: false,
      isClosedWon: !!(st?.is_won && !st?.is_lost),
      value: val,
    };
  }
  const buckets = orgReportDealSplitBuckets(st, wonStageOrderByPipe);
  return {
    ...buckets,
    isClosedWon: orgReportDealIsClosedWon(st, wonStageOrderByPipe),
    value: val,
  };
}

function aggregateDealKhSplitMetrics(dealRows, stageMap, wonStageOrderByPipe, dealKhSplit) {
  const out = {
    deal_kh_split: !!dealKhSplit,
    new_deal_total: 0,
    new_deal_pipeline_count: 0,
    new_customer_order_count: 0,
    new_deal_pipeline_value: 0,
    new_customer_order_value: 0,
    won_or_later_count: 0,
    won_or_later_value: 0,
    holding_deal_pipeline_count: 0,
    holding_customer_order_count: 0,
    holding_deal_pipeline_value: 0,
    holding_customer_order_value: 0,
  };
  for (const l of dealRows || []) {
    if (l.type !== 'deal') continue;
    const c = classifyDealRowForKhSplit(l, stageMap, wonStageOrderByPipe, dealKhSplit);
    out.new_deal_total += 1;
    if (c.inDealTab) {
      out.new_deal_pipeline_count += 1;
      out.new_deal_pipeline_value += c.value;
    }
    if (c.inCustomerTab) {
      out.new_customer_order_count += 1;
      out.new_customer_order_value += c.value;
    }
    if (c.isClosedWon) {
      out.won_or_later_count += 1;
      out.won_or_later_value += c.value;
    }
  }
  return out;
}

function aggregateOpenDealKhSplitMetrics(openDealRows, stageMap, wonStageOrderByPipe, dealKhSplit) {
  const out = {
    holding_deal_pipeline_count: 0,
    holding_customer_order_count: 0,
    holding_deal_pipeline_value: 0,
    holding_customer_order_value: 0,
  };
  for (const l of openDealRows || []) {
    if (l.type !== 'deal') continue;
    const st = resolveLeadStage(l, stageMap);
    if (st?.is_lost) continue;
    const c = classifyDealRowForKhSplit(l, stageMap, wonStageOrderByPipe, dealKhSplit);
    if (c.inDealTab) {
      out.holding_deal_pipeline_count += 1;
      out.holding_deal_pipeline_value += c.value;
    }
    if (c.inCustomerTab) {
      out.holding_customer_order_count += 1;
      out.holding_customer_order_value += c.value;
    }
  }
  return out;
}

module.exports = {
  buildWonStageOrderByPipeline,
  orgReportDealSplitBuckets,
  orgReportDealIsClosedWon,
  loadDealKhSplitContext,
  classifyDealRowForKhSplit,
  aggregateDealKhSplitMetrics,
  aggregateOpenDealKhSplitMetrics,
};
