'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

module.exports = async (t, { db, peers, company, other, admin, sales }) => {
  const sql = fs.readFileSync(path.resolve(__dirname, '../../database/664_crm_survey_calendar_guard.sql'), 'utf8');
  await db.query(sql);
  await db.query(sql);
  // Existing deployment grants are intentionally generous for this test. The
  // control schema must remain private even if backup's broad PUBLIC grants run.
  const grantsSource = fs.readFileSync(path.resolve(__dirname, '../src/helpers/backupSchemaGrants.js'), 'utf8');
  const grants = grantsSource.match(/const GRANTS_SQL = `([\s\S]*?)`;/);
  assert.ok(grants);
  await db.query(grants[1]);
  const client = peers[0];
  const start = new Date(Date.now() + 5 * 86400000).toISOString();
  const end = new Date(Date.now() + 5 * 86400000 + 3600000).toISOString();
  const create = async ({ assignee = null, creator = null, cid = company, id = randomUUID() } = {}, c = client) => {
    await c.query(`INSERT INTO crm_events(id,title,start_time,end_time,all_day,company_id,assignee_id,created_by)
      VALUES($1,'Synthetic guard event',$2,$3,false,$4,$5,$6)`, [id, start, end, cid, assignee, creator]);
    return id;
  };
  const enroll = (c = db) => c.query(`INSERT INTO crm_survey_control.crm_survey_calendar_staff
    (staff_id,company_id,enrolled_by,release_reference) VALUES($1,$2,$3,'Synthetic isolated cutover; no production authority')`, [sales, company, admin]);
  const unenroll = () => db.query('DELETE FROM crm_survey_control.crm_survey_calendar_staff');
  const deny = promise => assert.rejects(promise, e => e.code === '42501');
  const ready = () => db.query('SELECT crm_survey_control.assert_ready()');
  const permit = id => db.query(`INSERT INTO crm_survey_control.crm_survey_calendar_permits VALUES(txid_current(),pg_backend_pid(),$1)`, [id]);
  const waitBlocked = async (waiting, blocker) => {
    for (let n = 0; n < 100; n++) {
      if ((await peers[2].query('SELECT $1::int=ANY(pg_blocking_pids($2)) b', [blocker, waiting])).rows[0].b) return;
      await peers[2].query('SELECT pg_sleep(0.02)');
    }
    throw Error('calendar write did not reach the expected lock');
  };

  await t.test('calendar guard defaults empty and preserves unenrolled writes after actual backup grants', async () => {
    assert.equal((await db.query('SELECT count(*)::int n FROM crm_survey_control.crm_survey_calendar_staff')).rows[0].n, 0);
    const id = await create({ assignee: sales });
    await client.query('INSERT INTO crm_event_participants(event_id,user_id) VALUES($1,$2)', [id, admin]);
    await client.query("UPDATE crm_events SET title='Synthetic changed' WHERE id=$1", [id]);
    await client.query('DELETE FROM crm_events WHERE id=$1', [id]);
    await ready();
  });

  await t.test('application roles cannot enroll, mint a permit, disable triggers or call private controls', async () => {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      await db.query('SET ROLE ' + role);
      try {
        await deny(db.query('SELECT * FROM crm_survey_control.crm_survey_calendar_staff'));
        await deny(enroll());
        await deny(permit(randomUUID()));
        await deny(ready());
        await deny(db.query('ALTER TABLE crm_events DISABLE TRIGGER crm_survey_calendar_guard'));
      } finally { await db.query('RESET ROLE'); }
    }
  });

  await t.test('guard covers old and new creator, assignee and participant identities across companies', async () => {
    const assigned = await create({ assignee: sales, cid: other });
    const created = await create({ creator: sales });
    const invited = await create({ cid: other });
    await client.query("INSERT INTO crm_event_participants(event_id,user_id,status) VALUES($1,$2,'declined')", [invited, sales]);
    const unrelated = await create();
    await enroll();
    try {
      await deny(create({ assignee: sales }));
      await deny(create({ creator: sales, cid: other }));
      for (const id of [assigned, created, invited]) {
        await deny(client.query("UPDATE crm_events SET status='cancelled',assignee_id=NULL,created_by=NULL WHERE id=$1", [id]));
        await deny(client.query('DELETE FROM crm_events WHERE id=$1', [id]));
        await deny(client.query('INSERT INTO crm_event_participants(event_id,user_id) VALUES($1,$2)', [id, admin]));
      }
      await deny(client.query('UPDATE crm_events SET assignee_id=$2 WHERE id=$1', [unrelated, sales]));
      await deny(client.query('INSERT INTO crm_event_participants(event_id,user_id) VALUES($1,$2)', [unrelated, sales]));
      await deny(client.query('INSERT INTO crm_event_participants(event_id,user_id) VALUES(NULL,$1)', [sales]));
      await deny(client.query('UPDATE crm_event_participants SET event_id=$2,user_id=$3 WHERE event_id=$1', [invited, unrelated, admin]));
      await client.query("UPDATE crm_events SET title='Unenrolled change allowed' WHERE id=$1", [unrelated]);
    } finally { await unenroll(); }
    await client.query('DELETE FROM crm_events WHERE id=ANY($1)', [[assigned, created, invited, unrelated]]);
  });

  await t.test('split participant replacement cannot expose a free interval and mixed deletes roll back', async () => {
    const id = await create();
    const otherId = await create();
    await client.query('INSERT INTO crm_event_participants(event_id,user_id) VALUES($1,$2)', [id, sales]);
    await enroll();
    try {
      await deny(client.query('DELETE FROM crm_event_participants WHERE event_id=$1', [id]));
      assert.equal((await db.query('SELECT count(*)::int n FROM crm_event_participants WHERE event_id=$1 AND user_id=$2', [id, sales])).rows[0].n, 1);
      await deny(client.query('DELETE FROM crm_events WHERE id=ANY($1)', [[otherId, id]]));
      assert.equal((await db.query('SELECT count(*)::int n FROM crm_events WHERE id=ANY($1)', [[otherId, id]])).rows[0].n, 2);
      await deny(client.query('TRUNCATE crm_event_participants'));
      await deny(client.query('TRUNCATE crm_events CASCADE'));
    } finally { await unenroll(); }
    await client.query('DELETE FROM crm_events WHERE id=ANY($1)', [[id, otherId]]);
  });

  await t.test('write waiting behind enrollment reads the committed cutover before mutating', async () => {
    const waiting = (await client.query('SELECT pg_backend_pid() p')).rows[0].p;
    const blocker = (await db.query('SELECT pg_backend_pid() p')).rows[0].p;
    await db.query('BEGIN');
    await enroll();
    const result = deny(create({ assignee: sales }));
    try { await waitBlocked(waiting, blocker); } finally { await db.query('COMMIT'); }
    try { await result; } finally { await unenroll(); }
  });

  await t.test('cutover waits for a preexisting calendar transaction to finish', async () => {
    const waiting = (await db.query('SELECT pg_backend_pid() p')).rows[0].p;
    const blocker = (await client.query('SELECT pg_backend_pid() p')).rows[0].p;
    await client.query('BEGIN');
    const id = await create({ assignee: sales });
    const result = enroll();
    try { await waitBlocked(waiting, blocker); } finally { await client.query('COMMIT'); }
    await result;
    try { await deny(client.query('DELETE FROM crm_events WHERE id=$1', [id])); } finally { await unenroll(); }
    await client.query('DELETE FROM crm_events WHERE id=$1', [id]);
  });

  await t.test('a stale repeatable-read snapshot cannot miss a later staff enrollment', async () => {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    await client.query('SELECT count(*) FROM crm_events');
    await enroll();
    try { await assert.rejects(create({ assignee: sales }), e => e.code === '0A000'); }
    finally { await client.query('ROLLBACK'); await unenroll(); }
  });

  await t.test('event update waiting for the gate observes a newly committed protected participant', async () => {
    const id = await create();
    const waiting = (await client.query('SELECT pg_backend_pid() p')).rows[0].p;
    const blocker = (await db.query('SELECT pg_backend_pid() p')).rows[0].p;
    await enroll();
    await db.query('BEGIN');
    await permit(id);
    await db.query('INSERT INTO crm_event_participants(event_id,user_id) VALUES($1,$2)', [id, sales]);
    await db.query('DELETE FROM crm_survey_control.crm_survey_calendar_permits');
    const result = deny(client.query("UPDATE crm_events SET status='cancelled' WHERE id=$1", [id]));
    try { await waitBlocked(waiting, blocker); } finally { await db.query('COMMIT'); }
    try { await result; } finally { await unenroll(); }
    assert.equal((await db.query('SELECT status FROM crm_events WHERE id=$1', [id])).rows[0].status, 'planned');
    await client.query('DELETE FROM crm_events WHERE id=$1', [id]);
  });

  await t.test('private permits are event, transaction and backend bound; GUC spoofing is ineffective', async () => {
    await enroll();
    const id = randomUUID();
    try {
      await client.query("SET app.survey_calendar_permit='true'");
      await deny(create({ assignee: sales }));
      await db.query('BEGIN');
      await permit(id);
      await create({ id, assignee: sales }, db);
      await db.query('INSERT INTO crm_event_participants(event_id,user_id) VALUES($1,$2)', [id, sales]);
      await deny(create({ assignee: sales }, db));
      await db.query('ROLLBACK');
      assert.equal((await db.query('SELECT count(*)::int n FROM crm_events WHERE id=$1', [id])).rows[0].n, 0);
      // Even a stale permit left by privileged maintenance cannot authorize a
      // later transaction. Production functions must remove permits on success.
      await permit(id);
      await deny(create({ id, assignee: sales }));
      await deny(create({ id, assignee: sales }, db));
    } finally {
      await db.query('ROLLBACK');
      await db.query('DELETE FROM crm_survey_control.crm_survey_calendar_permits');
      await unenroll();
    }
  });

  await t.test('cascade deletion and replica mode do not silently remove protected occupancy', async () => {
    const person = randomUUID();
    await db.query("INSERT INTO users(id,company_id,tenant_id,role,is_active) SELECT $1,id,tenant_id,'sales',true FROM companies WHERE id=$2", [person, company]);
    const id = await create();
    await db.query('INSERT INTO crm_event_participants(event_id,user_id) VALUES($1,$2)', [id, person]);
    await db.query(`INSERT INTO crm_survey_control.crm_survey_calendar_staff(staff_id,company_id,enrolled_by,release_reference)
      VALUES($1,$2,$3,'Synthetic cascade protection only')`, [person, company, admin]);
    try {
      await deny(db.query('DELETE FROM users WHERE id=$1', [person]));
      await db.query('SET session_replication_role=replica');
      try { await deny(db.query('DELETE FROM crm_event_participants WHERE event_id=$1', [id])); }
      finally { await db.query('SET session_replication_role=origin'); }
      assert.equal((await db.query('SELECT count(*)::int n FROM crm_event_participants WHERE event_id=$1', [id])).rows[0].n, 1);
    } finally { await unenroll(); }
    await client.query('DELETE FROM crm_events WHERE id=$1', [id]);
    await db.query('DELETE FROM users WHERE id=$1', [person]);
  });

  await t.test('readiness rejects disabled/restored ordinary triggers and broadened private access', async () => {
    await ready();
    await db.query('ALTER TABLE crm_events DISABLE TRIGGER crm_survey_calendar_guard');
    try { await deny(ready()); } finally { await db.query('ALTER TABLE crm_events ENABLE TRIGGER crm_survey_calendar_guard'); }
    try { await deny(ready()); } finally { await db.query('ALTER TABLE crm_events ENABLE ALWAYS TRIGGER crm_survey_calendar_guard'); }
    await db.query('GRANT USAGE ON SCHEMA crm_survey_control TO service_role');
    try { await deny(ready()); } finally { await db.query('REVOKE USAGE ON SCHEMA crm_survey_control FROM service_role'); }
    await db.query('GRANT INSERT ON crm_survey_control.crm_survey_calendar_permits TO service_role');
    try { await deny(ready()); } finally { await db.query('REVOKE INSERT ON crm_survey_control.crm_survey_calendar_permits FROM service_role'); }
    await ready();
  });
};
