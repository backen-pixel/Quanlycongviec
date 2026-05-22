const { Router } = require('express');
const { requirePermission } = require('../middleware/newPermission');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');

const { isExpiryDeadlineNotificationType } = require('../helpers/notificationOperationalFilter');

const r = Router();
r.use(auth);

// ─── HELPER ──
async function createNotification(req, userId, type, title, message, entityType, entityId) {
  if (!userId || userId === req.user.userId) return;
  if (isExpiryDeadlineNotificationType(type)) return null;
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
    const { data: stage, error: stageErr } = await supabase.from('workflow_stages')
      .select('id,name').eq('slug', nextStageSlug).single();
    if (stageErr || !stage) { console.error('advanceProjectStage: stage not found', nextStageSlug, stageErr); return; }

    const { data: old } = await supabase.from('projects')
      .select('status,current_stage_id,code,name').eq('id', projectId).single();

    // Update project
    const { error: updErr } = await supabase.from('projects').update({
      current_stage_id: stage.id, status: nextStatus, updated_at: new Date().toISOString(),
    }).eq('id', projectId);
    if (updErr) console.error('advanceProjectStage: update project error', updErr);

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
      production: fullProj?.production_person_id, delivery: fullProj?.shipping_person_id,
      shipping: fullProj?.shipping_person_id, installation: fullProj?.shipping_person_id,
      'customer-care': fullProj?.care_person_id,
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
      delivery: [{ title: 'Đóng gói sản phẩm', priority: 'medium' },{ title: 'Sắp xếp xe vận chuyển', priority: 'medium' },{ title: 'Giao hàng đến công trình', priority: 'high' },{ title: 'Chuẩn bị vật tư lắp đặt', priority: 'medium' },{ title: 'Lắp đặt tại công trình', priority: 'high' },{ title: 'Nghiệm thu với khách hàng', priority: 'urgent' }],
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
    // Sort by stage order_index + parse auto_condition to array
    const sorted = (data || [])
      .sort((a, b) => (a.stage?.order_index || 0) - (b.stage?.order_index || 0))
      .map(r => {
        let conditions = [];
        try { conditions = JSON.parse(r.auto_condition); } catch { conditions = [r.auto_condition || 'all_tasks_done']; }
        if (!Array.isArray(conditions)) conditions = [conditions];
        return { ...r, auto_conditions: conditions };
      });
    res.json({ rules: sorted });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT update rule for a stage
r.put('/rules/:stageId', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role))
      return res.status(403).json({ error: 'Không có quyền' });

    const { approval_mode, auto_condition, auto_conditions, description } = req.body;
    const update = { updated_at: new Date().toISOString() };
    if (approval_mode !== undefined) update.approval_mode = approval_mode;
    // Support both single (auto_condition) and multiple (auto_conditions) 
    if (auto_conditions !== undefined) {
      // Save as JSON string for VARCHAR column compatibility
      update.auto_condition = JSON.stringify(auto_conditions);
    } else if (auto_condition !== undefined) {
      update.auto_condition = auto_condition;
    }
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

        // ═══ THÔNG BÁO: TỰ ĐỘNG DUYỆT ═══
        const { data: curStageAuto } = await supabase.from('workflow_stages')
          .select('name').eq('id', proj.current_stage_id).single();

        // Notify requester
        await supabase.from('notifications').insert({
          user_id: req.user.userId,
          type: 'approval_auto',
          title: `⚡ Tự động duyệt: ${proj.code}`,
          message: `Giai đoạn "${curStageAuto?.name}" đã được tự động duyệt.\n✅ ${autoResult.reason}`,
          entity_type: 'project', entity_id: projectId,
          metadata: { approval_id: approval.id, project_id: projectId, nav_tab: 'approvals', type: 'approval_auto', stage_name: curStageAuto?.name },
        });

        // Notify project manager + all admin/managers
        const { data: projFullAuto } = await supabase.from('projects')
          .select('project_manager_id,sales_person_id').eq('id', projectId).single();
        const { data: adminsAuto } = await supabase.from('users')
          .select('id').in('role', ['admin', 'sales_admin', 'manager']).eq('is_active', true);
        const notifyIdsAuto = new Set([
          ...(adminsAuto || []).map(a => a.id),
          projFullAuto?.project_manager_id,
          projFullAuto?.sales_person_id,
        ].filter(id => id && id !== req.user.userId));
        for (const uid of notifyIdsAuto) {
          const { data: nData } = await supabase.from('notifications').insert({
            user_id: uid, type: 'approval_auto',
            title: `⚡ Tự động duyệt: ${proj.code}`,
            message: `${req.user.fullName} — GĐ "${curStageAuto?.name}" tự động duyệt.\n✅ ${autoResult.reason}`,
            entity_type: 'project', entity_id: projectId,
            metadata: { approval_id: approval.id, project_id: projectId, nav_tab: 'approvals', type: 'approval_auto' },
          }).select().single();
          const pushFn = req.app.get('pushNotification');
          if (pushFn && nData) pushFn(uid, nData);
        }

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

    // ═══ THÔNG BÁO: CHỜ DUYỆT ═══
    const approverId = proj.project_manager_id || proj.sales_person_id;
    const { data: curStage } = await supabase.from('workflow_stages')
      .select('name').eq('id', proj.current_stage_id).single();

    const approvalMeta = {
      approval_id: approval.id, project_id: projectId, nav_tab: 'approvals',
      type: 'approval_request', stage_name: curStage?.name,
      notes: notes || null, attachments: attachments || [],
    };

    // Notify project manager
    if (approverId && approverId !== req.user.userId) {
      const { data: nData } = await supabase.from('notifications').insert({
        user_id: approverId, type: 'approval_request',
        title: `🔍 Chờ duyệt: ${proj.code}`,
        message: `${req.user.fullName} yêu cầu duyệt GĐ "${curStage?.name}" — DA ${proj.code}${notes ? `\n📝 ${notes}` : ''}`,
        entity_type: 'project', entity_id: projectId, metadata: approvalMeta,
      }).select().single();
      const pushFn = req.app.get('pushNotification');
      if (pushFn && nData) pushFn(approverId, nData);
    }

    // Notify all admin/managers
    const { data: admins } = await supabase.from('users')
      .select('id').in('role', ['admin', 'sales_admin', 'manager']).eq('is_active', true);
    if (admins?.length) {
      const adminIds = admins.map(a => a.id).filter(id => id && id !== approverId && id !== req.user.userId);
      for (const uid of adminIds) {
        const { data: nData } = await supabase.from('notifications').insert({
          user_id: uid, type: 'approval_request',
          title: `🔍 Chờ duyệt: ${proj.code}`,
          message: `${req.user.fullName} yêu cầu duyệt GĐ "${curStage?.name}" — DA ${proj.code}`,
          entity_type: 'project', entity_id: projectId, metadata: approvalMeta,
        }).select().single();
        const pushFn = req.app.get('pushNotification');
        if (pushFn && nData) pushFn(uid, nData);
      }
    }

    // Confirm to requester
    await supabase.from('notifications').insert({
      user_id: req.user.userId, type: 'approval_request',
      title: `📤 Đã gửi yêu cầu duyệt: ${proj.code}`,
      message: `Yêu cầu duyệt GĐ "${curStage?.name}" đã được gửi. Chờ quản lý phê duyệt.`,
      entity_type: 'project', entity_id: projectId,
      metadata: { approval_id: approval.id, project_id: projectId, nav_tab: 'approvals', type: 'approval_sent' },
    });

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
      .select('id,code,name,project_manager_id,sales_person_id').eq('id', approval.project_id).single();

    const decideMeta = {
      approval_id: approval.id, project_id: approval.project_id,
      nav_tab: 'approvals', stage_name: approval.stage?.name,
    };

    if (action === 'approve') {
      // ═══ THÔNG BÁO: ĐÃ DUYỆT ═══
      // Notify requester
      const { data: n1 } = await supabase.from('notifications').insert({
        user_id: approval.requested_by, type: 'approval_approved',
        title: `✅ Đã duyệt: ${proj?.code}`,
        message: `${req.user.fullName} đã duyệt GĐ "${approval.stage?.name}" — DA ${proj?.code}${approve_notes ? `\n📝 ${approve_notes}` : ''}`,
        entity_type: 'project', entity_id: approval.project_id,
        metadata: { ...decideMeta, type: 'approval_approved' },
      }).select().single();
      const pushFn1 = req.app.get('pushNotification');
      if (pushFn1 && n1) pushFn1(approval.requested_by, n1);

      // Notify all team members
      const { data: projTeam } = await supabase.from('projects').select(
        'consulting_person_id,design_person_id,quotation_person_id,contract_person_id,production_person_id,shipping_person_id,installation_person_id,care_person_id,sales_person_id,designer_id,project_manager_id'
      ).eq('id', approval.project_id).single();
      if (projTeam) {
        const teamIds = new Set([
          projTeam.consulting_person_id, projTeam.design_person_id, projTeam.quotation_person_id,
          projTeam.contract_person_id, projTeam.production_person_id, projTeam.shipping_person_id,
          projTeam.installation_person_id, projTeam.care_person_id,
          projTeam.sales_person_id, projTeam.designer_id, projTeam.project_manager_id,
        ].filter(id => id && id !== req.user.userId && id !== approval.requested_by));
        for (const uid of teamIds) {
          const { data: nData } = await supabase.from('notifications').insert({
            user_id: uid, type: 'approval_approved',
            title: `✅ Duyệt xong: ${proj?.code}`,
            message: `GĐ "${approval.stage?.name}" đã được duyệt bởi ${req.user.fullName}`,
            entity_type: 'project', entity_id: approval.project_id,
            metadata: { ...decideMeta, type: 'approval_approved' },
          }).select().single();
          const pushFn = req.app.get('pushNotification');
          if (pushFn && nData) pushFn(uid, nData);
        }
      }

      await logActivity(req.user.userId, 'approval_approved', 'project', approval.project_id,
        `Duyệt giai đoạn "${approval.stage?.name}"`);

      // ═══ TỰ ĐỘNG CHUYỂN GIAI ĐOẠN SAU KHI DUYỆT ═══
      if (approval.next_stage_slug && approval.next_status) {
        await advanceProjectStage(req, approval.project_id, approval.next_stage_slug, approval.next_status, approval.notes, approval.attachments);
      }

    } else {
      // ═══ THÔNG BÁO: TỪ CHỐI ═══
      // Notify requester with reject reason
      const { data: n2 } = await supabase.from('notifications').insert({
        user_id: approval.requested_by, type: 'approval_rejected',
        title: `❌ Từ chối duyệt: ${proj?.code}`,
        message: `${req.user.fullName} từ chối GĐ "${approval.stage?.name}"\n📝 Lý do: ${reject_reason}`,
        entity_type: 'project', entity_id: approval.project_id,
        metadata: { ...decideMeta, type: 'approval_rejected', reject_reason },
      }).select().single();
      const pushFn2 = req.app.get('pushNotification');
      if (pushFn2 && n2) pushFn2(approval.requested_by, n2);

      // Notify project manager too
      const pmId = proj?.project_manager_id || proj?.sales_person_id;
      if (pmId && pmId !== req.user.userId && pmId !== approval.requested_by) {
        const { data: nPm } = await supabase.from('notifications').insert({
          user_id: pmId, type: 'approval_rejected',
          title: `❌ Từ chối duyệt: ${proj?.code}`,
          message: `GĐ "${approval.stage?.name}" bị từ chối — Lý do: ${reject_reason}`,
          entity_type: 'project', entity_id: approval.project_id,
          metadata: { ...decideMeta, type: 'approval_rejected', reject_reason },
        }).select().single();
        const pushFn = req.app.get('pushNotification');
        if (pushFn && nPm) pushFn(pmId, nPm);
      }

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

    // ═══ THÔNG BÁO: GỬI LẠI YÊU CẦU DUYỆT ═══
    const { data: proj } = await supabase.from('projects')
      .select('id,code,project_manager_id,sales_person_id')
      .eq('id', old.project_id).single();

    const reRequestMeta = {
      approval_id: approval.id, project_id: old.project_id,
      nav_tab: 'approvals', type: 'approval_re_request', stage_name: approval.stage?.name,
    };

    // Notify project manager
    const approverId = proj?.project_manager_id || proj?.sales_person_id;
    if (approverId && approverId !== req.user.userId) {
      const { data: nData } = await supabase.from('notifications').insert({
        user_id: approverId, type: 'approval_request',
        title: `🔄 Gửi lại yêu cầu: ${proj?.code}`,
        message: `${req.user.fullName} gửi lại yêu cầu duyệt GĐ "${approval.stage?.name}" — DA ${proj?.code}`,
        entity_type: 'project', entity_id: old.project_id, metadata: reRequestMeta,
      }).select().single();
      const pushFn = req.app.get('pushNotification');
      if (pushFn && nData) pushFn(approverId, nData);
    }

    // Notify all admin/managers
    const { data: adminsRe } = await supabase.from('users')
      .select('id').in('role', ['admin', 'sales_admin', 'manager']).eq('is_active', true);
    if (adminsRe?.length) {
      for (const a of adminsRe) {
        if (a.id === approverId || a.id === req.user.userId) continue;
        const { data: nData } = await supabase.from('notifications').insert({
          user_id: a.id, type: 'approval_request',
          title: `🔄 Gửi lại yêu cầu: ${proj?.code}`,
          message: `${req.user.fullName} gửi lại yêu cầu duyệt GĐ "${approval.stage?.name}"`,
          entity_type: 'project', entity_id: old.project_id, metadata: reRequestMeta,
        }).select().single();
        const pushFn = req.app.get('pushNotification');
        if (pushFn && nData) pushFn(a.id, nData);
      }
    }

    res.json({ approval });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ─── Auto-approval checker ──
// Supports both single condition (string) and multiple conditions (array)
// When multiple: ALL conditions must pass (AND logic)
async function checkAutoApproval(projectId, stageId, conditionInput) {
  try {
    // Normalize: string → array
    let conditions = [];
    if (Array.isArray(conditionInput)) {
      conditions = conditionInput;
    } else if (typeof conditionInput === 'string') {
      try { conditions = JSON.parse(conditionInput); } catch { conditions = [conditionInput]; }
    }
    if (!conditions.length) conditions = ['all_tasks_done'];

    // Get all tasks for this project+stage
    const { data: tasks } = await supabase.from('tasks')
      .select('id,status').eq('project_id', projectId).eq('stage_id', stageId);

    if (!tasks?.length) return { approved: false, reason: 'Không có tasks' };

    // Check all tasks done first (always required)
    const allDone = tasks.every(t => t.status === 'done');
    if (!allDone) return { approved: false, reason: 'Còn tasks chưa hoàn thành' };

    // If only 'all_tasks_done', pass immediately
    if (conditions.length === 1 && conditions[0] === 'all_tasks_done') {
      return { approved: true, reason: 'Tất cả tasks đã hoàn thành' };
    }

    const taskIds = tasks.map(t => t.id);
    const failedConditions = [];
    const passedConditions = [];

    for (const condition of conditions) {
      if (condition === 'all_tasks_done') {
        passedConditions.push('Tất cả tasks hoàn thành');
        continue;
      }

      switch (condition) {
        case 'checklist_complete': {
          const { data: checklists } = await supabase.from('task_checklists')
            .select('id,is_completed').in('task_id', taskIds);
          if (!checklists?.length) { passedConditions.push('Không có checklist'); break; }
          const allChecked = checklists.every(c => c.is_completed);
          if (allChecked) passedConditions.push('Checklist đã tick hết');
          else failedConditions.push(`${checklists.filter(c => !c.is_completed).length} checklist chưa tick`);
          break;
        }

        case 'checklist_has_files': {
          const { data: checklists } = await supabase.from('task_checklists')
            .select('id,attachments').in('task_id', taskIds);
          if (!checklists?.length) { passedConditions.push('Không có checklist'); break; }
          const allHave = checklists.every(c => (c.attachments || []).length > 0);
          if (allHave) passedConditions.push('Checklist có file');
          else failedConditions.push('Một số checklist chưa có file');
          break;
        }

        case 'checklist_has_notes': {
          const { data: checklists } = await supabase.from('task_checklists')
            .select('id,notes').in('task_id', taskIds);
          if (!checklists?.length) { passedConditions.push('Không có checklist'); break; }
          const allHave = checklists.every(c => c.notes?.trim());
          if (allHave) passedConditions.push('Checklist có ghi chú');
          else failedConditions.push('Một số checklist chưa có ghi chú');
          break;
        }

        case 'checklist_has_files_or_notes': {
          const { data: checklists } = await supabase.from('task_checklists')
            .select('id,attachments,notes').in('task_id', taskIds);
          if (!checklists?.length) { passedConditions.push('Không có checklist'); break; }
          const allHave = checklists.every(c => (c.attachments || []).length > 0 || c.notes?.trim());
          if (allHave) passedConditions.push('Checklist có file hoặc ghi chú');
          else failedConditions.push('Một số checklist chưa có file hoặc ghi chú');
          break;
        }

        default:
          failedConditions.push(`Điều kiện không hợp lệ: ${condition}`);
      }
    }

    if (failedConditions.length === 0) {
      return { approved: true, reason: passedConditions.join(' + ') };
    } else {
      return { approved: false, reason: failedConditions.join('; ') };
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

    // Parse conditions
    let conditions = [];
    try { conditions = JSON.parse(rule.auto_condition); } catch { conditions = [rule.auto_condition || 'all_tasks_done']; }
    if (!Array.isArray(conditions)) conditions = [conditions];

    if (rule.approval_mode === 'auto') {
      const result = await checkAutoApproval(req.params.projectId, proj.current_stage_id, conditions);
      return res.json({ mode: 'auto', rule: { ...rule, auto_conditions: conditions }, auto_check: result });
    }

    res.json({ mode: rule.approval_mode, rule: { ...rule, auto_conditions: conditions }, auto_check: null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = r;
