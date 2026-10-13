'use strict';

const { createMetaFeedbackOutbox, prepareMetaFeedback, matchingEligibility,
  validateTarget, sameTarget } = require('./metaFeedbackOutbox');
const MAX_AGE_SECONDS = 7 * 86400;
const TIMEOUT_MS = 15000;
const MAX_RESPONSE_BYTES = 65536;
const VPT_COMPANY = '991dc79d-cbf5-49f9-a364-35227cb47635';
const fail = code => Object.assign(new Error(code), { code });
const string = value => typeof value === 'string' ? value.trim() : '';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function getMetaFeedbackConfig(env = process.env) {
  const prefix = 'VPT_META_FEEDBACK_';
  const target = { company_id: string(env[`${prefix}COMPANY_ID`]).toLowerCase(),
    ad_account_id: string(env[`${prefix}AD_ACCOUNT_ID`]),
    page_id: string(env[`${prefix}PAGE_ID`]), dataset_id: string(env[`${prefix}DATASET_ID`]) };
  const mode = string(env[`${prefix}MODE`]);
  const graphVersion = string(env[`${prefix}GRAPH_VERSION`]);
  const testEventCode = string(env[`${prefix}TEST_EVENT_CODE`]);
  const config = { enabled: false, ready: false, reason_code: 'META_FEEDBACK_DISABLED', target: null,
    mode: ['test', 'production'].includes(mode) ? mode : null, graphVersion, testEventCode };
  try { config.target = validateTarget(target, mode); }
  catch { config.reason_code = 'META_CONFIG_SCOPE_INVALID'; return config; }
  if (target.company_id !== VPT_COMPANY) { config.reason_code = 'META_CONFIG_COMPANY_INVALID'; return config; }
  if (env[`${prefix}CONSENT`] !== '1') { config.reason_code = 'META_FEEDBACK_CONSENT_REQUIRED'; return config; }
  if (!/^v\d{1,2}\.\d{1,2}$/.test(graphVersion)
      || (mode === 'test' && !/^[A-Za-z0-9_-]{1,100}$/.test(testEventCode))
      || (mode === 'production' && testEventCode)) {
    config.reason_code = 'META_CONFIG_CONTRACT_INVALID'; return config;
  }
  const token = env[`${prefix}TOKEN`];
  if (typeof token !== 'string' || !/^\S{16,4096}$/.test(token)) {
    config.reason_code = 'META_CONFIG_TOKEN_REQUIRED'; return config;
  }
  // JSON serialization of config is safe even if a route accidentally returns it.
  Object.defineProperty(config, 'accessToken', { value: token, enumerable: false });
  config.ready = true;
  config.enabled = env[`${prefix}ENABLED`] === '1';
  config.reason_code = config.enabled ? null : 'META_FEEDBACK_DISABLED';
  return config;
}

function validPayload(payload, nowMs) {
  if (!object(payload) || Object.keys(payload).sort().join(',') !== 'action_source,custom_data,event_id,event_name,event_time,user_data'
      || !['initial_lead', 'qualified_lead'].includes(payload.event_name)
      || payload.action_source !== 'system_generated' || !/^vptm_[a-f0-9]{56}$/.test(payload.event_id || '')
      || !object(payload.user_data) || Object.keys(payload.user_data).join(',') !== 'lead_id'
      || typeof payload.user_data.lead_id !== 'string' || !/^\d{1,32}$/.test(payload.user_data.lead_id)
      || !object(payload.custom_data) || Object.keys(payload.custom_data).sort().join(',') !== 'event_source,lead_event_source'
      || payload.custom_data.event_source !== 'crm' || payload.custom_data.lead_event_source !== 'VPT CRM'
      || !Number.isSafeInteger(payload.event_time) || !Number.isSafeInteger(nowMs)) return 'META_PAYLOAD_INVALID';
  const seconds = Math.floor(nowMs / 1000);
  if (payload.event_time > seconds) return 'META_EVENT_IN_FUTURE';
  if (payload.event_time < seconds - MAX_AGE_SECONDS) return 'META_EVENT_EXPIRED';
  return null;
}

async function responseData(response, controller) {
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) throw fail('META_RESPONSE_UNVERIFIED');
  let text;
  if (typeof response.body?.getReader === 'function') {
    const reader = response.body.getReader(), chunks = []; let size = 0;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) { controller.abort(); throw fail('META_RESPONSE_UNVERIFIED'); }
      chunks.push(Buffer.from(value));
    }
    text = Buffer.concat(chunks).toString('utf8');
  } else if (typeof response.text === 'function') text = await response.text();
  else if (typeof response.json === 'function') text = JSON.stringify(await response.json());
  else throw fail('META_RESPONSE_UNVERIFIED');
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) throw fail('META_RESPONSE_UNVERIFIED');
  try { return JSON.parse(text); } catch { throw fail('META_RESPONSE_UNVERIFIED'); }
}

async function sendMetaFeedback({ payload, config, fetchImpl = globalThis.fetch, nowMs = Date.now() }) {
  if (config?.enabled !== true || typeof config.accessToken !== 'string')
    return { status: 'held', reason_code: 'META_FEEDBACK_DISABLED' };
  try { validateTarget(config.target, config.mode); } catch {
    return { status: 'held', reason_code: 'META_CONFIG_SCOPE_INVALID' };
  }
  if (config.target.company_id !== VPT_COMPANY || !/^v\d{1,2}\.\d{1,2}$/.test(config.graphVersion || '')
      || !/^\S{16,4096}$/.test(config.accessToken)
      || (config.mode === 'test' && !/^[A-Za-z0-9_-]{1,100}$/.test(config.testEventCode || ''))
      || (config.mode === 'production' && config.testEventCode))
    return { status: 'held', reason_code: 'META_CONFIG_CONTRACT_INVALID' };
  const issue = validPayload(payload, nowMs);
  if (issue) return { status: 'held', reason_code: issue };
  if (typeof fetchImpl !== 'function') return { status: 'held', reason_code: 'META_TRANSPORT_UNAVAILABLE' };
  const body = { data: [payload], ...(config.mode === 'test' && { test_event_code: config.testEventCode }) };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS); timer.unref?.();
  try {
    // Fixed Graph host and pinned version; no credentials in URL or redirect to another host.
    const response = await fetchImpl(`https://graph.facebook.com/${config.graphVersion}/${config.target.dataset_id}/events`, {
      method: 'POST', headers: { Authorization: `Bearer ${config.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), redirect: 'error', signal: controller.signal,
    });
    const data = await responseData(response, controller);
    if (response.ok === true && object(data) && data.events_received === 1 && data.error === undefined
        && typeof data.fbtrace_id === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(data.fbtrace_id))
      return { status: 'accepted', receipt: { events_received: 1, fbtrace_id: data.fbtrace_id } };
    // An explicit Graph rejection is different from an ambiguous network/response outcome.
    if (response.ok === false && object(data?.error) && Number.isSafeInteger(data.error.code)
        && data.events_received === undefined)
      return { status: 'held', reason_code: response.status === 429 ? 'META_RATE_LIMITED' : 'META_PROVIDER_REJECTED' };
    return { status: 'unknown', reason_code: 'META_RESPONSE_UNVERIFIED' };
  } catch {
    return { status: 'unknown', reason_code: 'META_DELIVERY_UNCONFIRMED' };
  } finally { clearTimeout(timer); }
}

function createMetaFeedbackSender({ db, fetchImpl = globalThis.fetch, getConfig = getMetaFeedbackConfig,
  isPrimary, withPrimary, buildEligible, now = () => Date.now() }) {
  if (typeof isPrimary !== 'function' || typeof withPrimary !== 'function' || typeof buildEligible !== 'function')
    throw fail('META_SENDER_DEPENDENCIES_REQUIRED');
  const outbox = createMetaFeedbackOutbox(db);
  let running = false;
  const primary = () => { if (isPrimary() !== true) throw fail('META_PRIMARY_REQUIRED'); };
  async function drain({ limit = 10 } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw fail('META_SEND_LIMIT_INVALID');
    const config = getConfig();
    if (config.enabled !== true) return { status: 'disabled', reason_code: config.reason_code, sent: 0 };
    if (running) return { status: 'busy', sent: 0 };
    running = true; const outcomes = []; let historyHeld = false;
    try {
      primary();
      return await withPrimary(async () => {
        const initial = await buildEligible({ target: config.target, mode: config.mode, nowMs: now() });
        primary();
        if (!object(initial) || !Array.isArray(initial.rows) || !Array.isArray(initial.intakeRows))
          throw fail('META_ELIGIBILITY_UNAVAILABLE');
        const candidates = [...initial.intakeRows.map(row => ({ ...row, event_name: 'initial_lead' })),
          ...initial.rows.map(row => ({ ...row, event_name: 'qualified_lead' }))].filter(row => row.delivery_supported === true);
        if (candidates.length > 1000) throw fail('META_ELIGIBILITY_LIMIT');
        for (const event of candidates) {
          const prepared = prepareMetaFeedback(event, { target: config.target, mode: config.mode });
          // Old/future events remain visible in CRM diagnostics, not newly enqueued to Meta.
          if (!validPayload(prepared.payload, now())) await outbox.enqueue(event, { target: config.target, mode: config.mode });
          primary();
        }
        await outbox.reconcile(initial, { target: config.target, mode: config.mode });
        for (let i = 0; i < limit; i++) {
          primary();
          const historyGuard = await outbox.guard(config.target, config.mode);
          if (historyGuard.blocked) {
            // Claim owns lease-expiry cleanup and cannot release another event while
            // this interlock is set. Persist UNKNOWN before reporting the hold.
            if (historyGuard.expired_processing > 0) await outbox.claim(config.target, config.mode);
            historyHeld = true; break;
          }
          const currentConfig = getConfig();
          if (currentConfig.enabled !== true || currentConfig.mode !== config.mode
              || currentConfig.graphVersion !== config.graphVersion || !sameTarget(currentConfig.target, config.target)) break;
          const claim = await outbox.claim(config.target, config.mode);
          if (!claim) { historyHeld = (await outbox.guard(config.target, config.mode)).blocked; break; }
          let result;
          try {
            const current = await buildEligible({ target: config.target, mode: config.mode, nowMs: now(), leadId: claim.lead_id });
            primary();
            if (Date.parse(claim.locked_until) <= now())
              result = { status: 'unknown', reason_code: 'META_LEASE_EXPIRED' };
            else if (!matchingEligibility(claim, current, { target: config.target, mode: config.mode }))
              result = { status: 'cancelled', reason_code: 'META_ELIGIBILITY_CHANGED' };
            else {
              const rechecked = getConfig();
              if (rechecked.enabled !== true || rechecked.mode !== config.mode || !sameTarget(rechecked.target, config.target)
                  || rechecked.graphVersion !== config.graphVersion)
                result = { status: 'held', reason_code: 'META_CONFIG_CHANGED' };
              else if ((await outbox.guard(config.target, config.mode)).blocked)
                result = { status: 'held', reason_code: 'META_HISTORY_REVIEW_REQUIRED' };
              else if (!await outbox.preflight(claim)) {
                const guarded = await outbox.guard(config.target, config.mode);
                result = guarded.blocked ? { status: 'held', reason_code: 'META_HISTORY_REVIEW_REQUIRED' }
                  : { status: Date.parse(claim.locked_until) <= now() ? 'unknown' : 'cancelled', reason_code: 'META_PREFLIGHT_CHANGED' };
              }
              else {
                primary();
                result = await sendMetaFeedback({ payload: claim.payload, config: rechecked, fetchImpl, nowMs: now() });
              }
            }
          } catch { result = { status: 'held', reason_code: 'META_ELIGIBILITY_UNAVAILABLE' }; }
          try { primary(); await outbox.finish(claim, result); }
          catch {
            // A successful Meta response followed by a DB failure is never a fresh pending event.
            // Best effort hold; if this write also fails, expired processing leases become UNKNOWN in SQL.
            result = { status: 'unknown', reason_code: 'META_OUTBOX_FINISH_UNCONFIRMED' };
            try { primary(); await outbox.finish(claim, result); } catch { /* Durable expired-lease hold. */ }
          }
          outcomes.push({ id: claim.id, event_name: claim.event_name, status: result.status,
            reason_code: result.reason_code || null });
          if (result.status === 'unknown' || result.reason_code === 'META_HISTORY_REVIEW_REQUIRED') {
            historyHeld = true; break;
          }
        }
        return { status: historyHeld ? 'held' : 'completed',
          ...(historyHeld && { reason_code: 'META_HISTORY_REVIEW_REQUIRED' }),
          sent: outcomes.filter(row => row.status === 'accepted').length, outcomes };
      });
    } finally { running = false; }
  }
  return { drain };
}

module.exports = { getMetaFeedbackConfig, sendMetaFeedback, createMetaFeedbackSender,
  validPayload, MAX_AGE_SECONDS, TIMEOUT_MS };
