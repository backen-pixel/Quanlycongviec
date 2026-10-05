'use strict';

const GRAPH = 'https://graph.facebook.com/v22.0';
const DAY = 86400000;
function fail(code) { const e = new Error(code); e.code = code; throw e; }
function accountId(value) {
  const id = String(value || '').replace(/^act_/, '');
  if (!/^\d+$/.test(id)) fail('INVALID_ACCOUNT');
  return `act_${id}`;
}
function dateOnly(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
function calendarDays(since, until) {
  if (!dateOnly(since) || !dateOnly(until)) fail('INVALID_DATE_RANGE');
  const n = (Date.parse(until) - Date.parse(since)) / DAY;
  if (n < 0 || n > 92) fail('INVALID_DATE_RANGE');
  return Array.from({ length: n + 1 }, (_, i) => new Date(Date.parse(since) + i * DAY).toISOString().slice(0, 10));
}
function vnd(value) {
  // Do not silently coerce null, malformed amounts or fractional VND to zero.
  if (!/^(0|[1-9]\d*)(\.0{1,2})?$/.test(String(value ?? ''))) fail('INVALID_VND_AMOUNT');
  const n = Number(value);
  if (!Number.isSafeInteger(n)) fail('INVALID_VND_AMOUNT');
  return n;
}
function graphUrl(raw, path) {
  let u;
  try { u = new URL(raw); } catch { fail('UNSAFE_PAGINATION'); }
  if (u.origin !== 'https://graph.facebook.com' || u.username || u.password || u.hash || u.pathname !== path) fail('UNSAFE_PAGINATION');
  u.searchParams.delete('access_token');
  return u;
}
async function graphJson(url, token, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, redirect: 'error', headers: { Authorization: `Bearer ${token}` } });
    const body = await response.json();
    if (!response.ok || !body || typeof body !== 'object' || body.error) fail('FACEBOOK_READ_FAILED');
    return body;
  } catch (e) {
    // Neither upstream messages, next URLs nor tokens enter logs/database/API.
    if (e.code === 'FACEBOOK_READ_FAILED') throw e;
    fail('FACEBOOK_READ_FAILED');
  } finally { clearTimeout(timer); }
}
async function allPages(first, token, fetchImpl, maxPages = 50) {
  const path = new URL(first).pathname;
  const rows = [], seen = new Set();
  let next = first;
  for (let i = 0; next && i < maxPages; i++) {
    const url = graphUrl(next, path).toString();
    if (seen.has(url)) fail('PAGINATION_LOOP');
    seen.add(url);
    const body = await graphJson(url, token, fetchImpl);
    if (!Array.isArray(body.data)) fail('INVALID_FACEBOOK_DATA');
    rows.push(...body.data);
    if (rows.length > 50000) fail('PAGINATION_LIMIT');
    next = body.paging?.next ?? null;
    if (next !== null && (typeof next !== 'string' || !next)) fail('INVALID_PAGINATION');
  }
  if (next) fail('PAGINATION_LIMIT');
  return rows;
}

async function readAccountSpend({ adAccountId, token, since, until, now = new Date().toISOString(), fetchImpl = fetch }) {
  const id = accountId(adAccountId), dates = calendarDays(since, until);
  if (!token || !Number.isFinite(Date.parse(now))) fail('INVALID_SOURCE_CONTEXT');
  const today = new Date(Date.parse(now) + 7 * 3600000).toISOString().slice(0, 10);
  if (until > today) fail('FUTURE_DATE_RANGE');
  const info = await graphJson(`${GRAPH}/${id}?fields=id,currency,timezone_name,timezone_offset_hours_utc`, token, fetchImpl);
  if (accountId(info.id) !== id || info.currency !== 'VND') fail('ACCOUNT_OR_CURRENCY_MISMATCH');
  if (!['Asia/Ho_Chi_Minh', 'Asia/Saigon', 'Asia/Bangkok'].includes(info.timezone_name) || info.timezone_offset_hours_utc !== 7) fail('UNSUPPORTED_ACCOUNT_TIMEZONE');
  const url = new URL(`${GRAPH}/${id}/insights`);
  url.searchParams.set('level', 'account');
  url.searchParams.set('fields', 'account_id,account_currency,date_start,date_stop,spend');
  url.searchParams.set('time_range', JSON.stringify({ since, until }));
  url.searchParams.set('limit', '500');
  url.searchParams.set('time_increment', '1');
  const daily = await allPages(url.toString(), token, fetchImpl);
  url.searchParams.set('time_increment', 'all_days');
  const totals = await allPages(url.toString(), token, fetchImpl);
  const validateAccount = r => { if (accountId(r.account_id) !== id || r.account_currency !== 'VND') fail('ACCOUNT_OR_CURRENCY_MISMATCH'); };
  const values = new Map();
  for (const r of daily) {
    validateAccount(r);
    if (!dates.includes(r.date_start) || r.date_stop !== r.date_start || values.has(r.date_start)) fail('INVALID_DAILY_SPEND');
    values.set(r.date_start, vnd(r.spend));
  }
  if (totals.length > 1) fail('INVALID_ACCOUNT_TOTAL');
  let total = 0;
  if (totals.length) {
    const r = totals[0]; validateAccount(r);
    if (r.date_start !== since || r.date_stop !== until) fail('INVALID_ACCOUNT_TOTAL');
    total = vnd(r.spend);
  }
  const sum = [...values.values()].reduce((a, b) => a + b, 0);
  if (!Number.isSafeInteger(sum) || sum !== total) fail('SPEND_RECONCILIATION_FAILED');
  // Empty days are zero only after BOTH complete reports reconcile. An HTTP
  // error, malformed page or truncated pagination cannot produce this result.
  return { accountId: id, currency: 'VND', timezone: info.timezone_name, since, until,
    totalVnd: total, days: dates.map(date => ({ date, amountVnd: values.get(date) ?? 0 })),
    source: 'META_ACCOUNT_INSIGHTS_V1' };
}
module.exports = { readAccountSpend, allPages, graphJson, calendarDays, accountId, vnd, dateOnly };
