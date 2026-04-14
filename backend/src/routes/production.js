const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/newPermission');
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
} = require('../helpers/workshopKanban');
const { applyWorkshopTemplateToProject } = require('../helpers/workshopApplyTemplates');

const r = Router();
r.use(auth);

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

async function allowedWorkflowStageIdsForPatch() {
  const ids = new Set();
  const { data: pipeRows, error: pipeErr } = await supabase
    .from('production_pipeline_stages')
    .select('workflow_stage_id')
    .not('workflow_stage_id', 'is', null);
  if (!pipeErr) {
    (pipeRows || []).forEach((r) => {
      if (r.workflow_stage_id) ids.add(String(r.workflow_stage_id));
    });
  }
  const { ids: workshop } = await getWorkshopStageMap();
  workshop.forEach((id) => ids.add(String(id)));
  return ids;
}

// ─── GET /production/pipeline-stages ──
r.get('/pipeline-stages', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const includeInactive = req.query.all === 'true';
    const rows = await loadProductionPipelineStagesRows(includeInactive);
    if (rows === null) {
      const { stages } = await getResolvedKanbanStages();
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
    if (b.bucket_slug && b.bucket_slug !== INTAKE_BUCKET) {
      return res.status(400).json({ error: 'bucket_slug không hợp lệ' });
    }
    if (b.bucket_slug === INTAKE_BUCKET) {
      const { data: existing } = await supabase
        .from('production_pipeline_stages')
        .select('id')
        .eq('bucket_slug', INTAKE_BUCKET)
        .limit(1);
      if (existing?.length) return res.status(400).json({ error: 'Đã có cột chờ vào xưởng' });
    }
    const { data: last } = await supabase
      .from('production_pipeline_stages')
      .select('order_index')
      .order('order_index', { ascending: false })
      .limit(1);
    const nextOrder = (last?.[0]?.order_index ?? 0) + 1;
    const insertPayload = {
      name: b.name.trim(),
      color: b.color || '#0f766e',
      icon: b.icon || '📋',
      order_index: b.order_index ?? nextOrder,
      is_active: b.is_active !== false,
      workflow_stage_id: b.workflow_stage_id || null,
      bucket_slug: b.bucket_slug || null,
    };
    if (insertPayload.bucket_slug === INTAKE_BUCKET) insertPayload.workflow_stage_id = null;

    const { data, error } = await supabase
      .from('production_pipeline_stages')
      .insert(insertPayload)
      .select(`
        id, name, color, icon, order_index, is_active, workflow_stage_id, bucket_slug,
        workflow_stage:workflow_stages(id, slug, name, color, icon)
      `)
      .single();
    if (error) throw error;
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
    ['name', 'color', 'icon', 'order_index', 'is_active', 'workflow_stage_id', 'bucket_slug'].forEach((f) => {
      if (b[f] !== undefined) update[f] = b[f];
    });
    if (existingRow?.bucket_slug === INTAKE_BUCKET) {
      update.workflow_stage_id = null;
    }
    if (update.bucket_slug && update.bucket_slug !== INTAKE_BUCKET) {
      return res.status(400).json({ error: 'bucket_slug không hợp lệ' });
    }
    const { data, error } = await supabase
      .from('production_pipeline_stages')
      .update(update)
      .eq('id', req.params.id)
      .select(`
        id, name, color, icon, order_index, is_active, workflow_stage_id, bucket_slug,
        workflow_stage:workflow_stages(id, slug, name, color, icon)
      `)
      .single();
    if (error) throw error;
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
    res.json({ message: 'Đã sắp xếp lại' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /production/dashboard ──
r.get('/dashboard', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const { division_id, company_id } = req.query;
    const { ids: stageIds } = await getWorkshopStageMap();
    const wonIds = await getWonDealProjectIds();
    const { stages: kanbanStages } = await getResolvedKanbanStages();
    const sortedKanban = [...kanbanStages].sort((a, b) => a.order_index - b.order_index);

    const orFilter = buildScopeOrFilter(stageIds, wonIds);
    let query = supabase
      .from('projects')
      .select(`
        id, code, name, estimated_value, status, deadline, created_at,
        current_stage_id,
        current_stage:workflow_stages(id, slug, name, color, icon),
        customer:customers(id, full_name),
        company:companies(id, name, short_name),
        tasks(id, status)
      `)
      .or(orFilter);

    if (division_id) query = query.eq('division_id', division_id);
    if (company_id) query = query.eq('company_id', company_id);

    const { data: projects = [] } = await query.order('created_at', { ascending: false });

    const enhancedProjects = enrichProjectsForSx(projects, sortedKanban, wonIds).map((project) => ({
      ...project,
      progress: calcTaskProgress(project.tasks),
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
      search, priority, page = 1, limit = 100, division_id, company_id, stage_slug, sx_intake,
    } = req.query;
    const parsedPage = Math.max(parseInt(page) || 1, 1);
    const parsedLimit = Math.min(Math.max(parseInt(limit) || 100, 1), 500);
    const offset = (parsedPage - 1) * parsedLimit;
    const { ids: stageIds } = await getWorkshopStageMap();
    const wonIds = await getWonDealProjectIds();
    const { stages: kanbanStages } = await getResolvedKanbanStages();
    const sortedKanban = [...kanbanStages].sort((a, b) => a.order_index - b.order_index);

    let query = supabase
      .from('projects')
      .select(`
        id, code, name, estimated_value, priority, deadline, created_at, status, notes,
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

    const { data: projects, error, count } = await query;
    if (error) throw error;

    const enhanced = enrichProjectsForSx(projects, sortedKanban, wonIds).map((project) => ({
      ...project,
      progress: calcTaskProgress(project.tasks),
      task_total: project.tasks?.length || 0,
      done_tasks: project.tasks?.filter((task) => task.status === 'done').length || 0,
      is_overdue: Boolean(project.deadline && new Date(project.deadline) < new Date() && project.status !== 'completed'),
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
const PROJECT_DETAIL_SELECT = `
        id, code, name, description, estimated_value, priority, deadline, status, notes, created_at,
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

    const [documentsRes, commentsRes] = await Promise.all([
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
    ]);

    const documents = documentsRes.data || [];
    const sharedDocuments = documents.filter(isDocSharedToWorkshop);
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
    const { stages: kStages } = await getResolvedKanbanStages();
    const sortedK = [...kStages].sort((a, b) => a.order_index - b.order_index);
    const [sxRow] = enrichProjectsForSx([project], sortedK, wonIds);

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
r.patch('/projects/:id/stage', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { id } = req.params;
    const { stage_id, move_to_intake } = req.body;
    const userId = req.user.userId;

    const { data: project } = await supabase
      .from('projects')
      .select('id, current_stage_id, code, name, status')
      .eq('id', id)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    /** Kéo về cột «Chờ vào xưởng» — không có workflow_stage_id trên cột intake */
    if (move_to_intake === true || move_to_intake === 'true') {
      const wonIds = await getWonDealProjectIds();
      const wonSet = new Set(wonIds);
      if (!wonSet.has(id)) {
        return res.status(400).json({ error: 'Chỉ dự án deal thắng mới kéo về cột chờ xưởng' });
      }
      const { ids: workshopIds } = await getWorkshopStageMap();
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

      try {
        await syncCrmLeadSxPipelineFromProject(id);
      } catch (syncErr) {
        console.warn('[production] syncCrmLeadSxPipelineFromProject:', syncErr.message);
      }

      const { data: updated } = await supabase
        .from('projects')
        .select(`
          id, code, name, status, current_stage_id,
          current_stage:workflow_stages(id, slug, name, color)
        `)
        .eq('id', id)
        .single();

      return res.json({ project: updated, moved_to_intake: true, was_on_workshop: wasOnWorkshop });
    }

    if (!stage_id) {
      return res.status(400).json({ error: 'stage_id required' });
    }

    const allowed = await allowedWorkflowStageIdsForPatch();
    if (!allowed.has(String(stage_id))) {
      return res.status(400).json({ error: 'Giai đoạn không hợp lệ cho pipeline sản xuất' });
    }

    const { data: targetStage } = await supabase
      .from('workflow_stages')
      .select('id, slug')
      .eq('id', stage_id)
      .single();

    const statusMap = {
      production: 'producing',
      delivery: 'shipping',
      'customer-care': 'warranty',
    };

    const updatePayload = { current_stage_id: stage_id };
    if (statusMap[targetStage?.slug]) updatePayload.status = statusMap[targetStage.slug];

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
        id, code, name, status, current_stage_id,
        current_stage:workflow_stages(id, slug, name, color)
      `)
      .eq('id', id)
      .single();

    try {
      await syncCrmLeadSxPipelineFromProject(id);
    } catch (syncErr) {
      console.warn('[production] syncCrmLeadSxPipelineFromProject:', syncErr.message);
    }

    res.json({ project: updated });
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

module.exports = r;
