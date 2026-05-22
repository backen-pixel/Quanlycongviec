/**
 * Gate "chặn chuyển giai đoạn theo nhiệm vụ CRM".
 *
 * Quy tắc:
 *  - Mỗi crm_tasks có cờ `blocks_stage_advance` (kế thừa từ crm_task_template_items).
 *  - Trước khi cho phép lead/deal chuyển sang giai đoạn khác (kéo Kanban / PATCH stage),
 *    nếu giai đoạn hiện tại còn tồn tại bất kỳ task nào:
 *      blocks_stage_advance = true AND status NOT IN ('completed','cancelled')
 *    → chặn và trả về danh sách công việc tồn đọng.
 *  - KHÔNG chặn khi giai đoạn đích là Thắng (is_won) hoặc Thua (is_lost).
 *  - KHÔNG chặn khi giai đoạn đích "lùi lại" (order_index <= current order_index).
 *  - KHÔNG chặn khi không xác định được template-slug cho giai đoạn hiện tại
 *    (vì pipeline có thể không có nhiệm vụ mẫu mapping).
 *
 * Áp dụng cho cả Lead và Deal — task của lead dùng slug `consulting`, deal có
 * `deal_new / deal_quote_contract / deal_ordering / deal_schedule / deal_shipping
 * / deal_notes` (hoặc các slug cũ `design / quotation / contract`).
 */

const { supabase } = require('../config/supabase');

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
  if (targetStage.is_won || targetStage.is_lost) return true;
  if (!currentStage) return true;
  if (String(currentStage.id || '') === String(targetStage.id || '')) return true;
  const a = Number(currentStage.order_index);
  const b = Number(targetStage.order_index);
  if (Number.isFinite(a) && Number.isFinite(b) && b <= a) return true;
  return false;
}

/**
 * @returns {Promise<{ ok: true } | { ok: false, error: string, code: string, remaining_tasks: Array }>}
 */
/**
 * Triết lý mới: BẮT BUỘC hoàn thành mọi nhiệm vụ CRM của giai đoạn hiện tại
 * trước khi chuyển sang giai đoạn mới (trừ trường hợp shouldSkipGate: lùi/Thắng/Thua/Hủy).
 *
 * Không cần tick cờ "blocks_stage_advance" trên từng task nữa — mặc định CHẶN tất cả.
 * (Cờ blocks_stage_advance vẫn dùng để đánh dấu task ưu tiên cao, nhưng mọi task chưa
 *  hoàn thành đều chặn.)
 */
async function assertCrmStageAdvanceAllowed({ leadId, leadType, currentStage, targetStage }) {
  try {
    if (shouldSkipGate(currentStage, targetStage)) return { ok: true };

    const buildBlockResponse = (tasks) => {
      const names = tasks.map((t) => `• ${t.title}`).join('\n');
      return {
        ok: false,
        code: 'CRM_BLOCKING_TASKS_INCOMPLETE',
        error:
          `⛔ Không thể chuyển sang "${targetStage?.name || 'giai đoạn mới'}"\n\n`
          + `Còn ${tasks.length} nhiệm vụ chưa hoàn thành ở giai đoạn "${currentStage?.name || ''}":\n${names}\n\n`
          + `👉 Hãy hoàn thành các nhiệm vụ trên (hoặc đánh dấu hủy) rồi chuyển giai đoạn lại.`,
        remaining_tasks: tasks,
        current_stage_id: currentStage?.id || null,
        target_stage_id: targetStage?.id || null,
      };
    };

    // (1) Ưu tiên match theo pipeline_stage_id (chính xác).
    //     CHẶN tất cả task chưa completed/cancelled — không lọc theo blocks_stage_advance.
    if (currentStage?.id) {
      const { data: byStageId, error: errStageId } = await supabase
        .from('crm_tasks')
        .select('id, title, status, blocks_stage_advance')
        .eq('lead_id', leadId)
        .eq('pipeline_stage_id', currentStage.id)
        .not('status', 'in', '(completed,cancelled)')
        .limit(50);
      if (errStageId) {
        if (!String(errStageId.message || '').includes('pipeline_stage_id')) {
          console.warn('[crmTaskStageAdvanceGate] query (pipeline_stage_id) error:', errStageId.message);
        }
      } else if (byStageId?.length) {
        return buildBlockResponse(byStageId);
      } else {
        // Có check theo pipeline_stage_id và rỗng → cho phép qua, không cần fallback slug
        return { ok: true };
      }
    }

    // (2) Fallback theo stage_slug (data cũ không có pipeline_stage_id).
    const slug = inferTaskStageSlugForPipelineStage(currentStage, leadType);
    if (!slug) return { ok: true };
    const { data: blockingTasks, error } = await supabase
      .from('crm_tasks')
      .select('id, title, status, blocks_stage_advance')
      .eq('lead_id', leadId)
      .eq('stage_slug', slug)
      .not('status', 'in', '(completed,cancelled)')
      .limit(50);
    if (error) {
      console.warn('[crmTaskStageAdvanceGate] query (slug) error:', error.message);
      return { ok: true };
    }
    if (!blockingTasks?.length) return { ok: true };
    return buildBlockResponse(blockingTasks);
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
};
