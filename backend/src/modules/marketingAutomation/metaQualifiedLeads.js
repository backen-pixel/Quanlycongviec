'use strict';

// Read-only source gate. Never infer a paid touch, PSID or qualification from a stage.
const { createHash } = require('node:crypto');
const { readAll, linkedIdentities, normalizePhone } = require('./googleQualifiedConversions');
const { qualificationContext } = require('./qualificationContext');
const { receiptKey } = require('../../helpers/facebookMessengerReceipt');
const DAY = 86400000, MAX_CATALOG_AGE = DAY, EVENT_MAX_AGE = 7 * DAY;
const ID = /^\d{1,32}$/;
const text = value => typeof value === 'string' ? value.trim() : '';
const time = value => typeof value === 'string' && value ? Date.parse(value) : NaN;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = code => Object.assign(Error(code), { code });
const unavailable = () => fail('SOURCE_UNAVAILABLE');
const normalizeAccountId = value => {
  const id = text(value).replace(/^act_/, '');
  return ID.test(id) ? id : null;
};
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const testSource = value => value?.is_test === true ||
  text(value?.utm_source).toLowerCase() === 'vpt_test' || /^VPT_TEST_/i.test(text(value?.gclid));
const facebookPlatform = value => ['facebook', 'fb'].includes(value);
// Match the existing intake SQL's 0084 normalization without changing Google behavior.
const canonicalPhone = value => normalizePhone(text(value).replace(/[\s().-]/g, '').replace(/^0084/, '+84'));
const eventColumns = 'id,company_id,canonical_lead_id,revision,status,contact_usable,need_in_scope,area_in_service,evidence_ref,actor_id,recorded_at,context_hash';
const leadColumns = 'id,company_id,type,is_test,customer_id,facebook_contact_id,phone,created_at,intake_attribution';
const attrColumns = 'id,lead_id,customer_id,contact_id,company_id,kenh,platform,fb_page_id,fb_form_id,fb_leadgen_id,fb_ad_id,fb_source,gclid,gbraid,wbraid,utm_source,cham_dau_luc,created_at,raw';

// A changed row, exact-count failure or server cap invalidates the entire preview.
// The caller pins primary DB and authorization; this module only reads minimal fields.
async function buildMetaQualifiedLeads({ db, companyId, adAccountId, pageIds, fromMs, toMs, nowMs }) {
  const account = normalizeAccountId(adAccountId);
  const pages = Array.isArray(pageIds) || pageIds instanceof Set ? [...new Set(pageIds)] : [];
  if (!text(companyId) || !account || !pages.length || pages.length > 100 ||
      pages.some(page => !ID.test(page)) || !Number.isFinite(fromMs) || !Number.isFinite(toMs) ||
      !Number.isFinite(nowMs) || fromMs > toMs || toMs > nowMs)
    throw fail('INVALID_RANGE');
  const diagnostics = { qualified_current: 0, exported: 0, intake_eligible: 0,
    not_current_qualified: 0, invalid_qualification: 0, qualification_stale: 0,
    qualification_before_source: 0, outside_window: 0, missing_or_test_lead: 0,
    identity_unknown: 0, identity_ambiguous: 0, duplicate_or_returning: 0, new_customer_unproven: 0,
    no_meta_source: 0, source_conflict: 0, test_source: 0, projection_mismatch: 0,
    source_time_unknown: 0, source_out_of_scope: 0, paid_status_unverified: 0,
    ad_scope_unverified: 0, ad_catalog_stale: 0, account_scope_unverified: 0,
    messenger_receipt_unverified: 0, messenger_mapping_unverified: 0, intake_too_old: 0 };
  const snapshots = [];
  async function read(build) {
    let rows;
    try { rows = await readAll(build); } catch { throw unavailable(); }
    snapshots.push({ build, rows });
    return rows;
  }
  function index(rows, scope = () => true, key = 'id') {
    const result = new Map();
    for (const row of rows) {
      if (!row || !text(row[key]) || !scope(row) || result.has(row[key])) throw unavailable();
      result.set(row[key], row);
    }
    return result;
  }
  const query = (table, columns) => db.from(table).select(columns, { count: 'exact' });
  const events = await read(() => query('p1_qualification_events', eventColumns)
    .eq('company_id', companyId).order('canonical_lead_id').order('revision').order('id'));
  index(events, row => row.company_id === companyId);
  const latest = new Map(), revisions = new Set();
  for (const event of events) {
    if (!text(event.canonical_lead_id) || !Number.isInteger(event.revision) || event.revision < 1 ||
        !['PENDING', 'QUALIFIED', 'REJECTED'].includes(event.status)) throw unavailable();
    const key = event.canonical_lead_id + '|' + event.revision;
    if (revisions.has(key)) throw unavailable();
    revisions.add(key);
    if (!latest.has(event.canonical_lead_id) || latest.get(event.canonical_lead_id).revision < event.revision)
      latest.set(event.canonical_lead_id, event);
  }
  const leads = await read(() => query('crm_leads', leadColumns).eq('company_id', companyId).order('id'));
  index(leads, row => row.company_id === companyId);
  // Shared masters: no company filter that could hide an old master with the same phone.
  // If a bounded scan cannot prove completeness, no "new customer" is released.
  const masters = await read(() => query('customers', 'id,phone,created_at').order('id'));
  const customers = index(masters);
  const history = leads.filter(row => row.is_test !== true && ['lead', 'deal'].includes(row.type));
  const identityHistory = history.map(row => ({ ...row, phone: canonicalPhone(row.phone) || row.phone }));
  const identityCustomers = new Map([...customers].map(([id, row]) =>
    [id, { ...row, phone: canonicalPhone(row.phone) || row.phone }]));
  const { first, ambiguous } = linkedIdentities(identityHistory, identityCustomers);
  const attrs = await read(() => query('lead_attribution', attrColumns).eq('company_id', companyId).order('id'));
  index(attrs, row => row.company_id === companyId);
  const receipts = await read(() => query('facebook_lead_ads_intake_receipts',
    'id,company_id,page_id,form_id,leadgen_id,inbox_id,lead_id,customer_id,contact_id,attribution_id,lead_ad_id,lead_data,provider_data,created_at')
    .eq('company_id', companyId).order('id'));
  index(receipts, row => row.company_id === companyId);
  const pageRecords = await read(() => query('facebook_pages', 'page_id,default_company_id,is_active')
    .in('page_id', pages).order('page_id'));
  const byPage = index(pageRecords, row => pages.includes(row.page_id), 'page_id');
  const accounts = await read(() => query('fb_ad_accounts', 'ad_account_id,company_id,bat,lan_dong_bo_cuoi,ket_qua_cuoi')
    .eq('company_id', companyId).in('ad_account_id', [account, 'act_' + account]).order('ad_account_id'));
  index(accounts, row => row.company_id === companyId && normalizeAccountId(row.ad_account_id) === account, 'ad_account_id');
  const catalogRows = await read(() => query('fb_ad_catalog', 'ad_id,ad_account_id,company_id,page_id,nguon,dong_bo_luc')
    .eq('company_id', companyId).in('ad_account_id', [account, 'act_' + account]).order('ad_id'));
  const catalog = index(catalogRows, row => row.company_id === companyId &&
    normalizeAccountId(row.ad_account_id) === account, 'ad_id');
  const inbox = await read(() => query('facebook_page_inbox', 'id,event_key,page_id,payload,status,created_at')
    .in('page_id', pages).order('id'));
  const byInbox = index(inbox, row => pages.includes(row.page_id));
  const contactIds = [...new Set(history.map(row => row.facebook_contact_id).filter(Boolean))];
  const adIds = [...new Set(receipts.map(row => row.lead_ad_id).filter(Boolean))];
  async function byIds(table, columns, ids) {
    const records = [];
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);
      const rows = await read(() => query(table, columns).in('id', batch).order('id'));
      if (rows.some(row => !batch.includes(row.id))) throw unavailable();
      records.push(...rows);
    }
    return index(records);
  }
  const contacts = await byIds('facebook_contacts', 'id,page_id,psid,lead_id,customer_id,phone,created_at', contactIds);
  const leadAds = await byIds('facebook_lead_ads', 'id,page_id,form_id,leadgen_id,lead_id,customer_id,processed,raw_data', adIds);
  const masterPhones = new Map();
  for (const master of masters) {
    const phone = canonicalPhone(master.phone);
    if (phone) { if (!masterPhones.has(phone)) masterPhones.set(phone, []); masterPhones.get(phone).push(master); }
  }
  const validInbox = row => {
    if (!row || !object(row.payload) || !object(row.payload.event) ||
        !['messaging', 'change', 'entry'].includes(row.payload.kind)) return false;
    const expected = createHash('sha256').update(JSON.stringify({ pageId: row.page_id,
      payload: canonical(row.payload) })).digest('hex');
    return row.event_key === expected && row.status === 'done';
  };
  // Ownership evidence can remain true after delivery freshness expires.
  // Historical arrays are only for reconciling accepted events, never enqueue.
  function adProof(adId, page) {
    if (accounts.length !== 1) return 'account_scope_unverified';
    const ad = catalog.get(adId);
    if (!ID.test(adId || '') || !ad || ad.nguon !== 'marketing_api' ||
        (ad.page_id && ad.page_id !== page)) return 'ad_scope_unverified';
    const sync = time(ad.dong_bo_luc);
    if (!Number.isFinite(sync) || sync > nowMs) return 'ad_catalog_stale';
    return null;
  }
  function deliveryGate(adId, page) {
    if (byPage.get(page)?.is_active !== true) return 'source_out_of_scope';
    if (accounts[0].bat !== true ||
        accounts[0].ket_qua_cuoi?.ok !== true ||
        !Number.isFinite(time(accounts[0].lan_dong_bo_cuoi)) ||
        time(accounts[0].lan_dong_bo_cuoi) > nowMs ||
        nowMs - time(accounts[0].lan_dong_bo_cuoi) > MAX_CATALOG_AGE) return 'account_scope_unverified';
    const ad = catalog.get(adId);
    const sync = time(ad.dong_bo_luc);
    if (nowMs - sync > MAX_CATALOG_AGE) return 'ad_catalog_stale';
    return null;
  }
  function sharedProjection(lead, attr, sourcePage) {
    const customer = customers.get(lead.customer_id), contact = contacts.get(lead.facebook_contact_id);
    if (!attr || !customer || !contact || attr.lead_id !== lead.id || attr.customer_id !== customer.id ||
        attr.contact_id !== contact.id || contact.customer_id !== customer.id || contact.lead_id !== lead.id ||
        contact.page_id !== sourcePage || attr.fb_page_id !== sourcePage ||
        (contact.phone && canonicalPhone(contact.phone) !== canonicalPhone(customer.phone)))
      return 'projection_mismatch';
    const page = byPage.get(sourcePage);
    if (!pages.includes(sourcePage) || !page || page.default_company_id !== companyId)
      return 'source_out_of_scope';
    return null;
  }
  function source(lead) {
    const touches = attrs.filter(row => row.lead_id === lead.id ||
      (!row.lead_id && ((lead.customer_id && row.customer_id === lead.customer_id) ||
        (lead.facebook_contact_id && row.contact_id === lead.facebook_contact_id))));
    const form = receipts.filter(row => row.lead_id === lead.id);
    if (!touches.length && !form.length) return { reason: 'no_meta_source' };
    if (testSource(lead.intake_attribution) || touches.some(row => testSource(row) || testSource(row.raw)) ||
        form.some(row => testSource(row.provider_data) || testSource(row.lead_data))) return { reason: 'test_source' };
    const attr = touches[0];
    if (touches.length !== 1 || !['lead_ads', 'messenger'].includes(attr?.kenh) ||
        !facebookPlatform(attr.platform) || attr.gclid || attr.gbraid || attr.wbraid ||
        (attr.utm_source && !['facebook', 'fb', 'meta'].includes(attr.utm_source.toLowerCase())) ||
        (lead.intake_attribution != null && (lead.intake_attribution.kenh !== attr.kenh ||
          !facebookPlatform(lead.intake_attribution.platform) || lead.intake_attribution.gclid ||
          lead.intake_attribution.gbraid || lead.intake_attribution.wbraid ||
          (lead.intake_attribution.ad_id && lead.intake_attribution.ad_id !== attr.fb_ad_id) ||
          (lead.intake_attribution.utm_source && !['facebook', 'fb', 'meta'].includes(
            text(lead.intake_attribution.utm_source).toLowerCase())) || testSource(lead.intake_attribution))))
      return { reason: 'source_conflict' };
    let acquired, sourceId, leadgen = null, psid = null;
    if (attr.kenh === 'lead_ads') {
      if (form.length !== 1) return { reason: 'projection_mismatch' };
      const r = form[0], provider = r.provider_data, ad = leadAds.get(r.lead_ad_id), item = byInbox.get(r.inbox_id);
      const shared = sharedProjection(lead, attr, r.page_id);
      if (shared) return { reason: shared };
      const contact = contacts.get(lead.facebook_contact_id), value = item?.payload?.event?.value;
      if (!ID.test(r.leadgen_id) || !ID.test(r.form_id) || !object(provider) ||
          provider.id !== r.leadgen_id || provider.form_id !== r.form_id || provider.form_page_id !== r.page_id ||
          !Array.isArray(provider.field_data) || !provider.field_data.length ||
          (provider.platform != null && provider.platform !== attr.platform) ||
          r.customer_id !== lead.customer_id || r.contact_id !== contact.id || r.attribution_id !== attr.id ||
          contact.psid !== 'leadad_' + r.leadgen_id || attr.fb_form_id !== r.form_id ||
          attr.fb_leadgen_id !== r.leadgen_id || provider.ad_id !== attr.fb_ad_id ||
          !ad || ad.page_id !== r.page_id || ad.form_id !== r.form_id || ad.leadgen_id !== r.leadgen_id ||
          ad.lead_id !== lead.id || ad.customer_id !== lead.customer_id || ad.processed !== true ||
          !same(ad.raw_data, provider) || attr.raw?.intake_receipt_id !== r.id ||
          attr.raw?.acquired_time_known !== true || !same(attr.raw?.provider_data, provider) ||
          canonicalPhone(r.lead_data?.phone) !== canonicalPhone(customers.get(lead.customer_id)?.phone) ||
          !validInbox(item) || item.page_id !== r.page_id || item.payload.kind !== 'change' ||
          item.payload.event.field !== 'leadgen' || value?.leadgen_id !== r.leadgen_id ||
          value?.form_id !== r.form_id || (value.page_id !== undefined && value.page_id !== r.page_id) ||
          (value.ad_id !== undefined && value.ad_id !== provider.ad_id))
        return { reason: 'projection_mismatch' };
      if (provider.is_organic !== false) return { reason: 'paid_status_unverified' };
      acquired = time(provider.created_time); sourceId = r.id; leadgen = r.leadgen_id;
      if (!Number.isFinite(acquired) || time(attr.cham_dau_luc) !== acquired)
        return { reason: 'source_time_unknown' };
    } else {
      if (form.length) return { reason: 'source_conflict' };
      const contact = contacts.get(lead.facebook_contact_id);
      const shared = sharedProjection(lead, attr, attr.fb_page_id);
      if (shared) return { reason: shared };
      if (!ID.test(contact.psid) || (attr.fb_source && attr.fb_source !== 'ADS'))
        return { reason: 'messenger_receipt_unverified' };
      const messages = inbox.filter(row => row.page_id === contact.page_id && row.payload?.kind === 'messaging' &&
        row.payload.event?.sender?.id === contact.psid && row.payload.event?.message?.is_echo !== true);
      const evidence = attr.raw?.messenger_first_evidence;
      const matches = messages.filter(row => receiptKey(row.page_id, row.payload.event) === evidence?.event_key);
      if (matches.length !== 1) return { reason: 'messenger_receipt_unverified' };
      const item = matches[0], event = item.payload.event;
      const referral = event.referral || event.message?.referral || event.postback?.referral;
      acquired = event.timestamp; sourceId = item.id; psid = contact.psid;
      if (!validInbox(item) || event.recipient?.id !== contact.page_id || !object(referral) ||
          referral.source !== 'ADS' || referral.ad_id !== attr.fb_ad_id || evidence?.ad_id !== attr.fb_ad_id ||
          !Number.isSafeInteger(acquired) || acquired <= 0 ||
          messages.some(row => !Number.isSafeInteger(row.payload.event.timestamp) ||
            (row.id !== item.id && row.payload.event.timestamp <= acquired)) ||
          time(evidence?.recorded_at) < acquired || !Number.isFinite(time(evidence?.recorded_at)) ||
          time(evidence.recorded_at) > time(lead.created_at))
        return { reason: 'messenger_receipt_unverified' };
    }
    const received = time(lead.created_at);
    if (!Number.isFinite(acquired) || !Number.isFinite(received) || acquired > received || received > nowMs)
      return { reason: 'source_time_unknown' };
    const reason = adProof(attr.fb_ad_id, attr.fb_page_id);
    if (reason) return { reason };
    return { source_receipt_id: sourceId, page_id: attr.fb_page_id, source_kind: attr.kenh,
      fb_leadgen_id: leadgen, psid, ad_id: attr.fb_ad_id, ad_account_id: 'act_' + account, acquired_ms: acquired,
      delivery_reason: deliveryGate(attr.fb_ad_id, attr.fb_page_id),
      delivery_supported: attr.kenh === 'lead_ads',
      hold_reason: attr.kenh === 'messenger' ? 'MESSENGER_MAPPING_UNVERIFIED' : null };
  }
  const rows = [], intakeRows = [], reconciliationRows = [], reconciliationIntakeRows = [];
  for (const lead of history) {
    if (lead.is_test !== false) { diagnostics.missing_or_test_lead++; continue; }
    if (ambiguous.has(lead.id)) { diagnostics.identity_ambiguous++; continue; }
    if (!first.has(lead.id)) { diagnostics.identity_unknown++; continue; }
    if (first.get(lead.id) !== lead.id) { diagnostics.duplicate_or_returning++; continue; }
    const s = source(lead);
    if (s.reason) { diagnostics[s.reason]++; continue; }
    const customer = customers.get(lead.customer_id), customerCreated = time(customer?.created_at);
    const phone = canonicalPhone(customer?.phone);
    if (!phone || !Number.isFinite(customerCreated) || customerCreated < s.acquired_ms ||
        customerCreated > time(lead.created_at) ||
        (masterPhones.get(phone) || []).some(other => other.id !== customer.id &&
          (!Number.isFinite(time(other.created_at)) || time(other.created_at) <= customerCreated))) {
      diagnostics.new_customer_unproven++; continue;
    }
    const { delivery_reason: deliveryReason, ...sourceFacts } = s;
    const base = { ...sourceFacts, lead_id: lead.id,
      identity_key: createHash('sha256').update(companyId + '|' + first.get(lead.id)).digest('hex'),
      qualification_id: null, qualification_revision: null, qualified_ms: null,
      context_hash: qualificationContext(lead, customer) };
    if (deliveryReason) diagnostics[deliveryReason]++;
    if (s.source_kind === 'lead_ads') reconciliationIntakeRows.push({ ...base });
    if (!deliveryReason && s.source_kind === 'lead_ads' && s.acquired_ms >= fromMs && s.acquired_ms <= toMs) {
      if (nowMs - s.acquired_ms <= EVENT_MAX_AGE) intakeRows.push({ ...base });
      else diagnostics.intake_too_old++;
    }
    const event = latest.get(lead.id);
    if (!event || event.status !== 'QUALIFIED') { diagnostics.not_current_qualified++; continue; }
    const qualified = time(event.recorded_at);
    if (!text(event.actor_id) || !text(event.evidence_ref) || event.contact_usable !== true ||
        event.need_in_scope !== true || event.area_in_service !== true || !Number.isFinite(qualified)) {
      diagnostics.invalid_qualification++; continue;
    }
    diagnostics.qualified_current++;
    if (event.context_hash !== base.context_hash) { diagnostics.qualification_stale++; continue; }
    if (qualified <= Math.max(s.acquired_ms, time(lead.created_at)) || qualified > nowMs) {
      diagnostics.qualification_before_source++; continue;
    }
    const qualifiedRow = { ...base, qualification_id: event.id, qualification_revision: event.revision, qualified_ms: qualified };
    reconciliationRows.push(qualifiedRow);
    if (qualified < fromMs || qualified > toMs) { diagnostics.outside_window++; continue; }
    if (!deliveryReason) {
      rows.push({ ...qualifiedRow });
      if (!s.delivery_supported) diagnostics.messenger_mapping_unverified++;
    }
  }
  // No writer/repair here. Re-read all mutable projections and sources before releasing rows.
  // Qualification is append-only and is checked last, after projection checks.
  // The enqueue/send application must still validate latest state atomically;
  // a read-only multi-query builder is not a database snapshot transaction.
  for (const snapshot of [...snapshots.slice(1), snapshots[0]]) {
    let checked;
    try { checked = await readAll(snapshot.build); } catch { throw unavailable(); }
    if (!same(checked, snapshot.rows)) throw unavailable();
  }
  rows.sort((a, b) => a.qualified_ms - b.qualified_ms || a.identity_key.localeCompare(b.identity_key));
  intakeRows.sort((a, b) => a.acquired_ms - b.acquired_ms || a.identity_key.localeCompare(b.identity_key));
  reconciliationRows.sort((a, b) => a.qualified_ms - b.qualified_ms || a.identity_key.localeCompare(b.identity_key));
  reconciliationIntakeRows.sort((a, b) => a.acquired_ms - b.acquired_ms || a.identity_key.localeCompare(b.identity_key));
  diagnostics.exported = rows.length; diagnostics.intake_eligible = intakeRows.length;
  return { rows, intakeRows, reconciliationRows, reconciliationIntakeRows,
    reconciliationComplete: true, diagnostics };
}

module.exports = { buildMetaQualifiedLeads, normalizeAccountId, canonicalPhone, MAX_CATALOG_AGE, EVENT_MAX_AGE };
