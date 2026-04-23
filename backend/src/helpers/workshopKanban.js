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
  // Lấy deals đang ở stage "Thắng" (is_won=true)
  const { data: wonStages } = await supabase
    .from('crm_pipeline_stages')
    .select('id')
    .eq('is_won', true)
    .eq('is_active', true)
    .or('pipeline_type.eq.deal,pipeline_type.is.null');
  const wonStageIds = (wonStages || []).map((s) => s.id).filter(Boolean);

  // Lấy deals có project (đã thắng trước đây — actual_close_date IS NOT NULL)
  // OR đang ở stage is_won=true. Dùng union để không bỏ sót deals đã chuyển
  // sang cột "Sản xuất"/"Vận chuyển" nhưng project vẫn đang trong xưởng.
  const queries = [];
  if (wonStageIds.length) {
    queries.push(
      supabase
        .from('crm_leads')
        .select('project_id')
        .eq('type', 'deal')
        .not('project_id', 'is', null)
        .in('stage_id', wonStageIds),
    );
  }
  // Deals đã từng thắng (có actual_close_date) và được gắn project
  queries.push(
    supabase
      .from('crm_leads')
      .select('project_id')
      .eq('type', 'deal')
      .not('project_id', 'is', null)
      .not('actual_close_date', 'is', null),
  );

  const results = await Promise.all(queries);
  const out = new Set();
  for (const { data } of results) {
    for (const l of data || []) {
      if (l.project_id) out.add(l.project_id);
    }
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
 * Tìm ID stage "Sản xuất" trong CRM deal pipeline (pipeline_type='deal', is_won=false, is_lost=false, name chứa 'Sản xuất').
 * Trả về UUID hoặc null nếu chưa có.
 */
async function getCrmSanXuatStageId() {
  const { data } = await supabase
    .from('crm_pipeline_stages')
    .select('id')
    .eq('pipeline_type', 'deal')
    .eq('is_won', false)
    .eq('is_lost', false)
    .eq('is_active', true)
    .ilike('name', '%Sản xuất%')
    .limit(1)
    .maybeSingle();
  return data?.id || null;
}

/**
 * Tìm ID stage "Thắng" trong CRM deal pipeline (is_won=true).
 */
async function getCrmThangStageId() {
  const { data } = await supabase
    .from('crm_pipeline_stages')
    .select('id')
    .eq('pipeline_type', 'deal')
    .eq('is_won', true)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  return data?.id || null;
}

/**
 * Cập nhật crm_leads.sx_pipeline_stage_id cho mọi deal gắn project_id.
 * Đồng thời cập nhật stage_id CRM:
 *   - Project rời "Chờ vào xưởng" (có current_stage_id thực) → stage_id = "Sản xuất"
 *   - Project quay về intake (current_stage_id = null) → stage_id = "Thắng"
 */
async function syncCrmLeadSxPipelineFromProject(projectId) {
  const { data: project } = await supabase
    .from('projects')
    .select('id, current_stage_id, status')
    .eq('id', projectId)
    .single();
  if (!project) return;

  const stageUuid = await resolveSxPipelineStageUuidForProject(project);

  // Lấy tập hợp workflow_stage_id được cấu hình trong production_pipeline_stages
  // (tức là các cột thực — không tính cột intake bucket_slug='won_pending')
  const { data: prodPipeRows } = await supabase
    .from('production_pipeline_stages')
    .select('workflow_stage_id')
    .not('workflow_stage_id', 'is', null)
    .eq('is_active', true);
  const prodWorkflowStageIds = new Set(
    (prodPipeRows || []).map((r) => r.workflow_stage_id).filter(Boolean).map(String),
  );

  // Chỉ coi là "đang sản xuất thực" khi current_stage_id trỏ đến một giai đoạn
  // được cấu hình trong production_pipeline_stages. Nếu project vẫn đang ở
  // giai đoạn tư vấn/thiết kế/báo giá, deal phải giữ nguyên ở "Thắng".
  const isInRealProductionStage =
    !!project.current_stage_id &&
    prodWorkflowStageIds.has(String(project.current_stage_id));

  const [sanXuatStageId, thangStageId] = await Promise.all([
    getCrmSanXuatStageId(),
    getCrmThangStageId(),
  ]);

  const { data: leads } = await supabase
    .from('crm_leads')
    .select('id, stage_id')
    .eq('project_id', projectId)
    .eq('type', 'deal');

  for (const lead of leads || []) {
    const update = { sx_pipeline_stage_id: stageUuid };

    // Cập nhật CRM stage_id khi deal đang ở "Thắng" hoặc "Sản xuất"
    const isOnWonOrSx =
      (thangStageId && lead.stage_id === thangStageId) ||
      (sanXuatStageId && lead.stage_id === sanXuatStageId);

    if (isOnWonOrSx) {
      if (isInRealProductionStage && sanXuatStageId) {
        // Project đang sản xuất → chuyển deal sang cột "Sản xuất"
        update.stage_id = sanXuatStageId;
      } else if (!isInRealProductionStage && thangStageId) {
        // Project quay về intake → giữ/trả lại cột "Thắng"
        update.stage_id = thangStageId;
      }
    }

    await supabase.from('crm_leads').update(update).eq('id', lead.id);
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
  getCrmSanXuatStageId,
  getCrmThangStageId,
};
