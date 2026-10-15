'use strict';

const STAGE_METHOD = 'stage_based_v1';
const EXTRA_COLUMNS = ',qualification_method,stage_history_id,stage_evidence';
const text = value => typeof value === 'string' ? value.trim() : '';
const time = value => value ? Date.parse(value) : NaN;
const unavailable = () => Error('SOURCE_UNAVAILABLE');

function basicQualification(event) {
  if (!event?.actor_id || !Number.isFinite(time(event.recorded_at))) return false;
  if (event.qualification_method === STAGE_METHOD)
    return event.contact_usable === false && event.need_in_scope === false && event.area_in_service === false
      && event.evidence_ref == null && !!event.stage_history_id && event.stage_evidence?.policy_version === STAGE_METHOD;
  if (event.qualification_method != null && event.qualification_method !== 'manual_v1') return false;
  return !!text(event.evidence_ref) && event.contact_usable === true && event.need_in_scope === true && event.area_in_service === true;
}

// Called only if actual policy events exist; legacy manual sources retain their
// exact evidence path. read() is the exporter's complete/snapshot-checked reader.
async function loadStageProof({ db, events, leads, read }) {
  const expectedLeads = new Map(leads.map(l => [l.id, l]));
  const policy = events.filter(e => e.qualification_method === STAGE_METHOD && e.status === 'QUALIFIED'
    && expectedLeads.has(e.canonical_lead_id));
  const histories = new Map(), stages = new Map(), pipelines = new Map();
  if (!policy.length) return { histories, stages, pipelines };
  const historyIds = [...new Set(policy.map(e => e.stage_history_id).filter(Boolean))];
  const leadIds = new Set(policy.map(e => e.canonical_lead_id));
  const idsToCheck = [...leadIds];
  for (let i = 0; i < idsToCheck.length; i += 100) {
    const ids = idsToCheck.slice(i, i + 100), seen = new Set();
    const rows = await read(() => db.from('crm_leads').select('id,company_id,type,stage_id,pipeline_id,is_test', { count: 'exact' })
      .in('id', ids).order('id'));
    for (const row of rows) {
      const expected = expectedLeads.get(row.id);
      if (!ids.includes(row.id) || seen.has(row.id) || !expected
        || ['company_id','type','stage_id','pipeline_id','is_test'].some(k => row[k] !== expected[k])) throw unavailable();
      seen.add(row.id);
    }
    if (seen.size !== ids.length) throw unavailable();
  }
  for (let i = 0; i < historyIds.length; i += 100) {
    const ids = historyIds.slice(i, i + 100);
    const rows = await read(() => db.from('crm_lead_stage_history').select(
      'id,lead_id,pipeline_type,from_stage_id,to_stage_id,from_canonical_slug,to_canonical_slug,entered_at,changed_by', { count: 'exact' })
      .in('id', ids).order('id'));
    for (const row of rows) {
      if (!ids.includes(row.id) || !leadIds.has(row.lead_id) || histories.has(row.id)) throw unavailable();
      histories.set(row.id, row);
    }
  }
  const stageIds = [...new Set(leads.filter(l => leadIds.has(l.id)).map(l => l.stage_id).filter(Boolean))];
  for (let i = 0; i < stageIds.length; i += 100) {
    const ids = stageIds.slice(i, i + 100);
    const rows = await read(() => db.from('crm_pipeline_stages').select('id,pipeline_id,canonical_slug,is_lost,is_active', { count: 'exact' })
      .in('id', ids).order('id'));
    for (const row of rows) {
      if (!ids.includes(row.id) || stages.has(row.id)) throw unavailable();
      stages.set(row.id, row);
    }
  }
  const pipelineIds = [...new Set([...stages.values()].map(s => s.pipeline_id).filter(Boolean))];
  for (let i = 0; i < pipelineIds.length; i += 100) {
    const ids = pipelineIds.slice(i, i + 100);
    const rows = await read(() => db.from('crm_pipelines').select('id,company_id', { count: 'exact' })
      .in('id', ids).order('id'));
    for (const row of rows) {
      if (!ids.includes(row.id) || pipelines.has(row.id)) throw unavailable();
      pipelines.set(row.id, row);
    }
  }
  return { histories, stages, pipelines };
}

function stageQualificationReason(event, lead, proof) {
  if (event.qualification_method !== STAGE_METHOD) return null;
  const h = proof.histories.get(event.stage_history_id), s = event.stage_evidence;
  if (!h || h.lead_id !== lead.id || h.changed_by !== event.actor_id || time(h.entered_at) !== time(event.recorded_at)
    || s.history_id !== h.id || s.actor_id !== h.changed_by || s.context_hash !== event.context_hash
    || time(s.qualified_at) !== time(h.entered_at) || s.to_type !== h.pipeline_type
    || s.from_stage_id !== h.from_stage_id || s.to_stage_id !== h.to_stage_id || s.to_canonical_slug !== h.to_canonical_slug
    || !((h.pipeline_type === 'lead' && ['warm', 'hot'].includes(h.to_canonical_slug))
      || (s.from_type === 'lead' && h.pipeline_type === 'deal'))) return 'invalid_qualification';
  const stage = proof.stages.get(lead.stage_id);
  if (!stage || stage.is_active !== true || stage.pipeline_id !== lead.pipeline_id
    || proof.pipelines.get(stage.pipeline_id)?.company_id !== lead.company_id || stage.is_lost === true || !(lead.type === 'deal'
    || (lead.type === 'lead' && ['warm', 'hot'].includes(stage.canonical_slug)))) return 'stage_policy_held';
  return null;
}

module.exports = { STAGE_METHOD, EXTRA_COLUMNS, basicQualification, loadStageProof, stageQualificationReason };
