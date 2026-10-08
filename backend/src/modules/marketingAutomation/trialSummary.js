'use strict';
const { loadTrialCohort } = require('./trialCohort');
const { readFacebookSpend } = require('./spendCoverage');
const { APPROVED_PLAN } = require('./policy');
const { checkAdScope } = require('./adScope');
const { MILESTONE_SLUGS, MILESTONE_LABEL, MATURITY_DAYS, loadMilestoneReached, summarizeMilestone } = require('./stageMilestone');

async function readSpendWindow(db, scopes, from, to, asOf) {
  const accounts = [], daily = [], reasons = new Set();
  let total = 0, complete = scopes.length > 0, status = scopes.length ? 'COMPLETE' : 'UNPROVEN';
  const priority = { COMPLETE: 0, STALE: 1, UNPROVEN: 2, PARTIAL: 3,
    CURRENCY_MISMATCH: 4, FAILED: 5 };
  if (!scopes.length) reasons.add('NO_FACEBOOK_SCOPE');
  for (const scope of scopes) {
    const result = await readFacebookSpend(db, { accountId: scope.account_id, from, to });
    if (result.reasons?.includes('DB_ERROR') || result.reasons?.includes('PAGE_LIMIT'))
      throw Error('SOURCE_UNAVAILABLE');
    accounts.push({ account_id: scope.account_id, status: result.status,
      vnd: result.status === 'COMPLETE' ? result.spendVnd : null });
    if (result.status === 'COMPLETE') daily.push(...result.daily);
    if (result.status !== 'COMPLETE' || !Number.isSafeInteger(result.spendVnd)) complete = false;
    if ((priority[result.status] ?? 5) > (priority[status] ?? 5)) status = result.status;
    for (const reason of result.reasons || []) reasons.add(reason);
    if (result.status === 'COMPLETE') {
      total += result.spendVnd;
      if (!Number.isSafeInteger(total)) { complete = false; status = 'FAILED'; reasons.add('AMOUNT_OVERFLOW'); }
    }
  }
  if (new Set(scopes.map(scope => scope.account_id)).size !== scopes.length) {
    complete = false;
    if (status === 'COMPLETE') status = 'UNPROVEN';
    reasons.add('DUPLICATE_ACCOUNT_SCOPE');
  }
  return { status, vnd: complete ? total : null, as_of: asOf, accounts, reasons: [...reasons],
    daily: complete ? daily.sort((a, b) => a.day.localeCompare(b.day) ||
      a.account_id.localeCompare(b.account_id)) : [] };
}
async function buildTrialSummary({ db, trial, now = new Date() }) {
        const asOf = now.toISOString();
        const { candidates, statesByLead, excludedUnavailable } = await loadTrialCohort(db, trial);
        const available = new Set();
        for (let i = 0; i < candidates.length; i += 100) {
          const { data, error } = await db.from('crm_leads').select('id')
            .eq('company_id', trial.company_id)
            .in('id', candidates.slice(i, i + 100).map(row => row.lead_id));
          if (error || !Array.isArray(data)) throw error || Error('SOURCE_UNAVAILABLE');
          for (const row of data) available.add(row.id);
        }
        const leads = { candidates: 0, qualified: 0, pending: 0, rejected: 0,
          excluded_unavailable: excludedUnavailable + candidates.length - available.size };
        for (const row of candidates) {
          if (!available.has(row.lead_id)) continue;
          leads.candidates++;
          const status = statesByLead.get(row.lead_id)?.status || 'PENDING';
          if (status === 'QUALIFIED') leads.qualified++;
          else if (status === 'REJECTED') leads.rejected++;
          else leads.pending++;
        }
        const scopes = [];
        for (let offset = 0;; offset += 500) {
          const { data, error } = await db.from('p1_trial_scopes')
            .select('id,account_id').eq('trial_id', trial.id).eq('company_id', trial.company_id)
            .eq('provider', 'FACEBOOK').order('account_id', { ascending: true })
            .order('id', { ascending: true }).range(offset, offset + 499);
          if (error || !Array.isArray(data)) throw error || Error('SOURCE_UNAVAILABLE');
          scopes.push(...data);
          if (data.length < 500) break;
        }
        const dateParts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh',
          year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
        const part = type => dateParts.find(item => item.type === type).value;
        const today = `${part('year')}-${part('month')}-${part('day')}`;
        const to = trial.end_date < today ? trial.end_date : today;
        const spend = await readSpendWindow(db, scopes, trial.start_date, to, asOf);
        const { daily: spendByDay, ...spendSummary } = spend;
        const vnd = spend.vnd;
        const matureDay = new Date(Date.parse(`${today}T00:00:00Z`) - MATURITY_DAYS * 86400000)
          .toISOString().slice(0, 10);
        const matureTo = trial.end_date < matureDay ? trial.end_date : matureDay;
        const spendMature = matureTo < trial.start_date
          ? { vnd: null, reason: 'NO_MATURE_WINDOW' }
          : await readSpendWindow(db, scopes, trial.start_date, matureTo, asOf);
        const included = candidates.filter(row => available.has(row.lead_id));
        const { scopeCheck, inScopeLeadIds } = await checkAdScope(db, included, scopes);
        const { reachedByLead, invalidTimestamps } = await loadMilestoneReached(db, included);
        const milestone = { definition: { label: MILESTONE_LABEL, slugs: MILESTONE_SLUGS,
          source: 'crm_lead_stage_history', human_only: true, maturity_days: MATURITY_DAYS },
        ...summarizeMilestone({ candidates: included, reachedByLead,
          spendAll: spendSummary, spendMature, nowMs: Date.parse(asOf), inScopeLeadIds,
          reliability: scopeCheck.not_in_connected_accounts > 0 ? 'LOW_UNCONNECTED_ADS' : 'OK' }),
        invalid_timestamps: invalidTimestamps };
        const qualified = leads.qualified;
        const costStatus = vnd === null ? 'UNKNOWN' : qualified === 0
          ? 'NO_QUALIFIED_LEADS' : 'PROVISIONAL';
        const cost = { status: costStatus,
          vnd_ceil: costStatus === 'PROVISIONAL'
            ? Number((BigInt(vnd) + BigInt(qualified) - 1n) / BigInt(qualified)) : null,
          numerator_vnd: vnd, denominator: qualified,
          target_vnd: APPROVED_PLAN.targetQualifiedLeadCostVnd };
        const summary = { trial: { id: trial.id, name: trial.name, status: trial.status,
          start_date: trial.start_date, end_date: trial.end_date }, as_of: asOf,
        spend: spendSummary, leads, scope_check: scopeCheck, cost_per_qualified_lead: cost,
        milestone, verdict: 'NOT_EVALUATED',
        caveats: ['MILESTONE_IS_STAGE_PROXY', 'IDENTITY_NOT_RECONCILED',
          ...(scopeCheck.not_in_connected_accounts > 0 ? ['LEADS_FROM_UNCONNECTED_ADS']
            : scopeCheck.status === 'VERIFIED' ? [] : ['AD_ACCOUNT_SCOPE_UNVERIFIED']),
          'SPEND_AD_LEVEL_ONLY', 'FIRST_PAID_SOURCE_UNVERIFIED'] };
        return { summary, spendByDay };
}
module.exports = { buildTrialSummary };
