/**
 * Core mutations cho crm_tasks — dùng chung từ /api/crm và /api/work-tasks gateway.
 */
const { supabase } = require('../config/supabase');
const { crmTaskMeetsCompletionRequirements, crmTaskRequiresCompletionEvidence } = require('./crmTaskCompletionEvidence');
const { createNotification } = require('./notifications');
const { attachAssigneesToCrmTasks, replaceCrmTaskAssignees } = require('./crmTaskAssignees');
const { syncAssignmentFromCrmTask } = require('./crmTaskAssignmentSync');
const {
  notifyNewCrmAssignmentAssignees,
  resolveAssignmentIdForTask,
} = require('./crmAssignmentNotifications');
const { isAdminLike } = require('./adminRole');
const {
  ecosystemModuleKeyForCrmDeadline,
  crmTaskDeadlineModuleKey,
  filterUserIdsForCrmLeadScopedNotification,
} = require('./deadlineModuleNotifications');

function normalizeTimestamp(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function resolveCrmTaskWriteLeadId(routeLeadId) {
  const { data: leadRow } = await supabase
    .from('crm_leads')
    .select('use_order_tasks, parent_lead_id')
    .eq('id', routeLeadId)
    .maybeSingle();
  if (!leadRow?.use_order_tasks || leadRow.parent_lead_id) return routeLeadId;
  const { data: ords } = await supabase
    .from('orders')
    .select('fulfillment_lead_id')
    .eq('lead_id', routeLeadId)
    .not('fulfillment_lead_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(1);
  const fid = ords?.[0]?.fulfillment_lead_id;
  return fid ? String(fid) : routeLeadId;
}

const CRM_TASK_SELECT = '*, assignee:users!crm_tasks_assignee_id_fkey(id,full_name,avatar), supervisor:users!crm_tasks_supervisor_id_fkey(id,full_name,avatar)';

async function createCrmLeadTask(req, leadId, body) {
  const b = body;
  const targetLeadId = await resolveCrmTaskWriteLeadId(leadId);
  let pipelineStageId = b.pipeline_stage_id || null;
  if (!pipelineStageId) {
    const { data: leadRow } = await supabase.from('crm_leads').select('stage_id').eq('id', targetLeadId).maybeSingle();
    pipelineStageId = leadRow?.stage_id || null;
  }
  const rawAssigneeIds = Array.isArray(b.assignee_ids)
    ? b.assignee_ids.filter(Boolean).map(String)
    : (b.assignee_id ? [String(b.assignee_id)] : []);
  const primaryAssignee = rawAssigneeIds[0] || null;

  let { data, error } = await supabase.from('crm_tasks').insert({
    lead_id: targetLeadId,
    title: b.title,
    description: b.description || null,
    status: b.status || 'pending',
    priority: b.priority || 'medium',
    stage_slug: b.stage_slug || null,
    pipeline_stage_id: pipelineStageId,
    order_index: b.order_index || 0,
    assignee_id: primaryAssignee,
    supervisor_id: b.supervisor_id || null,
    deadline: b.deadline ? normalizeTimestamp(b.deadline) : null,
    created_by: req.user.userId,
    completion_requires_file_or_note: !!b.completion_requires_file_or_note,
    completion_requires_customer_note: !!b.completion_requires_customer_note,
    completion_requires_customer_contact: !!b.completion_requires_customer_contact,
    blocks_stage_advance: isAdminLike(req.user) ? !!b.blocks_stage_advance : false,
    show_excel_quotation_upload: !!b.show_excel_quotation_upload,
  }).select(CRM_TASK_SELECT).single();
  if (error) return { error: error.message, status: 500 };

  if (rawAssigneeIds.length) {
    await replaceCrmTaskAssignees(data.id, rawAssigneeIds);
    [data] = await attachAssigneesToCrmTasks([data]);
  } else {
    data.assignees = [];
  }

  let assignmentId = null;
  try {
    const sync = await syncAssignmentFromCrmTask(req, data, rawAssigneeIds);
    assignmentId = sync?.assignmentId || null;
    if (assignmentId) data.crm_assignment_id = assignmentId;
  } catch (syncErr) {
    console.warn('[sync] crm_task→assignment create:', syncErr.message);
  }

  try {
    const { data: leadSnap } = await supabase.from('crm_leads')
      .select('id, code, title, company_id, region_id')
      .eq('id', targetLeadId)
      .maybeSingle();
    const notifyAssignmentId = assignmentId
      || await resolveAssignmentIdForTask(data.id, targetLeadId, data.title);
    if (notifyAssignmentId && rawAssigneeIds.length) {
      await notifyNewCrmAssignmentAssignees(req, {
        assignmentId: notifyAssignmentId,
        title: data.title,
        userIds: rawAssigneeIds,
        lead: leadSnap,
        deadline: data.deadline,
        stageSlug: data.stage_slug,
        crmTaskId: data.id,
      });
    } else if (rawAssigneeIds.length) {
      const notifyIds = rawAssigneeIds.filter((uid) => String(uid) !== String(req.user.userId));
      const eco = ecosystemModuleKeyForCrmDeadline(crmTaskDeadlineModuleKey(data.stage_slug));
      const okAssignees = await filterUserIdsForCrmLeadScopedNotification(
        supabase, leadSnap || {}, notifyIds, eco,
      );
      for (const uid of okAssignees) {
        await createNotification(req, uid, 'crm_task_assigned',
          '📌 Nhiệm vụ CRM mới', `Bạn được giao: "${data.title}"`, 'crm_task', data.id,
          { lead_id: targetLeadId, nav_tab: 'tasks' });
      }
    }
  } catch (ne) { console.warn('[NOTIFY] crm_task_created:', ne.message); }

  return { data, status: 201, leadId: targetLeadId };
}

async function updateCrmLeadTask(req, leadId, taskId, body) {
  const b = body;
  if (b.status === 'completed') {
    const { data: prior, error: pErr } = await supabase
      .from('crm_tasks')
      .select('id,status,notes,completion_requires_file_or_note,completion_requires_customer_note,completion_requires_customer_contact')
      .eq('id', taskId).maybeSingle();
    if (pErr) return { error: pErr.message, status: 500 };
    if (prior && prior.status !== 'completed' && crmTaskRequiresCompletionEvidence(prior)) {
      const ok = await crmTaskMeetsCompletionRequirements(supabase, taskId, prior);
      if (!ok) {
        return {
          error: 'Nhiệm vụ này yêu cầu ghi chú khách hàng và/hoặc minh chứng liên hệ trước khi hoàn thành.',
          code: 'crm_task_completion_requires_evidence',
          status: 400,
        };
      }
    }
  }

  const { data: priorRow } = await supabase.from('crm_tasks')
    .select('assignee_id, blocks_stage_advance')
    .eq('id', taskId).maybeSingle();
  let priorAssigneeIds = [];
  if (Array.isArray(b.assignee_ids)) {
    const { data: priorRows } = await supabase
      .from('crm_task_assignees')
      .select('user_id')
      .eq('task_id', taskId);
    priorAssigneeIds = (priorRows || []).map((r) => String(r.user_id));
    if (!priorAssigneeIds.length && priorRow?.assignee_id) {
      priorAssigneeIds = [String(priorRow.assignee_id)];
    }
  }

  const update = { updated_at: new Date().toISOString() };
  const fields = ['title', 'description', 'status', 'priority', 'stage_slug', 'order_index',
    'assignee_id', 'supervisor_id', 'deadline', 'shared_to_project', 'show_excel_quotation_upload'];
  fields.forEach((f) => {
    if (b[f] === undefined) return;
    if (f === 'deadline' && b[f] != null && b[f] !== '') update[f] = normalizeTimestamp(b[f]);
    else update[f] = b[f];
  });
  if (isAdminLike(req.user) && b.blocks_stage_advance !== undefined) {
    update.blocks_stage_advance = !!b.blocks_stage_advance;
  }
  if (Array.isArray(b.assignee_ids)) {
    const ids = b.assignee_ids.filter(Boolean).map(String);
    update.assignee_id = ids[0] || null;
  }
  if (b.status === 'completed' && !b.completed_at) update.completed_at = new Date().toISOString();
  if (b.status && b.status !== 'completed') update.completed_at = null;

  let { data, error } = await supabase.from('crm_tasks').update(update)
    .eq('id', taskId).select(CRM_TASK_SELECT).single();
  if (error) return { error: error.message, status: 500 };

  let newAssigneeIds = null;
  if (Array.isArray(b.assignee_ids)) {
    newAssigneeIds = await replaceCrmTaskAssignees(taskId, b.assignee_ids);
    [data] = await attachAssigneesToCrmTasks([data]);
  } else {
    data.assignees = data.assignee ? [data.assignee] : [];
  }

  const assigneeIdsForSync = Array.isArray(b.assignee_ids)
    ? b.assignee_ids.filter(Boolean).map(String)
    : (data.assignees || []).map((u) => String(u.id)).filter(Boolean);
  let assignmentId = null;
  try {
    const sync = await syncAssignmentFromCrmTask(req, data, assigneeIdsForSync);
    assignmentId = sync?.assignmentId || null;
    if (assignmentId) data.crm_assignment_id = assignmentId;
  } catch (syncErr) {
    console.warn('[sync] crm_task→assignment update:', syncErr.message);
  }

  if (Array.isArray(b.assignee_ids) && assignmentId) {
    const priorSet = new Set(priorAssigneeIds.map(String));
    const added = assigneeIdsForSync.filter((uid) => !priorSet.has(String(uid)));
    if (added.length) {
      try {
        const { data: leadSnap } = await supabase.from('crm_leads')
          .select('id, code, title, company_id, region_id')
          .eq('id', data.lead_id)
          .maybeSingle();
        await notifyNewCrmAssignmentAssignees(req, {
          assignmentId,
          title: data.title,
          userIds: added,
          lead: leadSnap,
          deadline: data.deadline,
          stageSlug: data.stage_slug,
          crmTaskId: data.id,
        });
      } catch (ne) {
        console.warn('[NOTIFY] crm_assignment assignees:', ne.message);
      }
    }
  }

  return {
    data,
    status: 200,
    leadId,
    priorAssigneeId: priorRow?.assignee_id,
    priorAssigneeIds,
    newAssigneeIds,
  };
}

async function deleteCrmLeadTask(req, taskId) {
  const { data: task } = await supabase.from('crm_tasks').select('id, lead_id').eq('id', taskId).maybeSingle();
  if (!task) return { error: 'Không tìm thấy nhiệm vụ CRM', status: 404 };
  const { error } = await supabase.from('crm_tasks').delete().eq('id', taskId);
  if (error) return { error: error.message, status: 500 };
  return { data: { message: 'Đã xóa', lead_id: task.lead_id }, status: 200 };
}

async function getCrmTaskLeadId(taskId) {
  const { data } = await supabase.from('crm_tasks').select('lead_id').eq('id', taskId).maybeSingle();
  return data?.lead_id || null;
}

module.exports = {
  resolveCrmTaskWriteLeadId,
  createCrmLeadTask,
  updateCrmLeadTask,
  deleteCrmLeadTask,
  getCrmTaskLeadId,
};
