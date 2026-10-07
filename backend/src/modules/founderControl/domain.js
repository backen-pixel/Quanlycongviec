'use strict';

const crypto = require('node:crypto');
const VERSION = 'founder-control/v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SYSTEMS = [
  'Tư tưởng & Thị trường', 'Tư duy & Giải pháp', 'Nguồn lực & Năng lực',
  'Vận hành & Giao giá trị', 'Báo cáo & Sự thật', 'Sửa chữa & Tiến hóa',
];
function fail(code, status = 400) {
  return Object.assign(new Error(code), { reasonCode: code, status });
}
function instant(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(s)) return null;
  const n = Date.parse(s);
  // Reject JS date rollover, e.g. February 30.
  const day = s.slice(0, 10);
  const dateOnly = Date.parse(day + 'T00:00:00Z');
  if (!Number.isFinite(n) || !Number.isFinite(dateOnly) || new Date(dateOnly).toISOString().slice(0, 10) !== day) return null;
  return n;
}
function windowOf(args) {
  const start = instant(args.window_start), end = instant(args.window_end);
  if (start === null || end === null || start >= end || end - start > 31 * 86400000) throw fail('INVALID_WINDOW');
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString(), timezone: 'Asia/Ho_Chi_Minh' };
}
// Vietnam has no DST. Measure overlap with every day's 08:00–22:00 shift.
function responseSla(receivedAt, respondedAt, now) {
  const start = instant(receivedAt), end = instant(respondedAt), observed = instant(now);
  if (start === null || end === null || observed === null) return { status: 'UNKNOWN', reason: 'RESPONSE_EVIDENCE_MISSING', minutes: null };
  if (end < start || end > observed || end - start > 366 * 86400000) return { status: 'UNKNOWN', reason: 'RESPONSE_TIME_INVALID', minutes: null };
  const offset = 7 * 3600000, day = 86400000;
  let elapsed = 0;
  for (let d = Math.floor((start + offset) / day) * day - offset; d <= end; d += day) {
    elapsed += Math.max(0, Math.min(end, d + 22 * 3600000) - Math.max(start, d + 8 * 3600000));
  }
  // An overnight response before next shift starts is a valid zero working-time response.
  return { status: elapsed < 300000 ? 'MET' : 'BREACHED', minutes: elapsed / 60000,
    timezone: 'Asia/Ho_Chi_Minh', shift: '08:00–22:00 mỗi ngày', target: '<5 phút',
    policy_version: 'VPT-FIRST-RESPONSE-20261007-v1' };
}
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function digest(value) { return crypto.createHash('sha256').update(canonical(value)).digest('hex'); }
function unknown(reason, source) { return { value: null, status: 'UNKNOWN', reason, source_refs: source ? [source] : [] }; }
// Pure shadow evaluation; the caller must provide server-verified policy and full data.
// No model input can select the policy, fill gaps with zero, or activate an ad.
function evaluateAdDryRun(observation, policy, now) {
  const out = { mode: 'DRY_RUN', execution: 'NOT_EXECUTED', action: 'UNKNOWN', reason: null };
  if (!policy || policy.verified !== true || policy.subject !== 'ad' || !policy.version) return { ...out, reason: 'POLICY_SCOPE_UNVERIFIED' };
  const n = instant(now), asOf = instant(observation?.as_of);
  if (n === null || asOf === null || asOf > n || !Number.isSafeInteger(policy.max_age_ms) || policy.max_age_ms <= 0 || n - asOf > policy.max_age_ms) return { ...out, reason: 'DATA_STALE_OR_MISSING' };
  if (observation?.coverage !== 'COMPLETE' || observation?.scope_verified !== true || observation.currency !== 'VND'
    || !Number.isSafeInteger(observation.spend_vnd) || observation.spend_vnd < 0
    || !Number.isSafeInteger(observation.phone_count) || observation.phone_count < 0) return { ...out, reason: 'RECONCILIATION_UNKNOWN' };
  if (!UUID.test(observation.company_id || '') || observation.ad_id !== policy.ad_id || observation.company_id !== policy.company_id) return { ...out, reason: 'POLICY_SCOPE_MISMATCH' };
  const day = new Date(n + 7 * 3600000).toISOString().slice(0, 10);
  const nextDay = new Date(Date.parse(day + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
  if (observation.day !== day) return { ...out, reason: 'COHORT_MISMATCH' };
  const midnight = policy.resume_at_midnight === true && observation.paused_by_policy_version === policy.version
    && observation.paused_on_day && observation.paused_on_day < day;
  return { ...out, action: midnight ? 'WOULD_RESUME' : observation.spend_vnd >= 50000 && observation.phone_count === 0 ? 'WOULD_PAUSE' : 'NO_CHANGE',
    reason: 'EVALUATED', policy_version: policy.version, subject_ref: observation.ad_id, next_reset: nextDay + 'T00:00:00+07:00' };
}
module.exports = { VERSION, UUID, SYSTEMS, fail, instant, windowOf, responseSla, digest, unknown, evaluateAdDryRun };
