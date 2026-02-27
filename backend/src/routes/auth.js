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
    const token = jwt.sign({ userId: user.id, email: user.email, role: user.role, fullName: user.full_name }, config.jwtSecret, { expiresIn: '7d' });

    res.json({ token, user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role, avatar: user.avatar, phone: user.phone } });
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

// Thông tin user hiện tại
r.get('/me', auth, (req, res) => res.json({ user: req.user }));

module.exports = r;
