'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
module.exports = async (t, { db, peers, query, company, other, admin, sales, region }) => {
  const sql = fs.readFileSync(path.resolve(__dirname, '../../database/665_crm_survey_proposals.sql'), 'utf8');
  await db.query(sql); await db.query(sql);
  await db.query('ALTER TABLE facebook_contacts ADD COLUMN IF NOT EXISTS customer_id uuid');
  await db.query('ALTER TABLE facebook_contacts ADD COLUMN IF NOT EXISTS last_message_at timestamptz, ADD COLUMN IF NOT EXISTS unread_count integer, ADD COLUMN IF NOT EXISTS updated_at timestamptz');
  let seq = 9800000;
  const now = async () => (await db.query('SELECT clock_timestamp() at')).rows[0].at.toISOString();
  const setup = async ({ staff, start, buffer = 0, slots } = {}) => {
    const who = staff || randomUUID(), lead = randomUUID(), customer = randomUUID(), psid = String(++seq);
    const a = start || Date.now() + 4 * 86400000, b = a + 3600000;
    if (!staff) {
      await db.query("INSERT INTO users(id,company_id,tenant_id,role,is_active) SELECT $1,id,tenant_id,'sales',true FROM companies WHERE id=$2", [who, company]);
      await db.query('INSERT INTO user_company_regions VALUES($1,$2)', [who, region]);
      await db.query(`INSERT INTO crm_survey_control.crm_survey_calendar_staff(staff_id,company_id,enrolled_by,release_reference)
        VALUES($1,$2,$3,'Synthetic isolated enrollment for domain tests')`, [who, company, admin]);
      await query('crm_survey_roster_change', [admin, company, randomUUID(), {
        action: 'SAVE', staffId: who, regionId: region, expectedRevision: 0, reason: 'Synthetic source verified only for isolated test',
        document: { calendarSource: 'CRM_COMPLETE', externalCalendarCoverage: 'ALL_BUSY_IN_CRM', sourceReference: 'Synthetic complete calendar, no actual customer',
          validUntil: new Date(a + 86400000).toISOString(), bufferMinutes: buffer, slots: slots || [{ startsAt: new Date(a).toISOString(), endsAt: new Date(b).toISOString() }] },
      }]);
    }
    await db.query("INSERT INTO customers(id,full_name,phone,company_id) VALUES($1,'Synthetic customer','0900000000',$2)", [customer, company]);
    await db.query("INSERT INTO crm_leads(id,title,company_id,region_id,assigned_to,customer_id) VALUES($1,'Synthetic survey',$2,$3,$4,$5)", [lead, company, region, sales, customer]);
    await db.query("INSERT INTO facebook_contacts(page_id,psid,lead_id,customer_id) VALUES('123',$1,$2,$3)", [psid, lead, customer]);
    const message = { pageId: '123', psid, mid: randomUUID(), direction: 'inbound', intent: 'MESSAGE', content: 'Synthetic survey request', attachments: [], sentAt: await now() };
    message.payloadHash = createHash('sha256').update(JSON.stringify(message)).digest('hex');
    await query('crm_care_receive', [JSON.stringify([message])]);
    const thread = (await db.query('SELECT id FROM crm_care_threads WHERE psid=$1', [psid])).rows[0].id;
    const c = { staff: who, lead, customer, psid, thread, a, b };
    const available = await query('crm_survey_availability', [admin, company, thread, new Date(a).toISOString(), new Date(b).toISOString()]);
    const option = available.items.find(x => x.staffId === who);
    assert.ok(option, JSON.stringify(available));
    c.command = { threadId: thread, optionId: option.optionId, startsAt: new Date(a).toISOString(), endsAt: new Date(b).toISOString(), location: 'Synthetic address for isolated tests only' };
    c.request = randomUUID();
    c.proposal = await query('crm_survey_propose', [admin, company, c.request, c.command]);
    return c;
  };
  // The transport/ingress is deliberately not implemented in SQL665. Only the
  // fixture's PostgreSQL owner inserts these private, simulated provider proofs.
  // These cases verify the domain transaction, NOT signed-webhook/send E2E.
  const confirm = async (c, { delivered = true, token, pageId = '123', psid = c.psid, sentAt } = {}) => {
    const d = (await db.query('SELECT * FROM crm_survey_control.deliveries WHERE proposal_id=$1', [c.proposal.proposalId])).rows[0];
    await db.query(`UPDATE crm_survey_control.deliveries SET state='SENDING',started_at=clock_timestamp() WHERE proposal_id=$1`, [c.proposal.proposalId]);
    const m = { pageId: '123', psid: c.psid, mid: randomUUID(), direction: 'inbound', intent: 'MESSAGE', content: 'Synthetic exact proposal confirmation', attachments: [], sentAt: sentAt || await now() };
    m.payloadHash = createHash('sha256').update(JSON.stringify(m)).digest('hex');
    await query('crm_care_receive', [JSON.stringify([m])]);
    const id = (await db.query('SELECT id FROM crm_care_messages WHERE provider_mid=$1', [m.mid])).rows[0].id;
    await db.query(`INSERT INTO crm_survey_control.inbound_receipts(message_id,proposal_id,page_id,psid,confirmation_token,payload_hash)
      VALUES($1,$2,$3,$4,$5,$6)`, [id, c.proposal.proposalId, pageId, psid, token || d.confirmation_token, m.payloadHash]);
    if (delivered) await db.query(`UPDATE crm_survey_control.deliveries SET state='SENT',provider_mid=$2,sent_at=clock_timestamp() WHERE proposal_id=$1`, [c.proposal.proposalId, randomUUID()]);
    return id;
  };
  const book = (id, client = db) => query('crm_survey_control.book', [id], client);
  const count = async table => (await db.query('SELECT count(*)::int n FROM ' + table)).rows[0].n;
  const finished = async c => { await db.query('DELETE FROM crm_survey_control.crm_survey_calendar_staff WHERE staff_id=$1', [c.staff]); };

  await t.test('proposal tokens and confirmation/booking commands are inaccessible to application roles', async () => {
    const c = await setup();
    const value = await query('crm_survey_proposal_read', [admin, company, c.proposal.proposalId]);
    assert.equal(value.reservationMade, false); assert.equal(value.deliveryState, 'QUEUED');
    const d = (await db.query('SELECT confirmation_token FROM crm_survey_control.deliveries WHERE proposal_id=$1', [value.proposalId])).rows[0];
    assert.equal(JSON.stringify(value).includes(d.confirmation_token), false);
    for (const role of ['anon', 'authenticated', 'service_role']) {
      await db.query('SET ROLE ' + role);
      try {
        await assert.rejects(db.query('SELECT * FROM crm_survey_control.deliveries'), e => e.code === '42501');
        await assert.rejects(book(randomUUID()), e => e.code === '42501');
      } finally { await db.query('RESET ROLE'); }
    }
    await assert.rejects(query('crm_survey_proposal_read', [admin, other, value.proposalId]), e => e.code === '42501');
    assert.equal((await query('crm_survey_propose', [admin, company, c.request, c.command])).replayed, true);
    await assert.rejects(query('crm_survey_propose', [admin, company, c.request, { ...c.command, location: 'Different synthetic location' }]), e => e.code === '23505');
    await finished(c);
  });

  await t.test('valid confirmation books exactly one event, attendee, consumed proof, audit and pending handoff', async () => {
    const c = await setup(), id = await confirm(c);
    await db.query('UPDATE facebook_contacts SET last_message_at=clock_timestamp(),updated_at=clock_timestamp(),unread_count=5 WHERE psid=$1', [c.psid]);
    const r = await book(id); assert.equal(r.status, 'BOOKED_HANDOFF_PENDING');
    const event = (await db.query('SELECT * FROM crm_events WHERE id=$1', [r.eventId])).rows[0];
    assert.equal(event.assignee_id, c.staff); assert.equal(event.created_by, null); assert.equal(event.lead_id, c.lead); assert.equal(event.customer_id, c.customer);
    assert.equal((await db.query('SELECT count(*)::int n FROM crm_event_participants WHERE event_id=$1 AND user_id=$2', [r.eventId, c.staff])).rows[0].n, 1);
    assert.equal((await db.query('SELECT state FROM crm_survey_control.confirmations WHERE message_id=$1', [id])).rows[0].state, 'CONSUMED');
    const h = (await db.query('SELECT * FROM crm_survey_control.handoffs WHERE proposal_id=$1', [r.proposalId])).rows[0];
    assert.equal(h.state, 'PENDING'); assert.equal(h.recipient_id, c.staff); assert.equal(h.sales_owner_id, sales);
    assert.equal((await book(id)).replayed, true);
    assert.equal((await db.query("SELECT count(*)::int n FROM crm_survey_control.proposal_events WHERE proposal_id=$1 AND action='BOOK'", [r.proposalId])).rows[0].n, 1);
    assert.equal(await count('crm_survey_control.crm_survey_calendar_permits'), 0);
    await finished(c);
  });

  await t.test('confirmation before send acknowledgement waits then books without requiring click after ACK', async () => {
    const c = await setup(), id = await confirm(c, { delivered: false });
    assert.equal((await book(id)).status, 'WAITING_FOR_DELIVERY');
    await db.query(`UPDATE crm_survey_control.deliveries SET state='SENT',provider_mid=$2,sent_at=clock_timestamp() WHERE proposal_id=$1`, [c.proposal.proposalId, randomUUID()]);
    assert.equal((await book(id)).status, 'BOOKED_HANDOFF_PENDING');
    await finished(c);
  });

  await t.test('wrong token or Page/PSID and an old unrelated message cannot confirm a proposal', async () => {
    for (const spec of [{ token: randomUUID() }, { pageId: '999' }, { psid: '990000000' }]) {
      const c = await setup(), id = await confirm(c, spec);
      await assert.rejects(book(id), e => e.code === '42501'); await finished(c);
    }
    const c = await setup(), id = await confirm(c, { sentAt: new Date(Date.now() - 60000).toISOString() });
    assert.equal((await book(id)).status, 'REJECTED'); await finished(c);
  });

  await t.test('replacing location supersedes the old token; rejection replay preserves the first result', async () => {
    const c = await setup(), id = await confirm(c);
    const a = await query('crm_survey_availability', [admin, company, c.thread, c.command.startsAt, c.command.endsAt]);
    await query('crm_survey_propose', [admin, company, randomUUID(), { ...c.command, optionId: a.items.find(x => x.staffId === c.staff).optionId, location: 'Second exact customer address' }]);
    const r = await book(id); assert.equal(r.reason, 'PROPOSAL_NOT_OPEN');
    const before = await count('crm_survey_control.proposal_events');
    const repeated = await book(id); assert.equal(repeated.reason, r.reason); assert.equal(repeated.replayed, true);
    assert.equal(await count('crm_survey_control.proposal_events'), before); await finished(c);
  });

  await t.test('takeover, opt-out, owner change, source change and removed enrollment prevent booking', async () => {
    for (const mutate of [
      c => db.query("UPDATE crm_care_threads SET mode='OPTED_OUT' WHERE id=$1", [c.thread]),
      c => db.query("UPDATE crm_care_threads SET mode='HUMAN_ACTIVE' WHERE id=$1", [c.thread]),
      c => db.query('UPDATE crm_leads SET assigned_to=$2 WHERE id=$1', [c.lead, c.staff]),
      c => db.query('UPDATE crm_survey_rosters SET revision=revision+1 WHERE staff_id=$1', [c.staff]),
      c => db.query('DELETE FROM crm_survey_control.crm_survey_calendar_staff WHERE staff_id=$1', [c.staff]),
    ]) {
      const c = await setup(), id = await confirm(c); await mutate(c);
      const r = await book(id); assert.equal(r.status, 'REJECTED');
      const again = await book(id); assert.equal(again.reason, r.reason); assert.equal(again.replayed, true); await finished(c);
    }
  });

  await t.test('conflicting contact Customer mapping and revoked proposer rights cannot create an event', async () => {
    const c = await setup(), id = await confirm(c);
    await db.query('UPDATE facebook_contacts SET customer_id=$2 WHERE psid=$1', [c.psid, randomUUID()]);
    assert.equal((await book(id)).status, 'REJECTED'); await finished(c);
    const d = await setup(), mid = await confirm(d);
    await db.query('UPDATE users SET is_active=false WHERE id=$1', [admin]);
    try { await assert.rejects(book(mid), e => e.code === '42501'); } finally { await db.query('UPDATE users SET is_active=true WHERE id=$1', [admin]); }
    await finished(d);
  });

  await t.test('simultaneous confirmations create one booking and competing customers cannot share a slot', async () => {
    for (const client of peers.slice(0, 2)) await client.query('RESET ROLE');
    try {
      const c = await setup(), id = await confirm(c);
      const pair = await Promise.all([book(id, peers[0]), book(id, peers[1])]);
      assert.equal(pair.filter(x => x.replayed).length, 1); assert.equal(pair[0].eventId, pair[1].eventId); await finished(c);
      const a = await setup(), b = await setup({ staff: a.staff, start: a.a });
      const m1 = await confirm(a), m2 = await confirm(b);
      const r = await Promise.all([book(m1, peers[0]), book(m2, peers[1])]);
      assert.equal(r.filter(x => x.status === 'BOOKED_HANDOFF_PENDING').length, 1);
      assert.equal(r.filter(x => x.reason === 'SLOT_UNAVAILABLE').length, 1); await finished(a);
    } finally { for (const client of peers.slice(0, 2)) await client.query('SET ROLE service_role'); }
  });

  await t.test('failure after event, participant or audit writes rolls back every booking effect', async () => {
    for (const table of ['public.crm_event_participants', 'crm_survey_control.proposal_events', 'crm_survey_control.handoffs']) {
      const c = await setup(), id = await confirm(c), n = await count('crm_events');
      await db.query("CREATE OR REPLACE FUNCTION public.synthetic_booking_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic fault'; END $$");
      await db.query('CREATE TRIGGER synthetic_booking_failure BEFORE INSERT ON ' + table + ' FOR EACH ROW EXECUTE FUNCTION public.synthetic_booking_failure()');
      try { await assert.rejects(book(id), e => e.code === 'P0001'); }
      finally { await db.query('DROP TRIGGER synthetic_booking_failure ON ' + table); }
      assert.equal(await count('crm_events'), n);
      assert.equal((await db.query('SELECT count(*)::int n FROM crm_survey_control.confirmations WHERE message_id=$1', [id])).rows[0].n, 0);
      assert.equal(await count('crm_survey_control.crm_survey_calendar_permits'), 0);
      assert.equal((await book(id)).status, 'BOOKED_HANDOFF_PENDING'); await finished(c);
    }
    await db.query('DROP FUNCTION public.synthetic_booking_failure()');
  });

  await t.test('expiry after a late handoff trigger rolls back the calendar and receipt consumption', async () => {
    const c = await setup(), id = await confirm(c), n = await count('crm_events');
    await db.query("UPDATE crm_survey_control.proposals SET expires_at=clock_timestamp()+interval '250 milliseconds' WHERE id=$1", [c.proposal.proposalId]);
    await db.query("CREATE FUNCTION public.synthetic_booking_delay() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.35);RETURN NEW;END $$");
    await db.query('CREATE TRIGGER synthetic_booking_delay BEFORE INSERT ON crm_survey_control.handoffs FOR EACH ROW EXECUTE FUNCTION public.synthetic_booking_delay()');
    try { await assert.rejects(book(id), e => e.code === '40001'); }
    finally { await db.query('DROP TRIGGER synthetic_booking_delay ON crm_survey_control.handoffs'); await db.query('DROP FUNCTION public.synthetic_booking_delay()'); }
    assert.equal(await count('crm_events'), n); assert.equal(await count('crm_survey_control.crm_survey_calendar_permits'), 0); await finished(c);
  });

  await t.test('a booked travel buffer remains unavailable after a new source reduces its buffer', async () => {
    const c = await setup({ buffer: 30 }), id = await confirm(c); await book(id);
    const from = new Date(c.b + 10 * 60000).toISOString(), to = new Date(c.b + 70 * 60000).toISOString();
    const roster = await query('crm_survey_roster_read', [admin, company, c.staff, region]);
    await query('crm_survey_roster_change', [admin, company, randomUUID(), { action: 'SAVE', staffId: c.staff, regionId: region, expectedRevision: roster.revision, reason: 'Synthetic source reduction retains old booking buffer', document: { ...roster.document, bufferMinutes: 0, slots: [{ startsAt: from, endsAt: to }] } }]);
    const view = await query('crm_survey_availability', [admin, company, c.thread, from, to]);
    assert.equal(view.items.some(x => x.staffId === c.staff), false); await finished(c);
  });
};
