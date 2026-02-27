const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');

const r = Router();
r.use(auth);

// Dashboard tổng quan
r.get('/', async (req, res) => {
  try {
    const { data: projects } = await supabase.from('projects').select('status');
    const sc = {};
    projects?.forEach(p => { sc[p.status] = (sc[p.status]||0)+1; });

    const { data: stages } = await supabase.from('workflow_stages').select('*').eq('is_active', true).order('order_index');
    const stMap = { consulting:'consulting', design:'designing', quotation:'quoting', contract:'contract_signed', production:'producing', shipping:'shipping', installation:'installing', 'customer-care':'warranty' };
    const pipeline = stages?.map(s => ({ ...s, count: sc[stMap[s.slug]]||0 }));

    const { data: tasks } = await supabase.from('tasks').select('status');
    const tc = {};
    tasks?.forEach(t => { tc[t.status] = (tc[t.status]||0)+1; });

    const { data: overdue } = await supabase.from('tasks').select('id').lt('due_date', new Date().toISOString()).neq('status','done');

    const { data: recent } = await supabase.from('projects').select('id,code,name,status,priority,estimated_value,created_at,customers(full_name,phone),current_stage:workflow_stages(name,color)').order('created_at', { ascending: false }).limit(5);

    const { count: unread } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', req.user.userId).eq('is_read', false);

    // My tasks summary
    const { data: myTasks } = await supabase.from('tasks').select('status').eq('assignee_id', req.user.userId);
    const myTaskCounts = {};
    myTasks?.forEach(t => { myTaskCounts[t.status] = (myTaskCounts[t.status]||0)+1; });

    res.json({
      stats: {
        totalProjects: projects?.length||0,
        activeProjects: projects?.filter(p => !['completed','cancelled'].includes(p.status)).length||0,
        overdueCount: overdue?.length||0,
        unread: unread||0,
        totalTasks: tasks?.length||0,
        myTaskCounts,
      },
      pipeline, taskCounts: tc, recentProjects: recent,
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ─── NOTIFICATIONS ──

// Danh sách thông báo
r.get('/notifications', async (req, res) => {
  try {
    const { unread, limit = 50, offset = 0 } = req.query;
    let q = supabase.from('notifications').select('*', { count: 'exact' })
      .eq('user_id', req.user.userId)
      .order('created_at', { ascending: false })
      .range(+offset, +offset + +limit - 1);
    if (unread === 'true') q = q.eq('is_read', false);
    const { data, count, error } = await q;
    if (error) throw error;
    res.json({ notifications: data, total: count });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// Đánh dấu tất cả đã đọc
r.put('/notifications/read-all', async (req, res) => {
  try {
    await supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', req.user.userId).eq('is_read', false);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// Đánh dấu 1 notification đã đọc
r.put('/notifications/:id/read', async (req, res) => {
  try {
    await supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('user_id', req.user.userId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// Xóa 1 notification
r.delete('/notifications/:id', async (req, res) => {
  try {
    await supabase.from('notifications').delete().eq('id', req.params.id).eq('user_id', req.user.userId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

module.exports = r;
