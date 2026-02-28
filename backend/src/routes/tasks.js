const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');

const r = Router();
r.use(auth);

// ─── HELPER ──────────────────────────────────────────────
function notify(io, event, data) { if (io) io.emit(event, data); }

async function createNotification(req, userId, type, title, message, entityType, entityId) {
  if (!userId || userId === req.user.userId) return;
  const { data, error } = await supabase.from('notifications').insert({
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

// ─── LIST TASKS (Kanban group_by=status / List / My tasks) ──
r.get('/', async (req, res) => {
  try {
    const { project_id, status, assignee_id, priority, search, group_by, task_type } = req.query;
    let q = supabase.from('tasks').select(`
      *, projects(id,code,name),
      assignee:users!tasks_assignee_id_fkey(id,full_name,avatar),
      creator:users!tasks_created_by_id_fkey(id,full_name),
      stage:workflow_stages(id,name,color)
    `).order('order_index').order('created_at', { ascending: false });

    if (project_id) q = q.eq('project_id', project_id);
    if (status) q = q.eq('status', status);
    if (assignee_id) q = q.eq('assignee_id', assignee_id);
    if (priority) q = q.eq('priority', priority);
    if (search) q = q.ilike('title', `%${search}%`);
    if (task_type) q = q.eq('task_type', task_type);

    // ── ROLE-BASED: non-admin sees all tasks in a stage/project (view-only enforced frontend) ──
    // Only restrict to assignee if no stage_id and no project_id (e.g. general task list)
    const userRole = req.user.role;
    if (userRole && !['admin', 'manager'].includes(userRole)) {
      if (!req.query.project_id && !req.query.stage_id) {
        q = q.eq('assignee_id', req.user.userId);
      }
    }

    // Filter by stage_id (for StageView)
    if (req.query.stage_id) q = q.eq('stage_id', req.query.stage_id);

    const { data, error } = await q;
    if (error) throw error;

    if (group_by === 'status') {
      const cols = { pending: [], todo: [], in_progress: [], review: [], done: [], blocked: [], deferred: [] };
      data?.forEach(t => { if (cols[t.status]) cols[t.status].push(t); else if (cols.todo) cols.todo.push(t); });
      return res.json({ columns: cols, total: data?.length });
    }

    res.json({ tasks: data, total: data?.length });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ─── MY TASKS ──
r.get('/my', async (req, res) => {
  try {
    const { data } = await supabase.from('tasks').select(`
      *, projects(id,code,name), stage:workflow_stages(id,name,color)
    `).eq('assignee_id', req.user.userId).neq('status', 'done').order('due_date');
    res.json({ tasks: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// ─── OVERDUE TASKS ──
r.get('/overdue', async (req, res) => {
  try {
    const { data } = await supabase.from('tasks').select(`
      *, projects(id,code,name),
      assignee:users!tasks_assignee_id_fkey(id,full_name)
    `).lt('due_date', new Date().toISOString()).neq('status', 'done').order('due_date');
    res.json({ tasks: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// ─── GET TASK DETAIL ──
r.get('/:id', async (req, res) => {
  try {
    const { data: task, error } = await supabase.from('tasks').select(`
      *, projects(id,code,name),
      assignee:users!tasks_assignee_id_fkey(id,full_name,avatar,email),
      creator:users!tasks_created_by_id_fkey(id,full_name,avatar),
      stage:workflow_stages(id,name,color)
    `).eq('id', req.params.id).single();
    if (error) throw error;

    // Load sub-resources (defensive — tables may not exist if migration 03 not run)
    let participants = [], checklists = [], comments = [], timeLogs = [];
    try {
      const r1 = await supabase.from('task_participants').select('*, user:users(id,full_name,avatar)').eq('task_id', req.params.id).order('created_at');
      participants = r1.data || [];
    } catch { }
    try {
      const r2 = await supabase.from('task_checklists').select('*').eq('task_id', req.params.id).order('order_index');
      checklists = r2.data || [];
    } catch { }
    try {
      const r3 = await supabase.from('task_comments').select('*, user:users(id,full_name,avatar)').eq('task_id', req.params.id).order('created_at', { ascending: false });
      comments = r3.data || [];
    } catch { }
    try {
      const r4 = await supabase.from('task_time_logs').select('*, user:users(id,full_name)').eq('task_id', req.params.id).order('started_at', { ascending: false });
      timeLogs = r4.data || [];
    } catch { }

    res.json({
      task: {
        ...task,
        participants,
        checklists,
        comments,
        timeLogs,
      }
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ─── CREATE TASK ──
r.post('/', async (req, res) => {
  try {
    const b = req.body;
    const { data, error } = await supabase.from('tasks').insert({
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
    }).select().single();
    if (error) throw error;

    // Add participants & observers
    if (b.participants?.length) {
      await supabase.from('task_participants').insert(
        b.participants.map(p => ({ task_id: data.id, user_id: p.user_id, role: p.role || 'participant' }))
      );
      // Notify participants
      for (const p of b.participants) {
        if (p.user_id !== req.user.userId) {
          const role = p.role === 'observer' ? 'quan sát' : 'hỗ trợ';
          await createNotification(req, p.user_id, 'task_assigned', '👥 Thêm vào công việc',
            `Bạn được thêm vào "${b.title}" với vai trò ${role}`, 'task', data.id);
        }
      }
    }

    // Add checklists
    if (b.checklists?.length) {
      await supabase.from('task_checklists').insert(
        b.checklists.map((c, i) => ({
          task_id: data.id, title: c.title || c, order_index: i,
          attachments: c.attachments || [],
        }))
      );
    }

    // Save file attachments to DB
    if (b.attachments?.length) {
      await supabase.from('file_attachments').insert(
        b.attachments.map(f => ({
          entity_type: 'task', entity_id: data.id,
          file_name: f.file_name, file_url: f.file_url,
          file_size: f.file_size, mime_type: f.mime_type,
          uploaded_by: req.user.userId,
        }))
      );
    }

    // Notification — giao việc
    if (b.assignee_id && b.assignee_id !== req.user.userId) {
      await createNotification(req, b.assignee_id, 'task_assigned', '📌 Công việc mới',
        `Bạn được giao: "${b.title}"${b.due_date ? ` — Hạn: ${new Date(b.due_date).toLocaleDateString('vi-VN')}` : ''}`,
        'task', data.id);
    }

    // Notification — project team (only for project tasks)
    if (b.project_id) {
      const { data: proj } = await supabase.from('projects').select('sales_person_id,designer_id,project_manager_id,code').eq('id', b.project_id).single();
      if (proj) {
        const teamIds = [proj.sales_person_id, proj.designer_id, proj.project_manager_id].filter(Boolean);
        await notifyMultiple(req, [...teamIds, b.assignee_id], 'task_created',
          '✅ Công việc mới', `Công việc "${b.title}" được tạo trong dự án ${proj.code}`,
          'task', data.id);
      }
    }

    await logActivity(req.user.userId, 'created', 'task', data.id, `Tạo task: ${b.title}`);
    const io = req.app.get('io');
    notify(io, 'task:created', data);
    res.status(201).json({ task: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ─── UPDATE TASK ──
r.put('/:id', async (req, res) => {
  try {
    const b = req.body;
    const update = { updated_at: new Date().toISOString() };

    // Pick allowed fields
    const fields = ['title','description','status','priority','assignee_id','due_date','start_date','estimated_hours','actual_hours','stage_id','order_index'];
    fields.forEach(f => { if (b[f] !== undefined) update[f] = b[f]; });

    if (update.status === 'done') update.completed_at = new Date().toISOString();
    if (update.status === 'in_progress' && !b.start_date) update.start_date = new Date().toISOString();

    // Get old values
    const { data: old } = await supabase.from('tasks').select('status,assignee_id,title').eq('id', req.params.id).single();

    const { data, error } = await supabase.from('tasks').update(update).eq('id', req.params.id).select().single();
    if (error) throw error;

    // Notifications on status change
    if (old && update.status && update.status !== old.status) {
      // Nếu chuyển sang review → thông báo cho người tạo
      if (update.status === 'review' && data.created_by_id) {
        await createNotification(req, data.created_by_id, 'task_updated', 'Chờ nghiệm thu', `Task "${old.title}" đã hoàn thành, chờ bạn kiểm tra`, 'task', data.id);
      }
      // Nếu người giao duyệt xong → thông báo cho người thực hiện
      if (update.status === 'done' && data.assignee_id) {
        await createNotification(req, data.assignee_id, 'task_updated', 'Task đã duyệt', `Task "${old.title}" đã được nghiệm thu`, 'task', data.id);
      }
      await logActivity(req.user.userId, 'status_changed', 'task', data.id, `Chuyển trạng thái: ${old.status} → ${update.status}`, { status: old.status }, { status: update.status });
    }

    // Notification on reassign
    if (update.assignee_id && update.assignee_id !== old?.assignee_id) {
      await createNotification(req, update.assignee_id, 'task_assigned', 'Được giao task', `Bạn được giao: ${data.title}`, 'task', data.id);
    }

    const io = req.app.get('io');
    notify(io, 'task:updated', data);

    res.json({ task: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ─── KANBAN: CHANGE STATUS ──
r.patch('/:id/status', async (req, res) => {
  try {
    const update = { status: req.body.status, updated_at: new Date().toISOString() };
    if (req.body.order_index !== undefined) update.order_index = req.body.order_index;
    if (update.status === 'done') update.completed_at = new Date().toISOString();
    if (update.status === 'in_progress') update.start_date = update.start_date || new Date().toISOString();

    const { data: old } = await supabase.from('tasks').select('status,title,created_by_id,assignee_id').eq('id', req.params.id).single();

    const { data, error } = await supabase.from('tasks').update(update).eq('id', req.params.id).select().single();
    if (error) throw error;

    // Auto notifications
    if (old && update.status !== old.status) {
      if (update.status === 'review' && old.created_by_id) {
        await createNotification(req, old.created_by_id, 'task_updated', '📋 Chờ nghiệm thu', `Task "${old.title}" chờ kiểm tra`, 'task', data.id);
      }
      if (update.status === 'done' && old.assignee_id) {
        await createNotification(req, old.assignee_id, 'task_updated', '✅ Task hoàn thành', `Task "${old.title}" đã duyệt`, 'task', data.id);
      }
      await logActivity(req.user.userId, 'status_changed', 'task', data.id, `${old.status} → ${update.status}`);

      // ── CHECK AUTO-ADVANCE: if all stage tasks done → notify PM ──
      if (update.status === 'done' && data.project_id && data.stage_id) {
        const { data: stageTasks } = await supabase.from('tasks')
          .select('id,status').eq('project_id', data.project_id).eq('stage_id', data.stage_id);
        const allDone = stageTasks?.length > 0 && stageTasks.every(t => t.status === 'done');
        if (allDone) {
          const { data: proj } = await supabase.from('projects')
            .select('code,name,sales_person_id,designer_id,project_manager_id,current_stage_id').eq('id', data.project_id).single();
          const { data: stage } = await supabase.from('workflow_stages').select('name').eq('id', data.stage_id).single();
          if (proj) {
            const teamIds = [proj.sales_person_id, proj.designer_id, proj.project_manager_id].filter(Boolean);
            await notifyMultiple(req, teamIds, 'stage_changed',
              `🎉 Hoàn thành giai đoạn "${stage?.name}"`,
              `Tất cả công việc giai đoạn "${stage?.name}" của dự án ${proj.code} đã hoàn thành. Sẵn sàng chuyển giai đoạn tiếp theo!`,
              'project', data.project_id);
          }
        }
      }
    }

    const io = req.app.get('io');
    notify(io, 'task:updated', data);
    res.json({ task: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ─── DELETE TASK ──
r.delete('/:id', async (req, res) => {
  try {
    const { data: task } = await supabase.from('tasks').select('title').eq('id', req.params.id).single();
    await supabase.from('tasks').delete().eq('id', req.params.id);
    await logActivity(req.user.userId, 'deleted', 'task', req.params.id, `Xóa task: ${task?.title}`);
    res.json({ message: 'Đã xóa' });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// ═══════════════════════════════════════════════════════════
// SUB-RESOURCES: Checklist, Comments, Time Tracking, Participants
// ═══════════════════════════════════════════════════════════

// ─── CHECKLISTS ──
r.get('/:id/checklists', async (req, res) => {
  try {
    const { data } = await supabase.from('task_checklists').select('*').eq('task_id', req.params.id).order('order_index');
    res.json({ checklists: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

r.post('/:id/checklists', async (req, res) => {
  try {
    const { data, error } = await supabase.from('task_checklists').insert({
      task_id: req.params.id, title: req.body.title, order_index: req.body.order_index || 0,
      attachments: req.body.attachments || [],
    }).select().single();
    if (error) throw error;
    res.status(201).json({ checklist: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

r.patch('/:taskId/checklists/:clId', async (req, res) => {
  try {
    const update = {};
    if (req.body.title !== undefined) update.title = req.body.title;
    if (req.body.is_completed !== undefined) {
      update.is_completed = req.body.is_completed;
      update.completed_by = req.body.is_completed ? req.user.userId : null;
      update.completed_at = req.body.is_completed ? new Date().toISOString() : null;
    }
    if (req.body.order_index !== undefined) update.order_index = req.body.order_index;
    if (req.body.notes !== undefined) update.notes = req.body.notes;
    if (req.body.attachments !== undefined) update.attachments = req.body.attachments;

    const { data, error } = await supabase.from('task_checklists').update(update).eq('id', req.params.clId).select().single();
    if (error) throw error;
    res.json({ checklist: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

r.delete('/:taskId/checklists/:clId', async (req, res) => {
  try {
    await supabase.from('task_checklists').delete().eq('id', req.params.clId);
    res.json({ message: 'Đã xóa' });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// ─── COMMENTS ──
r.get('/:id/comments', async (req, res) => {
  try {
    const { data } = await supabase.from('task_comments').select('*, user:users(id,full_name,avatar)').eq('task_id', req.params.id).order('created_at', { ascending: false });
    res.json({ comments: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

r.post('/:id/comments', async (req, res) => {
  try {
    const { data, error } = await supabase.from('task_comments').insert({
      task_id: req.params.id, user_id: req.user.userId, content: req.body.content,
      attachments: req.body.attachments || [],
    }).select('*, user:users(id,full_name,avatar)').single();
    if (error) throw error;

    // Save file attachments
    if (req.body.attachments?.length) {
      await supabase.from('file_attachments').insert(
        req.body.attachments.map(f => ({
          entity_type: 'comment', entity_id: data.id,
          file_name: f.file_name, file_url: f.file_url,
          file_size: f.file_size, mime_type: f.mime_type,
          uploaded_by: req.user.userId,
        }))
      );
    }

    // Notify assignee, creator & all participants
    const { data: task } = await supabase.from('tasks').select('assignee_id,created_by_id,title').eq('id', req.params.id).single();
    const { data: participants } = await supabase.from('task_participants').select('user_id').eq('task_id', req.params.id);
    if (task) {
      const allIds = [task.assignee_id, task.created_by_id, ...(participants || []).map(p => p.user_id)];
      await notifyMultiple(req, allIds, 'comment_added',
        '💬 Bình luận mới', `${req.user.fullName} bình luận: "${task.title}"`, 'task', req.params.id);
    }

    const io = req.app.get('io');
    notify(io, 'task:comment', { taskId: req.params.id, comment: data });
    res.status(201).json({ comment: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

r.delete('/:taskId/comments/:commentId', async (req, res) => {
  try {
    await supabase.from('task_comments').delete().eq('id', req.params.commentId).eq('user_id', req.user.userId);
    res.json({ message: 'Đã xóa' });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// ─── TIME TRACKING ──
r.get('/:id/time-logs', async (req, res) => {
  try {
    const { data } = await supabase.from('task_time_logs').select('*, user:users(id,full_name)').eq('task_id', req.params.id).order('started_at', { ascending: false });
    res.json({ timeLogs: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

r.post('/:id/time-logs', async (req, res) => {
  try {
    const b = req.body;
    const entry = {
      task_id: req.params.id,
      user_id: req.user.userId,
      started_at: b.started_at || new Date().toISOString(),
      ended_at: b.ended_at || null,
      duration_minutes: b.duration_minutes || null,
      description: b.description || null,
    };
    // Auto calc duration
    if (entry.ended_at && entry.started_at && !entry.duration_minutes) {
      entry.duration_minutes = Math.round((new Date(entry.ended_at) - new Date(entry.started_at)) / 60000);
    }
    const { data, error } = await supabase.from('task_time_logs').insert(entry).select().single();
    if (error) throw error;

    // Update actual_hours on task
    const { data: logs } = await supabase.from('task_time_logs').select('duration_minutes').eq('task_id', req.params.id).not('duration_minutes', 'is', null);
    const totalMinutes = logs?.reduce((s, l) => s + (l.duration_minutes || 0), 0) || 0;
    await supabase.from('tasks').update({ actual_hours: Math.round(totalMinutes / 6) / 10 }).eq('id', req.params.id);

    res.status(201).json({ timeLog: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

r.delete('/:taskId/time-logs/:logId', async (req, res) => {
  try {
    await supabase.from('task_time_logs').delete().eq('id', req.params.logId).eq('user_id', req.user.userId);
    res.json({ message: 'Đã xóa' });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// ─── PARTICIPANTS (Người hỗ trợ & Quan sát) ──
r.get('/:id/participants', async (req, res) => {
  try {
    const { data } = await supabase.from('task_participants').select('*, user:users(id,full_name,avatar)').eq('task_id', req.params.id);
    res.json({ participants: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

r.post('/:id/participants', async (req, res) => {
  try {
    const { data, error } = await supabase.from('task_participants').insert({
      task_id: req.params.id, user_id: req.body.user_id, role: req.body.role || 'participant',
    }).select('*, user:users(id,full_name,avatar)').single();
    if (error) throw error;

    if (req.body.user_id !== req.user.userId) {
      const role = req.body.role === 'observer' ? 'quan sát' : 'hỗ trợ';
      await createNotification(req, req.body.user_id, 'task_assigned', `Bạn được thêm vào task`, `Vai trò: ${role}`, 'task', req.params.id);
    }

    res.status(201).json({ participant: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

r.delete('/:taskId/participants/:userId', async (req, res) => {
  try {
    await supabase.from('task_participants').delete().eq('task_id', req.params.taskId).eq('user_id', req.params.userId);
    res.json({ message: 'Đã xóa' });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

module.exports = r;
