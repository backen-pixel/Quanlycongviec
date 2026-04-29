/**
 * Phân loại thông báo "hết hạn / nhắc hạn" — chỉ hiển thị thông báo thao tác (giao việc, đổi giai đoạn, …).
 * Đồng bộ với frontend `notificationOperationalFilter.js`.
 */

const EXPIRY_DEADLINE_NOTIFICATION_TYPES = [
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
];

const SET = new Set(EXPIRY_DEADLINE_NOTIFICATION_TYPES);

function isExpiryDeadlineNotificationType(type) {
  return !!(type && SET.has(String(type)));
}

/** Chuỗi cho PostgREST `.not('type', 'in', clause)` — identifier đơn giản không cần dấu ngoặc kép */
function postgrestNotInTypesForDeadlines() {
  return `(${EXPIRY_DEADLINE_NOTIFICATION_TYPES.join(',')})`;
}

module.exports = {
  EXPIRY_DEADLINE_NOTIFICATION_TYPES,
  isExpiryDeadlineNotificationType,
  postgrestNotInTypesForDeadlines,
};
