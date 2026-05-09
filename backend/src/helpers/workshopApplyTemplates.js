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
    // Planning / materials
    if (t.includes('kế hoạch') || t.includes('vật tư') || t.includes('xuất vật') || t.includes('chuẩn bị') || t.includes('hồ sơ')) return 'planning';
    // QC
    if (t.includes('qc') || t.includes('kiểm tra') || t.includes('nghiệm thu') || t.includes('chất lượng')) return 'quality-check';
    // Packaging / warehouse
    if (t.includes('đóng gói') || t.includes('xuất kho') || t.includes('bàn giao') || t.includes('giao cho kho')) return 'packaging';
    // Default: production
    return 'production';
  }
  // logistics
  if (t.includes('lắp đặt') || t.includes('install')) return 'installation';
  if (t.includes('vận chuyển') || t.includes('giao hàng') || t.includes('shipping') || t.includes('delivery')) return 'shipping';
  return 'shipping';
}

/**
 * Danh sách bộ mẫu đang bật cho khu SX / VC–LĐ (ưu tiên theo company, không có thì global).
 */
async function fetchActiveWorkshopTemplatesForArea(workshopArea, companyId) {
  const area = String(workshopArea || 'production');
  const cid = companyId || null;

  const baseQuery = (scope) => {
    let q = supabase
      .from('workshop_task_templates')
      .select('id, name, order_index, company_id')
      .eq('workshop_area', area)
      .eq('is_active', true)
      .order('order_index');
    if (scope === 'company' && cid) q = q.eq('company_id', cid);
    if (scope === 'global') q = q.is('company_id', null);
    return q;
  };

  let templates = [];
  if (cid) {
    const { data: scoped, error } = await baseQuery('company');
    if (error && !isWorkshopCompanyColumnError(error)) {
      console.warn('[workshop-templates] company list:', error.message);
    }
    if (scoped?.length) templates = scoped;
  }
  if (!templates.length) {
    const { data: globalRows, error } = await baseQuery('global');
    if (error && !isWorkshopCompanyColumnError(error)) {
      console.warn('[workshop-templates] global list:', error.message);
    }
    templates = globalRows || [];
  }
  return templates;
}

/**
 * Áp một bộ mẫu xưởng → tạo tasks dự án (batch insert; checklist sau khi có id).
 * @returns {{ ok: true, count: number, task_ids: string[] } | { ok: false, error: string, statusCode?: number }}
 */
async function applyWorkshopTemplateToProject(projectId, templateId, userId) {
  const { data: project } = await supabase.from('projects').select('id').eq('id', projectId).maybeSingle();
  if (!project) {
    return { ok: false, error: 'Không tìm thấy dự án', statusCode: 404 };
  }

  const { data: tpl, error: te } = await supabase
    .from('workshop_task_templates')
    .select('id, workshop_area, is_active')
    .eq('id', templateId)
    .single();
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

  const now = Date.now();
  /** Deadline nối tiếp: chỉ nhiệm vụ đầu nhận hạn khi gắn bộ (từ lúc gắn + deadline_days). Các nhiệm vụ sau nhận hạn khi nhiệm trước hoàn thành — xử lý ở scheduleNextWorkshopTaskAfterComplete. */
  const staged = items.map((item, idx) => {
    const guessedSlug = guessStageSlugForTemplateItemTitle(tpl.workshop_area, item.title);
    const stageId = resolveStageIdBySlug(guessedSlug) || fallbackStageId;
    let dueDate = null;
    if (idx === 0 && Number(item.deadline_days) > 0) {
      dueDate = new Date(now + Number(item.deadline_days) * 86400000).toISOString();
    }
    return { item, guessedSlug, stageId, dueDate };
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
    taskRows.push({
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
      },
    });
  }

  const { data: insertedTasks, error: insErr } = await supabase.from('tasks').insert(taskRows).select('id');
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

function isWorkshopCompanyColumnError(err) {
  const m = String(err?.message || '');
  return m.includes('workshop_task_templates.company_id') || (m.includes('column') && m.includes('company_id'));
}

/**
 * Chọn bộ mẫu mặc định: ưu tiên theo company_id dự án, sau đó bộ toàn cục (company_id NULL), cuối cùng bất kỳ default còn lại.
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
 * Sau khi tạo dự án từ deal thắng: áp bộ mẫu xưởng được đánh dấu «mặc định» (mỗi khu SX / VC-LĐ tối đa 1 bộ).
 */
async function applyDefaultWorkshopTemplatesForNewProject(projectId, userId) {
  let companyId = null;
  let logisticsCompanyId = null;
  // Allow overriding company scope (e.g. sx-handover assigns company_id then needs correct templates immediately)
  if (arguments.length >= 3 && arguments[2] && typeof arguments[2] === 'object') {
    companyId = arguments[2].companyId || null;
    logisticsCompanyId = arguments[2].logisticsCompanyId || null;
  }
  if (!companyId) {
    const { data: proj } = await supabase
      .from('projects')
      .select('company_id, logistics_company_id')
      .eq('id', projectId)
      .maybeSingle();
    companyId = proj?.company_id || null;
    logisticsCompanyId = proj?.logistics_company_id || null;
  }

  let total = 0;
  for (const area of ['production', 'logistics']) {
    try {
      const cidForArea = area === 'logistics' ? (logisticsCompanyId || companyId) : companyId;
      const defId = await resolveDefaultWorkshopTemplateId(area, cidForArea);
      if (!defId) continue;
      const r = await applyWorkshopTemplateToProject(projectId, defId, userId);
      if (r.ok) total += r.count;
      else console.warn(`[workshop-default-template] ${area}:`, r.error);
    } catch (e) {
      console.warn('[workshop-default-template] skip area', area, e.message);
    }
  }
  return total;
}

/**
 * Gen hàng loạt mọi bộ mẫu đang active theo workshop_area.
 * Idempotent: nếu dự án đã có task với metadata.workshop_template_id = template.id thì skip template đó.
 * Ưu tiên template theo company_id dự án, nếu không có thì dùng global (company_id NULL).
 */
async function applyAllActiveWorkshopTemplatesForArea(projectId, userId, { workshopArea = 'production', companyId = null } = {}) {
  const area = String(workshopArea || 'production');
  if (!['production', 'logistics'].includes(area)) {
    return { ok: false, error: 'workshop_area phải là production hoặc logistics' };
  }

  let proj;
  let pe;
  ({ data: proj, error: pe } = await supabase
    .from('projects')
    .select('id, company_id, logistics_company_id')
    .eq('id', projectId)
    .maybeSingle());
  if (pe && String(pe.message || '').includes('logistics_company_id')) {
    // Backward compatibility: DB chưa có cột logistics_company_id
    ({ data: proj, error: pe } = await supabase
      .from('projects')
      .select('id, company_id')
      .eq('id', projectId)
      .maybeSingle());
  }
  if (pe) return { ok: false, error: pe.message };
  if (!proj?.id) return { ok: false, error: 'Không tìm thấy dự án' };

  const cid =
    companyId !== undefined && companyId !== null && companyId !== ''
      ? companyId
      : (area === 'logistics' ? (proj.logistics_company_id || proj.company_id || null) : (proj.company_id || null));

  const templates = await fetchActiveWorkshopTemplatesForArea(area, cid);
  if (!templates.length) {
    return { ok: false, error: 'Chưa có bộ mẫu xưởng cho khu vực này' };
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
    const r0 = await applyWorkshopTemplateToProject(projectId, tid, userId);
    if (!r0.ok) return { ok: false, error: r0.error, template_id: tid, template_name: tpl.name || null };
    created_tasks += r0.count || 0;
    applied.push({ id: tid, name: tpl.name, created: r0.count || 0 });
  }

  return {
    ok: true,
    workshop_area: area,
    templates_total: templates.length,
    templates_applied: applied.length,
    templates_skipped: skipped_templates.length,
    created_tasks,
    applied,
    skipped_templates,
  };
}

/**
 * Khi một nhiệm vụ sinh từ bộ mẫu xưởng được đánh dấu hoàn thành: gán deadline cho nhiệm vụ kế tiếp trong cùng bộ
 * (due = lúc hoàn thành nhiệm trước + deadline_days của mục mẫu tương ứng).
 */
async function scheduleNextWorkshopTaskAfterComplete(task) {
  if (!task || task.status !== 'done') return { ok: false, skip: 'not_done' };
  const meta = task.metadata || {};
  const tplId = meta.workshop_template_id;
  const itemId = meta.workshop_template_item_id;
  const projectId = task.project_id;
  if (!tplId || !itemId || !projectId) return { ok: true, skip: 'not_workshop_chain' };

  const completedAt = task.completed_at ? new Date(task.completed_at) : new Date();

  const { data: chainItems, error: ie } = await supabase
    .from('workshop_task_template_items')
    .select('id, order_index, deadline_days')
    .eq('template_id', tplId)
    .order('order_index');
  if (ie || !chainItems?.length) return { ok: false, error: ie?.message };

  const curIdx = chainItems.findIndex((i) => String(i.id) === String(itemId));
  if (curIdx < 0 || curIdx >= chainItems.length - 1) return { ok: true, skip: 'no_next' };

  const nextItem = chainItems[curIdx + 1];
  const days = Number(nextItem.deadline_days) || 0;
  let dueDate = null;
  if (days > 0) {
    const d = new Date(completedAt.getTime());
    d.setDate(d.getDate() + days);
    dueDate = d.toISOString();
  }

  const { data: projectTasks, error: te } = await supabase
    .from('tasks')
    .select('id, metadata')
    .eq('project_id', projectId);
  if (te) return { ok: false, error: te.message };

  const nextTask = projectTasks?.find(
    (t) =>
      t.metadata?.workshop_template_item_id &&
      String(t.metadata.workshop_template_id) === String(tplId) &&
      String(t.metadata.workshop_template_item_id) === String(nextItem.id),
  );
  if (!nextTask?.id) return { ok: true, skip: 'next_task_missing' };

  const { error: ue } = await supabase
    .from('tasks')
    .update({ due_date: dueDate, updated_at: new Date().toISOString() })
    .eq('id', nextTask.id);
  if (ue) return { ok: false, error: ue.message };
  return { ok: true, next_task_id: nextTask.id, due_date: dueDate };
}

module.exports = {
  applyWorkshopTemplateToProject,
  applyDefaultWorkshopTemplatesForNewProject,
  applyAllActiveWorkshopTemplatesForArea,
  fetchActiveWorkshopTemplatesForArea,
  resolveDefaultWorkshopTemplateId,
  normalizeChecklistForTaskInsert,
  resolveStageIdForWorkshopArea,
  scheduleNextWorkshopTaskAfterComplete,
};
