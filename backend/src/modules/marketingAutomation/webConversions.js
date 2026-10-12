'use strict';

// W4: website conversions by channel — form leads (lead_attribution kenh='website'), valid leads
// (same stage milestone as the P1 trial), call / Zalo / Messenger clicks (web_conversion_events)
// and spend. Facebook spend counts only ads that actually sent visitors to the website; Google, TikTok,
// Zalo and ChatGPT spend come from ad_spend_daily_manual until an API sync exists.
const { loadMilestoneReached } = require('./stageMilestone');
const { toWholeVnd } = require('./spendCoverage');

const CHANNELS = Object.freeze([
  { key: 'google_ads', label: 'Google Ads' },
  { key: 'facebook', label: 'Facebook / Instagram' },
  { key: 'tiktok_ads', label: 'TikTok Ads' },
  { key: 'zalo_ads', label: 'Zalo Ads' },
  { key: 'seo', label: 'Tìm kiếm tự nhiên (SEO)' },
  { key: 'chatgpt_ads', label: 'ChatGPT Ads' },
  { key: 'other', label: 'Trực tiếp / khác' },
]);
const MANUAL_PROVIDER = { GOOGLE: 'google_ads', TIKTOK: 'tiktok_ads', ZALO: 'zalo_ads', CHATGPT: 'chatgpt_ads' };
const PAID = ['cpc', 'ppc', 'paid_search', 'paid', 'paid_social'];
const PAGE = 1000;
const MAX_PAGES = 50;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function channelOf(row) {
  const platform = String(row.platform || '').toLowerCase();
  const medium = String(row.utm_medium || '').toLowerCase();
  if (row.gclid || row.gbraid || row.wbraid) return 'google_ads';
  if (platform === 'google') return PAID.includes(medium) ? 'google_ads'
    : medium === 'organic' ? 'seo' : 'other';
  if (platform === 'facebook' || platform === 'instagram') return 'facebook';
  // A TikTok ad click without UTM still carries ttclid, which the site maps to platform tiktok.
  if (platform === 'tiktok') return PAID.includes(medium) || medium === '' ? 'tiktok_ads' : 'other';
  // Zalo OA chats and zalo.me links are not paid traffic; only tagged Zalo Ads count here.
  if (platform === 'zalo' && PAID.includes(medium)) return 'zalo_ads';
  if (platform === 'chatgpt' && medium === 'paid') return 'chatgpt_ads';
  return 'other';
}

async function readAll(build) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await build().range(page * PAGE, (page + 1) * PAGE - 1);
    if (error || !Array.isArray(data)) throw error || Error('SOURCE_UNAVAILABLE');
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
  throw Error('PAGE_LIMIT');
}

// Live-site QA traffic is tagged utm_source=vpt_test and never counted.
const isQaRow = row => String(row.utm_source || '').toLowerCase() === 'vpt_test';

const ceilDiv = (num, den) => den > 0 && Number.isSafeInteger(num)
  ? Number((BigInt(num) + BigInt(den) - 1n) / BigInt(den)) : null;

async function buildWebConversions({ db, companyId, from, to }) {
  if (!DAY.test(from) || !DAY.test(to) || from > to) throw Object.assign(Error('INVALID_RANGE'), { code: 'INVALID_RANGE' });
  const start = `${from}T00:00:00+07:00`;
  const end = new Date(Date.parse(`${to}T00:00:00+07:00`) + 86400000).toISOString();

  // Form leads: website first touch in range, this company, not explicit test records.
  const touches = await readAll(() => db.from('lead_attribution')
    .select('id,lead_id,platform,utm_source,utm_medium,gclid,gbraid,wbraid,ad_id,fb_ad_id,cham_dau_luc')
    .eq('company_id', companyId).eq('kenh', 'website').not('lead_id', 'is', null)
    .gte('cham_dau_luc', start).lt('cham_dau_luc', end)
    .order('cham_dau_luc', { ascending: true }).order('id', { ascending: true }));
  const ids = [...new Set(touches.map(row => row.lead_id))];
  const real = new Set();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await db.from('crm_leads').select('id,is_test')
      .eq('company_id', companyId).in('id', ids.slice(i, i + 100));
    if (error || !Array.isArray(data)) throw error || Error('SOURCE_UNAVAILABLE');
    for (const row of data) if (row.is_test !== true) real.add(row.id);
  }
  const leads = [];
  const seenLead = new Set();
  for (const row of touches) {
    if (isQaRow(row)) continue;
    if (!real.has(row.lead_id) || seenLead.has(row.lead_id)) continue;
    seenLead.add(row.lead_id);
    leads.push(row);
  }
  const { reachedByLead } = await loadMilestoneReached(db, leads);

  const clicks = await readAll(() => db.from('web_conversion_events')
    .select('id,kind,platform,utm_source,utm_medium,gclid,gbraid,wbraid,ad_id,occurred_at')
    .eq('company_id', companyId).gte('occurred_at', start).lt('occurred_at', end)
    .order('occurred_at', { ascending: true }).order('id', { ascending: true }));

  const stats = Object.fromEntries(CHANNELS.map(({ key, label }) => [key, { key, label,
    form_leads: 0, valid_leads: 0, calls: 0, zalo: 0, messenger: 0, spend_vnd: null }]));
  const facebookAds = new Set();
  for (const row of leads) {
    const channel = channelOf(row);
    stats[channel].form_leads++;
    if (reachedByLead.has(row.lead_id)) stats[channel].valid_leads++;
    if (channel === 'facebook' && (row.fb_ad_id || row.ad_id)) facebookAds.add(row.fb_ad_id || row.ad_id);
  }
  const kindKey = { call: 'calls', zalo: 'zalo', messenger: 'messenger' };
  for (const row of clicks) {
    if (isQaRow(row)) continue;
    const channel = channelOf(row);
    if (kindKey[row.kind]) stats[channel][kindKey[row.kind]]++;
    if (channel === 'facebook' && row.ad_id) facebookAds.add(row.ad_id);
  }

  // Facebook: spend of the ads seen on the website in this range (VND rows only).
  const adIds = [...facebookAds].filter(id => /^\d{1,32}$/.test(id));
  let facebookSpend = 0;
  for (let i = 0; i < adIds.length; i += 100) {
    const rows = await readAll(() => db.from('fb_ad_spend_daily').select('ad_id,ngay,chi_tieu,tien_te')
      .in('ad_id', adIds.slice(i, i + 100)).gte('ngay', from).lte('ngay', to)
      .order('ngay', { ascending: true }).order('ad_id', { ascending: true }));
    for (const row of rows) {
      const amount = row.tien_te === 'VND' ? toWholeVnd(row.chi_tieu) : null;
      if (amount !== null) facebookSpend += amount;
    }
  }
  if (adIds.length) stats.facebook.spend_vnd = facebookSpend;

  const manual = await readAll(() => db.from('ad_spend_daily_manual').select('id,provider,ngay,chi_tieu_vnd')
    .eq('company_id', companyId).gte('ngay', from).lte('ngay', to)
    .order('ngay', { ascending: true }).order('id', { ascending: true }));
  for (const row of manual) {
    const channel = MANUAL_PROVIDER[row.provider];
    const amount = toWholeVnd(row.chi_tieu_vnd);
    if (!channel || amount === null) continue;
    stats[channel].spend_vnd = (stats[channel].spend_vnd || 0) + amount;
  }
  stats.seo.spend_vnd = 0;

  const channels = CHANNELS.map(({ key }) => {
    const s = stats[key];
    const conversions = s.form_leads + s.calls + s.zalo + s.messenger;
    return { ...s, conversions,
      cost_per_conversion_vnd: s.spend_vnd ? ceilDiv(s.spend_vnd, conversions) : null,
      cost_per_valid_vnd: s.spend_vnd ? ceilDiv(s.spend_vnd, s.valid_leads) : null };
  });
  const totals = channels.reduce((sum, c) => {
    for (const k of ['form_leads', 'valid_leads', 'calls', 'zalo', 'messenger', 'conversions']) sum[k] += c[k];
    if (c.spend_vnd !== null) sum.spend_vnd += c.spend_vnd;
    return sum;
  }, { form_leads: 0, valid_leads: 0, calls: 0, zalo: 0, messenger: 0, conversions: 0, spend_vnd: 0 });
  return { from, to, channels, totals,
    basis: { facebook_spend: 'ADS_SEEN_ON_WEBSITE', manual_providers: Object.keys(MANUAL_PROVIDER),
      valid_lead: 'STAGE_MILESTONE', clicks_once_per_visit: true } };
}

module.exports = { CHANNELS, channelOf, buildWebConversions };
