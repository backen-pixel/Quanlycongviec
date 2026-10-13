'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const O = require('../src/modules/marketingAutomation/metaFeedbackOutbox');
const S = require('../src/modules/marketingAutomation/metaFeedbackSender');
const COMPANY = '991dc79d-cbf5-49f9-a364-35227cb47635';
const uuid = n => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
const NOW = Date.now();
const TARGET = { company_id: COMPANY, dataset_id: '123456789', ad_account_id: 'act_835757498658305', page_id: '987654321' };
const copy = value => structuredClone(value);
function candidate(patch = {}) {
  return { company_id: COMPANY, lead_id: uuid(1), identity_key: 'a'.repeat(64),
    qualification_id: uuid(2), qualification_revision: 1, context_hash: 'b'.repeat(64),
    source_receipt_id: uuid(3), page_id: TARGET.page_id, fb_leadgen_id: '14567890123456',
    ad_account_id: TARGET.ad_account_id, source_kind: 'lead_ads', delivery_supported: true,
    qualified_ms: NOW - 60000, acquired_ms: NOW - 3600000, event_name: 'qualified_lead', ...patch };
}
function environment(patch = {}) {
  return { VPT_META_FEEDBACK_ENABLED: '1', VPT_META_FEEDBACK_CONSENT: '1', VPT_META_FEEDBACK_MODE: 'production',
    VPT_META_FEEDBACK_COMPANY_ID: COMPANY, VPT_META_FEEDBACK_AD_ACCOUNT_ID: TARGET.ad_account_id,
    VPT_META_FEEDBACK_PAGE_ID: TARGET.page_id, VPT_META_FEEDBACK_DATASET_ID: TARGET.dataset_id,
    VPT_META_FEEDBACK_GRAPH_VERSION: 'v26.0', VPT_META_FEEDBACK_TOKEN: 'synthetic-test-token-only', ...patch };
}
const options = (mode = 'production') => ({ target: TARGET, mode });
const goodResponse = () => ({ ok: true, status: 200, json: async () => ({ events_received: 1, fbtrace_id: 'syntheticTrace_1' }) });

// Models the RPC state transitions. It never imports runtime config or creates a DB client.
function fakeDb({ failFinish = false, preflight = true } = {}) {
  const rows = [], attempts = [], calls = []; let serial = 10;
  const scope = (row, args) => O.sameTarget(row, args.p_target) && row.mode === args.p_mode;
  const guard = args => {
    const scoped = rows.filter(row => scope(row, args));
    const unknown = scoped.filter(row => row.status === 'unknown').length;
    const accepted_stale = scoped.filter(row => row.status === 'accepted' && row.stale === true).length;
    const expired_processing = scoped.filter(row => row.status === 'processing' && Date.parse(row.locked_until) <= NOW).length;
    const blocked = unknown + accepted_stale + expired_processing > 0;
    return { blocked, reason_code: blocked ? 'META_HISTORY_REVIEW_REQUIRED' : null, unknown, accepted_stale, expired_processing };
  };
  return { rows, attempts, calls, async rpc(name, args) {
    calls.push({ name, args: copy(args) });
    if (name === 'meta_feedback_enqueue_v1') {
      const p = args.p_row;
      let row = rows.find(r => r.company_id === p.company_id && r.dataset_id === p.dataset_id
        && r.identity_key === p.identity_key && r.event_name === p.event_name && r.mode === p.mode);
      if (!row) { row = { ...copy(p), id: uuid(++serial), status: 'pending', attempts: 0,
        created_at: new Date(NOW).toISOString(), locked_until: null, lease_token: null, stale: false };
        rows.push(row); }
      else if (row.attempts === 0 && ['pending', 'held', 'cancelled'].includes(row.status))
        Object.assign(row, copy(p), { status: 'pending', reason_code: null, stale: false });
      return { data: copy(row), error: null };
    }
    if (name === 'meta_feedback_claim_v1') {
      for (const row of rows.filter(r => scope(r, args) && r.status === 'processing' && Date.parse(r.locked_until) <= NOW)) {
        row.status = 'unknown'; row.lease_token = null; row.locked_until = null; row.reason_code = 'META_LEASE_EXPIRED';
      }
      if (guard(args).blocked) return { data: null, error: null };
      const row = rows.find(r => scope(r, args) && r.status === 'pending');
      if (!row) return { data: null, error: null };
      row.status = 'processing'; row.attempts++; row.lease_token = args.p_lease_token;
      row.locked_until = new Date(NOW + 120000).toISOString();
      attempts.push({ outbox_id: row.id, lease_token: row.lease_token, status: 'processing' });
      return { data: copy(row), error: null };
    }
    if (name === 'meta_feedback_finish_v1') {
      if (failFinish) return { error: { message: 'private provider token' }, data: null };
      const row = rows.find(r => r.id === args.p_id);
      if (!row || row.status !== 'processing' || row.lease_token !== args.p_lease_token)
        return { data: false, error: null };
      row.status = args.p_status; row.reason_code = args.p_reason_code; row.lease_token = null; row.locked_until = null;
      if (args.p_status === 'accepted') { row.accepted_at = new Date(NOW).toISOString(); row.fbtrace_id = args.p_receipt.fbtrace_id; }
      Object.assign(attempts.find(a => a.lease_token === args.p_lease_token), { status: args.p_status });
      return { data: true, error: null };
    }
    if (name === 'meta_feedback_preflight_v1') {
      const row = rows.find(r => r.id === args.p_id);
      return { data: preflight && Boolean(row && row.status === 'processing' && row.lease_token === args.p_lease_token
        && Date.parse(row.locked_until) > NOW && !guard({ p_target: row, p_mode: row.mode }).blocked), error: null };
    }
    if (name === 'meta_feedback_guard_v1') return { data: guard(args), error: null };
    if (name === 'meta_feedback_reconcile_v1') {
      let cancelled = 0, review = 0;
      for (const row of rows.filter(r => scope(r, args) && ['pending', 'accepted'].includes(r.status))) {
        const proof = row.status === 'accepted' && args.p_history_current ? args.p_history_current : args.p_current;
        const current = proof.find(r => r.event_id === row.event_id);
        if (row.status === 'accepted' && !current && args.p_history_complete !== true) continue;
        if (!current || ['context_hash', 'source_receipt_id', 'fb_leadgen_id'].some(key => current[key] !== row[key])
          || (row.event_name === 'qualified_lead' && ['qualification_id', 'qualification_revision'].some(key => current[key] !== row[key]))) {
          if (row.status === 'pending') { row.status = 'cancelled'; cancelled++; }
          else { row.stale = true; row.reason_code = 'META_ACCEPTED_REVIEW_REQUIRED'; review++; }
        }
      }
      return { data: { cancelled, accepted_review_required: review }, error: null };
    }
    if (name === 'meta_feedback_list_v1') {
      const selected = rows.filter(r => scope(r, args));
      const counts = Object.fromEntries([...new Set(selected.map(r => r.status))].map(s => [s, selected.filter(r => r.status === s).length]));
      return { data: { counts, rows: copy(selected.slice(0, args.p_limit)) }, error: null };
    }
    throw Error('unexpected RPC');
  } };
}

test('config defaults off; scope remains previewable without secret; private token never serializes', () => {
  assert.equal(S.getMetaFeedbackConfig({}).enabled, false);
  for (const patch of [{ VPT_META_FEEDBACK_TOKEN: '' }, { VPT_META_FEEDBACK_CONSENT: '' },
    { VPT_META_FEEDBACK_GRAPH_VERSION: '' }, { VPT_META_FEEDBACK_MODE: '' },
    { VPT_META_FEEDBACK_DATASET_ID: 'https://evil.test' }, { VPT_META_FEEDBACK_PAGE_ID: '12/13' }])
    assert.equal(S.getMetaFeedbackConfig(environment(patch)).enabled, false);
  const missing = S.getMetaFeedbackConfig(environment({ VPT_META_FEEDBACK_TOKEN: '' }));
  assert.deepEqual(missing.target, TARGET); assert.equal(missing.ready, false);
  const disabled = S.getMetaFeedbackConfig(environment({ VPT_META_FEEDBACK_ENABLED: '0' }));
  assert.equal(disabled.ready, true); assert.equal(disabled.enabled, false);
  const good = S.getMetaFeedbackConfig(environment()); assert.equal(good.enabled, true);
  assert.equal(good.accessToken, 'synthetic-test-token-only');
  assert.doesNotMatch(JSON.stringify(good), /synthetic-test-token|accessToken|Bearer/);
  assert.equal(S.getMetaFeedbackConfig(environment({ VPT_META_FEEDBACK_COMPANY_ID: uuid(99) })).ready, false);
});

test('test mode requires request test code; production forbids any test code and implicit tokens', () => {
  assert.equal(S.getMetaFeedbackConfig(environment({ VPT_META_FEEDBACK_MODE: 'test' })).ready, false);
  assert.equal(S.getMetaFeedbackConfig(environment({ VPT_META_FEEDBACK_TEST_EVENT_CODE: 'TEST123' })).ready, false);
  const cfg = S.getMetaFeedbackConfig(environment({ VPT_META_FEEDBACK_MODE: 'test', VPT_META_FEEDBACK_TEST_EVENT_CODE: 'TEST123' }));
  assert.equal(cfg.ready, true); assert.equal(cfg.testEventCode, 'TEST123');
  assert.equal(S.getMetaFeedbackConfig({ ...environment(), VPT_META_FEEDBACK_TOKEN: undefined,
    VPT_FB_LEAD_APP_ACCESS_TOKEN: 'synthetic-fallback-token' }).ready, false);
});

test('payload contract contains only original string Lead ID, actual time and stable opaque event ID', () => {
  const a = O.prepareMetaFeedback(candidate(), options());
  const b = O.prepareMetaFeedback(candidate({ qualification_id: uuid(9), qualification_revision: 2, qualified_ms: NOW - 1000 }), options());
  assert.equal(a.event_id, b.event_id); assert.ok(a.event_id.length <= 64);
  assert.notEqual(a.event_id, O.prepareMetaFeedback(candidate(), options('test')).event_id);
  assert.notEqual(a.event_id, O.prepareMetaFeedback(candidate({ event_name: 'initial_lead' }), options()).event_id);
  assert.deepEqual(a.payload.user_data, { lead_id: '14567890123456' });
  assert.deepEqual(a.payload.custom_data, { event_source: 'crm', lead_event_source: 'VPT CRM' });
  assert.equal(a.payload.event_time, Math.floor((NOW - 60000) / 1000));
  assert.equal(a.payload.action_source, 'system_generated');
  const enriched = O.makeMetaFeedbackPayload(candidate({ phone: '0900000000', email: 'private@example.test',
    event_source_url: 'https://evil.test', client_ip_address: '127.0.0.1', message: 'private' }), options());
  assert.doesNotMatch(JSON.stringify(enriched), /0900000000|private|evil|127\.0\.0\.1/);
});

test('Messenger, synthetic Lead IDs, wrong Page/account, raw identity and absent verification reject before DB', async () => {
  const db = fakeDb(), outbox = O.createMetaFeedbackOutbox(db);
  for (const patch of [{ delivery_supported: false }, { source_kind: 'messenger' },
    { fb_leadgen_id: 'leadad_123' }, { fb_leadgen_id: 123 }, { identity_key: '0900000000' },
    { page_id: '777' }, { ad_account_id: 'act_999' }, { qualification_id: null }, { context_hash: null }])
    await assert.rejects(outbox.enqueue(candidate(patch), options()));
  assert.equal(db.calls.length, 0);
});

test('durable idempotence and isolated test/prod ledger never resend accepted/unknown events', async () => {
  const db = fakeDb(), outbox = O.createMetaFeedbackOutbox(db);
  const row = await outbox.enqueue(candidate(), options());
  assert.equal((await outbox.enqueue(candidate(), options())).id, row.id);
  const claim = await outbox.claim(TARGET, 'production');
  assert.equal(await outbox.claim(TARGET, 'production'), null);
  await outbox.finish(claim, { status: 'accepted', receipt: { events_received: 1, fbtrace_id: 'trace_1' } });
  await outbox.enqueue(candidate({ qualification_id: uuid(9), qualification_revision: 2 }), options());
  assert.equal(await outbox.claim(TARGET, 'production'), null);
  const testRow = await outbox.enqueue(candidate(), options('test')); assert.notEqual(testRow.id, row.id);
  const testClaim = await outbox.claim(TARGET, 'test');
  await outbox.finish(testClaim, { status: 'unknown', reason_code: 'META_DELIVERY_UNCONFIRMED' });
  await outbox.enqueue(candidate(), options('test')); assert.equal(await outbox.claim(TARGET, 'test'), null);
});

test('reconcile cancels unsent revoked/context changes and flags accepted records without deleting them', async () => {
  const db = fakeDb(), outbox = O.createMetaFeedbackOutbox(db);
  await outbox.enqueue(candidate(), options());
  await outbox.reconcile(TARGET, 'production', []);
  assert.equal(db.rows[0].status, 'cancelled');
  await outbox.enqueue(candidate(), options());
  await outbox.finish(await outbox.claim(TARGET, 'production'), { status: 'accepted', receipt: { events_received: 1, fbtrace_id: 'trace' } });
  await outbox.reconcile({ rows: [], intakeRows: [], reconciliationRows: [], reconciliationIntakeRows: [],
    reconciliationComplete: true }, options());
  assert.equal(db.rows[0].status, 'accepted'); assert.equal(db.rows[0].stale, true);
  const state = await outbox.listState(TARGET, 'production');
  assert.equal(state.counts.accepted, 1);
  assert.doesNotMatch(JSON.stringify(state), /14567890123456|identity_key|context_hash|user_data|fbtrace/);
});

test('wrong finish lease/receipt or DB error is sanitized and cannot fabricate ACK', async () => {
  const db = fakeDb(), outbox = O.createMetaFeedbackOutbox(db);
  await outbox.enqueue(candidate(), options()); const claim = await outbox.claim(TARGET, 'production');
  await assert.rejects(outbox.finish({ ...claim, lease_token: uuid(90) }, { status: 'unknown' }), /FINISH_UNCONFIRMED/);
  for (const receipt of [{ events_received: 0, fbtrace_id: 't' }, { events_received: 1 },
    { events_received: 1, fbtrace_id: '<private>' }, { events_received: 1, fbtrace_id: 123 }])
    await assert.rejects(outbox.finish(claim, { status: 'accepted', receipt }), /RECEIPT_INVALID/);
  const bad = O.createMetaFeedbackOutbox({ rpc: async () => ({ error: { message: 'secret URL token' } }) });
  await assert.rejects(bad.enqueue(candidate(), options()), error => error.code === 'META_OUTBOX_UNAVAILABLE' && !error.message.includes('secret'));
});

test('list state zero-fills only valid complete status counts and fails closed on malformed totals', async () => {
  const outbox = O.createMetaFeedbackOutbox(fakeDb());
  assert.deepEqual((await outbox.listState(TARGET, 'production')).counts,
    { pending: 0, processing: 0, accepted: 0, held: 0, unknown: 0, cancelled: 0 });
  for (const counts of [{ accepted: '0' }, { unknown: -1 }, { pending: 1.5 }, { foreign: 0 }, { accepted: Number.MAX_SAFE_INTEGER + 1 }]) {
    const invalid = O.createMetaFeedbackOutbox({ rpc: async () => ({ data: { counts, rows: [] }, error: null }) });
    await assert.rejects(invalid.listState(TARGET, 'production'), /META_OUTBOX_SOURCE_INVALID/);
  }
});

test('accepted qualification revoked and reverified at same contact context remains accepted and needs review', async () => {
  const db = fakeDb(), outbox = O.createMetaFeedbackOutbox(db);
  await outbox.enqueue(candidate(), options());
  await outbox.finish(await outbox.claim(TARGET, 'production'), { status: 'accepted',
    receipt: { events_received: 1, fbtrace_id: 'trace' } });
  const reverified = candidate({ qualification_id: uuid(20), qualification_revision: 3, qualified_ms: NOW - 1000 });
  await outbox.reconcile({ rows: [reverified], intakeRows: [] }, options());
  assert.equal(db.rows[0].status, 'accepted'); assert.equal(db.rows[0].stale, true);
  await outbox.enqueue(reverified, options());
  assert.equal(await outbox.claim(TARGET, 'production'), null);
});

test('accepted initial and qualified proof survive aging/freshness gates; true full-history revocation is audited', async () => {
  const db = fakeDb(), outbox = O.createMetaFeedbackOutbox(db), initial = candidate({ event_name: 'initial_lead' });
  for (const event of [initial, candidate()]) {
    await outbox.enqueue(event, options());
    await outbox.finish(await outbox.claim(TARGET, 'production'), { status: 'accepted',
      receipt: { events_received: 1, fbtrace_id: 'trace' } });
  }
  // A missing delivery-window row alone cannot prove a revoked accepted event.
  await outbox.reconcile({ rows: [], intakeRows: [] }, options());
  assert.ok(db.rows.every(row => row.stale === false));
  const enqueueCount = db.calls.filter(call => call.name === 'meta_feedback_enqueue_v1').length;
  let requests = 0;
  const fullHistory = { rows: [], intakeRows: [], reconciliationRows: [candidate()],
    reconciliationIntakeRows: [initial], reconciliationComplete: true };
  const sender = S.createMetaFeedbackSender({ db, getConfig: () => S.getMetaFeedbackConfig(environment()),
    isPrimary: () => true, withPrimary: fn => fn(), now: () => NOW + 70 * 86400000,
    buildEligible: async () => copy(fullHistory), fetchImpl: async () => { requests++; return goodResponse(); } });
  await sender.drain();
  assert.ok(db.rows.every(row => row.status === 'accepted' && row.stale === false));
  assert.equal(db.calls.filter(call => call.name === 'meta_feedback_enqueue_v1').length, enqueueCount);
  assert.equal(requests, 0);
  await outbox.reconcile({ ...fullHistory, reconciliationRows: [] }, options());
  assert.equal(db.rows.find(row => row.event_name === 'qualified_lead').stale, true);
  assert.equal(db.rows.find(row => row.event_name === 'initial_lead').stale, false);
  assert.equal(await outbox.claim(TARGET, 'production'), null);
});

test('preflight rechecks the persisted latest qualification immediately before HTTP', async () => {
  const db = fakeDb({ preflight: false }); let requests = 0;
  const sender = S.createMetaFeedbackSender({ db, getConfig: () => S.getMetaFeedbackConfig(environment()),
    isPrimary: () => true, withPrimary: fn => fn(), now: () => NOW,
    buildEligible: async () => ({ rows: [candidate()], intakeRows: [] }),
    fetchImpl: async () => { requests++; return goodResponse(); } });
  const result = await sender.drain();
  assert.equal(requests, 0); assert.equal(result.outcomes[0].status, 'cancelled');
  assert.equal(result.outcomes[0].reason_code, 'META_PREFLIGHT_CHANGED');
  assert.equal(db.calls.filter(call => call.name === 'meta_feedback_preflight_v1').length, 1);
});

test('accepted B merged into earlier A holds the whole target and cannot send a second canonical identity', async () => {
  const db = fakeDb(), acceptedB = candidate({ lead_id: uuid(31), identity_key: 'c'.repeat(64),
    source_receipt_id: uuid(32), fb_leadgen_id: '14567890123457', qualification_id: uuid(33), context_hash: 'd'.repeat(64) });
  let current = acceptedB, requests = 0;
  const sender = S.createMetaFeedbackSender({ db, getConfig: () => S.getMetaFeedbackConfig(environment()),
    isPrimary: () => true, withPrimary: fn => fn(), now: () => NOW,
    buildEligible: async () => ({ rows: [current], intakeRows: [], reconciliationRows: [current],
      reconciliationIntakeRows: [], reconciliationComplete: true }),
    fetchImpl: async () => { requests++; return goodResponse(); } });
  assert.equal((await sender.drain()).sent, 1);
  // After master-phone correction the full CRM graph selects earlier A instead
  // of delivered B. Catalog freshness can release A but cannot clear B's audit.
  current = candidate();
  for (let i = 0; i < 2; i++) {
    const result = await sender.drain();
    assert.equal(result.status, 'held'); assert.equal(result.reason_code, 'META_HISTORY_REVIEW_REQUIRED');
    assert.equal(result.sent, 0);
  }
  assert.equal(requests, 1);
  assert.equal(db.rows.find(row => row.lead_id === acceptedB.lead_id).stale, true);
  assert.equal(db.rows.find(row => row.lead_id === current.lead_id).status, 'pending');
  const outbox = O.createMetaFeedbackOutbox(db);
  assert.equal((await outbox.guard(TARGET, 'production')).blocked, true);
  assert.equal(await outbox.claim(TARGET, 'production'), null);
  assert.equal((await outbox.guard(TARGET, 'test')).blocked, false);
  assert.equal((await outbox.guard({ ...TARGET, dataset_id: '777888' }, 'production')).blocked, false);
});

test('unknown delivery blocks any new identity on the same target and stays held without automatic retry', async () => {
  const db = fakeDb(); let current = candidate(), requests = 0;
  const sender = S.createMetaFeedbackSender({ db, getConfig: () => S.getMetaFeedbackConfig(environment()),
    isPrimary: () => true, withPrimary: fn => fn(), now: () => NOW,
    buildEligible: async () => ({ rows: [current], intakeRows: [], reconciliationRows: [current],
      reconciliationIntakeRows: [], reconciliationComplete: true }),
    fetchImpl: async () => { requests++; throw Error('unconfirmed synthetic delivery'); } });
  const first = await sender.drain(); assert.equal(first.status, 'held');
  assert.equal(first.reason_code, 'META_HISTORY_REVIEW_REQUIRED'); assert.equal(db.rows[0].status, 'unknown');
  current = candidate({ lead_id: uuid(41), identity_key: 'e'.repeat(64), source_receipt_id: uuid(42),
    qualification_id: uuid(43), context_hash: 'f'.repeat(64), fb_leadgen_id: '14567890123458' });
  const second = await sender.drain();
  assert.equal(second.status, 'held'); assert.equal(second.sent, 0); assert.equal(requests, 1);
  assert.equal(db.rows[0].status, 'unknown'); assert.equal(db.rows[1].status, 'pending');
});

test('malformed history guard cannot enable delivery', async () => {
  for (const result of [{ blocked: false, reason_code: null, unknown: 1, accepted_stale: 0, expired_processing: 0 },
    { blocked: true, reason_code: null, unknown: 1, accepted_stale: 0, expired_processing: 0 },
    { blocked: false, reason_code: null, unknown: '0', accepted_stale: 0, expired_processing: 0 }]) {
    const outbox = O.createMetaFeedbackOutbox({ rpc: async () => ({ data: result, error: null }) });
    await assert.rejects(outbox.guard(TARGET, 'production'), /META_OUTBOX_SOURCE_INVALID/);
  }
});

test('transport fixed host/version, Bearer header, no redirects, test_event_code only at request level', async () => {
  for (const mode of ['production', 'test']) {
    const config = S.getMetaFeedbackConfig(environment({ VPT_META_FEEDBACK_MODE: mode,
      ...(mode === 'test' && { VPT_META_FEEDBACK_TEST_EVENT_CODE: 'TEST123' }) }));
    const payload = O.makeMetaFeedbackPayload(candidate(), options(mode)); let sent;
    const result = await S.sendMetaFeedback({ payload, config, nowMs: NOW, fetchImpl: async (url, args) => { sent = { url, args }; return goodResponse(); } });
    assert.equal(result.status, 'accepted'); assert.equal(sent.url, `https://graph.facebook.com/v26.0/${TARGET.dataset_id}/events`);
    assert.equal(sent.args.redirect, 'error'); assert.match(sent.args.headers.Authorization, /^Bearer synthetic-/);
    assert.ok(sent.args.signal instanceof AbortSignal);
    assert.doesNotMatch(sent.url, /token|synthetic/);
    const body = JSON.parse(sent.args.body); assert.equal(body.data.length, 1);
    assert.equal(body.test_event_code, mode === 'test' ? 'TEST123' : undefined);
    assert.equal(body.data[0].test_event_code, undefined);
  }
});

test('transport refuses future/older-than-seven-days/PII payloads before fetch', async () => {
  const config = S.getMetaFeedbackConfig(environment()), payload = O.makeMetaFeedbackPayload(candidate(), options());
  for (const patch of [{ event_time: Math.floor(NOW / 1000) + 1 },
    { event_time: Math.floor(NOW / 1000) - S.MAX_AGE_SECONDS - 1 },
    { user_data: { lead_id: payload.user_data.lead_id, ph: ['private'] } }, { event_name: 'Lead' }]) {
    let called = false;
    const result = await S.sendMetaFeedback({ payload: { ...payload, ...patch }, config, nowMs: NOW,
      fetchImpl: async () => { called = true; return goodResponse(); } });
    assert.equal(result.status, 'held'); assert.equal(called, false);
  }
});

test('only exact positive receipt is accepted; explicit rejection held; ambiguous errors remain unknown', async () => {
  const config = S.getMetaFeedbackConfig(environment()), payload = O.makeMetaFeedbackPayload(candidate(), options());
  for (const data of [{ events_received: 0, fbtrace_id: 'trace' }, { events_received: 2, fbtrace_id: 'trace' },
    { events_received: 1 }, { events_received: 1, fbtrace_id: '<untrusted>' },
    { events_received: 1, fbtrace_id: 123 }, { events_received: 1, fbtrace_id: 'trace', error: { code: 100 } }, null]) {
    const result = await S.sendMetaFeedback({ payload, config, nowMs: NOW,
      fetchImpl: async () => ({ ok: true, json: async () => data }) });
    assert.equal(result.status, 'unknown');
  }
  const rejected = await S.sendMetaFeedback({ payload, config, nowMs: NOW,
    fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ error: { code: 100, message: 'private Lead ID' } }) }) });
  assert.deepEqual(rejected, { status: 'held', reason_code: 'META_PROVIDER_REJECTED' });
  for (const fetchImpl of [async () => { throw Error('private token timeout'); },
    async () => ({ ok: true, text: async () => '{invalid private body' }),
    async () => ({ ok: true, text: async () => 'a'.repeat(65537) })]) {
    const result = await S.sendMetaFeedback({ payload, config, nowMs: NOW, fetchImpl });
    assert.equal(result.status, 'unknown'); assert.doesNotMatch(JSON.stringify(result), /private/);
  }
});

test('worker sends eligible snapshots once, rechecks after claim, and disabled/backup never send', async () => {
  const config = S.getMetaFeedbackConfig(environment()), snapshot = { rows: [candidate()], intakeRows: [] };
  const db = fakeDb(); let requests = 0, loads = 0;
  const worker = S.createMetaFeedbackSender({ db, getConfig: () => config, isPrimary: () => true, withPrimary: fn => fn(),
    now: () => NOW, buildEligible: async () => { loads++; return copy(snapshot); },
    fetchImpl: async () => { requests++; return goodResponse(); } });
  const first = await worker.drain(); assert.equal(first.sent, 1); assert.equal(loads, 2);
  await worker.drain(); assert.equal(requests, 1);
  const disabledDb = fakeDb();
  const disabled = S.createMetaFeedbackSender({ db: disabledDb, getConfig: () => ({ enabled: false, reason_code: 'OFF' }),
    isPrimary: () => false, withPrimary: fn => fn(), buildEligible: async () => { throw Error('never'); } });
  assert.equal((await disabled.drain()).status, 'disabled'); assert.equal(disabledDb.calls.length, 0);
  const backup = S.createMetaFeedbackSender({ db: fakeDb(), getConfig: () => config, isPrimary: () => false,
    withPrimary: fn => fn(), buildEligible: async () => snapshot, fetchImpl: async () => { throw Error('never'); } });
  await assert.rejects(backup.drain(), /META_PRIMARY_REQUIRED/);
});

test('revocation/context change between claim and HTTP cancels without provider call', async () => {
  const db = fakeDb(), config = S.getMetaFeedbackConfig(environment()); let reads = 0, requests = 0;
  const worker = S.createMetaFeedbackSender({ db, getConfig: () => config, isPrimary: () => true, withPrimary: fn => fn(), now: () => NOW,
    buildEligible: async () => ({ rows: ++reads === 1 ? [candidate()] : [], intakeRows: [] }),
    fetchImpl: async () => { requests++; return goodResponse(); } });
  const result = await worker.drain(); assert.equal(result.sent, 0); assert.equal(requests, 0);
  assert.equal(db.rows[0].status, 'cancelled');
});

test('Meta ACK plus failed DB completion stays unknown and expired lease cannot be replayed blindly', async () => {
  const db = fakeDb({ failFinish: true }), config = S.getMetaFeedbackConfig(environment()); let requests = 0;
  const worker = S.createMetaFeedbackSender({ db, getConfig: () => config, isPrimary: () => true, withPrimary: fn => fn(), now: () => NOW,
    buildEligible: async () => ({ rows: [candidate()], intakeRows: [] }), fetchImpl: async () => { requests++; return goodResponse(); } });
  const result = await worker.drain(); assert.equal(result.sent, 0); assert.equal(result.outcomes[0].status, 'unknown');
  await worker.drain(); assert.equal(requests, 1);
  db.rows[0].locked_until = '2020-01-01T00:00:00Z';
  await worker.drain(); assert.equal(requests, 1); assert.equal(db.rows[0].status, 'unknown');
});

test('draft schema uses separate service-only ledger, lease compare, unknown hold and immutable business key', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../database/20261013143556_meta_qualified_feedback.sql'), 'utf8');
  assert.match(sql, /UNIQUE\(company_id,dataset_id,identity_key,event_name,mode\)/);
  assert.match(sql, /CREATE TABLE public\.meta_feedback_attempts/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/g);
  assert.match(sql, /FROM PUBLIC,anon,authenticated,service_role/);
  assert.doesNotMatch(sql, /SECURITY DEFINER|GRANT[^;]+TO (?:anon|authenticated)/);
  assert.match(sql, /FOR UPDATE SKIP LOCKED/);
  assert.match(sql, /item\.lease_token IS DISTINCT FROM p_lease_token/);
  assert.match(sql, /SET status='unknown',lease_token=NULL/);
  assert.match(sql, /item\.attempts=0/);
});
