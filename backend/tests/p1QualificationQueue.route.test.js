'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createHash } = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, '../src/routes/p1Qualification.js'), 'utf8');
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const trial = { id: 'trial-a', company_id: A, name: 'Đợt thử A', status: 'APPROVED',
  start_date: '2026-10-07', end_date: '2026-10-08' };
const touch = (id, lead_id, cham_dau_luc, kenh = 'messenger', company_id = A) =>
  ({ id, lead_id, cham_dau_luc, kenh, company_id, fb_campaign_id: 'campaign', fb_ad_id: 'ad' });

function harness({ enabled = true, role = 'admin', company = A, tenant = [A, B],
  trials = [trial], touches = [], events = [], leads = [], scopes = [], accounts = [], spend = [], fail = null } = {}) {
  const layers = [], calls = [];
  const tables = { p1_trials: trials, lead_attribution: touches,
    p1_qualification_events: events, crm_leads: leads, p1_trial_scopes: scopes,
    fb_ad_accounts: accounts, fb_ad_spend_daily: spend };
  const db = { from(name) {
    calls.push(name);
    let rows = tables[name] || [], offset = 0, end = Infinity, selected = '', ordering = [];
    const q = {
      select(cols) { selected = cols; calls.push([name, cols]); return q; },
      eq(key, value) { rows = rows.filter(row => row[key] === value); return q; },
      in(key, values) { rows = rows.filter(row => values.includes(row[key])); return q; },
      not(key) { rows = rows.filter(row => row[key] != null); return q; },
      or(expr) { // supports "field.eq.value" and "field.is.null" terms joined by commas
        const terms = String(expr).split(',').map(term => term.split('.'));
        rows = rows.filter(row => terms.some(([key, op, value]) =>
          op === 'eq' ? row[key] === value : op === 'is' && value === 'null' ? row[key] == null : false));
        return q;
      },
      gte(key, value) { rows = rows.filter(row => Date.parse(row[key]) >= Date.parse(value)); return q; },
      lte(key, value) { rows = rows.filter(row => String(row[key]) <= String(value)); return q; },
      lt(key, value) { rows = rows.filter(row => Date.parse(row[key]) < Date.parse(value)); return q; },
      order(key, { ascending }) { ordering.push([key, ascending]); return q; },
      range(from, to) { offset = from; end = to + 1; return q; },
      async maybeSingle() { return { data: rows[0] || null, error: fail === name ? Error('private DB') : null }; },
      then(resolve) {
        const sorted = [...rows].sort((a, b) => {
          for (const [key, ascending] of ordering) {
            const x = String(a[key] ?? ''), y = String(b[key] ?? '');
            const result = (x < y ? -1 : x > y ? 1 : 0) * (ascending ? 1 : -1);
            if (result) return result;
          }
          return 0;
        });
        const data = sorted.slice(offset, end).map(row => Object.fromEntries(
          selected.split(',').map(key => key.trim()).filter(key => key in row).map(key => [key, row[key]])));
        return Promise.resolve({ data, count: rows.length,
          error: fail === name ? Error('private DB') : null }).then(resolve);
      },
    };
    return q;
  } };
  const router = { use(fn) { layers.push(['USE', null, fn]); },
    get(url, fn) { layers.push(['GET', url, fn]); },
    put() {}, post() {} };
  const imports = {
    express: { Router: () => router }, '../config/supabase': { supabase: db },
    '../config/supabaseRouter': { getActiveTarget: () => 'primary', withPrimaryDatabase: fn => fn() },
    '../middleware/auth': { auth: (_req, _res, next) => next() },
    '../helpers/tenantScope': { isTenantScopeEnforced: () => true },
    '../modules/marketingAutomation/qualification': require('../src/modules/marketingAutomation/qualification'),
    '../modules/marketingAutomation/trialCohort': require('../src/modules/marketingAutomation/trialCohort'),
    '../modules/marketingAutomation/spendCoverage': require('../src/modules/marketingAutomation/spendCoverage'),
    '../modules/marketingAutomation/policy': require('../src/modules/marketingAutomation/policy'),
  };
  vm.runInNewContext(`(function(require,module,process){${source}\n})`,
    { Buffer, Date, Error, console, JSON, Object, String, Number, Map, Array, Set },
  ).call(null, name => name === 'node:crypto' ? { createHash } : imports[name],
    { exports: {} }, { env: { VPT_P1_REVIEW_WRITE: enabled ? '1' : '0' } });
  async function send(url, query = {}) {
    const req = { user: { role, company_id: company, userId: 'actor' }, tenantCompanyIds: tenant, query };
    const res = { statusCode: 200, body: null,
      status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; return this; } };
    for (const [method, route, fn] of layers) {
      if (method !== 'USE' && route !== url) continue;
      let next = false; await fn(req, res, () => { next = true; });
      if (!next) break;
    }
    return res;
  }
  return { send, calls };
}
const query = { trial_id: trial.id };
test('flag and role gate all reads', async () => {
  assert.equal((await harness({ enabled: false }).send('/config')).statusCode, 404);
  assert.equal((await harness({ role: 'sales_admin' }).send('/config')).statusCode, 403);
  assert.deepEqual(JSON.parse(JSON.stringify((await harness().send('/config')).body)),
    { enabled: true, can_mark: true });
});
module.exports = { harness, trial, touch, A, B };
test('trials and queue remain within company and tenant', async () => {
  const h = harness({ trials: [trial, { ...trial, id: 'trial-b', company_id: B }] });
  assert.equal((await h.send('/trials')).body.trials.length, 1);
  assert.equal((await h.send('/queue', { trial_id: 'trial-b' })).statusCode, 404);
  assert.equal((await h.send('/queue', { trial_id: 'unknown' })).statusCode, 404);
  assert.equal((await harness({ company: null, tenant: [A] }).send('/queue', { trial_id: 'trial-b' })).statusCode, 404);
});
test('missing dates return 409', async () => {
  const h = harness({ trials: [{ ...trial, start_date: null }] });
  assert.equal((await h.send('/queue', query)).body.reason_code, 'TRIAL_DATES_MISSING');
});
test('Vietnam time bounds, Facebook channels, deduplication and private fields', async () => {
  const touches = [
    touch('01', 'one', '2026-10-06T17:00:00Z'),
    touch('02', 'two', '2026-10-08T16:59:00Z', 'lead_ads'),
    touch('03', 'three', '2026-10-08T17:00:00Z'),
    touch('04', 'four', '2026-10-07T08:00:00Z', 'website'),
    touch('05', 'one', '2026-10-07T09:00:00Z'),
  ];
  const leads = ['one', 'two'].map(id => ({ id, company_id: A, code: id, title: id, phone: 'private', email: 'private' }));
  const h = harness({ touches, leads }), result = await h.send('/queue', query);
  assert.equal(result.body.rows.length, 2); assert.deepEqual(Array.from(result.body.rows, row => row.lead_id), ['two', 'one']);
  assert.equal(result.body.rows[1].touched_at, '2026-10-07T09:00:00Z'); assert.equal(result.body.scope_check, 'UNVERIFIED');
  assert.doesNotMatch(JSON.stringify(result.body), /phone|email|private/);
  assert.equal(h.calls.filter(call => call === 'p1_qualification_events').length, 1);
});
test('cursor, state filter and latest revision do not skip matches', async () => {
  const touches = ['01', '02', '03'].map(id => touch(id, id, '2026-10-07T01:00:00Z'));
  const leads = touches.map(row => ({ id: row.lead_id, company_id: A, code: row.id, title: row.id }));
  const events = [{ canonical_lead_id: '02', company_id: A, status: 'REJECTED', revision: 1 },
    { canonical_lead_id: '02', company_id: A, status: 'QUALIFIED', revision: 2 }];
  const h = harness({ touches, leads, events });
  const first = (await h.send('/queue', { ...query, limit: 1 })).body; assert.equal(first.has_more, true);
  const second = (await h.send('/queue', { ...query, limit: 1, cursor: first.next_cursor })).body;
  assert.notEqual(first.rows[0].lead_id, second.rows[0].lead_id);
  const filtered = (await h.send('/queue', { ...query, state: 'QUALIFIED' })).body;
  assert.deepEqual(Array.from(filtered.rows, row => row.lead_id), ['02']); assert.equal(filtered.rows[0].state.revision, 2);
});
test('attribution rows without company_id are attributed through the lead CRM company', async () => {
  // Real data: recent attribution rows have company_id NULL; the lead CRM company decides.
  const touches = [touch('01', 'mine-null', '2026-10-07T01:00:00Z', 'messenger', null),
    touch('02', 'other-null', '2026-10-07T02:00:00Z', 'messenger', null),
    touch('03', 'tagged-b', '2026-10-07T03:00:00Z', 'messenger', B),
    touch('04', 'mine-tagged', '2026-10-07T04:00:00Z')];
  const leads = [{ id: 'mine-null', company_id: A, code: 'm1', title: 't' }, { id: 'other-null', company_id: B, code: 'o', title: 't' },
    { id: 'tagged-b', company_id: B, code: 'b', title: 't' }, { id: 'mine-tagged', company_id: A, code: 'm2', title: 't' }];
  const result = await harness({ touches, leads }).send('/queue', query);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(Array.from(result.body.rows, row => row.lead_id).sort(), ['mine-null', 'mine-tagged']);
  assert.equal(result.body.excluded_unavailable, 0);
});
test('DB failures return 503 and no empty queue', async () => {
  const h = harness({ fail: 'lead_attribution' }), result = await h.send('/queue', query);
  assert.equal(result.statusCode, 503); assert.equal(result.body.reason_code, 'SOURCE_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(result.body), /private DB/);
});
test('attribution source pages beyond 500 without losing the final row', async () => {
  const touches = Array.from({ length: 501 }, (_, i) => touch(String(i).padStart(3, '0'),
    `lead-${i}`, '2026-10-07T01:00:00Z'));
  const leads = touches.map(row => ({ id: row.lead_id, company_id: A, code: row.id, title: row.id }));
  const h = harness({ touches, leads }), result = await h.send('/queue', { ...query, limit: 50 });
  assert.equal(result.body.rows.length, 50); assert.equal(result.body.has_more, true);
  assert.equal(h.calls.filter(call => call === 'lead_attribution').length, 2);
  // 501 leads are read in chunks of 100 (6 queries), never one query per lead and never one giant IN().
  assert.equal(h.calls.filter(call => call === 'p1_qualification_events').length, 6);
});
test('a touch whose CRM record is missing is excluded, not a queue-wide failure', async () => {
  const touches = [touch('01', 'one', '2026-10-07T01:00:00Z'), touch('02', 'gone', '2026-10-07T02:00:00Z'),
    touch('03', 'other-company', '2026-10-07T03:00:00Z')];
  const leads = [{ id: 'one', company_id: A, code: 'one', title: 'one' },
    { id: 'other-company', company_id: B, code: 'x', title: 'x' }];
  const result = await harness({ touches, leads }).send('/queue', query);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(Array.from(result.body.rows, row => row.lead_id), ['one']);
  assert.equal(result.body.excluded_unavailable, 2);
});
