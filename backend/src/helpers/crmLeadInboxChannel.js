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

/**
 * Xác định kênh inbox (Facebook / Zalo OA) gắn với lead/deal CRM.
 * @returns {'facebook'|'zalo'|null}
 */
async function resolveLeadInboxChannel(supabase, leadId, lead = null) {
  const id = String(leadId || '').trim();
  if (!id) return null;

  const pickFromPair = (zaloRow, fbRow) => {
    const hasZalo = !!zaloRow;
    const hasFb = !!fbRow;
    if (hasZalo && !hasFb) return 'zalo';
    if (hasFb && !hasZalo) return 'facebook';
    if (!hasZalo && !hasFb) return null;
    const zMs = zaloRow?.last_message_at ? new Date(zaloRow.last_message_at).getTime() : 0;
    const fMs = fbRow?.last_message_at ? new Date(fbRow.last_message_at).getTime() : 0;
    return zMs >= fMs ? 'zalo' : 'facebook';
  };

  const [{ data: zaloByLead }, { data: fbByLead }] = await Promise.all([
    supabase.from('zalo_contacts').select('id, last_message_at').eq('lead_id', id).order('last_message_at', { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
    supabase.from('facebook_contacts').select('id, last_message_at').eq('lead_id', id).order('last_message_at', { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
  ]);
  const byLead = pickFromPair(zaloByLead, fbByLead);
  if (byLead) return byLead;

  const customerId = lead?.customer_id;
  if (customerId) {
    const [{ data: zaloByCust }, { data: fbByCust }] = await Promise.all([
      supabase.from('zalo_contacts').select('id, last_message_at').eq('customer_id', customerId).order('last_message_at', { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
      supabase.from('facebook_contacts').select('id, last_message_at').eq('customer_id', customerId).order('last_message_at', { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
    ]);
    const byCust = pickFromPair(zaloByCust, fbByCust);
    if (byCust) return byCust;
  }

  const sourceName = String(lead?.source?.name || '').toLowerCase();
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

module.exports = { resolveLeadInboxChannel, resolveLeadInboxLinks };
