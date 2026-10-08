'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createHash } = require('node:crypto');
const { trial, touch, A, B } = require('./p1QualificationQueue.route.test');
const source = fs.readFileSync(path.join(__dirname, '../src/routes/p1Qualification.js'), 'utf8');
function harness({ enabled = true, role = 'admin', company = A, tenant = [A, B],
  trials = [trial], touches = [], events = [], leads = [], scopes = [], accounts = [],
  spend = [], stages = [], fail = null } = {}) {
  const layers = [], calls = [];
  const tables = { p1_trials: trials, lead_attribution: touches,
    p1_qualification_events: events, crm_leads: leads, p1_trial_scopes: scopes,
    fb_ad_accounts: accounts, fb_ad_spend_daily: spend, crm_lead_stage_history: stages };
  const db = { from(name) {
    calls.push(name);
    let rows = tables[name] || [], offset = 0, end = Infinity, selected = '', ordering = [];
    const q = {
      select(cols) { selected = cols; calls.push([name, cols]); return q; },
      eq(key, value) { rows = rows.filter(row => row[key] === value); return q; },
      in(key, values) { rows = rows.filter(row => values.includes(row[key])); return q; },
      not(key) { rows = rows.filter(row => row[key] != null); return q; },
      or(expr) { const terms = String(expr).split(',').map(term => term.split('.'));
        rows = rows.filter(row => terms.some(([key, op, value]) => op === 'eq'
          ? row[key] === value : op === 'is' && value === 'null' && row[key] == null)); return q; },
      gte(key, value) { rows = rows.filter(row => Date.parse(row[key]) >= Date.parse(value)); return q; },
      lte(key, value) { rows = rows.filter(row => String(row[key]) <= String(value)); return q; },
      lt(key, value) { rows = rows.filter(row => Date.parse(row[key]) < Date.parse(value)); return q; },
      order(key, { ascending }) { ordering.push([key, ascending]); return q; },
      range(from, to) { offset = from; end = to + 1; return q; },
      async maybeSingle() { return { data: rows[0] || null,
        error: fail === name ? Error('private DB') : null }; },
      then(resolve) { const sorted = [...rows].sort((a, b) => {
        for (const [key, ascending] of ordering) {
          const x = String(a[key] ?? ''), y = String(b[key] ?? '');
          const result = (x < y ? -1 : x > y ? 1 : 0) * (ascending ? 1 : -1);
          if (result) return result;
        }
        return 0;
      });
        const data = sorted.slice(offset, end).map(row => Object.fromEntries(
          selected.split(',').map(key => key.trim()).filter(key => key in row).map(key => [key, row[key]])));
        return Promise.resolve({ data, error: fail === name ? Error('private DB') : null }).then(resolve);
      },
    };
    return q;
  } };
  const router = { use(fn) { layers.push(['USE', null, fn]); },
    get(url, fn) { layers.push(['GET', url, fn]); }, put() {}, post() {} };
  const imports = {
    express: { Router: () => router }, '../config/supabase': { supabase: db },
    '../config/supabaseRouter': { getActiveTarget: () => 'primary', withPrimaryDatabase: fn => fn() },
    '../middleware/auth': { auth: (_req, _res, next) => next() },
    '../helpers/tenantScope': { isTenantScopeEnforced: () => true },
    '../modules/marketingAutomation/qualification': require('../src/modules/marketingAutomation/qualification'),
    '../modules/marketingAutomation/trialCohort': require('../src/modules/marketingAutomation/trialCohort'),
    '../modules/marketingAutomation/spendCoverage': require('../src/modules/marketingAutomation/spendCoverage'),
    '../modules/marketingAutomation/policy': require('../src/modules/marketingAutomation/policy'),
    '../modules/marketingAutomation/stageMilestone': require('../src/modules/marketingAutomation/stageMilestone'),
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
  assert.equal(body.milestone.candidates, 3);
  assert.equal(body.milestone.reached, 0);
  assert.equal(body.milestone.cost_to_date.status, 'NO_QUALIFIED_LEADS');
  assert.equal(body.milestone.definition.human_only, true);
  assert.ok(body.caveats.includes('MILESTONE_IS_STAGE_PROXY'));
  assert.ok(body.caveats.includes('SPEND_AD_LEVEL_ONLY'));
  assert.doesNotMatch(JSON.stringify(body), /target_met|passed|changed_by|phone|email|Synthetic/);
  const exact = await harness({ ...base, spend: [spend('acct', 999999)] }).send('/summary', q);
  assert.equal(exact.body.cost_per_qualified_lead.vnd_ceil, 333333);
});

test('summary counts human stage milestones and returns no private fields', async () => {
  const stage = (lead_id, to_canonical_slug, entered_at, changed_by = 'staff') =>
    ({ lead_id, to_canonical_slug, entered_at, changed_by });
  const stages = [stage('lead-0', 'hot', '2020-01-01T02:00:00Z'),
    stage('lead-1', 'quoted', '2020-01-01T03:00:00Z'),
    stage('lead-2', 'hot', '2020-01-01T04:00:00Z', null)];
  const laterSpend = { ...spend('acct', 500000), ad_id: 'later', ngay: t.end_date };
  const result = await harness({ ...base, stages,
    spend: [...base.spend, laterSpend] }).send('/summary', q);
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.milestone.reached, 2);
  assert.equal(result.body.milestone.cost_to_date.vnd_ceil, 750001);
  assert.equal(result.body.milestone.mature_reached, 2);
  assert.equal(result.body.milestone.cost_mature.vnd_ceil, 750001);
  assert.equal(result.body.verdict, 'NOT_EVALUATED');
  assert.doesNotMatch(JSON.stringify(result.body), /target_met|passed|changed_by|phone|email/);
  const failed = await harness({ ...base, stages, fail: 'crm_lead_stage_history' }).send('/summary', q);
  assert.equal(failed.statusCode, 503);
  assert.equal(failed.body.reason_code, 'SOURCE_UNAVAILABLE');
});

test('new trial has no mature spending window', async () => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = key => parts.find(item => item.type === key).value;
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  const recent = { ...t, start_date: today, end_date: today };
  const body = (await harness({ ...base, trials: [recent],
    touches: [touch('recent-touch', 'lead-0', `${today}T01:00:00+07:00`)] })
    .send('/summary', q)).body;
  assert.equal(body.milestone.cost_mature.status, 'UNKNOWN');
  assert.equal(body.milestone.cost_mature.reason, 'NO_MATURE_WINDOW');
});

test('mature cost uses only spending through the four-day cutoff', async () => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = key => parts.find(item => item.type === key).value;
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  const start = new Date(Date.parse(`${today}T00:00:00Z`) - 6 * 86400000)
    .toISOString().slice(0, 10);
  const active = { ...t, start_date: start, end_date: today };
  const sync = { ...account('acct'), lan_dong_bo_cuoi: new Date().toISOString(),
    ket_qua_cuoi: { ...account('acct').ket_qua_cuoi, since: start, until: today } };
  const rows = [{ ...spend('acct', 1000001), ngay: start },
    { ...spend('acct', 500000), ngay: today, ad_id: 'later' }];
  const body = (await harness({ ...base, trials: [active], accounts: [sync], spend: rows,
    leads: leads(1), touches: [touch('recent', 'lead-0', `${start}T01:00:00+07:00`)],
    stages: [{ lead_id: 'lead-0', to_canonical_slug: 'hot', changed_by: 'staff',
      entered_at: `${start}T02:00:00+07:00` }] }).send('/summary', q)).body;
  assert.equal(body.milestone.cost_to_date.vnd_ceil, 1500001);
  assert.equal(body.milestone.cost_mature.vnd_ceil, 1000001);
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
