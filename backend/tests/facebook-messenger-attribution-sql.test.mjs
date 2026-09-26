// Isolated PostgreSQL execution; this test never opens the application's DB.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { PGlite } = require(process.env.PGLITE_TEST_MODULE || '@electric-sql/pglite');
const db = new PGlite();
let assertions = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions++; };
const migration = async name => db.exec(await readFile(new URL(`../../database/${name}`, import.meta.url), 'utf8'));
const start = '2026-09-23T17:00:00Z';
const end = '2026-09-24T17:00:00Z';
const referralTime = '2026-09-24T09:00:00Z';
const phoneTime = '2026-09-24T10:00:00Z';
const report = async (pages = ['P1'], campaigns = null, from = start, to = end) =>
  (await db.query('SELECT * FROM public.fb_campaign_phone_numbers_in_range($1,$2,$3,$4) ORDER BY campaign_id',
    [pages, campaigns, from, to])).rows.map(row => ({ ...row, phone_contacts: Number(row.phone_contacts) }));
const contact = async (page = 'P1') => (await db.query(
  'INSERT INTO facebook_contacts(page_id) VALUES ($1) RETURNING id', [page])).rows[0].id;
const referral = async (id, ad = 'A1', time = referralTime, verified = true, page = 'P1', campaign = null) =>
  db.query(`INSERT INTO facebook_messenger_ad_attributions
    (contact_id,page_id,fb_ad_id,campaign_id,attributed_at,fb_event_timestamp_ms,signature_verified)
    VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, page, ad, campaign, time, new Date(time).getTime(), verified]);
const phone = async (id, time = phoneTime, verified = true, direction = 'inbound', detected = 'synthetic_phone') =>
  (await db.query(`INSERT INTO facebook_messages
    (contact_id,direction,detected_phone,facebook_occurred_at,signature_verified,created_at)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [id, direction, detected, time, verified, phoneTime])).rows[0].id;
const reset = () => db.exec('TRUNCATE facebook_contacts CASCADE');

try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE facebook_contacts(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), page_id TEXT NOT NULL);
    CREATE TABLE facebook_messages(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      contact_id UUID NOT NULL REFERENCES facebook_contacts(id) ON DELETE CASCADE,
      direction TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    GRANT SELECT ON facebook_messages, facebook_contacts TO service_role;`);
  await migration('591_facebook_messenger_campaign_phone_attribution.sql');
  await migration('636_facebook_messenger_campaign_attribution_hardening.sql');
  // Upgrade preserves existing data while leaving its signature provenance false.
  const legacyContact = await contact();
  await db.query(`INSERT INTO facebook_messages(contact_id,direction,facebook_occurred_at,detected_phone)
    VALUES ($1,'inbound',$2,'synthetic_phone')`, [legacyContact, phoneTime]);
  await db.query(`INSERT INTO facebook_messenger_ad_attributions
    (contact_id,page_id,fb_ad_id,campaign_id,attributed_at,fb_event_timestamp_ms)
    VALUES ($1,'P1','A1','C1',$2,$3)`, [legacyContact, referralTime, new Date(referralTime).getTime()]);
  await migration('639_facebook_messenger_verified_daily_attribution.sql');
  await migration('639_facebook_messenger_verified_daily_attribution.sql');
  check(await report(), [], 'migration reruns safely; legacy unsigned events cannot acquire trust');
  check((await db.query('SELECT signature_verified FROM facebook_messages')).rows[0].signature_verified, false);
  check((await db.query('SELECT signature_verified FROM facebook_messenger_ad_attributions')).rows[0].signature_verified, false);
  const capabilities = (await db.query('SELECT fb_campaign_phone_attribution_capabilities() AS value')).rows[0].value;
  check(capabilities, { schema_version: 639, same_vietnam_day: true,
    verified_events_only: true, ambiguous_latest_referral_excluded: true }, 'explicit release capabilities');
  await db.exec(`INSERT INTO facebook_ad_campaign_mappings(fb_ad_id,ad_account_id,page_id,campaign_id)
    VALUES ('A1','test-account','P1','C1'),('A2','test-account','P1','C2'),
      ('A3','test-account','P1','C1'),('A4','test-account','P2','C2');`);
  await reset();
  let id = await contact();
  await referral(id); await phone(id); await phone(id);
  check(await report(), [{ campaign_id: 'C1', phone_contacts: 1 }], 'duplicate phone messages count one contact');
  check(await report([], ['C1']), [], 'empty Page scope cannot expose data');
  check(await report(['P2']), [], 'different Page scope cannot expose data');
  check(await report(['P1'], ['C2']), [], 'campaign filter preserved');
  check(await report(['P1'], null, null, end), [], 'missing time boundary fails closed');
  check(await report(['P1'], null, end, start), [], 'reversed time boundary has no credit');
  await reset(); id = await contact();
  await referral(id, 'A1', '2026-09-24T16:59:00Z');
  await phone(id, '2026-09-24T17:01:00Z');
  check(await report(['P1'], null, start, '2026-09-25T17:00:00Z'), [],
    'even a multi-day RPC cannot credit an overnight referral');
  await reset(); id = await contact();
  await referral(id, 'A1', phoneTime); await phone(id);
  check(await report(), [{ campaign_id: 'C1', phone_contacts: 1 }], 'equal referral and phone time is eligible');
  await reset(); id = await contact();
  await referral(id, 'A1', '2026-09-24T11:00:00Z'); await phone(id);
  check(await report(), [], 'future referral cannot credit earlier phone');
  await reset(); id = await contact();
  await referral(id); await referral(id, 'A2'); await phone(id);
  check(await report(), [], 'tied latest referrals to different campaigns are withheld');
  await reset(); id = await contact();
  await referral(id); await referral(id, 'A3'); await phone(id);
  check(await report(), [], 'tied distinct ads remain ambiguous even within one campaign');
  await reset(); id = await contact();
  await referral(id); await referral(id, 'A2', '2026-09-24T09:01:00Z'); await phone(id);
  check(await report(), [{ campaign_id: 'C2', phone_contacts: 1 }], 'unambiguous latest referral wins');
  await reset(); id = await contact();
  await referral(id); await referral(id, 'UNKNOWN', '2026-09-24T09:01:00Z'); await phone(id);
  check(await report(), [], 'unmapped latest referral does not fall back to an earlier mapped ad');
  for (const [messageVerified, referralVerified] of [[false, true], [true, false], [false, false]]) {
    await reset(); id = await contact();
    await referral(id, 'A1', referralTime, referralVerified); await phone(id, phoneTime, messageVerified);
    check(await report(), [], 'both sides require evidence of signed ingestion');
  }
  await reset(); id = await contact();
  await referral(id); await phone(id, null);
  check(await report(), [], 'created_at cannot replace a missing Meta timestamp');
  await reset(); id = await contact();
  await referral(id, 'A1', referralTime, true, 'P2', 'C1'); await phone(id);
  check(await report(), [], 'contact/referral Page mismatch cannot be credited');
  await reset(); id = await contact();
  await referral(id, 'A4'); await phone(id);
  check(await report(), [], 'ad mapping belonging to another Page cannot be used');
  await reset(); id = await contact();
  await referral(id); const excluded = await phone(id);
  await db.query(`INSERT INTO facebook_messenger_phone_exclusions
    (facebook_message_id,contact_id,page_id,reason,excluded_by) VALUES ($1,$2,'P1','e2e_test','test')`, [excluded, id]);
  check(await report(), [], 'explicit E2E message is excluded');
  await phone(id);
  check(await report(), [{ campaign_id: 'C1', phone_contacts: 1 }], 'exclusion applies only to selected message');
  await reset(); id = await contact();
  await referral(id); await phone(id, '2026-09-24T16:59:59.999Z');
  check(await report(), [{ campaign_id: 'C1', phone_contacts: 1 }], 'last millisecond of Vietnam day included');
  await reset(); id = await contact();
  await referral(id); await phone(id, end);
  check(await report(), [], 'exclusive end boundary excluded');
  await reset(); id = await contact();
  await referral(id); await phone(id, phoneTime, true, 'outbound'); await phone(id, phoneTime, true, 'inbound', '  ');
  check(await report(), [], 'outbound and blank-phone messages excluded');
  await db.exec('SET ROLE anon');
  await assert.rejects(db.query('SELECT fb_campaign_phone_attribution_capabilities()'), /permission denied/); assertions++;
  await assert.rejects(report(), /permission denied/); assertions++;
  await db.exec('RESET ROLE; SET ROLE authenticated');
  await assert.rejects(report(), /permission denied/); assertions++;
  await db.exec('RESET ROLE; SET ROLE service_role');
  check((await db.query('SELECT fb_campaign_phone_attribution_capabilities() AS value')).rows[0].value.schema_version, 639);
  check(await report(), [], 'service role can execute reporting with base-table grants');

  // Reproduce legacy permissive chat ACL/RLS: verified evidence still requires
  // the trusted server role, including modification/deletion of an existing row.
  await db.exec(`RESET ROLE;
    GRANT SELECT ON facebook_contacts TO anon, authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON facebook_messages TO anon, authenticated, service_role;
    ALTER TABLE facebook_messages ENABLE ROW LEVEL SECURITY;
    CREATE POLICY legacy_chat_all ON facebook_messages FOR ALL USING (true) WITH CHECK (true);`);
  const signedMessage = await phone(id);
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`SET ROLE ${role}`);
    await assert.rejects(phone(id), /verified_messenger_message_write_forbidden/); assertions++;
    await assert.rejects(db.query('UPDATE facebook_messages SET detected_phone=$1 WHERE id=$2',
      ['forged_phone', signedMessage]), /verified_messenger_message_write_forbidden/); assertions++;
    await assert.rejects(db.query('UPDATE facebook_messages SET signature_verified=false WHERE id=$1',
      [signedMessage]), /verified_messenger_message_write_forbidden/); assertions++;
    await assert.rejects(db.query('DELETE FROM facebook_messages WHERE id=$1',
      [signedMessage]), /verified_messenger_message_write_forbidden/); assertions++;
    const unsignedMessage = await phone(id, phoneTime, false);
    check((await db.query('UPDATE facebook_messages SET detected_phone=$1 WHERE id=$2 RETURNING id',
      ['legacy_edit', unsignedMessage])).rows.length, 1, 'legacy unsigned updates remain permitted');
    await assert.rejects(db.query('UPDATE facebook_messages SET signature_verified=true WHERE id=$1',
      [unsignedMessage]), /verified_messenger_message_write_forbidden/); assertions++;
    check((await db.query('DELETE FROM facebook_messages WHERE id=$1 RETURNING id',
      [unsignedMessage])).rows.length, 1, 'legacy unsigned deletion remains permitted');
    await db.exec('RESET ROLE');
  }
  await db.exec('SET ROLE service_role');
  check((await db.query('UPDATE facebook_messages SET detected_phone=$1 WHERE id=$2 RETURNING id',
    ['trusted_repair', signedMessage])).rows.length, 1, 'service role may repair signed evidence');
  const serviceMessage = await phone(id);
  check((await db.query('DELETE FROM facebook_messages WHERE id=$1 RETURNING id',
    [serviceMessage])).rows.length, 1, 'service role may create/delete signed evidence');
  console.log(JSON.stringify({ result: 'PASS', assertions,
    scope: 'isolated PGlite PostgreSQL; production schema and multi-connection concurrency not exercised' }));
} finally {
  await db.close();
}
