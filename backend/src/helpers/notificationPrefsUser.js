const { supabase } = require('../config/supabase');
const { isNotificationTypeAllowed } = require('./notificationPrefTypes');

const TTL_MS = 45_000;
const cache = new Map(); // userId -> { prefs, at }

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
};

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
  const hit = cache.get(String(userId));
  if (hit && Date.now() - hit.at < TTL_MS) return hit.prefs;
  const prefs = await getMergedPrefsForUser(userId);
  cache.set(String(userId), { prefs, at: Date.now() });
  return prefs;
}

function invalidateNotificationPrefsCache(userId) {
  if (userId != null) cache.delete(String(userId));
  else cache.clear();
}

/**
 * Có được gửi thông báo (DB + socket + push) cho user không — theo notification_preferences.
 */
async function isNotificationAllowedForUser(userId, type, entityType) {
  const prefs = await getCachedPrefsForUser(userId);
  return isNotificationTypeAllowed(prefs, type, entityType);
}

module.exports = {
  DEFAULT_PREFS,
  getMergedPrefsForUser,
  getCachedPrefsForUser,
  invalidateNotificationPrefsCache,
  isNotificationAllowedForUser,
};
