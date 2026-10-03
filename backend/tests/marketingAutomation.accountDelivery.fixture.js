'use strict';
function provider({ account = 'act_1', since = '2026-10-01', until = since, mutate = x => x } = {}) {
 const calls = [], counters = {};
 const row = (amount, impressions, clicks, adId, date = since) => ({ account_id: account.replace('act_', ''), account_currency: 'VND', date_start: date, date_stop: date,
  spend: String(amount), impressions: String(impressions), clicks: String(clicks), ...(adId ? { ad_id: adId, adset_id: '8', campaign_id: '9' } : {}) });
 const ads = [row(500000, 100, 10, '7'), row(0, 3, 1, '70')];
 const fetchImpl = async (raw, options) => {
  const url = new URL(raw);calls.push(url.toString());
  if (url.searchParams.has('access_token') || options.headers.Authorization !== 'Bearer synthetic' || options.redirect !== 'error') throw Error('invalid transport');
  if (!url.pathname.endsWith('/insights')) return { ok: true, json: async () => ({ id: account, currency: 'VND', timezone_name: 'Asia/Ho_Chi_Minh', timezone_offset_hours_utc: 7 }) };
  const kind = url.searchParams.get('level') + ':' + url.searchParams.get('time_increment'), call = counters[kind] = (counters[kind] || 0) + 1;
  let data = kind.startsWith('account') ? [row(500000, 103, 11)] : structuredClone(ads);
  if (kind.endsWith('all_days')) data.forEach(x => x.date_stop = until);
  const body = mutate({ data }, { kind, call, url });
  return { ok: true, json: async () => body };
 };
 return { calls, input: { adAccountId: account, token: 'synthetic', since, until, now: '2026-10-02T00:00:00Z', version: 'v24.0', fetchImpl } };
}
module.exports = { provider };
