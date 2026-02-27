const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');

const r = Router();
r.use(auth);

// ════════════════════════════════════════════════════
// STATIC ROUTES FIRST (before /:id param catch-all)
// ════════════════════════════════════════════════════

// ═══ WORKFLOW STAGES ═══
r.get('/stages', async (req, res) => {
  try {
    const { data, error } = await supabase.from('workflow_stages').select('*').eq('is_active', true).order('order_index');
    if (error) {
      return res.json({ stages: [
        { id: 'c1', slug: 'consulting', name: 'Tư vấn', color: '#8B5CF6', order_index: 1 },
        { id: 'c2', slug: 'design', name: 'Thiết kế', color: '#EC4899', order_index: 2 },
        { id: 'c3', slug: 'quotation', name: 'Báo giá', color: '#F59E0B', order_index: 3 },
        { id: 'c4', slug: 'contract', name: 'Hợp đồng', color: '#10B981', order_index: 4 },
        { id: 'c5', slug: 'production', name: 'Sản xuất', color: '#F97316', order_index: 5 },
        { id: 'c6', slug: 'shipping', name: 'Vận chuyển', color: '#06B6D4', order_index: 6 },
        { id: 'c7', slug: 'installation', name: 'Lắp đặt', color: '#3B82F6', order_index: 7 },
        { id: 'c8', slug: 'customer-care', name: 'Chăm sóc KH', color: '#EF4444', order_index: 8 },
      ] });
    }
    res.json({ stages: data || [] });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ ROLE → STAGE ACCESS ═══
r.get('/my-stages', async (req, res) => {
  try {
    const role = req.user.role;
    if (['admin', 'manager'].includes(role)) {
      const { data } = await supabase.from('workflow_stages').select('*').eq('is_active', true).order('order_index');
      return res.json({ stages: data || [], allAccess: true });
    }
    let slugs = [];
    try {
      const { data: access } = await supabase.from('role_stage_access').select('stage_slug').eq('role', role);
      slugs = (access || []).map(a => a.stage_slug);
    } catch { /* table not exist */ }
    if (slugs.length === 0) return res.json({ stages: [], allAccess: false });
    const { data: stages } = await supabase.from('workflow_stages').select('*').eq('is_active', true).in('slug', slugs).order('order_index');
    res.json({ stages: stages || [], allAccess: false });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ DEPARTMENTS ═══
r.get('/departments/list', async (req, res) => {
  try {
    const { data } = await supabase.from('departments').select('*').order('name');
    res.json({ departments: data || [] });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

r.get('/departments', async (req, res) => {
  try {
    const { data } = await supabase.from('departments').select('*').order('name');
    res.json({ departments: data || [] });
  } catch { res.status(500).json({ error: 'Lỗi' }); }
});

// ════════════════════════════════════════════════════
// PARAM ROUTES (/:id comes after static routes)
// ════════════════════════════════════════════════════

// ═══ STAFF LIST (with filters) ═══
r.get('/', async (req, res) => {
  try {
    const { role, department_id, search, include_inactive } = req.query;
    let q = supabase.from('users').select(`
      id,email,full_name,phone,avatar,role,position,department_id,
      date_of_birth,hire_date,address,emergency_contact,salary,notes,skills,
      is_active,last_login_at,created_at,
      department:departments(id,name,color)
    `);
    if (!include_inactive) q = q.eq('is_active', true);
    if (role) q = q.eq('role', role);
    if (department_id) q = q.eq('department_id', department_id);
    if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
    const { data, error } = await q.order('full_name');
    if (error) throw error;

    const all = data || [];
    const stats = { total: all.length, byRole: {}, byDept: {} };
    all.forEach(u => {
      stats.byRole[u.role] = (stats.byRole[u.role] || 0) + 1;
      if (u.department?.name) stats.byDept[u.department.name] = (stats.byDept[u.department.name] || 0) + 1;
    });
    res.json({ users: data, stats });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ GET STAFF DETAIL ═══
r.get('/:id', async (req, res) => {
  try {
    const { data: user, error } = await supabase.from('users').select(`
      id,email,full_name,phone,avatar,role,position,department_id,
      date_of_birth,hire_date,address,emergency_contact,salary,notes,skills,
      is_active,last_login_at,created_at,
      department:departments(id,name,color)
    `).eq('id', req.params.id).single();
    if (error) throw error;

    const [assigned, created] = await Promise.all([
      supabase.from('tasks').select('id,status', { count: 'exact' }).eq('assignee_id', req.params.id),
      supabase.from('tasks').select('id', { count: 'exact' }).eq('created_by_id', req.params.id),
    ]);
    const taskStats = {
      assigned: assigned.count || 0,
      done: (assigned.data || []).filter(t => t.status === 'done').length,
      in_progress: (assigned.data || []).filter(t => t.status === 'in_progress').length,
      created: created.count || 0,
    };

    const { data: recentTasks } = await supabase.from('tasks')
      .select('id,title,status,priority,due_date,projects(id,code,name)')
      .eq('assignee_id', req.params.id).neq('status', 'done')
      .order('due_date').limit(10);

    res.json({ user: { ...user, taskStats, recentTasks: recentTasks || [] } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ CREATE STAFF ═══
r.post('/', async (req, res) => {
  try {
    const b = req.body;
    if (!b.email || !b.full_name) return res.status(400).json({ error: 'Email và họ tên bắt buộc' });
    if (!['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Chỉ admin/quản lý được tạo nhân viên' });
    }
    const password = b.password || 'tubep123';
    const hash = await bcrypt.hash(password, 12);
    const { data, error } = await supabase.from('users').insert({
      email: b.email, password: hash, full_name: b.full_name,
      phone: b.phone || null, role: b.role || 'staff',
      position: b.position || null, department_id: b.department_id || null,
      date_of_birth: b.date_of_birth || null, hire_date: b.hire_date || null,
      address: b.address || null, emergency_contact: b.emergency_contact || null,
      salary: b.salary || null, notes: b.notes || null, skills: b.skills || [],
    }).select('id,email,full_name,phone,role,position,department_id,is_active,created_at').single();
    if (error) {
      if (error.code === '23505') return res.status(400).json({ error: 'Email đã tồn tại' });
      throw error;
    }
    res.status(201).json({ user: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ UPDATE STAFF ═══
r.put('/:id', async (req, res) => {
  try {
    const b = req.body;
    const update = { updated_at: new Date().toISOString() };
    const fields = ['full_name','phone','role','position','department_id','date_of_birth','hire_date','address','emergency_contact','salary','notes','skills','is_active','avatar'];
    fields.forEach(f => { if (b[f] !== undefined) update[f] = b[f]; });
    if (b.password) update.password = await bcrypt.hash(b.password, 12);
    const { data, error } = await supabase.from('users').update(update).eq('id', req.params.id)
      .select('id,email,full_name,phone,role,position,department_id,is_active,created_at').single();
    if (error) throw error;
    res.json({ user: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ DEACTIVATE STAFF ═══
r.delete('/:id', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    await supabase.from('users').update({ is_active: false }).eq('id', req.params.id);
    res.json({ message: 'Đã vô hiệu hóa' });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

module.exports = r;
