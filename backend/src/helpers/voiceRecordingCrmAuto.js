/**
 * Tự động ghép hoặc tạo Lead/Deal khi có ghi âm mới (hoặc sau quét SĐT).
 * 1) Xác định NV upload + công ty (users.company_id → phòng ban → bản ghi ghi âm).
 * 2) Nếu CRM đã có lead/deal rõ ràng theo SĐT trong cùng công ty → gắn.
 * 3) Nếu chưa có → tạo Lead mới (NV upload phụ trách) rồi gắn.
 */

const { nextCrmCode } = require('./crmNextCode');
const { resolveCustomerLeadByPhone, findCustomerByPhoneDigits, digitsOnly } = require('./phoneCrmLink');
const { resolveCompanyIdForUser } = require('../middleware/auth');
const { autoGenCrmTasksForNewLead } = require('./autoGenCrmTasks');

const PIPELINE_CHUNG_ID = '00000000-0000-0000-0000-000000000001';

/** NV upload + công ty — ưu tiên users.company_id, fallback phòng ban, JWT/bản ghi ghi âm. */
async function resolveVoiceStaffContext(supabaseClient, { userId, recordingCompanyId = null } = {}) {
  if (!userId) {
    const co = recordingCompanyId != null && String(recordingCompanyId).trim() !== ''
      ? String(recordingCompanyId).trim()
      : null;
    return { userId: null, companyId: co, fullName: null };
  }

  const { data: u } = await supabaseClient
    .from('users')
    .select('id, full_name, company_id, department:departments!users_department_id_fkey(company_id)')
    .eq('id', userId)
    .maybeSingle();

  let companyId = u?.company_id || u?.department?.company_id || recordingCompanyId || null;
  if (!companyId) {
    companyId = await resolveCompanyIdForUser(userId);
  }
  if (companyId != null && String(companyId).trim() !== '') {
    companyId = String(companyId).trim();
  } else {
    companyId = null;
  }

  return {
    userId,
    companyId,
    fullName: u?.full_name || null,
  };
}

/** Pipeline + stage đầu tiên theo công ty (giống Facebook / SX). */
async function resolveVoicePipelineAndStage(supabaseClient, companyId, pipelineType) {
  const type = pipelineType === 'deal' ? 'deal' : 'lead';
  let pipelineId = PIPELINE_CHUNG_ID;

  if (companyId) {
    const { data: p } = await supabaseClient
      .from('crm_pipelines')
      .select('id')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (p?.id) pipelineId = p.id;
  }

  const { data: stage } = await supabaseClient
    .from('crm_pipeline_stages')
    .select('id')
    .eq('pipeline_id', pipelineId)
    .eq('pipeline_type', type)
    .eq('is_active', true)
    .order('order_index', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (stage?.id) {
    return { pipelineId: pipelineId !== PIPELINE_CHUNG_ID ? pipelineId : null, stageId: stage.id };
  }

  const { data: fallback } = await supabaseClient
    .from('crm_pipeline_stages')
    .select('id')
    .eq('pipeline_type', type)
    .eq('is_active', true)
    .order('order_index', { ascending: true })
    .limit(1)
    .maybeSingle();

  return {
    pipelineId: pipelineId !== PIPELINE_CHUNG_ID ? pipelineId : null,
    stageId: fallback?.id || null,
  };
}

async function resolveVoiceRecordingCompanyId(supabaseClient, { lead_id, customer_id, staffCompanyId = null }) {
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
  return staffCompanyId || null;
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

  if (!companyId) {
    const e = new Error(`Tạo ${dealType === 'deal' ? 'Deal' : 'Lead'} cần company_id của nhân viên upload`);
    e.status = 400;
    throw e;
  }

  const { pipelineId, stageId } = await resolveVoicePipelineAndStage(supabase, companyId, dealType);
  if (!stageId) {
    throw new Error(`Không tìm thấy giai đoạn ${dealType === 'deal' ? 'Deal' : 'Lead'}`);
  }

  const oppTitle = (title && String(title).trim())
    || (dealType === 'deal' ? `Deal — ${titleLabel}` : `Lead — ${titleLabel}`);
  const code = await nextCrmCode(dealType === 'deal' ? 'DEAL' : 'LEAD');

  const insertRow = {
    code,
    title: oppTitle.slice(0, 500),
    type: dealType,
    customer_id: customerRow.id,
    company_id: companyId,
    stage_id: stageId,
    assigned_to: uid,
    lead_owner_id: uid,
    created_by: uid,
  };
  if (pipelineId) insertRow.pipeline_id = pipelineId;

  const { data: row, error } = await supabase
    .from('crm_leads')
    .insert(insertRow)
    .select('id, code, title, type, company_id')
    .single();
  if (error) throw error;

  try {
    await autoGenCrmTasksForNewLead(row.id, uid);
  } catch (taskErr) {
    console.warn('[voice-crm-auto] autoGenCrmTasks:', taskErr.message);
  }

  return row;
}

async function findUniqueCompanyOpportunity(supabaseClient, customerId, companyId) {
  if (!customerId || !companyId) return null;
  const { data, error } = await supabaseClient
    .from('crm_leads')
    .select('id, code, title, type, assigned_to, lead_owner_id')
    .eq('customer_id', customerId)
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false })
    .limit(20);
  if (error || !data?.length) return null;
  const { chosen, multiple } = pickUniqueCompanyOpportunity(data);
  return !multiple && chosen ? chosen : null;
}

function pickUniqueCompanyOpportunity(leads) {
  if (!leads?.length) return { chosen: null, multiple: false };
  const leadRows = leads.filter((x) => x.type === 'lead');
  const dealRows = leads.filter((x) => x.type === 'deal');
  if (leads.length === 1) return { chosen: leads[0], multiple: false };
  if (leads.length > 1 && leadRows.length === 1) return { chosen: leadRows[0], multiple: false };
  if (leadRows.length === 0 && dealRows.length === 1) return { chosen: dealRows[0], multiple: false };
  return { chosen: null, multiple: true };
}

async function ensureCustomerForVoicePhone(supabase, { phone, companyId }) {
  const customerRow = await findCustomerByPhoneDigits(supabase, phone);
  if (customerRow) return customerRow;

  const autoName = `Khách ${phone.length >= 4 ? phone.slice(-4) : phone}`;
  const ins = {
    full_name: autoName.slice(0, 200),
    phone: phone.slice(0, 32),
    source: 'Ghi âm',
  };
  if (companyId) ins.company_id = companyId;

  const { data: created, error: ce } = await supabase
    .from('customers')
    .insert(ins)
    .select('id, full_name, phone, company_id')
    .single();
  if (ce) {
    console.warn('[voice-crm-auto] create customer:', ce.message);
    return null;
  }
  return created;
}

function resolvedLeadFromRow(updated) {
  if (updated?.lead) return updated.lead;
  return null;
}

/**
 * Khóa không auto tạo lead từ các ghi âm đang gắn leadIds (gọi trước khi xóa lead).
 * ON DELETE SET NULL sẽ gỡ lead_id — nếu không khóa sẽ tạo lead mới.
 */
async function markVoiceRecordingsSkipAutoCreateForLeadIds(supabase, leadIds) {
  const ids = [...new Set((leadIds || []).map((x) => String(x || '').trim()).filter(Boolean))];
  if (!ids.length) return { ok: true, updated: 0 };
  const { data, error } = await supabase
    .from('voice_recordings')
    .update({ crm_auto_skip_create: true })
    .in('lead_id', ids)
    .select('id');
  if (error) {
    // Cột chưa migrate — bỏ qua, không chặn xóa lead
    if (/crm_auto_skip_create/i.test(String(error.message || ''))) {
      console.warn('[voice-crm-auto] mark skip: cột chưa có, bỏ qua');
      return { ok: true, updated: 0, skipped: true };
    }
    console.warn('[voice-crm-auto] mark skip:', error.message);
    return { ok: false, error: error.message, updated: 0 };
  }
  return { ok: true, updated: (data || []).length };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} row — voice_recordings row (id, phone_number, customer_id, lead_id, user_id, company_id, …)
 * @param {{ actingUserId: string, actingRole?: string, recordSelect?: string }} opts
 */
async function ensureVoiceRecordingCrmLink(supabase, row, opts = {}) {
  if (!row?.id) return null;
  if (row.lead_id) return null;
  if (row.crm_auto_skip_create === true) {
    console.log(`[voice-crm-auto] recording ${row.id}: crm_auto_skip_create — bỏ qua tạo lead`);
    return null;
  }

  const { actingUserId, actingRole, recordSelect = '*' } = opts;
  const uid = row.user_id || actingUserId;
  if (!uid) return null;

  const staff = await resolveVoiceStaffContext(supabase, {
    userId: uid,
    recordingCompanyId: row.company_id || null,
  });
  if (!staff.companyId) {
    console.warn(`[voice-crm-auto] recording ${row.id}: NV ${uid} chưa có company_id — bỏ qua tạo lead`);
    return null;
  }

  let phone = row.phone_number != null ? String(row.phone_number).replace(/\s+/g, '').trim() : '';
  let customer_id = row.customer_id || null;
  let lead_id = null;
  let customerRow = null;
  let resolvedLead = null;

  if (phone && digitsOnly(phone).length >= 9) {
    const resolved = await resolveCustomerLeadByPhone(
      supabase,
      phone,
      uid,
      actingRole,
      staff.companyId,
    );
    if (resolved?.customer_id) {
      customer_id = resolved.customer_id;
      lead_id = resolved.lead_id || null;
      customerRow = resolved.customer || null;
      resolvedLead = resolved.lead || null;
    }
  }

  if (lead_id) {
    const company_id = await resolveVoiceRecordingCompanyId(supabase, {
      lead_id,
      customer_id,
      staffCompanyId: staff.companyId,
    });
    const patch = { customer_id, lead_id, company_id, crm_auto_skip_create: true };
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
      .select('id, full_name, phone, company_id')
      .eq('id', customer_id)
      .single();
    if (ce || !cust) return null;
    customerRow = cust;
    if (!phone && cust.phone) phone = String(cust.phone).replace(/\s+/g, '').trim();
  }

  if (!customer_id && phone && digitsOnly(phone).length >= 9) {
    customerRow = await ensureCustomerForVoicePhone(supabase, { phone, companyId: staff.companyId });
    if (!customerRow) return null;
    customer_id = customerRow.id;
  }

  if (!customer_id || !customerRow) return null;

  let leadRow;
  let linkedExisting = false;
  let createdNew = false;

  const existingCompanyOpp = await findUniqueCompanyOpportunity(supabase, customer_id, staff.companyId);
  if (existingCompanyOpp) {
    leadRow = existingCompanyOpp;
    linkedExisting = true;
  } else {
    try {
      leadRow = await createCrmOpportunityForCustomer(supabase, {
        customerRow,
        phone,
        staffUserId: uid,
        type: 'lead',
        companyId: staff.companyId,
        title: phone ? `Lead — ${phone}` : undefined,
      });
      createdNew = true;
    } catch (e) {
      console.warn('[voice-crm-auto] create lead:', e.message);
      return null;
    }
  }

  const company_id = leadRow.company_id
    || await resolveVoiceRecordingCompanyId(supabase, {
      lead_id: leadRow.id,
      customer_id: customerRow.id,
      staffCompanyId: staff.companyId,
    });
  const recPatch = {
    customer_id: customerRow.id,
    lead_id: leadRow.id,
    company_id,
    crm_auto_skip_create: true,
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
    linkedExisting,
    createdNew,
  };
}

module.exports = {
  resolveVoiceStaffContext,
  resolveVoicePipelineAndStage,
  resolveVoiceRecordingCompanyId,
  createCrmOpportunityForCustomer,
  ensureVoiceRecordingCrmLink,
  markVoiceRecordingsSkipAutoCreateForLeadIds,
};
