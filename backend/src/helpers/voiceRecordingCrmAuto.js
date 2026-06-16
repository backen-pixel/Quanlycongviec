/**
 * Tự động ghép hoặc tạo Lead/Deal khi có ghi âm mới (hoặc sau quét SĐT).
 * 1) Nếu CRM đã có lead/deal rõ ràng theo SĐT → gắn vào bản ghi.
 * 2) Nếu chưa có → tạo Lead mới (NV upload phụ trách) rồi gắn.
 */

const { nextCrmCode } = require('./crmNextCode');
const { resolveCustomerLeadByPhone, findCustomerByPhoneDigits, digitsOnly } = require('./phoneCrmLink');

async function resolveVoiceRecordingCompanyId(supabaseClient, { lead_id, customer_id }) {
  if (lead_id) {
    const { data } = await supabaseClient
      .from('crm_leads')
      .select('company_id')
      .eq('id', lead_id)
      .maybeSingle();
    if (data?.company_id) return data.company_id;
  }
  if (customer_id) {
    const { data } = await supabaseClient
      .from('customers')
      .select('company_id')
      .eq('id', customer_id)
      .maybeSingle();
    if (data?.company_id) return data.company_id;
  }
  return null;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
async function createCrmOpportunityForCustomer(
  supabase,
  { customerRow, phone, staffUserId, type = 'lead', companyId = null, title = null },
) {
  const dealType = String(type).toLowerCase() === 'deal' ? 'deal' : 'lead';
  const titleLabel = phone || customerRow?.full_name || 'Ghi âm';
  const uid = staffUserId;

  if (dealType === 'deal') {
    if (!companyId) {
      const e = new Error('Tạo Deal cần company_id');
      e.status = 400;
      throw e;
    }
    const { data: firstDealStage, error: fsErr } = await supabase
      .from('crm_pipeline_stages')
      .select('id')
      .eq('pipeline_type', 'deal')
      .eq('is_active', true)
      .order('order_index')
      .limit(1)
      .single();
    if (fsErr || !firstDealStage) throw new Error('Không tìm thấy giai đoạn Deal');

    const dealTitle = (title && String(title).trim()) || `Deal — ${titleLabel}`;
    const code = await nextCrmCode('DEAL');
    const { data: dRow, error: de } = await supabase
      .from('crm_leads')
      .insert({
        code,
        title: dealTitle.slice(0, 500),
        type: 'deal',
        customer_id: customerRow.id,
        company_id: companyId,
        stage_id: firstDealStage.id,
        assigned_to: uid,
        lead_owner_id: uid,
        created_by: uid,
      })
      .select('id, code, title, type')
      .single();
    if (de) throw de;
    return dRow;
  }

  const { data: firstLeadStage, error: lsErr } = await supabase
    .from('crm_pipeline_stages')
    .select('id')
    .eq('pipeline_type', 'lead')
    .eq('is_active', true)
    .order('order_index')
    .limit(1)
    .single();
  if (lsErr || !firstLeadStage) throw new Error('Không tìm thấy giai đoạn Lead');

  const leadTitle = (title && String(title).trim()) || `Lead — ${titleLabel}`;
  const code = await nextCrmCode('LEAD');
  const { data: lRow, error: le } = await supabase
    .from('crm_leads')
    .insert({
      code,
      title: leadTitle.slice(0, 500),
      type: 'lead',
      customer_id: customerRow.id,
      stage_id: firstLeadStage.id,
      assigned_to: uid,
      lead_owner_id: uid,
      created_by: uid,
    })
    .select('id, code, title, type')
    .single();
  if (le) throw le;
  return lRow;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} row — voice_recordings row (id, phone_number, customer_id, lead_id, user_id, …)
 * @param {{ actingUserId: string, actingRole?: string, recordSelect?: string }} opts
 * @returns {Promise<{ recording: object, customer: object|null, lead: object|null, linkedExisting: boolean, createdNew: boolean } | null>}
 */
async function ensureVoiceRecordingCrmLink(supabase, row, opts = {}) {
  if (!row?.id) return null;
  if (row.lead_id) return null;

  const { actingUserId, actingRole, recordSelect = '*' } = opts;
  const uid = row.user_id || actingUserId;
  if (!uid) return null;

  let phone = row.phone_number != null ? String(row.phone_number).replace(/\s+/g, '').trim() : '';
  let customer_id = row.customer_id || null;
  let lead_id = null;
  let customerRow = null;
  let resolvedLead = null;

  if (phone && digitsOnly(phone).length >= 9) {
    const resolved = await resolveCustomerLeadByPhone(supabase, phone, uid, actingRole);
    if (resolved?.customer_id) {
      customer_id = resolved.customer_id;
      lead_id = resolved.lead_id || null;
      customerRow = resolved.customer || null;
      resolvedLead = resolved.lead || null;
    }
  }

  if (lead_id) {
    const company_id = await resolveVoiceRecordingCompanyId(supabase, { lead_id, customer_id });
    const patch = { customer_id, lead_id, company_id };
    const { data: updated, error: upErr } = await supabase
      .from('voice_recordings')
      .update(patch)
      .eq('id', row.id)
      .select(recordSelect)
      .single();
    if (upErr || !updated) return null;
    return {
      recording: updated,
      customer: customerRow,
      lead: resolvedLead || resolvedLeadFromRow(updated),
      linkedExisting: true,
      createdNew: false,
    };
  }

  if (customer_id && !customerRow) {
    const { data: cust, error: ce } = await supabase
      .from('customers')
      .select('id, full_name, phone')
      .eq('id', customer_id)
      .single();
    if (ce || !cust) return null;
    customerRow = cust;
    if (!phone && cust.phone) phone = String(cust.phone).replace(/\s+/g, '').trim();
  }

  if (!customer_id && phone && digitsOnly(phone).length >= 9) {
    customerRow = await findCustomerByPhoneDigits(supabase, phone);
    if (!customerRow) {
      const autoName = `Khách ${phone.length >= 4 ? phone.slice(-4) : phone}`;
      const { data: ins, error: ce } = await supabase
        .from('customers')
        .insert({
          full_name: autoName.slice(0, 200),
          phone: phone.slice(0, 32),
          source: 'Ghi âm',
        })
        .select('id, full_name, phone')
        .single();
      if (ce) {
        console.warn('[voice-crm-auto] create customer:', ce.message);
        return null;
      }
      customerRow = ins;
    }
    customer_id = customerRow.id;
  }

  if (!customer_id || !customerRow) return null;

  let leadRow;
  try {
    leadRow = await createCrmOpportunityForCustomer(supabase, {
      customerRow,
      phone,
      staffUserId: uid,
      type: 'lead',
      title: phone ? `Lead — ${phone}` : undefined,
    });
  } catch (e) {
    console.warn('[voice-crm-auto] create lead:', e.message);
    return null;
  }

  const company_id = await resolveVoiceRecordingCompanyId(supabase, {
    lead_id: leadRow.id,
    customer_id: customerRow.id,
  });
  const recPatch = {
    customer_id: customerRow.id,
    lead_id: leadRow.id,
    company_id,
  };
  if (phone && !row.phone_number) recPatch.phone_number = phone.slice(0, 32);

  const { data: updated, error: ue } = await supabase
    .from('voice_recordings')
    .update(recPatch)
    .eq('id', row.id)
    .select(recordSelect)
    .single();
  if (ue || !updated) return null;

  return {
    recording: updated,
    customer: customerRow,
    lead: leadRow,
    linkedExisting: false,
    createdNew: true,
  };
}

function resolvedLeadFromRow(updated) {
  if (updated?.lead) return updated.lead;
  return null;
}

module.exports = {
  resolveVoiceRecordingCompanyId,
  createCrmOpportunityForCustomer,
  ensureVoiceRecordingCrmLink,
};
