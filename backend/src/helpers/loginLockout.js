/**
 * Khóa đăng nhập tạm thời theo IP + email (in-memory).
 * Env (optional):
 *   LOGIN_LOCK_MAX_ATTEMPTS (default 8)
 *   LOGIN_LOCK_WINDOW_MS (default 15 phút)
 *   LOGIN_LOCK_BAN_MS (default 15 phút)
 */
function envInt(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const MAX_ATTEMPTS = envInt('LOGIN_LOCK_MAX_ATTEMPTS', 8);
const WINDOW_MS = envInt('LOGIN_LOCK_WINDOW_MS', 15 * 60_000);
const BAN_MS = envInt('LOGIN_LOCK_BAN_MS', 15 * 60_000);

/** @type {Map<string, { fails: number, firstAt: number, bannedUntil: number }>} */
const buckets = new Map();
let lastPrune = Date.now();

function prune(now) {
  if (now - lastPrune < 60_000) return;
  lastPrune = now;
  for (const [k, v] of buckets) {
    if (v.bannedUntil && v.bannedUntil < now && now - v.firstAt > WINDOW_MS * 2) {
      buckets.delete(k);
    } else if (!v.bannedUntil && now - v.firstAt > WINDOW_MS * 2) {
      buckets.delete(k);
    }
  }
}

function keyFrom(req, email) {
  const ip = String(req?.ip || req?.socket?.remoteAddress || 'unknown');
  const em = String(email || '').trim().toLowerCase() || '_';
  return `${ip}|${em}`;
}

/**
 * @returns {{ ok: true } | { ok: false, retryAfterSec: number, error: string }}
 */
function assertLoginAllowed(req, email) {
  const now = Date.now();
  prune(now);
  const key = keyFrom(req, email);
  const cur = buckets.get(key);
  if (!cur) return { ok: true };
  if (cur.bannedUntil && cur.bannedUntil > now) {
    const retryAfterSec = Math.max(1, Math.ceil((cur.bannedUntil - now) / 1000));
    return {
      ok: false,
      retryAfterSec,
      error: `Quá nhiều lần đăng nhập sai. Thử lại sau ${retryAfterSec}s.`,
    };
  }
  return { ok: true };
}

function recordLoginFailure(req, email) {
  const now = Date.now();
  prune(now);
  const key = keyFrom(req, email);
  let cur = buckets.get(key);
  if (!cur || now - cur.firstAt > WINDOW_MS) {
    cur = { fails: 0, firstAt: now, bannedUntil: 0 };
  }
  cur.fails += 1;
  if (cur.fails >= MAX_ATTEMPTS) {
    cur.bannedUntil = now + BAN_MS;
  }
  buckets.set(key, cur);
  return {
    fails: cur.fails,
    banned: cur.bannedUntil > now,
    retryAfterSec: cur.bannedUntil > now
      ? Math.max(1, Math.ceil((cur.bannedUntil - now) / 1000))
      : 0,
  };
}

function clearLoginFailures(req, email) {
  buckets.delete(keyFrom(req, email));
}

module.exports = {
  assertLoginAllowed,
  recordLoginFailure,
  clearLoginFailures,
  LOGIN_LOCKOUT: { MAX_ATTEMPTS, WINDOW_MS, BAN_MS },
};
