'use strict';
const { calendarDays } = require('./facebookSpendSource');
const MAX_AGE_MS = 6 * 3600000;
const unknown = reason => ({ status: 'UNKNOWN', reason, spendVnd: null, allowBudgetExecution: false });

// A server-side company-scoped read of every configured account. This is Facebook
// source coverage, not a trial registry or a multi-channel CPQL result.
function summarizeSpend({ accounts, runs, companyId, since, until, now, throughExclusive }) {
  let dates;
  try { dates = calendarDays(since, until); } catch { return unknown('INVALID_DATE_RANGE'); }
  const time = Date.parse(now);
  if (!companyId || !Number.isFinite(time) || !Array.isArray(accounts) || !accounts.length || !Array.isArray(runs)) return unknown('NO_CONFIGURED_ACCOUNTS');
  const ids = accounts.map(a => a.ad_account_id);
  if (new Set(ids).size !== ids.length || accounts.some(a => a.company_id !== companyId || a.bat !== true)) return unknown('ACCOUNT_SCOPE_MISMATCH');
  let spend = 0, asOf = null;
  const sources = [];
  for (const account of accounts) {
    if (account.token_het_han && (!Number.isFinite(Date.parse(account.token_het_han)) || Date.parse(account.token_het_han) <= time)) return unknown('ACCOUNT_PERMISSION_EXPIRED');
    const matches = runs.filter(r => r.ad_account_id === account.ad_account_id);
    if (matches.length !== 1) return unknown('MISSING_ACCOUNT_SNAPSHOT');
    const r = matches[0], s = r.snapshot;
    if (r.company_id !== companyId || r.state !== 'COMPLETE' || !s || s.accountId !== account.ad_account_id || s.currency !== 'VND' || s.source !== 'META_ACCOUNT_INSIGHTS_V1') return unknown('LATEST_SYNC_NOT_COMPLETE');
    const collected = Date.parse(r.started_at);
    if (!Number.isFinite(collected) || collected > time || time - collected > MAX_AGE_MS) return unknown('SPEND_STALE');
    if (throughExclusive !== undefined && (!Number.isFinite(Date.parse(throughExclusive)) || collected < Date.parse(throughExclusive))) return unknown('SPEND_BEFORE_PERIOD_CLOSE');
    if (r.since > since || r.until < until || s.since !== r.since || s.until !== r.until) return unknown('MISSING_DATE_COVERAGE');
    if (!Array.isArray(s.days)) return unknown('INVALID_SNAPSHOT');
    const daily = new Map();
    for (const d of s.days) {
      if (daily.has(d.date) || !Number.isSafeInteger(d.amountVnd) || d.amountVnd < 0) return unknown('INVALID_SNAPSHOT');
      daily.set(d.date, d.amountVnd);
    }
    let total = 0;
    for (const date of dates) { if (!daily.has(date)) return unknown('MISSING_DATE_COVERAGE'); total += daily.get(date); }
    spend += total;
    asOf = !asOf || collected < Date.parse(asOf) ? r.started_at : asOf;
    sources.push({ accountId: account.ad_account_id, runId: r.id, spendVnd: total, asOf: r.started_at });
  }
  if (!Number.isSafeInteger(spend)) return unknown('AMOUNT_OVERFLOW');
  return { status: 'KNOWN_TO_DATE', spendVnd: spend, asOf, since, until, currency: 'VND', timezone: 'Asia/Ho_Chi_Minh', sources,
    scope: 'CONFIGURED_FACEBOOK_ACCOUNTS', allowBudgetExecution: false, provisionalToday: until === new Date(time + 7 * 3600000).toISOString().slice(0, 10) };
}
async function readSpendCoverage({ client, companyId, since, until, now = new Date().toISOString(), sourceAllowed = true }) {
  if (!sourceAllowed) return unknown('SOURCE_NOT_ENABLED');
  try {
    calendarDays(since, until);
    const accounts = await client.from('fb_ad_accounts').select('ad_account_id,company_id,bat,token_het_han', { count: 'exact' }).eq('company_id', companyId);
    if (accounts.error || !Array.isArray(accounts.data) || accounts.count !== accounts.data.length) return unknown('ACCOUNT_SOURCE_UNAVAILABLE');
    const runs = await client.rpc('marketing_spend_latest', { p_company: companyId });
    if (runs.error || !Array.isArray(runs.data)) return unknown('SPEND_SOURCE_UNAVAILABLE');
    return summarizeSpend({ accounts: accounts.data, runs: runs.data, companyId, since, until, now });
  } catch { return unknown('SPEND_SOURCE_UNAVAILABLE'); }
}
module.exports = { summarizeSpend, readSpendCoverage, MAX_AGE_MS };
