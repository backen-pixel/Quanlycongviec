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
app.use('/api/release-notes', require('./routes/releaseNotes'));
const facebookRouter = require('./routes/facebook');
facebookRouter._ioRef = io;
app.use('/api/facebook', facebookRouter);
// Inject io reference for realtime fb_message events
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

      // ═══ CRM Tasks (crm_tasks) — deadline check ═══
      const in1h = new Date(now.getTime() + 60 * 60 * 1000);
      const in2h = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const tomorrowStart = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate()).toISOString();
      const tomorrowEnd = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate() + 1).toISOString();
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

      // CRM tasks deadline trong 1-2 giờ tới (nhắc thực hiện)
      const { data: crmDueSoon } = await supabase.from('crm_tasks')
        .select('id, title, assignee_id, lead_id, deadline, stage_slug')
        .neq('status', 'completed')
        .gte('deadline', in1h.toISOString())
        .lt('deadline', in2h.toISOString())
        .limit(100);

      // CRM tasks deadline trong vòng 1 giờ (nhắc gấp)
      const { data: crmDueVSoon } = await supabase.from('crm_tasks')
        .select('id, title, assignee_id, lead_id, deadline, stage_slug')
        .neq('status', 'completed')
        .gte('deadline', now.toISOString())
        .lt('deadline', in1h.toISOString())
        .limit(100);

      // CRM tasks due tomorrow (nhắc trước 1 ngày)
      const { data: crmDueTomorrow } = await supabase.from('crm_tasks')
        .select('id, title, assignee_id, lead_id, deadline, stage_slug')
        .neq('status', 'completed')
        .gte('deadline', tomorrowStart)
        .lt('deadline', tomorrowEnd)
        .limit(100);

      // CRM tasks due today (but > 2h from now — avoid overlap with crmDueSoon)
      const { data: crmDueToday } = await supabase.from('crm_tasks')
        .select('id, title, assignee_id, lead_id, deadline, stage_slug')
        .neq('status', 'completed')
        .gte('deadline', in2h.toISOString())
        .lt('deadline', todayEnd)
        .limit(100);

      // CRM tasks overdue
      const { data: crmOverdue } = await supabase.from('crm_tasks')
        .select('id, title, assignee_id, lead_id, deadline, stage_slug')
        .neq('status', 'completed')
        .lt('deadline', now.toISOString())
        .limit(100);

      // Get lead info for CRM tasks
      const crmTaskLeadIds = [...new Set([
        ...(crmDueSoon || []).map(t => t.lead_id),
        ...(crmDueVSoon || []).map(t => t.lead_id),
        ...(crmDueTomorrow || []).map(t => t.lead_id),
        ...(crmDueToday || []).map(t => t.lead_id),
        ...(crmOverdue || []).map(t => t.lead_id),
      ].filter(Boolean))];
      
      let leadMap = {};
      if (crmTaskLeadIds.length) {
        const { data: leads } = await supabase.from('crm_leads')
          .select('id, title, code, assigned_to, lead_owner_id')
          .in('id', crmTaskLeadIds);
        (leads || []).forEach(l => { leadMap[l.id] = l; });
      }

      // Dedup: check existing notifications in last 4 hours to avoid spam
      const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString();
      const { data: recentNotifs } = await supabase.from('notifications')
        .select('entity_id, type')
        .in('type', ['crm_deadline_1h', 'crm_deadline_now', 'crm_deadline_warning', 'crm_deadline_today', 'crm_deadline_overdue'])
        .gte('created_at', fourHoursAgo);
      const notifSet = new Set((recentNotifs || []).map(n => `${n.type}:${n.entity_id}`));
      const shouldNotify = (type, entityId) => !notifSet.has(`${type}:${entityId}`);

      const addCrmNotif = (taskList, type, titleText, msgFn) => {
        for (const t of (taskList || [])) {
          if (!shouldNotify(type, t.lead_id || t.id)) continue;
          const lead = leadMap[t.lead_id] || {};
          const uids = [...new Set([t.assignee_id, lead.assigned_to, lead.lead_owner_id].filter(Boolean))];
          const deadlineStr = new Date(t.deadline).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
          for (const uid of uids) {
            notifs.push({
              user_id: uid,
              type,
              title: titleText,
              message: msgFn(t, lead, deadlineStr),
              entity_type: 'crm_lead',
              entity_id: t.lead_id || t.id,
            });
          }
        }
      };

      // 🔔 Còn 1-2 giờ
      addCrmNotif(crmDueSoon, 'crm_deadline_1h', '🔔 Còn ~1 giờ nữa đến hạn!',
        (t, lead, dl) => `Nhiệm vụ "${t.title}" — ${lead.code || ''} ${lead.title || ''} — hạn: ${dl}`);

      // 🚨 Còn dưới 1 giờ  
      addCrmNotif(crmDueVSoon, 'crm_deadline_now', '🚨 Sắp đến hạn!',
        (t, lead, dl) => `"${t.title}" — ${lead.code || ''} ${lead.title || ''} — hạn: ${dl}. Hãy thực hiện ngay!`);

      // 📅 Ngày mai
      addCrmNotif(crmDueTomorrow, 'crm_deadline_warning', '📅 Ngày mai đến hạn',
        (t, lead, dl) => `Nhiệm vụ "${t.title}" — ${lead.code || ''} ${lead.title || ''} — hạn: ${dl}`);

      // ⏰ Hôm nay (>2h)
      addCrmNotif(crmDueToday, 'crm_deadline_today', '⏰ Hôm nay đến hạn!',
        (t, lead, dl) => `Nhiệm vụ "${t.title}" — ${lead.code || ''} ${lead.title || ''} — hạn: ${dl}`);

      // 🚨 Quá hạn
      for (const t of (crmOverdue || [])) {
        if (!shouldNotify('crm_deadline_overdue', t.lead_id || t.id)) continue;
        const lead = leadMap[t.lead_id] || {};
        const daysLate = Math.floor((now - new Date(t.deadline)) / (1000 * 60 * 60 * 24));
        const uids = [...new Set([t.assignee_id, lead.assigned_to, lead.lead_owner_id].filter(Boolean))];
        for (const uid of uids) {
          notifs.push({
            user_id: uid,
            type: 'crm_deadline_overdue',
            title: '🚨 Quá hạn nhiệm vụ!',
            message: `"${t.title}" — ${lead.code || ''} ${lead.title || ''} — quá hạn ${daysLate} ngày`,
            entity_type: 'crm_lead',
            entity_id: t.lead_id || t.id,
          });
        }
      }

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

      console.log(`⏰ Deadline check: Tasks ${dueSoon?.length || 0} sắp hạn, ${overdue?.length || 0} quá hạn | CRM: ${crmDueVSoon?.length || 0} <1h, ${crmDueSoon?.length || 0} 1-2h, ${crmDueToday?.length || 0} hôm nay, ${crmDueTomorrow?.length || 0} ngày mai, ${crmOverdue?.length || 0} quá hạn | ${notifs.length} thông báo`);
    } catch (e) { console.error('Deadline check error:', e.message); }
  };

  // Run deadline check 60s after start, then every 15 minutes
  setTimeout(checkDeadlines, 60000);
  setInterval(checkDeadlines, 15 * 60 * 1000);
});
