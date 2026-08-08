/**
 * Thông báo khi deal/dự án chuyển từ Sản xuất sang Lắp đặt.
 * Không phụ thuộc DISABLE_PRODUCTION_PUSH_NOTIFICATIONS.
 */

const { supabase } = require('../config/supabase');
const { notifyMultiple } = require('./notifications');
const { collectVcProjectNotifyRecipientIds } = require('./vcLogisticsNotify');

const ENABLE_VC_HANDOVER_NOTIFICATIONS = true;

async function collectVcHandoverRecipientIds({
  logisticsCompanyId = null,
  projectId = null,
  excludeUserId = null,
}) {
  return collectVcProjectNotifyRecipientIds({
    projectId,
    logisticsCompanyId,
    excludeUserId,
    includeRoleBlast: true,
  });
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
      ? '🔧 Lắp đặt: Deal bàn giao từ Xưởng'
      : '🔧 Lắp đặt: Deal mới từ Xưởng';
    const message = manual
      ? `Dự án ${code} đã bàn giao sang Lắp đặt`
      : `Dự án ${code} đã hoàn thành sản xuất, chuyển sang Lắp đặt`;

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
        intake: true,
        vc_intake: true,
        stage_name: 'Chờ vận chuyển',
        focus_kpi: 'intake',
      },
    );
  } catch (e) {
    console.warn('[vc-handover-notify]', e.message);
  }
}

/**
 * Notify sale owner + admin CRM khi xưởng đã đóng gói xong → deal auto sang «Đã sản xuất».
 * Recipients: chỉ sale owner của deal + user admin trong cùng company (theo yêu cầu — tránh spam).
 * @param {object} req - Express request (có thể null nếu gọi từ sync nền).
 * @param {object} args
 * @param {object} args.deal - lead row (id, code, title, owner_id, company_id).
 * @param {string} args.projectId
 * @param {object} args.sxStage - production_pipeline_stages row.
 */
async function notifyDealPackagingDone(req, { deal, projectId, sxStage } = {}) {
  if (!deal?.id) return;
  const recipientIds = new Set();

  const ownerId = deal.assigned_to || deal.lead_owner_id || null;
  if (ownerId) recipientIds.add(String(ownerId));

  const companyId = deal.company_id || null;
  if (companyId) {
    try {
      const { data: admins } = await supabase
        .from('users')
        .select('id')
        .eq('is_active', true)
        .eq('company_id', companyId)
        .in('role', ['admin', 'sales_admin']);
      for (const u of admins || []) if (u?.id) recipientIds.add(String(u.id));
    } catch (e) {
      console.warn('[notifyDealPackagingDone] admin lookup:', e.message);
    }
  }

  const ids = [...recipientIds];
  if (!ids.length) return;

  const code = deal.code || deal.title || 'deal';
  const stageName = sxStage?.name || 'Đóng gói';
  const title = '📦 Xưởng đã đóng gói xong';
  const message = `Deal ${code}: xưởng vừa chuyển sang «${stageName}» — vui lòng kéo deal sang «Vận chuyển» và chọn đơn vị VC/lắp đặt + thời gian đi lấy.`;

  try {
    if (req) {
      await notifyMultiple(
        req, ids, 'crm_stage_changed', title, message, 'deal', String(deal.id),
        {
          ecosystem_module_key: 'crm',
          nav_tab: 'kanban',
          lead_id: String(deal.id),
          project_id: projectId ? String(projectId) : null,
          packaging_done: true,
        },
      );
    } else {
      // Chèn trực tiếp — không có req.app để đẩy socket, chấp nhận đợi client tự refresh.
      const rows = ids.map((uid) => ({
        user_id: uid,
        type: 'crm_stage_changed',
        title,
        message,
        entity_type: 'deal',
        entity_id: String(deal.id),
        metadata: {
          ecosystem_module_key: 'crm',
          nav_tab: 'kanban',
          lead_id: String(deal.id),
          project_id: projectId ? String(projectId) : null,
          packaging_done: true,
        },
      }));
      await supabase.from('notifications').insert(rows);
    }
  } catch (e) {
    console.warn('[notifyDealPackagingDone]', e.message);
  }
}

module.exports = {
  ENABLE_VC_HANDOVER_NOTIFICATIONS,
  collectVcHandoverRecipientIds,
  notifyVcHandoverFromSx,
  notifyDealPackagingDone,
};
