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
  return q.or(`status.is.null,status.not.in.(${DONE_STATUSES.join(',')})`);
}

function isOpenOnly(value) {
  return value === '1' || value === true || value === 'true';
}

function effectiveCompanyId(user, requestedCompanyId) {
  return requestedCompanyId || (!isSystemAdmin(user) ? user?.company_id : null) || null;
}

const ASSIGNEE_LEAD_IDS_MAX = 500;

/** Lead/deal mà NV là phụ trách (assigned_to hoặc lead_owner_id). */
async function fetchLeadIdsForAssignee(assigneeId, companyId, maxIds = ASSIGNEE_LEAD_IDS_MAX, companyIds = []) {
  if (!assigneeId) return [];
  let q = supabase.from('crm_leads')
    .select('id')
    .or(`assigned_to.eq.${assigneeId},lead_owner_id.eq.${assigneeId}`)
    .limit(maxIds);
  if (companyId) q = q.eq('company_id', companyId);
  else if (Array.isArray(companyIds) && companyIds.length) q = q.in('company_id', companyIds);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map((r) => r.id);
}

/** Lead/deal options cho dropdown lọc — theo NV phụ trách. */
async function fetchLeadOptionsForAssignee(assigneeId, companyId, maxRows = 300, companyIds = []) {
  if (!assigneeId) return [];
  let q = supabase.from('crm_leads')
    .select('id, title, type, code')
    .or(`assigned_to.eq.${assigneeId},lead_owner_id.eq.${assigneeId}`)
    .order('updated_at', { ascending: false })
    .limit(maxRows);
  if (companyId) q = q.eq('company_id', companyId);
  else if (Array.isArray(companyIds) && companyIds.length) q = q.in('company_id', companyIds);
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

function applyUnifiedTasksBaseFilters(query, user, {
  assignee_id, company_id, company_ids, date_from, date_to, lead_id, assignee_lead_ids,
  status, task_kind, q: searchQ, open_only,
} = {}) {
  let q = query;

  const effectiveCompany = effectiveCompanyId(user, company_id);
  if (effectiveCompany) q = q.eq('company_id', effectiveCompany);
  else if (Array.isArray(company_ids) && company_ids.length) q = q.in('company_id', company_ids);

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
  if (isOpenOnly(open_only)) q = applyOpenOnlyFilter(q);

  if (!isManagerLike(user)) {
    q = applyEmployeeScope(q, user.userId || user.id);
  }

  return q;
}

function buildUnifiedTasksBaseQuery(user, opts = {}) {
  const query = supabase.from('unified_tasks_v')
    .select('unified_id, task_kind, source, status, deadline, assignee_id, lead_id');
  return applyUnifiedTasksBaseFilters(query, user, opts);
}

function buildUnifiedTasksCountQuery(user, opts = {}) {
  const query = supabase.from('unified_tasks_v')
    .select('unified_id', { count: 'exact', head: true });
  return applyUnifiedTasksBaseFilters(query, user, opts);
}

async function prepareUnifiedTaskOptions(user, opts = {}) {
  const companyId = effectiveCompanyId(user, opts.company_id);
  const assigneeLeadIds = opts.lead_id
    ? []
    : await resolveAssigneeLeadScope(opts.assignee_id, companyId, opts.company_ids);
  return { ...opts, company_id: companyId, assignee_lead_ids: assigneeLeadIds };
}

async function runExactCount(query) {
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

async function countUnifiedOpenTasks(user, opts = {}) {
  const prepared = await prepareUnifiedTaskOptions(user, opts);
  let q = buildUnifiedTasksCountQuery(user, prepared);
  q = applyOpenOnlyFilter(q);
  return runExactCount(q);
}

async function countUnifiedOverdueTasks(user, opts = {}) {
  const prepared = await prepareUnifiedTaskOptions(user, opts);
  let q = buildUnifiedTasksCountQuery(user, prepared);
  q = applyOpenOnlyFilter(q);
  q = q.lt('deadline', new Date().toISOString());
  q = q.not('deadline', 'is', null);
  return runExactCount(q);
}

async function resolveAssigneeLeadScope(assignee_id, company_id, company_ids = []) {
  if (!assignee_id) return [];
  return fetchLeadIdsForAssignee(assignee_id, company_id || null, ASSIGNEE_LEAD_IDS_MAX, company_ids);
}

function buildUnifiedTasksMetricPayload(counts, contract = {}) {
  const total = Number(counts.total || 0);
  const done = Number(counts.done || 0);
  const pending = Number(counts.pending || 0);
  const inProgress = Number(counts.inProgress || 0);
  const crm = Number(counts.crm || 0);
  const production = Number(counts.production || 0);
  const logistics = Number(counts.logistics || 0);
  const assignment = Number(counts.assignment || 0);
  const personal = Number(counts.personal || 0);
  const byModuleKnown = crm + production + logistics + assignment + personal;
  const byStatusKnown = pending + inProgress + done;

  return {
    total,
    open: Math.max(0, total - done),
    overdue: Number(counts.overdue || 0),
    done,
    by_module: {
      crm,
      production,
      logistics,
      assignment,
      personal,
      other: Math.max(0, total - byModuleKnown),
    },
    by_status: {
      pending,
      in_progress: inProgress,
      done,
      other: Math.max(0, total - byStatusKnown),
    },
    metric_contract: contract,
  };
}

async function fetchUnifiedTasksSummary(user, opts = {}) {
  const prepared = await prepareUnifiedTaskOptions(user, opts);
  const countWith = (refine) => {
    let query = buildUnifiedTasksCountQuery(user, prepared);
    if (refine) query = refine(query);
    return runExactCount(query);
  };
  const countKind = (kinds) => countWith((query) => query.in('task_kind', kinds));

  const [
    total, overdue, done, pending, inProgress,
    crm, production, logistics, assignment, personal,
  ] = await Promise.all([
    countWith(),
    countWith((query) => applyOpenOnlyFilter(query)
      .not('deadline', 'is', null)
      .lt('deadline', new Date().toISOString())),
    countWith((query) => query.in('status', DONE_STATUSES)),
    countWith((query) => query.or('status.is.null,status.eq.pending')),
    countWith((query) => query.in('status', ['in_progress', 'review', 'blocked'])),
    countKind(['CRM-Deal', 'CRM-Lead']),
    countKind(['SX', 'Dự án']),
    countKind(['VC']),
    countKind(['Giao việc']),
    countKind(['Cá nhân']),
  ]);

  return buildUnifiedTasksMetricPayload({
    total, overdue, done, pending, inProgress,
    crm, production, logistics, assignment, personal,
  }, {
      version: 'work_kpi_v1',
      source: 'unified_tasks_v',
      company_id: prepared.company_id,
      visibility: isManagerLike(user) ? 'company' : 'employee',
      terminal_statuses: DONE_STATUSES,
      generated_at: new Date().toISOString(),
  });
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
  effectiveCompanyId,
  applyUnifiedTasksBaseFilters,
  buildUnifiedTasksBaseQuery,
  buildUnifiedTasksCountQuery,
  countUnifiedOpenTasks,
  countUnifiedOverdueTasks,
  buildUnifiedTasksMetricPayload,
  fetchUnifiedTasksSummary,
};
