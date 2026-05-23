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
  return type === 'messenger_chat' || type === 'lead_chat' || type === 'department_chat';
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
  } else if (notification.type === 'department_chat') {
    const sender = typeof meta.sender_name === 'string' ? meta.sender_name : '';
    const dept = typeof meta.dept_name === 'string' ? meta.dept_name
      : (typeof meta.group_name === 'string' ? meta.group_name : title);
    title = dept || 'Chat phòng ban';
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
  const rows = (data || []).filter((r) => r.token);
  return {
    expo: rows.filter((r) => r.platform === 'expo'),
    fcm: rows.filter((r) => r.platform === 'fcm'),
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
 * FCM HTTP v1 — gửi data-only push để wake `OverlayBubbleService` trên Android
 * kể cả khi app đã kill. Yêu cầu env:
 *  - `FCM_SA_JSON`  : JSON service-account (Firebase project) một dòng
 *  - hoặc `FCM_PROJECT_ID` + `FCM_PRIVATE_KEY` + `FCM_CLIENT_EMAIL` để build từ rời rạc.
 *
 * Không bắt buộc — nếu thiếu env thì hàm này im lặng return (Expo nhánh vẫn chạy).
 */
let cachedFcmAuth = null; // { accessToken, exp, projectId }

function loadFcmCredentials() {
  if (process.env.FCM_SA_JSON) {
    try {
      const sa = JSON.parse(process.env.FCM_SA_JSON);
      return {
        projectId: sa.project_id,
        clientEmail: sa.client_email,
        privateKey: sa.private_key,
      };
    } catch {
      return null;
    }
  }
  const projectId = process.env.FCM_PROJECT_ID;
  const clientEmail = process.env.FCM_CLIENT_EMAIL;
  const privateKey = (process.env.FCM_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

async function getFcmAccessToken() {
  if (cachedFcmAuth && cachedFcmAuth.exp - Date.now() > 60000) return cachedFcmAuth;
  const creds = loadFcmCredentials();
  if (!creds) return null;
  // Lazy-require: chỉ load khi cần FCM, tránh bắt buộc dependency
  let jwt;
  try { jwt = require('jsonwebtoken'); }
  catch { console.warn('[pushSender] FCM cần "jsonwebtoken" — npm i jsonwebtoken'); return null; }

  const now = Math.floor(Date.now() / 1000);
  const token = jwt.sign(
    {
      iss: creds.clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    },
    creds.privateKey,
    { algorithm: 'RS256' },
  );
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${token}`,
  });
  if (!res.ok) {
    console.warn('[pushSender] FCM OAuth error:', res.status);
    return null;
  }
  const json = await res.json();
  cachedFcmAuth = {
    accessToken: json.access_token,
    exp: Date.now() + (json.expires_in - 60) * 1000,
    projectId: creds.projectId,
  };
  return cachedFcmAuth;
}

function buildFcmDataPayload(notification) {
  const meta = (notification.metadata && typeof notification.metadata === 'object')
    ? notification.metadata
    : {};
  const chat = isChatType(notification.type);
  const senderName = String(meta.sender_name || '');
  const senderAvatar = String(meta.sender_avatar || '');
  const groupName = String(meta.group_name || notification.title || '');
  const bubbleKey = String(meta.bubble_key || (notification.entity_id ? `${notification.entity_type || 'lead'}:${notification.entity_id}` : ''));
  const messageId = String(meta.message_id || notification.message_id || '');
  const senderId = String(meta.sender_id || meta.user_id || '');
  const messageType = String(meta.message_type || '');
  return {
    bubble_wake: chat ? '1' : '0',
    type: String(notification.type || ''),
    bubble_key: bubbleKey,
    title: groupName,
    sender_name: senderName,
    sender_avatar: senderAvatar,
    message: String(notification.message || '').slice(0, 500),
    message_id: messageId,
    sender_id: senderId,
    message_type: messageType,
    notif_id: String(notification.id || ''),
    entity_type: String(notification.entity_type || ''),
    entity_id: String(notification.entity_id || ''),
  };
}

async function sendFcmDataOnly(tokens, notification) {
  if (!tokens.length) return;
  const auth = await getFcmAccessToken();
  if (!auth) return;
  const data = buildFcmDataPayload(notification);
  const url = `https://fcm.googleapis.com/v1/projects/${auth.projectId}/messages:send`;
  for (const row of tokens) {
    try {
      const body = {
        message: {
          token: row.token,
          data,
          android: {
            priority: 'HIGH',
            ttl: '60s',
            // collapseKey: FCM dedupe pending message per-conversation khi máy offline lâu.
            // Khi reconnect chỉ deliver message cuối cùng của mỗi conversation.
            ...(data.bubble_key ? { collapse_key: `chat_${data.bubble_key}` } : {}),
          },
        },
      };
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        const status = r.status;
        if (status === 404 || /UNREGISTERED|NOT_FOUND/i.test(txt)) {
          await supabase.from('push_device_tokens').delete().eq('token', row.token).catch(() => {});
        } else {
          console.warn('[pushSender] FCM error:', status, txt.slice(0, 200));
        }
      }
    } catch (e) {
      console.warn('[pushSender] FCM send error:', e.message || e);
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
    const expoRows = rows.expo;
    const fcmRows = rows.fcm;
    if (!expoRows.length && !fcmRows.length) return;

    const payload = buildPushPayload(notification);
    const messages = expoRows.map((r) => ({
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

    // Song song: FCM data-only để wake bubble overlay (Android)
    if (fcmRows.length && isChatType(notification.type)) {
      await sendFcmDataOnly(fcmRows, notification);
    }
  } catch (e) {
    console.warn('[pushSender]', e.message || e);
  }
}

module.exports = {
  sendMobilePush,
  buildPushPayload,
  sendFcmDataOnly,
};
