/**
 * Thông báo + socket realtime Kanban SX (tiếp nhận, kéo cột, deadline…).
 */

const { supabase } = require('../config/supabase');
const { notifyMultiple } = require('./notifications');
const { emitCrmBadgeUpdateForProject } = require('./workshopKanban');
const { invalidateTags: rcInvalidateTags } = require('../middleware/responseCache');
const { emitScoped } = require('./socketEmit');

const INTAKE_NOTIFY_ROLES = [
  'production',
  'production_staff',
  'production_admin',
  'manager',
  'admin',
];

async function resolveProjectCompanyId(projectId) {
  if (!projectId) return null;
  try {
    const { data } = await supabase
      .from('projects')
      .select('company_id, logistics_company_id')
      .eq('id', projectId)
      .maybeSingle();
    return data?.company_id || data?.logistics_company_id || null;
  } catch {
    return null;
  }
}

/**
 * Deal mới chờ tiếp nhận — chỉ NV cùng công ty xưởng (không broadcast toàn hệ thống).
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
    const companyId = await resolveProjectCompanyId(projectId);
    // Không biết công ty xưởng → không broadcast toàn hệ thống (tránh spam).
    if (!companyId) return;

    const { data: users } = await supabase
      .from('users')
      .select('id, company_id, role')
      .in('role', INTAKE_NOTIFY_ROLES)
      .eq('is_active', true)
      .eq('company_id', companyId);
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
        nav_url: `/sx/dashboard?open=${encodeURIComponent(String(projectId))}`,
      },
    );
  } catch (e) {
    console.warn('[workshop-intake-notify]', e.message);
  }
}

/**
 * Phát socket ngay sau khi DB ghi xong — client refetch Kanban không chờ sync nền.
 * @param {object} [opts]
 * @param {string|null} [opts.companyId] — nếu đã biết, tránh query lại
 */
function emitProductionKanbanChangedImmediate(io, {
  projectId,
  columnId = null,
  reason = 'kanban',
  project = null,
  companyId = null,
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
  const knownCid = companyId || project?.company_id || null;

  const fire = (cid) => {
    const scope = { companyId: cid };
    emitScoped(io, scope, 'production:board_changed', base);
    emitScoped(io, scope, 'project:stage_changed', stagePayload);
  };

  if (knownCid) {
    fire(knownCid);
    return;
  }
  void resolveProjectCompanyId(pid).then(fire).catch(() => fire(null));
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
      const companyId = await resolveProjectCompanyId(pid);
      emitScoped(io, { companyId }, 'crm:dashboard_changed', { project_id: pid, reason });
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
  const companyId = await resolveProjectCompanyId(projectId);
  emitProductionKanbanChangedImmediate(io, { projectId, reason, companyId });
  await emitProductionKanbanChangedAsync(io, projectId, reason);
}

module.exports = {
  notifyWorkshopIntakeNewDeal,
  emitProductionBoardRealtime,
  emitProductionKanbanChangedImmediate,
  emitProductionKanbanChangedAsync,
};
