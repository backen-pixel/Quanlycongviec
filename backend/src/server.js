const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const http = require('http');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
require('dotenv').config();
const config = require('./config');
const { recordUserPing } = require('./helpers/userPresence');

const app = express();
const server = http.createServer(app);
// RN / Postman thường không gửi Origin — whitelist cứng localhost sẽ chặn handshake → mất realtime chat.
// Vẫn bắt buộc JWT trong `io.use`; CORS ở đây chỉ cho phép upgrade WebSocket.
const io = new Server(server, {
  cors: { origin: true, methods: ['GET', 'POST'], credentials: true },
});
app.set('io', io);

app.use(helmet());

// CORS: phần lớn app dùng whitelist; /api/external xác thực bằng X-Api-Key nên cần cho phép
// gọi từ domain website khác (form landing, widget). Không dùng cookie ở route này.
// `maxAge` (giây) báo trình duyệt cache CORS preflight; giảm số OPTIONS lặp lại
// khi dashboard poll live-version & gọi nhiều endpoint từ cùng origin.
const CORS_PREFLIGHT_MAX_AGE = 600;
const corsMainApp = cors({
  origin: config.corsOrigins,
  credentials: true,
  allowedHeaders: ['Authorization', 'Content-Type', 'Accept', 'X-Requested-With', 'X-Api-Key'],
  exposedHeaders: ['Content-Disposition'],
  maxAge: CORS_PREFLIGHT_MAX_AGE,
});
const corsExternalApi = cors({
  origin: true,
  credentials: false,
  allowedHeaders: ['Content-Type', 'Accept', 'X-Api-Key'],
  methods: ['GET', 'POST', 'OPTIONS'],
  maxAge: CORS_PREFLIGHT_MAX_AGE,
});
app.use((req, res, next) => {
  if (req.path.startsWith('/api/external')) {
    return corsExternalApi(req, res, next);
  }
  return corsMainApp(req, res, next);
});
// Compression: gzip/br for JSON responses. Skip if explicitly disabled.
app.use(compression({
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
}));

const isProd = process.env.NODE_ENV === 'production';
app.use(morgan(isProd ? 'tiny' : 'dev'));

// Upload routes need large bodies; everything else stays small to bound memory.
const UPLOAD_BODY_LIMIT = '256mb';
const STANDARD_BODY_LIMIT = '2mb';
const largeBodyRoutes = ['/api/upload', '/api/voice-recordings', '/api/external'];

app.use((req, res, next) => {
  const isLarge = largeBodyRoutes.some((p) => req.path.startsWith(p));
  const limit = isLarge ? UPLOAD_BODY_LIMIT : STANDARD_BODY_LIMIT;
  express.json({ limit })(req, res, (err) => {
    if (err) return next(err);
    express.urlencoded({ extended: true, limit })(req, res, next);
  });
});

// Rate limiting — protect auth + external webhook endpoints from abuse.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Quá nhiều yêu cầu, vui lòng thử lại sau.' },
});
const externalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded' },
});
app.use('/api/auth', authLimiter);
app.use('/api/external', externalLimiter);

// Friendly JSON parse error — đặc biệt cho /api/external/* (webhook bên thứ 3)
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    const ct = req.headers['content-type'] || '';
    return res.status(400).json({
      error: 'Invalid JSON body',
      hint: 'Body phải là JSON hợp lệ. Đặt header "Content-Type: application/json" và stringify object trước khi gửi.',
      received_content_type: ct,
      example: { phone: '0901234567', customer_name: 'Nguyễn Văn A', note: 'Khách hỏi tủ bếp' },
      raw_message: err.message,
    });
  }
  return next(err);
});

// Metrics middleware — đặt trước các route để đếm mọi request /api/*
const { metricsMiddleware, getSnapshot, resetMetrics } = require('./helpers/requestMetrics');
app.use(metricsMiddleware);

// Serve uploaded files
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Root + Health
app.get('/', (_, res) => res.json({ app: 'TuBep Pro API', status: 'ok' }));
app.get('/api/health', (_, res) => res.json({ status: 'ok', time: new Date().toISOString(), uptime: process.uptime() }));

// ─── Request Metrics (admin only) ───────────────────────────────────────────
const jwt_verify = require('jsonwebtoken');
app.get('/api/metrics', (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = jwt_verify.verify(token, config.jwtSecret);
    if (!['admin', 'manager'].includes(decoded?.role)) return res.status(403).json({ error: 'Forbidden' });
    res.json(getSnapshot());
  } catch { res.status(401).json({ error: 'Invalid token' }); }
});
app.post('/api/metrics/reset', (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const decoded = jwt_verify.verify(token, config.jwtSecret);
    if (decoded?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    resetMetrics();
    res.json({ ok: true });
  } catch { res.status(401).json({ error: 'Invalid token' }); }
});

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
app.use('/api/voice-recordings', require('./routes/voiceRecordings'));
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
app.use('/api/crm/executive', require('./routes/executiveKpi'));
app.use('/api/crm/deal-performance', require('./routes/dealScores'));
app.use('/api/kpi', require('./routes/kpi'));
app.use('/api/crm/assignments', require('./routes/crmAssignments'));
app.use('/api/crm', require('./routes/crm'));
app.use('/api/trash', require('./routes/trash'));
app.use('/api/messenger', require('./routes/messengerGroups'));
app.use('/api/events', require('./routes/events'));
app.use('/api/internal-social', require('./routes/internalSocial'));
app.use('/api/release-notes', require('./routes/releaseNotes'));
const facebookRouter = require('./routes/facebook');
facebookRouter._ioRef = io;
app.use('/api/facebook', facebookRouter);
// Inject io reference for realtime fb_message events
app.use('/api/production', require('./routes/production'));
app.use('/api/logistics', require('./routes/logistics'));
app.use('/api/workshop', require('./routes/workshopTypes'));
app.use('/api/workshop-teams', require('./routes/workshopTeams'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/external', require('./routes/external'));
try { app.use('/api/push', require('./routes/push')); } catch (e) { console.warn('⚠️ Push route failed to load:', e.message); }
try { app.use('/api/assistant', require('./routes/assistant')); } catch (e) { console.warn('⚠️ Assistant route failed to load:', e.message); }
try { app.use('/api/integrations/stringee', require('./routes/stringee')); } catch (e) { console.warn('⚠️ Stringee route failed to load:', e.message); }

// ─── Serve Frontend (SPA) in production ──
const frontendDist = path.join(__dirname, '../../frontend/dist');
const fs = require('fs');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist, {
    setHeaders(res, filePath) {
      if (filePath.replace(/\\/g, '/').endsWith('/index.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }));
  // SPA fallback: any non-API route → index.html
  app.get('/{*splat}', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/socket.io')) return next();
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
  console.log('🌐 Serving frontend from', frontendDist);
}

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
  const userId = socket.user?.userId || socket.user?.id;
  console.log('🔌 Connected:', socket.id, '| User:', socket.user?.fullName);

  // Join personal room for targeted notifications
  if (userId) socket.join(`user:${userId}`);

  // Presence: ping ngay khi kết nối socket (bổ sung HTTP POST /users/ping)
  if (userId) {
    void recordUserPing(userId).catch(() => {});
  }
  socket.on('presence:ping', () => {
    const uid = socket.user?.userId || socket.user?.id;
    if (!uid) return;
    void recordUserPing(uid).catch(() => {});
  });

  socket.on('join:project', (id) => socket.join(`project:${id}`));
  socket.on('join:lead', (id) => socket.join(`lead:${id}`));
  socket.on('leave:lead', (id) => socket.leave(`lead:${id}`));
  socket.on('join:messenger_group', (id) => id && socket.join(`messenger_group:${id}`));
  socket.on('leave:messenger_group', (id) => id && socket.leave(`messenger_group:${id}`));
  socket.on('join:dept', (id) => socket.join(`dept:${id}`));
  socket.on('leave:dept', (id) => socket.leave(`dept:${id}`));

  socket.on('task:moved', (data) => {
    io.emit('task:updated', data);
  });

  socket.on('disconnect', () => {
    console.log('❌ Disconnected:', socket.id);
  });
});

const { isExpiryDeadlineNotificationType: isExpiryNotifType } = require('./helpers/notificationOperationalFilter');
const { preferenceKeyForNotificationType } = require('./helpers/notificationPrefTypes');
const { isNotificationAllowedForUser } = require('./helpers/notificationPrefsUser');

/** True nếu thông báo thuộc module Quản lý công việc (Dự án) — đã tắt cứng theo yêu cầu. */
function isProjectModuleNotification(notification) {
  if (!notification) return false;
  const key = preferenceKeyForNotificationType(notification.type, notification.entity_type, notification.metadata);
  if (key === 'project_notifications') return true;
  if (notification.entity_type === 'project') return true;
  if (notification.metadata && typeof notification.metadata === 'object'
      && String(notification.metadata.ecosystem_module_key || '') === 'projects') return true;
  return false;
}

// Helper: push notification to specific user via Socket.IO (+ tôn trọng pref + chặn module Dự án)
app.set('pushNotification', async (userId, notification) => {
  try {
    if (isExpiryNotifType(notification?.type)) return;
    if (isProjectModuleNotification(notification)) return; // tắt cứng module Quản lý công việc
    const allowed = await isNotificationAllowedForUser(
      userId,
      notification?.type,
      notification?.entity_type,
      notification?.metadata,
    );
    if (!allowed) return;
    io.to(`user:${userId}`).emit('notification', notification);
  } catch (e) {
    // không để lỗi pref làm hỏng push: nếu chỉ chặn được kiểu hết hạn thì vẫn cho qua
    if (!isExpiryNotifType(notification?.type) && !isProjectModuleNotification(notification)) {
      io.to(`user:${userId}`).emit('notification', notification);
    }
    console.warn('[pushNotification]', e.message || e);
  }
});

// Export để các route khác có thể dùng cùng logic (filter list/count)
app.set('isProjectModuleNotification', isProjectModuleNotification);

server.listen(config.port, () => {
  console.log(`🚀 TuBep Pro Backend: http://localhost:${config.port}/api`);
  console.log(`⏱️ Server ready in ${process.uptime().toFixed(1)}s`);

  // Cron KPI Tủ bếp: recompute hàng đêm 01:00 (disable bằng KPI_CRON_DISABLED=1)
  try { require('./jobs/kpiNightly').start(); } catch (e) { console.warn('[kpi-cron] Failed to start:', e.message); }

  // Cron CSKH: nhắc chăm lại lead lúc 8h30 & 13h30 VN (disable bằng CSKH_CRON_DISABLED=1)
  try { require('./jobs/cskhReminder').start(io); } catch (e) { console.warn('[cskh-cron] Failed to start:', e.message); }

  // Cron AI nhắc hạn CRM (8:00 & 13:30 VN mặc định) — disable: AI_DEADLINE_CRON_DISABLED=1
  try {
    require('./jobs/aiDeadlineReminder').start(io);
  } catch (e) {
    console.warn('[ai-deadline] Failed to start:', e.message);
  }

  // Cron nhắc hạn "Giao việc CRM" (mỗi 30') — disable: CRM_ASSIGNMENT_REMINDER_DISABLED=1
  try {
    require('./jobs/crmAssignmentDeadlineReminder').start(io);
  } catch (e) {
    console.warn('[crm-assignment-reminder] Failed to start:', e.message);
  }

  // ─── DEADLINE CHECKER — every hour (defer 60s to not impact startup) ──
  const checkDeadlines = async () => {
    try {
      const { supabase } = require('./config/supabase');
      const now = new Date();
      const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

      // Tasks due within 24 hours (not done)
      const { data: dueSoon } = await supabase.from('tasks')
        .select('id,title,assignee_id,created_by_id,due_date,project_id')
        .neq('status', 'done')
        .gte('due_date', now.toISOString())
        .lte('due_date', in24h.toISOString());

      // Tasks already overdue
      const { data: overdue } = await supabase.from('tasks')
        .select('id,title,assignee_id,created_by_id,due_date,project_id')
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

      // CRM tasks deadline trong 1-2 giờ tới (nhắc trước 1 giờ)
      const { data: crmDueSoon } = await supabase.from('crm_tasks')
        .select('id, title, assignee_id, lead_id, deadline, stage_slug')
        .neq('status', 'completed')
        .gte('deadline', now.toISOString())
        .lt('deadline', in2h.toISOString())
        .limit(100);

      // CRM tasks due tomorrow (nhắc trước 1 ngày)
      const { data: crmDueTomorrow } = await supabase.from('crm_tasks')
        .select('id, title, assignee_id, lead_id, deadline, stage_slug')
        .neq('status', 'completed')
        .gte('deadline', tomorrowStart)
        .lt('deadline', tomorrowEnd)
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
        ...(crmDueTomorrow || []).map(t => t.lead_id),
        ...(crmOverdue || []).map(t => t.lead_id),
      ].filter(Boolean))];
      
      let leadMap = {};
      if (crmTaskLeadIds.length) {
        const { data: leads } = await supabase.from('crm_leads')
          .select('id, title, code, assigned_to, lead_owner_id, region_id')
          .in('id', crmTaskLeadIds);
        (leads || []).forEach(l => { leadMap[l.id] = l; });
      }

      const {
        pickCrmDeadlineRecipientForTaskWithModule,
        buildProjectTaskDeadlineNotif,
        crmTaskDeadlineModuleKey,
        buildCrmTaskDeadlineMetadata,
        loadDeadlineUserCompanyDivisionContext,
        userRowMatchesCompanyModuleDivision,
        MODULE_LABEL,
      } = require('./helpers/deadlineModuleNotifications');
      const { getRestrictedDivisionIdsForModule } = require('./helpers/ecosystemModuleScope');

      const restrictedEco = {
        crm: await getRestrictedDivisionIdsForModule('crm'),
        production: await getRestrictedDivisionIdsForModule('production'),
        logistics: await getRestrictedDivisionIdsForModule('logistics'),
        projects: await getRestrictedDivisionIdsForModule('projects'),
      };

      const crmAllTasks = [...(crmDueSoon || []), ...(crmDueTomorrow || []), ...(crmOverdue || [])];
      const crmCandidateUserIds = [];
      for (const t of crmAllTasks) {
        const lead = leadMap[t.lead_id] || {};
        crmCandidateUserIds.push(t.assignee_id, lead.lead_owner_id, lead.assigned_to);
      }
      const projectAssigneeIds = [...(dueSoon || []), ...(overdue || [])].map((t) => t.assignee_id);
      const { usersById, companyToDivisions } = await loadDeadlineUserCompanyDivisionContext(supabase, [
        ...crmCandidateUserIds,
        ...projectAssigneeIds,
      ]);

      const crmUidUnique = [...new Set(crmCandidateUserIds.filter(Boolean).map((x) => String(x)))];
      let crmUserRegionMap = new Map();
      if (crmUidUnique.length) {
        const { data: urCrm } = await supabase
          .from('user_company_regions')
          .select('user_id, region_id')
          .in('user_id', crmUidUnique);
        for (const r of urCrm || []) {
          const uid = String(r.user_id);
          if (!crmUserRegionMap.has(uid)) crmUserRegionMap.set(uid, []);
          crmUserRegionMap.get(uid).push(r.region_id);
        }
      }

      // Dedup: check existing notifications in last 4 hours (theo từng nhiệm vụ / task)
      const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString();
      const DEADLINE_DEDUP_TYPES = [
        'crm_deadline_1h', 'crm_deadline_warning', 'crm_deadline_overdue',
        'production_task_deadline_warning', 'production_task_deadline_overdue',
        'logistics_task_deadline_warning', 'logistics_task_deadline_overdue',
        'project_pipeline_deadline_warning', 'project_pipeline_deadline_overdue',
        'invoice_overdue',
      ];
      const { data: recentNotifs } = await supabase.from('notifications')
        .select('entity_id, type')
        .in('type', DEADLINE_DEDUP_TYPES)
        .gte('created_at', fourHoursAgo);
      const notifSet = new Set((recentNotifs || []).map((n) => `${n.type}:${n.entity_id}`));
      const shouldNotify = (type, entityId) => entityId && !notifSet.has(`${type}:${entityId}`);

      // Batch: collect all notifications to insert
      const notifs = [];

      /** CRM: một người (assignee → chủ lead → phụ trách) thuộc công ty có quyền module CRM hoặc SX (sx_*). */
      const addCrmNotif = (taskList, type, titleText, msgFn) => {
        for (const t of (taskList || [])) {
          if (!shouldNotify(type, t.id)) continue;
          const lead = leadMap[t.lead_id] || {};
          const moduleKey = crmTaskDeadlineModuleKey(t.stage_slug);
          const ecoKey = moduleKey === 'production' ? 'production' : 'crm';
          const uid = pickCrmDeadlineRecipientForTaskWithModule(
            t,
            lead,
            moduleKey,
            usersById,
            companyToDivisions,
            restrictedEco[ecoKey],
            crmUserRegionMap,
          );
          if (!uid) continue;
          const deadlineStr = new Date(t.deadline).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
          const modLabel = MODULE_LABEL[moduleKey] || moduleKey;
          const meta = buildCrmTaskDeadlineMetadata(t, lead, moduleKey);
          notifs.push({
            user_id: uid,
            type,
            title: `[${modLabel}] ${titleText}`,
            message: msgFn(t, lead, deadlineStr),
            entity_type: 'crm_task',
            entity_id: t.id,
            metadata: meta,
          });
        }
      };

      // 📅 Nhắc trước 1 ngày
      addCrmNotif(crmDueTomorrow, 'crm_deadline_warning', '📅 Nhắc: Ngày mai đến hạn',
        (t, lead, dl) => `Nhiệm vụ "${t.title}" — ${lead.code || ''} ${lead.title || ''} — hạn: ${dl}`);

      // 🔔 Nhắc trước 1 giờ
      addCrmNotif(crmDueSoon, 'crm_deadline_1h', '🔔 Nhắc: Còn 1 giờ nữa đến hạn!',
        (t, lead, dl) => `Nhiệm vụ "${t.title}" — ${lead.code || ''} ${lead.title || ''} — hạn: ${dl}. Hãy thực hiện ngay!`);

      // 🚨 Quá hạn (CRM)
      for (const t of (crmOverdue || [])) {
        if (!shouldNotify('crm_deadline_overdue', t.id)) continue;
        const lead = leadMap[t.lead_id] || {};
        const moduleKey = crmTaskDeadlineModuleKey(t.stage_slug);
        const ecoKey = moduleKey === 'production' ? 'production' : 'crm';
        const uid = pickCrmDeadlineRecipientForTaskWithModule(
          t,
          lead,
          moduleKey,
          usersById,
          companyToDivisions,
          restrictedEco[ecoKey],
          crmUserRegionMap,
        );
        if (!uid) continue;
        const daysLate = Math.floor((now - new Date(t.deadline)) / (1000 * 60 * 60 * 24));
        const modLabel = MODULE_LABEL[moduleKey] || moduleKey;
        const meta = buildCrmTaskDeadlineMetadata(t, lead, moduleKey);
        notifs.push({
          user_id: uid,
          type: 'crm_deadline_overdue',
          title: `[${modLabel}] 🚨 Quá hạn nhiệm vụ!`,
          message: `"${t.title}" — ${lead.code || ''} ${lead.title || ''} — quá hạn ${daysLate} ngày`,
          entity_type: 'crm_task',
          entity_id: t.id,
          metadata: meta,
        });
      }

      // Invoices overdue (due_date < today, paid_amount < total)
      const { data: overdueInvoices } = await supabase.from('invoices')
        .select('id,code,total,paid_amount,due_date,created_by')
        .lt('due_date', todayStart)
        .limit(50);

      // Nhiệm vụ bảng `tasks`: phân module theo projects.status (SX / VC / pipeline dự án), chỉ gửi assignee_id.
      const taskDeadlineRows = [...(dueSoon || []), ...(overdue || [])];
      const projectIdsForTaskDeadlines = [...new Set(taskDeadlineRows.map((t) => t.project_id).filter(Boolean))];
      const projectById = new Map();
      if (projectIdsForTaskDeadlines.length) {
        const { data: projForTasks } = await supabase
          .from('projects')
          .select('id, status, code, name')
          .in('id', projectIdsForTaskDeadlines);
        (projForTasks || []).forEach((p) => projectById.set(p.id, p));
      }
      for (const t of (dueSoon || [])) {
        const n = buildProjectTaskDeadlineNotif(t, projectById.get(t.project_id), false);
        if (!n) continue;
        if (String(n.user_id) !== String(t.assignee_id)) continue;
        if (!shouldNotify(n.type, t.id)) continue;
        const eco = n.metadata?.ecosystem_module_key || 'projects';
        const row = usersById.get(String(n.user_id));
        if (!userRowMatchesCompanyModuleDivision(row, companyToDivisions, restrictedEco[eco] ?? restrictedEco.projects)) {
          continue;
        }
        notifs.push(n);
      }
      for (const t of (overdue || [])) {
        const n = buildProjectTaskDeadlineNotif(t, projectById.get(t.project_id), true);
        if (!n) continue;
        if (String(n.user_id) !== String(t.assignee_id)) continue;
        if (!shouldNotify(n.type, t.id)) continue;
        const eco = n.metadata?.ecosystem_module_key || 'projects';
        const row = usersById.get(String(n.user_id));
        if (!userRowMatchesCompanyModuleDivision(row, companyToDivisions, restrictedEco[eco] ?? restrictedEco.projects)) {
          continue;
        }
        notifs.push(n);
      }

      // Hóa đơn quá hạn — chỉ người tạo hóa đơn (chịu trách nhiệm theo luồng hiện tại)
      for (const inv of (overdueInvoices || [])) {
        if (!shouldNotify('invoice_overdue', inv.id)) continue;
        const daysOverdue = Math.floor((now - new Date(inv.due_date)) / (1000 * 60 * 60 * 24));
        if (inv.paid_amount < inv.total && inv.created_by) {
          notifs.push({
            user_id: inv.created_by,
            type: 'invoice_overdue',
            title: '💰 Hóa đơn quá hạn thanh toán',
            message: `Hóa đơn ${inv.code} quá hạn ${daysOverdue} ngày — Còn nợ: ${((inv.total - inv.paid_amount) || 0).toLocaleString('vi-VN')} VND`,
            entity_type: 'invoice',
            entity_id: inv.id,
            metadata: { module_key: 'crm', ecosystem_module_key: 'crm' },
          });
        }
      }

      // Lọc theo notification_preferences từng user
      const { isNotificationAllowedForUser } = require('./helpers/notificationPrefsUser');
      const filteredNotifs = [];
      for (const n of notifs) {
        if (n.user_id && (await isNotificationAllowedForUser(n.user_id, n.type, n.entity_type, n.metadata || null))) {
          filteredNotifs.push(n);
        }
      }

      const toInsert = filteredNotifs;
      if (toInsert.length) {
        const { data: inserted } = await supabase.from('notifications').insert(toInsert).select('*');
        (inserted || []).forEach((n) => io.to(`user:${n.user_id}`).emit('notification', n));
      }

      console.log(
        `⏰ Deadline check: Tasks ${dueSoon?.length || 0} sắp hạn, ${overdue?.length || 0} quá hạn | CRM: ${crmDueSoon?.length || 0} <2h, ${crmDueTomorrow?.length || 0} ngày mai, ${crmOverdue?.length || 0} quá hạn | ${filteredNotifs.length}/${notifs.length} thông báo (sau lọc prefs)`,
      );
    } catch (e) { console.error('Deadline check error:', e.message); }
  };

  // ── Periodic scan: tạo lead cho contacts chưa có lead ──
  const scanMissingLeads = async () => {
    try {
      const { supabase } = require('./config/supabase');
      const { getConfig } = require('./config/autoLeadConfig');
      const cfg = getConfig();
      if (cfg.trigger === 'manual') return; // Không tự động

      const { sortFacebookContactsNewestFirst } = require('./helpers/facebookContactActivity');

      // Contacts chưa có lead_id — xử lý từ hoạt động mới nhất (tin / tạo hồ sơ) để user mới không bị "xếp sau" hàng cũ
      const { data: probeRow } = await supabase.from('facebook_contacts').select('sync_paused').limit(1);
      const _hasPaused = Array.isArray(probeRow);
      let scanQuery2 = supabase.from('facebook_contacts')
        .select(_hasPaused
          ? 'id, fb_name, phone, page_id, psid, lead_id, customer_id, last_message_at, created_at, sync_paused'
          : 'id, fb_name, phone, page_id, psid, lead_id, customer_id, last_message_at, created_at')
        .is('lead_id', null);
      if (_hasPaused) scanQuery2 = scanQuery2.neq('sync_paused', true);
      const { data: contactsRaw } = await scanQuery2;

      const contacts = sortFacebookContactsNewestFirst(contactsRaw || []);
      if (!contacts.length) return;

      let created = 0;
      for (const contact of contacts) {
        // Check có message inbound không
        const { count } = await supabase.from('facebook_messages')
          .select('id', { count: 'exact', head: true })
          .eq('contact_id', contact.id)
          .eq('direction', 'inbound');

        if (!count || count === 0) continue;

        // Check trigger condition
        let shouldCreate = false;
        if (cfg.trigger === 'first_message') {
          shouldCreate = true;
        } else if (cfg.trigger === 'message_count') {
          shouldCreate = count >= (cfg.message_count_threshold || 2);
        } else if (cfg.trigger === 'has_phone') {
          // Extract phone from messages
          const { data: msgs } = await supabase.from('facebook_messages')
            .select('content').eq('contact_id', contact.id).eq('direction', 'inbound').limit(20);
          const phoneMatch = (msgs || []).map(m => m.content || '').join(' ').match(/(0[1-9][0-9]{8,9})/);
          if (phoneMatch) {
            contact.phone = phoneMatch[1];
            await supabase.from('facebook_contacts').update({ phone: phoneMatch[1] }).eq('id', contact.id);
          }
          shouldCreate = !!(contact.phone || phoneMatch);
        }

        if (!shouldCreate) continue;

        // Check lead cũ bị xóa
        if (!cfg.recreate_deleted_leads) {
          const { data: oldMsgs } = await supabase.from('facebook_messages')
            .select('lead_id').eq('contact_id', contact.id).not('lead_id', 'is', null).limit(1);
          if (oldMsgs?.length) continue;
        }

        // Import createLeadFromFacebook — gọi trực tiếp qua route
        const page = await supabase.from('facebook_pages')
          .select('*').eq('page_id', contact.page_id).eq('is_active', true).single();
        if (!page.data) continue;

        // Tạo customer + lead
        const { data: fbSource } = await supabase.from('crm_sources')
          .select('id').eq('name', 'Facebook').single();
        const { count: leadCount } = await supabase.from('crm_leads')
          .select('id', { count: 'exact', head: true }).eq('type', 'lead');
        const code = 'LEAD-' + String((leadCount || 0) + 1).padStart(4, '0');

        let stageId = page.data.default_stage_id || null;
        if (!stageId) {
          const { data: ds } = await supabase.from('crm_pipeline_stages')
            .select('id').eq('pipeline_type', 'lead').order('order_index').limit(1).single();
          stageId = ds?.id || null;
        }

        let customerId = contact.customer_id;
        if (!customerId) {
          const { data: cust } = await supabase.from('customers')
            .insert({ full_name: contact.fb_name || 'Facebook KH', phone: contact.phone || '', source: 'Facebook' })
            .select().single();
          if (cust) {
            customerId = cust.id;
            await supabase.from('facebook_contacts').update({ customer_id: cust.id }).eq('id', contact.id);
          }
        }

        // IMPORTANT: tạo lead qua API CRM chuẩn để auto-gen tasks + tạo Đơn 1 (fulfillment)
        const port = config.port;
        const token = jwt.sign(
          { userId: page.data.created_by, role: 'admin', fullName: 'Auto Pipeline' },
          config.jwtSecret,
          { expiresIn: '15m' },
        );
        let lead = null;
        try {
          const r = await axios.post(`http://localhost:${port}/api/crm/leads`, {
            title: '[FB] ' + (contact.fb_name || 'KH Facebook'),
            customer_id: customerId || null,
            source_id: page.data.default_source_id || fbSource?.id || null,
            stage_id: stageId || null,
            company_id: page.data.default_company_id || null,
            assigned_to: page.data.default_lead_owner_id || page.data.created_by,
          }, { headers: { authorization: `Bearer ${token}` } });
          lead = r.data;
        } catch (e) {
          console.error('[Scan] Lead create error:', e.response?.data?.error || e.message);
          continue;
        }

        await supabase.from('facebook_contacts').update({ lead_id: lead.id }).eq('id', contact.id);
        // Không đồng bộ message nền để giảm egress; chỉ link contact -> lead.
        created++;
        console.log(`[Scan] ✅ Lead auto-created: ${lead.code} — ${contact.fb_name}`);
      }

      if (created > 0) console.log(`[Scan] Created ${created} leads from ${contacts.length} orphan contacts`);
    } catch (e) {
      console.error('[Scan] Error:', e.message);
    }
  };

  // Cron kiểm tra hạn nhiệm vụ — đã tắt. Bật lại: mở comment 2 dòng dưới (60s sau start, rồi mỗi 15 phút).
  // setTimeout(checkDeadlines, 60000);
  // setInterval(checkDeadlines, 15 * 60 * 1000);

  // Tắt scanMissingLeads chạy nền ở server startup để giảm egress.
  // Lead scan tự động chỉ chạy qua công cụ /facebook/lead-scan/config với timer riêng.
});
