const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');

const r = Router();
r.use(auth);

// ─── LIST CUSTOMERS ──
r.get('/', async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    let q = supabase.from('customers').select('*', { count: 'exact' });
    if (search) q = q.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
    const p = +page, l = +limit;
    q = q.order('created_at', { ascending: false }).range((p-1)*l, p*l-1);
    const { data, count, error } = await q;
    if (error) throw error;
    res.json({ customers: data, total: count });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ─── GET CUSTOMER ──
r.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('customers').select('*').eq('id', req.params.id).single();
    if (error) throw error;
    // Projects of this customer
    const { data: projects } = await supabase.from('projects').select('id,code,name,status,estimated_value,created_at').eq('customer_id', req.params.id).order('created_at', { ascending: false });
    res.json({ customer: { ...data, projects: projects || [] } });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// ─── CREATE CUSTOMER ──
r.post('/', async (req, res) => {
  try {
    const b = req.body;
    if (!b.full_name || !b.phone) return res.status(400).json({ error: 'Thiếu tên hoặc SĐT' });
    const { data, error } = await supabase.from('customers').insert({
      full_name: b.full_name, phone: b.phone, email: b.email || null,
      address: b.address || null, district: b.district || null, city: b.city || null,
      notes: b.notes || null, source: b.source || null,
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
    ['full_name','phone','email','address','district','city','notes','source'].forEach(f => {
      if (b[f] !== undefined) update[f] = b[f];
    });
    const { data, error } = await supabase.from('customers').update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ customer: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// ─── DELETE CUSTOMER ──
r.delete('/:id', async (req, res) => {
  try {
    // Check if customer has projects
    const { count } = await supabase.from('projects').select('id', { count: 'exact', head: true }).eq('customer_id', req.params.id);
    if (count > 0) return res.status(400).json({ error: `Không thể xóa — khách hàng có ${count} dự án` });
    await supabase.from('customers').delete().eq('id', req.params.id);
    res.json({ message: 'Đã xóa' });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

module.exports = r;
