const { supabase } = require('../config/supabase');

/** Admin VC/LĐ theo công ty (role logistics_admin + company_id khớp). */
async function resolveLogisticsCompanyAdminUserId(logisticsCompanyId) {
  if (!logisticsCompanyId) return null;
  const { data: admins, error } = await supabase
    .from('users')
    .select('id')
    .eq('role', 'logistics_admin')
    .eq('company_id', logisticsCompanyId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) throw error;
  return admins?.[0]?.id || null;
}

/**
 * @returns {Promise<{ responsibleUserId: string|null, installerUserId: string|null, handoverConfirmUserId: string|null }>}
 */
async function loadLogisticsHandoverMaps(logisticsCompanyId) {
  if (!logisticsCompanyId) {
    return { responsibleUserId: null, installerUserId: null, handoverConfirmUserId: null };
  }
  try {
    const { data: set } = await supabase
      .from('logistics_handover_settings')
      .select('responsible_user_id, installer_user_id, handover_confirm_user_id')
      .eq('logistics_company_id', logisticsCompanyId)
      .maybeSingle();
    return {
      responsibleUserId: set?.responsible_user_id || null,
      installerUserId: set?.installer_user_id || null,
      handoverConfirmUserId: set?.handover_confirm_user_id || null,
    };
  } catch (e) {
    if (String(e.message || '').includes('logistics_handover_settings')
      || String(e.message || '').includes('handover_confirm_user_id')) {
      return { responsibleUserId: null, installerUserId: null, handoverConfirmUserId: null };
    }
    throw e;
  }
}

async function resolveLogisticsHandoverResponsibleUserId(logisticsCompanyId) {
  const maps = await loadLogisticsHandoverMaps(logisticsCompanyId);
  if (maps.responsibleUserId) return maps.responsibleUserId;
  return resolveLogisticsCompanyAdminUserId(logisticsCompanyId);
}

async function resolveLogisticsHandoverInstallerUserId(logisticsCompanyId) {
  const maps = await loadLogisticsHandoverMaps(logisticsCompanyId);
  if (maps.installerUserId) return maps.installerUserId;
  return resolveLogisticsHandoverResponsibleUserId(logisticsCompanyId);
}

/** Người bấm xác nhận phía VC/LĐ — cấu hình riêng, fallback phụ trách VC. */
async function resolveLogisticsHandoverConfirmUserId(logisticsCompanyId, fallbackLogisticsPersonId = null) {
  const maps = await loadLogisticsHandoverMaps(logisticsCompanyId);
  if (maps.handoverConfirmUserId) return maps.handoverConfirmUserId;
  if (fallbackLogisticsPersonId) return fallbackLogisticsPersonId;
  return resolveLogisticsHandoverResponsibleUserId(logisticsCompanyId);
}

module.exports = {
  loadLogisticsHandoverMaps,
  resolveLogisticsCompanyAdminUserId,
  resolveLogisticsHandoverResponsibleUserId,
  resolveLogisticsHandoverInstallerUserId,
  resolveLogisticsHandoverConfirmUserId,
};
