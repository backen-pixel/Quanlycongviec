'use strict';
const { createHash } = require('node:crypto');
const { graphJson, calendarDays, accountId, vnd } = require('./facebookSpendSource');
const fail = code => { throw Object.assign(Error(code), { code }); };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const numeric = value => typeof value === 'string' && /^[0-9]{1,32}$/.test(value);
const count = value => {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(Number(value))) fail('INVALID_DELIVERY_COUNT');
  return Number(value);
};
const sum = (a, b) => { const n = a + b; if (!Number.isSafeInteger(n)) fail('DELIVERY_OVERFLOW'); return n; };
const metrics = row => ({ amountVnd: vnd(row.spend), impressions: count(row.impressions), clicks: count(row.clicks) });
const empty = () => ({ amountVnd: 0, impressions: 0, clicks: 0 });
const add = (a, b) => Object.fromEntries(Object.keys(empty()).map(k => [k, sum(a[k], b[k])]));
const same = (a, b) => Object.keys(empty()).every(k => a[k] === b[k]);

// Only an opaque cursor comes from paging.next. Reconstruct every request from
// the original scope; a provider URL cannot change date, level, fields or account.
async function readPages(base, token, fetchImpl, label) {
  let after = null, chain = digest([label, base.toString()]);
  const seen = new Set(), rows = [];
  for (let ordinal = 1; ordinal <= 50; ordinal++) {
    const url = new URL(base); if (after !== null) url.searchParams.set('after', after);
    const body = await graphJson(url.toString(), token, fetchImpl);
    if (!Array.isArray(body.data) || body.data.length > 500 || rows.length + body.data.length > 5000) fail('DELIVERY_PAGE_LIMIT');
    // Hash the requested fields only. Provider-added names/contact data/tokens
    // are neither saved nor allowed to make the normalized evidence ambiguous.
    const page = body.data.map(row => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) fail('INVALID_DELIVERY_ROW');
      return Object.fromEntries(base.searchParams.get('fields').split(',').map(k => [k, row[k]]));
    });
    rows.push(...page); chain = digest([chain, ordinal, page]);
    const next = body.paging?.next;
    if (next === undefined || next === null) return { rows, witness: { label, pages: ordinal, rows: rows.length, digest: chain } };
    let parsed; try { parsed = new URL(next); } catch { fail('UNSAFE_DELIVERY_PAGING'); }
    if (typeof next !== 'string' || parsed.origin !== base.origin || parsed.pathname !== base.pathname || parsed.username || parsed.password || parsed.hash) fail('UNSAFE_DELIVERY_PAGING');
    const cursor = body.paging?.cursors?.after;
    if (typeof cursor !== 'string' || !cursor.length || cursor.length > 2048 || parsed.searchParams.getAll('after').length !== 1 || parsed.searchParams.get('after') !== cursor || seen.has(cursor)) fail('INVALID_DELIVERY_CURSOR');
    // If Meta includes scope parameters, they must still match the initial
    // request. Unknown parameters are ignored and never forwarded.
    for (const [key, value] of base.searchParams) if (parsed.searchParams.has(key) && (parsed.searchParams.getAll(key).length !== 1 || parsed.searchParams.get(key) !== value)) fail('DELIVERY_SCOPE_CHANGED');
    seen.add(cursor); after = cursor;
  }
  fail('DELIVERY_PAGE_LIMIT');
}

async function readAccountSpendWithDelivery({ adAccountId, token, since, until, version, now = new Date().toISOString(), fetchImpl = fetch }) {
  const id = accountId(adAccountId), dates = calendarDays(since, until);
  if (!/^v[0-9]{2,3}\.0$/.test(version || '') || typeof token !== 'string' || !token || !Number.isFinite(Date.parse(now))) fail('INVALID_DELIVERY_CONTEXT');
  if (until > new Date(Date.parse(now) + 7 * 3600000).toISOString().slice(0, 10)) fail('FUTURE_DATE_RANGE');
  const graph = `https://graph.facebook.com/${version}`;
  const info = await graphJson(`${graph}/${id}?fields=id,currency,timezone_name,timezone_offset_hours_utc`, token, fetchImpl);
  if (accountId(info.id) !== id || info.currency !== 'VND') fail('ACCOUNT_OR_CURRENCY_MISMATCH');
  if (!['Asia/Ho_Chi_Minh', 'Asia/Saigon', 'Asia/Bangkok'].includes(info.timezone_name) || info.timezone_offset_hours_utc !== 7) fail('UNSUPPORTED_ACCOUNT_TIMEZONE');
  const witnesses = [];
  async function read(level, daily, label) {
    const url = new URL(`${graph}/${id}/insights`);
    url.searchParams.set('level', level);
    url.searchParams.set('fields', ['account_id', 'account_currency', ...(level === 'ad' ? ['ad_id', 'adset_id', 'campaign_id'] : []), 'date_start', 'date_stop', 'spend', 'impressions', 'clicks'].join(','));
    url.searchParams.set('time_range', JSON.stringify({ since, until }));
    url.searchParams.set('time_increment', daily ? '1' : 'all_days');
    url.searchParams.set('limit', '500');
    const result = await readPages(url, token, fetchImpl, label); witnesses.push(result.witness);
    return result.rows.map(row => {
      if (accountId(row.account_id) !== id || row.account_currency !== 'VND') fail('ACCOUNT_OR_CURRENCY_MISMATCH');
      if (daily ? !dates.includes(row.date_start) || row.date_stop !== row.date_start : row.date_start !== since || row.date_stop !== until) fail('DELIVERY_PERIOD_MISMATCH');
      if (level === 'ad' && !['ad_id', 'adset_id', 'campaign_id'].every(k => numeric(row[k]))) fail('INVALID_DELIVERY_AD');
      return { date: row.date_start, ...(level === 'ad' ? { adId: row.ad_id, adsetId: row.adset_id, campaignId: row.campaign_id } : {}), ...metrics(row) };
    });
  }
  async function readAccount(label) {
    const daily = await read('account', true, label + '_DAILY'), totals = await read('account', false, label + '_TOTAL');
    if (totals.length > 1 || new Set(daily.map(d => d.date)).size !== daily.length) fail('DUPLICATE_DELIVERY_ROW');
    const total = daily.reduce(add, empty());
    if (!same(total, totals[0] || empty())) fail('DELIVERY_ACCOUNT_MISMATCH');
    return { days: dates.map(date => daily.find(d => d.date === date) || { date, ...empty() }), total };
  }
  const before = await readAccount('BEFORE');
  const adDays = await read('ad', true, 'AD_DAILY'), adTotals = await read('ad', false, 'AD_TOTAL');
  const seen = new Set(), ads = new Map(), dayTotals = new Map();
  for (const row of adDays) {
    const key = `${row.adId}:${row.date}`;
    if (seen.has(key)) fail('DUPLICATE_DELIVERY_ROW'); seen.add(key);
    const prior = ads.get(row.adId);
    if (prior && (prior.adsetId !== row.adsetId || prior.campaignId !== row.campaignId)) fail('DELIVERY_AD_CONFLICT');
    ads.set(row.adId, { adsetId: row.adsetId, campaignId: row.campaignId, ...add(prior || empty(), row) });
    dayTotals.set(row.date, add(dayTotals.get(row.date) || empty(), row));
  }
  const totalIds = new Set();
  for (const row of adTotals) {
    const daily = ads.get(row.adId);
    if (totalIds.has(row.adId)) fail('DUPLICATE_DELIVERY_ROW'); totalIds.add(row.adId);
    if (!daily || row.adsetId !== daily.adsetId || row.campaignId !== daily.campaignId || !same(row, daily)) fail('DELIVERY_AD_TOTAL_MISMATCH');
  }
  if (totalIds.size !== ads.size || before.days.some(row => !same(row, dayTotals.get(row.date) || empty()))) fail('DELIVERY_ACCOUNT_MISMATCH');
  const after = await readAccount('AFTER');
  if (before.days.some((row, i) => !same(row, after.days[i]))) fail('DELIVERY_CHANGED_DURING_READ');
  adDays.sort((a, b) => a.date.localeCompare(b.date) || a.adId.localeCompare(b.adId));
  const delivery = { policy: 'META_ACCOUNT_DELIVERY_V1', graphVersion: version, accountDays: before.days, adDays, witnesses,
    rowDigest: digest(adDays), destinationCoverage: 'UNVERIFIED' };
  return { accountId: id, currency: 'VND', timezone: info.timezone_name, since, until, totalVnd: before.total.amountVnd,
    days: before.days.map(d => ({ date: d.date, amountVnd: d.amountVnd })), source: 'META_ACCOUNT_INSIGHTS_V1', delivery };
}
module.exports = { readAccountSpendWithDelivery };
