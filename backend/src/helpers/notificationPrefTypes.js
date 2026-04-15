/**
 * Map notification row `type` → column trong notification_preferences.
 * Giữ đồng bộ với frontend `notificationPrefsCache.js` (NOTIFICATION_TYPE_PREF_MAP).
 */
const NOTIFICATION_TYPE_PREF_MAP = {
  task_assigned: 'task_assigned',
  task_updated: 'task_completed',
  task_completed: 'task_completed',
  project_assigned: 'task_assigned',
  crm_task_assigned: 'task_assigned',
  crm_task_completed: 'task_completed',

  deadline_warning: 'deadline_warning',
  deadline_reminder: 'deadline_warning',
  deadline_overdue: 'deadline_warning',
  crm_deadline_warning: 'deadline_warning',
  crm_deadline_1h: 'deadline_warning',
  crm_deadline_overdue: 'deadline_warning',
  crm_deadline_set: 'deadline_warning',

  comment_added: 'comment_added',

  stage_changed: 'stage_changed',
  project_stage_changed: 'stage_changed',
  lead_stage_changed: 'stage_changed',

  deal_won: 'deal_won',

  approval_request: 'approval_request',

  checklist_completed: 'checklist_completed',

  lead_assigned: 'lead_assigned',

  order_confirmed: 'order_confirmed',
  order_created: 'order_confirmed',
  order_updated: 'order_confirmed',

  invoice_overdue: 'invoice_overdue',
};

const PREF_KEYS = new Set([
  'task_assigned',
  'task_completed',
  'deadline_warning',
  'comment_added',
  'stage_changed',
  'deal_won',
  'approval_request',
  'checklist_completed',
  'lead_assigned',
  'order_confirmed',
  'invoice_overdue',
]);

function preferenceKeyForNotificationType(type) {
  if (!type || typeof type !== 'string') return null;
  if (NOTIFICATION_TYPE_PREF_MAP[type]) return NOTIFICATION_TYPE_PREF_MAP[type];
  if (PREF_KEYS.has(type)) return type;
  return null;
}

/** Loại không nằm trong map → không chặn (coi như bật). */
function isNotificationTypeAllowed(prefs, notificationType) {
  if (!prefs || !notificationType) return true;
  const key = preferenceKeyForNotificationType(notificationType);
  if (!key) return true;
  return prefs[key] !== false;
}

module.exports = {
  preferenceKeyForNotificationType,
  isNotificationTypeAllowed,
};
