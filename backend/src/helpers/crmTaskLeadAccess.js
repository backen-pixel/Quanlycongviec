/**
 * Quyền truy cập lead/deal thống nhất cho middleware CRM + gateway work-tasks.
 * Grant tường minh (owner, member, visibility, assignee task, executor company)
 * không bị chặn bởi lệch khu vực — chỉ quyền theo vai trò (sees-all) mới cần region khớp.
 *
 * operation: READ | CREATE | UPDATE | DELETE
 * - READ: owner / participant / visibility / (task) assignee / executor
 * - UPDATE: như READ (assignee/executor được sửa task được giao)
 * - CREATE / DELETE: chỉ owner / participant / visibility / admin — không cấp qua assignee-only
 */
const tenantScope = require('./tenantScope');
const {
  userSeesAllCrmDeals,
  userSeesAllCrmLeads,
} = require('./crmAccessRoles');
const {
  userCanAccessCrmLeadAsParticipant,
  userCanAccessCrmLeadViaVisibility,
} = require('./crmLeadParticipantAccess');
const crmRegionScope = require('./crmRegionScope');

const VALID_OPS = new Set(['READ', 'CREATE', 'UPDATE', 'DELETE']);

function normalizeCrmAccessOperation(raw) {
  const op = String(raw || 'READ').trim().toUpperCase();
  return VALID_OPS.has(op) ? op : 'READ';
}

/**
 * Suy operation từ HTTP method + path (nhóm /leads|:deals/:id/tasks*).
 * POST tạo task / template / ensure-* → CREATE; POST trên taskId cụ thể → UPDATE.
 */
function resolveCrmTaskHttpOperation(method, path) {
  const m = String(method || 'GET').toUpperCase();
  const p = String(path || '');
  if (m === 'GET' || m === 'HEAD') return 'READ';
  if (m === 'DELETE') return 'DELETE';
  if (m === 'PUT' || m === 'PATCH') return 'UPDATE';
  if (m === 'POST') {
    // /tasks/<uuid>/... → thao tác trên task có sẵn
    if (/\/tasks\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(\/|$)/i.test(p)) {
      return 'UPDATE';
    }
    return 'CREATE';
  }
  return 'READ';
}

async function userOwnsDealViaAncestor(supabase, userId, row) {
  if (!userId || !row) return false;
  if (String(row.assigned_to || '') === String(userId)) return true;
  let cur = row;
  let g = 0;
  while (cur?.parent_lead_id && g < 8) {
    const { data: par } = await supabase
      .from('crm_leads')
      .select('id, type, assigned_to, lead_owner_id, parent_lead_id')
      .eq('id', cur.parent_lead_id)
      .maybeSingle();
    if (!par) break;
    if (par.type === 'deal' && String(par.assigned_to || '') === String(userId)) return true;
    cur = par;
    g += 1;
  }
  return false;
}

/** User được gán trên ít nhất một crm_tasks của lead (assignee_id hoặc crm_task_assignees). */
async function userIsCrmTaskAssigneeOnLead(supabase, userId, leadId, taskId = null) {
  if (!userId || !leadId) return false;
  let q = supabase
    .from('crm_tasks')
    .select('id')
    .eq('lead_id', leadId)
    .eq('assignee_id', userId)
    .limit(1);
  if (taskId) q = q.eq('id', taskId);
  const { data: direct } = await q.maybeSingle();
  if (direct) return true;

  let aq = supabase
    .from('crm_task_assignees')
    .select('task_id, crm_tasks!inner(id, lead_id)')
    .eq('user_id', userId)
    .eq('crm_tasks.lead_id', leadId)
    .limit(1);
  if (taskId) aq = aq.eq('task_id', taskId);
  const { data: via } = await aq.maybeSingle();
  return !!via;
}

/**
 * Quyền của công ty user theo quan hệ executor — TASK-SCOPED (fail-closed).
 *
 * - Chủ dự án (project owner company): quyền rộng theo Lead vì sở hữu dự án
 *   → grant 'project_owner_company'.
 * - taskId có (route thao tác 1 task): CHỈ hợp lệ khi đúng task đó có
 *   executor_company_id = công ty user → grant 'executor_company_task'.
 *   Executor của task khác trong cùng Lead KHÔNG được truy cập task này.
 * - taskId null (route list): công ty là executor của ≥1 task → chỉ được VÀO
 *   route ở dạng thu hẹp; danh sách phải bị lọc về đúng công ty
 *   (list handler enforce qua executorScopedOnly) → grant 'executor_company_scope'.
 *
 * @returns {{ ok: boolean, grant?: string }}
 */
async function userCompanyHasTaskExecutorAccess(supabase, userCompanyId, leadRow, taskId = null) {
  if (!userCompanyId || !leadRow?.id) return { ok: false };
  const cid = String(userCompanyId);

  if (leadRow.project_id) {
    const { data: proj } = await supabase
      .from('projects')
      .select('company_id')
      .eq('id', leadRow.project_id)
      .maybeSingle();
    if (proj?.company_id && String(proj.company_id) === cid) {
      return { ok: true, grant: 'project_owner_company' };
    }
  }

  if (taskId) {
    const { data: execTask } = await supabase
      .from('crm_tasks')
      .select('id')
      .eq('id', taskId)
      .eq('lead_id', leadRow.id)
      .eq('executor_company_id', cid)
      .limit(1)
      .maybeSingle();
    return execTask ? { ok: true, grant: 'executor_company_task' } : { ok: false };
  }

  const { data: anyExec } = await supabase
    .from('crm_tasks')
    .select('id')
    .eq('lead_id', leadRow.id)
    .eq('executor_company_id', cid)
    .limit(1)
    .maybeSingle();
  return anyExec ? { ok: true, grant: 'executor_company_scope' } : { ok: false };
}

async function userHasLeadOwnershipOrParticipation(supabase, uid, lead) {
  if (!uid || !lead) return false;
  if (lead.type === 'deal') {
    if (await userOwnsDealViaAncestor(supabase, uid, lead)) return true;
  } else {
    const owns =
      String(lead.assigned_to || '') === String(uid)
      || String(lead.lead_owner_id || '') === String(uid);
    if (owns) return true;
  }
  if (await userCanAccessCrmLeadAsParticipant(supabase, uid, lead)) return true;
  if (await userCanAccessCrmLeadViaVisibility(supabase, uid, lead)) return true;
  return false;
}

/**
 * @returns {{ ok: true, grant?: string } | { ok: false, error: string, status?: number }}
 */
async function assertCrmLeadAccess(supabase, req, lead, {
  taskId = null,
  includeTaskGrants = false,
  operation = 'READ',
} = {}) {
  if (!lead) return { ok: false, error: 'Không tìm thấy lead/deal', status: 404, reason: 'lead_not_found' };

  if (!tenantScope.companyInTenantContext(req, lead.company_id)) {
    return {
      ok: false,
      error: 'Không có quyền truy cập dữ liệu hệ sinh thái khác',
      status: 403,
      reason: 'tenant_scope_denied',
    };
  }

  const op = normalizeCrmAccessOperation(operation);
  const regionCheck = crmRegionScope.assertLeadReadableByRegionScope(req, lead);
  const uid = req.user?.userId;
  const role = req.user?.role;

  const seesAll = lead.type === 'deal'
    ? userSeesAllCrmDeals(role)
    : lead.type === 'lead' && userSeesAllCrmLeads(role);
  if (seesAll && regionCheck.ok) return { ok: true, grant: 'role_sees_all' };

  if (uid && await userHasLeadOwnershipOrParticipation(supabase, uid, lead)) {
    return { ok: true, grant: 'owner_or_participant' };
  }

  // Assignee / executor — chỉ READ/UPDATE trên task path; không CREATE/DELETE lead-level.
  // Executor được task-scope: taskId có → chỉ đúng task của công ty đó (chống cross-task).
  if (includeTaskGrants && (op === 'READ' || op === 'UPDATE')) {
    if (uid && await userIsCrmTaskAssigneeOnLead(supabase, uid, lead.id, taskId)) {
      return { ok: true, grant: 'task_assignee' };
    }
    const execAccess = await userCompanyHasTaskExecutorAccess(
      supabase, req.user?.company_id, lead, taskId,
    );
    if (execAccess.ok) return { ok: true, grant: execAccess.grant };
  }

  if (!regionCheck.ok) {
    return { ok: false, error: regionCheck.error, status: 403, reason: 'region_scope_denied' };
  }

  const kind = lead.type === 'deal' ? 'deal' : 'lead';
  if (includeTaskGrants && (op === 'CREATE' || op === 'DELETE')) {
    return {
      ok: false,
      error: `Bạn không có quyền ${op === 'CREATE' ? 'tạo' : 'xóa'} nhiệm vụ trên ${kind} này.`,
      status: 403,
      reason: op === 'CREATE' ? 'task_create_forbidden' : 'task_delete_forbidden',
    };
  }
  const scopeMsg = includeTaskGrants
    ? `Bạn chỉ được xem/sửa nhiệm vụ trên ${kind} mà bạn phụ trách, tham gia, hoặc được giao.`
    : `Bạn chỉ được xem/sửa ${kind} mà bạn phụ trách hoặc tham gia.`;
  return {
    ok: false,
    error: scopeMsg,
    status: 403,
    reason: includeTaskGrants ? 'task_access_denied' : 'lead_access_denied',
  };
}

/**
 * Quyền nhóm route /leads/:id/tasks* — gồm cả grant qua task (assignee/executor).
 */
async function assertCrmTaskLeadAccess(supabase, req, lead, {
  taskId = null,
  operation = 'READ',
} = {}) {
  return assertCrmLeadAccess(supabase, req, lead, {
    taskId,
    includeTaskGrants: true,
    operation,
  });
}

async function loadLeadForTaskAccess(supabase, leadId) {
  const { data, error } = await supabase
    .from('crm_leads')
    .select('id, type, company_id, assigned_to, lead_owner_id, parent_lead_id, project_id, region_id')
    .eq('id', leadId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Fail-closed: taskId trên path phải thuộc leadId (chống spoof /leads/A/tasks/B khi B thuộc lead khác).
 * @returns {{ ok: true, task?: object } | { ok: false, error: string, status: number }}
 */
async function assertCrmTaskBelongsToLead(supabase, leadId, taskId) {
  if (!taskId) return { ok: true };
  const { data: task, error } = await supabase
    .from('crm_tasks')
    .select('id, lead_id')
    .eq('id', taskId)
    .maybeSingle();
  if (error) throw error;
  if (!task) return { ok: false, error: 'Không tìm thấy nhiệm vụ', status: 404 };
  if (String(task.lead_id) !== String(leadId)) {
    return { ok: false, error: 'Nhiệm vụ không thuộc lead/deal này', status: 404 };
  }
  return { ok: true, task };
}

module.exports = {
  assertCrmLeadAccess,
  assertCrmTaskLeadAccess,
  loadLeadForTaskAccess,
  assertCrmTaskBelongsToLead,
  resolveCrmTaskHttpOperation,
  normalizeCrmAccessOperation,
  userOwnsDealViaAncestor,
  userIsCrmTaskAssigneeOnLead,
  userCompanyHasTaskExecutorAccess,
};
