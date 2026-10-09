'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toWholeVnd, evaluateSpendCoverage, readFacebookSpend } =
  require('../src/modules/marketingAutomation/spendCoverage');

const NOW = Date.parse('2026-10-06T06:00:00Z');
const accountId = 'act_synthetic';
const sync = () => ({
  lan_dong_bo_cuoi: '2026-10-06T05:00:00Z',
  ket_qua_cuoi: { ok: true, complete: true, truncated: false, invalid_rows: 0,
    skipped_rows: 0, currency: 'VND', since: '2026-09-07', until: '2026-10-06' },
});
const row = (patch = {}) => ({ ad_id: 'ad_synthetic', ngay: '2026-10-05',
  ad_account_id: accountId, chi_tieu: '250000.00', tien_te: 'VND', ...patch });
function evaluate(patch = {}) {
  return evaluateSpendCoverage({ accountId, from: '2026-09-07', to: '2026-10-06',
    rows: [row()], sync: sync(), nowMs: NOW, today: '2026-10-06', ...patch });
}

test('whole VND parser rejects rounding, negatives, nonnumbers and overflow', () => {
  for (const [input, expected] of [['123456.00', 123456], [250000, 250000],
    ['0', 0], ['0.00', 0], ['1.01', null], [-1, null], ['-1', null],
    [NaN, null], ['n/a', null], ['1e3', null], [Number.MAX_SAFE_INTEGER + 1, null],
    ['9007199254740992.00', null]]) assert.equal(toWholeVnd(input), expected);
});

test('complete VND account and ad rows produce integer spend', () => {
  const result = evaluate({ rows: [row(), row({ ad_id: 'ad_2', chi_tieu: '250001.00' })] });
  assert.equal(result.status, 'COMPLETE');
  assert.equal(result.spendVnd, 500001);
  assert.equal(result.daysCovered, 30);
  assert.equal(result.asOf, sync().lan_dong_bo_cuoi);
  assert.equal(result.reconciliation, 'AD_LEVEL_ONLY');
  assert.deepEqual(result.reasons, []);
});

test('account reconciliation marks MATCH and only in-window mismatch partial', () => {
  const matched = sync();
  matched.ket_qua_cuoi.reconciliation = { status: 'MATCH', mismatched_days: [] };
  assert.equal(evaluate({ sync: matched }).reconciliation, 'ACCOUNT_LEVEL_MATCHED');
  const mismatched = sync();
  mismatched.ket_qua_cuoi.reconciliation = { status: 'MISMATCH', mismatched_days: [
    { day: '2026-10-05', ad_level_vnd: 250000, account_level_vnd: 250001 }] };
  const inside = evaluate({ sync: mismatched });
  assert.equal(inside.status, 'PARTIAL');
  assert.equal(inside.spendVnd, 250000);
  assert.ok(inside.reasons.includes('ACCOUNT_TOTAL_MISMATCH'));
  const outside = evaluate({ sync: mismatched, to: '2026-10-04', rows: [] });
  assert.equal(outside.status, 'COMPLETE');
  assert.ok(!outside.reasons.includes('ACCOUNT_TOTAL_MISMATCH'));
  const future = sync();
  future.ket_qua_cuoi.reconciliation = { status: 'MISMATCH', mismatched_days: [
    { day: '2026-10-07', ad_level_vnd: 0, account_level_vnd: 1 }] };
  assert.equal(evaluate({ sync: future, to: '2026-10-07' }).status, 'COMPLETE');
  const zeroMismatch = evaluate({ sync: mismatched, rows: [] });
  assert.equal(zeroMismatch.status, 'PARTIAL');
  assert.equal(zeroMismatch.spendVnd, 0);
  mismatched.ket_qua_cuoi.reconciliation.status = 'UNAVAILABLE';
  assert.equal(evaluate({ sync: mismatched }).status, 'COMPLETE');
  assert.equal(evaluate({ sync: mismatched }).reconciliation, 'AD_LEVEL_ONLY');
});

test('freshness applies to current day but not an ended period', () => {
  const old = sync(); old.lan_dong_bo_cuoi = '2026-10-05T21:59:59Z';
  assert.equal(evaluate({ sync: old }).status, 'STALE');
  assert.equal(evaluate({ sync: old, to: '2026-10-05' }).status, 'COMPLETE');
});

for (const [name, patch] of [
  ['truncated', { truncated: true }], ['incomplete', { complete: false }],
  ['invalid rows', { invalid_rows: 1 }], ['skipped rows', { skipped_rows: 1 }],
]) test(`${name} sync is partial`, () => {
  const s = sync(); Object.assign(s.ket_qua_cuoi, patch);
  assert.equal(evaluate({ sync: s }).status, 'PARTIAL');
});

test('failed sync is failed; currency mismatches have their own status', () => {
  const bad = sync(); bad.ket_qua_cuoi.ok = false;
  assert.equal(evaluate({ sync: bad }).status, 'FAILED');
  const usd = sync(); usd.ket_qua_cuoi.currency = 'USD';
  assert.equal(evaluate({ sync: usd }).status, 'CURRENCY_MISMATCH');
  assert.equal(evaluate({ rows: [row({ tien_te: 'USD' })] }).status, 'CURRENCY_MISMATCH');
  assert.equal(evaluate({ rows: [row({ tien_te: 'USD' })] }).spendVnd, null);
});

test('an uncovered old date remains unproven, with only valid rows summed', () => {
  const s = sync(); s.ket_qua_cuoi.since = '2026-09-08';
  const result = evaluate({ sync: s });
  assert.equal(result.status, 'UNPROVEN');
  assert.equal(result.spendVnd, 250000);
  assert.equal(result.daysCovered, 29);
  assert.ok(result.reasons.includes('SYNC_WINDOW_UNPROVEN'));
});

test('duplicate ad/day, wrong account, out of range and invalid amount fail', () => {
  for (const invalid of [row(), row({ ad_account_id: 'act_other' }),
    row({ ngay: '2026-09-06' }), row({ chi_tieu: '1.01' })]) {
    const result = evaluate({ rows: [row(), invalid] });
    assert.equal(result.status, 'FAILED');
    assert.equal(result.spendVnd, 250000);
  }
});

test('no rows are confirmed zero only with complete coverage', () => {
  const zero = evaluate({ rows: [] });
  assert.equal(zero.status, 'COMPLETE');
  assert.equal(zero.spendVnd, 0);
  assert.deepEqual(zero.reasons, ['NO_ROWS_CONFIRMED_ZERO']);
  const s = sync(); s.ket_qua_cuoi.since = '2026-09-08';
  const missing = evaluate({ rows: [], sync: s });
  assert.equal(missing.status, 'UNPROVEN');
  assert.equal(missing.spendVnd, null);
});

test('invalid date and overflow fail without a fabricated amount', () => {
  assert.equal(evaluate({ from: '2026-02-30' }).status, 'FAILED');
  const result = evaluate({ rows: [row({ chi_tieu: Number.MAX_SAFE_INTEGER }),
    row({ ad_id: 'ad_2', chi_tieu: '1.00' })] });
  assert.equal(result.status, 'FAILED');
  assert.equal(result.spendVnd, null);
  assert.ok(result.reasons.includes('AMOUNT_OVERFLOW'));
});

function fakeDb({ spend = [row()], account = { ad_account_id: accountId, bat: true, ...sync() },
  errorTable = null } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table }; calls.push(call);
      const query = {
        select(columns) { call.columns = columns; return query; },
        eq(column, value) { (call.eq ||= []).push([column, value]); return query; },
        gte(column, value) { call.gte = [column, value]; return query; },
        lte(column, value) { call.lte = [column, value]; return query; },
        order(column, options) { (call.order ||= []).push([column, options.ascending]); return query; },
        maybeSingle: async () => errorTable === table ? { error: { message: 'private' } } : { data: account, error: null },
        range: async (from, to) => {
          call.range = [from, to];
          return errorTable === table ? { error: { message: 'private' } } :
            { data: spend.slice(from, to + 1), error: null };
        },
      };
      return query;
    },
  };
}

test('adapter reads every page in stable order and never selects or returns token', async () => {
  const db = fakeDb({ spend: [row(), row({ ad_id: 'ad_2' }), row({ ad_id: 'ad_3' })],
    account: { ...sync(), ad_account_id: accountId, bat: true, access_token: 'private' } });
  const result = await readFacebookSpend(db, { accountId, from: '2026-09-07',
    to: '2026-10-06', pageSize: 2 });
  assert.equal(result.status, 'COMPLETE');
  assert.equal(result.spendVnd, 750000);
  assert.deepEqual(db.calls.filter(x => x.table === 'fb_ad_spend_daily').map(x => x.range),
    [[0, 1], [2, 3]]);
  assert.deepEqual(db.calls[1].order, [['ngay', true], ['ad_id', true]]);
  assert.deepEqual(db.calls[1].eq, [['ad_account_id', accountId]]);
  assert.deepEqual(db.calls[1].gte, ['ngay', '2026-09-07']);
  assert.deepEqual(db.calls[1].lte, ['ngay', '2026-10-06']);
  for (const call of db.calls) assert.doesNotMatch(call.columns, /token/i);
  assert.doesNotMatch(JSON.stringify(result), /private|token/i);
});

test('page limit, DB errors and unavailable account fail closed', async () => {
  const input = { accountId, from: '2026-09-07', to: '2026-10-06', pageSize: 1 };
  const spend = Array.from({ length: 200 }, (_, i) => row({ ad_id: `ad_${i}` }));
  const limited = await readFacebookSpend(fakeDb({ spend }), input);
  assert.equal(limited.status, 'FAILED');
  assert.deepEqual(limited.reasons, ['PAGE_LIMIT']);
  for (const table of ['fb_ad_accounts', 'fb_ad_spend_daily']) {
    const result = await readFacebookSpend(fakeDb({ errorTable: table }), input);
    assert.equal(result.status, 'FAILED');
    assert.equal(result.spendVnd, null);
    assert.deepEqual(result.reasons, ['DB_ERROR']);
  }
  for (const account of [null, { ...sync(), bat: false }]) {
    const result = await readFacebookSpend(fakeDb({ account }), input);
    assert.equal(result.status, 'UNPROVEN');
    assert.equal(result.spendVnd, null);
  }
});
