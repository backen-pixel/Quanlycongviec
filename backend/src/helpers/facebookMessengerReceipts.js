const { createHash } = require('crypto');
const { facebookAppSecretConfigured } = require('./facebookWebhookSignature');

// Opt in per Page after migration 637. An empty list never enables every tenant.
function durableMessengerPageIds(env = process.env) {
  if (env.FB_MESSENGER_DURABLE_DELIVERY !== '1') return [];
  return [...new Set(String(env.FB_MESSENGER_DURABLE_PAGE_IDS || '')
    .split(',').map((id) => id.trim()).filter((id) => /^\d+$/.test(id)))];
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function receiptForEvent(pageId, event) {
  const page = String(pageId);
  const sender = String(event?.sender?.id || '');
  const recipient = String(event?.recipient?.id || '');
  const partner = sender && sender !== page ? sender : recipient && recipient !== page ? recipient : '';
  if (!partner) throw new Error('messenger_receipt_partner_missing');
  const timestamp = Number(event?.timestamp);
  return {
    receipt_key: createHash('sha256').update(`${page}\n${canonicalJson(event)}`).digest('hex'),
    page_id: page,
    partner_psid: partner,
    event,
    event_timestamp_ms: Number.isSafeInteger(timestamp) && timestamp > 0 ? timestamp : null,
  };
}

async function persistMessengerReceipts({ supabase, body, pageIds, signatureValid }) {
  const allowed = new Set(pageIds || []);
  const receipts = new Map();
  if (body?.object !== 'page') return 0;
  for (const entry of body.entry || []) {
    if (!allowed.has(String(entry.id))) continue;
    for (const event of entry.messaging || []) {
      if (!signatureValid) throw new Error('durable_messenger_requires_valid_signature');
      const receipt = receiptForEvent(entry.id, event);
      receipts.set(receipt.receipt_key, receipt);
    }
  }
  if (!receipts.size) return 0;
  // A single transaction persists the entire accepted batch before HTTP 200.
  const { error } = await supabase.from('facebook_messenger_webhook_receipts')
    .upsert([...receipts.values()], { onConflict: 'receipt_key', ignoreDuplicates: true });
  if (error) throw new Error('messenger_receipt_persist_failed', { cause: error });
  return receipts.size;
}

async function receiptRpc(supabase, name, params) {
  const { data, error } = await supabase.rpc(`facebook_messenger_receipts_${name}`, params);
  if (error) throw new Error(`messenger_receipt_${name}_failed`, { cause: error });
  return data;
}

function createMessengerReceiptWorker({ supabase, processEvent, runIfLeader = async (_key, fn) => fn(),
  env = process.env, logger = console, intervalMs = 5000, leaseSeconds = 180 }) {
  let timer = null;
  let running = false;
  let stopped = false;

  async function processReceipt(row) {
    const params = { p_receipt_key: row.receipt_key, p_lease_token: row.lease_token };
    let leaseLost = false;
    let renewing = false;
    const renewal = setInterval(async () => {
      if (renewing) return;
      renewing = true;
      try {
        if (!await receiptRpc(supabase, 'renew', { ...params, p_lease_seconds: leaseSeconds })) leaseLost = true;
      } catch (_) { leaseLost = true; }
      finally { renewing = false; }
    }, Math.max(1000, Math.floor(leaseSeconds * 1000 / 3)));
    renewal.unref?.();
    try {
      await processEvent(row.page_id, row.event, { durable: true });
      if (leaseLost || !await receiptRpc(supabase, 'finish', params)) {
        throw new Error('messenger_receipt_lease_lost');
      }
    } catch (error) {
      // Do not persist/log error text that could include message contents, phones or tokens.
      const code = /^messenger_[a-z_]+$/.test(String(error?.message)) ? error.message : 'messenger_processing_failed';
      logger.warn('[FB receipts]', code, row.receipt_key);
      if (!leaseLost) await receiptRpc(supabase, 'fail', { ...params, p_error: code });
    } finally {
      clearInterval(renewal);
    }
  }

  async function tick() {
    const pageIds = durableMessengerPageIds(env);
    if (running || stopped || !pageIds.length || !facebookAppSecretConfigured(env)) return;
    running = true;
    try {
      await runIfLeader('facebook-messenger-receipts', async () => {
        // Claim immediately before work, so no batch item waits while its lease expires.
        for (let count = 0; count < 10 && !stopped; count += 1) {
          const rows = await receiptRpc(supabase, 'claim', {
            p_limit: 1, p_lease_seconds: leaseSeconds, p_page_ids: pageIds,
          });
          if (!Array.isArray(rows) || !rows.length) break;
          await processReceipt(rows[0]);
        }
      }, { ttlSec: leaseSeconds });
    } catch (_) {
      logger.warn('[FB receipts] queue unavailable; receipts remain pending for retry');
    } finally { running = false; }
  }

  function start() {
    if (timer || !durableMessengerPageIds(env).length || !facebookAppSecretConfigured(env)) return;
    stopped = false;
    void tick();
    timer = setInterval(() => void tick(), intervalMs);
    timer.unref?.();
  }
  function stop() { stopped = true; if (timer) clearInterval(timer); timer = null; }
  return { start, stop, tick };
}

async function messengerReceiptHealth({ supabase, pageIds, env = process.env }) {
  const configured = new Set(durableMessengerPageIds(env));
  const requested = [...new Set((pageIds || []).map(String))];
  if (!requested.length || requested.some((id) => !configured.has(id))) {
    return { ready: false, reason: 'webhook_delivery_not_durable' };
  }
  const rows = await receiptRpc(supabase, 'health', { p_page_ids: requested });
  const health = Array.isArray(rows) ? rows[0] : null;
  if (!health) return { ready: false, reason: 'webhook_receipt_health_unknown' };
  const rawCounts = ['pending_count', 'processing_count', 'dead_count'].map((key) => health[key]);
  // A missing/null/boolean value is not evidence of an empty queue. PostgREST
  // can encode bigint counts as numbers or decimal strings; reject other shapes.
  const validCounts = rawCounts.every((value) =>
    (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value)))
      && Number.isSafeInteger(Number(value)) && Number(value) >= 0);
  if (!validCounts) return { ready: false, reason: 'webhook_receipt_health_unknown' };
  const counts = rawCounts.map(Number);
  return { ready: counts.every((n) => n === 0), reason: counts.some((n) => n > 0) ? 'webhook_receipts_unprocessed' : null, ...health };
}

module.exports = { durableMessengerPageIds, canonicalJson, receiptForEvent,
  persistMessengerReceipts, createMessengerReceiptWorker, messengerReceiptHealth };
