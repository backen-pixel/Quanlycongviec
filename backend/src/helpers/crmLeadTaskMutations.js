/**
 * Core mutations cho crm_tasks — dùng chung từ /api/crm và /api/work-tasks gateway.
 */
const { supabase } = require('../config/supabase');
const { crmTaskMeetsCompletionRequirements, crmTaskRequiresCompletionEvidence, skipSxWorkQuickComplete } = require('./crmTaskCompletionEvidence');
const { normalizeQuickVerdictPayload } = require('./taskQuickVerdict');
const { validateChecklistTransition, validateChecklistDoneEvidence } = require('./checklistItemEvidence');
const { createNotification } = require('./notifications');
const { attachAssigneesToCrmTasks, replaceCrmTaskAssignees } = require('./crmTaskAssignees');
const {
  notifyNewCrmAssignmentAssignees,
  resolveAssignmentIdForTask,
} = require('./crmAssignmentNotifications');
const {
  ensureActiveAssignmentForLead,
  promoteNextAssignmentAfterComplete,
} = require('./crmSequentialAssignment');
const { isAdminLike } = require('./adminRole');
const { assertTenantQuota, resolveTenantIdForQuota, invalidateTenantUsageCache } = require('./tenantQuotas');
const {
  ecosystemModuleKeyForCrmDeadline,
  crmTaskDeadlineModuleKey,
  filterUserIdsForCrmLeadScopedNotification,
} = require('./deadlineModuleNotifications');
const { isExecutorColumnError } = require('./crossCompanyWorkspace');
const {
  clearProjectDeliveryDeadlineForCrmLead,
  isClearsDeliveryDeadlineColumnError,
} = require('./clearProjectDeliveryDeadline');
const { startNextCrmTaskDeadlineAfterComplete } = require('./crmTaskSequentialDeadline');
const { getRedisIfReady } = require('../config/redis');
const { createCrmTaskOutbox } = require('./crmTaskOutbox');
const {
  resolveTaskSourceFields,
  isTaskSourceColumnError,
} = require('./sharedWorkspaceTaskSource');

function isQuickVerdictColumnError(err) {
  const m = String(err?.message || '').toLowerCase();
  return m.includes('requires_quick_verdict') || m.includes('quick_verdict');
}

/** Idempotency: header Idempotency-Key hoặc body.idempotency_key — chống retry tạo task trùng. */
const CRM_TASK_IDEM_TTL_MS = 24 * 60 * 60 * 1000;
const crmTaskIdemLocal = new Map();

function normalizeCrmTaskIdempotencyKey(raw) {
  const s = String(raw || '').trim();
  if (!s || s.length > 128) return null;
  if (!/^[A-Za-z0-9._:-]+$/.test(s)) return null;
  return s;
}

function resolveCrmTaskIdempotencyKey(req, body) {
  const fromHeader = req?.headers?.['idempotency-key'] || req?.headers?.['Idempotency-Key'];
  return normalizeCrmTaskIdempotencyKey(fromHeader)
    || normalizeCrmTaskIdempotencyKey(body?.idempotency_key);
}

function crmTaskIdemCacheKey(userId, leadId, key) {
  return `${userId || 'anon'}:${leadId}:${key}`;
}

async function getCrmTaskIdempotentResult(cacheKey) {
  const now = Date.now();
  const loc = crmTaskIdemLocal.get(cacheKey);
  if (loc && loc.exp > now) return loc.value;
  const redis = getRedisIfReady();
  if (redis) {
    try {
      const raw = await redis.get(`crm_task_idem:${cacheKey}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        crmTaskIdemLocal.set(cacheKey, { value: parsed, exp: now + CRM_TASK_IDEM_TTL_MS });
        return parsed;
      }
    } catch (_) { /* ignore */ }
  }
  return null;
}

async function setCrmTaskIdempotentResult(cacheKey, taskId) {
  const value = { taskId: String(taskId) };
  crmTaskIdemLocal.set(cacheKey, { value, exp: Date.now() + CRM_TASK_IDEM_TTL_MS });
  if (crmTaskIdemLocal.size > 5000) {
    const first = crmTaskIdemLocal.keys().next().value;
    if (first) crmTaskIdemLocal.delete(first);
  }
  const redis = getRedisIfReady();
  if (redis) {
    try {
      await redis.set(
        `crm_task_idem:${cacheKey}`,
        JSON.stringify(value),
        'EX',
        Math.floor(CRM_TASK_IDEM_TTL_MS / 1000),
      );
    } catch (_) { /* ignore */ }
  }
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
  const b = body || {};
  const targetLeadId = await resolveCrmTaskWriteLeadId(leadId);

  const idemKey = resolveCrmTaskIdempotencyKey(req, b);
  const idemCacheKey = idemKey
    ? crmTaskIdemCacheKey(req.user?.userId, targetLeadId, idemKey)
    : null;
  if (idemCacheKey) {
    const prior = await getCrmTaskIdempotentResult(idemCacheKey);
    if (prior?.taskId) {
      const { data: existing } = await supabase
        .from('crm_tasks')
        .select(CRM_TASK_SELECT)
        .eq('id', prior.taskId)
        .eq('lead_id', targetLeadId)
        .maybeSingle();
      if (existing) {
        try {
          const [enriched] = await attachAssigneesToCrmTasks([existing]);
          return {
            data: { ...enriched, idempotent: true },
            status: 200,
            leadId: targetLeadId,
            idempotent: true,
          };
        } catch (_) {
          return {
            data: { ...existing, assignees: existing.assignees || [], idempotent: true },
            status: 200,
            leadId: targetLeadId,
            idempotent: true,
          };
        }
      }
    }
  }

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

  const tenantId = await resolveTenantIdForQuota(req, leadSnap?.company_id);
  const quotaCheck = await assertTenantQuota(tenantId, 'crm_tasks_per_month');
  if (!quotaCheck.ok) {
    return { error: quotaCheck.error, status: 403, code: 'quota_exceeded' };
  }

  const sourceFields = resolveTaskSourceFields(b, { required: false });
  if (!sourceFields.ok) {
    return { error: sourceFields.error, status: sourceFields.status || 400 };
  }

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
    auto_upload_attachments_to_drive: !!b.auto_upload_attachments_to_drive,
    show_fill_form: !!b.show_fill_form,
    form_config: (b.form_config && typeof b.form_config === 'object' && !Array.isArray(b.form_config))
      ? b.form_config
      : {},
    form_data: (b.form_data && typeof b.form_data === 'object' && !Array.isArray(b.form_data))
      ? b.form_data
      : {},
  };
  if (b.executor_company_id !== undefined) {
    insertRow.executor_company_id = normalizeTaskExecutorCompanyId(
      b.executor_company_id,
      leadSnap?.company_id,
    );
  }
  if (sourceFields.task_source_type !== undefined) {
    insertRow.task_source_type = sourceFields.task_source_type;
    insertRow.employee_error_module = sourceFields.employee_error_module;
  }

  let { data, error } = await supabase.from('crm_tasks').insert(insertRow).select(CRM_TASK_SELECT).single();
  if (error && isExecutorColumnError(error)) {
    const { executor_company_id: _e, ...legacy } = insertRow;
    ({ data, error } = await supabase.from('crm_tasks').insert(legacy).select(CRM_TASK_SELECT).single());
  }
  if (error && isTaskSourceColumnError(error)) {
    const { task_source_type: _t, employee_error_module: _m, ...legacy } = insertRow;
    ({ data, error } = await supabase.from('crm_tasks').insert(legacy).select(CRM_TASK_SELECT).single());
  }
  if (error) return { error: error.message, status: 500 };

  if (tenantId) invalidateTenantUsageCache(tenantId);

  if (rawAssigneeIds.length) {
    try {
      await replaceCrmTaskAssignees(data.id, rawAssigneeIds);
    } catch (assigneeErr) {
      // Compensation: chuỗi ghi không có transaction — xóa task vừa tạo, tránh orphan thiếu người được giao
      try {
        await supabase.from('crm_tasks').delete().eq('id', data.id);
      } catch (rbErr) {
        console.error('[crm_task] rollback sau lỗi ghi assignees thất bại:', rbErr.message);
      }
      return {
        error: `Không ghi được người được giao: ${assigneeErr.message}`,
        status: 500,
        code: 'assignee_write_failed',
      };
    }
    try {
      [data] = await attachAssigneesToCrmTasks([data]);
    } catch (attachErr) {
      // Enrich read-only — không rollback, chỉ fallback danh sách id
      console.warn('[crm_task] attach assignees enrich:', attachErr.message);
      data.assignees = rawAssigneeIds.map((id) => ({ id }));
    }
  } else {
    data.assignees = [];
  }

  // ── SAU COMMIT: side-effect qua outbox (không nằm trong transaction DB-core) ──
  // DB-core (task + assignees) đã commit tới đây; thất bại side-effect KHÔNG rollback core.
  // sync_assignment='direct' (Không gian chung): caller tự sync + notify → bỏ qua outbox.
  // notify phụ thuộc assignmentId nên chạy tuần tự sau assignment_sync.
  const syncMode = String(b.sync_assignment || '').toLowerCase();
  const skipNotify = !!b.skip_assignment_notify;
  let assignmentId = null;
  let sideEffects;

  if (syncMode === 'direct') {
    sideEffects = { done: [], failed: [], skipped: ['assignment_sync', 'notify_assignees'] };
  } else {
    const runAssignmentSync = async () => {
      const sync = await ensureActiveAssignmentForLead(req, targetLeadId);
      assignmentId = sync?.assignmentId || null;
      if (assignmentId && String(sync?.taskId || '') === String(data.id)) {
        data.crm_assignment_id = assignmentId;
      }
    };

    const runNotifyAssignees = async () => {
      if (skipNotify) return;
      const { data: leadSnapNotify } = await supabase.from('crm_leads')
        .select('id, code, title, company_id, region_id')
        .eq('id', targetLeadId)
        .maybeSingle();
      const notifyAssignmentId = assignmentId
        || await resolveAssignmentIdForTask(data.id, targetLeadId, data.title);
      const isActiveForNotify = assignmentId && String(data.crm_assignment_id || '') === String(assignmentId);
      if (notifyAssignmentId && rawAssigneeIds.length && isActiveForNotify) {
        await notifyNewCrmAssignmentAssignees(req, {
          assignmentId: notifyAssignmentId,
          title: data.title,
          userIds: rawAssigneeIds,
          lead: leadSnapNotify,
          deadline: data.deadline,
          stageSlug: data.stage_slug,
          crmTaskId: data.id,
        });
      } else if (rawAssigneeIds.length) {
        // Người được giao tường minh — không lọc company/region lead.
        const notifyIds = rawAssigneeIds.filter((uid) => String(uid) !== String(req.user.userId));
        const eco = ecosystemModuleKeyForCrmDeadline(crmTaskDeadlineModuleKey(data.stage_slug));
        for (const uid of notifyIds) {
          await createNotification(req, uid, 'crm_task_assigned',
            '📌 Nhiệm vụ CRM mới', `Bạn được giao: "${data.title}"`, 'crm_task', data.id,
            { lead_id: targetLeadId, nav_tab: 'tasks', ecosystem_module_key: eco || 'crm' });
        }
      }
    };

    const outbox = createCrmTaskOutbox({ taskId: data.id, leadId: targetLeadId, op: 'create' });
    outbox.enqueue('assignment_sync', runAssignmentSync,
      { dedupeKey: idemCacheKey ? `${idemCacheKey}:assignment_sync` : null });
    outbox.enqueue('notify_assignees', runNotifyAssignees,
      { dedupeKey: idemCacheKey ? `${idemCacheKey}:notify` : null });
    sideEffects = await outbox.drain();
  }

  // Mirror source fields lên data trả về (kể cả khi DB chưa migrate)
  if (sourceFields.task_source_type !== undefined) {
    data.task_source_type = sourceFields.task_source_type;
    data.employee_error_module = sourceFields.employee_error_module;
  }

  // Chỉ ghi idempotency sau khi chuỗi tạo + assignees thành công (không emit realtime ở đây — route làm)
  if (idemCacheKey && data?.id) {
    await setCrmTaskIdempotentResult(idemCacheKey, data.id);
  }

  return { data, status: 201, leadId: targetLeadId, sideEffects };
}

async function updateCrmLeadTask(req, leadId, taskId, body) {
  const b = body;
  let priorEvidenceRow = null;
  let resolvedChecklist = null;
  if (b.status === 'completed' || Array.isArray(b.checklist)) {
    const { data: prior, error: pErr } = await supabase
      .from('crm_tasks')
      .select('id,status,notes,checklist,stage_slug,production_pipeline_stage_id,completion_requires_file_or_note,required_evidence_file_types,requires_quick_verdict,quick_verdict,quick_verdict_reason,completion_requires_customer_note,completion_requires_customer_contact,clears_delivery_deadline_on_complete,lead_id')
      .eq('id', taskId).maybeSingle();
    if (pErr) return { error: pErr.message, status: 500 };
    priorEvidenceRow = prior;
    const quickComplete = skipSxWorkQuickComplete(b, prior);

    if (Array.isArray(b.checklist) && !quickComplete) {
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

    if (b.status === 'completed' && prior && prior.status !== 'completed' && !quickComplete) {
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

    if (b.status === 'completed' && prior && prior.status !== 'completed' && crmTaskRequiresCompletionEvidence(prior) && !quickComplete) {
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
    .select('assignee_id, blocks_stage_advance, status, clears_delivery_deadline_on_complete, lead_id, order_index, pipeline_stage_id, stage_slug, deadline_days')
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
    'assignee_id', 'supervisor_id', 'deadline', 'shared_to_project', 'show_excel_quotation_upload',
    'auto_upload_attachments_to_drive', 'show_fill_form', 'form_config', 'form_data', 'checklist'];
  fields.forEach((f) => {
    if (b[f] === undefined) return;
    if (f === 'deadline' && b[f] != null && b[f] !== '') update[f] = normalizeTimestamp(b[f]);
    else if (f === 'checklist') {
      update[f] = resolvedChecklist != null ? resolvedChecklist : (Array.isArray(b[f]) ? b[f] : []);
    }
    else if ((f === 'form_config' || f === 'form_data') && (typeof b[f] !== 'object' || Array.isArray(b[f]) || b[f] == null)) {
      update[f] = {};
    }
    else if (f === 'form_data' && typeof b[f] === 'object') {
      update[f] = {
        ...b[f],
        submitted_by: b[f].submitted_by || req.user?.userId || null,
        submitted_at: b[f].submitted_at || new Date().toISOString(),
      };
    }
    else update[f] = b[f];
  });
  if (isAdminLike(req.user) && b.blocks_stage_advance !== undefined) {
    update.blocks_stage_advance = !!b.blocks_stage_advance;
  }
  if (isAdminLike(req.user) && b.clears_delivery_deadline_on_complete !== undefined) {
    update.clears_delivery_deadline_on_complete = !!b.clears_delivery_deadline_on_complete;
  }
  if (b.requires_quick_verdict !== undefined) {
    update.requires_quick_verdict = !!b.requires_quick_verdict;
  }
  if (b.file_note_recorded !== undefined) {
    update.file_note_recorded = !!b.file_note_recorded;
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
  if (b.task_source_type !== undefined || b.employee_error_module !== undefined) {
    const src = resolveTaskSourceFields(b, { required: false });
    if (!src.ok) return { error: src.error, status: src.status || 400 };
    if (src.task_source_type !== undefined) {
      update.task_source_type = src.task_source_type;
      update.employee_error_module = src.employee_error_module;
    }
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
  if (error && isTaskSourceColumnError(error)) {
    const { task_source_type: _t, employee_error_module: _m, ...legacy } = update;
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
  if (error && isClearsDeliveryDeadlineColumnError(error)) {
    const { clears_delivery_deadline_on_complete: _cd, ...legacy } = update;
    ({ data, error } = await supabase.from('crm_tasks').update(legacy)
      .eq('id', taskId).select(CRM_TASK_SELECT).single());
  }
  if (error && /file_note_recorded/i.test(String(error.message || ''))) {
    if (b.file_note_recorded !== undefined) {
      return {
        error: 'Database chưa có cột file_note_recorded (migration 472). Chạy database/472_task_file_note_recorded.sql rồi thử lại.',
        status: 503,
      };
    }
    const { file_note_recorded: _fn, ...legacyFn } = update;
    ({ data, error } = await supabase.from('crm_tasks').update(legacyFn)
      .eq('id', taskId).select(CRM_TASK_SELECT).single());
  }
  if (error) return { error: error.message, status: 500 };

  if (b.status === 'completed' && priorRow && priorRow.status !== 'completed') {
    const clearsDelivery = !!(data?.clears_delivery_deadline_on_complete ?? priorRow.clears_delivery_deadline_on_complete);
    if (clearsDelivery) {
      try {
        await clearProjectDeliveryDeadlineForCrmLead(data.lead_id || priorRow.lead_id);
      } catch (clearErr) {
        console.warn('[crm] clear delivery deadline on task complete:', clearErr.message);
      }
    }
    try {
      const nextDl = await startNextCrmTaskDeadlineAfterComplete(supabase, {
        id: data?.id || taskId,
        lead_id: data?.lead_id || priorRow.lead_id || leadId,
        order_index: data?.order_index ?? priorRow.order_index,
        pipeline_stage_id: data?.pipeline_stage_id ?? priorRow.pipeline_stage_id,
        stage_slug: data?.stage_slug ?? priorRow.stage_slug,
      });
      if (nextDl?.started) {
        data.next_sequential_deadline = nextDl;
      }
    } catch (seqErr) {
      console.warn('[crm] start next sequential deadline:', seqErr.message);
    }
  }

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
  // ── SAU COMMIT: side-effect qua outbox (giống create) — core update đã ghi xong ──
  // notify chỉ cho assignee MỚI thêm (diff added vs priorAssigneeIds) — giữ nguyên logic cũ.
  let assignmentId = null;

  const runAssignmentSync = async () => {
    const lid = data.lead_id || leadId;
    const justCompleted = b.status === 'completed' && priorRow && priorRow.status !== 'completed';
    const sync = justCompleted
      ? await promoteNextAssignmentAfterComplete(req, lid)
      : await ensureActiveAssignmentForLead(req, lid);
    assignmentId = sync?.assignmentId || null;
    if (assignmentId && String(sync?.taskId || '') === String(data.id)) {
      data.crm_assignment_id = assignmentId;
    } else if (assignmentId) {
      data.next_sequential_assignment = { assignmentId, taskId: sync?.taskId || null };
    }
  };

  const runNotifyAddedAssignees = async () => {
    if (!Array.isArray(b.assignee_ids) || !assignmentId) return;
    if (String(data.crm_assignment_id || '') !== String(assignmentId)) return;
    const priorSet = new Set(priorAssigneeIds.map(String));
    const added = assigneeIdsForSync.filter((uid) => !priorSet.has(String(uid)));
    if (!added.length) return;
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
  };

  const outbox = createCrmTaskOutbox({ taskId, leadId, op: 'update' });
  outbox.enqueue('assignment_sync', runAssignmentSync);
  outbox.enqueue('notify_assignees', runNotifyAddedAssignees);
  const sideEffects = await outbox.drain();

  return {
    data,
    status: 200,
    leadId,
    priorAssigneeId: priorRow?.assignee_id,
    priorAssigneeIds,
    newAssigneeIds,
    sideEffects,
  };
}

async function deleteCrmLeadTask(req, taskId) {
  const { data: task } = await supabase.from('crm_tasks').select('id, lead_id').eq('id', taskId).maybeSingle();
  if (!task) return { error: 'Không tìm thấy nhiệm vụ CRM', status: 404 };
  const { error } = await supabase.from('crm_tasks').delete().eq('id', taskId);
  if (error) return { error: error.message, status: 500 };
  if (task.lead_id) {
    try {
      await ensureActiveAssignmentForLead(req, task.lead_id);
    } catch (e) {
      console.warn('[crm] sequential assignment after task delete:', e.message);
    }
  }
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
