const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');

const r = Router();
r.use(auth);

// Danh sách task (group_by=status cho Kanban)
r.get('/', async (req, res) => {
  try {
    const { project_id, status, assignee_id, priority, search, group_by } = req.query;
    let q = supabase.from('tasks').select('*, projects(id,code,name), assignee:users!tasks_assignee_id_fkey(id,full_name,avatar), stage:workflow_stages(id,name,color)').order('order_index');
    if (project_id) q = q.eq('project_id', project_id);
    if (status) q = q.eq('status', status);
    if (assignee_id) q = q.eq('assignee_id', assignee_id);
    if (priority) q = q.eq('priority', priority);
    if (search) q = q.ilike('title', `%${search}%`);
    const { data, error } = await q;
    if (error) throw error;

    if (group_by === 'status') {
      const cols = { todo: [], in_progress: [], review: [], done: [], blocked: [] };
      data?.forEach(t => { if (cols[t.status]) cols[t.status].push(t); });
      return res.json({ columns: cols, total: data?.length });
    }
    res.json({ tasks: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// Task của tôi
r.get('/my', async (req, res) => {
  try {
    const { data } = await supabase.from('tasks').select('*, projects(id,code,name), stage:workflow_stages(id,name,color)').eq('assignee_id', req.user.userId).neq('status','done').order('due_date');
    res.json({ tasks: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// Task quá hạn
r.get('/overdue', async (req, res) => {
  try {
    const { data } = await supabase.from('tasks').select('*, projects(id,code,name), assignee:users!tasks_assignee_id_fkey(id,full_name)').lt('due_date', new Date().toISOString()).neq('status','done').order('due_date');
    res.json({ tasks: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// Chi tiết task
r.get('/:id', async (req, res) => {
  try {
    const { data } = await supabase.from('tasks').select('*, projects(id,code,name), assignee:users!tasks_assignee_id_fkey(id,full_name,avatar), stage:workflow_stages(id,name,color)').eq('id', req.params.id).single();
    res.json({ task: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// Tạo task
r.post('/', async (req, res) => {
  try {
    const b = req.body;
    const { data, error } = await supabase.from('tasks').insert({ project_id: b.project_id, stage_id: b.stage_id, title: b.title, description: b.description, priority: b.priority||'medium', assignee_id: b.assignee_id, created_by_id: req.user.userId, due_date: b.due_date, start_date: b.start_date, estimated_hours: b.estimated_hours, status: 'todo' }).select().single();
    if (error) throw error;
    if (b.assignee_id) {
      await supabase.from('notifications').insert({ user_id: b.assignee_id, type: 'task_assigned', title: 'Công việc mới', message: `Bạn được phân công: ${b.title}`, entity_type: 'task', entity_id: data.id });
    }
    res.status(201).json({ task: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// Cập nhật task
r.put('/:id', async (req, res) => {
  try {
    const u = { ...req.body, updated_at: new Date().toISOString() };
    if (u.status === 'done') u.completed_at = new Date().toISOString();
    const { data, error } = await supabase.from('tasks').update(u).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ task: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// Kanban drag: đổi status
r.patch('/:id/status', async (req, res) => {
  try {
    const u = { status: req.body.status, updated_at: new Date().toISOString() };
    if (req.body.order_index !== undefined) u.order_index = req.body.order_index;
    if (u.status === 'done') u.completed_at = new Date().toISOString();
    const { data, error } = await supabase.from('tasks').update(u).eq('id', req.params.id).select().single();
    if (error) throw error;
    // Emit socket event
    const io = req.app.get('io');
    if (io) io.emit('task:updated', data);
    res.json({ task: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// Xóa task
r.delete('/:id', async (req, res) => {
  try {
    await supabase.from('tasks').delete().eq('id', req.params.id);
    res.json({ message: 'Đã xóa' });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

module.exports = r;
