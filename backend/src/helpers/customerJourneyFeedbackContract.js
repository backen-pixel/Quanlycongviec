'use strict';

// Source-only read projection. No legacy route loading (auth/config/writes).
// database/110_deal_cross_scores_customer_ratings.sql:24-33: rating -> deal,
// stars 1..5, feedback/source. No incident/task/repair/recheck relationship.
// routes/dealScores.js:38-51,203-244: summary is gated by the source stage name.
const FEEDBACK_CONTRACT = Object.freeze({
  key: 'JOURNEY_DEAL_FEEDBACK_SOURCE_V1',
  source: 'deal_customer_ratings.deal_lead_id;dealScores.summary',
  eligibility: 'SOURCE_STAGE_NAME_CONTAINS_HOAN_THANH',
  outcome: 'NO_VERIFIED_REPAIR_RECHECK_CONTRACT',
});
const FEEDBACK_FIELDS = ['crm_stage_name', 'severity', 'reported_by', 'resolved_by', 'resolved_at'];

function sourceStageEligible(name) {
  if (typeof name !== 'string' || !name.trim()) return null;
  return name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('hoan thanh');
}

// Only authorized records and authorized rating_deal edges may reach here.
// `complete` is a separate proof of source + relation coverage and visible scope;
// an empty page, missing access, or partial source never supplies that proof.
function projectDealFeedback(deal, { ratings = [], complete = false, canRead = false } = {}) {
  const result = { contract_key: FEEDBACK_CONTRACT.key, state: 'UNKNOWN',
    coverage: 'UNKNOWN', visible_rating_count: null, rating_refs: [],
    outcome_state: 'UNKNOWN', outcome_basis: FEEDBACK_CONTRACT.outcome,
    repair_linked: false, customer_accepted: null, gaps: ['REPAIR_RECHECK_OUTCOME_NOT_CONNECTED'] };
  if (!deal || deal.entity !== 'deal' || deal.source_type !== 'crm_leads') {
    result.gaps.push('FEEDBACK_DEAL_SOURCE_REQUIRED'); return result;
  }
  if (!canRead) { result.gaps.push('FEEDBACK_SOURCE_OR_EDGE_DENIED'); return result; }
  const eligible = sourceStageEligible(deal.fields?.crm_stage_name);
  if (eligible !== true) {
    result.state = eligible === false ? 'SOURCE_STAGE_LOCKED' : 'UNKNOWN';
    result.gaps.push(eligible === false ? 'SOURCE_DEAL_NOT_COMPLETED_STAGE' : 'SOURCE_STAGE_ELIGIBILITY_UNKNOWN');
    return result;
  }
  const valid = ratings.filter((row) => row.entity === 'rating' && row.source_type === 'deal_customer_ratings'
    && typeof row.fields?.stars === 'number' && row.fields.stars >= 1 && row.fields.stars <= 5);
  const invalid = valid.length !== ratings.length;
  result.rating_refs = [...new Set(valid.map((row) => row.ref))].sort();
  result.visible_rating_count = result.rating_refs.length;
  result.coverage = complete && !invalid ? 'EXACT' : 'PARTIAL';
  if (invalid) result.gaps.push('RATING_FIELDS_MISSING_OR_INVALID');
  if (result.rating_refs.length) result.state = 'RATED';
  else if (complete && !invalid) result.state = 'NOT_RATED';
  else { result.state = 'UNKNOWN'; result.visible_rating_count = null; }
  if (!complete) result.gaps.push('RATING_OR_RELATION_COVERAGE_INCOMPLETE');
  return result;
}

module.exports = { FEEDBACK_CONTRACT, FEEDBACK_FIELDS, sourceStageEligible, projectDealFeedback };
