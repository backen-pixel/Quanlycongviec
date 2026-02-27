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

// Root + Health
app.get('/', (_, res) => res.json({ app: 'TuBep Pro API', status: 'ok' }));
app.get('/api/health', (_, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/dashboard', require('./routes/dashboard'));

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

server.listen(config.port, async () => {
  console.log(`🚀 TuBep Pro Backend: http://localhost:${config.port}/api`);

  // Auto-fix seed passwords
  try {
    const bcrypt = require('bcryptjs');
    const { supabase } = require('./config/supabase');
    const seedEmails = ['admin@tubep.vn','sales@tubep.vn','designer@tubep.vn','production@tubep.vn','installer@tubep.vn','manager@tubep.vn'];
    const hash = await bcrypt.hash('admin123', 12);
    await supabase.from('users').update({ password: hash }).in('email', seedEmails);
    console.log('✅ Seed passwords reset OK');
  } catch (e) { console.error('⚠️ Seed passwords:', e.message); }
});
