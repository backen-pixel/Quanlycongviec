const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  VPT_DAILY_PHONE_ATTRIBUTION_POLICY,
  vietnamCalendarDate,
  isReferralEligibleForDailyPhone,
  buildPhoneAttributionReadiness,
} = require('../src/helpers/facebookMessengerCampaignAttribution');
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
assert.equal(noDataButMapped.trackingReady, true, 'zero phones is distinct from an unavailable report');
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

const fullyReadyContract = buildPhoneAttributionReadiness({
  campaignIds: ['c1'], mappedCampaignIds: ['c1'],
  appSecretConfigured: true, durableWebhookDelivery: true,
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
  "blocking_reasons: ['crm_attribution_read_failed']",
  "r.post('/ads/phone-attribution/test-exclusions', authMiddleware",
  'if (!isAdminLike(req.user))',
  'contactAllowedByFacebookScope(scope, contact)',
].forEach((required) => assert(facebookRoute.includes(required), `missing route contract: ${required}`));

console.log('facebook-messenger-campaign-attribution: ok');
