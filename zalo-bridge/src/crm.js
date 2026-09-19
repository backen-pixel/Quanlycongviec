/**
 * Client gọi API /api/zalo-bridge của CRM.
 *
 * Đây là ĐƯỜNG DUY NHẤT cổng chạm vào dữ liệu. Không nối thẳng Postgres:
 * backend giữ phần kiểm tra quyền, ràng buộc tài khoản thuộc máy nào, quy tắc
 * riêng tư, và phát sự kiện realtime cho giao diện CRM. Nối tắt vào CSDL sẽ mất
 * hết những thứ đó.
 */
const settings = require('./settings');
const config = require('./config');

/** Sức khoẻ đường truyền tới CRM — trang quản trị hiện cho người trực thấy. */
const health = {
  lastOkAt: null,
  lastErrorAt: null,
  lastError: null,
  latencyMs: null,
  okCount: 0,
  errorCount: 0,
};

async function call(pathname, { method = 'GET', body } = {}) {
  const s = settings.load();
  if (!s.crm.baseUrl) throw new Error('Chưa khai báo địa chỉ CRM');
  if (!s.crm.gatewayToken) throw new Error('Chưa khai báo khoá máy');

  const startedAt = Date.now();
  let res;
  try {
    res = await fetch(`${s.crm.baseUrl.replace(/\/+$/, '')}/api/zalo-bridge${pathname}`, {
      method,
      headers: {
        'X-Gateway-Token': s.crm.gatewayToken,
        'X-Agent-Version': config.agentVersion,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    // Mất mạng / VPS không trả lời — fetch ném trước khi có response
    health.lastErrorAt = new Date().toISOString();
    health.lastError = `Không kết nối được tới CRM (${e.message})`;
    health.errorCount += 1;
    health.latencyMs = null;
    throw new Error(health.lastError);
  }

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = { raw: text }; }

  health.latencyMs = Date.now() - startedAt;

  if (!res.ok) {
    health.lastErrorAt = new Date().toISOString();
    health.lastError = data?.error || `CRM trả về ${res.status}`;
    health.errorCount += 1;
    const err = new Error(health.lastError);
    err.status = res.status;
    throw err;
  }

  health.lastOkAt = new Date().toISOString();
  health.lastError = null;
  health.okCount += 1;
  return data;
}

const q = (oaId) => `oa_id=${encodeURIComponent(oaId)}`;
const enc = encodeURIComponent;

module.exports = {
  health: () => ({ ...health, baseUrl: settings.load().crm.baseUrl }),
  describe: () => settings.load().crm.baseUrl || '(chưa khai báo)',

  async testConnection() {
    const { accounts } = await call('/accounts');
    return { detail: `Máy này đang giữ ${accounts?.length || 0} tài khoản` };
  },

  // Tài khoản
  listAccounts: () => call('/accounts').then((d) => d.accounts || []),
  createAccount: (body) => call('/accounts', { method: 'POST', body }).then((d) => d.account),
  updateAccount: (oaId, body) => call(`/accounts/${enc(oaId)}`, { method: 'PATCH', body }).then((d) => d.account),
  deleteAccount: (oaId) => call(`/accounts/${enc(oaId)}`, { method: 'DELETE' }),

  // Tin nhắn
  pushMessages: (oaId, messages) => call('/inbound', { method: 'POST', body: { oa_id: oaId, messages } }),
  getAllowlist: (oaId) => call(`/allowlist?${q(oaId)}`).then((d) => d.thread_ids || []),
  pollOutbox: (oaId, limit = 10) => call(`/outbox?${q(oaId)}&limit=${limit}`).then((d) => d.messages || []),
  ackOutbox: (id, payload) => call(`/outbox/${id}/ack`, { method: 'POST', body: payload }),

  // Tra cứu số điện thoại → tài khoản Zalo
  getLinkRequests: (oaId) => call(`/link-requests?${q(oaId)}`).then((d) => d.requests || []),
  ackLinkRequest: (id, payload) => call(`/link-requests/${id}/ack`, { method: 'POST', body: payload }),

  // Tình trạng & điều khiển
  reportStatus: (accounts, host) => call('/status', { method: 'POST', body: { accounts, host } }),
  pushQr: (oaId, image) => call('/qr', { method: 'POST', body: { oa_id: oaId, image } }),
  getCommands: () => call('/commands').then((d) => d.commands || []),
  ackCommand: (id, payload) => call(`/commands/${id}/ack`, { method: 'POST', body: payload }),
};
