/**
 * Core mutations cho crm_tasks — dùng chung từ /api/crm và /api/work-tasks gateway.
 */
const { supabase } = require('../config/supabase');
const { crmTaskMeetsCompletionRequirements, crmTaskRequiresCompletionEvidence } = require('./crmTaskCompletionEvidence');
const { normalizeQuickVerdictPayload } = require('./taskQuickVerdict');
const { validateChecklistTransition, validateChecklistDoneEvidence } = require('./checklistItemEvidence');
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
const { isExecutorColumnError } = require('./crossCompanyWorkspace');

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

function normalizeTaskExecutorCompanyId(raw, leadCompanyId) {
  if (raw === undefined) return undefined;
  if (raw === '' || raw === null) return null;
  const v = String(raw);
  if (leadCompanyId && v === String(leadCompanyId)) return null;
  return v;
}

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

  const { data: leadSnap } = await supabase.from('crm_leads')
    .select('company_id')
    .eq('id', targetLeadId)
    .maybeSingle();
  const insertRow = {
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
    completion_requires_file_or_note: !!b.completion_requires_file_or_note
      || (Array.isArray(b.required_evidence_file_types) && b.required_evidence_file_types.length > 0),
    required_evidence_file_types: Array.isArray(b.required_evidence_file_types) ? b.required_evidence_file_types : [],
    completion_requires_customer_note: !!b.completion_requires_customer_note,
    completion_requires_customer_contact: !!b.completion_requires_customer_contact,
    requires_quick_verdict: !!b.requires_quick_verdict,
    blocks_stage_advance: isAdminLike(req.user) ? !!b.blocks_stage_advance : false,
    show_excel_quotation_upload: !!b.show_excel_quotation_upload,
  };
  if (b.executor_company_id !== undefined) {
    insertRow.executor_company_id = normalizeTaskExecutorCompanyId(
      b.executor_company_id,
      leadSnap?.company_id,
    );
  }

  let { data, error } = await supabase.from('crm_tasks').insert(insertRow).select(CRM_TASK_SELECT).single();
  if (error && isExecutorColumnError(error)) {
    const { executor_company_id: _e, ...legacy } = insertRow;
    ({ data, error } = await supabase.from('crm_tasks').insert(legacy).select(CRM_TASK_SELECT).single());
  }
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
  let priorEvidenceRow = null;
  if (b.status === 'completed' || Array.isArray(b.checklist)) {
    const { data: prior, error: pErr } = await supabase
      .from('crm_tasks')
      .select('id,status,notes,checklist,completion_requires_file_or_note,required_evidence_file_types,requires_quick_verdict,quick_verdict,quick_verdict_reason,completion_requires_customer_note,completion_requires_customer_contact')
      .eq('id', taskId).maybeSingle();
    if (pErr) return { error: pErr.message, status: 500 };
    priorEvidenceRow = prior;

    if (Array.isArray(b.checklist)) {
      const { data: ckAtts, error: attErr } = await supabase
        .from('crm_task_attachments')
        .select('id, file_url, file_name, mime_type, notes, doc_type, checklist_id')
        .eq('task_id', taskId)
        .limit(200);
      if (attErr) return { error: attErr.message, status: 500 };
      const ckCheck = validateChecklistTransition(prior?.checklist, b.checklist, ckAtts || []);
      if (!ckCheck.ok) {
        return {
          error: `Mục checklist «${ckCheck.itemTitle || ''}»: thiếu minh chứng${ckCheck.missingLabel ? ` (${ckCheck.missingLabel})` : ''}.`,
          code: 'crm_checklist_completion_requires_evidence',
          status: 400,
        };
      }
    }

    if (b.status === 'completed' && prior && prior.status !== 'completed') {
      const nextChecklist = Array.isArray(b.checklist) ? b.checklist : prior.checklist;
      const { data: ckAtts } = await supabase
        .from('crm_task_attachments')
        .select('id, file_url, file_name, mime_type, notes, doc_type, checklist_id')
        .eq('task_id', taskId)
        .limit(200);
      const allCk = validateChecklistDoneEvidence(nextChecklist, ckAtts || []);
      if (!allCk.ok) {
        return {
          error: `Mục checklist «${allCk.itemTitle || ''}»: thiếu minh chứng${allCk.missingLabel ? ` (${allCk.missingLabel})` : ''}.`,
          code: 'crm_checklist_completion_requires_evidence',
          status: 400,
        };
      }
    }

    if (b.status === 'completed' && prior && prior.status !== 'completed' && crmTaskRequiresCompletionEvidence(prior)) {
      const ok = await crmTaskMeetsCompletionRequirements(supabase, taskId, prior);
      if (!ok) {
        const needsQv = prior.requires_quick_verdict && prior.quick_verdict !== 'sufficient';
        return {
          error: needsQv
            ? 'Nhiệm vụ này yêu cầu chọn «Đã đủ» trong ghi chú nhanh trước khi hoàn thành.'
            : 'Nhiệm vụ này yêu cầu ghi chú khách hàng và/hoặc minh chứng liên hệ trước khi hoàn thành.',
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

  const { data: leadRowForExec } = await supabase.from('crm_leads')
    .select('company_id')
    .eq('id', leadId)
    .maybeSingle();

  const update = { updated_at: new Date().toISOString() };
  const fields = ['title', 'description', 'status', 'priority', 'stage_slug', 'order_index',
    'assignee_id', 'supervisor_id', 'deadline', 'shared_to_project', 'show_excel_quotation_upload', 'checklist'];
  fields.forEach((f) => {
    if (b[f] === undefined) return;
    if (f === 'deadline' && b[f] != null && b[f] !== '') update[f] = normalizeTimestamp(b[f]);
    else if (f === 'checklist') update[f] = Array.isArray(b[f]) ? b[f] : [];
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

  if (b.quick_verdict !== undefined) {
    const qv = normalizeQuickVerdictPayload(b, req.user?.userId);
    if (qv?.error) return { error: qv.error, status: 400 };
    if (qv?.patch) Object.assign(update, qv.patch);
  }
  if (b.executor_company_id !== undefined) {
    update.executor_company_id = normalizeTaskExecutorCompanyId(
      b.executor_company_id,
      leadRowForExec?.company_id,
    );
  }

  let { data, error } = await supabase.from('crm_tasks').update(update)
    .eq('id', taskId).select(CRM_TASK_SELECT).single();
  // DB chưa apply migration 308 (cột checklist) → bỏ checklist và thử lại để không vỡ luồng update.
  if (error && String(error.message || '').toLowerCase().includes('checklist')) {
    const { checklist: _dropChecklist, ...legacy } = update;
    ({ data, error } = await supabase.from('crm_tasks').update(legacy)
      .eq('id', taskId).select(CRM_TASK_SELECT).single());
  }
  if (error && isExecutorColumnError(error)) {
    const { executor_company_id: _e, ...legacy } = update;
    ({ data, error } = await supabase.from('crm_tasks').update(legacy)
      .eq('id', taskId).select(CRM_TASK_SELECT).single());
  }
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
