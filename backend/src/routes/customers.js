const { Router } = require('express');
const { requirePermission } = require('../middleware/newPermission');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');

const r = Router();
r.use(auth);

// ─── LIST CUSTOMERS (CRM) ──
r.get('/', async (req, res) => {
  try {
    const { search, status, status_id, assigned_to, source, page = 1, limit = 50 } = req.query;
    let q = supabase.from('customers').select(`
      *, assigned_user:users!customers_assigned_to_fkey(id,full_name,avatar),
      customer_status:customer_statuses(id,name,slug,color,icon)
    `, { count: 'exact' });
    if (search) q = q.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`);
    if (status_id && status_id !== 'all') q = q.eq('status_id', status_id);
    else if (status && status !== 'all') q = q.eq('status', status);
    if (assigned_to) q = q.eq('assigned_to', assigned_to);
    if (source) q = q.eq('source', source);
    const p = +page, l = +limit;
    q = q.order('created_at', { ascending: false }).range((p - 1) * l, p * l - 1);
    const { data, count, error } = await q;
    if (error) throw error;

    // Stats by status_id
    let stats = { total: 0 };
    try {
      const { data: all } = await supabase.from('customers').select('status_id');
      stats.total = all?.length || 0;
      all?.forEach(c => { if (c.status_id) stats[c.status_id] = (stats[c.status_id] || 0) + 1; });
    } catch (_) {
      // Fallback: count by old status field
      const { data: all } = await supabase.from('customers').select('status');
      stats.total = all?.length || 0;
      all?.forEach(c => { stats[c.status] = (stats[c.status] || 0) + 1; });
    }

    res.json({ customers: data, total: count, stats });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ─── GET CUSTOMER DETAIL ──
r.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('customers').select(`
      *, assigned_user:users!customers_assigned_to_fkey(id,full_name,avatar,email)
    `).eq('id', req.params.id).single();
    if (error) throw error;

    const [projectsRes, interactionsRes] = await Promise.all([
      supabase.from('projects').select('id,code,name,status,estimated_value,final_value,created_at,current_stage:workflow_stages(name,color)')
        .eq('customer_id', req.params.id).order('created_at', { ascending: false }),
      supabase.from('customer_interactions').select('*, user:users(id,full_name)')
        .eq('customer_id', req.params.id).order('interaction_date', { ascending: false }).limit(50),
    ]);

    res.json({
      customer: {
        ...data,
        projects: projectsRes.data || [],
        interactions: interactionsRes.data || [],
      }
    });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// ─── CREATE CUSTOMER ──
r.post('/', async (req, res) => {
  try {
    const b = req.body;
    if (!b.full_name) return res.status(400).json({ error: 'Thiếu tên khách hàng' });
    const { data, error } = await supabase.from('customers').insert({
      full_name: b.full_name, phone: b.phone, email: b.email || null,
      address: b.address || null, district: b.district || null, city: b.city || null,
      notes: b.notes || null, source: b.source || null,
      company: b.company || null, tax_code: b.tax_code || null,
      gender: b.gender || null, birthday: b.birthday || null,
      assigned_to: b.assigned_to || null, status: b.status || 'new',
      status_id: b.status_id || null,
      tags: b.tags || [],
    }).select().single();
    if (error) throw error;
    res.status(201).json({ customer: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ─── UPDATE CUSTOMER ──
r.put('/:id', async (req, res) => {
  try {
    const b = req.body;
    const update = { updated_at: new Date().toISOString() };
    const fields = ['full_name', 'phone', 'email', 'address', 'district', 'city', 'notes', 'source',
      'company', 'tax_code', 'gender', 'birthday', 'assigned_to', 'status', 'status_id', 'tags', 'total_revenue'];
    fields.forEach(f => { if (b[f] !== undefined) update[f] = b[f]; });
    const { data, error } = await supabase.from('customers').update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ customer: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// ─── DELETE CUSTOMER ──
r.delete('/:id', async (req, res) => {
  try {
    const { count } = await supabase.from('projects').select('id', { count: 'exact', head: true }).eq('customer_id', req.params.id);
    if (count > 0) return res.status(400).json({ error: `Không thể xóa — khách hàng có ${count} dự án` });
    await supabase.from('customer_interactions').delete().eq('customer_id', req.params.id);
    await supabase.from('customers').delete().eq('id', req.params.id);
    res.json({ message: 'Đã xóa' });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// ─── INTERACTIONS (Lịch sử tương tác) ──
r.get('/:id/interactions', async (req, res) => {
  try {
    const { data } = await supabase.from('customer_interactions').select('*, user:users(id,full_name)')
      .eq('customer_id', req.params.id).order('interaction_date', { ascending: false });
    res.json({ interactions: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

r.post('/:id/interactions', async (req, res) => {
  try {
    const b = req.body;
    const { data, error } = await supabase.from('customer_interactions').insert({
      customer_id: req.params.id, user_id: req.user.userId,
      type: b.type, title: b.title, content: b.content || null,
      interaction_date: b.interaction_date || new Date().toISOString(),
      next_action: b.next_action || null, next_action_date: b.next_action_date || null,
    }).select('*, user:users(id,full_name)').single();
    if (error) throw error;
    res.status(201).json({ interaction: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

r.delete('/:custId/interactions/:intId', async (req, res) => {
  try {
    await supabase.from('customer_interactions').delete().eq('id', req.params.intId);
    res.json({ message: 'Đã xóa' });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

module.exports = r;
