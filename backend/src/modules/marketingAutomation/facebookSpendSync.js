'use strict';
const { readAccountSpend, calendarDays, accountId } = require('./facebookSpendSource');

function createSpendSync({ client, writerAllowed, readSource = readAccountSpend }) {
  async function rpc(name, args) {
    if (writerAllowed() !== true) throw new Error('PRIMARY_ONLY_REQUIRED');
    const r = await client.rpc(name, args);
    if (r?.error || !r?.data) throw new Error('SPEND_STORAGE_UNAVAILABLE');
    return r.data;
  }
  return async function sync({ account, since, until, now = new Date().toISOString() }) {
    calendarDays(since, until);
    const id = accountId(account.ad_account_id);
    // Begin BEFORE any external read: failures/restarts supersede old successful
    // snapshots rather than continuing to present old figures as current.
    const run = await rpc('marketing_spend_begin', { p_account: id, p_company: account.company_id, p_since: since, p_until: until });
    try {
      const snapshot = await readSource({ adAccountId: id, token: account.access_token, since, until, now });
      await rpc('marketing_spend_finish', { p_id: run.id, p_company: account.company_id, p_snapshot: snapshot, p_failure: null });
      return { status: 'COMPLETE', runId: run.id, since, until };
    } catch (e) {
      const known = new Set(['INVALID_VND_AMOUNT','FACEBOOK_READ_FAILED','INVALID_FACEBOOK_DATA','UNSAFE_PAGINATION','PAGINATION_LOOP','PAGINATION_LIMIT','INVALID_PAGINATION','ACCOUNT_OR_CURRENCY_MISMATCH','UNSUPPORTED_ACCOUNT_TIMEZONE','INVALID_DAILY_SPEND','INVALID_ACCOUNT_TOTAL','SPEND_RECONCILIATION_FAILED','FUTURE_DATE_RANGE']);
      const reason = known.has(e.code) ? e.code : 'SOURCE_OR_STORAGE_FAILED';
      try { await rpc('marketing_spend_finish', { p_id: run.id, p_company: account.company_id, p_snapshot: null, p_failure: reason }); } catch { /* RUNNING remains UNKNOWN to readers. */ }
      return { status: 'UNKNOWN', reason, runId: run.id };
    }
  };
}

async function syncConfiguredAccount(account, { days = 30, now = new Date().toISOString() } = {}) {
  const { supabase, isFailoverEnabled, getActiveTarget } = require('../../config/supabaseRouter');
  const until = new Date(Date.parse(now) + 7 * 3600000).toISOString().slice(0, 10);
  const since = new Date(Date.parse(until) - (Math.max(1, Math.min(90, Math.floor(days))) - 1) * 86400000).toISOString().slice(0, 10);
  // The shared Supabase transport can rewrite requests after a failover. This
  // path is refused whenever failover is enabled, not merely before each call.
  return createSpendSync({ client: supabase, writerAllowed: () => !isFailoverEnabled() && getActiveTarget() === 'primary' })({ account, since, until, now });
}
module.exports = { createSpendSync, syncConfiguredAccount };
