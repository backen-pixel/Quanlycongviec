/**
 * Xác định các kênh inbox gắn với lead/deal CRM.
 *
 * Một lead có thể có nhiều kênh cùng lúc — ví dụ khách nhắn Facebook rồi sau đó
 * nhắn Zalo cá nhân — nên trả về danh sách, không phải một giá trị.
 */
const CHANNELS = ['facebook', 'zalo', 'zalo_personal'];

/** oa_id nào là tài khoản cá nhân. */
async function personalOaIds(supabase, oaIds) {
  if (!oaIds.length) return new Set();
  const { data } = await supabase
    .from('zalo_oa_accounts')
    .select('oa_id, account_kind')
    .in('oa_id', oaIds);
  return new Set((data || []).filter((a) => a.account_kind === 'personal').map((a) => a.oa_id));
}

/**
 * @returns {Promise<{channels: string[], primary: string|null}>}
 *   `channels` theo thứ tự tin mới nhất trước; `primary` là kênh đầu tiên.
 */
async function resolveLeadInboxChannels(supabase, leadId, lead = null, user = null) {
  const id = String(leadId || '').trim();
  if (!id) return { channels: [], primary: null };

  const found = new Map(); // kênh → thời điểm tin mới nhất

  // Zalo: tra theo lead + khách hàng + số điện thoại, vì một khách nhiều lead
  // vẫn chỉ có một hội thoại Zalo.
  const { findContactsForLead } = require('./zaloLeadConversations');
  const zalo = await findContactsForLead(supabase, { ...(lead || {}), id });
  const personal = await personalOaIds(supabase, [...new Set(zalo.map((r) => r.oa_id))]);

  for (const row of zalo) {
    const key = personal.has(row.oa_id) ? 'zalo_personal' : 'zalo';
    const ts = row.last_message_at ? new Date(row.last_message_at).getTime() : 0;
    if (ts >= (found.get(key) || 0)) found.set(key, ts);
  }

  // Facebook giữ nguyên cách cũ: theo lead, không thấy thì theo khách hàng
  for (const f of [{ column: 'lead_id', value: id },
    ...(lead?.customer_id ? [{ column: 'customer_id', value: lead.customer_id }] : [])]) {
    const { data: fb } = await supabase.from('facebook_contacts')
      .select('last_message_at').eq(f.column, f.value);
    if (!fb?.length) continue;
    for (const row of fb) {
      const ts = row.last_message_at ? new Date(row.last_message_at).getTime() : 0;
      if (ts >= (found.get('facebook') || 0)) found.set('facebook', ts);
    }
    break;
  }

  // Lead có SĐT thì luôn cho hiện tab Zalo cá nhân, kể cả khi chưa có hội thoại:
  // ca dùng chính là nhân viên chủ động tìm số khách trên Zalo rồi nhắn trước.
  // Không có tab thì họ không có chỗ nào để bấm.
  if (!found.has('zalo_personal') && await canStartPersonalChat(supabase, lead)) {
    found.set('zalo_personal', 0);
  }

  if (found.size) {
    const channels = [...found.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    return { channels, primary: channels[0] };
  }

  // Chưa có hội thoại nào — đoán theo nguồn/tiêu đề để vẫn mở đúng tab
  const guess = guessFromMetadata(lead);
  return guess ? { channels: [guess], primary: guess } : { channels: [], primary: null };
}

/**
 * Lead có số gọi được thì LUÔN hiện tab Zalo cá nhân.
 *
 * Kể cả khi người xem chưa dùng được — tab sẽ nói rõ vì sao (chưa tích hợp,
 * chưa có tài khoản, tài khoản của người khác, đang mất kết nối). Ẩn tab đi thì
 * nhân viên không biết kênh này tồn tại, cũng không biết phải hỏi ai.
 */
async function canStartPersonalChat(supabase, lead) {
  const raw = lead?.customer?.phone || lead?.phone;
  return !!normalizeVnPhone(raw);
}

/** Chuẩn hoá về 0xxxxxxxxx; trả null nếu không phải số di động VN hợp lệ. */
function normalizeVnPhone(raw) {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, '');
  if (d.startsWith('84') && d.length === 11) d = `0${d.slice(2)}`;
  else if (d.length === 9 && !d.startsWith('0')) d = `0${d}`;
  if (d.length !== 10 || !d.startsWith('0')) return null;
  return /^0(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])\d{7}$/.test(d) ? d : null;
}

function guessFromMetadata(lead) {
  const sourceName = String(lead?.source?.name || '').toLowerCase();
  if (/zalo\s*(cá nhân|ca nhan|personal)/.test(sourceName)) return 'zalo_personal';
  if (/zalo/.test(sourceName)) return 'zalo';
  if (/facebook|\bfb\b|\[fb\]/.test(sourceName)) return 'facebook';

  const title = String(lead?.title || '');
  if (/^\[Zalo\b/i.test(title)) return 'zalo';
  if (/^\[FB\b/i.test(title)) return 'facebook';

  const desc = String(lead?.description || '');
  if (/Nguồn:\s*Zalo/i.test(desc)) return 'zalo';
  if (/Nguồn:\s*Facebook/i.test(desc)) return 'facebook';

  const custSource = String(lead?.customer?.source || '').toLowerCase();
  if (/zalo/.test(custSource)) return 'zalo';
  if (/facebook/.test(custSource)) return 'facebook';

  return null;
}

/** Giữ chữ ký cũ cho chỗ nào chỉ cần một kênh. */
async function resolveLeadInboxChannel(supabase, leadId, lead = null, user = null) {
  const { primary } = await resolveLeadInboxChannels(supabase, leadId, lead, user);
  return primary;
}


/* ------------------------------------------------------------------------
 * Giữ nguyên hai hàm cũ cho trang dự án (projectDealBundle) và endpoint
 * /leads/:id/inbox-links. KHÔNG dựng chúng lại từ resolveLeadInboxChannels:
 * hàm mới bật 'zalo_personal' chỉ cần lead có số điện thoại hợp lệ, nên tab
 * Zalo sẽ hiện cả khi chưa từng có hội thoại — sai với ý nghĩa "đã có liên
 * kết inbox" mà hai chỗ kia đang dựa vào.
 * --------------------------------------------------------------------- */
async function hasInboxContactLink(supabase, table, leadId, customerId) {
  const id = String(leadId || '').trim();
  if (!id) return false;
  const { data: byLead } = await supabase.from(table).select('id').eq('lead_id', id).limit(1).maybeSingle();
  if (byLead?.id) return true;
  if (customerId) {
    const { data: byCust } = await supabase.from(table).select('id').eq('customer_id', customerId).limit(1).maybeSingle();
    if (byCust?.id) return true;
  }
  return false;
}

/**
 * Liên kết inbox theo từng kênh — chỉ true khi có contact gắn lead/khách.
 * Dùng hiện tab Facebook / Zalo trên dự án (không hiện nếu chỉ đoán theo nguồn).
 * @returns {{ facebook: boolean, zalo: boolean }}
 */
async function resolveLeadInboxLinks(supabase, leadId, lead = null) {
  const id = String(leadId || '').trim();
  if (!id) return { facebook: false, zalo: false };

  const customerId = lead?.customer_id || lead?.customer?.id || null;
  const [zaloContact, fbContact] = await Promise.all([
    hasInboxContactLink(supabase, 'zalo_contacts', id, customerId),
    hasInboxContactLink(supabase, 'facebook_contacts', id, customerId),
  ]);

  return {
    zalo: !!zaloContact,
    facebook: !!fbContact,
  };
}


module.exports = {
  resolveLeadInboxChannel,
  resolveLeadInboxChannels,
  resolveLeadInboxLinks,
  normalizeVnPhone,
  CHANNELS,
};
