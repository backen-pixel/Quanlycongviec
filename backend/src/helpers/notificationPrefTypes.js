/**
 * Map notification row `type` (+ entity_type) → cột notification_preferences.
 * Đồng bộ với frontend `notificationPrefsCache.js`.
 */

const NOTIFICATION_TYPE_PREF_MAP = {
  task_assigned: 'task_assigned',
  task_updated: 'task_completed',
  task_completed: 'task_completed',
  crm_task_assigned: 'task_assigned',
  crm_task_completed: 'task_completed',
  crm_assignment_assigned: 'task_assigned',
  crm_assignment_comment: 'comment_added',
  crm_assignment_due_soon: 'deadline_warning',
  crm_assignment_overdue: 'deadline_warning',

  comment_added: 'comment_added',

  stage_changed: 'stage_changed',
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
  'logistics_deadlines',
  'project_notifications',
]);

/**
 * @param {string} type
 * @param {string|null|undefined} entityType — ví dụ 'task', 'crm_lead'
 */
function preferenceKeyForNotificationType(type, entityType, metadata = null) {
  if (!type || typeof type !== 'string') return null;

  const eco =
    metadata && typeof metadata === 'object' ? String(metadata.ecosystem_module_key || '').trim() : '';

  /** Xưởng SX / VC / CRM — không gom vào project_notifications (QLCV). */
  if (eco === 'production' || eco === 'crm' || eco === 'logistics') {
    const mapped = NOTIFICATION_TYPE_PREF_MAP[type];
    if (mapped) return mapped;
    if (type === 'comment_added') return 'comment_added';
    if (type === 'workshop_new_deal') return 'deal_new';
    if (type === 'logistics_stage_changed' || type === 'crm_stage_changed') return 'stage_changed';
    if (type.startsWith('vc_handover_')) return 'deal_new';
    if (type === 'logistics_task_deadline_warning' || type === 'logistics_task_deadline_overdue') {
      return 'logistics_deadlines';
    }
    return null;
  }

  if (
    entityType === 'lead' ||
    entityType === 'crm_lead' ||
    entityType === 'crm_deal'
  ) {
    const mapped = NOTIFICATION_TYPE_PREF_MAP[type];
    if (mapped) return mapped;
  }

  if (
    type === 'project_assigned' ||
    type === 'project_updated' ||
    type === 'project_stage_changed'
  ) {
    return 'project_notifications';
  }
  if (
    type === 'project_pipeline_deadline_warning' ||
    type === 'project_pipeline_deadline_overdue'
  ) {
    return 'project_notifications';
  }
  if (entityType === 'project') {
    return 'project_notifications';
  }
  if (eco === 'projects') {
    return 'project_notifications';
  }

  const metaPid =
    metadata && typeof metadata === 'object' && metadata.project_id != null && String(metadata.project_id).trim() !== ''
      ? String(metadata.project_id).trim()
      : null;
  if (
    metaPid &&
    [
      'task_assigned',
      'task_updated',
      'task_completed',
      'task_created',
      'comment_added',
      'checklist_completed',
    ].includes(type)
  ) {
    return 'project_notifications';
  }

  if (type === 'task_created') return 'project_notifications';

  if (type === 'lead_created') return 'lead_new';
  if (type === 'deal_created' || type === 'deal_assigned') return 'deal_new';

  if (type === 'lead_stage_sla_reminder') return 'crm_lead_deadlines';

  if (type === 'ai_crm_deadline_digest') return 'crm_lead_deadlines';

  if (
    type === 'crm_deadline_1h' ||
    type === 'crm_deadline_warning' ||
    type === 'crm_deadline_overdue' ||
    type === 'crm_deadline_set'
  ) {
    const mk = metadata && typeof metadata === 'object' ? String(metadata.module_key || '') : '';
    if (mk === 'production') return 'production_deadlines';
    return 'crm_lead_deadlines';
  }

  if (type === 'production_task_deadline_warning' || type === 'production_task_deadline_overdue') {
    return 'production_deadlines';
  }
  if (type === 'logistics_task_deadline_warning' || type === 'logistics_task_deadline_overdue') {
    return 'logistics_deadlines';
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
function isNotificationTypeAllowed(prefs, notificationType, entityType, metadata = null) {
  if (!prefs || !notificationType) return true;
  const key = preferenceKeyForNotificationType(notificationType, entityType, metadata);
  if (!key) return true;
  return prefs[key] !== false;
}

module.exports = {
  preferenceKeyForNotificationType,
  isNotificationTypeAllowed,
};
