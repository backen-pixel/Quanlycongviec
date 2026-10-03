'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { assertLegacyFacebookWriteAllowed, normalizeScope } = require('../src/helpers/facebookLegacyWriteScope');
const { deleteLegacyFacebookContact, linkLegacyFacebookContact } = require('../src/helpers/facebookLegacyContactWrites');
const { deleteLeadIfAllowedForRescan, deleteOrphanCustomerIfAllowed } = require('../src/helpers/facebookLeadDeleteWhenNoPhone');

module.exports = async (t, { db, peers, query, company, admin, sales, region, fresh, waitLock, blocked }) => {
  // Mapping columns/FKs match migration42; no provider or real customer data.
  await db.query(`CREATE TABLE facebook_messages(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),contact_id uuid NOT NULL REFERENCES facebook_contacts(id) ON DELETE CASCADE,
    lead_id uuid REFERENCES crm_leads(id) ON DELETE SET NULL,direction text NOT NULL CHECK(direction IN('inbound','outbound')),content text);
    CREATE TABLE facebook_comments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),page_id text NOT NULL,
      lead_id uuid REFERENCES crm_leads(id) ON DELETE SET NULL,message text);
    CREATE INDEX care_test_message_contact ON facebook_messages(contact_id);
    CREATE INDEX care_test_message_lead ON facebook_messages(lead_id);
    GRANT SELECT,UPDATE,DELETE ON facebook_messages TO service_role;`);
  const sql = fs.readFileSync(path.resolve(__dirname, '../../database/682_crm_care_legacy_write_check.sql'), 'utf8');
  await db.query(sql); await db.query(sql);
  const primary = { isPrimary: () => true };
  const raw = (scope, client = peers[0]) => query('crm_care_legacy_write_check', [scope], client);
  const check = (scope, client = peers[0]) => raw(normalizeScope(scope), client);
  let seq = 6820000;
  const enroll = c => db.query("INSERT INTO crm_care_control.connection_pages VALUES($1,$2,true,$3,'Synthetic legacy writer migration acceptance')", [c.page, company, admin]);
  const legacy = async () => {
    const c = { page: String(++seq), contact: randomUUID(), lead: randomUUID(), customer: randomUUID() };
    await db.query('INSERT INTO facebook_pages(page_id,default_company_id,is_active) VALUES($1,$2,true)', [c.page, company]);
    await db.query("INSERT INTO customers(id,full_name,phone,company_id) VALUES($1,'Synthetic historical customer','0900000000',$2)", [c.customer, company]);
    await db.query("INSERT INTO crm_leads(id,title,type,customer_id,company_id,region_id,assigned_to,lead_owner_id) VALUES($1,'Synthetic historical Lead','lead',$2,$3,$4,$5,$5)", [c.lead, c.customer, company, region, sales]);
    await db.query('INSERT INTO facebook_contacts(id,page_id,psid,lead_id,customer_id) VALUES($1,$2,$2,$3,$4)', [c.contact, c.page, c.lead, c.customer]);
    return c;
  };
  const adapter = (client = peers[0]) => {
    const writes = [];
    return { writes,
      rpc: async (name, args) => { assert.equal(name, 'crm_care_legacy_write_check');
        try { return { data: await raw(args.p_scope, client) }; } catch (error) { return { error }; }
      },
      from(table) {
        assert.ok(['facebook_messages', 'facebook_contacts'].includes(table), 'unexpected table mutation');
        let action, payload, field, value, single = false;
        const q = {
          delete() { action = 'DELETE'; return q; }, update(x) { action = 'UPDATE'; payload = x; return q; },
          eq(k, v) { assert.ok(['id', 'contact_id'].includes(k)); field = k; value = v; return q; },
          select() { return q; }, single() { single = true; return q; },
          then(resolve, reject) {
            const execute = async () => {
              assert.ok(action && field); writes.push({ table, action });
              try {
                let result;
                if (action === 'DELETE') result = await client.query(`DELETE FROM ${table} WHERE ${field}=$1 RETURNING *`, [value]);
                else {
                  const entries = Object.entries(payload); assert.ok(entries.every(([k]) => ['lead_id', 'updated_at'].includes(k)));
                  result = await client.query(`UPDATE ${table} SET ${entries.map(([k], i) => `${k}=$${i + 1}`).join(',')} WHERE ${field}=$${entries.length + 1} RETURNING *`, [...entries.map(([, v]) => v), value]);
                }
                return { data: single ? result.rows[0] : result.rows };
              } catch (error) { return { error }; }
            };
            return execute().then(resolve, reject);
          },
        };
        return q;
      },
    };
  };
  await t.test('legacy preflight migration is repeatable, server-only and returns only scope receipt', async () => {
    const c = await legacy(), scope = normalizeScope({ contactIds: [c.contact] });
    for (const role of ['anon', 'authenticated']) {
      await db.query('SET ROLE ' + role);
      try { await assert.rejects(raw(scope, db), e => e.code === '42501'); } finally { await db.query('RESET ROLE'); }
    }
    await assert.rejects(raw(scope, db), e => e.code === '42501');
    const r = await check({ contactIds: [c.contact] });
    assert.equal(r.allowed, true); assert.equal(r.reservationMade, false); assert.equal(r.reason, 'LEGACY_SCOPE');
    assert.deepEqual(Object.keys(r).sort(), ['allowed', 'observedAt', 'policy', 'reason', 'reservationMade', 'scope'].sort());
    assert.deepEqual(r.scope, scope); assert.ok(!JSON.stringify(r).includes('0900000000'));
    assert.equal((await assertLegacyFacebookWriteAllowed(adapter(), { contactIds: [c.contact] }, primary)).allowed, true);
  });
  await t.test('enrolled Page protects direct Lead and shared Customer even when enrollment is inactive', async () => {
    const c = await legacy(); await enroll(c);
    for (const active of [true, false]) {
      await db.query('UPDATE crm_care_control.connection_pages SET active=$2 WHERE page_id=$1', [c.page, active]);
      for (const scope of [{ pageIds: [c.page] }, { contactIds: [c.contact] }, { leadIds: [c.lead] }, { customerIds: [c.customer] }]) {
        const r = await check(scope); assert.equal(r.allowed, false); assert.equal(r.reason, 'MANAGED_PAGE');
      }
    }
  });
  await t.test('inverse links and shared Customer cross Page boundaries while a Page-only check stays local', async () => {
    const a = await legacy(), b = await legacy();
    await db.query('UPDATE facebook_contacts SET lead_id=NULL,customer_id=NULL WHERE id=$1', [a.contact]);
    await db.query('UPDATE crm_leads SET facebook_contact_id=$2 WHERE id=$1', [b.lead, a.contact]);
    await enroll(a);
    assert.equal((await check({ leadIds: [b.lead] })).allowed, false);
    assert.equal((await check({ customerIds: [b.customer] })).allowed, false);
    assert.equal((await check({ contactIds: [b.contact] })).allowed, false);
    assert.equal((await check({ pageIds: [b.page] })).allowed, true);
  });
  await t.test('intake provenance protects Lead and Customer before a Messenger contact mapping exists', async () => {
    const c = await fresh();
    assert.equal((await db.query('SELECT count(*)::int n FROM facebook_contacts WHERE page_id=$1', [c.page])).rows[0].n, 0);
    assert.equal((await check({ leadIds: [c.lead] })).allowed, false);
    assert.equal((await check({ customerIds: [c.customer] })).allowed, false);
  });
  await t.test('message-only historical mapping blocks actual deletion before the first message write', async () => {
    const protectedRecord = await legacy(), old = await legacy(); await enroll(protectedRecord);
    await db.query('UPDATE facebook_contacts SET lead_id=NULL,customer_id=NULL WHERE id=$1', [old.contact]);
    const message = (await db.query("INSERT INTO facebook_messages(contact_id,lead_id,direction,content) VALUES($1,$2,'inbound','Keep original history') RETURNING id", [old.contact, protectedRecord.lead])).rows[0].id;
    const connection = adapter();
    await assert.rejects(deleteLegacyFacebookContact(connection, old.contact, primary), { code: 'MANAGED_CARE_SCOPE' });
    assert.deepEqual(connection.writes, []);
    assert.equal((await db.query('SELECT content FROM facebook_messages WHERE id=$1', [message])).rows[0].content, 'Keep original history');
  });
  await t.test('message-only evidence also protects a Lead reachable from a managed contact', async () => {
    const protectedRecord = await legacy(), old = await legacy(); await enroll(protectedRecord);
    await db.query("INSERT INTO facebook_messages(contact_id,lead_id,direction) VALUES($1,$2,'inbound')", [protectedRecord.contact, old.lead]);
    assert.equal((await check({ leadIds: [old.lead] })).allowed, false);
  });
  await t.test('Customer-only Lead Ads history blocks Customer cleanup without a current contact mapping', async () => {
    const protectedRecord = await legacy(), old = await legacy(); await enroll(protectedRecord);
    await db.query('UPDATE facebook_contacts SET lead_id=NULL,customer_id=NULL WHERE id=$1', [old.contact]);
    await db.query('UPDATE crm_leads SET customer_id=NULL WHERE id=$1', [old.lead]);
    await db.query('INSERT INTO facebook_lead_ads(leadgen_id,page_id,customer_id,processed) VALUES($1,$2,$3,true)', [String(++seq), protectedRecord.page, old.customer]);
    assert.equal((await check({ customerIds: [old.customer] })).allowed, false);
    const connection = adapter();
    await assert.rejects(deleteOrphanCustomerIfAllowed(connection, old.customer, old.contact, primary), { code: 'MANAGED_CARE_SCOPE' });
    assert.deepEqual(connection.writes, []);
  });
  await t.test('comment-only Lead history remains protected before a legacy merge or deletion', async () => {
    const protectedRecord = await legacy(), old = await legacy(); await enroll(protectedRecord);
    await db.query('INSERT INTO facebook_comments(page_id,lead_id,message) VALUES($1,$2,$3)', [protectedRecord.page, old.lead, 'Original comment']);
    assert.equal((await check({ leadIds: [old.lead] })).allowed, false);
    const connection = adapter();
    await assert.rejects(deleteLeadIfAllowedForRescan(connection, old.lead, old.contact, primary), { code: 'MANAGED_CARE_SCOPE' });
    assert.deepEqual(connection.writes, []);
  });
  await t.test('malformed, empty, missing and oversized identity requests fail closed', async () => {
    const c = await legacy(), scope = normalizeScope({ pageIds: [c.page] });
    for (const bad of [null, [], {}, { ...scope, extra: [] }, { ...scope, pageIds: [1] }, { ...scope, pageIds: Array(501).fill(c.page) }, { ...scope, contactIds: ['bad'] }, { ...scope, pageIds: [] }]) {
      await assert.rejects(raw(bad), e => e.code === '22023');
    }
    for (const missing of [{ contactIds: [randomUUID()] }, { leadIds: [randomUUID()] }, { customerIds: [randomUUID()] }, { pageIds: ['999999999999'] }]) {
      await assert.rejects(check(missing), e => e.code === '40001');
    }
  });
  await t.test('cyclic shared identity graph terminates and an overly broad graph cannot grant permission', async () => {
    const c = await legacy(); await db.query('UPDATE crm_leads SET facebook_contact_id=$2 WHERE id=$1', [c.lead, c.contact]);
    assert.equal((await check({ customerIds: [c.customer] })).allowed, true);
    await db.query('BEGIN');
    try {
      await db.query("INSERT INTO facebook_contacts(id,page_id,psid,customer_id) SELECT gen_random_uuid(),$1,'large-'||i,$2 FROM generate_series(1,1000)i", [c.page, c.customer]);
      await db.query('SET LOCAL ROLE service_role');
      await assert.rejects(check({ customerIds: [c.customer] }, db), e => e.code === '54000');
    } finally { await db.query('ROLLBACK'); }
  });
  await t.test('enrollment committed while a preflight waits invalidates the legacy permission', async () => {
    const c = await legacy(), pid = await waitLock(peers[1]); let pending;
    await db.query('BEGIN');
    try { await enroll(c); pending = check({ contactIds: [c.contact] }, peers[1]).then(value => ({ value }), error => ({ error })); await blocked(pid); }
    finally { await db.query('COMMIT'); }
    const result = await pending; if (result.error) throw result.error;
    assert.equal(result.value.allowed, false);
  });
  await t.test('an absent protection trigger or wrong isolation rejects even an unmanaged Page', async () => {
    const c = await legacy();
    await db.query('ALTER TABLE facebook_contacts DISABLE TRIGGER crm_care_connection_guard');
    try { await assert.rejects(check({ pageIds: [c.page] }), e => e.code === '42501'); }
    finally { await db.query('ALTER TABLE facebook_contacts ENABLE ALWAYS TRIGGER crm_care_connection_guard'); }
    await peers[0].query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    try { await assert.rejects(check({ pageIds: [c.page] }), e => e.code === '0A000'); } finally { await peers[0].query('ROLLBACK'); }
  });
  await t.test('unmanaged actual link and delete helpers retain history until explicitly deleted', async () => {
    const c = await legacy(), connection = adapter();
    await db.query("INSERT INTO facebook_messages(contact_id,direction,content) VALUES($1,'inbound','Unmanaged history')", [c.contact]);
    await linkLegacyFacebookContact(connection, c.contact, c.lead, primary);
    assert.equal((await db.query('SELECT lead_id FROM facebook_messages WHERE contact_id=$1', [c.contact])).rows[0].lead_id, c.lead);
    await deleteLegacyFacebookContact(connection, c.contact, primary);
    assert.equal((await db.query('SELECT count(*)::int n FROM facebook_messages WHERE contact_id=$1', [c.contact])).rows[0].n, 0);
    assert.equal((await db.query('SELECT count(*)::int n FROM facebook_contacts WHERE id=$1', [c.contact])).rows[0].n, 0);
    assert.equal((await db.query('SELECT count(*)::int n FROM crm_leads WHERE id=$1', [c.lead])).rows[0].n, 1);
  });
  await t.test('successful preflight creates no connection permit or persistent operation receipt', async () => {
    const c = await legacy();
    const counts = async () => (await db.query(`SELECT
      (SELECT count(*) FROM crm_care_control.connection_permits) permits,
      (SELECT count(*) FROM crm_care_control.connection_events) events,
      (SELECT count(*) FROM crm_care_control.connection_cancellations) cancellations`)).rows[0];
    const before = await counts();
    await assertLegacyFacebookWriteAllowed(adapter(), { contactIds: [c.contact] }, primary);
    assert.deepEqual(await counts(), before);
  });
};
