const fs = require('fs');
const path = require('path');

// .env đơn giản — không kéo thêm dependency chỉ để đọc vài dòng
function loadEnvFile() {
  const file = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}
loadEnvFile();

const num = (key, fallback) => Number(process.env[key]) || fallback;
const root = path.join(__dirname, '..');

const config = {
  crmBaseUrl: (process.env.CRM_BASE_URL || 'http://localhost:4000').replace(/\/+$/, ''),
  gatewayToken: process.env.GATEWAY_TOKEN || '',
  agentVersion: require('../package.json').version,

  transport: (process.env.BRIDGE_TRANSPORT || 'zca').toLowerCase(),

  // Bao nhiêu tài khoản trên một tiến trình con. Xem README mục "Ngân sách bộ nhớ"
  // trước khi tăng — mỗi phiên Zalo tốn thêm bộ nhớ thật.
  accountsPerWorker: num('ACCOUNTS_PER_WORKER', 4),

  outboxPollMs: num('OUTBOX_POLL_MS', 3000),
  allowlistRefreshMs: num('ALLOWLIST_REFRESH_MS', 60000),
  statusReportMs: num('STATUS_REPORT_MS', 30000),
  spoolRetryMs: num('SPOOL_RETRY_MS', 15000),
  registrySyncMs: num('REGISTRY_SYNC_MS', 60000),
  commandPollMs: num('COMMAND_POLL_MS', 10000),
  linkPollMs: num('LINK_POLL_MS', 15000),

  adminPort: num('ADMIN_PORT', 8787),
  adminHost: process.env.ADMIN_HOST || '127.0.0.1',

  sessionDir: path.join(root, 'sessions'),
  spoolDir: path.join(root, 'spool'),
  registryFile: path.join(root, 'accounts.cache.json'),
  qrDir: path.join(root, 'qr'),
};

if (!config.gatewayToken) {
  console.error('[cấu hình] Thiếu GATEWAY_TOKEN — sao chép .env.example thành .env rồi điền khoá của máy này.');
  process.exit(1);
}

// CRM chạy trên VPS: khoá đi qua Internet nên bắt buộc HTTPS.
// Chỉ máy trong nhà (localhost / LAN) mới được dùng http.
const isLocalTarget = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(config.crmBaseUrl);
if (config.crmBaseUrl.startsWith('http://') && !isLocalTarget) {
  console.error(`[cấu hình] CRM_BASE_URL dùng http:// tới máy ngoài (${config.crmBaseUrl}).`);
  console.error('[cấu hình] GATEWAY_TOKEN sẽ đi trần qua Internet. Đổi sang https:// rồi chạy lại.');
  process.exit(1);
}

for (const dir of [config.sessionDir, config.spoolDir, config.qrDir]) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

/** Tên file an toàn cho oa_id (chứa dấu hai chấm). */
config.slug = (oaId) => String(oaId).replace(/[^A-Za-z0-9_.-]/g, '_');
config.sessionFileFor = (oaId) => path.join(config.sessionDir, `${config.slug(oaId)}.json`);
config.spoolFileFor = (oaId) => path.join(config.spoolDir, `${config.slug(oaId)}.jsonl`);
config.qrFileFor = (oaId) => path.join(config.qrDir, `${config.slug(oaId)}.png`);

module.exports = config;
