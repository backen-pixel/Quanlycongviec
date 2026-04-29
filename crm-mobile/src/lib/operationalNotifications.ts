/** Đồng bộ `backend/src/helpers/notificationOperationalFilter.js` — không hiển thị TB hết hạn */

const EXPIRY_DEADLINE_NOTIFICATION_TYPES = new Set([
  'crm_deadline_1h',
  'crm_deadline_warning',
  'crm_deadline_overdue',
  'crm_deadline_set',
  'production_task_deadline_warning',
  'production_task_deadline_overdue',
  'logistics_task_deadline_warning',
  'logistics_task_deadline_overdue',
  'project_pipeline_deadline_warning',
  'project_pipeline_deadline_overdue',
  'deadline_warning',
  'deadline_overdue',
  'deadline_reminder',
  'invoice_overdue',
  'task_overdue',
]);

export function isExpiryDeadlineNotificationType(type: string | null | undefined): boolean {
  return !!(type && EXPIRY_DEADLINE_NOTIFICATION_TYPES.has(String(type)));
}
