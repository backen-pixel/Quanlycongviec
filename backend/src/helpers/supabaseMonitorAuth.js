/**
 * Mật khẩu truy cập trang giám sát Supabase.
 * Env: SUPABASE_MONITOR_PASSWORD (mặc định 140883)
 */
const crypto = require('crypto');
const config = require('../config');

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12h

function monitorPassword() {
  return process.env.SUPABASE_MONITOR_PASSWORD || '140883';
}

function verifyPassword(input) {
  const expected = monitorPassword();
  const a = String(input || '');
  if (!a || !expected) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(expected));
  } catch {
    return a === expected;
  }
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
