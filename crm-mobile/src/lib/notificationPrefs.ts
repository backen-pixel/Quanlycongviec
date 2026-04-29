import type { NotificationPrefs } from '../types/notifications';

/**
 * Map `notifications.type` (+ entity_type) → cột `notification_preferences` (đồng bộ web + backend).
 */
export type NotifPrefToggleKey =
  | 'task_assigned'
  | 'task_completed'
  | 'deadline_warning'
  | 'comment_added'
  | 'stage_changed'
  | 'deal_won'
  | 'approval_request'
  | 'checklist_completed'
  | 'lead_assigned'
  | 'order_confirmed'
  | 'invoice_overdue'
  | 'lead_new'
  | 'deal_new'
  | 'production_deadlines'
  | 'crm_lead_deadlines'
  | 'logistics_deadlines';

const NOTIFICATION_TYPE_PREF_MAP: Record<string, NotifPrefToggleKey> = {
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

const PREF_KEYS = new Set<string>([
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
]);

export function preferenceKeyForNotificationType(
  type: string | undefined,
  entityType?: string | null,
): NotifPrefToggleKey | null {
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

  if (type === 'production_task_deadline_warning' || type === 'production_task_deadline_overdue') {
    return 'production_deadlines';
  }
  if (type === 'logistics_task_deadline_warning' || type === 'logistics_task_deadline_overdue') {
    return 'logistics_deadlines';
  }
  if (type === 'project_pipeline_deadline_warning' || type === 'project_pipeline_deadline_overdue') {
    return 'deadline_warning';
  }

  if (type === 'deadline_warning' || type === 'deadline_overdue' || type === 'deadline_reminder') {
    if (entityType === 'task') return 'production_deadlines';
    return 'deadline_warning';
  }

  if (NOTIFICATION_TYPE_PREF_MAP[type]) return NOTIFICATION_TYPE_PREF_MAP[type];
  if (PREF_KEYS.has(type)) return type as NotifPrefToggleKey;
  return null;
}

/** Loại không map được → coi như bật (giống web). */
export function isNotificationTypeEnabled(
  prefs: Partial<NotificationPrefs> | null,
  type: string | undefined,
  entityType?: string | null,
): boolean {
  const key = preferenceKeyForNotificationType(type, entityType);
  if (!key) return true;
  if (!prefs) return true;
  const v = prefs[key];
  return v !== false;
}
