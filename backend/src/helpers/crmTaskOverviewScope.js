/**
 * Phạm vi list /tasks/overview và /tasks/planner —
 * NV thường không được đọc toàn bộ task + tên KH của company.
 */
const {
  userSeesAllCrmLeadsForScope,
  userSeesAllCrmDealsForScope,
} = require('./crmAccessRoles');
const { isSystemAdmin } = require('./adminRole');

function userSeesCompanyWideCrmTasks(user) {
  if (!user) return false;
  if (isSystemAdmin(user)) return true;
  return userSeesAllCrmLeadsForScope(user) || userSeesAllCrmDealsForScope(user);
}

/**
 * Áp filter staff lên query crm_tasks đã có (hoặc sắp có) company/lead scope.
 * @returns {{ q: any, empty: boolean }}
 */
async function applyCrmTasksListAccessScope(q, supabase, req, { companyId = null } = {}) {
  if (userSeesCompanyWideCrmTasks(req.user)) {
    return { q, empty: false };
  }

  const uid = req.user?.userId;
  if (!uid) return { q, empty: true };

  let ownedQ = supabase
    .from('crm_leads')
    .select('id')
    .or(`assigned_to.eq.${uid},lead_owner_id.eq.${uid}`)
    .limit(500);
  if (companyId) ownedQ = ownedQ.eq('company_id', companyId);
  const { data: ownedRows, error: ownedErr } = await ownedQ;
  if (ownedErr) throw ownedErr;
  const ownedLeadIds = (ownedRows || []).map((r) => r.id).filter(Boolean);

  const { data: memberRows, error: memErr } = await supabase
    .from('lead_members')
    .select('lead_id')
    .eq('user_id', uid)
    .limit(500);
  if (memErr && !/lead_members/.test(String(memErr.message || ''))) throw memErr;
  const memberLeadIds = (memberRows || []).map((r) => r.lead_id).filter(Boolean);

  const { data: viaAssign, error: viaErr } = await supabase
    .from('crm_task_assignees')
    .select('task_id')
    .eq('user_id', uid)
    .limit(500);
  if (viaErr && !/crm_task_assignees/.test(String(viaErr.message || ''))) throw viaErr;
  const multiTaskIds = (viaAssign || []).map((r) => r.task_id).filter(Boolean);

  const leadIds = [...new Set([...ownedLeadIds, ...memberLeadIds])];
  const parts = [`assignee_id.eq.${uid}`, `created_by.eq.${uid}`];
  if (leadIds.length) parts.push(`lead_id.in.(${leadIds.join(',')})`);
  if (multiTaskIds.length) parts.push(`id.in.(${multiTaskIds.join(',')})`);

  return { q: q.or(parts.join(',')), empty: false };
}

module.exports = {
  userSeesCompanyWideCrmTasks,
  applyCrmTasksListAccessScope,
};
