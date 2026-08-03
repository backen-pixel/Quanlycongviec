const { supabase } = require('../config/supabase');
const { normalizeTemplateItemAssigneeIds } = require('./templateItemAssignees');

/** Admin công ty xưởng (role admin/sales_admin + company_id khớp). */
async function resolveProductionCompanyAdminUserId(productionCompanyId) {
  if (!productionCompanyId) return null;
  const { data: admins, error } = await supabase
    .from('users')
    .select('id')
    .in('role', ['admin', 'sales_admin'])
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
 * Không ghi đè khi dự án đã có NV SX (project_production_staff hoặc production_person_id).
 * @returns {Promise<{ responsibleUserId: string|null }>}
 */
async function assignProductionCompanyDealResponsibility({ dealId, productionCompanyId, projectId = null }) {
  if (!dealId || !productionCompanyId) return { responsibleUserId: null };

  const now = new Date().toISOString();
  let primaryId = null;

  if (projectId) {
    try {
      const { data: staffRows } = await supabase
        .from('project_production_staff')
        .select('user_id, is_primary')
        .eq('project_id', projectId)
        .order('is_primary', { ascending: false })
        .order('order_index');
      if (staffRows?.length) {
        primaryId = staffRows.find((r) => r.is_primary)?.user_id || staffRows[0].user_id;
      }
    } catch (e) {
      if (!String(e.message || '').includes('project_production_staff')) throw e;
    }

    if (!primaryId) {
      const { data: proj } = await supabase
        .from('projects')
        .select('production_person_id')
        .eq('id', projectId)
        .maybeSingle();
      if (proj?.production_person_id) primaryId = proj.production_person_id;
    }

    if (primaryId) {
      // Chỉ gán production_person_id trên project — KHÔNG ghi đè assigned_to/lead_owner_id trên deal CRM
      await supabase
        .from('projects')
        .update({ production_person_id: primaryId, updated_at: now })
        .eq('id', projectId);
      return { responsibleUserId: primaryId };
    }
  }

  const responsibleUserId = await resolveProductionHandoverResponsibleUserId(productionCompanyId);
  if (!responsibleUserId) return { responsibleUserId: null };

  // Chỉ gán production_person_id trên project — giữ nguyên người phụ trách CRM trên deal
  if (projectId) {
    await supabase
      .from('projects')
      .update({ production_person_id: responsibleUserId, updated_at: now })
      .eq('id', projectId);
  }

  return { responsibleUserId };
}

/**
 * @returns {Promise<{ responsibleUserId: string|null, deliveryConfirmUserId: string|null, assigneeByTemplateItemId: Map<string, string|null> }>}
 */
async function loadProductionHandoverMaps(productionCompanyId) {
  if (!productionCompanyId) {
    return { responsibleUserId: null, deliveryConfirmUserId: null, assigneeByTemplateItemId: new Map() };
  }
  let set = null;
  try {
    const { data } = await supabase
      .from('production_handover_settings')
      .select('responsible_user_id, delivery_confirm_user_id')
      .eq('production_company_id', productionCompanyId)
      .maybeSingle();
    set = data;
  } catch (e) {
    if (String(e.message || '').includes('delivery_confirm_user_id')) {
      const { data } = await supabase
        .from('production_handover_settings')
        .select('responsible_user_id')
        .eq('production_company_id', productionCompanyId)
        .maybeSingle();
      set = data;
    } else {
      throw e;
    }
  }
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
    deliveryConfirmUserId: set?.delivery_confirm_user_id || null,
    assigneeByTemplateItemId,
  };
}

/** Quản lý giao hàng — người bấm xác nhận phía SX; fallback phụ trách SX / admin công ty. */
async function resolveProductionDeliveryConfirmUserId(productionCompanyId, fallbackProductionPersonId = null) {
  const maps = await loadProductionHandoverMaps(productionCompanyId);
  if (maps.deliveryConfirmUserId) return maps.deliveryConfirmUserId;
  if (fallbackProductionPersonId) return fallbackProductionPersonId;
  if (maps.responsibleUserId) return maps.responsibleUserId;
  return resolveProductionCompanyAdminUserId(productionCompanyId);
}

/**
 * Gán assignee_id cho nhiệm vụ sx_*:
 * 1) production_handover_task_assignments theo công ty (ghi đè → 1 NV)
 * 2) default_assignee_ids / default_assignee_id trên workshop_task_template_items
 */
function resolveSxAssigneesForTemplateItem(item, maps) {
  if (!item?.id) return [];
  const key = String(item.id);
  if (maps.assigneeByTemplateItemId.has(key)) {
    const h = maps.assigneeByTemplateItemId.get(key);
    return h ? [String(h)] : [];
  }
  return normalizeTemplateItemAssigneeIds(item);
}

function resolveSxAssigneeForTemplateItem(item, maps) {
  const ids = resolveSxAssigneesForTemplateItem(item, maps);
  return ids[0] || null;
}

module.exports = {
  loadProductionHandoverMaps,
  resolveSxAssigneeForTemplateItem,
  resolveSxAssigneesForTemplateItem,
  resolveProductionCompanyAdminUserId,
  resolveProductionHandoverResponsibleUserId,
  resolveProductionDeliveryConfirmUserId,
  assignProductionCompanyDealResponsibility,
};
