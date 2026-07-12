const crypto = require('crypto');
const { supabase } = require('../config/supabase');
const { buildAuthSessionForUser } = require('./authSession');
const { logAuthEvent, parseDevice } = require('./authEventLog');

const TTL_MS = 120_000;
const CONSUMED_TTL_MS = 60_000;
const sessions = new Map();

function deviceFromReq(req, body = {}) {
  const ua = parseDevice(req?.headers?.['user-agent']);
  const name = body?.device_name || req?.headers?.['x-device-name'];
  const platform = body?.platform || req?.headers?.['x-device-platform'];
  return {
    platform: platform ? String(platform).slice(0, 40) : ua.platform,
    device_name: name ? String(name).slice(0, 160) : ua.device_name,
  };
}

function targetLabel(target) {
  return target === 'app' ? 'ứng dụng mobile' : 'trình duyệt web';
}

function genSessionId() {
  return `qr_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
}

function pruneExpired() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (s.expiresAt <= now) sessions.delete(id);
  }
}

/**
 * @param {'web'|'app'} target — thiết bị sẽ nhận phiên đăng nhập sau khi xác nhận
 *   - web: trang đăng nhập web hiện QR → app đã đăng nhập quét xác nhận
 *   - app: web đã đăng nhập hiện QR (create-invite) → app quét và poll token
 */
function createQrSession(target) {
  pruneExpired();
  const id = genSessionId();
  const now = Date.now();
  const session = {
    id,
    target,
    status: 'pending',
    userId: null,
    confirmedBy: null,
    auth: null,
    createdAt: now,
    expiresAt: now + TTL_MS,
  };
  sessions.set(id, session);
  const payload = {
    v: 1,
    t: 'crm-qr-login',
    target,
    id,
  };
  return {
    sessionId: id,
    expiresAt: session.expiresAt,
    qrPayload: payload,
    qrText: JSON.stringify(payload),
  };
}

function getSession(id) {
  pruneExpired();
  const s = sessions.get(id);
  if (!s) return null;
  if (s.expiresAt <= Date.now()) {
    sessions.delete(id);
    return null;
  }
  return s;
}

function parseQrText(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const text = raw.trim();
  try {
    const obj = JSON.parse(text);
    if (obj?.t !== 'crm-qr-login' || !obj?.id) return null;
    if (obj.target !== 'web' && obj.target !== 'app') return null;
    return { sessionId: String(obj.id), target: obj.target };
  } catch {
    return null;
  }
}

/**
 * Thiết bị đã đăng nhập xác nhận phiên QR của thiết bị kia.
 */
async function confirmQrSession(sessionId, confirmerUserId, req, extra = {}) {
  const session = getSession(sessionId);
  if (!session) return { error: 'Mã QR hết hạn hoặc không hợp lệ', status: 404 };
  if (session.status !== 'pending') return { error: 'Mã QR đã được dùng', status: 409 };

  const { data: users } = await supabase
    .from('users')
    .select('*')
    .eq('id', confirmerUserId)
    .neq('is_active', false)
    .limit(1);
  if (!users?.length) return { error: 'Tài khoản không hợp lệ', status: 401 };
  const user = users[0];
  await supabase.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id);

  const auth = await buildAuthSessionForUser(user, {
    sessionId: `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
  });

  session.status = 'confirmed';
  session.userId = user.id;
  session.confirmedBy = confirmerUserId;
  session.confirmerDevice = deviceFromReq(req, extra);
  session.auth = auth;

  void logAuthEvent({
    event: 'login_success',
    user_id: user.id,
    email: user.email,
    session_id: auth.session_id,
    reason: `qr_${session.target}`,
    metadata: {
      qr_target: session.target,
      confirmer_device: session.confirmerDevice,
    },
    req,
  });

  return { session, auth };
}

function consumeSessionAuth(sessionId, req, extra = {}) {
  const session = getSession(sessionId);
  if (!session) return { status: 'expired' };
  if (session.status === 'pending') {
    return { status: 'pending', expiresAt: session.expiresAt };
  }
  if (session.status === 'consumed') {
    return {
      status: 'consumed',
      qrTarget: session.target,
      loginDevice: session.consumerDevice || null,
      confirmerDevice: session.confirmerDevice || null,
    };
  }
  if (session.status === 'confirmed' && session.auth) {
    const auth = session.auth;
    const loginDevice = deviceFromReq(req, extra);
    session.consumerDevice = loginDevice;
    session.status = 'consumed';
    session.auth = null;
    session.consumedAt = Date.now();
    setTimeout(() => {
      if (sessions.get(sessionId)?.status === 'consumed') sessions.delete(sessionId);
    }, CONSUMED_TTL_MS);
    return {
      status: 'confirmed',
      ...auth,
      qrTarget: session.target,
      loginDevice,
      confirmerDevice: session.confirmerDevice || null,
    };
  }
  return { status: 'expired' };
}

function getSessionPublicInfo(sessionId) {
  const session = getSession(sessionId);
  if (!session) return { status: 'expired' };
  return {
    status: session.status,
    target: session.target,
    targetLabel: targetLabel(session.target),
    expiresAt: session.expiresAt,
    confirmerDevice: session.confirmerDevice || null,
    consumerDevice: session.consumerDevice || null,
  };
}

module.exports = {
  createQrSession,
  getSession,
  parseQrText,
  confirmQrSession,
  consumeSessionAuth,
  getSessionPublicInfo,
  targetLabel,
  deviceFromReq,
};
