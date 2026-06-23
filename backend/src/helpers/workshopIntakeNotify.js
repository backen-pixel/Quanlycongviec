/**
 * Thông báo + socket realtime khi deal mới vào cột «Chờ vào xưởng» (tiếp nhận).
 */

const { supabase } = require('../config/supabase');
const { notifyMultiple } = require('./notifications');
const { emitCrmBadgeUpdateForProject } = require('./workshopKanban');
const { invalidateTags: rcInvalidateTags } = require('../middleware/responseCache');

/**
 * Gửi thông báo workshop_new_deal cho NV sản xuất / quản lý (không phụ thuộc DISABLE_PRODUCTION_PUSH).
 */
async function notifyWorkshopIntakeNewDeal({
  req,
  projectId,
  projectCode,
  projectName,
  dealTitle,
  actorUserId,
}) {
  if (!req || !projectId) return;

  try {
    const { data: users } = await supabase
      .from('users')
      .select('id')
      .in('role', ['production', 'manager', 'admin'])
      .eq('is_active', true);
    const recipientIds = (users || [])
      .map((u) => u.id)
      .filter((uid) => uid && String(uid) !== String(actorUserId));
    if (!recipientIds.length) return;

    const code = projectCode || projectName || 'mới';
    const title = '🏭 Deal mới chờ tiếp nhận';
    const message = `Dự án ${code} — "${dealTitle || projectName || 'Deal mới'}" vừa vào Chờ vào xưởng`;

    await notifyMultiple(
      req,
      recipientIds,
      'workshop_new_deal',
      title,
      message,
      'project',
      projectId,
      {
        ecosystem_module_key: 'production',
        project_id: String(projectId),
        project_code: projectCode || null,
        project_name: projectName || null,
        nav_tab: 'kanban',
        intake: true,
      },
    );
  } catch (e) {
    console.warn('[workshop-intake-notify]', e.message);
  }
}

/**
 * Cập nhật Kanban realtime: badge CRM + sự kiện board (mobile/web).
 */
async function emitProductionBoardRealtime(projectId, io, reason = 'intake') {
  if (!projectId) return;
  const pid = String(projectId);
  try {
    if (io) {
      await emitCrmBadgeUpdateForProject(pid, io);
      io.emit('production:board_changed', { project_id: pid, reason });
      io.emit('crm:dashboard_changed', { project_id: pid, reason });
    }
  } catch (e) {
    console.warn('[workshop-intake-notify] socket:', e.message);
  }
  try {
    void rcInvalidateTags(['production', 'crm']);
  } catch (_) { /* ignore */ }
}

module.exports = {
  notifyWorkshopIntakeNewDeal,
  emitProductionBoardRealtime,
};
