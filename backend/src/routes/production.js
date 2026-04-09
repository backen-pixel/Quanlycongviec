const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/newPermission');

const r = Router();
r.use(auth);

const WORKSHOP_STAGE_SLUGS = ['production', 'delivery', 'customer-care'];
const WORKSHOP_STATUSES = ['producing', 'delivering', 'warranty', 'completed'];

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

function calcTaskProgress(tasks) {
  if (!tasks?.length) return 0;
  return Math.round((tasks.filter((task) => task.status === 'done').length / tasks.length) * 100);
}

function isDocSharedToWorkshop(doc) {
  const notes = `${doc?.notes || ''} ${doc?.name || ''}`.toLowerCase();
  const allowedDepartments = Array.isArray(doc?.allowed_departments) ? doc.allowed_departments : [];
  const allowedCompanies = Array.isArray(doc?.allowed_companies) ? doc.allowed_companies : [];
  return Boolean(
    doc?.shared_to_workshop ||
    doc?.shared_to_production ||
    doc?.allow_workshop_view ||
    doc?.allow_production_view ||
    doc?.is_shared ||
    doc?.is_public ||
    allowedDepartments.length ||
    allowedCompanies.length ||
    notes.includes('cho phép chia sẻ') ||
    notes.includes('cho phep chia se') ||
    notes.includes('chia sẻ xưởng') ||
    notes.includes('chia se xuong') ||
    notes.includes('xưởng') ||
    notes.includes('xuong')
  );
}

// ─── GET /production/dashboard ──
r.get('/dashboard', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const { division_id, company_id } = req.query;
    const { stages, ids: stageIds } = await getWorkshopStageMap();

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
      .or(`current_stage_id.in.(${stageIds.join(',')}),status.in.(${WORKSHOP_STATUSES.join(',')})`);

    if (division_id) query = query.eq('division_id', division_id);
    if (company_id) query = query.eq('company_id', company_id);

    const { data: projects = [] } = await query.order('created_at', { ascending: false });

    const enhancedProjects = projects.map((project) => ({
      ...project,
      progress: calcTaskProgress(project.tasks),
    }));

    const overdueCount = enhancedProjects.filter((project) => (
      project.deadline && new Date(project.deadline) < new Date() && project.status !== 'completed'
    )).length;

    const kpis = {
      total_projects: enhancedProjects.length,
      producing: enhancedProjects.filter((project) => project.current_stage?.slug === 'production' || project.status === 'producing').length,
      delivering: enhancedProjects.filter((project) => project.current_stage?.slug === 'delivery' || project.status === 'delivering').length,
      customer_care: enhancedProjects.filter((project) => project.current_stage?.slug === 'customer-care' || project.status === 'warranty').length,
      completed: enhancedProjects.filter((project) => project.status === 'completed').length,
      overdue: overdueCount,
      total_value: enhancedProjects.reduce((sum, project) => sum + (project.estimated_value || 0), 0),
      avg_progress: enhancedProjects.length
        ? Math.round(enhancedProjects.reduce((sum, project) => sum + (project.progress || 0), 0) / enhancedProjects.length)
        : 0,
    };

    const pipeline = stages.map((stage) => ({
      ...stage,
      count: enhancedProjects.filter((project) => project.current_stage?.slug === stage.slug).length,
      total_value: enhancedProjects
        .filter((project) => project.current_stage?.slug === stage.slug)
        .reduce((sum, project) => sum + (project.estimated_value || 0), 0),
    }));

    res.json({
      kpis,
      pipeline,
      projects: enhancedProjects,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /production/projects ──
r.get('/projects', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const { search, priority, page = 1, limit = 100, division_id, company_id, stage_slug } = req.query;
    const parsedPage = Math.max(parseInt(page) || 1, 1);
    const parsedLimit = Math.min(Math.max(parseInt(limit) || 100, 1), 500);
    const offset = (parsedPage - 1) * parsedLimit;
    const { ids: stageIds } = await getWorkshopStageMap();

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
      `, { count: 'exact' })
      .or(`current_stage_id.in.(${stageIds.join(',')}),status.in.(${WORKSHOP_STATUSES.join(',')})`);

    if (division_id) query = query.eq('division_id', division_id);
    if (company_id) query = query.eq('company_id', company_id);

    if (search) {
      const searchPattern = `%${search}%`;
      query = query.or(`code.ilike.${searchPattern},name.ilike.${searchPattern},notes.ilike.${searchPattern}`);
    }

    if (priority) query = query.eq('priority', priority);
    if (stage_slug) query = query.eq('current_stage.slug', stage_slug);

    query = query.order('deadline', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + parsedLimit - 1);

    const { data: projects, error, count } = await query;
    if (error) throw error;

    const enhanced = (projects || []).map((project) => ({
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
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /production/projects/:id ──
r.get('/projects/:id', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const { id } = req.params;
    const { bySlug } = await getWorkshopStageMap();

    const { data: project, error } = await supabase
      .from('projects')
      .select(`
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
          id, title, description, status, order_index, priority, deadline, metadata,
          assignee:users!tasks_assignee_id_fkey(id, full_name, avatar),
          stage:workflow_stages(id, slug, name, color)
        ),
        stage_transitions(
          id, from_stage_id, to_stage_id, created_at,
          from_stage:workflow_stages(id, name, slug),
          to_stage:workflow_stages(id, name, slug),
          user:users(id, full_name)
        )
      `)
      .eq('id', id)
      .single();

    if (error || !project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const [documentsRes, crmRes, commentsRes] = await Promise.all([
      supabase
        .from('lead_documents')
        .select('*, creator:users!lead_documents_created_by_fkey(id, full_name)')
        .eq('project_id', id)
        .order('created_at', { ascending: false }),
      supabase.rpc ? Promise.resolve({ data: null }) : Promise.resolve({ data: null }),
      supabase
        .from('project_comments')
        .select('id, content, attachments, created_at, user:users(id, full_name, avatar)')
        .eq('project_id', id)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    const documents = documentsRes.data || [];
    const sharedDocuments = documents.filter(isDocSharedToWorkshop);
    const hiddenDocuments = documents.filter((doc) => !isDocSharedToWorkshop(doc));

    const { data: crmSummary } = await supabase
      .from('crm_leads')
      .select('id, code, title, type, estimated_value, status, lost_reason, created_at')
      .eq('project_id', id)
      .order('created_at', { ascending: false });

    const taskProgress = calcTaskProgress(project.tasks);
    const tasksByStage = {};
    (project.tasks || []).forEach((task) => {
      const stageKey = task.stage?.slug || 'unassigned';
      if (!tasksByStage[stageKey]) tasksByStage[stageKey] = [];
      tasksByStage[stageKey].push(task);
    });

    const workshopPipeline = WORKSHOP_STAGE_SLUGS.map((slug) => bySlug[slug]).filter(Boolean);

    res.json({
      project: {
        ...project,
        taskProgress,
        tasksByStage,
        documents,
        sharedDocuments,
        hiddenDocumentsCount: hiddenDocuments.length,
        crmDeals: crmSummary || [],
        recentComments: commentsRes.data || [],
        workshopPipeline,
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
    const { stage_id } = req.body;
    const userId = req.user.userId;

    if (!stage_id) {
      return res.status(400).json({ error: 'stage_id required' });
    }

    const { data: project } = await supabase
      .from('projects')
      .select('id, current_stage_id, code, name')
      .eq('id', id)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const { data: targetStage } = await supabase
      .from('workflow_stages')
      .select('id, slug')
      .eq('id', stage_id)
      .single();

    const statusMap = {
      production: 'producing',
      delivery: 'delivering',
      'customer-care': 'warranty',
    };

    const { error: updateError } = await supabase
      .from('projects')
      .update({
        current_stage_id: stage_id,
        status: statusMap[targetStage?.slug] || undefined,
      })
      .eq('id', id);

    if (updateError) throw updateError;

    await supabase.from('stage_transitions').insert({
      project_id: id,
      from_stage_id: project.current_stage_id,
      to_stage_id: stage_id,
      user_id: userId,
    });

    const { data: updated } = await supabase
      .from('projects')
      .select(`
        id, code, name, status, current_stage_id,
        current_stage:workflow_stages(id, slug, name, color)
      `)
      .eq('id', id)
      .single();

    res.json({ project: updated });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;
