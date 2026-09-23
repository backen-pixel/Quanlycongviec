/**
 * Truy vấn chung cho unified_tasks_v — dùng bởi /api/work-tasks và heartbeat badge.
 */
const { supabase } = require('../config/supabase');
const { isAdminLike, isSystemAdmin } = require('./adminRole');

const DONE_STATUSES = ['done', 'completed', 'cancelled'];

function isManagerLike(user) {
  const role = String(user?.role || '').toLowerCase();
  return isAdminLike(user)
    || role === 'manager'
    || role === 'production_staff'
    || role === 'production_admin'
    || role === 'crm_production_staff'
    || role === 'crm_production_admin';
}

function applyEmployeeScope(q, userId) {
  return q.or(`assignee_id.eq.${userId},created_by_id.eq.${userId}`);
}

function applyOpenOnlyFilter(q) {
  return q.not('status', 'in', `(${DONE_STATUSES.join(',')})`);
}

const ASSIGNEE_LEAD_IDS_MAX = 500;

/** Lead/deal mà NV là phụ trách (assigned_to hoặc lead_owner_id). */
async function fetchLeadIdsForAssignee(assigneeId, companyId, maxIds = ASSIGNEE_LEAD_IDS_MAX, tenantCompanyIds = null) {
  if (!assigneeId || tenantCompanyIds?.length === 0) return [];
  let q = supabase.from('crm_leads')
    .select('id')
    .or(`assigned_to.eq.${assigneeId},lead_owner_id.eq.${assigneeId}`);
  if (companyId) q = q.eq('company_id', companyId);
  if (tenantCompanyIds !== null) q = q.in('company_id', tenantCompanyIds);
  q = q.limit(maxIds);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map((r) => r.id);
}

/** Lead/deal options cho dropdown lọc — theo NV phụ trách. */
async function fetchLeadOptionsForAssignee(assigneeId, companyId, maxRows = 300) {
  if (!assigneeId) return [];
  let q = supabase.from('crm_leads')
    .select('id, title, type, code')
    .or(`assigned_to.eq.${assigneeId},lead_owner_id.eq.${assigneeId}`)
    .order('updated_at', { ascending: false })
    .limit(maxRows);
  if (companyId) q = q.eq('company_id', companyId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id,
    title: r.title || r.code || r.id,
    type: r.type || 'lead',
    code: r.code || '',
  }));
}

function applyAssigneeFilter(q, assigneeId, leadIds = []) {
  if (!assigneeId) return q;
  const ids = (leadIds || []).filter(Boolean);
  if (ids.length > 0) {
    return q.or(`assignee_id.eq.${assigneeId},lead_id.in.(${ids.join(',')})`);
  }
  return q.eq('assignee_id', assigneeId);
}

function resolveModuleKey(task) {
  const kind = String(task?.task_kind || '');
  const source = String(task?.source || '');
  if (kind === 'CRM-Deal' || kind === 'CRM-Lead' || source === 'crm_task') return 'crm';
  if (kind === 'SX' || kind === 'Dự án') return 'production';
  if (kind === 'VC') return 'logistics';
  if (kind === 'Giao việc' || source === 'crm_assignment') return 'assignment';
  if (kind === 'Cá nhân') return 'personal';
  return 'other';
}

function buildUnifiedTasksBaseQuery(user, {
  assignee_id, company_id, date_from, date_to, lead_id, assignee_lead_ids,
  status, task_kind, q: searchQ, open_only,
} = {}, selectOptions = {}) {
  let q = supabase.from('unified_tasks_v').select('unified_id, task_kind, source, status, deadline, assignee_id, lead_id', selectOptions);

  const effectiveCompany = company_id || (!isSystemAdmin(user) ? user?.company_id : null);
  if (effectiveCompany) q = q.eq('company_id', effectiveCompany);

  if (lead_id) {
    q = q.eq('lead_id', lead_id);
  } else if (assignee_id) {
    q = applyAssigneeFilter(q, assignee_id, assignee_lead_ids);
  }
  if (status) q = q.eq('status', status);
  if (task_kind) q = q.eq('task_kind', task_kind);
  const search = String(searchQ || '').trim();
  if (search) q = q.ilike('title', `%${search}%`);
  if (date_from) q = q.gte('deadline', date_from);
  if (date_to) q = q.lte('deadline', date_to);
  if (open_only === '1' || open_only === true || open_only === 'true') q = applyOpenOnlyFilter(q);

  if (!isManagerLike(user)) {
    q = applyEmployeeScope(q, user.userId || user.id);
  }

  return q;
}

async function countUnifiedOpenTasks(user, opts = {}) {
  let q = supabase.from('unified_tasks_v').select('unified_id', { count: 'exact', head: true });
  q = applyOpenOnlyFilter(q);

  const effectiveCompany = opts.company_id || (!isSystemAdmin(user) ? user?.company_id : null);
  if (effectiveCompany) q = q.eq('company_id', effectiveCompany);
  if (opts.lead_id) {
    q = q.eq('lead_id', opts.lead_id);
  } else if (opts.assignee_id) {
    q = applyAssigneeFilter(q, opts.assignee_id, opts.assignee_lead_ids);
  }
  if (opts.date_from) q = q.gte('deadline', opts.date_from);
  if (opts.date_to) q = q.lte('deadline', opts.date_to);

  if (!isManagerLike(user)) {
    q = applyEmployeeScope(q, user.userId || user.id);
  }

  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}

async function countUnifiedOverdueTasks(user, opts = {}) {
  let q = supabase.from('unified_tasks_v').select('unified_id', { count: 'exact', head: true });
  q = applyOpenOnlyFilter(q);
  q = q.lt('deadline', new Date().toISOString());
  q = q.not('deadline', 'is', null);

  const effectiveCompany = opts.company_id || (!isSystemAdmin(user) ? user?.company_id : null);
  if (effectiveCompany) q = q.eq('company_id', effectiveCompany);
  if (opts.lead_id) {
    q = q.eq('lead_id', opts.lead_id);
  } else if (opts.assignee_id) {
    q = applyAssigneeFilter(q, opts.assignee_id, opts.assignee_lead_ids);
  }
  if (opts.date_from) q = q.gte('deadline', opts.date_from);
  if (opts.date_to) q = q.lte('deadline', opts.date_to);

  if (!isManagerLike(user)) {
    q = applyEmployeeScope(q, user.userId || user.id);
  }

  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}

async function resolveAssigneeLeadScope(assignee_id, company_id, tenantCompanyIds = null) {
  if (!assignee_id) return [];
  return fetchLeadIdsForAssignee(assignee_id, company_id || null, ASSIGNEE_LEAD_IDS_MAX, tenantCompanyIds);
}

// Only auth's verified request context may grant a tenant scope. Keep it
// separate from client filters, and retain legacy/platform/system semantics.
function summaryTenantCompanyIds(user, tenantContext) {
  const role = String(user?.role || '').trim().toLowerCase();
  const needsTenantScope = !!user?.tenant_id && role !== 'platform_admin' && role !== 'system';
  const deny = () => {
    const error = new Error('Chưa xác minh được phạm vi dữ liệu hệ sinh thái');
    error.statusCode = 403;
    error.code = 'tenant_scope_unverified';
    throw error;
  };
  if (tenantContext?.enforced !== true) {
    if (needsTenantScope) deny();
    return null;
  }
  if (!user?.tenant_id || String(tenantContext.tenantId || '') !== String(user.tenant_id)
    || !Array.isArray(tenantContext.companyIds)
    || tenantContext.companyIds.some((id) => typeof id !== 'string' || !id.trim())) {
    deny();
  }
  return [...new Set(tenantContext.companyIds)];
}

async function fetchUnifiedTasksSummary(user, opts = {}, tenantContext = null) {
  const tenantCompanyIds = summaryTenantCompanyIds(user, tenantContext);
  const emptyTenant = tenantCompanyIds?.length === 0;
  const assignee_lead_ids = opts.lead_id
    ? []
    : await resolveAssigneeLeadScope(opts.assignee_id, opts.company_id || (!isSystemAdmin(user) ? user?.company_id : null), tenantCompanyIds);
  let result = { data: [], error: null, count: 0 };
  if (!emptyTenant) {
    let q = buildUnifiedTasksBaseQuery(user, { ...opts, assignee_lead_ids }, { count: 'exact' });
    if (tenantCompanyIds !== null) q = q.in('company_id', tenantCompanyIds);
    result = await q.limit(3000);
  }
  const { data, error, count } = result;
  if (error) throw error;

  const rows = data || [];
  const now = Date.now();
  const byModule = { crm: 0, production: 0, logistics: 0, assignment: 0, personal: 0, other: 0 };
  const byStatus = { pending: 0, in_progress: 0, done: 0, cancelled: 0, other: 0 };
  let open = 0;
  let overdue = 0;
  let done = 0;
  let cancelled = 0;
  const countOpenOnly = opts.open_only === '1' || opts.open_only === true || opts.open_only === 'true';

  for (const t of rows) {
    const st = String(t.status || '').toLowerCase();
    const isDone = DONE_STATUSES.includes(st);
    if (st === 'cancelled') {
      cancelled += 1;
      byStatus.cancelled += 1;
    } else if (isDone) {
      done += 1;
      byStatus.done += 1;
    } else {
      open += 1;
      if (st === 'pending' || st === '') byStatus.pending += 1;
      else if (st === 'in_progress' || st === 'review' || st === 'blocked') byStatus.in_progress += 1;
      else byStatus.other += 1;

      if (t.deadline && new Date(t.deadline).getTime() < now) overdue += 1;
    }

    if (countOpenOnly && isDone) continue;
    const mod = resolveModuleKey(t);
    if (byModule[mod] != null) byModule[mod] += 1;
    else byModule.other += 1;
  }

  // Counts describe returned view rows, not distinct business tasks. A source
  // row limit or a capped assignee scope must never imply full coverage.
  const hasExactRowCount = Number.isSafeInteger(count) && count >= rows.length;
  // With no authorized companies the accessible set is provably empty; no
  // assignee lookup was performed and there is no truncated lead scope.
  const usesAssigneeLeadScope = !emptyTenant && !opts.lead_id && !!opts.assignee_id;
  const assigneeScopeMayBeCapped = usesAssigneeLeadScope
    && assignee_lead_ids.length >= ASSIGNEE_LEAD_IDS_MAX;
  const viewRowsMayBeCapped = hasExactRowCount ? count > rows.length : rows.length >= 3000;
  // The lead lookup has no exact count; even fewer than 500 IDs may have
  // been limited by the server. Only the explicit lead filter bypasses it.
  const coverage = assigneeScopeMayBeCapped || viewRowsMayBeCapped ? 'PARTIAL'
    : hasExactRowCount && !usesAssigneeLeadScope ? 'EXACT' : 'UNKNOWN';
  return {
    total: rows.length,
    open,
    overdue,
    done,
    cancelled,
    closed: done + cancelled,
    coverage,
    count_basis: 'UNIFIED_VIEW_ROWS',
    count_relation: coverage === 'EXACT' ? 'eq' : coverage === 'PARTIAL' ? 'gte' : 'unknown',
    source_total_rows: hasExactRowCount ? count : null,
    assignee_scope_complete: assigneeScopeMayBeCapped ? false : null,
    by_module: byModule,
    by_status: byStatus,
  };
}

module.exports = {
  DONE_STATUSES,
  isManagerLike,
  applyEmployeeScope,
  applyOpenOnlyFilter,
  applyAssigneeFilter,
  resolveModuleKey,
  fetchLeadIdsForAssignee,
  fetchLeadOptionsForAssignee,
  resolveAssigneeLeadScope,
  buildUnifiedTasksBaseQuery,
  countUnifiedOpenTasks,
  countUnifiedOverdueTasks,
  fetchUnifiedTasksSummary,
};
