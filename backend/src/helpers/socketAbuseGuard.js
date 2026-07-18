/**
 * Chống abuse Socket.IO: rate-limit handshake theo IP + giới hạn số kết nối / user.
 * Env (optional):
 *   SOCKET_HANDSHAKE_MAX (default 20 / cửa sổ)
 *   SOCKET_HANDSHAKE_WINDOW_MS (default 60s)
 *   SOCKET_MAX_CONN_PER_USER (default 8)
 */
function envInt(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const HANDSHAKE_MAX = envInt('SOCKET_HANDSHAKE_MAX', 20);
const HANDSHAKE_WINDOW_MS = envInt('SOCKET_HANDSHAKE_WINDOW_MS', 60_000);
const MAX_CONN_PER_USER = envInt('SOCKET_MAX_CONN_PER_USER', 8);

/** @type {Map<string, { t: number, c: number }>} */
const handshakeBuckets = new Map();
/** @type {Map<string, Set<string>>} */
const userSockets = new Map();
let lastPrune = Date.now();

function clientIp(req) {
  const xf = req?.headers?.['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0].trim();
  return String(req?.socket?.remoteAddress || 'unknown');
}

function pruneHandshake(now) {
  if (now - lastPrune < 30_000) return;
  lastPrune = now;
  for (const [k, v] of handshakeBuckets) {
    if (now - v.t > HANDSHAKE_WINDOW_MS * 2) handshakeBuckets.delete(k);
  }
}

/**
 * Dùng với `io.engine.allowRequest`.
 * @returns {(req: import('http').IncomingMessage, fn: (err: string|null|undefined, ok: boolean) => void) => void}
 */
function createSocketAllowRequest() {
  return (req, callback) => {
    const now = Date.now();
    pruneHandshake(now);
    const ip = clientIp(req);
    let cur = handshakeBuckets.get(ip);
    if (!cur || now - cur.t > HANDSHAKE_WINDOW_MS) {
      cur = { t: now, c: 0 };
    }
    cur.c += 1;
    handshakeBuckets.set(ip, cur);
    if (cur.c > HANDSHAKE_MAX) {
      return callback('socket_handshake_rate_limited', false);
    }
    return callback(null, true);
  };
}

/**
 * Middleware Socket.IO (sau JWT): giới hạn số socket đồng thời / user.
 * Socket cũ nhất bị ngắt khi vượt trần.
 */
function attachMaxConnectionsPerUser(io) {
  io.use((socket, next) => {
    const userId = socket.user?.userId || socket.user?.id;
    if (!userId) return next();
    const uid = String(userId);
    let set = userSockets.get(uid);
    if (!set) {
      set = new Set();
      userSockets.set(uid, set);
    }
    if (set.size >= MAX_CONN_PER_USER) {
      const oldestId = set.values().next().value;
      if (oldestId) {
        const old = io.sockets.sockets.get(oldestId);
        try {
          old?.emit('socket:replaced', { reason: 'max_connections' });
          old?.disconnect(true);
        } catch { /* ignore */ }
        set.delete(oldestId);
      }
    }
    set.add(socket.id);
    socket.on('disconnect', () => {
      const s = userSockets.get(uid);
      if (!s) return;
      s.delete(socket.id);
      if (!s.size) userSockets.delete(uid);
    });
    next();
  });
}

module.exports = {
  createSocketAllowRequest,
  attachMaxConnectionsPerUser,
  SOCKET_ABUSE: {
    HANDSHAKE_MAX,
    HANDSHAKE_WINDOW_MS,
    MAX_CONN_PER_USER,
  },
};
