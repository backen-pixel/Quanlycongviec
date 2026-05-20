const { supabase } = require('../config/supabase');
const { isNotificationTypeAllowed } = require('./notificationPrefTypes');
const { createTTLCache } = require('./ttlCache');

const DEFAULT_PREFS = {
  browser_push: true,
  sound: true,
  task_assigned: true,
  task_completed: true,
  deadline_warning: true,
  comment_added: true,
  stage_changed: true,
  deal_won: true,
  approval_request: true,
  checklist_completed: true,
  lead_assigned: true,
  order_confirmed: true,
  invoice_overdue: true,
  lead_new: true,
  deal_new: true,
  production_deadlines: true,
  crm_lead_deadlines: true,
  logistics_deadlines: true,
  /** Pipeline dự án (DA): giai đoạn, NV/bình luận trên dự án, nhắc hạn task giai đoạn DA… — mặc định tắt */
  project_notifications: false,
};

// L1 TTL ngắn (45s) — chống burst trong cùng instance.
// L2 (Redis) TTL 10 phút — chia sẻ giữa các instance, giảm read Supabase trên đường nóng (notification fan-out).
const cache = createTTLCache({
  ttlMs: 45_000,
  maxEntries: 5000,
  redisTtlMs: 10 * 60_000,
  redisPrefix: 'notifprefs:',
});

function mergePrefs(row) {
  if (!row || typeof row !== 'object') return { ...DEFAULT_PREFS };
  return { ...DEFAULT_PREFS, ...row };
}

async function fetchPrefsRow(userId) {
  if (!userId) return null;
  const { data, error } = await supabase.from('notification_preferences').select('*').eq('user_id', userId).maybeSingle();
  if (error && error.code !== 'PGRST116') {
    console.warn('[notification_prefs]', error.message);
  }
  return data;
}

async function getMergedPrefsForUser(userId) {
  const row = await fetchPrefsRow(userId);
  return mergePrefs(row);
}

async function getCachedPrefsForUser(userId) {
  if (!userId) return { ...DEFAULT_PREFS };
  const key = String(userId);
  return cache.getOrFetch(key, () => getMergedPrefsForUser(userId));
}

/**
 * Sync chữ ký để giữ tương thích với callsite (routes/push.js gọi không await).
 * L2 (Redis) được xoá nền — không block caller.
 */
function invalidateNotificationPrefsCache(userId) {
  if (userId == null) {
    cache.invalidateRemote(null).catch(() => {});
    return;
  }
  const key = String(userId);
  cache.invalidateRemote(key).catch(() => {});
}

/**
 * Có được gửi thông báo (DB + socket + push) cho user không — theo notification_preferences.
 */
async function isNotificationAllowedForUser(userId, type, entityType, metadata = null) {
  const prefs = await getCachedPrefsForUser(userId);
  return isNotificationTypeAllowed(prefs, type, entityType, metadata);
}

module.exports = {
  DEFAULT_PREFS,
  getMergedPrefsForUser,
  getCachedPrefsForUser,
  invalidateNotificationPrefsCache,
  isNotificationAllowedForUser,
};
