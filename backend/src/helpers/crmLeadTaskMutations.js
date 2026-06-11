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

function isQuickVerdictColumnError(err) {
  const m = String(err?.message || '').toLowerCase();
  return m.includes('requires_quick_verdict') || m.includes('quick_verdict');
}

/** Cập nhật một phần checklist (không gian chung) — gộp theo id, không xóa mục nội bộ. */
function mergeChecklistPartialUpdate(priorRaw, incomingRaw) {
  const prior = Array.isArray(priorRaw) ? priorRaw : [];
  const incoming = Array.isArray(incomingRaw) ? incomingRaw : [];
  if (!prior.length) return incoming;
  if (!incoming.length) return prior;

  const priorMap = new Map(prior.filter((c) => c?.id).map((c) => [String(c.id), c]));
  const incomingIds = incoming.map((c) => String(c?.id || '')).filter(Boolean);
  const allIncomingKnown = incomingIds.length === incoming.length
    && incomingIds.every((id) => priorMap.has(id));
  const hasMissing = prior.some((p) => p?.id && !incomingIds.includes(String(p.id)));

  if (!allIncomingKnown || !hasMissing) return incoming;

  return prior.map((p) => {
    const upd = incoming.find((c) => String(c?.id) === String(p?.id));
    return upd ? { ...p, ...upd } : p;
  });
}

/** Tự phát hiện cập nhật từ không gian chung (subset nhỏ) — tránh ghi đè mất mục nội bộ. */
function shouldAutoMergeChecklistUpdate(priorRaw, incomingRaw) {
  const prior = Array.isArray(priorRaw) ? priorRaw.filter((c) => c?.id) : [];
  const incoming = Array.isArray(incomingRaw) ? incomingRaw.filter((c) => c?.id) : [];
  if (!prior.length || !incoming.length) return false;
  if (incoming.length >= prior.length) return false;

  const priorIds = new Set(prior.map((c) => String(c.id)));
  const allKnown = incoming.every((c) => priorIds.has(String(c.id)));
  if (!allKnown) return false;

  const hasMissing = prior.some((p) => !incoming.some((c) => String(c.id) === String(p.id)));
  if (!hasMissing) return false;

  return (incoming.length / prior.length) < 0.75;
}

function resolveChecklistForUpdate(priorRaw, incomingRaw, checklistPartial) {
  if (!Array.isArray(incomingRaw)) return incomingRaw;
  if (!priorRaw) return incomingRaw;
  if (checklistPartial || shouldAutoMergeChecklistUpdate(priorRaw, incomingRaw)) {
    return mergeChecklistPartialUpdate(priorRaw, incomingRaw);
  }
  return incomingRaw;
}

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
  let resolvedChecklist = null;
  if (b.status === 'completed' || Array.isArray(b.checklist)) {
    const { data: prior, error: pErr } = await supabase
      .from('crm_tasks')
      .select('id,status,notes,checklist,completion_requires_file_or_note,required_evidence_file_types,requires_quick_verdict,quick_verdict,quick_verdict_reason,completion_requires_customer_note,completion_requires_customer_contact')
      .eq('id', taskId).maybeSingle();
    if (pErr) return { error: pErr.message, status: 500 };
    priorEvidenceRow = prior;

    if (Array.isArray(b.checklist)) {
      resolvedChecklist = resolveChecklistForUpdate(prior?.checklist, b.checklist, b.checklist_partial);
      const { data: ckAtts, error: attErr } = await supabase
        .from('crm_task_attachments')
        .select('id, file_url, file_name, mime_type, notes, doc_type, checklist_id')
        .eq('task_id', taskId)
        .limit(200);
      if (attErr) return { error: attErr.message, status: 500 };
      const ckCheck = validateChecklistTransition(prior?.checklist, resolvedChecklist, ckAtts || []);
      if (!ckCheck.ok) {
        return {
          error: `Mục checklist «${ckCheck.itemTitle || ''}»: thiếu minh chứng${ckCheck.missingLabel ? ` (${ckCheck.missingLabel})` : ''}.`,
          code: 'crm_checklist_completion_requires_evidence',
          status: 400,
        };
      }
    }

    if (b.status === 'completed' && prior && prior.status !== 'completed') {
      const nextChecklist = Array.isArray(b.checklist) ? resolvedChecklist : prior.checklist;
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
    else if (f === 'checklist') {
      update[f] = resolvedChecklist != null ? resolvedChecklist : (Array.isArray(b[f]) ? b[f] : []);
    }
    else update[f] = b[f];
  });
  if (isAdminLike(req.user) && b.blocks_stage_advance !== undefined) {
    update.blocks_stage_advance = !!b.blocks_stage_advance;
  }
  if (b.requires_quick_verdict !== undefined) {
    update.requires_quick_verdict = !!b.requires_quick_verdict;
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
  if (error && isQuickVerdictColumnError(error)) {
    if (b.requires_quick_verdict !== undefined || b.quick_verdict !== undefined) {
      return {
        error: 'Database chưa có cột ghi chú nhanh (migration 316). Chạy database/316_task_quick_verdict.sql trên Supabase rồi thử lại.',
        status: 503,
      };
    }
    const {
      requires_quick_verdict: _rq,
      quick_verdict: _qv,
      quick_verdict_reason: _qr,
      quick_verdict_at: _qa,
      quick_verdict_by: _qb,
      ...legacy
    } = update;
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

function mergeChecklistRestoreFromTemplate(existingRaw, templateRaw, defaultExec) {
  const { normalizeTemplateChecklistForCrmTask } = require('./templateChecklistNormalize');
  const template = normalizeTemplateChecklistForCrmTask(templateRaw, defaultExec);
  const existing = Array.isArray(existingRaw) ? existingRaw : [];
  const byTitle = new Map(
    existing
      .filter((c) => c && String(c.title || '').trim())
      .map((c) => [String(c.title).trim().toLowerCase(), c]),
  );
  return template.map((tpl) => {
    const prior = byTitle.get(String(tpl.title).trim().toLowerCase());
    if (!prior) return tpl;
    return {
      ...tpl,
      id: prior.id,
      done: !!prior.done,
      notes: prior.notes || '',
      assignee_id: prior.assignee_id || tpl.assignee_id || null,
      executor_company_id: prior.executor_company_id ?? tpl.executor_company_id ?? null,
    };
  });
}

/** Khôi phục checklist từ workshop_task_template_items khi bị ghi đè (vd. từ không gian chung). */
async function restoreCrmTaskChecklistFromWorkshopTemplate(taskId, ownerCompanyId = null) {
  const { data: task, error: tErr } = await supabase.from('crm_tasks')
    .select('id, title, checklist, lead_id, executor_company_id')
    .eq('id', taskId)
    .maybeSingle();
  if (tErr) return { error: tErr.message, status: 500 };
  if (!task) return { error: 'Không tìm thấy nhiệm vụ', status: 404 };

  const titleKey = String(task.title || '').trim();
  if (!titleKey) return { error: 'Nhiệm vụ không có tên', status: 400 };

  let companyId = ownerCompanyId || null;
  if (!companyId && task.lead_id) {
    const { data: lead } = await supabase.from('crm_leads')
      .select('company_id, project_id')
      .eq('id', task.lead_id)
      .maybeSingle();
    if (lead?.project_id) {
      const { data: proj } = await supabase
        .from('projects')
        .select('company_id')
        .eq('id', lead.project_id)
        .maybeSingle();
      companyId = proj?.company_id || lead?.company_id || null;
    } else {
      companyId = lead?.company_id || null;
    }
  }

  const { data: tplItems, error: tplErr } = await supabase
    .from('workshop_task_template_items')
    .select('checklist, executor_company_id, template_id')
    .eq('title', titleKey)
    .order('created_at', { ascending: false })
    .limit(20);
  if (tplErr) return { error: tplErr.message, status: 500 };

  let tplItem = (tplItems || [])[0] || null;
  if (companyId && tplItems?.length) {
    for (const row of tplItems) {
      if (!row.template_id) continue;
      const { data: tpl } = await supabase
        .from('workshop_task_templates')
        .select('company_id')
        .eq('id', row.template_id)
        .maybeSingle();
      if (tpl && String(tpl.company_id) === String(companyId)) {
        tplItem = row;
        break;
      }
    }
  }
  if (!tplItem?.checklist?.length) {
    return { error: `Không tìm thấy mẫu checklist cho nhiệm vụ «${titleKey}»`, status: 404 };
  }

  const defExec = tplItem.executor_company_id || task.executor_company_id || companyId || null;
  const nextChecklist = mergeChecklistRestoreFromTemplate(task.checklist, tplItem.checklist, defExec);

  const { data, error } = await supabase.from('crm_tasks')
    .update({ checklist: nextChecklist, updated_at: new Date().toISOString() })
    .eq('id', taskId)
    .select(CRM_TASK_SELECT)
    .single();
  if (error) return { error: error.message, status: 500 };

  const [withAssignees] = await attachAssigneesToCrmTasks([data]);
  return { data: withAssignees, status: 200, restored_count: nextChecklist.length };
}

module.exports = {
  resolveCrmTaskWriteLeadId,
  createCrmLeadTask,
  updateCrmLeadTask,
  deleteCrmLeadTask,
  getCrmTaskLeadId,
  restoreCrmTaskChecklistFromWorkshopTemplate,
  mergeChecklistPartialUpdate,
  resolveChecklistForUpdate,
};
