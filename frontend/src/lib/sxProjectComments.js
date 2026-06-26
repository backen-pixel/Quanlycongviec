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

/** Fallback orders.fulfillment_lead_id khi embed crm_deals chưa có trên thẻ Kanban. */
export async function resolveSxProjectLeadIdAsync(apiClient, project) {
  const direct = resolveSxProjectLeadId(project);
  if (direct || !project?.id) return direct;
  try {
    const { data } = await apiClient.get(`/projects/${project.id}/orders`);
    const orders = Array.isArray(data?.orders) ? data.orders : [];
    const fid = orders.find((o) => o?.fulfillment_lead_id)?.fulfillment_lead_id;
    return fid ? String(fid) : null;
  } catch {
    return null;
  }
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
