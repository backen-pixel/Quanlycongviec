'use strict';

/*
 * Recovery requirements for the opt-in durable Messenger path.
 * No server import, network, database, or real timers.
 * Run: node --test backend/tests/facebookWebhookRecovery.test.js
 * Optional: FB_WEBHOOK_SOURCE_PATH=/absolute/path/facebook.js node --test ...
 * Set override to ../../../current/backend/src/routes/facebook.js (absolute)
 * to reproduce baseline failures. FB_WEBHOOK_EXPECT_BASELINE=1 also checks pin.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { enqueueMessengerEvents } = require('../src/helpers/facebookMessengerReceipt');

const sourcePath = process.env.FB_WEBHOOK_SOURCE_PATH || path.resolve(
  __dirname, '../src/routes/facebook.js',
);
const source = fs.readFileSync(sourcePath, 'utf8');
if (process.env.FB_WEBHOOK_EXPECT_BASELINE === '1') {
  // The local transfer normalized CRLF and added a trailing newline. Restore
  // only line endings/trailing newlines to compare the original Git blob ID.
  const pinnedBytes = source.replace(/\r\n/g, '\n').replace(/[\r\n]+$/, '')
    .replace(/\n/g, '\r\n') + '\r\n';
  const blob = crypto.createHash('sha1')
    .update(`blob ${Buffer.byteLength(pinnedBytes)}\0`).update(pinnedBytes).digest('hex');
  assert.equal(blob, '1faea303380c6cec2a68b3f2cb3dd0ffb9b11e78',
    'Default source must match facebook.js at 413e8f575b5b611b25a50980564d754b7bfcf211');
}

// Extract original top-level function text, without evaluating module startup.
// A function body ends at its first unindented closing brace in this source.
// Fail loudly when source structure changes; never substitute an implementation.
function functionText(name) {
  const pattern = new RegExp(`^(?:async )?function ${name}\\(`, 'm');
  const match = pattern.exec(source);
  assert.ok(match, `Missing source function: ${name}`);
  const end = source.indexOf('\n}', match.index);
  assert.notEqual(end, -1, `Missing end of source function: ${name}`);
  return source.slice(match.index, end + 2);
}

function webhookRouteText() {
  const start = source.indexOf("r.post('/webhook',");
  assert.notEqual(start, -1, 'Missing actual POST /webhook route');
  const end = source.indexOf('\n});', start);
  assert.notEqual(end, -1, 'Missing end of actual POST /webhook route');
  return source.slice(start, end + 4);
}

const quietConsole = { log() {}, warn() {}, error() {} };

function webhookHarness({ enqueueError = null } = {}) {
  let releaseWrite;
  const durableGate = new Promise((resolve) => { releaseWrite = resolve; });
  const state = { committed: false, statuses: [], drains: 0, legacyMessages: 0 };
  let handler;
  const context = vm.createContext({
    console: quietConsole,
    FB_DISABLE_WEBHOOK_LOGS: true,
    DURABLE_MESSENGER_PAGES: new Set(['synthetic-page']),
    enqueueMessengerEvents,
    messengerReceiptWorker: { drain() { state.drains++; return Promise.resolve(); } },
    // This older recovery fixture has no care/intake-enrolled Pages.
    facebookCustomerCare: { receive: async () => {}, legacyBody: body => body },
    facebookLeadIntake: { receive: async () => {}, drain: async () => {} },
    r: { post(route, fn) { assert.equal(route, '/webhook'); handler = fn; } },
    supabase: {
      from(table) {
        assert.equal(table, 'facebook_messenger_receipts');
        return {
          async upsert(rows, options) {
            assert.equal(rows.length, 1);
            assert.equal(rows[0].page_id, 'synthetic-page');
            assert.equal(options.ignoreDuplicates, true);
            await durableGate;
            if (enqueueError) return { data: null, error: enqueueError };
            state.committed = true;
            return { data: { id: 'synthetic-receipt' }, error: null };
          },
        };
      },
    },
    handleMessaging: async () => { state.legacyMessages++; },
    handleLeadGen: async () => {},
    handleComment: async () => {},
  });
  vm.runInContext(webhookRouteText(), context, { filename: sourcePath });
  return {
    state,
    releaseWrite,
    receive: () => handler({ body: { object: 'page', entry: [{ id: 'synthetic-page',
      messaging: [{ sender: { id: 'synthetic-sender' }, message: { mid: 'synthetic-mid', text: 'Synthetic' } }],
    }] } }, {
      sendStatus(status) { state.statuses.push({ status, committed: state.committed }); },
    }),
  };
}

test('success ACK waits for durable acceptance of the webhook', async () => {
  const h = webhookHarness();
  const run = h.receive();
  // Inspect the result after completion as well as at the actual ACK instant.
  // Always release our fake write before asserting, so no pending test remains.
  h.releaseWrite();
  await run;
  const successes = h.state.statuses.filter(({ status }) => status >= 200 && status < 300);
  assert.ok(successes.length > 0, 'Accepted webhook must receive a success ACK');
  assert.ok(successes.every((ack) => ack.committed),
    'Webhook acknowledged success before any durable receipt completed');
  assert.equal(h.state.drains, 1);
  assert.equal(h.state.legacyMessages, 0, 'Durable event must not also run through legacy path');
});

test('enqueue failure responds 503 and starts neither worker nor legacy processing', async () => {
  const h = webhookHarness({ enqueueError: { code: 'SYNTHETIC_WRITE_FAILURE' } });
  const run = h.receive();
  h.releaseWrite();
  await run;
  assert.deepEqual(h.state.statuses.map(({ status }) => status), [503]);
  assert.equal(h.state.committed, false);
  assert.equal(h.state.drains, 0);
  assert.equal(h.state.legacyMessages, 0);
});

function messengerHarness({ failFirstLead = false, phone = null, validPhone = true,
  blockedPhone = false, failMessageLinks = 0 } = {}) {
  const state = {
    contact: { id: 'synthetic-contact', page_id: 'synthetic-page', psid: 'synthetic-sender',
      fb_name: 'Synthetic Customer', lead_id: null, unread_count: 0 },
    messages: new Map(),
    leadAttempts: 0,
    leadCount: 0,
    timerCallbacks: [],
    captures: 0,
    attributionLinks: 0,
    messageLinkFailuresLeft: failMessageLinks,
    messageLinkWrites: 0,
  };

  function query(table) {
    let action = 'select';
    let payload;
    const filters = [];
    const q = {
      select() { return q; },
      eq(key, value) { filters.push((row) => row[key] === value); return q; },
      is(key, value) { filters.push((row) => row[key] === value); return q; },
      not(key, op, value) {
        assert.equal(op, 'is'); assert.equal(value, null);
        filters.push((row) => row[key] != null); return q;
      },
      limit() { return q; },
      order() { return q; },
      update(value) { action = 'update'; payload = value; return q; },
      upsert(value, options) {
        assert.equal(table, 'facebook_messages');
        assert.equal(options.onConflict, 'fb_message_id');
        assert.equal(options.ignoreDuplicates, true);
        action = 'upsert'; payload = value; return q;
      },
      single() { return execute(true); },
      maybeSingle() { return execute(true); },
      then(resolve, reject) { return execute(false).then(resolve, reject); },
    };
    async function execute(single) {
      if (table === 'facebook_messages' && action === 'update' && payload.lead_id) {
        state.messageLinkWrites++;
        if (state.messageLinkFailuresLeft > 0) {
          state.messageLinkFailuresLeft--;
          return { data: null, error: { code: 'SYNTHETIC_LINK_FAILURE' } };
        }
      }
      if (table === 'facebook_messages' && action === 'upsert') {
        if (state.messages.has(payload.fb_message_id)) {
          return { data: null, error: { code: 'PGRST116', message: 'No row returned' } };
        }
        const saved = { id: `message-${state.messages.size + 1}`, ...payload };
        state.messages.set(payload.fb_message_id, saved);
        return { data: { ...saved }, error: null };
      }
      let rows;
      if (table === 'facebook_messages') rows = [...state.messages.values()];
      else if (table === 'facebook_contacts') rows = [state.contact];
      else if (table === 'crm_leads') rows = state.leadCount
        ? [{ id: 'synthetic-lead', customer_id: null }] : [];
      else throw new Error(`Unexpected table in isolated test: ${table}`);
      rows = rows.filter((row) => filters.every((filter) => filter(row)));
      if (action === 'update') rows.forEach((row) => Object.assign(row, payload));
      return { data: single ? (rows[0] ? { ...rows[0] } : null) : rows.map((row) => ({ ...row })),
        error: null, count: rows.length };
    }
    return q;
  }

  const context = vm.createContext({
    console: quietConsole,
    FB_DISABLE_WEBHOOK_LOGS: true,
    setTimeout(fn) { state.timerCallbacks.push(fn); return state.timerCallbacks.length; },
    supabase: { from: query },
    // This harness models an unmanaged Page; managed/error cases have separate coverage.
    legacyFacebookPageMayWrite: async () => true,
    facebookCustomerCare: { isEnrolled: () => false },
    captureMessengerReferral: async () => { state.captures++; },
    linkMessengerAttribution: async () => { state.attributionLinks++; },
    getOrCreateContact: async () => ({ ...state.contact }),
    isPlaceholderFacebookName: () => false,
    tryResolveMessengerDisplayName: () => { throw new Error('Unexpected profile lookup'); },
    loadAutoLeadConfig: async () => ({ trigger: 'first_message', recreate_deleted_leads: true,
      auto_reply_first_message: false, auto_update_phone: false, auto_update_address: false }),
    fetchContactLeadId: async () => state.contact.lead_id,
    extractContactInfo: () => ({ phone, address: null }),
    normalizePhoneForLeadCreation: () => ({ ok: validPhone, normalized: phone }),
    isPhoneBlockedForFacebookAutoLead: async () => blockedPhone,
    async createLeadFromFacebook() {
      state.leadAttempts++;
      if (failFirstLead && state.leadAttempts === 1) return null;
      // Model a successful create+link dependency, with no external I/O.
      if (!state.leadCount) state.leadCount++;
      state.contact.lead_id = 'synthetic-lead';
      return { id: 'synthetic-lead', code: 'SYNTHETIC-001' };
    },
  });
  const functions = ['acquireMidLock', 'supabaseErrMsg', 'isDuplicateKeyError',
    'isSupabaseUnavailableError', 'withAsyncLock', 'messengerPartnerPsid',
    'handleMessaging', 'handleMessagingInner'];
  vm.runInContext('const _processingMids = new Set(); const _asyncLockTails = new Map();\n'
    + functions.map(functionText).join('\n')
    + '\nthis.runMessage = handleMessaging;', context, { filename: sourcePath });
  const event = { sender: { id: 'synthetic-sender' }, recipient: { id: 'synthetic-page' },
    message: { mid: 'synthetic-mid', text: 'Synthetic enquiry' } };
  return {
    state,
    receive: () => context.runMessage('synthetic-page', event, null, true),
    expireMidCache: () => { state.timerCallbacks.splice(0).forEach((fn) => fn()); },
  };
}

test('terminal invalid or blocked phone skips Lead creation without making receipt retry forever', async () => {
  for (const options of [
    { phone: 'synthetic-invalid-phone', validPhone: false },
    { phone: 'synthetic-blocked-phone', blockedPhone: true },
  ]) {
    const h = messengerHarness(options);
    await h.receive();
    await h.receive();
    assert.equal(h.state.messages.size, 1);
    assert.equal(h.state.leadCount, 0);
    assert.equal(h.state.leadAttempts, 0, 'Business skip must precede Lead creation');
    assert.equal(h.state.attributionLinks, 2, 'Both processing attempts completed normally');
    assert.equal(h.state.contact.unread_count, 1);
  }
});

test('failed message-to-Lead linking is retried after the Lead already exists', async () => {
  // Fail the direct write and the final checked repair on the first delivery.
  const h = messengerHarness({ failMessageLinks: 2 });
  await assert.rejects(h.receive(), /FB_DURABLE_MESSAGE_LINK_FAILED/);
  assert.equal(h.state.contact.lead_id, 'synthetic-lead');
  assert.equal(h.state.messages.get('synthetic-mid').lead_id, null);
  assert.equal(h.state.attributionLinks, 0, 'No success beyond failed message linking');
  await h.receive();
  assert.equal(h.state.leadCount, 1);
  assert.equal(h.state.leadAttempts, 1, 'Repair must reuse the committed Lead');
  assert.equal(h.state.messages.size, 1);
  assert.equal(h.state.messages.get('synthetic-mid').lead_id, 'synthetic-lead');
  assert.equal(h.state.attributionLinks, 1);
  assert.equal(h.state.contact.unread_count, 1);
});

test('control: healthy message creates and links exactly one Lead', async () => {
  const h = messengerHarness();
  await h.receive();
  assert.equal(h.state.messages.size, 1);
  assert.equal(h.state.leadCount, 1);
  assert.equal(h.state.contact.lead_id, 'synthetic-lead');
  assert.equal(h.state.messages.get('synthetic-mid').lead_id, 'synthetic-lead');
});

for (const expireMidCache of [false, true]) {
  test(`replay completes failed Lead creation ${expireMidCache ? 'after cache expiry (DB duplicate)' : 'during mid cache lifetime'}`, async () => {
    const h = messengerHarness({ failFirstLead: true });
    try { await h.receive(); } catch (err) {
      assert.match(err.message, /FB_DURABLE_LEAD_NOT_COMPLETED/);
    }
    assert.equal(h.state.messages.size, 1, 'The inbound message was durably saved');
    assert.equal(h.state.leadCount, 0, 'The first downstream operation failed');
    if (expireMidCache) h.expireMidCache();
    await h.receive();
    assert.equal(h.state.messages.size, 1, 'Replay must not create another message');
    assert.equal(h.state.leadCount, 1,
      'Replay of a saved message must complete its failed Lead creation');
    assert.equal(h.state.leadAttempts, 2, 'Exactly one retry is required');
    assert.equal(h.state.contact.lead_id, 'synthetic-lead');
    assert.equal(h.state.messages.get('synthetic-mid').lead_id, 'synthetic-lead');
    assert.equal(h.state.contact.unread_count, 1, 'Replay must not increment unread count');
    assert.equal(h.state.attributionLinks, 1, 'Attribution links after recovered processing');
  });
}
