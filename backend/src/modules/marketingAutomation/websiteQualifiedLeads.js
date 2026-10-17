'use strict';

// Read-only website proof. Only recorded manual or explicit stage-policy evidence qualifies.
const { createHash } = require('node:crypto');
const { readAll, linkedIdentities, normalizePhone } = require('./googleQualifiedConversions');
const { qualificationContext } = require('./qualificationContext');
const { EXTRA_COLUMNS, basicQualification, loadStageProof, stageQualificationReason } = require('./qualificationEvidence');
const { FBC, FBP, WEBSITE_API_KEY_NAME } = require('../../domain/websiteIntakeReceipt');
const DAY = 86400000, MAX_CATALOG_AGE = DAY, EVENT_MAX_AGE = 7 * DAY;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REQUEST = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID = /^\d{1,30}$/;
const CLICK = /^[A-Za-z0-9_-]{1,500}$/;
const SOURCE_KEYS = ['kenh', 'platform', 'campaign_id', 'adset_id', 'ad_id',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'gclid', 'fbclid', 'gbraid', 'wbraid', 'landing_url'];
const text = value => typeof value === 'string' ? value.trim() : '';
const time = value => typeof value === 'string' && value ? Date.parse(value) : NaN;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = code => Object.assign(Error(code), { code });
const unavailable = () => fail('SOURCE_UNAVAILABLE');
const normalizeAccountId = value => {
  const id = text(value).replace(/^act_/, '');
  return ID.test(id) ? id : null;
};
const canonicalPhone = value => normalizePhone(text(value).replace(/[\s().-]/g, '').replace(/^0084/, '+84'));
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const testSource = source => source?.is_test === true ||
  text(source?.utm_source).toLowerCase() === 'vpt_test' || /^VPT_TEST_/i.test(text(source?.gclid));
const metaPlatform = value => ({ fb: 'facebook', ig: 'instagram' })[text(value).toLowerCase()] || text(value).toLowerCase();

function siteUrl(value) {
  if (typeof value !== 'string' || value.length > 1000) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'vanphuthanh.net' || url.port ||
        url.username || url.password || url.search || url.hash) return null;
    const clean = 'https://vanphuthanh.net' + url.pathname;
    return value === clean ? clean : null;
  } catch { return null; }
}

// A timestamp is part of the matching evidence, never rebuilt from qualification time.
function matchingProof(receipt, nowMs) {
  const click = receipt.source?.fbclid, captured = time(receipt.captured_at);
  const submitted = time(receipt.submitted_at), fbc = receipt.fbc, fbp = receipt.fbp;
  if (typeof click !== 'string' || !CLICK.test(click) || !Number.isSafeInteger(captured) ||
      captured <= 0 || captured > submitted || captured > nowMs)
    return 'META_MATCHING_UNVERIFIED';
  const match = FBC.exec(fbc);
  if (!match || Number(match[1]) !== captured || match[2] !== click)
    return 'META_MATCHING_UNVERIFIED';
  if (fbp && (!FBP.test(fbp) ||
      Number(fbp.split('.')[2]) > submitted)) return 'META_MATCHING_UNVERIFIED';
  return null;
}

const eventColumns = 'id,company_id,canonical_lead_id,revision,status,contact_usable,need_in_scope,area_in_service,evidence_ref,actor_id,recorded_at,context_hash' + EXTRA_COLUMNS;
const leadColumns = 'id,company_id,type,is_test,customer_id,facebook_contact_id,phone,created_at,intake_attribution,website_intake,stage_id,pipeline_id';
const attrColumns = 'id,lead_id,customer_id,contact_id,company_id,kenh,platform,campaign_id,adset_id,ad_id,fb_campaign_id,fb_adset_id,fb_ad_id,fb_page_id,fb_form_id,fb_leadgen_id,utm_source,utm_medium,utm_campaign,utm_content,utm_term,gclid,fbclid,gbraid,wbraid,landing_url,cham_dau_luc';
const receiptColumns = 'id,company_id,lead_id,customer_id,api_key_id,form_id,site_host,submitted_at,saved_at,landing_url,source,fbc,fbp,captured_at,measurement_consent,consent_version';

async function buildWebsiteQualifiedLeads({ db, companyId, adAccountId, fromMs, toMs, nowMs }) {
  const account = normalizeAccountId(adAccountId);
  if (!UUID.test(companyId || '') || !account || !Number.isSafeInteger(fromMs) ||
      !Number.isSafeInteger(toMs) || !Number.isSafeInteger(nowMs) || fromMs > toMs || toMs > nowMs)
    throw fail('INVALID_RANGE');
  const diagnostics = { qualified_current: 0, exported: 0, delivery_ready: 0, delivery_held: 0,
    not_current_qualified: 0, invalid_qualification: 0, qualification_stale: 0, stage_policy_held: 0,
    qualification_before_source: 0, outside_window: 0, missing_or_test_lead: 0,
    identity_unknown: 0, identity_ambiguous: 0, duplicate_or_returning: 0, new_customer_unproven: 0,
    no_website_receipt: 0, projection_mismatch: 0, source_conflict: 0, test_source: 0,
    source_time_unknown: 0, source_out_of_scope: 0, paid_status_unverified: 0,
    ad_scope_unverified: 0, account_scope_unverified: 0, ad_catalog_stale: 0,
    consent_required: 0, matching_unverified: 0, event_expired: 0, non_meta_paid_source: 0 };
  const snapshots = [];
  async function read(build) {
    let rows;
    try { rows = await readAll(build); } catch { throw unavailable(); }
    snapshots.push({ build, rows });
    return rows;
  }
  function index(rows, scope = () => true, key = 'id') {
    const map = new Map();
    for (const row of rows) {
      if (!row || !text(row[key]) || !scope(row) || map.has(row[key])) throw unavailable();
      map.set(row[key], row);
    }
    return map;
  }
  const query = (table, columns) => db.from(table).select(columns, { count: 'exact' });
  const events = await read(() => query('p1_qualification_events', eventColumns)
    .eq('company_id', companyId).order('canonical_lead_id').order('revision').order('id'));
  index(events, row => row.company_id === companyId);
  const latest = new Map(), revisions = new Set();
  for (const event of events) {
    if (!UUID.test(event.id) || !UUID.test(event.canonical_lead_id) ||
        !Number.isInteger(event.revision) || event.revision < 1 ||
        !['PENDING', 'QUALIFIED', 'REJECTED'].includes(event.status)) throw unavailable();
    const key = event.canonical_lead_id + '|' + event.revision;
    if (revisions.has(key)) throw unavailable();
    revisions.add(key);
    if (!latest.has(event.canonical_lead_id) || latest.get(event.canonical_lead_id).revision < event.revision)
      latest.set(event.canonical_lead_id, event);
  }
  const leads = await read(() => query('crm_leads', leadColumns).eq('company_id', companyId).order('id'));
  index(leads, row => row.company_id === companyId && UUID.test(row.id));
  // Customers are shared. A company filter would hide an older master using the same phone.
  const masters = await read(() => query('customers', 'id,phone,created_at').order('id'));
  const customers = index(masters, row => UUID.test(row.id));
  const history = leads.filter(row => row.is_test !== true && ['lead', 'deal'].includes(row.type));
  const identityHistory = history.map(row => ({ ...row, phone: canonicalPhone(row.phone) || row.phone }));
  const identityCustomers = new Map([...customers].map(([id, row]) =>
    [id, { ...row, phone: canonicalPhone(row.phone) || row.phone }]));
  const { first, ambiguous } = linkedIdentities(identityHistory, identityCustomers);
  const attrs = await read(() => query('lead_attribution', attrColumns).eq('company_id', companyId).order('id'));
  index(attrs, row => row.company_id === companyId && UUID.test(row.id));
  const receipts = await read(() => query('website_intake_receipts', receiptColumns).eq('company_id', companyId).order('id'));
  index(receipts, row => row.company_id === companyId && UUID.test(row.id));
  const byLead = index(receipts, row => UUID.test(row.lead_id), 'lead_id');
  const integrationKeys = await read(() => query('external_api_keys', 'id,name,company_id,active')
    .eq('company_id', companyId).eq('name', WEBSITE_API_KEY_NAME).order('id'));
  index(integrationKeys, row => UUID.test(row.id) && row.company_id === companyId && row.name === WEBSITE_API_KEY_NAME);
  const activeKeys = integrationKeys.filter(row => row.active === true);
  const accounts = await read(() => query('fb_ad_accounts', 'ad_account_id,company_id,bat,lan_dong_bo_cuoi,ket_qua_cuoi')
    .eq('company_id', companyId).in('ad_account_id', [account, 'act_' + account]).order('ad_account_id'));
  index(accounts, row => row.company_id === companyId && normalizeAccountId(row.ad_account_id) === account, 'ad_account_id');
  const catalogRows = await read(() => query('fb_ad_catalog', 'ad_id,ad_account_id,company_id,campaign_id,nguon,dong_bo_luc')
    .in('ad_account_id', [account, 'act_' + account]).order('ad_id'));
  const catalog = index(catalogRows, row => normalizeAccountId(row.ad_account_id) === account, 'ad_id');
  const masterPhones = new Map();
  for (const master of masters) {
    const phone = canonicalPhone(master.phone);
    if (phone) { if (!masterPhones.has(phone)) masterPhones.set(phone, []); masterPhones.get(phone).push(master); }
  }

  function source(lead) {
    const receipt = byLead.get(lead.id);
    if (!receipt) return { reason: 'no_website_receipt' };
    const source = receipt.source;
    if (testSource(source) || testSource(lead.intake_attribution)) return { reason: 'test_source' };
    if (receipt.form_id !== '11116' || receipt.site_host !== 'vanphuthanh.net' ||
        !siteUrl(receipt.landing_url)) return { reason: 'source_out_of_scope' };
    const acquired = time(receipt.submitted_at), saved = time(receipt.saved_at), created = time(lead.created_at);
    if (!Number.isSafeInteger(acquired) || !Number.isSafeInteger(saved) || acquired > saved ||
        saved !== created || saved > nowMs) return { reason: 'source_time_unknown' };
    const touches = attrs.filter(row => row.lead_id === lead.id ||
      (!row.lead_id && ((lead.customer_id && row.customer_id === lead.customer_id) ||
        (lead.facebook_contact_id && row.contact_id === lead.facebook_contact_id))));
    const attr = touches[0];
    const metadata = { version: 1, request_id: receipt.id, form_id: receipt.form_id, site_host: receipt.site_host,
      submitted_at: new Date(acquired).toISOString(), landing_url: receipt.landing_url,
      captured_at: receipt.captured_at == null ? null : Number.isSafeInteger(time(receipt.captured_at))
        ? new Date(time(receipt.captured_at)).toISOString() : 'invalid',
      fbc: receipt.fbc, fbp: receipt.fbp, measurement_consent: receipt.measurement_consent,
      consent_version: receipt.consent_version,
      api_key_fingerprint: UUID.test(receipt.api_key_id || '') ? createHash('sha256').update(receipt.api_key_id.toLowerCase()).digest('hex') : null };
    if (!REQUEST.test(receipt.id) || activeKeys.length !== 1 || receipt.api_key_id !== activeKeys[0].id
        || receipt.customer_id !== lead.customer_id ||
        typeof receipt.measurement_consent !== 'boolean' || receipt.consent_version !== 'VPT_ADS_V1' ||
        ![receipt.fbc, receipt.fbp].every(value => value === null || typeof value === 'string') ||
        (receipt.measurement_consent === false && [receipt.fbc, receipt.fbp, receipt.captured_at].some(value => value != null)) ||
        !same(lead.website_intake, metadata) ||
        !object(source) || !same(source, lead.intake_attribution) ||
        Object.entries(source).some(([key, value]) => !SOURCE_KEYS.includes(key) || typeof value !== 'string' || value.length > 2048) ||
        source.kenh !== 'website' || source.landing_url !== receipt.landing_url ||
        touches.length !== 1 || attr.lead_id !== lead.id || attr.customer_id !== lead.customer_id ||
        attr.contact_id != null || attr.kenh !== 'website' || time(attr.cham_dau_luc) !== saved ||
        SOURCE_KEYS.filter(key => key !== 'kenh').some(key => text(attr[key]) !== text(source[key])) ||
        ['fb_page_id', 'fb_form_id', 'fb_leadgen_id'].some(key => text(attr[key])))
      return { reason: 'projection_mismatch' };
    const platform = metaPlatform(source.platform);
    if (['fb_campaign_id', 'fb_adset_id', 'fb_ad_id'].some((key, i) =>
      text(attr[key]) !== (['facebook', 'instagram'].includes(source.platform)
        ? text(source[['campaign_id', 'adset_id', 'ad_id'][i]]) : '')))
      return { reason: 'projection_mismatch' };
    // No legacy description fallback: this receipt is new, immutable evidence only.
    // Genuine Google/direct website customers remain visible, without claiming Meta attribution.
    const tagged = metaPlatform(source.utm_source), fb = ['facebook', 'instagram'].includes(platform);
    if ((source.fbclid && (source.gclid || source.gbraid || source.wbraid)) ||
        (fb && tagged && tagged !== platform) || (!fb && ['facebook', 'instagram'].includes(tagged)))
      return { reason: 'source_conflict' };
    let sourceHold = null;
    if (!fb || tagged !== platform ||
        !['paid', 'paid_social', 'cpc', 'ppc'].includes(text(source.utm_medium).toLowerCase()))
      sourceHold = 'NON_META_PAID_SOURCE';
    else if (!CLICK.test(text(source.fbclid))) sourceHold = 'META_MATCHING_UNVERIFIED';
    else if (!ID.test(source.ad_id || '') || !ID.test(source.campaign_id || '') ||
        (text(source.utm_campaign) && source.utm_campaign !== source.campaign_id) ||
        (text(source.utm_content) && source.utm_content !== source.ad_id)) sourceHold = 'META_AD_SCOPE_UNVERIFIED';
    else if (accounts.length !== 1) sourceHold = 'META_ACCOUNT_SCOPE_UNVERIFIED';
    else {
      const ad = catalog.get(source.ad_id), synced = time(ad?.dong_bo_luc);
      if (!ad || ad.nguon !== 'marketing_api' ||
          (ad.company_id != null && ad.company_id !== companyId) || ad.campaign_id !== source.campaign_id)
        sourceHold = 'META_AD_SCOPE_UNVERIFIED';
      else if (!Number.isSafeInteger(synced) || synced > nowMs) sourceHold = 'META_CATALOG_STALE';
    }
    return { receipt, acquired_ms: acquired, source_receipt_id: receipt.id, source_kind: 'website',
      landing_url: receipt.landing_url, ad_id: source.ad_id || null, ad_account_id: 'act_' + account, source_hold: sourceHold };
  }
  function deliveryGate(source) {
    const r = source.receipt, accountRow = accounts[0];
    if (source.source_hold) return source.source_hold;
    if (r.measurement_consent !== true || r.consent_version !== 'VPT_ADS_V1') return 'META_CONSENT_REQUIRED';
    const match = matchingProof(r, nowMs);
    if (match) return match;
    if (accountRow.bat !== true || accountRow.ket_qua_cuoi?.ok !== true ||
        !Number.isSafeInteger(time(accountRow.lan_dong_bo_cuoi)) || time(accountRow.lan_dong_bo_cuoi) > nowMs ||
        nowMs - time(accountRow.lan_dong_bo_cuoi) > MAX_CATALOG_AGE) return 'META_ACCOUNT_STALE';
    if (nowMs - time(catalog.get(source.ad_id).dong_bo_luc) > MAX_CATALOG_AGE) return 'META_CATALOG_STALE';
    return null;
  }
  const rows = [], reconciliationRows = [];
  const stageProof = await loadStageProof({ db, events: [...latest.values()], leads, read });
  for (const lead of history) {
    const event = latest.get(lead.id);
    if (!event || event.status !== 'QUALIFIED') { diagnostics.not_current_qualified++; continue; }
    if (lead.is_test !== false) { diagnostics.missing_or_test_lead++; continue; }
    const qualified = time(event.recorded_at), customer = customers.get(lead.customer_id);
    if (!UUID.test(event.actor_id || '') || !basicQualification(event) || !Number.isSafeInteger(qualified)) {
      diagnostics.invalid_qualification++; continue;
    }
    diagnostics.qualified_current++;
    if (event.context_hash !== qualificationContext(lead, customer)) { diagnostics.qualification_stale++; continue; }
    const stageReason = stageQualificationReason(event, lead, stageProof);
    if (stageReason) { diagnostics[stageReason]++; continue; }
    if (ambiguous.has(lead.id)) { diagnostics.identity_ambiguous++; continue; }
    if (!first.has(lead.id)) { diagnostics.identity_unknown++; continue; }
    if (first.get(lead.id) !== lead.id) { diagnostics.duplicate_or_returning++; continue; }
    const s = source(lead);
    if (s.reason) { diagnostics[s.reason]++; continue; }
    const customerCreated = time(customer?.created_at), phone = canonicalPhone(customer?.phone);
    if (!phone || !Number.isSafeInteger(customerCreated) || customerCreated < s.acquired_ms ||
        customerCreated > time(lead.created_at) ||
        (masterPhones.get(phone) || []).some(other => other.id !== customer.id &&
          (!Number.isSafeInteger(time(other.created_at)) || time(other.created_at) <= customerCreated))) {
      diagnostics.new_customer_unproven++; continue;
    }
    if (qualified <= Math.max(s.acquired_ms, time(lead.created_at)) || qualified > nowMs) {
      diagnostics.qualification_before_source++; continue;
    }
    const { receipt: r, source_hold: sourceHold, ...facts } = s;
    const historicalHold = sourceHold || (r.measurement_consent !== true || r.consent_version !== 'VPT_ADS_V1'
      ? 'META_CONSENT_REQUIRED' : matchingProof(r, nowMs));
    const base = { ...facts, lead_id: lead.id, company_id: companyId,
      identity_key: createHash('sha256').update(companyId + '|' + first.get(lead.id)).digest('hex'),
      qualification_id: event.id, qualification_revision: event.revision,
      qualification_method: event.qualification_method || 'manual_v1',
      context_hash: qualificationContext(lead, customer), qualified_ms: qualified,
      fbc: r.fbc || null, fbp: r.fbp || null, fbclid: r.source.fbclid,
      captured_at: r.captured_at || null, captured_ms: Number.isSafeInteger(time(r.captured_at)) ? time(r.captured_at) : null,
      measurement_consent: r.measurement_consent === true, consent_version: r.consent_version,
      delivery_supported: !historicalHold, hold_reason: historicalHold || null };
    if (!sourceHold) reconciliationRows.push(base);
    if (qualified < fromMs || qualified > toMs) { diagnostics.outside_window++; continue; }
    let hold = deliveryGate(s);
    if (!hold && nowMs - qualified > EVENT_MAX_AGE) hold = 'META_EVENT_EXPIRED';
    if (hold) {
      const key = { META_CONSENT_REQUIRED: 'consent_required', META_MATCHING_UNVERIFIED: 'matching_unverified',
        META_ACCOUNT_STALE: 'account_scope_unverified', META_CATALOG_STALE: 'ad_catalog_stale',
        META_EVENT_EXPIRED: 'event_expired', NON_META_PAID_SOURCE: 'non_meta_paid_source',
        META_AD_SCOPE_UNVERIFIED: 'ad_scope_unverified', META_ACCOUNT_SCOPE_UNVERIFIED: 'account_scope_unverified' }[hold];
      diagnostics[key]++;
    }
    rows.push({ ...base, delivery_supported: !hold, hold_reason: hold || null });
  }
  // Primary/authorization belong to the caller. Multi-query proof is not a transaction
  // snapshot; enqueue/send must recheck current state. Revocation is re-read last.
  for (const snapshot of [...snapshots.slice(1), snapshots[0]]) {
    let checked;
    try { checked = await readAll(snapshot.build); } catch { throw unavailable(); }
    if (!same(checked, snapshot.rows)) throw unavailable();
  }
  const sorted = (a, b) => a.qualified_ms - b.qualified_ms || a.identity_key.localeCompare(b.identity_key);
  rows.sort(sorted); reconciliationRows.sort(sorted);
  diagnostics.exported = rows.length;
  diagnostics.delivery_ready = rows.filter(row => row.delivery_supported).length;
  diagnostics.delivery_held = rows.length - diagnostics.delivery_ready;
  return { rows, diagnostics, reconciliationRows, reconciliationComplete: true };
}

module.exports = { buildWebsiteQualifiedLeads, normalizeAccountId, canonicalPhone,
  matchingProof, MAX_CATALOG_AGE, EVENT_MAX_AGE };
