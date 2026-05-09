/**
 * KPI CRM Tủ Bếp — endpoints:
 *   GET    /api/kpi/definitions               - 15 KPI chuẩn
 *   GET    /api/kpi/scores                    - score của 1 user / 1 period
 *   GET    /api/kpi/dashboard/sales-admin     - data dashboard nhóm A + B1
 *   GET    /api/kpi/dashboard/deal            - data dashboard nhóm B + C
 *   GET    /api/kpi/scorecard                 - bảng 15 KPI x nhiều user (cho cuộc họp giao ban)
 *   GET    /api/kpi/leaderboard               - ranking nhân viên theo tổng điểm
 *   GET    /api/kpi/targets                   - list target
 *   PUT    /api/kpi/targets                   - upsert target (manager+)
 *   POST   /api/kpi/recompute                 - admin recompute period
 */
const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { computeAndStoreForUser, getDefinitions } = require('../services/kpiCalculator');

const r = Router();
r.use(auth);

const MANAGER_ROLES = new Set(['admin', 'manager', 'director', 'supervisor', 'superadmin', 'super_admin', 'administrator', 'region_admin']);
const ADMIN_ROLES = new Set(['admin', 'superadmin', 'super_admin', 'administrator']);

function isManager(req) { return MANAGER_ROLES.has(String(req.user?.role || '').toLowerCase()); }
function isAdmin(req) { return ADMIN_ROLES.has(String(req.user?.role || '').toLowerCase()); }

function defaultPeriodStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function parsePeriod(q) {
  const periodType = String(q.period_type || 'monthly');
  const periodStart = q.period_start || defaultPeriodStart();
  return { periodType, periodStart };
}

/**
 * Resolve danh sách users theo filter (company_id, department_id, q search, roles).
 * Quy tắc:
 *   - department_id ưu tiên cao nhất → lọc users.department_id = X
 *   - company_id → lọc qua departments.company_id (vì users có department_id)
 *   - q: tìm theo full_name, email
 *   - roles: mặc định ['sales','manager']
 *   - explicit user_ids: bỏ qua các filter khác
 */
async function resolveTargetUsers({ userIds = null, companyId = null, departmentId = null, q = null, roles = null }) {
  if (Array.isArray(userIds) && userIds.length) {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email, role, department_id, is_active, department:departments!users_department_id_fkey(id, name, company_id)')
      .in('id', userIds);
    if (error) throw error;
    return data || [];
  }

  let deptIds = null;
  if (departmentId) {
    deptIds = [departmentId];
  } else if (companyId) {
    const { data: depts, error: de } = await supabase
      .from('departments').select('id').eq('company_id', companyId);
    if (de) throw de;
    deptIds = (depts || []).map((d) => d.id);
    if (!deptIds.length) return [];
  }

  let query = supabase
    .from('users')
    .select('id, full_name, email, role, department_id, is_active, department:departments!users_department_id_fkey(id, name, company_id)')
    .neq('is_active', false);

  if (deptIds) query = query.in('department_id', deptIds);

  const roleList = Array.isArray(roles) && roles.length ? roles : ['sales', 'manager'];
  query = query.in('role', roleList);

  if (q && String(q).trim()) {
    const term = String(q).trim().replace(/[%,]/g, ' ');
    query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`);
  }

  const { data, error } = await query.order('full_name');
  if (error) throw error;
  return data || [];
}

// ─── GET /api/kpi/users — danh sách nhân viên có thể chấm KPI ────────────────
// Filter: company_id, department_id, q (search). Mặc định trả role sales/manager.
r.get('/users', async (req, res) => {
  try {
    const list = await resolveTargetUsers({
      companyId: req.query.company_id || null,
      departmentId: req.query.department_id || null,
      q: req.query.q || null,
      roles: req.query.roles ? String(req.query.roles).split(',').filter(Boolean) : null,
    });
    res.json({ users: list });
  } catch (e) {
    console.error('GET /kpi/users:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/kpi/definitions ────────────────────────────────────────────────
r.get('/definitions', async (_req, res) => {
  try {
    const defs = await getDefinitions();
    res.json({ definitions: defs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PATCH /api/kpi/definitions/:id ──────────────────────────────────────────
// Cho phép admin/manager chỉnh: weight, target_default, target_max, min_threshold,
// is_gating, is_active, name, description, applies_to, formula_type.
// Không cho đổi `code` để tránh phá liên kết với CALC_REGISTRY.
r.patch('/definitions/:id', async (req, res) => {
  try {
    if (!isManager(req)) return res.status(403).json({ error: 'Chỉ manager+ sửa được KPI' });

    const allowed = [
      'name', 'description', 'group_code', 'formula_type', 'unit',
      'weight', 'target_default', 'target_max', 'min_threshold',
      'is_gating', 'is_active', 'applies_to', 'data_source_note',
    ];
    const patch = {};
    for (const k of allowed) {
      if (Object.hasOwn(req.body || {}, k)) patch[k] = req.body[k];
    }
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Không có field hợp lệ' });
    patch.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('kpi_definitions')
      .update(patch).eq('id', req.params.id)
      .select().single();
    if (error) throw error;

    // Cảnh báo tổng weight khác 100
    const { data: actives } = await supabase
      .from('kpi_definitions').select('weight').eq('is_active', true);
    const totalWeight = (actives || []).reduce((s, d) => s + Number(d.weight || 0), 0);
    res.json({ definition: data, total_active_weight: totalWeight, weight_warning: totalWeight !== 100 });
  } catch (e) {
    console.error('PATCH /kpi/definitions/:id:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── DELETE /api/kpi/targets/:id ─────────────────────────────────────────────
r.delete('/targets/:id', async (req, res) => {
  try {
    if (!isManager(req)) return res.status(403).json({ error: 'Chỉ manager+' });
    const { error } = await supabase.from('kpi_targets').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /api/kpi/periods ────────────────────────────────────────────────────
r.get('/periods', async (req, res) => {
  try {
    const limit = Math.min(48, Number(req.query.limit) || 12);
    const { data, error } = await supabase
      .from('kpi_periods')
      .select('id, period_type, period_start, period_end, status, closed_at, closed_by')
      .order('period_start', { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json({ periods: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PATCH /api/kpi/periods/:id (lock/close/open) ────────────────────────────
r.patch('/periods/:id', async (req, res) => {
  try {
    if (!isManager(req)) return res.status(403).json({ error: 'Chỉ manager+' });
    const status = String(req.body?.status || '').toLowerCase();
    if (!['open', 'locked', 'closed'].includes(status)) {
      return res.status(400).json({ error: 'status phải là open|locked|closed' });
    }
    const patch = { status };
    if (status === 'closed') {
      patch.closed_at = new Date().toISOString();
      patch.closed_by = req.user?.userId || null;
    } else {
      patch.closed_at = null;
      patch.closed_by = null;
    }
    const { data, error } = await supabase
      .from('kpi_periods').update(patch).eq('id', req.params.id)
      .select().single();
    if (error) throw error;
    res.json({ period: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /api/kpi/scores?user_id=&period_start=&period_type=──────────────────
r.get('/scores', async (req, res) => {
  try {
    const targetUser = req.query.user_id || req.user?.userId;
    if (!targetUser) return res.status(400).json({ error: 'Thiếu user_id' });
    if (targetUser !== req.user?.userId && !isManager(req)) {
      return res.status(403).json({ error: 'Chỉ quản lý mới xem được KPI người khác' });
    }
    const { periodType, periodStart } = parsePeriod(req.query);
    const result = await computeAndStoreForUser({
      userId: targetUser,
      companyId: req.user?.company_id || null,
      periodType,
      periodStart,
    });
    res.json(result);
  } catch (e) {
    console.error('GET /kpi/scores:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/kpi/dashboard/sales-admin ──────────────────────────────────────
r.get('/dashboard/sales-admin', async (req, res) => {
  try {
    const userId = req.query.user_id || req.user?.userId;
    if (userId !== req.user?.userId && !isManager(req)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { periodType, periodStart } = parsePeriod(req.query);
    const result = await computeAndStoreForUser({
      userId,
      companyId: req.user?.company_id || null,
      periodType,
      periodStart,
    });

    const focusCodes = ['A1', 'A2', 'A3', 'A4', 'B1', 'C3'];
    const focus = (result.scores || []).filter((s) => focusCodes.includes(s.kpi_code));

    // Funnel Lead: đếm history transition tới các canonical_slug
    const start = result.period.period_start;
    const end = result.period.period_end;
    const startISO = new Date(`${start}T00:00:00Z`).toISOString();
    const endISO = new Date(`${end}T23:59:59.999Z`).toISOString();

    const { data: leads } = await supabase
      .from('crm_leads').select('id').or(`lead_owner_id.eq.${userId},assigned_to.eq.${userId}`);
    const ids = (leads || []).map((l) => l.id);
    let funnel = { lead_new: 0, not_contacted: 0, cold: 0, warm: 0, hot: 0, survey_scheduled: 0, survey_done: 0 };
    if (ids.length) {
      const chunks = [];
      for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));
      for (const chunk of chunks) {
        const { data } = await supabase
          .from('crm_lead_stage_history')
          .select('lead_id, to_canonical_slug')
          .in('lead_id', chunk)
          .gte('entered_at', startISO).lte('entered_at', endISO);
        for (const h of data || []) {
          if (h.to_canonical_slug && Object.hasOwn(funnel, h.to_canonical_slug)) {
            funnel[h.to_canonical_slug] += 1;
          }
        }
      }
    }

    // Lead chưa có first_touch_time hoặc quá SLA
    const { data: alertLeads } = await supabase
      .from('crm_leads')
      .select('id, code, title, phone, created_at, first_touch_time, stage_id, stage:crm_pipeline_stages!stage_id(name, sla_days, canonical_slug)')
      .or(`lead_owner_id.eq.${userId},assigned_to.eq.${userId}`)
      .is('first_touch_time', null)
      .gte('created_at', startISO).lte('created_at', endISO)
      .order('created_at', { ascending: false }).limit(20);

    res.json({
      period: result.period,
      total_score: result.total_final,
      gating: { triggered: result.gating_triggered, kpi_code: result.gating_kpi },
      kpis: focus,
      funnel,
      alerts: { leads_no_first_touch: alertLeads || [] },
    });
  } catch (e) {
    console.error('GET /kpi/dashboard/sales-admin:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/kpi/dashboard/deal ─────────────────────────────────────────────
r.get('/dashboard/deal', async (req, res) => {
  try {
    const userId = req.query.user_id || req.user?.userId;
    if (userId !== req.user?.userId && !isManager(req)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { periodType, periodStart } = parsePeriod(req.query);
    const result = await computeAndStoreForUser({
      userId,
      companyId: req.user?.company_id || null,
      periodType,
      periodStart,
    });

    const focusCodes = ['B3', 'B4', 'B5', 'A5', 'C1', 'C2'];
    const focus = (result.scores || []).filter((s) => focusCodes.includes(s.kpi_code));

    const start = result.period.period_start;
    const end = result.period.period_end;
    const startISO = new Date(`${start}T00:00:00Z`).toISOString();
    const endISO = new Date(`${end}T23:59:59.999Z`).toISOString();

    const { data: leads } = await supabase
      .from('crm_leads').select('id').or(`lead_owner_id.eq.${userId},assigned_to.eq.${userId}`);
    const ids = (leads || []).map((l) => l.id);
    let funnel = { designing: 0, quoted: 0, negotiating: 0, waiting_deposit: 0, contract_signed: 0, producing: 0, installing: 0, completed: 0, lost: 0 };
    if (ids.length) {
      const chunks = [];
      for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));
      for (const chunk of chunks) {
        const { data } = await supabase
          .from('crm_lead_stage_history')
          .select('lead_id, to_canonical_slug')
          .in('lead_id', chunk)
          .gte('entered_at', startISO).lte('entered_at', endISO);
        for (const h of data || []) {
          if (h.to_canonical_slug && Object.hasOwn(funnel, h.to_canonical_slug)) {
            funnel[h.to_canonical_slug] += 1;
          }
        }
      }
    }

    // Deal sắp quá SLA (active, ngấp nghé sla_days)
    const { data: dueDeals } = await supabase
      .from('crm_leads')
      .select('id, code, title, stage_id, stage_entered_at, estimated_value, type, stage:crm_pipeline_stages!stage_id(name, sla_days, is_won, is_lost)')
      .eq('type', 'deal')
      .or(`lead_owner_id.eq.${userId},assigned_to.eq.${userId}`)
      .order('stage_entered_at', { ascending: true }).limit(50);
    const now = Date.now();
    const breaching = (dueDeals || []).filter((d) => {
      const s = d.stage;
      if (!s || s.is_won || s.is_lost || s.sla_days == null || !d.stage_entered_at) return false;
      const elapsed = now - new Date(d.stage_entered_at).getTime();
      return elapsed > 0.7 * s.sla_days * 86400000;
    });

    res.json({
      period: result.period,
      total_score: result.total_final,
      gating: { triggered: result.gating_triggered, kpi_code: result.gating_kpi },
      kpis: focus,
      funnel,
      alerts: { deals_near_sla: breaching.slice(0, 20) },
    });
  } catch (e) {
    console.error('GET /kpi/dashboard/deal:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/kpi/scorecard ──────────────────────────────────────────────────
// Bảng 15 KPI × N nhân viên (cho cuộc họp giao ban). Manager+ only.
// Filter: company_id, department_id, q (search tên/email), user_ids (CSV).
r.get('/scorecard', async (req, res) => {
  try {
    if (!isManager(req)) return res.status(403).json({ error: 'Chỉ manager+ xem được scorecard' });
    const { periodType, periodStart } = parsePeriod(req.query);

    const userIdsRaw = req.query.user_ids ? String(req.query.user_ids).split(',').filter(Boolean) : null;
    const usersList = await resolveTargetUsers({
      userIds: userIdsRaw,
      companyId: req.query.company_id || null,
      departmentId: req.query.department_id || null,
      q: req.query.q || null,
    });

    const rows = [];
    for (const u of usersList) {
      try {
        const r1 = await computeAndStoreForUser({
          userId: u.id,
          companyId: req.query.company_id || req.user?.company_id || null,
          periodType, periodStart,
        });
        rows.push({ ...r1, _user: u });
      } catch (err) {
        rows.push({ user_id: u.id, error: err.message, _user: u });
      }
    }

    res.json({
      period_type: periodType,
      period_start: periodStart,
      filters: {
        company_id: req.query.company_id || null,
        department_id: req.query.department_id || null,
        q: req.query.q || null,
      },
      users: rows.map((r) => ({
        user: r._user || { id: r.user_id },
        total_score: r.total_final ?? null,
        gating_triggered: r.gating_triggered || false,
        gating_kpi: r.gating_kpi || null,
        scores: r.scores || [],
        error: r.error,
      })),
    });
  } catch (e) {
    console.error('GET /kpi/scorecard:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/kpi/leaderboard ────────────────────────────────────────────────
// Filter: company_id, department_id, q (search), period_start.
r.get('/leaderboard', async (req, res) => {
  try {
    if (!isManager(req)) return res.status(403).json({ error: 'Chỉ manager+ xem được' });
    const { periodType, periodStart } = parsePeriod(req.query);

    const start = periodStart;
    const { data: period } = await supabase
      .from('kpi_periods')
      .select('id, period_start, period_end')
      .eq('period_type', periodType).eq('period_start', start).maybeSingle();
    if (!period) return res.json({ period: null, leaderboard: [] });

    // Resolve danh sách user theo filter trước, rồi mới lấy score của họ
    const usersList = await resolveTargetUsers({
      companyId: req.query.company_id || null,
      departmentId: req.query.department_id || null,
      q: req.query.q || null,
    });
    const allowedIds = new Set(usersList.map((u) => u.id));
    if (allowedIds.size === 0) return res.json({ period, leaderboard: [], filters: { company_id: req.query.company_id, department_id: req.query.department_id, q: req.query.q } });

    const userMap = Object.fromEntries(usersList.map((u) => [u.id, u]));

    const { data: scores } = await supabase
      .from('kpi_scores')
      .select('user_id, kpi_definition_id, capped_score, actual_value, kpi_definition:kpi_definitions!kpi_definition_id(code, weight, is_gating, min_threshold)')
      .eq('period_id', period.id)
      .in('user_id', [...allowedIds]);

    const byUser = new Map();
    for (const s of scores || []) {
      const cur = byUser.get(s.user_id) || { total: 0, gating: false, gatingKpi: null };
      cur.total += Number(s.capped_score || 0);
      const def = s.kpi_definition;
      if (def?.is_gating && def.min_threshold != null && s.actual_value != null && s.actual_value < def.min_threshold) {
        cur.gating = true;
        cur.gatingKpi = def.code;
      }
      byUser.set(s.user_id, cur);
    }

    const leaderboard = [...byUser.entries()]
      .map(([userId, v]) => ({
        user: userMap[userId] || { id: userId },
        total_score: Math.round((v.gating ? Math.min(v.total, 70) : v.total) * 100) / 100,
        gating: v.gating,
        gating_kpi: v.gatingKpi,
      }))
      .sort((a, b) => (b.total_score || 0) - (a.total_score || 0));

    res.json({
      period,
      filters: { company_id: req.query.company_id || null, department_id: req.query.department_id || null, q: req.query.q || null },
      leaderboard,
    });
  } catch (e) {
    console.error('GET /kpi/leaderboard:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/kpi/targets ─────────────────────────────────────────────────────
r.get('/targets', async (req, res) => {
  try {
    const { periodType, periodStart } = parsePeriod(req.query);
    let q = supabase
      .from('kpi_targets')
      .select('id, kpi_definition_id, user_id, company_id, period_type, period_start, target_value, weight_override, notes, kpi_definition:kpi_definitions!kpi_definition_id(code, name, formula_type, weight, target_default)')
      .eq('period_type', periodType).eq('period_start', periodStart);
    if (req.query.user_id) q = q.eq('user_id', req.query.user_id);
    if (req.query.company_id) q = q.eq('company_id', req.query.company_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ targets: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PUT /api/kpi/targets ─────────────────────────────────────────────────────
r.put('/targets', async (req, res) => {
  try {
    if (!isManager(req)) return res.status(403).json({ error: 'Chỉ manager+ sửa target' });
    const { kpi_definition_id, user_id = null, company_id = null, period_type = 'monthly', period_start, target_value, weight_override = null, notes = null } = req.body || {};
    if (!kpi_definition_id || !period_start || target_value == null) {
      return res.status(400).json({ error: 'Thiếu kpi_definition_id, period_start hoặc target_value' });
    }

    // Tìm bản ghi cũ với scope tương ứng
    let q = supabase.from('kpi_targets').select('id')
      .eq('kpi_definition_id', kpi_definition_id)
      .eq('period_type', period_type).eq('period_start', period_start);
    q = user_id ? q.eq('user_id', user_id) : q.is('user_id', null);
    q = company_id ? q.eq('company_id', company_id) : q.is('company_id', null);
    const { data: existing } = await q.maybeSingle();

    if (existing) {
      const { data, error } = await supabase.from('kpi_targets').update({
        target_value, weight_override, notes, updated_at: new Date().toISOString(),
      }).eq('id', existing.id).select().single();
      if (error) throw error;
      return res.json({ target: data });
    }

    const { data, error } = await supabase.from('kpi_targets').insert({
      kpi_definition_id, user_id, company_id, period_type, period_start, target_value, weight_override, notes,
      created_by: req.user?.userId || null,
    }).select().single();
    if (error) throw error;
    res.json({ target: data });
  } catch (e) {
    console.error('PUT /kpi/targets:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/kpi/recompute ─────────────────────────────────────────────────
// Body: { period_type, period_start, user_ids? [], company_id?, department_id?, q? }
r.post('/recompute', async (req, res) => {
  try {
    if (!isAdmin(req) && !isManager(req)) return res.status(403).json({ error: 'Chỉ admin/manager' });
    const { periodType, periodStart } = parsePeriod(req.body || {});
    const userIds = Array.isArray(req.body?.user_ids) ? req.body.user_ids : null;

    const usersList = await resolveTargetUsers({
      userIds,
      companyId: req.body?.company_id || null,
      departmentId: req.body?.department_id || null,
      q: req.body?.q || null,
    });

    const out = [];
    for (const u of usersList) {
      try {
        const r1 = await computeAndStoreForUser({
          userId: u.id,
          companyId: req.body?.company_id || req.user?.company_id || null,
          periodType, periodStart,
        });
        out.push({ user_id: u.id, full_name: u.full_name, total: r1.total_final, gating: r1.gating_triggered });
      } catch (err) {
        out.push({ user_id: u.id, error: err.message });
      }
    }
    res.json({ ok: true, period_type: periodType, period_start: periodStart, count: out.length, results: out });
  } catch (e) {
    console.error('POST /kpi/recompute:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;
