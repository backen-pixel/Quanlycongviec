const { supabase } = require('../config/supabase');
const { getWorkshopStageMap } = require('./workshopKanban');

function normalizeChecklistForTaskInsert(checklist) {
  if (!Array.isArray(checklist)) return [];
  return checklist
    .map((c, i) => {
      if (typeof c === 'string' && c.trim()) return { title: c.trim(), order_index: i };
      if (c && typeof c === 'object' && (c.label || c.title)) {
        return { title: String(c.label || c.title).trim(), order_index: c.order_index ?? i };
      }
      return null;
    })
    .filter(Boolean);
}

async function resolveStageIdForWorkshopArea(workshopArea) {
  const { bySlug } = await getWorkshopStageMap();
  if (workshopArea === 'production') {
    return bySlug.production?.id ?? null;
  }
  const logisticsSlugs = ['delivery', 'shipping', 'installing', 'installation'];
  for (const slug of logisticsSlugs) {
    if (bySlug[slug]) return bySlug[slug].id;
  }
  return null;
}

function guessStageSlugForTemplateItemTitle(workshopArea, title) {
  const t = String(title || '').toLowerCase();
  if (workshopArea === 'production') {
    if (t.includes('kế hoạch') || t.includes('vật tư') || t.includes('xuất vật') || t.includes('chuẩn bị') || t.includes('hồ sơ')) return 'planning';
    if (t.includes('qc') || t.includes('kiểm tra') || t.includes('nghiệm thu') || t.includes('chất lượng')) return 'quality-check';
    if (t.includes('đóng gói') || t.includes('xuất kho') || t.includes('bàn giao') || t.includes('giao cho kho')) return 'packaging';
    return 'production';
  }
  if (t.includes('lắp đặt') || t.includes('install')) return 'installation';
  if (t.includes('vận chuyển') || t.includes('giao hàng') || t.includes('shipping') || t.includes('delivery')) return 'shipping';
  return 'shipping';
}

function isWorkshopCompanyColumnError(err) {
  const m = String(err?.message || '');
  return m.includes('workshop_task_templates.company_id') || (m.includes('column') && m.includes('company_id'));
}

function isWorkshopPipelineStageColumnError(err) {
  const m = String(err?.message || '').toLowerCase();
  return m.includes('production_stage_id') || m.includes('logistics_stage_id');
}

function isTaskProductionStageColumnError(err) {
  const m = String(err?.message || '').toLowerCase();
  return m.includes('tasks.production_stage_id') || (m.includes('production_stage_id') && m.includes('tasks'));
}

/** Map workflow_stages.id → production_pipeline_stages.id (ưu tiên công ty). */
async function resolveProductionPipelineStageId(workflowStageId, companyId) {
  if (!workflowStageId) return null;
  const cid = companyId || null;
  const pick = async (scope) => {
    let q = supabase
      .from('production_pipeline_stages')
      .select('id')
      .eq('workflow_stage_id', workflowStageId)
      .eq('is_active', true);
    if (scope === 'company' && cid) q = q.eq('company_id', cid);
    if (scope === 'global') q = q.is('company_id', null);
    const { data, error } = await q.limit(1).maybeSingle();
    if (error) return { data: null, error };
    return { data, error: null };
  };
  try {
    if (cid) {
      const scoped = await pick('company');
      if (scoped.data?.id) return scoped.data.id;
    }
    const global = await pick('global');
    return global.data?.id || null;
  } catch {
    return null;
  }
}

/** Map workflow_stages.id → logistics_pipeline_stages.id (ưu tiên công ty VC). */
async function resolveLogisticsPipelineStageId(workflowStageId, companyId) {
  if (!workflowStageId) return null;
  const cid = companyId || null;
  const pick = async (scope) => {
    let q = supabase
      .from('logistics_pipeline_stages')
      .select('id')
      .eq('workflow_stage_id', workflowStageId)
      .eq('is_active', true);
    if (scope === 'company' && cid) q = q.eq('company_id', cid);
    if (scope === 'global') q = q.is('company_id', null);
    const { data, error } = await q.limit(1).maybeSingle();
    if (error) return { data: null, error };
    return { data, error: null };
  };
  try {
    if (cid) {
      const scoped = await pick('company');
      if (scoped.data?.id) return scoped.data.id;
    }
    const global = await pick('global');
    return global.data?.id || null;
  } catch {
    return null;
  }
}

/**
 * Danh sách bộ mẫu đang bật cho khu SX / VC–LĐ.
 * Ưu tiên theo company; khi có stageId chỉ lấy bộ gắn stage đó + Global (stage_id NULL).
 */
async function fetchActiveWorkshopTemplatesForArea(workshopArea, companyId, opts = {}) {
  const area = String(workshopArea || 'production');
  const cid = companyId || null;
  const productionStageId = opts.productionStageId || null;
  const logisticsStageId = opts.logisticsStageId || null;
  const stageCol = area === 'logistics' ? 'logistics_stage_id' : 'production_stage_id';
  const stageId = area === 'logistics' ? logisticsStageId : productionStageId;
  const onlyGlobal = opts.onlyGlobal === true;

  const selectCols = 'id, name, order_index, company_id, production_stage_id, logistics_stage_id';

  const baseQuery = (scope) => {
    let q = supabase
      .from('workshop_task_templates')
      .select(selectCols)
      .eq('workshop_area', area)
      .eq('is_active', true)
      .order('order_index');
    if (scope === 'company' && cid) q = q.eq('company_id', cid);
    if (scope === 'global') q = q.is('company_id', null);
    if (onlyGlobal) {
      q = q.is(stageCol, null);
    } else if (stageId) {
      q = q.or(`${stageCol}.eq.${stageId},${stageCol}.is.null`);
    }
    return q;
  };

  let templates = [];
  if (cid) {
    const { data: scoped, error } = await baseQuery('company');
    if (error && !isWorkshopCompanyColumnError(error) && !isWorkshopPipelineStageColumnError(error)) {
      console.warn('[workshop-templates] company list:', error.message);
    }
    if (scoped?.length) templates = scoped;
  }
  if (!templates.length) {
    const { data: globalRows, error } = await baseQuery('global');
    if (error && !isWorkshopCompanyColumnError(error) && !isWorkshopPipelineStageColumnError(error)) {
      console.warn('[workshop-templates] global list:', error.message);
    }
    if (error && isWorkshopPipelineStageColumnError(error)) {
      // DB chưa migration 249 — fallback không lọc stage
      let q = supabase
        .from('workshop_task_templates')
        .select('id, name, order_index, company_id')
        .eq('workshop_area', area)
        .eq('is_active', true)
        .order('order_index');
      if (cid) {
        const { data: scoped } = await q.eq('company_id', cid);
        if (scoped?.length) templates = scoped;
      }
      if (!templates.length) {
        const { data: g } = await supabase
          .from('workshop_task_templates')
          .select('id, name, order_index, company_id')
          .eq('workshop_area', area)
          .eq('is_active', true)
          .is('company_id', null)
          .order('order_index');
        templates = g || [];
      }
    } else {
      templates = globalRows || [];
    }
  }
  return templates;
}

/**
 * Áp một bộ mẫu xưởng → tạo tasks dự án (batch insert; checklist sau khi có id).
 */
async function applyWorkshopTemplateToProject(projectId, templateId, userId, opts = {}) {
  const { data: project } = await supabase.from('projects').select('id').eq('id', projectId).maybeSingle();
  if (!project) {
    return { ok: false, error: 'Không tìm thấy dự án', statusCode: 404 };
  }

  let tplSelect = 'id, workshop_area, is_active, production_stage_id, logistics_stage_id';
  let { data: tpl, error: te } = await supabase
    .from('workshop_task_templates')
    .select(tplSelect)
    .eq('id', templateId)
    .single();
  if (te && isWorkshopPipelineStageColumnError(te)) {
    ({ data: tpl, error: te } = await supabase
      .from('workshop_task_templates')
      .select('id, workshop_area, is_active')
      .eq('id', templateId)
      .single());
  }
  if (te || !tpl) {
    return { ok: false, error: 'Không tìm thấy bộ mẫu', statusCode: 404 };
  }
  if (!tpl.is_active) {
    return { ok: false, error: 'Bộ mẫu đã tắt', statusCode: 400 };
  }

  const { data: items, error: ie } = await supabase
    .from('workshop_task_template_items')
    .select('*')
    .eq('template_id', templateId)
    .order('order_index');
  if (ie) return { ok: false, error: ie.message, statusCode: 500 };
  if (!items?.length) {
    return { ok: false, error: 'Bộ mẫu trống', statusCode: 400 };
  }

  const { bySlug } = await getWorkshopStageMap();
  const fallbackStageId = await resolveStageIdForWorkshopArea(tpl.workshop_area);
  const resolveStageIdBySlug = (slug) => bySlug?.[slug]?.id ?? null;

  if (!fallbackStageId) {
    return {
      ok: false,
      error: 'Chưa cấu hình workflow_stages (production / delivery…)',
      statusCode: 400,
    };
  }

  const pipelineStageIdForTask = tpl.workshop_area === 'production'
    ? (opts.productionStageId ?? tpl.production_stage_id ?? null)
    : null;

  const staged = items.map((item) => {
    const guessedSlug = guessStageSlugForTemplateItemTitle(tpl.workshop_area, item.title);
    const stageId = resolveStageIdBySlug(guessedSlug) || fallbackStageId;
    return { item, guessedSlug, stageId, dueDate: null };
  });

  const distinctStageIds = [...new Set(staged.map((s) => s.stageId).filter(Boolean))];
  const maxOrderByStage = {};
  for (const sid of distinctStageIds) maxOrderByStage[sid] = 0;

  if (distinctStageIds.length) {
    const { data: existing } = await supabase
      .from('tasks')
      .select('stage_id, order_index')
      .eq('project_id', projectId)
      .in('stage_id', distinctStageIds);
    for (const t of existing || []) {
      const sid = t.stage_id;
      const o = Number(t.order_index) || 0;
      if (sid && o > (maxOrderByStage[sid] ?? 0)) maxOrderByStage[sid] = o;
    }
  }

  const taskRows = [];
  for (const s of staged) {
    maxOrderByStage[s.stageId] = (maxOrderByStage[s.stageId] ?? 0) + 1;
    const row = {
      project_id: projectId,
      stage_id: s.stageId,
      title: s.item.title,
      description: s.item.description || null,
      priority: s.item.priority || 'medium',
      status: 'todo',
      task_type: 'project',
      created_by_id: userId,
      due_date: s.dueDate,
      order_index: maxOrderByStage[s.stageId],
      metadata: {
        workshop_template_id: templateId,
        workshop_template_item_id: s.item.id,
        guessed_stage_slug: s.guessedSlug,
        workshop_area: tpl.workshop_area,
      },
    };
    if (tpl.workshop_area === 'production' && pipelineStageIdForTask) {
      row.production_stage_id = pipelineStageIdForTask;
    }
    taskRows.push(row);
  }

  let { data: insertedTasks, error: insErr } = await supabase.from('tasks').insert(taskRows).select('id');
  if (insErr && isTaskProductionStageColumnError(insErr)) {
    const rowsNoPs = taskRows.map(({ production_stage_id: _p, ...rest }) => rest);
    ({ data: insertedTasks, error: insErr } = await supabase.from('tasks').insert(rowsNoPs).select('id'));
  }
  if (insErr) return { ok: false, error: insErr.message, statusCode: 500 };
  const createdIds = (insertedTasks || []).map((r) => r.id).filter(Boolean);

  const checklistBatch = [];
  (insertedTasks || []).forEach((taskRow, idx) => {
    const item = staged[idx]?.item;
    if (!item || !taskRow?.id) return;
    const checklistRows = normalizeChecklistForTaskInsert(item.checklist);
    checklistRows.forEach((row, ci) => {
      checklistBatch.push({
        task_id: taskRow.id,
        title: row.title,
        order_index: row.order_index ?? ci,
      });
    });
  });

  if (checklistBatch.length) {
    const { error: clBatchErr } = await supabase.from('task_checklists').insert(checklistBatch);
    if (clBatchErr) {
      console.warn('[workshop-template] checklist batch:', clBatchErr.message);
      for (let i = 0; i < checklistBatch.length; i += 1) {
        const row = checklistBatch[i];
        try {
          await supabase.from('task_checklists').insert(row);
        } catch (clErr) {
          console.warn('[workshop-template] checklist row:', clErr.message);
        }
      }
    }
  }

  return { ok: true, count: createdIds.length, task_ids: createdIds };
}

/**
 * Chọn bộ mẫu mặc định: ưu tiên theo company_id dự án, sau đó bộ toàn cục.
 */
async function resolveDefaultWorkshopTemplateId(workshopArea, companyId) {
  if (companyId) {
    const { data, error } = await supabase
      .from('workshop_task_templates')
      .select('id')
      .eq('workshop_area', workshopArea)
      .eq('is_default', true)
      .eq('is_active', true)
      .eq('company_id', companyId)
      .limit(1)
      .maybeSingle();
    if (!error && data?.id) return data.id;
    if (error && !isWorkshopCompanyColumnError(error)) {
      console.warn('[workshop-default-template] company template:', error.message);
    }
  }

  const { data: globalDef, error: e2 } = await supabase
    .from('workshop_task_templates')
    .select('id')
    .eq('workshop_area', workshopArea)
    .eq('is_default', true)
    .eq('is_active', true)
    .is('company_id', null)
    .limit(1)
    .maybeSingle();

  if (!e2 && globalDef?.id) return globalDef.id;
  if (e2 && !isWorkshopCompanyColumnError(e2)) {
    console.warn('[workshop-default-template] global template:', e2.message);
  }
  if (e2 && isWorkshopCompanyColumnError(e2)) {
    const { data: legacy } = await supabase
      .from('workshop_task_templates')
      .select('id')
      .eq('workshop_area', workshopArea)
      .eq('is_default', true)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    if (legacy?.id) return legacy.id;
  }

  const { data: anyDef } = await supabase
    .from('workshop_task_templates')
    .select('id')
    .eq('workshop_area', workshopArea)
    .eq('is_default', true)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  return anyDef?.id || null;
}

/**
 * Sau khi tạo dự án: áp TẤT CẢ bộ mẫu của cột pipeline hiện tại + Global (mỗi bộ 1 lần, idempotent).
 */
async function applyDefaultWorkshopTemplatesForNewProject(projectId, userId) {
  let companyId = null;
  let logisticsCompanyId = null;
  let currentStageId = null;
  if (arguments.length >= 3 && arguments[2] && typeof arguments[2] === 'object') {
    companyId = arguments[2].companyId || null;
    logisticsCompanyId = arguments[2].logisticsCompanyId || null;
    currentStageId = arguments[2].currentStageId || null;
  }
  if (!companyId || !currentStageId) {
    const { data: proj } = await supabase
      .from('projects')
      .select('company_id, logistics_company_id, current_stage_id')
      .eq('id', projectId)
      .maybeSingle();
    companyId = companyId || proj?.company_id || null;
    logisticsCompanyId = logisticsCompanyId || proj?.logistics_company_id || null;
    currentStageId = currentStageId || proj?.current_stage_id || null;
  }

  let total = 0;
  for (const area of ['production', 'logistics']) {
    try {
      const cidForArea = area === 'logistics' ? (logisticsCompanyId || companyId) : companyId;
      const productionStageId = area === 'production'
        ? await resolveProductionPipelineStageId(currentStageId, cidForArea)
        : null;
      const logisticsStageId = area === 'logistics'
        ? await resolveLogisticsPipelineStageId(currentStageId, cidForArea)
        : null;

      const stageOpts = area === 'production'
        ? { productionStageId }
        : { logisticsStageId };

      const templates = await fetchActiveWorkshopTemplatesForArea(area, cidForArea, stageOpts);
      if (!templates.length) {
        // Fallback: chỉ bộ default cũ (tương thích DB chưa có stage)
        const defId = await resolveDefaultWorkshopTemplateId(area, cidForArea);
        if (!defId) continue;
        const r = await applyWorkshopTemplateToProject(projectId, defId, userId, stageOpts);
        if (r.ok) total += r.count;
        else console.warn(`[workshop-default-template] ${area}:`, r.error);
        continue;
      }

      for (const tpl of templates) {
        const tid = tpl.id;
        if (!tid) continue;
        const { count } = await supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', projectId)
          .contains('metadata', { workshop_template_id: tid });
        if (count && count > 0) continue;

        const applyOpts = area === 'production'
          ? { productionStageId: tpl.production_stage_id || productionStageId }
          : { productionStageId: null };
        const r = await applyWorkshopTemplateToProject(projectId, tid, userId, applyOpts);
        if (r.ok) total += r.count;
        else console.warn(`[workshop-default-template] ${area} tpl ${tid}:`, r.error);
      }
    } catch (e) {
      console.warn('[workshop-default-template] skip area', area, e.message);
    }
  }
  return total;
}

/**
 * Gen hàng loạt mọi bộ mẫu đang active theo workshop_area (+ lọc pipeline stage nếu có).
 */
async function applyAllActiveWorkshopTemplatesForArea(projectId, userId, {
  workshopArea = 'production',
  companyId = null,
  productionStageId = null,
  logisticsStageId = null,
} = {}) {
  const area = String(workshopArea || 'production');
  if (!['production', 'logistics'].includes(area)) {
    return { ok: false, error: 'workshop_area phải là production hoặc logistics' };
  }

  let proj;
  let pe;
  ({ data: proj, error: pe } = await supabase
    .from('projects')
    .select('id, company_id, logistics_company_id, current_stage_id')
    .eq('id', projectId)
    .maybeSingle());
  if (pe && String(pe.message || '').includes('logistics_company_id')) {
    ({ data: proj, error: pe } = await supabase
      .from('projects')
      .select('id, company_id, current_stage_id')
      .eq('id', projectId)
      .maybeSingle());
  }
  if (pe) return { ok: false, error: pe.message };
  if (!proj?.id) return { ok: false, error: 'Không tìm thấy dự án' };

  const cid =
    companyId !== undefined && companyId !== null && companyId !== ''
      ? companyId
      : (area === 'logistics' ? (proj.logistics_company_id || proj.company_id || null) : (proj.company_id || null));

  let prodStageId = productionStageId;
  let logStageId = logisticsStageId;
  if (area === 'production' && !prodStageId && proj.current_stage_id) {
    prodStageId = await resolveProductionPipelineStageId(proj.current_stage_id, cid);
  }
  if (area === 'logistics' && !logStageId && proj.current_stage_id) {
    logStageId = await resolveLogisticsPipelineStageId(proj.current_stage_id, cid);
  }

  const stageOpts = area === 'production'
    ? { productionStageId: prodStageId }
    : { logisticsStageId: logStageId };

  const templates = await fetchActiveWorkshopTemplatesForArea(area, cid, stageOpts);
  if (!templates.length) {
    return { ok: false, error: 'Chưa có bộ mẫu xưởng cho khu vực / cột pipeline này' };
  }

  let created_tasks = 0;
  const applied = [];
  const skipped_templates = [];

  for (const tpl of templates) {
    const tid = tpl.id;
    if (!tid) continue;
    const { count } = await supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .contains('metadata', { workshop_template_id: tid });
    if (count && count > 0) {
      skipped_templates.push({ id: tid, name: tpl.name });
      continue;
    }
    const applyOpts = area === 'production'
      ? { productionStageId: tpl.production_stage_id || prodStageId }
      : {};
    const r0 = await applyWorkshopTemplateToProject(projectId, tid, userId, applyOpts);
    if (!r0.ok) return { ok: false, error: r0.error, template_id: tid, template_name: tpl.name || null };
    created_tasks += r0.count || 0;
    applied.push({ id: tid, name: tpl.name, created: r0.count || 0 });
  }

  return {
    ok: true,
    workshop_area: area,
    production_stage_id: prodStageId || null,
    logistics_stage_id: logStageId || null,
    templates_total: templates.length,
    templates_applied: applied.length,
    templates_skipped: skipped_templates.length,
    created_tasks,
    applied,
    skipped_templates,
  };
}

async function scheduleNextWorkshopTaskAfterComplete() {
  return { ok: true, skip: 'manual_deadline_policy' };
}

module.exports = {
  applyWorkshopTemplateToProject,
  applyDefaultWorkshopTemplatesForNewProject,
  applyAllActiveWorkshopTemplatesForArea,
  fetchActiveWorkshopTemplatesForArea,
  resolveDefaultWorkshopTemplateId,
  resolveProductionPipelineStageId,
  resolveLogisticsPipelineStageId,
  normalizeChecklistForTaskInsert,
  resolveStageIdForWorkshopArea,
  scheduleNextWorkshopTaskAfterComplete,
};
