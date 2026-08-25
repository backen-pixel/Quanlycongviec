/**
 * Snapshot báo cáo ngày: nguồn sự thật cho matrix + Excel + phiếu AUTO.
 * Phần I 08:00 · Phần II cắt 16:45 VN.
 */
const { supabase } = require('../config/supabase');
const { crmReportAddDaysYmd, crmReportTodayYmdVn } = require('./crmReportDateBounds');
const { getAssignedTemplateId } = require('./dailyReportUserTemplates');
const { guessRoleKey, isCrmSalesDept, looksLikeNonCrmUser } = require('./dailyReportStaffing');
const { computeForUser, metricKeyFromLabel } = require('./dailyReportMetrics');

const TEMPLATE_FIELDS =
  'id, company_id, role_key, name, description, has_sharpen_section, is_active, created_at, updated_at';
const ITEM_FIELDS =
  'id, template_id, section, label, order_index, unit_label, metric_key, created_at';
const REPORT_FIELDS =
  'id, company_id, user_id, template_id, report_date, department_name, status, plan_submitted_at, result_submitted_at, manager_note, created_at, updated_at';
const LINE_FIELDS =
  'id, report_id, template_item_id, section, label, order_index, plan_value, result_value, plan_note, result_note, metric_key, auto_result, created_at, updated_at';

function resultUntilIso(reportDate) {
  return `${reportDate}T16:45:00.000+07:00`;
}

function snapKey(userId, phase, metricKey) {
  return `${userId}|${phase}|${metricKey}`;
}

async function listTemplates(companyId = null) {
  let q = supabase
    .from('crm_daily_report_templates')
    .select(`${TEMPLATE_FIELDS}, items:crm_daily_report_template_items(${ITEM_FIELDS})`)
    .eq('is_active', true)
    .order('name');
  if (companyId) q = q.or(`company_id.is.null,company_id.eq.${companyId}`);
  else q = q.is('company_id', null);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data || []).map((t) => ({
    ...t,
    items: (t.items || []).slice().sort((a, b) => (a.order_index - b.order_index) || String(a.label).localeCompare(String(b.label))),
  }));
  if (!companyId) return rows.filter((t) => t.company_id == null);
  const cid = String(companyId);
  const companyRows = rows.filter((t) => t.company_id && String(t.company_id) === cid);
  const usedRoles = new Set(companyRows.map((t) => String(t.role_key)));
  const globalsKept = rows.filter((t) => t.company_id == null && !usedRoles.has(String(t.role_key)));
  return [...companyRows, ...globalsKept];
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

async function listCrmUsersForSnapshot(companyId) {
  const { data: depts, error: dErr } = await supabase
    .from('departments')
    .select('id, name, company_id')
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

async function listCompanyIdsForSnapshot(explicitIds = null) {
  if (Array.isArray(explicitIds) && explicitIds.length) return explicitIds.map(String);
  const env = String(process.env.DAILY_REPORT_AUTO_CLOSE_COMPANY_IDS || '').trim();
  if (env) return env.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  const { data: recent, error } = await supabase
    .from('crm_daily_reports')
    .select('company_id')
    .not('company_id', 'is', null)
    .gte('report_date', crmReportAddDaysYmd(crmReportTodayYmdVn(), -30))
    .limit(5000);
  if (!error && recent?.length) {
    return [...new Set(recent.map((r) => String(r.company_id)).filter(Boolean))];
  }
  const { data: depts } = await supabase.from('departments').select('company_id, name').limit(3000);
  const ids = new Set();
  for (const d of depts || []) {
    if (d.company_id && isCrmSalesDept(d.name)) ids.add(String(d.company_id));
  }
  return [...ids];
}

async function upsertSnapshots({ reportDate, companyId, userId, phase, metrics }) {
  const now = new Date().toISOString();
  const rows = Object.entries(metrics || {}).map(([metric_key, m]) => ({
    report_date: reportDate,
    company_id: companyId || null,
    user_id: userId,
    phase,
    metric_key,
    value: m?.value ?? 0,
    entity_ids: m?.ids || [],
    note: m?.note || null,
    source: m?.source || null,
    computed_at: now,
  }));
  if (!rows.length) return 0;
  const { error } = await supabase
    .from('crm_daily_report_snapshots')
    .upsert(rows, { onConflict: 'report_date,user_id,phase,metric_key' });
  if (error) throw error;
  return rows.length;
}

async function loadSnapshotsMap(reportDate, companyId = null) {
  let q = supabase
    .from('crm_daily_report_snapshots')
    .select('user_id, phase, metric_key, value, entity_ids, note, source, computed_at, company_id')
    .eq('report_date', reportDate)
    .limit(20000);
  if (companyId) q = q.eq('company_id', companyId);
  const { data, error } = await q;
  if (error) {
    if (String(error.message || '').includes('crm_daily_report_snapshots') || error.code === 'PGRST205' || error.code === '42P01') {
      return new Map();
    }
    throw error;
  }
  const map = new Map();
  for (const row of data || []) {
    map.set(snapKey(row.user_id, row.phase, row.metric_key), row);
  }
  return map;
}

async function ensureReportForUser({ userId, reportDate, companyId, departmentName, userProfile }) {
  const now = new Date().toISOString();
  let { data: report } = await supabase
    .from('crm_daily_reports')
    .select(REPORT_FIELDS)
    .eq('user_id', userId)
    .eq('report_date', reportDate)
    .maybeSingle();

  let resolvedTemplateId = report?.template_id || await getAssignedTemplateId(userId) || null;
  const templates = await listTemplates(companyId);
  const roleKeyGuess = guessRoleKey(userProfile || { role: null }, departmentName);
  if (!resolvedTemplateId) {
    const want = roleKeyGuess === 'deal_admin' ? 'sale_deal' : roleKeyGuess;
    const same = (templates || []).filter((t) => (t.role_key === 'deal_admin' ? 'sale_deal' : t.role_key) === want);
    resolvedTemplateId = (
      same.find((t) => companyId && String(t.company_id || '') === String(companyId))
      || same.find((t) => t.company_id == null)
      || same[0]
    )?.id || null;
  }
  if (!resolvedTemplateId) throw new Error('Chưa có template báo cáo ngày');
  const template = await getTemplateById(resolvedTemplateId);
  if (!template) throw new Error('Không tìm thấy template');

  if (!report) {
    const { data: created, error: insErr } = await supabase
      .from('crm_daily_reports')
      .insert({
        company_id: companyId,
        user_id: userId,
        template_id: resolvedTemplateId,
        report_date: reportDate,
        department_name: departmentName,
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
      auto_result: false,
      updated_at: now,
    }));
    if (seedLines.length) {
      const { error: seedErr } = await supabase.from('crm_daily_report_lines').insert(seedLines);
      if (seedErr) throw seedErr;
    }
  }

  const { data: lines, error: lineErr } = await supabase
    .from('crm_daily_report_lines')
    .select(LINE_FIELDS)
    .eq('report_id', report.id);
  if (lineErr) throw lineErr;
  return { report, template, lines: lines || [], roleKey: template.role_key || roleKeyGuess };
}

async function applySnapshotToLines({ report, lines, phase, metrics }) {
  const now = new Date().toISOString();
  const fillPlan = phase === 'plan';
  const fillResult = phase === 'result';
  let autoFilled = 0;
  for (const row of lines) {
    if (row.section !== 'work') continue;
    const key = row.metric_key || metricKeyFromLabel(row.label);
    const m = key ? metrics[key] : null;
    if (!m) continue;
    const patch = { metric_key: key || row.metric_key, auto_result: true, updated_at: now };
    if (fillPlan) {
      patch.plan_value = m.value;
      if (!row.plan_note || /^tự động/i.test(String(row.plan_note))) patch.plan_note = m.note || null;
    }
    if (fillResult) {
      patch.result_value = m.value;
      if (!row.result_note || /^tự động/i.test(String(row.result_note))) patch.result_note = m.note || null;
    }
    const { error } = await supabase.from('crm_daily_report_lines').update(patch).eq('id', row.id);
    if (error) throw error;
    autoFilled += 1;
  }

  const reportPatch = { updated_at: now };
  if (fillPlan) {
    reportPatch.plan_submitted_at = now;
    if (report.status !== 'result_submitted') reportPatch.status = 'plan_submitted';
  }
  if (fillResult) {
    reportPatch.result_submitted_at = now;
    reportPatch.status = 'result_submitted';
  }
  await supabase.from('crm_daily_reports').update(reportPatch).eq('id', report.id);
  return autoFilled;
}

async function snapshotUser({
  userId, reportDate, companyId, departmentName, userProfile, phase,
}) {
  const packed = await ensureReportForUser({
    userId, reportDate, companyId, departmentName, userProfile,
  });
  const untilIso = phase === 'result' ? resultUntilIso(reportDate) : null;
  const computed = await computeForUser(userId, reportDate, packed.roleKey, phase, {
    companyId,
    untilIso,
  });
  const metrics = computed.metrics || {};
  await upsertSnapshots({
    reportDate, companyId, userId, phase, metrics,
  });
  const autoFilled = await applySnapshotToLines({
    report: packed.report, lines: packed.lines, phase, metrics,
  });
  return {
    report: packed.report,
    role_key: packed.roleKey,
    auto_filled: autoFilled,
    skipped: false,
  };
}

async function runSnapshotBatch({
  reportDate = null,
  companyIds = null,
  phase = 'result',
  onProgress = null,
} = {}) {
  const date = reportDate || crmReportTodayYmdVn();
  const mode = phase === 'plan' ? 'plan' : 'result';
  const companies = await listCompanyIdsForSnapshot(companyIds);
  const results = [];

  for (const companyId of companies) {
    let users = [];
    try {
      users = await listCrmUsersForSnapshot(companyId);
    } catch (e) {
      results.push({ company_id: companyId, error: e.message || String(e) });
      continue;
    }
    for (const u of users) {
      try {
        const out = await snapshotUser({
          userId: u.id,
          reportDate: date,
          companyId,
          departmentName: u.department_name,
          userProfile: u,
          phase: mode,
        });
        const row = {
          company_id: companyId,
          user_id: u.id,
          name: u.full_name,
          role_key: out.role_key,
          phase: mode,
          auto_filled: out.auto_filled || 0,
          skipped: false,
        };
        results.push(row);
        if (typeof onProgress === 'function') onProgress(row);
      } catch (e) {
        const row = {
          company_id: companyId,
          user_id: u.id,
          name: u.full_name,
          phase: mode,
          error: e.message || String(e),
        };
        results.push(row);
        if (typeof onProgress === 'function') onProgress(row);
      }
    }
  }

  return {
    report_date: date,
    phase: mode,
    companies: companies.length,
    processed: results.length,
    ok: results.filter((r) => !r.error && !r.skipped).length,
    skipped: results.filter((r) => r.skipped).length,
    errors: results.filter((r) => r.error).length,
    results,
  };
}

module.exports = {
  resultUntilIso,
  snapKey,
  loadSnapshotsMap,
  snapshotUser,
  runSnapshotBatch,
  listCompanyIdsForSnapshot,
  listCrmUsersForSnapshot,
  REPORT_FIELDS,
  LINE_FIELDS,
};
