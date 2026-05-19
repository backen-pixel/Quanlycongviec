/**
 * Thông báo cho module Giao việc CRM (id BIGINT, không phải UUID).
 * Cần migration database/197_notifications_entity_id_text.sql.
 */

function assignmentIdStr(assignmentId) {
  if (assignmentId == null || assignmentId === '') return null;
  return String(assignmentId);
}

function buildAssignmentNotificationInsert(userId, { type, title, message, assignmentId, metadata = {} }) {
  const id = assignmentIdStr(assignmentId);
  return {
    user_id: userId,
    type,
    title,
    message,
    entity_type: 'crm_assignment',
    entity_id: id,
    metadata: {
      module_key: 'crm',
      ecosystem_module_key: 'crm',
      assignment_id: id,
      ...metadata,
    },
  };
}

async function persistAssignmentNotification(supabase, userId, payload) {
  if (!userId) return null;
  const row = buildAssignmentNotificationInsert(userId, payload);
  const { data, error } = await supabase.from('notifications').insert(row).select().single();
  if (error) {
    console.warn('[crm_assignment] persistNotification:', error.message);
    return null;
  }
  return data;
}

module.exports = {
  assignmentIdStr,
  buildAssignmentNotificationInsert,
  persistAssignmentNotification,
};
