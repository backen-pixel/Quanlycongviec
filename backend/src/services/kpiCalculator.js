/**
 * KPI Calculator cho CRM Tủ Bếp.
 *
 * Các hàm calc* tính từ crm_leads, crm_lead_stage_history, crm_tasks, crm_activities.
 * computeAndStoreForUser chỉ chấm các kpi_definitions có applies_to khớp vai trò tài khoản (users.role),
 * trừ lãnh đạo/quản trị (admin, manager, …) vẫn tính đủ bộ để đối chiếu.
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
const { effectivePipelineStageSlaDays } = require('../helpers/crmPipelineSla');
const { resolveCalcParams, positiveNumberParam } = require('../helpers/kpiCalcParams');
const { computeScore, SCORE_CAP_RATIO } = require('./kpiScoreFormula');
const { responseMinutes, isUserOff } = require('./businessHours');
const { buildProgressMap, CANONICAL_RANK } = require('./kpiPipelineRank');
const { crmTaskMeetsCompletionRequirements } = require('../helpers/crmTaskCompletionEvidence');
const { filterDefinitionsForUserRole, allowedAppliesTagsForUserRole } = require('./kpiRoleApplies');

async function fetchUserRoleForKpi(userId) {
  if (!userId) return 'sales';
  const { data, error } = await supabase.from('users').select('role').eq('id', userId).maybeSingle();
  if (error) throw error;
  return String(data?.role || 'sales').trim().toLowerCase() || 'sales';
}

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

/** Các task CRM trên lead có bật bắt buộc minh chứng khi hoàn thành (ảnh hưởng KPI A3). */
async function fetchEvidenceRequiredCrmTasksByLeadIds(leadIds) {
  const map = new Map();
  if (!leadIds.length) return map;
  const CHUNK = 150;
  for (let i = 0; i < leadIds.length; i += CHUNK) {
    const chunk = leadIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('crm_tasks')
      .select(
        'id, lead_id, status, notes, completion_requires_file_or_note, completion_requires_customer_note, completion_requires_customer_contact',
      )
      .in('lead_id', chunk)
      .or('completion_requires_file_or_note.eq.true,completion_requires_customer_note.eq.true,completion_requires_customer_contact.eq.true');
    if (error) throw error;
    for (const t of data || []) {
      if (!map.has(t.lead_id)) map.set(t.lead_id, []);
      map.get(t.lead_id).push(t);
    }
  }
  return map;
}

/** Mọi NV “bắt buộc minh chứng” phải completed và đủ điều kiện theo từng cờ (khớp API hoàn thành). */
async function leadMeetsA3EvidenceTasksAsync(flaggedTasks) {
  if (!flaggedTasks?.length) return true;
  for (const t of flaggedTasks) {
    if (t.status !== 'completed') return false;
    if (!(await crmTaskMeetsCompletionRequirements(supabase, t.id, t))) return false;
  }
  return true;
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
 * A1: Tỷ lệ phản hồi lead đúng SLA (mặc định 15 phút, chỉnh qua kpi_definitions.calc_params.sla_minutes).
 * Mẫu số: lead user nhận trong kỳ. Tử số: first_touch_time - created_at <= sla_minutes.
 */
async function calcA1_responseSlaRate({ userId, periodStart, periodEnd, companyId = null, calcParams = {} }) {
  const slaMinutes = positiveNumberParam(calcParams, 'sla_minutes', 15);
  const leads = await fetchLeadsByOwner({ userId, periodStart, periodEnd });
  // Loại lead tạo trong ngày NV nghỉ phép full-day (không công bằng nếu tính)
  const usable = [];
  let skipped = 0;
  for (const l of leads) {
    if (l.created_at && await isUserOff(userId, l.created_at)) { skipped += 1; continue; }
    usable.push(l);
  }

  const total = usable.length;
  if (total === 0) return { actual: null, breakdown: { numerator: 0, denominator: 0, skipped_on_leave: skipped } };

  let within = 0;
  for (const l of usable) {
    if (!l.first_touch_time || !l.created_at) continue;
    const diffMin = await responseMinutes(l.created_at, l.first_touch_time, { companyId, userId });
    if (diffMin <= slaMinutes) within += 1;
  }

  return {
    actual: (within / total) * 100,
    breakdown: {
      numerator: within,
      denominator: total,
      skipped_on_leave: skipped,
      business_hours: true,
      sla_minutes: slaMinutes,
    },
  };
}

/** A2: Thời gian phản hồi lead trung bình (phút HC, dùng MEDIAN để chống outlier). */
async function calcA2_avgResponseMinutes({ userId, periodStart, periodEnd, companyId = null }) {
  const leads = await fetchLeadsByOwner({ userId, periodStart, periodEnd });
  const usable = [];
  let skipped = 0;
  for (const l of leads) {
    if (!l.first_touch_time || !l.created_at) continue;
    if (await isUserOff(userId, l.created_at)) { skipped += 1; continue; }
    usable.push(l);
  }
  if (usable.length === 0) return { actual: null, breakdown: { count: 0, skipped_on_leave: skipped } };

  const diffs = [];
  for (const l of usable) {
    diffs.push(await responseMinutes(l.created_at, l.first_touch_time, { companyId, userId }));
  }
  diffs.sort((a, b) => a - b);
  const median = diffs[Math.floor(diffs.length / 2)];
  const mean = diffs.reduce((s, d) => s + d, 0) / diffs.length;

  return {
    actual: median,
    breakdown: {
      count: diffs.length,
      median: Math.round(median * 10) / 10,
      mean: Math.round(mean * 10) / 10,
      p90: Math.round(diffs[Math.floor(diffs.length * 0.9)] * 10) / 10,
      skipped_on_leave: skipped,
      business_hours: true,
    },
  };
}

/** A3: Tỷ lệ lead đủ thông tin chuẩn (info_complete) và đã hoàn thành đủ minh chứng cho mọi NV CRM bật “bắt buộc file/ghi chú”. */
async function calcA3_infoCompleteRate({ userId, periodStart, periodEnd }) {
  const leads = await fetchLeadsByOwner({ userId, periodStart, periodEnd });
  const total = leads.length;
  if (total === 0) return { actual: null, breakdown: { numerator: 0, denominator: 0 } };

  const leadIds = leads.map((l) => l.id);
  const tasksByLead = await fetchEvidenceRequiredCrmTasksByLeadIds(leadIds);

  let evidenceRequiredTasksChecked = 0;
  let ok = 0;
  let infoCompleteCount = 0;
  for (const l of leads) {
    if (!l.info_complete) continue;
    infoCompleteCount += 1;
    const flagged = tasksByLead.get(l.id) || [];
    for (const t of flagged) evidenceRequiredTasksChecked += 1;
    if (!(await leadMeetsA3EvidenceTasksAsync(flagged))) continue;
    ok += 1;
  }

  return {
    actual: (ok / total) * 100,
    breakdown: {
      numerator: ok,
      denominator: total,
      info_complete_count: infoCompleteCount,
      evidence_required_tasks_checked: evidenceRequiredTasksChecked,
    },
  };
}

/** A4: Tỷ lệ follow-up đúng lịch (gating). */
async function calcA4_followUpOnTimeRate({ userId, periodStart, periodEnd }) {
  const { startISO, endISO } = rangeFor(periodStart, periodEnd);
  const { data: tasksRaw, error } = await supabase
    .from('crm_tasks')
    .select('id, deadline, completed_at, status, assignee_id, lead_id, lead:crm_leads(stage:crm_pipeline_stages!crm_leads_stage_id_fkey(is_lost))')
    .eq('assignee_id', userId)
    .not('deadline', 'is', null)
    .gte('deadline', startISO)
    .lte('deadline', endISO);
  if (error) throw error;

  // Bỏ qua nhiệm vụ thuộc lead/deal đang ở cột Mất (is_lost) — không tính cộng/trừ KPI A4.
  const tasks = (tasksRaw || []).filter((t) => !(t.lead && t.lead.stage && t.lead.stage.is_lost === true));
  const skippedLost = (tasksRaw || []).length - tasks.length;

  const total = tasks.length;
  if (total === 0) return { actual: null, breakdown: { numerator: 0, denominator: 0, skipped_lost_stage: skippedLost } };

  const onTime = tasks.filter((t) => t.status === 'completed' && t.completed_at && new Date(t.completed_at) <= new Date(t.deadline)).length;
  return { actual: (onTime / total) * 100, breakdown: { numerator: onTime, denominator: total, skipped_lost_stage: skippedLost } };
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
    .gte('sla_days', 1);
  if (error) throw error;
  const slaMap = {};
  for (const s of stages || []) {
    if (s.sla_days == null || s.sla_days === 0) continue;
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
    if (!s || s.is_won || s.is_lost || !l.stage_entered_at) return false;
    const slaDays = effectivePipelineStageSlaDays(s.sla_days);
    if (slaDays == null) return false;
    return now - new Date(l.stage_entered_at).getTime() > slaDays * 86400000;
  });
  return { actual: breaches.length, breakdown: { sample_count: breaches.length } };
}

// ═══════════════════════════════════════════════════════════════════════════
// Nhóm B — Chất lượng chuyển đổi
// ═══════════════════════════════════════════════════════════════════════════

/**
 * B1: Tiếp xúc đã minh chứng — lead có ≥1 ghi âm gắn lead trong kỳ HOẶC hoàn thành đúng nhiệm vụ CRM
 * được cấu hình «ghi chú KH» / «minh chứng liên hệ» (hoặc cờ cũ file/ghi chú) trong kỳ.
 */
async function calcB1_contactSuccessRate({ userId, periodStart, periodEnd }) {
  const { startISO, endISO } = rangeFor(periodStart, periodEnd);
  const leads = await fetchLeadsByOwner({ userId, periodStart, periodEnd, type: 'lead' });
  const total = leads.length;
  if (total === 0) return { actual: null, breakdown: { numerator: 0, denominator: 0 } };

  const ids = leads.map((l) => l.id);
  const successSet = new Set();
  const chunks = [];
  for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));

  for (const chunk of chunks) {
    try {
      const { data: recA } = await supabase
        .from('voice_recordings')
        .select('lead_id')
        .in('lead_id', chunk)
        .gte('created_at', startISO)
        .lte('created_at', endISO);
      for (const r of recA || []) {
        if (r.lead_id) successSet.add(r.lead_id);
      }
      const { data: recB } = await supabase
        .from('voice_recordings')
        .select('lead_id')
        .in('lead_id', chunk)
        .not('call_started_at', 'is', null)
        .gte('call_started_at', startISO)
        .lte('call_started_at', endISO);
      for (const r of recB || []) {
        if (r.lead_id) successSet.add(r.lead_id);
      }
    } catch (_) {
      /* voice_recordings có thể chưa tồn tại */
    }

    const { data: tasks, error: te } = await supabase
      .from('crm_tasks')
      .select(
        'id, lead_id, status, notes, completed_at, completion_requires_file_or_note, completion_requires_customer_note, completion_requires_customer_contact',
      )
      .in('lead_id', chunk)
      .eq('status', 'completed')
      .not('completed_at', 'is', null)
      .gte('completed_at', startISO)
      .lte('completed_at', endISO)
      .or('completion_requires_file_or_note.eq.true,completion_requires_customer_note.eq.true,completion_requires_customer_contact.eq.true');
    if (te) throw te;
    for (const t of tasks || []) {
      if (!t.lead_id) continue;
      if (await crmTaskMeetsCompletionRequirements(supabase, t.id, t)) successSet.add(t.lead_id);
    }
  }

  return {
    actual: (successSet.size / total) * 100,
    breakdown: {
      numerator: successSet.size,
      denominator: total,
      rule: 'voice_recording_in_period OR completed_flagged_crm_task_in_period',
    },
  };
}

/**
 * B2: Tỷ lệ Lead → Khảo sát.
 *   - Mẫu số: lead đã đến rank ≥ 1 (vào pipeline) — kể cả nhảy cóc.
 *   - Tử số: lead có max_rank ≥ 6 (survey_scheduled trở lên).
 */
async function calcB2_leadToSurveyRate({ userId, periodStart, periodEnd }) {
  const history = await fetchHistoryForUser({ userId, periodStart, periodEnd });
  const progress = buildProgressMap(history);

  let denom = 0, numer = 0;
  for (const p of progress.values()) {
    if (p.max_rank >= 1) denom += 1;
    if (p.hasReached(CANONICAL_RANK.survey_scheduled)) numer += 1;
  }
  if (denom === 0) return { actual: null, breakdown: { numerator: 0, denominator: 0 } };
  return {
    actual: (numer / denom) * 100,
    breakdown: { numerator: numer, denominator: denom, rule: 'max_rank-based: nhảy cóc và đi lùi đều xử lý đúng' },
  };
}

/**
 * B3: Tỷ lệ Khảo sát → Báo giá.
 *   - Mẫu số: max_rank ≥ 7 (survey_done) — nhảy cóc qua survey_done vẫn tính.
 *   - Tử số: max_rank ≥ 9 (quoted).
 */
async function calcB3_surveyToQuoteRate({ userId, periodStart, periodEnd }) {
  const history = await fetchHistoryForUser({ userId, periodStart, periodEnd });
  const progress = buildProgressMap(history);

  let denom = 0, numer = 0;
  for (const p of progress.values()) {
    if (p.hasReached(CANONICAL_RANK.survey_done)) denom += 1;
    if (p.hasReached(CANONICAL_RANK.quoted)) numer += 1;
  }
  if (denom === 0) return { actual: null, breakdown: { numerator: 0, denominator: 0 } };
  return {
    actual: (numer / denom) * 100,
    breakdown: { numerator: numer, denominator: denom, rule: 'max_rank-based' },
  };
}

/**
 * B4: Tỷ lệ Báo giá → Ký HD. KPI lõi.
 *   - Mẫu số: max_rank ≥ 9 (quoted).
 *   - Tử số: max_rank ≥ 12 (contract_signed).
 */
async function calcB4_quoteToContractRate({ userId, periodStart, periodEnd }) {
  const history = await fetchHistoryForUser({ userId, periodStart, periodEnd });
  const progress = buildProgressMap(history);

  let denom = 0, numer = 0;
  for (const p of progress.values()) {
    if (p.hasReached(CANONICAL_RANK.quoted)) denom += 1;
    if (p.hasReached(CANONICAL_RANK.contract_signed)) numer += 1;
  }
  if (denom === 0) return { actual: null, breakdown: { numerator: 0, denominator: 0 } };
  return {
    actual: (numer / denom) * 100,
    breakdown: { numerator: numer, denominator: denom, rule: 'max_rank-based' },
  };
}

/**
 * B5: Thời gian từ khảo sát đến báo giá (số ngày).
 *   - Lấy LẦN ĐẦU vào survey_done và LẦN ĐẦU vào quoted.
 *   - Nếu nhảy cóc (chỉ có quoted, không qua survey_done) → KHÔNG tính (không có 2 mốc).
 *   - Nếu đi lùi rồi tới lại → vẫn dùng lần ĐẦU TIÊN (tính đúng độ trễ thực).
 *   - Median chống outlier (xem businessHours.js).
 */
async function calcB5_surveyToQuoteDays({ userId, periodStart, periodEnd }) {
  const history = await fetchHistoryForUser({ userId, periodStart, periodEnd });
  const progress = buildProgressMap(history);

  const durations = [];
  let skippedNoSurvey = 0;
  for (const p of progress.values()) {
    const surveyAt = p.first_entered.survey_done;
    const quoteAt  = p.first_entered.quoted;
    if (!surveyAt || !quoteAt) {
      if (p.hasReached(CANONICAL_RANK.quoted) && !surveyAt) skippedNoSurvey += 1;
      continue;
    }
    const days = (new Date(quoteAt) - new Date(surveyAt)) / 86_400_000;
    if (days >= 0) durations.push(days);
  }
  if (durations.length === 0) {
    return { actual: null, breakdown: { count: 0, skipped_no_survey: skippedNoSurvey } };
  }
  durations.sort((a, b) => a - b);
  const median = durations[Math.floor(durations.length / 2)];
  const mean   = durations.reduce((s, d) => s + d, 0) / durations.length;
  return {
    actual: median,
    breakdown: {
      count: durations.length,
      median: Math.round(median * 10) / 10,
      mean: Math.round(mean * 10) / 10,
      skipped_no_survey: skippedNoSurvey,
    },
  };
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

/**
 * B6: Tỷ lệ Lead chuyển Deal trong kỳ.
 * Mẫu số: lead tạo trong kỳ (owner); tử số: có sự kiện lead_converted trong sổ cái.
 */
async function calcB6_leadToDealRate({ userId, periodStart, periodEnd }) {
  const { startISO, endISO } = rangeFor(periodStart, periodEnd);
  const leads = await fetchLeadsByOwner({ userId, periodStart, periodEnd });
  if (!leads.length) return { actual: null, breakdown: { numerator: 0, denominator: 0 } };

  const { data: rows, error } = await supabase
    .from('crm_kpi_ledger')
    .select('lead_id')
    .eq('user_id', userId)
    .eq('event_type', 'lead_converted')
    .gte('occurred_at', startISO)
    .lte('occurred_at', endISO);
  if (error) throw error;

  const converted = new Set((rows || []).map((r) => r.lead_id).filter(Boolean));
  let numer = 0;
  for (const l of leads) {
    if (converted.has(l.id)) numer += 1;
  }
  const denom = leads.length;
  return {
    actual: (numer / denom) * 100,
    breakdown: { numerator: numer, denominator: denom, rule: 'lead_created_in_period_with_lead_converted_ledger' },
  };
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
  B6: calcB6_leadToDealRate,
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
  const { getKpiDefinitionsCached } = require('../helpers/kpiLookupCache');
  return getKpiDefinitionsCached();
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
 * Tính & lưu KPI áp dụng cho vai trò tài khoản (users.role) trong 1 period.
 * Lọc theo kpi_definitions.applies_to; lãnh đạo (admin/manager/…) vẫn tính đủ bộ để đối chiếu.
 * Trả về array score + tổng điểm (chỉ các KPI được áp dụng).
 */
async function computeAndStoreForUser({ userId, companyId = null, periodType = 'monthly', periodStart, userRole = null }) {
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

  const roleResolved = userRole != null ? String(userRole).trim().toLowerCase() : await fetchUserRoleForKpi(userId);
  const defsAll = await getDefinitions();
  const defs = filterDefinitionsForUserRole(defsAll, roleResolved);
  const results = [];
  let gatingTriggered = false;
  let gatingDef = null;

  for (const def of defs) {
    const calcFn = CALC_REGISTRY[def.code];
    if (!calcFn) continue;

    let calc;
    const calcParams = resolveCalcParams(def);
    try {
      calc = await calcFn({ userId, periodStart: start, periodEnd: end, companyId, calcParams });
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

  const { error: delScoresErr } = await supabase
    .from('kpi_scores')
    .delete()
    .eq('user_id', userId)
    .eq('period_id', period.id);
  if (delScoresErr) console.error('[kpiCalculator] delete old scores:', delScoresErr.message);

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
    kpi_role: roleResolved,
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
  allowedAppliesTagsForUserRole,
  filterDefinitionsForUserRole,
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
  calcB6_leadToDealRate,
  calcC1_revenue,
  calcC2_avgContractValue,
  calcC3_leadCount,
  calcC4_lostRate,
};
