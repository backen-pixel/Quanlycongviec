'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { externalLeadTracking: parse } = require('../src/domain/externalLeadTracking');

test('legacy descriptions, Page source and the word gclid never become attribution', () => {
  assert.deepEqual(parse({ source_name: 'Page VPT', description: 'campaign 123 gclid' }), { is_test: false });
});
test('explicit strings preserve long IDs, all UTM and actual click identifiers', () => {
  const input = { campaign_id: '23976669573', ad_id: '99999999999999999', platform: 'google',
    utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'kitchen', utm_content: 'a',
    utm_term: 'inox', gclid: 'click-value', fbclid: 'fb-value', gbraid: 'gb', wbraid: 'wb' };
  assert.deepEqual(parse({ attribution: input }).intake_attribution, { kenh: 'website', ...input });
});
test('URL query is allowlisted and removed from stored URL; explicit facts take precedence', () => {
  const result = parse({ attribution: { landing_url: 'https://example.test/form?utm_source=google&campaign_id=ignored&gclid=actual&email=private', campaign_id: '123' } });
  assert.deepEqual(result.intake_attribution, { kenh: 'website', platform: 'google', campaign_id: '123',
    utm_source: 'google', gclid: 'actual', landing_url: 'https://example.test/form' });
});
test('test flag is explicit and boolean, never inferred from a customer name', () => {
  assert.deepEqual(parse({ is_test: true }), { is_test: true });
  assert.deepEqual(parse({ title: 'TEST' }), { is_test: false });
  for (const is_test of ['false', 1, null]) assert.throws(() => parse({ is_test }));
});
test('untrusted scope, raw, timestamps, numeric IDs and unbounded values rejected', () => {
  for (const attribution of [null, [], 'x', { company_id: 'other' }, { raw: 'private' },
    { cham_dau_luc: '2020-01-01' }, { ad_id: 123 }, { gclid: 'x'.repeat(2049) },
    { kenh: 'ads_by_guess' }, { landing_url: 'javascript:alert(1)' }]) {
    assert.throws(() => parse({ attribution }));
  }
});
