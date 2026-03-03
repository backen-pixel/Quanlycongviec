const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');

const r = Router();
r.use(auth);

// ═══════════════════════════════════════════════
// BỘ NV MẪU THEO CÔNG TY — TEMPLATE SETS
// ═══════════════════════════════════════════════

// GET all template sets for a company unit
r.get('/units/:unitId/template-sets', async (req, res) => {
  try {
    const { data, error } = await supabase.from('company_template_sets')
      .select('*, created_by_user:users!company_template_sets_created_by_fkey(id,full_name)')
      .eq('unit_id', req.params.unitId).eq('is_active', true)
      .order('is_default', { ascending: false }).order('created_at');
    if (error) throw error;

    // Count tasks per set
    for (const s of (data || [])) {
      const { count } = await supabase.from('company_template_tasks')
        .select('id', { count: 'exact', head: true }).eq('template_set_id', s.id);
      s.task_count = count || 0;
    }

    res.json({ sets: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST create template set
r.post('/units/:unitId/template-sets', async (req, res) => {
  try {
    const { name, description, project_type, is_default } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Tên bộ mẫu là bắt buộc' });

    // If setting as default, unset other defaults
    if (is_default) {
      await supabase.from('company_template_sets')
        .update({ is_default: false }).eq('unit_id', req.params.unitId);
    }

    const { data, error } = await supabase.from('company_template_sets')
      .insert({ unit_id: req.params.unitId, name: name.trim(), description: description || null, project_type: project_type || null, is_default: is_default || false, created_by: req.user.userId })
      .select().single();
    if (error) throw error;
    res.json({ set: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT update template set
r.put('/template-sets/:id', async (req, res) => {
  try {
    const { name, description, project_type, is_default, is_active } = req.body;
    const update = { updated_at: new Date().toISOString() };
    if (name !== undefined) update.name = name;
    if (description !== undefined) update.description = description;
    if (project_type !== undefined) update.project_type = project_type;
    if (is_active !== undefined) update.is_active = is_active;

    if (is_default) {
      // Get unit_id first
      const { data: set } = await supabase.from('company_template_sets').select('unit_id').eq('id', req.params.id).single();
      if (set) await supabase.from('company_template_sets').update({ is_default: false }).eq('unit_id', set.unit_id);
      update.is_default = true;
    }

    const { data, error } = await supabase.from('company_template_sets')
      .update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ set: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE template set
r.delete('/template-sets/:id', async (req, res) => {
  try {
    await supabase.from('company_template_sets').update({ is_active: false }).eq('id', req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// CLONE template set from another company
r.post('/template-sets/:id/clone', async (req, res) => {
  try {
    const { target_unit_id } = req.body;
    if (!target_unit_id) return res.status(400).json({ error: 'Chọn công ty đích' });

    // Get source set
    const { data: src } = await supabase.from('company_template_sets').select('*').eq('id', req.params.id).single();
    if (!src) return res.status(404).json({ error: 'Không tìm thấy bộ mẫu' });

    // Clone set
    const { data: newSet, error } = await supabase.from('company_template_sets')
      .insert({ unit_id: target_unit_id, name: `${src.name} (bản sao)`, description: src.description, project_type: src.project_type, created_by: req.user.userId })
      .select().single();
    if (error) throw error;

    // Clone tasks
    const { data: tasks } = await supabase.from('company_template_tasks')
      .select('*').eq('template_set_id', req.params.id).order('order_index');

    for (const t of (tasks || [])) {
      const { data: newTask } = await supabase.from('company_template_tasks')
        .insert({ template_set_id: newSet.id, stage_id: t.stage_id, title: t.title, description: t.description, order_index: t.order_index, estimated_hours: t.estimated_hours, priority: t.priority })
        .select().single();

      // Clone checklists
      const { data: checks } = await supabase.from('company_template_checklists')
        .select('*').eq('template_task_id', t.id).order('order_index');
      if (checks?.length) {
        await supabase.from('company_template_checklists').insert(
          checks.map(c => ({ template_task_id: newTask.id, title: c.title, order_index: c.order_index, require_file: c.require_file, require_note: c.require_note }))
        );
      }
    }

    res.json({ set: newSet });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════
// TASK MẪU — TEMPLATE TASKS
// ═══════════════════════════════════════════════

// GET tasks in a template set
r.get('/template-sets/:setId/tasks', async (req, res) => {
  try {
    const { data, error } = await supabase.from('company_template_tasks')
      .select(`*, stage:workflow_stages(id,name,slug,color,icon),
        default_department:ecosystem_units!company_template_tasks_default_department_id_fkey(id,name,short_name),
        default_team:ecosystem_units!company_template_tasks_default_team_id_fkey(id,name,short_name),
        default_assignee:users!company_template_tasks_default_assignee_id_fkey(id,full_name,email)
      `)
      .eq('template_set_id', req.params.setId).order('order_index');
    if (error) throw error;

    // Load checklists
    for (const t of (data || [])) {
      const { data: checks } = await supabase.from('company_template_checklists')
        .select('*').eq('template_task_id', t.id).order('order_index');
      t.checklists = checks || [];
    }

    res.json({ tasks: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST create template task
r.post('/template-sets/:setId/tasks', async (req, res) => {
  try {
    const { stage_id, title, description, order_index, default_department_id, default_team_id, default_assignee_id, estimated_hours, priority } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Tiêu đề task là bắt buộc' });
    if (!stage_id) return res.status(400).json({ error: 'Chọn quy trình' });

    const opt = v => (v && typeof v === 'string' && v.trim()) ? v.trim() : null;
    const { data, error } = await supabase.from('company_template_tasks')
      .insert({ template_set_id: req.params.setId, stage_id, title: title.trim(), description: description || null, order_index: order_index || 0, default_department_id: opt(default_department_id), default_team_id: opt(default_team_id), default_assignee_id: opt(default_assignee_id), estimated_hours: estimated_hours || null, priority: priority || 'medium' })
      .select(`*, stage:workflow_stages(id,name,slug,color,icon)`).single();
    if (error) throw error;
    res.json({ task: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT update template task
r.put('/template-tasks/:id', async (req, res) => {
  try {
    const { title, description, stage_id, order_index, default_department_id, default_team_id, default_assignee_id, estimated_hours, priority } = req.body;
    const opt = v => (v && typeof v === 'string' && v.trim()) ? v.trim() : null;
    const update = {};
    if (title !== undefined) update.title = title;
    if (description !== undefined) update.description = description;
    if (stage_id !== undefined) update.stage_id = stage_id;
    if (order_index !== undefined) update.order_index = order_index;
    if (default_department_id !== undefined) update.default_department_id = opt(default_department_id);
    if (default_team_id !== undefined) update.default_team_id = opt(default_team_id);
    if (default_assignee_id !== undefined) update.default_assignee_id = opt(default_assignee_id);
    if (estimated_hours !== undefined) update.estimated_hours = estimated_hours;
    if (priority !== undefined) update.priority = priority;

    const { data, error } = await supabase.from('company_template_tasks')
      .update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ task: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE template task
r.delete('/template-tasks/:id', async (req, res) => {
  try {
    await supabase.from('company_template_tasks').delete().eq('id', req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════
// CHECKLIST MẪU
// ═══════════════════════════════════════════════

r.post('/template-tasks/:taskId/checklists', async (req, res) => {
  try {
    const { title, order_index, require_file, require_note } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Tiêu đề checklist là bắt buộc' });
    const { data, error } = await supabase.from('company_template_checklists')
      .insert({ template_task_id: req.params.taskId, title: title.trim(), order_index: order_index || 0, require_file: require_file || false, require_note: require_note || false })
      .select().single();
    if (error) throw error;
    res.json({ checklist: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/template-checklists/:id', async (req, res) => {
  try {
    const { title, order_index, require_file, require_note } = req.body;
    const update = {};
    if (title !== undefined) update.title = title;
    if (order_index !== undefined) update.order_index = order_index;
    if (require_file !== undefined) update.require_file = require_file;
    if (require_note !== undefined) update.require_note = require_note;
    const { data, error } = await supabase.from('company_template_checklists')
      .update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ checklist: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.delete('/template-checklists/:id', async (req, res) => {
  try {
    await supabase.from('company_template_checklists').delete().eq('id', req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════
// LUỒNG DỰ ÁN QUA KHỐI — PROJECT FLOW
// ═══════════════════════════════════════════════

// GET project flow (all divisions + assignments)
r.get('/projects/:projectId/flow', async (req, res) => {
  try {
    const { data, error } = await supabase.from('project_company_assignments')
      .select(`*,
        division:ecosystem_units!project_company_assignments_division_unit_id_fkey(id,name,short_name,code,
          level:ecosystem_levels(id,name,icon,color),
          stage_group:workflow_stage_groups(id,name,slug,icon,color)
        ),
        company:ecosystem_units!project_company_assignments_company_unit_id_fkey(id,name,short_name,code),
        template_set:company_template_sets(id,name,project_type)
      `)
      .eq('project_id', req.params.projectId).order('order_index');
    if (error) throw error;
    res.json({ assignments: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST assign company to project for a division
r.post('/projects/:projectId/assign-company', async (req, res) => {
  try {
    const { division_unit_id, company_unit_id, template_set_id, order_index } = req.body;
    if (!division_unit_id || !company_unit_id) return res.status(400).json({ error: 'Chọn Khối và Công ty' });

    const opt = v => (v && typeof v === 'string' && v.trim()) ? v.trim() : null;
    const { data, error } = await supabase.from('project_company_assignments')
      .upsert({ project_id: req.params.projectId, division_unit_id, company_unit_id, template_set_id: opt(template_set_id), order_index: order_index || 0 }, { onConflict: 'project_id,division_unit_id' })
      .select().single();
    if (error) throw error;
    res.json({ assignment: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT update assignment status
r.put('/project-assignments/:id', async (req, res) => {
  try {
    const { status, handoff_notes } = req.body;
    const update = {};
    if (status) {
      update.status = status;
      if (status === 'in_progress' && !update.started_at) update.started_at = new Date().toISOString();
      if (status === 'completed' || status === 'handed_off') update.completed_at = new Date().toISOString();
    }
    if (handoff_notes !== undefined) update.handoff_notes = handoff_notes;

    const { data, error } = await supabase.from('project_company_assignments')
      .update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ assignment: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST handoff between divisions
r.post('/projects/:projectId/handoff', async (req, res) => {
  try {
    const { from_division_id, to_division_id, summary, notes, files_json } = req.body;
    if (!from_division_id || !to_division_id) return res.status(400).json({ error: 'Chọn Khối chuyển và Khối nhận' });

    const { data, error } = await supabase.from('project_phase_handoffs')
      .insert({ project_id: req.params.projectId, from_division_id, to_division_id, summary: summary || null, notes: notes || null, files_json: files_json || '[]', created_by: req.user.userId })
      .select().single();
    if (error) throw error;

    // Update from_division status to handed_off
    await supabase.from('project_company_assignments')
      .update({ status: 'handed_off', completed_at: new Date().toISOString() })
      .eq('project_id', req.params.projectId).eq('division_unit_id', from_division_id);

    // Update to_division status to in_progress
    await supabase.from('project_company_assignments')
      .update({ status: 'in_progress', started_at: new Date().toISOString() })
      .eq('project_id', req.params.projectId).eq('division_unit_id', to_division_id);

    res.json({ handoff: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET handoff history
r.get('/projects/:projectId/handoffs', async (req, res) => {
  try {
    const { data, error } = await supabase.from('project_phase_handoffs')
      .select(`*,
        from_division:ecosystem_units!project_phase_handoffs_from_division_id_fkey(id,name,short_name),
        to_division:ecosystem_units!project_phase_handoffs_to_division_id_fkey(id,name,short_name),
        creator:users!project_phase_handoffs_created_by_fkey(id,full_name)
      `)
      .eq('project_id', req.params.projectId).order('created_at');
    if (error) throw error;
    res.json({ handoffs: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST generate tasks from template set into project
r.post('/projects/:projectId/generate-from-template', async (req, res) => {
  try {
    const { template_set_id, assignment_id } = req.body;
    if (!template_set_id) return res.status(400).json({ error: 'Chọn bộ NV mẫu' });

    // Get template tasks
    const { data: tasks } = await supabase.from('company_template_tasks')
      .select('*, checklists:company_template_checklists(*)')
      .eq('template_set_id', template_set_id).order('order_index');

    if (!tasks?.length) return res.status(400).json({ error: 'Bộ mẫu chưa có task nào' });

    const created = [];
    for (const t of tasks) {
      // Create task
      const { data: task, error } = await supabase.from('tasks')
        .insert({
          project_id: req.params.projectId,
          stage_id: t.stage_id,
          title: t.title,
          description: t.description,
          assigned_to: t.default_assignee_id || null,
          priority: t.priority || 'medium',
          status: 'pending',
          order_index: t.order_index,
          created_by: req.user.userId,
        })
        .select().single();
      if (error) { console.error('Gen task error:', error); continue; }

      // Create checklists
      if (t.checklists?.length) {
        for (const c of t.checklists) {
          await supabase.from('task_checklist').insert({
            task_id: task.id,
            title: c.title,
            order_index: c.order_index,
            is_completed: false,
          });
        }
      }

      created.push(task);
    }

    // Update assignment status
    if (assignment_id) {
      await supabase.from('project_company_assignments')
        .update({ status: 'in_progress', started_at: new Date().toISOString() })
        .eq('id', assignment_id);
    }

    res.json({ tasks: created, count: created.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = r;
