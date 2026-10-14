'use strict';

const { createHash, randomUUID } = require('node:crypto');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = /^\d{1,32}$/;
const HASH = /^[a-f0-9]{64}$/;
const EVENT_ID = /^vptw_[a-f0-9]{56}$/;
const MODES = ['test', 'production'];
const EVENT_NAME = 'VPTCRMQualifiedLead';
const EVENTS = [EVENT_NAME];
const STATES = ['pending', 'processing', 'accepted', 'held', 'unknown', 'cancelled'];
const fail = code => Object.assign(new Error(code), { code });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const matches = (pattern, value) => typeof value === 'string' && pattern.test(value);
const canonical = value => Array.isArray(value) ? value.map(canonical) : object(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const samePayload = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

function validateTarget(target, mode) {
  if (!object(target) || Object.keys(target).sort().join(',') !== 'ad_account_id,company_id,dataset_id,site_host'
      || !matches(UUID, target.company_id) || !matches(ID, target.dataset_id)
      || target.site_host !== 'vanphuthanh.net' || !matches(/^act_\d{1,32}$/, target.ad_account_id)
      || !MODES.includes(mode)) throw fail('META_TARGET_INVALID');
  return { company_id: target.company_id.toLowerCase(), dataset_id: target.dataset_id,
    ad_account_id: target.ad_account_id, site_host: target.site_host };
}

function eventId(event, target, mode) {
  return `vptw_${createHash('sha256').update(JSON.stringify([
    target.company_id, target.dataset_id, target.ad_account_id, target.site_host, event.identity_key, event.event_name, mode,
  ])).digest('hex').slice(0, 56)}`;
}

// Website quality is a CRM event, separate from native Lead Ads and browser Lead.
function validLanding(value) {
  if (typeof value !== 'string' || value.length>1000) return false;
  try { const u=new URL(value); return u.protocol==='https:' && u.hostname==='vanphuthanh.net'
    && !u.port && !u.username && !u.password && !u.search && !u.hash && u.href===value; } catch { return false; }
}
function validMatching(event) {
  if (!matches(/^[A-Za-z0-9_-]{1,500}$/,event.fbclid) || !Number.isSafeInteger(event.captured_ms)
    || event.captured_ms<=0 || !matches(/^fb\.[0-2]\.\d{13}\.[A-Za-z0-9_-]{1,500}$/,event.fbc)) return false;
  const parts=event.fbc.split('.');
  return parts[3]===event.fbclid && Number(parts[2])===event.captured_ms
    && (event.fbp==null || event.fbp==='' || matches(/^fb\.[0-2]\.\d{13}\.\d{1,30}$/,event.fbp));
}
function prepareWebsiteFeedback(event,{target,mode,audit=false}={}) {
  const scope=validateTarget(target,mode);
  if (!object(event) || (event.event_name!==undefined && event.event_name!==EVENT_NAME)
    || !matches(HASH,event.identity_key) || !matches(UUID,event.lead_id) || !matches(UUID,event.source_receipt_id)
    || !matches(HASH,event.context_hash) || event.source_kind!=='website'
    || (event.delivery_supported!==true && audit!==true) || event.ad_account_id!==scope.ad_account_id
    || event.company_id!==scope.company_id || !validLanding(event.landing_url)
    || event.measurement_consent!==true || event.consent_version!=='VPT_ADS_V1' || !validMatching(event))
    throw fail('META_EVENT_INVALID');
  if (!matches(UUID,event.qualification_id) || !Number.isSafeInteger(event.qualification_revision)
    || event.qualification_revision<1) throw fail('META_QUALIFICATION_INVALID');
  if (!Number.isSafeInteger(event.qualified_ms) || !Number.isSafeInteger(event.acquired_ms)
    || event.captured_ms>event.acquired_ms || event.acquired_ms>=event.qualified_ms
    || (event.fbp && Number(event.fbp.split('.')[2])>event.acquired_ms))
    throw fail('META_EVENT_TIME_INVALID');
  const id=eventId({...event,event_name:EVENT_NAME},scope,mode);
  return {...scope,mode,event_id:id,event_name:EVENT_NAME,identity_key:event.identity_key,
    lead_id:event.lead_id,source_receipt_id:event.source_receipt_id,context_hash:event.context_hash,
    qualification_id:event.qualification_id,qualification_revision:event.qualification_revision,
    landing_url:event.landing_url,fbclid:event.fbclid,captured_ms:event.captured_ms,
    payload:{event_name:EVENT_NAME,event_time:Math.floor(event.qualified_ms/1000),event_id:id,
      action_source:'system_generated',user_data:{fbc:event.fbc,...(event.fbp && {fbp:event.fbp}),external_id:[event.identity_key]},
      custom_data:{event_source:'crm',lead_event_source:'VPT CRM'}}};
}

function sameTarget(a, b) {
  return ['company_id', 'dataset_id', 'ad_account_id', 'site_host'].every(key => a?.[key] === b?.[key]);
}
function validateStored(row,target,mode) {
  if (!object(row) || !matches(UUID,row.id) || !sameTarget(row,target) || row.mode!==mode
    || !matches(EVENT_ID,row.event_id) || !STATES.includes(row.status) || row.event_name!==EVENT_NAME
    || !matches(HASH,row.identity_key) || !matches(UUID,row.lead_id) || !matches(UUID,row.source_receipt_id)
    || !matches(HASH,row.context_hash) || !matches(UUID,row.qualification_id) || !Number.isSafeInteger(row.qualification_revision)
    || row.qualification_revision<1 || row.event_id!==eventId(row,target,mode) || !validLanding(row.landing_url)
    || !object(row.payload) || row.payload.event_id!==row.event_id || row.payload.event_name!==EVENT_NAME
    || !validMatching({...row,fbc:row.payload.user_data?.fbc,fbp:row.payload.user_data?.fbp})
    || row.payload.user_data?.external_id?.length!==1 || row.payload.user_data.external_id[0]!==row.identity_key)
    throw fail('META_OUTBOX_SOURCE_INVALID');
  return row;
}
function matchingEligibility(claim,snapshot,{target,mode}) {
  if (!object(snapshot) || !Array.isArray(snapshot.rows)) throw fail('META_ELIGIBILITY_UNAVAILABLE');
  for (const row of snapshot.rows) {
    if (row.delivery_supported!==true) continue;
    const current=prepareWebsiteFeedback(row,{target,mode});
    if (current.event_id!==claim.event_id) continue;
    return ['lead_id','source_receipt_id','context_hash','qualification_id','qualification_revision','landing_url','fbclid','captured_ms']
      .every(key=>current[key]===claim[key]) && samePayload(current.payload,claim.payload);
  }
  return false;
}

function createWebsiteFeedbackOutbox(db) {
  if (!db || typeof db.rpc !== 'function') throw fail('META_OUTBOX_SOURCE_INVALID');
  async function rpc(name, args) {
    let result;
    try { result = await db.rpc(name, args); } catch { throw fail('META_OUTBOX_UNAVAILABLE'); }
    if (!result || result.error) throw fail('META_OUTBOX_UNAVAILABLE');
    return result.data;
  }
  async function enqueue(event, options) {
    const row = prepareWebsiteFeedback(event, options);
    const result = await rpc('web_feedback_enqueue_v1', { p_row: row });
    return validateStored(result, validateTarget(options.target, options.mode), options.mode);
  }
  async function claim(target, mode) {
    const scope = validateTarget(target, mode), lease = randomUUID();
    const result = await rpc('web_feedback_claim_v1', { p_target: scope, p_mode: mode, p_lease_token: lease });
    if (result === null) return null;
    const row = validateStored(result, scope, mode);
    if (row.status !== 'processing' || row.lease_token !== lease || !Number.isFinite(Date.parse(row.locked_until)))
      throw fail('META_OUTBOX_LEASE_INVALID');
    return row;
  }
  async function finish(row, { status, receipt = null, reason_code = null } = {}) {
    if (!UUID.test(row?.id || '') || !UUID.test(row?.lease_token || '')
        || !['accepted', 'held', 'unknown', 'cancelled'].includes(status)
        || (reason_code !== null && !/^[A-Z][A-Z0-9_]{0,63}$/.test(reason_code)))
      throw fail('META_OUTBOX_COMPLETION_INVALID');
    if (status === 'accepted' && (!object(receipt) || receipt.events_received !== 1
        || !matches(/^[A-Za-z0-9_-]{1,200}$/, receipt.fbtrace_id)))
      throw fail('META_OUTBOX_RECEIPT_INVALID');
    const safeReceipt = status === 'accepted'
      ? { events_received: 1, fbtrace_id: receipt.fbtrace_id } : null;
    const done = await rpc('web_feedback_finish_v1', { p_id: row.id,
      p_lease_token: row.lease_token, p_status: status, p_receipt: safeReceipt, p_reason_code: reason_code });
    if (done !== true) throw fail('META_OUTBOX_FINISH_UNCONFIRMED');
    return { status };
  }
  async function preflight(row) {
    if (!matches(UUID, row?.id) || !matches(UUID, row?.lease_token)) throw fail('META_OUTBOX_LEASE_INVALID');
    const result = await rpc('web_feedback_preflight_v1', { p_id: row.id, p_lease_token: row.lease_token });
    if (typeof result !== 'boolean') throw fail('META_OUTBOX_SOURCE_INVALID');
    return result;
  }
  async function guard(target, mode) {
    const scope = validateTarget(target, mode);
    const result = await rpc('web_feedback_guard_v1', { p_target: scope, p_mode: mode });
    if (!object(result) || typeof result.blocked !== 'boolean'
        || ['unknown', 'accepted_stale', 'expired_processing'].some(key => !Number.isSafeInteger(result[key]) || result[key] < 0)
        || result.blocked !== (result.unknown + result.accepted_stale + result.expired_processing > 0)
        || result.reason_code !== (result.blocked ? 'META_HISTORY_REVIEW_REQUIRED' : null))
      throw fail('META_OUTBOX_SOURCE_INVALID');
    return { blocked: result.blocked, reason_code: result.reason_code,
      unknown: result.unknown, accepted_stale: result.accepted_stale, expired_processing: result.expired_processing };
  }
  async function listState(target, mode, limit = 100) {
    const scope = validateTarget(target, mode);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw fail('META_OUTBOX_LIMIT_INVALID');
    const result = await rpc('web_feedback_list_v1', { p_target: scope, p_mode: mode, p_limit: limit });
    if (!object(result) || !Array.isArray(result.rows) || result.rows.length > limit || !object(result.counts))
      throw fail('META_OUTBOX_SOURCE_INVALID');
    if (Object.entries(result.counts).some(([key, value]) => !STATES.includes(key)
      || !Number.isSafeInteger(value) || value < 0)) throw fail('META_OUTBOX_SOURCE_INVALID');
    const counts = Object.fromEntries(STATES.map(state => [state, result.counts[state] ?? 0]));
    // Only operational facts: no provider Lead ID, matching payload, identity/context hash or token.
    return { counts, rows: result.rows.map(row => {
      validateStored(row, scope, mode);
      return { id: row.id, lead_id: row.lead_id, event_name: row.event_name, mode: row.mode,
        status: row.status, attempts: row.attempts, created_at: row.created_at,
        accepted_at: row.accepted_at, stale: row.stale === true, reason_code: row.reason_code };
    }) };
  }
  async function reconcile(input,options,eligibleRows) {
    const {target,mode}=typeof options==='string'?{target:input,mode:options}:options;
    const source=typeof options==='string'?eligibleRows:input;
    const snapshot=Array.isArray(source)?{rows:source}:source;
    const scope=validateTarget(target,mode);
    if (!object(snapshot) || !Array.isArray(snapshot.rows)) throw fail('META_ELIGIBILITY_UNAVAILABLE');
    const hasHistory=Object.hasOwn(snapshot,'reconciliationRows');
    if (hasHistory && !Array.isArray(snapshot.reconciliationRows)) throw fail('META_ELIGIBILITY_UNAVAILABLE');
    const prepare=(rows,audit)=>rows.filter(row=>audit?row.measurement_consent===true && validMatching(row):row.delivery_supported===true)
      .map(row=>prepareWebsiteFeedback(row,{target:scope,mode,audit}));
    const current=prepare(snapshot.rows,false),history=hasHistory?prepare(snapshot.reconciliationRows,true):null;
    if (current.length>1000 || (history && history.length>1000)) throw fail('META_ELIGIBILITY_LIMIT');
    const proof=rows=>rows.map(row=>({event_id:row.event_id,context_hash:row.context_hash,qualification_id:row.qualification_id,
      qualification_revision:row.qualification_revision,source_receipt_id:row.source_receipt_id,payload:row.payload,
      landing_url:row.landing_url,fbclid:row.fbclid,captured_ms:row.captured_ms}));
    return rpc('web_feedback_reconcile_v1',{p_target:scope,p_mode:mode,p_current:proof(current),
      p_history_complete:hasHistory && snapshot.reconciliationComplete===true,p_history_current:history?proof(history):null});
  }

  return { enqueue, claim, finish, preflight, guard, listState, reconcile };
}

const makeWebsiteFeedbackPayload = (event, options) => prepareWebsiteFeedback(event, options).payload;
module.exports = { createWebsiteFeedbackOutbox, prepareWebsiteFeedback, makeWebsiteFeedbackPayload, matchingEligibility,
  validateTarget, sameTarget, EVENT_ID, EVENT_NAME, validMatching, validLanding };
