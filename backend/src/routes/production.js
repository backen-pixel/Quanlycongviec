const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/newPermission');

const r = Router();
r.use(auth);

// ─── GET /production/dashboard ──
r.get('/dashboard', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const { division_id, company_id } = req.query;
    
    // Get production stages (actual DB slugs: production, delivery, customer-care)
    const { data: prodStages } = await supabase
      .from('workflow_stages')
      .select('id, slug, name, color, icon')
      .in('slug', ['production', 'delivery', 'customer-care']);
    
    const stageMap = {};
    (prodStages || []).forEach(s => { stageMap[s.slug] = s.id; });
    
    // Build query
    let query = supabase
      .from('projects')
      .select(`
        id, code, name, estimated_value, 
        status,
        current_stage_id,
        current_stage:workflow_stages(id, slug, name, color),
        customer:customers(id, full_name),
        production_person_id,
        shipping_person_id,
        installation_person_id,
        care_person_id
      `)
      .in('current_stage_id', Object.values(stageMap).filter(Boolean));
    
    if (division_id) query = query.eq('division_id', division_id);
    if (company_id) query = query.eq('company_id', company_id);
    
    const { data: projects } = await query;
    
    // Count by stage
    const kpis = {
      total_projects: projects?.length || 0,
      producing: (projects || []).filter(p => p.current_stage?.slug === 'production').length,
      delivering: (projects || []).filter(p => p.current_stage?.slug === 'delivery').length,
      customer_care: (projects || []).filter(p => p.current_stage?.slug === 'customer-care').length,
      completed: (projects || []).filter(p => p.status === 'completed').length,
      total_value: (projects || []).reduce((s, p) => s + (p.estimated_value || 0), 0),
    };
    
    res.json({
      kpis,
      pipeline: prodStages || [],
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /production/projects ──
r.get('/projects', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const { search, priority, page = 1, limit = 100, division_id, company_id } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // Get production stages
    const { data: prodStages } = await supabase
      .from('workflow_stages')
      .select('id, slug')
      .in('slug', ['production', 'delivery', 'customer-care']);
    
    const stageIds = (prodStages || []).map(s => s.id).filter(Boolean);
    
    let query = supabase
      .from('projects')
      .select(`
        id, code, name, estimated_value, priority, deadline,
        status,
        current_stage_id,
        current_stage:workflow_stages(id, slug, name, color, icon),
        customer:customers(id, full_name),
        production_person:users!projects_production_person_id_fkey(id, full_name, avatar),
        tasks(id, status)
      `)
      .in('current_stage_id', stageIds);
    
    if (division_id) query = query.eq('division_id', division_id);
    if (company_id) query = query.eq('company_id', company_id);
    
    if (search) {
      const searchPattern = `%${search}%`;
      query = query.or(`code.ilike.${searchPattern},name.ilike.${searchPattern}`);
    }
    
    if (priority) {
      query = query.eq('priority', priority);
    }
    
    query = query.order('deadline', { ascending: true })
      .range(offset, offset + parseInt(limit) - 1);
    
    const { data: projects, error } = await query;
    
    if (error) throw error;
    
    // Enhance with progress
    const enhanced = (projects || []).map(p => ({
      ...p,
      progress: p.tasks?.length > 0 
        ? Math.round((p.tasks.filter(t => t.status === 'done').length / p.tasks.length) * 100)
        : 0,
    }));
    
    res.json({
      projects: enhanced,
      total: enhanced.length,
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
    
    const { data: project, error } = await supabase
      .from('projects')
      .select(`
        id, code, name, estimated_value, priority, deadline, status, notes,
        current_stage_id,
        current_stage:workflow_stages(id, slug, name, color, icon),
        customer:customers(id, full_name, phone, email),
        production_person:users!projects_production_person_id_fkey(id, full_name, avatar),
        shipping_person:users!projects_shipping_person_id_fkey(id, full_name, avatar),
        installation_person:users!projects_installation_person_id_fkey(id, full_name, avatar),
        care_person:users!projects_care_person_id_fkey(id, full_name, avatar),
        tasks(
          id, title, status, order_index, priority,
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
    
    // Get documents via project_id (synced from CRM lead_documents)
    const { data: documents = [] } = await supabase
      .from('lead_documents')
      .select('*, creator:users!lead_documents_created_by_fkey(id, full_name)')
      .eq('project_id', id)
      .order('created_at', { ascending: false });
    
    // Calculate task progress
    const taskProgress = project.tasks?.length > 0
      ? Math.round((project.tasks.filter(t => t.status === 'done').length / project.tasks.length) * 100)
      : 0;
    
    // Group tasks by stage
    const tasksByStage = {};
    (project.tasks || []).forEach(t => {
      const stageKey = t.stage?.slug || 'unassigned';
      if (!tasksByStage[stageKey]) tasksByStage[stageKey] = [];
      tasksByStage[stageKey].push(t);
    });
    
    res.json({
      project: {
        ...project,
        taskProgress,
        tasksByStage,
        documents,
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
    
    // Get current project
    const { data: project } = await supabase
      .from('projects')
      .select('id, current_stage_id, code, name')
      .eq('id', id)
      .single();
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Update project stage
    const { error: updateError } = await supabase
      .from('projects')
      .update({
        current_stage_id: stage_id,
      })
      .eq('id', id);
    
    if (updateError) throw updateError;
    
    // Log transition
    await supabase.from('stage_transitions').insert({
      project_id: id,
      from_stage_id: project.current_stage_id,
      to_stage_id: stage_id,
      user_id: userId,
    });
    
    // Get updated project
    const { data: updated } = await supabase
      .from('projects')
      .select(`
        id, code, name, current_stage_id,
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
