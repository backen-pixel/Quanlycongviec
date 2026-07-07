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

function buildUnifiedTasksBaseQuery(user, { assignee_id, company_id, date_from, date_to } = {}) {
  let q = supabase.from('unified_tasks_v').select('unified_id, task_kind, source, status, deadline, assignee_id');

  const effectiveCompany = company_id || (!isSystemAdmin(user) ? user?.company_id : null);
  if (effectiveCompany) q = q.eq('company_id', effectiveCompany);

  if (assignee_id) q = q.eq('assignee_id', assignee_id);
  if (date_from) q = q.gte('deadline', date_from);
  if (date_to) q = q.lte('deadline', date_to);

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
  if (opts.assignee_id) q = q.eq('assignee_id', opts.assignee_id);
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
  if (opts.assignee_id) q = q.eq('assignee_id', opts.assignee_id);
  if (opts.date_from) q = q.gte('deadline', opts.date_from);
  if (opts.date_to) q = q.lte('deadline', opts.date_to);

  if (!isManagerLike(user)) {
    q = applyEmployeeScope(q, user.userId || user.id);
  }

  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}

async function fetchUnifiedTasksSummary(user, opts = {}) {
  let q = buildUnifiedTasksBaseQuery(user, opts);
  q = q.limit(3000);
  const { data, error } = await q;
  if (error) throw error;

  const rows = data || [];
  const now = Date.now();
  const byModule = { crm: 0, production: 0, logistics: 0, assignment: 0, personal: 0, other: 0 };
  const byStatus = { pending: 0, in_progress: 0, done: 0, other: 0 };
  let open = 0;
  let overdue = 0;
  let done = 0;

  for (const t of rows) {
    const st = String(t.status || '').toLowerCase();
    const isDone = DONE_STATUSES.includes(st);
    if (isDone) {
      done += 1;
      byStatus.done += 1;
    } else {
      open += 1;
      if (st === 'pending' || st === '') byStatus.pending += 1;
      else if (st === 'in_progress' || st === 'review' || st === 'blocked') byStatus.in_progress += 1;
      else byStatus.other += 1;

      if (t.deadline && new Date(t.deadline).getTime() < now) overdue += 1;
    }

    const mod = resolveModuleKey(t);
    if (isDone) continue;
    if (byModule[mod] != null) byModule[mod] += 1;
    else byModule.other += 1;
  }

  return {
    total: rows.length,
    open,
    overdue,
    done,
    by_module: byModule,
    by_status: byStatus,
  };
}

module.exports = {
  DONE_STATUSES,
  isManagerLike,
  applyEmployeeScope,
  applyOpenOnlyFilter,
  resolveModuleKey,
  buildUnifiedTasksBaseQuery,
  countUnifiedOpenTasks,
  countUnifiedOverdueTasks,
  fetchUnifiedTasksSummary,
};
