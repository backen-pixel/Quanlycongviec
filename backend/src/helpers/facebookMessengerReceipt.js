'use strict';

const { createHash, randomUUID } = require('node:crypto');

function enabledPageIds(raw = process.env.FB_DURABLE_MESSENGER_PAGE_IDS || '') {
  return new Set(String(raw).split(',').map(s => s.trim()).filter(Boolean));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}

function receiptKey(pageId, event) {
  return createHash('sha256').update(JSON.stringify(canonical({ pageId: String(pageId), event }))).digest('hex');
}

// Keep only attribution fields: do not turn arbitrary postback payload/text into a campaign.
function extractReferral(pageId, event) {
  if (event?.message?.is_echo || String(event?.sender?.id || '') === String(pageId)) return null;
  const value = event?.referral || event?.message?.referral || event?.postback?.referral;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const safe = {};
  for (const key of ['ad_id', 'ref', 'source', 'type']) {
    if (typeof value[key] === 'string' && value[key].length <= 2048) safe[key] = value[key];
  }
  if (safe.ad_id && !/^\d+$/.test(safe.ad_id)) delete safe.ad_id;
  return Object.keys(safe).length ? safe : null;
}

function assertOk(result, operation) {
  if (result?.error) {
    const err = new Error(`Facebook durable ${operation} failed`);
    err.code = result.error.code || 'FB_DURABLE_DATABASE_ERROR';
    throw err;
  }
  return result?.data;
}

async function enqueueMessengerEvents(db, entries, pages = enabledPageIds()) {
  const rows = [];
  for (const entry of entries || []) {
    if (!pages.has(String(entry.id))) continue;
    for (const event of entry.messaging || []) {
      rows.push({ event_key: receiptKey(entry.id, event), page_id: String(entry.id), payload: event });
    }
  }
  if (rows.length) assertOk(await db.from('facebook_messenger_receipts').upsert(rows, { onConflict: 'event_key', ignoreDuplicates: true }), 'enqueue');
  return rows.length;
}

async function captureMessengerReferral(db, pageId, contactId, event) {
  const referral = extractReferral(pageId, event);
  // Existing lead_attribution is broadly readable in the runtime schema.
  // Free-form ref/source/text stays only in the private receipt; mirror numeric ad evidence.
  if (!referral?.ad_id) return null;
  return assertOk(await db.rpc('facebook_capture_referral_v1', {
    p_page_id: String(pageId), p_contact_id: contactId, p_referral: { ad_id: referral.ad_id },
    p_event_key: receiptKey(pageId, event),
  }), 'capture');
}

async function linkMessengerAttribution(db, pageId, contactId) {
  return assertOk(await db.rpc('facebook_link_attribution_v1', {
    p_page_id: String(pageId), p_contact_id: contactId,
  }), 'link');
}

function createMessengerReceiptWorker({ db, processEvent, pageIds = enabledPageIds(), onError = () => {} }) {
  let draining = false;
  async function drain() {
    if (draining || !pageIds.size) return;
    draining = true;
    try {
      // Bounded batch, one event per lease. Other instances use SKIP LOCKED.
      for (let i = 0; i < 20; i++) {
        const token = randomUUID();
        const rows = assertOk(await db.rpc('facebook_claim_receipt_v1', { p_page_ids: [...pageIds], p_token: token }), 'claim');
        const row = Array.isArray(rows) ? rows[0] : rows;
        if (!row) break;
        try {
          await processEvent(row.page_id, row.payload);
          const finished = assertOk(await db.rpc('facebook_finish_receipt_v1', { p_id: row.id, p_token: token, p_success: true }), 'finish');
          if (finished !== true) {
            const lostLease = new Error('Facebook durable receipt lease lost');
            lostLease.code = 'FB_DURABLE_LEASE_LOST';
            throw lostLease;
          }
        } catch (err) {
          // No raw event, message text, phone or DB error text is logged.
          await db.rpc('facebook_finish_receipt_v1', { p_id: row.id, p_token: token, p_success: false });
          onError(err.code || 'FB_DURABLE_PROCESSING_ERROR');
        }
      }
    } catch (err) { onError(err.code || 'FB_DURABLE_WORKER_ERROR'); }
    finally { draining = false; }
  }
  return { drain };
}

module.exports = { enabledPageIds, receiptKey, extractReferral, enqueueMessengerEvents, captureMessengerReferral, linkMessengerAttribution, createMessengerReceiptWorker };
