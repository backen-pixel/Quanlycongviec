/**
 * Inbox trang Giao việc:
 * - «Công việc chung» — crm_tasks không gian chung (ủy thác chéo công ty)
 * - «Không gian chung» — crm_tasks giao trong deal (phạm vi own), nhóm theo deal
 *   CRM: nhiệm vụ deal (không phải slug xưởng sx_ / vc_)
 *   SX: slug sx_ + cột CRM sync_role sx_production / san_xuat
 *   VC/LD: slug vc_ / ld_ + cột CRM vc_delivery / vc_installation / vc_customer_care
 */
const { supabase } = require('../config/supabase');
const { isAdminLike } = require('./adminRole');
const { hasCrossCompanyDelegation } = require('./crossCompanyWorkspace');

const MODULES = new Set(['crm', 'production', 'logistics']);

const SX_PRIVATE_SYNC_ROLES = new Set(['sx_production', 'sx_completed']);
const VC_PRIVATE_SYNC_ROLES = new Set(['vc_delivery', 'vc_installation', 'vc_customer_care']);

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

function buildDeepLink(task, mod, { tab = 'shared-workspace' } = {}) {
  const lead = task?.lead;
  if (!lead?.id) return null;
  const qs = new URLSearchParams();
  qs.set('tab', tab);
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

function taskSyncRole(task) {
  return String(
    task?.stage?.sync_role
    || task?.pipeline_stage?.sync_role
    || '',
  ).trim();
}

/** Nhiệm vụ thuộc module trang Giao việc, phạm vi own (không phải slug không gian chung). */
function taskMatchesPrivateModule(task, mod) {
  const slug = String(task?.stage_slug || '').toLowerCase();
  if (sharedSlugsForModule(mod).includes(slug)) return false;
  const syncRole = taskSyncRole(task);

  if (mod === 'production') {
    if (slug.startsWith('sx_')) return true;
    if (SX_PRIVATE_SYNC_ROLES.has(syncRole)) return true;
    // CRM cột Sản xuất (slug pl_san_xuat_… / pl_ang_san_xuat_…) — tránh nhầm «kế hoạch sản xuất»
    if (/san_xuat/.test(slug) && !/ke_hoach|thiet_ke|ve_len/.test(slug)) return true;
    return false;
  }
  if (mod === 'logistics') {
    if (slug.startsWith('vc_') || slug.startsWith('ld_')) return true;
    if (VC_PRIVATE_SYNC_ROLES.has(syncRole)) return true;
    // CRM VC/LD: vận chuyển/lắp đặt, đang lắp đặt, chăm sóc, hoá đơn, deal_shipping
    if (/van_chuyen|lap_at|lap_dat|cham_soc|hoa_don|deal_shipping|shipping/.test(slug)) return true;
    return false;
  }
  if (slug.startsWith('sx_') || slug.startsWith('vc_') || slug.startsWith('ld_')) return false;
  return true;
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

const PRIVATE_TASK_SELECT = `
  id, title, status, deadline, priority, stage_slug, lead_id, assignee_id, pipeline_stage_id,
  executor_company_id, task_source_type, employee_error_module, created_at, updated_at, checklist,
  assignee:users!crm_tasks_assignee_id_fkey(id, full_name, avatar),
  lead:crm_leads!crm_tasks_lead_id_fkey(id, code, title, type, company_id, project_id),
  stage:crm_pipeline_stages!crm_tasks_pipeline_stage_id_fkey(id, name, sync_role)
`;

const PRIVATE_TASK_SELECT_FALLBACK = `
  id, title, status, deadline, priority, stage_slug, lead_id, assignee_id, pipeline_stage_id,
  executor_company_id, created_at, updated_at, checklist,
  assignee:users!crm_tasks_assignee_id_fkey(id, full_name, avatar),
  lead:crm_leads!crm_tasks_lead_id_fkey(id, code, title, type, company_id, project_id),
  stage:crm_pipeline_stages!crm_tasks_pipeline_stage_id_fkey(id, name, sync_role)
`;

/**
 * Inbox «Không gian chung» — nhiệm vụ deal được giao cho user (own), nhóm theo deal.
 * @returns {{ tasks: object[], groups: object[], assignment_module: string }}
 */
async function listPrivateDealInboxTasks(req, { assignmentModule } = {}) {
  const mod = normalizeAssignModule(assignmentModule);
  const uid = req.user?.userId || req.user?.id;
  if (!uid) return { tasks: [], groups: [], assignment_module: mod };

  const [{ data: viaRows }, { data: directRows }] = await Promise.all([
    supabase.from('crm_task_assignees').select('task_id').eq('user_id', uid).limit(800),
    supabase.from('crm_tasks').select('id').eq('assignee_id', uid).not('lead_id', 'is', null).limit(800),
  ]);

  const taskIdSet = new Set();
  (viaRows || []).forEach((r) => { if (r?.task_id) taskIdSet.add(String(r.task_id)); });
  (directRows || []).forEach((r) => { if (r?.id) taskIdSet.add(String(r.id)); });
  const taskIds = [...taskIdSet];
  if (!taskIds.length) return { tasks: [], groups: [], assignment_module: mod };

  const candidates = [];
  for (let i = 0; i < taskIds.length; i += 150) {
    const chunk = taskIds.slice(i, i + 150);
    let { data: rows, error } = await supabase
      .from('crm_tasks')
      .select(PRIVATE_TASK_SELECT)
      .in('id', chunk)
      .not('lead_id', 'is', null);
    if (error && /task_source_type|employee_error_module|pipeline_stage|sync_role|crm_pipeline_stages/.test(error.message || '')) {
      ({ data: rows, error } = await supabase
        .from('crm_tasks')
        .select(PRIVATE_TASK_SELECT_FALLBACK)
        .in('id', chunk)
        .not('lead_id', 'is', null));
    }
    if (error && /crm_pipeline_stages|pipeline_stage_id|sync_role/.test(error.message || '')) {
      ({ data: rows, error } = await supabase
        .from('crm_tasks')
        .select(`
          id, title, status, deadline, priority, stage_slug, lead_id, assignee_id,
          executor_company_id, created_at, updated_at, checklist,
          assignee:users!crm_tasks_assignee_id_fkey(id, full_name, avatar),
          lead:crm_leads!crm_tasks_lead_id_fkey(id, code, title, type, company_id, project_id)
        `)
        .in('id', chunk)
        .not('lead_id', 'is', null));
    }
    if (error) throw error;
    for (const t of rows || []) {
      if (!t?.lead_id || !t.lead) continue;
      // Chỉ deal (và lead nếu chưa convert nhưng vẫn có nhiệm vụ — ưu tiên deal)
      const leadType = String(t.lead.type || '').toLowerCase();
      if (leadType && leadType !== 'deal') continue;
      if (!taskMatchesPrivateModule(t, mod)) continue;
      candidates.push(t);
    }
  }

  const projectMap = await loadProjectOwnerMap(candidates.map((t) => t.lead?.project_id));
  const companyIds = [];
  for (const t of candidates) {
    if (t.executor_company_id) companyIds.push(t.executor_company_id);
    if (t.lead?.company_id) companyIds.push(t.lead.company_id);
    const proj = t.lead?.project_id ? projectMap.get(String(t.lead.project_id)) : null;
    if (proj?.company_id) companyIds.push(proj.company_id);
  }
  const companyNames = await loadCompanyNameMap(companyIds);

  // Không gian chung = việc được giao cho tôi trên deal.
  // Không loại ủy thác chéo — tab «Công việc chung» đã gỡ; ẩn ở đây sẽ làm mất nhiệm vụ.
  const visible = candidates;

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
      href: buildDeepLink(t, mod, { tab: 'tasks' }),
      assignment_module: mod,
    };
  });

  tasks.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));

  // Bổ sung crm_assignments gắn deal (Giao việc) — cùng nhóm theo deal
  const crmTaskIds = new Set(tasks.map((t) => String(t.id)));
  const [{ data: assignVia }, { data: assignDirect }] = await Promise.all([
    supabase.from('crm_assignment_assignees').select('assignment_id').eq('user_id', uid).limit(800),
    supabase.from('crm_assignments').select('id').eq('assignee_id', uid).not('lead_id', 'is', null).limit(800),
  ]);
  const assignIdSet = new Set();
  (assignVia || []).forEach((r) => { if (r?.assignment_id) assignIdSet.add(String(r.assignment_id)); });
  (assignDirect || []).forEach((r) => { if (r?.id) assignIdSet.add(String(r.id)); });
  const assignIds = [...assignIdSet];
  if (assignIds.length) {
    for (let i = 0; i < assignIds.length; i += 150) {
      const chunk = assignIds.slice(i, i + 150);
      let { data: aRows, error: aErr } = await supabase
        .from('crm_assignments')
        .select(`
          id, title, status, deadline, priority, lead_id, assignee_id, crm_task_id,
          assignment_module, created_at, updated_at,
          assignee:users!crm_assignments_assignee_id_fkey(id, full_name, avatar),
          lead:crm_leads!crm_assignments_lead_id_fkey(id, code, title, type, company_id, project_id)
        `)
        .in('id', chunk)
        .eq('assignment_module', mod)
        .not('lead_id', 'is', null);
      if (aErr) {
        console.warn('[private-deal-tasks] assignments:', aErr.message);
        break;
      }
      for (const a of aRows || []) {
        if (!a?.lead_id || !a.lead) continue;
        const leadType = String(a.lead.type || '').toLowerCase();
        if (leadType && leadType !== 'deal') continue;
        // Tránh trùng nếu đã có crm_task tương ứng
        if (a.crm_task_id && crmTaskIds.has(String(a.crm_task_id))) continue;
        const proj = a.lead?.project_id ? projectMap.get(String(a.lead.project_id)) : null;
        if (a.lead?.project_id && !proj) {
          const extra = await loadProjectOwnerMap([a.lead.project_id]);
          extra.forEach((v, k) => projectMap.set(k, v));
        }
        const proj2 = a.lead?.project_id ? projectMap.get(String(a.lead.project_id)) : null;
        const ownerCompanyId = proj2?.company_id || a.lead?.company_id || null;
        tasks.push({
          id: `asg_${a.id}`,
          title: a.title,
          status: a.status,
          deadline: a.deadline,
          priority: a.priority || 'medium',
          stage_slug: null,
          lead_id: a.lead_id,
          assignee_id: a.assignee_id,
          assignee: a.assignee || null,
          executor_company_id: null,
          executor_company_name: null,
          owner_company_id: ownerCompanyId ? String(ownerCompanyId) : null,
          owner_company_name: ownerCompanyId ? (companyNames.get(String(ownerCompanyId)) || null) : null,
          task_source_type: 'crm_assignment',
          employee_error_module: null,
          created_at: a.created_at,
          updated_at: a.updated_at,
          lead: a.lead ? {
            id: a.lead.id,
            code: a.lead.code,
            title: a.lead.title,
            type: a.lead.type,
            company_id: a.lead.company_id,
            project_id: a.lead.project_id,
            project_code: proj2?.code || null,
            project_name: proj2?.name || null,
          } : null,
          href: buildDeepLink({ id: a.crm_task_id || null, lead: a.lead }, mod, { tab: 'tasks' }),
          assignment_module: mod,
          crm_assignment_id: a.id,
        });
      }
    }
    tasks.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  }

  const groupMap = new Map();
  for (const t of tasks) {
    const lid = String(t.lead_id || t.lead?.id || '');
    if (!lid) continue;
    if (!groupMap.has(lid)) {
      groupMap.set(lid, {
        lead_id: lid,
        lead: t.lead,
        href: null,
        tasks: [],
        updated_at: t.updated_at,
      });
    }
    const g = groupMap.get(lid);
    g.tasks.push(t);
    if (String(t.updated_at || '') > String(g.updated_at || '')) g.updated_at = t.updated_at;
  }

  const groups = [...groupMap.values()].sort((a, b) =>
    String(b.updated_at || '').localeCompare(String(a.updated_at || '')),
  );

  for (const g of groups) {
    g.href = buildDeepLink({ id: null, lead: g.lead }, mod, { tab: 'tasks' });
  }

  return { tasks, groups, assignment_module: mod };
}

module.exports = {
  normalizeAssignModule,
  listSharedWorkspaceInboxTasks,
  listPrivateDealInboxTasks,
  sharedSlugsForModule,
  taskMatchesPrivateModule,
};
