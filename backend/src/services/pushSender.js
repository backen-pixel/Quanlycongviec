/**
 * Gửi push notification tới thiết bị mobile (Expo Push API).
 * Cần migration database/204_push_device_tokens.sql
 */

const fs = require('fs');
const path = require('path');
const { supabase } = require('../config/supabase');
const {
  isRestTableMissingError,
  probePushTokensTablePg,
  fetchUserTokensPg,
  deleteTokenByValuePg,
} = require('../helpers/pushDeviceTokensPg');
const { isNotificationAllowedForUser } = require('../helpers/notificationPrefsUser');
const { isExpiryDeadlineNotificationType } = require('../helpers/notificationOperationalFilter');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK_SIZE = 100;

// ⚠️ Phải khớp với hằng số ở crm-mobile/src/lib/notificationChannels.ts
const CHANNEL_CHAT = 'crm_chat';
const CHANNEL_SYSTEM = 'crm_system_tray_v3';
const CHANNEL_CALL = 'crm_call';
const CHANNEL_SX_COMMENTS = 'sx_comments';

function isChatType(type) {
  return type === 'messenger_chat' || type === 'lead_chat' || type === 'department_chat';
}

function isIncomingCallType(type) {
  return type === 'incoming_call';
}

function isProductionCommentNotification(notification) {
  if (String(notification?.type || '') !== 'comment_added') return false;
  const meta = notification.metadata && typeof notification.metadata === 'object'
    ? notification.metadata
    : {};
  return String(meta.ecosystem_module_key || '') === 'production';
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
  } else if (isIncomingCallType(notification.type)) {
    const fromName = typeof meta.from_name === 'string' ? meta.from_name : 'Ai đó';
    const isGroup = meta.is_group === true || meta.is_group === 'true';
    const groupName = typeof meta.group_name === 'string' ? meta.group_name : 'Nhóm';
    title = isGroup ? 'Cuộc gọi nhóm' : 'Cuộc gọi đến';
    body = isGroup
      ? `${fromName} mời bạn tham gia «${groupName}»`
      : `${fromName} đang gọi bạn`;
  }

  const chat = isChatType(notification.type);
  const isCall = isIncomingCallType(notification.type);
  const isSxComment = isProductionCommentNotification(notification);
  const channelId = isCall ? CHANNEL_CALL : chat ? CHANNEL_CHAT : isSxComment ? CHANNEL_SX_COMMENTS : CHANNEL_SYSTEM;

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
      ...(isCall && meta && typeof meta === 'object'
        ? {
            call_id: meta.call_id || meta.callId,
            kind: meta.kind || 'audio',
            from_user_id: meta.from_user_id || meta.fromUserId,
            from_name: meta.from_name || meta.fromName,
            is_group: meta.is_group ? 'true' : 'false',
            group_id: meta.group_id || meta.groupId || '',
            group_name: meta.group_name || meta.groupName || '',
          }
        : {}),
    },
    channelId,
    priority: isCall ? 'high' : 'high',
    sound: 'default',
    _displayInForeground: true,
    badge: notification.badge_count || undefined,
    ttl: isCall ? 60 : chat ? 60 * 60 * 24 : 60 * 60 * 24 * 7,
    interruptionLevel: isCall ? 'time-sensitive' : chat ? 'time-sensitive' : 'active',
  };
}

async function fetchUserTokens(userId) {
  const empty = { expo: [], fcm: [] };
  const { data, error } = await supabase
    .from('push_device_tokens')
    .select('token, platform')
    .eq('user_id', userId);
  if (error) {
    if (isRestTableMissingError(error)) {
      const pgRows = await fetchUserTokensPg(userId);
      if (pgRows) return pgRows;
      console.error(
        '[pushSender] Bảng push_device_tokens — PostgREST chưa reload schema. Chạy: NOTIFY pgrst, \'reload schema\';',
      );
      return empty;
    }
    throw error;
  }
  const rows = (data || []).filter((r) => r.token);
  return {
    expo: rows.filter((r) => r.platform === 'expo'),
    fcm: rows.filter((r) => r.platform === 'fcm'),
  };
}

/** Kiểm tra DB + FCM credentials (diagnostic). */
async function getPushInfraStatus(userId) {
  const creds = loadFcmCredentials();
  const { error: probeErr } = await supabase.from('push_device_tokens').select('id').limit(1);
  let tableOk = !probeErr;
  if (probeErr && isRestTableMissingError(probeErr)) {
    tableOk = await probePushTokensTablePg();
    if (!tableOk) {
      return {
        tableOk: false,
        fcmConfigured: !!creds,
        fcmProjectId: creds?.projectId || null,
        tokens: { expo: 0, fcm: 0 },
        error: 'push_device_tokens table missing or schema cache stale',
        hint: 'Chạy NOTIFY pgrst, \'reload schema\'; trên Supabase SQL Editor',
      };
    }
  } else if (probeErr) {
    throw probeErr;
  }
  const rows = userId ? await fetchUserTokens(userId) : { expo: [], fcm: [] };
  return {
    tableOk: true,
    fcmConfigured: !!creds,
    fcmProjectId: creds?.projectId || null,
    tokens: { expo: rows.expo.length, fcm: rows.fcm.length },
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
let fcmCredentialsHint = null;

function saJsonToCreds(sa) {
  if (!sa?.project_id || !sa?.client_email || !sa?.private_key) {
    throw new Error('JSON thiếu project_id / client_email / private_key');
  }
  return {
    projectId: sa.project_id,
    clientEmail: sa.client_email,
    privateKey: sa.private_key,
  };
}

function readFcmSaFile(abs) {
  const raw = fs.readFileSync(abs, 'utf8');
  return saJsonToCreds(JSON.parse(raw));
}

function loadFcmCredentials() {
  fcmCredentialsHint = null;
  const fromEnv = process.env.FCM_SA_JSON;
  if (fromEnv) {
    try {
      return saJsonToCreds(JSON.parse(fromEnv));
    } catch (e) {
      fcmCredentialsHint = `FCM_SA_JSON không parse được: ${e.message || e}`;
      console.warn('[pushSender]', fcmCredentialsHint);
    }
  }
  const fileCandidates = [];
  const jsonPath = process.env.FCM_SA_JSON_PATH;
  if (jsonPath) {
    fileCandidates.push(path.isAbsolute(jsonPath)
      ? jsonPath
      : path.join(__dirname, '../../', jsonPath));
  }
  fileCandidates.push(path.join(__dirname, '../../secrets/firebase-sa.json'));
  for (const abs of fileCandidates) {
    try {
      if (!fs.existsSync(abs)) continue;
      return readFcmSaFile(abs);
    } catch (e) {
      fcmCredentialsHint = `FCM file ${abs}: ${e.message || e}`;
      console.warn('[pushSender]', fcmCredentialsHint);
    }
  }
  const projectId = process.env.FCM_PROJECT_ID;
  const clientEmail = process.env.FCM_CLIENT_EMAIL;
  const privateKey = (process.env.FCM_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey };
  }
  if (!fcmCredentialsHint) {
    fcmCredentialsHint = 'Thiếu FCM_SA_JSON, FCM_SA_JSON_PATH, secrets/firebase-sa.json hoặc FCM_PROJECT_ID + FCM_CLIENT_EMAIL + FCM_PRIVATE_KEY';
  }
  return null;
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
  const groupName = String(meta.group_name || meta.dept_name || notification.title || '');
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

function isExpoPushToken(token) {
  return typeof token === 'string' && token.startsWith('ExponentPushToken[');
}

function pickFcmTokens(rows) {
  const list = rows.fcm || [];
  const seen = new Set(list.map((r) => r.token));
  // Gộp token native lưu nhầm platform expo (hoặc ngược lại)
  for (const row of rows.expo || []) {
    if (!row?.token || isExpoPushToken(row.token)) continue;
    if (!seen.has(row.token)) {
      list.push(row);
      seen.add(row.token);
    }
  }
  return list;
}

async function sendFcmIncomingCall(tokens, notification) {
  if (!tokens.length) return;
  const auth = await getFcmAccessToken();
  if (!auth) {
    console.warn('[pushSender] incoming_call: thiếu FCM credentials —', fcmCredentialsHint || 'FCM_SA_JSON');
    return;
  }
  const meta = (notification.metadata && typeof notification.metadata === 'object')
    ? notification.metadata
    : {};
  const payload = buildPushPayload(notification);
  const url = `https://fcm.googleapis.com/v1/projects/${auth.projectId}/messages:send`;
  const data = {
    type: 'incoming_call',
    call_id: String(meta.call_id || ''),
    kind: String(meta.kind || 'audio'),
    from_user_id: String(meta.from_user_id || ''),
    from_name: String(meta.from_name || ''),
    is_group: meta.is_group ? 'true' : 'false',
    group_id: String(meta.group_id || ''),
    group_name: String(meta.group_name || ''),
    title: payload.title,
    body: payload.body,
  };
  for (const row of tokens) {
    try {
      // Chỉ gửi data — app kill → CrmFirebaseMessagingService.onMessageReceived → hiện cuộc gọi.
      const body = {
        message: {
          token: row.token,
          data,
          android: {
            priority: 'HIGH',
            ttl: '60s',
            ...(data.call_id ? { collapse_key: `call_${data.call_id}` } : {}),
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
        if (r.status === 404 || /UNREGISTERED|NOT_FOUND/i.test(txt)) {
          await supabase.from('push_device_tokens').delete().eq('token', row.token).catch(() => {});
        } else {
          console.warn('[pushSender] FCM call error:', r.status, txt.slice(0, 200));
        }
      } else if (isIncomingCallType(notification.type)) {
        console.log('[pushSender] FCM incoming_call sent to token', row.token.slice(0, 12) + '…');
      }
    } catch (e) {
      console.warn('[pushSender] FCM call send error:', e.message || e);
    }
  }
}

/** FCM hiển thị notification trên thanh hệ thống (bình luận xưởng SX, v.v.). */
async function sendFcmTrayNotification(tokens, notification) {
  if (!tokens.length) return;
  const auth = await getFcmAccessToken();
  if (!auth) return;
  const payload = buildPushPayload(notification);
  const meta = (notification.metadata && typeof notification.metadata === 'object')
    ? notification.metadata
    : {};
  const url = `https://fcm.googleapis.com/v1/projects/${auth.projectId}/messages:send`;
  for (const row of tokens) {
    try {
      const body = {
        message: {
          token: row.token,
          notification: {
            title: payload.title,
            body: payload.body,
          },
          data: {
            type: String(notification.type || ''),
            notif_id: String(notification.id || ''),
            entity_type: String(notification.entity_type || ''),
            entity_id: String(notification.entity_id || ''),
            metadata: JSON.stringify(meta),
            channelId: payload.channelId,
          },
          android: {
            priority: 'HIGH',
            ttl: `${payload.ttl || 86400}s`,
            notification: {
              channel_id: payload.channelId,
              sound: 'default',
            },
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
        if (r.status === 404 || /UNREGISTERED|NOT_FOUND/i.test(txt)) {
          await supabase.from('push_device_tokens').delete().eq('token', row.token).catch(() => {});
        } else {
          console.warn('[pushSender] FCM tray error:', r.status, txt.slice(0, 200));
        }
      }
    } catch (e) {
      console.warn('[pushSender] FCM tray send error:', e.message || e);
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
  const isCall = isIncomingCallType(notification.type);

  try {
    if (!isCall) {
      const allowed = await isNotificationAllowedForUser(
        userId,
        notification.type,
        notification.entity_type,
        notification.metadata,
      );
      if (!allowed) return;
    }

    const rows = await fetchUserTokens(userId);
    const expoRows = rows.expo.filter((r) => isExpoPushToken(r.token));
    const fcmRows = isCall ? pickFcmTokens(rows) : rows.fcm;
    if (!expoRows.length && !fcmRows.length) {
      if (isCall) console.warn('[pushSender] incoming_call: no device tokens for user', userId);
      return;
    }
    if (isCall && !fcmRows.length) {
      console.warn('[pushSender] incoming_call: no FCM token for user', userId, '— chỉ gửi Expo (cần EAS projectId)');
    }

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

    // FCM: cuộc gọi đến (notification hiển thị) hoặc chat (data-only wake bubble)
    if (fcmRows.length && isCall) {
      await sendFcmIncomingCall(fcmRows, notification);
    } else if (fcmRows.length && isChatType(notification.type)) {
      await sendFcmDataOnly(fcmRows, notification);
    } else if (fcmRows.length && isProductionCommentNotification(notification)) {
      await sendFcmTrayNotification(fcmRows, notification);
    }
  } catch (e) {
    console.warn('[pushSender]', e.message || e);
  }
}

module.exports = {
  sendMobilePush,
  buildPushPayload,
  sendFcmDataOnly,
  getPushInfraStatus,
  sendFcmIncomingCall,
};
