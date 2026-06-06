/**
 * KPI doanh thu dashboard Sản xuất theo cột production_pipeline_stages.
 */

const INTAKE_BUCKET = 'won_pending';

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
  let weightedPipeline = 0;
  for (const p of list) {
    const val = Number(p.estimated_value) || 0;
    const col = stageById(st, p.sx_kanban_column_id);
    if (projectCountsAsSxWonRevenue(p, st)) wonRevenue += val;
    if (projectCountsAsSxCompletedRevenue(p, st)) completedRevenue += val;
    if (col && col.bucket_slug !== INTAKE_BUCKET && val > 0) {
      const prob = resolveSxProjectProbability(p, col, dealProbByProjectId[String(p.id)]);
      if (prob != null) weightedPipeline += val * (prob / 100);
    }
  }
  return {
    won_revenue_value: wonRevenue,
    completed_revenue_value: completedRevenue,
    weighted_pipeline_value: Math.round(weightedPipeline),
    has_explicit_won_revenue: hasExplicitSxWonRevenueStage(st),
    has_explicit_completed_revenue: hasExplicitSxCompletedRevenueStage(st),
  };
}

module.exports = {
  INTAKE_BUCKET,
  pickSxWonStageIds,
  pickSxCompletedStageIds,
  projectCountsAsSxWonRevenue,
  projectCountsAsSxCompletedRevenue,
  resolveSxProjectProbability,
  computeSxRevenueKpis,
};
