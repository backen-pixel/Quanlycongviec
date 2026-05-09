/**
 * KPI Calculator cho CRM Tủ Bếp.
 *
 * 15 hàm tính KPI dựa trên crm_leads, crm_lead_stage_history, crm_tasks, crm_activities.
 * Mỗi hàm trả về { actual, breakdown }.
 *
 * Áp dụng công thức điểm theo file Excel KPI_CRM_SalesAdmin_Deal_TuBep.xlsx (sheet "Cong thuc tinh diem"):
 *   - increasing: min(actual / target, 1.2) * weight
 *   - decreasing: min(target / actual, 1.2) * weight   (target / 0 ≈ ∞ → cap 1.2)
 *   - quantity:   min(actual / target, 1.2) * weight
 *   - revenue:    min(actual / target, 1.2) * weight
 *   - duration:   giống decreasing (thời gian càng thấp càng tốt)
 *   - gating:     A4 < min_threshold ⇒ tổng KPI bị cap = 70
 */

const { supabase } = require('../config/supabase');
const { computeScore, SCORE_CAP_RATIO } = require('./kpiScoreFormula');

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isoDateOnly(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function rangeFor(periodStart, periodEnd) {
  const startISO = new Date(`${periodStart}T00:00:00Z`).toISOString();
  const endISO = new Date(`${periodEnd}T23:59:59.999Z`).toISOString();
  return { startISO, endISO };
}

/**
 * Lấy lead/deal liên quan tới userId (vai trò sales_owner hoặc lead_owner) trong khoảng thời gian.
 * Thu hẹp dataset trước khi tính KPI để tránh quét toàn bảng.
 */
async function fetchLeadsByOwner({ userId, periodStart, periodEnd, type = null }) {
  const { startISO, endISO } = rangeFor(periodStart, periodEnd);
  let q = supabase
    .from('crm_leads')
    .select(
      'id, type, stage_id, source_id, phone, customer_id, region_id, estimated_value, install_address, expected_construction_time, lead_temperature, info_complete, first_touch_time, created_at, stage_entered_at, lead_owner_id, assigned_to, last_activity_at, lost_reason, actual_close_date',
    )
    .or(`lead_owner_id.eq.${userId},assigned_to.eq.${userId}`);
  if (type) q = q.eq('type', type);
  // Chỉ tính lead được tạo / hoặc còn active trong kỳ
  q = q.or(`created_at.gte.${startISO},stage_entered_at.gte.${startISO}`);
  q = q.lte('created_at', endISO);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function fetchStageBySlug(slug) {
  const { data, error } = await supabase
    .from('crm_pipeline_stages')
    .select('id, canonical_slug, sla_days')
    .eq('canonical_slug', slug);
  if (error) throw error;
  return data || [];
}

async function fetchHistoryForUser({ userId, periodStart, periodEnd }) {
  const { startISO, endISO } = rangeFor(periodStart, periodEnd);
  // Lọc qua lead_id trước (lead của user), rồi filter entered_at trong kỳ
  const { data: ownLeads, error: e1 } = await supabase
    .from('crm_leads')
    .select('id')
    .or(`lead_owner_id.eq.${userId},assigned_to.eq.${userId}`);
  if (e1) throw e1;
  const ids = (ownLeads || []).map((l) => l.id);
  if (!ids.length) return [];

  const chunks = [];
  for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));
  const all = [];
  for (const chunk of chunks) {
    const { data, error } = await supabase
      .from('crm_lead_stage_history')
      .select('id, lead_id, pipeline_type, from_canonical_slug, to_canonical_slug, entered_at, exited_at, duration_seconds')
      .in('lead_id', chunk)
      .gte('entered_at', startISO)
      .lte('entered_at', endISO)
      .order('entered_at', { ascending: true });
    if (error) throw error;
    all.push(...(data || []));
  }
  return all;
}

// ═══════════════════════════════════════════════════════════════════════════
// Nhóm A — Tốc độ & kỷ luật
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A1: Tỷ lệ phản hồi lead đúng SLA 15 phút.
 * Mẫu số: lead user nhận trong kỳ. Tử số: first_touch_time - created_at <= 15p.
 */
async function calcA1_responseSlaRate({ userId, periodStart, periodEnd }) {
  const leads = await fetchLeadsByOwner({ userId, periodStart, periodEnd });
  const total = leads.length;
  if (total === 0) return { actual: null, breakdown: { numerator: 0, denominator: 0 } };

  const within = leads.filter((l) => {
    if (!l.first_touch_time || !l.created_at) return false;
    const diffMin = (new Date(l.first_touch_time) - new Date(l.created_at)) / 60000;
    return diffMin <= 15;
  }).length;

  return {
    actual: (within / total) * 100,
    breakdown: { numerator: within, denominator: total },
  };
}

/** A2: Thời gian phản hồi lead trung bình (phút). */
async function calcA2_avgResponseMinutes({ userId, periodStart, periodEnd }) {
  const leads = await fetchLeadsByOwner({ userId, periodStart, periodEnd });
  const valid = leads.filter((l) => l.first_touch_time && l.created_at);
  if (valid.length === 0) return { actual: null, breakdown: { count: 0 } };

  const sumMin = valid.reduce((s, l) => s + (new Date(l.first_touch_time) - new Date(l.created_at)) / 60000, 0);
  return {
    actual: sumMin / valid.length,
    breakdown: { count: valid.length, total_minutes: Math.round(sumMin) },
  };
}

/** A3: Tỷ lệ lead đủ thông tin chuẩn (info_complete = true). */
async function calcA3_infoCompleteRate({ userId, periodStart, periodEnd }) {
  const leads = await fetchLeadsByOwner({ userId, periodStart, periodEnd });
  const total = leads.length;
  if (total === 0) return { actual: null, breakdown: { numerator: 0, denominator: 0 } };
  const ok = leads.filter((l) => l.info_complete === true).length;
  return { actual: (ok / total) * 100, breakdown: { numerator: ok, denominator: total } };
}

/** A4: Tỷ lệ follow-up đúng lịch (gating). */
async function calcA4_followUpOnTimeRate({ userId, periodStart, periodEnd }) {
  const { startISO, endISO } = rangeFor(periodStart, periodEnd);
  const { data: tasks, error } = await supabase
    .from('crm_tasks')
    .select('id, deadline, completed_at, status, assignee_id')
    .eq('assignee_id', userId)
    .not('deadline', 'is', null)
    .gte('deadline', startISO)
    .lte('deadline', endISO);
  if (error) throw error;

  const total = (tasks || []).length;
  if (total === 0) return { actual: null, breakdown: { numerator: 0, denominator: 0 } };

  const onTime = (tasks || []).filter((t) => t.status === 'completed' && t.completed_at && new Date(t.completed_at) <= new Date(t.deadline)).length;
  return { actual: (onTime / total) * 100, breakdown: { numerator: onTime, denominator: total } };
}

/** A5: Tỷ lệ deal đúng SLA từng stage (dùng stage_history.duration_seconds vs sla_days). */
async function calcA5_dealStageSlaRate({ userId, periodStart, periodEnd }) {
  const history = await fetchHistoryForUser({ userId, periodStart, periodEnd });
  if (history.length === 0) return { actual: null, breakdown: { numerator: 0, denominator: 0 } };

  // Map slug -> sla_days (nếu nhiều pipeline có cùng slug, lấy giá trị nhỏ nhất = nghiêm hơn)
  const { data: stages, error } = await supabase
    .from('crm_pipeline_stages')
    .select('canonical_slug, sla_days')
    .not('canonical_slug', 'is', null)
    .not('sla_days', 'is', null);
  if (error) throw error;
  const slaMap = {};
  for (const s of stages || []) {
    if (s.sla_days == null) continue;
    if (slaMap[s.canonical_slug] == null || s.sla_days < slaMap[s.canonical_slug]) {
      slaMap[s.canonical_slug] = s.sla_days;
    }
  }

  let denom = 0;
  let numer = 0;
  for (const h of history) {
    if (!h.to_canonical_slug || slaMap[h.to_canonical_slug] == null) continue;
    if (h.duration_seconds == null) continue;
    denom += 1;
    const slaSec = slaMap[h.to_canonical_slug] * 86400;
    if (h.duration_seconds <= slaSec) numer += 1;
  }
  if (denom === 0) return { actual: null, breakdown: { numerator: 0, denominator: 0 } };
  return { actual: (numer / denom) * 100, breakdown: { numerator: numer, denominator: denom } };
}

/** A6: Số lead/deal đang vượt SLA tại thời điểm hiện tại. */
async function calcA6_overSlaCount({ userId }) {
  const { data: leads, error } = await supabase
    .from('crm_leads')
    .select('id, stage_id, stage_entered_at, lead_owner_id, assigned_to, stage:crm_pipeline_stages!stage_id(canonical_slug, sla_days, is_won, is_lost)')
    .or(`lead_owner_id.eq.${userId},assigned_to.eq.${userId}`);
  if (error) throw error;
  const now = Date.now();
  const breaches = (leads || []).filter((l) => {
    const s = l.stage;
    if (!s || s.is_won || s.is_lost) return false;
    if (s.sla_days == null) return false;
    if (!l.stage_entered_at) return false;
    return now - new Date(l.stage_entered_at).getTime() > s.sla_days * 86400000;
  });
  return { actual: breaches.length, breakdown: { sample_count: breaches.length } };
}

// ═══════════════════════════════════════════════════════════════════════════
// Nhóm B — Chất lượng chuyển đổi
// ═══════════════════════════════════════════════════════════════════════════

/** B1: Tỷ lệ liên hệ thành công — lead có ≥ 1 activity outcome IS NOT NULL (call/zalo/meeting). */
async function calcB1_contactSuccessRate({ userId, periodStart, periodEnd }) {
  const leads = await fetchLeadsByOwner({ userId, periodStart, periodEnd });
  const total = leads.length;
  if (total === 0) return { actual: null, breakdown: { numerator: 0, denominator: 0 } };

  const ids = leads.map((l) => l.id);
  const chunks = [];
  for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));
  const successSet = new Set();
  for (const chunk of chunks) {
    const { data, error } = await supabase
      .from('crm_activities')
      .select('lead_id, type, outcome')
      .in('lead_id', chunk)
      .in('type', ['call', 'zalo', 'meeting'])
      .not('outcome', 'is', null);
    if (error) throw error;
    for (const a of data || []) successSet.add(a.lead_id);
  }
  return {
    actual: (successSet.size / total) * 100,
    breakdown: { numerator: successSet.size, denominator: total },
  };
}

/** B2: Tỷ lệ Lead → Khảo sát = transition tới survey_scheduled OR survey_done. */
async function calcB2_leadToSurveyRate({ userId, periodStart, periodEnd }) {
  const history = await fetchHistoryForUser({ userId, periodStart, periodEnd });
  // Mẫu số: lead vào pipeline lead trong kỳ (transition entered lead_new hoặc lead được tạo)
  const enteredLead = new Set();
  const enteredSurvey = new Set();
  for (const h of history) {
    if (h.to_canonical_slug === 'lead_new' || h.to_canonical_slug === 'cold' || h.to_canonical_slug === 'warm' || h.to_canonical_slug === 'hot' || h.to_canonical_slug === 'not_contacted') {
      enteredLead.add(h.lead_id);
    }
    if (h.to_canonical_slug === 'survey_scheduled' || h.to_canonical_slug === 'survey_done') {
      enteredSurvey.add(h.lead_id);
    }
  }
  // denom = enteredLead ∪ enteredSurvey (lead mà lúc nào đó từng ở stage Lead)
  const denomSet = new Set([...enteredLead, ...enteredSurvey]);
  const denom = denomSet.size;
  if (denom === 0) return { actual: null, breakdown: { numerator: 0, denominator: 0 } };
  return {
    actual: (enteredSurvey.size / denom) * 100,
    breakdown: { numerator: enteredSurvey.size, denominator: denom },
  };
}

/** B3: Tỷ lệ Khảo sát → Báo giá. */
async function calcB3_surveyToQuoteRate({ userId, periodStart, periodEnd }) {
  const history = await fetchHistoryForUser({ userId, periodStart, periodEnd });
  const enteredSurvey = new Set();
  const enteredQuote = new Set();
  for (const h of history) {
    if (h.to_canonical_slug === 'survey_done' || h.to_canonical_slug === 'designing') enteredSurvey.add(h.lead_id);
    if (h.to_canonical_slug === 'quoted' || h.to_canonical_slug === 'negotiating' || h.to_canonical_slug === 'waiting_deposit' || h.to_canonical_slug === 'contract_signed') enteredQuote.add(h.lead_id);
  }
  const denom = enteredSurvey.size;
  if (denom === 0) return { actual: null, breakdown: { numerator: 0, denominator: 0 } };
  const numer = [...enteredSurvey].filter((id) => enteredQuote.has(id)).length;
  return { actual: (numer / denom) * 100, breakdown: { numerator: numer, denominator: denom } };
}

/** B4: Tỷ lệ Báo giá → Ký HD. KPI lõi. */
async function calcB4_quoteToContractRate({ userId, periodStart, periodEnd }) {
  const history = await fetchHistoryForUser({ userId, periodStart, periodEnd });
  const enteredQuote = new Set();
  const enteredSigned = new Set();
  for (const h of history) {
    if (h.to_canonical_slug === 'quoted') enteredQuote.add(h.lead_id);
    if (h.to_canonical_slug === 'contract_signed') enteredSigned.add(h.lead_id);
  }
  const denom = enteredQuote.size;
  if (denom === 0) return { actual: null, breakdown: { numerator: 0, denominator: 0 } };
  const numer = [...enteredQuote].filter((id) => enteredSigned.has(id)).length;
  return { actual: (numer / denom) * 100, breakdown: { numerator: numer, denominator: denom } };
}

/** B5: Thời gian từ khảo sát đến báo giá (số ngày trung bình). */
async function calcB5_surveyToQuoteDays({ userId, periodStart, periodEnd }) {
  const history = await fetchHistoryForUser({ userId, periodStart, periodEnd });
  // Group history theo lead, tìm cặp survey_done -> quoted
  const byLead = new Map();
  for (const h of history) {
    if (!byLead.has(h.lead_id)) byLead.set(h.lead_id, []);
    byLead.get(h.lead_id).push(h);
  }
  const durations = [];
  for (const arr of byLead.values()) {
    arr.sort((a, b) => new Date(a.entered_at) - new Date(b.entered_at));
    let surveyAt = null;
    for (const h of arr) {
      if (h.to_canonical_slug === 'survey_done' && !surveyAt) surveyAt = new Date(h.entered_at);
      if (h.to_canonical_slug === 'quoted' && surveyAt) {
        const days = (new Date(h.entered_at) - surveyAt) / 86400000;
        if (days >= 0) durations.push(days);
        surveyAt = null;
      }
    }
  }
  if (durations.length === 0) return { actual: null, breakdown: { count: 0 } };
  const avg = durations.reduce((s, d) => s + d, 0) / durations.length;
  return { actual: avg, breakdown: { count: durations.length, avg_days: Math.round(avg * 10) / 10 } };
}

// ═══════════════════════════════════════════════════════════════════════════
// Nhóm C — Kết quả kinh doanh
// ═══════════════════════════════════════════════════════════════════════════

/** C1: Doanh số ký mới — sum estimated_value của lead có transition vào contract_signed trong kỳ. */
async function calcC1_revenue({ userId, periodStart, periodEnd }) {
  const history = await fetchHistoryForUser({ userId, periodStart, periodEnd });
  const signedLeadIds = [...new Set(history.filter((h) => h.to_canonical_slug === 'contract_signed').map((h) => h.lead_id))];
  if (signedLeadIds.length === 0) return { actual: 0, breakdown: { count: 0, total: 0 } };
  const { data: leads, error } = await supabase
    .from('crm_leads')
    .select('id, estimated_value')
    .in('id', signedLeadIds);
  if (error) throw error;
  const total = (leads || []).reduce((s, l) => s + num(l.estimated_value), 0);
  return { actual: total, breakdown: { count: signedLeadIds.length, total } };
}

/** C2: Giá trị TB hợp đồng. */
async function calcC2_avgContractValue({ userId, periodStart, periodEnd }) {
  const c1 = await calcC1_revenue({ userId, periodStart, periodEnd });
  const count = c1.breakdown?.count || 0;
  if (count === 0) return { actual: null, breakdown: { count: 0 } };
  return { actual: c1.actual / count, breakdown: { count, total: c1.actual } };
}

/** C3: Sản lượng lead xử lý. */
async function calcC3_leadCount({ userId, periodStart, periodEnd }) {
  const leads = await fetchLeadsByOwner({ userId, periodStart, periodEnd });
  return { actual: leads.length, breakdown: { count: leads.length } };
}

/** C4: Tỷ lệ lost (lead/deal). */
async function calcC4_lostRate({ userId, periodStart, periodEnd }) {
  const history = await fetchHistoryForUser({ userId, periodStart, periodEnd });
  const lostLeads = new Set(history.filter((h) => h.to_canonical_slug === 'lost').map((h) => h.lead_id));
  const allTouched = new Set(history.map((h) => h.lead_id));
  const denom = allTouched.size;
  if (denom === 0) return { actual: null, breakdown: { numerator: 0, denominator: 0 } };
  return {
    actual: (lostLeads.size / denom) * 100,
    breakdown: { numerator: lostLeads.size, denominator: denom },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Registry — map code -> calc function
// ═══════════════════════════════════════════════════════════════════════════
const CALC_REGISTRY = {
  A1: calcA1_responseSlaRate,
  A2: calcA2_avgResponseMinutes,
  A3: calcA3_infoCompleteRate,
  A4: calcA4_followUpOnTimeRate,
  A5: calcA5_dealStageSlaRate,
  A6: calcA6_overSlaCount,
  B1: calcB1_contactSuccessRate,
  B2: calcB2_leadToSurveyRate,
  B3: calcB3_surveyToQuoteRate,
  B4: calcB4_quoteToContractRate,
  B5: calcB5_surveyToQuoteDays,
  C1: calcC1_revenue,
  C2: calcC2_avgContractValue,
  C3: calcC3_leadCount,
  C4: calcC4_lostRate,
};

// ═══════════════════════════════════════════════════════════════════════════
// Top-level: tính & lưu KPI cho 1 user / 1 period
// ═══════════════════════════════════════════════════════════════════════════

async function ensurePeriod({ periodType = 'monthly', periodStart }) {
  const start = isoDateOnly(periodStart);
  const startDate = new Date(`${start}T00:00:00Z`);
  let endDate;
  if (periodType === 'monthly') {
    endDate = new Date(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 0);
  } else if (periodType === 'quarterly') {
    endDate = new Date(startDate.getUTCFullYear(), startDate.getUTCMonth() + 3, 0);
  } else {
    endDate = new Date(startDate.getUTCFullYear() + 1, 0, 0);
  }
  const end = isoDateOnly(endDate);

  const { data: existing } = await supabase
    .from('kpi_periods')
    .select('id, status')
    .eq('period_type', periodType)
    .eq('period_start', start)
    .maybeSingle();
  if (existing) return existing;

  const { data, error } = await supabase
    .from('kpi_periods')
    .insert({ period_type: periodType, period_start: start, period_end: end, status: 'open' })
    .select('id, status')
    .single();
  if (error) throw error;
  return data;
}

async function getDefinitions() {
  const { data, error } = await supabase
    .from('kpi_definitions')
    .select('id, code, name, group_code, formula_type, weight, target_default, target_max, min_threshold, is_gating, applies_to')
    .eq('is_active', true)
    .order('code');
  if (error) throw error;
  return data || [];
}

async function getTargetFor({ definition, userId, companyId, periodType, periodStart }) {
  const start = isoDateOnly(periodStart);
  const { data, error } = await supabase
    .from('kpi_targets')
    .select('target_value, weight_override, user_id, company_id')
    .eq('kpi_definition_id', definition.id)
    .eq('period_type', periodType)
    .eq('period_start', start);
  if (error) throw error;
  const rows = data || [];
  const userRow = rows.find((r) => r.user_id === userId && r.company_id === companyId)
                || rows.find((r) => r.user_id === userId)
                || rows.find((r) => r.company_id === companyId && !r.user_id)
                || rows.find((r) => !r.user_id && !r.company_id);
  return {
    target: userRow?.target_value ?? definition.target_default,
    weight: userRow?.weight_override ?? definition.weight,
  };
}

/**
 * Tính & lưu 15 KPI cho 1 user trong 1 period. Trả về array score + tổng điểm.
 */
async function computeAndStoreForUser({ userId, companyId = null, periodType = 'monthly', periodStart }) {
  const period = await ensurePeriod({ periodType, periodStart });
  if (period.status === 'closed') {
    return { skipped: true, reason: 'period_closed' };
  }

  const start = isoDateOnly(periodStart);
  const startDate = new Date(`${start}T00:00:00Z`);
  let endDate;
  if (periodType === 'monthly') endDate = new Date(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 0);
  else if (periodType === 'quarterly') endDate = new Date(startDate.getUTCFullYear(), startDate.getUTCMonth() + 3, 0);
  else endDate = new Date(startDate.getUTCFullYear() + 1, 0, 0);
  const end = isoDateOnly(endDate);

  const defs = await getDefinitions();
  const results = [];
  let gatingTriggered = false;
  let gatingDef = null;

  for (const def of defs) {
    const calcFn = CALC_REGISTRY[def.code];
    if (!calcFn) continue;

    let calc;
    try {
      calc = await calcFn({ userId, periodStart: start, periodEnd: end });
    } catch (err) {
      console.error(`[kpiCalculator] ${def.code} for user ${userId}:`, err.message);
      calc = { actual: null, breakdown: { error: err.message } };
    }

    const { target, weight } = await getTargetFor({ definition: def, userId, companyId, periodType, periodStart: start });
    const { raw_score, capped_score } = computeScore({ formula_type: def.formula_type, actual: calc.actual, target, weight });

    if (def.is_gating && def.min_threshold != null && calc.actual != null && calc.actual < def.min_threshold) {
      gatingTriggered = true;
      gatingDef = def.code;
    }

    results.push({
      kpi_definition_id: def.id,
      kpi_code: def.code,
      kpi_name: def.name,
      group_code: def.group_code,
      formula_type: def.formula_type,
      actual_value: calc.actual,
      target_value: target,
      weight_used: weight,
      raw_score,
      capped_score,
      breakdown: calc.breakdown,
    });
  }

  // Upsert kpi_scores
  for (const r of results) {
    const { error } = await supabase
      .from('kpi_scores')
      .upsert({
        kpi_definition_id: r.kpi_definition_id,
        user_id: userId,
        period_id: period.id,
        company_id: companyId,
        actual_value: r.actual_value,
        target_value: r.target_value,
        weight_used: r.weight_used,
        raw_score: r.raw_score,
        capped_score: r.capped_score,
        breakdown: r.breakdown,
        computed_at: new Date().toISOString(),
      }, { onConflict: 'kpi_definition_id,user_id,period_id' });
    if (error) console.error('[kpiCalculator] upsert score error:', error.message);
  }

  // Tổng điểm + áp gating cap (70)
  const totalScore = results.reduce((s, r) => s + (r.capped_score || 0), 0);
  const finalScore = gatingTriggered ? Math.min(totalScore, 70) : totalScore;

  return {
    user_id: userId,
    period: { id: period.id, period_type: periodType, period_start: start, period_end: end },
    scores: results,
    total_raw: Math.round(totalScore * 100) / 100,
    total_final: Math.round(finalScore * 100) / 100,
    gating_triggered: gatingTriggered,
    gating_kpi: gatingDef,
  };
}

module.exports = {
  computeAndStoreForUser,
  computeScore,
  ensurePeriod,
  getDefinitions,
  CALC_REGISTRY,
  // Export individual calcs for unit tests
  calcA1_responseSlaRate,
  calcA2_avgResponseMinutes,
  calcA3_infoCompleteRate,
  calcA4_followUpOnTimeRate,
  calcA5_dealStageSlaRate,
  calcA6_overSlaCount,
  calcB1_contactSuccessRate,
  calcB2_leadToSurveyRate,
  calcB3_surveyToQuoteRate,
  calcB4_quoteToContractRate,
  calcB5_surveyToQuoteDays,
  calcC1_revenue,
  calcC2_avgContractValue,
  calcC3_leadCount,
  calcC4_lostRate,
};
