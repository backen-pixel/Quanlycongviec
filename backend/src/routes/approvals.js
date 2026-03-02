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
