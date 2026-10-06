'use strict';

const { createHash, createHmac, timingSafeEqual, randomUUID } = require('node:crypto');
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_EVENTS = 100;
const fail = (code, status = 503) => Object.assign(new Error(code), { code, status });
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function canonical(value, depth = 0) {
  if (depth > 40) throw fail('FB_INBOX_INVALID_ENVELOPE', 400);
  if (Array.isArray(value)) return value.map(item => canonical(item, depth + 1));
  if (record(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key], depth + 1)]));
  return value;
}

function inboxSettings(env = process.env) {
  const managedPages = new Set(String(env.VPT_FB_MANAGED_PAGE_IDS || '').split(',').map(x => x.trim()).filter(Boolean));
  if ([...managedPages].some(x => !/^\d{1,32}$/.test(x))) throw fail('FB_INBOX_INVALID_CONFIG');
  const enabled = env.VPT_FB_PAGE_INBOX === '1';
  const scopeGuard = env.VPT_FB_LEGACY_SCOPE_GUARD === '1';
  const leadAdsIntake = env.VPT_FB_LEAD_ADS_INTAKE === '1';
  const dedicatedLeadApp = env.VPT_FB_LEAD_APP_MODE === '1';
  // Meta verifies the callback before the Lead App can be cut over. The GET
  // challenge needs only the dedicated App secret and verify token; POST intake
  // remains controlled by dedicatedLeadApp and the existing scope gates.
  const dedicatedLeadAppVerification = typeof env.VPT_FB_LEAD_APP_SECRET === 'string'
    && env.VPT_FB_LEAD_APP_SECRET.length >= 16
    && (!env.VPT_FACEBOOK_APP_SECRET || env.VPT_FB_LEAD_APP_SECRET !== env.VPT_FACEBOOK_APP_SECRET)
    && typeof env.VPT_FB_LEAD_APP_VERIFY_TOKEN === 'string'
    && env.VPT_FB_LEAD_APP_VERIFY_TOKEN.length >= 16;
  if (leadAdsIntake && (!enabled || !scopeGuard || !managedPages.size)) throw fail('FB_INBOX_INVALID_CONFIG');
  if (dedicatedLeadApp && (!leadAdsIntake || managedPages.size !== 1
      || !managedPages.has(env.VPT_FB_LEAD_APP_PAGE_ID)
      || !dedicatedLeadAppVerification
      || typeof env.VPT_FB_LEAD_APP_ACCESS_TOKEN !== 'string' || !env.VPT_FB_LEAD_APP_ACCESS_TOKEN.trim())) {
    throw fail('FB_INBOX_INVALID_CONFIG');
  }
  return {
    enabled,
    paused: env.VPT_FB_PAGE_INBOX_WORKER_PAUSED !== '0',
    scopeGuard,
    leadAdsIntake,
    dedicatedLeadApp,
    dedicatedLeadAppVerification,
    managedPages,
  };
}

function isManagedLeadAdsContact(settings, contact) {
  return settings.leadAdsIntake === true && settings.managedPages.has(String(contact?.page_id))
    && typeof contact?.psid === 'string' && contact.psid.startsWith('leadad_');
}

function rowsFromBody(body) {
  if (!record(body) || body.object !== 'page' || !Array.isArray(body.entry)
      || !body.entry.length || body.entry.length > MAX_EVENTS) throw fail('FB_INBOX_INVALID_ENVELOPE', 400);
  const rows = [];
  const add = (pageId, kind, event) => {
    if (!record(event)) throw fail('FB_INBOX_INVALID_ENVELOPE', 400);
    const payload = canonical({ kind, event });
    const eventKey = createHash('sha256').update(JSON.stringify({ pageId, payload })).digest('hex');
    rows.push({ event_key: eventKey, page_id: pageId, payload });
    if (rows.length > MAX_EVENTS) throw fail('FB_INBOX_TOO_MANY_EVENTS', 400);
  };
  for (const entry of body.entry) {
    if (!record(entry) || typeof entry.id !== 'string' || !/^\d{1,32}$/.test(entry.id)) throw fail('FB_INBOX_INVALID_ENVELOPE', 400);
    for (const field of ['messaging', 'changes']) {
      if (entry[field] !== undefined && !Array.isArray(entry[field])) throw fail('FB_INBOX_INVALID_ENVELOPE', 400);
      for (const event of entry[field] || []) add(entry.id, field === 'messaging' ? 'messaging' : 'change', event);
    }
    // Preserve unknown entry-level events too. Envelope time is not part of known event identity.
    const extra = Object.fromEntries(Object.entries(entry).filter(([key]) => !['id', 'time', 'messaging', 'changes'].includes(key)));
    if (Object.keys(extra).length || !(entry.messaging?.length || entry.changes?.length)) {
      add(entry.id, 'entry', { ...extra, ...(entry.time === undefined ? {} : { time: entry.time }) });
    }
  }
  return rows;
}

function signedDelivery(raw, signature, secret) {
  if (typeof secret !== 'string' || secret.length < 16) throw fail('FB_INBOX_SECRET_UNAVAILABLE');
  if (!Buffer.isBuffer(raw) || raw.length === 0 || raw.length > MAX_BYTES) throw fail('FB_INBOX_INVALID_BODY', 400);
  if (typeof signature !== 'string' || !/^sha256=[0-9a-f]{64}$/i.test(signature)) throw fail('FB_INBOX_INVALID_SIGNATURE', 403);
  const expected = createHmac('sha256', secret).update(raw).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'))) throw fail('FB_INBOX_INVALID_SIGNATURE', 403);
  let body;
  try { body = JSON.parse(raw.toString('utf8')); } catch { throw fail('FB_INBOX_INVALID_ENVELOPE', 400); }
  return { body, rows: rowsFromBody(body) };
}

function signedRows(raw, signature, secret) {
  return signedDelivery(raw, signature, secret).rows;
}

function safeCode(error) {
  const code = error?.code;
  return typeof code === 'string' && /^FB_(?:INBOX|DURABLE)_[A-Z_]{1,64}$/.test(code) ? code : 'FB_INBOX_OPERATION_FAILED';
}

async function rpc(db, name, args) {
  let result;
  try { result = await db.rpc(name, args); } catch { throw fail('FB_INBOX_DATABASE_UNAVAILABLE'); }
  if (!result || result.error) throw fail('FB_INBOX_DATABASE_UNAVAILABLE');
  return result.data;
}

function assertPrimary(isPrimary) {
  if (isPrimary() !== true) throw fail('FB_INBOX_PRIMARY_REQUIRED');
}

function createPageInboxReceiver({ db, isPrimary, secret, withPrimary = fn => fn(), onError = () => {} }) {
  return async function receive(req, res) {
    try {
      const rows = signedRows(req.facebookRawBody, req.headers?.['x-hub-signature-256'], secret());
      assertPrimary(isPrimary);
      const accepted = await withPrimary(() => rpc(db, 'facebook_page_inbox_enqueue_v1', { p_rows: rows }));
      assertPrimary(isPrimary);
      if (accepted !== rows.length) throw fail('FB_INBOX_ENQUEUE_NOT_CONFIRMED');
      // Never ACK before the single transaction confirmed the entire batch, including duplicates.
      return res.sendStatus(200);
    } catch (error) {
      onError(safeCode(error));
      return res.sendStatus([400, 403].includes(error.status) ? error.status : 503);
    }
  };
}

// A second Meta App has its own callback and signing key. Reject any non-lead
// delivery as a whole so this endpoint can never become a Messenger writer.
function createDedicatedLeadAdsReceiver({ db, isPrimary, secret, managedPages,
  withPrimary = fn => fn(), onError = () => {} }) {
  const pages = new Set(managedPages);
  if (pages.size !== 1 || [...pages].some(id => typeof id !== 'string' || !/^\d{1,32}$/.test(id))) {
    throw fail('FB_INBOX_INVALID_CONFIG');
  }
  return async function receive(req, res) {
    try {
      const rows = signedRows(req.facebookRawBody, req.headers?.['x-hub-signature-256'], secret());
      if (!rows.length || rows.some(row => {
        const value = row.payload.event?.value;
        return !pages.has(row.page_id) || row.payload.kind !== 'change'
          || row.payload.event?.field !== 'leadgen' || !record(value)
          || !/^\d{1,32}$/.test(value.form_id) || !/^\d{1,32}$/.test(value.leadgen_id)
          || (value.page_id !== undefined && value.page_id !== row.page_id)
          || (value.ad_id !== undefined && !/^\d{1,32}$/.test(value.ad_id));
      })) throw fail('FB_INBOX_DEDICATED_EVENT_REJECTED', 400);
      assertPrimary(isPrimary);
      const accepted = await withPrimary(() => rpc(db, 'facebook_page_inbox_enqueue_v1', { p_rows: rows }));
      assertPrimary(isPrimary);
      if (accepted !== rows.length) throw fail('FB_INBOX_ENQUEUE_NOT_CONFIRMED');
      return res.sendStatus(200);
    } catch (error) {
      onError(safeCode(error));
      return res.sendStatus([400, 403].includes(error.status) ? error.status : 503);
    }
  };
}

// Scoped cutover: every form on an explicitly managed Page belongs to the new
// intake contract, including unbound forms that must remain pending for review.
// Other events retain their existing delivery path and never enter this inbox.
function createLeadAdsWebhookHandoff({ db, isPrimary, secret, managedPages,
  enqueueLegacy, withPrimary = fn => fn(), dedicatedLeadApp = false }) {
  const pages = new Set(managedPages);
  if (!pages.size || [...pages].some(id => typeof id !== 'string' || !/^\d{1,32}$/.test(id))
      || typeof enqueueLegacy !== 'function') throw fail('FB_INBOX_INVALID_CONFIG');
  return async function handoff(req) {
    // The existing Messenger callback was already operating without an App
    // signing key. In dedicated mode it keeps that path and filters managed
    // leadgen; only the new Lead callback accepts signed Lead events. This
    // avoids requiring credentials for the unavailable Messenger App owner.
    const { body, rows } = dedicatedLeadApp
      ? { body: req.body, rows: [] }
      : signedDelivery(req.facebookRawBody, req.headers?.['x-hub-signature-256'], secret());
    const selected = (pageId, event) => pages.has(pageId) && event?.field === 'leadgen';
    const leadRows = rows.filter(row => row.payload.kind === 'change' && selected(row.page_id, row.payload.event));
    // Preserve the old callback's envelope behavior in dedicated mode. Its
    // Messenger and other events must not inherit the new Lead inbox limits.
    const legacyBody = dedicatedLeadApp && (!record(body) || body.object !== 'page' || !Array.isArray(body.entry))
      ? body
      : { ...body, entry: body.entry.map(entry => (record(entry) && Array.isArray(entry.changes)
        ? { ...entry, changes: entry.changes.filter(event => !selected(entry.id, event)) }
        : entry)) };
    if (leadRows.length && !dedicatedLeadApp) {
      assertPrimary(isPrimary);
      const accepted = await withPrimary(() => rpc(db, 'facebook_page_inbox_enqueue_v1', { p_rows: leadRows }));
      assertPrimary(isPrimary);
      if (accepted !== leadRows.length) throw fail('FB_INBOX_ENQUEUE_NOT_CONFIRMED');
    }
    // These are separate idempotent queue writes, not one cross-queue transaction.
    // If the second write fails, the caller returns 503; replay safely re-enqueues
    // the first batch. Legacy inline processing starts only after both succeed.
    if (legacyBody?.object === 'page') {
      try { await enqueueLegacy(legacyBody); } catch { throw fail('FB_INBOX_LEGACY_ENQUEUE_FAILED'); }
    }
    if (leadRows.length && !dedicatedLeadApp) assertPrimary(isPrimary);
    return legacyBody;
  };
}

async function assertLegacyQueueDrained(db) {
  const result = await db.from('facebook_messenger_receipts').select('id', { head: true, count: 'exact' }).neq('status', 'done');
  if (!result || result.error || result.count !== 0) throw fail('FB_INBOX_LEGACY_QUEUE_PENDING');
}

async function assertPageLegacyScope(db, pageId, settings) {
  if (!settings.managedPages.has(String(pageId))) return;
  if (!settings.scopeGuard) throw fail('FB_INBOX_SCOPE_GUARD_REQUIRED');
  const scope = { pageIds: [String(pageId)], contactIds: [], leadIds: [], customerIds: [] };
  const result = await rpc(db, 'crm_care_legacy_write_check', { p_scope: scope });
  if (!record(result) || result.policy !== 'CARE_LEGACY_WRITE_CHECK_V1' || result.reservationMade !== false
      || typeof result.allowed !== 'boolean' || !record(result.scope)
      || Object.keys(result.scope).length !== 4 || Object.keys(scope).some(key => JSON.stringify(result.scope[key]) !== JSON.stringify(scope[key]))
      || typeof result.observedAt !== 'string' || !Number.isFinite(Date.parse(result.observedAt))
      || result.reason !== (result.allowed ? 'LEGACY_SCOPE' : 'MANAGED_PAGE')) throw fail('FB_INBOX_SCOPE_UNAVAILABLE');
  if (!result.allowed) throw fail('FB_INBOX_MANAGED_PAGE_PENDING');
}

function createPageInboxWorker({
  db, isPrimary, processEvent, withPrimary = fn => fn(), isPaused = () => true,
  beforeClaim = () => assertLegacyQueueDrained(db), onError = () => {},
  onHealth = () => {}, heartbeatMs = 30000, setTimer = setInterval, clearTimer = clearInterval,
  leadAdsPages,
}) {
  // Opt-in lane only: omitting the option preserves the H1 generic claim RPC.
  // Copy the allowlist so later caller mutations cannot widen processing scope.
  if (leadAdsPages !== undefined && (!Array.isArray(leadAdsPages) || !leadAdsPages.length
    || leadAdsPages.some(id => typeof id !== 'string' || !/^\d{1,32}$/.test(id))
    || new Set(leadAdsPages).size !== leadAdsPages.length)) throw fail('FB_INBOX_INVALID_CONFIG');
  const claimPages = leadAdsPages === undefined ? null : Object.freeze([...leadAdsPages]);
  const allowedPages = claimPages && new Set(claimPages);
  const claimRpc = claimPages ? 'facebook_page_inbox_claim_lead_ads_v1' : 'facebook_page_inbox_claim_v1';
  let running = null;
  let stopping = false;
  const primaryCall = async (name, args) => {
    assertPrimary(isPrimary);
    const data = await withPrimary(() => rpc(db, name, args));
    assertPrimary(isPrimary);
    return data;
  };
  async function work() {
    try {
      for (let i = 0; i < 20 && !stopping && !isPaused(); i++) {
        assertPrimary(isPrimary);
        await withPrimary(beforeClaim);
        if (stopping || isPaused()) break;
        const token = randomUUID();
        const rows = await primaryCall(claimRpc, {
          p_token: token, ...(claimPages ? { p_page_ids: [...claimPages] } : {}),
        });
        if (!Array.isArray(rows) || rows.length > 1) throw fail('FB_INBOX_INVALID_CLAIM');
        const row = rows[0];
        if (!row) break;
        if (typeof row.id !== 'string' || typeof row.page_id !== 'string' || !record(row.payload)) throw fail('FB_INBOX_INVALID_CLAIM');
        if (allowedPages && (!allowedPages.has(row.page_id) || row.payload.kind !== 'change'
          || !record(row.payload.event) || row.payload.event.field !== 'leadgen')) throw fail('FB_INBOX_INVALID_CLAIM');
        let leaseLost = false;
        let renewal = null;
        const renew = () => {
          if (renewal) return;
          renewal = primaryCall('facebook_page_inbox_renew_v1', { p_id: row.id, p_token: token })
            .then(ok => { if (ok !== true) leaseLost = true; })
            .catch(() => { leaseLost = true; })
            .finally(() => { renewal = null; });
        };
        const timer = setTimer(renew, heartbeatMs);
        timer?.unref?.();
        try {
          if (isPaused() || stopping) throw fail('FB_INBOX_WORKER_PAUSED');
          await withPrimary(() => processEvent(row.page_id, row.payload,
            Object.freeze({ inboxId: row.id, leaseToken: token })));
          clearTimer(timer);
          if (renewal) await renewal;
          if (leaseLost) throw fail('FB_INBOX_LEASE_LOST');
          const ok = await primaryCall('facebook_page_inbox_finish_v1', { p_id: row.id, p_token: token, p_success: true, p_error_code: null });
          if (ok !== true) throw fail('FB_INBOX_LEASE_LOST');
        } catch (error) {
          clearTimer(timer);
          if (renewal) await renewal;
          const code = safeCode(error);
          onError(code);
          // An expired/lost lease is recovered by SQL. Never acknowledge another worker's lease.
          if (!leaseLost) {
            try {
              const ok = await primaryCall('facebook_page_inbox_finish_v1', { p_id: row.id, p_token: token, p_success: false, p_error_code: code });
              if (ok !== true) onError('FB_INBOX_LEASE_LOST');
            } catch (failure) { onError(safeCode(failure)); }
          }
        } finally { clearTimer(timer); }
      }
    } catch (error) { onError(safeCode(error)); }
  }
  function drain() {
    if (running) return running;
    if (stopping || isPaused()) return Promise.resolve();
    running = work().finally(() => { running = null; });
    return running;
  }
  async function health() {
    try {
      const value = await primaryCall('facebook_page_inbox_health_v1', {});
      if (!record(value) || ['pendingCount', 'processingCount', 'oldestPendingSeconds'].some(key => !Number.isFinite(value[key]) || value[key] < 0)) {
        throw fail('FB_INBOX_INVALID_HEALTH');
      }
      // Emit only bounded operational counts, never payload / Page / phone / raw errors.
      onHealth({ pendingCount: value.pendingCount, processingCount: value.processingCount, oldestPendingSeconds: value.oldestPendingSeconds });
      if (value.pendingCount >= 100 || value.oldestPendingSeconds >= 300) onError('FB_INBOX_BACKLOG');
      return value;
    } catch (error) { onError(safeCode(error)); return null; }
  }
  return { drain, health, async stop() { stopping = true; if (running) await running; } };
}

module.exports = { inboxSettings, isManagedLeadAdsContact, rowsFromBody, signedRows, safeCode, createPageInboxReceiver, createDedicatedLeadAdsReceiver, createLeadAdsWebhookHandoff, createPageInboxWorker, assertLegacyQueueDrained, assertPageLegacyScope };
