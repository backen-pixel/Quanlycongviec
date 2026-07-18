const { supabase } = require('../config/supabase');
const { isNotificationAllowedForUser } = require('./notificationPrefsUser');
const { isExpiryDeadlineNotificationType } = require('./notificationOperationalFilter');
// Lưu ý: KHÔNG gọi sendMobilePush trực tiếp ở đây — đã có server.js pushNotification gọi
// (qua app.set('pushNotification')). Tránh gửi push trùng.

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
  if (isExpiryDeadlineNotificationType(type)) return null;

  const allowed = await isNotificationAllowedForUser(userId, type, entityType, metadata);
  if (!allowed) return null;

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

  const pushFn = req.app?.get('pushNotification');
  if (error) {
    console.error('Notification insert error:', error.message);
    // Vẫn đẩy socket + FCM với payload dựng sẵn — tránh mất thông báo khi DB lỗi tạm.
    if (typeof pushFn === 'function') {
      try {
        pushFn(userId, {
          ...insert,
          id: null,
          is_read: false,
          created_at: new Date().toISOString(),
        });
      } catch (e) {
        console.warn('[createNotification] push fallback:', e.message || e);
      }
    }
    return null;
  }

  // Socket.IO + mobile push (helper server.js cũng đã gọi sendMobilePush)
  if (typeof pushFn === 'function' && data) {
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

/**
 * Đẩy notification đã insert tới client (socket) + mobile push (Expo + FCM).
 * Dùng cho cron/AI bot khi không có req.app — logic khớp server.js pushNotification.
 */
async function dispatchNotificationToUser(io, userId, notification) {
  if (!userId || !notification) return;
  if (isExpiryDeadlineNotificationType(notification.type)) return;

  // Khớp server.js isProjectModuleNotification — chỉ chặn QLCV thuần.
  const meta = notification.metadata && typeof notification.metadata === 'object'
    ? notification.metadata
    : {};
  const eco = String(meta.ecosystem_module_key || '').trim();
  if (eco !== 'production' && eco !== 'logistics' && eco !== 'crm') {
    if (eco === 'projects') return;
    const { preferenceKeyForNotificationType } = require('./notificationPrefTypes');
    const key = preferenceKeyForNotificationType(
      notification.type,
      notification.entity_type,
      notification.metadata,
    );
    if (key === 'project_notifications' || notification.entity_type === 'project') return;
  }

  const allowed = await isNotificationAllowedForUser(
    userId,
    notification.type,
    notification.entity_type,
    notification.metadata,
  );
  if (!allowed) return;

  if (io) io.to(`user:${userId}`).emit('notification', notification);

  try {
    const { sendMobilePush } = require('../services/pushSender');
    void sendMobilePush(userId, notification);
  } catch (e) {
    console.warn('[dispatchNotificationToUser] push lỗi:', e.message || e);
  }
}

module.exports = {
  createNotification,
  notifyMultiple,
  notificationExists,
  dispatchNotificationToUser,
};
