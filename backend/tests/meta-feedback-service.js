'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { createMetaQualifiedFeedback } = require('../src/services/metaQualifiedFeedback');
const { getMetaFeedbackConfig } = require('../src/modules/marketingAutomation/metaFeedbackSender');
const COMPANY = '991dc79d-cbf5-49f9-a364-35227cb47635';
const NOW = Date.now();
const env = { VPT_META_FEEDBACK_ENABLED: '0', VPT_META_FEEDBACK_MODE: 'production',
  VPT_META_FEEDBACK_COMPANY_ID: COMPANY, VPT_META_FEEDBACK_AD_ACCOUNT_ID: 'act_835757498658305',
  VPT_META_FEEDBACK_PAGE_ID: '409741855550833', VPT_META_FEEDBACK_DATASET_ID: '1575398160676100',
  VPT_META_FEEDBACK_GRAPH_VERSION: 'v26.0' };
const row = { company_id: COMPANY, lead_id: '11111111-1111-4111-8111-111111111111',
  identity_key: 'a'.repeat(64), qualification_id: '22222222-2222-4222-8222-222222222222',
  qualification_revision: 1, context_hash: 'b'.repeat(64),
  source_receipt_id: '33333333-3333-4333-8333-333333333333', page_id: env.VPT_META_FEEDBACK_PAGE_ID,
  fb_leadgen_id: '1234567890123456', ad_account_id: env.VPT_META_FEEDBACK_AD_ACCOUNT_ID,
  source_kind: 'lead_ads', delivery_supported: true, qualified_ms: NOW - 60000, acquired_ms: NOW - 3600000 };
function harness({ config = getMetaFeedbackConfig(env), primary = true, snapshot,
  failLedger = false, failGuard = false, failSource = false } = {}) {
  const calls = [];
  const runtime = createMetaQualifiedFeedback({
    db: { async rpc(name) { calls.push(name); if (name === 'meta_feedback_guard_v1' && !failLedger)
      return failGuard ? { error: Error('private token') }
        : { data: { blocked: false, reason_code: null, unknown: 0, accepted_stale: 0, expired_processing: 0 }, error: null };
      return failLedger ? { error: Error('private token') }
      : { data: { counts: {}, rows: [] }, error: null }; } },
    getConfig: () => config, isPrimary: () => primary, withPrimary: fn => fn(), now: () => NOW,
    fetchImpl: async () => { throw Error('external call forbidden'); },
    buildEligible: async input => { calls.push(input); if (failSource) throw Error('private phone');
      return snapshot || { rows: [], intakeRows: [], diagnostics: {} }; },
  });
  return { runtime, calls };
}
test('preview without scope keeps unknown counts and never touches DB; disabled worker sends nothing', async () => {
  const { runtime, calls } = harness({ config: getMetaFeedbackConfig({}) });
  const p = await runtime.preview(); assert.equal(p.counts, null); assert.equal(p.delivery.counts, null);
  runtime.start(); assert.equal((await runtime.drain({ limit: 1 })).status, 'disabled');
  assert.equal(calls.length, 0); runtime.stop();
});
test('preview distinguishes reconciled lead, expired Form and held Messenger; no source identifiers leak', async () => {
  const { runtime, calls } = harness({ snapshot: { rows: [row,
    { ...row, qualified_ms: NOW - 8 * 86400000 },
    { ...row, source_kind: 'messenger', delivery_supported: false, psid: 'private-psid' }],
    intakeRows: [], diagnostics: { source_conflict: 2, phone: 'private-phone', invalid: -1 } } });
  const p = await runtime.preview();
  assert.equal(p.counts.qualified_reconciled, 3); assert.equal(p.counts.instant_forms_ready, 1);
  assert.equal(p.counts.qualified_events_expired, 1); assert.equal(p.counts.messenger_held, 1);
  assert.equal(p.rows[2].hold_reason, 'MESSENGER_MAPPING_UNVERIFIED');
  assert.deepEqual(p.diagnostics, { source_conflict: 2 });
  assert.equal(p.delivery.available, true); assert.equal(p.delivery.counts.accepted, 0);
  assert.doesNotMatch(JSON.stringify(p), /private|1234567890123456|identity_key|context_hash/);
  assert.deepEqual(calls[0].pageIds, [env.VPT_META_FEEDBACK_PAGE_ID]);
  assert.equal(calls[0].adAccountId, env.VPT_META_FEEDBACK_AD_ACCOUNT_ID);
});
test('missing ledger remains unknown while source outage/backup fail closed', async () => {
  const p = await harness({ failLedger: true }).runtime.preview();
  assert.equal(p.delivery.available, false); assert.equal(p.delivery.counts, null);
  const partial = await harness({ failGuard: true }).runtime.preview();
  assert.equal(partial.delivery.available, false); assert.equal(partial.delivery.counts, null);
  await assert.rejects(harness({ failSource: true }).runtime.preview());
  const h = harness({ primary: false }); await assert.rejects(h.runtime.preview(), /PRIMARY_REQUIRED/);
  assert.equal(h.calls.length, 0);
});
