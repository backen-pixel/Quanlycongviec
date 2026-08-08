/**
 * Thông báo module Vận chuyển & Lắp đặt — chặt chẽ theo người nhận:
 * người tham gia dự án / deal + NV VC cùng công ty logistics.
 */

const { supabase } = require('../config/supabase');
const { notifyMultiple } = require('./notifications');
const {
  resolveLogisticsHandoverResponsibleUserId,
  resolveLogisticsHandoverInstallerUserId,
} = require('./logisticsHandoverSettings');

const VC_ROLE_BLAST = ['logistics_admin', 'logistics', 'installer', 'manager'];

async function getTeamMemberIds(teamId) {
  if (!teamId) return [];
  try {
    const { data } = await supabase
      .from('workshop_team_members')
      .select('user_id')
      .eq('team_id', teamId);
    return (data || []).map((m) => m.user_id).filter(Boolean).map(String);
  } catch {
    return [];
  }
}

/**
 * Người nhận TB VC cho 1 dự án.
 * - Thành viên: phụ trách VC/LĐ, đội giao/lắp, task assignees, lead_members, owner deal
 * - Role blast: chỉ cùng logistics_company_id (không spam toàn hệ thống)
 */
async function collectVcProjectNotifyRecipientIds({
  projectId = null,
  logisticsCompanyId = null,
  excludeUserId = null,
  includeRoleBlast = true,
} = {}) {
  const ids = new Set();
  let resolvedCompanyId = logisticsCompanyId ? String(logisticsCompanyId) : null;

  if (projectId) {
    try {
      const { data: proj } = await supabase
        .from('projects')
        .select(`
          logistics_person_id, installer_person_id, production_person_id, responsible_person_id,
          created_by, delivery_team_id, installation_team_id,
          company_id, logistics_company_id
        `)
        .eq('id', projectId)
        .maybeSingle();

      if (!resolvedCompanyId) {
        resolvedCompanyId = proj?.logistics_company_id
          ? String(proj.logistics_company_id)
          : (proj?.company_id ? String(proj.company_id) : null);
      }

      for (const uid of [
        proj?.logistics_person_id,
        proj?.installer_person_id,
        proj?.production_person_id,
        proj?.responsible_person_id,
        proj?.created_by,
      ]) {
        if (uid) ids.add(String(uid));
      }

      const teamIds = [proj?.delivery_team_id, proj?.installation_team_id].filter(Boolean);
      for (const tid of teamIds) {
        const members = await getTeamMemberIds(tid);
        members.forEach((uid) => ids.add(uid));
      }

      const { data: deals } = await supabase
        .from('crm_leads')
        .select('id, assigned_to, lead_owner_id')
        .eq('project_id', projectId)
        .eq('type', 'deal');

      const leadIds = [];
      for (const d of deals || []) {
        if (d.assigned_to) ids.add(String(d.assigned_to));
        if (d.lead_owner_id) ids.add(String(d.lead_owner_id));
        if (d.id) leadIds.push(String(d.id));
      }

      if (leadIds.length) {
        const { data: members } = await supabase
          .from('lead_members')
          .select('user_id')
          .in('lead_id', leadIds);
        for (const m of members || []) {
          if (m?.user_id) ids.add(String(m.user_id));
        }
      }

      const { data: taskAssignees } = await supabase
        .from('tasks')
        .select('assignee_id')
        .eq('project_id', projectId)
        .not('assignee_id', 'is', null)
        .limit(200);
      for (const t of taskAssignees || []) {
        if (t?.assignee_id) ids.add(String(t.assignee_id));
      }
    } catch (e) {
      console.warn('[vc-logistics-notify] project audience:', e.message);
    }
  }

  if (includeRoleBlast && resolvedCompanyId) {
    try {
      const responsibleId = await resolveLogisticsHandoverResponsibleUserId(resolvedCompanyId);
      const installerId = await resolveLogisticsHandoverInstallerUserId(resolvedCompanyId);
      if (responsibleId) ids.add(String(responsibleId));
      if (installerId) ids.add(String(installerId));
    } catch (e) {
      console.warn('[vc-logistics-notify] handover settings:', e.message);
    }

    try {
      const { data: roleUsers } = await supabase
        .from('users')
        .select('id')
        .in('role', VC_ROLE_BLAST)
        .eq('is_active', true)
        .eq('company_id', resolvedCompanyId);
      for (const u of roleUsers || []) {
        if (u?.id) ids.add(String(u.id));
      }
    } catch (e) {
      console.warn('[vc-logistics-notify] role users:', e.message);
    }
  }

  const ex = excludeUserId ? String(excludeUserId) : null;
  return [...ids].filter((id) => id && id !== ex);
}

/** Map cột VC → focus_kpi cho deep-link app. */
function focusKpiFromVcStage(stageRow = {}, { isIntake = false } = {}) {
  if (isIntake) return 'intake';
  const name = String(stageRow.name || '').toLowerCase();
  const slug = String(stageRow.bucket_slug || stageRow.slug || '').toLowerCase();
  if (slug === 'delivery_pending' || name.includes('chờ vc') || name.includes('chờ vận') || name.includes('tiếp nhận')) {
    return 'intake';
  }
  if (slug === 'delivered' || slug === 'delivery_done' || name.includes('đã giao') || name.includes('da giao')) {
    return 'delivered';
  }
  if (
    slug === 'customer-care'
    || slug.includes('warranty')
    || name.includes('bảo hành')
    || name.includes('có vấn đề')
    || name.includes('vấn đề')
  ) {
    return 'warranty';
  }
  if (
    slug.includes('acceptance')
    || name.includes('nghiệm thu')
    || (name.includes('bàn giao') && !name.includes('chờ'))
  ) {
    return 'acceptance';
  }
  if (slug === 'completed' || name.includes('hoàn thiện') || name.includes('hoàn thành') || name.includes('hoàn tất')) {
    return 'completed';
  }
  if (
    slug === 'installation'
    || name.includes('lắp đặt')
    || name.includes('lap dat')
    || Boolean(stageRow.is_install)
  ) {
    return 'installing';
  }
  if (
    slug === 'delivery'
    || slug === 'shipping'
    || name.includes('đang vận chuyển')
    || name.includes('đang giao')
  ) {
    return 'shipping';
  }
  return 'shipping';
}

/**
 * Thông báo khi dự án vào / quay về «Chờ vận chuyển».
 * type logistics_stage_changed (đã có trong filter VC) + metadata.intake.
 */
async function notifyLogisticsIntakePending(req, {
  projectId,
  projectCode,
  projectName,
  logisticsCompanyId = null,
  actorUserId = null,
  stageId = null,
  stageName = 'Chờ vận chuyển',
  reason = 'move_to_intake',
} = {}) {
  if (!req || !projectId) return;
  try {
    const recipientIds = await collectVcProjectNotifyRecipientIds({
      projectId,
      logisticsCompanyId,
      excludeUserId: actorUserId,
      includeRoleBlast: true,
    });
    if (!recipientIds.length) return;

    const code = projectCode || projectName || 'mới';
    const label = stageName || 'Chờ vận chuyển';
    await notifyMultiple(
      req,
      recipientIds,
      'logistics_stage_changed',
      `🚚 Chờ vận chuyển · ${code}`,
      `Dự án ${code} vừa vào cột «${label}»`,
      'project',
      projectId,
      {
        ecosystem_module_key: 'logistics',
        project_id: String(projectId),
        project_code: projectCode || null,
        project_name: projectName || null,
        nav_tab: 'kanban',
        intake: true,
        vc_intake: true,
        stage_name: label,
        vc_stage_id: stageId || null,
        focus_kpi: 'intake',
        reason,
      },
    );
  } catch (e) {
    console.warn('[vc-logistics-notify] intake:', e.message);
  }
}

/**
 * Thông báo khi chuyển cột Kanban VC / Lắp đặt.
 */
async function notifyLogisticsStageChanged(req, {
  projectId,
  projectCode,
  projectName,
  logisticsCompanyId = null,
  actorUserId = null,
  stageRow = null,
  stageName = null,
  stageId = null,
  isIntake = false,
  jumpedToInstall = false,
} = {}) {
  if (!req || !projectId) return;
  try {
    if (isIntake) {
      await notifyLogisticsIntakePending(req, {
        projectId,
        projectCode,
        projectName,
        logisticsCompanyId,
        actorUserId,
        stageId,
        stageName: stageName || stageRow?.name || 'Chờ vận chuyển',
        reason: 'column_intake',
      });
      return;
    }

    const recipientIds = await collectVcProjectNotifyRecipientIds({
      projectId,
      logisticsCompanyId,
      excludeUserId: actorUserId,
      includeRoleBlast: true,
    });
    if (!recipientIds.length) return;

    const label = String(
      stageName
      || stageRow?.name
      || 'cột mới',
    ).trim() || 'cột mới';
    const focusKpi = focusKpiFromVcStage(
      { ...(stageRow || {}), name: label, is_install: jumpedToInstall },
      { isIntake: false },
    );
    const code = projectCode || projectName || 'dự án';
    const titlePrefix = jumpedToInstall ? '🔧 Lắp đặt' : '🚚 VC';

    await notifyMultiple(
      req,
      recipientIds,
      'logistics_stage_changed',
      `${titlePrefix}: ${label}`,
      `Dự án ${code} vừa chuyển sang «${label}»`,
      'project',
      projectId,
      {
        ecosystem_module_key: 'logistics',
        project_id: String(projectId),
        project_code: projectCode || null,
        project_name: projectName || null,
        nav_tab: 'kanban',
        stage_name: label,
        vc_stage_id: stageId || stageRow?.id || null,
        bucket_slug: stageRow?.bucket_slug || null,
        focus_kpi: focusKpi,
        jumped_to_install: Boolean(jumpedToInstall),
      },
    );
  } catch (e) {
    console.warn('[vc-logistics-notify] stage:', e.message);
  }
}

module.exports = {
  collectVcProjectNotifyRecipientIds,
  focusKpiFromVcStage,
  notifyLogisticsIntakePending,
  notifyLogisticsStageChanged,
};
