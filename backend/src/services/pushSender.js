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
      return [];
    }
    throw error;
  }
  return (data || []).filter((r) => r.platform === 'expo' && r.token);
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

    const rows = await fetchUserTokens(userId);
    if (!rows.length) return;

    const payload = buildPushPayload(notification);
    const messages = rows.map((r) => ({
      to: r.token,
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
  } catch (e) {
    console.warn('[pushSender]', e.message || e);
  }
}

module.exports = {
  sendMobilePush,
  buildPushPayload,
};
