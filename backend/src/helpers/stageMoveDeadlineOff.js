/**
 * Chuyển tới cột mốc của module thì tắt deadline module đó,
 * ghi một dòng bình luận và một dòng lịch sử (comment hệ thống).
 */

const { supabase } = require('../config/supabase');
const { logDealActivityComment } = require('./projectFileActivity');
const { logKanbanDeadlineUnifiedHistory } = require('./crmKanbanDeadlineHistory');

const NOTICE = 'Đã tắt deadline do chuyển trạng thái';

function noticeBody(moduleLabel, stageName) {
  const where = stageName ? ` sang «${stageName}»` : '';
  return `${NOTICE} (${moduleLabel}${where}).`;
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
  if (error || !lead || lead.deadline_disabled_at) return { cleared: false };

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
  return { cleared: true };
}

/** Sản xuất: cột tích VC/LĐ. */
function sxColumnIsVcHandover(stage) {
  return stage?.is_handover_to_logistics === true;
}

async function turnOffSxDeadlineOnVcHandover(req, { projectId, stage, hadDeadline }) {
  if (!projectId || !sxColumnIsVcHandover(stage) || !hadDeadline) return { cleared: false };
  await postDeadlineOffNotice(req, {
    projectId,
    moduleLabel: 'Sản xuất',
    stageName: stage?.name,
  });
  return { cleared: true };
}

/** VC/LĐ: cột tích Xong / Hoàn thành. */
function vcColumnTurnsOffDeadline(stage) {
  if (!stage) return false;
  if (stage.clears_deadline) return true;
  return String(stage.dashboard_kpi || '').trim() === 'completed';
}

async function turnOffVcDeadlineOnCompletedColumn(req, { projectId, stage, hadDeadline }) {
  if (!projectId || !vcColumnTurnsOffDeadline(stage) || !hadDeadline) return { cleared: false };
  await postDeadlineOffNotice(req, {
    projectId,
    moduleLabel: 'VC/LĐ',
    stageName: stage?.name,
  });
  return { cleared: true };
}

module.exports = {
  NOTICE,
  sxColumnIsVcHandover,
  vcColumnTurnsOffDeadline,
  turnOffCrmDeadlineOnCompletedStage,
  turnOffSxDeadlineOnVcHandover,
  turnOffVcDeadlineOnCompletedColumn,
};
