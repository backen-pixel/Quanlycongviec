'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { harness, trial, touch, A, B } = require('./p1QualificationQueue.route.test');
const t = { ...trial, start_date: '2020-01-01', end_date: '2020-01-02' };
const q = { trial_id: t.id };
const scope = account_id => ({ trial_id: t.id, company_id: A, provider: 'FACEBOOK', account_id });
const account = (ad_account_id, complete = true) => ({ ad_account_id, bat: true,
  lan_dong_bo_cuoi: '2020-01-03T00:00:00Z', ket_qua_cuoi: { since: t.start_date,
    until: t.end_date, currency: 'VND', ok: true, complete, truncated: false,
    invalid_rows: 0, skipped_rows: 0 } });
const spend = (ad_account_id, amount) => ({ ad_id: `ad-${ad_account_id}`, ngay: t.start_date,
  ad_account_id, chi_tieu: amount, tien_te: 'VND' });
const leads = n => Array.from({ length: n }, (_, i) => ({ id: `lead-${i}`, company_id: A,
  code: `L${i}`, title: `Synthetic ${i}` }));
const touches = n => leads(n).map((row, i) => touch(`touch-${String(i).padStart(4, '0')}`,
  row.id, '2020-01-01T01:00:00Z'));
const events = n => leads(n).map(row => ({ canonical_lead_id: row.id, company_id: A,
  status: 'QUALIFIED', revision: 2 }));
const base = { trials: [t], scopes: [scope('acct')], accounts: [account('acct')],
  spend: [spend('acct', 1000001)], leads: leads(3), touches: touches(3), events: events(3) };

test('summary gates and trial dates match queue', async () => {
  assert.equal((await harness({ ...base, enabled: false }).send('/summary', q)).statusCode, 404);
  assert.equal((await harness({ ...base, role: 'sales_admin' }).send('/summary', q)).statusCode, 403);
  assert.equal((await harness({ ...base, company: B, tenant: [B] }).send('/summary', q)).statusCode, 404);
  assert.equal((await harness({ ...base, trials: [{ ...t, start_date: null }] }).send('/summary', q)).body.reason_code,
    'TRIAL_DATES_MISSING');
});

test('complete spend gives exact integer ceiling and no verdict', async () => {
  const result = await harness(base).send('/summary', q);
  assert.equal(result.statusCode, 200);
  const body = result.body;
  assert.equal(body.spend.vnd, 1000001);
  assert.equal(body.cost_per_qualified_lead.status, 'PROVISIONAL');
  assert.equal(body.cost_per_qualified_lead.vnd_ceil, 333334);
  assert.equal(body.cost_per_qualified_lead.denominator, 3);
  assert.equal(body.verdict, 'NOT_EVALUATED');
  assert.ok(body.caveats.includes('SPEND_AD_LEVEL_ONLY'));
  assert.doesNotMatch(JSON.stringify(body), /target_met|passed|phone|email|Synthetic/);
  const exact = await harness({ ...base, spend: [spend('acct', 999999)] }).send('/summary', q);
  assert.equal(exact.body.cost_per_qualified_lead.vnd_ceil, 333333);
});

test('zero qualified and missing spend never display zero cost', async () => {
  const zero = (await harness({ ...base, events: [] }).send('/summary', q)).body;
  assert.equal(zero.cost_per_qualified_lead.status, 'NO_QUALIFIED_LEADS');
  assert.equal(zero.cost_per_qualified_lead.vnd_ceil, null);
  const partial = (await harness({ ...base, accounts: [account('acct', false)] }).send('/summary', q)).body;
  assert.equal(partial.spend.status, 'PARTIAL'); assert.equal(partial.spend.vnd, null);
  assert.equal(partial.cost_per_qualified_lead.status, 'UNKNOWN');
  const unproven = (await harness({ ...base, accounts: [] }).send('/summary', q)).body;
  assert.equal(unproven.spend.status, 'UNPROVEN'); assert.equal(unproven.spend.vnd, null);
  const noScope = (await harness({ ...base, scopes: [] }).send('/summary', q)).body;
  assert.equal(noScope.spend.status, 'UNPROVEN'); assert.equal(noScope.spend.vnd, null);
  assert.ok(noScope.spend.reasons.includes('NO_FACEBOOK_SCOPE'));
});

test('all accounts must complete; source and DB errors return clean 503', async () => {
  const all = (await harness({ ...base, scopes: [scope('acct'), scope('second')],
    accounts: [account('acct'), account('second')],
    spend: [spend('acct', 1000001), spend('second', 2)] }).send('/summary', q)).body;
  assert.equal(all.spend.vnd, 1000003);
  const mixed = (await harness({ ...base, scopes: [scope('acct'), scope('missing')] }).send('/summary', q)).body;
  assert.equal(mixed.spend.vnd, null);
  assert.equal(mixed.spend.accounts.length, 2);
  const duplicate = (await harness({ ...base, scopes: [scope('acct'), scope('acct')] }).send('/summary', q)).body;
  assert.equal(duplicate.spend.vnd, null);
  assert.ok(duplicate.spend.reasons.includes('DUPLICATE_ACCOUNT_SCOPE'));
  assert.equal((await harness({ ...base, fail: 'p1_trial_scopes' }).send('/summary', q)).body.reason_code,
    'SOURCE_UNAVAILABLE');
  const failed = await harness({ ...base, fail: 'fb_ad_spend_daily' }).send('/summary', q);
  assert.equal(failed.statusCode, 503);
  assert.doesNotMatch(JSON.stringify(failed.body), /private DB/);
});

test('whole cohort counts across pages, chunks, latest revision and unavailable CRM', async () => {
  const n = 501;
  const result = await harness({ ...base, leads: leads(n - 1), touches: touches(n),
    events: [...events(n), { canonical_lead_id: 'lead-0', company_id: A,
      status: 'REJECTED', revision: 1 }] }).send('/summary', q);
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.leads.candidates, 500);
  assert.equal(result.body.leads.qualified, 500);
  assert.equal(result.body.leads.excluded_unavailable, 1);
  assert.equal(result.body.cost_per_qualified_lead.vnd_ceil, 2001);
});
