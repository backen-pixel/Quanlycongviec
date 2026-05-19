const { supabase } = require('../config/supabase');

function periodStartMonthly(isoOrDate = new Date()) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

/**
 * Lấy rule KPI: ưu tiên theo company_id, fallback rule toàn hệ thống (company_id NULL).
 */
async function resolveScoringRule(companyId, eventType, taskStageSlug = null) {
  if (companyId) {
    let q = supabase
      .from('crm_kpi_scoring_rules')
      .select('*')
      .eq('company_id', companyId)
      .eq('event_type', eventType)
      .eq('is_active', true);
    if (taskStageSlug == null) q = q.is('task_stage_slug', null);
    else q = q.eq('task_stage_slug', taskStageSlug);
    const { data } = await q.maybeSingle();
    if (data) return data;
  }

  let q2 = supabase
    .from('crm_kpi_scoring_rules')
    .select('*')
    .is('company_id', null)
    .eq('event_type', eventType)
    .eq('is_active', true);
  if (taskStageSlug == null) q2 = q2.is('task_stage_slug', null);
  else q2 = q2.eq('task_stage_slug', taskStageSlug);
  const { data: globalRule } = await q2.maybeSingle();
  return globalRule || null;
}

/**
 * Ghi +điểm KPI khi Lead chuyển Deal (mỗi lead một lần).
 * @returns {Promise<{ ok: boolean, points?: number, duplicate?: boolean, skipped?: boolean }>}
 */
async function recordLeadConvertedKpi({ leadId, userId, companyId, createdBy, occurredAt }) {
  if (!leadId || !userId) return { ok: false, skipped: true };

  const rule = await resolveScoringRule(companyId || null, 'lead_converted', null);
  if (!rule) {
    console.warn('[kpiLedger] Không có rule lead_converted — chạy migration database/186_kpi_lead_converted_event.sql');
    return { ok: false, skipped: true };
  }

  const points = Number(rule.on_time_points ?? 0);
  if (!points) return { ok: false, skipped: true };

  const at = occurredAt ? new Date(occurredAt).toISOString() : new Date().toISOString();
  const periodStart = periodStartMonthly(at);

  const { error } = await supabase.from('crm_kpi_ledger').insert({
    user_id: userId,
    company_id: companyId || null,
    lead_id: leadId,
    rule_id: rule.id,
    event_type: 'lead_converted',
    source_kpi_code: 'B6',
    occurred_at: at,
    on_time: true,
    points,
    reason: 'Lead chuyển sang Deal thành công',
    period_type: 'monthly',
    period_start: periodStart,
    created_by: createdBy || null,
    metadata: { via: 'convert-to-deal' },
  });

  if (error) {
    if (error.code === '23505') return { ok: true, duplicate: true, points };
    console.warn('[kpiLedger] recordLeadConvertedKpi:', error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true, points };
}

module.exports = {
  periodStartMonthly,
  resolveScoringRule,
  recordLeadConvertedKpi,
};
