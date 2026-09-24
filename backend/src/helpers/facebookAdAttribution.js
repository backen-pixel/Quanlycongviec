const { createHash } = require('node:crypto');

// Explicit referral evidence only: never parse ad IDs from customer text.
function normalizeMessengerAdTouch(pageId, event, contactId) {
  if (!event || event.message?.is_echo || String(event.sender?.id || '') === String(pageId)) return null;
  const candidates = [event.referral, event.message?.referral, event.postback?.referral]
    .filter(r => r && r.source === 'ADS' && typeof r.ad_id === 'string' && /^[0-9]{5,30}$/.test(r.ad_id));
  const ids = [...new Set(candidates.map(r => r.ad_id))];
  if (ids.length !== 1 || !contactId || !/^[0-9]+$/.test(String(pageId))) return null;
  const timestamp = Number(event.timestamp);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0 || !Number.isFinite(new Date(timestamp).getTime())) return null;
  const occurredAt = new Date(timestamp).toISOString();
  const eventKey = createHash('sha256').update(JSON.stringify([String(pageId), contactId, ids[0], occurredAt])).digest('hex');
  return { event_key: eventKey, contact_id: contactId, page_id: String(pageId), ad_id: ids[0],
    occurred_at: occurredAt, evidence_source: 'messenger_referral', verification_status: 'unverified_webhook' };
}
async function captureMessengerAdTouch(db, pageId, event, contactId) {
  const row = normalizeMessengerAdTouch(pageId, event, contactId);
  if (!row) return false;
  const { data: page, error: pageError } = await db.from('facebook_pages').select('default_company_id').eq('page_id', String(pageId)).maybeSingle();
  if (pageError) throw pageError;
  if (!page?.default_company_id) return false;
  row.company_id = page.default_company_id;
  const { error } = await db.from('facebook_ad_touches').upsert(row, { onConflict: 'event_key', ignoreDuplicates: true });
  if (error) throw error;
  return true;
}
function responseSla(receivedAt, humanReplyAt, now = Date.now()) {
  const start = Date.parse(receivedAt);
  if (!Number.isFinite(start)) return { status: 'UNKNOWN', seconds: null };
  const end = humanReplyAt == null ? Number(now) : Date.parse(humanReplyAt);
  if (!Number.isFinite(end) || end < start) return { status: 'UNKNOWN', seconds: null };
  const seconds = (end - start) / 1000;
  return { status: humanReplyAt == null ? (seconds >= 300 ? 'OVERDUE' : seconds >= 180 ? 'DUE_SOON' : 'WAITING') : (seconds < 300 ? 'MET' : 'MISSED'), seconds };
}
module.exports = { normalizeMessengerAdTouch, captureMessengerAdTouch, responseSla };
