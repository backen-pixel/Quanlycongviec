/**
 * Core mutations cho bảng tasks — dùng chung từ /api/tasks và /api/work-tasks gateway.
 */
const { supabase } = require('../config/supabase');
const { scheduleNextWorkshopTaskAfterComplete } = require('./workshopApplyTemplates');
const { createNotification: createNotif, notifyMultiple: notifyMultipleShared } = require('./notifications');

function taskProjectMeta(projectId) {
  if (projectId == null || projectId === '') return null;
  return { project_id: String(projectId) };
}

async function createNotification(req, userId, type, title, message, entityType, entityId, metadata) {
  return createNotif(req, userId, type, title, message, entityType, entityId, metadata || null);
}

async function notifyMultiple(req, userIds, type, title, message, entityType, entityId, metadata) {
  return notifyMultipleShared(req, userIds, type, title, message, entityType, entityId, metadata || null);
}

async function logActivity(userId, action, entityType, entityId, description, oldValues, newValues) {
  await supabase.from('activity_logs').insert({
    user_id: userId, action, entity_type: entityType, entity_id: entityId,
    description, old_values: oldValues, new_values: newValues,
  });
}

function notify(io, event, data) { if (io) io.emit(event, data); }

async function createProjectTask(req, body) {
  const b = body;
  const meta = b.metadata && typeof b.metadata === 'object' && !Array.isArray(b.metadata)
    ? b.metadata
    : null;
  const insertRow = {
    project_id: b.project_id || null,
    stage_id: b.stage_id || null,
    workflow_line_id: b.workflow_line_id || null,
    title: b.title,
    description: b.description || null,
    priority: b.priority || 'medium',
    status: b.status || 'pending',
    assignee_id: b.assignee_id || null,
    created_by_id: req.user.userId,
    due_date: b.due_date || null,
    start_date: b.start_date || null,
    estimated_hours: b.estimated_hours || null,
    attachments: b.attachments || [],
    task_type: b.task_type || 'project',
  };
  if (meta) insertRow.metadata = meta;

  let { data, error } = await supabase.from('tasks').insert(insertRow).select().single();
  if (error && /metadata/i.test(String(error.message || ''))) {
    const { metadata: _m, ...legacy } = insertRow;
    ({ data, error } = await supabase.from('tasks').insert(legacy).select().single());
  }
  if (error) return { error: error.message, status: 500 };

  if (b.participants?.length) {
    await supabase.from('task_participants').insert(
      b.participants.map((p) => ({ task_id: data.id, user_id: p.user_id, role: p.role || 'participant' }))
    );
    for (const p of b.participants) {
      if (p.user_id !== req.user.userId) {
        const role = p.role === 'observer' ? 'quan sát' : 'hỗ trợ';
        await createNotification(req, p.user_id, 'task_assigned', '👥 Thêm vào công việc',
          `Bạn được thêm vào "${b.title}" với vai trò ${role}`, 'task', data.id, taskProjectMeta(data.project_id));
      }
    }
  }

  if (b.checklists?.length) {
    for (const c of b.checklists) {
      await supabase.from('task_checklists').insert({
        task_id: data.id,
        title: c.title || c,
        order_index: b.checklists.indexOf(c),
        attachments: c.attachments || [],
        notes: c.notes || null,
      });
    }
  }

  if (b.attachments?.length) {
    await supabase.from('file_attachments').insert(
      b.attachments.map((f) => ({
        entity_type: 'task', entity_id: data.id,
        file_name: f.file_name, file_url: f.file_url,
        file_size: f.file_size, mime_type: f.mime_type,
        uploaded_by: req.user.userId,
      }))
    );
  }

  if (b.assignee_id && b.assignee_id !== req.user.userId) {
    await createNotification(req, b.assignee_id, 'task_assigned', '📌 Công việc mới',
      `Bạn được giao: "${b.title}"${b.due_date ? ` — Hạn: ${new Date(b.due_date).toLocaleDateString('vi-VN')}` : ''}`,
      'task', data.id, taskProjectMeta(data.project_id));
  }

  if (b.project_id) {
    const { data: proj } = await supabase.from('projects')
      .select('sales_person_id,designer_id,project_manager_id,production_person_id,code')
      .eq('id', b.project_id).single();
    if (proj) {
      const teamIds = proj.production_person_id
        ? [proj.production_person_id]
        : [proj.sales_person_id, proj.designer_id, proj.project_manager_id].filter(Boolean);
      const allIds = [...new Set([...teamIds, b.assignee_id].filter(Boolean))];
      await notifyMultiple(req, allIds, 'task_created',
        '✅ Công việc mới', `Công việc "${b.title}" được tạo trong dự án ${proj.code}`,
        'task', data.id, taskProjectMeta(b.project_id));
    }
  }

  await logActivity(req.user.userId, 'created', 'task', data.id, `Tạo task: ${b.title}`);
  notify(req.app?.get?.('io'), 'task:created', data);
  return { data: { task: data }, status: 201 };
}

async function updateProjectTask(req, taskId, body) {
  const b = body;
  const update = { updated_at: new Date().toISOString() };
  // tasks không có cột notes — ghi chú NV lưu ở task_comments
  const fields = ['title', 'description', 'status', 'priority', 'assignee_id', 'supervisor_id',
    'due_date', 'start_date', 'estimated_hours', 'actual_hours', 'stage_id', 'order_index',
    'blocks_stage_advance', 'production_stage_id', 'file_note_recorded', 'metadata'];
  fields.forEach((f) => {
    if (b[f] === undefined) return;
    if (f === 'file_note_recorded' || f === 'blocks_stage_advance') update[f] = !!b[f];
    else if (f === 'metadata' && b.metadata && typeof b.metadata === 'object') update.metadata = b.metadata;
    else if (f !== 'metadata') update[f] = b[f];
  });

  if (update.status === 'done') update.completed_at = new Date().toISOString();
  if (update.status === 'in_progress' && !b.start_date) update.start_date = new Date().toISOString();

  const { data: old, error: oldErr } = await supabase.from('tasks').select('status,assignee_id,title,created_by_id,project_id').eq('id', taskId).maybeSingle();
  if (oldErr) return { error: oldErr.message, status: 500 };
  if (!old) return { error: 'Không tìm thấy nhiệm vụ', status: 404 };

  let { data, error } = await supabase.from('tasks').update(update).eq('id', taskId).select().maybeSingle();
  if (error && /(blocks_stage_advance|production_stage_id|notes|file_note_recorded)/i.test(String(error.message || ''))) {
    const { blocks_stage_advance: _b, production_stage_id: _p, notes: _n, file_note_recorded: _f, ...legacy } = update;
    ({ data, error } = await supabase.from('tasks').update(legacy).eq('id', taskId).select().maybeSingle());
  }
  if (error) return { error: error.message, status: 500 };
  if (!data) return { error: 'Không cập nhật được nhiệm vụ', status: 500 };

  // Client cũ (PUT notes) → append task_comments thay vì cột tasks.notes
  const noteText = b.notes != null ? String(b.notes).trim() : '';
  if (noteText) {
    try {
      await supabase.from('task_comments').insert({
        task_id: taskId,
        user_id: req.user.userId,
        content: noteText,
        attachments: [],
      });
    } catch (noteErr) {
      console.warn('[tasks] notes → task_comments:', noteErr.message || noteErr);
    }
  }

  if (data?.project_id && (b.description !== undefined || noteText)) {
    try {
      const { upsertLeadDocumentFromProjectTask } = require('./syncProjectTaskToLeadDocument');
      await upsertLeadDocumentFromProjectTask(data, { userId: req.user.userId });
    } catch (syncErr) {
      console.warn('[tasks] sync task → lead_document:', syncErr.message);
    }
  }

  if (old && update.status && update.status !== old.status) {
    if (update.status === 'review' && data.created_by_id) {
      await createNotification(req, data.created_by_id, 'task_updated', 'Chờ nghiệm thu',
        `Công việc "${old.title}" đã hoàn thành, chờ bạn kiểm tra`, 'task', data.id, taskProjectMeta(data.project_id));
    }
    if (update.status === 'done' && data.assignee_id) {
      await createNotification(req, data.assignee_id, 'task_updated', 'Công việc đã duyệt',
        `Công việc "${old.title}" đã được nghiệm thu`, 'task', data.id, taskProjectMeta(data.project_id));
    }
    await logActivity(req.user.userId, 'status_changed', 'task', data.id, `${old.status} → ${update.status}`);
  }

  notify(req.app?.get?.('io'), 'task:updated', data);

  if (data?.status === 'done') {
    try { await scheduleNextWorkshopTaskAfterComplete(data); } catch (e) {
      console.warn('[tasks] workshop deadline chain:', e.message);
    }
  }

  return { data: { task: data }, status: 200 };
}

async function deleteProjectTask(req, taskId) {
  const { data: task } = await supabase.from('tasks').select('title').eq('id', taskId).single();
  if (!task) return { error: 'Không tìm thấy nhiệm vụ', status: 404 };
  await supabase.from('tasks').delete().eq('id', taskId);
  await logActivity(req.user.userId, 'deleted', 'task', taskId, `Xóa task: ${task?.title}`);
  return { data: { message: 'Đã xóa' }, status: 200 };
}

async function addProjectTaskComment(req, taskId, body) {
  const { data, error } = await supabase.from('task_comments').insert({
    task_id: taskId, user_id: req.user.userId, content: body.content,
    attachments: body.attachments || [],
  }).select('*, user:users(id,full_name,avatar)').single();
  if (error) return { error: error.message, status: 500 };

  if (body.attachments?.length) {
    await supabase.from('file_attachments').insert(
      body.attachments.map((f) => ({
        entity_type: 'comment', entity_id: data.id,
        file_name: f.file_name, file_url: f.file_url,
        file_size: f.file_size, mime_type: f.mime_type,
        uploaded_by: req.user.userId,
      }))
    );
  }

  const { data: task } = await supabase.from('tasks').select('assignee_id,created_by_id,title,project_id').eq('id', taskId).single();
  const { data: participants } = await supabase.from('task_participants').select('user_id').eq('task_id', taskId);
  if (task) {
    const allIds = [task.assignee_id, task.created_by_id, ...(participants || []).map((p) => p.user_id)];
    await notifyMultiple(req, allIds, 'comment_added',
      '💬 Bình luận mới', `${req.user.fullName || 'Ai đó'} bình luận: "${task.title}"`, 'task', taskId,
      taskProjectMeta(task.project_id));
  }
  return { data: { comment: data }, status: 201 };
}

async function toggleProjectTaskChecklist(req, taskId, checklistId, body) {
  const update = {};
  if (body.is_completed !== undefined) {
    update.is_completed = body.is_completed;
    update.completed_by = body.is_completed ? req.user.userId : null;
    update.completed_at = body.is_completed ? new Date().toISOString() : null;
  }
  const { data, error } = await supabase.from('task_checklists').update(update).eq('id', checklistId).select().single();
  if (error) return { error: error.message, status: 500 };
  return { data: { checklist: data }, status: 200 };
}

module.exports = {
  createProjectTask,
  updateProjectTask,
  deleteProjectTask,
  addProjectTaskComment,
  toggleProjectTaskChecklist,
};
