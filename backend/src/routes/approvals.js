const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');

const r = Router();
r.use(auth);

// ─── HELPER ──
async function createNotification(req, userId, type, title, message, entityType, entityId) {
  if (!userId || userId === req.user.userId) return;
  const { data } = await supabase.from('notifications').insert({
    user_id: userId, type, title, message, entity_type: entityType, entity_id: entityId,
  }).select().single();
  const pushFn = req.app.get('pushNotification');
  if (pushFn && data) pushFn(userId, data);
  return data;
}

async function notifyMultiple(req, userIds, type, title, message, entityType, entityId) {
  const unique = [...new Set(userIds.filter(id => id && id !== req.user.userId))];
  for (const uid of unique) await createNotification(req, uid, type, title, message, entityType, entityId);
}

async function logActivity(userId, action, entityType, entityId, description, oldValues, newValues) {
  await supabase.from('activity_logs').insert({ user_id: userId, action, entity_type: entityType, entity_id: entityId, description, old_values: oldValues, new_values: newValues });
}

// ═══ ADVANCE PROJECT STAGE HELPER ═══
// Reusable function to advance project to next stage + create tasks
async function advanceProjectStage(req, projectId, nextStageSlug, nextStatus, notes, attachments) {
  try {
    const { data: stage } = await supabase.from('workflow_stages')
      .select('id,name').eq('slug', nextStageSlug).single();
    if (!stage) return;

    const { data: old } = await supabase.from('projects')
      .select('status,current_stage_id,code,name').eq('id', projectId).single();

    // Update project
    await supabase.from('projects').update({
      current_stage_id: stage.id, status: nextStatus, updated_at: new Date().toISOString(),
    }).eq('id', projectId);

    // Save stage transition
    await supabase.from('stage_transitions').insert({
      project_id: projectId,
      from_stage_id: old?.current_stage_id || null,
      to_stage_id: stage.id,
      notes: notes || null,
      attachments: attachments || [],
      transitioned_by: req.user.userId,
    }).catch(() => {});

    // Auto-update customer status
    const { data: proj } = await supabase.from('projects')
      .select('customer_id').eq('id', projectId).single();
    if (proj?.customer_id) {
      try {
        const { data: mapping } = await supabase.from('stage_customer_status_map')
          .select('customer_status_id').eq('stage_id', stage.id).single();
        if (mapping?.customer_status_id) {
          await supabase.from('customers').update({ status_id: mapping.customer_status_id }).eq('id', proj.customer_id);
        }
      } catch {}
    }

    // Get project's person assignments
    const { data: fullProj } = await supabase.from('projects').select(
      'consulting_person_id,design_person_id,quotation_person_id,contract_person_id,production_person_id,shipping_person_id,installation_person_id,care_person_id,sales_person_id,designer_id,project_manager_id,code'
    ).eq('id', projectId).single();

    const stagePersonMap = {
      consulting: fullProj?.consulting_person_id, design: fullProj?.design_person_id,
      quotation: fullProj?.quotation_person_id, contract: fullProj?.contract_person_id,
      production: fullProj?.production_person_id, shipping: fullProj?.shipping_person_id,
      installation: fullProj?.installation_person_id, 'customer-care': fullProj?.care_person_id,
    };
    const stageAssigneeId = stagePersonMap[nextStageSlug] || null;

    // Load workflow lines for new stage
    let stageLines = [];
    try {
      const { data: wlData } = await supabase.from('project_workflow_lines')
        .select('*').eq('project_id', projectId).eq('stage_slug', nextStageSlug).order('order_index');
      stageLines = wlData || [];
    } catch {}

    // Load templates
    const { data: templates } = await supabase.from('task_templates')
      .select('*').eq('stage_id', stage.id).eq('is_active', true).order('order_index');

    const stageDefaultTasks = {
      design: [{ title: 'Thiết kế bản vẽ 2D', priority: 'high' },{ title: 'Thiết kế 3D render', priority: 'medium' },{ title: 'Khách duyệt bản thiết kế', priority: 'high' }],
      quotation: [{ title: 'Bóc tách vật tư', priority: 'high' },{ title: 'Lập báo giá chi tiết', priority: 'high' },{ title: 'Gửi báo giá cho khách', priority: 'medium' }],
      contract: [{ title: 'Soạn hợp đồng', priority: 'high' },{ title: 'Khách ký hợp đồng', priority: 'high' },{ title: 'Thu tiền cọc', priority: 'urgent' }],
      production: [{ title: 'Đặt mua vật tư', priority: 'high' },{ title: 'Gia công CNC', priority: 'high' },{ title: 'Lắp ráp', priority: 'medium' },{ title: 'Sơn / dán bề mặt', priority: 'medium' },{ title: 'Kiểm tra chất lượng', priority: 'high' }],
      shipping: [{ title: 'Đóng gói sản phẩm', priority: 'medium' },{ title: 'Sắp xếp xe vận chuyển', priority: 'medium' },{ title: 'Giao hàng đến công trình', priority: 'high' }],
      installation: [{ title: 'Chuẩn bị vật tư lắp đặt', priority: 'medium' },{ title: 'Lắp đặt tại công trình', priority: 'high' },{ title: 'Nghiệm thu với khách hàng', priority: 'urgent' }],
      'customer-care': [{ title: 'Gọi điện hỏi thăm sau lắp đặt', priority: 'medium' },{ title: 'Xử lý bảo hành (nếu có)', priority: 'high' }],
    };

    let createdTasks = [];

    if (stageLines.length > 0) {
      for (const line of stageLines) {
        const lineAssignee = line.assignee_id || stageAssigneeId;
        const taskList = templates?.length ? templates : (stageDefaultTasks[nextStageSlug] || []);
        if (taskList.length) {
          const { data: ins } = await supabase.from('tasks').insert(taskList.map((t, i) => ({
            project_id: projectId, stage_id: stage.id,
            title: `${t.title} — ${line.label}`,
            description: t.description || null, priority: t.priority || 'medium', status: 'pending',
            created_by_id: req.user.userId, order_index: i, assignee_id: lineAssignee,
            estimated_hours: t.estimated_hours || null, task_type: 'project', workflow_line_id: line.id,
          }))).select();
          createdTasks.push(...(ins || []));

          // Create checklists from templates
          if (templates?.length) {
            for (const tmpl of templates) {
              if (tmpl.checklist_items?.length) {
                const newTask = (ins || []).find(t2 => t2.title === `${tmpl.title} — ${line.label}`);
                if (newTask) {
                  await supabase.from('task_checklists').insert(
                    tmpl.checklist_items.map((c, j) => ({ task_id: newTask.id, title: typeof c === 'string' ? c : c.title, order_index: j }))
                  );
                }
              }
            }
          }

          if (lineAssignee) {
            const lineTaskCount = (ins || []).length;
            if (lineTaskCount) {
              await createNotification(req, lineAssignee, 'task_assigned',
                `📌 ${lineTaskCount} NV "${line.label}"`, `GĐ "${stage.name}" — DA ${fullProj?.code}`, 'project', projectId);
            }
          }
        }
      }
    } else {
      // Legacy single person
      const taskList = templates?.length ? templates : (stageDefaultTasks[nextStageSlug] || []);
      if (taskList.length) {
        const { data: ins } = await supabase.from('tasks').insert(taskList.map((t, i) => ({
          project_id: projectId, stage_id: stage.id, title: t.title,
          description: t.description || null, priority: t.priority || 'medium', status: 'pending',
          created_by_id: req.user.userId, order_index: i, assignee_id: stageAssigneeId,
          estimated_hours: t.estimated_hours || null, task_type: 'project',
        }))).select();
        createdTasks = ins || [];

        if (templates?.length) {
          for (const tmpl of templates) {
            if (tmpl.checklist_items?.length) {
              const newTask = createdTasks.find(t2 => t2.title === tmpl.title);
              if (newTask) {
                await supabase.from('task_checklists').insert(
                  tmpl.checklist_items.map((c, j) => ({ task_id: newTask.id, title: typeof c === 'string' ? c : c.title, order_index: j }))
                );
              }
            }
          }
        }

        if (stageAssigneeId && createdTasks.length) {
          await createNotification(req, stageAssigneeId, 'task_assigned',
            `📌 ${createdTasks.length} nhiệm vụ mới`, `GĐ "${stage.name}" — DA ${fullProj?.code}`, 'project', projectId);
        }
      }
    }

    // Notify all team
    if (fullProj) {
      const allPersonIds = [
        fullProj.consulting_person_id, fullProj.design_person_id, fullProj.quotation_person_id,
        fullProj.contract_person_id, fullProj.production_person_id, fullProj.shipping_person_id,
        fullProj.installation_person_id, fullProj.care_person_id,
        fullProj.sales_person_id, fullProj.designer_id, fullProj.project_manager_id,
      ].filter(Boolean);
      await notifyMultiple(req, allPersonIds, 'project_stage_changed',
        `🔄 Chuyển giai đoạn: ${stage.name}`,
        `Dự án ${fullProj.code} đã chuyển sang giai đoạn "${stage.name}"`,
        'project', projectId);
    }

    await logActivity(req.user.userId, 'stage_changed', 'project', projectId,
      `Chuyển giai đoạn sang: ${stage.name}`, { status: old?.status }, { status: nextStatus, stage: stage.name });

    const io = req.app.get('io');
    if (io) io.emit('project:stage_changed', { project_id: projectId });

  } catch (e) {
    console.error('advanceProjectStage error:', e);
  }
}

// ═══════════════════════════════════════════════
// QUY TẮC DUYỆT — APPROVAL RULES
// ═══════════════════════════════════════════════

// GET all rules (with stage info)
r.get('/rules', async (req, res) => {
  try {
    const { data, error } = await supabase.from('approval_rules')
      .select('*, stage:workflow_stages(id,name,slug,color,icon,order_index)')
      .order('created_at');
    if (error) throw error;
    // Sort by stage order_index
    const sorted = (data || []).sort((a, b) => (a.stage?.order_index || 0) - (b.stage?.order_index || 0));
    res.json({ rules: sorted });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT update rule for a stage
r.put('/rules/:stageId', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role))
      return res.status(403).json({ error: 'Không có quyền' });

    const { approval_mode, auto_condition, description } = req.body;
    const update = { updated_at: new Date().toISOString() };
    if (approval_mode !== undefined) update.approval_mode = approval_mode;
    if (auto_condition !== undefined) update.auto_condition = auto_condition;
    if (description !== undefined) update.description = description;

    // Upsert: update if exists, insert if not
    const { data: existing } = await supabase.from('approval_rules')
      .select('id').eq('stage_id', req.params.stageId).single();

    let data;
    if (existing) {
      const result = await supabase.from('approval_rules')
        .update(update).eq('stage_id', req.params.stageId)
        .select('*, stage:workflow_stages(id,name,slug,color,icon,order_index)').single();
      if (result.error) throw result.error;
      data = result.data;
    } else {
      const result = await supabase.from('approval_rules')
        .insert({ stage_id: req.params.stageId, ...update })
        .select('*, stage:workflow_stages(id,name,slug,color,icon,order_index)').single();
      if (result.error) throw result.error;
      data = result.data;
    }

    res.json({ rule: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════
// DUYỆT DỰ ÁN — PROJECT APPROVALS
// ═══════════════════════════════════════════════

// GET approvals for a project
r.get('/project/:projectId', async (req, res) => {
  try {
    const { data, error } = await supabase.from('project_approvals')
      .select(`
        *,
        stage:workflow_stages(id,name,slug,color,icon),
        requester:users!project_approvals_requested_by_fkey(id,full_name,avatar),
        decider:users!project_approvals_decided_by_fkey(id,full_name,avatar)
      `)
      .eq('project_id', req.params.projectId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ approvals: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET all pending approvals (for manager dashboard)
r.get('/pending', async (req, res) => {
  try {
    const { data, error } = await supabase.from('project_approvals')
      .select(`
        *,
        stage:workflow_stages(id,name,slug,color,icon),
        project:projects(id,code,name,status),
        requester:users!project_approvals_requested_by_fkey(id,full_name,avatar)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ approvals: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST create approval request (yêu cầu duyệt)
r.post('/project/:projectId/request', async (req, res) => {
  try {
    const { notes, attachments, next_stage_slug, next_status } = req.body;
    const projectId = req.params.projectId;

    // Get project info
    const { data: proj } = await supabase.from('projects')
      .select('id,code,name,current_stage_id,status,project_manager_id,sales_person_id')
      .eq('id', projectId).single();
    if (!proj) return res.status(404).json({ error: 'Dự án không tồn tại' });

    // Check if there's already a pending approval for this stage
    const { data: existingPending } = await supabase.from('project_approvals')
      .select('id').eq('project_id', projectId).eq('stage_id', proj.current_stage_id).eq('status', 'pending').limit(1);
    if (existingPending?.length) {
      return res.status(400).json({ error: 'Đã có yêu cầu duyệt đang chờ cho giai đoạn này' });
    }

    // Check approval rule for current stage
    const { data: rule } = await supabase.from('approval_rules')
      .select('*').eq('stage_id', proj.current_stage_id).single();

    // If auto-approval, check conditions
    if (rule?.approval_mode === 'auto') {
      const autoResult = await checkAutoApproval(projectId, proj.current_stage_id, rule.auto_condition);
      if (autoResult.approved) {
        // Create auto-approved record
        const { data: approval, error } = await supabase.from('project_approvals').insert({
          project_id: projectId,
          stage_id: proj.current_stage_id,
          requested_by: req.user.userId,
          status: 'auto_approved',
          notes: notes || null,
          attachments: attachments || [],
          next_stage_slug,
          next_status,
          decided_at: new Date().toISOString(),
          approve_notes: `Tự động duyệt: ${autoResult.reason}`,
        }).select(`
          *,
          stage:workflow_stages(id,name,slug,color,icon),
          requester:users!project_approvals_requested_by_fkey(id,full_name,avatar)
        `).single();
        if (error) throw error;

        await logActivity(req.user.userId, 'auto_approved', 'project', projectId,
          `Tự động duyệt giai đoạn: ${autoResult.reason}`);

        // ═══ TỰ ĐỘNG CHUYỂN GIAI ĐOẠN KHI AUTO-APPROVED ═══
        if (next_stage_slug && next_status) {
          await advanceProjectStage(req, projectId, next_stage_slug, next_status, notes, attachments);
        }

        return res.json({ approval, auto_approved: true });
      }
    }

    // Manual approval — create pending record
    const { data: approval, error } = await supabase.from('project_approvals').insert({
      project_id: projectId,
      stage_id: proj.current_stage_id,
      requested_by: req.user.userId,
      status: 'pending',
      notes: notes || null,
      attachments: attachments || [],
      next_stage_slug,
      next_status,
    }).select(`
      *,
      stage:workflow_stages(id,name,slug,color,icon),
      requester:users!project_approvals_requested_by_fkey(id,full_name,avatar)
    `).single();
    if (error) throw error;

    // Notify managers/approvers
    const approverId = proj.project_manager_id || proj.sales_person_id;
    const { data: curStage } = await supabase.from('workflow_stages')
      .select('name').eq('id', proj.current_stage_id).single();

    if (approverId) {
      await createNotification(req, approverId, 'system',
        `🔍 Chờ duyệt: ${proj.code}`,
        `${req.user.fullName} yêu cầu duyệt giai đoạn "${curStage?.name}" — DA ${proj.code}${notes ? `\n📝 ${notes}` : ''}`,
        'project', projectId);
    }

    // Also notify all admin/managers
    const { data: admins } = await supabase.from('users')
      .select('id').in('role', ['admin', 'manager']).eq('is_active', true);
    if (admins?.length) {
      const adminIds = admins.map(a => a.id).filter(id => id !== approverId);
      await notifyMultiple(req, adminIds, 'system',
        `🔍 Chờ duyệt: ${proj.code}`,
        `${req.user.fullName} yêu cầu duyệt giai đoạn "${curStage?.name}" — DA ${proj.code}`,
        'project', projectId);
    }

    await logActivity(req.user.userId, 'approval_requested', 'project', projectId,
      `Yêu cầu duyệt giai đoạn "${curStage?.name}"`);

    res.json({ approval, auto_approved: false });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// POST approve/reject
r.post('/:approvalId/decide', async (req, res) => {
  try {
    const { action, reject_reason, approve_notes } = req.body; // action: 'approve' | 'reject'

    if (!['admin', 'manager'].includes(req.user.role))
      return res.status(403).json({ error: 'Không có quyền duyệt' });

    if (action === 'reject' && !reject_reason?.trim())
      return res.status(400).json({ error: 'Vui lòng nhập lý do từ chối' });

    // Get approval
    const { data: approval } = await supabase.from('project_approvals')
      .select('*, stage:workflow_stages(id,name,slug)').eq('id', req.params.approvalId).single();
    if (!approval) return res.status(404).json({ error: 'Không tìm thấy yêu cầu duyệt' });
    if (approval.status !== 'pending') return res.status(400).json({ error: 'Yêu cầu này đã được xử lý' });

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const update = {
      status: newStatus,
      decided_by: req.user.userId,
      decided_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (action === 'reject') update.reject_reason = reject_reason;
    if (action === 'approve' && approve_notes) update.approve_notes = approve_notes;

    const { data: updated, error } = await supabase.from('project_approvals')
      .update(update).eq('id', req.params.approvalId)
      .select(`
        *,
        stage:workflow_stages(id,name,slug,color,icon),
        requester:users!project_approvals_requested_by_fkey(id,full_name,avatar),
        decider:users!project_approvals_decided_by_fkey(id,full_name,avatar)
      `).single();
    if (error) throw error;

    // Get project info for notifications
    const { data: proj } = await supabase.from('projects')
      .select('id,code,name').eq('id', approval.project_id).single();

    if (action === 'approve') {
      // Notify requester: approved
      await createNotification(req, approval.requested_by, 'project_stage_changed',
        `✅ Đã duyệt: ${proj?.code}`,
        `${req.user.fullName} đã duyệt giai đoạn "${approval.stage?.name}"${approve_notes ? `\n📝 ${approve_notes}` : ''}`,
        'project', approval.project_id);

      await logActivity(req.user.userId, 'approval_approved', 'project', approval.project_id,
        `Duyệt giai đoạn "${approval.stage?.name}"`);

      // ═══ TỰ ĐỘNG CHUYỂN GIAI ĐOẠN SAU KHI DUYỆT ═══
      if (approval.next_stage_slug && approval.next_status) {
        await advanceProjectStage(req, approval.project_id, approval.next_stage_slug, approval.next_status, approval.notes, approval.attachments);
      }

    } else {
      // Notify requester: rejected with reason
      await createNotification(req, approval.requested_by, 'system',
        `❌ Từ chối: ${proj?.code}`,
        `${req.user.fullName} từ chối duyệt "${approval.stage?.name}"\n📝 Lý do: ${reject_reason}`,
        'project', approval.project_id);

      await logActivity(req.user.userId, 'approval_rejected', 'project', approval.project_id,
        `Từ chối duyệt "${approval.stage?.name}": ${reject_reason}`);
    }

    const io = req.app.get('io');
    if (io) io.emit('approval:updated', updated);

    res.json({ approval: updated });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// POST re-request approval (after rejection)
r.post('/:approvalId/re-request', async (req, res) => {
  try {
    const { notes, attachments } = req.body;

    // Get original approval
    const { data: old } = await supabase.from('project_approvals')
      .select('*').eq('id', req.params.approvalId).single();
    if (!old) return res.status(404).json({ error: 'Không tìm thấy yêu cầu' });
    if (old.status !== 'rejected') return res.status(400).json({ error: 'Chỉ có thể gửi lại yêu cầu đã bị từ chối' });
    if (old.requested_by !== req.user.userId)
      return res.status(403).json({ error: 'Chỉ người tạo yêu cầu mới được gửi lại' });

    // Create new pending approval
    const { data: approval, error } = await supabase.from('project_approvals').insert({
      project_id: old.project_id,
      stage_id: old.stage_id,
      requested_by: req.user.userId,
      status: 'pending',
      notes: notes || old.notes,
      attachments: attachments || old.attachments,
      next_stage_slug: old.next_stage_slug,
      next_status: old.next_status,
    }).select(`
      *,
      stage:workflow_stages(id,name,slug,color,icon),
      requester:users!project_approvals_requested_by_fkey(id,full_name,avatar)
    `).single();
    if (error) throw error;

    // Notify managers
    const { data: proj } = await supabase.from('projects')
      .select('id,code,project_manager_id,sales_person_id')
      .eq('id', old.project_id).single();

    const approverId = proj?.project_manager_id || proj?.sales_person_id;
    if (approverId) {
      await createNotification(req, approverId, 'system',
        `🔄 Gửi lại yêu cầu duyệt: ${proj?.code}`,
        `${req.user.fullName} gửi lại yêu cầu duyệt giai đoạn "${approval.stage?.name}"`,
        'project', old.project_id);
    }

    res.json({ approval });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ─── Auto-approval checker ──
async function checkAutoApproval(projectId, stageId, condition) {
  try {
    // Get all tasks for this project+stage
    const { data: tasks } = await supabase.from('tasks')
      .select('id,status').eq('project_id', projectId).eq('stage_id', stageId);

    if (!tasks?.length) return { approved: false, reason: 'Không có tasks' };

    // Check all tasks done first
    const allDone = tasks.every(t => t.status === 'done');
    if (!allDone) return { approved: false, reason: 'Còn tasks chưa hoàn thành' };

    switch (condition) {
      case 'all_tasks_done':
        return { approved: true, reason: 'Tất cả tasks đã hoàn thành' };

      case 'checklist_complete': {
        // Check all checklists across all tasks are completed
        const taskIds = tasks.map(t => t.id);
        const { data: checklists } = await supabase.from('task_checklists')
          .select('id,is_completed').in('task_id', taskIds);
        if (!checklists?.length) return { approved: true, reason: 'Không có checklist — tự động duyệt' };
        const allChecked = checklists.every(c => c.is_completed);
        return allChecked
          ? { approved: true, reason: 'Tất cả checklist đã hoàn thành' }
          : { approved: false, reason: `${checklists.filter(c => !c.is_completed).length} checklist chưa tick` };
      }

      case 'checklist_has_files': {
        const taskIds = tasks.map(t => t.id);
        const { data: checklists } = await supabase.from('task_checklists')
          .select('id,is_completed,attachments').in('task_id', taskIds);
        if (!checklists?.length) return { approved: true, reason: 'Không có checklist' };
        const allHaveFiles = checklists.every(c => {
          const atts = c.attachments || [];
          return atts.length > 0;
        });
        return allHaveFiles
          ? { approved: true, reason: 'Tất cả checklist có file đính kèm' }
          : { approved: false, reason: 'Một số checklist chưa có file đính kèm' };
      }

      case 'checklist_has_notes': {
        const taskIds = tasks.map(t => t.id);
        const { data: checklists } = await supabase.from('task_checklists')
          .select('id,is_completed,notes').in('task_id', taskIds);
        if (!checklists?.length) return { approved: true, reason: 'Không có checklist' };
        const allHaveNotes = checklists.every(c => c.notes?.trim());
        return allHaveNotes
          ? { approved: true, reason: 'Tất cả checklist có ghi chú' }
          : { approved: false, reason: 'Một số checklist chưa có ghi chú' };
      }

      case 'checklist_has_files_or_notes': {
        const taskIds = tasks.map(t => t.id);
        const { data: checklists } = await supabase.from('task_checklists')
          .select('id,is_completed,attachments,notes').in('task_id', taskIds);
        if (!checklists?.length) return { approved: true, reason: 'Không có checklist' };
        const allHave = checklists.every(c => {
          const atts = c.attachments || [];
          return atts.length > 0 || c.notes?.trim();
        });
        return allHave
          ? { approved: true, reason: 'Tất cả checklist có file hoặc ghi chú' }
          : { approved: false, reason: 'Một số checklist chưa có file hoặc ghi chú' };
      }

      default:
        return { approved: false, reason: `Điều kiện không hợp lệ: ${condition}` };
    }
  } catch (e) {
    console.error('Auto-approval check error:', e);
    return { approved: false, reason: 'Lỗi kiểm tra: ' + e.message };
  }
}

// GET check auto-approval for a project's current stage
r.get('/check-auto/:projectId', async (req, res) => {
  try {
    const { data: proj } = await supabase.from('projects')
      .select('id,current_stage_id').eq('id', req.params.projectId).single();
    if (!proj) return res.status(404).json({ error: 'Dự án không tồn tại' });

    const { data: rule } = await supabase.from('approval_rules')
      .select('*').eq('stage_id', proj.current_stage_id).single();

    if (!rule) return res.json({ mode: 'manual', auto_check: null });

    if (rule.approval_mode === 'auto') {
      const result = await checkAutoApproval(req.params.projectId, proj.current_stage_id, rule.auto_condition);
      return res.json({ mode: 'auto', rule, auto_check: result });
    }

    res.json({ mode: rule.approval_mode, rule, auto_check: null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = r;
