const { Router } = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabase } = require('../config/supabase');
const config = require('../config');
const { auth } = require('../middleware/auth');
const { logAuthEvent } = require('../helpers/authEventLog');

const r = Router();

// Đăng nhập
r.post('/login', async (req, res) => {
  try {
    const emailTrim = String(req.body.email || '').trim();
    const { password } = req.body;
    const clientSessionId = req.body?.session_id ? String(req.body.session_id).slice(0, 80) : null;
    if (!emailTrim || !password) {
      void logAuthEvent({ event: 'login_failed', email: emailTrim || null, reason: 'missing_credentials', req });
      return res.status(400).json({ error: 'Thiếu email/mật khẩu' });
    }

    const { data } = await supabase.from('users').select('*').eq('email', emailTrim).neq('is_active', false).limit(1);
    if (!data?.length) {
      void logAuthEvent({ event: 'login_failed', email: emailTrim, reason: 'user_not_found_or_disabled', req });
      return res.status(401).json({ error: 'Sai email hoặc mật khẩu' });
    }

    const user = data[0];
    if (!(await bcrypt.compare(password, user.password))) {
      void logAuthEvent({ event: 'login_failed', email: emailTrim, user_id: user.id, reason: 'wrong_password', req });
      return res.status(401).json({ error: 'Sai email hoặc mật khẩu' });
    }

    await supabase.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id);
    // Sinh session_id ngắn nếu client không gửi (UUID v4 đơn giản).
    const sessionId = clientSessionId || `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    void logAuthEvent({
      event: 'login_success',
      user_id: user.id,
      email: user.email,
      session_id: sessionId,
      reason: 'password',
      req,
    });
    // Resolve company_id from department
    let company_id = user.company_id || null;
    if (!company_id && user.department_id) {
      try {
        const { data: dept } = await supabase.from('departments').select('company_id').eq('id', user.department_id).single();
        company_id = dept?.company_id || null;
      } catch (_) {}
    }

    let crm_region_ids = [];
    try {
      const { data: ur } = await supabase.from('user_company_regions').select('region_id').eq('user_id', user.id);
      crm_region_ids = (ur || []).map((r) => r.region_id).filter(Boolean);
    } catch (_) {
      crm_region_ids = [];
    }

    // Không đặt expiresIn — JWT không có `exp`, phiên chỉ hết khi đăng xuất hoặc đổi JWT_SECRET.
    // Include company_id so CRM pipeline scoping works immediately.
    const token = jwt.sign({
      userId: user.id,
      email: user.email,
      role: user.role,
      fullName: user.full_name,
      company_id,
      department_id: user.department_id || null,
      crm_region_ids,
    }, config.jwtSecret);

    res.json({
      token,
      session_id: sessionId,
      user: {
        id: user.id,
        userId: user.id,
        email: user.email,
        fullName: user.full_name,
        full_name: user.full_name,
        role: user.role,
        avatar: user.avatar,
        phone: user.phone,
        department_id: user.department_id || null,
        company_id,
        crm_region_ids,
        position: user.position || null,
      },
    });
  } catch (e) {
    console.error(e);
    void logAuthEvent({ event: 'login_failed', email: req.body?.email || null, reason: 'server_error', req });
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// Đăng xuất: client gọi trước khi xoá token để audit chính xác (kèm reason, session_id).
//   Body (optional): { reason: 'manual'|'midnight'|'idle'|'forced', session_id }
//   Yêu cầu auth — nhưng nếu token đã hết hạn vẫn cho POST với body { email, reason } để log session_expired.
r.post('/logout', auth, async (req, res) => {
  try {
    const reason = req.body?.reason ? String(req.body.reason).slice(0, 60) : 'manual';
    const event = reason === 'midnight' ? 'auto_logout_midnight'
      : reason === 'expired' ? 'session_expired'
      : 'logout';
    await logAuthEvent({
      event,
      user_id: req.user?.userId || null,
      email: req.user?.email || null,
      session_id: req.body?.session_id || null,
      reason,
      metadata: req.body?.ms_session_duration
        ? { ms_session_duration: Number(req.body.ms_session_duration) || null }
        : null,
      req,
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('[auth/logout]', e);
    res.json({ ok: true }); // không chặn client logout
  }
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

// Đổi mật khẩu (đã đăng nhập — nhập mật khẩu cũ)
r.post('/change-password', auth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body || {};
    if (current_password == null || new_password == null) {
      return res.status(400).json({ error: 'Nhập mật khẩu hiện tại và mật khẩu mới' });
    }
    const cur = String(current_password);
    const next = String(new_password);
    if (next.length < 8) {
      return res.status(400).json({ error: 'Mật khẩu mới cần ít nhất 8 ký tự' });
    }
    if (cur === next) {
      return res.status(400).json({ error: 'Mật khẩu mới phải khác mật khẩu hiện tại' });
    }
    const { data: u, error: fErr } = await supabase
      .from('users')
      .select('id, password')
      .eq('id', req.user.userId)
      .single();
    if (fErr || !u) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
    if (!(await bcrypt.compare(cur, u.password))) {
      return res.status(400).json({ error: 'Mật khẩu hiện tại không đúng' });
    }
    const hash = await bcrypt.hash(next, 12);
    const { error: uErr } = await supabase
      .from('users')
      .update({ password: hash, updated_at: new Date().toISOString() })
      .eq('id', req.user.userId);
    if (uErr) throw uErr;
    void logAuthEvent({
      event: 'password_changed',
      user_id: req.user.userId,
      email: req.user.email || null,
      req,
    });
    res.json({ ok: true, message: 'Đã đổi mật khẩu' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Lỗi server' });
  }
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
    let crm_region_ids = [];
    try {
      const { data: ur } = await supabase.from('user_company_regions').select('region_id').eq('user_id', u.id);
      crm_region_ids = (ur || []).map((r) => r.region_id).filter(Boolean);
    } catch (_) {
      crm_region_ids = [];
    }
    res.json({
      user: {
        id: u.id,
        userId: u.id,
        email: u.email,
        fullName: u.full_name,
        full_name: u.full_name,
        role: u.role,
        avatar: u.avatar,
        phone: u.phone,
        department_id: u.department_id,
        company_id,
        crm_region_ids,
        position: u.position,
      },
    });
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
