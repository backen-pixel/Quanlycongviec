/**
 * Mật khẩu truy cập trang giám sát Supabase.
 * Env: SUPABASE_MONITOR_PASSWORD (mặc định 140883)
 */
const crypto = require('crypto');
const config = require('../config');

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12h

function monitorPassword() {
  const raw = String(process.env.SUPABASE_MONITOR_PASSWORD || '').trim();
  return raw || '140883';
}

function verifyPassword(input) {
  const expected = monitorPassword();
  const a = String(input || '');
  if (!a || !expected) return false;
  const ba = Buffer.from(a, 'utf8');
  const be = Buffer.from(expected, 'utf8');
  if (ba.length !== be.length) return false;
  return crypto.timingSafeEqual(ba, be);
}

function issueMonitorToken() {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = `supabase-monitor:${exp}`;
  const sig = crypto
    .createHmac('sha256', config.jwtSecret || 'monitor-secret')
    .update(payload)
    .digest('hex');
  return `${exp}.${sig}`;
}

function verifyMonitorToken(token) {
  if (!token || typeof token !== 'string') return false;
  const [expStr, sig] = token.split('.');
  const exp = Number(expStr);
  if (!exp || !sig || Date.now() > exp) return false;
  const payload = `supabase-monitor:${exp}`;
  const expected = crypto
    .createHmac('sha256', config.jwtSecret || 'monitor-secret')
    .update(payload)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return sig === expected;
  }
}

module.exports = {
  verifyPassword,
  issueMonitorToken,
  verifyMonitorToken,
};
