const { supabase } = require('../config/supabase');

/** Deal đã Thắng hoặc đã có dự án SX — khóa người phụ trách CRM (NVKD). */
async function isCrmDealAssigneeLocked(sb, dealRow) {
  if (!dealRow || dealRow.type !== 'deal') return false;
  if (dealRow.project_id) return true;
  if (!dealRow.stage_id) return false;
  const client = sb || supabase;
  const { data: st } = await client
    .from('crm_pipeline_stages')
    .select('is_won')
    .eq('id', dealRow.stage_id)
    .maybeSingle();
  return !!st?.is_won;
}

/** Không ghi đè assigned_to / lead_owner_id khi chuyển deal sang cột Thắng. */
function stripCrmAssigneeFromWonStageUpdates(updates, { leadType, isWon, requiresProductionPick }) {
  if (leadType === 'deal' && (isWon || requiresProductionPick)) {
    delete updates.assigned_to;
    delete updates.lead_owner_id;
  }
  return updates;
}

module.exports = {
  isCrmDealAssigneeLocked,
  stripCrmAssigneeFromWonStageUpdates,
};
