'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
module.exports = async (t, { db, peers, query, company, other, admin, sales, source, fresh }) => {
  const sql = fs.readFileSync(path.resolve(__dirname, '../../database/683_facebook_source_repair.sql'), 'utf8');
  await db.query(sql); await db.query(sql);
  const raw = (ids, mode = 'preview', key = null, version = null, client = peers[0], actor = admin, cid = company) =>
    query('crm_facebook_source_repair', [actor, cid, ids, mode, key, version], client);
  const apply = (p, key = randomUUID(), client = peers[0]) => raw(p.items.map(x => x.leadId), 'apply', key, p.contextVersion, client);
  const fixture = async () => {
    const f = await fresh({ enrolled: false });
    await db.query('UPDATE crm_leads SET source_id=NULL WHERE id=$1', [f.lead]);
    return f;
  };
  const label = async f => (await db.query('SELECT source_id FROM crm_leads WHERE id=$1', [f.lead])).rows[0].source_id;
  const event = async key => (await db.query('SELECT * FROM crm_source_repair.events WHERE request_id=$1', [key])).rows;
  const evidence = async f => (await db.query('SELECT * FROM crm_lead_source_evidence WHERE lead_id=$1', [f.lead])).rows;
  const waitLock = async client => {
    const pid = (await client.query('SELECT pg_backend_pid() pid')).rows[0].pid;
    return async () => {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        await db.query('SELECT pg_stat_clear_snapshot()');
        if ((await db.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [pid])).rows[0]?.wait_event_type === 'Lock') return;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      throw Error('Expected actual PostgreSQL lock wait');
    };
  };
  await t.test('source repair private ledger, server-only entry and explicit scope', async () => {
    const f = await fixture();
    for (const role of ['anon', 'authenticated', 'service_role']) {
      await db.query('SET ROLE ' + role);
      try {
        await assert.rejects(db.query('SELECT * FROM crm_source_repair.events'), e => e.code === '42501');
        await assert.rejects(db.query('INSERT INTO crm_source_repair.events DEFAULT VALUES'), e => e.code === '42501');
        if (role !== 'service_role') await assert.rejects(raw([f.lead], 'preview', null, null, db), e => e.code === '42501');
      } finally { await db.query('RESET ROLE'); }
    }
    await assert.rejects(raw([f.lead], 'preview', null, null, db), e => e.code === '42501');
    for (const ids of [[], [null], Array(501).fill(f.lead)]) await assert.rejects(raw(ids), e => e.code === '22023');
    await assert.rejects(raw([f.lead], 'preview', null, null, peers[0], sales), e => e.code === '42501');
    await assert.rejects(raw([f.lead], 'preview', null, null, peers[0], admin, other), e => e.code === '42501');
    await assert.rejects(raw([f.lead, randomUUID()]), e => e.code === '42501');
  });
  await t.test('source repair restores only selected NULL label with original evidence and one receipt', async () => {
    const f = await fixture(), untouched = await fixture(), before = await evidence(f), key = randomUUID();
    const p = await raw([f.lead]); assert.equal(p.items[0].status, 'READY'); assert.equal(p.items[0].sourceId, source);
    assert.equal(await label(f), null); assert.equal(p.updated, 0);
    const r = await apply(p, key); assert.equal(r.updated, 1); assert.equal(r.items[0].status, 'RESTORED');
    assert.equal(await label(f), source); assert.equal(await label(untouched), null); assert.deepEqual(await evidence(f), before);
    assert.equal((await event(key)).length, 1); assert.equal((await apply(p, key)).replayed, true);
    assert.equal((await event(key)).length, 1); assert.equal((await query('crm_lead_quality_read', [admin, company, f.lead])).status, 'PENDING');
  });
  await t.test('existing source is preserved even when it differs from intake routing', async () => {
    const f = await fixture(), chosen = randomUUID(); await db.query('INSERT INTO crm_sources VALUES($1,$2,true)', [chosen, company]);
    await db.query('UPDATE crm_leads SET source_id=$2 WHERE id=$1', [f.lead, chosen]);
    const p = await raw([f.lead]); assert.equal(p.items[0].reason, 'EXISTING_SOURCE'); assert.equal((await apply(p)).updated, 0);
    assert.equal(await label(f), chosen);
  });
  await t.test('legacy reviewed, absent and multiple evidence require review without guessing a Page source', async () => {
    for (const mode of ['legacy', 'absent', 'multiple']) {
      const f = await fixture();
      if (mode === 'legacy') await db.query("UPDATE crm_lead_source_evidence SET routing=routing||'{\"kind\":\"LEGACY_REVIEW_V1\"}'::jsonb WHERE lead_id=$1", [f.lead]);
      if (mode === 'absent') await db.query('DELETE FROM crm_lead_source_evidence WHERE lead_id=$1', [f.lead]);
      if (mode === 'multiple') await db.query(`INSERT INTO crm_lead_source_evidence(receipt_id,company_id,lead_id,customer_id,provider,source_kind,acquired_at,proof,routing)
        SELECT gen_random_uuid(),company_id,lead_id,customer_id,provider,source_kind,acquired_at,proof,routing FROM crm_lead_source_evidence WHERE lead_id=$1`, [f.lead]);
      const p = await raw([f.lead]); assert.equal(p.items[0].status, 'REVIEW'); assert.equal((await apply(p)).updated, 0); assert.equal(await label(f), null);
    }
  });
  await t.test('mismatched receipt, original routing, proof and Customer cannot restore label', async () => {
    const changes = [
      "UPDATE marketing_fb_lead_receipts SET state='REVIEW' WHERE lead_id=$1",
      "UPDATE marketing_fb_lead_receipts SET customer_id=gen_random_uuid() WHERE lead_id=$1",
      "UPDATE crm_lead_source_evidence SET proof=proof||'{\"formId\":\"999999\"}'::jsonb WHERE lead_id=$1",
      "UPDATE crm_lead_source_evidence SET routing=jsonb_set(routing,'{bindingRevision}','999') WHERE lead_id=$1",
      "UPDATE crm_leads SET customer_id=NULL WHERE id=$1",
    ];
    for (const change of changes) {
      const f = await fixture(); await db.query(change, [f.lead]); const p = await raw([f.lead]);
      assert.equal(p.items[0].status, 'REVIEW'); assert.equal((await apply(p)).updated, 0); assert.equal(await label(f), null);
    }
  });
  await t.test('organic original intake may restore label without converting proof to paid', async () => {
    const f = await fixture();
    await db.query("UPDATE crm_lead_source_evidence SET source_kind='ORGANIC',proof=(proof-'accountId'-'adId'-'adsetId'-'campaignId')||'{\"source\":\"ORGANIC\"}'::jsonb WHERE lead_id=$1", [f.lead]);
    const before = await evidence(f), p = await raw([f.lead]); assert.equal(p.items[0].status, 'READY');
    assert.equal((await apply(p)).updated, 1); assert.deepEqual(await evidence(f), before);
  });
  await t.test('current Page default cannot replace historical source and revoked source is reviewed', async () => {
    const f = await fixture(), otherSource = randomUUID(); await db.query('INSERT INTO crm_sources VALUES($1,$2,true)', [otherSource, company]);
    await db.query('UPDATE facebook_pages SET default_source_id=$2 WHERE page_id=$1', [f.page, otherSource]);
    const p = await raw([f.lead]); assert.equal(p.items[0].sourceId, source);
    await db.query('UPDATE crm_sources SET is_active=false WHERE id=$1', [source]);
    try {
      assert.equal((await raw([f.lead])).items[0].status, 'REVIEW'); await assert.rejects(apply(p), e => e.code === '40001');
      assert.equal(await label(f), null);
    } finally { await db.query('UPDATE crm_sources SET is_active=true WHERE id=$1', [source]); }
  });
  await t.test('another Page reference makes source repair review-only', async () => {
    const f = await fixture(), second = await fixture();
    await db.query("INSERT INTO facebook_comments(page_id,lead_id,message) VALUES($1,$2,'synthetic conflict')", [second.page, f.lead]);
    const p = await raw([f.lead]); assert.equal(p.items[0].reason, 'MULTIPLE_PAGE_REVIEW'); assert.equal((await apply(p)).updated, 0);
  });
  await t.test('managed graph blocks direct and indirect repair, including inactive enrollment', async () => {
    const f = await fixture(), otherLead = await fixture();
    await db.query('UPDATE crm_leads SET customer_id=$2 WHERE id=$1', [otherLead.lead, f.customer]);
    await db.query("INSERT INTO crm_care_control.connection_pages VALUES($1,$2,false,$3,'Synthetic source repair managed scope')", [otherLead.page, company, admin]);
    await assert.rejects(raw([f.lead]), e => e.code === '40001'); assert.equal(await label(f), null);
  });
  await t.test('stale preview cannot overwrite a source written concurrently', async () => {
    const f = await fixture(), p = await raw([f.lead]), key = randomUUID();
    await peers[1].query('UPDATE crm_leads SET source_id=$2 WHERE id=$1', [f.lead, source]);
    await assert.rejects(apply(p, key), e => e.code === '40001'); assert.equal(await label(f), source); assert.equal((await event(key)).length, 0);
  });
  await t.test('receipt replay is immutable, historical, and current permission is required', async () => {
    const f = await fixture(), p = await raw([f.lead]), key = randomUUID(); await apply(p, key);
    const changed = { ...p, contextVersion: 'f'.repeat(32) }; await assert.rejects(apply(changed, key), e => e.code === '23505');
    await db.query('UPDATE crm_leads SET source_id=NULL WHERE id=$1', [f.lead]);
    assert.equal((await apply(p, key)).replayed, true); assert.equal(await label(f), null);
    await db.query('UPDATE users SET is_active=false WHERE id=$1', [admin]);
    try { await assert.rejects(apply(p, key), e => e.code === '42501'); } finally { await db.query('UPDATE users SET is_active=true WHERE id=$1', [admin]); }
    await db.query('UPDATE crm_leads SET company_id=$2 WHERE id=$1', [f.lead, other]);
    await assert.rejects(apply(p, key), e => e.code === '42501');
  });
  await t.test('transaction rollback keeps both labels and audit unchanged; same command can recover', async () => {
    const f = await fixture(), p = await raw([f.lead]), key = randomUUID();
    await peers[0].query('BEGIN'); await apply(p, key); await peers[0].query('ROLLBACK');
    assert.equal(await label(f), null); assert.equal((await event(key)).length, 0);
    assert.equal((await apply(p, key)).updated, 1);
  });
  await t.test('failure on later Lead rolls back earlier label and leaves no receipt', async () => {
    const a = await fixture(), b = await fixture(), p = await raw([a.lead, b.lead]), key = randomUUID();
    const last = [a.lead, b.lead].sort().at(-1);
    await db.query(`CREATE FUNCTION public.source_repair_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.id='${last}'::uuid AND NEW.source_id IS NOT NULL THEN RAISE EXCEPTION 'synthetic repair failure';END IF;RETURN NEW;END $$;
      CREATE TRIGGER source_repair_test_fail BEFORE UPDATE OF source_id ON crm_leads FOR EACH ROW EXECUTE FUNCTION public.source_repair_test_fail();`);
    try { await assert.rejects(apply(p, key), e => e.code === 'P0001'); }
    finally { await db.query('DROP TRIGGER source_repair_test_fail ON crm_leads;DROP FUNCTION public.source_repair_test_fail()'); }
    assert.equal(await label(a), null); assert.equal(await label(b), null); assert.equal((await event(key)).length, 0);
  });
  await t.test('actor revoked while request is waiting cannot repair', async () => {
    const f = await fixture(), p = await raw([f.lead]), key = randomUUID(), waiting = await waitLock(peers[0]);
    await db.query('BEGIN'); await db.query('UPDATE users SET is_active=false WHERE id=$1', [admin]);
    const pending = assert.rejects(apply(p, key), e => e.code === '42501');
    try { await waiting(); await db.query('COMMIT'); await pending; }
    finally { await db.query('ROLLBACK'); await db.query('UPDATE users SET is_active=true WHERE id=$1', [admin]); }
    assert.equal(await label(f), null); assert.equal((await event(key)).length, 0);
  });
  await t.test('unknown company activity rejects preview, apply and replay, including after a lock wait', async () => {
    const f = await fixture(), p = await raw([f.lead]), key = randomUUID(); await apply(p, key);
    await db.query('UPDATE companies SET is_active=NULL WHERE id=$1', [company]);
    try {
      await assert.rejects(raw([f.lead]), e => e.code === '42501');
      await assert.rejects(apply(p, randomUUID()), e => e.code === '42501');
      await assert.rejects(apply(p, key), e => e.code === '42501');
    } finally { await db.query('UPDATE companies SET is_active=true WHERE id=$1', [company]); }
    const waiting = await waitLock(peers[0]);
    await db.query('BEGIN'); await db.query('UPDATE companies SET is_active=NULL WHERE id=$1', [company]);
    const pending = assert.rejects(apply(p, key), e => e.code === '42501');
    try { await waiting(); await db.query('COMMIT'); await pending; }
    finally { await db.query('ROLLBACK'); await db.query('UPDATE companies SET is_active=true WHERE id=$1', [company]); }
    assert.equal((await event(key)).length, 1);
  });
  await t.test('parallel identical requests cannot restore twice or create two receipts', async () => {
    const f = await fixture(), p = await raw([f.lead]), key = randomUUID();
    const results = await Promise.allSettled([apply(p, key, peers[0]), apply(p, key, peers[1])]);
    assert.ok(results.some(r => r.status === 'fulfilled'));
    for (const r of results) if (r.status === 'rejected') assert.equal(r.reason.code, '55P03');
    assert.equal((await event(key)).length, 1); assert.equal(await label(f), source); assert.equal((await apply(p, key)).replayed, true);
  });
  await t.test('concurrent graph write returns busy without a partial repair; fresh preview sees new edge', async () => {
    const f = await fixture(), second = await fixture(), p = await raw([f.lead]), key = randomUUID();
    await peers[1].query('BEGIN');
    await peers[1].query("INSERT INTO facebook_comments(page_id,lead_id,message) VALUES($1,$2,'synthetic in-flight edge')", [second.page, f.lead]);
    try { await assert.rejects(apply(p, key), e => e.code === '55P03'); }
    finally { await peers[1].query('COMMIT'); }
    assert.equal(await label(f), null); assert.equal((await event(key)).length, 0);
    await assert.rejects(apply(p, key), e => e.code === '40001'); assert.equal((await raw([f.lead])).items[0].reason, 'MULTIPLE_PAGE_REVIEW');
  });
};
