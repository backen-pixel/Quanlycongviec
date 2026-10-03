/**
 * Xóa lead CRM gắn Facebook khi quét inbound không còn SĐT — chỉ khi lead "an toàn" (không dự án, không đơn, …).
 * Dùng chung cho rescan API và script rescan-fb-inbound-phones.
 */
const { assertLegacyFacebookWriteAllowed } = require('./facebookLegacyWriteScope');
const unavailable = () => Object.assign(new Error('Chưa hoàn tất tác vụ dữ liệu khách.'), { status: 503 });
const checked = async (operation) => { const result = await operation; if (!result || result.error) throw unavailable(); return result; };
const checkedCount = async (operation) => {
  const result = await checked(operation);
  if (!Number.isSafeInteger(result.count) || result.count < 0) throw unavailable();
  return result;
};
async function deleteLeadIfAllowedForRescan(supabase, leadId, contactId, options) {
  await assertLegacyFacebookWriteAllowed(supabase, { leadIds: [leadId], contactIds: [contactId] }, options);
  const { data: lead } = await checked(supabase
    .from('crm_leads')
    .select('id, type, project_id, parent_lead_id')
    .eq('id', leadId)
    .maybeSingle());
  if (!lead) return { ok: false, reason: 'lead_missing' };
  if (lead.type !== 'lead') return { ok: false, reason: 'not_type_lead' };
  if (lead.project_id) return { ok: false, reason: 'has_project' };
  if (lead.parent_lead_id) return { ok: false, reason: 'is_child_lead' };

  const { count: ch } = await checkedCount(supabase
    .from('crm_leads')
    .select('id', { count: 'exact', head: true })
    .eq('parent_lead_id', leadId));
  if ((ch || 0) > 0) return { ok: false, reason: 'has_child_leads' };

  const { count: q } = await checkedCount(supabase
    .from('quotations')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', leadId));
  if ((q || 0) > 0) return { ok: false, reason: 'has_quotations' };

  const { count: o } = await checkedCount(supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', leadId));
  if ((o || 0) > 0) return { ok: false, reason: 'has_orders' };

  const { count: other } = await checkedCount(supabase
    .from('facebook_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', leadId)
    .neq('id', contactId));
  if ((other || 0) > 0) return { ok: false, reason: 'other_fb_contacts_share_lead' };

  await checked(supabase.from('facebook_contacts').update({ lead_id: null, updated_at: new Date().toISOString() }).eq('id', contactId));
  await checked(supabase.from('facebook_messages').update({ lead_id: null }).eq('lead_id', leadId));
  for (const table of ['crm_tasks', 'crm_activities', 'lead_documents', 'lead_members', 'lead_messages']) {
    await checked(supabase.from(table).delete().eq('lead_id', leadId));
  }
  const { error } = await supabase.from('crm_leads').delete().eq('id', leadId);
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

/**
 * Sau khi xóa lead: xóa luôn customer «mồ côi» không SĐT, không dự án/đơn/lead khác, chỉ gắn 1 contact FB này.
 */
async function deleteOrphanCustomerIfAllowed(supabase, customerId, contactId, options) {
  if (!customerId) return { ok: false, reason: 'no_customer_id' };
  await assertLegacyFacebookWriteAllowed(supabase, { customerIds: [customerId], contactIds: [contactId] }, options);
  const { data: cust } = await checked(supabase.from('customers').select('id, phone').eq('id', customerId).maybeSingle());
  if (!cust) return { ok: false, reason: 'customer_missing' };
  if (String(cust.phone || '').trim()) return { ok: false, reason: 'customer_has_phone' };

  const { count: lc } = await checkedCount(supabase.from('crm_leads').select('id', { count: 'exact', head: true }).eq('customer_id', customerId));
  if ((lc || 0) > 0) return { ok: false, reason: 'customer_has_leads' };

  const { count: pc } = await checkedCount(supabase.from('projects').select('id', { count: 'exact', head: true }).eq('customer_id', customerId));
  if ((pc || 0) > 0) return { ok: false, reason: 'customer_has_projects' };

  const { count: qc } = await checkedCount(supabase.from('quotations').select('id', { count: 'exact', head: true }).eq('customer_id', customerId));
  if ((qc || 0) > 0) return { ok: false, reason: 'customer_has_quotations' };

  const { count: oc } = await checkedCount(supabase.from('orders').select('id', { count: 'exact', head: true }).eq('customer_id', customerId));
  if ((oc || 0) > 0) return { ok: false, reason: 'customer_has_orders' };

  const { data: fbRows } = await checked(supabase.from('facebook_contacts').select('id').eq('customer_id', customerId));
  if (!Array.isArray(fbRows)) throw unavailable();
  const rows = fbRows;
  if (rows.length > 1) return { ok: false, reason: 'multiple_fb_contacts' };
  if (rows.length === 0) return { ok: false, reason: 'no_fb_contact_for_customer' };
  if (String(rows[0].id) !== String(contactId)) return { ok: false, reason: 'fb_contact_mismatch' };

  await checked(supabase.from('customer_interactions').delete().eq('customer_id', customerId));
  await checked(supabase
    .from('facebook_contacts')
    .update({ customer_id: null, updated_at: new Date().toISOString() })
    .eq('id', contactId));
  const { error } = await supabase.from('customers').delete().eq('id', customerId);
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

module.exports = { deleteLeadIfAllowedForRescan, deleteOrphanCustomerIfAllowed };
