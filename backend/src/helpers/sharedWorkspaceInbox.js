/**
 * Inbox «Công việc chung» trên trang Giao việc — crm_tasks không gian chung theo module.
 */
const { supabase } = require('../config/supabase');
const { isAdminLike } = require('./adminRole');
const { hasCrossCompanyDelegation } = require('./crossCompanyWorkspace');

const MODULES = new Set(['crm', 'production', 'logistics']);

function normalizeAssignModule(raw) {
  const m = String(raw || 'crm').trim().toLowerCase();
  return MODULES.has(m) ? m : 'crm';
}

function sharedSlugsForModule(mod) {
  if (mod === 'production') return ['sx_shared'];
  if (mod === 'logistics') return ['vc_shared'];
  return ['shared_workspace'];
}

function modulePrefix(mod) {
  if (mod === 'production') return 'sx_';
  if (mod === 'logistics') return 'vc_';
  return null;
}

function taskMatchesModule(task, mod) {
  const slug = String(task?.stage_slug || '').toLowerCase();
  if (sharedSlugsForModule(mod).includes(slug)) return true;
  const prefix = modulePrefix(mod);
  if (prefix) return slug.startsWith(prefix) && !!task?.executor_company_id;
  // CRM: shared_workspace hoặc không thuộc sx_/vc_
  if (slug.startsWith('sx_') || slug.startsWith('vc_')) return false;
  return !!task?.executor_company_id || slug === 'shared_workspace';
}

function buildDeepLink(task, mod) {
  const lead = task?.lead;
  if (!lead?.id) return null;
  const qs = new URLSearchParams();
  qs.set('tab', 'shared-workspace');
  if (task.id) qs.set('crm_task', String(task.id));

  if (mod === 'production' && lead.project_id) {
    if (String(lead.id) !== String(lead.project_id)) qs.set('deal_lead', String(lead.id));
    return `/sx/projects/${lead.project_id}?${qs.toString()}`;
  }
  if (mod === 'logistics' && lead.project_id) {
    if (String(lead.id) !== String(lead.project_id)) qs.set('deal_lead', String(lead.id));
    return `/vc/projects/${lead.project_id}?${qs.toString()}`;
  }
  return `/crm/leads/${lead.id}?${qs.toString()}`;
}

async function loadProjectOwnerMap(projectIds) {
  const ids = [...new Set((projectIds || []).filter(Boolean).map(String))];
  if (!ids.length) return new Map();
  const map = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data, error } = await supabase
      .from('projects')
      .select('id, company_id, code, name')
      .in('id', chunk);
    if (error) throw error;
    for (const p of data || []) map.set(String(p.id), p);
  }
  return map;
}

async function loadCompanyNameMap(companyIds) {
  const ids = [...new Set((companyIds || []).filter(Boolean).map(String))];
  if (!ids.length) return new Map();
  const map = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data, error } = await supabase
      .from('companies')
      .select('id, name, short_name')
      .in('id', chunk);
    if (error) throw error;
    for (const c of data || []) {
      map.set(String(c.id), c.short_name || c.name || c.id);
    }
  }
  return map;
}

async function userIsAssigneeOnTasks(uid, taskIds) {
  if (!uid || !taskIds?.length) return new Set();
  const set = new Set();
  for (let i = 0; i < taskIds.length; i += 200) {
    const chunk = taskIds.slice(i, i + 200);
    const [{ data: direct }, { data: via }] = await Promise.all([
      supabase.from('crm_tasks').select('id').in('id', chunk).eq('assignee_id', uid),
      supabase.from('crm_task_assignees').select('task_id').in('task_id', chunk).eq('user_id', uid),
    ]);
    (direct || []).forEach((r) => set.add(String(r.id)));
    (via || []).forEach((r) => set.add(String(r.task_id)));
  }
  return set;
}

/**
 * @returns {{ tasks: object[] }}
 */
async function listSharedWorkspaceInboxTasks(req, { assignmentModule } = {}) {
  const mod = normalizeAssignModule(assignmentModule);
  const uid = req.user?.userId || req.user?.id;
  const userCompanyId = req.user?.company_id ? String(req.user.company_id) : null;
  const admin = isAdminLike(req.user);
  const slugs = sharedSlugsForModule(mod);

  let q = supabase
    .from('crm_tasks')
    .select(`
      id, title, status, deadline, priority, stage_slug, lead_id, assignee_id,
      executor_company_id, task_source_type, employee_error_module, created_at, updated_at, checklist,
      assignee:users!crm_tasks_assignee_id_fkey(id, full_name, avatar),
      lead:crm_leads!crm_tasks_lead_id_fkey(id, code, title, type, company_id, project_id)
    `)
    .in('stage_slug', slugs)
    .order('updated_at', { ascending: false })
    .limit(250);

  // Cũng lấy task giao chéo theo prefix module (không gian chung trên deal)
  const prefix = modulePrefix(mod);
  let { data: rows, error } = await q;
  if (error && /task_source_type|employee_error_module/.test(error.message || '')) {
    ({ data: rows, error } = await supabase
      .from('crm_tasks')
      .select(`
        id, title, status, deadline, priority, stage_slug, lead_id, assignee_id,
        executor_company_id, created_at, updated_at, checklist,
        assignee:users!crm_tasks_assignee_id_fkey(id, full_name, avatar),
        lead:crm_leads!crm_tasks_lead_id_fkey(id, code, title, type, company_id, project_id)
      `)
      .in('stage_slug', slugs)
      .order('updated_at', { ascending: false })
      .limit(250));
  }
  if (error) throw error;

  let extra = [];
  if (prefix) {
    let eq = supabase
      .from('crm_tasks')
      .select(`
        id, title, status, deadline, priority, stage_slug, lead_id, assignee_id,
        executor_company_id, task_source_type, employee_error_module, created_at, updated_at, checklist,
        assignee:users!crm_tasks_assignee_id_fkey(id, full_name, avatar),
        lead:crm_leads!crm_tasks_lead_id_fkey(id, code, title, type, company_id, project_id)
      `)
      .like('stage_slug', `${prefix}%`)
      .not('executor_company_id', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(250);
    let { data: more, error: moreErr } = await eq;
    if (moreErr && /task_source_type|employee_error_module/.test(moreErr.message || '')) {
      ({ data: more, error: moreErr } = await supabase
        .from('crm_tasks')
        .select(`
          id, title, status, deadline, priority, stage_slug, lead_id, assignee_id,
          executor_company_id, created_at, updated_at, checklist,
          assignee:users!crm_tasks_assignee_id_fkey(id, full_name, avatar),
          lead:crm_leads!crm_tasks_lead_id_fkey(id, code, title, type, company_id, project_id)
        `)
        .like('stage_slug', `${prefix}%`)
        .not('executor_company_id', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(250));
    }
    if (!moreErr) extra = more || [];
  }

  const byId = new Map();
  for (const t of [...(rows || []), ...extra]) {
    if (!t?.id) continue;
    if (!taskMatchesModule(t, mod)) continue;
    byId.set(String(t.id), t);
  }
  const candidates = [...byId.values()];

  const projectMap = await loadProjectOwnerMap(candidates.map((t) => t.lead?.project_id));
  const companyIds = [];
  for (const t of candidates) {
    if (t.executor_company_id) companyIds.push(t.executor_company_id);
    if (t.lead?.company_id) companyIds.push(t.lead.company_id);
    const proj = t.lead?.project_id ? projectMap.get(String(t.lead.project_id)) : null;
    if (proj?.company_id) companyIds.push(proj.company_id);
  }
  const companyNames = await loadCompanyNameMap(companyIds);
  const assigneeSet = await userIsAssigneeOnTasks(uid, candidates.map((t) => t.id));

  const visible = candidates.filter((t) => {
    const proj = t.lead?.project_id ? projectMap.get(String(t.lead.project_id)) : null;
    const ownerCompanyId = proj?.company_id || t.lead?.company_id || null;
    if (!hasCrossCompanyDelegation(t, ownerCompanyId)
      && !sharedSlugsForModule(mod).includes(String(t.stage_slug || '').toLowerCase())) {
      return false;
    }
    if (admin) return true;
    if (uid && assigneeSet.has(String(t.id))) return true;
    if (userCompanyId && t.executor_company_id && String(t.executor_company_id) === userCompanyId) return true;
    if (userCompanyId && ownerCompanyId && String(ownerCompanyId) === userCompanyId) return true;
    return false;
  });

  const tasks = visible.map((t) => {
    const proj = t.lead?.project_id ? projectMap.get(String(t.lead.project_id)) : null;
    const ownerCompanyId = proj?.company_id || t.lead?.company_id || null;
    const execId = t.executor_company_id ? String(t.executor_company_id) : null;
    return {
      id: t.id,
      title: t.title,
      status: t.status,
      deadline: t.deadline,
      priority: t.priority,
      stage_slug: t.stage_slug,
      lead_id: t.lead_id,
      assignee_id: t.assignee_id,
      assignee: t.assignee || null,
      executor_company_id: execId,
      executor_company_name: execId ? (companyNames.get(execId) || null) : null,
      owner_company_id: ownerCompanyId ? String(ownerCompanyId) : null,
      owner_company_name: ownerCompanyId ? (companyNames.get(String(ownerCompanyId)) || null) : null,
      task_source_type: t.task_source_type || null,
      employee_error_module: t.employee_error_module || null,
      created_at: t.created_at,
      updated_at: t.updated_at,
      lead: t.lead ? {
        id: t.lead.id,
        code: t.lead.code,
        title: t.lead.title,
        type: t.lead.type,
        company_id: t.lead.company_id,
        project_id: t.lead.project_id,
        project_code: proj?.code || null,
        project_name: proj?.name || null,
      } : null,
      href: buildDeepLink(t, mod),
      assignment_module: mod,
    };
  });

  tasks.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  return { tasks, assignment_module: mod };
}

module.exports = {
  normalizeAssignModule,
  listSharedWorkspaceInboxTasks,
  sharedSlugsForModule,
};
