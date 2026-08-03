/**
 * push_device_tokens — fallback Postgres khi PostgREST schema cache chưa reload (PGRST205).
 */

const { pgQuery, pgSessionQuery, isPgEnabled } = require('../config/db');

function isRestTableMissingError(err) {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || '');
  return code === '42P01'
    || code === 'PGRST205'
    || /push_device_tokens/i.test(msg)
    || /schema cache/i.test(msg)
    || /app_key/i.test(msg);
}

async function pgRun(sql, params = []) {
  if (!isPgEnabled()) return null;
  return (await pgSessionQuery(sql, params)) ?? (await pgQuery(sql, params));
}

async function probePushTokensTablePg() {
  const result = await pgRun('SELECT id FROM public.push_device_tokens LIMIT 1');
  return !!result;
}

/**
 * @param {string} userId
 * @param {{ appKeys?: string[] | null }} [opts]
 *   appKeys = null/undefined → mọi app; mảng → chỉ các app_key đó (bỏ token chưa gắn app).
 */
async function fetchUserTokensPg(userId, opts = {}) {
  const appKeys = opts.appKeys;
  let sql = 'SELECT token, platform, device_id, last_seen_at, app_key FROM public.push_device_tokens WHERE user_id = $1::uuid';
  const params = [userId];
  if (Array.isArray(appKeys) && appKeys.length) {
    sql += ' AND app_key = ANY($2::text[])';
    params.push(appKeys);
  }
  const result = await pgRun(sql, params);
  if (!result) return null;
  const rows = (result.rows || []).filter((r) => r.token);
  return {
    expo: rows.filter((r) => r.platform === 'expo'),
    fcm: rows.filter((r) => r.platform === 'fcm'),
  };
}

async function upsertDeviceTokenPg(userId, token, platform, deviceId, appKey) {
  const result = await pgRun(
    `INSERT INTO public.push_device_tokens (user_id, token, platform, device_id, app_key, last_seen_at)
     VALUES ($1::uuid, $2, $3, $4, $5, now())
     ON CONFLICT (user_id, token) DO UPDATE SET
       platform = EXCLUDED.platform,
       device_id = COALESCE(EXCLUDED.device_id, push_device_tokens.device_id),
       app_key = COALESCE(EXCLUDED.app_key, push_device_tokens.app_key),
       last_seen_at = now()
     RETURNING id, platform, app_key, last_seen_at`,
    [userId, token, platform, deviceId || null, appKey || null],
  );
  return result?.rows?.[0] || null;
}

async function deleteDeviceTokenPg(userId, token) {
  await pgRun(
    'DELETE FROM public.push_device_tokens WHERE user_id = $1::uuid AND token = $2',
    [userId, token],
  );
}

async function deleteTokenByValuePg(token) {
  await pgRun('DELETE FROM public.push_device_tokens WHERE token = $1', [token]);
}

module.exports = {
  isRestTableMissingError,
  probePushTokensTablePg,
  fetchUserTokensPg,
  upsertDeviceTokenPg,
  deleteDeviceTokenPg,
  deleteTokenByValuePg,
};
