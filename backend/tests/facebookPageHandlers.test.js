'use strict';

// Execute the actual route functions without importing its server/cron startup.
// All storage, provider responses and outbound sends below are synthetic.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const phone = require('../src/helpers/facebookPhoneExtract');
const routePath = path.resolve(__dirname, '../src/routes/facebook.js');
const source = fs.readFileSync(routePath, 'utf8');

function functionText(name) {
  const match = new RegExp(`^(?:async )?function ${name}\\(`, 'm').exec(source);
  assert.ok(match, `Missing actual route function ${name}`);
  const end = source.indexOf('\n}', match.index);
  assert.notEqual(end, -1);
  return source.slice(match.index, end + 2);
}

const quiet = { log() {}, warn() {}, error() {} };
const defaults = { trigger: 'first_message', recreate_deleted_leads: false,
  auto_update_phone: false, auto_update_address: false, auto_reply_first_message: true };
const event = () => ({ sender: { id: 'sender-1', name: 'Synthetic' }, recipient: { id: 'page-1' },
  message: { mid: 'message-1', text: 'Synthetic enquiry' } });
const adEvent = () => ({ leadgen_id: 'ad-1', form_id: 'form-1' });
const commentEvent = () => ({ comment_id: 'comment-1', post_id: 'post-1', verb: 'add',
  from: { id: 'sender-1', name: 'Synthetic' }, message: 'Synthetic comment' });

function harness({ config = {}, contact = {}, linked = false, formData, graph } = {}) {
  const state = {
    tables: {
      facebook_pages: [{ id: 'page-config', page_id: 'page-1', is_active: true,
        default_company_id: 'company-1', access_token: 'SYNTHETIC_TOKEN', auto_reply_message: 'Synthetic reply' }],
      facebook_contacts: [{ id: 'contact-1', page_id: 'page-1', psid: 'sender-1',
        fb_name: 'Synthetic', lead_id: linked ? 'lead-1' : null, unread_count: 0, ...contact }],
      facebook_messages: [], facebook_lead_ads: [], facebook_comments: [],
      fb_lead_form_mapping: [], crm_auto_lead_blocked_phones: [], fb_message_reactions: [],
      app_settings: [{ key: 'auto_lead_config', value: { ...defaults, ...config } }],
      crm_leads: linked ? [{ id: 'lead-1', company_id: 'company-1', customer_id: null }] : [],
      customers: [],
    },
    calls: [], failures: [], graphCalls: 0, graphUrls: [], creates: 0, replies: 0, logs: [],
    legacyAttribution: 0, captures: 0, links: 0,
  };
  const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
  function from(table) {
    assert.ok(Object.hasOwn(state.tables, table), `Unexpected table: ${table}`);
    let action = 'select'; let payload; let columns; let options = {}; const filters = [];
    let conflict;
    const q = {
      select(value, opts) { columns = value; options = opts || {}; return q; },
      eq(key, value) { filters.push((row) => row[key] === value); return q; },
      is(key, value) { filters.push((row) => (row[key] ?? null) === value); return q; },
      not(key, op, value) { assert.equal(op, 'is'); assert.equal(value, null); filters.push((row) => row[key] != null); return q; },
      order() { return q; }, limit() { return q; },
      insert(value) { action = 'insert'; payload = value; return q; },
      update(value) { action = 'update'; payload = value; return q; },
      upsert(value, opts) { action = 'upsert'; payload = value; conflict = opts?.onConflict; return q; },
      single() { return execute(true); }, maybeSingle() { return execute(true); },
      then(resolve, reject) { return execute(false).then(resolve, reject); },
    };
    async function execute(single) {
      const call = { table, action, columns, payload: clone(payload), options };
      state.calls.push(call);
      const failure = state.failures.find((item) => item.times !== 0
        && item.table === table && (!item.action || item.action === action)
        && (!item.columns || item.columns === columns));
      if (failure && !failure.afterCommit) {
        failure.times = (failure.times ?? 1) - 1;
        if (failure.run) return failure.run(call, state);
        return { data: null, error: { code: failure.code || 'SYNTHETIC_DB_FAILURE' } };
      }
      let rows = state.tables[table].filter((row) => filters.every((filter) => filter(row)));
      if (action === 'insert' || action === 'upsert') {
        const key = conflict || ({ facebook_contacts: 'psid', facebook_lead_ads: 'leadgen_id',
          facebook_comments: 'comment_id' })[table];
        const duplicate = key && state.tables[table].find((row) => key.split(',').every((k) => row[k] === payload[k])
          && (table !== 'facebook_contacts' || row.page_id === payload.page_id));
        if (duplicate) return { data: null, error: action === 'upsert' && !single
          ? null : { code: action === 'upsert' ? 'PGRST116' : '23505' } };
        const inserted = { id: `${table}-${state.tables[table].length + 1}`, lead_id: null, ...clone(payload) };
        state.tables[table].push(inserted); rows = [inserted];
      } else if (action === 'update') rows.forEach((row) => Object.assign(row, clone(payload)));
      if (failure) {
        failure.times = (failure.times ?? 1) - 1;
        return { data: null, error: { code: failure.code || 'SYNTHETIC_AMBIGUOUS_COMMIT' } };
      }
      return { data: options.head ? null : clone(single ? rows[0] || null : rows), error: null,
        ...(options.count ? { count: rows.length } : {}) };
    }
    return q;
  }
  const db = { from };
  const formModule = { exports: {} };
  // Exercise the real mapping reader and parser. Phone algorithm itself has its
  // own tests; only its two pure digit adapters are substituted here.
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/helpers/fbLeadFormFields.js'), 'utf8'), {
    module: formModule, console: quiet,
    require(name) {
      if (name === '../config/supabase') return { supabase: db };
      if (name === './phoneCrmLink') return { digitsOnly: (x) => String(x).replace(/\D/g, ''),
        normalizeVnMobileDigits: (x) => /^0\d{9}$/.test(x) ? x : null };
      throw new Error(`Unstubbed form dependency: ${name}`);
    },
  });
  const context = vm.createContext({
    console: Object.fromEntries(['log', 'warn', 'error'].map((method) => [method, (...args) => state.logs.push(args)])),
    supabase: db, AUTO_LEAD_DEFAULTS: defaults, FB_DISABLE_WEBHOOK_LOGS: true,
    process: { env: { VPT_META_GRAPH_VERSION: 'v99.7' } },
    setTimeout() { return 1; }, ...phone, // legacy MID expiry timer is synthetic
    _phoneDigitsLen: (value) => String(value || '').replace(/\D/g, '').length,
    async fetch(url, options) {
      state.graphCalls++; state.graphUrls.push(url); assert.ok(!url.includes('SYNTHETIC_TOKEN'));
      assert.equal(options.headers.Authorization, 'Bearer SYNTHETIC_TOKEN');
      if (graph?.throws) throw new Error('SYNTHETIC_PROVIDER_FAILURE');
      return { ok: graph?.ok ?? true, async json() {
        if (graph?.badJson) throw new Error('SYNTHETIC_BAD_JSON');
        return graph?.body ?? { field_data: formData || [{ name: 'full_name', values: ['Synthetic'] }] };
      } };
    },
    require(name) {
      if (name === '../helpers/fbLeadFormFields') return formModule.exports;
      throw new Error(`Unexpected route dependency: ${name}`);
    },
    async captureMessengerReferral() { state.captures++; },
    async linkMessengerAttribution() { state.links++; },
    async quyKetMessenger() { state.legacyAttribution++; },
    async getOrCreateContact() { return clone(state.tables.facebook_contacts[0]); },
    isPlaceholderFacebookName: () => false,
    tryResolveMessengerDisplayName() { throw new Error('Unexpected profile lookup'); },
    async loadAutoLeadConfig() { return state.tables.app_settings[0].value; },
    async fetchContactLeadId() { return state.tables.facebook_contacts[0].lead_id; },
    async getPageConfig() { return state.tables.facebook_pages[0]; },
    async isPhoneBlockedForFacebookAutoLead() { return false; },
    async createLeadFromFacebook() {
      state.creates++; state.tables.facebook_contacts[0].lead_id = 'lead-1';
      const lead = { id: 'lead-1', company_id: 'company-1', customer_id: null };
      state.tables.crm_leads = [lead]; return lead;
    },
    async sendMessengerReply() { state.replies++; },
  });
  const functions = ['acquireMidLock', 'supabaseErrMsg', 'isDuplicateKeyError',
    'isSupabaseUnavailableError', 'withAsyncLock', 'messengerPartnerPsid',
    'requireFacebookResult', 'getDurableFacebookContact', 'getDurableFacebookPage',
    'getDurableFacebookLeadId', 'loadDurableFacebookAutoLeadConfig', 'durableFacebookPhoneExclusion',
    'getDurableFacebookLinkedLead', 'requireFacebookLeadContract', 'handleMessaging', 'handleMessagingInner',
    'handleDurableFacebookLeadGen', 'handleLeadGen', 'handleDurableFacebookComment', 'handleComment'];
  vm.runInContext('const _processingMids = new Set(); const _asyncLockTails = new Map();\n'
    + functions.map(functionText).join('\n'), context, { filename: routePath });
  return { state, context, form: formModule.exports,
    message: (value = event(), mode = 'page-inbox') => context.handleMessaging('page-1', value, null, mode),
    ad: (value = adEvent()) => context.handleLeadGen('page-1', value, 'page-inbox'),
    comment: (value = commentEvent()) => context.handleComment('page-1', value, 'page-inbox') };
}

test('new Messenger mode persists one message across pending projection retries and sends no auto-reply', async () => {
  const h = harness();
  for (let i = 0; i < 2; i++) await assert.rejects(h.message(), { code: 'FB_INBOX_MESSAGE_PROJECTION_CONTRACT_REQUIRED' });
  assert.equal(h.state.tables.facebook_messages.length, 1);
  assert.equal(h.state.creates, 0); assert.equal(h.state.replies, 0); assert.equal(h.state.legacyAttribution, 0);
  assert.equal(h.state.tables.facebook_contacts[0].unread_count, 0);
  assert.equal(h.state.calls.some((call) => call.table === 'facebook_contacts' && call.action === 'update'), false);
});

test('existing boolean durable mode preserves its existing Lead and auto-reply behavior', async () => {
  const h = harness();
  await h.message(event(), true); await h.message(event(), true);
  assert.equal(h.state.creates, 1); assert.equal(h.state.replies, 1);
  assert.equal(h.state.tables.facebook_messages.length, 1);
  assert.equal(h.state.tables.facebook_messages[0].lead_id, 'lead-1');
  assert.equal(h.state.calls.some((call) => call.table === 'app_settings'), false);
});

test('flag-off legacy handler preserves Lead creation, reply and duplicate-MID guard', async () => {
  const h = harness(); await h.message(event(), false); await h.message(event(), false);
  assert.equal(h.state.creates, 1); assert.equal(h.state.replies, 1);
  assert.equal(h.state.tables.facebook_messages.length, 1); assert.equal(h.state.captures, 0);
  assert.equal(h.state.calls.some((call) => call.table === 'app_settings'), false);
});

for (const [name, config, expected] of [
  ['manual', { trigger: 'manual' }, 'manual_lead_creation'],
  ['threshold', { trigger: 'message_count', message_count_threshold: 2 }, 'message_threshold_not_reached'],
  ['phone', { trigger: 'has_phone' }, 'phone_not_available'],
]) test(`Messenger ${name} config cannot bypass the pending projection contract`, async () => {
  const h = harness({ config });
  await assert.rejects(h.message(), { code: 'FB_INBOX_MESSAGE_PROJECTION_CONTRACT_REQUIRED' });
  assert.equal(h.state.creates, 0);
});

for (const [table, action, columns, code] of [
  ['facebook_contacts', 'select', '*', 'FB_DURABLE_CONTACT_READ_FAILED'],
  ['facebook_messages', 'upsert', undefined, 'FB_DURABLE_MESSAGE_WRITE_FAILED'],
]) test(`Messenger ${table}/${action}/${columns || '*'} failure stays pending`, async () => {
  const h = harness(); h.state.failures.push({ table, action, columns });
  await assert.rejects(h.message(), new RegExp(code)); assert.equal(h.state.creates, 0);
});

test('config DB error is not interpreted as an absent config/default', async () => {
  const h = harness(); h.state.failures.push({ table: 'app_settings', action: 'select' });
  await assert.rejects(h.context.loadDurableFacebookAutoLeadConfig(), /FB_DURABLE_CONFIG_READ_FAILED/);
});

test('linked Lead read failure never clears the contact Lead link', async () => {
  const h = harness({ linked: true });
  h.state.failures.push({ table: 'crm_leads', action: 'select' });
  await assert.rejects(h.message(), /FB_DURABLE_LEAD_READ_FAILED/);
  assert.equal(h.state.tables.facebook_contacts[0].lead_id, 'lead-1');
});

test('foreign-company Lead is rejected before a message is linked', async () => {
  const h = harness({ linked: true }); h.state.tables.crm_leads[0].company_id = 'other-company';
  await assert.rejects(h.message(), { code: 'FB_INBOX_LEAD_SCOPE_MISMATCH' });
  assert.equal(h.state.tables.facebook_messages.length, 0);
});

test('even an existing scoped Lead cannot bypass a pending message projection on retry', async () => {
  const h = harness({ linked: true });
  for (let i = 0; i < 2; i++) await assert.rejects(h.message(), { code: 'FB_INBOX_MESSAGE_PROJECTION_CONTRACT_REQUIRED' });
  assert.equal(h.state.tables.facebook_messages.length, 1);
  assert.equal(h.state.creates, 0); assert.equal(h.state.links, 0);
});

test('legacy Customer enrichment is held before any Customer write', async () => {
  const h = harness({ linked: true, config: { auto_update_phone: true } });
  await assert.rejects(h.message(), { code: 'FB_INBOX_MESSAGE_PROJECTION_CONTRACT_REQUIRED' });
  assert.equal(h.state.calls.some((call) => call.table === 'customers'), false);
});

test('missing message identity fails before persistence', async () => {
  const h = harness(); const value = event(); delete value.message.mid;
  await assert.rejects(h.message(value), { code: 'FB_INBOX_MESSAGE_ID_REQUIRED' });
  assert.equal(h.state.calls.length, 0);
});

for (const unsupported of [
  { postback: { payload: 'SYNTHETIC' } }, { delivery: { mids: ['message-1'] } }, { unknown: {} },
]) test(`unsupported messaging event ${Object.keys(unsupported)[0]} is never completed`, async () => {
  const h = harness();
  await assert.rejects(h.message({ sender: { id: 'sender-1' }, recipient: { id: 'page-1' }, ...unsupported }),
    { code: 'FB_INBOX_MESSAGING_EVENT_CONTRACT_REQUIRED' });
  assert.equal(h.state.calls.length, 0); assert.equal(h.state.links, 0);
});

test('ambiguous message insert commit reuses saved MID but never skips incomplete projection', async () => {
  const h = harness(); h.state.failures.push({ table: 'facebook_messages', action: 'upsert', afterCommit: true });
  await assert.rejects(h.message(), /FB_DURABLE_MESSAGE_WRITE_FAILED/);
  await assert.rejects(h.message(), { code: 'FB_INBOX_MESSAGE_PROJECTION_CONTRACT_REQUIRED' });
  assert.equal(h.state.tables.facebook_messages.length, 1);
  assert.equal(h.state.tables.facebook_contacts[0].unread_count, 0);
  assert.equal(h.state.calls.some((call) => call.table === 'facebook_contacts' && call.action === 'update'), false);
});

test('echo preview also stays pending so retry cannot overwrite a newer preview', async () => {
  const h = harness(); const value = event(); value.message.is_echo = true;
  for (let i = 0; i < 2; i++) await assert.rejects(h.message(value), { code: 'FB_INBOX_MESSAGE_PROJECTION_CONTRACT_REQUIRED' });
  assert.equal(h.state.tables.facebook_messages.length, 1);
  assert.equal(h.state.calls.some((call) => call.table === 'facebook_contacts' && call.action === 'update'), false);
});

test('read receipt cannot reset a newer unread projection', async () => {
  const h = harness({ contact: { unread_count: 5 } });
  await assert.rejects(h.message({ sender: { id: 'sender-1' }, recipient: { id: 'page-1' }, read: { watermark: 100 } }),
    { code: 'FB_INBOX_MESSAGE_PROJECTION_CONTRACT_REQUIRED' });
  assert.equal(h.state.tables.facebook_contacts[0].unread_count, 5); assert.equal(h.state.calls.length, 0);
});

for (const reaction of [{ mid: 'message-1', action: 'unreact' }, { mid: '', action: 'react', reaction: 'love' },
  { mid: 'message-1', action: 'unknown', reaction: 'love' }]) {
  test(`reaction without complete supported identity stays pending: ${JSON.stringify(reaction)}`, async () => {
    const h = harness();
    await assert.rejects(h.message({ sender: { id: 'sender-1' }, recipient: { id: 'page-1' }, reaction }),
      { code: 'FB_INBOX_REACTION_IDENTITY_REQUIRED' }); assert.equal(h.state.calls.length, 0);
  });
}

test('complete reaction identity persists once across retries', async () => {
  const h = harness(); const value = { sender: { id: 'sender-1' }, recipient: { id: 'page-1' },
    reaction: { mid: 'message-1', action: 'react', reaction: 'love', emoji: 'synthetic' } };
  await h.message(value);
  await h.message(value); assert.equal(h.state.tables.fb_message_reactions.length, 1);
});

test('reaction persistence error never completes its event', async () => {
  const h = harness(); h.state.failures.push({ table: 'fb_message_reactions', action: 'upsert' });
  await assert.rejects(h.message({ sender: { id: 'sender-1' }, recipient: { id: 'page-1' },
    reaction: { mid: 'message-1', action: 'react', reaction: 'love' } }), /FB_DURABLE_REACTION_WRITE_FAILED/);
});

for (const sender of [undefined, { id: '' }, { id: '   ' }]) {
  test(`reaction actor ${JSON.stringify(sender)} cannot be inferred from the recipient`, async () => {
    const h = harness(); await assert.rejects(h.message({ sender, recipient: { id: 'sender-1' },
      reaction: { mid: 'message-1', action: 'react', reaction: 'love' } }),
    { code: 'FB_INBOX_REACTION_IDENTITY_REQUIRED' }); assert.equal(h.state.calls.length, 0);
  });
}

test('new reaction intake neither backfills message Lead links nor writes attribution', async () => {
  const h = harness({ linked: true });
  await h.message({ sender: { id: 'sender-1' }, recipient: { id: 'page-1' },
    reaction: { mid: 'message-1', action: 'react', reaction: 'love' }, referral: { ad_id: '12345' } });
  assert.equal(h.state.captures, 0); assert.equal(h.state.links, 0); assert.equal(h.state.legacyAttribution, 0);
  assert.equal(h.state.calls.some((call) => call.table === 'facebook_messages'), false);
  assert.equal(h.state.tables.fb_message_reactions.length, 1);
});

test('new pending message logs neither raw payloads nor duplicate webhook log rows', async () => {
  const h = harness(); h.context.FB_DISABLE_WEBHOOK_LOGS = false;
  const value = event(); value.message.attachments = [{ type: 'image', payload: { url: 'https://synthetic.invalid/private-image' } }];
  for (let i = 0; i < 2; i++) await assert.rejects(h.message(value), { code: 'FB_INBOX_MESSAGE_PROJECTION_CONTRACT_REQUIRED' });
  assert.equal(h.state.logs.length, 0);
  assert.equal(h.state.calls.some((call) => call.table === 'facebook_webhook_logs'), false);
});

for (const version of [undefined, '', '19.0', 'v19', 'v123.0', 'v19.0/path', ' v19.0']) {
  test(`Lead Ads missing/invalid explicit Graph version ${JSON.stringify(version)} stays pending before provider I/O`, async () => {
    const h = harness(); h.context.process.env.VPT_META_GRAPH_VERSION = version;
    await assert.rejects(h.ad(), { code: 'FB_INBOX_GRAPH_VERSION_REQUIRED' });
    assert.equal(h.state.graphCalls, 0); assert.equal(h.state.tables.facebook_lead_ads.length, 0);
  });
}

test('Lead Ads uses the explicit synthetic Graph version and token only in authorization header', async () => {
  const h = harness(); await assert.rejects(h.ad(), { code: 'FB_INBOX_LEAD_CONTRACT_REQUIRED' });
  assert.deepEqual(h.state.graphUrls, ['https://graph.facebook.com/v99.7/ad-1']);
});

test('committed Lead Ads raw snapshot does not require a provider version for downstream retry', async () => {
  const h = harness(); await assert.rejects(h.ad(), { code: 'FB_INBOX_LEAD_CONTRACT_REQUIRED' });
  delete h.context.process.env.VPT_META_GRAPH_VERSION;
  await assert.rejects(h.ad(), { code: 'FB_INBOX_LEAD_CONTRACT_REQUIRED' }); assert.equal(h.state.graphCalls, 1);
});

for (const graph of [{ throws: true }, { ok: false }, { body: { error: { message: 'SYNTHETIC' } } },
  { body: {} }, { body: { field_data: {} } }, { badJson: true }]) {
  test(`Lead Ads source failure ${JSON.stringify(graph)} creates no raw/customer/Lead`, async () => {
    const h = harness({ graph }); await assert.rejects(h.ad(), { code: 'FB_DURABLE_LEAD_AD_SOURCE_FAILED' });
    assert.equal(h.state.tables.facebook_lead_ads.length, 0); assert.equal(h.state.creates, 0);
  });
}

test('Lead Ads committed raw snapshot is retried downstream without another Graph request', async () => {
  const h = harness();
  for (let i = 0; i < 2; i++) await assert.rejects(h.ad(), { code: 'FB_INBOX_LEAD_CONTRACT_REQUIRED' });
  assert.equal(h.state.graphCalls, 1); assert.equal(h.state.tables.facebook_lead_ads.length, 1);
  assert.equal(h.state.tables.facebook_contacts.filter((row) => row.psid === 'leadad_ad-1').length, 1);
  assert.equal(h.state.creates, 0); assert.notEqual(h.state.tables.facebook_lead_ads[0].processed, true);
});

test('ambiguous Lead Ads raw commit is reused on retry, without a duplicate raw row', async () => {
  const h = harness(); h.state.failures.push({ table: 'facebook_lead_ads', action: 'insert', afterCommit: true });
  await assert.rejects(h.ad(), /FB_DURABLE_LEAD_AD_WRITE_FAILED/);
  await assert.rejects(h.ad(), { code: 'FB_INBOX_LEAD_CONTRACT_REQUIRED' });
  assert.equal(h.state.graphCalls, 1); assert.equal(h.state.tables.facebook_lead_ads.length, 1);
});

test('concurrent Lead Ads duplicate resumes the winning raw snapshot', async () => {
  const h = harness({ formData: [{ name: 'email', values: ['losing-synthetic@example.invalid'] }] });
  h.state.failures.push({ table: 'facebook_lead_ads', action: 'insert', run(call, state) {
    state.tables.facebook_lead_ads.push({ id: 'winning-raw', page_id: 'page-1', form_id: 'form-1', leadgen_id: 'ad-1',
      raw_data: { field_data: [{ name: 'email', values: ['winning-synthetic@example.invalid'] }] } });
    return { data: null, error: { code: '23505' } };
  } });
  await assert.rejects(h.ad(), { code: 'FB_INBOX_LEAD_CONTRACT_REQUIRED' });
  const savedContact = h.state.tables.facebook_contacts.find((row) => row.psid === 'leadad_ad-1');
  assert.equal(savedContact.email, 'winning-synthetic@example.invalid'); assert.equal(h.state.graphCalls, 1);
});

test('contact duplicate race is reread without creating a second contact', async () => {
  const h = harness(); h.state.failures.push({ table: 'facebook_contacts', action: 'insert', afterCommit: true, code: '23505' });
  await assert.rejects(h.ad(), { code: 'FB_INBOX_LEAD_CONTRACT_REQUIRED' });
  assert.equal(h.state.tables.facebook_contacts.filter((row) => row.psid === 'leadad_ad-1').length, 1);
});

test('Lead Ads reuses a scoped existing Lead but holds unsafe attribution, including retry', async () => {
  const h = harness({ linked: true, contact: { psid: 'leadad_ad-1' } });
  for (let i = 0; i < 2; i++) await assert.rejects(h.ad(), { code: 'FB_INBOX_ATTRIBUTION_CONTRACT_REQUIRED' });
  assert.equal(h.state.tables.facebook_lead_ads[0].lead_id, 'lead-1');
  assert.notEqual(h.state.tables.facebook_lead_ads[0].processed, true); assert.equal(h.state.creates, 0);
});

for (const [table, action, code] of [
  ['facebook_lead_ads', 'select', 'FB_DURABLE_LEAD_AD_READ_FAILED'],
  ['facebook_pages', 'select', 'FB_DURABLE_PAGE_UNAVAILABLE'],
  ['fb_lead_form_mapping', 'select', 'FB_DURABLE_FORM_MAPPING_READ_FAILED'],
  ['facebook_lead_ads', 'insert', 'FB_DURABLE_LEAD_AD_WRITE_FAILED'],
  ['facebook_contacts', 'insert', 'FB_DURABLE_CONTACT_WRITE_FAILED'],
]) test(`Lead Ads ${table}/${action} error propagates`, async () => {
  const h = harness(); h.state.failures.push({ table, action });
  await assert.rejects(h.ad(), new RegExp(code)); assert.equal(h.state.creates, 0);
});

test('strict blocklist error never becomes an allowed phone', async () => {
  const h = harness({ formData: [{ name: 'phone_number', values: ['0901234567'] }] });
  h.state.failures.push({ table: 'crm_auto_lead_blocked_phones', action: 'select' });
  await assert.rejects(h.ad(), /FB_DURABLE_BLOCKLIST_READ_FAILED/); assert.equal(h.state.creates, 0);
});

test('blocked Lead Ads phone is an explicit terminal business exclusion', async () => {
  const h = harness({ formData: [{ name: 'phone_number', values: ['0901234567'] }] });
  h.state.tables.crm_auto_lead_blocked_phones.push({ id: 'blocked-1', phone_last9: '901234567' });
  const result = await h.ad(); assert.equal(result.skipped, 'blocked_phone'); assert.equal(h.state.creates, 0);
});

test('strict mapping errors fail while optional legacy mapping keeps its default fallback', async () => {
  const h = harness(); h.state.failures.push({ table: 'fb_lead_form_mapping', action: 'select', times: 2 });
  await assert.rejects(h.form.docFormLeadAds('form-1', [], { strict: true }), /FB_DURABLE_FORM_MAPPING_READ_FAILED/);
  assert.equal((await h.form.docFormLeadAds('form-1', [])).da_khai_ban_do, false);
});

test('Lead Ads raw identity from another Page is not reused or overwritten', async () => {
  const h = harness(); h.state.tables.facebook_lead_ads.push({ id: 'raw-other', page_id: 'other-page',
    leadgen_id: 'ad-1', form_id: 'form-1' });
  await assert.rejects(h.ad(), { code: 'FB_INBOX_LEAD_AD_SCOPE_MISMATCH' }); assert.equal(h.state.graphCalls, 0);
});

test('comment intake is idempotent and has no notification/Lead side effect', async () => {
  const h = harness(); await h.comment(); const replay = await h.comment();
  assert.equal(h.state.tables.facebook_comments.length, 1);
  assert.equal(replay.skipped, 'comment_notification_disabled'); assert.equal(h.state.creates, 0);
});

test('comment insert ambiguous commit is recovered without creating a duplicate', async () => {
  const h = harness(); h.state.failures.push({ table: 'facebook_comments', action: 'insert', afterCommit: true });
  await assert.rejects(h.comment(), /FB_DURABLE_COMMENT_WRITE_FAILED/); await h.comment();
  assert.equal(h.state.tables.facebook_comments.length, 1);
});

test('comment duplicate race is confirmed by the existing Page-bound row', async () => {
  const h = harness(); h.state.failures.push({ table: 'facebook_comments', action: 'insert', afterCommit: true, code: '23505' });
  await h.comment(); assert.equal(h.state.tables.facebook_comments.length, 1);
});

for (const [action, code] of [['select', 'FB_DURABLE_COMMENT_READ_FAILED'], ['insert', 'FB_DURABLE_COMMENT_WRITE_FAILED']]) {
  test(`comment ${action} error is not successful intake`, async () => {
    const h = harness(); h.state.failures.push({ table: 'facebook_comments', action });
    await assert.rejects(h.comment(), new RegExp(code));
  });
}

test('Page-authored comment is stored with explicit no-notification exclusion', async () => {
  const h = harness(); const value = commentEvent(); value.from.id = 'page-1';
  const result = await h.comment(value); assert.equal(result.skipped, 'page_authored_comment');
  assert.equal(h.state.tables.facebook_comments[0].is_from_page, true);
});

test('comment mutation stays pending until an ordering contract is available', async () => {
  const h = harness(); await assert.rejects(h.comment({ ...commentEvent(), verb: 'edited' }),
    { code: 'FB_INBOX_COMMENT_MUTATION_CONTRACT_REQUIRED' }); assert.equal(h.state.tables.facebook_comments.length, 0);
});

test('comment ID belonging to another Page is never accepted as a replay', async () => {
  const h = harness(); h.state.tables.facebook_comments.push({ id: 'foreign', comment_id: 'comment-1', page_id: 'page-other' });
  await assert.rejects(h.comment(), { code: 'FB_INBOX_COMMENT_SCOPE_MISMATCH' });
});
