'use strict';

// Deliberately separate from the sales-stage/call proxy. Read-only, no guessed call matching.
const { createHash } = require('node:crypto');
const { parseVptV1Description, formatVietnamTime, maskGclid } = require('./googleOfflineConversions');
const { qualificationContext } = require('./qualificationContext');
const CONVERSION_NAME = 'VPT CRM - Lead hop le da xac minh';
const CSV_HEADER = 'Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency,Order ID';
const PAGE = 500, MAX_PAGES = 100;
const GCLID = /^[A-Za-z0-9_-]{8,512}$/;
const LEGACY_GCLID = /^[A-Za-z0-9_-]{20,200}$/;
const text = value => typeof value === 'string' ? value.trim() : '';
const time = value => value ? Date.parse(value) : NaN;
const qa = row => text(row?.utm_source).toLowerCase() === 'vpt_test' || /^VPT_TEST_/i.test(text(row?.gclid));
const unavailable = () => Error('SOURCE_UNAVAILABLE');

// Exact counts catch server row caps and source changes between pages; never return a partial export.
async function readAll(build) {
  const rows = []; let total;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error, count } = await build().range(page * PAGE, (page + 1) * PAGE - 1);
    if (error || !Array.isArray(data) || !Number.isSafeInteger(count) || count < 0 ||
        data.length > PAGE || (total !== undefined && total !== count)) throw unavailable();
    total = count; rows.push(...data);
    if (rows.length > total) throw unavailable();
    if (data.length < PAGE || rows.length === total) {
      if (rows.length !== total) throw unavailable();
      return rows;
    }
  }
  throw unavailable();
}

function sourceForLead(lead, touches) {
  const legacy = parseVptV1Description(lead.description);
  if (legacy?.test || qa(legacy)) return { reason: 'test_source' };
  if (text(legacy?.utm_source) && text(legacy.utm_source).toLowerCase() !== 'google')
    return { reason: 'source_conflict' };
  const receipts = [lead.intake_attribution, ...touches].filter(Boolean);
  if (receipts.some(row => qa(row))) return { reason: 'test_source' };
  if (receipts.some(row => row.kenh !== 'website' ||
      (text(row.platform) && text(row.platform).toLowerCase() !== 'google') ||
      (text(row.utm_source) && text(row.utm_source).toLowerCase() !== 'google') || text(row.fbclid)))
    return { reason: 'source_conflict' };
  if (touches.some(row => row.company_id !== lead.company_id ||
      (row.customer_id && row.customer_id !== lead.customer_id))) return { reason: 'source_conflict' };
  const clickIds = new Set([...receipts.map(row => text(row.gclid)), text(legacy?.gclid)].filter(Boolean));
  if (clickIds.size > 1) return { reason: 'source_conflict' };
  let source, sourceTime, kind;
  if (lead.intake_attribution != null) {
    source = lead.intake_attribution; sourceTime = time(lead.created_at); kind = 'immutable_intake';
  } else if (touches.length) {
    if (touches.length !== 1 || touches[0].company_id !== lead.company_id ||
        (touches[0].customer_id && touches[0].customer_id !== lead.customer_id))
      return { reason: 'source_conflict' };
    source = touches[0]; sourceTime = time(source.cham_dau_luc); kind = 'structured_attribution';
  } else if (legacy) {
    if (!Number.isFinite(legacy.submit_ms)) return { reason: 'source_time_unknown' };
    source = { ...legacy, kenh: 'website' }; sourceTime = legacy.submit_ms; kind = 'legacy_form_notes';
  } else return { reason: 'no_website_source' };
  if (qa(source)) return { reason: 'test_source' };
  if (source.kenh !== 'website') return { reason: 'no_website_source' };
  const gclid = text(source.gclid);
  if (!gclid) return { reason: source.gbraid || source.wbraid ? 'braid_only' : 'no_gclid' };
  if (!(kind === 'legacy_form_notes' ? LEGACY_GCLID : GCLID).test(gclid)) return { reason: 'invalid_gclid' };
  if (!Number.isFinite(sourceTime)) return { reason: 'source_time_unknown' };
  return { gclid, sourceTime, kind };
}

function normalizePhone(value) {
  const raw = text(value).replace(/[\s().-]/g, '');
  if (/^0\d{9,10}$/.test(raw)) return `+84${raw.slice(1)}`;
  if (/^84\d{9,10}$/.test(raw)) return `+${raw}`;
  return /^\+[1-9]\d{7,14}$/.test(raw) ? raw : null;
}

function linkedIdentities(leads, customers = new Map()) {
  const parent = new Map();
  const root = key => { if (!parent.has(key)) parent.set(key, key);
    let p = key; while (parent.get(p) !== p) p = parent.get(p);
    while (key !== p) { const next = parent.get(key); parent.set(key, p); key = next; } return p; };
  const keys = lead => [...new Set([lead.customer_id && `customer:${lead.customer_id}`,
    lead.facebook_contact_id && `contact:${lead.facebook_contact_id}`,
    normalizePhone(lead.phone) && `phone:${normalizePhone(lead.phone)}`,
    normalizePhone(customers.get(lead.customer_id)?.phone) && `phone:${normalizePhone(customers.get(lead.customer_id)?.phone)}`].filter(Boolean))];
  for (const lead of leads) {
    const k = keys(lead); if (k.length) { root(k[0]); for (const key of k.slice(1)) parent.set(root(key), root(k[0])); }
  }
  const groups = new Map();
  for (const lead of leads) {
    const k = keys(lead); if (!k.length) continue;
    const id = root(k[0]); if (!groups.has(id)) groups.set(id, []); groups.get(id).push(lead);
  }
  const first = new Map(), ambiguous = new Set();
  for (const group of groups.values()) {
    const phones = new Set(group.flatMap(row => keys(row).filter(key => key.startsWith('phone:'))));
    if (phones.size > 1 || group.some(row => !Number.isFinite(time(row.created_at)) || row.is_test !== false ||
        (row.customer_id && !customers.has(row.customer_id)))) {
      for (const row of group) ambiguous.add(row.id); continue;
    }
    group.sort((a, b) => time(a.created_at) - time(b.created_at) || a.id.localeCompare(b.id));
    for (const row of group) first.set(row.id, group[0].id);
  }
  return { first, ambiguous };
}

const qualificationColumns = 'id,company_id,canonical_lead_id,revision,status,contact_usable,need_in_scope,area_in_service,evidence_ref,actor_id,recorded_at,context_hash';
async function buildGoogleQualifiedConversions({ db, companyId, fromMs, toMs }) {
  if (!companyId || !Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs)
    throw Object.assign(Error('INVALID_RANGE'), { code: 'INVALID_RANGE' });
  const diagnostics = { qualified_current: 0, exported: 0, not_current_qualified: 0,
    invalid_qualification: 0, outside_window: 0, missing_or_test_lead: 0,
    identity_unknown: 0, identity_ambiguous: 0, duplicate_or_returning: 0, new_customer_unproven: 0, qualification_stale: 0,
    no_website_source: 0, no_gclid: 0, braid_only: 0, invalid_gclid: 0,
    source_time_unknown: 0, source_conflict: 0, test_source: 0, qualification_before_source: 0 };
  const eventQuery = () => db.from('p1_qualification_events').select(qualificationColumns, { count: 'exact' })
    .eq('company_id', companyId).order('canonical_lead_id').order('revision').order('id');
  const events = await readAll(eventQuery);
  const latest = new Map();
  for (const event of events) {
    if (event.company_id !== companyId || !event.id || !event.canonical_lead_id ||
        !Number.isInteger(event.revision) || event.revision < 1) throw unavailable();
    const previous = latest.get(event.canonical_lead_id);
    if (previous?.revision === event.revision) throw unavailable();
    if (!previous || previous.revision < event.revision) latest.set(event.canonical_lead_id, event);
  }
  const candidates = [];
  for (const event of latest.values()) {
    if (event.status !== 'QUALIFIED') { diagnostics.not_current_qualified++; continue; }
    const ms = time(event.recorded_at);
    if (!event.actor_id || !text(event.evidence_ref) || event.contact_usable !== true ||
        event.need_in_scope !== true || event.area_in_service !== true || !Number.isFinite(ms)) {
      diagnostics.invalid_qualification++; continue;
    }
    diagnostics.qualified_current++;
    if (ms < fromMs || ms > toMs) { diagnostics.outside_window++; continue; }
    candidates.push(event);
  }
  // Complete lifetime company history is needed to exclude an older lead of the same CRM identity.
  const leads = await readAll(() => db.from('crm_leads')
    .select('id,company_id,type,is_test,customer_id,facebook_contact_id,phone,created_at', { count: 'exact' })
    .eq('company_id', companyId).order('id'));
  if (leads.some(row => row.company_id !== companyId || !row.id)) throw unavailable();
  const real = leads.filter(row => row.is_test !== true && ['lead', 'deal'].includes(row.type));
  const customers = new Map(), customerIds = [...new Set(real.map(row => row.customer_id).filter(Boolean))];
  for (let i = 0; i < customerIds.length; i += 100) {
    const ids = customerIds.slice(i, i + 100);
    const records = await readAll(() => db.from('customers').select('id,phone,created_at', { count: 'exact' })
      .in('id', ids).order('id'));
    for (const row of records) { if (!ids.includes(row.id) || customers.has(row.id)) throw unavailable(); customers.set(row.id, row); }
  }
  const { first, ambiguous } = linkedIdentities(real, customers);
  const byId = new Map(real.map(row => [row.id, row]));
  const details = new Map(), touches = new Map();
  for (let i = 0; i < candidates.length; i += 100) {
    const ids = candidates.slice(i, i + 100).map(row => row.canonical_lead_id);
    const records = await readAll(() => db.from('crm_leads')
      .select('id,company_id,type,is_test,customer_id,facebook_contact_id,phone,stage_id,created_at,intake_attribution,website_intake,description', { count: 'exact' })
      .eq('company_id', companyId).in('id', ids).order('id'));
    for (const row of records) {
      if (row.company_id !== companyId || !ids.includes(row.id) || details.has(row.id)) throw unavailable();
      details.set(row.id, row);
    }
    const attrs = await readAll(() => db.from('lead_attribution')
      .select('id,company_id,lead_id,customer_id,kenh,platform,gclid,fbclid,gbraid,wbraid,utm_source,cham_dau_luc', { count: 'exact' })
      .eq('company_id', companyId).in('lead_id', ids).order('id'));
    for (const row of attrs) {
      if (row.company_id !== companyId || !ids.includes(row.lead_id)) throw unavailable();
      if (!touches.has(row.lead_id)) touches.set(row.lead_id, []); touches.get(row.lead_id).push(row);
    }
  }
  const rows = [];
  for (const event of candidates) {
    const lead = details.get(event.canonical_lead_id), canonical = byId.get(event.canonical_lead_id);
    if (!lead || !canonical || lead.company_id !== companyId || lead.is_test !== false ||
        !['lead', 'deal'].includes(lead.type)) { diagnostics.missing_or_test_lead++; continue; }
    // New receipt contracts carry an explicit per-request measurement choice.
    // Old rows remain under the existing export scope; never override a new denial.
    if (lead.website_intake != null && lead.website_intake.measurement_consent !== true) {
      diagnostics.measurement_consent_required = (diagnostics.measurement_consent_required || 0) + 1; continue;
    }
    // Refuse a racing identity change between history and detailed reads.
    if (lead.customer_id !== canonical.customer_id || lead.facebook_contact_id !== canonical.facebook_contact_id ||
        lead.created_at !== canonical.created_at || lead.phone !== canonical.phone) throw unavailable();
    const currentContext = qualificationContext(lead, customers.get(lead.customer_id));
    if (event.context_hash !== currentContext) { diagnostics.qualification_stale++; continue; }
    if (ambiguous.has(lead.id)) { diagnostics.identity_ambiguous++; continue; }
    if (!first.has(lead.id)) { diagnostics.identity_unknown++; continue; }
    if (first.get(lead.id) !== lead.id) { diagnostics.duplicate_or_returning++; continue; }
    const source = sourceForLead(lead, touches.get(lead.id) || []);
    if (source.reason) { diagnostics[source.reason]++; continue; }
    const ms = time(event.recorded_at), received = time(lead.created_at);
    // Customer creation precedes the lead write. Require the bridge's real submit timestamp;
    // do not invent a grace period to classify an existing master customer as new.
    const submitted = parseVptV1Description(lead.description)?.submit_ms;
    const customer = customers.get(lead.customer_id), customerCreated = time(customer?.created_at);
    if (!Number.isFinite(submitted) || !Number.isFinite(customerCreated) ||
        customerCreated < submitted || customerCreated > received) {
      diagnostics.new_customer_unproven++; continue;
    }
    if (!Number.isFinite(received) || ms <= Math.max(source.sourceTime, received)) {
      diagnostics.qualification_before_source++; continue;
    }
    rows.push({ conversion_name: CONVERSION_NAME, conversion_ms: ms, gclid: source.gclid,
      lead_id: lead.id, source_kind: source.kind,
      order_id: `vptq_${createHash('sha256').update(`${companyId}|${lead.id}|qualified-v1`).digest('hex').slice(0, 56)}` });
  }
  // Events are append-only. Catch revocations/new revisions while we read CRM/identity sources.
  const checked = await readAll(eventQuery);
  if (JSON.stringify(checked) !== JSON.stringify(events)) throw unavailable();
  rows.sort((a, b) => a.conversion_ms - b.conversion_ms || a.order_id.localeCompare(b.order_id));
  diagnostics.exported = rows.length;
  return { rows, diagnostics };
}

function toQualifiedGoogleCsv(rows) {
  const lines = [CSV_HEADER];
  for (const row of rows) {
    if (!GCLID.test(row.gclid) || !/^vptq_[a-f0-9]{56}$/.test(row.order_id) ||
        !Number.isFinite(row.conversion_ms)) throw unavailable();
    lines.push([row.gclid, CONVERSION_NAME, `${formatVietnamTime(row.conversion_ms)}+07:00`, '', 'VND', row.order_id].join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}
const previewQualifiedRow = row => ({ lead_id: row.lead_id, gclid_tail: maskGclid(row.gclid),
  conversion_time: `${formatVietnamTime(row.conversion_ms)}+07:00`, source_kind: row.source_kind });
module.exports = { CONVERSION_NAME, CSV_HEADER, readAll, sourceForLead, linkedIdentities, normalizePhone,
  buildGoogleQualifiedConversions, toQualifiedGoogleCsv, previewQualifiedRow };
