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
app.use(express.json());

// Serve uploaded files
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Root + Health
app.get('/', (_, res) => res.json({ app: 'TuBep Pro API', status: 'ok' }));
app.get('/api/health', (_, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

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
app.use('/api/assistant', require('./routes/assistant'));

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

  // Auto-fix seed passwords - chạy async sau khi server đã listen
  setImmediate(async () => {
    try {
      const bcrypt = require('bcryptjs');
      const { supabase } = require('./config/supabase');
      const seedEmails = ['admin@tubep.vn','sales@tubep.vn','designer@tubep.vn','production@tubep.vn','installer@tubep.vn','manager@tubep.vn'];
      const hash = await bcrypt.hash('admin123', 12);
      await supabase.from('users').update({ password: hash }).in('email', seedEmails);
      console.log('✅ Seed passwords reset OK');
    } catch (e) { console.error('⚠️ Seed passwords:', e.message); }
  });

  // ─── DEADLINE CHECKER — every hour ──
  const checkDeadlines = async () => {
    try {
      const { supabase } = require('./config/supabase');
      const now = new Date();
      const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      // Tasks due within 24 hours (not done)
      const { data: dueSoon } = await supabase.from('tasks')
        .select('id,title,assignee_id,created_by_id,due_date')
        .neq('status', 'done')
        .gte('due_date', now.toISOString())
        .lte('due_date', in24h.toISOString());

      for (const t of (dueSoon || [])) {
        const targets = [t.assignee_id, t.created_by_id].filter(Boolean);
        for (const uid of [...new Set(targets)]) {
          // Check if we already notified today
          const { count } = await supabase.from('notifications')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', uid).eq('entity_id', t.id).eq('type', 'deadline_warning')
            .gte('created_at', new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString());
          if (!count) {
            const dueDate = new Date(t.due_date).toLocaleDateString('vi-VN');
            const { data: notif } = await supabase.from('notifications').insert({
              user_id: uid, type: 'deadline_warning',
              title: '⏰ Sắp hết hạn',
              message: `"${t.title}" — hạn chót: ${dueDate}`,
              entity_type: 'task', entity_id: t.id,
            }).select().single();
            if (notif) io.to(`user:${uid}`).emit('notification', notif);
          }
        }
      }

      // Tasks already overdue
      const { data: overdue } = await supabase.from('tasks')
        .select('id,title,assignee_id,created_by_id,due_date')
        .neq('status', 'done')
        .lt('due_date', now.toISOString());

      for (const t of (overdue || [])) {
        const targets = [t.assignee_id, t.created_by_id].filter(Boolean);
        for (const uid of [...new Set(targets)]) {
          const { count } = await supabase.from('notifications')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', uid).eq('entity_id', t.id).eq('type', 'deadline_overdue')
            .gte('created_at', new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString());
          if (!count) {
            const dueDate = new Date(t.due_date).toLocaleDateString('vi-VN');
            const { data: notif } = await supabase.from('notifications').insert({
              user_id: uid, type: 'deadline_overdue',
              title: '🚨 Quá hạn!',
              message: `"${t.title}" đã quá hạn từ ${dueDate}`,
              entity_type: 'task', entity_id: t.id,
            }).select().single();
            if (notif) io.to(`user:${uid}`).emit('notification', notif);
          }
        }
      }

      console.log(`⏰ Deadline check: ${dueSoon?.length || 0} sắp hạn, ${overdue?.length || 0} quá hạn`);
    } catch (e) { console.error('Deadline check error:', e.message); }
  };

  // Run immediately then every hour
  setTimeout(checkDeadlines, 5000);
  setInterval(checkDeadlines, 60 * 60 * 1000);
});
