const { supabase } = require('../config/supabase');

/**
 * @returns {Promise<{ responsibleUserId: string|null, assigneeByTemplateItemId: Map<string, string|null> }>}
 */
async function loadProductionHandoverMaps(productionCompanyId) {
  if (!productionCompanyId) {
    return { responsibleUserId: null, assigneeByTemplateItemId: new Map() };
  }
  const { data: set } = await supabase
    .from('production_handover_settings')
    .select('responsible_user_id')
    .eq('production_company_id', productionCompanyId)
    .maybeSingle();
  const { data: assigns } = await supabase
    .from('production_handover_task_assignments')
    .select('template_item_id, assignee_user_id')
    .eq('production_company_id', productionCompanyId);
  const assigneeByTemplateItemId = new Map();
  for (const a of assigns || []) {
    if (a.template_item_id) assigneeByTemplateItemId.set(String(a.template_item_id), a.assignee_user_id || null);
  }
  return {
    responsibleUserId: set?.responsible_user_id || null,
    assigneeByTemplateItemId,
  };
}

/**
 * Gán người nhận nhiệm vụ sx_* theo bảng phân công; fallback assigneeId gọi API; cuối cùng responsible.
 */
function resolveSxAssigneeForTemplateItem(item, maps, fallbackAssigneeId) {
  if (!item?.id) {
    return fallbackAssigneeId || maps.responsibleUserId || null;
  }
  const key = String(item.id);
  if (maps.assigneeByTemplateItemId.has(key)) {
    return maps.assigneeByTemplateItemId.get(key) || null;
  }
  return fallbackAssigneeId || maps.responsibleUserId || null;
}

module.exports = {
  loadProductionHandoverMaps,
  resolveSxAssigneeForTemplateItem,
};
