const { supabase } = require('../config/supabase');

/**
 * Create a single notification with Socket.IO push
 * @param {Object} req - Express request object (contains app context)
 * @param {string} userId - Target user ID (will skip if same as current user)
 * @param {string} type - Notification type (e.g., 'task_assigned', 'comment_added', etc.)
 * @param {string} title - Notification title (short, Vietnamese)
 * @param {string} message - Notification message (detailed, Vietnamese)
 * @param {string} entityType - Entity type (e.g., 'task', 'project', 'comment')
 * @param {string} entityId - ID of the entity
 * @param {Object} metadata - Optional JSONB metadata (e.g., link, extra data)
 * @returns {Promise<Object|null>} - Created notification object or null
 */
async function createNotification(req, userId, type, title, message, entityType, entityId, metadata = null) {
  if (!userId) return null;

  const insert = {
    user_id: userId,
    type,
    title,
    message,
    entity_type: entityType,
    entity_id: entityId,
  };

  if (metadata) insert.metadata = metadata;

  const { data, error } = await supabase
    .from('notifications')
    .insert(insert)
    .select()
    .single();

  if (error) {
    console.error('Notification insert error:', error.message);
    return null;
  }

  // Push via Socket.IO if available
  const pushFn = req.app?.get('pushNotification');
  if (pushFn && data) {
    pushFn(userId, data);
  }

  return data;
}

/**
 * Create notifications for multiple users (deduplicated)
 * @param {Object} req - Express request object
 * @param {string[]} userIds - Array of user IDs
 * @param {string} type - Notification type
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {string} entityType - Entity type
 * @param {string} entityId - Entity ID
 * @param {Object} metadata - Optional metadata
 * @returns {Promise<Array>} - Array of created notifications
 */
async function notifyMultiple(req, userIds, type, title, message, entityType, entityId, metadata = null) {
  const unique = [...new Set(userIds.filter(Boolean))];
  const results = [];

  for (const uid of unique) {
    const n = await createNotification(req, uid, type, title, message, entityType, entityId, metadata);
    if (n) results.push(n);
  }

  return results;
}

/**
 * Check if notification already exists (to avoid duplicates)
 * @param {string} userId - User ID
 * @param {string} type - Notification type
 * @param {string} entityId - Entity ID
 * @returns {Promise<boolean>} - True if exists
 */
async function notificationExists(userId, type, entityId) {
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('type', type)
    .eq('entity_id', entityId)
    .eq('is_read', false);

  return count > 0;
}

module.exports = {
  createNotification,
  notifyMultiple,
  notificationExists,
};
