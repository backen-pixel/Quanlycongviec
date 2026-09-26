/**
 * Chuyển tới cột mốc của module thì tắt deadline module đó,
 * ghi một dòng bình luận và một dòng lịch sử (comment hệ thống).
 */

const { supabase } = require('../config/supabase');
const { logDealActivityComment } = require('./projectFileActivity');
const { logKanbanDeadlineUnifiedHistory } = require('./crmKanbanDeadlineHistory');

const NOTICE = 'Đã tắt deadline do chuyển trạng thái';
const ON_NOTICE = 'Đã bật lại deadline do chuyển trạng thái';

function noticeBody(moduleLabel, stageName) {
  const where = stageName ? ` sang «${stageName}»` : '';
  return `${NOTICE} (${moduleLabel}${where}).`;
}

async function notifySystemAdminsDeadlineOff(req, { projectId, leadId, moduleLabel, stageName }) {
  try {
    const { getSystemAdminUserIds } = require('./notifications');
    const { ensureDmGroupWithBot, insertGroupBotMessage } = require('./aiBotSender');
    let label = '';
    if (projectId) {
      const { data: project } = await supabase
        .from('projects')
        .select('code, name')
        .eq('id', projectId)
        .maybeSingle();
      if (project) label = [project.code, project.name].filter(Boolean).join(' — ');
    }
    if (!label && leadId) {
      const { data: lead } = await supabase
        .from('crm_leads')
        .select('code, title')
        .eq('id', leadId)
        .maybeSingle();
      if (lead) label = [lead.code, lead.title].filter(Boolean).join(' — ');
    }
    const content = [
      'Hệ thống đã tắt deadline vì chuyển tới cột có tích tắt hạn.',
      `Module: ${moduleLabel || '—'}`,
      `Cột: ${stageName || '—'}`,
      `Dự án: ${label || '—'}`,
    ].join('\n');
    const adminIds = await getSystemAdminUserIds({ activeOnly: true });
    const io = req?.app?.get?.('io') || null;
    for (const adminId of adminIds) {
      const groupId = await ensureDmGroupWithBot(adminId);
      if (!groupId) continue;
      await insertGroupBotMessage(groupId, content, io, { name: 'AI Assistant' });
    }
  } catch (err) {
    console.warn('[stageMoveDeadlineOff] admin bot:', err.message);
  }
}

async function postDeadlineOffNotice(req, { leadId, projectId, moduleLabel, stageName }) {
  const body = noticeBody(moduleLabel, stageName);
  await logDealActivityComment(req, { leadId, projectId, body, commentType: null });
  await logDealActivityComment(req, { leadId, projectId, body, commentType: 'system' });
}

/** CRM: cột tích Hoàn thành. */
async function turnOffCrmDeadlineOnCompletedStage(req, { leadId, stage }) {
  if (!leadId || !stage?.counts_as_completed_revenue) return { cleared: false };
  const { data: lead, error } = await supabase
    .from('crm_leads')
    .select('id, company_id, project_id, stage_id, kanban_deadline_at, deadline_disabled_at')
    .eq('id', leadId)
    .maybeSingle();
  if (error || !lead) return { cleared: false };

  if (lead.project_id) {
    try {
      const { clearAllProjectDeadlinesOnInstallationDone } = require('./completeOpenWorkOnModuleDone');
      await clearAllProjectDeadlinesOnInstallationDone({
        projectIds: [lead.project_id],
        leadIds: [leadId],
        reason: 'CRM kéo vào cột Hoàn thành',
      });
    } catch (clearErr) {
      console.warn('[stageMoveDeadlineOff] clear all modules:', clearErr.message);
    }
  }

  if (lead.deadline_disabled_at) return { cleared: true };

  const now = new Date().toISOString();
  const reason = NOTICE;
  const { error: updErr } = await supabase
    .from('crm_leads')
    .update({
      deadline_disabled_at: now,
      deadline_disabled_reason: reason,
      deadline_disabled_by: req.user?.userId || null,
      kanban_deadline_at: null,
      kanban_deadline_reason: reason,
      updated_at: now,
    })
    .eq('id', leadId);
  if (updErr) {
    console.warn('[stageMoveDeadlineOff] crm:', updErr.message);
    return { cleared: false };
  }

  const { data: openTasks } = await supabase
    .from('crm_tasks')
    .select('id, stage_slug')
    .eq('lead_id', leadId)
    .not('deadline', 'is', null);
  const crmTaskIds = (openTasks || [])
    .filter((t) => {
      const slug = String(t.stage_slug || '');
      return !slug.startsWith('sx_') && !slug.startsWith('vc_') && !slug.startsWith('ld_');
    })
    .map((t) => t.id);
  if (crmTaskIds.length) {
    await supabase.from('crm_tasks').update({ deadline: null, updated_at: now }).in('id', crmTaskIds);
  }

  try {
    await supabase.from('crm_lead_deadline_history').insert({
      lead_id: leadId,
      stage_id: stage?.id || lead.stage_id || null,
      old_deadline_at: lead.kanban_deadline_at || null,
      new_deadline_at: null,
      reason,
      source: 'stage_move',
      changed_by: req.user?.userId || null,
    });
  } catch (histErr) {
    console.warn('[stageMoveDeadlineOff] crm history:', histErr.message);
  }
  await logKanbanDeadlineUnifiedHistory({
    leadId,
    companyId: lead.company_id,
    actorUserId: req.user?.userId,
    oldDeadlineAt: lead.kanban_deadline_at || null,
    newDeadlineAt: null,
    reason,
    source: 'stage_move',
  });
  await postDeadlineOffNotice(req, {
    leadId,
    projectId: lead.project_id,
    moduleLabel: 'CRM',
    stageName: stage?.name,
  });
  await notifySystemAdminsDeadlineOff(req, {
    projectId: lead.project_id,
    leadId,
    moduleLabel: 'CRM',
    stageName: stage?.name,
  });
  return { cleared: true };
}

/** Sản xuất: cột tích VC/LĐ. */
function sxColumnIsVcHandover(stage) {
  return stage?.is_handover_to_logistics === true;
}

async function disableLinkedDealDeadlines(req, { projectId, moduleLabel, stageName }) {
  if (!projectId) return { cleared: false };
  const { data: leads, error } = await supabase
    .from('crm_leads')
    .select('id, company_id, project_id, stage_id, deadline_disabled_at, kanban_deadline_at')
    .eq('project_id', projectId);
  if (error) {
    console.warn('[stageMoveDeadlineOff] linked leads:', error.message);
    return { cleared: false };
  }
  const targets = (leads || []).filter((lead) => !lead.deadline_disabled_at);
  if (!targets.length) return { cleared: false };
  let turnedOff = 0;

  const now = new Date().toISOString();
  const reason = NOTICE;
  const body = noticeBody(moduleLabel, stageName);
  for (const lead of targets) {
    const { error: updErr } = await supabase
      .from('crm_leads')
      .update({
        deadline_disabled_at: now,
        deadline_disabled_reason: reason,
        deadline_disabled_by: req.user?.userId || null,
        kanban_deadline_at: null,
        kanban_deadline_reason: reason,
        updated_at: now,
      })
      .eq('id', lead.id);
    if (updErr) {
      console.warn('[stageMoveDeadlineOff] disable lead:', updErr.message);
      continue;
    }
    try {
      await supabase.from('crm_lead_deadline_history').insert({
        lead_id: lead.id,
        stage_id: lead.stage_id || null,
        old_deadline_at: lead.kanban_deadline_at || null,
        new_deadline_at: null,
        reason,
        source: 'stage_move',
        changed_by: req.user?.userId || null,
      });
    } catch (histErr) {
      console.warn('[stageMoveDeadlineOff] disable history:', histErr.message);
    }
    await logDealActivityComment(req, { leadId: lead.id, projectId, body, commentType: null });
    await logDealActivityComment(req, { leadId: lead.id, projectId, body, commentType: 'system' });
    turnedOff += 1;
  }
  if (turnedOff) {
    await notifySystemAdminsDeadlineOff(req, {
      projectId,
      leadId: targets[0]?.id,
      moduleLabel,
      stageName,
    });
  }
  return { cleared: turnedOff > 0 };
}

async function turnOffSxDeadlineOnVcHandover(req, { projectId, stage, hadDeadline }) {
  if (!projectId || !sxColumnIsVcHandover(stage)) return { cleared: false };
  const disabled = await disableLinkedDealDeadlines(req, {
    projectId,
    moduleLabel: 'Sản xuất',
    stageName: stage?.name,
  });
  if (!disabled.cleared && hadDeadline) {
    await postDeadlineOffNotice(req, {
      projectId,
      moduleLabel: 'Sản xuất',
      stageName: stage?.name,
    });
  }
  return { cleared: true };
}

/** VC/LĐ: cột tích Xong / Hoàn thành. */
function vcColumnTurnsOffDeadline(stage) {
  if (!stage) return false;
  if (stage.clears_deadline) return true;
  return String(stage.dashboard_kpi || '').trim() === 'completed';
}

function foldVi(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

/** Cột VC «Phát sinh» — lệnh /phát sinh chuyển vào đây và bật lại deadline. */
function vcColumnIsIncident(stage) {
  return foldVi(stage?.name).includes('phat sinh');
}

async function turnOnDeadlineOnVcIncident(req, { projectId, stage }) {
  if (!projectId || !vcColumnIsIncident(stage)) return { enabled: false };
  const { data: leads, error } = await supabase
    .from('crm_leads')
    .select('id, company_id, project_id, stage_id, deadline_disabled_at')
    .eq('project_id', projectId);
  if (error) {
    console.warn('[stageMoveDeadlineOff] incident leads:', error.message);
    return { enabled: false };
  }
  const targets = (leads || []).filter((lead) => lead.deadline_disabled_at);
  if (!targets.length) return { enabled: false };

  const now = new Date().toISOString();
  const stageName = stage?.name || 'Phát sinh';
  const body = `${ON_NOTICE} (VC/LĐ sang «${stageName}»).`;
  for (const lead of targets) {
    const { error: updErr } = await supabase
      .from('crm_leads')
      .update({
        deadline_disabled_at: null,
        deadline_disabled_reason: null,
        deadline_disabled_by: null,
        updated_at: now,
      })
      .eq('id', lead.id);
    if (updErr) {
      console.warn('[stageMoveDeadlineOff] incident on:', updErr.message);
      continue;
    }
    try {
      await supabase.from('crm_lead_deadline_history').insert({
        lead_id: lead.id,
        stage_id: lead.stage_id || null,
        old_deadline_at: null,
        new_deadline_at: null,
        reason: ON_NOTICE,
        source: 'stage_move',
        changed_by: req.user?.userId || null,
      });
    } catch (histErr) {
      console.warn('[stageMoveDeadlineOff] incident history:', histErr.message);
    }
    await logDealActivityComment(req, {
      leadId: lead.id,
      projectId,
      body,
      commentType: null,
    });
    await logDealActivityComment(req, {
      leadId: lead.id,
      projectId,
      body,
      commentType: 'system',
    });
  }
  return { enabled: true };
}

async function turnOffVcDeadlineOnCompletedColumn(req, { projectId, stage, hadDeadline }) {
  if (!projectId || !vcColumnTurnsOffDeadline(stage)) return { cleared: false };
  const now = new Date().toISOString();
  const { error: projErr } = await supabase
    .from('projects')
    .update({ deadline: null, updated_at: now })
    .eq('id', projectId);
  if (projErr) console.warn('[stageMoveDeadlineOff] vc project deadline:', projErr.message);

  const disabled = await disableLinkedDealDeadlines(req, {
    projectId,
    moduleLabel: 'VC/LĐ',
    stageName: stage?.name,
  });
  if (!disabled.cleared && hadDeadline) {
    await postDeadlineOffNotice(req, {
      projectId,
      moduleLabel: 'VC/LĐ',
      stageName: stage?.name,
    });
  }
  return { cleared: true };
}

module.exports = {
  NOTICE,
  sxColumnIsVcHandover,
  vcColumnTurnsOffDeadline,
  turnOffCrmDeadlineOnCompletedStage,
  disableLinkedDealDeadlines,
  turnOffSxDeadlineOnVcHandover,
  turnOffVcDeadlineOnCompletedColumn,
  vcColumnIsIncident,
  turnOnDeadlineOnVcIncident,
};
