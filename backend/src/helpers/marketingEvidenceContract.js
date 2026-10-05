'use strict';

const { createHash } = require('node:crypto');

const VERSION = 'marketing-evidence/v1';
const SYSTEMS = new Set(['meta', 'google', 'tiktok', 'chatgpt', 'website', 'zalo']);
const METRICS = new Set(['clicks', 'conversations', 'platform_leads']);
const SECTIONS = ['source', 'crm', 'attribution'];
const isRecord = (value) => value !== null && typeof value === 'object'
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const isId = (value) => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value);
const isPositiveInteger = (value) => Number.isSafeInteger(value) && value > 0;

// UTC only at this normalized boundary. Adapters must convert timezone-aware timestamps.
// Date.parse alone accepts rollover dates, so require an exact round trip as well.
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  const iso = new Date(ms).toISOString();
  return iso === value || iso.replace('.000Z', 'Z') === value ? { ms, iso } : null;
}

function sameScope(context, row) {
  return isRecord(row) && row.tenantId === context.tenantId && row.companyId === context.companyId;
}

function empty(reason) {
  return {
    contractVersion: VERSION,
    scopeState: 'BLOCKED',
    source: { state: 'UNKNOWN', system: null, metric: null, count: null, periodStart: null, periodEnd: null, checkedAt: null },
    crm: { state: 'UNKNOWN', checkedAt: null },
    attribution: { state: 'UNKNOWN', eventKey: null, checkedAt: null },
    reasonCodes: [reason],
    writeAuthorization: 'NOT_PROVIDED',
  };
}

/**
 * Build a scoped, pseudonymous reconciliation key; not a durable deduplication store.
 * IDs must be opaque identifiers, not message text, email, phone or other PII.
 * Hashing is NOT anonymization. Access/retention restrictions still apply.
 */
function scopedEventKey(context, system, eventId) {
  if (!isRecord(context) || !isId(context.tenantId) || !isId(context.companyId)
      || !SYSTEMS.has(system) || !isId(eventId)) return null;
  const tuple = [VERSION, context.tenantId, context.companyId, system, eventId];
  return createHash('sha256').update(JSON.stringify(tuple)).digest('hex');
}

/**
 * Read-only assessment of already-normalized, trusted adapter observations.
 * @param {{tenantId: string, companyId: string}} trustedContext Server-resolved scope.
 * @param {object} evidence Optional independent source/crm/attribution observations.
 * @param {{now: string, maxAgeMs: {source: number, crm: number, attribution: number}}} policy
 * @returns {object} Allowlisted machine state only; never a write/deploy/ad approval.
 *
 * This helper is NOT authentication, a permission engine, a CRM acceptance rule,
 * a cryptographic receipt verifier, an ingestion handler, or proof of live E2E.
 * Never pass an HTTP body as trustedContext or let a model choose policy TTLs.
 * No I/O, environment reads, clock reads, DB clients, timers or runtime registration.
 */
function assessMarketingEvidence(trustedContext, evidence, policy) {
  if (!isRecord(trustedContext) || !isId(trustedContext.tenantId) || !isId(trustedContext.companyId)) {
    return empty('TRUSTED_SCOPE_REQUIRED');
  }
  if (!isRecord(evidence)) return empty('EVIDENCE_OBJECT_REQUIRED');
  const now = isRecord(policy) ? timestamp(policy.now) : null;
  if (!now || !isRecord(policy.maxAgeMs)
      || !SECTIONS.every((name) => isPositiveInteger(policy.maxAgeMs[name]))) {
    return empty('EXPLICIT_FRESHNESS_POLICY_REQUIRED');
  }

  // Reject mixed-scope payloads before copying any evidence or time into output.
  for (const name of SECTIONS) {
    const row = evidence[name];
    if (row !== undefined && row !== null && !sameScope(trustedContext, row)) {
      return empty('EVIDENCE_SCOPE_MISMATCH');
    }
  }
  if (isRecord(evidence.crm) && evidence.crm.owner !== undefined && evidence.crm.owner !== null
      && !sameScope(trustedContext, evidence.crm.owner)) return empty('RECIPIENT_SCOPE_MISMATCH');

  const out = empty('');
  out.scopeState = 'MATCHED';
  out.reasonCodes = [];
  const reason = (value) => { if (!out.reasonCodes.includes(value)) out.reasonCodes.push(value); };

  function fresh(name) {
    const row = evidence[name];
    const tag = name.toUpperCase();
    if (!isRecord(row)) { reason(`${tag}_MISSING`); return false; }
    const checked = timestamp(row.checkedAt);
    out[name].checkedAt = checked ? checked.iso : null;
    if (row.status !== 'ok') { reason(`${tag}_UNAVAILABLE`); return false; }
    if (!checked) { reason(`${tag}_INVALID_TIMESTAMP`); return false; }
    if (checked.ms > now.ms) { reason(`${tag}_FUTURE_TIMESTAMP`); return false; }
    if (now.ms - checked.ms > policy.maxAgeMs[name]) { reason(`${tag}_STALE`); return false; }
    return true;
  }

  const sourceFresh = fresh('source');
  const crmFresh = fresh('crm');
  const attributionFresh = fresh('attribution');
  const source = evidence.source;
  const crm = evidence.crm;
  const attribution = evidence.attribution;

  if (sourceFresh) {
    const start = timestamp(source.periodStart);
    const end = timestamp(source.periodEnd);
    const checked = timestamp(source.checkedAt);
    if (!start || !end || start.ms >= end.ms || end.ms > checked.ms) {
      reason('SOURCE_PERIOD_INVALID');
    } else if (!SYSTEMS.has(source.system) || !METRICS.has(source.metric)
        || !Number.isSafeInteger(source.count) || source.count < 0) {
      reason('SOURCE_METRIC_INVALID');
    } else {
      out.source.state = 'KNOWN';
      out.source.system = source.system;
      out.source.metric = source.metric;
      out.source.periodStart = start.iso;
      out.source.periodEnd = end.iso;
      out.source.count = source.count; // Explicit, fresh zero stays zero; no fallback-to-zero.
    }
  }

  if (crmFresh) {
    if (crm.leadExists === false) {
      out.crm.state = 'NOT_ACCEPTED';
      reason('CRM_LEAD_NOT_FOUND');
    } else if (crm.leadExists !== true || !isId(crm.leadId)) {
      reason('CRM_LEAD_IDENTITY_REQUIRED');
    } else if (!isRecord(crm.owner) || !isId(crm.owner.id)) {
      reason('RECIPIENT_MISSING');
    } else if (crm.owner.active !== true) {
      reason(crm.owner.active === false ? 'RECIPIENT_INACTIVE' : 'RECIPIENT_ACTIVITY_UNKNOWN');
    } else if (crm.accepted !== true || !isId(crm.acceptanceRuleRef)) {
      out.crm.state = crm.accepted === false ? 'NOT_ACCEPTED' : 'UNKNOWN';
      reason('CRM_ACCEPTANCE_UNCONFIRMED');
    } else {
      out.crm.state = 'ACCEPTED'; // A backend verdict, not a rule invented here.
    }
  }

  if (attributionFresh) {
    if (attribution.method === 'utm') {
      out.attribution.state = 'CLASSIFIED_ONLY';
      reason('UTM_IS_NOT_PAID_CLICK_PROOF');
    } else if (attribution.method !== 'platform_receipt' || attribution.verified !== true) {
      reason('ATTRIBUTION_RECEIPT_UNVERIFIED');
    } else if (!isId(attribution.eventId) || !isId(attribution.receiptRef)
        || !isId(attribution.leadId)) {
      reason('ATTRIBUTION_IDENTITY_REQUIRED');
    } else if (!sourceFresh || out.source.state !== 'KNOWN') {
      reason('ATTRIBUTION_SOURCE_NOT_VERIFIED');
    } else if (attribution.sourceSystem !== source.system) {
      reason('ATTRIBUTION_SOURCE_MISMATCH');
    } else if (out.crm.state !== 'ACCEPTED' || attribution.leadId !== crm.leadId) {
      reason('ATTRIBUTION_CRM_LINK_UNCONFIRMED');
    } else {
      out.attribution.state = 'LINKED';
      out.attribution.eventKey = scopedEventKey(trustedContext, source.system, attribution.eventId);
    }
  }
  return out;
}

module.exports = { VERSION, assessMarketingEvidence, scopedEventKey };
