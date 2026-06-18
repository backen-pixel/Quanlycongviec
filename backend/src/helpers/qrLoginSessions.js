const crypto = require('crypto');
const { supabase } = require('../config/supabase');
const { buildAuthSessionForUser } = require('./authSession');
const { logAuthEvent } = require('./authEventLog');

const TTL_MS = 120_000;
const sessions = new Map();

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
 * @param {'web'|'app'} target — thiết bị cần đăng nhập (web hiện QR → target web; app hiện QR → target app)
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
async function confirmQrSession(sessionId, confirmerUserId, req) {
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
  session.auth = auth;

  void logAuthEvent({
    event: 'login_success',
    user_id: user.id,
    email: user.email,
    session_id: auth.session_id,
    reason: `qr_${session.target}`,
    req,
  });

  return { session, auth };
}

function consumeSessionAuth(sessionId) {
  const session = getSession(sessionId);
  if (!session) return { status: 'expired' };
  if (session.status === 'pending') return { status: 'pending', expiresAt: session.expiresAt };
  if (session.status === 'confirmed' && session.auth) {
    const auth = session.auth;
    session.status = 'consumed';
    session.auth = null;
    sessions.delete(sessionId);
    return { status: 'confirmed', ...auth };
  }
  return { status: 'expired' };
}

module.exports = {
  createQrSession,
  getSession,
  parseQrText,
  confirmQrSession,
  consumeSessionAuth,
};
