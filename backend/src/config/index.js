require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT || '4000'),
  jwtSecret: process.env.JWT_SECRET || 'change-this',
  corsOrigins: (process.env.CORS_ORIGINS ||
    'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,http://localhost:3000,http://127.0.0.1:3000,http://localhost:4173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  redisUrl: process.env.REDIS_URL || '',
  // URL gốc của frontend web — dùng để tạo deep-link trong tin nhắn AI / push.
  // VD: https://crm.tubeppro.com  hoặc  http://localhost:5173 (dev).
  frontendUrl:
    (process.env.FRONTEND_URL ||
      (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',')[0] ||
      'http://localhost:5173').trim().replace(/\/+$/, ''),
};
