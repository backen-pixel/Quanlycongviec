'use strict';
const numeric = value => typeof value === 'string' && /^[0-9]{1,32}$/.test(value);
const time = value => typeof value === 'string' ? Date.parse(value) : NaN;
const fail = () => { throw Object.assign(new Error('TRIAL_RECONCILIATION_UNAVAILABLE'), { status: 503 }); };
const key = row => row.pageId + ':' + row.leadgenId;

// Only the trusted, current run can supply acquisition timestamps for receipts
// which have not completed intake. Delivery time is never acquisition evidence.
function receiptPeriods(raw, period) {
  const census = raw.providerReconciliation, observed = new Map(), seen = new Set();
  if (census?.version === 2) {
    if (!Array.isArray(census.observations) || census.observations.length > 5000) fail();
    for (const o of census.observations) {
      if (!numeric(o.pageId) || !numeric(o.formId) || !numeric(o.leadgenId) ||
        !Number.isFinite(time(o.acquiredAt)) || !Number.isFinite(time(o.observedAt)) ||
        time(o.acquiredAt) > time(o.observedAt) || time(o.observedAt) > time(raw.asOf) ||
        time(o.observedAt) < time(census.run?.startedAt) ||
        !/^v[0-9]{2,3}\.0$/.test(o.graphVersion || '') || seen.has(key(o)) ||
        !census.forms?.some(f => f.pageId === o.pageId && f.formId === o.formId)) fail();
      seen.add(key(o));
      if (period.censusAligned && census.run.state === 'SCANNED') observed.set(key(o), o);
    }
  }
  const sources = new Map(raw.sources.map(s => [s.receiptId, s])), result = new Map();
  for (const r of raw.receipts) {
    const s = sources.get(r.id), o = observed.get(key(r));
    const validSource = r.state === 'DONE' && s?.leadId === r.leadId && s?.companyId === raw.companyId &&
      s.provider === 'META_LEAD_ADS_V1' && s.proof?.pageId === r.pageId && s.proof?.formId === r.formId &&
      s.proof?.leadgenId === r.leadgenId && time(s.proof?.acquiredAt) === time(s.acquiredAt) &&
      ['PAID', 'ORGANIC', 'UNKNOWN'].includes(s.source) && s.proof.source === s.source;
    let stamp = validSource ? time(s.acquiredAt) : NaN;
    // A conflicting proof/envelope must not be discarded as an old receipt.
    if (o && (o.formId !== r.formId || (s && (!validSource || time(s.acquiredAt) !== time(o.acquiredAt))))) stamp = NaN;
    else if (o) stamp = time(o.acquiredAt);
    const known = Number.isFinite(stamp) && stamp <= time(raw.asOf);
    result.set(r.id, !known || period.status !== 'AVAILABLE' ? 'UNKNOWN' :
      stamp < time(period.sinceAt) || stamp >= time(period.untilExclusive) ? 'OUTSIDE' : 'INSIDE');
  }
  return result;
}
module.exports = { receiptPeriods };
