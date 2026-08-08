/**
 * Chấm điểm chéo module trên Deal + sao KH + tổng hợp KPI / thưởng phạt gợi ý.
 */
const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { getCrmStageById } = require('../helpers/crmTaxonomyCache');
const { getAppSettingValue, invalidateAppSettingKey } = require('../helpers/appSettingsCache');

const r = Router();
r.use(auth);

const MODULE_OPTIONS = [
  { key: 'crm', label: 'CRM / Bán hàng' },
  { key: 'production', label: 'Sản xuất (SX)' },
  { key: 'logistics', label: 'Lắp đặt' },
  { key: 'projects', label: 'Dự án / Thiết kế' },
];

const ADMIN_ROLES = new Set(['admin', 'manager', 'director', 'supervisor']);

function roleToModule(role) {
  const r = String(role || '').toLowerCase();
  if (r === 'sales') return 'crm';
  if (r === 'production') return 'production';
  if (r === 'logistics' || r === 'installer') return 'logistics';
  if (r === 'designer') return 'projects';
  return null;
}

function canUseSourceModule(user, sourceModule) {
  if (!sourceModule) return false;
  if (ADMIN_ROLES.has(String(user?.role || '').toLowerCase())) return true;
  return roleToModule(user?.role) === sourceModule;
}

/** Khớp LeadDetail: chỉ cột pipeline có tên chứa «Hoàn thành». */
function isCrmDealStageHoanThanhName(name) {
  const ascii = String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return ascii.includes('hoan thanh');
}

async function dealStageIsHoanThanh(leadRow) {
  if (!leadRow?.stage_id) return false;
  const st = await getCrmStageById(leadRow.stage_id);
  return !!(st?.name && isCrmDealStageHoanThanhName(st.name));
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function avg(arr) {
  if (!arr?.length) return null;
  const s = arr.reduce((a, b) => a + b, 0);
  return Math.round((s / arr.length) * 100) / 100;
}

async function loadAppJson(key, fallback) {
  const v = await getAppSettingValue(key, undefined);
  if (v != null) return v;
  return fallback;
}

function applyBonusRule(compositeStars, dealValue, rules) {
  const v = num(dealValue);
  if (!rules?.length) {
    return { label: null, bonus_amount: 0, penalty_amount: 0, matched_rule: null };
  }
  for (const rule of rules) {
    const min = rule.min_avg_stars != null ? num(rule.min_avg_stars) : null;
    const max = rule.max_avg_stars != null ? num(rule.max_avg_stars) : null;
    if (min != null && compositeStars < min) continue;
    if (max != null && compositeStars > max) continue;
    const bp = num(rule.bonus_percent_of_deal_value);
    const pp = num(rule.penalty_percent_of_deal_value);
    return {
      label: rule.label || null,
      bonus_amount: Math.round((v * bp) / 100),
      penalty_amount: Math.round((v * pp) / 100),
      matched_rule: rule,
    };
  }
  return { label: null, bonus_amount: 0, penalty_amount: 0, matched_rule: null };
}

function computePerformance(crossScores, customerRatings, weights, dealValue) {
  const scoreVals = (crossScores || []).map((r) => num(r.score));
  const avgCross = avg(scoreVals);

  const custVals = (customerRatings || []).map((r) => num(r.stars));
  const avgCustomer = avg(custVals);

  const wi = num(weights?.cross_internal_weight ?? 0.45);
  const wc = num(weights?.customer_weight ?? 0.55);

  let composite;
  if (avgCross != null && avgCustomer != null) {
    const s = wi + wc;
    composite = s > 0 ? (wi * avgCross + wc * avgCustomer) / s : avgCross;
  } else if (avgCross != null) {
    composite = avgCross;
  } else if (avgCustomer != null) {
    composite = avgCustomer;
  } else {
    composite = null;
  }

  if (composite != null) composite = Math.round(composite * 100) / 100;

  return {
    avg_cross_module_stars: avgCross,
    avg_customer_stars: avgCustomer,
    composite_stars: composite,
  };
}

/** Trung bình điểm nhận được theo từng module đích */
function averagesByTarget(crossScores) {
  const buckets = {};
  for (const row of crossScores || []) {
    const t = row.target_module;
    if (!t) continue;
    if (!buckets[t]) buckets[t] = [];
    buckets[t].push(num(row.score));
  }
  return MODULE_OPTIONS.map((m) => ({
    module: m.key,
    label: m.label,
    avg_stars: avg(buckets[m.key] || []),
    count: (buckets[m.key] || []).length,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// GET .../settings
// ═══════════════════════════════════════════════════════════════════════════
r.get('/settings', async (req, res) => {
  try {
    const weights = await loadAppJson('deal_performance_weights', {
      cross_internal_weight: 0.45,
      customer_weight: 0.55,
    });
    const rules = await loadAppJson('deal_bonus_penalty_rules', []);
    res.json({
      module_options: MODULE_OPTIONS,
      weights,
      bonus_penalty_rules: rules,
      can_edit: ADMIN_ROLES.has(String(req.user?.role || '').toLowerCase()),
    });
  } catch (e) {
    console.error('[deal-performance/settings]', e);
    res.status(500).json({ error: e.message });
  }
});

r.put('/settings', async (req, res) => {
  try {
    if (!ADMIN_ROLES.has(String(req.user?.role || '').toLowerCase())) {
      return res.status(403).json({ error: 'Chỉ quản trị/lãnh đạo chỉnh cấu hình' });
    }
    const { weights, bonus_penalty_rules } = req.body || {};
    const now = new Date().toISOString();
    if (weights) {
      const { error } = await supabase.from('app_settings').upsert(
        {
          key: 'deal_performance_weights',
          value: weights,
          updated_at: now,
        },
        { onConflict: 'key' }
      );
      if (error) throw error;
      invalidateAppSettingKey('deal_performance_weights');
    }
    if (bonus_penalty_rules) {
      const { error } = await supabase.from('app_settings').upsert(
        {
          key: 'deal_bonus_penalty_rules',
          value: bonus_penalty_rules,
          updated_at: now,
        },
        { onConflict: 'key' }
      );
      if (error) throw error;
      invalidateAppSettingKey('deal_bonus_penalty_rules');
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[deal-performance/settings PUT]', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /:leadId/summary
// ═══════════════════════════════════════════════════════════════════════════
r.get('/:leadId/summary', async (req, res) => {
  try {
    const leadId = req.params.leadId;
    const { data: lead, error: le } = await supabase
      .from('crm_leads')
      .select('id, type, code, title, estimated_value, assigned_to, project_id, stage_id')
      .eq('id', leadId)
      .maybeSingle();
    if (le) throw le;
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy' });
    if (lead.type !== 'deal') return res.status(400).json({ error: 'Chỉ áp dụng cho Deal' });

    if (!(await dealStageIsHoanThanh(lead))) {
      return res.status(403).json({
        error: 'Chỉ xem và chấm điểm sau khi deal đã kéo sang cột Hoàn thành trên pipeline.',
        code: 'DEAL_NOT_HOAN_THANH',
      });
    }

    const [{ data: crossScores, error: e1 }, { data: customerRatings, error: e2 }] = await Promise.all([
      supabase
        .from('deal_cross_module_scores')
        .select('*')
        .eq('deal_lead_id', leadId)
        .order('created_at', { ascending: false }),
      supabase
        .from('deal_customer_ratings')
        .select('*')
        .eq('deal_lead_id', leadId)
        .order('created_at', { ascending: false }),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;

    const userIds = new Set();
    (crossScores || []).forEach((r) => r.created_by && userIds.add(r.created_by));
    (customerRatings || []).forEach((r) => r.recorded_by && userIds.add(r.recorded_by));
    let nameById = {};
    if (userIds.size) {
      const { data: users } = await supabase.from('users').select('id, full_name').in('id', [...userIds]);
      nameById = Object.fromEntries((users || []).map((u) => [u.id, u.full_name]));
    }
    const crossEnriched = (crossScores || []).map((r) => ({
      ...r,
      author_name: nameById[r.created_by] || null,
    }));
    const ratingsEnriched = (customerRatings || []).map((r) => ({
      ...r,
      author_name: nameById[r.recorded_by] || null,
    }));

    const weights = await loadAppJson('deal_performance_weights', {
      cross_internal_weight: 0.45,
      customer_weight: 0.55,
    });
    const rules = await loadAppJson('deal_bonus_penalty_rules', []);

    const perf = computePerformance(crossEnriched, ratingsEnriched, weights, lead.estimated_value);
    const byTarget = averagesByTarget(crossEnriched || []);
    const dealValue = num(lead.estimated_value);

    let suggestion = { label: null, bonus_amount: 0, penalty_amount: 0, matched_rule: null };
    if (perf.composite_stars != null) {
      suggestion = applyBonusRule(perf.composite_stars, dealValue, rules);
    }

    const inferred = roleToModule(req.user?.role);
    res.json({
      lead: {
        id: lead.id,
        code: lead.code,
        title: lead.title,
        estimated_value: dealValue,
      },
      module_options: MODULE_OPTIONS,
      cross_scores: crossEnriched || [],
      customer_ratings: ratingsEnriched || [],
      averages_by_target_module: byTarget,
      weights,
      bonus_penalty_rules: rules,
      ...perf,
      suggestion: {
        ...suggestion,
        deal_value_basis: dealValue,
        composite_stars: perf.composite_stars,
      },
      my_role_module: inferred,
      can_use_any_module: ADMIN_ROLES.has(String(req.user?.role || '').toLowerCase()),
    });
  } catch (e) {
    if (String(e.message || '').includes('deal_cross_module') || e.code === '42P01') {
      return res.status(503).json({
        error: 'Chưa chạy migration database/110_deal_cross_scores_customer_ratings.sql',
      });
    }
    console.error('[deal-performance/summary]', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /:leadId/cross-score
// ═══════════════════════════════════════════════════════════════════════════
r.post('/:leadId/cross-score', async (req, res) => {
  try {
    const leadId = req.params.leadId;
    const { data: lead } = await supabase.from('crm_leads').select('id, type, stage_id').eq('id', leadId).maybeSingle();
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy' });
    if (lead.type !== 'deal') return res.status(400).json({ error: 'Chỉ áp dụng cho Deal' });
    if (!(await dealStageIsHoanThanh(lead))) {
      return res.status(403).json({
        error: 'Chỉ chấm điểm sau khi deal ở cột Hoàn thành.',
        code: 'DEAL_NOT_HOAN_THANH',
      });
    }

    let { source_module, target_module, criterion, score, comment } = req.body || {};
    source_module = String(source_module || '').trim();
    target_module = String(target_module || '').trim();
    criterion = String(criterion || 'overall').trim() || 'overall';
    score = num(score);

    const allowedKeys = new Set(MODULE_OPTIONS.map((m) => m.key));
    if (!source_module || !target_module) return res.status(400).json({ error: 'Thiếu module nguồn/đích' });
    if (!allowedKeys.has(source_module) || !allowedKeys.has(target_module)) {
      return res.status(400).json({ error: 'Module không hợp lệ' });
    }
    if (source_module === target_module) return res.status(400).json({ error: 'Không chấm cho chính module của mình' });
    if (score < 1 || score > 5) return res.status(400).json({ error: 'Điểm từ 1 đến 5 sao' });

    if (!canUseSourceModule(req.user, source_module)) {
      return res.status(403).json({ error: 'Module nguồn không khớp vai trò của bạn' });
    }

    const uid = req.user.userId;
    const row = {
      deal_lead_id: leadId,
      source_module,
      target_module,
      criterion,
      score,
      comment: comment || null,
      created_by: uid,
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await supabase
      .from('deal_cross_module_scores')
      .select('id')
      .eq('deal_lead_id', leadId)
      .eq('source_module', source_module)
      .eq('target_module', target_module)
      .eq('criterion', criterion)
      .eq('created_by', uid)
      .maybeSingle();

    let saved;
    if (existing?.id) {
      const { data, error } = await supabase
        .from('deal_cross_module_scores')
        .update(row)
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error) throw error;
      saved = data;
    } else {
      const { data, error } = await supabase.from('deal_cross_module_scores').insert(row).select('*').single();
      if (error) throw error;
      saved = data;
    }

    res.json(saved);
  } catch (e) {
    console.error('[deal-performance/cross-score]', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /:leadId/customer-rating
// ═══════════════════════════════════════════════════════════════════════════
r.post('/:leadId/customer-rating', async (req, res) => {
  try {
    const leadId = req.params.leadId;
    const { data: lead } = await supabase.from('crm_leads').select('id, type, stage_id').eq('id', leadId).maybeSingle();
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy' });
    if (lead.type !== 'deal') return res.status(400).json({ error: 'Chỉ áp dụng cho Deal' });
    if (!(await dealStageIsHoanThanh(lead))) {
      return res.status(403).json({
        error: 'Chỉ ghi nhận sao KH sau khi deal ở cột Hoàn thành.',
        code: 'DEAL_NOT_HOAN_THANH',
      });
    }

    let { stars, feedback, source } = req.body || {};
    stars = num(stars);
    if (stars < 1 || stars > 5) return res.status(400).json({ error: 'Sao từ 1 đến 5' });

    const { data, error } = await supabase
      .from('deal_customer_ratings')
      .insert({
        deal_lead_id: leadId,
        stars,
        feedback: feedback || null,
        source: source || 'manual',
        recorded_by: req.user.userId,
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('[deal-performance/customer-rating]', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE cross-score (own row)
// ═══════════════════════════════════════════════════════════════════════════
r.delete('/:leadId/cross-score/:rowId', async (req, res) => {
  try {
    const { leadId, rowId } = req.params;
    const privileged = ADMIN_ROLES.has(String(req.user?.role || '').toLowerCase());
    const { data: lead } = await supabase.from('crm_leads').select('id, stage_id').eq('id', leadId).maybeSingle();
    if (!privileged && lead && !(await dealStageIsHoanThanh(lead))) {
      return res.status(403).json({
        error: 'Chỉ chỉnh/xóa điểm khi deal đang ở cột Hoàn thành (hoặc liên hệ quản trị).',
        code: 'DEAL_NOT_HOAN_THANH',
      });
    }
    const { data: row } = await supabase
      .from('deal_cross_module_scores')
      .select('created_by')
      .eq('id', rowId)
      .eq('deal_lead_id', leadId)
      .maybeSingle();
    if (!row) return res.status(404).json({ error: 'Không thấy bản ghi' });
    const uid = req.user.userId;
    if (String(row.created_by) !== String(uid) && !privileged) {
      return res.status(403).json({ error: 'Chỉ xóa điểm của chính mình' });
    }
    const { error } = await supabase.from('deal_cross_module_scores').delete().eq('id', rowId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;
