/**
 * Quyền xem lead/deal cho thành viên nhóm (lead_members) và NV gắn dự án SX.
 * Dùng bởi enforceCrmDealAssigneeAccess — tránh chặn tab Bình luận / @mention trên SX.
 */

async function userIsLeadMember(supabase, userId, leadId) {
  if (!userId || !leadId) return false;
  const { data } = await supabase
    .from('lead_members')
    .select('id')
    .eq('lead_id', leadId)
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  return !!data;
}

async function userIsLinkedProjectParticipant(supabase, userId, projectId) {
  if (!userId || !projectId) return false;
  const uid = String(userId);

  try {
    const { data: staff } = await supabase
      .from('project_production_staff')
      .select('user_id')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    if (staff) return true;
  } catch (e) {
    if (!String(e.message || '').includes('project_production_staff')) throw e;
  }

  const { data: proj } = await supabase
    .from('projects')
    .select('production_person_id, responsible_person_id, sales_person_id, designer_id, project_manager_id, supervisor_id')
    .eq('id', projectId)
    .maybeSingle();
  if (!proj) return false;

  const teamIds = [
    proj.production_person_id,
    proj.responsible_person_id,
    proj.sales_person_id,
    proj.designer_id,
    proj.project_manager_id,
    proj.supervisor_id,
  ].filter(Boolean).map(String);
  return teamIds.includes(uid);
}

/** NV tham gia deal qua lead_members hoặc dự án SX/DA liên kết. */
async function userCanAccessCrmLeadAsParticipant(supabase, userId, leadRow) {
  if (!userId || !leadRow?.id) return false;
  if (await userIsLeadMember(supabase, userId, leadRow.id)) return true;
  if (leadRow.project_id) {
    return userIsLinkedProjectParticipant(supabase, userId, leadRow.project_id);
  }
  return false;
}

/** NV được xem deal qua phân quyền xem trên nhiệm vụ/tài liệu CRM. */
async function userCanAccessCrmLeadViaVisibility(supabase, userId, leadRow) {
  if (!userId || !leadRow?.id) return false;
  const { userCanViewLeadViaVisibilitySetup } = require('./crmLeadCommentAudience');
  return userCanViewLeadViaVisibilitySetup(supabase, userId, leadRow.id);
}

module.exports = {
  userIsLeadMember,
  userIsLinkedProjectParticipant,
  userCanAccessCrmLeadAsParticipant,
  userCanAccessCrmLeadViaVisibility,
};
