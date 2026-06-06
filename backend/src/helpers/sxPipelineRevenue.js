/**
 * KPI doanh thu / thanh toán dashboard Sản xuất theo cột production_pipeline_stages.
 */

const INTAKE_BUCKET = 'won_pending';
const VC_SHIPPED_STATUSES = new Set(['shipping', 'installing', 'warranty', 'completed']);

function stageById(stages, colId) {
  if (!colId || !Array.isArray(stages)) return null;
  return stages.find((s) => String(s.id) === String(colId)) || null;
}

function hasExplicitSxWonRevenueStage(stages) {
  return (stages || []).some((s) => s.bucket_slug !== INTAKE_BUCKET && !!s.counts_as_won_revenue);
}

function hasExplicitSxCompletedRevenueStage(stages) {
  return (stages || []).some((s) => s.bucket_slug !== INTAKE_BUCKET && !!s.counts_as_completed_revenue);
}

function hasExplicitSxCollectedRevenueStage(stages) {
  return (stages || []).some((s) => s.bucket_slug !== INTAKE_BUCKET && !!s.counts_as_collected_revenue);
}

/** Fallback: cột đầu tiên sau intake (order_index) nếu chưa tick won. */
function pickSxWonStageIds(stages) {
  const list = (stages || []).filter((s) => s.bucket_slug !== INTAKE_BUCKET);
  const explicit = list.filter((s) => !!s.counts_as_won_revenue);
  if (explicit.length) return explicit.map((s) => String(s.id));
  const sorted = [...list].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  const first = sorted[0];
  return first ? [String(first.id)] : [];
}

function pickSxCompletedStageIds(stages) {
  const list = (stages || []).filter((s) => s.bucket_slug !== INTAKE_BUCKET);
  const explicit = list.filter((s) => !!s.counts_as_completed_revenue);
  if (explicit.length) return explicit.map((s) => String(s.id));
  return [];
}

function pickSxCollectedStageIds(stages) {
  const list = (stages || []).filter((s) => s.bucket_slug !== INTAKE_BUCKET);
  return list.filter((s) => !!s.counts_as_collected_revenue).map((s) => String(s.id));
}

function projectInSxColumn(project, stageIds) {
  const colId = String(project?.sx_kanban_column_id || '');
  if (!colId || !stageIds.length) return false;
  return stageIds.includes(colId);
}

function projectCountsAsSxWonRevenue(project, stages) {
  const wonIds = pickSxWonStageIds(stages);
  return projectInSxColumn(project, wonIds);
}

function projectCountsAsSxCompletedRevenue(project, stages) {
  const completedIds = pickSxCompletedStageIds(stages);
  if (completedIds.length) return projectInSxColumn(project, completedIds);
  return String(project?.status || '') === 'completed';
}

function projectCountsAsSxCollectedRevenue(project, stages) {
  return projectInSxColumn(project, pickSxCollectedStageIds(stages));
}

/** Công nợ: đã công (cột tick) nhưng chưa thu tiền. */
function projectCountsAsSxDebt(project, stages) {
  return projectCountsAsSxCompletedRevenue(project, stages)
    && !projectCountsAsSxCollectedRevenue(project, stages);
}

function projectIsShipped(project) {
  return VC_SHIPPED_STATUSES.has(String(project?.status || ''))
    || Boolean(project?.logistics_company_id || project?.logistics_company?.id);
}

function projectIsAwaitingDelivery(project, stages) {
  if (projectIsShipped(project)) return false;
  const col = stageById(stages, project?.sx_kanban_column_id);
  return Boolean(col?.is_handover_to_logistics);
}

function projectIsProducing(project, stages) {
  if (project.sx_intake) return false;
  if (projectIsShipped(project)) return false;
  if (projectIsAwaitingDelivery(project, stages)) return false;
  if (projectCountsAsSxCompletedRevenue(project, stages)) return false;
  if (projectCountsAsSxCollectedRevenue(project, stages)) return false;
  const col = stageById(stages, project?.sx_kanban_column_id);
  if (col?.bucket_slug === INTAKE_BUCKET) return false;
  return true;
}

function resolveSxProjectProbability(project, stage, dealProbability) {
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

function computeSxRevenueKpis(projects, stages, dealProbByProjectId = {}) {
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
  const now = new Date();

  for (const p of list) {
    const val = Number(p.estimated_value) || 0;
    const col = stageById(st, p.sx_kanban_column_id);
    if (projectCountsAsSxWonRevenue(p, st)) wonRevenue += val;
    if (projectCountsAsSxCompletedRevenue(p, st)) completedRevenue += val;
    if (projectCountsAsSxCollectedRevenue(p, st)) collectedRevenue += val;
    if (projectCountsAsSxDebt(p, st)) debtRevenue += val;
    if (projectIsProducing(p, st)) producing += 1;
    if (projectIsAwaitingDelivery(p, st)) awaitingDelivery += 1;
    if (projectIsShipped(p)) shipped += 1;
    if (p.deadline && new Date(p.deadline) < now && p.status !== 'completed') overdue += 1;
    if (col && col.bucket_slug !== INTAKE_BUCKET && val > 0) {
      const prob = resolveSxProjectProbability(p, col, dealProbByProjectId[String(p.id)]);
      if (prob != null) weightedPipeline += val * (prob / 100);
    }
  }

  return {
    won_revenue_value: wonRevenue,
    completed_revenue_value: completedRevenue,
    collected_revenue_value: collectedRevenue,
    debt_revenue_value: debtRevenue,
    weighted_pipeline_value: Math.round(weightedPipeline),
    producing,
    awaiting_delivery: awaitingDelivery,
    shipped,
    overdue,
    has_explicit_won_revenue: hasExplicitSxWonRevenueStage(st),
    has_explicit_completed_revenue: hasExplicitSxCompletedRevenueStage(st),
    has_explicit_collected_revenue: hasExplicitSxCollectedRevenueStage(st),
  };
}

module.exports = {
  INTAKE_BUCKET,
  VC_SHIPPED_STATUSES,
  pickSxWonStageIds,
  pickSxCompletedStageIds,
  pickSxCollectedStageIds,
  projectCountsAsSxWonRevenue,
  projectCountsAsSxCompletedRevenue,
  projectCountsAsSxCollectedRevenue,
  projectCountsAsSxDebt,
  projectIsProducing,
  projectIsAwaitingDelivery,
  projectIsShipped,
  resolveSxProjectProbability,
  computeSxRevenueKpis,
};
