/**
 * Xóa lead CRM gắn Facebook khi quét inbound không còn SĐT — chỉ khi lead "an toàn" (không dự án, không đơn, …).
 * Dùng chung cho rescan API và script rescan-fb-inbound-phones.
 */
async function deleteLeadIfAllowedForRescan(supabase, leadId, contactId) {
  const { data: lead } = await supabase
    .from('crm_leads')
    .select('id, type, project_id, parent_lead_id')
    .eq('id', leadId)
    .maybeSingle();
  if (!lead) return { ok: false, reason: 'lead_missing' };
  if (lead.type !== 'lead') return { ok: false, reason: 'not_type_lead' };
  if (lead.project_id) return { ok: false, reason: 'has_project' };
  if (lead.parent_lead_id) return { ok: false, reason: 'is_child_lead' };

  const { count: ch } = await supabase
    .from('crm_leads')
    .select('id', { count: 'exact', head: true })
    .eq('parent_lead_id', leadId);
  if ((ch || 0) > 0) return { ok: false, reason: 'has_child_leads' };

  const { count: q } = await supabase
    .from('quotations')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', leadId);
  if ((q || 0) > 0) return { ok: false, reason: 'has_quotations' };

  const { count: o } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', leadId);
  if ((o || 0) > 0) return { ok: false, reason: 'has_orders' };

  const { count: other } = await supabase
    .from('facebook_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', leadId)
    .neq('id', contactId);
  if ((other || 0) > 0) return { ok: false, reason: 'other_fb_contacts_share_lead' };

  await supabase.from('facebook_contacts').update({ lead_id: null, updated_at: new Date().toISOString() }).eq('id', contactId);
  await supabase.from('facebook_messages').update({ lead_id: null }).eq('lead_id', leadId);
  try { await supabase.from('crm_tasks').delete().eq('lead_id', leadId); } catch (_) {}
  try { await supabase.from('crm_activities').delete().eq('lead_id', leadId); } catch (_) {}
  try { await supabase.from('lead_documents').delete().eq('lead_id', leadId); } catch (_) {}
  try { await supabase.from('lead_members').delete().eq('lead_id', leadId); } catch (_) {}
  try { await supabase.from('lead_messages').delete().eq('lead_id', leadId); } catch (_) {}
  const { error } = await supabase.from('crm_leads').delete().eq('id', leadId);
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

/**
 * Sau khi xóa lead: xóa luôn customer «mồ côi» không SĐT, không dự án/đơn/lead khác, chỉ gắn 1 contact FB này.
 */
async function deleteOrphanCustomerIfAllowed(supabase, customerId, contactId) {
  if (!customerId) return { ok: false, reason: 'no_customer_id' };
  const { data: cust } = await supabase.from('customers').select('id, phone').eq('id', customerId).maybeSingle();
  if (!cust) return { ok: false, reason: 'customer_missing' };
  if (String(cust.phone || '').trim()) return { ok: false, reason: 'customer_has_phone' };

  const { count: lc } = await supabase.from('crm_leads').select('id', { count: 'exact', head: true }).eq('customer_id', customerId);
  if ((lc || 0) > 0) return { ok: false, reason: 'customer_has_leads' };

  const { count: pc } = await supabase.from('projects').select('id', { count: 'exact', head: true }).eq('customer_id', customerId);
  if ((pc || 0) > 0) return { ok: false, reason: 'customer_has_projects' };

  const { count: qc } = await supabase.from('quotations').select('id', { count: 'exact', head: true }).eq('customer_id', customerId);
  if ((qc || 0) > 0) return { ok: false, reason: 'customer_has_quotations' };

  const { count: oc } = await supabase.from('orders').select('id', { count: 'exact', head: true }).eq('customer_id', customerId);
  if ((oc || 0) > 0) return { ok: false, reason: 'customer_has_orders' };

  const { data: fbRows } = await supabase.from('facebook_contacts').select('id').eq('customer_id', customerId);
  const rows = fbRows || [];
  if (rows.length > 1) return { ok: false, reason: 'multiple_fb_contacts' };
  if (rows.length === 0) return { ok: false, reason: 'no_fb_contact_for_customer' };
  if (String(rows[0].id) !== String(contactId)) return { ok: false, reason: 'fb_contact_mismatch' };

  try {
    await supabase.from('customer_interactions').delete().eq('customer_id', customerId);
  } catch (_) {}
  await supabase
    .from('facebook_contacts')
    .update({ customer_id: null, updated_at: new Date().toISOString() })
    .eq('id', contactId);
  const { error } = await supabase.from('customers').delete().eq('id', customerId);
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

module.exports = { deleteLeadIfAllowedForRescan, deleteOrphanCustomerIfAllowed };
