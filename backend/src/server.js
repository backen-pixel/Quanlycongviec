const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
require('dotenv').config();
const config = require('./config');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: config.corsOrigins, methods: ['GET','POST'], credentials: true } });
app.set('io', io);

app.use(helmet());
app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve uploaded files
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Root + Health
app.get('/', (_, res) => res.json({ app: 'TuBep Pro API', status: 'ok' }));
app.get('/api/health', (_, res) => res.json({ status: 'ok', time: new Date().toISOString(), uptime: process.uptime() }));

// Seed endpoint — only run manually when needed (not on every startup)
app.post('/api/seed-passwords', async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const { supabase } = require('./config/supabase');
    const seedEmails = ['admin@tubep.vn','sales@tubep.vn','designer@tubep.vn','production@tubep.vn','installer@tubep.vn','manager@tubep.vn'];
    const hash = await bcrypt.hash('admin123', 10);
    await supabase.from('users').update({ password: hash }).in('email', seedEmails);
    res.json({ ok: true, message: 'Seed passwords reset' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/products', require('./routes/products'));
app.use('/api/dashboard-main', require('./routes/dashboardMain'));
app.use('/api/dashboard', require('./routes/dashboardDivisions')); // Must be before generic dashboard
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/divisions', require('./routes/divisions'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/templates', require('./routes/templates'));
app.use('/api/companies', require('./routes/companies'));
app.use('/api/departments', require('./routes/departments'));
app.use('/api/teams', require('./routes/teams'));
app.use('/api/stages', require('./routes/stages'));
app.use('/api/approvals', require('./routes/approvals'));
app.use('/api/ecosystem', require('./routes/ecosystem'));
app.use('/api/company-templates', require('./routes/companyTemplates'));
app.use('/api/flows', require('./routes/flows'));
app.use('/api/company-processes', require('./routes/companyProcesses'));
app.use('/api/permissions', require('./routes/permissions'));
app.use('/api/crm', require('./routes/crm'));
app.use('/api/events', require('./routes/events'));
app.use('/api/production', require('./routes/production'));
app.use('/api/settings', require('./routes/settings'));
try { app.use('/api/push', require('./routes/push')); } catch (e) { console.warn('⚠️ Push route failed to load:', e.message); }
try { app.use('/api/assistant', require('./routes/assistant')); } catch (e) { console.warn('⚠️ Assistant route failed to load:', e.message); }

// ─── Socket.IO with Auth ──
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('No token'));
  try {
    socket.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch { next(new Error('Invalid token')); }
});

io.on('connection', (socket) => {
  const userId = socket.user?.userId;
  console.log('🔌 Connected:', socket.id, '| User:', socket.user?.fullName);

  // Join personal room for targeted notifications
  if (userId) socket.join(`user:${userId}`);

  socket.on('join:project', (id) => socket.join(`project:${id}`));

  socket.on('task:moved', (data) => {
    io.emit('task:updated', data);
  });

  socket.on('disconnect', () => {
    console.log('❌ Disconnected:', socket.id);
  });
});

// Helper: push notification to specific user via Socket.IO
app.set('pushNotification', (userId, notification) => {
  io.to(`user:${userId}`).emit('notification', notification);
});

server.listen(config.port, () => {
  console.log(`🚀 TuBep Pro Backend: http://localhost:${config.port}/api`);
  console.log(`⏱️ Server ready in ${process.uptime().toFixed(1)}s`);

  // ─── DEADLINE CHECKER — every hour (defer 60s to not impact startup) ──
  const checkDeadlines = async () => {
    try {
      const { supabase } = require('./config/supabase');
      const now = new Date();
      const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

      // Tasks due within 24 hours (not done)
      const { data: dueSoon } = await supabase.from('tasks')
        .select('id,title,assignee_id,created_by_id,due_date')
        .neq('status', 'done')
        .gte('due_date', now.toISOString())
        .lte('due_date', in24h.toISOString());

      // Tasks already overdue
      const { data: overdue } = await supabase.from('tasks')
        .select('id,title,assignee_id,created_by_id,due_date')
        .neq('status', 'done')
        .lt('due_date', now.toISOString())
        .limit(50);

      // Invoices overdue (due_date < today, paid_amount < total)
      const { data: overdueInvoices } = await supabase.from('invoices')
        .select('id,code,total,paid_amount,due_date,created_by')
        .lt('due_date', todayStart)
        .limit(50);

      // Batch: collect all notifications to insert
      const notifs = [];
      for (const t of (dueSoon || [])) {
        const uid = t.assignee_id || t.created_by_id;
        if (uid) notifs.push({ user_id: uid, type: 'deadline_warning', title: '⏰ Sắp hết hạn', message: `"${t.title}" — hạn: ${new Date(t.due_date).toLocaleDateString('vi-VN')}`, entity_type: 'task', entity_id: t.id });
      }
      for (const t of (overdue || [])) {
        const uid = t.assignee_id || t.created_by_id;
        if (uid) notifs.push({ user_id: uid, type: 'deadline_overdue', title: '🚨 Quá hạn!', message: `"${t.title}" đã quá hạn từ ${new Date(t.due_date).toLocaleDateString('vi-VN')}`, entity_type: 'task', entity_id: t.id });
      }

      // Invoice overdue notifications — notify accounting + sales
      for (const inv of (overdueInvoices || [])) {
        const daysOverdue = Math.floor((now - new Date(inv.due_date)) / (1000 * 60 * 60 * 24));
        if (inv.paid_amount < inv.total) {
          // Get accounting & sales users
          const { data: accountingUsers } = await supabase.from('users')
            .select('id').eq('department_id', (await supabase.from('departments').select('id').eq('name', 'Kế toán').single()).data?.id);
          const { data: salesUsers } = await supabase.from('users')
            .select('id').eq('department_id', (await supabase.from('departments').select('id').eq('name', 'Bán hàng').single()).data?.id);
          
          const targetUserIds = [...new Set([
            ...((accountingUsers || []).map(u => u.id) || []),
            ...((salesUsers || []).map(u => u.id) || []),
            inv.created_by
          ].filter(Boolean))];

          for (const uid of targetUserIds) {
            notifs.push({
              user_id: uid,
              type: 'invoice_overdue',
              title: '💰 Hóa đơn quá hạn thanh toán',
              message: `Hóa đơn ${inv.code} quá hạn ${daysOverdue} ngày — Còn nợ: ${((inv.total - inv.paid_amount) || 0).toLocaleString('vi-VN')} VND`,
              entity_type: 'invoice',
              entity_id: inv.id
            });
          }
        }
      }

      // Batch insert (ignore dupes via unique constraint or just let it be)
      if (notifs.length) {
        const { data: inserted } = await supabase.from('notifications').insert(notifs).select('id,user_id');
        (inserted || []).forEach(n => io.to(`user:${n.user_id}`).emit('notification', n));
      }

      console.log(`⏰ Deadline check: ${dueSoon?.length || 0} sắp hạn, ${overdue?.length || 0} quá hạn, ${overdueInvoices?.length || 0} hóa đơn quá hạn`);
    } catch (e) { console.error('Deadline check error:', e.message); }
  };

  // Run deadline check 60s after start, then every hour
  setTimeout(checkDeadlines, 60000);
  setInterval(checkDeadlines, 60 * 60 * 1000);
});
