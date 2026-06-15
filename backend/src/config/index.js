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
  supabaseDbUrl: process.env.SUPABASE_DB_URL || '',
  supabaseDbDirectUrl: process.env.SUPABASE_DB_DIRECT_URL || '',
  pgPoolDisabled: process.env.PG_POOL_DISABLED === '1',
  responseCacheDisabled: process.env.RESPONSE_CACHE_DISABLED === '1',
  // URL gốc của frontend web — dùng để tạo deep-link trong tin nhắn AI / push.
  // VD: https://crm.tubeppro.com  hoặc  http://localhost:5173 (dev).
  frontendUrl:
    (process.env.FRONTEND_URL ||
      (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',')[0] ||
      'http://localhost:5173').trim().replace(/\/+$/, ''),
  // ── Google Drive integration (module Drive) ──
  // Hỗ trợ 2 chế độ xác thực — đặt MỘT trong hai:
  //  (A) Service Account: GDRIVE_SERVICE_ACCOUNT_JSON (chuỗi JSON đầy đủ key.json)
  //                       hoặc GDRIVE_SERVICE_ACCOUNT_FILE (đường dẫn file key.json).
  //  (B) OAuth Refresh Token (cho tài khoản cá nhân/Workspace):
  //                       GDRIVE_OAUTH_CLIENT_ID + GDRIVE_OAUTH_CLIENT_SECRET + GDRIVE_OAUTH_REFRESH_TOKEN.
  //                       File sẽ thuộc về user đã uỷ quyền (dùng quota của user đó).
  gdriveServiceAccountJson: process.env.GDRIVE_SERVICE_ACCOUNT_JSON || '',
  gdriveServiceAccountFile: process.env.GDRIVE_SERVICE_ACCOUNT_FILE || '',
  gdriveOauthClientId: process.env.GDRIVE_OAUTH_CLIENT_ID || '',
  gdriveOauthClientSecret: process.env.GDRIVE_OAUTH_CLIENT_SECRET || '',
  gdriveOauthRefreshToken: process.env.GDRIVE_OAUTH_REFRESH_TOKEN || '',
  // Folder gốc trên Google Drive (đã share quyền Editor cho service account hoặc thuộc về user OAuth). Bắt buộc.
  gdriveRootFolderId: process.env.GDRIVE_ROOT_FOLDER_ID || '',
  // (Tuỳ chọn, chỉ Service Account) Email Workspace user để impersonate qua domain-wide delegation.
  gdriveImpersonateUser: process.env.GDRIVE_IMPERSONATE_USER || '',
  // Bật/tắt job sync incremental (changes.list). Mặc định bật.
  gdriveSyncEnabled: process.env.GDRIVE_SYNC_DISABLED !== '1',
  gdriveSyncIntervalMs: Math.max(60_000, parseInt(process.env.GDRIVE_SYNC_INTERVAL_MS || '300000', 10)),
};
