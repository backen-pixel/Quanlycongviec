/**
 * Zalo OA OpenAPI v3 — webhook, tin tư vấn (CS), profile
 * @see https://developers.zalo.me/docs/official-account/webhook/tong-quan
 * @see https://developers.zalo.me/docs/official-account/tin-nhan/tin-tu-van/gui-tin-tu-van-dang-van-ban
 */

const crypto = require('crypto');

const USER_SEND_EVENTS = new Set([
  'user_send_text',
  'user_send_image',
  'user_send_link',
  'user_send_audio',
  'user_send_video',
  'user_send_sticker',
  'user_send_location',
  'user_send_file',
  'user_send_gif',
  'user_send_business_card',
  'user_send_contact',
]);

const OA_ECHO_EVENTS = new Set(['oa_send_text', 'oa_send_image', 'oa_send_file', 'oa_send_sticker']);

function isUserSendEvent(eventName) {
  return USER_SEND_EVENTS.has(String(eventName || '').trim());
}

function isOaEchoEvent(eventName) {
  return OA_ECHO_EVENTS.has(String(eventName || '').trim()) || String(eventName || '').startsWith('oa_send_');
}

/**
 * Xác thực X-ZEvent-Signature
 * mac = SHA256(appId + rawBody + timestamp + OAsecretKey)
 */
function verifyZaloWebhookSignature({ appId, secretKey, rawBody, timestamp, signatureHeader }) {
  if (!appId || !secretKey || !signatureHeader) return false;
  const rawBodyStr = typeof rawBody === 'string' ? rawBody : String(rawBody || '');
  const ts = String(timestamp ?? '');
  const expectedSha256 = crypto
    .createHash('sha256')
    .update(appId + rawBodyStr + ts + secretKey)
    .digest('hex');
  const expectedHmac = crypto.createHmac('sha256', secretKey).update(rawBodyStr).digest('hex');
  const provided = String(signatureHeader).replace(/^mac=/i, '').trim().toLowerCase();
  return provided === expectedSha256.toLowerCase() || provided === expectedHmac.toLowerCase();
}

function mapEventToMessageType(eventName) {
  const e = String(eventName || '');
  if (e === 'user_send_text' || e === 'oa_send_text') return 'text';
  if (e.includes('_image')) return 'image';
  if (e.includes('_video')) return 'video';
  if (e.includes('_audio')) return 'audio';
  if (e.includes('_file')) return 'file';
  if (e.includes('_sticker')) return 'sticker';
  if (e.includes('_location')) return 'location';
  if (e.includes('_link')) return 'link';
  if (e.includes('_gif')) return 'gif';
  if (e.includes('_contact') || e.includes('_business_card')) return 'contact';
  return 'unknown';
}

/** Trích nội dung + attachment từ payload webhook Zalo */
function parseZaloWebhookMessage(body) {
  const eventName = String(body?.event_name || '').trim();
  const msg = body?.message && typeof body.message === 'object' ? body.message : {};
  const attachments = Array.isArray(msg.attachments) ? msg.attachments : [];
  const att0 = attachments[0] || null;

  let content = msg.text != null ? String(msg.text) : '';
  let attachmentUrl = att0?.payload?.url || att0?.url || null;
  let attachmentType = att0?.type || null;

  if (!content && attachments.length) {
    if (eventName.includes('_image')) content = '[Hình ảnh]';
    else if (eventName.includes('_file')) content = '[Tệp]';
    else if (eventName.includes('_sticker')) content = '[Sticker]';
    else if (eventName.includes('_location')) content = '[Vị trí]';
    else if (eventName.includes('_video')) content = '[Video]';
    else if (eventName.includes('_audio')) content = '[Âm thanh]';
    else if (eventName.includes('_link')) content = msg.text || '[Liên kết]';
    else content = `[${mapEventToMessageType(eventName)}]`;
  }

  const senderId = body?.sender?.id != null ? String(body.sender.id) : '';
  const recipientId = body?.recipient?.id != null ? String(body.recipient.id) : '';
  const oaId = isOaEchoEvent(eventName) ? senderId : recipientId;
  const partnerUserId = isOaEchoEvent(eventName) ? recipientId : senderId;

  return {
    eventName,
    oaId,
    partnerUserId,
    msgId: msg.msg_id != null ? String(msg.msg_id) : null,
    content,
    attachmentUrl,
    attachmentType,
    messageType: mapEventToMessageType(eventName),
    isInbound: isUserSendEvent(eventName),
    isEcho: isOaEchoEvent(eventName),
    rawMessage: msg,
    attachments,
    timestamp: body?.timestamp,
    appId: body?.app_id != null ? String(body.app_id) : null,
  };
}

async function fetchZaloUserProfile(accessToken, userId) {
  if (!accessToken || !userId) return null;
  const dataParam = encodeURIComponent(JSON.stringify({ user_id: String(userId) }));
  const url = `https://openapi.zalo.me/v3.0/oa/getprofile?data=${dataParam}`;
  const res = await fetch(url, { headers: { access_token: accessToken } });
  let data;
  try {
    data = await res.json();
  } catch {
    return null;
  }
  if (data?.error !== 0 || !data?.data) return null;
  const p = data.data;
  return {
    user_id: p.user_id != null ? String(p.user_id) : String(userId),
    display_name: p.display_name || p.user_id || null,
    avatar: p.avatar || null,
    user_gender: p.user_gender,
    user_id_by_app: p.user_id_by_app,
  };
}

async function sendZaloCsTextMessage({ accessToken, userId, text }) {
  const uid = userId != null ? String(userId).trim() : '';
  const messageText = text != null ? String(text).trim() : '';
  if (!accessToken || !uid || !messageText) {
    return { ok: false, error: 'config', message: 'Thiếu access_token, user_id hoặc nội dung' };
  }

  const res = await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      access_token: accessToken,
    },
    body: JSON.stringify({
      recipient: { user_id: uid },
      message: { text: messageText },
    }),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: 'parse', message: 'Không đọc được JSON từ Zalo', status: res.status };
  }

  const zaloErr = data?.error != null ? Number(data.error) : null;
  const ok = zaloErr === 0;
  return {
    ok,
    status: res.status,
    data,
    message: data?.message,
    zalo_error: zaloErr,
    msg_id: data?.data?.message_id || data?.data?.msg_id || null,
  };
}

module.exports = {
  USER_SEND_EVENTS,
  isUserSendEvent,
  isOaEchoEvent,
  verifyZaloWebhookSignature,
  mapEventToMessageType,
  parseZaloWebhookMessage,
  fetchZaloUserProfile,
  sendZaloCsTextMessage,
};
