const { supabase } = require('../config/supabase');

/** Ngưỡng coi online: có ping trong 2 phút gần nhất */
const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;

const MIGRATION_HINT = 'database/67_user_activity_and_messenger_pins.sql';

/**
 * Ghi nhận user còn hoạt động (HTTP POST /users/ping hoặc socket presence:ping).
 * @param {string} userId
 * @returns {Promise<{ ok: boolean, persisted?: boolean, last_ping_at?: string, error?: string }>}
 */
async function recordUserPing(userId) {
  const uid = userId != null ? String(userId) : '';
  if (!uid) return { ok: false, error: 'missing_user_id' };

  const last_ping_at = new Date().toISOString();
  const { error } = await supabase.from('user_last_activity').upsert(
    { user_id: uid, last_ping_at },
    { onConflict: 'user_id' },
  );

  if (error) {
    console.warn('[userPresence] recordUserPing:', error.message, '- chạy migration', MIGRATION_HINT);
    return { ok: false, persisted: false, error: error.message };
  }

  return { ok: true, persisted: true, last_ping_at };
}

/**
 * @param {string[]} userIds — tối đa 200 id
 * @returns {Promise<Record<string, { online: boolean, last_ping_at: string | null }>>}
 */
async function getPresenceForUserIds(userIds) {
  const seen = new Set();
  const filtered = [];
  for (const id of userIds || []) {
    const s = String(id || '');
    if (!s || seen.has(s)) continue;
    seen.add(s);
    filtered.push(s);
    if (filtered.length >= 200) break;
  }

  const presence = {};
  for (const id of filtered) {
    presence[id] = { online: false, last_ping_at: null };
  }
  if (!filtered.length) return presence;

  const { data, error } = await supabase
    .from('user_last_activity')
    .select('user_id, last_ping_at')
    .in('user_id', filtered);

  if (error) throw error;

  const threshold = Date.now() - ONLINE_THRESHOLD_MS;
  for (const row of data || []) {
    const id = String(row.user_id);
    const ts = row.last_ping_at ? new Date(row.last_ping_at).getTime() : 0;
    presence[id] = {
      online: ts > threshold,
      last_ping_at: row.last_ping_at,
    };
  }

  return presence;
}

module.exports = {
  ONLINE_THRESHOLD_MS,
  MIGRATION_HINT,
  recordUserPing,
  getPresenceForUserIds,
};
