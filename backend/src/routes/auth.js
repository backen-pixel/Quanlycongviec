const { Router } = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabase } = require('../config/supabase');
const config = require('../config');
const { auth } = require('../middleware/auth');

const r = Router();

// Đăng nhập
r.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Thiếu email/mật khẩu' });

    const { data } = await supabase.from('users').select('*').eq('email', email).eq('is_active', true).limit(1);
    if (!data?.length) return res.status(401).json({ error: 'Sai email hoặc mật khẩu' });

    const user = data[0];
    if (!(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: 'Sai email hoặc mật khẩu' });

    await supabase.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id);
    // Không đặt expiresIn — JWT không có `exp`, phiên chỉ hết khi đăng xuất hoặc đổi JWT_SECRET.
    const token = jwt.sign({ userId: user.id, email: user.email, role: user.role, fullName: user.full_name }, config.jwtSecret);

    // Resolve company_id from department
    let company_id = user.company_id || null;
    if (!company_id && user.department_id) {
      try {
        const { data: dept } = await supabase.from('departments').select('company_id').eq('id', user.department_id).single();
        company_id = dept?.company_id || null;
      } catch (_) {}
    }

    res.json({ token, user: { id: user.id, userId: user.id, email: user.email, fullName: user.full_name, full_name: user.full_name, role: user.role, avatar: user.avatar, phone: user.phone, department_id: user.department_id || null, company_id, position: user.position || null } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi server' }); }
});

// Đăng ký
r.post('/register', async (req, res) => {
  try {
    const { email, password, full_name, phone, role } = req.body;
    if (!email || !password || !full_name) return res.status(400).json({ error: 'Thiếu thông tin' });
    const { data: ex } = await supabase.from('users').select('id').eq('email', email).limit(1);
    if (ex?.length) return res.status(409).json({ error: 'Email đã tồn tại' });
    const hash = await bcrypt.hash(password, 12);
    const { data, error } = await supabase.from('users').insert({ email, password: hash, full_name, phone, role: role || 'staff' }).select('id,email,full_name,role').single();
    if (error) throw error;
    res.status(201).json({ user: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi server' }); }
});

// Reset password cho tất cả seed users (gọi 1 lần rồi xóa)
r.post('/reset-seed-passwords', async (req, res) => {
  try {
    const seedEmails = ['admin@tubep.vn','sales@tubep.vn','designer@tubep.vn','production@tubep.vn','installer@tubep.vn','manager@tubep.vn'];
    const hash = await bcrypt.hash('admin123', 12);
    const { error } = await supabase.from('users').update({ password: hash }).in('email', seedEmails);
    if (error) throw error;
    res.json({ ok: true, message: 'Đã reset password cho tất cả seed users thành admin123' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi server' }); }
});

// Thông tin user hiện tại
r.get('/me', auth, async (req, res) => {
  try {
    const { data: u } = await supabase.from('users')
      .select('id,email,full_name,role,avatar,phone,department_id,company_id,position,is_active')
      .eq('id', req.user.userId).single();
    if (!u) return res.status(404).json({ error: 'User not found' });
    let company_id = u.company_id || null;
    if (!company_id && u.department_id) {
      const { data: dept } = await supabase.from('departments').select('company_id').eq('id', u.department_id).single();
      company_id = dept?.company_id || null;
    }
    res.json({ user: { id: u.id, userId: u.id, email: u.email, fullName: u.full_name, full_name: u.full_name, role: u.role, avatar: u.avatar, phone: u.phone, department_id: u.department_id, company_id, position: u.position } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi server' }); }
});

// ─────────────────────────────────────────────────────────────
// PERMISSION APIs
// ─────────────────────────────────────────────────────────────
const { hasPermission, getRolePermissions } = require('../middleware/permission');

// Get my permissions
r.get('/my-permissions', auth, async (req, res) => {
  try {
    const permissions = await getRolePermissions(req.user.role);
    res.json({ permissions, role: req.user.role });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// Check specific permission
r.post('/check-permission', auth, async (req, res) => {
  try {
    const { permission, unit_id } = req.body;
    if (!permission) {
      return res.status(400).json({ error: 'Missing permission' });
    }
    
    const allowed = await hasPermission(
      req.user.userId,
      req.user.role,
      permission,
      unit_id || null
    );
    
    res.json({ allowed, permission, unit_id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

module.exports = r;
