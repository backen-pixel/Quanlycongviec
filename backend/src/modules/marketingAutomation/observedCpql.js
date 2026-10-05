'use strict';
const { MAX_AGE_MS } = require('./spendCoverage');

// A quotient over reconciled records already received. This is deliberately a
// separate measure: it does not establish the provider's complete lead universe,
// attribution of account spend to Lead Ads, or achievement of the trial target.
function observedCpql({ period, spend, counts, reconciliation, asOf }) {
  const reasons = [];
  if (period.status !== 'AVAILABLE') reasons.push(period.status);
  if (spend.status !== 'KNOWN_TO_DATE') reasons.push('SPEND_UNAVAILABLE');
  if (reconciliation.recordMatchStatus !== 'MATCHED_OBSERVED') reasons.push('OBSERVED_RECORDS_NOT_RECONCILED');
  const finished = Date.parse(reconciliation.run?.finishedAt), now = Date.parse(asOf);
  if (reconciliation.recordMatchStatus === 'MATCHED_OBSERVED' && (!Number.isFinite(finished) || finished > now || now - finished > MAX_AGE_MS)) reasons.push('CENSUS_STALE');
  if (counts.unprocessedForms || counts.unlinkedProofs || counts.unresolved || counts.unknownSource) reasons.push('COHORT_UNRESOLVED');
  const ready = reasons.length === 0;
  return {
    policy: 'OBSERVED_QUALIFIED_PAID_CPQL_V1',
    status: !ready ? 'UNAVAILABLE' : counts.qualified === 0 ? 'NO_QUALIFIED_LEADS' : 'AVAILABLE_PROVISIONAL',
    spendScope: 'ALL_CONFIGURED_FACEBOOK_ACCOUNTS',
    leadScope: 'RECONCILED_OBSERVED_META_LEAD_ADS',
    asOf, sinceAt: period.sinceAt, untilExclusive: period.untilExclusive,
    spendVnd: ready ? spend.spendVnd : null,
    qualifiedLeads: ready ? counts.qualified : null,
    pendingQualification: counts.pending,
    costPerQualifiedLeadVnd: ready && counts.qualified > 0 ? spend.spendVnd / counts.qualified : null,
    reasons,
    limitations: ['PROVIDER_UNIVERSE_UNVERIFIED', 'OTHER_ENTRYPOINTS_NOT_RECONCILED', 'QUALIFICATION_CURRENT_AS_OF_READ'],
    evidence: {
      censusRunId: reconciliation.run?.id || null,
      censusFinishedAt: reconciliation.run?.finishedAt || null,
      spendRunIds: spend.status === 'KNOWN_TO_DATE' ? spend.sources.map(s => s.runId) : [],
    },
    targetStatus: 'NOT_EVALUATED', allowBudgetExecution: false,
  };
}
module.exports = { observedCpql };
