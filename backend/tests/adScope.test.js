'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { checkAdScope } = require('../src/modules/marketingAutomation/adScope');

function fakeDb(tables, fail) {
  const calls = [];
  return { calls, from(name) {
    let rows = tables[name] || [], selected = '', start = 0, end = Infinity;
    const q = {
      select(cols) { selected = cols; return q; },
      eq(key, value) { rows = rows.filter(row => row[key] === value); return q; },
      in(key, values) { calls.push([name, key, values.length]);
        rows = rows.filter(row => values.includes(row[key])); return q; },
      order() { return q; },
      range(from, to) { start = from; end = to + 1; return q; },
      then(resolve) { return Promise.resolve({
        data: rows.slice(start, end).map(row => Object.fromEntries(selected.split(',')
          .filter(key => key in row).map(key => [key, row[key]]))),
        error: fail === name ? Error('DB failed') : null,
      }).then(resolve); },
    };
    return q;
  } };
}
const row = (id, ad, title = 'Bài viết') => ({ id, lead_id: `lead-${id}`,
  fb_ad_id: ad, fb_ad_title: title });
const scopes = [{ account_id: 'acct' }];

test('classifies spend, catalog, missing ad and outside ad by exact account membership', async () => {
  const candidates = [row('1', '120267'), row('2', 'catalog'), row('3', 'other267'), row('4', null)];
  const db = fakeDb({ fb_ad_spend_daily: [{ ad_id: '120267', ad_account_id: 'acct' },
    { ad_id: 'other267', ad_account_id: 'different' }],
  fb_ad_catalog: [{ ad_id: 'catalog', ad_account_id: 'acct' }],
  lead_attribution: candidates });
  const { scopeCheck, inScopeLeadIds, classifications } = await checkAdScope(db, candidates, scopes);
  assert.equal(scopeCheck.status, 'PARTIAL');
  assert.deepEqual([scopeCheck.in_scope, scopeCheck.not_in_connected_accounts,
    scopeCheck.no_ad_reference], [2, 1, 1]);
  assert.deepEqual([...inScopeLeadIds], ['lead-1', 'lead-2']);
  assert.deepEqual([...classifications.values()], ['IN_SCOPE', 'IN_SCOPE',
    'NOT_IN_CONNECTED_ACCOUNTS', 'NO_AD_REFERENCE']);
  assert.deepEqual(scopeCheck.unverified_ads, [{ ad_id: 'other267', title: 'Bài viết', leads: 1 }]);
  assert.doesNotMatch(JSON.stringify(scopeCheck), /lead-3|phone|email/);
});

test('batches over 100 ads and reads every page', async () => {
  const candidates = Array.from({ length: 101 }, (_, i) => row(String(i), `ad-${i}`));
  const duplicates = Array.from({ length: 501 }, () => ({ ad_id: 'ad-0', ad_account_id: 'acct' }));
  const db = fakeDb({ fb_ad_spend_daily: duplicates, lead_attribution: candidates });
  const { scopeCheck } = await checkAdScope(db, candidates, scopes);
  assert.equal(scopeCheck.in_scope, 1);
  assert.ok(db.calls.filter(([table, key]) => table === 'fb_ad_spend_daily' && key === 'ad_id')
    .every(([, , size]) => size <= 100));
  assert.ok(db.calls.filter(([table, key]) => table === 'fb_ad_spend_daily' && key === 'ad_id').length >= 3);
});

test('DB errors fail closed and outside list is sorted, capped and omits lead identity', async () => {
  const candidates = Array.from({ length: 12 }, (_, i) => row(String(i), `ad-${i}`));
  candidates.push(row('extra', 'ad-5'));
  const db = fakeDb({ lead_attribution: candidates });
  const { scopeCheck } = await checkAdScope(db, candidates, scopes);
  assert.equal(scopeCheck.status, 'NONE_IN_SCOPE');
  assert.equal(scopeCheck.unverified_ads.length, 10);
  assert.equal(scopeCheck.unverified_ads[0].ad_id, 'ad-5');
  assert.equal(scopeCheck.unverified_ads[0].leads, 2);
  assert.doesNotMatch(JSON.stringify(scopeCheck), /lead-extra|phone|email/);
  await assert.rejects(checkAdScope(fakeDb({}, 'fb_ad_spend_daily'), [row('1', 'ad')], scopes));
  await assert.rejects(checkAdScope(fakeDb({}, 'fb_ad_catalog'), [row('1', 'ad')], scopes));
});
