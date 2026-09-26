function messengerEventOccurredAt(event, { strict = false } = {}) {
  const rawTimestamp = event?.timestamp;
  const supportedType = typeof rawTimestamp === 'number'
    || (typeof rawTimestamp === 'string' && /^\d+$/.test(rawTimestamp));
  const timestampMs = supportedType ? Number(rawTimestamp) : NaN;
  if (Number.isSafeInteger(timestampMs) && timestampMs > 0
      && !Number.isNaN(new Date(timestampMs).getTime())) {
    return { timestampMs, occurredAt: new Date(timestampMs).toISOString() };
  }
  if (strict) throw new Error('messenger_event_timestamp_invalid');
  // Preserve legacy message ingestion without inventing when an event happened.
  // Reports exclude messages/referrals without a valid provider timestamp.
  return { timestampMs: null, occurredAt: null };
}

async function saveMessengerAdAttribution({ supabase, pageId, contactId, event, strict = false }) {
  // `messaging_referrals` is normally top-level; a new-thread Postback can nest it.
  // Prefer a top-level referral carrying an ad_id, otherwise retain the nested shape.
  const topLevelReferral = event?.referral;
  const nestedPostbackReferral = event?.postback?.referral;
  const referral = String(topLevelReferral?.ad_id || '').trim()
    ? topLevelReferral
    : (nestedPostbackReferral || topLevelReferral);
  const adId = referral?.ad_id != null ? String(referral.ad_id).trim() : '';
  if (!adId) return null;

  const { timestampMs, occurredAt } = messengerEventOccurredAt(event, { strict });
  if (occurredAt === null) return null;
  const { data: mapping, error: mappingErr } = await supabase
    .from('facebook_ad_campaign_mappings')
    .select('campaign_id')
    .eq('fb_ad_id', adId)
    .eq('page_id', String(pageId))
    .maybeSingle();
  if (mappingErr && strict) throw new Error('messenger_mapping_read_failed', { cause: mappingErr });
  if (mappingErr) {
    console.warn('[FB attribution] mapping:', mappingErr.message);
    return null;
  }

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
      ...(strict ? { signature_verified: true } : {}),
    }, {
      onConflict: 'contact_id,page_id,fb_ad_id,fb_event_timestamp_ms',
      // A signed replay may upgrade the identical legacy event to trusted.
      // Legacy delivery must neither overwrite nor downgrade signed evidence.
      ignoreDuplicates: !strict,
    });
  if (attributionErr && strict) throw new Error('messenger_attribution_write_failed', { cause: attributionErr });
  if (attributionErr) {
    console.warn('[FB attribution] insert:', attributionErr.message);
    return null;
  }
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
  liveE2eVerified = false,
  crmLinkageRetrySafe = false,
  receiptBlockingReason = null,
}) {
  const requestedCampaignIds = uniqueText(campaignIds);
  const mapped = new Set(uniqueText(mappedCampaignIds));
  const missingCampaignMappingIds = requestedCampaignIds.filter((id) => !mapped.has(id));
  const blockingReasons = [];
  if (missingCampaignMappingIds.length) blockingReasons.push('missing_campaign_mapping');
  if (!appSecretConfigured) blockingReasons.push('fb_app_secret_not_configured');
  if (!durableWebhookDelivery) blockingReasons.push(receiptBlockingReason || 'webhook_delivery_not_durable');
  if (!liveE2eVerified) blockingReasons.push('messenger_live_e2e_not_verified');
  if (!crmLinkageRetrySafe) blockingReasons.push('crm_linkage_not_retry_safe');
  // Counts cannot support decisions while signed delivery is missing or the
  // receipt queue still has incomplete events.
  const trackingReady = missingCampaignMappingIds.length === 0
    && Boolean(appSecretConfigured) && Boolean(durableWebhookDelivery);
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
