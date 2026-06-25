/** Lead/deal CRM gắn dự án SX — dùng chung cho Kanban, view Bình luận và chi tiết. */
export function resolveSxProjectLeadId(project) {
  if (project?.crm_lead_id) return String(project.crm_lead_id);
  const deals = Array.isArray(project?.crm_deals)
    ? project.crm_deals
    : Array.isArray(project?.crmDeals)
      ? project.crmDeals
      : [];
  const deal = deals.find((d) => String(d?.type || '') === 'deal') || deals[0];
  return deal?.id ? String(deal.id) : null;
}

/** Gom dự án theo nguồn bình luận: deal CRM → crm_lead_comments, không deal → project_comments. */
export function partitionSxProjectsByCommentSource(items = []) {
  const projectOnlyIds = [];
  const leadIds = [];
  const leadIdToProjectId = {};

  for (const it of items || []) {
    const pid = it?.id != null ? String(it.id) : '';
    if (!pid) continue;
    const leadId = resolveSxProjectLeadId(it);
    if (leadId) {
      leadIds.push(leadId);
      leadIdToProjectId[leadId] = pid;
    } else {
      projectOnlyIds.push(pid);
    }
  }

  return {
    projectOnlyIds: [...new Set(projectOnlyIds)],
    leadIds: [...new Set(leadIds)],
    leadIdToProjectId,
  };
}
