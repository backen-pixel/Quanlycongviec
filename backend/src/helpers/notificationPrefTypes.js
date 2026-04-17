/**
 * Map notification row `type` (+ entity_type) → cột notification_preferences.
 * Đồng bộ với frontend `notificationPrefsCache.js`.
 */

const NOTIFICATION_TYPE_PREF_MAP = {
  task_assigned: 'task_assigned',
  task_updated: 'task_completed',
  task_completed: 'task_completed',
  project_assigned: 'task_assigned',
  crm_task_assigned: 'task_assigned',
  crm_task_completed: 'task_completed',

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
  'lead_new',
  'deal_new',
  'production_deadlines',
  'crm_lead_deadlines',
]);

/**
 * @param {string} type
 * @param {string|null|undefined} entityType — ví dụ 'task', 'crm_lead'
 */
function preferenceKeyForNotificationType(type, entityType) {
  if (!type || typeof type !== 'string') return null;

  if (type === 'lead_created') return 'lead_new';
  if (type === 'deal_created' || type === 'deal_assigned') return 'deal_new';

  if (
    type === 'crm_deadline_1h' ||
    type === 'crm_deadline_warning' ||
    type === 'crm_deadline_overdue' ||
    type === 'crm_deadline_set'
  ) {
    return 'crm_lead_deadlines';
  }

  if (type === 'deadline_warning' || type === 'deadline_overdue' || type === 'deadline_reminder') {
    if (entityType === 'task') return 'production_deadlines';
    return 'deadline_warning';
  }

  if (NOTIFICATION_TYPE_PREF_MAP[type]) return NOTIFICATION_TYPE_PREF_MAP[type];
  if (PREF_KEYS.has(type)) return type;
  return null;
}

/** Loại không nằm trong map → không chặn (coi như bật). */
function isNotificationTypeAllowed(prefs, notificationType, entityType) {
  if (!prefs || !notificationType) return true;
  const key = preferenceKeyForNotificationType(notificationType, entityType);
  if (!key) return true;
  return prefs[key] !== false;
}

module.exports = {
  preferenceKeyForNotificationType,
  isNotificationTypeAllowed,
};
