'use strict';

// Only the current VPT Messenger trial is migrated. Other Pages keep their
// existing flow until explicitly reviewed and onboarded.
const FACEBOOK_ATOMIC_LEAD_PAGE_ID = '409741855550833';
const FACEBOOK_ATOMIC_LEAD_COMPANY_ID = '991dc79d-cbf5-49f9-a364-35227cb47635';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_LEAD_FIELDS = new Set([
  'code', 'title', 'type', 'customer_id', 'source_id', 'stage_id',
  'pipeline_id', 'company_id', 'region_id', 'lead_type_id',
  'install_address', 'description', 'lead_owner_id', 'assigned_to',
  'created_by', 'stage_entered_at',
]);

function isFacebookAtomicLeadScope({ pageId, companyId, moduleKey = 'crm', createType = 'lead' }) {
  return String(pageId || '') === FACEBOOK_ATOMIC_LEAD_PAGE_ID
    && String(companyId || '').toLowerCase() === FACEBOOK_ATOMIC_LEAD_COMPANY_ID
    && moduleKey === 'crm'
    && createType === 'lead';
}

async function createFacebookLeadOnce(supabase, {
  pageId, contactId, companyId, leadData, existingLeadId = null,
}) {
  if (leadData?.type !== 'lead'
    || !isFacebookAtomicLeadScope({ pageId, companyId, createType: leadData.type })) {
    throw new Error('Facebook atomic lead: unsupported scope');
  }
  if (!UUID_RE.test(String(contactId || '')) || (existingLeadId && !UUID_RE.test(existingLeadId))) {
    throw new Error('Facebook atomic lead: invalid identity');
  }
  if (!leadData || typeof leadData !== 'object' || Array.isArray(leadData)) {
    throw new Error('Facebook atomic lead: object payload required');
  }
  if (String(leadData.company_id || '').toLowerCase() !== FACEBOOK_ATOMIC_LEAD_COMPANY_ID) {
    throw new Error('Facebook atomic lead: payload scope mismatch');
  }
  for (const key of Object.keys(leadData)) {
    if (!ALLOWED_LEAD_FIELDS.has(key)) throw new Error('Facebook atomic lead: unsupported payload field');
  }
  const payload = Object.fromEntries(Object.entries(leadData).filter(([, value]) => value !== undefined));
  payload.company_id = FACEBOOK_ATOMIC_LEAD_COMPANY_ID;
  const { data, error } = await supabase.rpc('create_facebook_contact_lead_once', {
    p_contact_id: contactId,
    p_page_id: FACEBOOK_ATOMIC_LEAD_PAGE_ID,
    p_company_id: FACEBOOK_ATOMIC_LEAD_COMPANY_ID,
    p_lead_data: payload,
    p_existing_lead_id: existingLeadId,
  });
  // Never fall back to a direct insert. A timeout can mean the RPC committed.
  // The caller retries this same RPC; the DB then returns created:false.
  if (error) {
    const rpcError = new Error(error.message || 'Facebook atomic lead: RPC failed');
    rpcError.code = error.code;
    throw rpcError;
  }
  if (!data || !data.lead || !UUID_RE.test(String(data.lead.id || ''))
    || typeof data.created !== 'boolean'
    || data.lead.type !== 'lead'
    || String(data.lead.company_id || '').toLowerCase() !== FACEBOOK_ATOMIC_LEAD_COMPANY_ID) {
    throw new Error('Facebook atomic lead: invalid RPC response');
  }
  return { lead: data.lead, created: data.created };
}

module.exports = {
  FACEBOOK_ATOMIC_LEAD_PAGE_ID,
  FACEBOOK_ATOMIC_LEAD_COMPANY_ID,
  isFacebookAtomicLeadScope,
  createFacebookLeadOnce,
};
