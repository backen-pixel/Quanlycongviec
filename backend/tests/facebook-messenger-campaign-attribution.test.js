const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  VPT_DAILY_PHONE_ATTRIBUTION_POLICY,
  vietnamCalendarDate,
  isReferralEligibleForDailyPhone,
  buildPhoneAttributionReadiness,
  saveMessengerAdAttribution,
  messengerEventOccurredAt,
} = require('../src/helpers/facebookMessengerCampaignAttribution');
const { vnDateStartIso, vnNextDateStartIso } = require('../src/helpers/facebookContactActivity');
const {
  facebookWebhookSignatureIsValid,
  verifyFacebookWebhookSignature,
} = require('../src/helpers/facebookWebhookSignature');

const repoRoot = path.resolve(__dirname, '..', '..');
const migration636 = fs.readFileSync(
  path.join(repoRoot, 'database', '636_facebook_messenger_campaign_attribution_hardening.sql'),
  'utf8',
);
const facebookRoute = fs.readFileSync(path.join(repoRoot, 'backend', 'src', 'routes', 'facebook.js'), 'utf8');

assert.equal(VPT_DAILY_PHONE_ATTRIBUTION_POLICY.timezone, 'Asia/Ho_Chi_Minh');
assert.equal(vietnamCalendarDate('2026-09-24T16:59:00.000Z'), '2026-09-24');
assert.equal(vietnamCalendarDate('2026-09-24T17:01:00.000Z'), '2026-09-25');
const reportDayStart = new Date(vnDateStartIso('2026-09-24'));
const reportDayExclusiveEnd = new Date(vnNextDateStartIso('2026-09-24'));
assert.equal(reportDayExclusiveEnd.toISOString(), '2026-09-24T17:00:00.000Z');
assert(new Date('2026-09-24T16:59:59.999Z') < reportDayExclusiveEnd,
  'the final VN millisecond remains inside the exclusive reporting window');
assert.equal(new Date('2026-09-24T17:00:00.000Z').getTime(), reportDayExclusiveEnd.getTime());
assert.equal(reportDayExclusiveEnd.getTime() - reportDayStart.getTime(), 24 * 60 * 60 * 1000);

assert.equal(isReferralEligibleForDailyPhone({
  referralOccurredAt: '2026-09-24T14:00:00.000Z',
  phoneOccurredAt: '2026-09-24T15:00:00.000Z',
}), true, 'delayed delivery is safe when Meta timestamps are same VN day');
assert.equal(isReferralEligibleForDailyPhone({
  referralOccurredAt: '2026-09-24T16:59:00.000Z',
  phoneOccurredAt: '2026-09-24T17:01:00.000Z',
}), false, 'overnight referral is intentionally not credited');
assert.equal(isReferralEligibleForDailyPhone({
  referralOccurredAt: '2026-09-24T15:01:00.000Z',
  phoneOccurredAt: '2026-09-24T15:00:00.000Z',
}), false, 'referral after a phone cannot be credited');

const noDataButMapped = buildPhoneAttributionReadiness({
  campaignIds: ['c1', 'c2'],
  mappedCampaignIds: ['c1', 'c2'],
  appSecretConfigured: true,
});
assert.equal(noDataButMapped.trackingReady, false, 'mapping alone cannot prove complete signed delivery');
assert.equal(noDataButMapped.automationReady, false);
assert.deepEqual(noDataButMapped.missingCampaignMappingIds, []);
assert(noDataButMapped.blockingReasons.includes('webhook_delivery_not_durable'));

const unsignedWebhook = buildPhoneAttributionReadiness({
  campaignIds: ['c1'], mappedCampaignIds: ['c1'], appSecretConfigured: false,
});
assert.equal(unsignedWebhook.trackingReady, false);
assert(unsignedWebhook.blockingReasons.includes('fb_app_secret_not_configured'));

const missingMap = buildPhoneAttributionReadiness({
  campaignIds: ['c1', 'c2'],
  mappedCampaignIds: ['c1'],
  appSecretConfigured: true,
  durableWebhookDelivery: true,
});
assert.equal(missingMap.trackingReady, false);
assert.equal(missingMap.automationReady, false);
assert.deepEqual(missingMap.missingCampaignMappingIds, ['c2']);

const queueOnly = buildPhoneAttributionReadiness({
  campaignIds: ['c1'], mappedCampaignIds: ['c1'],
  appSecretConfigured: true, durableWebhookDelivery: true,
});
assert.equal(queueOnly.automationReady, false);
assert.equal(queueOnly.trackingReady, true, 'complete signed delivery may report a legitimate zero');
assert(queueOnly.blockingReasons.includes('messenger_live_e2e_not_verified'));
assert(queueOnly.blockingReasons.includes('crm_linkage_not_retry_safe'));

const fullyReadyContract = buildPhoneAttributionReadiness({
  campaignIds: ['c1'], mappedCampaignIds: ['c1'],
  appSecretConfigured: true, durableWebhookDelivery: true,
  liveE2eVerified: true, crmLinkageRetrySafe: true,
});
assert.equal(fullyReadyContract.automationReady, true);
const rawBody = '{"object":"page","entry":[]}';
const appSecret = 'unit-test-secret';
const signature = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
assert.equal(facebookWebhookSignatureIsValid({ rawBody, signature, appSecret }), true);
assert.equal(facebookWebhookSignatureIsValid({ rawBody: Buffer.from(rawBody), signature, appSecret }), true);
assert.equal(facebookWebhookSignatureIsValid({ rawBody, signature: `${signature}00`, appSecret }), false);
assert.deepEqual(
  verifyFacebookWebhookSignature({ rawBody, signature, env: {} }),
  { configured: false, valid: false, reason: 'fb_app_secret_not_configured' },
);
assert.equal(
  verifyFacebookWebhookSignature({ rawBody, signature, env: { FB_APP_SECRET: appSecret } }).valid,
  true,
);

async function capturedAttribution(event) {
  const writes = [];
  const supabase = {
    from(table) {
      if (table === 'facebook_ad_campaign_mappings') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: { campaign_id: 'c1' }, error: null }) }),
            }),
          }),
        };
      }
      if (table === 'facebook_messenger_ad_attributions') {
        return {
          upsert: async (payload) => {
            writes.push(payload);
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
  const campaignId = await saveMessengerAdAttribution({
    supabase, pageId: 'page-1', contactId: 'contact-1', event,
  });
  assert.equal(campaignId, 'c1');
  assert.equal(writes.length, 1);
  return writes[0];
}

for (const timestamp of [undefined, null, 0, -1, '', 'bad', true, {}, [], [123], 1.5,
  Number.MAX_SAFE_INTEGER, 1e30, Infinity, '1.2', ' 123 ']) {
  assert.deepEqual(messengerEventOccurredAt({ timestamp }), { timestampMs: null, occurredAt: null });
  assert.throws(() => messengerEventOccurredAt({ timestamp }, { strict: true }),
    /messenger_event_timestamp_invalid/);
}
const preciseEventTime = 1790300000123;
assert.deepEqual(messengerEventOccurredAt({ timestamp: String(preciseEventTime) }, { strict: true }), {
  timestampMs: preciseEventTime,
  occurredAt: new Date(preciseEventTime).toISOString(),
});

async function assertPersistenceFailuresAndTrust() {
  const writes = [];
  let mappingError = null;
  let writeError = null;
  const supabase = {
    from(table) {
      if (table === 'facebook_ad_campaign_mappings') return {
        select: () => ({ eq: () => ({ eq: () => ({
          maybeSingle: async () => ({ data: mappingError ? null : { campaign_id: 'c1' }, error: mappingError }),
        }) }) }),
      };
      if (table === 'facebook_messenger_ad_attributions') return {
        upsert: async (payload, options) => {
          writes.push({ payload, options });
          return { error: writeError };
        },
      };
      throw new Error(`unexpected table: ${table}`);
    },
  };
  const args = { supabase, pageId: 'page-1', contactId: 'contact-1',
    event: { timestamp: preciseEventTime, referral: { ad_id: 'a1', source: 'ADS' } } };
  assert.equal(await saveMessengerAdAttribution(args), 'c1');
  assert.equal(Object.hasOwn(writes[0].payload, 'signature_verified'), false,
    'legacy ingestion neither sets nor downgrades trust');
  assert.equal(writes[0].options.ignoreDuplicates, true);
  assert.equal(await saveMessengerAdAttribution({ ...args, strict: true }), 'c1');
  assert.equal(writes[1].payload.signature_verified, true);
  assert.equal(writes[1].options.ignoreDuplicates, false, 'signed replay upgrades identical legacy key');
  mappingError = { message: 'synthetic mapping failure' };
  await assert.rejects(saveMessengerAdAttribution({ ...args, strict: true }), /messenger_mapping_read_failed/);
  assert.equal(writes.length, 2, 'mapping failure does not persist a misleading unassigned event');
  const originalWarn = console.warn;
  try {
    console.warn = () => {};
    assert.equal(await saveMessengerAdAttribution(args), null, 'legacy mapping failure is not reported as success');
  } finally {
    console.warn = originalWarn;
  }
  mappingError = null;
  writeError = { message: 'synthetic persistence failure' };
  await assert.rejects(saveMessengerAdAttribution({ ...args, strict: true }), /messenger_attribution_write_failed/);
  try {
    console.warn = () => {};
    assert.equal(await saveMessengerAdAttribution(args), null, 'legacy write failure is not reported as success');
  } finally {
    console.warn = originalWarn;
  }
  const beforeInvalid = writes.length;
  assert.equal(await saveMessengerAdAttribution({ ...args, event: { referral: { ad_id: 'a1' } } }), null);
  await assert.rejects(saveMessengerAdAttribution({ ...args, strict: true,
    event: { timestamp: 1e30, referral: { ad_id: 'a1' } } }), /messenger_event_timestamp_invalid/);
  assert.equal(writes.length, beforeInvalid, 'invalid event time cannot create attribution');
}

[
  'ALTER TABLE public.facebook_ad_campaign_mappings ENABLE ROW LEVEL SECURITY;',
  'ALTER TABLE public.facebook_messenger_ad_attributions ENABLE ROW LEVEL SECURITY;',
  'REVOKE ALL ON TABLE public.facebook_ad_campaign_mappings FROM PUBLIC, anon, authenticated;',
  'REVOKE ALL ON FUNCTION public.fb_campaign_phone_numbers_in_range(TEXT[], TEXT[], TIMESTAMPTZ, TIMESTAMPTZ)',
  'AND ma.page_id = pm.page_id',
  'AND ma.attributed_at >= p_from',
  'AND ma.attributed_at <= pm.occurred_at',
  'WHERE e.facebook_message_id = m.id',
  'COUNT(DISTINCT x.contact_id)::BIGINT',
].forEach((required) => assert(migration636.includes(required), `missing SQL contract: ${required}`));
[
  "const phoneByCampaign = Object.fromEntries(campaignIds.map((campaignId) => [campaignId, 0]));",
  'automation_ready: readiness.automationReady',
  'p_to: vnNextDateStartIso(date),',
  "blocking_reasons: ['crm_attribution_read_failed']",
  "r.post('/ads/phone-attribution/test-exclusions', authMiddleware",
  'if (!isAdminLike(req.user))',
  'contactAllowedByFacebookScope(scope, contact)',
].forEach((required) => assert(facebookRoute.includes(required), `missing route contract: ${required}`));

Promise.all([
  capturedAttribution({
    timestamp: 1727190000000,
    referral: { ad_id: 'top-level-ad', source: 'ADS' },
  }),
  capturedAttribution({
    timestamp: 1727190000000,
    postback: { referral: { ad_id: 'nested-postback-ad', source: 'ADS' } },
  }),
  assertPersistenceFailuresAndTrust(),
]).then(([topLevel, nestedPostback]) => {
  assert.equal(topLevel.fb_ad_id, 'top-level-ad');
  assert.equal(nestedPostback.fb_ad_id, 'nested-postback-ad');
  assert.equal(nestedPostback.referral.ad_id, 'nested-postback-ad');
  console.log('facebook-messenger-campaign-attribution: ok');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
