// ═══════════════════════════════════════════════════════════════════════════
// AUTO-GEN CRM TASKS — Tạo nhiệm vụ từ bộ mẫu theo công ty (pipeline → stage → template)
// Chỉ chạy 1 lần khi tạo Lead/Deal hoặc convert Lead→Deal (idempotent theo pipeline_type).
// ═══════════════════════════════════════════════════════════════════════════

const { supabase } = require('../config/supabase');
const { getDefaultPipelineIdForCompany, getPipelineIdForCompanyRegion } = require('./crmTaxonomyCache');
const {
  normalizeTemplateItemAssigneeIds,
  primaryTemplateItemAssigneeId,
  applyAssigneesToInsertedCrmTasks,
} = require('./templateItemAssignees');
const { resolveExecutorCompanyId, isExecutorColumnError } = require('./crossCompanyWorkspace');
const { normalizeTemplateChecklistForCrmTask } = require('./templateChecklistNormalize');
const {
  normalizeDeadlineOffset,
  applySequentialDeadlinesToInserts,
  loadStageHasActiveDeadline,
  isDeadlineOffsetColumnError,
  stripDeadlineOffsetColumns,
} = require('./crmTaskSequentialDeadline');

function isSxCrmTaskRow(t) {
  return String(t?.stage_slug || '').startsWith('sx_');
}

/**
 * Stage slug "khoá cứng" của Lead — task gắn slug này chỉ thuộc về Lead,
 * sau khi convert sang Deal phải ẩn khỏi view Deal kể cả khi pipeline_stage_id null
 * hoặc stage có pipeline_type='both'/null.
 * Đồng bộ với LEAD_STAGES trên frontend (CRMTasksTab.jsx).
 */
const LEAD_ONLY_STAGE_SLUGS = new Set([
  'consulting',
  'lead',
  'lead_new',
  'lead_contacted',
  'lead_consulting',
  'lead_waiting',
]);

function isLeadOnlyStageSlug(slug) {
  return LEAD_ONLY_STAGE_SLUGS.has(String(slug || '').toLowerCase());
}

function isDealOnlyStageSlug(slug) {
  return String(slug || '').toLowerCase().startsWith('deal_');
}

/**
 * Khử trùng item bộ mẫu trước khi insert vào crm_tasks.
 */
function dedupeTemplateItemsForInsert(items, tplMap, fallbackStageId, logTag) {
  if (!Array.isArray(items) || !items.length) return [];
  const seen = new Map();
  const dropped = [];
  for (const item of items) {
    const tpl = tplMap?.[item.template_id] || {};
    const stageSlug = tpl.stage_slug || '';
    const pipelineStageId = tpl.pipeline_stage_id || fallbackStageId || '';
    const titleKey = String(item.title || '').trim().toLowerCase();
    if (!titleKey) continue;
    const key = `${stageSlug}|${pipelineStageId}|${item.order_index || 0}|${titleKey}`;
    if (seen.has(key)) {
      dropped.push({ title: item.title, stage_slug: stageSlug });
      continue;
    }
    seen.set(key, item);
  }
  if (dropped.length) {
    console.warn(
      `[AUTO-TASK] ${logTag || ''} dedupe: bỏ ${dropped.length} item trùng. `
      + `Vào Bộ mẫu CRM để xoá template thừa cho cùng pipeline_stage.`,
    );
  }
  return Array.from(seen.values());
}

function stageTypesMatchEntity(stagePipelineType, entityType) {
  const st = String(stagePipelineType || '').toLowerCase();
  const et = entityType === 'deal' ? 'deal' : 'lead';
  return st === et || st === 'both';
}

/** Task CRM gắn stage thuộc đúng pipeline hiện tại của lead/deal. */
function crmTaskBelongsToPipeline(task, pipelineId) {
  if (!pipelineId || !task?.pipeline_stage_id) return false;
  const stagePipelineId = task.stage?.pipeline_id ?? task.pipeline_stage?.pipeline_id;
  if (!stagePipelineId) return false;
  return String(stagePipelineId) === String(pipelineId);
}

/** Khớp crm_task_templates.pipeline_type với loại lead/deal (giống resolveCrmBundleTemplateScope). */
function crmTemplateMatchesEntityType(templatePipelineType, entityType) {
  const et = entityType === 'deal' ? 'deal' : 'lead';
  const pt = String(templatePipelineType || '').toLowerCase();
  return !pt || pt === 'both' || pt === et;
}

/** Pipeline CRM của lead/deal: pipeline_id → khu vực → mặc định công ty. */
async function resolvePipelineIdForLead(lead) {
  if (lead?.pipeline_id) return lead.pipeline_id;
  if (!lead?.company_id) return null;
  try {
    if (lead.region_id) {
      const pid = await getPipelineIdForCompanyRegion(lead.company_id, lead.region_id);
      if (pid) return pid;
    }
    return await getDefaultPipelineIdForCompany(lead.company_id);
  } catch (e) {
    console.warn('[AUTO-TASK] resolvePipelineIdForLead:', e.message);
    return null;
  }
}

function buildTaskInsertsFromTemplates(templates, allItems, userId, leadId) {
  if (!templates?.length || !allItems?.length) return [];

  const tplMap = {};
  templates.forEach((t) => { tplMap[t.id] = t; });

  const dedupedItems = dedupeTemplateItemsForInsert(
    allItems,
    tplMap,
    null,
    `lead=${leadId}`,
  );

  const inserts = dedupedItems.map((item) => {
    const tpl = tplMap[item.template_id] || {};
    const offset = normalizeDeadlineOffset(item);
    return {
      lead_id: leadId,
      title: item.title,
      description: item.description || null,
      priority: item.priority || 'medium',
      stage_slug: tpl.stage_slug || null,
      pipeline_stage_id: tpl.pipeline_stage_id || null,
      order_index: item.order_index,
      deadline_days: offset.deadline_days,
      deadline_hours: offset.deadline_hours,
      deadline_minutes: offset.deadline_minutes,
      deadline: null,
      created_by: userId,
      completion_requires_file_or_note: !!item.completion_requires_file_or_note
        || (Array.isArray(item.required_evidence_file_types) && item.required_evidence_file_types.length > 0),
      required_evidence_file_types: Array.isArray(item.required_evidence_file_types) ? item.required_evidence_file_types : [],
      completion_requires_customer_note: !!item.completion_requires_customer_note,
      completion_requires_customer_contact: !!item.completion_requires_customer_contact,
      requires_quick_verdict: !!item.requires_quick_verdict,
      blocks_stage_advance: !!item.blocks_stage_advance,
      show_excel_quotation_upload: !!item.show_excel_quotation_upload,
      auto_upload_attachments_to_drive: !!item.auto_upload_attachments_to_drive,
      show_fill_form: !!item.show_fill_form,
      form_config: (item.form_config && typeof item.form_config === 'object' && !Array.isArray(item.form_config))
        ? item.form_config
        : {},
      form_data: {},
      assignee_id: primaryTemplateItemAssigneeId(item),
      default_allowed_companies: item.default_allowed_companies || null,
      default_allowed_departments: item.default_allowed_departments || null,
      shared_to_project: !!item.default_shared_to_project,
      allowed_share_modules: item.default_shared_to_project
        ? (Array.isArray(item.default_allowed_share_modules) && item.default_allowed_share_modules.length
          ? item.default_allowed_share_modules
          : null)
        : null,
    };
  });
  // Tuần tự theo stage: chỉ NV đầu (có offset hạn > 0) bắt đầu đếm hạn ngay.
  return applySequentialDeadlinesToInserts(inserts);
}

/**
 * Gen toàn bộ nhiệm vụ CRM từ bộ mẫu pipeline của công ty (mọi stage đã setup template).
 * Idempotent: nếu đã có ≥1 task gắn stage có pipeline_type khớp lead/deal → skip.
 */
async function autoGenCrmTasksForNewLead(leadId, userId, req = null) {
  const { data: lead, error: leadErr } = await supabase
    .from('crm_leads')
    .select('id, type, company_id, pipeline_id, created_by')
    .eq('id', leadId)
    .maybeSingle();
  if (leadErr) {
    console.warn('[AUTO-TASK] load lead:', leadErr.message);
    return 0;
  }
  if (!lead) return 0;

  const entityType = lead.type === 'deal' ? 'deal' : 'lead';
  const actorId = userId || lead.created_by || null;

  let pipelineId = lead.pipeline_id || null;
  if (!pipelineId && lead.company_id) {
    try {
      pipelineId = await getDefaultPipelineIdForCompany(lead.company_id);
      if (pipelineId) {
        const { error: bfErr } = await supabase
          .from('crm_leads')
          .update({ pipeline_id: pipelineId })
          .eq('id', leadId);
        if (bfErr) {
          console.warn(`[AUTO-TASK] backfill pipeline_id failed for ${entityType} ${leadId}:`, bfErr.message);
        }
      }
    } catch (e) {
      console.warn('[AUTO-TASK] resolve default pipeline:', e.message);
    }
  }
  if (!pipelineId) {
    console.log(`[AUTO-TASK] ${entityType} ${leadId}: chưa có pipeline → skip`);
    return 0;
  }

  const { data: existing, error: exErr } = await supabase
    .from('crm_tasks')
    .select('id, stage_slug, pipeline_stage_id, stage:crm_pipeline_stages!crm_tasks_pipeline_stage_id_fkey(pipeline_type, pipeline_id)')
    .eq('lead_id', leadId);
  if (exErr) {
    console.warn('[AUTO-TASK] load existing tasks:', exErr.message);
    return 0;
  }

  const crmExisting = (existing || []).filter((t) => !isSxCrmTaskRow(t));
  // Chỉ coi là "đã có bộ" khi task gắn đúng pipeline hiện tại — task orphan từ pipeline cũ không chặn gen.
  const hasTypeTasks = crmExisting.some((t) => {
    if (!t.pipeline_stage_id) return false;
    if (!stageTypesMatchEntity(t.stage?.pipeline_type, entityType)) return false;
    return crmTaskBelongsToPipeline(t, pipelineId);
  });
  if (hasTypeTasks) {
    console.log(`[AUTO-TASK] Skip: ${entityType} ${leadId} đã có nhiệm vụ pipeline type=${entityType}`);
    return 0;
  }

  const { data: stages, error: stErr } = await supabase
    .from('crm_pipeline_stages')
    .select('id, pipeline_type')
    .eq('pipeline_id', pipelineId)
    .eq('is_active', true);
  if (stErr) throw stErr;

  const stageIds = (stages || [])
    .filter((s) => stageTypesMatchEntity(s.pipeline_type, entityType))
    .map((s) => s.id);
  if (!stageIds.length) {
    console.log(`[AUTO-TASK] ${entityType} ${leadId}: pipeline không có stage type=${entityType}`);
    return 0;
  }

  const { data: allTplRows, error: tplErr } = await supabase
    .from('crm_task_templates')
    .select('id, name, stage_slug, pipeline_stage_id, pipeline_type, is_default')
    .eq('is_active', true)
    .in('pipeline_stage_id', stageIds)
    .order('order_index');
  if (tplErr) throw tplErr;

  let templates = (allTplRows || []).filter(
    (t) => t.is_default && crmTemplateMatchesEntityType(t.pipeline_type, entityType),
  );
  if (!templates.length && (allTplRows || []).length) {
    const typeMatched = (allTplRows || []).filter(
      (t) => crmTemplateMatchesEntityType(t.pipeline_type, entityType),
    );
    if (typeMatched.length) {
      templates = typeMatched;
      console.log(
        `[AUTO-TASK] ${entityType} ${leadId}: chưa đặt bộ mặc định → dùng ${templates.length} bộ mẫu active`,
      );
    } else {
      console.log(`[AUTO-TASK] ${entityType} ${leadId}: pipeline có bộ mẫu nhưng không khớp loại → skip`);
      return 0;
    }
  }
  if (!templates.length) {
    console.log(`[AUTO-TASK] ${entityType} ${leadId}: chưa có bộ mẫu gắn pipeline_stage → skip`);
    return 0;
  }

  const tplIds = templates.map((t) => t.id);
  const { data: allItems, error: itemErr } = await supabase
    .from('crm_task_template_items')
    .select('*')
    .in('template_id', tplIds)
    .order('order_index');
  if (itemErr) throw itemErr;
  if (!allItems?.length) {
    console.log(`[AUTO-TASK] ${entityType} ${leadId}: template rỗng → skip`);
    return 0;
  }

  const inserts = buildTaskInsertsFromTemplates(templates, allItems, actorId, leadId);
  if (!inserts.length) return 0;

  const tplMap = {};
  templates.forEach((t) => { tplMap[t.id] = t; });
  const dedupedItems = dedupeTemplateItemsForInsert(allItems, tplMap, null, `lead=${leadId}`);
  const assigneeIdsList = dedupedItems.map((item) => normalizeTemplateItemAssigneeIds(item));
  let { data: inserted, error: insErr } = await supabase
    .from('crm_tasks')
    .insert(inserts)
    .select('id, title, stage_slug, lead_id, assignee_id, description, status, priority, deadline, executor_company_id');
  if (insErr && isDeadlineOffsetColumnError(insErr)) {
    const stripped = inserts.map((row) => stripDeadlineOffsetColumns(row));
    ({ data: inserted, error: insErr } = await supabase.from('crm_tasks').insert(stripped)
      .select('id, title, stage_slug, lead_id, assignee_id, description, status, priority, deadline, executor_company_id'));
  }
  if (insErr && isExecutorColumnError(insErr)) {
    const stripped = inserts.map(({ executor_company_id: _e, ...rest }) => stripDeadlineOffsetColumns(rest));
    ({ data: inserted, error: insErr } = await supabase.from('crm_tasks').insert(stripped)
      .select('id, title, stage_slug, lead_id, assignee_id, description, status, priority, deadline, executor_company_id'));
  }
  if (insErr) {
    console.error('[AUTO-TASK] Insert error:', insErr.message);
    return 0;
  }
  await applyAssigneesToInsertedCrmTasks(
    inserted || [],
    assigneeIdsList,
    req || { user: { userId: actorId } },
  );
  console.log(`[AUTO-TASK] Created ${inserts.length} tasks for ${entityType} ${leadId} (company pipeline)`);
  return inserts.length;
}

/**
 * Lọc task CRM hiển thị theo type lead/deal:
 *  - Ẩn task có stage_slug khoá cứng (consulting → Lead, deal_* → Deal) khi xem trái loại.
 *  - Ẩn task có pipeline_stage.pipeline_type ngược loại.
 *  - Giữ task SX (sx_*) và task không phân loại rõ (orphan) cho cả hai view.
 */
function filterCrmTasksForLeadType(tasks, leadType) {
  const entityType = leadType === 'deal' ? 'deal' : 'lead';
  return (tasks || []).filter((t) => {
    if (isSxCrmTaskRow(t)) return true;

    // Khoá theo stage_slug — chặn task Lead lọt sang Deal sau khi chuyển đổi
    // ngay cả khi task không có pipeline_stage_id (legacy / tạo thủ công)
    // hoặc pipeline_stage.pipeline_type bị null/'both'.
    const slug = String(t.stage_slug || '').toLowerCase();
    if (entityType === 'deal' && isLeadOnlyStageSlug(slug)) return false;
    if (entityType === 'lead' && isDealOnlyStageSlug(slug)) return false;

    if (!t.pipeline_stage_id) return true;
    const pt = t.pipeline_stage?.pipeline_type ?? t.stage?.pipeline_type;
    if (!pt) return true;
    return stageTypesMatchEntity(pt, entityType);
  });
}

/**
 * Đồng bộ lại: xóa task CRM (non-sx) gắn stage khớp pipeline_type của lead/deal, rồi gen lại
 * theo pipeline_id hiện tại. Dùng khi đổi pipeline (chuyển khu vực / sửa pipeline_id).
 */
async function resyncCrmPipelineTasksForLead(leadId, userId, req = null) {
  const { data: lead, error: leadErr } = await supabase
    .from('crm_leads')
    .select('type, company_id, pipeline_id, created_by')
    .eq('id', leadId)
    .maybeSingle();
  if (leadErr) throw leadErr;
  if (!lead) return { ok: false, error: 'Lead/deal không tồn tại' };

  if (!lead.company_id && !lead.pipeline_id) {
    return { ok: false, error: 'Lead/deal chưa có công ty / pipeline CRM' };
  }

  const entityType = lead.type === 'deal' ? 'deal' : 'lead';
  const pipelineId = lead.pipeline_id || null;

  const { data: tasks, error: taskErr } = await supabase
    .from('crm_tasks')
    .select('id, stage_slug, pipeline_stage_id, stage:crm_pipeline_stages!crm_tasks_pipeline_stage_id_fkey(pipeline_type, pipeline_id)')
    .eq('lead_id', leadId);
  if (taskErr) throw taskErr;

  // Xóa mọi task CRM cùng loại (lead/deal), kể cả orphan gắn pipeline cũ —
  // rồi gen lại đúng bộ mẫu của pipeline hiện tại.
  const toDelete = (tasks || [])
    .filter((t) => !isSxCrmTaskRow(t))
    .filter((t) => {
      if (!t.pipeline_stage_id) return false;
      return stageTypesMatchEntity(t.stage?.pipeline_type, entityType);
    })
    .map((t) => t.id);

  if (toDelete.length) {
    const { error: delErr } = await supabase.from('crm_tasks').delete().in('id', toDelete);
    if (delErr) throw delErr;
  }

  const created = await autoGenCrmTasksForNewLead(leadId, userId || lead.created_by, req);

  console.log(
    `[AUTO-TASK] resync pipeline: lead=${leadId} pipeline=${pipelineId || '—'} `
    + `deleted=${toDelete.length} created=${created}`,
  );

  return {
    ok: true,
    deleted: toDelete.length,
    tasks_created: created,
    entity_type: entityType,
    pipeline_id: pipelineId,
  };
}

/**
 * Sau khi lead/deal đổi pipeline_id: đồng bộ lại bộ nhiệm vụ CRM theo pipeline mới.
 */
async function syncCrmTasksAfterPipelineChange(leadId, userId, req = null) {
  if (!leadId) return { ok: false, error: 'Thiếu lead_id' };
  return resyncCrmPipelineTasksForLead(leadId, userId, req);
}

/** Có task CRM (non-sx) gắn stage của pipeline khác với pipeline hiện tại của lead? */
async function leadHasForeignPipelineCrmTasks(leadId, pipelineId, entityType) {
  if (!leadId || !pipelineId) return false;
  const { data: tasks, error } = await supabase
    .from('crm_tasks')
    .select('id, stage_slug, pipeline_stage_id, stage:crm_pipeline_stages!crm_tasks_pipeline_stage_id_fkey(pipeline_type, pipeline_id)')
    .eq('lead_id', leadId);
  if (error) throw error;
  return (tasks || [])
    .filter((t) => !isSxCrmTaskRow(t))
    .some((t) => {
      if (!t.pipeline_stage_id) return false;
      if (!stageTypesMatchEntity(t.stage?.pipeline_type, entityType)) return false;
      const sid = t.stage?.pipeline_id;
      return sid && String(sid) !== String(pipelineId);
    });
}

/**
 * Admin: áp bộ mẫu cho lead/deal trong công ty (khu vực) chưa có task pipeline type tương ứng.
 */
async function applyCrmTaskTemplatesToCompanyRegions({
  companyId,
  pipelineId = null,
  leadType = 'both',
  regionIds = null,
  userId,
}) {
  if (!companyId) return { ok: false, error: 'Thiếu company_id' };

  const pipelineIdResolved = pipelineId || await getDefaultPipelineIdForCompany(companyId);
  if (!pipelineIdResolved) {
    return { ok: false, error: 'Công ty chưa có pipeline CRM mặc định' };
  }

  const { data: stages, error: stErr } = await supabase
    .from('crm_pipeline_stages')
    .select('id')
    .eq('pipeline_id', pipelineIdResolved);
  if (stErr) throw stErr;
  const stageIds = (stages || []).map((s) => s.id);
  if (!stageIds.length) {
    return { ok: false, error: 'Pipeline chưa có giai đoạn nào' };
  }

  const { count: tplCount, error: tplErr } = await supabase
    .from('crm_task_templates')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)
    .in('pipeline_stage_id', stageIds);
  if (tplErr) throw tplErr;
  if (!(tplCount > 0)) {
    return { ok: false, error: 'Pipeline chưa có bộ mẫu nhiệm vụ (gắn pipeline_stage_id)' };
  }

  let q = supabase
    .from('crm_leads')
    .select('id, type, pipeline_id, company_id, created_by, region_id')
    .eq('company_id', companyId);

  const lt = String(leadType || 'both').toLowerCase();
  if (lt === 'lead' || lt === 'deal') q = q.eq('type', lt);

  const normRegions = Array.isArray(regionIds) ? regionIds.filter(Boolean) : null;
  if (normRegions?.length) q = q.in('region_id', normRegions);

  const { data: leads, error: leadErr } = await q;
  if (leadErr) throw leadErr;

  const stats = {
    ok: true,
    company_id: companyId,
    pipeline_id: pipelineIdResolved,
    regions_targeted: normRegions?.length || null,
    scanned: 0,
    applied: 0,
    tasks_created: 0,
    pipeline_backfilled: 0,
    skipped_has_tasks: 0,
    skipped_other_pipeline: 0,
    errors: [],
  };

  for (const row of leads || []) {
    stats.scanned += 1;
    try {
      if (row.pipeline_id && String(row.pipeline_id) !== String(pipelineIdResolved)) {
        stats.skipped_other_pipeline += 1;
        continue;
      }

      if (!row.pipeline_id) {
        const { error: bfErr } = await supabase
          .from('crm_leads')
          .update({ pipeline_id: pipelineIdResolved })
          .eq('id', row.id);
        if (bfErr) throw bfErr;
        stats.pipeline_backfilled += 1;
      }

      const before = await supabase
        .from('crm_tasks')
        .select('id, stage_slug, pipeline_stage_id, stage:crm_pipeline_stages!crm_tasks_pipeline_stage_id_fkey(pipeline_type, pipeline_id)')
        .eq('lead_id', row.id);
      if (before.error) throw before.error;
      const entityType = row.type === 'deal' ? 'deal' : 'lead';
      const leadPipelineId = row.pipeline_id || pipelineIdResolved;
      const hadType = (before.data || [])
        .filter((t) => !isSxCrmTaskRow(t))
        .some((t) => (
          t.pipeline_stage_id
          && stageTypesMatchEntity(t.stage?.pipeline_type, entityType)
          && crmTaskBelongsToPipeline(t, leadPipelineId)
        ));
      if (hadType) {
        stats.skipped_has_tasks += 1;
        continue;
      }

      const created = await autoGenCrmTasksForNewLead(
        row.id,
        userId || row.created_by,
      );
      if (created > 0) {
        stats.applied += 1;
        stats.tasks_created += created;
      }
    } catch (e) {
      stats.errors.push({ lead_id: row.id, error: e.message });
    }
  }

  return stats;
}

function crmTaskTitleKey(raw) {
  return String(raw || '').trim().toLowerCase();
}

function crmExecutorFieldsFromTemplateItem(it, ownerCompanyId) {
  const execId = resolveExecutorCompanyId(it, ownerCompanyId);
  if (!execId || String(execId) === String(ownerCompanyId || '')) return { executor_company_id: null };
  return { executor_company_id: execId };
}

function toCrmTaskChecklist(raw, ownerCompanyId, templateItem) {
  const ckDefaultExec = crmExecutorFieldsFromTemplateItem(templateItem || {}, ownerCompanyId).executor_company_id;
  return normalizeTemplateChecklistForCrmTask(raw, ckDefaultExec);
}

function buildCrmTaskInsertFromTemplateItem(item, tpl, leadId, pipelineStageId, userId, ownerCompanyId) {
  const offset = normalizeDeadlineOffset(item);
  return {
    lead_id: leadId,
    title: item.title,
    description: item.description || null,
    checklist: toCrmTaskChecklist(item.checklist, ownerCompanyId, item),
    priority: item.priority || 'medium',
    stage_slug: tpl?.stage_slug || null,
    pipeline_stage_id: pipelineStageId,
    order_index: item.order_index,
    deadline_days: offset.deadline_days,
    deadline_hours: offset.deadline_hours,
    deadline_minutes: offset.deadline_minutes,
    deadline: null,
    created_by: userId,
    completion_requires_file_or_note: !!item.completion_requires_file_or_note
      || (Array.isArray(item.required_evidence_file_types) && item.required_evidence_file_types.length > 0),
    required_evidence_file_types: Array.isArray(item.required_evidence_file_types) ? item.required_evidence_file_types : [],
    completion_requires_customer_note: !!item.completion_requires_customer_note,
    completion_requires_customer_contact: !!item.completion_requires_customer_contact,
    requires_quick_verdict: !!item.requires_quick_verdict,
    blocks_stage_advance: !!item.blocks_stage_advance,
    show_excel_quotation_upload: !!item.show_excel_quotation_upload,
    auto_upload_attachments_to_drive: !!item.auto_upload_attachments_to_drive,
    show_fill_form: !!item.show_fill_form,
    form_config: (item.form_config && typeof item.form_config === 'object' && !Array.isArray(item.form_config))
      ? item.form_config
      : {},
    form_data: {},
    assignee_id: primaryTemplateItemAssigneeId(item),
    default_allowed_companies: item.default_allowed_companies || null,
    default_allowed_departments: item.default_allowed_departments || null,
    shared_to_project: !!item.default_shared_to_project,
    allowed_share_modules: item.default_shared_to_project
      ? (Array.isArray(item.default_allowed_share_modules) && item.default_allowed_share_modules.length
        ? item.default_allowed_share_modules
        : null)
      : null,
    ...crmExecutorFieldsFromTemplateItem(item, ownerCompanyId),
  };
}

/**
 * Kiểm tra & bổ sung nhiệm vụ CRM thiếu theo bộ mẫu mặc định của một cột pipeline.
 * Idempotent: chỉ thêm task chưa có (so theo title trong cùng pipeline_stage_id).
 */
async function ensureMissingCrmTasksForPipelineStage({ leadId, pipelineStageId, userId, req = null }) {
  if (!leadId || !pipelineStageId) {
    return { created: 0, skipped: 0, reason: 'missing_params' };
  }

  const { data: lead, error: leadErr } = await supabase
    .from('crm_leads')
    .select('id, type, company_id, pipeline_id, region_id, created_by')
    .eq('id', leadId)
    .maybeSingle();
  if (leadErr) throw leadErr;
  if (!lead) return { created: 0, skipped: 0, reason: 'no_lead' };

  const entityType = lead.type === 'deal' ? 'deal' : 'lead';
  const actorId = userId || lead.created_by || null;
  const ownerCompanyId = lead.company_id || null;

  const pipelineId = await resolvePipelineIdForLead(lead);

  // Task còn gắn pipeline cũ sau khi đổi khu vực/pipeline → resync thay vì chồng bộ mới.
  if (pipelineId) {
    const hasForeign = await leadHasForeignPipelineCrmTasks(leadId, pipelineId, entityType);
    if (hasForeign) {
      console.log(
        `[AUTO-TASK] ensure-stage: lead=${leadId} có task pipeline khác → resync pipeline=${pipelineId}`,
      );
      const synced = await resyncCrmPipelineTasksForLead(leadId, actorId, req);
      return {
        created: synced.tasks_created || 0,
        skipped: 0,
        reason: synced.ok ? 'resynced_foreign_pipeline' : (synced.error || 'resync_failed'),
        resynced: !!synced.ok,
        deleted: synced.deleted || 0,
        pipeline_stage_id: pipelineStageId,
        entity_type: entityType,
        company_id: ownerCompanyId,
        pipeline_id: pipelineId,
      };
    }
  }

  const { data: stage, error: stageErr } = await supabase
    .from('crm_pipeline_stages')
    .select('id, pipeline_id, pipeline_type, is_active')
    .eq('id', pipelineStageId)
    .maybeSingle();
  if (stageErr) throw stageErr;
  if (!stage?.id) return { created: 0, skipped: 0, reason: 'no_stage' };
  if (!stageTypesMatchEntity(stage.pipeline_type, entityType)) {
    return { created: 0, skipped: 0, reason: 'stage_type_mismatch', pipeline_stage_id: pipelineStageId };
  }
  // Stage đích phải thuộc pipeline hiện tại của lead — tránh gen nhầm bộ pipeline khác.
  if (pipelineId && stage.pipeline_id && String(stage.pipeline_id) !== String(pipelineId)) {
    return {
      created: 0,
      skipped: 0,
      reason: 'stage_pipeline_mismatch',
      pipeline_stage_id: pipelineStageId,
      lead_pipeline_id: pipelineId,
      stage_pipeline_id: stage.pipeline_id,
    };
  }

  // Lấy mọi bộ mẫu active gắn cột này. Ưu tiên bộ mặc định (is_default);
  // nếu chưa cấu hình mặc định → dùng toàn bộ bộ mẫu của cột (để quét vẫn hoạt động).
  const { data: allStageTemplates, error: tplErr } = await supabase
    .from('crm_task_templates')
    .select('id, name, stage_slug, pipeline_stage_id, pipeline_type, is_default')
    .eq('is_active', true)
    .eq('pipeline_stage_id', pipelineStageId)
    .order('order_index');
  if (tplErr) throw tplErr;

  const typeMatched = (allStageTemplates || []).filter(
    (t) => crmTemplateMatchesEntityType(t.pipeline_type, entityType),
  );
  const defaults = typeMatched.filter((t) => t.is_default);
  const matchedTemplates = defaults.length ? defaults : typeMatched;

  if (!matchedTemplates.length) {
    console.log(
      `[AUTO-TASK] ensure: lead=${leadId} stage=${pipelineStageId} type=${entityType} → `
      + `không có bộ mẫu (stage_templates=${(allStageTemplates || []).length})`,
    );
    return {
      created: 0,
      skipped: 0,
      reason: 'no_templates',
      pipeline_stage_id: pipelineStageId,
      entity_type: entityType,
      company_id: ownerCompanyId,
      pipeline_id: pipelineId,
    };
  }

  const tplIds = matchedTemplates.map((t) => t.id);
  const { data: allItems, error: itemErr } = await supabase
    .from('crm_task_template_items')
    .select('*')
    .in('template_id', tplIds)
    .order('order_index');
  if (itemErr) throw itemErr;
  if (!allItems?.length) {
    return {
      created: 0,
      skipped: 0,
      reason: 'empty_templates',
      pipeline_stage_id: pipelineStageId,
      template_count: matchedTemplates.length,
    };
  }

  const tplMap = {};
  matchedTemplates.forEach((t) => { tplMap[t.id] = t; });
  const dedupedItems = dedupeTemplateItemsForInsert(
    allItems,
    tplMap,
    pipelineStageId,
    `ensure lead=${leadId} stage=${pipelineStageId}`,
  );

  // Task đã có trên lead khớp cột này: theo pipeline_stage_id HOẶC theo stage_slug
  // (task cũ/legacy có thể có pipeline_stage_id = null nhưng vẫn thuộc cột qua slug).
  const stageSlugSet = new Set(
    matchedTemplates.map((t) => String(t.stage_slug || '').trim().toLowerCase()).filter(Boolean),
  );
  const { data: existingRows, error: exErr } = await supabase
    .from('crm_tasks')
    .select('title, stage_slug, pipeline_stage_id')
    .eq('lead_id', leadId);
  if (exErr) throw exErr;

  const existingTitleKeys = new Set(
    (existingRows || [])
      .filter((t) => {
        if (String(t.pipeline_stage_id || '') === String(pipelineStageId)) return true;
        const slug = String(t.stage_slug || '').trim().toLowerCase();
        return slug && stageSlugSet.has(slug);
      })
      .map((t) => crmTaskTitleKey(t.title))
      .filter(Boolean),
  );

  const toInsertItems = dedupedItems.filter(
    (item) => !existingTitleKeys.has(crmTaskTitleKey(item.title)),
  );
  const skipped = dedupedItems.length - toInsertItems.length;

  console.log(
    `[AUTO-TASK] ensure: lead=${leadId} stage=${pipelineStageId} type=${entityType} `
    + `templates=${matchedTemplates.length} items=${dedupedItems.length} `
    + `existing_match=${existingTitleKeys.size} missing=${toInsertItems.length}`,
  );

  if (!toInsertItems.length) {
    return {
      created: 0,
      skipped,
      reason: 'no_missing_tasks',
      pipeline_stage_id: pipelineStageId,
      template_count: matchedTemplates.length,
    };
  }

  const inserts = toInsertItems.map((item) => {
    const tpl = tplMap[item.template_id] || {};
    return buildCrmTaskInsertFromTemplateItem(
      item,
      tpl,
      leadId,
      pipelineStageId,
      actorId,
      ownerCompanyId,
    );
  });
  const stageHasActiveDeadline = await loadStageHasActiveDeadline(supabase, leadId, inserts);
  applySequentialDeadlinesToInserts(inserts, { stageHasActiveDeadline });
  const assigneeIdsList = toInsertItems.map((item) => normalizeTemplateItemAssigneeIds(item));

  const selCols = 'id, title, stage_slug, pipeline_stage_id, lead_id, assignee_id, description, status, priority, deadline, executor_company_id';
  let { data: inserted, error: insErr } = await supabase.from('crm_tasks').insert(inserts).select(selCols);
  if (insErr && String(insErr.message || '').toLowerCase().includes('checklist')) {
    const stripped = inserts.map(({ checklist: _c, ...rest }) => rest);
    ({ data: inserted, error: insErr } = await supabase.from('crm_tasks').insert(stripped).select(selCols));
  }
  if (insErr && isDeadlineOffsetColumnError(insErr)) {
    const stripped = inserts.map((row) => stripDeadlineOffsetColumns(row));
    ({ data: inserted, error: insErr } = await supabase.from('crm_tasks').insert(stripped).select(selCols));
  }
  if (insErr && isExecutorColumnError(insErr)) {
    const stripped = inserts.map(({ executor_company_id: _e, ...rest }) => rest);
    ({ data: inserted, error: insErr } = await supabase.from('crm_tasks').insert(stripped).select(selCols));
  }
  if (insErr) throw insErr;

  await applyAssigneesToInsertedCrmTasks(
    inserted || [],
    assigneeIdsList,
    req || { user: { userId: actorId } },
  );

  console.log(
    `[AUTO-TASK] ensure missing: +${inserts.length} tasks for ${entityType} ${leadId} stage=${pipelineStageId}`,
  );

  return {
    created: inserts.length,
    skipped,
    reason: 'ok',
    pipeline_stage_id: pipelineStageId,
    template_count: matchedTemplates.length,
    entity_type: entityType,
    company_id: ownerCompanyId,
    pipeline_id: pipelineId,
    tasks: inserted || [],
  };
}

/**
 * Quét một hoặc mọi cột pipeline CRM — bổ sung nhiệm vụ thiếu theo bộ mẫu mặc định.
 */
async function ensureMissingCrmTasksForLead({
  leadId,
  userId,
  req = null,
  pipelineStageId = null,
  allStages = false,
}) {
  const { data: lead, error: leadErr } = await supabase
    .from('crm_leads')
    .select('id, type, company_id, pipeline_id, region_id, stage_id, created_by')
    .eq('id', leadId)
    .maybeSingle();
  if (leadErr) throw leadErr;
  if (!lead) return { ok: false, error: 'Lead/deal không tồn tại' };

  const actorId = userId || lead.created_by || null;
  const entityType = lead.type === 'deal' ? 'deal' : 'lead';
  const pipelineId = await resolvePipelineIdForLead(lead);

  // Lead/deal đã nhảy pipeline nhưng còn task gắn stage pipeline cũ → resync thay vì bổ sung chồng.
  if (pipelineId) {
    const hasForeign = await leadHasForeignPipelineCrmTasks(leadId, pipelineId, entityType);
    if (hasForeign) {
      console.log(
        `[AUTO-TASK] ensure: lead=${leadId} có task pipeline khác → resync theo pipeline=${pipelineId}`,
      );
      const synced = await resyncCrmPipelineTasksForLead(leadId, actorId, req);
      return {
        ok: !!synced.ok,
        created: synced.tasks_created || 0,
        skipped: 0,
        resynced: true,
        deleted: synced.deleted || 0,
        stages: [],
        entity_type: entityType,
        company_id: lead.company_id || null,
        pipeline_id: pipelineId,
        error: synced.error,
      };
    }
  }

  let stageIds = [];
  if (pipelineStageId) {
    stageIds = [pipelineStageId];
  } else if (allStages) {
    if (!pipelineId) {
      return { ok: false, error: 'Lead/deal chưa có pipeline CRM (công ty/khu vực chưa cấu hình)' };
    }
    const { data: stages, error: stErr } = await supabase
      .from('crm_pipeline_stages')
      .select('id, pipeline_type')
      .eq('pipeline_id', pipelineId)
      .eq('is_active', true)
      .order('order_index');
    if (stErr) throw stErr;
    stageIds = (stages || [])
      .filter((s) => stageTypesMatchEntity(s.pipeline_type, entityType))
      .map((s) => s.id);
  } else {
    const sid = lead.stage_id || null;
    if (!sid) return { ok: false, error: 'Lead/deal chưa ở cột pipeline nào' };
    stageIds = [sid];
  }

  if (!stageIds.length) {
    return { ok: true, created: 0, skipped: 0, stages: [], entity_type: entityType };
  }

  const stageResults = [];
  let totalCreated = 0;
  let totalSkipped = 0;
  for (const sid of stageIds) {
    const r = await ensureMissingCrmTasksForPipelineStage({
      leadId,
      pipelineStageId: sid,
      userId: actorId,
      req,
    });
    stageResults.push(r);
    totalCreated += r.created || 0;
    totalSkipped += r.skipped || 0;
  }

  return {
    ok: true,
    created: totalCreated,
    skipped: totalSkipped,
    stages: stageResults,
    entity_type: entityType,
    company_id: lead.company_id || null,
  };
}

module.exports = {
  autoGenCrmTasksForNewLead,
  applyCrmTaskTemplatesToCompanyRegions,
  resyncCrmPipelineTasksForLead,
  syncCrmTasksAfterPipelineChange,
  ensureMissingCrmTasksForPipelineStage,
  ensureMissingCrmTasksForLead,
  filterCrmTasksForLeadType,
  dedupeTemplateItemsForInsert,
  isSxCrmTaskRow,
  isLeadOnlyStageSlug,
  isDealOnlyStageSlug,
  crmTaskBelongsToPipeline,
};
