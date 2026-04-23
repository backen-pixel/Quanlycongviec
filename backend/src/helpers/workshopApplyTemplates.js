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
 * Áp một bộ mẫu xưởng → tạo tasks dự án (dùng cho API và auto-gen deal thắng).
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

  // Resolve stage ids that Production UI uses (tasks.stage_id is workflow_stages.id)
  const { bySlug } = await getWorkshopStageMap();
  const fallbackStageId = await resolveStageIdForWorkshopArea(tpl.workshop_area);
  const resolveStageIdBySlug = (slug) => {
    const s = bySlug?.[slug];
    return s?.id ?? null;
  };

  if (!fallbackStageId) {
    return {
      ok: false,
      error: 'Chưa cấu hình workflow_stages (production / delivery…)',
      statusCode: 400,
    };
  }

  // Track per-stage order_index, because template items may be distributed across multiple stages.
  const orderBaseByStage = {};
  async function nextOrder(stageId) {
    if (!stageId) stageId = fallbackStageId;
    if (orderBaseByStage[stageId] == null) {
      const { data: lastTask } = await supabase
        .from('tasks')
        .select('order_index')
        .eq('project_id', projectId)
        .eq('stage_id', stageId)
        .order('order_index', { ascending: false })
        .limit(1);
      orderBaseByStage[stageId] = lastTask?.[0]?.order_index ?? 0;
    }
    orderBaseByStage[stageId] += 1;
    return orderBaseByStage[stageId];
  }

  const now = Date.now();
  const createdIds = [];

  for (const item of items) {
    const guessedSlug = guessStageSlugForTemplateItemTitle(tpl.workshop_area, item.title);
    const stageId = resolveStageIdBySlug(guessedSlug) || fallbackStageId;
    const orderIndex = await nextOrder(stageId);
    const dueDate = item.deadline_days
      ? new Date(now + item.deadline_days * 86400000).toISOString()
      : null;

    const { data: taskRow, error: insErr } = await supabase
      .from('tasks')
      .insert({
        project_id: projectId,
        stage_id: stageId,
        title: item.title,
        description: item.description || null,
        priority: item.priority || 'medium',
        status: 'todo',
        task_type: 'project',
        created_by_id: userId,
        due_date: dueDate,
        order_index: orderIndex,
        metadata: { workshop_template_id: templateId, workshop_template_item_id: item.id, guessed_stage_slug: guessedSlug },
      })
      .select('id')
      .single();
    if (insErr) return { ok: false, error: insErr.message, statusCode: 500 };
    createdIds.push(taskRow.id);

    const checklistRows = normalizeChecklistForTaskInsert(item.checklist);
    for (let ci = 0; ci < checklistRows.length; ci++) {
      const row = checklistRows[ci];
      try {
        await supabase.from('task_checklists').insert({
          task_id: taskRow.id,
          title: row.title,
          order_index: row.order_index ?? ci,
        });
      } catch (clErr) {
        console.warn('[workshop-template] checklist insert:', clErr.message);
      }
    }
  }

  return { ok: true, count: createdIds.length, task_ids: createdIds };
}

/**
 * Sau khi tạo dự án từ deal thắng: áp bộ mẫu xưởng được đánh dấu «mặc định» (mỗi khu SX / VC-LĐ tối đa 1 bộ).
 */
async function applyDefaultWorkshopTemplatesForNewProject(projectId, userId) {
  let total = 0;
  for (const area of ['production', 'logistics']) {
    try {
      const { data: def } = await supabase
        .from('workshop_task_templates')
        .select('id')
        .eq('workshop_area', area)
        .eq('is_default', true)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (!def?.id) continue;
      const r = await applyWorkshopTemplateToProject(projectId, def.id, userId);
      if (r.ok) total += r.count;
      else console.warn(`[workshop-default-template] ${area}:`, r.error);
    } catch (e) {
      console.warn('[workshop-default-template] skip area', area, e.message);
    }
  }
  return total;
}

module.exports = {
  applyWorkshopTemplateToProject,
  applyDefaultWorkshopTemplatesForNewProject,
  normalizeChecklistForTaskInsert,
  resolveStageIdForWorkshopArea,
};
