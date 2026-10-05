'use strict';
const { money, instant } = require('./policy');
const unknown = (reason) => ({ status: 'UNKNOWN', reason, spendVnd: null, recognizedRevenueVnd: null, adRatio: null, roas: null, allowRevenueOptimization: false });

// A projection of trusted accounting/source snapshots, never a new Finance
// ledger and never a model-supplied claim that a document is recognized revenue.
function measureTrial(s) {
  if (!s || !s.companyId || !s.trialId || !instant(s.asOf) || !instant(s.start) || !instant(s.end) || Date.parse(s.start) >= Date.parse(s.end) || Date.parse(s.asOf) < Date.parse(s.start)) return unknown('INVALID_SNAPSHOT');
  if (!s.coverage || ['spend', 'recognitions', 'adjustments', 'attribution'].some(k => s.coverage[k] !== 'COMPLETE')) return unknown('INCOMPLETE_COVERAGE');
  if (s.currency !== 'VND' || s.sourceVerified !== true || s.spendFresh !== true) return unknown('UNVERIFIED_SOURCE');
  if (![s.spend, s.recognitions, s.attribution, s.accountIds].every(Array.isArray) || !s.accountIds.length) return unknown('MISSING_SOURCE');
  const leads = new Map();
  for (const a of s.attribution) {
    if (a.companyId !== s.companyId || a.trialId !== s.trialId || !a.leadId || !a.orderId || !a.evidenceId || a.policyVersion !== 'FIRST_VERIFIED_PAID_LEAD_V1' || !s.accountIds.includes(a.accountId) || !instant(a.leadCreatedAt) || Date.parse(a.leadCreatedAt) < Date.parse(s.start) || Date.parse(a.leadCreatedAt) >= Date.parse(s.end) || Date.parse(a.leadCreatedAt) > Date.parse(s.asOf)) return unknown('INVALID_ATTRIBUTION');
    const identity = JSON.stringify([a.leadId, a.accountId, a.evidenceId, a.leadCreatedAt]);
    if (leads.has(a.orderId) && leads.get(a.orderId).identity !== identity) return unknown('CONFLICTING_ORDER_ATTRIBUTION');
    leads.set(a.orderId, { identity, createdAt: Date.parse(a.leadCreatedAt) });
  }
  let spend = 0; let revenue = 0;
  const seen = new Map();
  for (const row of s.spend) {
    if (row.companyId !== s.companyId || row.trialId !== s.trialId || row.currency !== 'VND' || !s.accountIds.includes(row.accountId) || !row.eventId || !instant(row.spentAt) || Date.parse(row.spentAt) < Date.parse(s.start) || Date.parse(row.spentAt) >= Date.parse(s.end) || Date.parse(row.spentAt) > Date.parse(s.asOf) || !money(row.amountVnd)) return unknown('INVALID_SPEND');
    const key = JSON.stringify([row.accountId, row.eventId]);
    const fingerprint = JSON.stringify([row.amountVnd, row.spentAt]);
    if (seen.has(key) && seen.get(key) !== fingerprint) return unknown('CONFLICTING_SPEND');
    if (!seen.has(key)) spend += row.amountVnd;
    seen.set(key, fingerprint);
  }
  const postings = new Map();
  for (const row of s.recognitions) {
    if (row.companyId !== s.companyId || row.currency !== 'VND' || !row.sourceSystem || !row.documentId || !row.lineId || !row.version || !row.confirmedBy || !row.orderId || !instant(row.recognizedAt) || Date.parse(row.recognizedAt) > Date.parse(s.asOf) || row.status !== 'POSTED' || !Number.isSafeInteger(row.netExVatVnd)) return unknown('INVALID_RECOGNITION');
    if (row.netExVatVnd < 0 && !row.adjustmentOf) return unknown('UNLINKED_ADJUSTMENT');
    if (leads.has(row.orderId) && Date.parse(row.recognizedAt) < leads.get(row.orderId).createdAt) return unknown('REVENUE_PRECEDES_ACQUISITION');
    const key = JSON.stringify([row.sourceSystem, row.documentId, row.lineId]);
    const fingerprint = JSON.stringify([row.version, row.orderId, row.netExVatVnd, row.recognizedAt, row.adjustmentOf || null]);
    if (postings.has(key) && postings.get(key) !== fingerprint) return unknown('CONFLICTING_POSTING_VERSION');
    if (!postings.has(key) && leads.has(row.orderId)) revenue += row.netExVatVnd;
    postings.set(key, fingerprint);
  }
  if (!Number.isSafeInteger(spend) || !Number.isSafeInteger(revenue)) return unknown('AMOUNT_OVERFLOW');
  const result = { status: revenue > 0 ? 'KNOWN_TO_DATE' : 'NO_POSITIVE_REVENUE', asOf: s.asOf, spendVnd: spend, recognizedRevenueVnd: revenue,
    adRatio: revenue > 0 ? spend / revenue : null, roas: spend > 0 ? revenue / spend : null,
    targetMetToDate: revenue > 0 && spend / revenue <= 0.07,
    evaluationFinal: s.cohortClosed === true, allowRevenueOptimization: s.comparableMaturity === true && revenue > 0 };
  return result;
}
module.exports = { measureTrial };
