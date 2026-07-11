const { supabase } = require('../config/supabase');
const { isCrmDealAssigneeLocked } = require('./crmDealAssigneeLock');

/** Chuẩn hóa UUID người phụ trách từ body API. */
function normalizeCrmStageDefaultAssigneeUserId(raw) {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  const id = String(raw).trim();
  return id || null;
}

/**
 * Gán người phụ trách CRM theo cấu hình cột pipeline (nếu bật checkbox).
 * Không ghi đè deal đã khóa phụ trách (Thắng / đã có project SX).
 */
async function mergeCrmStageDefaultAssigneeIntoUpdates(updates, {
  stage,
  lead,
  isStageChange,
  sb = supabase,
}) {
  if (!isStageChange || !stage?.apply_default_assignee_on_enter) return updates;
  const assigneeId = String(stage.default_assignee_user_id || '').trim();
  if (!assigneeId) return updates;

  if (lead?.type === 'deal' && await isCrmDealAssigneeLocked(sb, lead)) {
    return updates;
  }

  const { data: u } = await sb.from('users').select('id, company_id, role').eq('id', assigneeId).maybeSingle();
  if (!u) {
    console.warn('[crm/stage] skip default assignee: user not found', assigneeId);
    return updates;
  }
  const leadCompanyId = lead?.company_id ? String(lead.company_id).trim() : '';
  if (leadCompanyId && u.company_id && String(u.company_id).trim() !== leadCompanyId) {
    console.warn('[crm/stage] skip default assignee: user company mismatch', assigneeId);
    return updates;
  }

  updates.assigned_to = assigneeId;
  updates.lead_owner_id = assigneeId;
  return updates;
}

module.exports = {
  normalizeCrmStageDefaultAssigneeUserId,
  mergeCrmStageDefaultAssigneeIntoUpdates,
};
