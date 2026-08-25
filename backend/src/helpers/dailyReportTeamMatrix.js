/**
 * Bảng tổng hợp I–IV (cột = nhân viên) — cùng nguồn với GET /crm/daily-reports/team/matrix
 * và tab "Tổng hợp theo từng mục I–IV" trên /crm/daily-reports.
 */
const { supabase } = require('../config/supabase');
const { metricKeyFromLabel, computeForUser } = require('./dailyReportMetrics');
const { guessRoleKey, isCrmSalesDept, looksLikeNonCrmUser } = require('./dailyReportStaffing');
const { loadAssignedTemplateIds } = require('./dailyReportUserTemplates');
const { crmReportAddDaysYmd } = require('./crmReportDateBounds');
const { loadSnapshotsMap, snapKey, resultUntilIso } = require('./dailyReportSnapshot');

const TEMPLATE_FIELDS = 'id, company_id, role_key, name, description, has_sharpen_section, is_active, created_at, updated_at';
const ITEM_FIELDS = 'id, template_id, section, label, order_index, unit_label, metric_key, created_at';
const REPORT_FIELDS =
  'id, company_id, user_id, template_id, report_date, department_name, status, plan_submitted_at, result_submitted_at, manager_note, created_at, updated_at';

function normalizeDailyRoleKey(roleKey) {
  const k = String(roleKey || '').trim();
  if (k === 'deal_admin') return 'sale_deal';
  return k || null;
}

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

function preferCompanyTemplates(rows, companyId) {
  const list = rows || [];
  if (!companyId) return list.filter((t) => t.company_id == null);
  const cid = String(companyId);
  const companyRows = list.filter((t) => t.company_id && String(t.company_id) === cid);
  const usedRoles = new Set(companyRows.map((t) => String(t.role_key)));
  const globalsKept = list.filter((t) => t.company_id == null && !usedRoles.has(String(t.role_key)));
  return [...companyRows, ...globalsKept].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'vi'));
}

async function listTemplates(companyId) {
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
  const rows = (data || []).map((t) => ({
    ...t,
    items: (t.items || []).slice().sort((a, b) => (a.order_index - b.order_index) || String(a.label).localeCompare(String(b.label))),
  }));
  return preferCompanyTemplates(rows, companyId);
}

/**
 * @param {{ date: string, companyId: string, departmentId?: string|null, roleKey?: string|null, q?: string }} opts
 */
async function loadTeamDailyReportMatrix({
  date,
  companyId,
  departmentId = null,
  roleKey = null,
  q = '',
  preview = false,
} = {}) {
  if (!companyId) throw new Error('Thiếu company_id');
  const resultDate = date;
  const qSearch = String(q || '').trim().toLowerCase();
  const templateRoleFilter = String(roleKey || '').trim() || null;

  const { data: depts, error: dErr } = await supabase
    .from('departments')
    .select('id, name, company_id')
    .eq('company_id', companyId);
  if (dErr) throw dErr;
  const deptIds = (depts || []).map((d) => d.id);
  const deptNameById = new Map((depts || []).map((d) => [String(d.id), d.name]));

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

  const assignedByUser = await loadAssignedTemplateIds(users.map((u) => u.id));

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
    if (assignedByUser.has(uid)) return true;
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
    const assignedId = assignedByUser.get(String(u.id));
    if (assignedId && templateById.has(assignedId)) {
      const t = templateById.get(assignedId);
      return { template_id: t.id, template_name: t.name, role_key: normalizeDailyRoleKey(t.role_key) || 'unknown' };
    }
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
      assigned_template_id: assignedByUser.get(String(u.id)) || null,
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

  const snapshotMap = await loadSnapshotsMap(date, companyId);
  if (preview) {
    const untilIso = resultUntilIso(date);
    for (const emp of employees) {
      const rk = emp.role_key === 'deal_admin' ? 'sale_deal' : emp.role_key;
      if (!rk || rk === 'none' || rk === 'unknown') continue;
      try {
        const [planPack, resultPack] = await Promise.all([
          computeForUser(emp.id, date, rk, 'plan', { companyId }),
          computeForUser(emp.id, date, rk, 'result', { companyId, untilIso }),
        ]);
        for (const [mk, m] of Object.entries(planPack.metrics || {})) {
          snapshotMap.set(snapKey(emp.id, 'plan', mk), {
            value: m.value,
            entity_ids: m.ids,
            note: m.note,
            source: m.source,
          });
        }
        for (const [mk, m] of Object.entries(resultPack.metrics || {})) {
          snapshotMap.set(snapKey(emp.id, 'result', mk), {
            value: m.value,
            entity_ids: m.ids,
            note: m.note,
            source: m.source,
          });
        }
      } catch (e) {
        console.warn('[daily-report-matrix] preview', emp.full_name || emp.id, e.message || e);
      }
    }
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

    if (section === 'work' && (valueField === 'result' || valueField === 'plan')) {
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
      if (valueField !== 'result' && valueField !== 'plan' && !emp.report_id) continue;
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
        const mk = line.metric_key || metricKeyFromLabel(line.label);
        if (valueField === 'plan') {
          const snap = mk ? snapshotMap.get(snapKey(emp.id, 'plan', mk)) : null;
          if (snap && snap.value != null) display = snap.value;
          else display = line.plan_value;
        } else if (valueField === 'result') {
          const snap = mk ? snapshotMap.get(snapKey(emp.id, 'result', mk)) : null;
          if (snap && snap.value != null) display = snap.value;
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
        title: `I. Kế hoạch ngày mới (${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}) — Deadline Quá hạn + Hôm nay`,
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

  return {
    date,
    result_date: resultDate,
    result_live: !!preview,
    plan_live: !!preview,
    snapshot: !preview && snapshotMap.size > 0,
    preview: !!preview,
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
    employees,
    sections: buildSections(employees),
  };
}

module.exports = {
  loadTeamDailyReportMatrix,
};
