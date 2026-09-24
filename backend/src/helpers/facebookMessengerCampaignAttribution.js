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

module.exports = {
  messengerEventOccurredAt,
  saveMessengerAdAttribution,
};
