'use strict';

// Pure helper and worker tests. All events/identities and DB responses are fake.
// No application bootstrap, network, timers, or actual database connection.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  receiptKey, extractReferral, enqueueMessengerEvents,
  captureMessengerReferral, createMessengerReceiptWorker,
} = require('../src/helpers/facebookMessengerReceipt');

test('receipt identity is stable across object key order, but isolated by Page/event', () => {
  const a = { sender: { id: 'sender' }, message: { mid: 'mid-1', text: 'Synthetic' }, timestamp: 123 };
  const b = { timestamp: 123, message: { text: 'Synthetic', mid: 'mid-1' }, sender: { id: 'sender' } };
  assert.equal(receiptKey('page-1', a), receiptKey('page-1', b));
  assert.notEqual(receiptKey('page-1', a), receiptKey('page-2', a));
  assert.notEqual(receiptKey('page-1', a), receiptKey('page-1', {
    ...a, message: { ...a.message, mid: 'mid-2' },
  }));
  assert.match(receiptKey('page-1', a), /^[a-f0-9]{64}$/);
});

test('referral is accepted from supported locations and keeps only evidence fields', () => {
  const referral = { ad_id: '123456', ref: 'VPT-01', source: 'ADS', type: 'OPEN_THREAD',
    phone: 'synthetic-sensitive', campaign_id: 'unverified', unexpected: { nested: true } };
  for (const carrier of [
    { referral }, { message: { referral } }, { postback: { referral } },
  ]) {
    const actual = extractReferral('page-1', { sender: { id: 'sender' }, ...carrier });
    assert.deepEqual(actual, { ad_id: '123456', ref: 'VPT-01', source: 'ADS', type: 'OPEN_THREAD' });
  }
});

test('echo, outbound and nonreferral content never become inbound ad attribution', () => {
  const referral = { ad_id: '123456', source: 'ADS' };
  const events = [
    { sender: { id: 'sender' }, message: { is_echo: true, referral } },
    { sender: { id: 'page-1' }, referral },
    { sender: { id: 'sender' }, message: { text: 'ad_id=123456 VPT-01' } },
    { sender: { id: 'sender' }, postback: { payload: '{"ad_id":"123456"}' } },
    { sender: { id: 'sender' }, referral: [] },
  ];
  for (const event of events) assert.equal(extractReferral('page-1', event), null);
  assert.equal(extractReferral('page-1', { referral: { ad_id: 'invalid-id' } }), null);
});

test('enqueue stores only opted-in Pages and replay does not create another receipt', async () => {
  const rows = new Map();
  const db = {
    from(table) {
      assert.equal(table, 'facebook_messenger_receipts');
      return {
        async upsert(batch, options) {
          assert.deepEqual(options, { onConflict: 'event_key', ignoreDuplicates: true });
          for (const row of batch) if (!rows.has(row.event_key)) rows.set(row.event_key, row);
          return { data: null, error: null };
        },
      };
    },
  };
  const entries = ['page-1', 'page-other'].map((id) => ({ id,
    messaging: [{ sender: { id: 'sender' }, message: { mid: 'same-mid' } }] }));
  await enqueueMessengerEvents(db, entries, new Set(['page-1']));
  await enqueueMessengerEvents(db, entries, new Set(['page-1']));
  assert.equal(rows.size, 1);
  assert.equal([...rows.values()][0].page_id, 'page-1');
});

test('capture does not call storage for a nonreferral message', async () => {
  const db = { rpc() { throw new Error('Nonreferral must not write attribution'); } };
  const result = await captureMessengerReferral(db, 'page-1', 'contact-1', {
    sender: { id: 'sender' }, message: { mid: 'mid-1', text: 'Synthetic' },
  });
  assert.equal(result, null);
});

test('free-form referral data stays private and only numeric ad evidence reaches attribution', async () => {
  let args;
  const db={ async rpc(name,payload) { assert.equal(name,'facebook_capture_referral_v1'); args=payload; return {data:'synthetic-id',error:null}; } };
  await captureMessengerReferral(db,'page-1','contact-1',{sender:{id:'synthetic-psid'},referral:{ad_id:'123456',ref:'SYNTHETIC_PRIVATE_REF',source:'SYNTHETIC_PRIVATE_SOURCE'},message:{text:'SYNTHETIC_PRIVATE_MESSAGE'}});
  assert.deepEqual(args.p_referral,{ad_id:'123456'});
  assert.match(args.p_event_key,/^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(args).includes('SYNTHETIC_PRIVATE'),false);
  const noStorage={rpc(){throw new Error('ref-only must remain in private receipt');}};
  assert.equal(await captureMessengerReferral(noStorage,'page-1','contact-1',{referral:{ref:'SYNTHETIC_PRIVATE_REF'}}),null);
});

test('worker records failed processing and retries that receipt with a new lease', async () => {
  const row = { id: 'receipt-1', page_id: 'page-1', payload: { message: { mid: 'mid-1' } } };
  const completions = [];
  const errors = [];
  let due = true;
  let status = 'pending';
  let attempts = 0;
  const db = {
    async rpc(name, args) {
      if (name === 'facebook_claim_receipt_v1') {
        assert.deepEqual(args.p_page_ids, ['page-1']);
        if (!due || status === 'done') return { data: [], error: null };
        due = false;
        status = 'leased';
        return { data: [{ ...row }], error: null };
      }
      assert.equal(name, 'facebook_finish_receipt_v1');
      assert.equal(args.p_id, row.id);
      assert.match(args.p_token, /^[a-f0-9-]{36}$/);
      completions.push(args);
      status = args.p_success ? 'done' : 'pending';
      return { data: true, error: null };
    },
  };
  const worker = createMessengerReceiptWorker({
    db,
    pageIds: new Set(['page-1']),
    onError: (code) => errors.push(code),
    async processEvent(pageId, payload) {
      assert.equal(pageId, row.page_id);
      assert.deepEqual(payload, row.payload);
      if (++attempts === 1) {
        const err = new Error('Synthetic downstream failure; do not log payload');
        err.code = 'SYNTHETIC_RETRYABLE';
        throw err;
      }
    },
  });
  await worker.drain();
  assert.equal(status, 'pending', 'Failure is not marked processed');
  assert.equal(attempts, 1);
  assert.deepEqual(completions.map((x) => x.p_success), [false]);
  assert.deepEqual(errors, ['SYNTHETIC_RETRYABLE']);
  // Simulate the database making its backoff deadline eligible; no real delay.
  due = true;
  await worker.drain();
  assert.equal(status, 'done');
  assert.equal(attempts, 2);
  assert.deepEqual(completions.map((x) => x.p_success), [false, true]);
  assert.notEqual(completions[0].p_token, completions[1].p_token);
  await worker.drain();
  assert.equal(attempts, 2, 'A completed receipt is not processed again');
});

test('worker reports a lost lease when finish returns false without a database error', async () => {
  let claimed = false;
  let processCount = 0;
  const errors = [];
  const finishes = [];
  const db = {
    async rpc(name, args) {
      if (name === 'facebook_claim_receipt_v1') {
        if (claimed) return { data: [], error: null };
        claimed = true;
        return { data: [{ id: 'receipt-lost-lease', page_id: 'page-1', payload: {} }], error: null };
      }
      assert.equal(name, 'facebook_finish_receipt_v1');
      finishes.push(args);
      // The lease token no longer owns the row, even though the RPC succeeded.
      return { data: false, error: null };
    },
  };
  const worker = createMessengerReceiptWorker({
    db, pageIds: new Set(['page-1']),
    processEvent: async () => { processCount++; },
    onError: (code) => errors.push(code),
  });
  await worker.drain();
  assert.equal(processCount, 1);
  assert.deepEqual(errors, ['FB_DURABLE_LEASE_LOST']);
  assert.deepEqual(finishes.map((x) => x.p_success), [true, false]);
  assert.equal(finishes[0].p_token, finishes[1].p_token,
    'Failure handling must not use a different worker lease');
});
