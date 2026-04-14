const { supabase } = require('../config/supabase');

const WORKSHOP_STAGE_SLUGS = ['production', 'delivery', 'customer-care'];
/** Khớp enum project_status trong DB (không có 'delivering' — dùng shipping/installing). */
const WORKSHOP_STATUSES = ['producing', 'shipping', 'installing', 'warranty', 'completed'];
const INTAKE_BUCKET = 'won_pending';

async function getWorkshopStageMap() {
  const { data: stages = [] } = await supabase
    .from('workflow_stages')
    .select('id, slug, name, color, icon')
    .in('slug', WORKSHOP_STAGE_SLUGS)
    .order('order_index');

  const bySlug = {};
  stages.forEach((stage) => { bySlug[stage.slug] = stage; });
  return { stages, bySlug, ids: stages.map((stage) => stage.id).filter(Boolean) };
}

async function getWonDealProjectIds() {
  const { data: wonStages } = await supabase
    .from('crm_pipeline_stages')
    .select('id')
    .eq('is_won', true)
    .eq('is_active', true)
    .or('pipeline_type.eq.deal,pipeline_type.is.null');
  const wonStageIds = (wonStages || []).map((s) => s.id).filter(Boolean);
  if (!wonStageIds.length) return [];

  const { data: leads } = await supabase
    .from('crm_leads')
    .select('project_id')
    .eq('type', 'deal')
    .not('project_id', 'is', null)
    .in('stage_id', wonStageIds);

  const out = new Set();
  for (const l of leads || []) {
    if (l.project_id) out.add(l.project_id);
  }
  return [...out];
}

function buildScopeOrFilter(stageIds, wonIds) {
  const parts = [];
  if (stageIds.length) parts.push(`current_stage_id.in.(${stageIds.join(',')})`);
  parts.push(`status.in.(${WORKSHOP_STATUSES.join(',')})`);
  if (wonIds.length) parts.push(`id.in.(${wonIds.join(',')})`);
  return parts.join(',');
}

async function loadProductionPipelineStagesRows(includeInactive = false) {
  let q = supabase
    .from('production_pipeline_stages')
    .select(`
      id, name, color, icon, order_index, is_active, workflow_stage_id, bucket_slug,
      workflow_stage:workflow_stages(id, slug, name, color, icon)
    `)
    .order('order_index');
  if (!includeInactive) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) {
    console.warn('[workshopKanban] production_pipeline_stages:', error.message);
    return null;
  }
  return data || [];
}

async function getResolvedKanbanStages() {
  const rows = await loadProductionPipelineStagesRows(false);
  const { stages: ws, bySlug, ids: workshopIds } = await getWorkshopStageMap();

  if (!rows?.length) {
    const fallback = [
      {
        id: '__fb_intake__',
        name: 'Chờ vào xưởng (deal thắng)',
        color: '#64748b',
        icon: '⏳',
        order_index: 0,
        bucket_slug: INTAKE_BUCKET,
        workflow_stage_id: null,
        workflow_stage: null,
        is_active: true,
        _fallback: true,
      },
      ...ws.map((s, i) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        icon: s.icon,
        order_index: i + 1,
        bucket_slug: null,
        workflow_stage_id: s.id,
        workflow_stage: s,
        is_active: true,
        _fallback: true,
      })),
    ];
    return { stages: fallback, fromDb: false, workshopIds };
  }

  const active = rows.filter((r) => r.is_active).sort((a, b) => a.order_index - b.order_index);
  return { stages: active, fromDb: true, workshopIds };
}

function kanbanColumnIdForProject(project, sortedStages, wonIdSet) {
  const cid = project.current_stage_id;
  for (const col of sortedStages) {
    const wid = col.workflow_stage_id || col.workflow_stage?.id;
    if (wid && cid && String(wid) === String(cid)) return col.id;
  }
  const intake = sortedStages.find((s) => s.bucket_slug === INTAKE_BUCKET);
  if (intake && wonIdSet.has(project.id)) return intake.id;
  return null;
}

function enrichProjectsForSx(projects, sortedStages, wonIds) {
  const wonSet = new Set(wonIds);
  return (projects || []).map((project) => {
    const colId = kanbanColumnIdForProject(project, sortedStages, wonSet);
    const intakeCol = sortedStages.find((s) => s.bucket_slug === INTAKE_BUCKET);
    const inIntake = intakeCol && colId === intakeCol.id;
    return {
      ...project,
      sx_won_deal: wonSet.has(project.id),
      sx_kanban_column_id: colId,
      sx_intake: Boolean(inIntake),
    };
  });
}

function buildPipelineSummary(sortedStages, enhancedProjects) {
  return sortedStages.map((col) => ({
    id: col.id,
    name: col.name,
    color: col.color,
    icon: col.icon,
    order_index: col.order_index,
    bucket_slug: col.bucket_slug || null,
    workflow_stage_id: col.workflow_stage_id || col.workflow_stage?.id || null,
    slug: col.workflow_stage?.slug || col.bucket_slug || null,
    count: enhancedProjects.filter((p) => p.sx_kanban_column_id === col.id).length,
    total_value: enhancedProjects
      .filter((p) => p.sx_kanban_column_id === col.id)
      .reduce((sum, p) => sum + (Number(p.estimated_value) || 0), 0),
  }));
}

/** UUID hàng production_pipeline_stages (cột chờ), hoặc null */
async function getDbIntakeStageId() {
  const { data } = await supabase
    .from('production_pipeline_stages')
    .select('id')
    .eq('bucket_slug', INTAKE_BUCKET)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  return data?.id || null;
}

/**
 * Map id cột Kanban (có thể là __fb_intake__) → UUID lưu DB trên crm_leads.
 */
async function resolveSxPipelineStageUuidForProject(project) {
  const wonIds = await getWonDealProjectIds();
  const wonSet = new Set(wonIds);
  const { stages: kanbanStages } = await getResolvedKanbanStages();
  const sortedKanban = [...kanbanStages].sort((a, b) => a.order_index - b.order_index);
  const colId = kanbanColumnIdForProject(project, sortedKanban, wonSet);
  if (!colId) return null;
  const s = String(colId);
  if (s.startsWith('__fb_')) {
    return getDbIntakeStageId();
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    return s;
  }
  return null;
}

/**
 * Cập nhật crm_leads.sx_pipeline_stage_id cho mọi deal gắn project_id.
 */
async function syncCrmLeadSxPipelineFromProject(projectId) {
  const { data: project } = await supabase
    .from('projects')
    .select('id, current_stage_id, status')
    .eq('id', projectId)
    .single();
  if (!project) return;
  const stageUuid = await resolveSxPipelineStageUuidForProject(project);
  const { data: leads } = await supabase
    .from('crm_leads')
    .select('id')
    .eq('project_id', projectId)
    .eq('type', 'deal');
  for (const lead of leads || []) {
    await supabase.from('crm_leads').update({ sx_pipeline_stage_id: stageUuid }).eq('id', lead.id);
  }
}

module.exports = {
  WORKSHOP_STAGE_SLUGS,
  WORKSHOP_STATUSES,
  INTAKE_BUCKET,
  getWorkshopStageMap,
  getWonDealProjectIds,
  buildScopeOrFilter,
  loadProductionPipelineStagesRows,
  getResolvedKanbanStages,
  kanbanColumnIdForProject,
  enrichProjectsForSx,
  buildPipelineSummary,
  getDbIntakeStageId,
  resolveSxPipelineStageUuidForProject,
  syncCrmLeadSxPipelineFromProject,
};
