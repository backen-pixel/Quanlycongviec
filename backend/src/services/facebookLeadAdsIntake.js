'use strict';

const { object, fail, uuid, intakeIdentity, validateProvider, prepareLead } = require('../domain/facebookLeadAdsIntake');

function createFacebookLeadAdsIntake({ db, fetchImpl, getGraphVersion, isPrimary, withPrimary, managedPages }) {
  const allowedPages = new Set(managedPages);
  const primary = () => { if (isPrimary() !== true) throw fail('FB_INBOX_PRIMARY_REQUIRED'); };
  const read = async query => {
    let result;
    try { result = await query; } catch { throw fail('FB_INBOX_INTAKE_READ_FAILED'); }
    if (!result || result.error) throw fail('FB_INBOX_INTAKE_READ_FAILED');
    return result.data;
  };
  async function graph(version, nodeId, fields, token) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    timer.unref?.();
    try {
      const response = await fetchImpl(`https://graph.facebook.com/${version}/${nodeId}?fields=${encodeURIComponent(fields)}`, {
        headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, redirect: 'error',
      });
      if (!response?.ok) throw fail('FB_INBOX_PROVIDER_UNAVAILABLE');
      const data = await response.json();
      if (!object(data) || data.error || Buffer.byteLength(JSON.stringify(data)) > 1024 * 1024) throw fail('FB_INBOX_PROVIDER_UNAVAILABLE');
      return data;
    } catch { throw fail('FB_INBOX_PROVIDER_UNAVAILABLE'); }
    finally { clearTimeout(timer); }
  }
  return async function intake(pageId, payload, lease) {
    const identity = intakeIdentity(pageId, payload, lease);
    if (!allowedPages.has(pageId)) throw fail('FB_INBOX_LEAD_PAGE_NOT_MANAGED');
    primary();
    return withPrimary(async () => {
      const [binding, page, receipt] = await Promise.all([
        read(db.from('facebook_lead_ads_bindings').select('*').eq('page_id', pageId).eq('form_id', identity.formId).maybeSingle()),
        read(db.from('facebook_pages').select('page_id,is_active,auto_create_lead,default_company_id,access_token')
          .eq('page_id', pageId).maybeSingle()),
        read(db.from('facebook_lead_ads_intake_receipts').select('provider_data,lead_data,binding_version')
          .eq('page_id', pageId).eq('form_id', identity.formId).eq('leadgen_id', identity.leadgenId).maybeSingle()),
      ]);
      if (!binding || binding.active !== true || !Number.isSafeInteger(binding.version) || binding.version < 1
          || !uuid(binding.company_id) || !uuid(binding.recipient_id)) throw fail('FB_INBOX_LEAD_BINDING_REQUIRED');
      if (!page || page.is_active !== true || page.auto_create_lead !== true || page.default_company_id !== binding.company_id) {
        throw fail('FB_INBOX_LEAD_PAGE_SCOPE_INVALID');
      }
      let providerData; let leadData;
      if (receipt) {
        if (receipt.binding_version !== binding.version || !object(receipt.lead_data)) throw fail('FB_INBOX_LEAD_RECEIPT_REVIEW_REQUIRED');
        providerData = validateProvider(identity, receipt.provider_data);
        leadData = receipt.lead_data;
      } else {
        const version = getGraphVersion();
        if (typeof version !== 'string' || !/^v\d{1,2}\.\d+$/.test(version)) throw fail('FB_INBOX_GRAPH_VERSION_REQUIRED');
        if (typeof page.access_token !== 'string' || !page.access_token.trim()) throw fail('FB_INBOX_PROVIDER_TOKEN_REQUIRED');
        const [provider, form, mapping] = await Promise.all([
          graph(version, identity.leadgenId, 'id,form_id,field_data,created_time,ad_id,adset_id,campaign_id,is_organic,platform', page.access_token),
          graph(version, identity.formId, 'id,page_id', page.access_token),
          read(db.from('fb_lead_form_mapping').select('page_id,truong').eq('form_id', identity.formId).maybeSingle()),
        ]);
        if (form.id !== identity.formId || form.page_id !== pageId) throw fail('FB_INBOX_PROVIDER_FORM_SCOPE_MISMATCH');
        if (mapping && mapping.page_id !== pageId) throw fail('FB_INBOX_FORM_MAPPING_SCOPE_MISMATCH');
        providerData = validateProvider(identity, { ...provider, form_page_id: form.page_id });
        leadData = prepareLead(providerData, mapping?.truong);
      }
      primary();
      let result;
      try {
        result = await db.rpc('facebook_lead_ads_intake_v1', {
          p_inbox_id: lease.inboxId, p_lease_token: lease.leaseToken, p_binding_version: binding.version,
          p_lead_data: leadData, p_provider_data: providerData,
        });
      } catch { throw fail('FB_INBOX_INTAKE_NOT_CONFIRMED'); }
      primary();
      if (!result || result.error) {
        const code = result?.error?.message;
        throw fail(typeof code === 'string' && /^FB_INBOX_[A-Z_]{1,64}$/.test(code) ? code : 'FB_INBOX_INTAKE_NOT_CONFIRMED');
      }
      const value = result.data;
      if (!object(value) || !['created', 'existing'].includes(value.status)
          || ['leadId', 'customerId', 'contactId', 'receiptId', 'recipientId'].some(key => !uuid(value[key]))
          || value.recipientId !== binding.recipient_id) throw fail('FB_INBOX_INTAKE_NOT_CONFIRMED');
      // The transaction creates a durable in-app handoff. No legacy tasks,
      // realtime pushes, customer messages or attribution repair after commit.
      return value;
    });
  };
}

module.exports = { createFacebookLeadAdsIntake };
