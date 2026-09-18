/**
 * Cấu hình kết nối CRM, sửa được từ trang quản trị, lưu ở config.json (quyền 600).
 *
 * Thứ tự ưu tiên: config.json → biến môi trường / .env → mặc định.
 * Nhờ vậy sửa trong giao diện là có hiệu lực, không cần mở file .env ra sửa tay.
 */
const fs = require('fs');
const path = require('path');
const config = require('./config');

const FILE = path.join(__dirname, '..', 'config.json');

let cache = null;

function readFile() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (_) {
    return {};
  }
}

function writeAtomic(obj) {
  const tmp = `${FILE}.tmp`;
  const fd = fs.openSync(tmp, 'w', 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(obj, null, 2));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, FILE);
}

function load() {
  if (cache) return cache;
  const saved = readFile();
  cache = {
    crm: {
      baseUrl: saved.crm?.baseUrl || config.crmBaseUrl || '',
      gatewayToken: saved.crm?.gatewayToken || config.gatewayToken || '',
    },
  };
  return cache;
}

function save(patch) {
  const current = load();
  const next = { crm: { ...current.crm, ...(patch.crm || {}) } };

  if (!next.crm.baseUrl) throw new Error('Thiếu địa chỉ CRM');
  if (!next.crm.gatewayToken) throw new Error('Thiếu khoá máy');
  assertSafeUrl(next.crm.baseUrl);

  writeAtomic(next);
  cache = next;
  return next;
}

/** Khoá đi qua Internet thì bắt buộc HTTPS. Trong nhà thì http được. */
function assertSafeUrl(url) {
  if (!/^https?:\/\//.test(url)) throw new Error('Địa chỉ CRM phải bắt đầu bằng http:// hoặc https://');
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url);
  if (url.startsWith('http://') && !isLocal) {
    throw new Error('Địa chỉ CRM ra ngoài Internet phải dùng https:// — nếu không khoá máy sẽ đi trần');
  }
}

/** Bản dùng để hiển thị — che bí mật. */
function forDisplay() {
  const s = load();
  const t = s.crm.gatewayToken;
  return {
    crm: {
      baseUrl: s.crm.baseUrl,
      gatewayToken: t ? `${t.slice(0, 4)}••••${t.slice(-4)}` : '',
      hasToken: !!t,
    },
  };
}

module.exports = { load, save, forDisplay, assertSafeUrl, FILE };
