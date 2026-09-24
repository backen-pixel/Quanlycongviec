function messengerEventOccurredAt(event) {
  const timestampMs = Number(event?.timestamp);
  if (Number.isFinite(timestampMs) && timestampMs > 0) {
    return { timestampMs, occurredAt: new Date(timestampMs).toISOString() };
  }
  const now = Date.now();
  return { timestampMs: now, occurredAt: new Date(now).toISOString() };
}

async function saveMessengerAdAttribution({ supabase, pageId, contactId, event }) {
  const referral = event?.referral;
  const adId = referral?.ad_id != null ? String(referral.ad_id).trim() : '';
  if (!adId) return null;

  const { timestampMs, occurredAt } = messengerEventOccurredAt(event);
  const { data: mapping, error: mappingErr } = await supabase
    .from('facebook_ad_campaign_mappings')
    .select('campaign_id')
    .eq('fb_ad_id', adId)
    .eq('page_id', String(pageId))
    .maybeSingle();
  if (mappingErr) console.warn('[FB attribution] mapping:', mappingErr.message);

  const campaignId = mapping?.campaign_id || null;
  const { error: attributionErr } = await supabase
    .from('facebook_messenger_ad_attributions')
    .upsert({
      contact_id: contactId,
      page_id: String(pageId),
      fb_ad_id: adId,
      campaign_id: campaignId,
      referral_source: referral?.source || null,
      referral_type: referral?.type || null,
      referral,
      attributed_at: occurredAt,
      fb_event_timestamp_ms: timestampMs,
    }, {
      onConflict: 'contact_id,page_id,fb_ad_id,fb_event_timestamp_ms',
      ignoreDuplicates: true,
    });
  if (attributionErr) console.warn('[FB attribution] insert:', attributionErr.message);
  return campaignId;
}

const VPT_DAILY_PHONE_ATTRIBUTION_POLICY = Object.freeze({
  timezone: 'Asia/Ho_Chi_Minh',
  referral_window: 'same_vietnam_day',
  referral_must_precede_phone: true,
  excludes_explicit_e2e_tests: true,
});

function vietnamCalendarDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: VPT_DAILY_PHONE_ATTRIBUTION_POLICY.timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isReferralEligibleForDailyPhone({ referralOccurredAt, phoneOccurredAt }) {
  const referral = new Date(referralOccurredAt);
  const phone = new Date(phoneOccurredAt);
  if (Number.isNaN(referral.getTime()) || Number.isNaN(phone.getTime())) return false;
  return referral.getTime() <= phone.getTime()
    && vietnamCalendarDate(referral) === vietnamCalendarDate(phone);
}

function uniqueText(values) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function buildPhoneAttributionReadiness({
  campaignIds,
  mappedCampaignIds,
  appSecretConfigured,
  durableWebhookDelivery = false,
}) {
  const requestedCampaignIds = uniqueText(campaignIds);
  const mapped = new Set(uniqueText(mappedCampaignIds));
  const missingCampaignMappingIds = requestedCampaignIds.filter((id) => !mapped.has(id));
  const blockingReasons = [];
  if (missingCampaignMappingIds.length) blockingReasons.push('missing_campaign_mapping');
  if (!appSecretConfigured) blockingReasons.push('fb_app_secret_not_configured');
  if (!durableWebhookDelivery) blockingReasons.push('webhook_delivery_not_durable');
  // An unsigned webhook can forge campaign attribution, so it is not tracking-ready.
  const trackingReady = missingCampaignMappingIds.length === 0 && Boolean(appSecretConfigured);
  return {
    trackingReady,
    automationReady: trackingReady && blockingReasons.length === 0,
    missingCampaignMappingIds,
    blockingReasons,
    policy: VPT_DAILY_PHONE_ATTRIBUTION_POLICY,
  };
}

module.exports = {
  messengerEventOccurredAt,
  saveMessengerAdAttribution,
  VPT_DAILY_PHONE_ATTRIBUTION_POLICY,
  vietnamCalendarDate,
  isReferralEligibleForDailyPhone,
  buildPhoneAttributionReadiness,
};
