'use strict';
const { summarizeSpend } = require('./spendCoverage');
const numeric = value => typeof value === 'string' && /^[0-9]{1,32}$/.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const fail = () => { throw Object.assign(Error('DELIVERY_REPORT_UNAVAILABLE'), { status: 503 }); };
// This is a list to reconcile with historical destinations, not a certificate
// that Meta exposed every source or that all customers were captured.
function accountDeliveryReport(raw, period) {
  const evidence = raw.accountDelivery ?? [];
  if (!Array.isArray(evidence) || evidence.length > 100) fail();
  const accounts = raw.trial.account_ids.map(accountId => {
    const unavailable = reason => ({ accountId, status: 'UNAVAILABLE', reason, ads: [], sourceOnlyAdIds: [], destinationCoverage: 'UNVERIFIED' });
    if (period.status !== 'AVAILABLE') return unavailable(period.status);
    const runs = raw.runs.filter(r => r.ad_account_id === accountId);
    const spend = summarizeSpend({ companyId: raw.companyId, accounts: raw.accounts.filter(a => a.ad_account_id === accountId), runs,
      since: period.since, until: period.until, now: raw.asOf, throughExclusive: period.untilExclusive });
    if (spend.status !== 'KNOWN_TO_DATE') return unavailable('SPEND_UNAVAILABLE');
    const matches = evidence.filter(e => e.accountId === accountId);
    if (!matches.length) return unavailable('DELIVERY_NOT_COLLECTED');
    if (matches.length !== 1) fail();
    const e = matches[0], d = e.payload, run = runs[0];
    if (e.companyId !== raw.companyId || String(e.runId) !== String(run.id) || !/^[a-f0-9]{64}$/.test(e.payloadDigest || '') ||
      !Number.isFinite(Date.parse(e.recordedAt)) || Date.parse(e.recordedAt) < Date.parse(run.started_at) || Date.parse(e.recordedAt) > Date.parse(raw.asOf) ||
      d?.policy !== 'META_ACCOUNT_DELIVERY_V1' || !/^v[0-9]{2,3}\.0$/.test(d.graphVersion || '') || d.destinationCoverage !== 'UNVERIFIED' ||
      !Array.isArray(d.accountDays) || !Array.isArray(d.adDays) || d.adDays.length > 5000 || !Array.isArray(d.witnesses) || d.witnesses.length !== 6) fail();
    const days = new Map(), adKeys = new Set(), allAdMetadata = new Map(), ads = new Map();
    for (const day of d.accountDays) {
      if (!run.snapshot.days.some(s => s.date === day.date && s.amountVnd === day.amountVnd) || days.has(day.date) || !['amountVnd', 'impressions', 'clicks'].every(k => integer(day[k]))) fail();
      days.set(day.date, day);
    }
    if (days.size !== run.snapshot.days.length) fail();
    const daily = new Map([...days.keys()].map(date => [date, { amountVnd: 0, impressions: 0, clicks: 0 }]));
    for (const row of d.adDays) {
      if (!['adId', 'adsetId', 'campaignId'].every(k => numeric(row[k])) || !days.has(row.date) || adKeys.has(`${row.adId}:${row.date}`) || !['amountVnd', 'impressions', 'clicks'].every(k => integer(row[k]))) fail();
      adKeys.add(`${row.adId}:${row.date}`);
      const metadata = allAdMetadata.get(row.adId);
      if (metadata && (metadata.adsetId !== row.adsetId || metadata.campaignId !== row.campaignId)) fail();
      allAdMetadata.set(row.adId, row);
      for (const k of ['amountVnd', 'impressions', 'clicks']) { daily.get(row.date)[k] += row[k]; if (!integer(daily.get(row.date)[k])) fail(); }
      if (row.date < period.since || row.date > period.until) continue;
      const item = ads.get(row.adId) || { adId: row.adId, adsetId: row.adsetId, campaignId: row.campaignId, amountVnd: 0, impressions: 0, clicks: 0 };
      for (const k of ['amountVnd', 'impressions', 'clicks']) { item[k] += row[k]; if (!integer(item[k])) fail(); }
      ads.set(row.adId, item);
    }
    for (const [date, row] of daily) if (!['amountVnd', 'impressions', 'clicks'].every(k => row[k] === days.get(date)[k])) fail();
    const sourceIds = new Set(raw.sources.filter(s => s.companyId === raw.companyId && s.source === 'PAID' && s.provider === 'META_LEAD_ADS_V1' && s.proof?.accountId === accountId &&
      Date.parse(s.acquiredAt) >= Date.parse(period.sinceAt) && Date.parse(s.acquiredAt) < Date.parse(period.untilExclusive)).map(s => s.proof.adId));
    if (![...sourceIds].every(numeric)) fail();
    const sourceOnlyAdIds = [...sourceIds].filter(id => !ads.has(id)).sort();
    const items = [...ads.values()].sort((a, b) => b.amountVnd - a.amountVnd || a.adId.localeCompare(b.adId));
    if (items.reduce((n, x) => n + x.amountVnd, 0) !== spend.spendVnd) fail();
    return { accountId, status: sourceOnlyAdIds.length ? 'SOURCE_AD_GAPS' : 'RECONCILED_DELIVERY', runId: e.runId, payloadDigest: e.payloadDigest,
      collectedFrom: run.started_at, collectedTo: e.recordedAt, graphVersion: d.graphVersion, spendVnd: spend.spendVnd, adCount: items.length,
      zeroSpendWithSignals: items.filter(x => x.amountVnd === 0 && (x.impressions > 0 || x.clicks > 0)).length, ads: items, sourceOnlyAdIds, destinationCoverage: 'UNVERIFIED' };
  });
  return { policy: 'ACCOUNT_DELIVERY_RECONCILIATION_V1', since: period.since, until: period.until, accounts,
    destinationCoverage: 'UNVERIFIED', allowBudgetExecution: false };
}
module.exports = { accountDeliveryReport };
