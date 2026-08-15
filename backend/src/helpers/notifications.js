const { supabase } = require('../config/supabase');
const { isSystemAdmin, isPlatformAdmin } = require('./adminRole');
const { isNotificationAllowedForUser } = require('./notificationPrefsUser');
const { isExpiryDeadlineNotificationType } = require('./notificationOperationalFilter');
const { isCommentMutedForUser, isMessengerMutedForUser } = require('./notificationMutes');
// Lưu ý: KHÔNG gọi sendMobilePush trực tiếp ở đây — đã có server.js pushNotification gọi
// (qua app.set('pushNotification')). Tránh gửi push trùng.

function isGlobalNotificationViewer(user) {
  return isSystemAdmin(user) || isPlatformAdmin(user);
}

function normalizeCompanyId(value) {
  if (value == null) return '';
  const s = String(value).trim();
  return s;
}

function extractNotificationCompanyId(n) {
  const meta = n?.metadata && typeof n.metadata === 'object' ? n.metadata : {};
  return normalizeCompanyId(meta.company_id || meta.companyId);
}

function withCompanyMeta(metadata, companyId) {
  const cid = normalizeCompanyId(companyId);
  const meta = metadata && typeof metadata === 'object' ? { ...metadata } : {};
  if (cid && !normalizeCompanyId(meta.company_id || meta.companyId)) {
    meta.company_id = cid;
  }
  return Object.keys(meta).length ? meta : (metadata || null);
}

/** Inbox: admin hệ thống thấy hết; user gắn công ty chỉ thấy TB stamped đúng công ty (hoặc TB chưa gắn company_id). */
function notificationVisibleToViewer(n, viewer) {
  if (!n) return false;
  if (isGlobalNotificationViewer(viewer)) return true;
  const viewerCid = normalizeCompanyId(viewer?.company_id);
  if (!viewerCid) return true;
  const nCid = extractNotificationCompanyId(n);
  if (!nCid) return true;
  return nCid === viewerCid;
}

function filterNotificationsForViewer(rows, viewer) {
  return (rows || []).filter((n) => notificationVisibleToViewer(n, viewer));
}

/**
 * Admin hệ thống (role admin, không company_id) + platform_admin.
 */
async function getSystemAdminUserIds(opts = {}) {
  const activeOnly = opts.activeOnly !== false;
  let q = supabase.from('users').select('id, company_id, role').in('role', ['admin', 'platform_admin']);
  if (activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) {
    console.warn('[getSystemAdminUserIds]', error.message);
    return [];
  }
  return (data || [])
    .filter((u) => u?.id && isGlobalNotificationViewer(u))
    .map((u) => String(u.id));
}

/**
 * User theo role nhận TB đúng công ty (company_id / user_companies) + tùy chọn admin hệ thống (company_id null).
 * @param {string|null|undefined} companyId
 * @param {string[]} roles
 * @param {{ includeSystemAdmins?: boolean, activeOnly?: boolean }} [opts]
 * @returns {Promise<string[]>}
 */
async function getCompanyScopedRoleUserIds(companyId, roles, opts = {}) {
  const roleList = [...new Set((roles || []).map((r) => String(r || '').trim()).filter(Boolean))];
  if (!roleList.length) return [];

  const includeSystemAdmins = opts.includeSystemAdmins !== false;
  const activeOnly = opts.activeOnly !== false;
  const cid = normalizeCompanyId(companyId);
  const roleSet = new Set(roleList);

  const queryRoles = includeSystemAdmins
    ? [...new Set([...roleList, 'admin', 'platform_admin'])]
    : roleList;

  let q = supabase.from('users').select('id, company_id, role').in('role', queryRoles);
  if (activeOnly) q = q.eq('is_active', true);
  const { data: users, error } = await q;
  if (error) {
    console.warn('[getCompanyScopedRoleUserIds]', error.message);
    return [];
  }

  const ids = new Set();
  for (const u of users || []) {
    if (!u?.id) continue;
    if (includeSystemAdmins && isGlobalNotificationViewer(u)) {
      ids.add(u.id);
      continue;
    }
    if (!roleSet.has(String(u.role || ''))) continue;
    if (cid && String(u.company_id || '') === cid) ids.add(u.id);
  }

  if (cid) {
    try {
      const { data: links } = await supabase
        .from('user_companies')
        .select('user_id')
        .eq('company_id', cid);
      const linkIds = [...new Set((links || []).map((r) => r.user_id).filter(Boolean))];
      if (linkIds.length) {
        let lq = supabase.from('users').select('id, company_id, role').in('role', roleList).in('id', linkIds);
        if (activeOnly) lq = lq.eq('is_active', true);
        const { data: linked } = await lq;
        for (const u of linked || []) {
          if (!u?.id) continue;
          if (isGlobalNotificationViewer(u)) {
            ids.add(u.id);
            continue;
          }
          // Chỉ user chưa gắn công ty gốc (NV xưởng/dept) — không kéo admin công ty khác.
          if (!normalizeCompanyId(u.company_id)) ids.add(u.id);
        }
      }
    } catch (e) {
      console.warn('[getCompanyScopedRoleUserIds] user_companies:', e.message || e);
    }
  }

  return [...ids];
}

/**
 * Admin nhận TB theo đúng công ty (admin công ty + tùy chọn admin hệ thống).
 * Tránh broadcast mọi role=admin toàn hệ thống (admin Metalla nhận deal NextGo).
 * @param {string|null|undefined} companyId
 * @param {{ includeSystemAdmins?: boolean, activeOnly?: boolean }} [opts]
 * @returns {Promise<string[]>}
 */
async function getCompanyScopedAdminIds(companyId, opts = {}) {
  return getCompanyScopedRoleUserIds(companyId, ['admin'], opts);
}

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

  // Tắt chuông: vẫn lưu TB trong danh sách, chỉ không đẩy toast/push ra ngoài màn hình
  let suppressExternal = false;
  if (type === 'comment_added') {
    suppressExternal = await isCommentMutedForUser(userId, entityType, entityId, metadata);
  } else if (type === 'messenger_chat') {
    suppressExternal = await isMessengerMutedForUser(userId, entityType, entityId, metadata);
  }

  const insert = {
    user_id: userId,
    type,
    title,
    message,
    entity_type: entityType,
    entity_id: entityId,
  };

  if (metadata) insert.metadata = withCompanyMeta(metadata, metadata.company_id || metadata.companyId);

  const { data, error } = await supabase
    .from('notifications')
    .insert(insert)
    .select()
    .single();

  const pushFn = req.app?.get('pushNotification');
  if (error) {
    console.error('Notification insert error:', error.message);
    // Vẫn đẩy socket + FCM với payload dựng sẵn — tránh mất thông báo khi DB lỗi tạm.
    // Không đẩy khi đang tắt chuông (suppressExternal).
    if (!suppressExternal && typeof pushFn === 'function') {
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

  // Socket.IO + mobile push — bỏ qua khi user đã tắt chuông cho entity này
  if (!suppressExternal && typeof pushFn === 'function' && data) {
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
  if (!unique.length) return [];
  const settled = await Promise.all(
    unique.map((uid) => createNotification(req, uid, type, title, message, entityType, entityId, metadata)),
  );
  return settled.filter(Boolean);
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
  getCompanyScopedAdminIds,
  getCompanyScopedRoleUserIds,
  getSystemAdminUserIds,
  withCompanyMeta,
  notificationVisibleToViewer,
  filterNotificationsForViewer,
  isGlobalNotificationViewer,
};
