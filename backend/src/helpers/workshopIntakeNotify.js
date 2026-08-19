/**
 * Thông báo + socket realtime Kanban SX (tiếp nhận, kéo cột, deadline…).
 */

const { supabase } = require('../config/supabase');
const { notifyMultiple, getCompanyScopedRoleUserIds } = require('./notifications');
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

async function resolveProjectCompanyIds(projectId) {
  if (!projectId) return [];
  try {
    const { data } = await supabase
      .from('projects')
      .select('company_id, logistics_company_id')
      .eq('id', projectId)
      .maybeSingle();
    return [...new Set(
      [data?.company_id, data?.logistics_company_id].filter(Boolean).map(String),
    )];
  } catch {
    return [];
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

    const recipientIds = (await getCompanyScopedRoleUserIds(companyId, INTAKE_NOTIFY_ROLES))
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
        company_id: companyId,
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
  logisticsCompanyId = null,
  alsoCompanyIds = null,
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
  const knownCids = [...new Set(
    [
      companyId,
      logisticsCompanyId,
      project?.company_id,
      project?.logistics_company_id,
      ...(Array.isArray(alsoCompanyIds) ? alsoCompanyIds : []),
    ].filter(Boolean).map(String),
  )];

  const fire = (cids) => {
    const list = (Array.isArray(cids) ? cids : [cids]).filter(Boolean);
    if (!list.length) {
      emitScoped(io, { companyId: null }, 'production:board_changed', base);
      emitScoped(io, { companyId: null }, 'project:stage_changed', stagePayload);
      return;
    }
    for (const cid of list) {
      const scope = { companyId: cid };
      emitScoped(io, scope, 'production:board_changed', base);
      emitScoped(io, scope, 'project:stage_changed', stagePayload);
    }
  };

  if (knownCids.length) {
    fire(knownCids);
    return;
  }
  void resolveProjectCompanyIds(pid).then(fire).catch(() => fire([]));
}

/**
 * Bàn giao SX → VC/LĐ: báo Kanban cả xưởng SX và công ty VC đã chọn.
 */
function emitLogisticsKanbanChangedImmediate(io, {
  projectId,
  reason = 'vc_handover',
  project = null,
  companyId = null,
  logisticsCompanyId = null,
  vcKanbanColumnId = null,
  vcBucketSlug = null,
} = {}) {
  if (!io || !projectId) return;
  const pid = String(projectId);
  const payload = {
    ...(project && typeof project === 'object' ? project : {}),
    id: pid,
    project_id: pid,
    reason,
    status: project?.status || 'shipping',
    company_id: companyId || project?.company_id || null,
    logistics_company_id: logisticsCompanyId || project?.logistics_company_id || null,
    vc_kanban_column_id: vcKanbanColumnId
      || project?.vc_kanban_column_id
      || null,
    vc_bucket_slug: vcBucketSlug
      || project?.vc_bucket_slug
      || project?.bucket_slug
      || null,
  };
  const companyIds = [...new Set(
    [payload.company_id, payload.logistics_company_id].filter(Boolean).map(String),
  )];

  const fire = (cids) => {
    const list = (cids && cids.length) ? cids : [null];
    for (const cid of list) {
      const scope = { companyId: cid };
      emitScoped(io, scope, 'logistics:board_changed', payload);
      emitScoped(io, scope, 'project:stage_changed', payload);
      emitScoped(io, scope, 'production:board_changed', {
        project_id: pid,
        id: pid,
        reason,
      });
    }
  };

  if (companyIds.length) {
    fire(companyIds);
    try { void rcInvalidateTags(['production', 'logistics', 'crm']); } catch (_) { /* ignore */ }
    return;
  }
  void resolveProjectCompanyIds(pid)
    .then((ids) => {
      fire(ids);
      try { void rcInvalidateTags(['production', 'logistics', 'crm']); } catch (_) { /* ignore */ }
    })
    .catch(() => fire([]));
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
      // Emit theo từng deal để CRM/mobile cập nhật cột ngay (không chỉ badge)
      try {
        const { data: leads } = await supabase
          .from('crm_leads')
          .select('id, stage_id, company_id, type')
          .eq('project_id', pid)
          .eq('type', 'deal');
        for (const lead of leads || []) {
          const cid = lead.company_id || companyId;
          emitScoped(io, { companyId: cid }, 'crm:dashboard_changed', {
            lead_id: String(lead.id),
            action: 'stage_changed',
            stage_id: lead.stage_id ? String(lead.stage_id) : null,
            type: 'deal',
            company_id: cid,
            project_id: pid,
            reason,
          });
        }
      } catch (perLeadErr) {
        console.warn('[workshop-kanban-realtime] per-lead emit:', perLeadErr.message);
      }
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
  emitLogisticsKanbanChangedImmediate,
};
