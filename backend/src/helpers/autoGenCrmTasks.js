// ═══════════════════════════════════════════════════════════════════════════
// AUTO-GEN CRM TASKS — Tạo nhiệm vụ từ bộ mẫu theo công ty (pipeline → stage → template)
// Chỉ chạy 1 lần khi tạo Lead/Deal hoặc convert Lead→Deal (idempotent theo pipeline_type).
// ═══════════════════════════════════════════════════════════════════════════

const { supabase } = require('../config/supabase');
const { getDefaultPipelineIdForCompany } = require('./crmTaxonomyCache');

function isSxCrmTaskRow(t) {
  return String(t?.stage_slug || '').startsWith('sx_');
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

  return dedupedItems.map((item) => {
    const tpl = tplMap[item.template_id] || {};
    const deadlineDays = item.deadline_days;
    let deadline = null;
    if (deadlineDays != null && Number(deadlineDays) > 0) {
      const d = new Date();
      d.setDate(d.getDate() + Number(deadlineDays));
      deadline = d.toISOString();
    }
    return {
      lead_id: leadId,
      title: item.title,
      description: item.description || null,
      priority: item.priority || 'medium',
      stage_slug: tpl.stage_slug || null,
      pipeline_stage_id: tpl.pipeline_stage_id || null,
      order_index: item.order_index,
      deadline,
      created_by: userId,
      completion_requires_file_or_note: !!item.completion_requires_file_or_note,
      completion_requires_customer_note: !!item.completion_requires_customer_note,
      completion_requires_customer_contact: !!item.completion_requires_customer_contact,
      blocks_stage_advance: !!item.blocks_stage_advance,
    };
  });
}

/**
 * Gen toàn bộ nhiệm vụ CRM từ bộ mẫu pipeline của công ty (mọi stage đã setup template).
 * Idempotent: nếu đã có ≥1 task gắn stage có pipeline_type khớp lead/deal → skip.
 */
async function autoGenCrmTasksForNewLead(leadId, userId) {
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
    .select('id, stage_slug, pipeline_stage_id, stage:crm_pipeline_stages!crm_tasks_pipeline_stage_id_fkey(pipeline_type)')
    .eq('lead_id', leadId);
  if (exErr) {
    console.warn('[AUTO-TASK] load existing tasks:', exErr.message);
    return 0;
  }

  const crmExisting = (existing || []).filter((t) => !isSxCrmTaskRow(t));
  const hasTypeTasks = crmExisting.some((t) => {
    if (!t.pipeline_stage_id) return false;
    return stageTypesMatchEntity(t.stage?.pipeline_type, entityType);
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

  const { data: templates, error: tplErr } = await supabase
    .from('crm_task_templates')
    .select('id, name, stage_slug, pipeline_stage_id')
    .eq('is_active', true)
    .in('pipeline_stage_id', stageIds)
    .order('order_index');
  if (tplErr) throw tplErr;
  if (!templates?.length) {
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

  const { error: insErr } = await supabase.from('crm_tasks').insert(inserts);
  if (insErr) {
    console.error('[AUTO-TASK] Insert error:', insErr.message);
    return 0;
  }
  console.log(`[AUTO-TASK] Created ${inserts.length} tasks for ${entityType} ${leadId} (company pipeline)`);
  return inserts.length;
}

/**
 * Lọc task CRM hiển thị theo type lead/deal: ẩn task stage pipeline_type ngược loại.
 * Giữ task không gắn pipeline_stage (orphan) và task sx_*.
 */
function filterCrmTasksForLeadType(tasks, leadType) {
  const entityType = leadType === 'deal' ? 'deal' : 'lead';
  return (tasks || []).filter((t) => {
    if (isSxCrmTaskRow(t)) return true;
    if (!t.pipeline_stage_id) return true;
    const pt = t.pipeline_stage?.pipeline_type ?? t.stage?.pipeline_type;
    if (!pt) return true;
    return stageTypesMatchEntity(pt, entityType);
  });
}

/**
 * Đồng bộ lại: xóa task CRM (non-sx) gắn stage khớp pipeline_type của lead/deal, rồi gen lại.
 */
async function resyncCrmPipelineTasksForLead(leadId, userId) {
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

  const { data: tasks, error: taskErr } = await supabase
    .from('crm_tasks')
    .select('id, stage_slug, pipeline_stage_id, stage:crm_pipeline_stages!crm_tasks_pipeline_stage_id_fkey(pipeline_type)')
    .eq('lead_id', leadId);
  if (taskErr) throw taskErr;

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

  const created = await autoGenCrmTasksForNewLead(leadId, userId || lead.created_by);

  return {
    ok: true,
    deleted: toDelete.length,
    tasks_created: created,
    entity_type: entityType,
  };
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
        .select('id, stage_slug, pipeline_stage_id, stage:crm_pipeline_stages!crm_tasks_pipeline_stage_id_fkey(pipeline_type)')
        .eq('lead_id', row.id);
      if (before.error) throw before.error;
      const entityType = row.type === 'deal' ? 'deal' : 'lead';
      const hadType = (before.data || [])
        .filter((t) => !isSxCrmTaskRow(t))
        .some((t) => t.pipeline_stage_id && stageTypesMatchEntity(t.stage?.pipeline_type, entityType));
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

module.exports = {
  autoGenCrmTasksForNewLead,
  applyCrmTaskTemplatesToCompanyRegions,
  resyncCrmPipelineTasksForLead,
  filterCrmTasksForLeadType,
  dedupeTemplateItemsForInsert,
  isSxCrmTaskRow,
};
