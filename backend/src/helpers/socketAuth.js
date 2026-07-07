const jwt = require('jsonwebtoken');
const config = require('../config');

const VN_TZ = 'Asia/Ho_Chi_Minh';

function midnightVnTodayMs() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: VN_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const todayVn = fmt.format(new Date());
  return new Date(`${todayVn}T00:00:00+07:00`).getTime();
}

function isStaleAcrossMidnight(payload) {
  if (process.env.AUTO_LOGOUT_AT_MIDNIGHT !== '1') return false;
  if (payload?.role === 'system') return false;
  const iatMs = payload?.iat ? payload.iat * 1000 : 0;
  if (!iatMs) return true;
  return iatMs < midnightVnTodayMs();
}

function extractBearerToken(raw) {
  if (typeof raw !== 'string') return '';
  let s = raw.trim();
  if (!s || s === 'null' || s === 'undefined') return '';
  if (s.toLowerCase().startsWith('bearer ')) s = s.slice(7).trim();
  return s;
}

/** Lấy JWT từ handshake Socket.IO (auth, Authorization header, query). */
function extractSocketToken(socket) {
  let token = extractBearerToken(socket.handshake.auth?.token || '');
  if (!token) {
    const hdr = socket.handshake.headers?.authorization;
    if (typeof hdr === 'string') token = extractBearerToken(hdr);
  }
  if (!token && socket.handshake.query?.token) {
    token = extractBearerToken(String(socket.handshake.query.token));
  }
  return token || null;
}

function normalizeSocketUser(payload) {
  if (payload.userId == null && payload.id != null) payload.userId = payload.id;
  if (payload.id == null && payload.userId != null) payload.id = payload.userId;
  return payload;
}

function verifySocketToken(token) {
  const payload = jwt.verify(token, config.jwtSecret);
  if (isStaleAcrossMidnight(payload)) {
    const err = new Error('session_expired_midnight');
    err.data = { code: 'session_expired_midnight' };
    throw err;
  }
  return normalizeSocketUser(payload);
}

module.exports = {
  extractSocketToken,
  verifySocketToken,
};
