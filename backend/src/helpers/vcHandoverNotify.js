/**
 * Thông báo khi deal/dự án chuyển từ Sản xuất sang Vận chuyển & Lắp đặt.
 * Không phụ thuộc DISABLE_PRODUCTION_PUSH_NOTIFICATIONS.
 */

const { supabase } = require('../config/supabase');
const { notifyMultiple } = require('./notifications');
const {
  resolveLogisticsHandoverResponsibleUserId,
  resolveLogisticsHandoverInstallerUserId,
} = require('./logisticsHandoverSettings');

const ENABLE_VC_HANDOVER_NOTIFICATIONS = true;

async function collectVcHandoverRecipientIds({
  logisticsCompanyId = null,
  projectId = null,
  excludeUserId = null,
}) {
  const ids = new Set();

  if (logisticsCompanyId) {
    try {
      const responsibleId = await resolveLogisticsHandoverResponsibleUserId(logisticsCompanyId);
      const installerId = await resolveLogisticsHandoverInstallerUserId(logisticsCompanyId);
      if (responsibleId) ids.add(String(responsibleId));
      if (installerId) ids.add(String(installerId));
    } catch (e) {
      console.warn('[vc-handover-notify] handover settings:', e.message);
    }
  }

  if (projectId) {
    try {
      const { data: proj } = await supabase
        .from('projects')
        .select('logistics_person_id, installer_person_id, production_person_id')
        .eq('id', projectId)
        .maybeSingle();
      for (const uid of [proj?.logistics_person_id, proj?.installer_person_id, proj?.production_person_id]) {
        if (uid) ids.add(String(uid));
      }

      const { data: deals } = await supabase
        .from('crm_leads')
        .select('assigned_to, lead_owner_id')
        .eq('project_id', projectId)
        .eq('type', 'deal');
      for (const d of deals || []) {
        if (d.assigned_to) ids.add(String(d.assigned_to));
        if (d.lead_owner_id) ids.add(String(d.lead_owner_id));
      }
    } catch (e) {
      console.warn('[vc-handover-notify] project/deal lookup:', e.message);
    }
  }

  try {
    let q = supabase
      .from('users')
      .select('id')
      .in('role', ['logistics_admin', 'logistics', 'installer', 'manager'])
      .eq('is_active', true);
    if (logisticsCompanyId) q = q.eq('company_id', logisticsCompanyId);
    const { data: roleUsers } = await q;
    for (const u of roleUsers || []) {
      if (u?.id) ids.add(String(u.id));
    }
  } catch (e) {
    console.warn('[vc-handover-notify] role users:', e.message);
  }

  const ex = excludeUserId ? String(excludeUserId) : null;
  return [...ids].filter((id) => id && id !== ex);
}

async function notifyVcHandoverFromSx(req, {
  projectId,
  projectCode,
  projectName,
  logisticsCompanyId = null,
  actorUserId = null,
  manual = false,
} = {}) {
  if (!ENABLE_VC_HANDOVER_NOTIFICATIONS || !req || !projectId) return;

  try {
    const recipientIds = await collectVcHandoverRecipientIds({
      logisticsCompanyId,
      projectId,
      excludeUserId: actorUserId,
    });
    if (!recipientIds.length) return;

    const code = projectCode || projectName || 'mới';
    const title = manual
      ? '🚚 Vận chuyển: Deal bàn giao từ Xưởng'
      : '🚚 Vận chuyển: Deal mới từ Xưởng';
    const message = manual
      ? `Dự án ${code} đã bàn giao sang Vận chuyển & Lắp đặt`
      : `Dự án ${code} đã hoàn thành sản xuất, chuyển sang Vận chuyển & Lắp đặt`;

    await notifyMultiple(
      req,
      recipientIds,
      'workshop_new_deal',
      title,
      message,
      'project',
      projectId,
      {
        ecosystem_module_key: 'logistics',
        project_id: String(projectId),
        project_code: projectCode || null,
        project_name: projectName || null,
        nav_tab: 'kanban',
        vc_handover: true,
      },
    );
  } catch (e) {
    console.warn('[vc-handover-notify]', e.message);
  }
}

module.exports = {
  ENABLE_VC_HANDOVER_NOTIFICATIONS,
  collectVcHandoverRecipientIds,
  notifyVcHandoverFromSx,
};
