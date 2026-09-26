const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { durableMessengerPageIds, receiptForEvent, persistMessengerReceipts,
  createMessengerReceiptWorker, messengerReceiptHealth } = require('../src/helpers/facebookMessengerReceipts');
const { saveMessengerAdAttribution, messengerEventOccurredAt } = require('../src/helpers/facebookMessengerCampaignAttribution');
const { verifyFacebookWebhookSignature } = require('../src/helpers/facebookWebhookSignature');
const { extractContactInfo } = require('../src/helpers/facebookPhoneExtract');

const env = { FB_MESSENGER_DURABLE_DELIVERY: '1', FB_MESSENGER_DURABLE_PAGE_IDS: '123', FB_APP_SECRET: 'test-only-secret' };
const event = { sender: { id: '456' }, recipient: { id: '123' }, timestamp: 1790260200000,
  message: { mid: 'synthetic-mid', text: 'Số kiểm thử 0900000000' } };
const body = { object: 'page', entry: [{ id: '123', messaging: [event, event] }] };
const silent = { log() {}, warn() {}, error() {} };

async function testIngress() {
  assert.deepEqual(durableMessengerPageIds({ FB_MESSENGER_DURABLE_DELIVERY: '1' }), []);
  assert.deepEqual(durableMessengerPageIds({ ...env, FB_MESSENGER_DURABLE_DELIVERY: '0' }), []);
  assert.deepEqual(durableMessengerPageIds({ ...env, FB_MESSENGER_DURABLE_PAGE_IDS: '123,*,123,456' }), ['123', '456']);
  assert.equal(receiptForEvent('123', event).receipt_key, receiptForEvent('123', {
    message: event.message, timestamp: event.timestamp, recipient: event.recipient, sender: event.sender,
  }).receipt_key, 'JSON key order does not create a second receipt');
  let writes = 0;
  const db = { from(table) { assert.equal(table, 'facebook_messenger_webhook_receipts'); return {
    async upsert(rows, options) { writes += 1; assert.equal(rows.length, 1); assert(options.ignoreDuplicates); return { error: null }; },
  }; } };
  await assert.rejects(persistMessengerReceipts({ supabase: db, body, pageIds: ['123'], signatureValid: false }), /valid_signature/);
  assert.equal(writes, 0, 'unsigned requests must never touch the durable queue');
  const rawBody = Buffer.from(JSON.stringify(body));
  const signature = `sha256=${crypto.createHmac('sha256', env.FB_APP_SECRET).update(rawBody).digest('hex')}`;
  assert(verifyFacebookWebhookSignature({ rawBody, signature, env }).valid);
  assert(!verifyFacebookWebhookSignature({ rawBody: Buffer.from('{}'), signature, env }).valid);
  assert.equal(await persistMessengerReceipts({ supabase: db, body, pageIds: ['999'], signatureValid: true }), 0);
  assert.equal(writes, 0, 'unconfigured Pages are not ingested');
  assert.equal(await persistMessengerReceipts({ supabase: db, body, pageIds: ['123'], signatureValid: true }), 1);
  await assert.rejects(persistMessengerReceipts({
    supabase: { from: () => ({ upsert: async () => ({ error: { message: 'database unavailable' } }) }) },
    body, pageIds: ['123'], signatureValid: true,
  }), /persist_failed/, 'the HTTP route must return non-2xx when persistence fails');
}

async function testActualWebhookAckOrder() {
  const route = fs.readFileSync(path.join(__dirname, '../src/routes/facebook.js'), 'utf8');
  const start = route.indexOf("r.post('/webhook', async (req, res) => {");
  const end = route.indexOf('// ── HANDLE MESSENGER', start);
  let handler;
  const order = [];
  let fail = false;
  const rawBody = Buffer.from(JSON.stringify(body));
  const signature = `sha256=${crypto.createHmac('sha256', env.FB_APP_SECRET).update(rawBody).digest('hex')}`;
  const ctx = vm.createContext({ console: silent,
    r: { post: (_path, fn) => { handler = fn; } },
    verifyFacebookWebhookSignature: (args) => verifyFacebookWebhookSignature({ ...args, env }),
    durableMessengerPageIds: () => ['123'], persistMessengerReceipts,
    FB_DISABLE_WEBHOOK_LOGS: true, hasWarnedFacebookWebhookSignatureNotConfigured: false,
    supabase: { from: () => ({ upsert: async () => {
      order.push('persist'); return { error: fail ? { code: '08006' } : null };
    } }) },
    handleMessaging: async () => { throw new Error('durable event must be handled by worker only'); },
  });
  vm.runInContext(route.slice(start, end), ctx);
  const req = { body, rawBodyBuffer: rawBody, get: () => signature };
  const res = { sendStatus(code) { order.push(code); return res; } };
  fail = true;
  await handler(req, res);
  assert.deepEqual(order, ['persist', 503], 'DB failure is returned to Meta without ACK 200');
  fail = false; order.length = 0;
  await handler(req, res);
  assert.deepEqual(order, ['persist', 200], 'HTTP 200 follows successful persisted receipt');
  order.length = 0;
  await handler({ ...req, get: () => 'sha256=invalid' }, res);
  assert.deepEqual(order, [401]);
}

async function testWorker() {
  let attempts = 0;
  const queue = [{ ...receiptForEvent('123', event), lease_token: 'lease-a' }];
  const calls = [];
  const db = { async rpc(name, args) {
    calls.push(name);
    if (name.endsWith('_claim')) {
      assert.deepEqual(args.p_page_ids, ['123']);
      return { data: queue.length ? [queue.shift()] : [], error: null };
    }
    return { data: true, error: null };
  } };
  const worker = createMessengerReceiptWorker({ supabase: db, env, logger: silent,
    processEvent: async () => { attempts += 1; throw new Error('private phone/text must not enter errors'); },
  });
  await worker.tick();
  assert.equal(attempts, 1);
  assert(calls.includes('facebook_messenger_receipts_fail'));
  assert(!calls.includes('facebook_messenger_receipts_finish'));
  // Simulate DB reclaim after process restart; no process-local queue is required.
  queue.push({ ...receiptForEvent('123', event), lease_token: 'lease-b' });
  calls.length = 0;
  const restarted = createMessengerReceiptWorker({ supabase: db, env, logger: silent,
    processEvent: async (_page, actual, options) => { assert.deepEqual(actual, event); assert(options.durable); },
  });
  await restarted.tick();
  assert(calls.includes('facebook_messenger_receipts_finish'));
  assert(!calls.includes('facebook_messenger_receipts_fail'));
  const missingSecret = createMessengerReceiptWorker({ supabase: db, env: { ...env, FB_APP_SECRET: '' }, logger: silent,
    processEvent: async () => { throw new Error('must not run'); },
  });
  calls.length = 0;
  await missingSecret.tick();
  assert.equal(calls.length, 0);
  const healthDb = { rpc: async () => ({ data: [{ pending_count: 1, processing_count: 0, dead_count: 0 }], error: null }) };
  assert.equal((await messengerReceiptHealth({ supabase: healthDb, env, pageIds: ['123'] })).ready, false);
  assert.equal((await messengerReceiptHealth({ supabase: healthDb, env, pageIds: ['999'] })).ready, false);
}

async function testHealthFailsClosed() {
  const empty = { pending_count: 0, processing_count: 0, dead_count: 0 };
  let healthRow = empty;
  let calls = 0;
  const db = { rpc: async (_name, args) => {
    calls += 1;
    assert.deepEqual(args.p_page_ids, ['123']);
    return { data: healthRow === undefined ? [] : [healthRow], error: null };
  } };
  const read = () => messengerReceiptHealth({ supabase: db, env, pageIds: ['123', '123'] });
  assert.equal((await read()).ready, true, 'zero counts are valid queue health');
  healthRow = { pending_count: '0', processing_count: '0', dead_count: '0' };
  assert.equal((await read()).ready, true, 'decimal bigint strings are valid counts');
  for (const key of Object.keys(empty)) {
    healthRow = { ...empty, [key]: 1 };
    assert.equal((await read()).reason, 'webhook_receipts_unprocessed', `${key} blocks readiness`);
    for (const invalid of [undefined, null, '', ' ', false, true, -1, 0.5, NaN, Infinity, 'invalid']) {
      healthRow = { ...empty, [key]: invalid };
      const result = await read();
      assert.equal(result.ready, false, 'malformed health must never enable automation');
      assert.equal(result.reason, 'webhook_receipt_health_unknown');
    }
  }
  healthRow = undefined;
  assert.equal((await read()).reason, 'webhook_receipt_health_unknown');
  const before = calls;
  for (const pages of [[], ['999'], ['123', '999']]) {
    const result = await messengerReceiptHealth({ supabase: db, env, pageIds: pages });
    assert.equal(result.reason, 'webhook_delivery_not_durable');
  }
  assert.equal(calls, before, 'empty or unauthorized Page scopes do not query health');
  await assert.rejects(messengerReceiptHealth({
    supabase: { rpc: async () => ({ error: { code: '08006' } }) }, env, pageIds: ['123'],
  }), /health_failed/, 'DB failure must not become zero pending receipts');
}

async function testActualHandlerRetry() {
  const route = fs.readFileSync(path.join(__dirname, '../src/routes/facebook.js'), 'utf8');
  const start = route.indexOf('async function handleMessagingInner(');
  const end = route.indexOf('// ── HANDLE LEAD ADS', start);
  const original = { id: 'message-db-id', contact_id: 'contact-1', detected_phone: null, facebook_occurred_at: null };
  let stored = { ...original };
  let attemptedMessage;
  let unreadWrites = 0;
  let failInsert = false;
  const db = { from(table) {
    let action = 'read'; let patch;
    const q = {
      select() { return q; }, eq() { return q; }, not() { return q; }, limit() { return q; },
      upsert(value) { action = 'insert'; patch = value; if (table === 'facebook_messages') attemptedMessage = value; return q; },
      update(value) { action = 'update'; patch = value; return q; },
      maybeSingle: async () => action === 'insert'
        ? { data: null, error: failInsert ? { code: '08006' } : null }
        : { data: table === 'facebook_contacts' ? { lead_id: 'existing-lead' } : { ...stored }, error: null },
      single: async () => ({ data: { lead_id: null }, error: null }),
      then(resolve, reject) {
        if (table === 'facebook_messages' && action === 'update') stored = { ...stored, ...patch };
        if (table === 'facebook_contacts' && patch?.unread_count) unreadWrites += 1;
        return Promise.resolve({ data: [], error: null }).then(resolve, reject);
      },
    };
    return q;
  } };
  const ctx = vm.createContext({ console: silent, supabase: db,
    getOrCreateContact: async () => ({ id: 'contact-1', fb_name: 'Synthetic test', lead_id: null }),
    isPlaceholderFacebookName: () => false, saveMessengerAdAttribution: async () => null,
    FB_DISABLE_WEBHOOK_LOGS: true, extractContactInfo,
    messengerEventOccurredAt,
    isDuplicateKeyError: (e) => e?.code === '23505',
    loadAutoLeadConfig: async () => ({ trigger: 'manual', auto_update_phone: false, auto_update_address: false }),
    fetchContactLeadId: async () => null, _phoneDigitsLen: () => 0,
  });
  vm.runInContext(`${route.slice(start, end)}; this.handle = handleMessagingInner;`, ctx);
  failInsert = true;
  await assert.rejects(ctx.handle('123', event, null, '456', { durable: true }), /messenger_message_write_failed/);
  failInsert = false;
  await ctx.handle('123', event, null, '456', { durable: true });
  assert.equal(stored.detected_phone, '0900000000', 'duplicate message retry repairs phone lost after old partial insert');
  assert.equal(stored.facebook_occurred_at, new Date(event.timestamp).toISOString());
  assert.equal(stored.signature_verified, true, 'signed duplicate recovery upgrades legacy unverified evidence');
  assert.equal(attemptedMessage.signature_verified, true, 'new durable message write includes signed evidence');
  assert.equal(attemptedMessage.detected_phone, '0900000000');
  assert.equal(attemptedMessage.facebook_occurred_at, new Date(event.timestamp).toISOString());
  stored.facebook_occurred_at = null;
  await ctx.handle('123', event, null, '456', { durable: true });
  assert.equal(stored.facebook_occurred_at, new Date(event.timestamp).toISOString(), 'matching phone still repairs missing event time');
  assert.equal(stored.lead_id, 'existing-lead', 'replay repairs message link from already-linked contact');
  stored.signature_verified = false;
  await ctx.handle('123', event, null, '456', { durable: true });
  assert.equal(stored.signature_verified, true, 'matching phone and time still require verified signature recovery');
  stored.detected_phone = null;
  stored.facebook_occurred_at = null;
  stored.signature_verified = false;
  const textOnlyEvent = { ...event, message: { ...event.message, text: 'Xin chào' } };
  await ctx.handle('123', textOnlyEvent, null, '456', { durable: true });
  assert.equal(stored.detected_phone, null, 'message without a phone remains a non-phone event');
  assert.equal(stored.facebook_occurred_at, new Date(event.timestamp).toISOString(), 'timestamp-only replay repairs event time');
  assert.equal(stored.signature_verified, true, 'timestamp-only replay retains verified signature evidence');
  await assert.rejects(ctx.handle('123', { ...event, message: { text: 'No message ID' } }, null, '456', { durable: true }), /message_id_missing/);
  assert.equal(unreadWrites, 0, 'replay does not increment unread count again');
  for (const timestamp of [undefined, null, true, 0, Number.MAX_SAFE_INTEGER, 'invalid']) {
    await assert.rejects(ctx.handle('123', { ...event, timestamp }, null, '456', { durable: true }), /timestamp_invalid/);
  }
  const failingMapping = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({
    maybeSingle: async () => ({ error: { code: '08006' } }),
  }) }) }) }) };
  await assert.rejects(saveMessengerAdAttribution({ supabase: failingMapping, pageId: '123', contactId: 'c',
    event: { ...event, referral: { ad_id: 'ad-test' } }, strict: true }), /mapping_read_failed/);
}

(async () => {
  await testIngress();
  await testActualWebhookAckOrder();
  await testWorker();
  await testHealthFailsClosed();
  await testActualHandlerRetry();
  console.log('facebook-messenger-receipts: ok (signature, persistence, retry, restart, Page scope, phone recovery)');
})().catch((error) => { console.error(error); process.exitCode = 1; });
