/**
 * Giao việc tuần tự từ nhiệm vụ CRM:
 * mỗi lead/deal chỉ 1 crm_assignments mở (crm_task_id) tại một thời điểm.
 * Assignee: ưu tiên người trên nhiệm vụ; thiếu thì người phụ trách lead/deal.
 */
const { supabase } = require('../config/supabase');
const { syncAssignmentFromCrmTask } = require('./crmTaskAssignmentSync');

const OPEN_STATUSES = ['pending', 'in_progress'];

const TASK_SELECT = `
  id, lead_id, title, description, status, priority, deadline, assignee_id,
  stage_slug, pipeline_stage_id, order_index, completed_at, executor_company_id,
  completion_requires_file_or_note, required_evidence_file_types,
  requires_quick_verdict, quick_verdict, quick_verdict_reason, notes
`;

async function loadTaskAssigneeIds(taskId, taskRow = null) {
  if (!taskId) return [];
  const { data: rows, error } = await supabase
    .from('crm_task_assignees')
    .select('user_id')
    .eq('task_id', taskId);
  if (!error && rows?.length) {
    return [...new Set(rows.map((r) => String(r.user_id)).filter(Boolean))];
  }
  if (taskRow?.assignee_id) return [String(taskRow.assignee_id)];
  const { data: t } = await supabase
    .from('crm_tasks')
    .select('assignee_id')
    .eq('id', taskId)
    .maybeSingle();
  return t?.assignee_id ? [String(t.assignee_id)] : [];
}

function taskHasOwnAssignees(assigneeIds) {
  return Array.isArray(assigneeIds) && assigneeIds.filter(Boolean).length > 0;
}

function resolveAssigneesForSequentialAssignment(taskAssigneeIds, lead) {
  if (taskHasOwnAssignees(taskAssigneeIds)) {
    return [...new Set(taskAssigneeIds.map(String))];
  }
  const owner = lead?.assigned_to || lead?.lead_owner_id;
  return owner ? [String(owner)] : [];
}

async function loadLeadForAssignment(leadId) {
  const { data } = await supabase
    .from('crm_leads')
    .select('id, company_id, assigned_to, lead_owner_id')
    .eq('id', leadId)
    .maybeSingle();
  return data || null;
}

async function loadOpenAssignmentsForLead(leadId) {
  if (!leadId) return [];
  const { data, error } = await supabase
    .from('crm_assignments')
    .select('id, crm_task_id, status, assignee_id, lead_id')
    .eq('lead_id', leadId)
    .not('crm_task_id', 'is', null)
    .neq('status', 'completed');
  if (error) {
    if (/crm_task_id/.test(error.message || '')) return [];
    console.warn('[crm-seq-asn] load open assignments:', error.message);
    return [];
  }
  return data || [];
}

async function pickNextOpenCrmTask(leadId) {
  if (!leadId) return null;
  const { data: tasks, error } = await supabase
    .from('crm_tasks')
    .select(TASK_SELECT)
    .eq('lead_id', leadId)
    .in('status', OPEN_STATUSES);
  if (error) {
    console.warn('[crm-seq-asn] pick next task:', error.message);
    return null;
  }
  const list = tasks || [];
  if (!list.length) return null;

  const stageIds = [...new Set(list.map((t) => t.pipeline_stage_id).filter(Boolean))];
  const stageOrder = {};
  if (stageIds.length) {
    const { data: stages } = await supabase
      .from('crm_pipeline_stages')
      .select('id, order_index')
      .in('id', stageIds);
    (stages || []).forEach((s) => {
      stageOrder[String(s.id)] = Number(s.order_index) || 0;
    });
  }

  list.sort((a, b) => {
    const sa = a.pipeline_stage_id != null
      ? (stageOrder[String(a.pipeline_stage_id)] ?? 9999)
      : 9999;
    const sb = b.pipeline_stage_id != null
      ? (stageOrder[String(b.pipeline_stage_id)] ?? 9999)
      : 9999;
    if (sa !== sb) return sa - sb;
    const oa = Number(a.order_index) || 0;
    const ob = Number(b.order_index) || 0;
    if (oa !== ob) return oa - ob;
    return String(a.id).localeCompare(String(b.id));
  });
  return list[0] || null;
}

async function forceCompleteAssignment(assignmentId, completedAt = null) {
  if (!assignmentId) return;
  await supabase
    .from('crm_assignments')
    .update({
      status: 'completed',
      completed_at: completedAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', assignmentId);
}

/**
 * Assignment mở nhưng NV đã completed → đóng assignment rồi mới promote.
 */
async function closeStaleOpenAssignments(req, leadId, lead) {
  const open = await loadOpenAssignmentsForLead(leadId);
  let closed = 0;
  for (const a of open) {
    const { data: task } = await supabase
      .from('crm_tasks')
      .select(TASK_SELECT)
      .eq('id', a.crm_task_id)
      .maybeSingle();
    if (task && OPEN_STATUSES.includes(task.status)) continue;

    if (task) {
      const own = await loadTaskAssigneeIds(task.id, task);
      const ids = resolveAssigneesForSequentialAssignment(
        own.length ? own : (a.assignee_id ? [a.assignee_id] : []),
        lead,
      );
      if (ids.length) {
        try {
          await syncAssignmentFromCrmTask(req, { ...task, status: 'completed' }, ids);
          closed += 1;
          continue;
        } catch (e) {
          console.warn('[crm-seq-asn] close stale sync:', e.message);
        }
      }
    }
    await forceCompleteAssignment(a.id, task?.completed_at || null);
    closed += 1;
  }
  return closed;
}

async function syncTaskToAssignment(req, task, lead) {
  const own = await loadTaskAssigneeIds(task.id, task);
  const ids = resolveAssigneesForSequentialAssignment(own, lead);
  if (!ids.length) return { assignmentId: null, reason: 'no_assignee' };
  const sync = await syncAssignmentFromCrmTask(req, task, ids);
  return { assignmentId: sync?.assignmentId || null, assigneeIds: ids };
}

/**
 * Đảm bảo lead chỉ có tối đa 1 Giao việc mở từ CRM task;
 * nếu chưa có → tạo từ NV mở đầu tiên.
 */
async function ensureActiveAssignmentForLead(req, leadId) {
  if (!leadId) return { assignmentId: null, reason: 'missing_lead' };
  const lead = await loadLeadForAssignment(leadId);
  if (!lead) return { assignmentId: null, reason: 'lead_not_found' };

  try {
    await closeStaleOpenAssignments(req, leadId, lead);
  } catch (e) {
    console.warn('[crm-seq-asn] close stale:', e.message);
  }

  const open = await loadOpenAssignmentsForLead(leadId);
  const nextTask = await pickNextOpenCrmTask(leadId);

  if (open.length) {
    const preferred = nextTask
      ? open.find((a) => String(a.crm_task_id) === String(nextTask.id))
      : null;
    const active = preferred || open[0];
    const { data: task } = await supabase
      .from('crm_tasks')
      .select(TASK_SELECT)
      .eq('id', active.crm_task_id)
      .maybeSingle();
    if (!task) {
      await forceCompleteAssignment(active.id);
      return ensureActiveAssignmentForLead(req, leadId);
    }
    const synced = await syncTaskToAssignment(req, task, lead);
    return {
      assignmentId: synced.assignmentId || active.id,
      synced: true,
      taskId: task.id,
      reason: synced.reason || 'already_open',
    };
  }

  if (!nextTask) return { assignmentId: null, reason: 'no_open_task' };
  const created = await syncTaskToAssignment(req, nextTask, lead);
  return {
    assignmentId: created.assignmentId,
    created: !!created.assignmentId,
    taskId: nextTask.id,
    reason: created.reason || (created.assignmentId ? 'created' : 'sync_failed'),
  };
}

async function promoteNextAssignmentAfterComplete(req, leadId) {
  return ensureActiveAssignmentForLead(req, leadId);
}

/**
 * Đổi người phụ trách lead/deal → gán lại Giao việc mở
 * chỉ khi nhiệm vụ liên kết không có assignee riêng.
 */
async function reassignOpenSequentialAssignmentOnLeadOwnerChange(req, leadId, newOwnerId) {
  if (!leadId || !newOwnerId) return { reassigned: false, reason: 'missing_params' };
  const lead = await loadLeadForAssignment(leadId);
  if (!lead) return { reassigned: false, reason: 'lead_not_found' };

  const open = await loadOpenAssignmentsForLead(leadId);
  if (!open.length) return { reassigned: false, reason: 'no_open_assignment' };

  let reassigned = 0;
  for (const a of open) {
    const { data: task } = await supabase
      .from('crm_tasks')
      .select(TASK_SELECT)
      .eq('id', a.crm_task_id)
      .maybeSingle();
    if (!task) continue;
    const own = await loadTaskAssigneeIds(task.id, task);
    if (taskHasOwnAssignees(own)) continue;

    const ids = [String(newOwnerId)];
    try {
      await syncAssignmentFromCrmTask(req, task, ids);
      reassigned += 1;
    } catch (e) {
      console.warn('[crm-seq-asn] reassign on owner change:', e.message);
    }
  }
  return { reassigned: reassigned > 0, count: reassigned };
}

/**
 * Lead → Deal: buộc hoàn thành mọi NV CRM + Giao việc còn mở (bỏ qua evidence),
 * để bộ nhiệm vụ Deal mới bắt đầu tuần tự sạch.
 */
async function forceCompleteOpenCrmWorkOnLeadConvert(leadId) {
  if (!leadId) return { tasks: 0, assignments: 0 };
  const now = new Date().toISOString();

  const { data: openTasks, error: taskSelErr } = await supabase
    .from('crm_tasks')
    .select('id')
    .eq('lead_id', leadId)
    .in('status', OPEN_STATUSES);
  if (taskSelErr) {
    console.warn('[crm-seq-asn] convert list open tasks:', taskSelErr.message);
  }

  let tasksCompleted = 0;
  if (openTasks?.length) {
    const { error: taskUpErr, count } = await supabase
      .from('crm_tasks')
      .update({
        status: 'completed',
        completed_at: now,
        updated_at: now,
      })
      .eq('lead_id', leadId)
      .in('status', OPEN_STATUSES);
    if (taskUpErr) {
      console.warn('[crm-seq-asn] convert complete tasks:', taskUpErr.message);
    } else {
      tasksCompleted = typeof count === 'number' ? count : openTasks.length;
    }
  }

  const { data: openAsns, error: asnSelErr } = await supabase
    .from('crm_assignments')
    .select('id')
    .eq('lead_id', leadId)
    .neq('status', 'completed');
  if (asnSelErr) {
    console.warn('[crm-seq-asn] convert list open assignments:', asnSelErr.message);
  }

  let assignmentsCompleted = 0;
  if (openAsns?.length) {
    const { error: asnUpErr } = await supabase
      .from('crm_assignments')
      .update({
        status: 'completed',
        completed_at: now,
        updated_at: now,
      })
      .eq('lead_id', leadId)
      .neq('status', 'completed');
    if (asnUpErr) {
      console.warn('[crm-seq-asn] convert complete assignments:', asnUpErr.message);
    } else {
      assignmentsCompleted = openAsns.length;
    }
  }

  return { tasks: tasksCompleted, assignments: assignmentsCompleted };
}

module.exports = {
  loadTaskAssigneeIds,
  taskHasOwnAssignees,
  resolveAssigneesForSequentialAssignment,
  pickNextOpenCrmTask,
  loadOpenAssignmentsForLead,
  ensureActiveAssignmentForLead,
  promoteNextAssignmentAfterComplete,
  reassignOpenSequentialAssignmentOnLeadOwnerChange,
  forceCompleteOpenCrmWorkOnLeadConvert,
};
