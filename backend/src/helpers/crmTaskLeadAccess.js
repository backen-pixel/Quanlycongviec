/**
 * Quyền truy cập nhóm route CRM /leads/:id/tasks* (và tài nguyên task liên quan).
 * Thay cho bypass "chỉ cần auth" — vẫn cho phép assignee task / SX executor / participant.
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

/** Công ty user là executor của task SX trên lead, hoặc là công ty chủ dự án liên kết. */
async function userCompanyHasTaskExecutorAccess(supabase, userCompanyId, leadRow) {
  if (!userCompanyId || !leadRow?.id) return false;
  const cid = String(userCompanyId);

  if (leadRow.project_id) {
    const { data: proj } = await supabase
      .from('projects')
      .select('company_id')
      .eq('id', leadRow.project_id)
      .maybeSingle();
    if (proj?.company_id && String(proj.company_id) === cid) return true;
  }

  const { data: execTask } = await supabase
    .from('crm_tasks')
    .select('id')
    .eq('lead_id', leadRow.id)
    .eq('executor_company_id', cid)
    .limit(1)
    .maybeSingle();
  return !!execTask;
}

/**
 * @returns {{ ok: true } | { ok: false, error: string, status?: number }}
 */
async function assertCrmTaskLeadAccess(supabase, req, lead, { taskId = null } = {}) {
  if (!lead) return { ok: false, error: 'Không tìm thấy lead/deal', status: 404 };

  if (!tenantScope.companyInTenantContext(req, lead.company_id)) {
    return { ok: false, error: 'Không có quyền truy cập dữ liệu hệ sinh thái khác', status: 403 };
  }

  const regionCheck = crmRegionScope.assertLeadReadableByRegionScope(req, lead);
  if (!regionCheck.ok) return { ok: false, error: regionCheck.error, status: 403 };

  const uid = req.user?.userId;
  const role = req.user?.role;

  if (lead.type === 'deal') {
    if (userSeesAllCrmDeals(role)) return { ok: true };
  } else if (lead.type === 'lead') {
    if (userSeesAllCrmLeads(role)) return { ok: true };
  }

  if (uid) {
    if (lead.type === 'deal') {
      if (await userOwnsDealViaAncestor(supabase, uid, lead)) return { ok: true };
    } else {
      const owns =
        String(lead.assigned_to || '') === String(uid)
        || String(lead.lead_owner_id || '') === String(uid);
      if (owns) return { ok: true };
    }

    if (await userCanAccessCrmLeadAsParticipant(supabase, uid, lead)) return { ok: true };
    if (await userCanAccessCrmLeadViaVisibility(supabase, uid, lead)) return { ok: true };
    if (await userIsCrmTaskAssigneeOnLead(supabase, uid, lead.id, taskId)) return { ok: true };
  }

  if (await userCompanyHasTaskExecutorAccess(supabase, req.user?.company_id, lead)) {
    return { ok: true };
  }

  const kind = lead.type === 'deal' ? 'deal' : 'lead';
  return {
    ok: false,
    error: `Bạn chỉ được xem/sửa nhiệm vụ trên ${kind} mà bạn phụ trách, tham gia, hoặc được giao.`,
    status: 403,
  };
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

module.exports = {
  assertCrmTaskLeadAccess,
  loadLeadForTaskAccess,
  userOwnsDealViaAncestor,
  userIsCrmTaskAssigneeOnLead,
  userCompanyHasTaskExecutorAccess,
};
