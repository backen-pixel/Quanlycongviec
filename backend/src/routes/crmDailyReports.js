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
const { metricKeyFromLabel, isSnapshotWorkMetric, computeForUser } = require('../helpers/dailyReportMetrics');
const { guessRoleKey } = require('../helpers/dailyReportStaffing');
const { loadSnapshotsMap, snapKey, resultUntilIso, resolveDailyReportLivePhases } = require('../helpers/dailyReportSnapshot');
const {
  loadAssignedTemplateIds,
  getAssignedTemplateId,
  setAssignedTemplate,
  clearAssignedTemplate,
} = require('../helpers/dailyReportUserTemplates');
const { buildDailyWorkHistory } = require('../helpers/dailyWorkHistory');
const { loadTeamDailyReportMatrix } = require('../helpers/dailyReportTeamMatrix');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isValidDate = (s) => DATE_RE.test(String(s || '')) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());

/** Phần II = CRM đúng ngày phiếu (cron 16:45). */
function resultDateForReport(reportDate) {
  return reportDate;
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

async function overlaySnapshotOnLines(lines, userId, reportDate, companyId, opts = {}) {
  const snaps = await loadSnapshotsMap(reportDate, companyId);
  const live = resolveDailyReportLivePhases({
    date: reportDate,
    snapshotMap: snaps,
    userId,
  });
  let planMetrics = null;
  let resultMetrics = null;
  if (live.plan || live.result) {
    const roleKey = opts.roleKey || 'sale_admin';
    try {
      // Hai pha không dùng kết quả của nhau — trước đây chờ nối tiếp nên phiếu cá
      // nhân phải trả hai lượt truy vấn liền nhau.
      const [planPack, resultPack] = await Promise.all([
        live.plan
          ? computeForUser(userId, reportDate, roleKey, 'plan', { companyId })
          : null,
        live.result
          ? computeForUser(userId, reportDate, roleKey, 'result', {
            companyId,
            untilIso: resultUntilIso(reportDate),
          })
          : null,
      ]);
      if (live.plan) planMetrics = planPack?.metrics || {};
      if (live.result) resultMetrics = resultPack?.metrics || {};
    } catch (e) {
      console.warn('[daily-reports] overlay live', userId, e.message || e);
    }
  }
  if (!snaps.size && !planMetrics && !resultMetrics) return lines;
  return (lines || []).map((l) => {
    if (l.section !== 'work') return l;
    const mk = l.metric_key || metricKeyFromLabel(l.label);
    if (!isSnapshotWorkMetric(mk)) return l;
    const planSnap = snaps.get(snapKey(userId, 'plan', mk));
    const resultSnap = snaps.get(snapKey(userId, 'result', mk));
    const planLive = planMetrics?.[mk];
    const resultLive = resultMetrics?.[mk];
    const plan = planSnap || (planLive ? { value: planLive.value } : null);
    const result = resultSnap || (resultLive ? { value: resultLive.value } : null);
    if (!plan && !result) return l;
    return {
      ...l,
      plan_value: plan?.value != null ? Number(plan.value) : l.plan_value,
      result_value: result?.value != null ? Number(result.value) : l.result_value,
      auto_result: true,
    };
  });
}

async function overlayBundleSnapshots(bundle, companyId) {
  if (!bundle?.user_id || !bundle.report_date) return bundle;
  const lines = await overlaySnapshotOnLines(
    bundle.lines,
    bundle.user_id,
    bundle.report_date,
    companyId,
    { roleKey: bundle.template?.role_key },
  );
  const workLines = (lines || []).filter((l) => l.section === 'work');
  let planSum = 0;
  let resultSum = 0;
  for (const l of workLines) {
    if (l.plan_value != null) planSum += Number(l.plan_value);
    if (l.result_value != null) resultSum += Number(l.result_value);
  }
  return {
    ...bundle,
    lines,
    stats: {
      ...(bundle.stats || {}),
      plan_sum: planSum,
      result_sum: resultSum,
      achieve_pct: planSum > 0 ? Math.round((resultSum / planSum) * 1000) / 10 : null,
    },
  };
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

/**
 * Gắn phiếu cũ sang mẫu khác mà KHÔNG xoá dòng nào (khác switchReportTemplate).
 * Hạng mục cùng mục + cùng nhãn/metric được trỏ sang mẫu mới nên giữ nguyên số liệu và
 * ghi chú đã nhập; dòng riêng của mẫu cũ vẫn nằm lại DB nhưng bị lọc lúc hiển thị.
 */
async function retagReportTemplate(reportId, nextTpl, userId) {
  if (!reportId || !nextTpl?.id) return;
  const now = new Date().toISOString();
  const { data: rows } = await supabase
    .from('crm_daily_report_lines')
    .select('id, section, label, metric_key, template_item_id')
    .eq('report_id', reportId);
  const oldLines = (rows || []).filter((l) => !String(l.metric_key || '').startsWith('user_extra:'));

  await supabase
    .from('crm_daily_reports')
    .update({ template_id: nextTpl.id, updated_at: now })
    .eq('id', reportId);

  const norm = (s) => String(s || '').trim().toLowerCase();
  const reused = new Set();
  const toInsert = [];
  for (const it of nextTpl.items || []) {
    const metricKey = it.metric_key || metricKeyFromLabel(it.label);
    const reuse = oldLines.find((l) => (
      !reused.has(l.id)
      && l.section === it.section
      && ((metricKey && l.metric_key === metricKey) || norm(l.label) === norm(it.label))
    ));
    if (reuse) {
      reused.add(reuse.id);
      await supabase
        .from('crm_daily_report_lines')
        .update({
          template_item_id: it.id,
          label: it.label,
          order_index: it.order_index,
          metric_key: metricKey,
          updated_at: now,
        })
        .eq('id', reuse.id);
      continue;
    }
    toInsert.push({
      report_id: reportId,
      template_item_id: it.id,
      section: it.section,
      label: it.label,
      order_index: it.order_index,
      metric_key: metricKey,
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
    // Hồ sơ nhân viên và phiếu của ngày là hai truy vấn độc lập — nạp cùng lúc.
    const [me, { data: existing }] = await Promise.all([
      loadUserProfile(userId),
      supabase
        .from('crm_daily_reports')
        .select('id')
        .eq('user_id', userId)
        .eq('report_date', date)
        .maybeSingle(),
    ]);
    const deptName = me?.departments?.name || null;

    if (existing) {
      // Danh mục mẫu chỉ cần company_id — cho chạy nền, chờ ở bước trả kết quả.
      const templatesP = listTemplates(me?.company_id || req.user.company_id || null);
      templatesP.catch(() => {});
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
          await setAssignedTemplate({ userId, companyId, templateId: nextTpl.id, assignedBy: userId });
        }
      } else if (full?.template_id) {
        const template = await getTemplateById(full.template_id);
        if (template) await syncMissingTemplateLines(full.id, template);
        await syncUserExtraLines(existing.id, userId);
      } else {
        await syncUserExtraLines(existing.id, userId);
      }
      const bundle = await overlayBundleSnapshots(
        await loadReportBundle(existing.id),
        me?.company_id || req.user.company_id || null,
      );
      return res.json({ report: bundle, templates: await templatesP });
    }

    // Chưa có phiếu → trả skeleton theo template + dòng user tự thêm
    const templates = await listTemplates(me?.company_id || req.user.company_id || null);
    const companyId = me?.company_id || req.user.company_id || null;
    let templateId = req.query.template_id || null;
    if (!templateId) templateId = await getAssignedTemplateId(userId);
    if (!templateId) {
      const roleKey = guessRoleKey(me || req.user, deptName);
      const match = pickTemplateByRole(templates, roleKey, companyId);
      templateId = match?.id || null;
    }
    let template = templateId ? await getTemplateById(templateId) : null;
    if (template && !templateAllowedForCompany(template, companyId)) template = null;
    const extras = await listUserExtras(userId);
    const skeletonLines = await overlaySnapshotOnLines([
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
    ], userId, date, companyId, { roleKey: template?.role_key });

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
        stats: (() => {
          const workLines = skeletonLines.filter((l) => l.section === 'work');
          let planSum = 0;
          let resultSum = 0;
          for (const l of workLines) {
            if (l.plan_value != null) planSum += Number(l.plan_value);
            if (l.result_value != null) resultSum += Number(l.result_value);
          }
          return { plan_sum: planSum, result_sum: resultSum, achieve_pct: null, lines_hit_ratio: null };
        })(),
      },
      templates,
    });
  } catch (e) {
    console.error('[daily-reports] GET /mine:', e.message || e);
    return res.status(500).json({ error: e.message || 'Lỗi tải báo cáo' });
  }
});

// ─── PUT /mine — lưu nháp / nộp III–IV; số I–II do snapshot 08:00 / 16:45 ──
// body: { date, template_id, phase: 'draft'|'plan'|'result', lines: [...] }
r.put('/mine', async (req, res) => {
  try {
    const userId = req.user.userId;
    const date = String(req.body?.date || nowVnParts().date);
    const phase = String(req.body?.phase || 'draft');
    if (!isValidDate(date)) return res.status(400).json({ error: 'Ngày không hợp lệ' });
    if (!['draft', 'plan', 'result'].includes(phase)) {
      return res.status(400).json({ error: 'phase phải là draft|plan|result' });
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
      templateId = await getAssignedTemplateId(userId);
      if (!templateId) {
        const templates = await listTemplates(companyId);
        const roleKey = guessRoleKey(me || req.user, deptName);
        templateId = pickTemplateByRole(templates, roleKey, companyId)?.id;
      }
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
      await setAssignedTemplate({ userId, companyId, templateId, assignedBy: userId });
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
      const snapshotOwned = !isUserExtra && isSnapshotWorkMetric(row.metric_key);
      if (section === 'work') {
        if ('plan_note' in raw) patch.plan_note = raw.plan_note != null ? String(raw.plan_note) : null;
        if ('result_note' in raw) patch.result_note = raw.result_note != null ? String(raw.result_note) : null;
        if (isUserExtra || !snapshotOwned) {
          if ('plan_value' in raw) patch.plan_value = toNumOrNull(raw.plan_value);
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
    if (phase === 'result') {
      reportPatch.result_submitted_at = now;
      reportPatch.status = 'result_submitted';
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

// ─── POST /mine/auto-close — đã gỡ: số AUTO chỉ do cron snapshot ──────────────
r.post('/mine/auto-close', async (_req, res) => {
  return res.status(410).json({
    error: 'Đã tắt chốt tay từ CRM. Hệ thống snapshot 08:00 (Phần I) và 16:45 (Phần II).',
  });
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
      const templateId = await getAssignedTemplateId(userId)
        || pickTemplateByRole(templates, roleKey, companyId)?.id
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
    if (!roleKey) {
      const assignedId = await getAssignedTemplateId(userId);
      if (assignedId) roleKey = (await getTemplateById(assignedId))?.role_key || null;
    }
    if (!roleKey) roleKey = guessRoleKey(me || req.user, deptName);
    const snaps = await loadSnapshotsMap(date, me?.company_id || req.user.company_id || null);
    const live = resolveDailyReportLivePhases({
      explicitPreview: String(req.query.preview || '') === '1',
      date,
      snapshotMap: snaps,
      userId,
    });
    const livePreview = !!(live.plan || live.result);
    let metrics = {};
    let plan_metrics = {};
    if (livePreview) {
      const companyId = me?.company_id || req.user.company_id || null;
      const jobs = [];
      if (live.plan) {
        jobs.push(computeForUser(userId, date, roleKey, 'plan', { companyId }).then((p) => {
          plan_metrics = p.metrics || {};
        }));
      }
      if (live.result) {
        jobs.push(computeForUser(userId, date, roleKey, 'result', {
          untilIso: resultUntilIso(date),
          companyId,
        }).then((p) => {
          metrics = p.metrics || {};
        }));
      }
      await Promise.all(jobs);
    } else {
      for (const [key, row] of snaps) {
        if (!String(key).startsWith(`${userId}|`)) continue;
        const payload = { value: row.value, note: row.note, source: row.source, ids: row.entity_ids || [] };
        if (row.phase === 'result') metrics[row.metric_key] = payload;
        if (row.phase === 'plan') plan_metrics[row.metric_key] = payload;
      }
    }
    return res.json({
      date,
      result_date: date,
      plan_date: date,
      role_key: roleKey,
      metrics,
      plan_metrics,
      result_until: resultUntilIso(date),
      snapshot: !livePreview,
      preview: livePreview,
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
 * Drill-down: lead/deal liên quan tới 1 ô kết quả (Phần II = đúng ngày phiếu).
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
    const section = String(req.query.section || 'result').trim();

    const roleKey = String(req.query.role_key || '').trim() || null;
    const companyId = String(req.query.company_id || '').trim() || null;
    const phase = section === 'plan' ? 'plan' : 'result';
    const snaps = await loadSnapshotsMap(reportDate, companyId);
    const live = resolveDailyReportLivePhases({ date: reportDate, snapshotMap: snaps, userId });
    let hit = snaps.get(snapKey(userId, phase, metricKey));
    const wantLive = String(req.query.preview || '') === '1'
      || (phase === 'plan' && live.plan)
      || (phase === 'result' && live.result);
    if ((!hit || hit.value == null) && wantLive) {
      try {
        const pack = await computeForUser(userId, reportDate, roleKey || 'sale_admin', phase, {
          companyId,
          untilIso: phase === 'result' ? resultUntilIso(reportDate) : null,
        });
        const m = pack?.metrics?.[metricKey];
        if (m) {
          hit = {
            value: m.value,
            entity_ids: m.ids,
            note: m.note,
            source: m.source || 'live',
            computed_at: pack.computed_at,
          };
        }
      } catch (e) {
        console.warn('[daily-reports] matrix-cell-links live', e.message || e);
      }
    }
    const ids = [...new Set((hit?.entity_ids || []).map(String).filter(Boolean))];
    const items = [];
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { data, error } = await supabase
        .from('crm_leads')
        .select('id, code, title, type, phone, company_id, stage:crm_pipeline_stages!stage_id(id, name)')
        .in('id', chunk);
      if (error) throw error;
      for (const row of data || []) {
        items.push({
          id: row.id,
          code: row.code || null,
          name: row.title || null,
          type: row.type || 'lead',
          phone: row.phone || null,
          stage_name: row.stage?.name || null,
          path: `/crm/leads/${row.id}`,
        });
      }
    }
    return res.json({
      date: reportDate,
      crm_date: reportDate,
      user_id: userId,
      role_key: roleKey,
      section,
      metric_key: metricKey,
      value: hit?.value ?? null,
      note: hit?.note || null,
      source: hit?.source || 'snapshot',
      ids,
      items,
      computed_at: hit?.computed_at || null,
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

    // Tab Kết quả + phiếu cá nhân: CRM đúng ngày đang chọn / ngày phiếu (không lệch −1).
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

    const templateRoleFilter = String(req.query.role_key || req.query.template_id || '').trim() || null;
    const preview = String(req.query.preview || '') === '1';
    const payload = await loadTeamDailyReportMatrix({
      date,
      companyId,
      departmentId,
      roleKey: templateRoleFilter,
      q: qSearch,
      preview,
    });
    res.set('Cache-Control', 'no-store');
    return res.json(payload);
  } catch (e) {
    console.error('[daily-reports] GET /team/matrix:', e.message || e);
    return res.status(500).json({ error: e.message || 'Lỗi tải bảng tổng hợp' });
  }
});

// ─── PUT /team/assign-template — gán cứng mẫu cho 1 nhân viên ────────────────
// body: { user_id, template_id: uuid | null (null = về tự động theo vai trò), company_id?, backfill? }
r.put('/team/assign-template', async (req, res) => {
  try {
    if (!isSystemAdmin(req.user)) {
      return res.status(403).json({ error: 'Chỉ admin hệ thống mới gán mẫu báo cáo' });
    }
    const userId = String(req.body?.user_id || '').trim();
    if (!userId) return res.status(400).json({ error: 'Thiếu user_id' });
    const templateId = String(req.body?.template_id || '').trim() || null;
    const backfill = req.body?.backfill !== false;

    const target = await loadUserProfile(userId);
    if (!target) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });
    const companyId = String(req.body?.company_id || '').trim() || target.company_id || null;

    if (!templateId) {
      await clearAssignedTemplate(userId);
      return res.json({ ok: true, user_id: userId, template_id: null, retagged: 0 });
    }

    const template = await getTemplateById(templateId);
    if (!template) return res.status(404).json({ error: 'Không tìm thấy mẫu báo cáo' });
    if (!templateAllowedForCompany(template, companyId)) {
      return res.status(403).json({ error: 'Mẫu báo cáo không thuộc công ty này' });
    }

    await setAssignedTemplate({
      userId,
      companyId,
      templateId: template.id,
      assignedBy: req.user.userId,
    });

    let retagged = 0;
    if (backfill) {
      const { data: reps, error: repErr } = await supabase
        .from('crm_daily_reports')
        .select('id')
        .eq('user_id', userId)
        .neq('template_id', template.id)
        .order('report_date', { ascending: false })
        .limit(400);
      if (repErr) throw repErr;
      for (const rep of reps || []) {
        await retagReportTemplate(rep.id, template, userId);
        retagged += 1;
      }
    }

    return res.json({
      ok: true,
      user_id: userId,
      template_id: template.id,
      template_name: template.name,
      role_key: normalizeDailyRoleKey(template.role_key),
      retagged,
    });
  } catch (e) {
    console.error('[daily-reports] PUT /team/assign-template:', e.message || e);
    return res.status(500).json({ error: e.message || 'Lỗi gán mẫu báo cáo' });
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
