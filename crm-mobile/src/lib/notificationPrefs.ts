import type { NotificationPrefs } from '../types/notifications';

/**
 * Map `notifications.type` → cột `notification_preferences` (đồng bộ web + backend).
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
  | 'invoice_overdue';

const NOTIFICATION_TYPE_PREF_MAP: Record<string, NotifPrefToggleKey> = {
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
]);

export function preferenceKeyForNotificationType(type: string | undefined): NotifPrefToggleKey | null {
  if (!type || typeof type !== 'string') return null;
  if (NOTIFICATION_TYPE_PREF_MAP[type]) return NOTIFICATION_TYPE_PREF_MAP[type];
  if (PREF_KEYS.has(type)) return type as NotifPrefToggleKey;
  return null;
}

/** Loại không map được → coi như bật (giống web). */
export function isNotificationTypeEnabled(prefs: Partial<NotificationPrefs> | null, type: string | undefined): boolean {
  const key = preferenceKeyForNotificationType(type);
  if (!key) return true;
  if (!prefs) return true;
  const v = prefs[key];
  return v !== false;
}
