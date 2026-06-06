const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const http = require('http');
const { externalAxios } = require('./config/httpAgents');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
require('dotenv').config();
const config = require('./config');
const { recordUserPing, setPresenceBroadcast } = require('./helpers/userPresence');
const { isAdminLike } = require('./helpers/adminRole');

const app = express();
const server = http.createServer(app);
// RN / Postman thường không gửi Origin — whitelist cứng localhost sẽ chặn handshake → mất realtime chat.
// Vẫn bắt buộc JWT trong `io.use`; CORS ở đây chỉ cho phép upgrade WebSocket.
const io = new Server(server, {
  cors: { origin: true, methods: ['GET', 'POST'], credentials: true },
});
app.set('io', io);

setPresenceBroadcast((userId, last_ping_at) => {
  io.emit('presence:update', {
    user_id: userId,
    online: true,
    last_ping_at: last_ping_at || new Date().toISOString(),
  });
});

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
const largeBodyRoutes = ['/api/upload', '/api/voice-recordings', '/api/external', '/api/messenger'];

/** Zalo OA webhook — giữ rawBody để verify X-ZEvent-Signature */
app.use('/api/zalo/webhook', express.raw({ type: '*/*', limit: '1mb' }), (req, res, next) => {
  if (req.method === 'POST' && Buffer.isBuffer(req.body)) {
    req.rawBody = req.body.toString('utf8');
    try {
      req.body = JSON.parse(req.rawBody);
    } catch {
      req.body = {};
    }
  }
  next();
});

app.use((req, res, next) => {
  if (req.path === '/api/zalo/webhook' && req.method === 'POST' && req.rawBody != null) {
    return next();
  }
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

// Serve uploaded files (cho phép frontend khác origin tải audio/video)
const path = require('path');
app.use('/uploads', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
}, express.static(path.join(__dirname, '../uploads')));

// Root + Health
app.get('/', (_, res) => res.json({ app: 'TuBep Pro API', status: 'ok' }));
const { getStatus: getRedisStatus, getRedis: _initRedis } = require('./config/redis');
const { isPgEnabled } = require('./config/db');
_initRedis(); // khởi tạo kết nối nền nếu có REDIS_URL
app.get('/api/health', (_, res) => res.json({
  status: 'ok',
  time: new Date().toISOString(),
  uptime: process.uptime(),
  redis: getRedisStatus(),
  pg_pool: isPgEnabled() ? 'enabled' : 'disabled',
  response_cache: process.env.RESPONSE_CACHE_DISABLED === '1' ? 'disabled' : 'enabled',
}));

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
    if (!isAdminLike(decoded)) return res.status(403).json({ error: 'Forbidden' });
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
app.use('/api/work-tasks', require('./routes/workTasks'));
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
app.use('/api/knowledge', require('./routes/knowledge'));
const facebookRouter = require('./routes/facebook');
facebookRouter._ioRef = io;
app.use('/api/facebook', facebookRouter);
const zaloRouter = require('./routes/zalo');
zaloRouter._ioRef = io;
app.use('/api/zalo', zaloRouter);
// Inject io reference for realtime fb_message events
app.use('/api/production', require('./routes/production'));
app.use('/api/logistics', require('./routes/logistics'));
app.use('/api/workshop', require('./routes/workshopTypes'));
app.use('/api/workshop-teams', require('./routes/workshopTeams'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/external', require('./routes/external'));
try { app.use('/api/push', require('./routes/push')); } catch (e) { console.warn('⚠️ Push route failed to load:', e.message); }
try { app.use('/api/devices', require('./routes/devices')); } catch (e) { console.warn('⚠️ Devices route failed to load:', e.message); }
try { app.use('/api/assistant', require('./routes/assistant')); } catch (e) { console.warn('⚠️ Assistant route failed to load:', e.message); }
try { app.use('/api/ai-chat-bot', require('./routes/aiChatBot')); } catch (e) { console.warn('⚠️ AI Chat Bot route failed to load:', e.message); }
try { app.use('/api/user-activity', require('./routes/userActivityLog')); } catch (e) { console.warn('⚠️ User Activity Log route failed to load:', e.message); }
try { app.use('/api/auth-events', require('./routes/authEventLog')); } catch (e) { console.warn('⚠️ Auth Event Log route failed to load:', e.message); }
try { app.use('/api/integrations/stringee', require('./routes/stringee')); } catch (e) { console.warn('⚠️ Stringee route failed to load:', e.message); }

// ─── Serve Frontend (SPA) in production ──
const frontendDist = path.join(__dirname, '../../frontend/dist');
const fs = require('fs');
if (fs.existsSync(frontendDist)) {
  const releaseNotesDir = path.join(frontendDist, 'release-notes');
  if (fs.existsSync(releaseNotesDir)) {
    app.use('/release-notes', express.static(releaseNotesDir, {
      maxAge: '7d',
    }));
  }
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

/** State in-memory cho group call — map<callId, {groupId, groupName, hostId, kind, participants: Map<uid, {name}>}> */
const activeGroupCalls = new Map();
/** Cuộc gọi 1-1 — ghi log vào messenger chat khi kết thúc */
const activeDirectCalls = new Map();
const {
  resolveDirectMessengerGroupId,
  finalizeDirectCallLog,
  finalizeGroupCallLog,
} = require('./helpers/messengerCallLog');

/** Callee đang có socket CRM mở — không cần FCM (tránh chuông reo lần 2). */
function isUserSocketOnline(userId) {
  if (!userId) return false;
  const room = io.sockets.adapter.rooms.get(`user:${String(userId)}`);
  return !!room && room.size > 0;
}

/** Push thông báo cuộc gọi đến khi app đóng / socket ngắt. */
async function pushIncomingCall(toUserId, payload) {
  if (!toUserId || !payload?.callId) return;
  try {
    const { sendMobilePush } = require('./services/pushSender');
    const isGroup = !!payload.isGroup;
    await sendMobilePush(String(toUserId), {
      id: `call-${payload.callId}`,
      type: 'incoming_call',
      title: isGroup ? 'Cuộc gọi nhóm' : 'Cuộc gọi đến',
      message: isGroup
        ? `${payload.fromName || 'Ai đó'} mời bạn tham gia`
        : `${payload.fromName || 'Ai đó'} đang gọi bạn`,
      entity_type: isGroup ? 'messenger_group' : 'user',
      entity_id: isGroup ? payload.groupId : payload.fromUserId,
      metadata: {
        call_id: payload.callId,
        kind: payload.kind || 'audio',
        from_user_id: payload.fromUserId,
        from_name: payload.fromName || 'Người gọi',
        is_group: isGroup,
        group_id: payload.groupId || null,
        group_name: payload.groupName || null,
      },
    });
  } catch (e) {
    console.warn('[pushIncomingCall]', e.message || e);
  }
}

const CALL_RING_MS = 65_000;

/** Khi callee mở app / reconnect socket — gửi lại call:incoming + FCM nếu cuộc gọi vẫn đang reo. */
function syncPendingIncomingCalls(userId, socket) {
  if (!userId || !socket) return;
  const uid = String(userId);
  for (const [callId, session] of activeDirectCalls.entries()) {
    if (String(session.calleeId) !== uid) continue;
    if (session.answeredAt) continue;
    const age = Date.now() - (session.startedAt || 0);
    if (age > CALL_RING_MS) {
      activeDirectCalls.delete(callId);
      continue;
    }
    socket.emit('call:incoming', {
      callId,
      kind: session.kind || 'audio',
      groupId: session.groupId || null,
      fromUserId: session.callerId,
      fromName: session.fromName || 'Người gọi',
    });
    // Callee đã có socket — chỉ sync qua socket, không gửi lại FCM (tránh reo lần 2).
  }
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
  if (userId) {
    socket.join(`user:${userId}`);
    syncPendingIncomingCalls(userId, socket);
  }

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

  /* ── Typing indicator: client phát mỗi 2-3s khi đang gõ, server relay sang
   *    cả room nhưng skip chính sender. Frontend tự auto-stop sau 4s không nhận event. */
  socket.on('messenger_group:typing', ({ group_id, is_typing } = {}) => {
    if (!group_id) return;
    const uid = socket.user?.userId || socket.user?.id;
    if (!uid) return;
    socket.to(`messenger_group:${group_id}`).emit('messenger_group:typing', {
      group_id,
      user_id: uid,
      full_name: socket.user?.fullName || socket.user?.full_name || null,
      is_typing: !!is_typing,
      ts: Date.now(),
    });
  });

  socket.on('task:moved', (data) => {
    io.emit('task:updated', data);
  });

  /* ─── WebRTC voice call signaling (1-1) ───
   * Server chỉ relay event giữa caller ↔ callee dựa trên `user:<id>` room
   * (đã join ở `if (userId) socket.join(...)` phía trên).
   * - call:invite  → callee nhận `call:incoming`
   * - call:accept  → caller nhận `call:accepted`
   * - call:reject  → caller nhận `call:rejected`
   * - call:end     → bên kia nhận `call:ended`
   * - call:signal  → relay SDP offer/answer/ICE candidate
   */
  socket.on('call:invite', ({ callId, toUserId, kind = 'audio', groupId: clientGroupId } = {}) => {
    if (!callId || !toUserId) return;
    const uid = socket.user?.userId || socket.user?.id;
    if (!uid) return;
    void (async () => {
      let groupId = clientGroupId || null;
      if (!groupId) groupId = await resolveDirectMessengerGroupId(uid, toUserId);
      activeDirectCalls.set(callId, {
        groupId,
        callerId: uid,
        calleeId: toUserId,
        fromName: socket.user?.fullName || socket.user?.full_name || 'Người gọi',
        kind: kind === 'video' ? 'video' : 'audio',
        startedAt: Date.now(),
        answeredAt: null,
        logged: false,
      });
      io.to(`user:${toUserId}`).emit('call:incoming', {
        callId,
        kind,
        groupId,
        fromUserId: uid,
        fromName: socket.user?.fullName || socket.user?.full_name || 'Người gọi',
      });
      if (!isUserSocketOnline(toUserId)) {
        void pushIncomingCall(String(toUserId), {
          callId,
          kind,
          groupId,
          fromUserId: uid,
          fromName: socket.user?.fullName || socket.user?.full_name || 'Người gọi',
          isGroup: false,
        });
      }
    })();
  });

  socket.on('call:accept', ({ callId, toUserId } = {}) => {
    if (!callId || !toUserId) return;
    const session = activeDirectCalls.get(callId);
    if (session && !session.answeredAt) session.answeredAt = Date.now();
    io.to(`user:${toUserId}`).emit('call:accepted', { callId });
  });

  socket.on('call:reject', ({ callId, toUserId, reason = 'rejected' } = {}) => {
    if (!callId) return;
    const uid = socket.user?.userId || socket.user?.id;
    const session = activeDirectCalls.get(callId);
    if (session && !session.logged) {
      session.logged = true;
      activeDirectCalls.delete(callId);
      void finalizeDirectCallLog(io, session, { endedByUserId: uid, reason });
    }
    if (toUserId) io.to(`user:${toUserId}`).emit('call:rejected', { callId, reason });
  });

  socket.on('call:end', ({ callId, toUserId } = {}) => {
    if (!callId) return;
    const uid = socket.user?.userId || socket.user?.id;
    const session = activeDirectCalls.get(callId);
    if (session && !session.logged) {
      const status = session.answeredAt ? 'completed' : null;
      session.logged = true;
      activeDirectCalls.delete(callId);
      void finalizeDirectCallLog(io, session, { status, endedByUserId: uid });
    }
    if (toUserId) io.to(`user:${toUserId}`).emit('call:ended', { callId });
  });

  socket.on('call:signal', ({ callId, toUserId, signal } = {}) => {
    if (!callId || !toUserId || !signal) return;
    const uid = socket.user?.userId || socket.user?.id;
    if (!uid) return;
    io.to(`user:${toUserId}`).emit('call:signal', { callId, fromUserId: uid, signal });
  });

  /* ─── Group call signaling (mesh topology) ───
   * Server giữ in-memory state: callId → { groupId, hostId, kind, participants: Map<userId, {name}> }.
   * Khi server restart, mọi cuộc gọi nhóm đang diễn ra sẽ bị mất kết nối — chấp nhận được cho 1-1 mesh.
   *
   * Sự kiện:
   * - call:group_start  { callId, groupId, groupName, memberIds, kind } → mỗi member (≠ host) nhận `call:incoming` với isGroup=true
   * - call:group_join   { callId } → server thêm user vào participants; user nhận `call:group_participants` (danh sách hiện tại),
   *                                  tất cả thành viên đã có nhận `call:group_member_joined`
   * - call:end          { callId } cho group → xoá khỏi participants, broadcast `call:group_member_left`
   * - call:signal       relay như cũ (mỗi cặp 1 peer connection)
   */
  socket.on('call:group_start', ({ callId, groupId, groupName, memberIds = [], kind = 'audio' } = {}) => {
    if (!callId || !groupId || !Array.isArray(memberIds) || memberIds.length === 0) return;
    const uid = socket.user?.userId || socket.user?.id;
    if (!uid) return;
    const hostName = socket.user?.fullName || socket.user?.full_name || 'Người gọi';
    const now = Date.now();
    activeGroupCalls.set(callId, {
      groupId,
      groupName: groupName || 'Cuộc gọi nhóm',
      hostId: uid,
      kind,
      startedAt: now,
      connectedAt: null,
      logged: false,
      participants: new Map([[uid, { name: hostName, joinedAt: now }]]),
      /** invited khi host_start: cho phép join ngay không cần duyệt */
      invitedIds: new Set([...new Set(memberIds.map(String))]),
      /** Map<requesterId, { name, requestedAt }> — yêu cầu join đang chờ host duyệt */
      pendingJoinRequests: new Map(),
    });
    const uniqueMembers = [...new Set(memberIds.map(String))].filter((mid) => mid !== String(uid));
    uniqueMembers.forEach((mid) => {
      io.to(`user:${mid}`).emit('call:incoming', {
        callId,
        kind,
        isGroup: true,
        groupId,
        groupName: groupName || 'Cuộc gọi nhóm',
        fromUserId: uid,
        fromName: hostName,
      });
      if (!isUserSocketOnline(mid)) {
        void pushIncomingCall(mid, {
          callId,
          kind,
          fromUserId: uid,
          fromName: hostName,
          isGroup: true,
          groupId,
          groupName: groupName || 'Cuộc gọi nhóm',
        });
      }
    });
    // Broadcast cho TẤT CẢ thành viên nhóm (kể cả người không nằm trong danh sách mời)
    // → họ sẽ thấy banner "Có cuộc gọi đang diễn ra" với nút Tham gia.
    io.to(`messenger_group:${groupId}`).emit('call:group_room_started', {
      callId,
      groupId,
      groupName: groupName || 'Cuộc gọi nhóm',
      kind,
      hostId: uid,
      hostName,
      startedAt: Date.now(),
    });
  });

  socket.on('call:group_join', ({ callId } = {}) => {
    if (!callId) return;
    const uid = socket.user?.userId || socket.user?.id;
    if (!uid) return;
    const call = activeGroupCalls.get(callId);
    if (!call) return;
    const myName = socket.user?.fullName || socket.user?.full_name || 'Thành viên';
    const existingIds = [...call.participants.keys()].filter((id) => id !== uid);
    const existing = existingIds.map((id) => ({ userId: id, name: call.participants.get(id)?.name || '' }));
    const prevSize = call.participants.size;
    call.participants.set(uid, { name: myName, joinedAt: Date.now() });
    if (!call.connectedAt && call.participants.size >= 2 && prevSize < 2) {
      call.connectedAt = Date.now();
    }
    // Báo cho người mới biết ai đang có trong cuộc — để họ chờ offer từ các participants này
    socket.emit('call:group_participants', { callId, participants: existing, hostId: call.hostId });
    // Báo cho mọi người khác biết có thành viên mới → họ sẽ tạo offer
    existingIds.forEach((pid) => {
      io.to(`user:${pid}`).emit('call:group_member_joined', { callId, userId: uid, name: myName });
    });
  });

  /**
   * Khi user rời cuộc gọi nhóm. Hỗ trợ cả reject (chưa join) lẫn leave (đã join).
   * Nếu user rời là host → tự động chuyển host sang participant join sớm nhất kế tiếp
   * và emit `call:group_host_changed` tới mọi người trong cuộc + về phòng nhóm
   * (để banner của các member khác cập nhật hostName).
   */
  function leaveGroupCall(callId, uid) {
    const call = activeGroupCalls.get(callId);
    if (!call) return;
    const wasParticipant = call.participants.has(uid);
    const wasHost = String(call.hostId) === String(uid);
    call.participants.delete(uid);
    // Huỷ luôn các pending join request người này (nếu là requester)
    if (call.pendingJoinRequests?.has(uid)) call.pendingJoinRequests.delete(uid);

    if (call.participants.size === 0) {
      const { groupId } = call;
      void finalizeGroupCallLog(io, call);
      activeGroupCalls.delete(callId);
      if (groupId) {
        io.to(`messenger_group:${groupId}`).emit('call:group_room_ended', { callId, groupId });
      }
      return;
    }

    if (wasHost) {
      // Chọn host mới = participant join sớm nhất
      let newHostId = null;
      let earliest = Infinity;
      call.participants.forEach((p, pid) => {
        const t = p?.joinedAt || 0;
        if (t < earliest) { earliest = t; newHostId = pid; }
      });
      if (newHostId) {
        call.hostId = newHostId;
        const newHostName = call.participants.get(newHostId)?.name || '';
        // Báo cho mọi participant trong cuộc
        call.participants.forEach((_v, pid) => {
          io.to(`user:${pid}`).emit('call:group_host_changed', {
            callId,
            newHostId,
            newHostName,
          });
        });
        // Báo về phòng nhóm để banner cập nhật
        if (call.groupId) {
          io.to(`messenger_group:${call.groupId}`).emit('call:group_room_started', {
            callId,
            groupId: call.groupId,
            groupName: call.groupName,
            kind: call.kind,
            hostId: newHostId,
            hostName: newHostName,
            startedAt: call.startedAt,
          });
        }
        // Bàn giao luôn các pending request sang host mới
        if (call.pendingJoinRequests?.size > 0) {
          for (const [reqId, info] of call.pendingJoinRequests) {
            io.to(`user:${newHostId}`).emit('call:group_join_request', {
              callId,
              requesterId: reqId,
              requesterName: info.name,
              requestedAt: info.requestedAt,
            });
          }
        }
      }
    }

    if (wasParticipant) {
      call.participants.forEach((_v, pid) => {
        io.to(`user:${pid}`).emit('call:group_member_left', { callId, userId: uid });
      });
    }
  }

  /** Khi member mở chat → hỏi xem nhóm có cuộc gọi đang diễn ra không. */
  socket.on('call:group_room_query', ({ groupId } = {}) => {
    if (!groupId) return;
    for (const [callId, call] of activeGroupCalls) {
      if (String(call.groupId) === String(groupId)) {
        socket.emit('call:group_room_started', {
          callId,
          groupId: call.groupId,
          groupName: call.groupName,
          kind: call.kind,
          hostId: call.hostId,
          hostName: call.participants.get(call.hostId)?.name || '',
          startedAt: call.startedAt || Date.now(),
        });
        return;
      }
    }
    socket.emit('call:group_room_ended', { groupId });
  });

  /**
   * User chủ động xin tham gia cuộc gọi nhóm đang diễn ra.
   * - Nếu user nằm trong `invitedIds` ban đầu (đã được host mời từ trước) → cho join thẳng.
   * - Nếu chưa được mời → ghi vào `pendingJoinRequests`, báo cho host duyệt.
   */
  socket.on('call:group_request_join', ({ callId } = {}) => {
    if (!callId) return;
    const uid = socket.user?.userId || socket.user?.id;
    if (!uid) return;
    const call = activeGroupCalls.get(callId);
    if (!call) {
      socket.emit('call:group_room_ended', { callId });
      return;
    }
    const myName = socket.user?.fullName || socket.user?.full_name || 'Thành viên';
    const isInvited = call.invitedIds?.has(String(uid));

    if (isInvited) {
      // Đã được host mời từ đầu nhưng từng từ chối / chưa kịp accept → cho vào thẳng.
      socket.emit('call:incoming', {
        callId,
        kind: call.kind,
        isGroup: true,
        groupId: call.groupId,
        groupName: call.groupName,
        fromUserId: call.hostId,
        fromName: call.participants.get(call.hostId)?.name || 'Người gọi',
      });
      return;
    }

    // Chưa được mời → cần host duyệt
    call.pendingJoinRequests.set(uid, { name: myName, requestedAt: Date.now() });
    io.to(`user:${call.hostId}`).emit('call:group_join_request', {
      callId,
      requesterId: uid,
      requesterName: myName,
      requestedAt: Date.now(),
    });
    // Báo lại cho requester biết đang chờ
    socket.emit('call:group_join_pending', { callId });
  });

  /** Host duyệt 1 yêu cầu join. */
  socket.on('call:group_approve_join', ({ callId, requesterId } = {}) => {
    if (!callId || !requesterId) return;
    const uid = socket.user?.userId || socket.user?.id;
    const call = activeGroupCalls.get(callId);
    if (!call || String(call.hostId) !== String(uid)) return; // chỉ host được duyệt
    if (!call.pendingJoinRequests?.has(requesterId)) return;
    call.pendingJoinRequests.delete(requesterId);
    // Mời requester vào → họ nhận incoming, sẽ joinGroupCall
    io.to(`user:${requesterId}`).emit('call:incoming', {
      callId,
      kind: call.kind,
      isGroup: true,
      groupId: call.groupId,
      groupName: call.groupName,
      fromUserId: call.hostId,
      fromName: call.participants.get(call.hostId)?.name || 'Người gọi',
    });
  });

  /** Host từ chối 1 yêu cầu join. */
  socket.on('call:group_deny_join', ({ callId, requesterId, reason = 'denied' } = {}) => {
    if (!callId || !requesterId) return;
    const uid = socket.user?.userId || socket.user?.id;
    const call = activeGroupCalls.get(callId);
    if (!call || String(call.hostId) !== String(uid)) return;
    if (call.pendingJoinRequests?.has(requesterId)) call.pendingJoinRequests.delete(requesterId);
    io.to(`user:${requesterId}`).emit('call:group_join_denied', { callId, reason });
  });

  /**
   * Báo cho mọi người trong cuộc gọi nhóm biết mình đã bật/tắt chia sẻ màn hình.
   * Frontend đã replaceTrack video → server chỉ cần relay flag để UI hiển thị label/spotlight.
   */
  socket.on('call:group_screen_share', ({ callId, sharing } = {}) => {
    if (!callId) return;
    const uid = socket.user?.userId || socket.user?.id;
    const call = activeGroupCalls.get(callId);
    if (!call || !uid) return;
    call.participants.forEach((_v, pid) => {
      if (pid !== uid) {
        io.to(`user:${pid}`).emit('call:group_screen_share', {
          callId,
          userId: uid,
          sharing: !!sharing,
        });
      }
    });
  });

  /** Tương đương cho cuộc gọi 1-1. */
  socket.on('call:screen_share', ({ callId, toUserId, sharing } = {}) => {
    if (!callId || !toUserId) return;
    const uid = socket.user?.userId || socket.user?.id;
    if (!uid) return;
    io.to(`user:${toUserId}`).emit('call:screen_share', {
      callId,
      fromUserId: uid,
      sharing: !!sharing,
    });
  });

  /** Requester rút lại yêu cầu join (đóng banner hoặc rời chat). */
  socket.on('call:group_cancel_join', ({ callId } = {}) => {
    if (!callId) return;
    const uid = socket.user?.userId || socket.user?.id;
    const call = activeGroupCalls.get(callId);
    if (!call) return;
    if (call.pendingJoinRequests?.has(uid)) {
      call.pendingJoinRequests.delete(uid);
      io.to(`user:${call.hostId}`).emit('call:group_join_cancelled', { callId, requesterId: uid });
    }
  });

  // Override call:end để hỗ trợ cả 1-1 lẫn group
  socket.removeAllListeners('call:end');
  socket.on('call:end', ({ callId, toUserId } = {}) => {
    if (!callId) return;
    const uid = socket.user?.userId || socket.user?.id;
    if (!uid) return;
    // Group call?
    if (activeGroupCalls.has(callId)) {
      leaveGroupCall(callId, uid);
      return;
    }
    // 1-1
    const session = activeDirectCalls.get(callId);
    if (session && !session.logged) {
      const status = session.answeredAt ? 'completed' : null;
      session.logged = true;
      activeDirectCalls.delete(callId);
      void finalizeDirectCallLog(io, session, { status, endedByUserId: uid });
    }
    if (toUserId) io.to(`user:${toUserId}`).emit('call:ended', { callId });
  });

  // Override call:reject để xử lý reject group (chỉ huỷ phía mình, không kill cuộc)
  socket.removeAllListeners('call:reject');
  socket.on('call:reject', ({ callId, toUserId, reason = 'rejected' } = {}) => {
    if (!callId) return;
    const uid = socket.user?.userId || socket.user?.id;
    if (activeGroupCalls.has(callId)) {
      // Group: chỉ báo cho host biết ai đó từ chối — không kết thúc cuộc
      const call = activeGroupCalls.get(callId);
      if (call?.hostId && uid) {
        io.to(`user:${call.hostId}`).emit('call:group_member_rejected', {
          callId,
          userId: uid,
          name: socket.user?.fullName || socket.user?.full_name || '',
          reason,
        });
      }
      return;
    }
    // 1-1
    const session = activeDirectCalls.get(callId);
    if (session && !session.logged) {
      session.logged = true;
      activeDirectCalls.delete(callId);
      void finalizeDirectCallLog(io, session, { endedByUserId: uid, reason });
    }
    if (toUserId) io.to(`user:${toUserId}`).emit('call:rejected', { callId, reason });
  });

  socket.on('disconnect', () => {
    console.log('❌ Disconnected:', socket.id);
    // Auto-leave mọi group call mà user đang tham gia
    const uid = socket.user?.userId || socket.user?.id;
    if (!uid) return;
    for (const [cid, call] of activeGroupCalls) {
      if (call.participants.has(uid)) leaveGroupCall(cid, uid);
    }
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
    try {
      const { invalidateTags } = require('./middleware/responseCache');
      void invalidateTags(['notifications', `user:${userId}`]);
    } catch { /* ignore */ }
    try {
      const { sendMobilePush } = require('./services/pushSender');
      void sendMobilePush(userId, notification);
    } catch (_) { /* ignore */ }
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

  // FCM cuộc gọi (app kill): cần bảng push_device_tokens
  try {
    const { ensurePushDeviceTokensTable } = require('./helpers/ensurePushDeviceTokens');
    void ensurePushDeviceTokensTable();
  } catch (e) {
    console.warn('[push] ensurePushDeviceTokensTable:', e.message);
  }

  // 🤖 Bot AI luôn online: ping last_activity mỗi 60s (kèm 1 ping ngay khi server start)
  try {
    const { recordUserPing } = require('./helpers/userPresence');
    const BOT_ID = '00000000-0000-0000-0000-0000000000a1';
    const pingBot = () => recordUserPing(BOT_ID).catch(() => {});
    void pingBot();
    setInterval(pingBot, 60 * 1000);
    console.log('[ai-bot] presence: ping mỗi 60s (luôn online)');
  } catch (e) {
    console.warn('[ai-bot] presence ping failed:', e.message);
  }

  // Cron KPI Tủ bếp: recompute hàng đêm 01:00 (disable bằng KPI_CRON_DISABLED=1)
  try { require('./jobs/kpiNightly').start(); } catch (e) { console.warn('[kpi-cron] Failed to start:', e.message); }

  // Cron AI User Memory — ~02:30, học thói quen từ user_activity_log → ai_chat_bot_user_facts
  try { require('./jobs/aiUserMemoryNightly').start(); } catch (e) { console.warn('[ai-memory-cron] Failed to start:', e.message); }

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

  // Cron nhắc hạn deadline thẻ CRM (mỗi 30') — disable: CRM_KANBAN_DEADLINE_REMINDER_DISABLED=1
  try {
    require('./jobs/crmKanbanDeadlineReminder').start(io);
  } catch (e) {
    console.warn('[crm-kanban-deadline] Failed to start:', e.message);
  }

  // Cron AI Chat Bot — tick mỗi phút, gửi tin AI vào chat phòng ban/nhóm theo lịch admin cấu hình.
  // Disable: AI_CHAT_BOT_CRON_DISABLED=1
  try {
    require('./jobs/aiChatBotRunner').start(io);
  } catch (e) {
    console.warn('[ai-bot-cron] Failed to start:', e.message);
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
          const r = await externalAxios.post(`http://localhost:${port}/api/crm/leads`, {
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
