/**
 * Zalo cá nhân — ghi tin nhắn từ bridge vào hộp thư CRM.
 *
 * Khác webhook OA ở đúng một điểm: chỉ hội thoại ĐÃ GẮN LEAD mới được lưu
 * nội dung. Hội thoại chưa gắn chỉ ghi metadata (tên + thời điểm) vào
 * zalo_personal_pending_threads để nhân viên bấm gắn lead; chat riêng tư
 * không bao giờ nằm trong zalo_messages.
 */
const { supabase } = require('../config/supabase');
const { extractContactInfo } = require('./facebookPhoneExtract');
const { formatVnPhoneLocal0From84, normalizeVnPhoneTo84 } = require('./zaloOa');
const { statusForNewMessage } = require('./zaloAttachmentCopy');

const MESSAGE_TYPES = new Set([
  'text', 'image', 'video', 'audio', 'file',
  'location', 'sticker', 'link', 'gif', 'contact', 'unknown',
]);

const _seenMsgIds = new Set();
const SEEN_MAX = 5000;

function acquireMsgLock(msgId) {
  if (!msgId) return true;
  if (_seenMsgIds.has(msgId)) return false;
  _seenMsgIds.add(msgId);
  if (_seenMsgIds.size > SEEN_MAX) {
    const drop = _seenMsgIds.values().next().value;
    _seenMsgIds.delete(drop);
  }
  return true;
}

function normalizeMessageType(raw) {
  const t = String(raw || 'text').toLowerCase();
  return MESSAGE_TYPES.has(t) ? t : 'unknown';
}

function extractLocalPhone(text) {
  if (!text || text.length <= 5) return null;
  const { phone } = extractContactInfo(text);
  if (!phone) return null;
  return formatVnPhoneLocal0From84(normalizeVnPhoneTo84(phone)) || null;
}

/**
 * Dò SĐT → lead. Lead có SĐT của khách (customers.phone), và SĐT đó cũng là
 * số Zalo, nên khi biết số của người nhắn là khớp được ngay — không tốn lượt
 * tra cứu nào phía Zalo.
 *
 * Chọn lead mới cập nhật gần nhất khi một khách có nhiều lead.
 */
async function findLeadByPhone(phone) {
  const local = formatVnPhoneLocal0From84(normalizeVnPhoneTo84(phone));
  if (!local) return null;

  const { data: customers } = await supabase
    .from('customers')
    .select('id')
    .eq('phone', local)
    .limit(5);

  if (!customers?.length) return null;

  const { data: leads } = await supabase
    .from('crm_leads')
    .select('id, customer_id, updated_at')
    .in('customer_id', customers.map((c) => c.id))
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(1);

  return leads?.[0] || null;
}

/** Ghi nhận hội thoại chưa gắn lead — chỉ metadata, không nội dung. */
async function touchPendingThread(oaId, payload) {
  const threadId = String(payload.thread_id);
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from('zalo_personal_pending_threads')
    .select('id, message_count')
    .eq('oa_id', oaId)
    .eq('thread_id', threadId)
    .maybeSingle();

  if (existing) {
    await supabase.from('zalo_personal_pending_threads').update({
      display_name: payload.display_name || undefined,
      avatar_url: payload.avatar_url || undefined,
      message_count: (existing.message_count || 0) + 1,
      last_message_at: now,
      updated_at: now,
    }).eq('id', existing.id);
    return existing.id;
  }

  const { data: created } = await supabase
    .from('zalo_personal_pending_threads')
    .insert({
      oa_id: oaId,
      thread_id: threadId,
      thread_type: payload.thread_type === 'group' ? 'group' : 'user',
      display_name: payload.display_name || null,
      avatar_url: payload.avatar_url || null,
      phone: payload.phone ? (formatVnPhoneLocal0From84(normalizeVnPhoneTo84(payload.phone)) || null) : null,
      message_count: 1,
      last_message_at: now,
    })
    .select('id')
    .maybeSingle();

  return created?.id || null;
}

/**
 * @param {object} account  hàng zalo_oa_accounts (account_kind='personal')
 * @param {object} payload  { thread_id, thread_type, msg_id, direction, content,
 *                            message_type, attachment_url, attachment_type,
 *                            display_name, avatar_url, raw }
 * @param {object} io       Socket.IO server (có thể null)
 */
async function ingestPersonalMessage(account, payload, io) {
  const oaId = account.oa_id;
  const threadId = String(payload?.thread_id || '').trim();
  if (!threadId) return { skipped: true, reason: 'missing_thread_id' };

  const msgId = payload.msg_id ? `${oaId}:${payload.msg_id}` : null;
  if (!acquireMsgLock(msgId)) return { skipped: true, reason: 'duplicate_lock' };

  let { data: contact } = await supabase
    .from('zalo_contacts')
    .select('*')
    .eq('oa_id', oaId)
    .eq('user_id', threadId)
    .maybeSingle();

  // Chưa gắn lead nhưng bridge gửi kèm SĐT của người nhắn → thử khớp lead ngay.
  // Đây là đường khớp không tốn lượt tra cứu nào phía Zalo.
  if (!contact?.lead_id && payload.phone) {
    const lead = await findLeadByPhone(payload.phone);
    if (lead) {
      const local = formatVnPhoneLocal0From84(normalizeVnPhoneTo84(payload.phone));
      const { data: linked } = await supabase.from('zalo_contacts').upsert({
        oa_id: oaId,
        user_id: threadId,
        display_name: payload.display_name || contact?.display_name || `Zalo ${threadId.slice(-6)}`,
        avatar_url: payload.avatar_url || contact?.avatar_url || null,
        phone: local,
        lead_id: lead.id,
        customer_id: lead.customer_id || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'oa_id,user_id' }).select().maybeSingle();

      if (linked) {
        contact = linked;
        await supabase.from('zalo_personal_pending_threads')
          .update({ dismissed: true, updated_at: new Date().toISOString() })
          .eq('oa_id', oaId).eq('thread_id', threadId);
        console.log(`[Zalo cá nhân] Khớp ${local} → lead ${lead.id}`);
      }
    }
  }

  // Vẫn chưa gắn lead → không lưu nội dung, chỉ báo có hội thoại chờ gắn.
  if (!contact || !contact.lead_id) {
    await touchPendingThread(oaId, { ...payload, thread_id: threadId });
    return { skipped: true, reason: contact ? 'contact_without_lead' : 'thread_not_linked' };
  }

  if (msgId) {
    const { data: dup } = await supabase
      .from('zalo_messages').select('id').eq('zalo_msg_id', msgId).limit(1);
    if (dup?.length) return { skipped: true, reason: 'duplicate_db' };
  }

  const isInbound = payload.direction !== 'outbound';
  const content = payload.content != null ? String(payload.content) : '';
  const messageType = normalizeMessageType(payload.message_type);

  const { data: savedMsg, error: insertErr } = await supabase
    .from('zalo_messages')
    .upsert({
      contact_id: contact.id,
      lead_id: contact.lead_id,
      zalo_msg_id: msgId,
      event_name: isInbound ? 'personal_user_send_text' : 'personal_self_send_text',
      direction: isInbound ? 'inbound' : 'outbound',
      message_type: messageType,
      content,
      attachment_url: payload.attachment_url || null,
      attachment_type: payload.attachment_type || null,
      attachment_name: payload.attachment_name || null,
      attachment_size: payload.attachment_size || null,
      // Có đính kèm thì xếp hàng chép về kho công ty; vòng nền lo phần tải
      attachment_status: statusForNewMessage(messageType, payload.attachment_url),
      metadata: { source: 'personal_bridge', transport: payload.transport || null, raw: payload.raw || null },
    }, { onConflict: 'zalo_msg_id', ignoreDuplicates: true })
    .select()
    .maybeSingle();

  if (insertErr && insertErr.code !== '23505') {
    console.error('[Zalo cá nhân] insert message:', insertErr.message);
    return { ok: false, error: insertErr.message };
  }
  if (!savedMsg) return { skipped: true, reason: 'duplicate_upsert' };

  const contactUpd = {
    last_message_at: new Date().toISOString(),
    last_message_preview: content ? content.slice(0, 100) : `[${messageType}]`,
    updated_at: new Date().toISOString(),
  };
  if (isInbound) contactUpd.unread_count = (contact.unread_count || 0) + 1;
  if (payload.display_name && payload.display_name !== contact.display_name) {
    contactUpd.display_name = payload.display_name;
  }
  if (isInbound && !contact.phone) {
    const phone = extractLocalPhone(content);
    if (phone) contactUpd.phone = phone;
  }
  await supabase.from('zalo_contacts').update(contactUpd).eq('id', contact.id);

  try {
    io?.emit('zalo_message', {
      contact_id: contact.id,
      lead_id: contact.lead_id,
      message: savedMsg,
      contact: { ...contact, ...contactUpd },
    });
  } catch (_) { /* ignore */ }

  return { ok: true, message_id: savedMsg.id, lead_id: contact.lead_id };
}

module.exports = { ingestPersonalMessage, touchPendingThread, normalizeMessageType, findLeadByPhone };
