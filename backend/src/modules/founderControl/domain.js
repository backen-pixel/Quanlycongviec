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
  if (typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2})(?::?(\d{2}))?)$/.exec(s);
  if (!m) return null;
  const [year,month,date,hour,minute,second]=m.slice(1,7).map(Number);
  const offsetHour=Number(m[10]||0),offsetMinute=Number(m[11]||0);
  if (hour>23 || minute>59 || second>59 || offsetHour>14 || (offsetHour===14 && offsetMinute>0) || offsetMinute>59) return null;
  const day=Date.UTC(year,month-1,date);
  if (!Number.isFinite(day) || new Date(day).toISOString().slice(0,10)!==s.slice(0,10)) return null;
  const offset=(m[9]==='-'?-1:1)*(offsetHour*60+offsetMinute);
  return BigInt(day+((hour*60+minute-offset)*60+second)*1000)*1000n+BigInt((m[7]||'').padEnd(6,'0')||0);
}
const MS=1000n, MINUTE=60000000n, DAY=86400000000n;
function floorDiv(a,b) { return a>=0n ? a/b : (a-b+1n)/b; }
function iso(us) {
  const ms=floorDiv(us,MS);
  const base=new Date(Number(ms)).toISOString();
  const extra=us-ms*MS;
  return extra===0n ? base : base.replace('Z',String(extra).padStart(3,'0')+'Z');
}
function windowOf(args) {
  const start = instant(args.window_start), end = instant(args.window_end);
  if (start === null || end === null || start >= end || end - start > 31n * DAY) throw fail('INVALID_WINDOW');
  return { start: iso(start), end: iso(end), timezone: 'Asia/Ho_Chi_Minh' };
}
// Vietnam has no DST. Measure overlap with every day's 08:00–22:00 shift.
function responseSla(receivedAt, respondedAt, now) {
  const start = instant(receivedAt), end = instant(respondedAt), observed = instant(now);
  if (start === null || end === null || observed === null) return { status: 'UNKNOWN', reason: 'RESPONSE_EVIDENCE_MISSING', minutes: null };
  if (end < start || end > observed || end - start > 366n * DAY) return { status: 'UNKNOWN', reason: 'RESPONSE_TIME_INVALID', minutes: null };
  const offset = 7n * 60n * MINUTE;
  let elapsed = 0n;
  for (let d = floorDiv(start + offset,DAY) * DAY - offset; d <= end; d += DAY) {
    const overlap = (end < d + 22n * 60n * MINUTE ? end : d + 22n * 60n * MINUTE)
      - (start > d + 8n * 60n * MINUTE ? start : d + 8n * 60n * MINUTE);
    if (overlap > 0n) elapsed += overlap;
  }
  // An overnight response before next shift starts is a valid zero working-time response.
  return { status: elapsed < 5n * MINUTE ? 'MET' : 'BREACHED', minutes: Number(elapsed) / Number(MINUTE),
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
  if (n === null || asOf === null || asOf > n || !Number.isSafeInteger(policy.max_age_ms) || policy.max_age_ms <= 0 || n - asOf > BigInt(policy.max_age_ms)*MS) return { ...out, reason: 'DATA_STALE_OR_MISSING' };
  if (observation?.coverage !== 'COMPLETE' || observation?.scope_verified !== true || observation.currency !== 'VND'
    || !Number.isSafeInteger(observation.spend_vnd) || observation.spend_vnd < 0
    || !Number.isSafeInteger(observation.phone_count) || observation.phone_count < 0) return { ...out, reason: 'RECONCILIATION_UNKNOWN' };
  if (!UUID.test(observation.company_id || '') || observation.ad_id !== policy.ad_id || observation.company_id !== policy.company_id) return { ...out, reason: 'POLICY_SCOPE_MISMATCH' };
  const day = iso(n + 7n * 60n * MINUTE).slice(0, 10);
  const nextDay = new Date(Date.parse(day + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
  if (observation.day !== day) return { ...out, reason: 'COHORT_MISMATCH' };
  const midnight = policy.resume_at_midnight === true && observation.paused_by_policy_version === policy.version
    && observation.paused_on_day && observation.paused_on_day < day;
  return { ...out, action: midnight ? 'WOULD_RESUME' : observation.spend_vnd >= 50000 && observation.phone_count === 0 ? 'WOULD_PAUSE' : 'NO_CHANGE',
    reason: 'EVALUATED', policy_version: policy.version, subject_ref: observation.ad_id, next_reset: nextDay + 'T00:00:00+07:00' };
}
module.exports = { VERSION, UUID, SYSTEMS, fail, instant, iso, windowOf, responseSla, digest, unknown, evaluateAdDryRun };
