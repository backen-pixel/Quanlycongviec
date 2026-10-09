'use strict';

// A lead sales has classified (cold / warm / hot = chuẩn bị xây / xây thô / nhà gần hoàn thiện)
// is "valid" per Founder (08/10/2026); leads that moved further also count. Human-entered only.
// Not counted: lead_new, not_contacted, lost and stages without a canonical slug.
const MILESTONE_SLUGS = Object.freeze(['cold', 'warm', 'hot', 'survey_scheduled', 'survey_done', 'quoted',
  'negotiating', 'waiting_deposit', 'designing', 'contract_signed', 'producing',
  'installing', 'completed']);
const MILESTONE_LABEL = 'Đã phân loại Cold/Warm/Hot';
const MATURITY_DAYS = 4;
const DAY_MS = 86400000;

async function loadMilestoneReached(db, candidates) {
  const reachedByLead = new Map();
  let invalidTimestamps = 0;
  const firstTouch = new Map();
  for (const row of candidates) {
    const ms = Date.parse(row.cham_dau_luc);
    if (!Number.isFinite(ms)) { invalidTimestamps++; continue; }
    firstTouch.set(row.lead_id, ms);
  }
  const ids = [...firstTouch.keys()];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    for (let offset = 0;; offset += 500) {
      const { data, error } = await db.from('crm_lead_stage_history')
        .select('lead_id,to_canonical_slug,changed_by,entered_at')
        .in('lead_id', chunk).in('to_canonical_slug', MILESTONE_SLUGS)
        .not('changed_by', 'is', null).order('entered_at', { ascending: true })
        .range(offset, offset + 499);
      if (error || !Array.isArray(data) || data.length > 500)
        throw error || Error('SOURCE_UNAVAILABLE');
      for (const row of data) {
        if (!firstTouch.has(row.lead_id) || !MILESTONE_SLUGS.includes(row.to_canonical_slug) ||
            !row.changed_by) continue;
        const ms = Date.parse(row.entered_at);
        if (!Number.isFinite(ms)) { invalidTimestamps++; continue; }
        if (ms < firstTouch.get(row.lead_id)) continue;
        const previous = reachedByLead.get(row.lead_id);
        if (!previous || ms < Date.parse(previous)) reachedByLead.set(row.lead_id, row.entered_at);
      }
      if (data.length < 500) break;
    }
  }
  return { reachedByLead, invalidTimestamps };
}

function cost(spend, denominator) {
  if (spend?.reason === 'NO_MATURE_WINDOW') return { status: 'UNKNOWN', vnd_ceil: null,
    numerator_vnd: null, denominator, reason: 'NO_MATURE_WINDOW' };
  const vnd = spend?.vnd;
  if (!Number.isSafeInteger(vnd) || vnd < 0) return { status: 'UNKNOWN', vnd_ceil: null,
    numerator_vnd: null, denominator };
  if (denominator === 0) return { status: 'NO_QUALIFIED_LEADS', vnd_ceil: null,
    numerator_vnd: vnd, denominator };
  return { status: 'PROVISIONAL',
    vnd_ceil: Number((BigInt(vnd) + BigInt(denominator) - 1n) / BigInt(denominator)),
    numerator_vnd: vnd, denominator };
}

function summarizeMilestone({ candidates, reachedByLead, spendAll, spendMature, nowMs,
  inScopeLeadIds = new Set(), reliability = 'OK' }) {
  const cutoff = nowMs - MATURITY_DAYS * DAY_MS;
  let reached = 0, mature = 0, matureReached = 0, reachedInScope = 0, matureReachedInScope = 0;
  for (const row of candidates) {
    const hit = reachedByLead.has(row.lead_id);
    if (hit) { reached++; if (inScopeLeadIds.has(row.lead_id)) reachedInScope++; }
    const touchMs = Date.parse(row.cham_dau_luc);
    if (Number.isFinite(touchMs) && touchMs <= cutoff) {
      mature++;
      if (hit) { matureReached++; if (inScopeLeadIds.has(row.lead_id)) matureReachedInScope++; }
    }
  }
  return { candidates: candidates.length, reached, mature_candidates: mature,
    mature_reached: matureReached, reached_in_scope: reachedInScope,
    cost_to_date: { ...cost(spendAll, reached), reliability },
    cost_mature: { ...cost(spendMature, matureReached), reliability },
    cost_in_scope_to_date: cost(spendAll, reachedInScope),
    cost_in_scope_mature: cost(spendMature, matureReachedInScope) };
}

module.exports = { MILESTONE_SLUGS, MILESTONE_LABEL, MATURITY_DAYS,
  loadMilestoneReached, summarizeMilestone };
