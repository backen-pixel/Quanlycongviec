const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');

const r = Router();
r.use(auth);

// Dashboard tổng quan
r.get('/', async (req, res) => {
  try {
    // Đếm dự án theo status
    const { data: projects } = await supabase.from('projects').select('status');
    const sc = {};
    projects?.forEach(p => { sc[p.status] = (sc[p.status]||0)+1; });

    // Pipeline
    const { data: stages } = await supabase.from('workflow_stages').select('*').eq('is_active', true).order('order_index');
    const stMap = { consulting:'consulting', design:'designing', quotation:'quoting', contract:'contract_signed', production:'producing', shipping:'shipping', installation:'installing', 'customer-care':'warranty' };
    const pipeline = stages?.map(s => ({ ...s, count: sc[stMap[s.slug]]||0 }));

    // Task stats
    const { data: tasks } = await supabase.from('tasks').select('status');
    const tc = {};
    tasks?.forEach(t => { tc[t.status] = (tc[t.status]||0)+1; });

    // Task quá hạn
    const { data: overdue } = await supabase.from('tasks').select('id').lt('due_date', new Date().toISOString()).neq('status','done');

    // Dự án mới nhất
    const { data: recent } = await supabase.from('projects').select('id,code,name,status,priority,estimated_value,created_at,customers(full_name,phone),current_stage:workflow_stages(name,color)').order('created_at', { ascending: false }).limit(5);

    // Thông báo chưa đọc
    const { count: unread } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', req.user.userId).eq('is_read', false);

    res.json({
      stats: { totalProjects: projects?.length||0, activeProjects: projects?.filter(p => !['completed','cancelled'].includes(p.status)).length||0, overdueCount: overdue?.length||0, unread: unread||0 },
      pipeline, taskCounts: tc, recentProjects: recent,
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// Thông báo
r.get('/notifications', async (req, res) => {
  try {
    let q = supabase.from('notifications').select('*').eq('user_id', req.user.userId).order('created_at', { ascending: false }).limit(50);
    if (req.query.unread === 'true') q = q.eq('is_read', false);
    const { data } = await q;
    res.json({ notifications: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// Đánh dấu đọc
r.put('/notifications/read-all', async (req, res) => {
  try {
    await supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('user_id', req.user.userId).eq('is_read', false);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

module.exports = r;
