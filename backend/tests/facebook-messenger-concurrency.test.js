// Real, multi-connection PostgreSQL test. Never loads application .env files.
// Requires a NEW disposable CLUSTER, not only a new database: CREATE ROLE,
// including service_role BYPASSRLS, changes cluster-global state. Supply its
// empty local database named vpt_messenger_test_<suffix> through
// VPT_MESSENGER_TEST_URL. The caller owns cluster creation and removal.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Client } = require(process.env.PG_TEST_MODULE || 'pg');

const input = process.env.VPT_MESSENGER_TEST_URL;
assert(input, 'VPT_MESSENGER_TEST_URL must explicitly identify an isolated test database');
const url = new URL(input);
assert(['postgres:', 'postgresql:'].includes(url.protocol), 'PostgreSQL URL required');
assert(['127.0.0.1', '[::1]'].includes(url.hostname), 'Only literal loopback hosts are allowed');
assert(!url.search && !url.hash, 'Connection overrides are prohibited');
const database = decodeURIComponent(url.pathname.slice(1));
assert(/^vpt_messenger_test_[a-z0-9_]+$/.test(database), 'Dedicated test database prefix required');
assert(url.port && url.port !== '5432', 'Use an explicit isolated non-default test port');

const clients = Array.from({ length: 4 }, () => new Client({
  connectionString: input, ssl: false, connectionTimeoutMillis: 5000,
  statement_timeout: 5000, query_timeout: 7000,
  application_name: 'vpt_messenger_isolated_concurrency_test',
}));
const [admin, first, second, third] = clients;
const table = 'public.facebook_messenger_webhook_receipts';
const migrations = {};
let assertions = 0;
const check = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message); assertions++;
};
const key = n => n.toString(16).padStart(64, '0');
const add = (n, page, contact, time) => admin.query(
  `INSERT INTO ${table}(receipt_key,page_id,partner_psid,event,event_timestamp_ms)
   VALUES($1,$2,$3,'{"synthetic":true}',$4)`, [key(n), page, contact, time]);
const claim = async (client, page, limit = 100) => (await client.query(
  'SELECT * FROM public.facebook_messenger_receipts_claim($1,180,$2)', [limit, [page]])).rows;
const rpc = async (client, name, args) => (await client.query(
  `SELECT public.facebook_messenger_receipts_${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) AS ok`, args)).rows[0].ok;
const migrate = async name => {
  const sql = fs.readFileSync(path.join(__dirname, '../../database', name), 'utf8');
  migrations[name] = crypto.createHash('sha256').update(sql).digest('hex');
  await admin.query(sql);
};

async function main() {
  await Promise.all(clients.map(client => client.connect()));
  const server = (await admin.query(`SELECT current_database() AS database,
    inet_server_addr()::text AS address, inet_server_port() AS port,
    version() AS version, current_setting('transaction_isolation') AS isolation`)).rows[0];
  check(server.database, database, 'server database matches the explicit target');
  assert(['127.0.0.1/32', '127.0.0.1', '::1/128', '::1'].includes(server.address)); assertions++;
  check(server.isolation, 'read committed', 'production RPC assumes read committed');
  check((await admin.query("SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')")).rows[0].n,
    0, 'refuse nonempty databases; do not erase an existing fixture');
  check((await admin.query(`SELECT datname FROM pg_database WHERE NOT datistemplate
    AND datname<>ALL($1::text[]) ORDER BY datname`, [['postgres', database]])).rows,
    [], 'refuse a shared cluster containing other non-template databases');
  check((await admin.query(`SELECT rolname FROM pg_roles WHERE rolname<>current_user
    AND rolname!~'^pg_' ORDER BY rolname`)).rows,
    [], 'refuse a shared cluster containing other non-system roles');
  const backendPids = await Promise.all(clients.map(async client =>
    (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid));
  check(new Set(backendPids).size, 4, 'four independent PostgreSQL backends');
  await admin.query(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE facebook_contacts(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),page_id TEXT NOT NULL);
    CREATE TABLE facebook_messages(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      contact_id UUID NOT NULL REFERENCES facebook_contacts(id) ON DELETE CASCADE,
      direction TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    GRANT SELECT ON facebook_contacts,facebook_messages TO service_role;`);
  for (const name of ['591_facebook_messenger_campaign_phone_attribution.sql',
    '636_facebook_messenger_campaign_attribution_hardening.sql',
    '637_facebook_messenger_webhook_receipts.sql',
    '638_vpt_messenger_ab_campaign_mappings.sql',
    '639_facebook_messenger_verified_daily_attribution.sql']) await migrate(name);
  for (const name of ['637_facebook_messenger_webhook_receipts.sql',
    '638_vpt_messenger_ab_campaign_mappings.sql',
    '639_facebook_messenger_verified_daily_attribution.sql']) await migrate(name);
  assertions++;
  await Promise.all([first, second, third].map(client => client.query(
    `INSERT INTO ${table}(receipt_key,page_id,partner_psid,event,event_timestamp_ms)
     VALUES($1,'redelivery-page','contact','{"synthetic":true}',100)
     ON CONFLICT(receipt_key) DO NOTHING`, [key(9999)])));
  check((await admin.query(`SELECT count(*)::int AS n FROM ${table} WHERE receipt_key=$1`, [key(9999)])).rows[0].n,
    1, 'simultaneous redelivery persists one receipt');
  const redelivery = (await claim(first, 'redelivery-page'))[0];
  await rpc(first, 'finish', [redelivery.receipt_key, redelivery.lease_token]);
  await second.query(`INSERT INTO ${table}(receipt_key,page_id,partner_psid,event,event_timestamp_ms)
    VALUES($1,'redelivery-page','contact','{"synthetic":true}',100)
    ON CONFLICT(receipt_key) DO NOTHING`, [key(9999)]);
  check(await claim(third, 'redelivery-page'), [], 'redelivery after finish does not process twice');
  // Hold a claim transaction open, proving an overlapping second backend sees
  // no claim. Rolling back must restore both receipt state and advisory lock.
  await add(1, 'rollback-page', 'contact-a', 100);
  await add(2, 'rollback-page', 'contact-a', 200);
  await first.query('BEGIN');
  const rolledBack = await claim(first, 'rollback-page');
  check(rolledBack.map(r => r.receipt_key), [key(1)], 'first claimant gets conversation head');
  check(await claim(second, 'rollback-page'), [], 'competing claimant cannot pass held advisory lock');
  await first.query('ROLLBACK');
  check((await admin.query(`SELECT attempts,status FROM ${table} WHERE receipt_key=$1`, [key(1)])).rows[0],
    { attempts: 0, status: 'pending' }, 'rolled-back claim leaves no attempt or lease');
  const committed = await claim(second, 'rollback-page');
  check(committed.map(r => r.receipt_key), [key(1)], 'claim succeeds after prior rollback');
  check(await claim(third, 'rollback-page'), [], 'committed active lease blocks same conversation');
  check(await rpc(second, 'finish', [key(1), rolledBack[0].lease_token]), false, 'rolled-back token cannot finish');
  check(await rpc(second, 'finish', [key(1), committed[0].lease_token]), true, 'committed owner finishes');
  const successor = await claim(first, 'rollback-page');
  check(successor.map(r => r.receipt_key), [key(2)], 'next receipt starts only after predecessor finishes');
  await first.query('BEGIN');
  check(await rpc(first, 'finish', [key(2), successor[0].lease_token]), true, 'finish succeeds within transaction');
  await first.query('ROLLBACK');
  check(await claim(second, 'rollback-page'), [], 'rolled-back finish preserves active lease');
  check(await rpc(second, 'finish', [key(2), successor[0].lease_token]), true, 'owner can finish after rollback');

  // Force simultaneous work from three physical connections across 12 rounds.
  // Every round has 8 conversations with two ordered receipts each.
  let n = 100;
  for (let round = 0; round < 12; round++) {
    const page = `race-${round}`;
    for (let conversation = 0; conversation < 8; conversation++) {
      await add(n++, page, `contact-${conversation}`, 100);
      await add(n++, page, `contact-${conversation}`, 200);
    }
    const raced = (await Promise.all([first, second, third].map(client => claim(client, page)))).flat();
    check(raced.length, 8, `round ${round}: all eight conversation heads claimed`);
    check(new Set(raced.map(row => row.receipt_key)).size, 8, `round ${round}: no duplicate receipt claim`);
    check(new Set(raced.map(row => row.partner_psid)).size, 8, `round ${round}: one lease per conversation`);
    check(raced.every(row => row.event_timestamp_ms === '100'), true, `round ${round}: timestamp order retained`);
    check((await admin.query(`SELECT count(*)::int AS n FROM ${table} WHERE page_id=$1 AND status='processing'`, [page])).rows[0].n,
      8, `round ${round}: database agrees with worker claims`);
    for (const row of raced) await rpc(admin, 'finish', [row.receipt_key, row.lease_token]);
    const next = (await Promise.all([first, second, third].map(client => claim(client, page)))).flat();
    check(next.length, 8, `round ${round}: exactly eight successors claimed`);
    check(new Set(next.map(row => row.receipt_key)).size, 8, `round ${round}: successors not duplicated`);
    for (const row of next) await rpc(admin, 'finish', [row.receipt_key, row.lease_token]);
  }

  await add(9990, 'expiry-page', 'one-contact', 100);
  const expired = (await claim(first, 'expiry-page'))[0];
  await admin.query(`UPDATE ${table} SET lease_until=clock_timestamp()-interval '1 second' WHERE receipt_key=$1`, [key(9990)]);
  for (const [name, args] of [['renew', [key(9990), expired.lease_token, 180]],
    ['finish', [key(9990), expired.lease_token]], ['fail', [key(9990), expired.lease_token, 'synthetic_error']]]) {
    check(await rpc(first, name, args), false, `expired owner cannot ${name}`);
  }
  const reclaim = (await Promise.all([second, third].map(client => claim(client, 'expiry-page')))).flat();
  check(reclaim.length, 1, 'two reclaimers produce exactly one lease');
  check(reclaim[0].attempts, 2, 'reclaim increments attempts once');
  check(reclaim[0].lease_token !== expired.lease_token, true, 'reclaim replaces token');
  for (const [name, args] of [['renew', [key(9990), expired.lease_token, 180]],
    ['finish', [key(9990), expired.lease_token]], ['fail', [key(9990), expired.lease_token, 'synthetic_error']]]) {
    check(await rpc(first, name, args), false, `stale owner cannot ${name} reclaimed receipt`);
  }
  check(await rpc(second, 'renew', [key(9990), reclaim[0].lease_token, 180]), true, 'new owner renews');
  check(await rpc(second, 'finish', [key(9990), reclaim[0].lease_token]), true, 'new owner finishes');

  // Signed-provenance reporting checks on genuine PostgreSQL, synthetic data.
  const contact = (await admin.query("INSERT INTO facebook_contacts(page_id) VALUES('synthetic-page') RETURNING id")).rows[0].id;
  await admin.query(`INSERT INTO facebook_messenger_ad_attributions(contact_id,page_id,fb_ad_id,campaign_id,
    attributed_at,fb_event_timestamp_ms,signature_verified)
    VALUES($1,'synthetic-page','synthetic-ad','synthetic-campaign','2026-09-24T09:00:00Z',1790240400000,true)`, [contact]);
  const message = (await admin.query(`INSERT INTO facebook_messages(contact_id,direction,
    facebook_occurred_at,detected_phone,signature_verified)
    VALUES($1,'inbound','2026-09-24T10:00:00Z','synthetic-phone',true) RETURNING id`, [contact])).rows[0].id;
  const report = async () => (await admin.query(`SELECT * FROM fb_campaign_phone_numbers_in_range(
    ARRAY['synthetic-page'],NULL,'2026-09-23T17:00:00Z','2026-09-24T17:00:00Z')`)).rows;
  check(await report(), [{ campaign_id: 'synthetic-campaign', phone_contacts: '1' }], 'verified pair credited');
  await admin.query('UPDATE facebook_messages SET signature_verified=false WHERE id=$1', [message]);
  check(await report(), [], 'unsigned phone excluded');
  await admin.query('UPDATE facebook_messages SET signature_verified=true WHERE id=$1', [message]);
  await admin.query('UPDATE facebook_messenger_ad_attributions SET signature_verified=false WHERE contact_id=$1', [contact]);
  check(await report(), [], 'unsigned referral excluded');
  await admin.query('UPDATE facebook_messenger_ad_attributions SET signature_verified=true WHERE contact_id=$1', [contact]);
  await admin.query(`INSERT INTO facebook_messenger_ad_attributions(contact_id,page_id,fb_ad_id,campaign_id,
    attributed_at,fb_event_timestamp_ms,signature_verified)
    VALUES($1,'synthetic-page','synthetic-tied-ad','other-campaign','2026-09-24T09:00:00Z',1790240400000,true)`, [contact]);
  check(await report(), [], 'ambiguous latest signed referrals withheld');
  await admin.query('GRANT SELECT,INSERT,UPDATE,DELETE ON facebook_messages TO authenticated');
  await second.query('SET ROLE authenticated');
  await assert.rejects(second.query('UPDATE facebook_messages SET detected_phone=$1 WHERE id=$2', ['forged', message]),
    /verified_messenger_message_write_forbidden/); assertions++;
  await second.query('RESET ROLE');
  check((await admin.query('SELECT fb_campaign_phone_attribution_capabilities() AS value')).rows[0].value.schema_version,
    639, 'verified capability version present');
  check((await admin.query(`SELECT count(*)::int AS n FROM facebook_ad_campaign_mappings
    WHERE campaign_id='120251591865910435' AND page_id='409741855550833' AND ad_account_id='835757498658305'`)).rows[0].n,
    3, 'migration 638 installs all three authorised A/B/control mappings');
  check((await admin.query(`SELECT count(*)::int AS n FROM ${table} WHERE status<>'done'`)).rows[0].n,
    0, 'all synthetic queue work completed');
  console.log(JSON.stringify({ result: 'PASS', assertions, server, backendPids,
    simultaneousWorkerConnections: 3, raceRounds: 12, migrations,
    testSha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
    scope: 'Real isolated PostgreSQL, synthetic fixtures; not production-schema staging or real customer acceptance' }));
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; })
  .finally(async () => { await Promise.allSettled(clients.map(client => client.end())); });
