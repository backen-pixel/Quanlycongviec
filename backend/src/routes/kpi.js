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

// ─── GET /api/kpi/deal-scores ────────────────────────────────────────────────
// Tổng điểm CRM Ledger theo từng deal/lead của user trong kỳ.
// Query: ?user_id=&period_start=&period_type=
r.get('/deal-scores', async (req, res) => {
  try {
    const userId = req.query.user_id || req.user?.userId;
    if (!userId) return res.status(400).json({ error: 'Thiếu user_id' });
    if (userId !== req.user?.userId && !isManager(req)) {
      return res.status(403).json({ error: 'Chỉ quản lý mới xem được điểm người khác' });
    }
    const { periodType, periodStart } = parsePeriod(req.query);

    // 1. Lấy toàn bộ ledger của user trong kỳ
    const { data: ledger, error: le } = await supabase
      .from('crm_kpi_ledger')
      .select('lead_id, task_id, event_type, source_kpi_code, points, on_time, occurred_at, reason, delta_seconds')
      .eq('user_id', userId)
      .eq('period_type', periodType)
      .eq('period_start', periodStart)
      .order('occurred_at', { ascending: true });
    if (le) throw le;

    // 2. Gộp theo lead_id
    const byLead = new Map();
    let totalPlus = 0, totalMinus = 0;
    for (const row of ledger || []) {
      if (!row.lead_id) continue;
      const cur = byLead.get(row.lead_id) || {
        lead_id: row.lead_id,
        total_points: 0,
        plus_points: 0,
        minus_points: 0,
        events: [],
      };
      const pts = Number(row.points || 0);
      cur.total_points += pts;
      if (pts > 0) { cur.plus_points += pts; totalPlus += pts; }
      else { cur.minus_points += pts; totalMinus += pts; }
      cur.events.push({
        event_type: row.event_type,
        kpi_code: row.source_kpi_code,
        points: row.points,
        on_time: row.on_time,
        occurred_at: row.occurred_at,
        reason: row.reason,
        delta_seconds: row.delta_seconds,
      });
      byLead.set(row.lead_id, cur);
    }

    // 3. Lấy thông tin lead
    if (byLead.size > 0) {
      const ids = [...byLead.keys()];
      const chunks = [];
      for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));
      for (const chunk of chunks) {
        const { data: leads } = await supabase
          .from('crm_leads')
          .select('id, code, title, type, estimated_value, stage_id, stage:crm_pipeline_stages!stage_id(name, canonical_slug, is_won, is_lost)')
          .in('id', chunk);
        for (const lead of leads || []) {
          const cur = byLead.get(lead.id);
          if (cur) byLead.set(lead.id, { ...cur, lead });
        }
      }
    }

    const deals = [...byLead.values()]
      .sort((a, b) => b.total_points - a.total_points);

    res.json({
      user_id: userId,
      period_type: periodType,
      period_start: periodStart,
      summary: {
        deal_count: deals.length,
        total_plus: Math.round(totalPlus * 100) / 100,
        total_minus: Math.round(totalMinus * 100) / 100,
        total_net: Math.round((totalPlus + totalMinus) * 100) / 100,
      },
      deals,
    });
  } catch (e) {
    console.error('GET /kpi/deal-scores:', e);
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

// ─── GET /api/kpi/lead-trace?user_id=&period_start= ──────────────────────────
// Verify cách hệ thống chấm KPI nhóm B cho từng lead/deal.
// Trả về: lead + history events + max_rank đạt được + KPI nào lead đóng góp.
r.get('/lead-trace', async (req, res) => {
  try {
    if (!isManager(req)) return res.status(403).json({ error: 'Chỉ manager+' });
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'user_id bắt buộc' });
    const { periodStart } = parsePeriod(req.query);
    const start = periodStart;
    const end = new Date(new Date(`${start}T00:00:00Z`).setUTCMonth(new Date(`${start}T00:00:00Z`).getUTCMonth() + 1) - 1).toISOString().slice(0, 10);

    const { CANONICAL_RANK, getLeadProgress } = require('../services/kpiPipelineRank');

    // Lấy lead của user
    const { data: ownLeads } = await supabase
      .from('crm_leads')
      .select('id, code, title, type, lead_owner_id, assigned_to, stage_id, stage:crm_pipeline_stages!stage_id(canonical_slug, name)')
      .or(`lead_owner_id.eq.${userId},assigned_to.eq.${userId}`)
      .limit(500);
    const ids = (ownLeads || []).map((l) => l.id);
    if (ids.length === 0) return res.json({ leads: [] });

    // Lấy toàn bộ history trong kỳ
    const startISO = new Date(`${start}T00:00:00Z`).toISOString();
    const endISO   = new Date(`${end}T23:59:59.999Z`).toISOString();
    const chunks = [];
    for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));
    const allHistory = [];
    for (const chunk of chunks) {
      const { data } = await supabase
        .from('crm_lead_stage_history')
        .select('lead_id, from_canonical_slug, to_canonical_slug, entered_at, exited_at, duration_seconds')
        .in('lead_id', chunk)
        .gte('entered_at', startISO).lte('entered_at', endISO)
        .order('entered_at', { ascending: true });
      allHistory.push(...(data || []));
    }

    // Group + analyze
    const byLead = new Map();
    for (const h of allHistory) {
      if (!byLead.has(h.lead_id)) byLead.set(h.lead_id, []);
      byLead.get(h.lead_id).push(h);
    }

    const leads = (ownLeads || []).map((lead) => {
      const events = byLead.get(lead.id) || [];
      const progress = getLeadProgress(events);
      const kpiContrib = {
        B2: { denom: progress.max_rank >= 1, numer: progress.hasReached(CANONICAL_RANK.survey_scheduled) },
        B3: { denom: progress.hasReached(CANONICAL_RANK.survey_done), numer: progress.hasReached(CANONICAL_RANK.quoted) },
        B4: { denom: progress.hasReached(CANONICAL_RANK.quoted),      numer: progress.hasReached(CANONICAL_RANK.contract_signed) },
        B5: {
          counts: !!(progress.first_entered.survey_done && progress.first_entered.quoted),
          skipped_no_survey: progress.hasReached(CANONICAL_RANK.quoted) && !progress.first_entered.survey_done,
          duration_days: (progress.first_entered.survey_done && progress.first_entered.quoted)
            ? (new Date(progress.first_entered.quoted) - new Date(progress.first_entered.survey_done)) / 86_400_000
            : null,
        },
      };
      return {
        lead: {
          id: lead.id, code: lead.code, title: lead.title, type: lead.type,
          current_stage_name: lead.stage?.name, current_canonical_slug: lead.stage?.canonical_slug,
        },
        max_rank: progress.max_rank,
        max_slug: progress.max_slug,
        current_rank: progress.current_rank,
        current_slug: progress.current_slug,
        was_lost: progress.was_lost,
        first_entered: progress.first_entered,
        events: events.map((h) => ({
          from: h.from_canonical_slug, to: h.to_canonical_slug,
          entered_at: h.entered_at, duration_seconds: h.duration_seconds,
        })),
        kpi_contribution: kpiContrib,
      };
    }).filter((x) => x.events.length > 0);

    res.json({ user_id: userId, period_start: start, period_end: end, count: leads.length, leads });
  } catch (e) {
    console.error('GET /kpi/lead-trace:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// MAP PIPELINE → canonical_slug (cho KPI nhóm B + A5)
// ═════════════════════════════════════════════════════════════════════════════
const CANONICAL_SLUGS = {
  lead: ['lead_new', 'not_contacted', 'cold', 'warm', 'hot', 'survey_scheduled', 'survey_done', 'lost'],
  deal: ['designing', 'quoted', 'negotiating', 'waiting_deposit', 'contract_signed', 'producing', 'installing', 'completed', 'lost'],
};
// KPI nào cần slug nào (để show coverage)
const KPI_REQUIRED_SLUGS = {
  B2: { lead: ['survey_scheduled', 'survey_done'] },
  B3: { lead: ['survey_done'], deal: ['designing', 'quoted'] },
  B4: { deal: ['quoted', 'contract_signed'] },
  B5: { lead: ['survey_done'], deal: ['quoted'] },
  C1: { deal: ['contract_signed'] },
  C4: { lead: ['lost'], deal: ['lost'] },
};

// ─── GET /api/kpi/pipeline-mapping?company_id= ───────────────────────────────
// Trả về toàn bộ pipeline + stages của 1 công ty, kèm số liệu (lead count) và coverage.
r.get('/pipeline-mapping', async (req, res) => {
  try {
    if (!isManager(req)) return res.status(403).json({ error: 'Chỉ manager+' });
    const companyId = req.query.company_id || null;

    let pipelinesQuery = supabase
      .from('crm_pipelines')
      .select('id, name, company_id, is_active')
      .order('name', { ascending: true });
    if (companyId) pipelinesQuery = pipelinesQuery.eq('company_id', companyId);
    const { data: pipelines, error: pe } = await pipelinesQuery;
    if (pe) throw pe;

    if (!pipelines || pipelines.length === 0) {
      return res.json({ pipelines: [], canonical_slugs: CANONICAL_SLUGS, kpi_required: KPI_REQUIRED_SLUGS });
    }

    const pipelineIds = pipelines.map((p) => p.id);
    const { data: stages, error: se } = await supabase
      .from('crm_pipeline_stages')
      .select('id, pipeline_id, pipeline_type, name, order_index, canonical_slug, sla_days, is_won, is_lost, color')
      .in('pipeline_id', pipelineIds)
      .order('order_index', { ascending: true });
    if (se) throw se;


    // Đếm lead/deal đang ở mỗi stage (chỉ những lead chưa close)
    const { data: leadCounts } = await supabase
      .from('crm_leads')
      .select('stage_id', { count: 'exact', head: false })
      .in('stage_id', (stages || []).map((s) => s.id));
    const countByStage = {};
    for (const l of leadCounts || []) {
      countByStage[l.stage_id] = (countByStage[l.stage_id] || 0) + 1;
    }

    // Mỗi pipeline có thể chứa stages của cả 2 loại (lead + deal). Trả về breakdown theo từng loại.
    const pipelinesWithStages = pipelines.map((p) => {
      const allStages = (stages || []).filter((s) => s.pipeline_id === p.id)
        .map((s) => ({
          ...s,
          position: s.order_index,
          lead_count: countByStage[s.id] || 0,
        }));

      const buildBreakdown = (type) => {
        const subStages = allStages.filter((s) => s.pipeline_type === type);
        if (subStages.length === 0) return null;
        const mapped = subStages.filter((s) => s.canonical_slug).length;
        const slugSet = new Set(subStages.filter((s) => s.canonical_slug).map((s) => s.canonical_slug));
        const kpiCoverage = {};
        for (const [kpi, req] of Object.entries(KPI_REQUIRED_SLUGS)) {
          const need = req[type];
          if (!need) continue;
          const missing = need.filter((slug) => !slugSet.has(slug));
          kpiCoverage[kpi] = { required: need, missing, ok: missing.length === 0 };
        }
        return {
          stages: subStages,
          total_stages: subStages.length,
          mapped_stages: mapped,
          coverage_pct: subStages.length > 0 ? Math.round((mapped / subStages.length) * 100) : 0,
          kpi_coverage: kpiCoverage,
          total_leads: subStages.reduce((s, x) => s + x.lead_count, 0),
        };
      };

      const leadPart = buildBreakdown('lead');
      const dealPart = buildBreakdown('deal');
      const otherPart = allStages.filter((s) => s.pipeline_type !== 'lead' && s.pipeline_type !== 'deal');

      return {
        ...p,
        lead: leadPart,
        deal: dealPart,
        other_stages: otherPart,
        all_stages: allStages,
        total_stages: allStages.length,
        total_leads: allStages.reduce((s, x) => s + x.lead_count, 0),
      };
    });

    res.json({
      pipelines: pipelinesWithStages,
      canonical_slugs: CANONICAL_SLUGS,
      kpi_required: KPI_REQUIRED_SLUGS,
    });
  } catch (e) {
    console.error('GET /kpi/pipeline-mapping:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── PATCH /api/kpi/pipeline-mapping/:stage_id ───────────────────────────────
// Body: { canonical_slug: string|null, sla_days?: number|null }
r.patch('/pipeline-mapping/:stage_id', async (req, res) => {
  try {
    if (!isManager(req)) return res.status(403).json({ error: 'Chỉ manager+' });
    const patch = {};
    if (Object.hasOwn(req.body || {}, 'canonical_slug')) {
      const slug = req.body.canonical_slug;
      if (slug !== null && !CANONICAL_SLUGS.lead.includes(slug) && !CANONICAL_SLUGS.deal.includes(slug)) {
        return res.status(400).json({ error: `canonical_slug không hợp lệ: ${slug}` });
      }
      patch.canonical_slug = slug;
    }
    if (Object.hasOwn(req.body || {}, 'sla_days')) {
      patch.sla_days = req.body.sla_days == null ? null : Number(req.body.sla_days);
    }
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Không có field hợp lệ' });

    const { data, error } = await supabase
      .from('crm_pipeline_stages')
      .update(patch)
      .eq('id', req.params.stage_id)
      .select()
      .single();
    if (error) throw error;
    res.json({ stage: data });
  } catch (e) {
    console.error('PATCH /kpi/pipeline-mapping/:stage_id:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/kpi/pipeline-mapping/auto ─────────────────────────────────────
// Auto-map dựa trên tên stage (heuristic). Body: { pipeline_id, dry_run? }
// Dùng khi pipeline mới copy/clone — admin click 1 phát map gần đúng, sau đó tinh chỉnh.
r.post('/pipeline-mapping/auto', async (req, res) => {
  try {
    if (!isManager(req)) return res.status(403).json({ error: 'Chỉ manager+' });
    const pipelineId = req.body?.pipeline_id;
    const dryRun = !!req.body?.dry_run;
    if (!pipelineId) return res.status(400).json({ error: 'pipeline_id bắt buộc' });

    const { data: pipeline } = await supabase.from('crm_pipelines')
      .select('id').eq('id', pipelineId).maybeSingle();
    if (!pipeline) return res.status(404).json({ error: 'Pipeline không tồn tại' });

    const { data: stages } = await supabase.from('crm_pipeline_stages')
      .select('id, name, order_index, pipeline_type, is_won, is_lost, canonical_slug').eq('pipeline_id', pipelineId)
      .order('order_index');

    const typeCounts = {};
    for (const s of stages || []) if (s.pipeline_type) typeCounts[s.pipeline_type] = (typeCounts[s.pipeline_type] || 0) + 1;
    const pType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'lead';

    // Heuristic mapping theo từ khoá tiếng Việt + Anh
    const RULES = [
      { slug: 'lost',             test: (s) => s.is_lost === true || /(lost|chê|từ chối|không.*nhu c|hủy|rớt)/i.test(s.name) },
      { slug: 'contract_signed',  test: (s) => s.is_won === true || /(ký.*hợp.*đồng|ký hd|signed|won)/i.test(s.name) },
      { slug: 'completed',        test: (s) => /(hoàn thành|công nợ|chăm sóc|completed|done)/i.test(s.name) },
      { slug: 'installing',       test: (s) => /(lắp đặt|install)/i.test(s.name) },
      { slug: 'producing',        test: (s) => /(sản xuất|produc|đang.*làm)/i.test(s.name) },
      { slug: 'waiting_deposit',  test: (s) => /(cọc|đặt.*cọc|deposit)/i.test(s.name) },
      { slug: 'negotiating',      test: (s) => /(đàm phán|theo.*dõi|negotiat)/i.test(s.name) },
      { slug: 'quoted',           test: (s) => /(báo.*giá|quoted|sent.*quote)/i.test(s.name) },
      { slug: 'designing',        test: (s) => /(thiết.*kế|design|đang.*báo.*giá)/i.test(s.name) },
      { slug: 'survey_done',      test: (s) => /(đã.*khảo|gặp|show ?room|xưởng|survey.*done)/i.test(s.name) },
      { slug: 'survey_scheduled', test: (s) => /(hẹn.*khảo|lên.*lịch|scheduled)/i.test(s.name) },
      { slug: 'hot',              test: (s) => /(nóng|hot|gần hoàn thiện|sắp xây xong)/i.test(s.name) },
      { slug: 'warm',             test: (s) => /(ấm|warm|đang.*xây|xây.*thô)/i.test(s.name) },
      { slug: 'cold',             test: (s) => /(lạnh|cold|chuẩn.*bị|sắp.*xây)/i.test(s.name) },
      { slug: 'not_contacted',    test: (s) => /(không.*phản.*hồi|không.*liên.*hệ|not.*contact)/i.test(s.name) },
      { slug: 'lead_new',         test: (s) => /(tiếp.*nhận|mới|new|lead.*new)/i.test(s.name) },
    ];

    const valid = pType === 'lead' ? CANONICAL_SLUGS.lead : CANONICAL_SLUGS.deal;
    const proposals = [];
    for (const stage of stages || []) {
      const match = RULES.find((r) => valid.includes(r.slug) && r.test(stage));
      if (match && match.slug !== stage.canonical_slug) {
        proposals.push({
          stage_id: stage.id, stage_name: stage.name,
          old_slug: stage.canonical_slug, new_slug: match.slug,
        });
      }
    }

    if (!dryRun) {
      for (const p of proposals) {
        await supabase.from('crm_pipeline_stages')
          .update({ canonical_slug: p.new_slug }).eq('id', p.stage_id);
      }
    }
    res.json({ dry_run: dryRun, applied: !dryRun ? proposals.length : 0, proposals });
  } catch (e) {
    console.error('POST /kpi/pipeline-mapping/auto:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/kpi/company-overview ───────────────────────────────────────────
// Dashboard tổng quan KPI nhân viên cho admin/manager:
//   - stats: tổng NV, avg điểm, gating count, top score count
//   - leaderboard tóm tắt
//   - heatmap KPI×NV (capped_score vs weight ratio)
//   - trend N tháng gần đây (avg total)
//   - operational alerts: lead/task quá SLA, NV đang nghỉ
// Query: company_id?, department_id?, q?, period_start?, trend_months? (default 6)
r.get('/company-overview', async (req, res) => {
  try {
    if (!isManager(req)) return res.status(403).json({ error: 'Chỉ manager+' });
    const { periodType, periodStart } = parsePeriod(req.query);
    const trendMonths = Math.max(1, Math.min(12, Number(req.query.trend_months) || 6));

    const usersList = await resolveTargetUsers({
      companyId: req.query.company_id || null,
      departmentId: req.query.department_id || null,
      q: req.query.q || null,
    });
    const userIds = usersList.map((u) => u.id);
    const userMap = Object.fromEntries(usersList.map((u) => [u.id, u]));

    // Resolve period hiện tại
    const { data: period } = await supabase
      .from('kpi_periods')
      .select('id, period_start, period_end, status')
      .eq('period_type', periodType).eq('period_start', periodStart).maybeSingle();

    // KPI definitions (để map id -> code, weight, group)
    const defs = await getDefinitions();
    const defById = Object.fromEntries(defs.map((d) => [d.id, d]));

    // ── Scores của period hiện tại ──
    let scores = [];
    if (period && userIds.length) {
      const chunks = [];
      for (let i = 0; i < userIds.length; i += 200) chunks.push(userIds.slice(i, i + 200));
      for (const chunk of chunks) {
        const { data } = await supabase
          .from('kpi_scores')
          .select('user_id, kpi_definition_id, actual_value, target_value, capped_score, weight_used')
          .eq('period_id', period.id).in('user_id', chunk);
        scores.push(...(data || []));
      }
    }

    // Aggregate per user
    const byUser = new Map();
    for (const s of scores) {
      const cur = byUser.get(s.user_id) || {
        total: 0, scoresByCode: {}, gating: false, gatingKpi: null, groupTotals: { A: 0, B: 0, C: 0 },
      };
      const def = defById[s.kpi_definition_id];
      if (!def) continue;
      cur.total += Number(s.capped_score || 0);
      if (def.group_code) cur.groupTotals[def.group_code] = (cur.groupTotals[def.group_code] || 0) + Number(s.capped_score || 0);
      cur.scoresByCode[def.code] = {
        actual: s.actual_value,
        target: s.target_value,
        capped: Number(s.capped_score || 0),
        weight: Number(s.weight_used || def.weight || 0),
        ratio: def.weight ? Number(s.capped_score || 0) / Number(s.weight_used || def.weight) : null,
      };
      if (def.is_gating && def.min_threshold != null && s.actual_value != null && s.actual_value < def.min_threshold) {
        cur.gating = true; cur.gatingKpi = def.code;
      }
      byUser.set(s.user_id, cur);
    }

    // ── Trend N tháng (avg total) ──
    const trendStartDate = new Date(`${periodStart}T00:00:00Z`);
    trendStartDate.setUTCMonth(trendStartDate.getUTCMonth() - (trendMonths - 1));
    const trendStartStr = trendStartDate.toISOString().slice(0, 10);
    const { data: trendPeriods } = await supabase
      .from('kpi_periods').select('id, period_start')
      .eq('period_type', periodType).gte('period_start', trendStartStr).lte('period_start', periodStart)
      .order('period_start', { ascending: true });
    const periodIds = (trendPeriods || []).map((p) => p.id);
    let trendScores = [];
    if (periodIds.length && userIds.length) {
      const { data } = await supabase
        .from('kpi_scores')
        .select('user_id, period_id, capped_score')
        .in('period_id', periodIds).in('user_id', userIds);
      trendScores = data || [];
    }
    const periodById = Object.fromEntries((trendPeriods || []).map((p) => [p.id, p.period_start]));
    const trendByPeriod = {};
    for (const s of trendScores) {
      const ps = periodById[s.period_id]; if (!ps) continue;
      const k = `${ps}|${s.user_id}`;
      trendByPeriod[ps] = trendByPeriod[ps] || { total: 0, perUser: {} };
      trendByPeriod[ps].perUser[s.user_id] = (trendByPeriod[ps].perUser[s.user_id] || 0) + Number(s.capped_score || 0);
    }
    const trend = (trendPeriods || []).map((p) => {
      const userTotals = Object.values(trendByPeriod[p.period_start]?.perUser || {});
      const avg = userTotals.length ? userTotals.reduce((s, x) => s + x, 0) / userTotals.length : 0;
      return {
        period_start: p.period_start,
        avg_total: Math.round(avg * 100) / 100,
        user_count: userTotals.length,
      };
    });

    // ── Operational alerts: lead/task quá SLA + NV nghỉ hôm nay ──
    const today = new Date().toISOString().slice(0, 10);
    let leadsOverSla = [];
    let tasksOverdue = [];
    let onLeaveToday = [];
    if (userIds.length) {
      const { data: leads } = await supabase
        .from('crm_leads')
        .select('id, code, title, lead_owner_id, assigned_to, stage_entered_at, stage:crm_pipeline_stages!stage_id(canonical_slug, sla_days, is_won, is_lost)')
        .or(`lead_owner_id.in.(${userIds.join(',')}),assigned_to.in.(${userIds.join(',')})`);
      const now = Date.now();
      leadsOverSla = (leads || []).filter((l) => {
        const s = l.stage; if (!s || s.is_won || s.is_lost || s.sla_days == null || !l.stage_entered_at) return false;
        return now - new Date(l.stage_entered_at).getTime() > s.sla_days * 86400000;
      });

      const { data: tasks } = await supabase
        .from('crm_tasks')
        .select('id, title, deadline, assignee_id, status')
        .in('assignee_id', userIds)
        .neq('status', 'completed')
        .not('deadline', 'is', null)
        .lt('deadline', new Date().toISOString())
        .limit(200);
      tasksOverdue = tasks || [];

      const { data: leaves } = await supabase
        .from('kpi_user_leaves')
        .select('user_id, start_date, end_date, leave_type, half_day, reason')
        .eq('status', 'approved')
        .lte('start_date', today).gte('end_date', today)
        .in('user_id', userIds);
      onLeaveToday = leaves || [];
    }

    // ── Compose user rows ──
    const rows = usersList.map((u) => {
      const v = byUser.get(u.id) || { total: 0, scoresByCode: {}, gating: false, gatingKpi: null, groupTotals: { A: 0, B: 0, C: 0 } };
      const finalTotal = v.gating ? Math.min(v.total, 70) : v.total;
      return {
        user: {
          id: u.id, full_name: u.full_name, email: u.email, role: u.role,
          department: u.department,
        },
        total_score: Math.round(finalTotal * 100) / 100,
        raw_total: Math.round(v.total * 100) / 100,
        gating: v.gating,
        gating_kpi: v.gatingKpi,
        group_totals: {
          A: Math.round(v.groupTotals.A * 100) / 100,
          B: Math.round(v.groupTotals.B * 100) / 100,
          C: Math.round(v.groupTotals.C * 100) / 100,
        },
        scores_by_code: v.scoresByCode,
        on_leave_today: onLeaveToday.some((l) => l.user_id === u.id),
        leads_over_sla: leadsOverSla.filter((l) => l.lead_owner_id === u.id || l.assigned_to === u.id).length,
        tasks_overdue: tasksOverdue.filter((t) => t.assignee_id === u.id).length,
      };
    });

    // ── Stats tổng ──
    const scoredCount = rows.filter((r) => Object.keys(r.scores_by_code).length > 0).length;
    const totals = rows.map((r) => r.total_score).filter((v) => v > 0);
    const avgTotal = totals.length ? totals.reduce((s, x) => s + x, 0) / totals.length : 0;
    const gatingCount = rows.filter((r) => r.gating).length;
    const elite = rows.filter((r) => r.total_score >= 100).length;
    const weak = rows.filter((r) => r.total_score > 0 && r.total_score < 70).length;

    res.json({
      period: period || { period_start: periodStart, period_type: periodType, status: 'pending' },
      definitions: defs.map((d) => ({
        id: d.id, code: d.code, name: d.name, group_code: d.group_code,
        weight: d.weight, formula_type: d.formula_type, is_gating: d.is_gating,
      })),
      stats: {
        total_users: rows.length,
        scored_users: scoredCount,
        avg_total: Math.round(avgTotal * 100) / 100,
        gating_count: gatingCount,
        elite_count: elite,
        weak_count: weak,
        leads_over_sla_total: leadsOverSla.length,
        tasks_overdue_total: tasksOverdue.length,
        on_leave_today_count: onLeaveToday.length,
      },
      rows: rows.sort((a, b) => b.total_score - a.total_score),
      trend,
      alerts: {
        leads_over_sla: leadsOverSla.slice(0, 50).map((l) => ({
          id: l.id, code: l.code, title: l.title,
          owner_id: l.lead_owner_id || l.assigned_to,
          stage: l.stage?.canonical_slug, sla_days: l.stage?.sla_days,
          stage_entered_at: l.stage_entered_at,
        })),
        tasks_overdue: tasksOverdue.slice(0, 50),
        on_leave_today: onLeaveToday.map((l) => ({ ...l, user: userMap[l.user_id] || null })),
      },
    });
  } catch (e) {
    console.error('GET /kpi/company-overview:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// LỊCH LÀM VIỆC: giờ HC, ngày lễ, ngày phép NV
// ═════════════════════════════════════════════════════════════════════════════
const { clearCache: clearBizCache } = require('../services/businessHours');

// ─── GET/PUT /api/kpi/business-hours ─────────────────────────────────────────
// GET: trả về config của company (?company_id) hoặc default. PUT (manager+): upsert.
r.get('/business-hours', async (req, res) => {
  try {
    const cid = req.query.company_id || null;
    let row = null;
    if (cid) {
      const { data } = await supabase.from('kpi_business_hours_config')
        .select('*').eq('company_id', cid).maybeSingle();
      row = data;
    }
    if (!row) {
      const { data } = await supabase.from('kpi_business_hours_config')
        .select('*').is('company_id', null).maybeSingle();
      row = data;
    }
    res.json({ config: row });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/business-hours', async (req, res) => {
  try {
    if (!isManager(req)) return res.status(403).json({ error: 'Chỉ manager+' });
    const b = req.body || {};
    const payload = {
      company_id: b.company_id || null,
      start_minute: Number(b.start_minute ?? 480),
      end_minute: Number(b.end_minute ?? 1020),
      lunch_start_minute: b.lunch_start_minute == null ? null : Number(b.lunch_start_minute),
      lunch_end_minute: b.lunch_end_minute == null ? null : Number(b.lunch_end_minute),
      work_days: Array.isArray(b.work_days) ? b.work_days.map(Number) : [1, 2, 3, 4, 5, 6],
      timezone: b.timezone || 'Asia/Ho_Chi_Minh',
      notes: b.notes || null,
      is_active: b.is_active !== false,
      updated_at: new Date().toISOString(),
    };
    if (payload.end_minute <= payload.start_minute) {
      return res.status(400).json({ error: 'end_minute phải lớn hơn start_minute' });
    }

    let existing;
    if (payload.company_id) {
      const { data } = await supabase.from('kpi_business_hours_config')
        .select('id').eq('company_id', payload.company_id).maybeSingle();
      existing = data;
    } else {
      const { data } = await supabase.from('kpi_business_hours_config')
        .select('id').is('company_id', null).maybeSingle();
      existing = data;
    }

    let row;
    if (existing) {
      const { data, error } = await supabase.from('kpi_business_hours_config')
        .update(payload).eq('id', existing.id).select().single();
      if (error) throw error;
      row = data;
    } else {
      const { data, error } = await supabase.from('kpi_business_hours_config')
        .insert(payload).select().single();
      if (error) throw error;
      row = data;
    }
    clearBizCache();
    res.json({ config: row });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── /api/kpi/holidays ───────────────────────────────────────────────────────
r.get('/holidays', async (req, res) => {
  try {
    const cid = req.query.company_id || null;
    let q = supabase.from('kpi_holidays')
      .select('id, company_id, holiday_date, name, repeat_yearly, is_half_day, notes, created_at')
      .order('holiday_date', { ascending: true });
    if (cid) q = q.or(`company_id.eq.${cid},company_id.is.null`);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ holidays: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/holidays', async (req, res) => {
  try {
    if (!isManager(req)) return res.status(403).json({ error: 'Chỉ manager+' });
    const b = req.body || {};
    if (!b.holiday_date || !b.name) return res.status(400).json({ error: 'holiday_date và name là bắt buộc' });
    const { data, error } = await supabase.from('kpi_holidays').insert({
      company_id: b.company_id || null,
      holiday_date: b.holiday_date,
      name: b.name,
      repeat_yearly: !!b.repeat_yearly,
      is_half_day: !!b.is_half_day,
      notes: b.notes || null,
      created_by: req.user?.userId || null,
    }).select().single();
    if (error) throw error;
    clearBizCache();
    res.json({ holiday: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.delete('/holidays/:id', async (req, res) => {
  try {
    if (!isManager(req)) return res.status(403).json({ error: 'Chỉ manager+' });
    const { error } = await supabase.from('kpi_holidays').delete().eq('id', req.params.id);
    if (error) throw error;
    clearBizCache();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── /api/kpi/leaves ─────────────────────────────────────────────────────────
r.get('/leaves', async (req, res) => {
  try {
    const params = supabase.from('kpi_user_leaves')
      .select('id, user_id, start_date, end_date, leave_type, half_day, reason, status, approved_at, approved_by, created_at')
      .order('start_date', { ascending: false }).limit(500);
    let q = params;
    if (req.query.user_id) q = q.eq('user_id', req.query.user_id);
    if (req.query.status)  q = q.eq('status', req.query.status);
    if (req.query.from)    q = q.gte('end_date', req.query.from);
    if (req.query.to)      q = q.lte('start_date', req.query.to);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ leaves: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/leaves', async (req, res) => {
  try {
    if (!isManager(req)) return res.status(403).json({ error: 'Chỉ manager+' });
    const b = req.body || {};
    if (!b.user_id || !b.start_date || !b.end_date) {
      return res.status(400).json({ error: 'user_id, start_date, end_date bắt buộc' });
    }
    const status = b.status || 'approved';
    const { data, error } = await supabase.from('kpi_user_leaves').insert({
      user_id: b.user_id,
      start_date: b.start_date,
      end_date: b.end_date,
      leave_type: b.leave_type || 'paid',
      half_day: b.half_day || 'full',
      reason: b.reason || null,
      status,
      approved_by: status === 'approved' ? (req.user?.userId || null) : null,
      approved_at: status === 'approved' ? new Date().toISOString() : null,
    }).select().single();
    if (error) throw error;
    clearBizCache();
    res.json({ leave: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.patch('/leaves/:id', async (req, res) => {
  try {
    if (!isManager(req)) return res.status(403).json({ error: 'Chỉ manager+' });
    const allowed = ['start_date', 'end_date', 'leave_type', 'half_day', 'reason', 'status'];
    const patch = {};
    for (const k of allowed) if (Object.hasOwn(req.body || {}, k)) patch[k] = req.body[k];
    if (patch.status === 'approved') {
      patch.approved_by = req.user?.userId || null;
      patch.approved_at = new Date().toISOString();
    }
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('kpi_user_leaves')
      .update(patch).eq('id', req.params.id).select().single();
    if (error) throw error;
    clearBizCache();
    res.json({ leave: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.delete('/leaves/:id', async (req, res) => {
  try {
    if (!isManager(req)) return res.status(403).json({ error: 'Chỉ manager+' });
    const { error } = await supabase.from('kpi_user_leaves').delete().eq('id', req.params.id);
    if (error) throw error;
    clearBizCache();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = r;
