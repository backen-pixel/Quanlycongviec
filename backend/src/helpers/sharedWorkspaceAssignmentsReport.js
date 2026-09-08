const { supabase } = require('../config/supabase');

const PAGE_SIZE = 1000;
const ID_CHUNK = 250;
const SOURCE_TYPES = ['customer_request', 'employee_error'];
const MODULES = new Set(['crm', 'production', 'logistics']);
const STATUSES = new Set(['pending', 'in_progress', 'completed', 'cancelled']);
const PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);

const REPORT_SELECT = `
  id, company_id, executor_company_id, lead_id, crm_task_id, assignment_module,
  task_source_type, employee_error_module, error_type_id, department_id, phat_sinh_kind,
  title, description, assignee_id, created_by_id, priority, status, deadline,
  created_at, updated_at, completed_at,
  assignee:users!crm_assignments_assignee_id_fkey(id, full_name, email, department_id),
  created_by:users!crm_assignments_created_by_id_fkey(id, full_name, email),
  company:companies!crm_assignments_company_id_fkey(id, name, short_name),
  executor_company:companies!crm_assignments_executor_company_id_fkey(id, name, short_name),
  department:departments!crm_assignments_department_id_fkey(id, name),
  lead:crm_leads!inner(id, code, title, type, project_id)
`;

function clean(value) {
  return String(value == null ? '' : value).trim();
}

function parseLimit(value, fallback = 50) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(200, Math.max(1, Math.floor(n))) : fallback;
}

function parseOffset(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function startOfDateIso(value) {
  const s = clean(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00+07:00` : null;
}

function endOfDateIso(value) {
  const s = clean(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T23:59:59.999+07:00` : null;
}

function applyScalarFilters(query, filters, fixedCompanyId) {
  let q = query
    .not('lead_id', 'is', null)
    .in('task_source_type', SOURCE_TYPES);

  const companyId = fixedCompanyId || clean(filters.company_id);
  if (companyId) q = q.or(`company_id.eq.${companyId},executor_company_id.eq.${companyId}`);

  const moduleKey = clean(filters.assignment_module).toLowerCase();
  if (MODULES.has(moduleKey)) q = q.eq('assignment_module', moduleKey);

  const sourceType = clean(filters.task_source_type).toLowerCase();
  if (SOURCE_TYPES.includes(sourceType)) q = q.eq('task_source_type', sourceType);

  const errorModule = clean(filters.employee_error_module).toLowerCase();
  if (MODULES.has(errorModule)) q = q.eq('employee_error_module', errorModule);

  const status = clean(filters.status).toLowerCase();
  if (STATUSES.has(status)) q = q.eq('status', status);

  const priority = clean(filters.priority).toLowerCase();
  if (PRIORITIES.has(priority)) q = q.eq('priority', priority);

  const departmentId = clean(filters.department_id);
  if (departmentId) q = q.eq('department_id', departmentId);

  const phatSinhKind = clean(filters.phat_sinh_kind);
  if (phatSinhKind) q = q.eq('phat_sinh_kind', phatSinhKind);

  const from = startOfDateIso(filters.date_from);
  const to = endOfDateIso(filters.date_to);
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lte('created_at', to);

  return q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });
}

async function fetchPaged(makeQuery) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await makeQuery().range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function fetchReportRows(filters, { visibleIds, fixedCompanyId }) {
  if (Array.isArray(visibleIds)) {
    if (!visibleIds.length) return [];
    const rows = [];
    for (let i = 0; i < visibleIds.length; i += ID_CHUNK) {
      const ids = visibleIds.slice(i, i + ID_CHUNK);
      const chunkRows = await fetchPaged(() => applyScalarFilters(
        supabase.from('crm_assignments').select(REPORT_SELECT).in('id', ids),
        filters,
        fixedCompanyId,
      ));
      rows.push(...chunkRows);
    }
    return rows;
  }
  return fetchPaged(() => applyScalarFilters(
    supabase.from('crm_assignments').select(REPORT_SELECT),
    filters,
    fixedCompanyId,
  ));
}

async function attachReportAssignees(rows) {
  if (!rows.length) return;
  const byAssignment = new Map();
  for (let i = 0; i < rows.length; i += ID_CHUNK) {
    const ids = rows.slice(i, i + ID_CHUNK).map((row) => row.id);
    let { data, error } = await supabase
      .from('crm_assignment_assignees')
      .select('assignment_id, user_id, assign_role, user:users(id, full_name, email, department_id)')
      .in('assignment_id', ids);
    if (error && /assign_role/.test(error.message || '')) {
      ({ data, error } = await supabase
        .from('crm_assignment_assignees')
        .select('assignment_id, user_id, user:users(id, full_name, email, department_id)')
        .in('assignment_id', ids));
    }
    if (error) throw error;
    for (const item of data || []) {
      const key = String(item.assignment_id);
      if (!byAssignment.has(key)) byAssignment.set(key, []);
      if (item.user) byAssignment.get(key).push({ ...item.user, assign_role: item.assign_role || null });
    }
  }
  for (const row of rows) {
    row.assignees = byAssignment.get(String(row.id)) || (row.assignee ? [row.assignee] : []);
  }
}

async function attachProjectLabels(rows) {
  const projectIds = [...new Set(rows.map((row) => row.lead?.project_id).filter(Boolean).map(String))];
  if (!projectIds.length) return;
  const map = new Map();
  for (let i = 0; i < projectIds.length; i += ID_CHUNK) {
    const { data, error } = await supabase
      .from('projects')
      .select('id, code, name')
      .in('id', projectIds.slice(i, i + ID_CHUNK));
    if (error) throw error;
    (data || []).forEach((project) => map.set(String(project.id), project));
  }
  rows.forEach((row) => {
    row.project = row.lead?.project_id ? (map.get(String(row.lead.project_id)) || null) : null;
  });
}

async function loadKindLabels() {
  const { data, error } = await supabase
    .from('shared_workspace_phat_sinh_kinds')
    .select('id, slug, name, company_id')
    .order('sort_order', { ascending: true });
  if (error) return {};
  const labels = {};
  for (const row of data || []) {
    if (row.id) labels[String(row.id)] = row.name;
    if (row.slug) labels[String(row.slug)] = row.name;
  }
  return labels;
}

function matchesClientFilters(row, filters) {
  const assigneeId = clean(filters.assignee_id);
  if (assigneeId && !(row.assignees || []).some((user) => String(user.id) === assigneeId)) return false;

  const q = clean(filters.q).toLocaleLowerCase('vi');
  if (!q) return true;
  const haystack = [
    row.title,
    row.description,
    row.lead?.code,
    row.lead?.title,
    row.project?.code,
    row.project?.name,
    row.created_by?.full_name,
    ...(row.assignees || []).flatMap((user) => [user.full_name, user.email]),
  ].filter(Boolean).join(' ').toLocaleLowerCase('vi');
  return haystack.includes(q);
}

function reportSummary(rows) {
  const now = Date.now();
  const summary = {
    total: rows.length,
    pending: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
    overdue: 0,
    customer_request: 0,
    employee_error: 0,
  };
  for (const row of rows) {
    if (Object.prototype.hasOwnProperty.call(summary, row.status)) summary[row.status] += 1;
    if (Object.prototype.hasOwnProperty.call(summary, row.task_source_type)) summary[row.task_source_type] += 1;
    if (row.status !== 'completed' && row.deadline && new Date(row.deadline).getTime() < now) summary.overdue += 1;
  }
  return summary;
}

async function listSharedWorkspaceAssignmentsReport(filters = {}, scope = {}) {
  const rows = await fetchReportRows(filters, scope);
  await Promise.all([attachReportAssignees(rows), attachProjectLabels(rows)]);
  const filtered = rows
    .filter((row) => matchesClientFilters(row, filters))
    .sort((a, b) => {
      const byCreated = String(b.created_at || '').localeCompare(String(a.created_at || ''));
      return byCreated || Number(b.id || 0) - Number(a.id || 0);
    });
  const kindLabels = await loadKindLabels();
  filtered.forEach((row) => {
    row.phat_sinh_kind_name = kindLabels[String(row.phat_sinh_kind || '')] || row.phat_sinh_kind || null;
  });

  const exportAll = clean(filters.export).toLowerCase() === '1';
  const offset = exportAll ? 0 : parseOffset(filters.offset);
  const limit = exportAll ? filtered.length : parseLimit(filters.limit);
  return {
    rows: exportAll ? filtered : filtered.slice(offset, offset + limit),
    summary: reportSummary(filtered),
    total: filtered.length,
    offset,
    limit,
    has_more: !exportAll && offset + limit < filtered.length,
  };
}

module.exports = {
  listSharedWorkspaceAssignmentsReport,
  matchesClientFilters,
  reportSummary,
};
