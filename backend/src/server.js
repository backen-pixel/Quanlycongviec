const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();
const config = require('./config');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: config.corsOrigins, methods: ['GET','POST'] } });
app.set('io', io);

app.use(helmet());
app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(morgan('dev'));
app.use(express.json());

// Health
app.get('/api/health', (_, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/dashboard', require('./routes/dashboard'));

// Socket.IO
io.on('connection', (socket) => {
  console.log('🔌 Connected:', socket.id);
  socket.on('join:project', (id) => socket.join(`project:${id}`));
  socket.on('join:user', (id) => socket.join(`user:${id}`));
  socket.on('task:moved', (data) => io.emit('task:updated', data));
  socket.on('disconnect', () => console.log('❌ Disconnected:', socket.id));
});

server.listen(config.port, () => {
  console.log(`🚀 TuBep Pro Backend: http://localhost:${config.port}/api`);
});
