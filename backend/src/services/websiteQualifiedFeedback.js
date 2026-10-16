'use strict';
const { buildWebsiteQualifiedLeads } = require('../modules/marketingAutomation/websiteQualifiedLeads');
const { createWebsiteFeedbackOutbox } = require('../modules/marketingAutomation/websiteFeedbackOutbox');
const { getWebsiteFeedbackConfig, createWebsiteFeedbackSender } = require('../modules/marketingAutomation/websiteFeedbackSender');
const COMPANY = '991dc79d-cbf5-49f9-a364-35227cb47635', DAY = 86400000;
const fail = code => Object.assign(new Error(code), { code });
const counters = value => Object.fromEntries(Object.entries(value || {}).filter(([k,v]) =>
  /^[a-z_]{1,64}$/.test(k) && Number.isSafeInteger(v) && v >= 0));
function createWebsiteQualifiedFeedback({ db, getConfig = getWebsiteFeedbackConfig,
  isPrimary, withPrimary, fetchImpl, now = () => Date.now(), buildEligible = buildWebsiteQualifiedLeads } = {}) {
  if (!db || typeof isPrimary !== 'function' || typeof withPrimary !== 'function') throw fail('DEPENDENCIES_REQUIRED');
  const primary = () => { if (isPrimary() !== true) throw fail('PRIMARY_REQUIRED'); };
  const source = ({ target, nowMs }) => buildEligible({ db, companyId: target.company_id,
    adAccountId: target.ad_account_id, fromMs: nowMs - 60 * DAY, toMs: nowMs, nowMs });
  const outbox = createWebsiteFeedbackOutbox(db);
  const sender = createWebsiteFeedbackSender({ db, getConfig, isPrimary, withPrimary, fetchImpl, now, buildEligible: source });
  let timer;
  async function preview() {
    const config = getConfig();
    const target = config.target || { company_id: COMPANY, ad_account_id: 'act_835757498658305', site_host: 'vanphuthanh.net' };
    if (target.company_id !== COMPANY) throw fail('SCOPE_INVALID');
    primary(); return withPrimary(async () => {
      const nowMs = now(), snapshot = await source({ target, nowMs }); primary();
      if (!Array.isArray(snapshot?.rows)) throw fail('SOURCE_UNAVAILABLE');
      let delivery = { available: false, counts: null, rows: [], guard: null };
      if (config.target && config.mode) {
        try { const state = await outbox.listState(target, config.mode, 50), guard = await outbox.guard(target, config.mode);
          primary(); delivery = { available: true, counts: counters(state.counts), rows: state.rows, guard }; }
        catch { primary(); }
      }
      return { as_of: new Date(nowMs).toISOString(), window: { from: new Date(nowMs - 60 * DAY).toISOString(), to: new Date(nowMs).toISOString() },
        configured: config.ready === true, enabled: config.enabled === true, mode: config.mode,
        reason_code: config.reason_code || null,
        scope: { company_id: COMPANY, ad_account_id: target.ad_account_id, site_host: target.site_host, dataset_id: target.dataset_id || null },
        counts: { verified_receipted: snapshot.rows.length, meta_ready: snapshot.rows.filter(r => r.delivery_supported === true).length,
          meta_held: snapshot.rows.filter(r => r.delivery_supported !== true).length }, diagnostics: counters(snapshot.diagnostics),
        rows: snapshot.rows.slice(0,100).map(r => ({ lead_id: r.lead_id, qualified_at: new Date(r.qualified_ms).toISOString(),
          acquired_at: new Date(r.acquired_ms).toISOString(), delivery_supported: r.delivery_supported === true, hold_reason: r.hold_reason || null })), delivery };
    });
  }
  function start() {
    if (timer || getConfig().enabled !== true) return;
    const tick = () => { void sender.drain({limit:10}).catch(() => console.warn('Website feedback: SOURCE_UNAVAILABLE')); };
    timer = setInterval(tick,5*60000); timer.unref?.(); tick();
  }
  function stop() { if (timer) clearInterval(timer); timer = null; }
  return { getConfig, preview, drain: sender.drain, start, stop };
}
let runtime;
function getWebsiteQualifiedFeedback() {
  if (!runtime) { const { supabase } = require('../config/supabase');
    const { getActiveTarget, withPrimaryDatabase } = require('../config/supabaseRouter');
    runtime = createWebsiteQualifiedFeedback({ db: supabase, isPrimary: () => getActiveTarget() === 'primary', withPrimary: withPrimaryDatabase }); }
  return runtime;
}
module.exports = { createWebsiteQualifiedFeedback, getWebsiteQualifiedFeedback, COMPANY };
