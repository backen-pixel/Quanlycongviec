'use strict';

// Operator-run reconciliation for the short interval in which the old Meta App
// may stop receiving leadgen before the dedicated App proves delivery. This
// module has no HTTP route, timer or automatic invocation.
const { isDeepStrictEqual } = require('node:util');
const { rowsFromBody } = require('../helpers/facebookPageInbox');

const id = value => typeof value === 'string' && /^\d{1,32}$/.test(value);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const fail = code => Object.assign(new Error(code), { code });
const MAX_RESPONSE_BYTES = 512 * 1024;
const PAGE_SIZE = 100;
const MAX_PAGES_PER_EDGE = 200;
const MAX_FORMS = 200;
const MAX_MATCHED_LEADS = 10000;

function utcTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)) {
    throw fail('FB_INBOX_BACKFILL_WINDOW_INVALID');
  }
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw fail('FB_INBOX_BACKFILL_WINDOW_INVALID');
  return time;
}

function createFacebookLeadAdsCutoverBackfill({ db, fetchImpl, getGraphVersion, getLeadGraphToken,
  getLeadAppId, getLeadTokenMetadata, assertPrimaryObserved, isPrimary, withPrimary,
  isWorkerPaused, isLegacyWriterFenced, pageId }) {
  if (!id(pageId) || typeof fetchImpl !== 'function' || typeof getGraphVersion !== 'function'
      || typeof getLeadGraphToken !== 'function' || typeof getLeadAppId !== 'function'
      || typeof getLeadTokenMetadata !== 'function' || typeof assertPrimaryObserved !== 'function'
      || typeof isPrimary !== 'function'
      || typeof withPrimary !== 'function' || typeof isWorkerPaused !== 'function'
      || typeof isLegacyWriterFenced !== 'function') {
    throw fail('FB_INBOX_BACKFILL_CONFIG_INVALID');
  }
  const gate = () => {
    if (isPrimary() !== true) throw fail('FB_INBOX_PRIMARY_REQUIRED');
    if (isWorkerPaused() !== true) throw fail('FB_INBOX_BACKFILL_WORKER_NOT_PAUSED');
  };
  const writeGate = () => {
    gate();
    if (isLegacyWriterFenced() !== true) throw fail('FB_INBOX_BACKFILL_LEGACY_WRITER_ACTIVE');
  };
  const observedGate = async () => {
    try { await assertPrimaryObserved(); } catch { throw fail('FB_INBOX_PRIMARY_REQUIRED'); }
    gate();
  };
  const dbRead = async query => {
    await observedGate();
    let result;
    // Supabase builders are lazy thenables. Await inside the router's ALS scope.
    try { result = await withPrimary(async () => await query()); }
    catch { throw fail('FB_INBOX_BACKFILL_DB_UNAVAILABLE'); }
    if (!result || result.error) throw fail('FB_INBOX_BACKFILL_DB_UNAVAILABLE');
    gate();
    return result.data;
  };
  const assertBindingsInactive = async forms => {
    for (const formId of forms) {
      const binding = await dbRead(() => db.from('facebook_lead_ads_bindings').select('form_id,active')
        .eq('page_id', pageId).eq('form_id', formId).maybeSingle());
      if (binding && (binding.form_id !== formId || binding.active !== false)) {
        throw fail('FB_INBOX_BACKFILL_BINDING_ACTIVE');
      }
    }
  };
  const classify = async ({ formId, leadgenId }) => {
    const receipt = await dbRead(() => db.from('facebook_lead_ads_intake_receipts')
      .select('id,page_id,form_id,leadgen_id,lead_id,customer_id,contact_id,lead_ad_id,attribution_id,notification_id,company_id,recipient_id')
      .eq('leadgen_id', leadgenId).maybeSingle());
    const ad = await dbRead(() => db.from('facebook_lead_ads')
      .select('id,page_id,form_id,leadgen_id,lead_id,customer_id,processed')
      .eq('leadgen_id', leadgenId).maybeSingle());
    if (receipt) {
      if (!uuid(receipt.id) || receipt.page_id !== pageId || receipt.form_id !== formId
          || receipt.leadgen_id !== leadgenId || !uuid(receipt.lead_id) || !uuid(receipt.customer_id)
          || !uuid(receipt.contact_id) || !uuid(receipt.lead_ad_id)
          || !uuid(receipt.attribution_id)
          || !uuid(receipt.notification_id) || !uuid(receipt.company_id) || !uuid(receipt.recipient_id)
          || !ad || ad.id !== receipt.lead_ad_id
          || ad.page_id !== pageId || ad.form_id !== formId || ad.leadgen_id !== leadgenId
          || ad.lead_id !== receipt.lead_id || ad.customer_id !== receipt.customer_id || ad.processed !== true) {
        throw fail('FB_INBOX_BACKFILL_EXISTING_CONFLICT');
      }
    }
    if (!ad) return 'missing';
    if (!uuid(ad.id) || ad.page_id !== pageId || ad.form_id !== formId || ad.leadgen_id !== leadgenId
        || !uuid(ad.lead_id) || !uuid(ad.customer_id) || ad.processed !== true) {
      throw fail('FB_INBOX_BACKFILL_EXISTING_CONFLICT');
    }
    const lead = await dbRead(() => db.from('crm_leads').select('id,customer_id,facebook_contact_id,company_id,assigned_to,lead_owner_id,type')
      .eq('id', ad.lead_id).maybeSingle());
    if (!lead || lead.id !== ad.lead_id || lead.customer_id !== ad.customer_id
        || !uuid(lead.facebook_contact_id) || lead.type !== 'lead'
        || !uuid(lead.company_id)) throw fail('FB_INBOX_BACKFILL_EXISTING_CONFLICT');
    const contact = await dbRead(() => db.from('facebook_contacts').select('id,page_id,psid,lead_id,customer_id')
      .eq('id', lead.facebook_contact_id).maybeSingle());
    if (!contact || contact.id !== lead.facebook_contact_id || contact.page_id !== pageId
        || contact.psid !== `leadad_${leadgenId}` || contact.lead_id !== ad.lead_id
        || contact.customer_id !== ad.customer_id) throw fail('FB_INBOX_BACKFILL_EXISTING_CONFLICT');
    const customer = await dbRead(() => db.from('customers').select('id,company_id')
      .eq('id', ad.customer_id).maybeSingle());
    if (!customer || customer.id !== ad.customer_id || customer.company_id !== lead.company_id) {
      throw fail('FB_INBOX_BACKFILL_EXISTING_CONFLICT');
    }
    if (receipt) {
      const attribution = await dbRead(() => db.from('lead_attribution')
        .select('id,lead_id,company_id,contact_id,customer_id,fb_page_id,fb_form_id,fb_leadgen_id')
        .eq('id', receipt.attribution_id).maybeSingle());
      const notice = await dbRead(() => db.from('notifications').select('id,user_id,entity_id,entity_type,type,metadata')
        .eq('id', receipt.notification_id).maybeSingle());
      if (receipt.contact_id !== contact.id || receipt.company_id !== lead.company_id
          || receipt.recipient_id !== lead.assigned_to || receipt.recipient_id !== lead.lead_owner_id
          || !attribution || attribution.id !== receipt.attribution_id
          || attribution.lead_id !== lead.id || attribution.company_id !== lead.company_id
          || attribution.contact_id !== contact.id || attribution.customer_id !== customer.id
          || attribution.fb_page_id !== pageId || attribution.fb_form_id !== formId
          || attribution.fb_leadgen_id !== leadgenId
          || !notice || notice.id !== receipt.notification_id
          || notice.user_id !== receipt.recipient_id || String(notice.entity_id) !== lead.id
          || notice.entity_type !== 'crm_lead' || notice.type !== 'system'
          || notice.metadata?.receiptId !== receipt.id
          || notice.metadata?.companyId !== lead.company_id) throw fail('FB_INBOX_BACKFILL_EXISTING_CONFLICT');
      return 'receipt';
    }
    // A verified legacy Lead is preserved, not replayed into SQL702 (which
    // correctly rejects pre-existing ad/contact rows without a receipt).
    return 'legacyLinked';
  };
  const graph = async (version, nodeId, edge, fields, cursor, token) => {
    const url = new URL(`https://graph.facebook.com/${version}/${nodeId}/${edge}`);
    url.searchParams.set('fields', fields);
    url.searchParams.set('limit', String(PAGE_SIZE));
    if (cursor) url.searchParams.set('after', cursor);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    timer.unref?.();
    try {
      const response = await fetchImpl(url.toString(), {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        redirect: 'error', signal: controller.signal,
      });
      if (!response?.ok) throw fail('FB_INBOX_BACKFILL_GRAPH_UNAVAILABLE');
      const raw = await response.text();
      if (typeof raw !== 'string' || Buffer.byteLength(raw) > MAX_RESPONSE_BYTES) throw fail('FB_INBOX_BACKFILL_GRAPH_UNAVAILABLE');
      const body = JSON.parse(raw);
      if (!body || typeof body !== 'object' || Array.isArray(body) || body.error
          || !Array.isArray(body.data) || body.data.length > PAGE_SIZE) throw fail('FB_INBOX_BACKFILL_GRAPH_UNAVAILABLE');
      return body;
    } catch { throw fail('FB_INBOX_BACKFILL_GRAPH_UNAVAILABLE'); }
    finally { clearTimeout(timer); }
  };
  const pages = async (version, nodeId, edge, fields, token) => {
    const values = [];
    const seenCursors = new Set();
    let cursor;
    let totalCount;
    for (let i = 0; i < MAX_PAGES_PER_EDGE; i++) {
      gate();
      const result = await graph(version, nodeId, edge, fields, cursor, token);
      if (i === 0 && result.summary?.total_count !== undefined) {
        if (!Number.isSafeInteger(result.summary.total_count) || result.summary.total_count < 0) {
          throw fail('FB_INBOX_BACKFILL_GRAPH_COUNT_MISMATCH');
        }
        totalCount = result.summary.total_count;
      }
      values.push(...result.data);
      if (!result.paging?.next) {
        if (totalCount !== undefined && totalCount !== values.length) throw fail('FB_INBOX_BACKFILL_GRAPH_COUNT_MISMATCH');
        return values;
      }
      const next = result.paging?.cursors?.after;
      if (typeof next !== 'string' || !next || next.length > 2048 || seenCursors.has(next)) {
        throw fail('FB_INBOX_BACKFILL_GRAPH_PAGING_INVALID');
      }
      seenCursors.add(next);
      cursor = next;
    }
    throw fail('FB_INBOX_BACKFILL_GRAPH_PAGING_LIMIT');
  };

  return async function backfill({ from, to, expectedFormIds, expectedLeadCounts, apply = false }) {
    const start = utcTime(from);
    const end = utcTime(to);
    if (start >= end || end - start > 24 * 60 * 60 * 1000) throw fail('FB_INBOX_BACKFILL_WINDOW_INVALID');
    if (!Array.isArray(expectedFormIds) || !expectedFormIds.length || expectedFormIds.length > MAX_FORMS
        || expectedFormIds.some(formId => !id(formId)) || new Set(expectedFormIds).size !== expectedFormIds.length) {
      throw fail('FB_INBOX_BACKFILL_FORM_INVENTORY_INVALID');
    }
    if (!expectedLeadCounts || typeof expectedLeadCounts !== 'object' || Array.isArray(expectedLeadCounts)
        || Object.keys(expectedLeadCounts).length !== expectedFormIds.length
        || expectedFormIds.some(formId => !Object.hasOwn(expectedLeadCounts, formId)
          || !Number.isSafeInteger(expectedLeadCounts[formId]) || expectedLeadCounts[formId] < 0
          || expectedLeadCounts[formId] > MAX_MATCHED_LEADS)) {
      throw fail('FB_INBOX_BACKFILL_EXPECTED_COUNTS_INVALID');
    }
    if (typeof apply !== 'boolean') throw fail('FB_INBOX_BACKFILL_CONFIG_INVALID');
    const version = getGraphVersion();
    const token = getLeadGraphToken();
    const appId = getLeadAppId();
    if (typeof version !== 'string' || !/^v\d{1,2}\.\d+$/.test(version)
        || typeof token !== 'string' || !token.trim() || !id(appId)) throw fail('FB_INBOX_BACKFILL_CONFIG_INVALID');
    gate();
    await observedGate();
    let tokenInfo;
    try { tokenInfo = await getLeadTokenMetadata({ version, token, appId }); }
    catch { throw fail('FB_INBOX_BACKFILL_TOKEN_PROVENANCE_INVALID'); }
    if (!tokenInfo || tokenInfo.is_valid !== true || String(tokenInfo.app_id) !== appId
        || tokenInfo.type !== 'PAGE' || String(tokenInfo.profile_id) !== pageId
        || !Array.isArray(tokenInfo.scopes) || !tokenInfo.scopes.includes('leads_retrieval')) {
      throw fail('FB_INBOX_BACKFILL_TOKEN_PROVENANCE_INVALID');
    }
    const page = await dbRead(() => db.from('facebook_pages').select('page_id,is_active,access_token')
      .eq('page_id', pageId).maybeSingle());
    if (!page || page.page_id !== pageId || page.is_active !== true || page.access_token === token) {
      throw fail('FB_INBOX_BACKFILL_PAGE_SCOPE_INVALID');
    }
    const forms = await pages(version, pageId, 'leadgen_forms', 'id,page_id,status', token);
    if (forms.length > MAX_FORMS || forms.some(form => !id(form?.id) || form.page_id !== pageId)
        || new Set(forms.map(form => form.id)).size !== forms.length) throw fail('FB_INBOX_BACKFILL_FORM_INVENTORY_INVALID');
    const expected = new Set(expectedFormIds);
    if (forms.length !== expected.size || forms.some(form => !expected.has(form.id))) {
      throw fail('FB_INBOX_BACKFILL_FORM_INVENTORY_MISMATCH');
    }
    await assertBindingsInactive(expectedFormIds);
    const matched = [];
    const seenLeads = new Set();
    for (const form of forms) {
      await observedGate();
      const leads = await pages(version, form.id, 'leads', 'id,form_id,created_time,ad_id', token);
      let formCount = 0;
      for (const lead of leads) {
        if (!id(lead?.id) || lead.form_id !== form.id || typeof lead.created_time !== 'string'
            || !Number.isFinite(Date.parse(lead.created_time))
            || (lead.ad_id != null && !id(lead.ad_id)) || seenLeads.has(lead.id)) {
          throw fail('FB_INBOX_BACKFILL_LEAD_IDENTITY_INVALID');
        }
        seenLeads.add(lead.id);
        const created = Date.parse(lead.created_time);
        if (created < start || created > end) continue;
        formCount++;
        matched.push({ formId: form.id, leadgenId: lead.id, adId: lead.ad_id || null });
        if (matched.length > MAX_MATCHED_LEADS) throw fail('FB_INBOX_BACKFILL_MATCH_LIMIT');
      }
      if (formCount !== expectedLeadCounts[form.id]) throw fail('FB_INBOX_BACKFILL_GRAPH_COUNT_MISMATCH');
    }
    gate();
    await assertBindingsInactive(expectedFormIds);
    const missing = [];
    let receiptCount = 0;
    let legacyLinkedCount = 0;
    for (const lead of matched) {
      const kind = await classify(lead);
      if (kind === 'missing') missing.push(lead);
      if (kind === 'receipt') receiptCount++;
      if (kind === 'legacyLinked') legacyLinkedCount++;
    }
    const summary = { pageId, from, to, formCount: forms.length, graphLeadCount: matched.length,
      receiptCount, legacyLinkedCount, inboxConfirmedCount: 0,
      requiresLegacyReview: legacyLinkedCount > 0, applied: false };
    if (!apply) return summary;
    writeGate();
    // Graph retrieval is a separate trusted recovery source. It does not forge
    // a Meta webhook signature. Webhook and recovery rows may have different
    // event_keys; the immutable SQL702 receipt is the one-Lead CRM dedupe gate.
    const rows = missing.map(({ formId, leadgenId, adId }) => rowsFromBody({ object: 'page', entry: [{
      id: pageId, changes: [{ field: 'leadgen', value: {
        page_id: pageId, form_id: formId, leadgen_id: leadgenId,
        ...(adId ? { ad_id: adId } : {}), recovery_source: 'graph_cutover_v1',
      } }],
    }] })[0]);
    for (let offset = 0; offset < rows.length; offset += PAGE_SIZE) {
      await observedGate();
      writeGate();
      await assertBindingsInactive(expectedFormIds);
      const batch = rows.slice(offset, offset + PAGE_SIZE);
      let result;
      try { result = await withPrimary(async () => await db.rpc('facebook_page_inbox_enqueue_v1', { p_rows: batch })); }
      catch { throw fail('FB_INBOX_BACKFILL_ENQUEUE_UNCONFIRMED'); }
      writeGate();
      if (!result || result.error || result.data !== batch.length) throw fail('FB_INBOX_BACKFILL_ENQUEUE_UNCONFIRMED');
      const stored = await dbRead(() => db.from('facebook_page_inbox').select('event_key,page_id,payload,status')
        .in('event_key', batch.map(row => row.event_key)));
      if (!Array.isArray(stored) || stored.length !== batch.length || batch.some(row => {
        const actual = stored.find(item => item.event_key === row.event_key);
        return !actual || actual.page_id !== row.page_id || actual.status !== 'pending'
          || !isDeepStrictEqual(actual.payload, row.payload);
      })) throw fail('FB_INBOX_BACKFILL_COUNT_MISMATCH');
      summary.inboxConfirmedCount += batch.length;
    }
    writeGate();
    await assertBindingsInactive(expectedFormIds);
    if (summary.receiptCount + summary.legacyLinkedCount + summary.inboxConfirmedCount !== summary.graphLeadCount) {
      throw fail('FB_INBOX_BACKFILL_COUNT_MISMATCH');
    }
    summary.applied = true;
    return summary;
  };
}

module.exports = { createFacebookLeadAdsCutoverBackfill };
