'use strict';

const { buildMetaQualifiedLeads } = require('../modules/marketingAutomation/metaQualifiedLeads');
const { createMetaFeedbackOutbox, prepareMetaFeedback } = require('../modules/marketingAutomation/metaFeedbackOutbox');
const { getMetaFeedbackConfig, createMetaFeedbackSender, validPayload } = require('../modules/marketingAutomation/metaFeedbackSender');

const DAY = 86400000;
const fail = code => Object.assign(new Error(code), { code });
const safeCounters = values => Object.fromEntries(Object.entries(values || {})
  .filter(([key, value]) => /^[a-z_]{1,64}$/.test(key) && Number.isSafeInteger(value) && value >= 0));

function createMetaQualifiedFeedback({ db, getConfig = getMetaFeedbackConfig,
  isPrimary, withPrimary, fetchImpl, now = () => Date.now(),
  buildEligible = buildMetaQualifiedLeads, intervalMs = 5 * 60000 } = {}) {
  if (!db || typeof isPrimary !== 'function' || typeof withPrimary !== 'function')
    throw fail('META_DEPENDENCIES_REQUIRED');
  const primary = () => { if (isPrimary() !== true) throw fail('META_PRIMARY_REQUIRED'); };
  const source = ({ target, nowMs }) => buildEligible({ db,
    companyId: target.company_id, adAccountId: target.ad_account_id,
    pageIds: [target.page_id], fromMs: nowMs - 60 * DAY, toMs: nowMs, nowMs });
  const outbox = createMetaFeedbackOutbox(db);
  const sender = createMetaFeedbackSender({ db, getConfig, isPrimary, withPrimary, fetchImpl,
    now, buildEligible: source });
  let timer = null;

  async function preview() {
    const config = getConfig();
    const scope = config.target;
    const common = { configured: config.ready === true, enabled: config.enabled === true,
      mode: config.mode, reason_code: config.reason_code || null,
      scope: scope ? { company_id: scope.company_id, ad_account_id: scope.ad_account_id,
        page_id: scope.page_id, dataset_id: scope.dataset_id } : null };
    if (!scope) return { ...common, counts: null, diagnostics: null, rows: [],
      delivery: { available: false, counts: null, rows: [] } };
    primary();
    return withPrimary(async () => {
      const nowMs = now(), snapshot = await source({ target: scope, nowMs });
      primary();
      if (!Array.isArray(snapshot?.rows) || !Array.isArray(snapshot?.intakeRows))
        throw fail('SOURCE_UNAVAILABLE');
      const ready = row => row.delivery_supported === true && !validPayload(
        prepareMetaFeedback({ ...row, event_name: 'qualified_lead' },
          { target: scope, mode: config.mode }).payload, nowMs);
      const forms = snapshot.rows.filter(row => row.source_kind === 'lead_ads');
      const messaging = snapshot.rows.filter(row => row.source_kind === 'messenger');
      let delivery;
      try {
        const state = await outbox.listState(scope, config.mode, 50);
        const guard = await outbox.guard(scope, config.mode);
        primary();
        delivery = { available: true, counts: safeCounters(state.counts), rows: state.rows, guard };
      } catch {
        primary();
        delivery = { available: false, counts: null, rows: [], reason_code: 'META_OUTBOX_UNAVAILABLE' };
      }
      return { ...common, as_of: new Date(nowMs).toISOString(),
        window: { from: new Date(nowMs - 60 * DAY).toISOString(), to: new Date(nowMs).toISOString() },
        counts: { qualified_reconciled: snapshot.rows.length,
          instant_forms_ready: forms.filter(ready).length,
          messenger_reconciled: messaging.length, messenger_held: messaging.length,
          initial_leads_ready: snapshot.intakeRows.length,
          qualified_events_expired: forms.filter(row => row.delivery_supported === true && !ready(row)).length },
        diagnostics: safeCounters(snapshot.diagnostics),
        rows: snapshot.rows.slice(0, 100).map(row => ({ lead_id: row.lead_id,
          source_kind: row.source_kind, qualified_at: new Date(row.qualified_ms).toISOString(),
          acquired_at: new Date(row.acquired_ms).toISOString(),
          delivery_supported: row.source_kind === 'lead_ads' && ready(row),
          hold_reason: row.source_kind === 'messenger' ? 'MESSENGER_MAPPING_UNVERIFIED'
            : ready(row) ? null : 'META_EVENT_EXPIRED' })), delivery };
    });
  }

  async function drain(input) { return sender.drain(input); }
  function start() {
    if (timer || getConfig().enabled !== true) return;
    const tick = () => { void drain({ limit: 10 }).catch(() => {
      // Never print provider bodies, lead identities or credentials.
      console.warn('Meta qualified feedback: SOURCE_UNAVAILABLE');
    }); };
    timer = setInterval(tick, intervalMs); timer.unref?.(); tick();
  }
  function stop() { if (timer) clearInterval(timer); timer = null; }
  return { getConfig, preview, drain, start, stop };
}

let runtime;
function getMetaQualifiedFeedback() {
  if (!runtime) {
    const { supabase } = require('../config/supabase');
    const { getActiveTarget, withPrimaryDatabase } = require('../config/supabaseRouter');
    runtime = createMetaQualifiedFeedback({ db: supabase,
      isPrimary: () => getActiveTarget() === 'primary', withPrimary: withPrimaryDatabase });
  }
  return runtime;
}

module.exports = { createMetaQualifiedFeedback, getMetaQualifiedFeedback, safeCounters };
