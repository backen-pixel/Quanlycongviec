/**
 * Gate "chặn kéo cột Kanban SX theo nhiệm vụ xưởng".
 *
 * Quy tắc parity với CRM:
 *  - Mỗi `workshop_task_template_items.blocks_stage_advance` (cờ trên mẫu xưởng).
 *  - Khi gen → `crm_tasks.blocks_stage_advance` (sx_*) hoặc `tasks.blocks_stage_advance` (tasks dự án) kế thừa cờ.
 *  - CHỈ chặn khi cột nguồn còn task thỏa MỌI điều kiện:
 *      blocks_stage_advance = true
 *      AND production_pipeline_stage_id = currentColId   (crm_tasks sx_*)
 *           hoặc production_stage_id = currentColId      (tasks dự án)
 *      AND status NOT IN ('completed','cancelled','done')
 *  - KHÔNG chặn khi:
 *      • Target là cột intake (bucket_slug = INTAKE_BUCKET) → cho phép kéo lùi.
 *      • Target có order_index <= current order_index → kéo lùi.
 *      • Không xác định được currentColId (project chưa có cột Kanban SX nào).
 *
 * Áp dụng cho `PATCH /production/projects/:id/stage` (kéo cột pipeline SX trên Kanban / Stepper).
 */

const { supabase } = require('../config/supabase');
const { INTAKE_BUCKET } = require('./workshopKanban');

function buildBlockResponse(currentCol, targetCol, blockingItems) {
  const names = blockingItems.map((t) => `• ${t.title}`).join('\n');
  return {
    ok: false,
    code: 'SX_BLOCKING_TASKS_INCOMPLETE',
    error:
      `⛔ Không thể chuyển sang cột "${targetCol?.name || 'cột mới'}"\n\n`
      + `Còn ${blockingItems.length} nhiệm vụ chặn chuyển giai đoạn chưa hoàn thành ở "${currentCol?.name || ''}":\n${names}\n\n`
      + `👉 Hoàn thành (hoặc đánh dấu hủy) các nhiệm vụ trên rồi kéo cột lại.\n`
      + `Mẹo: nhiệm vụ không tick "Chặn chuyển giai đoạn" có thể bỏ qua, không cản trở.`,
    remaining_tasks: blockingItems,
    current_stage_id: currentCol?.id || null,
    target_stage_id: targetCol?.id || null,
    current_stage_name: currentCol?.name || null,
    target_stage_name: targetCol?.name || null,
  };
}

/**
 * Xác định cột Kanban SX hiện tại của project (nguồn) theo ưu tiên:
 *   1) crm_leads.sx_pipeline_stage_id (nếu nằm trong company + workshop_type)
 *   2) Fallback null (không xác định được — cho qua gate)
 */
async function resolveCurrentSxColumn(projectId) {
  const { data: lead } = await supabase
    .from('crm_leads')
    .select('id, sx_pipeline_stage_id')
    .eq('project_id', projectId)
    .eq('type', 'deal')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const colId = lead?.sx_pipeline_stage_id || null;
  if (!colId) return null;
  const { data: col } = await supabase
    .from('production_pipeline_stages')
    .select('id, name, order_index, bucket_slug, workshop_type_id, company_id')
    .eq('id', colId)
    .maybeSingle();
  return col || null;
}

async function resolveTargetSxColumn(targetColId) {
  if (!targetColId) return null;
  const { data } = await supabase
    .from('production_pipeline_stages')
    .select('id, name, order_index, bucket_slug, workshop_type_id, company_id')
    .eq('id', targetColId)
    .maybeSingle();
  return data || null;
}

function shouldSkipGate(currentCol, targetCol) {
  if (!currentCol?.id) return true;
  if (!targetCol?.id) return true;
  if (String(currentCol.id) === String(targetCol.id)) return true;
  if (targetCol.bucket_slug === INTAKE_BUCKET) return true; // kéo về intake
  const a = Number(currentCol.order_index);
  const b = Number(targetCol.order_index);
  if (Number.isFinite(a) && Number.isFinite(b) && b <= a) return true;
  return false;
}

/**
 * @param {object} args
 * @param {string} args.projectId
 * @param {string} args.targetColId           production_pipeline_stages.id của cột đích
 * @param {string|null} [args.currentColId]   Nếu biết sẵn (vd: from PATCH body)
 * @returns {Promise<{ok:true}|{ok:false,error,code,remaining_tasks,...}>}
 */
async function assertSxKanbanAdvanceAllowed({ projectId, targetColId, currentColId = null }) {
  try {
    const targetCol = await resolveTargetSxColumn(targetColId);
    let currentCol = null;
    if (currentColId) {
      currentCol = await resolveTargetSxColumn(currentColId);
    }
    if (!currentCol) currentCol = await resolveCurrentSxColumn(projectId);

    if (shouldSkipGate(currentCol, targetCol)) return { ok: true };

    // (1) crm_tasks sx_* gắn cột hiện tại + cờ chặn — chưa completed/cancelled.
    const blockingCrm = [];
    try {
      const { data: leadRows } = await supabase
        .from('crm_leads')
        .select('id')
        .eq('project_id', projectId);
      const leadIds = (leadRows || []).map((l) => l.id).filter(Boolean);
      if (leadIds.length) {
        const { data: rows, error } = await supabase
          .from('crm_tasks')
          .select('id, lead_id, title, status, stage_slug, blocks_stage_advance, production_pipeline_stage_id')
          .in('lead_id', leadIds)
          .eq('production_pipeline_stage_id', currentCol.id)
          .eq('blocks_stage_advance', true)
          .not('status', 'in', '(completed,cancelled)')
          .limit(50);
        if (!error && Array.isArray(rows)) blockingCrm.push(...rows);
        else if (error && !String(error.message || '').includes('production_pipeline_stage_id')) {
          console.warn('[workshopStageAdvanceGate] crm_tasks query:', error.message);
        }
      }
    } catch (e) {
      console.warn('[workshopStageAdvanceGate] crm_tasks lookup:', e.message);
    }

    // (2) tasks dự án gắn cột hiện tại + cờ chặn — chưa done.
    const blockingProject = [];
    try {
      const { data: rows, error } = await supabase
        .from('tasks')
        .select('id, title, status, blocks_stage_advance, production_stage_id')
        .eq('project_id', projectId)
        .eq('production_stage_id', currentCol.id)
        .eq('blocks_stage_advance', true)
        .neq('status', 'done')
        .limit(50);
      if (!error && Array.isArray(rows)) blockingProject.push(...rows);
      else if (error && !String(error.message || '').includes('production_stage_id')) {
        console.warn('[workshopStageAdvanceGate] tasks query:', error.message);
      }
    } catch (e) {
      console.warn('[workshopStageAdvanceGate] tasks lookup:', e.message);
    }

    const all = [...blockingCrm, ...blockingProject];
    if (!all.length) return { ok: true };
    return buildBlockResponse(currentCol, targetCol, all);
  } catch (e) {
    console.warn('[workshopStageAdvanceGate] unexpected:', e.message);
    return { ok: true };
  }
}

module.exports = {
  assertSxKanbanAdvanceAllowed,
  shouldSkipGate,
};
