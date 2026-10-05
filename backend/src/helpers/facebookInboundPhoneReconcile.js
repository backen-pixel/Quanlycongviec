/**
 * Sau khi quét inbound: nếu KHÔNG có SĐT mới trong tin nhắn inbound nhưng contact vẫn đang lưu SĐT cũ
 * → xóa SĐT trên contact (+ customer nếu trùng chuỗi, gỡ dòng SĐT trong mô tả lead).
 * Nếu SĐT inbound quét được TRÙNG SĐT đang lưu → không làm gì (không xóa lead, không xóa SĐT).
 * Có thể gọi tiếp deleteLeadIfAllowedForRescan khi không còn SĐT và bật deleteLeadIfNoPhone.
 */
const { extractInboundContactInfo } = require('./facebookPhoneExtract');
const { deleteLeadIfAllowedForRescan } = require('./facebookLeadDeleteWhenNoPhone');
const { assertLegacyFacebookWriteAllowed } = require('./facebookLegacyWriteScope');
const { checkedLegacyFacebookResult: checked } = require('./facebookLegacyContactWrites');
const unavailable = () => Object.assign(new Error('Chưa xác minh được dữ liệu để đối soát số điện thoại.'), { status: 503 });

function normalizeDigits(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('84') && d.length >= 10) d = '0' + d.slice(2);
  if (d.startsWith('0084')) d = '0' + d.slice(4);
  return d;
}

function phonesEqualDigits(a, b) {
  const da = normalizeDigits(a);
  const db = normalizeDigits(b);
  return da.length >= 9 && da === db;
}

function stripStoredPhonesFromLeadDescription(desc) {
  let d = desc || '';
  d = d.replace(/\n?SĐT khác:\s*[^\n]*/gi, '');
  d = d.replace(/SĐT:\s*\S+/g, 'SĐT:');
  return d.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} contactId
 * @param {{ deleteLeadIfNoPhone?: boolean }} [opts]
 * @returns {Promise<{ ok: boolean, action: string, lead_delete?: object }>}
 */
async function reconcileInboundPhoneAfterScan(supabase, contactId, opts = {}) {
  const deleteLeadIfNoPhone = !!opts.deleteLeadIfNoPhone;
  await assertLegacyFacebookWriteAllowed(supabase, { contactIds: [contactId] }, opts);

  const { data: contact } = await checked(supabase
    .from('facebook_contacts')
    .select('id, phone, lead_id, customer_id, page_id')
    .eq('id', contactId)
    .maybeSingle());
  if (!contact) return { ok: false, action: 'no_contact' };

  let lead = null;
  let cust = null;
  if (contact.lead_id) {
    const { data: ld } = await checked(supabase
      .from('crm_leads')
      .select('id, customer_id, description')
      .eq('id', contact.lead_id)
      .maybeSingle());
    if (!ld) throw unavailable();
    lead = ld;
    if (lead?.customer_id) {
      const { data: c } = await checked(supabase.from('customers').select('id, phone').eq('id', lead.customer_id).maybeSingle());
      if (!c) throw unavailable();
      cust = c;
    }
  }
  if (!cust && contact.customer_id) {
    const { data: c2 } = await checked(supabase.from('customers').select('id, phone').eq('id', contact.customer_id).maybeSingle());
    if (!c2) throw unavailable();
    cust = c2;
  }

  const oldPhone = cust?.phone && String(cust.phone).trim() ? String(cust.phone).trim() : null;

  const { data: messages } = await checked(supabase
    .from('facebook_messages')
    .select('id, content, direction, created_at')
    .eq('contact_id', contactId)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(801));
  if (!Array.isArray(messages)) throw unavailable();

  const info = extractInboundContactInfo(messages || [], {});
  const scanned = info.phone || null;

  if (scanned && oldPhone && phonesEqualDigits(oldPhone, scanned)) {
    return { ok: true, action: 'skipped_same_inbound_as_stored', scanned, oldPhone };
  }
  if (scanned) {
    return { ok: true, action: 'has_inbound_phone_keep_stored', scanned };
  }
  if (!oldPhone) {
    return { ok: true, action: 'nothing_no_stored_phone' };
  }
  if (messages.length >= 801) {
    throw Object.assign(new Error('Lịch sử hội thoại chưa được đọc hết; đã giữ nguyên số điện thoại và hồ sơ.'), { status: 503 });
  }

  const leadCustId = lead?.customer_id || contact.customer_id;
  await assertLegacyFacebookWriteAllowed(supabase, {
    contactIds: [contactId], leadIds: lead?.id ? [lead.id] : [], customerIds: leadCustId ? [leadCustId] : [],
  }, opts);
  await checked(supabase
    .from('facebook_contacts')
    .update({ phone: null, updated_at: new Date().toISOString() })
    .eq('id', contactId));

  if (leadCustId) {
    await checked(supabase.from('customers').update({ phone: '', updated_at: new Date().toISOString() }).eq('id', leadCustId));
  }

  if (lead) {
    const newDesc = stripStoredPhonesFromLeadDescription(lead.description || '');
    if (newDesc !== (lead.description || '')) {
      await checked(supabase.from('crm_leads').update({ description: newDesc, updated_at: new Date().toISOString() }).eq('id', lead.id));
    }
  }

  let lead_delete = null;
  if (deleteLeadIfNoPhone && contact.lead_id) {
    const { data: freshC } = await checked(supabase
      .from('facebook_contacts')
      .select('lead_id, customer_id')
      .eq('id', contactId)
      .maybeSingle());
    if (!freshC) throw unavailable();
    let noPhone = true;
    const cid = freshC?.customer_id || null;
    if (cid) {
      const { data: fc } = await checked(supabase.from('customers').select('phone').eq('id', cid).maybeSingle());
      if (!fc) throw unavailable();
      noPhone = !fc?.phone || !String(fc.phone).trim();
    }
    if (noPhone && freshC?.lead_id) {
      lead_delete = await deleteLeadIfAllowedForRescan(supabase, freshC.lead_id, contactId, opts);
    }
  }

  return {
    ok: true,
    action: lead_delete?.ok ? 'cleared_phone_and_deleted_lead' : 'cleared_stored_phone_only',
    lead_delete,
  };
}

module.exports = {
  reconcileInboundPhoneAfterScan,
  phonesEqualDigits,
  stripStoredPhonesFromLeadDescription,
};
