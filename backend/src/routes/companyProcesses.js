const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');

const r = Router();
r.use(auth);

// ═══════════════════════════════════════════════
// QUY TRÌNH NỘI BỘ CÔNG TY — COMPANY PROCESSES
// ═══════════════════════════════════════════════

// GET all processes for a company unit
r.get('/unit/:unitId', async (req, res) => {
  try {
    const { data, error } = await supabase.from('company_processes')
      .select('*, creator:users!company_processes_created_by_fkey(id,full_name)')
      .eq('company_unit_id', req.params.unitId)
      .eq('is_active', true)
      .order('order_index');
    if (error) throw error;

    // Count tasks per process
    for (const p of (data || [])) {
      const { count } = await supabase.from('company_process_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('process_id', p.id);
      p.task_count = count || 0;
    }

    res.json({ processes: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET single process with tasks + checklists
r.get('/:id', async (req, res) => {
  try {
    const { data: process, error } = await supabase.from('company_processes')
      .select('*, creator:users!company_processes_created_by_fkey(id,full_name)')
      .eq('id', req.params.id).single();
    if (error) throw error;

    // Load tasks
    const { data: tasks } = await supabase.from('company_process_tasks')
      .select(`*,
        default_department:ecosystem_units!company_process_tasks_default_department_id_fkey(id,name,short_name),
        default_team:ecosystem_units!company_process_tasks_default_team_id_fkey(id,name,short_name),
        default_assignee:users!company_process_tasks_default_assignee_id_fkey(id,full_name,email)
      `)
      .eq('process_id', req.params.id)
      .order('order_index');

    // Load checklists for each task
    for (const t of (tasks || [])) {
      const { data: checks } = await supabase.from('company_process_checklists')
        .select('*, default_assignee:users!company_process_checklists_default_assignee_id_fkey(id,full_name)')
        .eq('task_id', t.id)
        .order('order_index');
      t.checklists = checks || [];
    }

    process.tasks = tasks || [];
    res.json({ process });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST create process
r.post('/unit/:unitId', async (req, res) => {
  try {
    const { name, description, color, icon, order_index } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Tên quy trình là bắt buộc' });

    // Auto order_index
    let oi = order_index;
    if (oi === undefined || oi === null) {
      const { data: last } = await supabase.from('company_processes')
        .select('order_index').eq('company_unit_id', req.params.unitId)
        .order('order_index', { ascending: false }).limit(1);
      oi = (last?.[0]?.order_index || 0) + 1;
    }

    const { data, error } = await supabase.from('company_processes')
      .insert({
        company_unit_id: req.params.unitId,
        name: name.trim(),
        description: description || null,
        color: color || '#3B82F6',
        icon: icon || '📋',
        order_index: oi,
        created_by: req.user.userId,
      })
      .select().single();
    if (error) throw error;
    data.task_count = 0;
    res.status(201).json({ process: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT update process
r.put('/:id', async (req, res) => {
  try {
    const { name, description, color, icon, order_index, is_active } = req.body;
    const update = { updated_at: new Date().toISOString() };
    if (name !== undefined) update.name = name;
    if (description !== undefined) update.description = description;
    if (color !== undefined) update.color = color;
    if (icon !== undefined) update.icon = icon;
    if (order_index !== undefined) update.order_index = order_index;
    if (is_active !== undefined) update.is_active = is_active;

    const { data, error } = await supabase.from('company_processes')
      .update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ process: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE process (soft)
r.delete('/:id', async (req, res) => {
  try {
    await supabase.from('company_processes')
      .update({ is_active: false }).eq('id', req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// REORDER processes
r.put('/unit/:unitId/reorder', async (req, res) => {
  try {
    const { order } = req.body; // [{id, order_index}]
    for (const item of (order || [])) {
      await supabase.from('company_processes')
        .update({ order_index: item.order_index }).eq('id', item.id);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════
// NHIỆM VỤ MẪU TRONG QUY TRÌNH — PROCESS TASKS
// ═══════════════════════════════════════════════

// GET tasks in a process
r.get('/:processId/tasks', async (req, res) => {
  try {
    const { data, error } = await supabase.from('company_process_tasks')
      .select(`*,
        default_department:ecosystem_units!company_process_tasks_default_department_id_fkey(id,name,short_name),
        default_team:ecosystem_units!company_process_tasks_default_team_id_fkey(id,name,short_name),
        default_assignee:users!company_process_tasks_default_assignee_id_fkey(id,full_name,email)
      `)
      .eq('process_id', req.params.processId)
      .order('order_index');
    if (error) throw error;

    for (const t of (data || [])) {
      const { data: checks } = await supabase.from('company_process_checklists')
        .select('*').eq('task_id', t.id).order('order_index');
      t.checklists = checks || [];
    }

    res.json({ tasks: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST create task
r.post('/:processId/tasks', async (req, res) => {
  try {
    const { title, description, order_index, default_department_id, default_team_id, default_assignee_id, estimated_hours, deadline_days, deadline_hours, priority } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Tiêu đề nhiệm vụ là bắt buộc' });

    const opt = v => (v && typeof v === 'string' && v.trim()) ? v.trim() : null;

    // Auto order_index
    let oi = order_index;
    if (oi === undefined || oi === null) {
      const { data: last } = await supabase.from('company_process_tasks')
        .select('order_index').eq('process_id', req.params.processId)
        .order('order_index', { ascending: false }).limit(1);
      oi = (last?.[0]?.order_index || 0) + 1;
    }

    const { data, error } = await supabase.from('company_process_tasks')
      .insert({
        process_id: req.params.processId,
        title: title.trim(),
        description: description || null,
        order_index: oi,
        default_department_id: opt(default_department_id),
        default_team_id: opt(default_team_id),
        default_assignee_id: opt(default_assignee_id),
        estimated_hours: estimated_hours || null,
        deadline_days: deadline_days || 0,
        deadline_hours: deadline_hours || 0,
        priority: priority || 'medium',
      })
      .select().single();
    if (error) throw error;
    data.checklists = [];
    res.status(201).json({ task: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT update task
r.put('/tasks/:id', async (req, res) => {
  try {
    const { title, description, order_index, default_department_id, default_team_id, default_assignee_id, estimated_hours, deadline_days, deadline_hours, priority } = req.body;
    const opt = v => (v && typeof v === 'string' && v.trim()) ? v.trim() : null;
    const update = {};
    if (title !== undefined) update.title = title;
    if (description !== undefined) update.description = description;
    if (order_index !== undefined) update.order_index = order_index;
    if (default_department_id !== undefined) update.default_department_id = opt(default_department_id);
    if (default_team_id !== undefined) update.default_team_id = opt(default_team_id);
    if (default_assignee_id !== undefined) update.default_assignee_id = opt(default_assignee_id);
    if (estimated_hours !== undefined) update.estimated_hours = estimated_hours;
    if (deadline_days !== undefined) update.deadline_days = deadline_days;
    if (deadline_hours !== undefined) update.deadline_hours = deadline_hours;
    if (priority !== undefined) update.priority = priority;

    const { data, error } = await supabase.from('company_process_tasks')
      .update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ task: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE task
r.delete('/tasks/:id', async (req, res) => {
  try {
    await supabase.from('company_process_tasks').delete().eq('id', req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════
// CHECKLIST MẪU — PROCESS CHECKLISTS
// ═══════════════════════════════════════════════

r.post('/tasks/:taskId/checklists', async (req, res) => {
  try {
    const { title, order_index, require_file, require_note, default_assignee_id } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Tiêu đề checklist là bắt buộc' });
    const opt = v => (v && typeof v === 'string' && v.trim()) ? v.trim() : null;

    let oi = order_index;
    if (oi === undefined || oi === null) {
      const { data: last } = await supabase.from('company_process_checklists')
        .select('order_index').eq('task_id', req.params.taskId)
        .order('order_index', { ascending: false }).limit(1);
      oi = (last?.[0]?.order_index || 0) + 1;
    }

    const { data, error } = await supabase.from('company_process_checklists')
      .insert({
        task_id: req.params.taskId,
        title: title.trim(),
        order_index: oi,
        require_file: require_file || false,
        require_note: require_note || false,
        default_assignee_id: opt(default_assignee_id),
      })
      .select().single();
    if (error) throw error;
    res.json({ checklist: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/checklists/:id', async (req, res) => {
  try {
    const { title, order_index, require_file, require_note, default_assignee_id } = req.body;
    const opt = v => (v && typeof v === 'string' && v.trim()) ? v.trim() : null;
    const update = {};
    if (title !== undefined) update.title = title;
    if (order_index !== undefined) update.order_index = order_index;
    if (require_file !== undefined) update.require_file = require_file;
    if (require_note !== undefined) update.require_note = require_note;
    if (default_assignee_id !== undefined) update.default_assignee_id = opt(default_assignee_id);

    const { data, error } = await supabase.from('company_process_checklists')
      .update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ checklist: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.delete('/checklists/:id', async (req, res) => {
  try {
    await supabase.from('company_process_checklists').delete().eq('id', req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════
// FLOW STEP ↔ QUY TRÌNH — LINK PROCESSES TO FLOW STEPS
// ═══════════════════════════════════════════════

// GET processes linked to a flow step
r.get('/flow-step/:stepId/processes', async (req, res) => {
  try {
    const { data, error } = await supabase.from('flow_step_processes')
      .select(`*,
        process:company_processes(id,name,description,color,icon,order_index,company_unit_id)
      `)
      .eq('flow_step_id', req.params.stepId)
      .order('order_index');
    if (error) throw error;

    // Count tasks per process
    for (const fsp of (data || [])) {
      if (fsp.process) {
        const { count } = await supabase.from('company_process_tasks')
          .select('id', { count: 'exact', head: true })
          .eq('process_id', fsp.process.id);
        fsp.process.task_count = count || 0;
      }
    }

    res.json({ step_processes: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT replace all process links for a flow step
r.put('/flow-step/:stepId/processes', async (req, res) => {
  try {
    const { processes } = req.body; // [{process_id, order_index, is_required}]
    if (!Array.isArray(processes)) return res.status(400).json({ error: 'Cần mảng processes' });

    // Delete old links
    await supabase.from('flow_step_processes').delete().eq('flow_step_id', req.params.stepId);

    // Insert new
    if (processes.length) {
      const { error } = await supabase.from('flow_step_processes').insert(
        processes.map((p, i) => ({
          flow_step_id: req.params.stepId,
          process_id: p.process_id,
          order_index: p.order_index ?? i,
          is_required: p.is_required !== false,
        }))
      );
      if (error) throw error;
    }

    // Return updated
    const { data } = await supabase.from('flow_step_processes')
      .select('*, process:company_processes(id,name,description,color,icon)')
      .eq('flow_step_id', req.params.stepId)
      .order('order_index');

    res.json({ step_processes: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════
// TẠO QUY TRÌNH GỢI Ý TỪ APPROVAL RULES GỐC
// ═══════════════════════════════════════════════

r.post('/generate-suggestions/:unitId', async (req, res) => {
  try {
    // Get default workflow_stages (no company_id)
    const { data: defaultStages } = await supabase.from('workflow_stages')
      .select('*')
      .is('company_id', null)
      .eq('is_active', true)
      .order('order_index');

    if (!defaultStages?.length) return res.status(400).json({ error: 'Chưa có quy trình gốc' });

    // Check existing
    const { data: existing } = await supabase.from('company_processes')
      .select('id').eq('company_unit_id', req.params.unitId).eq('is_active', true).limit(1);
    if (existing?.length) {
      return res.status(400).json({ error: 'Công ty đã có quy trình. Xóa hoặc vô hiệu hóa trước.' });
    }

    const created = [];
    for (const stage of defaultStages) {
      const { data: proc, error } = await supabase.from('company_processes')
        .insert({
          company_unit_id: req.params.unitId,
          name: stage.name,
          description: stage.description || null,
          color: stage.color || '#3B82F6',
          icon: stage.icon?.charCodeAt?.(0) > 127 ? stage.icon : '📋',
          order_index: stage.order_index,
          created_by: req.user.userId,
        })
        .select().single();
      if (error) { console.error(error); continue; }
      created.push(proc);
    }

    res.json({ processes: created, count: created.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// CLONE processes from one company to another
r.post('/clone/:fromUnitId/:toUnitId', async (req, res) => {
  try {
    const { data: srcProcesses } = await supabase.from('company_processes')
      .select('*').eq('company_unit_id', req.params.fromUnitId).eq('is_active', true).order('order_index');

    if (!srcProcesses?.length) return res.status(400).json({ error: 'Công ty nguồn chưa có quy trình' });

    const created = [];
    for (const src of srcProcesses) {
      const { data: proc } = await supabase.from('company_processes')
        .insert({
          company_unit_id: req.params.toUnitId,
          name: src.name,
          description: src.description,
          color: src.color,
          icon: src.icon,
          order_index: src.order_index,
          created_by: req.user.userId,
        }).select().single();
      if (!proc) continue;

      // Clone tasks
      const { data: srcTasks } = await supabase.from('company_process_tasks')
        .select('*').eq('process_id', src.id).order('order_index');

      for (const t of (srcTasks || [])) {
        const { data: newTask } = await supabase.from('company_process_tasks')
          .insert({
            process_id: proc.id,
            title: t.title, description: t.description, order_index: t.order_index,
            estimated_hours: t.estimated_hours, deadline_days: t.deadline_days,
            deadline_hours: t.deadline_hours, priority: t.priority,
          }).select().single();

        // Clone checklists
        if (newTask) {
          const { data: srcChecks } = await supabase.from('company_process_checklists')
            .select('*').eq('task_id', t.id).order('order_index');
          if (srcChecks?.length) {
            await supabase.from('company_process_checklists').insert(
              srcChecks.map(c => ({
                task_id: newTask.id, title: c.title, order_index: c.order_index,
                require_file: c.require_file, require_note: c.require_note,
              }))
            );
          }
        }
      }

      created.push(proc);
    }

    res.json({ processes: created, count: created.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = r;
