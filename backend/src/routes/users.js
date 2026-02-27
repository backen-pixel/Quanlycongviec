const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');

const r = Router();
r.use(auth);

// Danh sách nhân viên
r.get('/', async (req, res) => {
  try {
    const { role, search } = req.query;
    let q = supabase.from('users').select('id,email,full_name,phone,avatar,role,department_id,is_active,last_login_at,created_at').eq('is_active', true);
    if (role) q = q.eq('role', role);
    if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    const { data, error } = await q.order('full_name');
    if (error) throw error;
    res.json({ users: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// Phòng ban
r.get('/departments', async (req, res) => {
  try {
    const { data } = await supabase.from('departments').select('*').order('name');
    res.json({ departments: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// Workflow stages
r.get('/stages', async (req, res) => {
  try {
    const { data } = await supabase.from('workflow_stages').select('*').eq('is_active', true).order('order_index');
    res.json({ stages: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

module.exports = r;
