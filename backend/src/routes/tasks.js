const { Router } = require('express');
const { requirePermission } = require('../middleware/newPermission');
const { supabase } = require('../config/supabase');
const { scheduleNextWorkshopTaskAfterComplete } = require('../helpers/workshopApplyTemplates');
const { auth } = require('../middleware/auth');
const { createNotification: createNotif, notifyMultiple: notifyMultipleShared } = require('../helpers/notifications');
const {
  taskAttachmentVisibleForModuleAndUser,
  canViewerSeeByCompanyAndDept,
} = require('../helpers/documentShareScope');
const { isAdminLike } = require('../helpers/adminRole');
const {
  createProjectTask,
  updateProjectTask,
  deleteProjectTask,
} = require('../helpers/projectTaskMutations');

const r = Router();
r.use(auth);

// ─── HELPER ──────────────────────────────────────────────
function notify(io, event, data) { if (io) io.emit(event, data); }

// Wrapper for backward compatibility
async function createNotification(req, userId, type, title, message, entityType, entityId, metadata) {
  return await createNotif(req, userId, type, title, message, entityType, entityId, metadata || null);
}

async function notifyMultiple(req, userIds, type, title, message, entityType, entityId, metadata) {
  return await notifyMultipleShared(req, userIds, type, title, message, entityType, entityId, metadata || null);
}

/** Gắn vào metadata TB để preference «Thông báo dự án» lọc đúng CV thuộc DA */
function taskProjectMeta(projectId) {
  if (projectId == null || projectId === '') return null;
  return { project_id: String(projectId) };
}

async function logActivity(userId, action, entityType, entityId, description, oldValues, newValues) {
  await supabase.from('activity_logs').insert({ user_id: userId, action, entity_type: entityType, entity_id: entityId, description, old_values: oldValues, new_values: newValues });
}

function parsePagination(req, defaultSize = 50, maxSize = 200) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const requested = parseInt(req.query.page_size || req.query.limit, 10) || defaultSize;
  const pageSize = Math.max(1, Math.min(maxSize, requested));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  return { page, pageSize, from, to };
}

// ─── LIST TASKS (Kanban group_by=status / List / My tasks) ──
r.get('/', async (req, res) => {
  try {
    const { project_id, status, assignee_id, priority, search, group_by, task_type } = req.query;
    const { page, pageSize, from, to } = parsePagination(req, 50, 200);
    let q = supabase.from('tasks').select(`
      *, projects(id,code,name),
      assignee:users!tasks_assignee_id_fkey(id,full_name,avatar),
      creator:users!tasks_created_by_id_fkey(id,full_name),
      stage:workflow_stages(id,name,color)
    `, { count: 'exact' }).order('order_index').order('created_at', { ascending: false });

    if (project_id) q = q.eq('project_id', project_id);
    if (status) q = q.eq('status', status);
    if (assignee_id) q = q.eq('assignee_id', assignee_id);
    if (priority) q = q.eq('priority', priority);
    if (search) q = q.ilike('title', `%${search}%`);
    if (task_type) q = q.eq('task_type', task_type);

    const userRole = req.user.role;
    if (userRole && !['admin', 'manager'].includes(userRole)) {
      if (!req.query.project_id && !req.query.stage_id) {
        q = q.eq('assignee_id', req.user.userId);
      }
    }

    if (req.query.stage_id) q = q.eq('stage_id', req.query.stage_id);

    // For kanban group_by=status we still need to cap rows to avoid huge payloads.
    // Default cap kanban view to 500 latest rows; client can request more via page_size.
    if (group_by === 'status') {
      const kanbanCap = Math.min(parseInt(req.query.limit, 10) || 500, 1000);
      q = q.range(0, kanbanCap - 1);
    } else {
      q = q.range(from, to);
    }

    const { data, error, count } = await q;
    if (error) throw error;

    if (group_by === 'status') {
      const cols = { pending: [], todo: [], in_progress: [], review: [], done: [], blocked: [], deferred: [] };
      data?.forEach(t => { if (cols[t.status]) cols[t.status].push(t); else if (cols.todo) cols.todo.push(t); });
      return res.json({ columns: cols, total: count ?? data?.length });
    }

    res.json({ tasks: data, total: count ?? data?.length, page, page_size: pageSize });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ─── MY TASKS ──
r.get('/my', async (req, res) => {
  try {
    const { page, pageSize, from, to } = parsePagination(req, 50, 200);
    const { data, count, error } = await supabase.from('tasks').select(`
      *, projects(id,code,name), stage:workflow_stages(id,name,color)
    `, { count: 'exact' })
      .eq('assignee_id', req.user.userId)
      .neq('status', 'done')
      .order('due_date')
      .range(from, to);
    if (error) throw error;
    res.json({ tasks: data, total: count ?? data?.length, page, page_size: pageSize });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// ─── OVERDUE TASKS ──
r.get('/overdue', async (req, res) => {
  try {
    const { page, pageSize, from, to } = parsePagination(req, 50, 200);
    const { data, count, error } = await supabase.from('tasks').select(`
      *, projects(id,code,name),
      assignee:users!tasks_assignee_id_fkey(id,full_name)
    `, { count: 'exact' })
      .lt('due_date', new Date().toISOString())
      .neq('status', 'done')
      .order('due_date')
      .range(from, to);
    if (error) throw error;
    res.json({ tasks: data, total: count ?? data?.length, page, page_size: pageSize });
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

    const [r1, r2, r3, r4] = await Promise.allSettled([
      supabase.from('task_participants').select('*, user:users(id,full_name,avatar)').eq('task_id', req.params.id).order('created_at'),
      supabase.from('task_checklists').select('*').eq('task_id', req.params.id).order('order_index'),
      supabase.from('task_comments').select('*, user:users(id,full_name,avatar)').eq('task_id', req.params.id).order('created_at', { ascending: false }),
      supabase.from('task_time_logs').select('*, user:users(id,full_name)').eq('task_id', req.params.id).order('started_at', { ascending: false }),
    ]);
    const participants = (r1.status === 'fulfilled' && r1.value.data) || [];
    const checklists = (r2.status === 'fulfilled' && r2.value.data) || [];
    const comments = (r3.status === 'fulfilled' && r3.value.data) || [];
    const timeLogs = (r4.status === 'fulfilled' && r4.value.data) || [];

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
    const result = await createProjectTask(req, req.body);
    if (result.error) return res.status(result.status || 500).json({ error: result.error });
    return res.status(result.status).json(result.data);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ─── UPDATE TASK ──
r.put('/:id', async (req, res) => {
  try {
    const result = await updateProjectTask(req, req.params.id, req.body);
    if (result.error) return res.status(result.status || 500).json({ error: result.error });
    return res.status(result.status).json(result.data);
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
        await createNotification(req, old.created_by_id, 'task_updated', '📋 Chờ nghiệm thu', `Công việc "${old.title}" chờ kiểm tra`, 'task', data.id, taskProjectMeta(data.project_id));
      }
      if (update.status === 'done' && old.assignee_id) {
        await createNotification(req, old.assignee_id, 'task_updated', '✅ Công việc hoàn thành', `Công việc "${old.title}" đã duyệt`, 'task', data.id, taskProjectMeta(data.project_id));
      }
      await logActivity(req.user.userId, 'status_changed', 'task', data.id, `${old.status} → ${update.status}`);

      // ── CHECK AUTO-ADVANCE: if all stage tasks done → notify responsible person ──
      if (update.status === 'done' && data.project_id && data.stage_id) {
        const { data: stageTasks } = await supabase.from('tasks')
          .select('id,status').eq('project_id', data.project_id).eq('stage_id', data.stage_id);
        const allDone = stageTasks?.length > 0 && stageTasks.every(t => t.status === 'done');
        if (allDone) {
          const { data: proj } = await supabase.from('projects')
            .select('code,name,sales_person_id,designer_id,project_manager_id,production_person_id,current_stage_id').eq('id', data.project_id).single();
          const { data: stage } = await supabase.from('workflow_stages').select('name,slug').eq('id', data.stage_id).single();
          if (proj) {
            const WS_PREFIX = ['production', 'delivery', 'shipping', 'installation', 'customer-care'];
            const slugBase = (stage?.slug || '').split('-')[0];
            const isWs = WS_PREFIX.includes(slugBase);
            let teamIds = proj.production_person_id
              ? [proj.production_person_id]
              : [proj.sales_person_id, proj.designer_id, proj.project_manager_id].filter(Boolean);
            if (!proj.production_person_id && isWs && proj.sales_person_id) {
              teamIds = teamIds.filter((id) => String(id) !== String(proj.sales_person_id));
            }
            await notifyMultiple(req, teamIds, 'project_stage_changed',
              `🎉 Hoàn thành giai đoạn "${stage?.name}"`,
              `Tất cả công việc giai đoạn "${stage?.name}" của dự án ${proj.code} đã hoàn thành. Sẵn sàng chuyển giai đoạn tiếp theo!`,
              'project', data.project_id);
          }
        }
      }
    }

    const io = req.app.get('io');
    notify(io, 'task:updated', data);

    if (data?.status === 'done') {
      try {
        await scheduleNextWorkshopTaskAfterComplete(data);
      } catch (chainErr) {
        console.warn('[tasks] workshop deadline chain (patch):', chainErr.message);
      }
    }

    res.json({ task: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ─── DELETE TASK ──
r.delete('/:id', async (req, res) => {
  try {
    const result = await deleteProjectTask(req, req.params.id);
    if (result.error) return res.status(result.status || 500).json({ error: result.error });
    return res.json(result.data);
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

    // Try full update first; if column doesn't exist, retry without notes/attachments
    let data, error;
    ({ data, error } = await supabase.from('task_checklists').update(update).eq('id', req.params.clId).select().single());
    if (error && error.message && error.message.includes('column')) {
      const safeUpdate = { ...update };
      delete safeUpdate.notes;
      delete safeUpdate.attachments;
      ({ data, error } = await supabase.from('task_checklists').update(safeUpdate).eq('id', req.params.clId).select().single());
    }
    if (error) throw error;

    // ── CHECK IF ALL CHECKLISTS DONE ──
    if (update.is_completed) {
      const { data: allChecklists } = await supabase.from('task_checklists')
        .select('id, is_completed').eq('task_id', req.params.taskId);
      const allDone = allChecklists?.length > 0 && allChecklists.every(cl => cl.is_completed);
      if (allDone) {
        const { data: task } = await supabase.from('tasks')
          .select('title, assignee_id, project_id, projects(code)').eq('id', req.params.taskId).single();
        if (task?.assignee_id) {
          await createNotification(req, task.assignee_id, 'checklist_completed',
            '📋 Tất cả checklist hoàn tất',
            `Tất cả mục checklist của công việc "${task.title}" đã hoàn tất${task.projects?.code ? ` — DA ${task.projects.code}` : ''}`,
            'task', req.params.taskId, taskProjectMeta(task.project_id));
        }
      }
    }

    res.json({ checklist: data });
  } catch (e) { console.error('checklist patch', e); res.status(500).json({ error: e.message || 'Lỗi' }); }
});

r.delete('/:taskId/checklists/:clId', async (req, res) => {
  try {
    await supabase.from('task_checklists').delete().eq('id', req.params.clId);
    res.json({ message: 'Đã xóa' });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// ─── STANDALONE CHECKLIST UPDATE (PUT /tasks/checklists/:id) ──
// Used for updating notes (may contain JSON with assignee_id) and attachments
r.put('/checklists/:clId', async (req, res) => {
  try {
    const b = req.body;
    const update = { updated_at: new Date().toISOString() };
    if (b.notes !== undefined) update.notes = b.notes;
    if (b.attachments !== undefined) update.attachments = b.attachments;
    if (b.title !== undefined) update.title = b.title;
    if (b.is_completed !== undefined) {
      update.is_completed = b.is_completed;
      update.completed_by = b.is_completed ? req.user.userId : null;
      update.completed_at = b.is_completed ? new Date().toISOString() : null;
    }

    const { data, error } = await supabase.from('task_checklists').update(update).eq('id', req.params.clId).select().single();
    if (error) throw error;

    // If notes contain JSON with assignee_id → notify the assignee
    if (b.notes) {
      try {
        const parsed = typeof b.notes === 'string' ? JSON.parse(b.notes) : b.notes;
        if (parsed?.assignee_id) {
          // Get task info for notification
          const { data: cl } = await supabase.from('task_checklists').select('task_id, title').eq('id', req.params.clId).single();
          if (cl?.task_id) {
            const { data: task } = await supabase.from('tasks').select('title, project_id, projects(code)').eq('id', cl.task_id).single();
            await createNotification(req, parsed.assignee_id, 'task_assigned',
              '📋 Được gán mục checklist',
              `Bạn được gán: "${data.title}" trong công việc "${task?.title || ''}"${task?.projects?.code ? ` — DA ${task.projects.code}` : ''}`,
              'task', cl.task_id, taskProjectMeta(task?.project_id));
          }
        }
      } catch { /* notes is plain text, not JSON */ }
    }

    res.json({ checklist: data });
  } catch (e) { console.error('checklist put', e); res.status(500).json({ error: e.message || 'Lỗi' }); }
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
    const { data: task } = await supabase.from('tasks').select('assignee_id,created_by_id,title,project_id').eq('id', req.params.id).single();
    const { data: participants } = await supabase.from('task_participants').select('user_id').eq('task_id', req.params.id);
    if (task) {
      const allIds = [task.assignee_id, task.created_by_id, ...(participants || []).map(p => p.user_id)];
      await notifyMultiple(req, allIds, 'comment_added',
        '💬 Bình luận mới', `${req.user.fullName} bình luận: "${task.title}"`, 'task', req.params.id,
        taskProjectMeta(task.project_id));
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

// ─── TASK ATTACHMENTS (for production tasks) ──
r.get('/:id/attachments', async (req, res) => {
  try {
    const forModule = String(req.query.for_module || '').toLowerCase().trim();
    const useMod = ['production', 'logistics', 'workshop'].includes(forModule) ? forModule : null;
    const { data } = await supabase.from('file_attachments')
      .select('*, uploader:users!file_attachments_uploaded_by_fkey(id,full_name)')
      .eq('entity_type', 'task').eq('entity_id', req.params.id)
      .order('created_at', { ascending: false });
    let list = data || [];
    list = list.filter((a) => (useMod
      ? taskAttachmentVisibleForModuleAndUser(a, useMod, req.user)
      : canViewerSeeByCompanyAndDept(a, req.user)));
    res.json({ attachments: list });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

r.post('/:id/attachments/bulk', async (req, res) => {
  try {
    const items = (req.body.items || []).map((f) => {
      const row = {
        entity_type: 'task', entity_id: req.params.id,
        file_name: f.original_name || f.file_name, file_url: f.file_url,
        file_size: f.file_size, mime_type: f.mime_type,
        uploaded_by: req.user.userId,
      };
      if (f.allowed_companies !== undefined) row.allowed_companies = f.allowed_companies || null;
      if (f.allowed_share_modules !== undefined) row.allowed_share_modules = f.allowed_share_modules || null;
      return row;
    });
    if (!items.length) return res.status(400).json({ error: 'Không có file' });
    const { data, error } = await supabase.from('file_attachments').insert(items).select();
    if (error) throw error;
    res.status(201).json({ attachments: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

r.delete('/:taskId/attachments/:attId', async (req, res) => {
  try {
    await supabase.from('file_attachments').delete().eq('id', req.params.attId).eq('entity_type', 'task');
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
      const { data: tProj } = await supabase.from('tasks').select('project_id').eq('id', req.params.id).maybeSingle();
      await createNotification(req, req.body.user_id, 'task_assigned', `Bạn được thêm vào công việc`, `Vai trò: ${role}`, 'task', req.params.id,
        taskProjectMeta(tProj?.project_id));
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

// Planner: get tasks grouped by assignee (for current user or all if admin)
r.get('/planner/board', async (req, res) => {
  try {
    const userId = req.user.userId;
    const isAdmin = isAdminLike(req.user);
    const { company_id, division_id } = req.query;

    // Get tasks with assignees (project tasks)
    let query = supabase.from('tasks')
      .select('id, title, status, priority, due_date, planner_order, assignee_id, project_id, task_type, project:projects(id, code, name, company_id, deadline, current_stage_id)')
      .not('assignee_id', 'is', null)
      .order('planner_order', { ascending: true })
      .order('due_date', { ascending: true, nullsFirst: false });

    const { data: tasks, error } = await query;
    if (error) throw error;

    // Also get personal tasks (task_type = 'personal')
    const { data: personalTasks } = await supabase.from('tasks')
      .select('id, title, status, priority, due_date, planner_order, assignee_id, created_by_id, task_type')
      .eq('task_type', 'personal')
      .order('planner_order', { ascending: true })
      .order('due_date', { ascending: true, nullsFirst: false });

    // Merge: personal tasks belong to their creator (or assignee if set)
    const allTasks = [...(tasks || [])];
    (personalTasks || []).forEach(pt => {
      // Avoid duplicates (personal task might already be in tasks if it has assignee)
      if (!allTasks.find(t => t.id === pt.id)) {
        pt.assignee_id = pt.assignee_id || pt.created_by_id;
        pt._isPersonal = true;
        allTasks.push(pt);
      }
    });

    // Get all assignee user info
    const assigneeIds = [...new Set(allTasks.map(t => t.assignee_id).filter(Boolean))];
    let users = [];
    if (assigneeIds.length > 0) {
      const { data: userData } = await supabase.from('users').select('id, full_name, avatar_url, role').in('id', assigneeIds);
      users = userData || [];
    }

    // Filter by company if needed
    let filteredTasks = allTasks;
    if (company_id) {
      filteredTasks = filteredTasks.filter(t => t._isPersonal || t.project?.company_id === company_id);
    }

    // Group by assignee
    const board = {};
    filteredTasks.forEach(t => {
      if (!board[t.assignee_id]) {
        const u = users.find(u => u.id === t.assignee_id);
        board[t.assignee_id] = {
          user: u || { id: t.assignee_id, full_name: 'Unknown' },
          tasks: []
        };
      }
      board[t.assignee_id].tasks.push(t);
    });

    // Sort columns: current user first, then alphabetical
    const columns = Object.values(board).sort((a, b) => {
      if (a.user.id === userId) return -1;
      if (b.user.id === userId) return 1;
      return (a.user.full_name || '').localeCompare(b.user.full_name || '');
    });

    res.json({ columns });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Planner: reorder tasks for an assignee
r.put('/planner/reorder', async (req, res) => {
  try {
    const { task_id, assignee_id, new_order } = req.body;
    // new_order is an array of task IDs in the desired order
    if (Array.isArray(new_order)) {
      const updates = new_order.map((id, idx) =>
        supabase.from('tasks').update({ planner_order: idx, assignee_id: assignee_id || undefined }).eq('id', id)
      );
      await Promise.all(updates);
    } else if (task_id) {
      // Single task move to new assignee
      await supabase.from('tasks').update({ assignee_id, planner_order: 0 }).eq('id', task_id);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = r;
