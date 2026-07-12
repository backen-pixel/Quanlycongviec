/**
 * Thông báo + socket realtime Kanban SX (tiếp nhận, kéo cột, deadline…).
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
 * Phát socket ngay sau khi DB ghi xong — client refetch Kanban không chờ sync nền.
 */
function emitProductionKanbanChangedImmediate(io, {
  projectId,
  columnId = null,
  reason = 'kanban',
  project = null,
} = {}) {
  if (!io || !projectId) return;
  const pid = String(projectId);
  const base = {
    project_id: pid,
    id: pid,
    reason,
    sx_kanban_column_id: columnId != null ? String(columnId) : null,
  };
  const stagePayload = project && typeof project === 'object'
    ? { ...project, ...base, project_id: pid, id: pid }
    : base;
  io.emit('production:board_changed', base);
  io.emit('project:stage_changed', stagePayload);
}

/**
 * Đồng bộ badge CRM + dashboard sau khi sync pipeline (chạy nền).
 */
async function emitProductionKanbanChangedAsync(io, projectId, reason = 'kanban_sync') {
  if (!projectId) return;
  const pid = String(projectId);
  try {
    if (io) {
      await emitCrmBadgeUpdateForProject(pid, io);
      io.emit('crm:dashboard_changed', { project_id: pid, reason });
    }
  } catch (e) {
    console.warn('[workshop-kanban-realtime] async:', e.message);
  }
  try {
    void rcInvalidateTags(['production', 'crm']);
  } catch (_) { /* ignore */ }
}

/** Tiếp nhận / tạo đơn — immediate + async. */
async function emitProductionBoardRealtime(projectId, io, reason = 'intake') {
  if (!projectId) return;
  emitProductionKanbanChangedImmediate(io, { projectId, reason });
  await emitProductionKanbanChangedAsync(io, projectId, reason);
}

module.exports = {
  notifyWorkshopIntakeNewDeal,
  emitProductionBoardRealtime,
  emitProductionKanbanChangedImmediate,
  emitProductionKanbanChangedAsync,
};
