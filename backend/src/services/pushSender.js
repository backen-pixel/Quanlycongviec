/**
 * Gửi push notification tới thiết bị mobile (Expo Push API).
 * Cần migration database/204_push_device_tokens.sql
 */

const { supabase } = require('../config/supabase');
const { isNotificationAllowedForUser } = require('../helpers/notificationPrefsUser');
const { isExpiryDeadlineNotificationType } = require('../helpers/notificationOperationalFilter');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK_SIZE = 100;

// ⚠️ Phải khớp với hằng số ở crm-mobile/src/lib/appPermissions.ts
const CHANNEL_CHAT = 'crm_chat';
const CHANNEL_SYSTEM = 'crm_system_tray_v3';

function isChatType(type) {
  return type === 'messenger_chat' || type === 'lead_chat';
}

function buildPushPayload(notification) {
  const meta = notification.metadata && typeof notification.metadata === 'object'
    ? notification.metadata
    : {};
  let title = notification.title || 'TuBep CRM';
  let body = notification.message || '';

  if (notification.type === 'messenger_chat') {
    const sender = typeof meta.sender_name === 'string' ? meta.sender_name
      : typeof meta.sender === 'string' ? meta.sender : '';
    const group = typeof meta.group_name === 'string' ? meta.group_name : title;
    title = group;
    body = sender ? `${sender}: ${body}` : body;
  } else if (notification.type === 'lead_chat') {
    const sender = typeof meta.sender_name === 'string' ? meta.sender_name : '';
    title = title || 'Lead chat';
    body = sender ? `${sender}: ${body}` : body;
  }

  const chat = isChatType(notification.type);
  const channelId = chat ? CHANNEL_CHAT : CHANNEL_SYSTEM;

  return {
    title: String(title).slice(0, 120),
    body: String(body).slice(0, 240),
    data: {
      notifId: notification.id,
      type: notification.type,
      entity_type: notification.entity_type,
      entity_id: notification.entity_id,
      metadata: notification.metadata,
      channelId,
    },
    channelId,
    priority: 'high',
    sound: 'default',
    _displayInForeground: true,
    badge: notification.badge_count || undefined,
    ttl: chat ? 60 * 60 * 24 : 60 * 60 * 24 * 7,
    interruptionLevel: chat ? 'time-sensitive' : 'active',
  };
}

async function fetchUserTokens(userId) {
  const { data, error } = await supabase
    .from('push_device_tokens')
    .select('token, platform')
    .eq('user_id', userId);
  if (error) {
    if (error.code === '42P01' || String(error.message || '').includes('push_device_tokens')) {
      return { expo: [], fcm: [] };
    }
    throw error;
  }
  const all = data || [];
  return {
    expo: all.filter((r) => r.platform === 'expo' && r.token).map((r) => r.token),
    fcm: all.filter((r) => r.platform === 'fcm' && r.token).map((r) => r.token),
  };
}

async function sendExpoChunk(messages) {
  if (!messages.length) return;
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const accessToken = process.env.EXPO_ACCESS_TOKEN;
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(messages),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    console.warn('[pushSender] Expo API error:', res.status, txt.slice(0, 200));
    return;
  }
  const json = await res.json().catch(() => ({}));
  const tickets = json?.data;
  if (!Array.isArray(tickets)) return;
  for (let i = 0; i < tickets.length; i++) {
    const t = tickets[i];
    if (t?.status === 'error' && t?.details?.error === 'DeviceNotRegistered') {
      const badToken = messages[i]?.to;
      if (badToken) {
        await supabase.from('push_device_tokens').delete().eq('token', badToken).catch(() => {});
      }
    }
  }
}

/**
 * FCM HTTP Legacy API (server key). Gửi data-only payload — Android native
 * (CrmFirebaseMessagingService) tự tạo bong bóng + tray notification, không
 * để FCM tự hiện tray để tránh trùng với Expo Push.
 *
 * Cần env FCM_SERVER_KEY (Firebase Console → Project Settings → Cloud Messaging).
 * Nếu không có FCM_SERVER_KEY thì im lặng bỏ qua (Expo Push vẫn chạy).
 */
async function sendFcmDataOnly(notification, fcmTokens) {
  const serverKey = process.env.FCM_SERVER_KEY;
  if (!serverKey || !Array.isArray(fcmTokens) || !fcmTokens.length) return;

  const payload = buildPushPayload(notification);
  // FCM data string-only requirement.
  const dataStr = {};
  for (const [k, v] of Object.entries(payload.data || {})) {
    if (v == null) continue;
    dataStr[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  dataStr.title = payload.title;
  dataStr.body = payload.body;
  if (payload.channelId) dataStr.channelId = payload.channelId;

  // FCM giới hạn 1000 tokens / request
  const CHUNK = 500;
  for (let i = 0; i < fcmTokens.length; i += CHUNK) {
    const slice = fcmTokens.slice(i, i + CHUNK);
    try {
      const res = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          Authorization: `key=${serverKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          registration_ids: slice,
          priority: 'high',
          data: dataStr,
          android: { priority: 'high', ttl: '86400s' },
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        console.warn('[pushSender] FCM error:', res.status, txt.slice(0, 200));
        continue;
      }
      const json = await res.json().catch(() => ({}));
      const results = json?.results;
      if (Array.isArray(results)) {
        for (let k = 0; k < results.length; k++) {
          const r = results[k];
          if (r?.error === 'NotRegistered' || r?.error === 'InvalidRegistration') {
            const bad = slice[k];
            if (bad) {
              await supabase.from('push_device_tokens').delete().eq('token', bad).catch(() => {});
            }
          }
        }
      }
    } catch (e) {
      console.warn('[pushSender] FCM exception:', e.message || e);
    }
  }
}

/**
 * Gửi push mobile cho user (chủ yếu chat khi app kill).
 * @param {string} userId
 * @param {object} notification — row notifications
 */
async function sendMobilePush(userId, notification) {
  if (!userId || !notification) return;
  if (isExpiryDeadlineNotificationType(notification.type)) return;

  try {
    const allowed = await isNotificationAllowedForUser(
      userId,
      notification.type,
      notification.entity_type,
      notification.metadata,
    );
    if (!allowed) return;

    const tokens = await fetchUserTokens(userId);
    if (!tokens.expo.length && !tokens.fcm.length) return;

    const payload = buildPushPayload(notification);

    // 1) Expo Push — tray notification cho mọi platform
    if (tokens.expo.length) {
      const messages = tokens.expo.map((tok) => ({
        to: tok,
        title: payload.title,
        body: payload.body,
        data: payload.data,
        channelId: payload.channelId,
        priority: payload.priority,
        sound: payload.sound,
        _displayInForeground: payload._displayInForeground,
        badge: payload.badge,
        ttl: payload.ttl,
        ...(payload.interruptionLevel ? { _interruptionLevel: payload.interruptionLevel } : {}),
      }));
      for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
        await sendExpoChunk(messages.slice(i, i + CHUNK_SIZE));
      }
    }

    // 2) FCM data-only — Android native trigger overlay bubble khi app killed
    if (tokens.fcm.length) {
      await sendFcmDataOnly(notification, tokens.fcm);
    }
  } catch (e) {
    console.warn('[pushSender]', e.message || e);
  }
}

module.exports = {
  sendMobilePush,
  sendFcmDataOnly,
  buildPushPayload,
};
