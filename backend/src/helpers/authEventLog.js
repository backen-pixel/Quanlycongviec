/**
 * Ghi audit login / logout / session vào bảng auth_event_log.
 * Fail-safe: lỗi DB không làm sập request — chỉ console.warn.
 *
 * Dùng từ:
 *   • routes/auth.js          → login_success / login_failed / password_changed / logout
 *   • middleware/auth.js      → token_invalid (khi verify fail)
 *   • routes hỗ trợ           → auto_logout_midnight, session_expired (client báo lên)
 */

const { supabase } = require('../config/supabase');

const VALID_EVENTS = new Set([
  'login_success',
  'login_failed',
  'logout',
  'auto_logout_midnight',
  'session_expired',
  'token_invalid',
  'password_changed',
]);

/** Trích IP từ req (xử lý X-Forwarded-For khi qua proxy). */
function extractIp(req) {
  if (!req) return null;
  const xff = req.headers?.['x-forwarded-for'];
  if (xff) {
    const first = String(xff).split(',')[0].trim();
    if (first) return first;
  }
  return req.ip || req.connection?.remoteAddress || null;
}

/** Đoán nền tảng & tên thiết bị friendly từ User-Agent. */
function parseDevice(ua) {
  const s = String(ua || '');
  if (!s) return { platform: null, device_name: null };
  let platform = 'web';
  if (/Android/i.test(s)) platform = 'android';
  else if (/iPhone|iPad|iOS/i.test(s)) platform = 'ios';
  else if (/Electron/i.test(s)) platform = 'desktop';

  let browser = 'Trình duyệt';
  if (/Edg\//.test(s)) browser = 'Edge';
  else if (/Chrome\//.test(s)) browser = 'Chrome';
  else if (/Firefox\//.test(s)) browser = 'Firefox';
  else if (/Safari\//.test(s)) browser = 'Safari';

  let os = '';
  if (/Windows NT 10/.test(s)) os = 'Windows 10/11';
  else if (/Windows/.test(s)) os = 'Windows';
  else if (/Mac OS X/.test(s)) os = 'macOS';
  else if (/Android/.test(s)) os = 'Android';
  else if (/iPhone|iPad/.test(s)) os = 'iOS';
  else if (/Linux/.test(s)) os = 'Linux';

  return {
    platform,
    device_name: os ? `${browser} trên ${os}` : browser,
  };
}

/**
 * Ghi 1 event xác thực.
 *
 * @param {object} p
 * @param {string} p.event        Một trong VALID_EVENTS
 * @param {string|null} [p.user_id]
 * @param {string|null} [p.email]
 * @param {string|null} [p.reason]
 * @param {string|null} [p.session_id]
 * @param {object|null} [p.metadata]
 * @param {import('express').Request} [p.req]  Để tự trích IP + UA
 * @returns {Promise<{ ok: boolean, id?: number, error?: string }>}
 */
async function logAuthEvent({ event, user_id = null, email = null, reason = null, session_id = null, metadata = null, req = null }) {
  if (!VALID_EVENTS.has(event)) {
    return { ok: false, error: 'invalid_event' };
  }
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const safeUserId = user_id && uuidRe.test(String(user_id).trim()) ? user_id : null;
  const ua = req?.headers?.['user-agent'] || null;
  const { platform, device_name } = parseDevice(ua);
  const row = {
    event,
    user_id: safeUserId,
    email: email ? String(email).slice(0, 200) : null,
    reason: reason ? String(reason).slice(0, 80) : null,
    session_id: session_id ? String(session_id).slice(0, 80) : null,
    ip: extractIp(req),
    user_agent: ua ? String(ua).slice(0, 500) : null,
    platform,
    device_name,
    metadata: metadata && typeof metadata === 'object' ? metadata : null,
    occurred_at: new Date().toISOString(),
  };
  try {
    const { data, error } = await supabase
      .from('auth_event_log')
      .insert(row)
      .select('id')
      .single();
    if (error) {
      // Bảng chưa migrate → cảnh báo 1 lần, không spam.
      if (/relation .* does not exist/i.test(error.message || '') && !logAuthEvent._warnedMissing) {
        logAuthEvent._warnedMissing = true;
        console.warn('[auth-event] Bảng auth_event_log chưa tồn tại — chạy database/241_auth_event_log.sql để bật audit chi tiết.');
      } else if (!/relation .* does not exist/i.test(error.message || '')) {
        console.warn('[auth-event] insert failed:', error.message);
      }
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data?.id };
  } catch (e) {
    console.warn('[auth-event] exception:', e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = {
  logAuthEvent,
  extractIp,
  parseDevice,
  VALID_EVENTS,
};
