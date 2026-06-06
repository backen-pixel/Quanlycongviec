/**
 * KPI doanh thu dashboard Sản xuất theo cột production_pipeline_stages (frontend).
 */

import { effectivePipelineStageSlaDays } from './crmPipelineSla';

const INTAKE_BUCKET = 'won_pending';

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
  let weightedPipeline = 0;
  for (const p of list) {
    const val = Number(p.estimated_value) || 0;
    const col = stageById(st, p.sx_kanban_column_id);
    if (projectCountsAsSxWonRevenue(p, st)) wonRevenue += val;
    if (projectCountsAsSxCompletedRevenue(p, st)) completedRevenue += val;
    if (col && col.bucket_slug !== INTAKE_BUCKET && val > 0) {
      const prob = resolveSxProjectProbability(p, col);
      if (prob != null) weightedPipeline += val * (prob / 100);
    }
  }
  return { wonRevenue, completedRevenue, weightedPipeline: Math.round(weightedPipeline) };
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
