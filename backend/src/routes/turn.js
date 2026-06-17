/**
 * GET /api/turn/credentials
 * Cấp ICE servers (STUN + TURN) cho client WebRTC.
 *
 * TURN dùng ephemeral credential (cơ chế `use-auth-secret` của Coturn): server và Coturn
 * chia sẻ TURN_STATIC_SECRET. Username là "<expiry>:<userId>", credential là
 * base64(HMAC-SHA1(secret, username)). Coturn tự verify, không cần lưu user/pass.
 *
 * ENV (xem docs/COTURN_SETUP.md):
 *   TURN_STATIC_SECRET  bắt buộc để bật TURN (nếu thiếu → chỉ trả STUN)
 *   TURN_URLS           csv, vd: turn:host:3478?transport=udp,turns:host:5349
 *   TURN_TTL_SECONDS    mặc định 86400 (1 ngày)
 *   STUN_URLS           csv, mặc định stun:stun.l.google.com:19302
 */
const { Router } = require('express');
const crypto = require('crypto');
const { auth } = require('../middleware/auth');

const r = Router();
r.use(auth);

const DEFAULT_STUN = 'stun:stun.l.google.com:19302';

function csv(value, fallback = '') {
  return String(value || fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Sinh ephemeral TURN credential tương thích Coturn use-auth-secret. */
function makeTurnCredential(secret, userId, ttlSeconds) {
  const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
  const username = `${expiry}:${userId}`;
  const credential = crypto
    .createHmac('sha1', secret)
    .update(username)
    .digest('base64');
  return { username, credential, ttl: ttlSeconds };
}

function buildIceServers(userId) {
  const iceServers = [];
  const stunUrls = csv(process.env.STUN_URLS, DEFAULT_STUN);
  if (stunUrls.length) iceServers.push({ urls: stunUrls });

  const secret = (process.env.TURN_STATIC_SECRET || '').trim();
  const turnUrls = csv(process.env.TURN_URLS);
  if (secret && turnUrls.length) {
    const ttl = Number(process.env.TURN_TTL_SECONDS || 86400);
    const { username, credential } = makeTurnCredential(secret, userId, ttl);
    iceServers.push({ urls: turnUrls, username, credential });
  }
  return iceServers;
}

r.get('/credentials', (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Token không có user id' });
    const iceServers = buildIceServers(String(userId));
    const ttl = Number(process.env.TURN_TTL_SECONDS || 86400);
    res.json({ iceServers, ttl });
  } catch (e) {
    console.error('GET /turn/credentials:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;
module.exports.buildIceServers = buildIceServers;
