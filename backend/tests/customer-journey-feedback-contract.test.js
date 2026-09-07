'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { sourceStageEligible, projectDealFeedback } = require('../src/helpers/customerJourneyFeedbackContract');
const deal = { ref: 'crm_leads:fake-complete', entity: 'deal', source_type: 'crm_leads', fields: { crm_stage_name: 'Hoàn thành' } };
const rating = { ref: 'deal_customer_ratings:fake-rating', entity: 'rating', source_type: 'deal_customer_ratings', fields: { stars: 2, feedback: 'Phản hồi giả lập', source_name: 'survey' } };

test('J07 feedback keeps source stars and distinct unknown repair outcome without linking rating to repair', () => {
  const result = projectDealFeedback(deal, { ratings: [rating], canRead: true, complete: true });
  assert.equal(result.state, 'RATED'); assert.equal(result.visible_rating_count, 1);
  assert.deepEqual(result.rating_refs, [rating.ref]); assert.equal(result.coverage, 'EXACT');
  assert.equal(result.outcome_state, 'UNKNOWN'); assert.equal(result.repair_linked, false);
  assert.equal(result.customer_accepted, null); assert.equal(result.average_stars, undefined);
  assert.equal(result.profit, undefined);
});

test('J07 NOT RATED requires full authorized source and relation coverage, never an empty partial page', () => {
  assert.equal(projectDealFeedback(deal, { ratings: [], complete: true, canRead: true }).state, 'NOT_RATED');
  for (const options of [{ complete: false, canRead: true }, { complete: true, canRead: false }, {}]) {
    const result = projectDealFeedback(deal, options);
    assert.equal(result.state, 'UNKNOWN'); assert.equal(result.visible_rating_count, null);
    assert.equal(result.customer_accepted, null);
  }
  assert.equal(projectDealFeedback(deal, { ratings: [rating], complete: false, canRead: true }).state, 'RATED');
});

test('J07 reuses the verified source completion-stage eligibility without name-based journey workflow invention', () => {
  assert.equal(sourceStageEligible('HOÀN THÀNH'), true);
  assert.equal(sourceStageEligible('Báo giá'), false);
  assert.equal(sourceStageEligible(undefined), null);
  const locked = { ...deal, fields: { crm_stage_name: 'Báo giá' } };
  assert.equal(projectDealFeedback(locked, { ratings: [rating], complete: true, canRead: true }).state, 'SOURCE_STAGE_LOCKED');
  assert.equal(projectDealFeedback({ ...deal, fields: {} }, { complete: true, canRead: true }).state, 'UNKNOWN');
});

test('J07 missing or invalid stars cannot become zero stars, NOT RATED or customer satisfaction', () => {
  for (const fields of [{}, { stars: 0 }, { stars: 6 }, { stars: '2' }]) {
    const result = projectDealFeedback(deal, { ratings: [{ ...rating, fields }], complete: true, canRead: true });
    assert.equal(result.state, 'UNKNOWN'); assert.equal(result.visible_rating_count, null);
    assert.ok(result.gaps.includes('RATING_FIELDS_MISSING_OR_INVALID'));
  }
});
