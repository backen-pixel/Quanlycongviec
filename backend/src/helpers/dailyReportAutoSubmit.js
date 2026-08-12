/**
 * Tự động chốt Phần II (KQ ngày hôm trước) từ CRM rồi nộp phiếu báo cáo ngày.
 * Dùng chung: POST /mine/auto-close, cron 17:00 VN, script seed.
 */
const { supabase } = require('../config/supabase');
const { normalizeRole } = require('./adminRole');
const { computeAutoDailyResults, metricKeyFromLabel } = require('./dailyReportAutoClose');
const { crmReportAddDaysYmd, crmReportTodayYmdVn } = require('./crmReportDateBounds');

const TEMPLATE_FIELDS =
  'id, company_id, role_key, name, description, has_sharpen_section, is_active, created_at, updated_at';
const ITEM_FIELDS =
  'id, template_id, section, label, order_index, unit_label, metric_key, created_at';
const REPORT_FIELDS =
  'id, company_id, user_id, template_id, report_date, department_name, status, plan_submitted_at, result_submitted_at, manager_note, created_at, updated_at';
const LINE_FIELDS =
  'id, report_id, template_item_id, section, label, order_index, plan_value, result_value, plan_note, result_note, metric_key, auto_result, created_at, updated_at';

function guessRoleKey(user, departmentName = '') {
  const role = normalizeRole(user?.role);
  const dept = String(departmentName || '').toLowerCase();
  const name = String(user?.full_name || '').toLowerCase();
  if (
    role === 'sales_admin'
    || /sale\s*admin|sales?\s*admin|chăm\s*sóc|cham\s*soc|\bcskh\b|care\s*lead/.test(dept)
    || /sale\s*admin/.test(name)
  ) {
    return 'sale_admin';
  }
  if (/thiết\s*kế|thiet\s*ke|design/.test(dept)) return 'design_survey';
  if (
    role === 'admin'
    || role === 'manager'
    || role === 'platform_admin'
    || role === 'crm_production_admin'
    || role === 'sales'
    || /sale\s*-?\s*deal|kinh\s*doanh|admin|quản\s*lý|quan\s*ly|giám\s*đốc/.test(dept)
    || /sale\s*-?\s*deal/.test(name)
  ) {
    return 'sale_deal';
  }
  return 'sale_admin';
}

/** Phòng ban CRM/sale (không SX / VC / NS / KT / mua hàng). */
function isCrmSalesDept(name) {
  const t = String(name || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  if (!t) return false;
  if (/san\s*xuat|van\s*chuyen|lap\s*dat|nhan\s*su|tai\s*chinh|ke\s*toan|mua\s*hang|kho\b|cong\s*nhan/.test(t)) {
    return false;
  }
  return /cskh|cham\s*soc|kinh\s*doanh|sale|marketing|thiet\s*ke|design/.test(t);
}

function looksLikeNonCrmUser(user) {
  const name = String(user?.full_name || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const role = String(user?.role || '').toLowerCase();
  if (/san\s*xuat|lap\s*dat|van\s*chuyen|ke\s*toan|mua\s*hang|cong\s*nhan/.test(name)) return true;
  if (/production|logistics|warehouse|accountant/.test(role)) return true;
  return false;
}

function resultDateForReport(reportDate) {
  return crmReportAddDaysYmd(reportDate, -1);
}

async function listTemplates(companyId = null) {
  let q = supabase
    .from('crm_daily_report_templates')
    .select(`${TEMPLATE_FIELDS}, items:crm_daily_report_template_items(${ITEM_FIELDS})`)
    .eq('is_active', true)
    .order('name');
  if (companyId) {
    q = q.or(`company_id.is.null,company_id.eq.${companyId}`);
  } else {
    q = q.is('company_id', null);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map((t) => ({
    ...t,
    items: (t.items || []).slice().sort(
      (a, b) => (a.order_index - b.order_index) || String(a.label).localeCompare(String(b.label)),
    ),
  }));
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

async function listUserExtras(userId) {
  const { data, error } = await supabase
    .from('crm_daily_report_user_extras')
    .select('id, user_id, company_id, section, label, order_index, is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('section')
    .order('order_index');
  if (error) throw error;
  return data || [];
}

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
    const key = `user_extra:${ex.id}`;
    if (haveKey.has(key)) {
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

/**
 * Chốt Phần II (section=work) từ CRM cho 1 user/ngày phiếu.
 * @returns {{ report, auto_close }}
 */
async function autoCloseDailyReportForUser({
  userId,
  reportDate = null,
  companyId = null,
  templateId = null,
  departmentName = null,
  userProfile = null,
  force = true,
} = {}) {
  if (!userId) throw new Error('Thiếu userId');
  const date = reportDate || crmReportTodayYmdVn();
  const resultDate = resultDateForReport(date);
  if (!resultDate) throw new Error('Không xác định được ngày kết quả (hôm trước)');

  let me = userProfile;
  if (!me) {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email, role, company_id, department_id, departments:department_id(id, name)')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    me = data;
  }

  const resolvedCompanyId = companyId || me?.company_id || null;
  const deptName = departmentName || me?.departments?.name || me?.department_name || null;

  let { data: report } = await supabase
    .from('crm_daily_reports')
    .select(REPORT_FIELDS)
    .eq('user_id', userId)
    .eq('report_date', date)
    .maybeSingle();

  if (!force && report && (report.result_submitted_at || report.status === 'result_submitted')) {
    return {
      report,
      auto_close: {
        skipped: true,
        reason: 'already_submitted',
        report_date: date,
        result_date: resultDate,
        auto_filled: 0,
        manual_left: 0,
      },
    };
  }

  let resolvedTemplateId = templateId || report?.template_id || null;
  const templates = await listTemplates(resolvedCompanyId);
  const roleKeyGuess = guessRoleKey(me || { role: null }, deptName);
  if (!resolvedTemplateId) {
    resolvedTemplateId = (templates.find((t) => t.role_key === roleKeyGuess) || templates[0])?.id;
  }
  if (!resolvedTemplateId) throw new Error('Chưa có template báo cáo ngày');

  const template = await getTemplateById(resolvedTemplateId);
  if (!template) throw new Error('Không tìm thấy template');

  const now = new Date().toISOString();
  if (!report) {
    const { data: created, error: insErr } = await supabase
      .from('crm_daily_reports')
      .insert({
        company_id: resolvedCompanyId,
        user_id: userId,
        template_id: resolvedTemplateId,
        report_date: date,
        department_name: deptName,
        status: 'draft',
        updated_at: now,
      })
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
  } else if (resolvedCompanyId && String(report.company_id || '') !== String(resolvedCompanyId)) {
    await supabase
      .from('crm_daily_reports')
      .update({
        company_id: resolvedCompanyId,
        template_id: resolvedTemplateId,
        department_name: deptName || report.department_name,
        updated_at: now,
      })
      .eq('id', report.id);
  }

  await syncMissingTemplateLines(report.id, template);
  await syncUserExtraLines(report.id, userId);

  const { data: linesToFill, error: lineErr } = await supabase
    .from('crm_daily_report_lines')
    .select(LINE_FIELDS)
    .eq('report_id', report.id);
  if (lineErr) throw lineErr;

  const roleKey = template.role_key || roleKeyGuess;
  const computed = await computeAutoDailyResults(userId, resultDate, roleKey);
  const metrics = computed.metrics || {};

  let autoFilled = 0;
  let manualLeft = 0;
  for (const row of linesToFill || []) {
    if (row.section !== 'work') continue; // Chỉ Phần II (KQ hạng mục work)
    const key = row.metric_key || metricKeyFromLabel(row.label);
    const m = key ? metrics[key] : null;
    if (m) {
      const keepNote = row.result_note && !/^tự động:/i.test(String(row.result_note))
        && !/^không tự động/i.test(String(row.result_note))
        ? row.result_note
        : null;
      const { error: upErr } = await supabase
        .from('crm_daily_report_lines')
        .update({
          result_value: m.value,
          result_note: keepNote,
          metric_key: key,
          auto_result: true,
          updated_at: now,
        })
        .eq('id', row.id);
      if (upErr) throw upErr;
      autoFilled += 1;
    } else {
      const keepNote = row.result_note && !/^không tự động/i.test(String(row.result_note))
        ? row.result_note
        : null;
      const { error: upErr } = await supabase
        .from('crm_daily_report_lines')
        .update({
          result_value: row.result_value != null ? row.result_value : 0,
          result_note: keepNote,
          auto_result: false,
          updated_at: now,
        })
        .eq('id', row.id);
      if (upErr) throw upErr;
      manualLeft += 1;
    }
  }

  const reportPatch = {
    updated_at: now,
    department_name: deptName || report.department_name,
    result_submitted_at: now,
    status: 'result_submitted',
  };
  if (!report.plan_submitted_at) reportPatch.plan_submitted_at = now;
  if (resolvedCompanyId) reportPatch.company_id = resolvedCompanyId;
  if (resolvedTemplateId) reportPatch.template_id = resolvedTemplateId;

  const { data: updatedReport, error: repErr } = await supabase
    .from('crm_daily_reports')
    .update(reportPatch)
    .eq('id', report.id)
    .select(REPORT_FIELDS)
    .single();
  if (repErr) throw repErr;

  return {
    report: updatedReport,
    auto_close: {
      skipped: false,
      auto_filled: autoFilled,
      manual_left: manualLeft,
      computed_at: computed.computed_at,
      report_date: date,
      result_date: resultDate,
      role_key: roleKey,
      metrics,
    },
  };
}

/**
 * Danh sách NV CRM cần auto-nộp Phần II theo công ty (phòng ban sale/CSKH/TK…).
 */
async function listCrmUsersForAutoClose(companyId) {
  if (!companyId) return [];
  const { data: depts, error: dErr } = await supabase
    .from('departments')
    .select('id, name')
    .eq('company_id', companyId);
  if (dErr) throw dErr;

  const crmDepts = (depts || []).filter((d) => isCrmSalesDept(d.name));
  const crmDeptIds = crmDepts.map((d) => d.id);
  const deptNameById = new Map((depts || []).map((d) => [String(d.id), d.name]));

  let users = [];
  if (crmDeptIds.length) {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email, role, department_id, company_id, is_active')
      .in('department_id', crmDeptIds)
      .eq('is_active', true)
      .limit(2000);
    if (error) throw error;
    users = data || [];
  }

  // Bổ sung user thuộc company_id (phòng CRM) nếu chưa có
  const { data: byCompany } = await supabase
    .from('users')
    .select('id, full_name, email, role, department_id, company_id, is_active')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .limit(2000);
  const seen = new Set(users.map((u) => String(u.id)));
  for (const u of byCompany || []) {
    if (seen.has(String(u.id))) continue;
    const dn = deptNameById.get(String(u.department_id || ''));
    if (dn && isCrmSalesDept(dn)) {
      users.push(u);
      seen.add(String(u.id));
    }
  }

  return users
    .filter((u) => !looksLikeNonCrmUser(u))
    .map((u) => ({
      ...u,
      department_name: deptNameById.get(String(u.department_id || '')) || null,
    }));
}

async function listCompanyIdsForAutoClose(explicitIds = null) {
  if (Array.isArray(explicitIds) && explicitIds.length) return explicitIds.map(String);
  const env = String(process.env.DAILY_REPORT_AUTO_CLOSE_COMPANY_IDS || '').trim();
  if (env) {
    return env.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  }
  // Mặc định: chỉ công ty đã có phiếu BC ngày (tránh quét toàn bộ hệ thống lần đầu).
  const { data: recent, error } = await supabase
    .from('crm_daily_reports')
    .select('company_id')
    .not('company_id', 'is', null)
    .gte('report_date', crmReportAddDaysYmd(crmReportTodayYmdVn(), -30))
    .limit(5000);
  if (!error && recent?.length) {
    return [...new Set(recent.map((r) => String(r.company_id)).filter(Boolean))];
  }
  // Fallback: công ty có phòng ban CRM/sale
  const { data: depts } = await supabase.from('departments').select('company_id, name').limit(3000);
  const ids = new Set();
  for (const d of depts || []) {
    if (d.company_id && isCrmSalesDept(d.name)) ids.add(String(d.company_id));
  }
  return [...ids];
}

/**
 * Chạy batch auto-nộp Phần II cho 1 hoặc nhiều công ty.
 */
async function runAutoCloseBatch({
  reportDate = null,
  companyIds = null,
  force = true,
  onProgress = null,
} = {}) {
  const date = reportDate || crmReportTodayYmdVn();
  const companies = await listCompanyIdsForAutoClose(companyIds);
  const results = [];

  for (const companyId of companies) {
    let users = [];
    try {
      users = await listCrmUsersForAutoClose(companyId);
    } catch (e) {
      results.push({ company_id: companyId, error: e.message || String(e) });
      continue;
    }
    for (const u of users) {
      try {
        const out = await autoCloseDailyReportForUser({
          userId: u.id,
          reportDate: date,
          companyId,
          departmentName: u.department_name,
          userProfile: u,
          force,
        });
        const row = {
          company_id: companyId,
          user_id: u.id,
          name: u.full_name,
          role_key: out.auto_close?.role_key,
          auto_filled: out.auto_close?.auto_filled || 0,
          manual_left: out.auto_close?.manual_left || 0,
          skipped: !!out.auto_close?.skipped,
        };
        results.push(row);
        if (typeof onProgress === 'function') onProgress(row);
      } catch (e) {
        const row = {
          company_id: companyId,
          user_id: u.id,
          name: u.full_name,
          error: e.message || String(e),
        };
        results.push(row);
        if (typeof onProgress === 'function') onProgress(row);
      }
    }
  }

  return {
    report_date: date,
    result_date: resultDateForReport(date),
    companies: companies.length,
    processed: results.length,
    ok: results.filter((r) => !r.error && !r.skipped).length,
    skipped: results.filter((r) => r.skipped).length,
    errors: results.filter((r) => r.error).length,
    results,
  };
}

module.exports = {
  guessRoleKey,
  isCrmSalesDept,
  resultDateForReport,
  listTemplates,
  getTemplateById,
  autoCloseDailyReportForUser,
  listCrmUsersForAutoClose,
  listCompanyIdsForAutoClose,
  runAutoCloseBatch,
  REPORT_FIELDS,
  LINE_FIELDS,
};
