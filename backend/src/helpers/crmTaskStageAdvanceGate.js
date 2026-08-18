/**
 * Gate "chặn chuyển giai đoạn theo nhiệm vụ CRM".
 *
 * Quy tắc:
 *  - blocks_stage_advance = true + chưa completed/cancelled → chặn.
 *  - completion_requires_file_or_note = true + thiếu ghi chú/đính kèm → chặn.
 *  - KHÔNG chặn khi giai đoạn đích là Thắng (is_won), Thua (is_lost) hoặc Hoàn thành.
 *  - KHÔNG chặn khi giai đoạn đích "lùi lại" (order_index <= current order_index).
 *
 * Áp dụng cho cả Lead và Deal.
 */

const { supabase } = require('../config/supabase');
const { crmTaskMeetsRequiredFileTypes } = require('./crmTaskCompletionEvidence');
const { taskRequiresTypedEvidence } = require('./evidenceFileTypes');
const {
  taskRequiresQuickVerdict,
  quickVerdictMeetsRequirement,
  formatQuickVerdictBlockLabel,
} = require('./taskQuickVerdict');
const { isCrmCompletedStage } = require('./completeOpenWorkOnModuleDone');

/** Mapping từ tên giai đoạn (đã chuẩn hoá) → template-slug của bộ nhiệm vụ Lead. */
const LEAD_STAGE_NAME_TO_SLUG = [
  { keywords: ['tu van', 'tiep nhan'], slug: 'consulting' },
];

/**
 * Mapping cho Deal. Ưu tiên giai đoạn deal_* (mới), fallback các slug cũ
 * (consulting / design / quotation / contract) nếu task được tạo từ template cũ.
 */
const DEAL_STAGE_NAME_TO_SLUG = [
  { keywords: ['nhiem vu deal moi', 'deal moi'], slug: 'deal_new' },
  { keywords: ['bao gia & hop dong', 'bao gia va hop dong', 'hop dong & bao gia'], slug: 'deal_quote_contract' },
  { keywords: ['tien hanh dat hang', 'dat hang'], slug: 'deal_ordering' },
  { keywords: ['hen ngay lap dat', 'lap dat'], slug: 'deal_schedule' },
  { keywords: ['dat van chuyen', 'van chuyen'], slug: 'deal_shipping' },
  { keywords: ['ghi chu khac'], slug: 'deal_notes' },
  // Fallback slug cũ
  { keywords: ['tu van', 'tiep nhan', 'da khao sat'], slug: 'consulting' },
  { keywords: ['thiet ke', 'khao sat'], slug: 'design' },
  { keywords: ['bao gia', 'de xuat'], slug: 'quotation' },
  { keywords: ['hop dong', 'dam phan', 'chot don', 'cot lai'], slug: 'contract' },
];

function foldVi(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .trim();
}

/**
 * Suy luận template-slug từ stage record (name + pipeline_type).
 * Trả về null nếu không khớp pattern nào (khi đó gate sẽ skip).
 */
function inferTaskStageSlugForPipelineStage(stage, leadType) {
  if (!stage || !stage.name) return null;
  const n = foldVi(stage.name);
  const ptype = stage.pipeline_type || leadType;
  const table = ptype === 'deal' ? DEAL_STAGE_NAME_TO_SLUG : LEAD_STAGE_NAME_TO_SLUG;
  for (const row of table) {
    if (row.keywords.some((k) => n.includes(k))) return row.slug;
  }
  return null;
}

/**
 * @param {object} currentStage  { id, name, order_index, is_won, is_lost, pipeline_type }
 * @param {object} targetStage   { id, name, order_index, is_won, is_lost, pipeline_type }
 * @returns {boolean} true nếu được phép bỏ qua gate
 */
function shouldSkipGate(currentStage, targetStage) {
  if (!targetStage) return true;
  if (targetStage.is_won || targetStage.is_lost || isCrmCompletedStage(targetStage)) return true;
  if (!currentStage) return true;
  if (String(currentStage.id || '') === String(targetStage.id || '')) return true;
  const a = Number(currentStage.order_index);
  const b = Number(targetStage.order_index);
  if (Number.isFinite(a) && Number.isFinite(b) && b <= a) return true;
  return false;
}

const TASK_SELECT =
  'id, title, status, blocks_stage_advance, completion_requires_file_or_note, required_evidence_file_types, requires_quick_verdict, quick_verdict, quick_verdict_reason, notes';

async function fetchStageTasks(leadId, currentStage, leadType) {
  if (currentStage?.id) {
    const { data, error } = await supabase
      .from('crm_tasks')
      .select(TASK_SELECT)
      .eq('lead_id', leadId)
      .eq('pipeline_stage_id', currentStage.id)
      .neq('status', 'cancelled')
      .limit(100);
    if (!error) return data || [];
    if (!String(error.message || '').includes('pipeline_stage_id')) {
      console.warn('[crmTaskStageAdvanceGate] query (pipeline_stage_id) error:', error.message);
    }
  }

  const slug = inferTaskStageSlugForPipelineStage(currentStage, leadType);
  if (!slug) return [];
  const { data: blockingTasks, error } = await supabase
    .from('crm_tasks')
    .select(TASK_SELECT)
    .eq('lead_id', leadId)
    .eq('stage_slug', slug)
    .neq('status', 'cancelled')
    .limit(100);
  if (error) {
    console.warn('[crmTaskStageAdvanceGate] query (slug) error:', error.message);
    return [];
  }
  return blockingTasks || [];
}

/**
 * @returns {Promise<Array<{ id, title, status, blocks_stage_advance, completion_requires_file_or_note, block_reason }>>}
 */
async function collectBlockingTasks(tasks, stageMeta = null) {
  const blocking = [];
  const seen = new Set();

  const push = (task, blockReason, extra = {}) => {
    if (!task?.id || seen.has(task.id)) return;
    seen.add(task.id);
    blocking.push({
      id: task.id,
      title: task.title,
      status: task.status,
      blocks_stage_advance: !!task.blocks_stage_advance,
      completion_requires_file_or_note: !!task.completion_requires_file_or_note,
      required_evidence_file_types: task.required_evidence_file_types || [],
      block_reason: blockReason,
      stage_id: stageMeta?.id || null,
      stage_name: stageMeta?.name || null,
      ...extra,
    });
  };

  for (const task of tasks) {
    if (task.blocks_stage_advance && task.status !== 'completed') {
      push(task, 'incomplete');
    }
  }

  for (const task of tasks) {
    if (!taskRequiresTypedEvidence(task)) continue;
    try {
      const check = await crmTaskMeetsRequiredFileTypes(supabase, task.id, task);
      if (!check.ok) {
        push(task, 'missing_evidence', { missing_file_types: check.missing, missing_label: check.missingLabel });
      }
    } catch (e) {
      console.warn('[crmTaskStageAdvanceGate] evidence check error:', e.message);
    }
  }

  for (const task of tasks) {
    if (!taskRequiresQuickVerdict(task)) continue;
    if (!quickVerdictMeetsRequirement(task)) {
      push(task, 'missing_quick_verdict', {
        missing_label: formatQuickVerdictBlockLabel(task),
      });
    }
  }

  return blocking;
}

function formatBlockingTaskLine(t) {
  const prefix = t.stage_name ? `[${t.stage_name}] ` : '';
  if (t.block_reason === 'missing_evidence') {
    const label = t.missing_label || 'ghi chú hoặc file đính kèm';
    return `• ${prefix}${t.title} (thiếu: ${label})`;
  }
  if (t.block_reason === 'missing_quick_verdict') {
    const label = t.missing_label || 'chưa chọn Đủ/Chưa';
    return `• ${prefix}${t.title} (ghi chú nhanh: ${label})`;
  }
  return `• ${prefix}${t.title} (chưa hoàn thành)`;
}

function buildBlockResponse(tasks, currentStage, targetStage) {
  const stageNames = [...new Set(
    tasks.map((t) => t.stage_name).filter(Boolean),
  )];
  const stageLabel = stageNames.length > 1
    ? stageNames.map((n) => `"${n}"`).join(', ')
    : `"${stageNames[0] || currentStage?.name || ''}"`;

  const names = tasks.map(formatBlockingTaskLine).join('\n');
  const hasEvidenceBlock = tasks.some((t) => t.block_reason === 'missing_evidence');
  const hasQuickVerdictBlock = tasks.some((t) => t.block_reason === 'missing_quick_verdict');
  const hasIncompleteBlock = tasks.some((t) => t.block_reason === 'incomplete');
  const hintParts = [];
  if (hasIncompleteBlock) hintParts.push('hoàn thành các nhiệm vụ có cờ «Chặn chuyển giai đoạn»');
  if (hasEvidenceBlock) hintParts.push('bổ sung ghi chú hoặc file đính kèm cho nhiệm vụ có cờ «Bắt buộc file/ghi chú»');
  if (hasQuickVerdictBlock) hintParts.push('chọn «Đã đủ» trong ghi chú nhanh (Đủ/Chưa) cho các nhiệm vụ yêu cầu');
  const hint = hintParts.length ? `👉 ${hintParts.join(' và ')} rồi chuyển giai đoạn lại.` : '';

  const multiHop = stageNames.length > 1;

  return {
    ok: false,
    code: 'CRM_BLOCKING_TASKS_INCOMPLETE',
    error:
      `⛔ Không thể chuyển sang "${targetStage?.name || 'giai đoạn mới'}"\n\n`
      + (multiHop
        ? `Còn ${tasks.length} nhiệm vụ chặn ở ${stageNames.length} giai đoạn cần qua (${stageLabel}):\n`
        : `Còn ${tasks.length} nhiệm vụ chặn chuyển giai đoạn ở ${stageLabel}:\n`)
      + `${names}\n\n`
      + hint,
    remaining_tasks: tasks,
    current_stage_id: currentStage?.id || null,
    target_stage_id: targetStage?.id || null,
    checked_stage_names: stageNames,
  };
}

async function resolvePipelineId(currentStage, targetStage) {
  const direct = currentStage?.pipeline_id || targetStage?.pipeline_id;
  if (direct) return direct;
  const stageId = currentStage?.id || targetStage?.id;
  if (!stageId) return null;
  const { data } = await supabase
    .from('crm_pipeline_stages')
    .select('pipeline_id')
    .eq('id', stageId)
    .maybeSingle();
  return data?.pipeline_id || null;
}

/** Các cột pipeline phải qua khi nhảy từ current → target (gồm cột hiện tại, không gồm cột đích). */
async function listForwardStagesBetween(currentStage, targetStage) {
  if (!currentStage?.id) return [];
  const curIdx = Number(currentStage.order_index);
  const tgtIdx = Number(targetStage?.order_index);
  if (!Number.isFinite(curIdx) || !Number.isFinite(tgtIdx) || tgtIdx <= curIdx) {
    return [currentStage];
  }
  const pipelineId = await resolvePipelineId(currentStage, targetStage);
  if (!pipelineId) return [currentStage];

  const { data: stages, error } = await supabase
    .from('crm_pipeline_stages')
    .select('id, name, order_index, is_won, is_lost, pipeline_type, pipeline_id')
    .eq('pipeline_id', pipelineId)
    .eq('is_active', true)
    .gte('order_index', curIdx)
    .lt('order_index', tgtIdx)
    .order('order_index');
  if (error) {
    console.warn('[crmTaskStageAdvanceGate] listForwardStagesBetween:', error.message);
    return [currentStage];
  }
  const list = Array.isArray(stages) ? stages : [];
  return list.length ? list : [currentStage];
}

async function collectBlockingTasksAcrossStages(leadId, leadType, stages) {
  const allBlocking = [];
  const seen = new Set();

  for (const stage of stages) {
    const tasks = await fetchStageTasks(leadId, stage, leadType);
    if (!tasks.length) continue;
    const blocking = await collectBlockingTasks(tasks, stage);
    for (const row of blocking) {
      if (!row?.id || seen.has(row.id)) continue;
      seen.add(row.id);
      allBlocking.push(row);
    }
  }

  return allBlocking;
}

/**
 * @returns {Promise<{ ok: true } | { ok: false, error: string, code: string, remaining_tasks: Array }>}
 */
async function assertCrmStageAdvanceAllowed({ leadId, leadType, currentStage, targetStage }) {
  try {
    if (shouldSkipGate(currentStage, targetStage)) return { ok: true };

    const stagesToCheck = await listForwardStagesBetween(currentStage, targetStage);
    const blocking = await collectBlockingTasksAcrossStages(leadId, leadType, stagesToCheck);
    if (!blocking.length) return { ok: true };

    return buildBlockResponse(blocking, currentStage, targetStage);
  } catch (e) {
    console.warn('[crmTaskStageAdvanceGate] unexpected:', e.message);
    return { ok: true };
  }
}

module.exports = {
  assertCrmStageAdvanceAllowed,
  inferTaskStageSlugForPipelineStage,
  shouldSkipGate,
  foldVi,
  LEAD_STAGE_NAME_TO_SLUG,
  DEAL_STAGE_NAME_TO_SLUG,
  collectBlockingTasks,
  fetchStageTasks,
  listForwardStagesBetween,
  collectBlockingTasksAcrossStages,
};
