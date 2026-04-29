const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/newPermission');
const { effectiveWorkshopCompanyId, normalizeWorkshopCompanyId } = require('../helpers/workshopCompanyScope');
const {
  WORKSHOP_STAGE_SLUGS,
  WORKSHOP_STATUSES,
  INTAKE_BUCKET,
  getWorkshopStageMap,
  getWonDealProjectIds,
  buildScopeOrFilter,
  loadProductionPipelineStagesRows,
  getResolvedKanbanStages,
  enrichProjectsForSx,
  buildPipelineSummary,
  syncCrmLeadSxPipelineFromProject,
  syncVcPipelineStageToLead,
  getCrmVcDeliveryStageId,
  emitCrmBadgeUpdateForProject,
} = require('../helpers/workshopKanban');
const { applyWorkshopTemplateToProject } = require('../helpers/workshopApplyTemplates');
const { notifyMultiple: notifyMultipleShared, createNotification: createNotif } = require('../helpers/notifications');
const {
  buildPipelineStageSelect,
  isHandoverMissingError,
  isCrmTargetStageMissingError,
  isCrmTargetStageEmbedRelationshipError,
  markHandoverColumnMissing,
  markCrmTargetStageColumnMissing,
  markCrmTargetStageJoinMissing,
  stripHandoverFields,
} = require('../helpers/productionPipelineSchema');
const { leadDocVisibleForModuleAndUser } = require('../helpers/documentShareScope');

const r = Router();
r.use(auth);

/** Tắt toàn bộ thông báo (DB + socket) phát ra từ module Sản xuất (/api/production). */
const DISABLE_PRODUCTION_PUSH_NOTIFICATIONS = true;

/** Cột VC intake theo công ty dự án (có fallback pipeline global). */
async function resolveLogisticsVcIntakeColumnId(companyId) {
  const cid = normalizeWorkshopCompanyId(companyId);
  try {
    if (cid) {
      const r1 = await supabase
        .from('logistics_pipeline_stages')
        .select('id')
        .eq('bucket_slug', 'delivery_pending')
        .eq('is_active', true)
        .eq('company_id', cid)
        .order('order_index')
        .limit(1)
        .maybeSingle();
      if (r1.data?.id) return r1.data.id;
    }
    const r2 = await supabase
      .from('logistics_pipeline_stages')
      .select('id')
      .eq('bucket_slug', 'delivery_pending')
      .eq('is_active', true)
      .is('company_id', null)
      .order('order_index')
      .limit(1)
      .maybeSingle();
    if (r2.data?.id) return r2.data.id;
    const { data: vcFirst } = await supabase
      .from('logistics_pipeline_stages')
      .select('id')
      .eq('is_active', true)
      .order('order_index')
      .limit(1)
      .maybeSingle();
    return vcFirst?.id || null;
  } catch (_e) {
    return null;
  }
}

/** Cột SX theo workflow_stage_id, ưu tiên pipeline của công ty dự án. */
async function findSxPipelineStageRowForWorkflow(workflowStageId, projectCompanyId) {
  const pcid = normalizeWorkshopCompanyId(projectCompanyId);
  const pick = async (companyScope) => {
    let q = supabase
      .from('production_pipeline_stages')
      .select('id, is_handover_to_logistics, name')
      .eq('workflow_stage_id', workflowStageId)
      .eq('is_active', true);
    if (companyScope === 'company') q = q.eq('company_id', pcid);
    if (companyScope === 'global') q = q.is('company_id', null);
    let { data, error } = await q.limit(1).maybeSingle();
    if (error && isHandoverMissingError(error)) {
      markHandoverColumnMissing();
      let q2 = supabase
        .from('production_pipeline_stages')
        .select('id, name')
        .eq('workflow_stage_id', workflowStageId)
        .eq('is_active', true);
      if (companyScope === 'company') q2 = q2.eq('company_id', pcid);
      if (companyScope === 'global') q2 = q2.is('company_id', null);
      ({ data, error } = await q2.limit(1).maybeSingle());
      if (data) data = { ...data, is_handover_to_logistics: false };
    }
    if (error || !data) return null;
    return data;
  };
  try {
    if (pcid) {
      const scoped = await pick('company');
      if (scoped) return scoped;
    }
    return await pick('global');
  } catch (_e) {
    return null;
  }
}

function calcTaskProgress(tasks) {
  if (!tasks?.length) return 0;
  return Math.round((tasks.filter((task) => task.status === 'done').length / tasks.length) * 100);
}

/** Chỉ hiện tài liệu ở module Xưởng khi bật cờ chia sẻ rõ ràng (hoặc từ khóa đồng bộ cũ). Không dùng allowed_departments/companies — đó là phân quyền nội bộ CRM, không phải chia sẻ xưởng. */
function isDocSharedToWorkshop(doc) {
  if (doc?.shared_to_workshop === true) return true;
  const notes = `${doc?.notes || ''} ${doc?.name || ''}`.toLowerCase();
  return Boolean(
    doc?.shared_to_production ||
    doc?.allow_workshop_view ||
    doc?.allow_production_view ||
    doc?.is_shared ||
    doc?.is_public ||
    notes.includes('cho phép chia sẻ') ||
    notes.includes('cho phep chia se') ||
    notes.includes('chia sẻ xưởng') ||
    notes.includes('chia se xuong')
  );
}

const ALLOWED_WORKFLOW_STAGE_CACHE_MS = 45_000;
let _allowedWorkflowStageIdsCache = null;
let _allowedWorkflowStageIdsCacheKey = '';
let _allowedWorkflowStageIdsAt = 0;

function invalidateAllowedWorkflowStageIdsCache() {
  _allowedWorkflowStageIdsCache = null;
  _allowedWorkflowStageIdsCacheKey = '';
  _allowedWorkflowStageIdsAt = 0;
}

async function allowedWorkflowStageIdsForPatch(companyId = null) {
  const cacheKey = String(companyId || '__global__');
  const now = Date.now();
  if (
    _allowedWorkflowStageIdsCache
    && _allowedWorkflowStageIdsCacheKey === cacheKey
    && now - _allowedWorkflowStageIdsAt < ALLOWED_WORKFLOW_STAGE_CACHE_MS
  ) {
    return _allowedWorkflowStageIdsCache;
  }
  const ids = new Set();
  const [pipeRows, { ids: workshop }] = await Promise.all([
    loadProductionPipelineStagesRows(true, companyId),
    getWorkshopStageMap(),
  ]);
  (pipeRows || []).forEach((r) => {
    if (r.workflow_stage_id) ids.add(String(r.workflow_stage_id));
  });
  workshop.forEach((wid) => ids.add(String(wid)));
  _allowedWorkflowStageIdsCache = ids;
  _allowedWorkflowStageIdsCacheKey = cacheKey;
  _allowedWorkflowStageIdsAt = now;
  return ids;
}

// ─── GET /production/pipeline-stages ──
r.get('/pipeline-stages', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const includeInactive = req.query.all === 'true';
    const company_id = effectiveWorkshopCompanyId(req, req.query.company_id);
    const rows = await loadProductionPipelineStagesRows(includeInactive, company_id);
    if (rows === null) {
      const { stages } = await getResolvedKanbanStages(company_id);
      return res.json(stages);
    }
    res.json(rows || []);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.post('/pipeline-stages', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const b = req.body;
    if (!b.name?.trim()) return res.status(400).json({ error: 'Thiếu tên cột' });
    const insertCompanyId = effectiveWorkshopCompanyId(req, b.company_id);
    if (b.bucket_slug && b.bucket_slug !== INTAKE_BUCKET) {
      return res.status(400).json({ error: 'bucket_slug không hợp lệ' });
    }
    const scopedStages = await loadProductionPipelineStagesRows(true, insertCompanyId);
    if (b.bucket_slug === INTAKE_BUCKET) {
      const hasIntake = (scopedStages || []).some((r) => r.bucket_slug === INTAKE_BUCKET);
      if (hasIntake) return res.status(400).json({ error: 'Đã có cột chờ vào xưởng trong phạm vi công ty này' });
    }
    const nextOrder = (scopedStages || []).reduce((m, r) => Math.max(m, Number(r.order_index) || 0), 0) + 1;
    const isIntake = b.bucket_slug === INTAKE_BUCKET;
    const insertPayload = {
      name: b.name.trim(),
      color: b.color || '#0f766e',
      icon: b.icon || '📋',
      order_index: b.order_index ?? nextOrder,
      is_active: b.is_active !== false,
      workflow_stage_id: isIntake ? null : (b.workflow_stage_id || null),
      bucket_slug: b.bucket_slug || null,
      is_handover_to_logistics: isIntake ? false : (b.is_handover_to_logistics || false),
      crm_sync_type: isIntake ? null : (b.crm_sync_type || null),
      crm_target_stage_id: isIntake ? null : (b.crm_target_stage_id || null),
      company_id: insertCompanyId || null,
    };

    let ins = stripHandoverFields({ ...insertPayload });
    let { data, error } = await supabase
      .from('production_pipeline_stages')
      .insert(ins)
      .select(buildPipelineStageSelect())
      .single();
    if (error && isHandoverMissingError(error)) {
      markHandoverColumnMissing();
      ins = stripHandoverFields({ ...insertPayload });
      const r2 = await supabase
        .from('production_pipeline_stages')
        .insert(ins)
        .select(buildPipelineStageSelect())
        .single();
      data = r2.data;
      error = r2.error;
    }
    if (error && isCrmTargetStageEmbedRelationshipError(error)) {
      markCrmTargetStageJoinMissing();
      const rJ = await supabase
        .from('production_pipeline_stages')
        .insert(ins)
        .select(buildPipelineStageSelect())
        .single();
      data = rJ.data;
      error = rJ.error;
    }
    if (error && isCrmTargetStageMissingError(error)) {
      markCrmTargetStageColumnMissing();
      ins = stripHandoverFields({ ...insertPayload });
      const r2b = await supabase
        .from('production_pipeline_stages')
        .insert(ins)
        .select(buildPipelineStageSelect())
        .single();
      data = r2b.data;
      error = r2b.error;
    }
    // Nếu crm_sync_type chưa tồn tại trong DB → thử lại không có field đó
    if (error && error.message?.includes('crm_sync_type')) {
      const { crm_sync_type: _omit, ...insWithout } = ins;
      const r3 = await supabase
        .from('production_pipeline_stages')
        .insert(insWithout)
        .select(buildPipelineStageSelect())
        .single();
      data = r3.data;
      error = r3.error;
    }
    if (error && isCrmTargetStageEmbedRelationshipError(error)) {
      markCrmTargetStageJoinMissing();
      const rF = await supabase
        .from('production_pipeline_stages')
        .insert(ins)
        .select(buildPipelineStageSelect())
        .single();
      data = rF.data;
      error = rF.error;
    }
    if (error) throw error;
    invalidateAllowedWorkflowStageIdsCache();
    res.status(201).json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.put('/pipeline-stages/:id', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const b = req.body;
    const { data: existingRow } = await supabase
      .from('production_pipeline_stages')
      .select('bucket_slug')
      .eq('id', req.params.id)
      .single();
    const update = {};
    ['name', 'color', 'icon', 'order_index', 'is_active', 'workflow_stage_id', 'bucket_slug',
      'is_handover_to_logistics', 'crm_sync_type', 'crm_target_stage_id'].forEach((f) => {
      if (b[f] !== undefined) update[f] = b[f];
    });
    if (existingRow?.bucket_slug === INTAKE_BUCKET) {
      update.workflow_stage_id = null;
      update.is_handover_to_logistics = false;
      update.crm_sync_type = null;
      update.crm_target_stage_id = null;
    }
    if (update.bucket_slug && update.bucket_slug !== INTAKE_BUCKET) {
      return res.status(400).json({ error: 'bucket_slug không hợp lệ' });
    }
    let u = stripHandoverFields({ ...update });
    let { data, error } = await supabase
      .from('production_pipeline_stages')
      .update(u)
      .eq('id', req.params.id)
      .select(buildPipelineStageSelect())
      .single();
    if (error && isHandoverMissingError(error)) {
      markHandoverColumnMissing();
      u = stripHandoverFields({ ...update });
      const r2 = await supabase
        .from('production_pipeline_stages')
        .update(u)
        .eq('id', req.params.id)
        .select(buildPipelineStageSelect())
        .single();
      data = r2.data;
      error = r2.error;
    }
    if (error && isCrmTargetStageEmbedRelationshipError(error)) {
      markCrmTargetStageJoinMissing();
      const rJ = await supabase
        .from('production_pipeline_stages')
        .update(u)
        .eq('id', req.params.id)
        .select(buildPipelineStageSelect())
        .single();
      data = rJ.data;
      error = rJ.error;
    }
    if (error && isCrmTargetStageMissingError(error)) {
      markCrmTargetStageColumnMissing();
      u = stripHandoverFields({ ...update });
      const r2b = await supabase
        .from('production_pipeline_stages')
        .update(u)
        .eq('id', req.params.id)
        .select(buildPipelineStageSelect())
        .single();
      data = r2b.data;
      error = r2b.error;
    }
    // Nếu crm_sync_type chưa tồn tại trong DB → thử lại không có field đó
    if (error && error.message?.includes('crm_sync_type')) {
      const { crm_sync_type: _omit, ...uWithout } = u;
      const r3 = await supabase
        .from('production_pipeline_stages')
        .update(uWithout)
        .eq('id', req.params.id)
        .select(buildPipelineStageSelect())
        .single();
      data = r3.data;
      error = r3.error;
    }
    if (error && isCrmTargetStageEmbedRelationshipError(error)) {
      markCrmTargetStageJoinMissing();
      const rF = await supabase
        .from('production_pipeline_stages')
        .update(u)
        .eq('id', req.params.id)
        .select(buildPipelineStageSelect())
        .single();
      data = rF.data;
      error = rF.error;
    }
    if (error) throw error;
    invalidateAllowedWorkflowStageIdsCache();
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.delete('/pipeline-stages/:id', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { data: row } = await supabase
      .from('production_pipeline_stages')
      .select('bucket_slug')
      .eq('id', req.params.id)
      .single();
    if (row?.bucket_slug === INTAKE_BUCKET) {
      return res.status(400).json({ error: 'Không xóa cột deal thắng — chỉ có thể ẩn' });
    }
    await supabase.from('production_pipeline_stages').delete().eq('id', req.params.id);
    invalidateAllowedWorkflowStageIdsCache();
    res.json({ message: 'Đã xóa' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.put('/pipeline-stages-reorder', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { stages } = req.body;
    for (const s of stages || []) {
      await supabase.from('production_pipeline_stages').update({ order_index: s.order_index }).eq('id', s.id);
    }
    invalidateAllowedWorkflowStageIdsCache();
    res.json({ message: 'Đã sắp xếp lại' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

/** Thêm cột mẫu pipeline SX đầy đủ (bản vẽ → vật tư → CNC → lắp ráp → sơn → QC → đóng gói → bàn giao VC nếu chưa có cột handover) — idempotent */
r.post('/pipeline-stages/seed-samples', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { ensureSampleProductionPipelineStages } = require('../helpers/productionPipelineSampleStages');
    const company_id = effectiveWorkshopCompanyId(req, req.body?.company_id);
    const out = await ensureSampleProductionPipelineStages(supabase, company_id);
    invalidateAllowedWorkflowStageIdsCache();
    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /production/dashboard ──
r.get('/dashboard', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const { division_id, company_id: companyIdQuery, workshop_type_id } = req.query;
    const company_id = effectiveWorkshopCompanyId(req, companyIdQuery);
    const { ids: stageIds } = await getWorkshopStageMap();
    const wonIds = await getWonDealProjectIds();
    const { stages: kanbanStages } = await getResolvedKanbanStages(company_id);
    const sortedKanban = [...kanbanStages].sort((a, b) => a.order_index - b.order_index);

    const orFilter = buildScopeOrFilter(stageIds, wonIds);
    let query = supabase
      .from('projects')
      .select(`
        id, code, name, estimated_value, status, deadline, created_at, company_id,
        current_stage_id,
        current_stage:workflow_stages(id, slug, name, color, icon),
        customer:customers(id, full_name),
        company:companies(id, name, short_name),
        workshop_type:workshop_project_types(id, name, applies_to),
        tasks(id, status)
      `)
      .or(orFilter);

    if (division_id) query = query.eq('division_id', division_id);
    if (company_id) query = query.eq('company_id', company_id);
    if (workshop_type_id) query = query.eq('workshop_type_id', workshop_type_id);

    const { data: projects = [] } = await query.order('created_at', { ascending: false });

    const enriched = await enrichProjectsForSx(projects, wonIds, company_id);
    const enhancedProjects = enriched.map((project) => ({
      ...project,
      progress: calcTaskProgress(project.tasks),
      task_total: project.tasks?.length || 0,
      done_tasks: project.tasks?.filter((t) => t.status === 'done').length || 0,
    }));

    const overdueCount = enhancedProjects.filter((project) => (
      project.deadline && new Date(project.deadline) < new Date() && project.status !== 'completed'
    )).length;

    const intakeCount = enhancedProjects.filter((p) => p.sx_intake).length;

    const kpis = {
      total_projects: enhancedProjects.length,
      producing: enhancedProjects.filter((project) => project.current_stage?.slug === 'production' || project.status === 'producing').length,
      delivering: enhancedProjects.filter((project) => project.current_stage?.slug === 'delivery' || project.status === 'shipping' || project.status === 'installing').length,
      customer_care: enhancedProjects.filter((project) => project.current_stage?.slug === 'customer-care' || project.status === 'warranty').length,
      completed: enhancedProjects.filter((project) => project.status === 'completed').length,
      overdue: overdueCount,
      intake_pending: intakeCount,
      total_value: enhancedProjects.reduce((sum, project) => sum + (project.estimated_value || 0), 0),
      avg_progress: enhancedProjects.length
        ? Math.round(enhancedProjects.reduce((sum, project) => sum + (project.progress || 0), 0) / enhancedProjects.length)
        : 0,
    };

    const pipeline = buildPipelineSummary(sortedKanban, enhancedProjects);

    res.json({
      kpis,
      pipeline,
      projects: enhancedProjects,
      won_deal_project_ids: wonIds,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /production/projects ──
r.get('/projects', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const {
      search, priority, page = 1, limit = 100, division_id, company_id: companyIdQuery, stage_slug, sx_intake, workshop_type_id,
    } = req.query;
    const company_id = effectiveWorkshopCompanyId(req, companyIdQuery);
    const parsedPage = Math.max(parseInt(page) || 1, 1);
    const parsedLimit = Math.min(Math.max(parseInt(limit) || 100, 1), 500);
    const offset = (parsedPage - 1) * parsedLimit;
    const { ids: stageIds } = await getWorkshopStageMap();
    const wonIds = await getWonDealProjectIds();
    const { stages: kanbanStages } = await getResolvedKanbanStages(company_id);
    const sortedKanban = [...kanbanStages].sort((a, b) => a.order_index - b.order_index);

    let query = supabase
      .from('projects')
      .select(`
        id, code, name, estimated_value, priority, deadline, created_at, status, notes, company_id,
        production_deadline, production_note, vc_kanban_column_id,
        current_stage_id,
        current_stage:workflow_stages(id, slug, name, color, icon),
        vc_stage:logistics_pipeline_stages(id, name, color, icon, bucket_slug),
        customer:customers(id, full_name, phone),
        company:companies(id, name, short_name),
        production_person:users!projects_production_person_id_fkey(id, full_name, avatar),
        sales_person:users!projects_sales_person_id_fkey(id, full_name),
        supervisor:users!projects_supervisor_id_fkey(id, full_name),
        workshop_type:workshop_project_types(id, name, applies_to),
        tasks(id, status)
      `, { count: 'exact' });

    if (String(sx_intake) === '1') {
      if (!wonIds.length) {
        return res.json({ projects: [], total: 0, page: parsedPage, totalPages: 0 });
      }
      query = query.in('id', wonIds);
      if (stageIds.length) {
        query = query.or(`current_stage_id.is.null,current_stage_id.not.in.(${stageIds.join(',')})`);
      }
    } else {
      query = query.or(buildScopeOrFilter(stageIds, wonIds));
    }

    if (division_id) query = query.eq('division_id', division_id);
    if (company_id) query = query.eq('company_id', company_id);
    if (workshop_type_id) query = query.eq('workshop_type_id', workshop_type_id);

    if (search) {
      const searchPattern = `%${search}%`;
      query = query.or(`code.ilike.${searchPattern},name.ilike.${searchPattern},notes.ilike.${searchPattern}`);
    }

    if (priority) query = query.eq('priority', priority);
    if (stage_slug && String(sx_intake) !== '1') {
      if (stage_slug === INTAKE_BUCKET) {
        query = query.in('id', wonIds);
        if (stageIds.length) {
          query = query.or(`current_stage_id.is.null,current_stage_id.not.in.(${stageIds.join(',')})`);
        }
      } else {
        query = query.eq('current_stage.slug', stage_slug);
      }
    }

    query = query.order('deadline', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + parsedLimit - 1);

    let { data: projects, error, count } = await query;
    const needsFallback = error && (
      error.message?.includes('production_deadline') ||
      error.message?.includes('vc_kanban_column_id') ||
      error.message?.includes('logistics_pipeline_stages') ||
      error.message?.includes('workshop_project_types') ||
      error.message?.includes('workshop_type_id') ||
      error.message?.includes('relationship')
    );
    if (needsFallback) {
      // Migration not yet applied or FK not ready — retry without new columns
      let fallbackQuery = supabase
        .from('projects')
        .select(`
          id, code, name, estimated_value, priority, deadline, created_at, status, notes,
          production_deadline, production_note, workshop_type_id,
          current_stage_id,
          current_stage:workflow_stages(id, slug, name, color, icon),
          customer:customers(id, full_name, phone),
          company:companies(id, name, short_name),
          production_person:users!projects_production_person_id_fkey(id, full_name, avatar),
          sales_person:users!projects_sales_person_id_fkey(id, full_name),
          supervisor:users!projects_supervisor_id_fkey(id, full_name),
          tasks(id, status)
        `, { count: 'exact' });
      if (String(sx_intake) === '1') {
        if (!wonIds.length) return res.json({ projects: [], total: 0, page: parsedPage, totalPages: 0 });
        fallbackQuery = fallbackQuery.in('id', wonIds);
        if (stageIds.length) fallbackQuery = fallbackQuery.or(`current_stage_id.is.null,current_stage_id.not.in.(${stageIds.join(',')})`);
      } else {
        fallbackQuery = fallbackQuery.or(buildScopeOrFilter(stageIds, wonIds));
      }
      if (search) fallbackQuery = fallbackQuery.or(`code.ilike.%${search}%,name.ilike.%${search}%`);
      if (priority) fallbackQuery = fallbackQuery.eq('priority', priority);
      if (division_id) fallbackQuery = fallbackQuery.eq('division_id', division_id);
      if (company_id) fallbackQuery = fallbackQuery.eq('company_id', company_id);
      if (workshop_type_id) fallbackQuery = fallbackQuery.eq('workshop_type_id', workshop_type_id);
      fallbackQuery = fallbackQuery.order('deadline', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false }).range(offset, offset + parsedLimit - 1);
      ({ data: projects, error, count } = await fallbackQuery);
    }
    if (error) throw error;

    const enrichedSx = await enrichProjectsForSx(projects, wonIds, company_id);
    const enhanced = enrichedSx.map((project) => ({
      ...project,
      progress: calcTaskProgress(project.tasks),
      task_total: project.tasks?.length || 0,
      done_tasks: project.tasks?.filter((task) => task.status === 'done').length || 0,
      is_overdue: Boolean(project.deadline && new Date(project.deadline) < new Date() && project.status !== 'completed'),
      is_production_overdue: Boolean(project.production_deadline && new Date(project.production_deadline) < new Date() && project.status !== 'completed'),
    }));

    res.json({
      projects: enhanced,
      total: count || enhanced.length,
      page: parsedPage,
      totalPages: Math.ceil((count || enhanced.length) / parsedLimit),
      won_deal_project_ids: wonIds,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /production/projects/:id ──
/** Columns added in migration 76 — included here, falls back gracefully if migration not yet applied */
const MIGRATION_76_COLS = 'production_deadline, production_note,';

const PROJECT_DETAIL_SELECT = `
        id, company_id, code, name, description, estimated_value, priority, deadline, ${MIGRATION_76_COLS} status, notes, created_at,
        current_stage_id,
        current_stage:workflow_stages(id, slug, name, color, icon),
        customer:customers(id, full_name, phone, email, address, city),
        company:companies(id, name, short_name),
        sales_person:users!projects_sales_person_id_fkey(id, full_name, avatar, email),
        project_manager:users!projects_project_manager_id_fkey(id, full_name, avatar, email),
        supervisor:users!projects_supervisor_id_fkey(id, full_name, avatar, email),
        production_person:users!projects_production_person_id_fkey(id, full_name, avatar),
        shipping_person:users!projects_shipping_person_id_fkey(id, full_name, avatar),
        installation_person:users!projects_installation_person_id_fkey(id, full_name, avatar),
        care_person:users!projects_care_person_id_fkey(id, full_name, avatar),
        tasks(
          id, title, description, status, order_index, priority, deadline, due_date, metadata,
          assignee:users!tasks_assignee_id_fkey(id, full_name, avatar),
          stage:workflow_stages(id, slug, name, color),
          task_participants(id, role, user_id),
          checklists:task_checklists(id, title, is_completed, order_index)
        ),
        stage_transitions(
          id, from_stage_id, to_stage_id, created_at,
          from_stage:workflow_stages!stage_transitions_from_stage_id_fkey(id, name, slug),
          to_stage:workflow_stages!stage_transitions_to_stage_id_fkey(id, name, slug),
          user:users(id, full_name)
        )
      `;

r.get('/projects/:id', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const { id } = req.params;
    const { bySlug } = await getWorkshopStageMap();
    const wonIds = await getWonDealProjectIds();
    const wonSet = new Set(wonIds);

    let projectId = id;
    let { data: project, error } = await supabase
      .from('projects')
      .select(PROJECT_DETAIL_SELECT)
      .eq('id', projectId)
      .single();

    // Migration 76 not yet applied — retry without new columns
    if (error && error.message?.includes('production_deadline')) {
      const fallbackSelect = PROJECT_DETAIL_SELECT.replace(MIGRATION_76_COLS, '');
      ({ data: project, error } = await supabase.from('projects').select(fallbackSelect).eq('id', projectId).single());
    }

    if (error || !project) {
      const { data: bareProject } = await supabase.from('projects').select('id').eq('id', projectId).maybeSingle();
      if (bareProject && error) {
        console.error('[production] PROJECT_DETAIL_SELECT failed:', error?.message || error);
        return res.status(500).json({
          error: 'Lỗi tải chi tiết dự án',
          details: error?.message || String(error),
          project_id: projectId,
        });
      }

      const { data: leadRow, error: leadErr } = await supabase
        .from('crm_leads')
        .select('project_id, title, type, stage_id')
        .eq('id', id)
        .maybeSingle();
      if (leadErr) {
        console.warn('[production] crm_leads by id:', leadErr.message);
      }

      if (leadRow && !leadRow.project_id) {
        return res.status(404).json({
          error: 'Project not found',
          reason: 'deal_without_project',
          hint: 'Uuid trùng với một bản ghi CRM nhưng chưa có project_id. Chuyển deal sang Thắng (tự tạo dự án) hoặc tạo dự án từ deal, rồi mở /sx/projects/{project_id} — project_id xem ở API chi tiết deal hoặc DB.',
          crm_lead_id: id,
          title: leadRow.title || null,
          lead_type: leadRow.type || null,
        });
      }

      if (leadRow?.project_id) {
        projectId = leadRow.project_id;
        const { data: minProj } = await supabase.from('projects').select('id').eq('id', projectId).maybeSingle();
        if (!minProj) {
          return res.status(404).json({
            error: 'Project not found',
            reason: 'broken_project_link',
            hint: 'CRM có project_id nhưng không còn dự án trong bảng projects (có thể đã xóa). Cập nhật hoặc tạo lại dự án cho deal.',
            project_id: leadRow.project_id,
          });
        }
        ({ data: project, error } = await supabase
          .from('projects')
          .select(PROJECT_DETAIL_SELECT)
          .eq('id', projectId)
          .single());
        if (error && error.message?.includes('production_deadline')) {
          const fallbackSelect = PROJECT_DETAIL_SELECT.replace(MIGRATION_76_COLS, '');
          ({ data: project, error } = await supabase.from('projects').select(fallbackSelect).eq('id', projectId).single());
        }
      }
    }

    if (error || !project) {
      return res.status(404).json({
        error: 'Project not found',
        reason: 'unknown_id',
        hint: 'Không có dự án với id này, và không có crm_leads trùng id. Copy đúng projects.id từ danh sách dự án hoặc từ deal.project_id sau khi đã liên kết.',
      });
    }

    const inSxScope = wonSet.has(project.id);

    const { ids: workshopIds } = await getWorkshopStageMap();
    const inWorkshopStage = project.current_stage_id && workshopIds.includes(project.current_stage_id);
    const inWorkshopStatus = WORKSHOP_STATUSES.includes(project.status);
    if (!inSxScope && !inWorkshopStage && !inWorkshopStatus) {
      return res.status(403).json({ error: 'Dự án không thuộc phạm vi sản xuất / deal thắng' });
    }

    const [documentsRes, commentsRes, incidentsRes] = await Promise.all([
      supabase
        .from('lead_documents')
        .select('*, creator:users!lead_documents_created_by_fkey(id, full_name)')
        .eq('project_id', project.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('project_comments')
        .select('id, content, attachments, created_at, user:users(id, full_name, avatar)')
        .eq('project_id', project.id)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('project_incidents')
        .select(`id, title, severity, status, created_at, reporter:users!project_incidents_reported_by_fkey(id, full_name)`)
        .eq('project_id', project.id)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const documents = documentsRes.data || [];
    const sharedDocuments = documents.filter(
      (d) => isDocSharedToWorkshop(d) && leadDocVisibleForModuleAndUser(d, 'production', req.user),
    );
    const hiddenDocuments = documents.filter((doc) => !isDocSharedToWorkshop(doc));

    let crmSummary = [];
    try {
      const { data: crmRows, error: crmErr } = await supabase
        .from('crm_leads')
        .select(`
          id, code, title, type, estimated_value, status, lost_reason, created_at,
          assignee:users!crm_leads_assigned_to_fkey(id, full_name, avatar),
          lead_owner:users!crm_leads_lead_owner_id_fkey(id, full_name, avatar),
          sx_pipeline_stage:production_pipeline_stages(id, name, color, icon, bucket_slug)
        `)
        .eq('project_id', project.id)
        .order('created_at', { ascending: false });
      if (crmErr) throw crmErr;
      crmSummary = crmRows || [];
    } catch (e) {
      console.warn('[production] crmDeals embed fallback:', e.message);
      const { data: crmRows } = await supabase
        .from('crm_leads')
        .select('id, code, title, type, estimated_value, status, lost_reason, created_at')
        .eq('project_id', project.id)
        .order('created_at', { ascending: false });
      crmSummary = crmRows || [];
    }

    const leadIds = (crmSummary || []).map((d) => d.id).filter(Boolean);
    let crmSharedNotes = [];
    if (leadIds.length) {
      try {
        const { data: acts, error: actErr } = await supabase
          .from('crm_activities')
          .select(`
            id, lead_id, type, title, description, activity_date, created_at, shared_to_workshop,
            creator:users!crm_activities_created_by_fkey(id, full_name)
          `)
          .in('lead_id', leadIds)
          .eq('shared_to_workshop', true)
          .order('created_at', { ascending: false })
          .limit(80);
        if (actErr) throw actErr;
        crmSharedNotes = acts || [];
      } catch (e) {
        console.warn('[production] crmSharedNotes skip:', e.message);
        crmSharedNotes = [];
      }
    }

    const taskProgress = calcTaskProgress(project.tasks);
    const prodSlugs = new Set(['production']);
    const logSlugs = new Set(['delivery', 'shipping', 'installing', 'installation']);
    const productionTasks = (project.tasks || []).filter((t) => prodSlugs.has(t.stage?.slug));
    const logisticsTasks = (project.tasks || []).filter((t) => logSlugs.has(t.stage?.slug));
    const productionTaskProgress = calcTaskProgress(productionTasks);
    const logisticsTaskProgress = calcTaskProgress(logisticsTasks);
    const tasksByStage = {};
    (project.tasks || []).forEach((task) => {
      const stageKey = task.stage?.slug || 'unassigned';
      if (!tasksByStage[stageKey]) tasksByStage[stageKey] = [];
      tasksByStage[stageKey].push(task);
    });

    const workshopPipeline = WORKSHOP_STAGE_SLUGS.map((slug) => bySlug[slug]).filter(Boolean);
    const pcid = project.company_id || project.company?.id || null;
    const { stages: kStages } = await getResolvedKanbanStages(pcid ? String(pcid) : null);
    const sortedK = [...kStages].sort((a, b) => a.order_index - b.order_index);
    const [sxRow] = await enrichProjectsForSx([project], wonIds, pcid ? String(pcid) : null);

    res.json({
      project: {
        ...project,
        sx_won_deal: sxRow.sx_won_deal,
        sx_kanban_column_id: sxRow.sx_kanban_column_id,
        sx_intake: sxRow.sx_intake,
        taskProgress,
        productionTaskProgress,
        logisticsTaskProgress,
        productionTaskCount: productionTasks.length,
        logisticsTaskCount: logisticsTasks.length,
        tasksByStage,
        documents,
        sharedDocuments,
        hiddenDocumentsCount: hiddenDocuments.length,
        crmDeals: crmSummary || [],
        crmSharedNotes,
        recentComments: commentsRes.data || [],
        incidents: incidentsRes.error ? [] : (incidentsRes.data || []),
        workshopPipeline,
        sxKanbanStages: sortedK.map((c) => ({
          id: c.id,
          name: c.name,
          color: c.color,
          icon: c.icon,
          bucket_slug: c.bucket_slug,
          workflow_stage_id: c.workflow_stage_id || c.workflow_stage?.id,
          slug: c.workflow_stage?.slug,
        })),
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── PATCH /production/projects/:id/stage ──
// Tối ưu: song song truy vấn validation, cache allowed stages; trả JSON ngay sau khi ghi DB,
// đồng bộ CRM / handover / thông báo / socket chạy nền (setImmediate) để giảm thời gian HTTP.
r.patch('/projects/:id/stage', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { id } = req.params;
    const { stage_id, move_to_intake } = req.body;
    const userId = req.user.userId;

    const { data: project } = await supabase
      .from('projects')
      .select('id, current_stage_id, code, name, status, company_id')
      .eq('id', id)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    /** Kéo về cột «Chờ vào xưởng» — không có workflow_stage_id trên cột intake */
    if (move_to_intake === true || move_to_intake === 'true') {
      const [wonIds, { ids: workshopIds }] = await Promise.all([
        getWonDealProjectIds(),
        getWorkshopStageMap(),
      ]);
      const wonSet = new Set(wonIds);
      if (!wonSet.has(id)) {
        return res.status(400).json({ error: 'Chỉ dự án deal thắng mới kéo về cột chờ xưởng' });
      }
      const wasOnWorkshop = !project.current_stage_id || workshopIds.includes(String(project.current_stage_id));

      const { error: updateError } = await supabase
        .from('projects')
        .update({ current_stage_id: null })
        .eq('id', id);

      if (updateError) throw updateError;

      try {
        await supabase.from('stage_transitions').insert({
          project_id: id,
          from_stage_id: project.current_stage_id,
          to_stage_id: null,
          notes: 'Kéo về cột chờ xưởng (Kanban)',
          transitioned_by: userId,
        });
      } catch (te) {
        console.warn('[production] stage_transitions intake:', te.message);
      }

      const { data: updated } = await supabase
        .from('projects')
        .select(`
          id, code, name, status, current_stage_id,
          current_stage:workflow_stages(id, slug, name, color)
        `)
        .eq('id', id)
        .single();

      res.json({ project: updated, moved_to_intake: true, was_on_workshop: wasOnWorkshop });

      const ioIntake = req.app.get('io');
      setImmediate(() => {
        void (async () => {
          try {
            await syncCrmLeadSxPipelineFromProject(id);
          } catch (syncErr) {
            console.warn('[production] syncCrmLeadSxPipelineFromProject (intake):', syncErr.message);
          }
          try {
            if (ioIntake) await emitCrmBadgeUpdateForProject(id, ioIntake);
          } catch (emitErr) {
            console.warn('[production] emitCrmBadgeUpdateForProject (intake):', emitErr.message);
          }
        })();
      });
      return;
    }

    if (!stage_id) {
      return res.status(400).json({ error: 'stage_id required' });
    }

    const [allowed, targetRes] = await Promise.all([
      allowedWorkflowStageIdsForPatch(project.company_id),
      supabase
        .from('workflow_stages')
        .select('id, slug')
        .eq('id', stage_id)
        .single(),
    ]);
    const { data: targetStage, error: targetStageErr } = targetRes;

    if (!allowed.has(String(stage_id))) {
      return res.status(400).json({ error: 'Giai đoạn không hợp lệ cho pipeline sản xuất' });
    }
    if (targetStageErr || !targetStage) {
      return res.status(400).json({ error: 'Giai đoạn workflow không tồn tại' });
    }

    const statusMap = {
      production: 'producing',
      delivery: 'shipping',
      'customer-care': 'warranty',
    };

    const updatePayload = { current_stage_id: stage_id };
    if (statusMap[targetStage.slug]) updatePayload.status = statusMap[targetStage.slug];

    const { error: updateError } = await supabase
      .from('projects')
      .update(updatePayload)
      .eq('id', id);

    if (updateError) throw updateError;

    await supabase.from('stage_transitions').insert({
      project_id: id,
      from_stage_id: project.current_stage_id,
      to_stage_id: stage_id,
      transitioned_by: userId,
    });

    const { data: updated } = await supabase
      .from('projects')
      .select(`
        id, code, name, status, current_stage_id, production_person_id,
        current_stage:workflow_stages(id, slug, name, color)
      `)
      .eq('id', id)
      .single();

    const io = req.app.get('io');
    if (io) io.emit('project:stage_changed', updated);

    res.json({ project: updated });
    const projectId = id;
    const toStageId = stage_id;
    const updatedSnapshot = updated;
    const reqRef = req;

    setImmediate(() => {
      void (async () => {
        try {
          await syncCrmLeadSxPipelineFromProject(projectId);
        } catch (syncErr) {
          console.warn('[production] syncCrmLeadSxPipelineFromProject:', syncErr.message);
        }

        // Kiểm tra cột SX có cờ is_handover_to_logistics → chuyển sang module VC
        try {
          const sxPipeStage = await findSxPipelineStageRowForWorkflow(toStageId, project.company_id);

          if (sxPipeStage?.is_handover_to_logistics) {
            let autoVcStageId = null;
            try {
              autoVcStageId = await resolveLogisticsVcIntakeColumnId(project.company_id);
              if (!autoVcStageId) {
                const { data: vcFirst } = await supabase
                  .from('logistics_pipeline_stages').select('id').eq('is_active', true).order('order_index').limit(1).maybeSingle();
                autoVcStageId = vcFirst?.id || null;
              }
            } catch (_e) { /* ignore */ }

            const autoUpd = { status: 'shipping' };
            if (autoVcStageId) autoUpd.vc_kanban_column_id = autoVcStageId;
            const { error: autoUpdErr } = await supabase.from('projects').update(autoUpd).eq('id', projectId);
            if (autoUpdErr && autoUpdErr.message?.includes('vc_kanban_column_id')) {
              await supabase.from('projects').update({ status: 'shipping' }).eq('id', projectId);
            }

            try {
              const vcDeliveryStageId = await getCrmVcDeliveryStageId();
              if (vcDeliveryStageId) {
                const { data: leads } = await supabase
                  .from('crm_leads')
                  .select('id')
                  .eq('project_id', projectId)
                  .eq('type', 'deal');
                await Promise.all(
                  (leads || []).map((lead) =>
                    supabase.from('crm_leads').update({ stage_id: vcDeliveryStageId, vc_pipeline_stage_id: autoVcStageId }).eq('id', lead.id),
                  ),
                );
              }
            } catch (crmErr) {
              console.warn('[production/handover] sync CRM VC delivery:', crmErr.message);
            }

            const { data: vcUsers } = await supabase
              .from('users')
              .select('id')
              .in('role', ['logistics', 'installer', 'manager'])
              .eq('is_active', true);
            const vcRecipients = (vcUsers || []).map((u) => u.id).filter((uid) => uid !== userId);
            if (!DISABLE_PRODUCTION_PUSH_NOTIFICATIONS && vcRecipients.length) {
              await notifyMultipleShared(
                reqRef,
                vcRecipients,
                'workshop_new_deal',
                `🚚 Vận chuyển: Deal mới từ Xưởng`,
                `Dự án ${updatedSnapshot.code || updatedSnapshot.name} đã hoàn thành sản xuất, chuyển sang Vận chuyển & Lắp đặt`,
                'project',
                projectId,
              );
            }
          }
        } catch (handoverErr) {
          console.warn('[production/stage] handover to logistics:', handoverErr.message);
        }

        try {
          const { data: workshopUsers } = await supabase
            .from('users')
            .select('id')
            .in('role', ['production', 'manager'])
            .eq('is_active', true);
          const recipientIds = (workshopUsers || [])
            .map((u) => u.id)
            .filter((uid) => uid !== userId);
          if (!DISABLE_PRODUCTION_PUSH_NOTIFICATIONS && recipientIds.length) {
            const stageName = updatedSnapshot.current_stage?.name || '';
            await notifyMultipleShared(
              reqRef,
              recipientIds,
              'workshop_new_deal',
              `🏭 Xưởng: ${stageName}`,
              `Dự án ${updatedSnapshot.code || updatedSnapshot.name} vừa chuyển sang giai đoạn "${stageName}"`,
              'project',
              projectId,
            );
          }
        } catch (notifErr) {
          console.warn('[production/stage] notify workshop staff:', notifErr.message);
        }

        // Emit sau sync + handover CRM để thẻ Kanban CRM luôn nhận đúng SX/VC (một lần, đủ dữ liệu)
        try {
          if (io) await emitCrmBadgeUpdateForProject(projectId, io);
        } catch (emitErr) {
          console.warn('[production/stage] emitCrmBadgeUpdateForProject:', emitErr.message);
        }
      })();
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── PATCH /production/projects/:id/handover-vc ───────────────────────────
// Bàn giao thủ công từ SX sang module Vận chuyển & Lắp đặt
r.patch('/projects/:id/handover-vc', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const { data: project } = await supabase
      .from('projects')
      .select('id, code, name, status, current_stage_id')
      .eq('id', id)
      .single();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // ── 0. Lấy SX pipeline stage hiện tại (trước khi clear current_stage_id) ──
    let sxHandoverPipelineStageId = null;
    try {
      if (project.current_stage_id) {
        const { data: sxPipeRow } = await supabase
          .from('production_pipeline_stages')
          .select('id')
          .eq('workflow_stage_id', project.current_stage_id)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        sxHandoverPipelineStageId = sxPipeRow?.id || null;
      }
    } catch (_e) { /* ignore */ }

    // ── 1. Lấy cột intake của VC pipeline ──────────────────────────────────
    let vcStageId = null;
    try {
      const { data: vcIntakeRow } = await supabase
        .from('logistics_pipeline_stages')
        .select('id, name')
        .eq('bucket_slug', 'delivery_pending')
        .eq('is_active', true)
        .order('order_index')
        .limit(1)
        .maybeSingle();
      if (!vcIntakeRow) {
        const { data: vcFirstRow } = await supabase
          .from('logistics_pipeline_stages')
          .select('id')
          .eq('is_active', true)
          .order('order_index')
          .limit(1)
          .maybeSingle();
        vcStageId = vcFirstRow?.id || null;
      } else {
        vcStageId = vcIntakeRow.id;
      }
    } catch (stageErr) {
      console.warn('[production/handover-vc] lookup VC intake stage:', stageErr.message);
    }

    // ── 2. Đổi status sang 'shipping', xoá current_stage_id, gán vc_kanban_column_id ──
    const projectUpdate = { status: 'shipping', current_stage_id: null };
    if (vcStageId) projectUpdate.vc_kanban_column_id = vcStageId;

    const { error: updateError } = await supabase
      .from('projects')
      .update(projectUpdate)
      .eq('id', id);
    if (updateError) {
      // Nếu vc_kanban_column_id column chưa tồn tại, thử lại không có nó
      if (updateError.message?.includes('vc_kanban_column_id')) {
        const { error: retryErr } = await supabase
          .from('projects')
          .update({ status: 'shipping', current_stage_id: null })
          .eq('id', id);
        if (retryErr) throw retryErr;
      } else {
        throw updateError;
      }
    }

    // Ghi stage_transition
    try {
      await supabase.from('stage_transitions').insert({
        project_id: id,
        from_stage_id: project.current_stage_id,
        to_stage_id: null,
        notes: 'Bàn giao sang module Vận chuyển & Lắp đặt (thủ công)',
        transitioned_by: userId,
      });
    } catch (te) { console.warn('[production/handover-vc] stage_transitions:', te.message); }

    // ── 3. Đồng bộ CRM deal: cột stage_id + sx_pipeline_stage_id + vc_pipeline_stage_id ──
    try {
      const vcDeliveryStageId = await getCrmVcDeliveryStageId();
      const { data: leads } = await supabase
        .from('crm_leads').select('id').eq('project_id', id).eq('type', 'deal');

      for (const lead of leads || []) {
        // Thử update đầy đủ kể cả vc/sx_pipeline_stage_id
        const fullUpd = {};
        if (vcStageId) fullUpd.vc_pipeline_stage_id = vcStageId;
        if (sxHandoverPipelineStageId) fullUpd.sx_pipeline_stage_id = sxHandoverPipelineStageId;
        if (vcDeliveryStageId) fullUpd.stage_id = vcDeliveryStageId;

        const { error: leadErr } = await supabase.from('crm_leads').update(fullUpd).eq('id', lead.id);

        if (leadErr) {
          // Nếu lỗi do column chưa tồn tại → chỉ cập nhật stage_id (cột CRM)
          const isColErr = leadErr.message?.includes('vc_pipeline_stage_id') || leadErr.message?.includes('sx_pipeline_stage_id');
          if (isColErr && vcDeliveryStageId) {
            const { error: simpleErr } = await supabase.from('crm_leads').update({ stage_id: vcDeliveryStageId }).eq('id', lead.id);
            if (simpleErr) console.warn('[production/handover-vc] simple CRM update:', simpleErr.message);
            else console.log(`[production/handover-vc] CRM deal ${lead.id} → stage_id=${vcDeliveryStageId} (columns not migrated yet)`);
          } else {
            console.warn('[production/handover-vc] CRM update lead', lead.id, ':', leadErr.message);
          }
        } else {
          console.log(`[production/handover-vc] CRM deal ${lead.id} synced → vcStage=${vcStageId}, crmCol=${vcDeliveryStageId || '(not configured)'}`);
        }
      }
    } catch (crmErr) {
      console.warn('[production/handover-vc] sync CRM:', crmErr.message);
    }

    // Thông báo nhân viên VC
    try {
      const { data: vcUsers } = await supabase
        .from('users').select('id').in('role', ['logistics', 'installer', 'manager']).eq('is_active', true);
      const vcRecipients = (vcUsers || []).map((u) => u.id).filter((uid) => uid !== userId);
      if (!DISABLE_PRODUCTION_PUSH_NOTIFICATIONS && vcRecipients.length) {
        await notifyMultipleShared(
          req, vcRecipients, 'workshop_new_deal',
          `🚚 Vận chuyển: Deal mới từ Xưởng`,
          `Dự án ${project.code || project.name} đã bàn giao sang Vận chuyển & Lắp đặt`,
          'project', id,
        );
      }
    } catch (notifErr) {
      console.warn('[production/handover-vc] notify VC:', notifErr.message);
    }

    const { data: updated } = await supabase
      .from('projects')
      .select('id, code, name, status, current_stage_id, current_stage:workflow_stages(id, slug, name)')
      .eq('id', id).single();

    const io = req.app.get('io');
    if (io) io.emit('project:stage_changed', updated);

    // Emit badge update cho CRM deals liên quan sau khi sync vc_pipeline_stage_id
    emitCrmBadgeUpdateForProject(id, io).catch(() => {});

    res.json({ project: updated, handed_over: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ═══ WORKSHOP TASK TEMPLATES (bộ mẫu SX / VC–LĐ) ═══

r.get('/task-templates', requirePermission('projects', 'view'), async (req, res) => {
  try {
    let q = supabase
      .from('workshop_task_templates')
      .select('*, items:workshop_task_template_items(*)')
      .order('order_index');
    if (req.query.workshop_area && ['production', 'logistics'].includes(req.query.workshop_area)) {
      q = q.eq('workshop_area', req.query.workshop_area);
    }
    if (req.query.active_only !== 'false') {
      q = q.eq('is_active', true);
    }
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data || []).map((t) => ({
      ...t,
      items: [...(t.items || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0)),
    }));
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.post('/task-templates', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { name, workshop_area, description, order_index } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ error: 'Thiếu tên bộ mẫu' });
    }
    if (!['production', 'logistics'].includes(workshop_area)) {
      return res.status(400).json({ error: 'workshop_area phải là production hoặc logistics' });
    }
    const { data, error } = await supabase
      .from('workshop_task_templates')
      .insert({
        name: name.trim(),
        workshop_area,
        description: description || null,
        order_index: order_index ?? 0,
        is_active: true,
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.put('/task-templates/:id', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { data: existingRow } = await supabase
      .from('workshop_task_templates')
      .select('workshop_area')
      .eq('id', req.params.id)
      .single();

    if (req.body.is_default === true && existingRow?.workshop_area) {
      await supabase
        .from('workshop_task_templates')
        .update({ is_default: false })
        .eq('workshop_area', existingRow.workshop_area)
        .neq('id', req.params.id);
    }

    const update = {};
    ['name', 'description', 'is_active', 'order_index', 'workshop_area', 'is_default'].forEach((f) => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });
    if (update.workshop_area && !['production', 'logistics'].includes(update.workshop_area)) {
      return res.status(400).json({ error: 'workshop_area không hợp lệ' });
    }
    const { data, error } = await supabase
      .from('workshop_task_templates')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.delete('/task-templates/:id', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    await supabase.from('workshop_task_template_items').delete().eq('template_id', req.params.id);
    const { error } = await supabase.from('workshop_task_templates').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.post('/task-templates/:tplId/items', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const b = req.body;
    if (!b.title?.trim()) {
      return res.status(400).json({ error: 'Thiếu tiêu đề nhiệm vụ mẫu' });
    }
    const { data: existing } = await supabase
      .from('workshop_task_template_items')
      .select('order_index')
      .eq('template_id', req.params.tplId)
      .order('order_index', { ascending: false })
      .limit(1);
    const nextOrder = (existing?.[0]?.order_index ?? 0) + 1;
    const { data, error } = await supabase
      .from('workshop_task_template_items')
      .insert({
        template_id: req.params.tplId,
        title: b.title.trim(),
        description: b.description || null,
        priority: b.priority || 'medium',
        deadline_days: Number.isFinite(Number(b.deadline_days)) ? Number(b.deadline_days) : 0,
        order_index: nextOrder,
        checklist: Array.isArray(b.checklist) ? b.checklist : [],
        default_allowed_companies: Array.isArray(b.default_allowed_companies) ? b.default_allowed_companies : null,
        default_allowed_departments: Array.isArray(b.default_allowed_departments) ? b.default_allowed_departments : null,
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.put('/task-templates/:tplId/items/:itemId', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const update = {};
    ['title', 'description', 'priority', 'deadline_days', 'order_index', 'checklist',
      'default_allowed_companies', 'default_allowed_departments'].forEach((f) => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });
    const { data, error } = await supabase
      .from('workshop_task_template_items')
      .update(update)
      .eq('id', req.params.itemId)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.delete('/task-templates/:tplId/items/:itemId', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { error } = await supabase.from('workshop_task_template_items').delete().eq('id', req.params.itemId);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.post('/projects/:id/tasks/from-template', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const projectId = req.params.id;
    const { template_id } = req.body;
    const userId = req.user.userId;

    if (!template_id) {
      return res.status(400).json({ error: 'Thiếu template_id' });
    }

    const result = await applyWorkshopTemplateToProject(projectId, template_id, userId);
    if (!result.ok) {
      return res.status(result.statusCode || 400).json({ error: result.error });
    }
    res.status(201).json({ count: result.count, task_ids: result.task_ids });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ═══ INCIDENTS (Sự cố xưởng) ═══

r.get('/projects/:id/incidents', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('project_incidents')
      .select(`
        id, title, description, severity, status, created_at, resolved_at,
        reporter:users!project_incidents_reported_by_fkey(id, full_name, avatar),
        resolver:users!project_incidents_resolved_by_fkey(id, full_name, avatar)
      `)
      .eq('project_id', id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ incidents: data || [] });
  } catch (e) {
    if (e.message?.includes('project_incidents')) {
      return res.json({ incidents: [], _note: 'migration_pending' });
    }
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.post('/projects/:id/incidents', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, severity } = req.body;
    const userId = req.user.userId;
    if (!title?.trim()) return res.status(400).json({ error: 'Thiếu tiêu đề sự cố' });
    const { data, error } = await supabase
      .from('project_incidents')
      .insert({
        project_id: id,
        reported_by: userId,
        title: title.trim(),
        description: description || null,
        severity: severity || 'medium',
        status: 'open',
      })
      .select(`
        id, title, description, severity, status, created_at,
        reporter:users!project_incidents_reported_by_fkey(id, full_name, avatar)
      `)
      .single();
    if (error) throw error;

    // Notify managers and production supervisors
    try {
      const { data: managers } = await supabase
        .from('users')
        .select('id')
        .in('role', ['manager', 'admin'])
        .eq('is_active', true);
      const recipientIds = (managers || []).map((u) => u.id).filter((uid) => uid !== userId);
      if (!DISABLE_PRODUCTION_PUSH_NOTIFICATIONS && recipientIds.length) {
        const { notifyMultiple: notifyM } = require('../helpers/notifications');
        await notifyM(
          req, recipientIds, 'project_updated',
          `⚠️ Sự cố: ${title}`,
          `Dự án ${id} báo sự cố mức ${severity || 'medium'}`,
          'project', id,
        );
      }
    } catch (ne) {
      console.warn('[incidents] notify:', ne.message);
    }

    res.status(201).json({ incident: data });
  } catch (e) {
    if (e.message?.includes('project_incidents')) {
      return res.status(503).json({ error: 'Tính năng báo sự cố chưa được kích hoạt. Vui lòng chạy migration 76.' });
    }
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

r.patch('/projects/:projectId/incidents/:incidentId', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { projectId, incidentId } = req.params;
    const { status, description } = req.body;
    const userId = req.user.userId;
    const update = { updated_at: new Date().toISOString() };
    if (status) update.status = status;
    if (description !== undefined) update.description = description;
    if (status === 'resolved' || status === 'closed') {
      update.resolved_at = new Date().toISOString();
      update.resolved_by = userId;
    }
    const { data, error } = await supabase
      .from('project_incidents')
      .update(update)
      .eq('id', incidentId)
      .eq('project_id', projectId)
      .select('id, title, severity, status, resolved_at')
      .single();
    if (error) throw error;
    res.json({ incident: data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;
