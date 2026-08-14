/**
 * Báo cáo / lập kế hoạch ngày (form chấm công theo mẫu Excel).
 * API: /api/crm/daily-reports/*
 */
const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { isCrmModuleAdmin, isSystemAdmin, normalizeRole } = require('../helpers/adminRole');

const r = Router();
r.use(auth);

const TEMPLATE_FIELDS = 'id, company_id, role_key, name, description, has_sharpen_section, is_active, created_at, updated_at';
const ITEM_FIELDS = 'id, template_id, section, label, order_index, unit_label, metric_key, created_at';
const REPORT_FIELDS =
  'id, company_id, user_id, template_id, report_date, department_name, status, plan_submitted_at, result_submitted_at, manager_note, created_at, updated_at';
const LINE_FIELDS =
  'id, report_id, template_item_id, section, label, order_index, plan_value, result_value, plan_note, result_note, metric_key, auto_result, created_at, updated_at';
const { computeAutoDailyResults, loadMetricEntityLinks, metricKeyFromLabel } = require('../helpers/dailyReportAutoClose');
const { autoCloseDailyReportForUser, guessRoleKey, isCrmSalesDept, looksLikeNonCrmUser } = require('../helpers/dailyReportAutoSubmit');
const { buildDailyWorkHistory } = require('../helpers/dailyWorkHistory');
const { crmReportAddDaysYmd } = require('../helpers/crmReportDateBounds');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isValidDate = (s) => DATE_RE.test(String(s || '')) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());

/** Phần II = kết quả ngày hôm trước của ngày phiếu. */
function resultDateForReport(reportDate) {
  return crmReportAddDaysYmd(reportDate, -1);
}

async function mapLimit(items, limit, fn) {
  const list = items || [];
  const out = new Array(list.length);
  let next = 0;
  async function worker() {
    while (next < list.length) {
      const i = next;
      next += 1;
      out[i] = await fn(list[i], i);
    }
  }
  const n = Math.min(Math.max(1, limit), list.length || 1);
  await Promise.all(Array.from({ length: list.length ? n : 0 }, () => worker()));
  return out;
}

function isGlobalManager(user) {
  return isCrmModuleAdmin(user) || normalizeRole(user?.role) === 'manager';
}

/** Giờ VN hiện tại → { date: YYYY-MM-DD, hour, minute } */
function nowVnParts() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function normalizeDailyRoleKey(roleKey) {
  const k = String(roleKey || '').trim();
  if (k === 'deal_admin') return 'sale_deal';
  return k || null;
}

/** Chỉ lấy mẫu đúng vai trò — không fallback sang mẫu kia (Sale Admin ≠ Sale-Deal). */
function pickTemplateByRole(templates, roleKey, companyId = null) {
  const want = normalizeDailyRoleKey(roleKey);
  if (!want) return null;
  const same = (templates || []).filter((t) => normalizeDailyRoleKey(t.role_key) === want);
  if (!same.length) return null;
  if (companyId) {
    const own = same.find((t) => String(t.company_id || '') === String(companyId));
    if (own) return own;
  }
  return same.find((t) => t.company_id == null) || same[0];
}

function toNumOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function loadUserProfile(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, email, avatar, company_id, department_id, role, departments:department_id(id, name)')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function listTemplates(companyId) {
  let q = supabase
    .from('crm_daily_report_templates')
    .select(`${TEMPLATE_FIELDS}, items:crm_daily_report_template_items(${ITEM_FIELDS})`)
    .eq('is_active', true)
    .order('name');
  // Hệ thống (null) + đúng công ty đang chọn — không lấy mẫu công ty khác
  if (companyId) {
    q = q.or(`company_id.is.null,company_id.eq.${companyId}`);
  } else {
    q = q.is('company_id', null);
  }
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data || []).map((t) => ({
    ...t,
    items: (t.items || []).slice().sort((a, b) => (a.order_index - b.order_index) || String(a.label).localeCompare(String(b.label))),
  }));
  return preferCompanyTemplates(rows, companyId);
}

/** Mẫu công ty ghi đè mẫu hệ thống cùng role_key; loại mẫu công ty khác (nếu lọt). */
function preferCompanyTemplates(rows, companyId) {
  const list = rows || [];
  if (!companyId) return list.filter((t) => t.company_id == null);
  const cid = String(companyId);
  const companyRows = list.filter((t) => t.company_id && String(t.company_id) === cid);
  const usedRoles = new Set(companyRows.map((t) => String(t.role_key)));
  const globalsKept = list.filter((t) => t.company_id == null && !usedRoles.has(String(t.role_key)));
  return [...companyRows, ...globalsKept].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'vi'));
}

function templateAllowedForCompany(template, companyId) {
  if (!template) return false;
  if (template.company_id == null || template.company_id === '') return true;
  if (!companyId) return false;
  return String(template.company_id) === String(companyId);
}

async function getTemplateById(templateId) {
  const { data, error } = await supabase
    .from('crm_daily_report_templates')
    .select(`${TEMPLATE_FIELDS}, items:crm_daily_report_template_items(${ITEM_FIELDS})`)
    .eq('id', templateId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  data.items = (data.items || []).slice().sort((a, b) => a.order_index - b.order_index);
  return data;
}

async function loadReportBundle(reportId) {
  const { data: report, error } = await supabase
    .from('crm_daily_reports')
    .select(REPORT_FIELDS)
    .eq('id', reportId)
    .maybeSingle();
  if (error) throw error;
  if (!report) return null;

  const [{ data: lines, error: lineErr }, { data: user }, { data: template }] = await Promise.all([
    supabase.from('crm_daily_report_lines').select(LINE_FIELDS).eq('report_id', reportId).order('order_index'),
    supabase.from('users').select('id, full_name, email, avatar, department_id, role').eq('id', report.user_id).maybeSingle(),
    supabase.from('crm_daily_report_templates').select(TEMPLATE_FIELDS).eq('id', report.template_id).maybeSingle(),
  ]);
  if (lineErr) throw lineErr;

  const sorted = (lines || []).slice().sort((a, b) => {
    if (a.section !== b.section) {
      const order = { work: 0, sharpen: 1, proposal: 2 };
      return (order[a.section] ?? 9) - (order[b.section] ?? 9);
    }
    return a.order_index - b.order_index;
  });

  const workLines = sorted.filter((l) => l.section === 'work');
  let planSum = 0;
  let resultSum = 0;
  let compared = 0;
  let hit = 0;
  for (const l of workLines) {
    if (l.plan_value != null) planSum += Number(l.plan_value);
    if (l.result_value != null) resultSum += Number(l.result_value);
    if (l.plan_value != null && Number(l.plan_value) > 0) {
      compared += 1;
      if (l.result_value != null && Number(l.result_value) >= Number(l.plan_value)) hit += 1;
    }
  }

  return {
    ...report,
    user: user || null,
    template: template || null,
    lines: sorted,
    stats: {
      plan_sum: planSum,
      result_sum: resultSum,
      achieve_pct: planSum > 0 ? Math.round((resultSum / planSum) * 1000) / 10 : null,
      lines_hit_ratio: compared > 0 ? Math.round((hit / compared) * 1000) / 10 : null,
    },
  };
}

async function canViewReport(req, report) {
  if (!report) return false;
  if (String(report.user_id) === String(req.user.userId)) return true;
  if (isGlobalManager(req.user)) return true;

  // Manager cùng phòng / cùng công ty
  const me = await loadUserProfile(req.user.userId);
  const target = await loadUserProfile(report.user_id);
  if (!me || !target) return false;

  if (me.company_id && target.company_id && String(me.company_id) === String(target.company_id)) {
    // Trưởng phòng: manager_id của department target = me
    if (target.department_id) {
      const { data: dept } = await supabase
        .from('departments')
        .select('id, manager_id')
        .eq('id', target.department_id)
        .maybeSingle();
      if (dept?.manager_id && String(dept.manager_id) === String(me.id)) return true;
    }
    // Cùng department
    if (me.department_id && target.department_id && String(me.department_id) === String(target.department_id)) {
      // Member thường chỉ xem của mình — đã check ở trên
      return false;
    }
  }
  return false;
}

/** Đồng bộ dòng từ template vào phiếu (thêm thiếu + gỡ hạng mục không còn trong mẫu). */
async function syncMissingTemplateLines(reportId, template) {
  if (!reportId || !template?.items?.length) return;
  const { data: existing } = await supabase
    .from('crm_daily_report_lines')
    .select('id, template_item_id, metric_key, label, section, order_index')
    .eq('report_id', reportId);
  const haveItem = new Set((existing || []).map((l) => String(l.template_item_id || '')).filter(Boolean));
  const haveMetric = new Set((existing || []).map((l) => l.metric_key).filter(Boolean));
  const now = new Date().toISOString();
  const toInsert = [];
  const validItemIds = new Set((template.items || []).map((it) => String(it.id)));
  const validMetrics = new Set(
    (template.items || []).map((it) => it.metric_key || metricKeyFromLabel(it.label)).filter(Boolean),
  );

  // Cập nhật label / metric / thứ tự khi mẫu đổi (cùng template_item_id)
  for (const it of template.items) {
    const key = it.metric_key || metricKeyFromLabel(it.label);
    const row = (existing || []).find((l) => String(l.template_item_id || '') === String(it.id));
    if (!row) continue;
    const patch = {};
    if (row.label !== it.label) patch.label = it.label;
    if ((row.metric_key || null) !== (key || null)) patch.metric_key = key;
    if (Number(row.order_index) !== Number(it.order_index)) patch.order_index = it.order_index;
    if (row.section !== it.section) patch.section = it.section;
    if (Object.keys(patch).length) {
      patch.updated_at = now;
      await supabase.from('crm_daily_report_lines').update(patch).eq('id', row.id);
      if (key) haveMetric.add(key);
    }
  }

  for (const it of template.items) {
    const key = it.metric_key || metricKeyFromLabel(it.label);
    if (haveItem.has(String(it.id))) continue;
    if (key && haveMetric.has(key)) continue;
    toInsert.push({
      report_id: reportId,
      template_item_id: it.id,
      section: it.section,
      label: it.label,
      order_index: it.order_index,
      metric_key: key,
      plan_value: null,
      result_value: null,
      plan_note: null,
      result_note: null,
      auto_result: false,
      updated_at: now,
    });
  }
  if (toInsert.length) {
    const { error } = await supabase.from('crm_daily_report_lines').insert(toInsert);
    if (error) throw error;
  }

  // Gỡ dòng work không còn trong template (vd: bỏ events/deal khỏi Sale Admin)
  // Không xóa dòng user tự thêm (metric_key user_extra:…)
  const orphanWorkIds = (existing || [])
    .filter((l) => {
      if (l.section !== 'work') return false;
      if (String(l.metric_key || '').startsWith('user_extra:')) return false;
      if (l.template_item_id && validItemIds.has(String(l.template_item_id))) return false;
      if (l.metric_key && validMetrics.has(l.metric_key)) return false;
      const still = (template.items || []).some((it) => it.section === 'work' && it.label === l.label);
      return !still;
    })
    .map((l) => l.id)
    .filter(Boolean);

  // Gỡ dòng sharpen/proposal cũ không còn trong mẫu (không đụng user_extra)
  const orphanOtherIds = (existing || [])
    .filter((l) => {
      if (l.section !== 'sharpen' && l.section !== 'proposal') return false;
      if (String(l.metric_key || '').startsWith('user_extra:')) return false;
      if (l.template_item_id && validItemIds.has(String(l.template_item_id))) return false;
      return true;
    })
    .map((l) => l.id)
    .filter(Boolean);

  const orphanIds = [...orphanWorkIds, ...orphanOtherIds];
  if (orphanIds.length) {
    await supabase.from('crm_daily_report_lines').delete().in('id', orphanIds);
  }
}

function userExtraMetricKey(extraId) {
  return `user_extra:${extraId}`;
}

async function listUserExtras(userId) {
  const { data, error } = await supabase
    .from('crm_daily_report_user_extras')
    .select('id, user_id, company_id, section, label, order_index, is_active, created_at, updated_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('section')
    .order('order_index');
  if (error) throw error;
  return data || [];
}

/** Đưa dòng user-extra vào phiếu ngày (để hôm sau vẫn có). */
async function syncUserExtraLines(reportId, userId) {
  if (!reportId || !userId) return;
  const extras = await listUserExtras(userId);
  if (!extras.length) return;
  const { data: existing } = await supabase
    .from('crm_daily_report_lines')
    .select('id, metric_key, label, section')
    .eq('report_id', reportId);
  const haveKey = new Set((existing || []).map((l) => l.metric_key).filter(Boolean));
  const now = new Date().toISOString();
  const toInsert = [];
  for (const ex of extras) {
    const key = userExtraMetricKey(ex.id);
    if (haveKey.has(key)) {
      // đồng bộ label nếu user đổi tên
      const row = (existing || []).find((l) => l.metric_key === key);
      if (row && row.label !== ex.label) {
        await supabase
          .from('crm_daily_report_lines')
          .update({ label: ex.label, order_index: ex.order_index, updated_at: now })
          .eq('id', row.id);
      }
      continue;
    }
    toInsert.push({
      report_id: reportId,
      template_item_id: null,
      section: ex.section,
      label: ex.label,
      order_index: ex.order_index || 100,
      metric_key: key,
      plan_value: null,
      result_value: null,
      plan_note: null,
      result_note: null,
      auto_result: false,
      updated_at: now,
    });
  }
  if (toInsert.length) {
    const { error } = await supabase.from('crm_daily_report_lines').insert(toInsert);
    if (error) throw error;
  }
}

function skeletonLinesFromExtras(extras) {
  return (extras || []).map((ex) => ({
    id: null,
    template_item_id: null,
    section: ex.section,
    label: ex.label,
    order_index: ex.order_index || 100,
    metric_key: userExtraMetricKey(ex.id),
    plan_value: null,
    result_value: null,
    plan_note: '',
    result_note: '',
    auto_result: false,
    is_user_extra: true,
    user_extra_id: ex.id,
  }));
}

/** Đổi mẫu báo cáo: giữ dòng user_extra, seed lại hạng mục theo mẫu mới. */
async function switchReportTemplate(reportId, nextTpl, userId) {
  if (!reportId || !nextTpl?.id) return;
  const now = new Date().toISOString();
  await supabase
    .from('crm_daily_reports')
    .update({ template_id: nextTpl.id, updated_at: now })
    .eq('id', reportId);

  const { data: rows } = await supabase
    .from('crm_daily_report_lines')
    .select('id, metric_key')
    .eq('report_id', reportId);
  const delIds = (rows || [])
    .filter((l) => !String(l.metric_key || '').startsWith('user_extra:'))
    .map((l) => l.id)
    .filter(Boolean);
  if (delIds.length) {
    await supabase.from('crm_daily_report_lines').delete().in('id', delIds);
  }
  await syncMissingTemplateLines(reportId, nextTpl);
  if (userId) await syncUserExtraLines(reportId, userId);
}

async function canViewUserHistory(req, targetUserId) {
  if (String(targetUserId) === String(req.user.userId)) return true;
  return canViewReport(req, { user_id: targetUserId });
}

async function canViewTeam(req) {
  if (isGlobalManager(req.user)) return true;
  const me = await loadUserProfile(req.user.userId);
  if (!me?.department_id) return false;
  const { data: dept } = await supabase
    .from('departments')
    .select('id, manager_id')
    .eq('id', me.department_id)
    .maybeSingle();
  return !!(dept?.manager_id && String(dept.manager_id) === String(me.id));
}

/** Scope users cho team list */
async function resolveTeamUserIds(req) {
  if (isGlobalManager(req.user)) {
    const companyId = req.user.company_id || null;
    let q = supabase.from('users').select('id').eq('is_active', true);
    if (companyId) q = q.eq('company_id', companyId);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map((u) => u.id);
  }
  const me = await loadUserProfile(req.user.userId);
  if (!me?.department_id) return [req.user.userId];
  const { data: dept } = await supabase
    .from('departments')
    .select('id, manager_id')
    .eq('id', me.department_id)
    .maybeSingle();
  if (!(dept?.manager_id && String(dept.manager_id) === String(me.id))) {
    return [req.user.userId];
  }
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('department_id', me.department_id)
    .eq('is_active', true);
  if (error) throw error;
  return (data || []).map((u) => u.id);
}

// ─── GET /templates ──────────────────────────────────────────────────────────
r.get('/templates', async (req, res) => {
  try {
    const requested = String(req.query.company_id || '').trim() || null;
    let companyId = req.user.company_id || null;
    if (isSystemAdmin(req.user) && requested) companyId = requested;
    const templates = await listTemplates(companyId);
    return res.json({ templates, company_id: companyId });
  } catch (e) {
    console.error('[daily-reports] GET /templates:', e.message || e);
    return res.status(500).json({ error: e.message || 'Lỗi tải template' });
  }
});

// ─── GET /mine?date=YYYY-MM-DD&template_id= ───────────────────────────────────
r.get('/mine', async (req, res) => {
  try {
    const date = String(req.query.date || nowVnParts().date);
    if (!isValidDate(date)) return res.status(400).json({ error: 'Ngày không hợp lệ' });

    const userId = req.user.userId;
    const me = await loadUserProfile(userId);
    const deptName = me?.departments?.name || null;

    const { data: existing } = await supabase
      .from('crm_daily_reports')
      .select('id')
      .eq('user_id', userId)
      .eq('report_date', date)
      .maybeSingle();

    if (existing) {
      const { data: full } = await supabase
        .from('crm_daily_reports')
        .select(REPORT_FIELDS)
        .eq('id', existing.id)
        .maybeSingle();
      // Cho phép đổi mẫu tự do khi truyền template_id
      const wantTpl = req.query.template_id ? String(req.query.template_id) : null;
      const companyId = me?.company_id || req.user.company_id || null;
      if (full && wantTpl && wantTpl !== String(full.template_id || '')) {
        const nextTpl = await getTemplateById(wantTpl);
        if (nextTpl && templateAllowedForCompany(nextTpl, companyId)) {
          await switchReportTemplate(full.id, nextTpl, userId);
          full.template_id = nextTpl.id;
        }
      } else if (full?.template_id) {
        const template = await getTemplateById(full.template_id);
        if (template) await syncMissingTemplateLines(full.id, template);
        await syncUserExtraLines(existing.id, userId);
      } else {
        await syncUserExtraLines(existing.id, userId);
      }
      const bundle = await loadReportBundle(existing.id);
      return res.json({ report: bundle, templates: await listTemplates(me?.company_id || req.user.company_id || null) });
    }

    // Chưa có phiếu → trả skeleton theo template + dòng user tự thêm
    const templates = await listTemplates(me?.company_id || req.user.company_id || null);
    const companyId = me?.company_id || req.user.company_id || null;
    let templateId = req.query.template_id || null;
    if (!templateId) {
      const roleKey = guessRoleKey(me || req.user, deptName);
      const match = pickTemplateByRole(templates, roleKey, companyId);
      templateId = match?.id || null;
    }
    let template = templateId ? await getTemplateById(templateId) : null;
    if (template && !templateAllowedForCompany(template, companyId)) template = null;
    const extras = await listUserExtras(userId);
    const skeletonLines = [
      ...(template?.items || []).map((it) => ({
        id: null,
        template_item_id: it.id,
        section: it.section,
        label: it.label,
        order_index: it.order_index,
        metric_key: it.metric_key || null,
        plan_value: null,
        result_value: null,
        plan_note: '',
        result_note: '',
        auto_result: false,
      })),
      ...skeletonLinesFromExtras(extras),
    ];

    return res.json({
      report: {
        id: null,
        user_id: userId,
        company_id: me?.company_id || req.user.company_id || null,
        template_id: template?.id || null,
        report_date: date,
        department_name: deptName,
        status: 'draft',
        plan_submitted_at: null,
        result_submitted_at: null,
        manager_note: null,
        user: me ? { id: me.id, full_name: me.full_name, email: me.email, avatar: me.avatar, role: me.role } : null,
        template: template
          ? {
              id: template.id,
              name: template.name,
              role_key: template.role_key,
              has_sharpen_section: template.has_sharpen_section,
            }
          : null,
        lines: skeletonLines,
        stats: { plan_sum: 0, result_sum: 0, achieve_pct: null, lines_hit_ratio: null },
      },
      templates,
    });
  } catch (e) {
    console.error('[daily-reports] GET /mine:', e.message || e);
    return res.status(500).json({ error: e.message || 'Lỗi tải báo cáo' });
  }
});

// ─── PUT /mine — buổi sáng: lưu / nộp kế hoạch ───────────────────────────────
// body: { date, template_id, phase: 'plan'|'draft', lines: [...] }
r.put('/mine', async (req, res) => {
  try {
    const userId = req.user.userId;
    const date = String(req.body?.date || nowVnParts().date);
    const phase = String(req.body?.phase || 'draft');
    if (!isValidDate(date)) return res.status(400).json({ error: 'Ngày không hợp lệ' });
    if (phase === 'result') {
      return res.status(400).json({
        error: 'Buổi chiều hãy dùng nút “Chốt kết quả từ hệ thống” (POST /mine/auto-close).',
      });
    }
    if (!['draft', 'plan'].includes(phase)) {
      return res.status(400).json({ error: 'phase phải là draft|plan' });
    }

    const me = await loadUserProfile(userId);
    const companyId = me?.company_id || req.user.company_id || null;
    const deptName = me?.departments?.name || req.body?.department_name || null;

    let templateId = req.body?.template_id || null;
    const incomingLines = Array.isArray(req.body?.lines) ? req.body.lines : [];

    const { data: existing } = await supabase
      .from('crm_daily_reports')
      .select(REPORT_FIELDS)
      .eq('user_id', userId)
      .eq('report_date', date)
      .maybeSingle();

    if (existing) {
      // Cho phép đổi mẫu tự do khi client gửi template_id
      if (!templateId) templateId = existing.template_id;
    } else if (!templateId) {
      const templates = await listTemplates(companyId);
      const roleKey = guessRoleKey(me || req.user, deptName);
      templateId = pickTemplateByRole(templates, roleKey, companyId)?.id;
    }
    if (!templateId) return res.status(400).json({ error: 'Chưa có template báo cáo ngày' });

    const template = await getTemplateById(templateId);
    if (!template) return res.status(404).json({ error: 'Không tìm thấy template' });
    if (!templateAllowedForCompany(template, companyId)) {
      return res.status(403).json({ error: 'Mẫu báo cáo không thuộc công ty này' });
    }

    const now = new Date().toISOString();
    let report = existing;

    if (!report) {
      const insert = {
        company_id: companyId,
        user_id: userId,
        template_id: templateId,
        report_date: date,
        department_name: deptName,
        status: 'draft',
        updated_at: now,
      };
      const { data: created, error: insErr } = await supabase
        .from('crm_daily_reports')
        .insert(insert)
        .select(REPORT_FIELDS)
        .single();
      if (insErr) throw insErr;
      report = created;

      const seedLines = (template.items || []).map((it) => ({
        report_id: report.id,
        template_item_id: it.id,
        section: it.section,
        label: it.label,
        order_index: it.order_index,
        metric_key: it.metric_key || metricKeyFromLabel(it.label),
        plan_value: null,
        result_value: null,
        plan_note: null,
        result_note: null,
        auto_result: false,
        updated_at: now,
      }));
      if (seedLines.length) {
        const { error: seedErr } = await supabase.from('crm_daily_report_lines').insert(seedLines);
        if (seedErr) throw seedErr;
      }
      await syncUserExtraLines(report.id, userId);
    } else if (templateId && String(templateId) !== String(existing.template_id || '')) {
      await switchReportTemplate(report.id, template, userId);
      report = { ...report, template_id: templateId };
    } else {
      await syncUserExtraLines(report.id, userId);
    }

    const { data: dbLines, error: lineLoadErr } = await supabase
      .from('crm_daily_report_lines')
      .select(LINE_FIELDS)
      .eq('report_id', report.id);
    if (lineLoadErr) throw lineLoadErr;

    const byId = new Map((dbLines || []).map((l) => [String(l.id), l]));
    const byItem = new Map((dbLines || []).filter((l) => l.template_item_id).map((l) => [String(l.template_item_id), l]));
    const byMetric = new Map((dbLines || []).filter((l) => l.metric_key).map((l) => [String(l.metric_key), l]));

    const updates = [];
    for (const raw of incomingLines) {
      let row = null;
      if (raw.id && byId.has(String(raw.id))) row = byId.get(String(raw.id));
      else if (raw.template_item_id && byItem.has(String(raw.template_item_id))) {
        row = byItem.get(String(raw.template_item_id));
      } else if (raw.metric_key && byMetric.has(String(raw.metric_key))) {
        row = byMetric.get(String(raw.metric_key));
      }
      if (!row) continue;

      const patch = { id: row.id, updated_at: now };
      const section = row.section || 'work';
      const isUserExtra = String(row.metric_key || '').startsWith('user_extra:');
      if (section === 'work') {
        if ('plan_value' in raw) patch.plan_value = toNumOrNull(raw.plan_value);
        if ('plan_note' in raw) patch.plan_note = raw.plan_note != null ? String(raw.plan_note) : null;
        // Ghi chú kết quả: NV tự ghi (kể cả hạng mục AUTO)
        if ('result_note' in raw) patch.result_note = raw.result_note != null ? String(raw.result_note) : null;
        if (isUserExtra) {
          if ('label' in raw && raw.label != null) patch.label = String(raw.label);
          if ('result_value' in raw) patch.result_value = toNumOrNull(raw.result_value);
        }
      } else if (section === 'sharpen') {
        if ('label' in raw && raw.label != null) patch.label = String(raw.label);
        if ('result_value' in raw) patch.result_value = toNumOrNull(raw.result_value);
        if ('result_note' in raw) patch.result_note = raw.result_note != null ? String(raw.result_note) : null;
      } else if (section === 'proposal') {
        // plan_note = Mong muốn; result_note = Ghi chú; label = danh mục (có thể là dòng trống tự ghi)
        if ('label' in raw && raw.label != null) patch.label = String(raw.label);
        if ('plan_note' in raw) patch.plan_note = raw.plan_note != null ? String(raw.plan_note) : null;
        if ('result_note' in raw) patch.result_note = raw.result_note != null ? String(raw.result_note) : null;
      }
      updates.push(patch);
    }

    for (const patch of updates) {
      const { id, ...rest } = patch;
      const { error: upErr } = await supabase.from('crm_daily_report_lines').update(rest).eq('id', id);
      if (upErr) throw upErr;
    }

    const reportPatch = { updated_at: now, department_name: deptName || report.department_name };
    if (phase === 'plan') {
      reportPatch.plan_submitted_at = now;
      if (report.status !== 'result_submitted') {
        reportPatch.status = 'plan_submitted';
      }
    }

    const { data: updatedReport, error: repErr } = await supabase
      .from('crm_daily_reports')
      .update(reportPatch)
      .eq('id', report.id)
      .select(REPORT_FIELDS)
      .single();
    if (repErr) throw repErr;

    const bundle = await loadReportBundle(updatedReport.id);
    return res.json({ report: bundle });
  } catch (e) {
    console.error('[daily-reports] PUT /mine:', e.message || e);
    return res.status(500).json({ error: e.message || 'Lỗi lưu báo cáo' });
  }
});

// ─── POST /mine/auto-close — buổi chiều: tự chốt KQ Phần II từ CRM rồi nộp ───
r.post('/mine/auto-close', async (req, res) => {
  try {
    const userId = req.user.userId;
    const date = String(req.body?.date || nowVnParts().date);
    if (!isValidDate(date)) return res.status(400).json({ error: 'Ngày không hợp lệ' });

    const me = await loadUserProfile(userId);
    const companyId = me?.company_id || req.user.company_id || null;
    const deptName = me?.departments?.name || null;

    const out = await autoCloseDailyReportForUser({
      userId,
      reportDate: date,
      companyId,
      templateId: req.body?.template_id || null,
      departmentName: deptName,
      userProfile: me,
      force: true,
    });

    const bundle = await loadReportBundle(out.report.id);
    return res.json({
      report: bundle,
      auto_close: out.auto_close,
    });
  } catch (e) {
    console.error('[daily-reports] POST /mine/auto-close:', e.message || e);
    return res.status(500).json({ error: e.message || 'Lỗi chốt kết quả tự động' });
  }
});

// ─── POST /mine/extras — thêm dòng tự tạo (lưu theo user, dùng lại ngày sau) ─
r.post('/mine/extras', async (req, res) => {
  try {
    const userId = req.user.userId;
    const me = await loadUserProfile(userId);
    const section = String(req.body?.section || '').trim();
    const label = String(req.body?.label || '').trim();
    const date = String(req.body?.date || nowVnParts().date);
    if (!['work', 'sharpen', 'proposal'].includes(section)) {
      return res.status(400).json({ error: 'section phải là work|sharpen|proposal' });
    }
    if (!label) return res.status(400).json({ error: 'Nhập nội dung dòng mới' });
    if (!isValidDate(date)) return res.status(400).json({ error: 'Ngày không hợp lệ' });

    const extras = await listUserExtras(userId);
    const sameSec = extras.filter((e) => e.section === section);
    const orderIndex = sameSec.length
      ? Math.max(...sameSec.map((e) => Number(e.order_index) || 0)) + 1
      : 100;

    const { data: created, error } = await supabase
      .from('crm_daily_report_user_extras')
      .insert({
        user_id: userId,
        company_id: me?.company_id || req.user.company_id || null,
        section,
        label,
        order_index: orderIndex,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .select('id, user_id, company_id, section, label, order_index, is_active')
      .single();
    if (error) throw error;

    // Gắn vào phiếu hôm nay (tạo nháp nếu chưa có)
    let { data: report } = await supabase
      .from('crm_daily_reports')
      .select(REPORT_FIELDS)
      .eq('user_id', userId)
      .eq('report_date', date)
      .maybeSingle();

    if (!report) {
      const companyId = me?.company_id || req.user.company_id || null;
      const deptName = me?.departments?.name || null;
      const templates = await listTemplates(companyId);
      const roleKey = guessRoleKey(me || req.user, deptName);
      const templateId = pickTemplateByRole(templates, roleKey, companyId)?.id
        || req.body?.template_id
        || null;
      if (!templateId) {
        return res.json({ extra: created, report: null });
      }
      const template = await getTemplateById(templateId);
      const now = new Date().toISOString();
      const { data: createdReport, error: insErr } = await supabase
        .from('crm_daily_reports')
        .insert({
          company_id: companyId,
          user_id: userId,
          template_id: templateId,
          report_date: date,
          department_name: deptName,
          status: 'draft',
          updated_at: now,
        })
        .select(REPORT_FIELDS)
        .single();
      if (insErr) throw insErr;
      report = createdReport;
      if (template?.items?.length) {
        const seedLines = template.items.map((it) => ({
          report_id: report.id,
          template_item_id: it.id,
          section: it.section,
          label: it.label,
          order_index: it.order_index,
          metric_key: it.metric_key || metricKeyFromLabel(it.label),
          plan_value: null,
          result_value: null,
          plan_note: null,
          result_note: null,
          auto_result: false,
          updated_at: now,
        }));
        await supabase.from('crm_daily_report_lines').insert(seedLines);
      }
    }

    await syncUserExtraLines(report.id, userId);
    const bundle = await loadReportBundle(report.id);
    return res.json({ extra: created, report: bundle });
  } catch (e) {
    console.error('[daily-reports] POST /mine/extras:', e.message || e);
    return res.status(500).json({ error: e.message || 'Lỗi thêm dòng' });
  }
});

// ─── PATCH /mine/extras/:id — đổi tên dòng tự tạo ────────────────────────────
r.patch('/mine/extras/:id', async (req, res) => {
  try {
    const userId = req.user.userId;
    const extraId = String(req.params.id || '');
    const label = String(req.body?.label || '').trim();
    const date = String(req.body?.date || nowVnParts().date);
    if (!extraId) return res.status(400).json({ error: 'Thiếu id' });
    if (!label) return res.status(400).json({ error: 'Nhập nội dung' });

    const { data: extra, error } = await supabase
      .from('crm_daily_report_user_extras')
      .update({ label, updated_at: new Date().toISOString() })
      .eq('id', extraId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .select('id, section, label, order_index')
      .maybeSingle();
    if (error) throw error;
    if (!extra) return res.status(404).json({ error: 'Không tìm thấy dòng' });

    const key = userExtraMetricKey(extraId);
    await supabase
      .from('crm_daily_report_lines')
      .update({ label, updated_at: new Date().toISOString() })
      .eq('metric_key', key);

    if (isValidDate(date)) {
      const { data: report } = await supabase
        .from('crm_daily_reports')
        .select('id')
        .eq('user_id', userId)
        .eq('report_date', date)
        .maybeSingle();
      if (report?.id) {
        const bundle = await loadReportBundle(report.id);
        return res.json({ extra, report: bundle });
      }
    }
    return res.json({ extra, report: null });
  } catch (e) {
    console.error('[daily-reports] PATCH /mine/extras:', e.message || e);
    return res.status(500).json({ error: e.message || 'Lỗi cập nhật dòng' });
  }
});

// ─── DELETE /mine/extras/:id — ẩn dòng tự tạo (không còn hiện ngày sau) ───────
r.delete('/mine/extras/:id', async (req, res) => {
  try {
    const userId = req.user.userId;
    const extraId = String(req.params.id || '');
    const date = String(req.query.date || nowVnParts().date);
    if (!extraId) return res.status(400).json({ error: 'Thiếu id' });

    const { data: extra, error } = await supabase
      .from('crm_daily_report_user_extras')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', extraId)
      .eq('user_id', userId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!extra) return res.status(404).json({ error: 'Không tìm thấy dòng' });

    const key = userExtraMetricKey(extraId);
    // Xóa khỏi phiếu hôm nay (kể cả đã chốt)
    if (isValidDate(date)) {
      const { data: report } = await supabase
        .from('crm_daily_reports')
        .select('id, status')
        .eq('user_id', userId)
        .eq('report_date', date)
        .maybeSingle();
      if (report?.id) {
        await supabase
          .from('crm_daily_report_lines')
          .delete()
          .eq('report_id', report.id)
          .eq('metric_key', key);
        const bundle = await loadReportBundle(report.id);
        return res.json({ ok: true, report: bundle });
      }
    }
    return res.json({ ok: true, report: null });
  } catch (e) {
    console.error('[daily-reports] DELETE /mine/extras:', e.message || e);
    return res.status(500).json({ error: e.message || 'Lỗi xóa dòng' });
  }
});

// ─── GET /mine/preview-auto — xem trước số liệu CRM (chưa chốt) ───────────────
r.get('/mine/preview-auto', async (req, res) => {
  try {
    const userId = req.user.userId;
    const date = String(req.query.date || nowVnParts().date);
    if (!isValidDate(date)) return res.status(400).json({ error: 'Ngày không hợp lệ' });
    const me = await loadUserProfile(userId);
    const deptName = me?.departments?.name || null;
    let roleKey = req.query.role_key || null;
    if (!roleKey) {
      const { data: existing } = await supabase
        .from('crm_daily_reports')
        .select('template_id')
        .eq('user_id', userId)
        .eq('report_date', date)
        .maybeSingle();
      if (existing?.template_id) {
        const t = await getTemplateById(existing.template_id);
        roleKey = t?.role_key || null;
      }
    }
    if (!roleKey) roleKey = guessRoleKey(me || req.user, deptName);
    const resultDate = resultDateForReport(date);
    if (!resultDate) return res.status(400).json({ error: 'Không xác định được ngày kết quả (hôm trước)' });
    const computed = await computeAutoDailyResults(userId, resultDate, roleKey);
    return res.json({
      date,
      result_date: resultDate,
      role_key: roleKey,
      ...computed,
    });
  } catch (e) {
    console.error('[daily-reports] GET /mine/preview-auto:', e.message || e);
    return res.status(500).json({ error: e.message || 'Lỗi xem trước' });
  }
});

// ─── GET /history?date=&user_id= — lịch sử hoạt động trong ngày ──────────────
r.get('/history', async (req, res) => {
  try {
    const date = String(req.query.date || nowVnParts().date);
    if (!isValidDate(date)) return res.status(400).json({ error: 'Ngày không hợp lệ' });
    const targetUserId = String(req.query.user_id || req.user.userId);
    const ok = await canViewUserHistory(req, targetUserId);
    if (!ok) return res.status(403).json({ error: 'Không có quyền xem lịch sử người này' });

    const [history, profile] = await Promise.all([
      buildDailyWorkHistory(targetUserId, date),
      loadUserProfile(targetUserId),
    ]);

    return res.json({
      ...history,
      user: profile
        ? {
            id: profile.id,
            full_name: profile.full_name,
            email: profile.email,
            avatar: profile.avatar,
            department_name: profile.departments?.name || null,
          }
        : null,
    });
  } catch (e) {
    console.error('[daily-reports] GET /history:', e.message || e);
    return res.status(500).json({ error: e.message || 'Lỗi tải lịch sử' });
  }
});

// ─── GET /team?date= ─────────────────────────────────────────────────────────
r.get('/team', async (req, res) => {
  try {
    const date = String(req.query.date || nowVnParts().date);
    if (!isValidDate(date)) return res.status(400).json({ error: 'Ngày không hợp lệ' });

    const canTeam = await canViewTeam(req);
    const userIds = await resolveTeamUserIds(req);
    // Nếu không phải QL mà vẫn gọi team → chỉ trả chính mình
    const scopeIds = canTeam || isGlobalManager(req.user) ? userIds : [req.user.userId];

    if (!scopeIds.length) {
      return res.json({
        date,
        can_manage: canTeam || isGlobalManager(req.user),
        summary: { total: 0, plan_ok: 0, result_ok: 0, missing: 0 },
        rows: [],
      });
    }

    const { data: users, error: uErr } = await supabase
      .from('users')
      .select('id, full_name, email, avatar, role, department_id, departments:department_id(id, name)')
      .in('id', scopeIds);
    if (uErr) throw uErr;

    const { data: reports, error: rErr } = await supabase
      .from('crm_daily_reports')
      .select(REPORT_FIELDS)
      .eq('report_date', date)
      .in('user_id', scopeIds);
    if (rErr) throw rErr;

    const reportByUser = new Map((reports || []).map((rep) => [String(rep.user_id), rep]));
    const reportIds = (reports || []).map((rep) => rep.id);

    let linesByReport = new Map();
    if (reportIds.length) {
      const { data: lines, error: lErr } = await supabase
        .from('crm_daily_report_lines')
        .select('report_id, section, plan_value, result_value')
        .in('report_id', reportIds)
        .eq('section', 'work');
      if (lErr) throw lErr;
      for (const line of lines || []) {
        const arr = linesByReport.get(line.report_id) || [];
        arr.push(line);
        linesByReport.set(line.report_id, arr);
      }
    }

    const rows = (users || [])
      .map((u) => {
        const rep = reportByUser.get(String(u.id)) || null;
        const lines = rep ? linesByReport.get(rep.id) || [] : [];
        let planSum = 0;
        let resultSum = 0;
        for (const l of lines) {
          if (l.plan_value != null) planSum += Number(l.plan_value);
          if (l.result_value != null) resultSum += Number(l.result_value);
        }
        const achieve = planSum > 0 ? Math.round((resultSum / planSum) * 1000) / 10 : null;
        let submitState = 'missing';
        if (rep) {
          if (rep.result_submitted_at || rep.status === 'result_submitted' || rep.status === 'late') submitState = 'result_ok';
          else if (rep.plan_submitted_at || rep.status === 'plan_submitted') submitState = 'plan_ok';
          else submitState = 'draft';
        }
        return {
          user: {
            id: u.id,
            full_name: u.full_name,
            email: u.email,
            avatar: u.avatar,
            role: u.role,
            department_name: u.departments?.name || rep?.department_name || null,
          },
          report_id: rep?.id || null,
          status: rep?.status || null,
          submit_state: submitState,
          plan_submitted_at: rep?.plan_submitted_at || null,
          result_submitted_at: rep?.result_submitted_at || null,
          plan_sum: planSum,
          result_sum: resultSum,
          achieve_pct: achieve,
        };
      })
      .sort((a, b) => String(a.user.full_name || '').localeCompare(String(b.user.full_name || ''), 'vi'));

    const summary = {
      total: rows.length,
      plan_ok: rows.filter((x) => ['plan_ok', 'result_ok'].includes(x.submit_state)).length,
      result_ok: rows.filter((x) => x.submit_state === 'result_ok').length,
      missing: rows.filter((x) => x.submit_state === 'missing' || x.submit_state === 'draft').length,
    };

    return res.json({
      date,
      can_manage: canTeam || isGlobalManager(req.user),
      summary,
      rows,
    });
  } catch (e) {
    console.error('[daily-reports] GET /team:', e.message || e);
    return res.status(500).json({ error: e.message || 'Lỗi tải danh sách team' });
  }
});

/**
 * GET /team/matrix-cell-links?date=&user_id=&metric_key=&role_key=
 * Drill-down: lead/deal liên quan tới 1 ô kết quả (Phần II = ngày hôm trước).
 */
r.get('/team/matrix-cell-links', async (req, res) => {
  try {
    if (!isSystemAdmin(req.user)) {
      return res.status(403).json({ error: 'Chỉ admin hệ thống mới xem liên kết ô tổng hợp' });
    }

    const reportDate = String(req.query.date || nowVnParts().date);
    if (!isValidDate(reportDate)) return res.status(400).json({ error: 'Ngày không hợp lệ' });
    const userId = String(req.query.user_id || '').trim();
    if (!userId) return res.status(400).json({ error: 'Thiếu user_id' });
    const metricKey = String(req.query.metric_key || '').trim();
    if (!metricKey) return res.status(400).json({ error: 'Thiếu metric_key' });
    const roleKey = String(req.query.role_key || 'sale_admin').trim() || 'sale_admin';
    const section = String(req.query.section || 'result').trim();

    // Bảng tổng hợp: ô Kết quả / Kế hoạch đều bám ngày đang chọn trên bộ lọc.
    const crmDate = reportDate;

    const payload = await loadMetricEntityLinks(userId, crmDate, roleKey, metricKey);
    return res.json({
      date: reportDate,
      crm_date: crmDate,
      user_id: userId,
      role_key: roleKey,
      section,
      ...payload,
    });
  } catch (e) {
    console.error('[daily-reports] GET /team/matrix-cell-links:', e.message || e);
    return res.status(500).json({ error: e.message || 'Lỗi tải liên kết ô' });
  }
});

/**
 * GET /team/matrix?date=&company_id=&department_id=
 * Bảng tổng hợp: cột = NV, hàng = mục I/II/III/IV (admin hệ thống / CRM admin).
 */
r.get('/team/matrix', async (req, res) => {
  try {
    if (!isSystemAdmin(req.user)) {
      return res.status(403).json({ error: 'Chỉ admin hệ thống mới xem bảng tổng hợp' });
    }

    const date = String(req.query.date || nowVnParts().date);
    if (!isValidDate(date)) return res.status(400).json({ error: 'Ngày không hợp lệ' });

    // Tab Kết quả trên bảng tổng hợp = CRM của đúng ngày đang chọn (không lệch −1).
    // Phiếu cá nhân vẫn: Phần I = ngày phiếu, Phần II = hôm trước.
    const resultDate = date;
    let companyId = String(req.query.company_id || '').trim() || null;
    const departmentId = String(req.query.department_id || '').trim() || null;
    const qSearch = String(req.query.q || '').trim().toLowerCase();

    // Admin công ty: khóa phạm vi company
    if (!isSystemAdmin(req.user) && req.user.company_id) {
      companyId = String(req.user.company_id);
    }
    if (!companyId) {
      return res.status(400).json({ error: 'Chọn công ty để xem bảng tổng hợp' });
    }

    const { data: depts, error: dErr } = await supabase
      .from('departments')
      .select('id, name, company_id')
      .eq('company_id', companyId);
    if (dErr) throw dErr;
    const deptIds = (depts || []).map((d) => d.id);
    const deptNameById = new Map((depts || []).map((d) => [String(d.id), d.name]));

    // NV thuộc công ty (company_id hoặc phòng ban của công ty)
    let users = [];
    {
      const { data: byCompany } = await supabase
        .from('users')
        .select('id, full_name, email, avatar, role, department_id, company_id, is_active')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .limit(2000);
      users = byCompany || [];
    }
    if (deptIds.length) {
      let dq = supabase
        .from('users')
        .select('id, full_name, email, avatar, role, department_id, company_id, is_active')
        .in('department_id', deptIds)
        .eq('is_active', true)
        .limit(2000);
      if (departmentId) dq = dq.eq('department_id', departmentId);
      const { data: byDept } = await dq;
      const seen = new Set(users.map((u) => String(u.id)));
      for (const u of byDept || []) {
        if (!seen.has(String(u.id))) users.push(u);
      }
    }
    if (departmentId) {
      users = users.filter((u) => String(u.department_id || '') === departmentId);
    }
    if (qSearch) {
      users = users.filter((u) => {
        const name = String(u.full_name || '').toLowerCase();
        const email = String(u.email || '').toLowerCase();
        return name.includes(qSearch) || email.includes(qSearch);
      });
    }

    const templateRoleFilter = String(req.query.role_key || req.query.template_id || '').trim() || null;

    // Bổ sung NV có phiếu ngày này thuộc công ty (kể cả company_id user null)
    const { data: companyReports, error: crErr } = await supabase
      .from('crm_daily_reports')
      .select(`${REPORT_FIELDS}, template:crm_daily_report_templates(id, name, role_key)`)
      .eq('report_date', date)
      .eq('company_id', companyId)
      .limit(2000);
    if (crErr) throw crErr;

    const reportByUser = new Map();
    for (const rep of companyReports || []) {
      reportByUser.set(String(rep.user_id), rep);
    }

    const templatesCatalog = await listTemplates(companyId);
    const templateById = new Map((templatesCatalog || []).map((t) => [String(t.id), t]));
    const templateByRole = new Map();
    for (const t of templatesCatalog || []) {
      const rk = normalizeDailyRoleKey(t.role_key);
      if (!rk) continue;
      if (!templateByRole.has(rk) || (companyId && String(t.company_id || '') === String(companyId))) {
        templateByRole.set(rk, t);
      }
    }

    const missingUserIds = [...reportByUser.keys()].filter(
      (uid) => !users.some((u) => String(u.id) === uid),
    );
    if (missingUserIds.length) {
      const { data: extraUsers } = await supabase
        .from('users')
        .select('id, full_name, email, avatar, role, department_id, company_id, is_active')
        .in('id', missingUserIds);
      for (const u of extraUsers || []) {
        if (departmentId && String(u.department_id || '') !== departmentId) continue;
        if (qSearch) {
          const name = String(u.full_name || '').toLowerCase();
          const email = String(u.email || '').toLowerCase();
          if (!name.includes(qSearch) && !email.includes(qSearch)) continue;
        }
        users.push(u);
      }
    }

    users.sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || ''), 'vi'));

    const lastTemplateByUser = new Map();
    {
      const userIds = users.map((u) => u.id).filter(Boolean);
      if (userIds.length) {
        const { data: prevReps } = await supabase
          .from('crm_daily_reports')
          .select('user_id, template_id, report_date')
          .eq('company_id', companyId)
          .in('user_id', userIds)
          .not('template_id', 'is', null)
          .gte('report_date', crmReportAddDaysYmd(date, -21) || date)
          .order('report_date', { ascending: false })
          .limit(4000);
        for (const r of prevReps || []) {
          const uid = String(r.user_id);
          if (!lastTemplateByUser.has(uid) && r.template_id) lastTemplateByUser.set(uid, String(r.template_id));
        }
      }
    }

    users = users.filter((u) => {
      const uid = String(u.id);
      const dn = deptNameById.get(String(u.department_id || '')) || '';
      if (looksLikeNonCrmUser(u) && !reportByUser.has(uid)) return false;
      if (reportByUser.has(uid)) return true;
      const guessed = guessRoleKey(u, dn);
      if (guessed === 'sale_admin' || guessed === 'sale_deal' || guessed === 'design_survey') return true;
      if (lastTemplateByUser.has(uid) && isCrmSalesDept(dn)) return true;
      return false;
    });

    const reportIds = users
      .map((u) => reportByUser.get(String(u.id))?.id)
      .filter(Boolean);

    let allLines = [];
    if (reportIds.length) {
      const { data: lines, error: lErr } = await supabase
        .from('crm_daily_report_lines')
        .select('report_id, section, label, order_index, metric_key, plan_value, result_value, plan_note, result_note, auto_result')
        .in('report_id', reportIds)
        .order('order_index');
      if (lErr) throw lErr;
      allLines = lines || [];
    }

    const linesByReport = new Map();
    for (const line of allLines) {
      const rid = String(line.report_id);
      const arr = linesByReport.get(rid) || [];
      arr.push(line);
      linesByReport.set(rid, arr);
    }

    function resolveTemplateMeta(u, rep) {
      if (rep?.template?.id) {
        return {
          template_id: rep.template.id,
          template_name: rep.template.name,
          role_key: normalizeDailyRoleKey(rep.template.role_key) || 'unknown',
        };
      }
      if (rep?.template_id && templateById.has(String(rep.template_id))) {
        const t = templateById.get(String(rep.template_id));
        return { template_id: t.id, template_name: t.name, role_key: normalizeDailyRoleKey(t.role_key) || 'unknown' };
      }
      const lastId = lastTemplateByUser.get(String(u.id));
      if (lastId && templateById.has(lastId)) {
        const t = templateById.get(lastId);
        return { template_id: t.id, template_name: t.name, role_key: normalizeDailyRoleKey(t.role_key) || 'unknown' };
      }
      const guessed = guessRoleKey(u, deptNameById.get(String(u.department_id || '')) || '');
      if (!guessed) return { template_id: null, template_name: 'Chưa có mẫu', role_key: 'none' };
      const t = pickTemplateByRole(templatesCatalog, guessed, companyId) || templateByRole.get(normalizeDailyRoleKey(guessed));
      if (t) return { template_id: t.id, template_name: t.name, role_key: normalizeDailyRoleKey(t.role_key) };
      return { template_id: null, template_name: 'Chưa có mẫu', role_key: 'none' };
    }

    let employees = users.map((u) => {
      const rep = reportByUser.get(String(u.id)) || null;
      let submitState = 'missing';
      if (rep) {
        if (rep.result_submitted_at || rep.status === 'result_submitted' || rep.status === 'late') submitState = 'result_ok';
        else if (rep.plan_submitted_at || rep.status === 'plan_submitted') submitState = 'plan_ok';
        else submitState = 'draft';
      }
      const tpl = resolveTemplateMeta(u, rep);
      return {
        id: u.id,
        full_name: u.full_name,
        email: u.email,
        avatar: u.avatar,
        department_id: u.department_id || null,
        department_name: deptNameById.get(String(u.department_id || '')) || rep?.department_name || null,
        report_id: rep?.id || null,
        status: rep?.status || null,
        submit_state: submitState,
        plan_submitted_at: rep?.plan_submitted_at || null,
        result_submitted_at: rep?.result_submitted_at || null,
        template_id: tpl.template_id,
        template_name: tpl.template_name,
        role_key: tpl.role_key,
      };
    }).filter((e) => (
      e.report_id
      || (e.role_key && e.role_key !== 'none' && e.role_key !== 'unknown')
    ));

    if (templateRoleFilter) {
      const wantRole = normalizeDailyRoleKey(templateRoleFilter);
      employees = employees.filter((e) => (
        String(e.template_id) === templateRoleFilter
        || normalizeDailyRoleKey(e.role_key) === wantRole
      ));
    }

    // Luôn tính CRM live cho Phần II — không phụ thuộc phiếu đã chốt / cron 17:00.
    const AUTO_RESULT_ROLES = new Set(['sale_admin', 'sale_deal', 'deal_admin', 'design_survey']);
    const liveByUser = new Map();
    const needLiveResult = !!resultDate && employees.some((e) => AUTO_RESULT_ROLES.has(e.role_key));
    if (needLiveResult) {
      await mapLimit(
        employees.filter((e) => (
          AUTO_RESULT_ROLES.has(e.role_key)
          && (e.report_id || isCrmSalesDept(e.department_name) || lastTemplateByUser.has(String(e.id)))
        )),
        6,
        async (emp) => {
          try {
            const computed = await computeAutoDailyResults(String(emp.id), resultDate, emp.role_key);
            liveByUser.set(String(emp.id), computed.metrics || {});
          } catch (err) {
            console.warn('[daily-reports] live matrix result', emp.id, err.message || err);
          }
        },
      );
    }

    function rowKey(section, line) {
      if (line.metric_key) return `${section}:${line.metric_key}`;
      return `${section}:label:${String(line.label || '').trim().toLowerCase()}`;
    }

    function sourceLines(emp, section, valueField) {
      const tpl = emp.template_id ? templateById.get(String(emp.template_id)) : null;
      const tplItems = (tpl?.items || []).filter((it) => it.section === section);
      const allowedKeys = new Set(tplItems.map((it) => it.metric_key).filter(Boolean));
      const allowedLabels = new Set(tplItems.map((it) => String(it.label || '').trim().toLowerCase()).filter(Boolean));

      // Kết quả team: luôn lấy hạng mục từ mẫu + số CRM live (không dùng result_value phiếu,
      // vì phiếu ngày D lưu KQ của D−1).
      if (valueField === 'result' && section === 'work') {
        const extras = emp.report_id
          ? (linesByReport.get(String(emp.report_id)) || []).filter((l) => (
            l.section === 'work' && String(l.metric_key || '').startsWith('user_extra:')
          ))
          : [];
        return [
          ...tplItems.map((it) => ({
            section: 'work',
            label: it.label,
            order_index: it.order_index,
            metric_key: it.metric_key,
            plan_value: null,
            result_value: null,
          })),
          ...extras,
        ];
      }

      const fromReport = emp.report_id
        ? (linesByReport.get(String(emp.report_id)) || []).filter((l) => {
          if (l.section !== section) return false;
          if (String(l.metric_key || '').startsWith('user_extra:')) return true;
          if (!tplItems.length) return true;
          if (l.metric_key && allowedKeys.has(l.metric_key)) return true;
          return allowedLabels.has(String(l.label || '').trim().toLowerCase());
        })
        : [];
      return fromReport;
    }

    function collectSectionRows(empList, section, valueField) {
      const map = new Map();
      for (const emp of empList) {
        if (valueField !== 'result' && !emp.report_id) continue;
        const lines = sourceLines(emp, section, valueField);
        for (const line of lines) {
          const key = rowKey(section, line);
          if (!map.has(key)) {
            map.set(key, {
              key,
              metric_key: line.metric_key || null,
              label: line.label || '—',
              order_index: Number(line.order_index) || 0,
              values: {},
            });
          }
          const row = map.get(key);
          if (!row.metric_key && line.metric_key) row.metric_key = line.metric_key;
          row.order_index = Math.min(row.order_index, Number(line.order_index) || 0);
          let display = null;
          if (valueField === 'plan') display = line.plan_value;
          else if (valueField === 'result') {
            const live = liveByUser.get(String(emp.id));
            const mk = line.metric_key || metricKeyFromLabel(line.label);
            if (live && mk && live[mk] && live[mk].value != null) display = live[mk].value;
            else display = line.result_value;
          } else if (valueField === 'note') {
            const note = line.result_note || line.plan_note;
            display = note && String(note).trim() ? String(note).trim() : (line.result_value ?? line.plan_value);
          }
          const uid = String(emp.id);
          if (display == null || display === '') row.values[uid] = null;
          else {
            const num = Number(display);
            row.values[uid] = Number.isFinite(num) && String(display).trim() !== '' && !Number.isNaN(num)
              ? num
              : display;
          }
        }
      }
      return [...map.values()].sort((a, b) => a.order_index - b.order_index || String(a.label).localeCompare(String(b.label), 'vi'));
    }

    function buildSections(empList) {
      return [
        {
          key: 'plan',
          code: 'I',
          title: `I. Kế hoạch ngày mới (${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)})`,
          rows: collectSectionRows(empList, 'work', 'plan'),
        },
        {
          key: 'result',
          code: 'II',
          title: `II. Kết quả (${resultDate ? `${resultDate.slice(8, 10)}/${resultDate.slice(5, 7)}/${resultDate.slice(0, 4)}` : '—'})`,
          rows: collectSectionRows(empList, 'work', 'result'),
        },
        {
          key: 'sharpen',
          code: 'III',
          title: 'III. Công việc mài dao',
          rows: collectSectionRows(empList, 'sharpen', 'note'),
        },
        {
          key: 'proposal',
          code: 'IV',
          title: 'IV. Đề xuất',
          rows: collectSectionRows(empList, 'proposal', 'note'),
        },
      ];
    }

    const ROLE_ORDER = ['sale_admin', 'sale_deal', 'deal_admin', 'design_survey', 'none', 'unknown'];
    const groupMap = new Map();
    for (const emp of employees) {
      const key = String(emp.template_id || emp.role_key || 'none');
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          role_key: emp.role_key || 'none',
          template_id: emp.template_id,
          template_name: emp.template_name || emp.role_key,
          employees: [],
        });
      }
      const g = groupMap.get(key);
      if (!g.template_id && emp.template_id) g.template_id = emp.template_id;
      if (emp.template_name) g.template_name = emp.template_name;
      if (emp.role_key) g.role_key = emp.role_key;
      g.employees.push(emp);
    }

    const groups = [...groupMap.values()]
      .map((g) => ({
        ...g,
        sections: buildSections(g.employees),
        summary: {
          total: g.employees.length,
          with_report: g.employees.filter((e) => e.report_id).length,
          result_ok: g.employees.filter((e) => e.submit_state === 'result_ok').length,
          missing: g.employees.filter((e) => e.submit_state === 'missing' || e.submit_state === 'draft').length,
        },
      }))
      .sort((a, b) => {
        const ia = ROLE_ORDER.indexOf(a.role_key);
        const ib = ROLE_ORDER.indexOf(b.role_key);
        const ra = ia < 0 ? 99 : ia;
        const rb = ib < 0 ? 99 : ib;
        if (ra !== rb) return ra - rb;
        return String(a.template_name).localeCompare(String(b.template_name), 'vi');
      });

    const summary = {
      total: employees.length,
      with_report: employees.filter((e) => e.report_id).length,
      plan_ok: employees.filter((e) => ['plan_ok', 'result_ok'].includes(e.submit_state)).length,
      result_ok: employees.filter((e) => e.submit_state === 'result_ok').length,
      missing: employees.filter((e) => e.submit_state === 'missing' || e.submit_state === 'draft').length,
    };

    res.set('Cache-Control', 'no-store');
    return res.json({
      date,
      result_date: resultDate,
      result_live: needLiveResult,
      company_id: companyId,
      department_id: departmentId,
      role_key: templateRoleFilter,
      templates: (templatesCatalog || []).map((t) => ({
        id: t.id,
        name: t.name,
        role_key: t.role_key,
        company_id: t.company_id || null,
      })),
      departments: (depts || []).map((d) => ({ id: d.id, name: d.name })),
      summary,
      groups,
      // backward compat: flatten first group style
      employees,
      sections: buildSections(employees),
    });
  } catch (e) {
    console.error('[daily-reports] GET /team/matrix:', e.message || e);
    return res.status(500).json({ error: e.message || 'Lỗi tải bảng tổng hợp' });
  }
});

// ─── GET /:id — chi tiết phiếu ───────────────────────────────────────────────
r.get('/:id', async (req, res) => {
  try {
    const bundle = await loadReportBundle(req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Không tìm thấy báo cáo' });
    const ok = await canViewReport(req, bundle);
    if (!ok) return res.status(403).json({ error: 'Không có quyền xem báo cáo này' });
    return res.json({ report: bundle });
  } catch (e) {
    console.error('[daily-reports] GET /:id:', e.message || e);
    return res.status(500).json({ error: e.message || 'Lỗi tải chi tiết' });
  }
});

// ─── PATCH /:id/manager-note ─────────────────────────────────────────────────
r.patch('/:id/manager-note', async (req, res) => {
  try {
    if (!(await canViewTeam(req)) && !isGlobalManager(req.user)) {
      return res.status(403).json({ error: 'Chỉ quản lý mới ghi chú được' });
    }
    const bundle = await loadReportBundle(req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Không tìm thấy báo cáo' });
    const ok = await canViewReport(req, bundle);
    if (!ok) return res.status(403).json({ error: 'Không có quyền' });

    const note = req.body?.manager_note != null ? String(req.body.manager_note) : null;
    const { data, error } = await supabase
      .from('crm_daily_reports')
      .update({ manager_note: note, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select(REPORT_FIELDS)
      .single();
    if (error) throw error;
    return res.json({ report: await loadReportBundle(data.id) });
  } catch (e) {
    console.error('[daily-reports] PATCH manager-note:', e.message || e);
    return res.status(500).json({ error: e.message || 'Lỗi cập nhật ghi chú' });
  }
});

module.exports = r;
