/**
 * KPI doanh thu / thanh toán dashboard Sản xuất theo cột production_pipeline_stages (frontend).
 */

import { effectivePipelineStageSlaDays } from './crmPipelineSla';

const INTAKE_BUCKET = 'won_pending';
const VC_SHIPPED_STATUSES = new Set(['shipping', 'installing', 'warranty', 'completed']);

/** Giá trị dự án dùng cho KPI / tổng cột — ưu tiên production_value, fallback estimated_value. */
export function resolveSxProjectValue(project) {
  const pv = Number(project?.production_value);
  if (Number.isFinite(pv) && pv > 0) return pv;
  const ev = Number(project?.estimated_value);
  if (Number.isFinite(ev) && ev > 0) return ev;
  return 0;
}

export function resolveSxProjectDeposit(project) {
  const pd = Number(project?.deposit_amount);
  if (Number.isFinite(pd) && pd > 0) return pd;
  const dd = Number(project?.deal_deposit_amount);
  if (Number.isFinite(dd) && dd > 0) return dd;
  return 0;
}

export function resolveSxProjectRemaining(project) {
  return Math.max(0, resolveSxProjectValue(project) - resolveSxProjectDeposit(project));
}
export const VC_KANBAN_STATUSES = new Set(['shipping', 'installing', 'warranty']);

function stageById(stages, colId) {
  if (!colId || !Array.isArray(stages)) return null;
  return stages.find((s) => String(s.id) === String(colId)) || null;
}

export function pickSxWonStageIds(stages) {
  const list = (stages || []).filter((s) => s.bucket_slug !== INTAKE_BUCKET);
  const explicit = list.filter((s) => !!s.counts_as_won_revenue);
  if (explicit.length) return explicit.map((s) => String(s.id));
  const sorted = [...list].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  const first = sorted[0];
  return first ? [String(first.id)] : [];
}

export function pickSxCompletedStageIds(stages) {
  const list = (stages || []).filter((s) => s.bucket_slug !== INTAKE_BUCKET);
  const explicit = list.filter((s) => !!s.counts_as_completed_revenue);
  if (explicit.length) return explicit.map((s) => String(s.id));
  return [];
}

export function pickSxCollectedStageIds(stages) {
  const list = (stages || []).filter((s) => s.bucket_slug !== INTAKE_BUCKET);
  return list.filter((s) => !!s.counts_as_collected_revenue).map((s) => String(s.id));
}

function projectInSxColumn(project, stageIds) {
  const colId = String(project?.sx_kanban_column_id || '');
  if (!colId || !stageIds.length) return false;
  return stageIds.includes(colId);
}

export function projectCountsAsSxWonRevenue(project, stages) {
  return projectInSxColumn(project, pickSxWonStageIds(stages));
}

export function projectCountsAsSxCompletedRevenue(project, stages) {
  const completedIds = pickSxCompletedStageIds(stages);
  if (completedIds.length) return projectInSxColumn(project, completedIds);
  return String(project?.status || '') === 'completed';
}

export function projectCountsAsSxCollectedRevenue(project, stages) {
  return projectInSxColumn(project, pickSxCollectedStageIds(stages));
}

export function projectCountsAsSxDebt(project, stages) {
  return projectCountsAsSxCompletedRevenue(project, stages)
    && !projectCountsAsSxCollectedRevenue(project, stages);
}

export function projectIsShipped(project) {
  return VC_SHIPPED_STATUSES.has(String(project?.status || ''))
    || Boolean(project?.logistics_company_id || project?.logistics_company?.id);
}

export function projectIsAwaitingDelivery(project, stages) {
  if (projectIsShipped(project)) return false;
  const col = stageById(stages, project?.sx_kanban_column_id);
  return Boolean(col?.is_handover_to_logistics);
}

export function projectIsProducing(project, stages) {
  if (project.sx_intake) return false;
  if (projectIsShipped(project)) return false;
  if (projectIsAwaitingDelivery(project, stages)) return false;
  if (projectCountsAsSxCompletedRevenue(project, stages)) return false;
  if (projectCountsAsSxCollectedRevenue(project, stages)) return false;
  const col = stageById(stages, project?.sx_kanban_column_id);
  if (col?.bucket_slug === INTAKE_BUCKET) return false;
  return true;
}

export function resolveSxProjectProbability(project, stage, dealProbability) {
  const rawDeal = dealProbability ?? project?.deal_probability;
  if (rawDeal != null && rawDeal !== '') {
    const n = Number(rawDeal);
    if (Number.isFinite(n)) return Math.max(0, Math.min(100, Math.round(n)));
  }
  const fb = stage?.default_probability;
  if (fb != null && fb !== '') {
    const n = Number(fb);
    if (Number.isFinite(n)) return Math.max(0, Math.min(100, Math.round(n)));
  }
  return null;
}

export function computeSxRevenueKpis(projects, stages) {
  const list = Array.isArray(projects) ? projects : [];
  const st = Array.isArray(stages) ? stages : [];
  let wonRevenue = 0;
  let completedRevenue = 0;
  let collectedRevenue = 0;
  let debtRevenue = 0;
  let weightedPipeline = 0;
  let producing = 0;
  let awaitingDelivery = 0;
  let shipped = 0;
  let overdue = 0;
  let debtCount = 0;
  let collectedCount = 0;
  const now = new Date();

  for (const p of list) {
    const val = resolveSxProjectValue(p);
    const col = stageById(st, p.sx_kanban_column_id);
    if (projectCountsAsSxWonRevenue(p, st)) wonRevenue += val;
    if (projectCountsAsSxCompletedRevenue(p, st)) completedRevenue += val;
    if (projectCountsAsSxCollectedRevenue(p, st)) {
      collectedRevenue += val;
      collectedCount += 1;
    }
    if (projectCountsAsSxDebt(p, st)) {
      debtRevenue += resolveSxProjectRemaining(p);
      debtCount += 1;
    }
    if (projectIsProducing(p, st)) producing += 1;
    if (projectIsAwaitingDelivery(p, st)) awaitingDelivery += 1;
    if (projectIsShipped(p)) shipped += 1;
    if (p.deadline && new Date(p.deadline) < now && p.status !== 'completed') overdue += 1;
    if (col && col.bucket_slug !== INTAKE_BUCKET && val > 0) {
      const prob = resolveSxProjectProbability(p, col);
      if (prob != null) weightedPipeline += val * (prob / 100);
    }
  }

  return {
    wonRevenue,
    completedRevenue,
    collectedRevenue,
    debtRevenue,
    weightedPipeline: Math.round(weightedPipeline),
    producing,
    awaitingDelivery,
    shipped,
    overdue,
    debtCount,
    collectedCount,
  };
}

/** SLA cột pipeline SX — null nếu không áp dụng. */
export function getSxPipelineStageSlaTone(stageEnteredAt, stage) {
  if (!stageEnteredAt || !stage) return null;
  if (stage.bucket_slug === INTAKE_BUCKET) return null;
  const slaDays = effectivePipelineStageSlaDays(stage.sla_days);
  if (slaDays == null) return null;
  const deadlineTs = new Date(stageEnteredAt).getTime() + slaDays * 86400000;
  const remainingMs = deadlineTs - Date.now();
  if (remainingMs < 0) return { level: 'overdue', remainingMs, deadlineTs };
  if (remainingMs <= 24 * 3600000) return { level: 'soon', remainingMs, deadlineTs };
  if (remainingMs <= 3 * 24 * 3600000) return { level: 'warn', remainingMs, deadlineTs };
  return { level: 'ok', remainingMs, deadlineTs };
}

export function isSxColumnSlaOverdue(project) {
  const tone = getSxPipelineStageSlaTone(
    project?.sx_pipeline_stage_entered_at,
    project?.sx_pipeline_stage,
  );
  return tone?.level === 'overdue';
}

/** Chọn cột «Bàn giao VC» theo phân loại — khớp logic BE workshopKanban. */
export function resolveSxHandoverColumnId(stages, project, preferredColId = null) {
  const sorted = Array.isArray(stages) ? stages : [];
  const stageIds = new Set(sorted.map((s) => String(s.id)));
  if (preferredColId && stageIds.has(String(preferredColId))) {
    return preferredColId;
  }
  const wktId = project?.workshop_type_id || project?.workshop_type?.id || null;
  const handoverCols = sorted.filter((s) => s.is_handover_to_logistics === true);
  if (!handoverCols.length) return null;
  if (wktId) {
    const typed = handoverCols.find((s) => String(s.workshop_type_id || '') === String(wktId));
    if (typed) return typed.id;
  }
  const globalHo = handoverCols.find((s) => !s.workshop_type_id);
  if (globalHo) return globalHo.id;
  return handoverCols[0].id;
}

export function buildSxPipelineStageMeta(col) {
  if (!col) return null;
  return {
    id: col.id,
    name: col.name,
    color: col.color,
    icon: col.icon,
    sla_days: col.sla_days,
    default_probability: col.default_probability,
    counts_as_won_revenue: col.counts_as_won_revenue,
    counts_as_completed_revenue: col.counts_as_completed_revenue,
    counts_as_collected_revenue: col.counts_as_collected_revenue,
    requires_deadline: col.requires_deadline,
    bucket_slug: col.bucket_slug,
    is_handover_to_logistics: col.is_handover_to_logistics,
  };
}
