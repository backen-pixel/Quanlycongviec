'use strict';
const assert = require('node:assert/strict'), { randomUUID } = require('node:crypto');
const { reportTrial } = require('../src/modules/marketingAutomation/trialReport');
module.exports = async (t, { db, peers, company, admin, query, trial, start, stop, claim, finish, date }) => {
  const snapshot = () => query('marketing_lead_trial_snapshot', [admin, company, trial]);
  const enqueue = leadgenId => query('marketing_fb_lead_enqueue', [JSON.stringify([{ pageId: '123', formId: '456', leadgenId }]), 'd'.repeat(64)]);
  const task = async () => { const r = await start(); await finish(await claim(), [{ id: '456', status: 'ACTIVE', expiredLeads: 0 }]); return { run: r, item: await claim() }; };
  await t.test('closed census boundary and policy are persisted once, including exact replay', async () => {
    const key = randomUUID(), r = await start(key); const row = (await db.query('SELECT * FROM marketing_fb_census_runs WHERE id=$1', [r.id])).rows[0];
    assert.equal(row.until_at.toISOString(), new Date(date(0) + 'T00:00:00+07:00').toISOString());
    assert.equal(row.measurement_policy, 'VIETNAM_CLOSED_DAY_V1'); assert.equal((await start(key)).id, r.id); await stop();
  });
  await t.test('no full day in a new trial cannot be misrepresented as a zero-spend close', async () => {
    const id = randomUUID(); await query('marketing_lead_trial_set', [admin, company, id, randomUUID(), { name: 'No completed day', since: date(0), until: date(29), expectedRevision: 0 }]);
    await assert.rejects(query('marketing_fb_census_start', [admin, company, id, randomUUID(), ['123']]), e => e.code === '22023');
  });
  await t.test('observations have no direct grants even if public tables are exposed', async () => {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      await db.query('SET ROLE ' + role);
      try { await assert.rejects(db.query('SELECT * FROM marketing_measurement.census_observations'), e => e.code === '42501'); }
      finally { await db.query('RESET ROLE'); }
    }
  });
  await t.test('outside-period metadata survives restart and classifies a webhook arriving after the scan', async () => {
    const { run, item } = await task();
    await finish(item, [{ id: '8701', acquiredAt: '2020-01-01T00:00:00Z' }], 'period-next');
    const resumed = await claim(peers[1]); assert.equal(resumed.q.id, item.q.id); assert.equal(resumed.q.cursor_after, 'period-next');
    await finish(resumed, [{ id: '8702', acquiredAt: date(0) + 'T00:00:00+07:00' }]);
    assert.equal((await db.query('SELECT count(*)::int n FROM marketing_fb_census_items WHERE run_id=$1', [run.id])).rows[0].n, 0);
    assert.equal((await db.query("SELECT count(*)::int n FROM marketing_fb_lead_receipts WHERE leadgen_id IN('8701','8702')")).rows[0].n, 0);
    await enqueue('8701'); await enqueue('8702');
    try {
      const raw = await snapshot(), r = reportTrial(raw);
      assert.equal(raw.providerReconciliation.observations.length, 2); assert.equal(r.period.censusAligned, true);
      assert.equal(r.reconciliation.counts.outsidePeriod, 2); assert.equal(r.observed.outsidePeriodForms, 2);
      assert.equal((await db.query("SELECT count(*)::int n FROM marketing_fb_lead_receipts WHERE leadgen_id IN('8701','8702') AND state='PENDING'")).rows[0].n, 2);
      await db.query("UPDATE facebook_pages SET access_token='period-rotated' WHERE page_id='123'");
      const stale = reportTrial(await snapshot()); assert.equal(stale.reconciliation.status, 'STALE'); assert.equal(stale.reconciliation.counts.outsidePeriod, 0);
    } finally {
      await db.query("UPDATE facebook_pages SET access_token='page-test-token' WHERE page_id='123'");
      await db.query("DELETE FROM marketing_fb_lead_receipts WHERE leadgen_id IN('8701','8702')");
    }
  });
  await t.test('conflicting timestamp in a later page rolls back the entire new chunk', async () => {
    const { run, item } = await task();
    await finish(item, [{ id: '8802', acquiredAt: '2020-01-01T00:00:00Z' }], 'later');
    const next = await claim();
    await assert.rejects(finish(next, [{ id: '8801', acquiredAt: '2019-01-01T00:00:00Z' }, { id: '8802', acquiredAt: '2021-01-01T00:00:00Z' }]), e => e.code === '40001');
    const rows = (await db.query('SELECT leadgen_id FROM marketing_measurement.census_observations WHERE run_id=$1', [run.id])).rows;
    assert.deepEqual(rows.map(x => x.leadgen_id), ['8802']);
    const q = (await db.query('SELECT * FROM marketing_fb_census_tasks WHERE id=$1', [next.q.id])).rows[0]; assert.equal(q.cursor_after, 'later'); assert.equal(q.chunks, 1);
    await stop();
  });
  await t.test('future provider timestamps roll back observations and do not advance the cursor', async () => {
    const { run, item } = await task();
    await assert.rejects(finish(item, [{ id: '8901', acquiredAt: '2020-01-01T00:00:00Z' }, { id: '8902', acquiredAt: '2099-01-01T00:00:00Z' }]), e => e.code === '22023');
    assert.equal((await db.query('SELECT count(*)::int n FROM marketing_measurement.census_observations WHERE run_id=$1', [run.id])).rows[0].n, 0);
    assert.equal((await db.query('SELECT chunks FROM marketing_fb_census_tasks WHERE id=$1', [item.q.id])).rows[0].chunks, 0); await stop();
  });
};
