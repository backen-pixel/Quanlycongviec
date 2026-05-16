const { supabase } = require('../config/supabase');

/** Admin công ty xưởng (role admin + company_id khớp). */
async function resolveProductionCompanyAdminUserId(productionCompanyId) {
  if (!productionCompanyId) return null;
  const { data: admins, error } = await supabase
    .from('users')
    .select('id')
    .eq('role', 'admin')
    .eq('company_id', productionCompanyId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) throw error;
  return admins?.[0]?.id || null;
}

/** Người phụ trách deal/dự án SX: cấu hình bàn giao → admin công ty xưởng. */
async function resolveProductionHandoverResponsibleUserId(productionCompanyId) {
  const maps = await loadProductionHandoverMaps(productionCompanyId);
  if (maps.responsibleUserId) return maps.responsibleUserId;
  return resolveProductionCompanyAdminUserId(productionCompanyId);
}

/**
 * Gán deal (và dự án nếu có) cho admin / người phụ trách công ty xưởng đã chọn.
 * @returns {Promise<{ responsibleUserId: string|null }>}
 */
async function assignProductionCompanyDealResponsibility({ dealId, productionCompanyId, projectId = null }) {
  if (!dealId || !productionCompanyId) return { responsibleUserId: null };
  const responsibleUserId = await resolveProductionHandoverResponsibleUserId(productionCompanyId);
  if (!responsibleUserId) return { responsibleUserId: null };

  const now = new Date().toISOString();
  await supabase
    .from('crm_leads')
    .update({
      assigned_to: responsibleUserId,
      lead_owner_id: responsibleUserId,
      updated_at: now,
    })
    .eq('id', dealId);

  if (projectId) {
    await supabase
      .from('projects')
      .update({ production_person_id: responsibleUserId, updated_at: now })
      .eq('id', projectId);
  }

  return { responsibleUserId };
}

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
 * Gán assignee_id cho nhiệm vụ sx_*: chỉ khi có dòng trong production_handover_task_assignments.
 * Không gán NV mặc định — trách nhiệm deal nằm ở admin công ty xưởng (assigned_to / production_person_id).
 */
function resolveSxAssigneeForTemplateItem(item, maps) {
  if (!item?.id) return null;
  const key = String(item.id);
  if (maps.assigneeByTemplateItemId.has(key)) {
    return maps.assigneeByTemplateItemId.get(key) || null;
  }
  return null;
}

module.exports = {
  loadProductionHandoverMaps,
  resolveSxAssigneeForTemplateItem,
  resolveProductionCompanyAdminUserId,
  resolveProductionHandoverResponsibleUserId,
  assignProductionCompanyDealResponsibility,
};
