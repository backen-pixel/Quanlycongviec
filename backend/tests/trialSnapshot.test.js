'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { buildTrialSummary } = require('../src/modules/marketingAutomation/trialSummary');
const { harness, base, q, t, A, B } = require('./p1QualificationSummary.route.test');

test('builder preserves summary JSON and emits only proven whole VND days', async () => {
  const h = harness(base), direct = await buildTrialSummary({ db: h.db, trial: t });
  const route = (await h.send('/summary', q)).body;
  direct.summary.as_of = route.as_of;
  direct.summary.spend.as_of = route.spend.as_of;
  assert.deepEqual(JSON.parse(JSON.stringify(direct.summary)), JSON.parse(JSON.stringify(route)));
  assert.deepEqual(direct.spendByDay, [{ account_id: 'acct', day: t.start_date, vnd: 1000001 }]);
  const partial = await buildTrialSummary({ db: harness({ ...base, accounts: [] }).db, trial: t });
  assert.equal(partial.summary.spend.status, 'UNPROVEN');
  assert.deepEqual(partial.spendByDay, []);
});

test('snapshot route gates and returns ordered public projections only', async () => {
  const snapshots = [1, 2].map(n => ({ trial_id: t.id, company_id: A,
    taken_at: `2026-10-0${n}T00:00:00Z`, as_of: `2026-10-0${n}T00:00:00Z`,
    spend_by_day: [{ account_id: 'secret' }], summary: { phone: 'private',
      spend: { vnd: n === 1 ? null : 0, status: 'COMPLETE' },
      leads: { candidates: n, qualified: 0 }, milestone: { reached: n,
        cost_to_date: { vnd_ceil: null } } } }));
  assert.equal((await harness({ enabled: false }).send('/snapshots', q)).statusCode, 404);
  assert.equal((await harness({ role: 'sales_admin' }).send('/snapshots', q)).statusCode, 403);
  assert.equal((await harness({ company: B, tenant: [B] }).send('/snapshots', q)).statusCode, 404);
  const result = await harness({ snapshots }).send('/snapshots', { ...q, limit: 2 });
  assert.deepEqual(JSON.parse(JSON.stringify(result.body.snapshots.map(s => s.candidates))), [2, 1]);
  assert.equal(result.body.snapshots[0].spend_vnd, 0);
  assert.equal(result.body.snapshots[1].spend_vnd, null);
  assert.doesNotMatch(JSON.stringify(result.body), /private|phone|spend_by_day|secret/);
  assert.equal((await harness({ snapshots }).send('/snapshots', { ...q, limit: 201 })).statusCode, 400);
  const failed = await harness({ snapshots, fail: 'p1_trial_snapshots' }).send('/snapshots', q);
  assert.equal(failed.statusCode, 503);
  assert.doesNotMatch(JSON.stringify(failed.body), /private/);
});

const source = fs.readFileSync(path.join(__dirname, '../src/jobs/p1TrialSnapshotRunner.js'), 'utf8');
function runner({ flag = '1', target = 'primary', trials = [], build, writeError = false } = {}) {
  const writes = [], warnings = [], delays = [], reads = [];
  let first;
  const db = { from(name) {
    reads.push(name);
    let rows = trials;
    const query = { select() { return query; }, in(k, values) { rows = rows.filter(r => values.includes(r[k])); return query; },
      lte(k, v) { rows = rows.filter(r => r[k] <= v); return query; },
      gte(k, v) { rows = rows.filter(r => r[k] >= v); return query; },
      order() { return query; }, async range(a, b) { return { data: rows.slice(a, b + 1), error: null }; } };
    return query;
  }, async rpc(name, args) { writes.push([name, args]); return { error: writeError ? Error('private token') : null }; } };
  const timers = { setTimeout(fn, ms) { delays.push(ms); first = fn; return { unref() {} }; },
    setInterval(fn, ms) { delays.push(ms); return { fn, unref() {} }; }, clearTimeout() {}, clearInterval() {} };
  const imports = { '../config/supabase': { supabase: db },
    '../config/supabaseRouter': { getActiveTarget: () => target, withPrimaryDatabase: fn => fn() },
    '../helpers/cronLeader': { runIfLeader: (_key, fn) => fn() },
    '../modules/marketingAutomation/trialSummary': { buildTrialSummary: build || (async () => ({
      summary: { as_of: '2026-10-08T04:00:00Z', spend: { status: 'COMPLETE' } }, spendByDay: [] })) } };
  const module = { exports: {} };
  // Pin "today" to the day these windows were written for, so the test does not expire.
  const FIXED_NOW = Date.parse('2026-10-08T05:00:00Z');
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [FIXED_NOW])); }
    static now() { return FIXED_NOW; }
  }
  vm.runInNewContext(`(function(require,module,process,console,setTimeout,setInterval,clearTimeout,clearInterval){${source}\n})`,
    { Date: FixedDate, Intl, Number, Error },
  )(name => imports[name], module, { env: { VPT_P1_SNAPSHOT_CRON: flag } },
    { warn: value => warnings.push(value) }, timers.setTimeout, timers.setInterval,
    timers.clearTimeout, timers.clearInterval);
  return { job: module.exports, writes, warnings, delays, reads, fireFirst: () => first() };
}

test('runner flag, primary gate, date window, isolation and one RPC per success', async () => {
  const disabled = runner({ flag: '0' }); disabled.job.start();
  assert.deepEqual(disabled.delays, []);
  assert.equal((await disabled.job.runOnce()).skip, 'disabled');
  const backup = runner({ target: 'backup' });
  assert.equal((await backup.job.runOnce()).skip, 'not_primary'); assert.deepEqual(backup.reads, []);
  const trial = (id, status, start_date, end_date) => ({ id, company_id: A, name: id,
    status, start_date, end_date });
  const rows = [trial('good', 'APPROVED', '2026-10-01', '2026-10-08'),
    trial('bad', 'CLOSED', '2026-10-01', '2026-10-08'),
    trial('boundary', 'CLOSED', '2026-09-02', '2026-10-01'),
    trial('late', 'CLOSED', '2026-10-01', '2026-10-07'),
    trial('draft', 'DRAFT', '2026-10-01', '2026-10-08'),
    trial('future', 'APPROVED', '2099-01-01', '2099-01-30'),
    trial('expired', 'CLOSED', '2026-09-01', '2026-09-30')];
  const r = runner({ trials: rows, build: async ({ trial: item }) => {
    if (item.id === 'bad') throw Error('private token');
    return { summary: { as_of: '2026-10-08T04:00:00Z', spend: { status: 'COMPLETE' } }, spendByDay: [] };
  } });
  assert.equal((await r.job.runOnce()).processed, 3);
  assert.deepEqual(r.writes.map(([, args]) => args._trial_id).sort(), ['boundary', 'good', 'late']);
  assert.ok(r.writes.every(([name]) => name === 'p1_trial_snapshot_put_v1'));
  assert.deepEqual(r.warnings, ['[p1-snapshot] TRIAL_FAILED']);
  r.job.start(); assert.deepEqual(r.delays, [600000]);
  await r.fireFirst(); assert.deepEqual(r.delays, [600000, 21600000]); r.job.stop();
});

test('runner blocks overlap and hides write errors', async () => {
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const hold = new Promise(resolve => { release = resolve; });
  const row = { id: 'one', company_id: A, status: 'APPROVED', start_date: '2026-10-01', end_date: '2026-10-08' };
  const r = runner({ trials: [row], writeError: true, build: async () => { entered(); await hold;
    return { summary: { as_of: '2026-10-08T04:00:00Z', spend: { status: 'COMPLETE' } }, spendByDay: [] }; } });
  const pending = r.job.runOnce(); await started;
  assert.equal((await r.job.runOnce()).skip, 'dang_chay');
  release(); await pending;
  assert.equal(r.writes.length, 1);
  assert.deepEqual(r.warnings, ['[p1-snapshot] TRIAL_FAILED']);
  assert.doesNotMatch(JSON.stringify(r.warnings), /private token/);
});
