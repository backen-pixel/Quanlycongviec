const { Router } = require('express');
const { requirePermission } = require('../middleware/newPermission');
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

// GET single template set
r.get('/template-sets/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('company_template_sets')
      .select('*, unit:ecosystem_units!company_template_sets_unit_id_fkey(id,name,company_id,parent_id)')
      .eq('id', req.params.id).single();
    if (error) throw error;
    res.json({ set: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
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

// COPY tasks from company_process to template_set
r.post('/template-sets/:id/copy-from-process', async (req, res) => {
  try {
    const { process_id, process_ids } = req.body;
    
    // Support single process_id or array of process_ids
    const processIdList = process_ids || (process_id ? [process_id] : []);
    if (processIdList.length === 0) return res.status(400).json({ error: 'Chọn quy trình gốc' });

    // Get template set
    const { data: templateSet, error: setErr } = await supabase
      .from('company_template_sets')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (setErr) throw setErr;
    if (!templateSet) return res.status(404).json({ error: 'Không tìm thấy bộ mẫu' });

    // Load all workflow stages for mapping
    const { data: allStages } = await supabase
      .from('workflow_stages')
      .select('id,name,slug,order_index')
      .order('order_index');
    
    // Build stage name → stage_id mapping (fuzzy match)
    const stageMap = {};
    (allStages || []).forEach(s => {
      stageMap[s.slug] = s.id;
      stageMap[s.name.toLowerCase()] = s.id;
    });

    // Helper to find stage_id from process name
    const findStageId = (processName) => {
      const lower = (processName || '').toLowerCase().trim();
      // Direct slug match
      for (const [key, id] of Object.entries(stageMap)) {
        if (lower.includes(key) || key.includes(lower)) return id;
      }
      // Keyword mapping
      const keywordMap = {
        'tư vấn': 'consulting', 'tiếp nhận': 'consulting', 'tìm hiểu': 'consulting',
        'thiết kế': 'design', 'khảo sát': 'design', 'bản vẽ': 'design',
        'báo giá': 'quotation', 'giá': 'quotation',
        'hợp đồng': 'contract', 'ký kết': 'contract',
        'sản xuất': 'production', 'gia công': 'production', 'chế tạo': 'production',
        'vận chuyển': 'delivery', 'giao hàng': 'delivery',
        'lắp đặt': 'delivery', 'thi công': 'delivery',
        'bảo hành': 'customer-care', 'cskh': 'customer-care', 'chăm sóc': 'customer-care',
      };
      for (const [keyword, slug] of Object.entries(keywordMap)) {
        if (lower.includes(keyword)) {
          return stageMap[slug] || null;
        }
      }
      return null;
    };

    // Delete existing tasks in template (if any)
    await supabase.from('company_template_tasks')
      .delete()
      .eq('template_set_id', req.params.id);

    let totalCopied = 0;
    let processNames = [];
    let orderOffset = 0;

    for (const pid of processIdList) {
      // Get process
      const { data: process, error: procErr } = await supabase
        .from('company_processes')
        .select('*')
        .eq('id', pid)
        .single();
      if (procErr || !process) {
        console.error('Process not found:', pid);
        continue;
      }

      processNames.push(process.name);
      
      // Determine stage_id from process name
      const stageId = findStageId(process.name);
      if (!stageId) {
        // Fallback: use first stage
        console.warn(`No stage match for process "${process.name}", using first stage`);
      }
      const finalStageId = stageId || (allStages?.[0]?.id);
      if (!finalStageId) {
        console.error('No stages found in database!');
        continue;
      }

      // Get tasks from process
      const { data: processTasks, error: tasksErr } = await supabase
        .from('company_process_tasks')
        .select('*')
        .eq('process_id', pid)
        .order('order_index');
      if (tasksErr) {
        console.error('Error loading process tasks:', tasksErr);
        continue;
      }

      // Copy each task
      for (const pTask of (processTasks || [])) {
        const { data: newTask, error: taskInsertErr } = await supabase
          .from('company_template_tasks')
          .insert({
            template_set_id: req.params.id,
            stage_id: finalStageId, // From process name → stage mapping
            title: pTask.title,
            description: pTask.description || null,
            order_index: (pTask.order_index || 0) + orderOffset,
            default_department_id: pTask.default_department_id || null,
            default_team_id: pTask.default_team_id || null,
            default_assignee_id: pTask.default_assignee_id || null,
            estimated_hours: pTask.estimated_hours || null,
            priority: pTask.priority || 'medium',
            deadline_days: pTask.deadline_days || 0,
            deadline_hours: pTask.deadline_hours || 0,
          })
          .select()
          .single();
        
        if (taskInsertErr) {
          console.error('Error copying task:', taskInsertErr);
          continue;
        }

        totalCopied++;

        // Copy checklists (column name is task_id in process_checklists)
        const { data: processChecklists } = await supabase
          .from('company_process_checklists')
          .select('*')
          .eq('task_id', pTask.id)
          .order('order_index');

        if (processChecklists?.length) {
          const checklistsToInsert = processChecklists.map(c => ({
            template_task_id: newTask.id,
            title: c.title,
            order_index: c.order_index || 0,
            require_file: c.require_file || false,
            require_note: c.require_note || false,
          }));

          await supabase.from('company_template_checklists').insert(checklistsToInsert);
        }
      }

      // Offset order for next process's tasks
      orderOffset += (processTasks?.length || 0) + 10;
    }

    // Update template_set with source_process_id (last one if multiple)
    const sourceId = processIdList[processIdList.length - 1];
    await supabase
      .from('company_template_sets')
      .update({ 
        source_process_id: sourceId,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id);

    res.json({
      success: true,
      copied_tasks: totalCopied,
      source_processes: processNames,
      template_set: templateSet.name,
    });
  } catch (e) {
    console.error('Copy from process error:', e);
    res.status(500).json({ error: e.message });
  }
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
    const { deadline_days, deadline_hours } = req.body;
    const { data, error } = await supabase.from('company_template_tasks')
      .insert({ template_set_id: req.params.setId, stage_id, title: title.trim(), description: description || null, order_index: order_index || 0, default_department_id: opt(default_department_id), default_team_id: opt(default_team_id), default_assignee_id: opt(default_assignee_id), estimated_hours: estimated_hours || null, priority: priority || 'medium', deadline_days: deadline_days || 0, deadline_hours: deadline_hours || 0 })
      .select(`*, stage:workflow_stages(id,name,slug,color,icon)`).single();
    if (error) throw error;
    res.json({ task: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT update template task
r.put('/template-tasks/:id', async (req, res) => {
  try {
    const { title, description, stage_id, order_index, default_department_id, default_team_id, default_assignee_id, estimated_hours, priority, deadline_days, deadline_hours } = req.body;
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
    if (deadline_days !== undefined) update.deadline_days = deadline_days;
    if (deadline_hours !== undefined) update.deadline_hours = deadline_hours;

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
    const { title, order_index, require_file, require_note, default_assignee_id } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Tiêu đề checklist là bắt buộc' });
    const opt = v => (v && typeof v === 'string' && v.trim()) ? v.trim() : null;
    const { data, error } = await supabase.from('company_template_checklists')
      .insert({ template_task_id: req.params.taskId, title: title.trim(), order_index: order_index || 0, require_file: require_file || false, require_note: require_note || false, default_assignee_id: opt(default_assignee_id) })
      .select().single();
    if (error) throw error;
    res.json({ checklist: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/template-checklists/:id', async (req, res) => {
  try {
    const { title, order_index, require_file, require_note, default_assignee_id } = req.body;
    const update = {};
    if (title !== undefined) update.title = title;
    if (order_index !== undefined) update.order_index = order_index;
    if (require_file !== undefined) update.require_file = require_file;
    if (require_note !== undefined) update.require_note = require_note;
    if (default_assignee_id !== undefined) {
      update.default_assignee_id = (default_assignee_id && typeof default_assignee_id === 'string' && default_assignee_id.trim()) 
        ? default_assignee_id.trim() 
        : null;
    }
    
    if (Object.keys(update).length === 0) {
      return res.json({ checklist: null, message: 'Nothing to update' });
    }
    
    const { data, error } = await supabase.from('company_template_checklists')
      .update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ checklist: data });
  } catch (e) { 
    console.error('Update template checklist error:', e);
    res.status(500).json({ error: e.message }); 
  }
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
          stage_group:workflow_stage_groups!ecosystem_units_stage_group_id_fkey(id,name,slug,icon,color)
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
      // Calculate deadline if template has deadline_days/hours
      let deadline = null;
      if (t.deadline_days > 0 || t.deadline_hours > 0) {
        const now = new Date();
        if (t.deadline_days > 0) now.setDate(now.getDate() + t.deadline_days);
        if (t.deadline_hours > 0) now.setHours(now.getHours() + t.deadline_hours);
        deadline = now.toISOString();
      }

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
          deadline: deadline,
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
