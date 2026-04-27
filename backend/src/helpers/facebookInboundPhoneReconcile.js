/**
 * Sau khi quét inbound: nếu KHÔNG có SĐT mới trong tin nhắn inbound nhưng contact vẫn đang lưu SĐT cũ
 * → xóa SĐT trên contact (+ customer nếu trùng chuỗi, gỡ dòng SĐT trong mô tả lead).
 * Nếu SĐT inbound quét được TRÙNG SĐT đang lưu → không làm gì (không xóa lead, không xóa SĐT).
 * Có thể gọi tiếp deleteLeadIfAllowedForRescan khi không còn SĐT và bật deleteLeadIfNoPhone.
 */
const { extractInboundContactInfo } = require('./facebookPhoneExtract');
const { deleteLeadIfAllowedForRescan } = require('./facebookLeadDeleteWhenNoPhone');

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

  const { data: contact, error: cErr } = await supabase
    .from('facebook_contacts')
    .select('id, phone, lead_id, customer_id, page_id')
    .eq('id', contactId)
    .maybeSingle();
  if (cErr || !contact) return { ok: false, action: 'no_contact' };

  const oldPhone = contact.phone && String(contact.phone).trim() ? String(contact.phone).trim() : null;

  const { data: messages } = await supabase
    .from('facebook_messages')
    .select('id, content, direction, message_type, created_at')
    .eq('contact_id', contactId)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(800);

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

  await supabase
    .from('facebook_contacts')
    .update({ phone: null, updated_at: new Date().toISOString() })
    .eq('id', contactId);

  let lead = null;
  let cust = null;
  if (contact.lead_id) {
    const { data: ld } = await supabase
      .from('crm_leads')
      .select('id, customer_id, description')
      .eq('id', contact.lead_id)
      .maybeSingle();
    lead = ld;
    if (lead?.customer_id) {
      const { data: c } = await supabase.from('customers').select('id, phone').eq('id', lead.customer_id).maybeSingle();
      cust = c;
    }
  }
  if (!cust && contact.customer_id) {
    const { data: c2 } = await supabase.from('customers').select('id, phone').eq('id', contact.customer_id).maybeSingle();
    cust = c2;
  }

  const leadCustId = lead?.customer_id || contact.customer_id;
  if (leadCustId && cust?.phone != null && String(cust.phone).trim() === oldPhone) {
    await supabase.from('customers').update({ phone: '', updated_at: new Date().toISOString() }).eq('id', leadCustId);
  }

  if (lead) {
    const newDesc = stripStoredPhonesFromLeadDescription(lead.description || '');
    if (newDesc !== (lead.description || '')) {
      await supabase.from('crm_leads').update({ description: newDesc, updated_at: new Date().toISOString() }).eq('id', lead.id);
    }
  }

  let lead_delete = null;
  if (deleteLeadIfNoPhone && contact.lead_id) {
    const { data: freshC } = await supabase
      .from('facebook_contacts')
      .select('phone, lead_id')
      .eq('id', contactId)
      .maybeSingle();
    const noPhone = !freshC?.phone || !String(freshC.phone).trim();
    if (noPhone && freshC?.lead_id) {
      lead_delete = await deleteLeadIfAllowedForRescan(supabase, freshC.lead_id, contactId);
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
