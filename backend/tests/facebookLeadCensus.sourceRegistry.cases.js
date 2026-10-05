'use strict';
const assert = require('node:assert/strict'), { randomUUID } = require('node:crypto');
const { reportTrial } = require('../src/modules/marketingAutomation/trialReport');
module.exports = async (t, { db, peers, query }) => {
  const tenant = randomUUID(), cid = randomUUID(), other = randomUUID(), actor = randomUUID(), second = randomUUID(), sales = randomUUID(), trial = randomUUID();
  const date = n => new Date(Date.now() + 7 * 3600000 + n * 86400000).toISOString().slice(0, 10);
  await db.query('INSERT INTO tenants VALUES($1,true)', [tenant]);
  await db.query('INSERT INTO companies VALUES($1,$3,true),($2,$3,true)', [cid, other, tenant]);
  await db.query("INSERT INTO users VALUES($1,$4,$5,'admin',true),($2,$4,$5,'sales_admin',true),($3,$4,$5,'sales',true)", [actor, second, sales, cid, tenant]);
  await db.query("INSERT INTO facebook_pages VALUES('345',$1,true,'registry-synthetic-page')", [cid]);
  await db.query("INSERT INTO fb_ad_accounts VALUES('act_271',$1,true,NULL,'registry-synthetic-a'),('act_272',$1,true,NULL,'registry-synthetic-b')", [cid]);
  const bind = form => db.query("INSERT INTO marketing_fb_lead_bindings VALUES('345',$1,$2,1,$3,$4)", [form, cid, { active: true, accountId: 'act_271' }, actor]);
  await bind('678');
  await query('marketing_lead_trial_set', [actor, cid, trial, randomUUID(), { name: 'Synthetic registry acceptance', since: date(-1), until: date(28), expectedRevision: 0 }]);
  const read = (who = actor, company = cid, c = peers[0]) => query('marketing_source_registry_read', [who, company, trial], c);
  const save = (cmd, key = randomUUID(), who = actor, c = peers[0]) => query('marketing_source_registry_set', [who, cid, trial, key, cmd], c);
  const lead = { accountId: 'act_271', kind: 'META_LEAD_ADS', pageId: '345', formId: '678', destination: null };
  const zero = { accountId: 'act_272', kind: 'NO_LEAD_SOURCE', pageId: null, formId: null, destination: 'Synthetic documented account without a customer entrypoint' };
  const command = async () => { const x = await read(); return { expectedRevision: x.declaration?.revision || 0, expectedInventoryVersion: x.inventoryVersion,
    sourceReference: 'Synthetic scope dossier 2026', sourceDate: date(0), sourceNote: 'Isolated synthetic business scope; not a claim of provider completeness.', entries: [lead, zero] }; };
  const denied = code => e => e.code === code;
  let originalRequest, originalCommand, originalResult;
  await t.test('registry denies browser/direct-table access and explicit service-role guard survives broad public grants', async () => {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      await db.query('SET ROLE ' + role);
      try { await assert.rejects(db.query('SELECT * FROM marketing_measurement.source_registry'), denied('42501')); } finally { await db.query('RESET ROLE'); }
    }
    await db.query('GRANT EXECUTE ON FUNCTION marketing_source_registry_read(uuid,uuid,uuid),marketing_source_registry_set(uuid,uuid,uuid,uuid,jsonb),marketing_lead_trial_snapshot(uuid,uuid,uuid) TO authenticated');
    await db.query('SET ROLE authenticated');
    try {
      await assert.rejects(read(actor, cid, db), denied('42501'));
      await assert.rejects(query('marketing_source_registry_set', [actor, cid, trial, randomUUID(), {}], db), denied('42501'));
      await assert.rejects(query('marketing_lead_trial_snapshot', [actor, cid, trial], db), denied('42501'));
    } finally { await db.query('RESET ROLE'); await db.query('REVOKE EXECUTE ON FUNCTION marketing_source_registry_read(uuid,uuid,uuid),marketing_source_registry_set(uuid,uuid,uuid,uuid,jsonb),marketing_lead_trial_snapshot(uuid,uuid,uuid) FROM authenticated'); }
    await assert.rejects(read(sales), denied('42501')); await assert.rejects(read(actor, other), denied('42501'));
  });
  await t.test('declaration requires all accounts and known forms, including zero-lead account; rejects invented evidence and conflicting claims', async () => {
    const x = await read(); assert.equal(x.status, 'MISSING'); assert.equal(x.actorId, actor);
    const c = await command();
    for (const entries of [[lead], [zero], [lead, zero, { ...zero, destination: 'Different unsupported claim' }], [lead, zero, { ...zero, kind: 'WEBSITE', destination: 'https://example.invalid' }], [lead, zero, { ...lead, accountId: null, kind: 'UNRESOLVED_FORM', formId: '99999', destination: 'Unknown historical record' }]]) {
      await assert.rejects(save({ ...c, entries }), denied('22023'));
    }
    await assert.rejects(save({ ...c, sourceDate: date(1) }), denied('22023'));
    await assert.rejects(save({ ...c, providerCoverage: 'COMPLETE' }), denied('22023'));
    await assert.rejects(save({ ...c, entries: [{ ...lead, pageId: 345 }, zero] }), denied('22023'));
    originalRequest = randomUUID(); originalCommand = c;
    const both = await Promise.all([save(c, originalRequest, actor, peers[0]), save(c, originalRequest, actor, peers[1])]); originalResult = both[0];
    assert.equal(both.filter(v => v.replayed).length, 1); assert.equal(both[0].declarationDigest, both[1].declarationDigest);
    const current = await read(); assert.equal(current.status, 'CURRENT'); assert.equal(current.providerCoverage, 'UNVERIFIED'); assert.equal(current.allowBudgetExecution, false);
    assert.deepEqual(current.declaration.accountIds, ['act_271', 'act_272']);
    assert.equal(JSON.stringify(current).includes('registry-synthetic'), false);
    const event = (await db.query('SELECT * FROM marketing_measurement.source_registry_events WHERE request_id=$1', [originalRequest])).rows[0];
    assert.equal(event.before_state, null); assert.equal(event.after_state.revision, 1); assert.deepEqual(event.command, c);
  });
  await t.test('concurrent editors compare revision; exact replay keeps original evidence and cannot be reused by another actor', async () => {
    const c = await command(); const writes = await Promise.allSettled([save(c, randomUUID(), actor, peers[0]), save({ ...c, sourceNote: c.sourceNote + ' Reviewed by second operator.' }, randomUUID(), second, peers[1])]);
    assert.equal(writes.filter(x => x.status === 'fulfilled').length, 1);
    assert.equal(writes.find(x => x.status === 'rejected').reason.code, '40001');
    const again = await save(originalCommand, originalRequest); assert.equal(again.recordedAt, originalResult.recordedAt); assert.equal(again.revision, 1);
    assert.equal((await read()).declaration.revision, 2);
    await assert.rejects(save(originalCommand, originalRequest, second), denied('23505'));
    await assert.rejects(save({ ...originalCommand, sourceNote: 'Different content with same request identity' }, originalRequest), denied('23505'));
  });
  await t.test('same form may be declared under several accounts without silently changing intake routing', async () => {
    const c = await command(); await save({ ...c, entries: [lead, { ...lead, accountId: 'act_272' }] });
    const r = await read(); assert.equal(r.status, 'CURRENT'); assert.ok(r.gaps.some(g => g.code === 'FORM_ROUTING_UNVERIFIED' && g.accountId === 'act_272'));
    assert.equal((await db.query("SELECT config->>'accountId' a FROM marketing_fb_lead_bindings WHERE page_id='345' AND form_id='678'")).rows[0].a, 'act_271');
  });
  await t.test('unknown historical form is explicit unresolved scope, never assigned an invented account', async () => {
    await db.query("INSERT INTO marketing_fb_lead_receipts(page_id,form_id,leadgen_id,company_id,delivery_hash) VALUES('345','679','98765',$1,$2)", [cid, 'd'.repeat(64)]);
    const c = await command(); await assert.rejects(save(c), denied('22023'));
    const unresolved = { accountId: null, kind: 'UNRESOLVED_FORM', pageId: '345', formId: '679', destination: 'Historical receipt with account not yet established' };
    await save({ ...c, entries: [lead, zero, unresolved] });
    const r = await read(); assert.equal(r.status, 'CURRENT'); assert.ok(r.gaps.some(g => g.code === 'FORM_ACCOUNT_UNRESOLVED'));
    await db.query("DELETE FROM marketing_fb_lead_receipts WHERE page_id='345' AND leadgen_id='98765'");
    await save(await command());
  });
  await t.test('expired provider permissions do not prevent documenting business scope and cannot certify provider coverage', async () => {
    await db.query("UPDATE fb_ad_accounts SET bat=false,access_token=NULL,token_het_han=now()-interval '1 day' WHERE ad_account_id='act_272'");
    assert.equal((await read()).status, 'STALE_CONFIGURATION'); await save(await command());
    const x = await read(); assert.equal(x.status, 'CURRENT'); assert.ok(x.gaps.some(g => g.code === 'ACCOUNT_UNAVAILABLE')); assert.equal(x.providerCoverage, 'UNVERIFIED');
    await db.query("UPDATE fb_ad_accounts SET bat=true,access_token='registry-synthetic-b',token_het_han=NULL WHERE ad_account_id='act_272'"); await save(await command());
  });
  await t.test('current company, tenant, role and author govern reads, saves and replays', async () => {
    for (const [table, id, column, bad, good] of [['companies', cid, 'is_active', null, true], ['tenants', tenant, 'is_active', false, true], ['users', actor, 'role', null, 'admin'], ['users', actor, 'tenant_id', other, tenant]]) {
      await db.query(`UPDATE ${table} SET ${column}=$1 WHERE id=$2`, [bad, id]);
      try { await assert.rejects(read(), denied('42501')); await assert.rejects(save(originalCommand, originalRequest), denied('42501')); }
      finally { await db.query(`UPDATE ${table} SET ${column}=$1 WHERE id=$2`, [good, id]); }
    }
    await save(await command()); await db.query('UPDATE users SET is_active=false WHERE id=$1', [actor]);
    try { assert.equal((await read(second)).status, 'STALE_AUTHORITY'); await assert.rejects(save(originalCommand, originalRequest), denied('42501')); }
    finally { await db.query('UPDATE users SET is_active=true WHERE id=$1', [actor]); }
  });
  await t.test('account additions and trial date changes require a new explicit inventory confirmation', async () => {
    const c = await command(); await db.query("INSERT INTO fb_ad_accounts VALUES('act_273',$1,true,NULL,NULL)", [cid]);
    const x = await read(); assert.equal(x.status, 'STALE_CONFIGURATION'); assert.ok(x.gaps.some(g => g.code === 'TRIAL_ACCOUNT_ROSTER_CHANGED'));
    await assert.rejects(save(c), denied('40001')); await assert.rejects(save(await command()), denied('22023'));
    await db.query("DELETE FROM fb_ad_accounts WHERE ad_account_id='act_273'");
    const old = await command(); await query('marketing_lead_trial_set', [actor, cid, trial, randomUUID(), { name: 'Revised synthetic trial', since: date(-2), until: date(27), expectedRevision: 1 }]);
    await assert.rejects(save(old), denied('40001')); assert.equal((await read()).status, 'STALE_CONFIGURATION'); await save(await command());
  });
  const waitFor = async (pattern, event) => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      // The lock owner may already be in BEGIN. Discard its cached activity
      // snapshot so a worker that starts after the first poll remains visible.
      await db.query('SELECT pg_stat_clear_snapshot()');
      if ((await db.query("SELECT 1 FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND state='active' AND query LIKE $1 AND (wait_event=$2 OR wait_event_type=$2)", [pattern, event])).rowCount) return;
      await new Promise(r => setTimeout(r, 5));
    }
    assert.fail('expected observed PostgreSQL wait');
  };
  await t.test('a binding inserted while a declaration waits is detected before writing registry or audit', async () => {
    const c = await command(), key = randomUUID(); await db.query('BEGIN'); await db.query('SELECT 1 FROM marketing_lead_trials WHERE id=$1 FOR UPDATE', [trial]);
    const pending = save(c, key, actor, peers[1]).then(value => ({ value }), error => ({ error }));
    try { await waitFor('SELECT marketing_source_registry_set%', 'Lock'); await bind('680'); } finally { await db.query('COMMIT'); }
    assert.equal((await pending).error?.code, '40001'); assert.equal((await db.query('SELECT 1 FROM marketing_measurement.source_registry_events WHERE request_id=$1', [key])).rowCount, 0);
    await db.query("DELETE FROM marketing_fb_lead_bindings WHERE page_id='345' AND form_id='680'");
  });
  await t.test('Page movement invalidates current scope; historical exception remains documentable without claiming foreign ownership', async () => {
    await db.query('UPDATE facebook_pages SET default_company_id=$1 WHERE page_id=\'345\'', [other]);
    try {
      assert.equal((await read()).status, 'STALE_CONFIGURATION'); await assert.rejects(save(await command()), denied('42501'));
      const c = await command(); await save({ ...c, entries: [{ ...zero, accountId: 'act_271' }, zero, { accountId: null, kind: 'UNRESOLVED_FORM', pageId: '345', formId: '678', destination: 'Historical known form; Page ownership moved outside company' }] });
      assert.ok((await read()).gaps.some(g => g.code === 'PAGE_UNAVAILABLE'));
    } finally { await db.query('UPDATE facebook_pages SET default_company_id=$1 WHERE page_id=\'345\'', [cid]); await save(await command()); }
  });
  await t.test('trial report projects declaration in the same SQL snapshot and never upgrades CPQL/spending authority', async () => {
    const before = await read(); const original = (await db.query("SELECT pg_get_functiondef('marketing_measurement.source_registry_projection(uuid,uuid)'::regprocedure) d")).rows[0].d;
    await db.query(original.replace(/BEGIN\r?\n/, 'BEGIN\n PERFORM pg_sleep(0.25);\n'));
    const reading = query('marketing_lead_trial_snapshot', [actor, cid, trial], peers[1]);
    try {
      await waitFor('SELECT marketing_lead_trial_snapshot%', 'PgSleep'); await db.query("UPDATE facebook_pages SET access_token='rotated-registry-page' WHERE page_id='345'");
      const r = reportTrial(await reading); assert.equal(r.sourceRegistry.inventoryVersion, before.inventoryVersion); assert.equal(r.sourceRegistry.status, 'CURRENT');
      assert.equal(r.allowBudgetExecution, false); assert.equal(r.targetMetToDate, false); assert.equal(r.costPerQualifiedLeadVnd, null);
    } finally { await db.query(original); }
    assert.equal((await read()).status, 'STALE_CONFIGURATION');
  });
};
