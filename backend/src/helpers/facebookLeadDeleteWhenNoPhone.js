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

module.exports = { deleteLeadIfAllowedForRescan };
