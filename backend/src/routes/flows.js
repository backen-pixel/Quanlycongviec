const { Router } = require('express');
const { requirePermission } = require('../middleware/newPermission');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');

const r = Router();
r.use(auth);

// ═══ Helper: load full step data ═══
async function loadStepDetails(steps) {
  for (const step of steps) {
    // Load companies under division
    const { data: companyUnits } = await supabase.from('ecosystem_units')
      .select('id,name,short_name,code')
      .eq('parent_id', step.division_unit_id)
      .eq('is_active', true);
    step.companies = companyUnits || [];

    // Load template sets for chosen company (or all companies in division)
    const unitIds = step.company_unit_id
      ? [step.company_unit_id]
      : (companyUnits || []).map(u => u.id);

    if (unitIds.length) {
      const { data: sets } = await supabase.from('company_template_sets')
        .select('*, unit:ecosystem_units!company_template_sets_unit_id_fkey(id,name,short_name)')
        .in('unit_id', unitIds)
        .eq('is_active', true)
        .order('is_default', { ascending: false });
      step.template_sets = sets || [];
    } else {
      step.template_sets = [];
    }

    // Load tasks for chosen template set
    if (step.template_set_id) {
      const { data: tasks } = await supabase.from('company_template_tasks')
        .select(`*, checklists:company_template_checklists(*),
          stage:workflow_stages(id,name,slug,color,icon),
          default_assignee:users!company_template_tasks_default_assignee_id_fkey(id,full_name)`)
        .eq('template_set_id', step.template_set_id)
        .order('order_index');
      step.tasks = tasks || [];
    } else {
      step.tasks = [];
    }

    // Load company processes linked to this step
    try {
      const { data: stepProcs } = await supabase.from('flow_step_processes')
        .select('*, process:company_processes(id,name,description,color,icon,order_index)')
        .eq('flow_step_id', step.id)
        .order('order_index');
      step.processes = (stepProcs || []).map(sp => ({ ...sp.process, _link_id: sp.id, is_required: sp.is_required }));

      // Load tasks + checklists for each process
      for (const proc of step.processes) {
        const { data: procTasks } = await supabase.from('company_process_tasks')
          .select('*, checklists:company_process_checklists(*)')
          .eq('process_id', proc.id)
          .order('order_index');
        proc.tasks = procTasks || [];
        proc.task_count = procTasks?.length || 0;
      }
    } catch { step.processes = []; }

    // Also load all available processes for the company (for selection)
    if (step.company_unit_id) {
      try {
        const { data: allProcs } = await supabase.from('company_processes')
          .select('id,name,description,color,icon,order_index')
          .eq('company_unit_id', step.company_unit_id)
          .eq('is_active', true)
          .order('order_index');
        step.available_processes = allProcs || [];
      } catch { step.available_processes = []; }
    } else {
      step.available_processes = [];
    }
  }
  return steps;
}

// ═══ LIST all flows (light) ═══
r.get('/', async (req, res) => {
  try {
    const { data: flows, error } = await supabase.from('workflow_flows')
      .select('*, creator:users!workflow_flows_created_by_fkey(id,full_name)')
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('created_at');
    if (error) throw error;

    for (const f of (flows || [])) {
      const { data: steps } = await supabase.from('workflow_flow_steps')
        .select(`*,
          division:ecosystem_units!workflow_flow_steps_division_unit_id_fkey(id,name,short_name,code,
            level:ecosystem_levels(id,name,icon,color)
          ),
          company:ecosystem_units!workflow_flow_steps_company_unit_id_fkey(id,name,short_name),
          template_set:company_template_sets(id,name,project_type)
        `)
        .eq('flow_id', f.id)
        .order('order_index');
      f.steps = steps || [];

      // Count tasks per step
      for (const step of f.steps) {
        if (step.template_set_id) {
          const { count } = await supabase.from('company_template_tasks')
            .select('id', { count: 'exact', head: true })
            .eq('template_set_id', step.template_set_id);
          step.task_count = count || 0;
        } else {
          step.task_count = 0;
        }
      }
    }

    res.json({ flows: flows || [] });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ═══ GET single flow with full details ═══
r.get('/:id', async (req, res) => {
  try {
    const { data: flow, error } = await supabase.from('workflow_flows')
      .select('*, creator:users!workflow_flows_created_by_fkey(id,full_name)')
      .eq('id', req.params.id).single();
    if (error) throw error;

    const { data: steps } = await supabase.from('workflow_flow_steps')
      .select(`*,
        division:ecosystem_units!workflow_flow_steps_division_unit_id_fkey(id,name,short_name,code,
          level:ecosystem_levels(id,name,icon,color)
        ),
        company:ecosystem_units!workflow_flow_steps_company_unit_id_fkey(id,name,short_name),
        template_set:company_template_sets(id,name,project_type)
      `)
      .eq('flow_id', flow.id)
      .order('order_index');

    flow.steps = await loadStepDetails(steps || []);
    res.json({ flow });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ═══ CREATE flow ═══
r.post('/', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role))
      return res.status(403).json({ error: 'Không có quyền' });

    const { name, description, color, icon, is_default, steps } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Tên luồng là bắt buộc' });

    if (is_default) {
      await supabase.from('workflow_flows').update({ is_default: false }).eq('is_default', true);
    }

    const { data: flow, error } = await supabase.from('workflow_flows')
      .insert({
        name: name.trim(),
        description: description || null,
        color: color || '#6366F1',
        icon: icon || '🔄',
        is_default: is_default || false,
        created_by: req.user.userId,
      })
      .select().single();
    if (error) throw error;

    if (steps?.length) {
      const opt = v => (v && typeof v === 'string' && v.trim()) ? v.trim() : null;
      await supabase.from('workflow_flow_steps')
        .insert(steps.map((s, i) => ({
          flow_id: flow.id,
          division_unit_id: s.division_unit_id,
          company_unit_id: opt(s.company_unit_id),
          template_set_id: opt(s.template_set_id),
          order_index: s.order_index ?? i,
          setup_days: s.setup_days || 0,
          setup_hours: s.setup_hours || 0,
          description: s.description || null,
        })));
    }

    res.status(201).json({ flow });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ═══ UPDATE flow ═══
r.put('/:id', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role))
      return res.status(403).json({ error: 'Không có quyền' });

    const { name, description, color, icon, is_default, is_active } = req.body;
    const update = { updated_at: new Date().toISOString() };
    if (name !== undefined) update.name = name;
    if (description !== undefined) update.description = description;
    if (color !== undefined) update.color = color;
    if (icon !== undefined) update.icon = icon;
    if (is_active !== undefined) update.is_active = is_active;
    if (is_default) {
      await supabase.from('workflow_flows').update({ is_default: false }).eq('is_default', true);
      update.is_default = true;
    }

    const { data, error } = await supabase.from('workflow_flows')
      .update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ flow: data });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ═══ DELETE flow (soft) ═══
r.delete('/:id', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role))
      return res.status(403).json({ error: 'Không có quyền' });
    await supabase.from('workflow_flows').update({ is_active: false }).eq('id', req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ UPDATE STEPS (replace all) ═══
r.put('/:id/steps', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role))
      return res.status(403).json({ error: 'Không có quyền' });

    const { steps } = req.body;
    if (!Array.isArray(steps)) return res.status(400).json({ error: 'Cần mảng steps' });

    await supabase.from('workflow_flow_steps').delete().eq('flow_id', req.params.id);

    if (steps.length) {
      const opt = v => (v && typeof v === 'string' && v.trim()) ? v.trim() : null;
      await supabase.from('workflow_flow_steps')
        .insert(steps.map((s, i) => ({
          flow_id: req.params.id,
          division_unit_id: s.division_unit_id,
          company_unit_id: opt(s.company_unit_id),
          template_set_id: opt(s.template_set_id),
          order_index: s.order_index ?? i,
          setup_days: s.setup_days || 0,
          setup_hours: s.setup_hours || 0,
          description: s.description || null,
        })));
    }

    const { data: flowSteps } = await supabase.from('workflow_flow_steps')
      .select(`*,
        division:ecosystem_units!workflow_flow_steps_division_unit_id_fkey(id,name,short_name,code,
          level:ecosystem_levels(id,name,icon,color)
        ),
        company:ecosystem_units!workflow_flow_steps_company_unit_id_fkey(id,name,short_name),
        template_set:company_template_sets(id,name,project_type)
      `)
      .eq('flow_id', req.params.id)
      .order('order_index');

    res.json({ steps: flowSteps || [] });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ═══ CLONE flow ═══
r.post('/:id/clone', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role))
      return res.status(403).json({ error: 'Không có quyền' });

    const { data: src } = await supabase.from('workflow_flows')
      .select('*').eq('id', req.params.id).single();
    if (!src) return res.status(404).json({ error: 'Luồng không tồn tại' });

    const { data: newFlow, error } = await supabase.from('workflow_flows')
      .insert({
        name: `${src.name} (bản sao)`,
        description: src.description,
        color: src.color,
        icon: src.icon,
        is_default: false,
        created_by: req.user.userId,
      })
      .select().single();
    if (error) throw error;

    const { data: srcSteps } = await supabase.from('workflow_flow_steps')
      .select('*').eq('flow_id', req.params.id).order('order_index');

    if (srcSteps?.length) {
      await supabase.from('workflow_flow_steps')
        .insert(srcSteps.map(s => ({
          flow_id: newFlow.id,
          division_unit_id: s.division_unit_id,
          company_unit_id: s.company_unit_id,
          template_set_id: s.template_set_id,
          order_index: s.order_index,
          setup_days: s.setup_days,
          setup_hours: s.setup_hours,
          description: s.description,
        })));
    }

    res.json({ flow: newFlow });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════
// FLOW STEP TASKS & CHECKLISTS (Migration 21)
// ═══════════════════════════════════════════════════════════

// ─── GET flow step tasks ───
r.get('/steps/:stepId/tasks', async (req, res) => {
  try {
    const { data: tasks, error } = await supabase
      .from('flow_step_tasks')
      .select(`
        *,
        stage:workflow_stages(id,name,slug,icon,color),
        assigned_user:users(id,full_name,email,phone,avatar,role),
        checklists:flow_step_task_checklists(*)
      `)
      .eq('flow_step_id', req.params.stepId)
      .eq('is_active', true)
      .order('order_index');
    
    if (error) throw error;
    res.json({ tasks: tasks || [] });
  } catch (e) {
    console.error('Get flow step tasks error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── CREATE flow step task ───
r.post('/steps/tasks', async (req, res) => {
  try {
    const { 
      flow_step_id, title, description, stage_id,
      assigned_user_id, assigned_company_unit_id, assignee_field,
      estimated_days, order_index, template_task_id
    } = req.body;
    
    if (!flow_step_id || !title) {
      return res.status(400).json({ error: 'Cần flow_step_id và title' });
    }
    
    const { data: task, error } = await supabase
      .from('flow_step_tasks')
      .insert({
        flow_step_id,
        title: title.trim(),
        description: description?.trim() || null,
        stage_id: stage_id || null,
        assigned_user_id: assigned_user_id || null,
        assigned_company_unit_id: assigned_company_unit_id || null,
        assignee_field: assignee_field || null,
        estimated_days: estimated_days || 1,
        order_index: order_index || 0,
        template_task_id: template_task_id || null,
      })
      .select(`
        *,
        stage:workflow_stages(id,name,slug,icon),
        assigned_user:users(id,full_name,email)
      `)
      .single();
    
    if (error) throw error;
    res.json({ task });
  } catch (e) {
    console.error('Create flow step task error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── UPDATE flow step task ───
r.put('/steps/tasks/:taskId', async (req, res) => {
  try {
    const updates = {};
    const allowed = [
      'title', 'description', 'stage_id', 
      'assigned_user_id', 'assigned_company_unit_id', 'assignee_field',
      'estimated_days', 'order_index', 'is_active'
    ];
    
    allowed.forEach(key => {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    });
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Không có dữ liệu để update' });
    }
    
    const { data: task, error } = await supabase
      .from('flow_step_tasks')
      .update(updates)
      .eq('id', req.params.taskId)
      .select(`
        *,
        stage:workflow_stages(id,name,slug,icon),
        assigned_user:users(id,full_name,email)
      `)
      .single();
    
    if (error) throw error;
    res.json({ task });
  } catch (e) {
    console.error('Update flow step task error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── DELETE flow step task ───
r.delete('/steps/tasks/:taskId', async (req, res) => {
  try {
    const { error } = await supabase
      .from('flow_step_tasks')
      .delete()
      .eq('id', req.params.taskId);
    
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    console.error('Delete flow step task error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── CREATE checklist for flow step task ───
r.post('/steps/tasks/:taskId/checklists', async (req, res) => {
  try {
    const { label, order_index, is_required, assigned_user_id, template_checklist_id } = req.body;
    
    if (!label || !label.trim()) {
      return res.status(400).json({ error: 'Cần label' });
    }
    
    const { data: checklist, error } = await supabase
      .from('flow_step_task_checklists')
      .insert({
        flow_step_task_id: req.params.taskId,
        label: label.trim(),
        order_index: order_index || 0,
        is_required: is_required || false,
        assigned_user_id: assigned_user_id || null,
        template_checklist_id: template_checklist_id || null,
      })
      .select()
      .single();
    
    if (error) throw error;
    res.json({ checklist });
  } catch (e) {
    console.error('Create checklist error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── UPDATE checklist ───
r.put('/steps/tasks/:taskId/checklists/:checklistId', async (req, res) => {
  try {
    const updates = {};
    const allowed = ['label', 'order_index', 'is_required', 'assigned_user_id'];
    
    allowed.forEach(key => {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    });
    
    const { data: checklist, error } = await supabase
      .from('flow_step_task_checklists')
      .update(updates)
      .eq('id', req.params.checklistId)
      .select()
      .single();
    
    if (error) throw error;
    res.json({ checklist });
  } catch (e) {
    console.error('Update checklist error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── DELETE checklist ───
r.delete('/steps/tasks/:taskId/checklists/:checklistId', async (req, res) => {
  try {
    const { error } = await supabase
      .from('flow_step_task_checklists')
      .delete()
      .eq('id', req.params.checklistId);
    
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    console.error('Delete checklist error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;
