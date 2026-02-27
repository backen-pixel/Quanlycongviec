const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');

const r = Router();
r.use(auth);

// Danh sách dự án (filter, search, phân trang)
r.get('/', async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    let q = supabase.from('projects').select('*, customers(id,full_name,phone,city), current_stage:workflow_stages(id,name,slug,color,icon)', { count: 'exact' });
    if (status && status !== 'all') q = q.eq('status', status);
    if (search) q = q.or(`code.ilike.%${search}%,name.ilike.%${search}%`);
    const p = +page, l = +limit;
    q = q.order('created_at', { ascending: false }).range((p-1)*l, p*l-1);
    const { data, count, error } = await q;
    if (error) throw error;
    res.json({ projects: data, total: count, page: p, totalPages: Math.ceil((count||0)/l) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// Chi tiết dự án + tasks
r.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('projects').select(`*, customers(*), current_stage:workflow_stages(*), tasks(*, assignee:users!tasks_assignee_id_fkey(id,full_name,avatar))`).eq('id', req.params.id).single();
    if (error) throw error;
    res.json({ project: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// Tạo dự án
r.post('/', async (req, res) => {
  try {
    const b = req.body;
    const { count } = await supabase.from('projects').select('id', { count: 'exact', head: true });
    const code = `TB-${new Date().getFullYear()}-${String((count||0)+1).padStart(3,'0')}`;
    const { data: stage } = await supabase.from('workflow_stages').select('id').eq('slug','consulting').single();
    const { data, error } = await supabase.from('projects').insert({ code, name: b.name, description: b.description, customer_id: b.customer_id, status: 'consulting', current_stage_id: stage?.id, kitchen_type: b.kitchen_type, material: b.material, estimated_value: b.estimated_value, install_address: b.install_address, priority: b.priority||'medium', consult_date: new Date().toISOString() }).select().single();
    if (error) throw error;
    await supabase.from('activity_logs').insert({ user_id: req.user.userId, action: 'created', entity_type: 'project', entity_id: data.id, description: `Tạo dự án ${code}` });
    res.status(201).json({ project: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// Cập nhật dự án
r.put('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('projects').update({ ...req.body, updated_at: new Date().toISOString() }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ project: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// Chuyển giai đoạn
r.put('/:id/stage', async (req, res) => {
  try {
    const { stage_slug, new_status } = req.body;
    const { data: stage } = await supabase.from('workflow_stages').select('id,name').eq('slug', stage_slug).single();
    if (!stage) return res.status(404).json({ error: 'Stage không tồn tại' });
    const { data, error } = await supabase.from('projects').update({ current_stage_id: stage.id, status: new_status, updated_at: new Date().toISOString() }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ project: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

module.exports = r;
