'use strict';
const assert = require('node:assert/strict'), { randomUUID } = require('node:crypto');
const { createLeadCensus, readCensusPage } = require('../src/modules/marketingAutomation/facebookLeadCensus');
const { createLeadIntake } = require('../src/modules/marketingAutomation/facebookLeadIntake');
const { reportTrial } = require('../src/modules/marketingAutomation/trialReport');
module.exports = async (t, { db, peers, query, tenant }) => {
  const cid = randomUUID(), actor = randomUUID(), sales = randomUUID(), region = randomUUID(), pipeline = randomUUID(), stage = randomUUID(), source = randomUUID(), kind = randomUUID(), trial = randomUUID();
  const date = n => new Date(Date.now() + 7 * 3600000 + n * 86400000).toISOString().slice(0, 10);
  const since = date(-1), until = date(28), acquired = new Date(since + 'T12:00:00+07:00').toISOString();
  await db.query('INSERT INTO companies VALUES($1,$2,true)', [cid, tenant]);
  await db.query("INSERT INTO users VALUES($1,$3,$4,'admin',true),($2,$3,$4,'sales',true)", [actor, sales, cid, tenant]);
  await db.query('INSERT INTO company_regions VALUES($1,$2,true);', [region, cid]);
  await db.query('INSERT INTO user_company_regions VALUES($1,$2)', [sales, region]);
  await db.query("INSERT INTO facebook_pages VALUES('234',$1,true,'synthetic-observed-page')", [cid]);
  await db.query("INSERT INTO fb_ad_accounts VALUES('act_171',$1,true,NULL,'synthetic-observed-account'),('act_172',$1,true,NULL,'synthetic-zero-leads')", [cid]);
  await db.query('INSERT INTO crm_pipelines VALUES($1,$2,true,$3)', [pipeline, cid, region]);
  await db.query("INSERT INTO crm_pipeline_stages VALUES($1,$2,true,'lead',false,false)", [stage, pipeline]);
  await db.query('INSERT INTO crm_sources VALUES($1,$2,true)', [source, cid]);
  await db.query("INSERT INTO crm_lead_types VALUES($1,$2,true,'lead')", [kind, cid]);
  await query('marketing_fb_lead_binding_set', [actor, cid, randomUUID(), { pageId: '234', formId: '567', accountId: 'act_171', expectedRevision: 0, active: true,
    approvalReference: 'Isolated synthetic observed CPQL acceptance only', fieldMap: { name: 'full_name', phone: 'phone_number', request: 'need' },
    regionId: region, ownerId: sales, pipelineId: pipeline, stageId: stage, sourceId: source, leadTypeId: kind }]);
  await query('marketing_lead_trial_set', [actor, cid, trial, randomUUID(), { name: 'Synthetic observed CPQL', since, until, expectedRevision: 0 }]);
  const rpc = { rpc: async (name, args) => { try { return { data: name.endsWith('_claim')
    ? (await peers[0].query(`SELECT * FROM ${name}(${Object.keys(args).map((_, i) => '$' + (i + 1)).join(',')})`, Object.values(args))).rows
    : await query(name, Object.values(args)) }; } catch (e) { return { error: { code: e.code } }; } } };
  const rows = ['9101', '9102', '9103', '9104'].map(id => ({ id, form_id: '567', created_time: acquired }));
  const fetchImpl = async url => ({ ok: true, json: async () => new URL(url).pathname.endsWith('/leadgen_forms')
    ? { data: [{ id: '567', page_id: '234', status: 'ACTIVE', expired_leads_count: 0 }] }
    : new URL(url).pathname.endsWith('/leads') ? { data: rows } : { id: '567', page_id: '234' } });
  const scan = async () => {
    await query('marketing_fb_census_start', [actor, cid, trial, randomUUID(), ['234']]);
    await createLeadCensus({ db: rpc, isPrimary: () => true, pages: new Set(['234']), env: { VPT_FB_LEAD_CENSUS: '1', VPT_META_GRAPH_VERSION: 'v24.0' }, readSource: x => readCensusPage({ ...x, fetchImpl }) }).drain();
  };
  const snapshot = (c = peers[0]) => query('marketing_lead_trial_snapshot', [actor, cid, trial], c);
  const qualify = async (lead, status = 'QUALIFIED') => {
    const q = await query('crm_lead_quality_read', [actor, cid, lead]);
    return query('crm_lead_quality_record', [actor, cid, lead, randomUUID(), q.revision, q.contextVersion,
      { status, contactVerified: true, demandMatches: true, serviceAreaVerified: true, evidence: 'Synthetic qualification from isolated PostgreSQL acceptance.' }]);
  };
  let leads;
  await t.test('SQL snapshot supplies provisional 1m / 4 through real census, intake, qualification and whole-account spend services', async () => {
    await scan();
    await createLeadIntake({ db: rpc, isPrimary: () => true, pages: new Set(['234']), isPaused: () => false,
      readSource: async ({ receipt, context }) => ({ proof: { provider: 'META_LEAD_ADS_V1', pageId: receipt.page_id, formId: receipt.form_id, leadgenId: receipt.leadgen_id,
        source: 'PAID', accountId: context.accountId, adId: '888', adsetId: '999', campaignId: '111', graphVersion: 'v24.0', acquiredAt: acquired, fetchedAt: new Date().toISOString() },
      contact: { name: 'Synthetic CPQL', phone: '090124' + receipt.leadgen_id, email: '', request: 'Tủ bếp' } }) }).drain();
    leads = (await db.query('SELECT id FROM crm_leads WHERE company_id=$1 ORDER BY id', [cid])).rows.map(r => r.id);
    assert.equal(leads.length, 4); for (const lead of leads) await qualify(lead);
    for (const account of ['act_171', 'act_172']) {
      const run = await query('marketing_spend_begin', [account, cid, since, date(0)]);
      await query('marketing_spend_finish', [run.id, cid, { accountId: account, currency: 'VND', timezone: 'Asia/Ho_Chi_Minh', source: 'META_ACCOUNT_INSIGHTS_V1',
        since, until: date(0), totalVnd: 550000, days: [{ date: since, amountVnd: 500000 }, { date: date(0), amountVnd: 50000 }] }, null]);
    }
    const r = reportTrial(await snapshot()); assert.equal(r.observedMeasurement.status, 'AVAILABLE_PROVISIONAL');
    assert.equal(r.observedMeasurement.costPerQualifiedLeadVnd, 250000); assert.equal(r.observedMeasurement.qualifiedLeads, 4);
    assert.equal(r.spend.spendVnd, 1000000); assert.equal(r.spend.sources.length, 2);
    assert.equal(r.targetMetToDate, false); assert.equal(r.costPerQualifiedLeadVnd, null); assert.equal(r.allowBudgetExecution, false);
  });
  await require('./marketingAutomation.measurementSnapshot.cases')(t,{db,peers,query,cid,actor,trial,leads,qualify,date});
  await t.test('provisional quotient and qualification use the same SQL snapshot during concurrent rejection', async () => {
    const original = (await db.query("SELECT pg_get_functiondef('marketing_trial_quality_context(jsonb,jsonb,jsonb,jsonb,jsonb,boolean,jsonb)'::regprocedure) d")).rows[0].d;
    await db.query(original.replace(/BEGIN\r?\n/, 'BEGIN\n PERFORM pg_sleep(0.08);\n'));
    try {
      const reading = snapshot(peers[1]); let waiting = false;
      for (let i = 0; i < 100; i++) { const x = await db.query("SELECT 1 FROM pg_stat_activity WHERE wait_event='PgSleep' AND query LIKE 'SELECT marketing_lead_trial_snapshot%'"); if (x.rowCount) { waiting = true; break; } await new Promise(resolve => setTimeout(resolve, 5)); }
      assert.equal(waiting, true); await qualify(leads[0], 'REJECTED');
      assert.equal(reportTrial(await reading).observedMeasurement.costPerQualifiedLeadVnd, 250000);
    } finally { await db.query(original); }
    assert.equal(reportTrial(await snapshot()).observedMeasurement.costPerQualifiedLeadVnd, 1000000 / 3);
  });
  await t.test('late receipt invalidates the quotient until a real rescan proves it outside the measured period', async () => {
    await query('marketing_fb_lead_enqueue', [JSON.stringify([{ pageId: '234', formId: '567', leadgenId: '9199' }]), 'c'.repeat(64)]);
    assert.equal(reportTrial(await snapshot()).observedMeasurement.status, 'UNAVAILABLE');
    rows.push({ id: '9199', form_id: '567', created_time: new Date(date(0) + 'T00:00:00+07:00').toISOString() });
    await scan(); const r = reportTrial(await snapshot()); assert.equal(r.observed.outsidePeriodForms, 1);
    assert.equal(r.observedMeasurement.status, 'AVAILABLE_PROVISIONAL'); assert.equal(r.observedMeasurement.qualifiedLeads, 3);
  });
  await t.test('current Page scope and current reader permissions still govern the quotient', async () => {
    await db.query("UPDATE facebook_pages SET access_token='rotated-observed' WHERE page_id='234'");
    assert.equal(reportTrial(await snapshot()).observedMeasurement.status, 'UNAVAILABLE');
    await db.query('UPDATE users SET is_active=false WHERE id=$1', [actor]); await assert.rejects(snapshot(), e => e.code === '42501');
  });
};
