import { sortAndDedupePipelineStages } from './crmPipelineStages';

/** @typedef {'lead'|'deal'|'customer'} CrmPipelineTab */

export function isCrmCustomerPipelineTab(pipelineType) {
  return pipelineType === 'customer';
}

export function isCrmDealSidePipelineTab(pipelineType) {
  return pipelineType === 'deal' || pipelineType === 'customer';
}

export function crmPipelineTabEntityLabel(pipelineType) {
  if (pipelineType === 'lead') return 'lead';
  if (pipelineType === 'customer') return 'đơn hàng';
  return 'deal';
}

export function crmPipelineTabTitle(pipelineType) {
  if (pipelineType === 'lead') return 'Lead';
  if (pipelineType === 'customer') return 'Đơn hàng';
  return 'Deal';
}

function stageOrderIndex(stage) {
  const ord = Number(stage?.order_index);
  return Number.isFinite(ord) ? ord : 999;
}

/** Gom stage theo pipeline — KPI «Tất cả công ty» phải tính riêng từng pipeline. */
export function groupStagesByPipeline(stages) {
  const map = new Map();
  for (const s of stages || []) {
    const pid = String(s?.pipeline_id || '__none__');
    if (!map.has(pid)) map.set(pid, []);
    map.get(pid).push(s);
  }
  return map;
}

export function resolveStagesForDeal(deal, stagesDeal, stagesByPipeline) {
  const byId = new Map((stagesDeal || []).map((s) => [String(s.id), s]));
  const st = deal?.stage_id ? byId.get(String(deal.stage_id)) : null;
  const pid = String(st?.pipeline_id || deal?.pipeline_id || '__none__');
  const grouped = stagesByPipeline || groupStagesByPipeline(stagesDeal);
  return grouped.get(pid) || stagesDeal || [];
}

function wonAnchorForPipelineStages(stagesInPipe) {
  const wonStage = resolveDealWonAnchorStage(stagesInPipe);
  return {
    wonStage,
    wonAnchorOrder: wonStage ? stageOrderIndex(wonStage) : null,
  };
}

/**
 * Cột Thắng duy nhất trên pipeline Deal — CHỈ `is_won` (Cài đặt Pipeline → nút «Cột Thắng»).
 * Không dùng `counts_as_won_revenue`: cờ đó chỉ để KPI «Doanh thu thắng» cộng thêm cột
 * (vd. Đã cọc) mà không phải ranh giới tab Deal/KH (migration 166).
 */
export function resolveDealWonAnchorStage(stagesDeal) {
  const won = sortAndDedupePipelineStages(stagesDeal).filter((s) => !!s?.is_won && !s?.is_lost);
  if (!won.length) return null;
  if (won.length === 1) return won[0];
  return won.reduce((best, s) => (stageOrderIndex(s) > stageOrderIndex(best) ? s : best));
}

/** order_index của cột Thắng (`is_won`) — null nếu pipeline chưa đánh dấu cột Thắng. */
export function resolveDealWonAnchorOrderIndex(stagesDeal) {
  const st = resolveDealWonAnchorStage(stagesDeal);
  return st ? stageOrderIndex(st) : null;
}

/**
 * Tách cột Deal pipeline:
 * - Tab Deal: tới hết cột Thắng (`is_won`) + cột Thua
 * - Tab Khách hàng: cột Thắng + các cột sau Thắng (SX, VC, Hoàn thành…)
 * Deal ở cột Thắng hiển thị trên cả hai tab.
 */
export function splitDealStagesForCrmTabs(stagesDeal) {
  const sorted = sortAndDedupePipelineStages(stagesDeal);
  const wonStage = resolveDealWonAnchorStage(sorted);
  const wonAnchorOrder = wonStage ? stageOrderIndex(wonStage) : null;
  const wonStageId = wonStage ? String(wonStage.id) : null;

  if (wonAnchorOrder == null) {
    return { dealTabStages: sorted, customerTabStages: [], postWonStages: [], wonAnchorOrder: null, wonStage: null };
  }

  const dealTabStages = [];
  const customerTabStages = [];
  const postWonStages = [];

  for (const s of sorted) {
    const sid = String(s.id);
    const order = stageOrderIndex(s);
    if (s.is_lost) {
      dealTabStages.push(s);
      continue;
    }
    if (sid === wonStageId || order === wonAnchorOrder) {
      dealTabStages.push(s);
      customerTabStages.push(s);
      continue;
    }
    if (order < wonAnchorOrder) {
      dealTabStages.push(s);
    } else {
      postWonStages.push(s);
      customerTabStages.push(s);
    }
  }

  return { dealTabStages, customerTabStages, postWonStages, wonAnchorOrder, wonStage };
}

/** Cột dùng cho KPI / Dự kiến tab Deal — trước Thắng + Thua; không gồm cột Thắng. */
export function preWonStagesForDealStats(dealTabStages, wonStage, wonAnchorOrder) {
  const wonId = wonStage?.id ? String(wonStage.id) : null;
  return (dealTabStages || []).filter((s) => {
    if (s.is_lost) return true;
    if (wonAnchorOrder == null) return !s.is_won;
    if (wonId && String(s.id) === wonId) return false;
    return stageOrderIndex(s) < wonAnchorOrder;
  });
}

/**
 * Deal tính vào thống kê tab Deal — trước cột Thắng (+ Thua); loại deal đang ở Thắng / sau Thắng.
 */
export function filterDealsForDealTabStats(deals, { wonAnchorOrder, stagesDeal }) {
  const stageById = new Map((stagesDeal || []).map((s) => [String(s.id), s]));
  const stagesByPipeline = groupStagesByPipeline(stagesDeal);
  const multiPipeline = stagesByPipeline.size > 1;
  const out = [];
  for (const d of deals || []) {
    const st = d?.stage_id ? stageById.get(String(d.stage_id)) : null;
    if (!st) {
      out.push(d);
      continue;
    }
    if (st.is_lost) {
      out.push(d);
      continue;
    }
    const anchorOrder = multiPipeline
      ? wonAnchorForPipelineStages(resolveStagesForDeal(d, stagesDeal, stagesByPipeline)).wonAnchorOrder
      : wonAnchorOrder;
    if (anchorOrder == null) {
      if (!st.is_won) out.push(d);
      continue;
    }
    if (stageOrderIndex(st) < anchorOrder) out.push(d);
  }
  return out;
}

/** Cột Thắng trên tab Deal — hiển thị thẻ nhưng không cộng Dự kiến/KV tổng bán hàng. */
export function isDealTabWonColumnForMetrics(stage, pipelineType, wonStage) {
  if (pipelineType !== 'deal' || !wonStage || !stage) return false;
  return String(stage.id) === String(wonStage.id);
}

export function partitionDealsForCrmTabs(deals, { wonAnchorOrder, stagesDeal }) {
  const dealTabDeals = [];
  const customerTabDeals = [];
  const stageById = new Map((stagesDeal || []).map((s) => [String(s.id), s]));
  const stagesByPipeline = groupStagesByPipeline(stagesDeal);
  const multiPipeline = stagesByPipeline.size > 1;

  if (!multiPipeline && wonAnchorOrder == null) {
    return { dealTabDeals: [...(deals || [])], customerTabDeals: [] };
  }

  for (const d of deals || []) {
    const sid = String(d?.stage_id || '');
    const st = sid ? stageById.get(sid) : null;
    if (!st) {
      dealTabDeals.push(d);
      continue;
    }
    if (st.is_lost) {
      dealTabDeals.push(d);
      continue;
    }
    const anchorOrder = multiPipeline
      ? wonAnchorForPipelineStages(resolveStagesForDeal(d, stagesDeal, stagesByPipeline)).wonAnchorOrder
      : wonAnchorOrder;
    if (anchorOrder == null) {
      dealTabDeals.push(d);
      continue;
    }
    const order = stageOrderIndex(st);
    if (order <= anchorOrder) dealTabDeals.push(d);
    if (order >= anchorOrder) customerTabDeals.push(d);
  }
  return { dealTabDeals, customerTabDeals };
}

export function resolveCrmPipelineStagesForTab(pipelineType, {
  stagesLead,
  dealTabStages,
  customerTabStages,
  stagesDeal,
  dealKhSplitEnabled = true,
}) {
  if (pipelineType === 'lead') return stagesLead || [];
  if (pipelineType === 'customer') return customerTabStages || [];
  if (pipelineType === 'deal' && !dealKhSplitEnabled) return stagesDeal || [];
  if (pipelineType === 'deal') return dealTabStages || [];
  return stagesDeal || [];
}

/** Cột đích cho nút «Chuyển cột nhanh» — tab Deal gồm cả cột tab KH (khi tách). */
export function resolveQuickMoveStagesForTab(pipelineType, {
  stagesLead,
  dealTabStages,
  customerTabStages,
  postWonStages,
  stagesDeal,
  dealKhSplitEnabled = true,
}) {
  if (pipelineType === 'lead') return stagesLead || [];
  if (pipelineType === 'customer') return customerTabStages || [];
  if (pipelineType === 'deal' && !dealKhSplitEnabled) return sortAndDedupePipelineStages(stagesDeal);
  if (pipelineType === 'deal') {
    const seen = new Set();
    const out = [];
    for (const s of [...(dealTabStages || []), ...(postWonStages || [])]) {
      const id = String(s?.id || '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(s);
    }
    if (out.length) return out;
    return sortAndDedupePipelineStages(stagesDeal);
  }
  return sortAndDedupePipelineStages(stagesDeal);
}

export const CRM_DEAL_KH_SPLIT_LS_KEY = 'crm_deal_kh_split';

/** Mặc định: admin tách Deal/KH; user thường gộp một pipeline Deal. */
export function readDefaultDealKhSplitEnabled(isAdmin) {
  return !!isAdmin;
}

export function readStoredDealKhSplitPreference(isAdmin) {
  try {
    const v = localStorage.getItem(CRM_DEAL_KH_SPLIT_LS_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    /* ignore */
  }
  return readDefaultDealKhSplitEnabled(isAdmin);
}

export function storeDealKhSplitPreference(enabled) {
  try {
    localStorage.setItem(CRM_DEAL_KH_SPLIT_LS_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}
