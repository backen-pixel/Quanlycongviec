'use strict';
const assert = require('node:assert/strict'), { randomUUID } = require('node:crypto');
const { reportTrial } = require('../src/modules/marketingAutomation/trialReport');
const { createLeadIntake } = require('../src/modules/marketingAutomation/facebookLeadIntake');
module.exports = async (t, { db, peers, company, admin, query, trial, start, stop, claim, finish, date }) => {
  const snapshot = () => query('marketing_lead_trial_snapshot', [admin, company, trial]);
  const enqueue = leadgenId => query('marketing_fb_lead_enqueue', [JSON.stringify([{ pageId: '123', formId: '456', leadgenId }]), 'd'.repeat(64)]);
  const task = async () => { const r = await start(); await finish(await claim(), [{ id: '456', status: 'ACTIVE', expiredLeads: 0 }]); return { run: r, item: await claim() }; };
  await t.test('closed census boundary and policy are persisted once, including exact replay', async () => {
    const key = randomUUID(), r = await start(key); const row = (await db.query('SELECT * FROM marketing_fb_census_runs WHERE id=$1', [r.id])).rows[0];
    assert.equal(row.measurement_until_at.toISOString(), new Date(date(0) + 'T00:00:00+07:00').toISOString());
    assert.ok(row.until_at >= row.measurement_until_at); assert.ok(row.until_at <= row.started_at);
    assert.equal(row.measurement_policy, 'VIETNAM_CLOSED_DAY_V1'); assert.equal((await start(key)).id, r.id); await stop();
  });
  await t.test('first-day recovery accepts today into CRM while measurement remains no-closed-day', async () => {
    const id = randomUUID(); await query('marketing_lead_trial_set', [admin, company, id, randomUUID(), { name: 'No completed day', since: date(0), until: date(29), expectedRevision: 0 }]);
    const run = await query('marketing_fb_census_start', [admin, company, id, randomUUID(), ['123']]);
    await finish(await claim(), [{ id: '456', status: 'ACTIVE', expiredLeads: 0 }]);
    const stamp = date(0) + 'T00:00:00+07:00'; await finish(await claim(), [{ id: '8601', acquiredAt: stamp }]);
    const raw = await query('marketing_lead_trial_snapshot', [admin, company, id]), report = reportTrial(raw);
    assert.equal(raw.providerReconciliation.items.length, 0); assert.equal(report.period.status, 'NO_CLOSED_DAY'); assert.equal(report.spend.spendVnd, null);
    assert.equal((await db.query('SELECT count(*)::int n FROM marketing_fb_census_items WHERE run_id=$1', [run.id])).rows[0].n, 1);
    // Isolate the target receipt without consuming unrelated test backlog.
    const held = (await db.query("UPDATE marketing_fb_lead_receipts SET state='REVIEW' WHERE state='PENDING' AND leadgen_id<>'8601' RETURNING id")).rows;
    const rpc = { rpc: async (name, args) => {
      try { return { data: name.endsWith('_claim') ? (await peers[0].query(`SELECT * FROM ${name}(${Object.keys(args).map((_, i) => '$' + (i + 1)).join(',')})`, Object.values(args))).rows : await query(name, Object.values(args)) }; }
      catch (e) { return { error: { code: e.code } }; }
    } };
    try {
      await createLeadIntake({ db: rpc, isPrimary: () => true, pages: new Set(['123']), isPaused: () => false,
        readSource: async ({ receipt, context }) => ({ proof: { provider: 'META_LEAD_ADS_V1', pageId: '123', formId: '456', leadgenId: receipt.leadgen_id, source: 'PAID', accountId: context.accountId, adId: '888', adsetId: '999', campaignId: '111', graphVersion: 'v24.0', acquiredAt: new Date(stamp).toISOString(), fetchedAt: new Date().toISOString() }, contact: { name: 'Synthetic same-day recovery', phone: '0908888601', email: '', request: 'Tủ bếp' } }) }).drain();
      const receipt = (await db.query("SELECT r.state,l.id FROM marketing_fb_lead_receipts r JOIN crm_leads l ON l.id=r.lead_id WHERE r.leadgen_id='8601'")).rows[0];
      assert.equal(receipt?.state, 'DONE'); assert.ok(receipt.id);
      assert.equal(reportTrial(await query('marketing_lead_trial_snapshot', [admin, company, id])).observed.qualified, 0);
    } finally { if (held.length) await db.query("UPDATE marketing_fb_lead_receipts SET state='PENDING' WHERE id=ANY($1::uuid[])", [held.map(x => x.id)]); }
  });
  await t.test('before-trial recovery stays denied', async () => {
    const id = randomUUID(); await query('marketing_lead_trial_set', [admin, company, id, randomUUID(), { name: 'Future trial', since: date(1), until: date(30), expectedRevision: 0 }]);
    await assert.rejects(query('marketing_fb_census_start', [admin, company, id, randomUUID(), ['123']]), e => e.code === '22023');
  });
  await t.test('replay of a pre-midnight request keeps both persisted cutoffs', async () => {
    const key = randomUUID(), run = await start(key);
    await db.query("UPDATE marketing_fb_census_runs SET measurement_until_at=since_at,until_at=since_at+interval '23 hours 59 minutes',started_at=since_at+interval '23 hours 59 minutes 1 second' WHERE id=$1", [run.id]);
    const before = (await db.query('SELECT since_at,until_at,measurement_until_at FROM marketing_fb_census_runs WHERE id=$1', [run.id])).rows[0];
    assert.equal((await start(key)).id, run.id);
    assert.deepEqual((await db.query('SELECT since_at,until_at,measurement_until_at FROM marketing_fb_census_runs WHERE id=$1', [run.id])).rows[0], before); await stop();
  });
  await t.test('historical partial-day run stays unaligned through the version2 inventory', async () => {
    const { run, item } = await task(); await finish(item);
    await db.query("UPDATE marketing_fb_census_runs SET measurement_policy=NULL,measurement_until_at=NULL,until_at=since_at+interval '23 hours' WHERE id=$1", [run.id]);
    const raw = await snapshot(), r = reportTrial(raw);
    assert.equal(raw.providerReconciliation.version, 2); assert.equal(raw.providerReconciliation.run.measurementPolicy, null);
    assert.equal(r.period.censusAligned, false); assert.ok(r.reconciliation.issues.some(x => x.code === 'CENSUS_PERIOD_MISMATCH'));
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
    const baseline = reportTrial(await snapshot()).observed.outsidePeriodForms;
    await finish(item, [{ id: '8701', acquiredAt: '2020-01-01T00:00:00Z' }], 'period-next');
    const resumed = await claim(peers[1]); assert.equal(resumed.q.id, item.q.id); assert.equal(resumed.q.cursor_after, 'period-next');
    await finish(resumed, [{ id: '8702', acquiredAt: date(0) + 'T00:00:00+07:00' }]);
    assert.equal((await db.query('SELECT count(*)::int n FROM marketing_fb_census_items WHERE run_id=$1', [run.id])).rows[0].n, 1);
    assert.equal((await db.query("SELECT count(*)::int n FROM marketing_fb_lead_receipts WHERE leadgen_id IN('8701','8702')")).rows[0].n, 1);
    await enqueue('8701'); await enqueue('8702');
    try {
      const raw = await snapshot(), r = reportTrial(raw);
      assert.equal(raw.providerReconciliation.observations.length, 2); assert.equal(r.period.censusAligned, true);
      assert.equal(r.reconciliation.counts.outsidePeriod, baseline + 2); assert.equal(r.observed.outsidePeriodForms, baseline + 2);
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
