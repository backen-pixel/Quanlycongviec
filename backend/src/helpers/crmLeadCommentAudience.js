/**
 * Audience bình luận lead/deal — thành viên nhóm + NV được phân quyền xem
 * (default_allowed_* trên crm_tasks / đính kèm / tài liệu deal).
 */

const { parseJsonArray, canViewerSeeByCompanyAndDept } = require('./documentShareScope');
const { fetchLeadMentionMembers } = require('./crmLeadCommentMentions');
const { ensureLeadMembersFromProjectStaff } = require('./productionWorkshopTypeStaff');

function mergeAllowlistIntoScope(scope, artifact, taskRow = null) {
  const ac = parseJsonArray(artifact?.allowed_companies)
    ?? parseJsonArray(taskRow?.default_allowed_companies)
    ?? parseJsonArray(artifact?.default_allowed_companies);
  const ad = parseJsonArray(artifact?.allowed_departments)
    ?? parseJsonArray(taskRow?.default_allowed_departments)
    ?? parseJsonArray(artifact?.default_allowed_departments);
  if (ac?.length) {
    scope.hasRestrictions = true;
    ac.forEach((id) => scope.companyIds.add(String(id)));
  }
  if (ad?.length) {
    scope.hasRestrictions = true;
    ad.forEach((id) => scope.deptIds.add(String(id)));
  }
}

/** Gom công ty / phòng ban được cấu hình phân quyền xem trên deal. */
async function collectLeadVisibilityScope(supabase, leadId) {
  const scope = { companyIds: new Set(), deptIds: new Set(), hasRestrictions: false };

  const { data: tasks } = await supabase
    .from('crm_tasks')
    .select('id, default_allowed_companies, default_allowed_departments')
    .eq('lead_id', leadId);
  const taskMap = new Map();
  for (const t of tasks || []) {
    taskMap.set(t.id, t);
    mergeAllowlistIntoScope(scope, t);
  }

  const taskIds = [...taskMap.keys()];
  if (taskIds.length) {
    const { data: attachments } = await supabase
      .from('crm_task_attachments')
      .select('task_id, allowed_companies, allowed_departments')
      .in('task_id', taskIds);
    for (const a of attachments || []) {
      mergeAllowlistIntoScope(scope, a, taskMap.get(a.task_id));
    }
  }

  const { data: docs } = await supabase
    .from('lead_documents')
    .select('allowed_companies, allowed_departments')
    .eq('lead_id', leadId);
  for (const d of docs || []) {
    mergeAllowlistIntoScope(scope, d);
  }

  return scope;
}

async function fetchUsersForVisibilityScope(supabase, scope) {
  if (!scope?.companyIds?.size && !scope?.deptIds?.size) return [];
  const byId = new Map();
  const cols = 'id, full_name, email, avatar, role, company_id, department_id';

  if (scope.companyIds.size) {
    const { data } = await supabase
      .from('users')
      .select(cols)
      .in('company_id', [...scope.companyIds])
      .eq('is_active', true);
    for (const u of data || []) byId.set(String(u.id), u);
  }
  if (scope.deptIds.size) {
    const { data } = await supabase
      .from('users')
      .select(cols)
      .in('department_id', [...scope.deptIds])
      .eq('is_active', true);
    for (const u of data || []) byId.set(String(u.id), u);
  }
  return [...byId.values()];
}

/** User có quyền xem deal qua phân quyền xem đã cấu hình trên nhiệm vụ/tài liệu. */
async function userCanViewLeadViaVisibilitySetup(supabase, userId, leadId) {
  if (!userId || !leadId) return false;
  const { data: user } = await supabase
    .from('users')
    .select('id, role, company_id, department_id')
    .eq('id', userId)
    .eq('is_active', true)
    .maybeSingle();
  if (!user) return false;
  // Không bypass theo role admin công ty — tránh admin Metalla được coi là thành viên mọi deal HCB.

  const scope = await collectLeadVisibilityScope(supabase, leadId);
  if (!scope.hasRestrictions) return false;

  const uc = user.company_id ? String(user.company_id) : '';
  const ud = user.department_id ? String(user.department_id) : '';
  if (scope.companyIds.size && uc && scope.companyIds.has(uc)) return true;
  if (scope.deptIds.size && ud && scope.deptIds.has(ud)) return true;

  const { data: tasks } = await supabase
    .from('crm_tasks')
    .select('default_allowed_companies, default_allowed_departments')
    .eq('lead_id', leadId);
  for (const t of tasks || []) {
    const ac = parseJsonArray(t.default_allowed_companies);
    const ad = parseJsonArray(t.default_allowed_departments);
    if ((ac?.length || ad?.length) && canViewerSeeByCompanyAndDept(t, user)) return true;
  }

  const { data: docs } = await supabase
    .from('lead_documents')
    .select('allowed_companies, allowed_departments')
    .eq('lead_id', leadId);
  for (const d of docs || []) {
    const ac = parseJsonArray(d.allowed_companies);
    const ad = parseJsonArray(d.allowed_departments);
    if ((ac?.length || ad?.length) && canViewerSeeByCompanyAndDept(d, user)) return true;
  }

  return false;
}

/** Thành viên audience bình luận — nhóm deal + phân quyền xem đã setup. */
async function fetchLeadCommentAudienceMembers(supabase, leadId) {
  await ensureLeadMembersFromProjectStaff(leadId);
  const mentionMembers = await fetchLeadMentionMembers(supabase, leadId);
  const byUser = new Map();
  for (const m of mentionMembers || []) {
    if (m?.user_id) {
      byUser.set(String(m.user_id), { user_id: m.user_id, user: m.user || null, role: m.role || 'member' });
    }
  }

  const scope = await collectLeadVisibilityScope(supabase, leadId);
  if (scope.hasRestrictions) {
    const visUsers = await fetchUsersForVisibilityScope(supabase, scope);
    for (const u of visUsers) {
      const id = String(u.id);
      if (!byUser.has(id)) {
        byUser.set(id, { user_id: u.id, user: u, role: 'viewer' });
      }
    }
  }

  return [...byUser.values()];
}

module.exports = {
  collectLeadVisibilityScope,
  fetchUsersForVisibilityScope,
  userCanViewLeadViaVisibilitySetup,
  fetchLeadCommentAudienceMembers,
};
