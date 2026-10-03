'use strict';
const DAY = 86400000, OFFSET = 7 * 3600000;
const time = value => typeof value === 'string' ? Date.parse(value) : NaN;
const localDate = stamp => new Date(stamp + OFFSET).toISOString().slice(0, 10);
const midnight = stamp => Number.isFinite(stamp) && (stamp + OFFSET) % DAY === 0;

// Spend is daily in Vietnam time. Never compare a partial-day census with a
// whole day of spend, or move the customer boundary forward after a scan.
function measurementPeriod(raw) {
  const start = time(raw.trial.since + 'T00:00:00+07:00');
  const end = time(raw.trial.until + 'T00:00:00+07:00') + DAY;
  const now = time(raw.asOf), closed = Math.floor((now + OFFSET) / DAY) * DAY - OFFSET;
  if (![start, end, now].every(Number.isFinite) || end - start !== 30 * DAY) {
    throw Object.assign(new Error('TRIAL_PERIOD_UNAVAILABLE'), { status: 503 });
  }
  const census = raw.providerReconciliation, r = census?.run;
  const censusCurrent = census?.companyId === raw.companyId && census?.trialId === raw.trial.id &&
    census.complete === true && r?.scopeCurrent === true && r.trialRevision === raw.trial.revision;
  const candidate = time(r?.until);
  const aligned = censusCurrent && time(r.since) === start && midnight(candidate) &&
    candidate > start && candidate <= Math.min(end, closed) && time(r.startedAt) >= candidate;
  const cutoff = aligned ? candidate : Math.min(end, closed);
  return {
    status: cutoff > start ? 'AVAILABLE' : now < start ? 'TRIAL_NOT_STARTED' : 'NO_CLOSED_DAY',
    policy: 'VIETNAM_CLOSED_DAY_V1', timezone: 'Asia/Ho_Chi_Minh',
    since: raw.trial.since, until: cutoff > start ? localDate(cutoff - DAY) : null,
    sinceAt: new Date(start).toISOString(), untilExclusive: cutoff > start ? new Date(cutoff).toISOString() : null,
    censusAligned: Boolean(aligned), censusRunId: aligned ? r.id : null,
    qualificationAsOf: raw.asOf,
  };
}
module.exports = { measurementPeriod };
