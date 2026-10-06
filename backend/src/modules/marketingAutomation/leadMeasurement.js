'use strict';
const { APPROVED_PLAN, money, instant } = require('./policy');
const UI_STATE_BY_REASON = Object.freeze({
  UNVERIFIED_SOURCE: 'BLOCKED', INCOMPLETE_COVERAGE: 'BLOCKED',
  CONFLICTING_SPEND: 'BLOCKED', CONFLICTING_LEAD: 'BLOCKED', AMOUNT_OVERFLOW: 'BLOCKED',
  INVALID_SNAPSHOT: 'UNKNOWN', MISSING_SOURCE: 'UNKNOWN', INVALID_SPEND: 'UNKNOWN',
  INVALID_LEAD: 'UNKNOWN', UNVERIFIED_QUALIFICATION: 'UNKNOWN',
});
const unknown = reason => ({ status: 'UNKNOWN', reason,
  uiState: Object.hasOwn(UI_STATE_BY_REASON, reason) ? UI_STATE_BY_REASON[reason] : 'UNKNOWN',
  spendVnd: null, qualifiedLeads: null, costPerQualifiedLeadVnd: null, targetMetToDate: false, allowBudgetExecution: false });

// Trusted, complete CRM projection: one current qualification and one verified
// first-paid source per canonical Lead. It does not accept model quality scores
// or the sum of platform-reported conversions as qualified customers.
function measureLeadTrial(s) {
  if (!s || typeof s.companyId !== 'string' || !s.companyId.trim() || !s.trialId || !instant(s.asOf) || !instant(s.start) || !instant(s.end) || Date.parse(s.start) >= Date.parse(s.end) || Date.parse(s.asOf) < Date.parse(s.start)) return unknown('INVALID_SNAPSHOT');
  if (!s.coverage || ['spend', 'leads', 'qualification', 'attribution'].some(k => s.coverage[k] !== 'COMPLETE')) return unknown('INCOMPLETE_COVERAGE');
  if (s.currency !== 'VND' || s.sourceVerified !== true || s.spendFresh !== true || s.qualificationFresh !== true) return unknown('UNVERIFIED_SOURCE');
  if (![s.spend, s.paidLeads, s.accountIds].every(Array.isArray) || !s.accountIds.length) return unknown('MISSING_SOURCE');
  const inCohort = time => instant(time) && Date.parse(time) >= Date.parse(s.start) && Date.parse(time) < Date.parse(s.end) && Date.parse(time) <= Date.parse(s.asOf);
  let spend = 0;
  const receipts = new Map();
  for (const row of s.spend) {
    if (row.companyId !== s.companyId || row.trialId !== s.trialId || row.currency !== 'VND' || !s.accountIds.includes(row.accountId) || !row.eventId || !inCohort(row.spentAt) || !money(row.amountVnd)) return unknown('INVALID_SPEND');
    const key = JSON.stringify([row.accountId, row.eventId]);
    const identity = JSON.stringify([row.amountVnd, row.spentAt]);
    if (receipts.has(key) && receipts.get(key) !== identity) return unknown('CONFLICTING_SPEND');
    if (!receipts.has(key)) spend += row.amountVnd;
    receipts.set(key, identity);
  }
  if (!Number.isSafeInteger(spend)) return unknown('AMOUNT_OVERFLOW');
  const leads = new Map();
  const counts = { QUALIFIED: 0, PENDING: 0, REJECTED: 0 };
  for (const row of s.paidLeads) {
    if (row.companyId !== s.companyId || row.trialId !== s.trialId || !row.canonicalLeadId || !row.sourceEvidenceId || !s.accountIds.includes(row.accountId) || row.attributionPolicy !== 'FIRST_VERIFIED_PAID_LEAD_V1' || !inCohort(row.createdAt) || !Object.hasOwn(counts, row.qualification)) return unknown('INVALID_LEAD');
    if (row.qualification !== 'PENDING' && (!row.qualificationEvidenceId || !row.qualifiedBy || !instant(row.qualifiedAt) || Date.parse(row.qualifiedAt) < Date.parse(row.createdAt) || Date.parse(row.qualifiedAt) > Date.parse(s.asOf))) return unknown('UNVERIFIED_QUALIFICATION');
    if (row.qualification === 'QUALIFIED' && [row.contactVerified, row.demandMatches, row.serviceAreaVerified].some(x => x !== true)) return unknown('UNVERIFIED_QUALIFICATION');
    const identity = JSON.stringify([row.accountId, row.sourceEvidenceId, row.createdAt, row.qualification, row.qualificationEvidenceId, row.qualifiedBy, row.qualifiedAt, row.contactVerified, row.demandMatches, row.serviceAreaVerified]);
    if (leads.has(row.canonicalLeadId) && leads.get(row.canonicalLeadId) !== identity) return unknown('CONFLICTING_LEAD');
    if (!leads.has(row.canonicalLeadId)) counts[row.qualification]++;
    leads.set(row.canonicalLeadId, identity);
  }
  const qualified = counts.QUALIFIED;
  const target = APPROVED_PLAN.targetQualifiedLeadCostVnd;
  const targetTotal = target * qualified;
  if (!Number.isSafeInteger(targetTotal)) return unknown('AMOUNT_OVERFLOW');
  const cost = qualified > 0 ? spend / qualified : null;
  const status = qualified > 0 ? 'KNOWN_TO_DATE' : 'NO_QUALIFIED_LEADS';
  return { status, uiState: status, asOf: s.asOf,
    spendVnd: spend, receivedPaidLeads: leads.size, qualifiedLeads: counts.QUALIFIED,
    pendingLeads: counts.PENDING, rejectedLeads: counts.REJECTED, costPerQualifiedLeadVnd: cost,
    targetVnd: APPROVED_PLAN.targetQualifiedLeadCostVnd,
    targetMetToDate: qualified > 0 && spend <= targetTotal,
    allowBudgetExecution: false, revenueTargetEvaluated: false };
}
module.exports = { measureLeadTrial };
