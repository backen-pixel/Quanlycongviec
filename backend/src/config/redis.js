/**
 * Redis singleton (ioredis).
 *
 * - Khi REDIS_URL trống: getRedis() trả null → mọi helper cache fallback về in-process.
 * - Khi có URL: tạo 1 client dùng chung. lazyConnect: true để không block startup,
 *   enableOfflineQueue: false để command không tồn kho khi mất kết nối (fail-fast → fallback).
 * - Mọi lỗi connection chỉ log warn, KHÔNG throw — backend phải vẫn chạy được khi Redis chết.
 */

const config = require('./index');
const { getRedisClientOptions } = require('./redisUrl');

let _client = null;
let _status = 'disabled'; // 'disabled' | 'connecting' | 'ok' | 'down'
let _warned = false;

function getStatus() {
  return _status;
}

function _maybeRequireIoredis() {
  try {
    return require('ioredis');
  } catch (e) {
    if (!_warned) {
      console.warn('[redis] ioredis chưa được cài; Redis bị vô hiệu hoá.');
      _warned = true;
    }
    return null;
  }
}

function getRedis() {
  if (_client) return _client;
  if (!config.redisUrl || process.env.REDIS_DISABLED === '1') {
    _status = 'disabled';
    return null;
  }
  const Redis = _maybeRequireIoredis();
  if (!Redis) {
    _status = 'disabled';
    return null;
  }

  _status = 'connecting';
  const client = new Redis(config.redisUrl, getRedisClientOptions());

  client.on('ready', () => {
    _status = 'ok';
    console.log('[redis] connected');
  });
  client.on('error', (err) => {
    _status = 'down';
    if (!_warned) {
      console.warn('[redis] error:', err.message);
      _warned = true;
    }
  });
  client.on('end', () => {
    _status = 'down';
  });

  // Khởi tạo kết nối nền — không block server.listen
  client.connect().catch((err) => {
    _status = 'down';
    console.warn('[redis] initial connect failed:', err.message);
  });

  _client = client;
  return _client;
}

/** Trả về client nếu đang sẵn sàng nhận lệnh; null nếu chưa/đã hỏng. */
function getRedisIfReady() {
  const c = getRedis();
  if (!c) return null;
  if (_status !== 'ok') return null;
  return c;
}

module.exports = { getRedis, getRedisIfReady, getStatus };
