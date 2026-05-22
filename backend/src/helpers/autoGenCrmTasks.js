// ═══════════════════════════════════════════════════════════════════════════
// AUTO-GEN CRM TASKS — Shared helper (dùng chung cho crm.js + facebook.js)
// ═══════════════════════════════════════════════════════════════════════════

const { supabase } = require('../config/supabase');
const { getDefaultPipelineIdForCompany } = require('./crmTaxonomyCache');

const FALLBACK_LEAD_TASKS = [
  { title: 'Tiếp nhận yêu cầu khách hàng', description: 'Ghi nhận thông tin KH, nhu cầu sử dụng', priority: 'high', stage_slug: 'consulting', order_index: 1, deadline_days: 0 },
  { title: 'Tư vấn sản phẩm & vật liệu', description: 'Tư vấn chất liệu, phụ kiện phù hợp', priority: 'high', stage_slug: 'consulting', order_index: 2, deadline_days: 1 },
  { title: 'Khảo sát thực tế (nếu cần)', description: 'Đo đạc kích thước, kiểm tra hiện trạng', priority: 'medium', stage_slug: 'consulting', order_index: 3, deadline_days: 2 },
  { title: 'Ghi nhận nhu cầu chi tiết', description: 'Tổng hợp yêu cầu, xác nhận lại với KH', priority: 'medium', stage_slug: 'consulting', order_index: 4, deadline_days: 2 },
  // Đơn hàng
  { title: 'Lập đơn hàng', description: 'Tạo đơn hàng từ thông tin KH, sản phẩm yêu cầu', priority: 'high', stage_slug: 'order', order_index: 1, deadline_days: 3 },
  { title: 'Xác nhận đơn hàng với KH', description: 'Gửi đơn hàng cho KH xác nhận số lượng, giá', priority: 'high', stage_slug: 'order', order_index: 2, deadline_days: 4 },
  { title: 'Theo dõi tiến độ đơn hàng', description: 'Cập nhật trạng thái ĐH, phối hợp sản xuất/giao hàng', priority: 'medium', stage_slug: 'order', order_index: 3, deadline_days: 7 },
];

const FALLBACK_DEAL_TASKS = [
  { title: 'Xác nhận yêu cầu từ Lead', description: 'Review thông tin từ giai đoạn Lead', priority: 'high', stage_slug: 'consulting', order_index: 1, deadline_days: 0 },
  { title: 'Tư vấn chi tiết sản phẩm', description: 'Tư vấn chuyên sâu, báo giá sơ bộ', priority: 'high', stage_slug: 'consulting', order_index: 2, deadline_days: 1 },
  { title: 'Thiết kế bản vẽ sơ bộ', description: 'Bản vẽ 2D/3D sơ bộ theo yêu cầu', priority: 'high', stage_slug: 'design', order_index: 1, deadline_days: 3 },
  { title: 'Gửi bản vẽ cho KH duyệt', description: 'Gửi bản vẽ, hẹn feedback', priority: 'high', stage_slug: 'design', order_index: 2, deadline_days: 4 },
  { title: 'Hoàn thiện bản vẽ kỹ thuật', description: 'Bản vẽ chi tiết cho sản xuất', priority: 'high', stage_slug: 'design', order_index: 3, deadline_days: 7 },
  { title: 'Lập báo giá chi tiết', description: 'Báo giá theo hạng mục, breakdown chi tiết', priority: 'high', stage_slug: 'quotation', order_index: 1, deadline_days: 2 },
  { title: 'Gửi báo giá cho KH', description: 'Gửi báo giá, giải thích', priority: 'high', stage_slug: 'quotation', order_index: 2, deadline_days: 2 },
  { title: 'Thương lượng & chốt giá', description: 'Đàm phán chiết khấu, điều khoản', priority: 'medium', stage_slug: 'quotation', order_index: 3, deadline_days: 5 },
  { title: 'Soạn hợp đồng', description: 'Soạn HĐ từ mẫu, điền thông tin', priority: 'high', stage_slug: 'contract', order_index: 1, deadline_days: 1 },
  { title: 'Ký hợp đồng', description: 'Hẹn KH ký HĐ', priority: 'urgent', stage_slug: 'contract', order_index: 2, deadline_days: 5 },
  { title: 'Thu tiền đặt cọc', description: 'Thu cọc theo tỷ lệ trong HĐ', priority: 'urgent', stage_slug: 'contract', order_index: 3, deadline_days: 5 },
  // Đơn hàng
  { title: 'Lập đơn hàng', description: 'Tạo ĐH từ báo giá hoặc thông tin deal', priority: 'high', stage_slug: 'order', order_index: 1, deadline_days: 6 },
  { title: 'Xác nhận đơn hàng với KH', description: 'Gửi ĐH cho KH xác nhận, kiểm tra số lượng & giá', priority: 'high', stage_slug: 'order', order_index: 2, deadline_days: 7 },
  { title: 'Theo dõi tiến độ đơn hàng', description: 'Cập nhật trạng thái ĐH, phối hợp SX/giao hàng', priority: 'medium', stage_slug: 'order', order_index: 3, deadline_days: 14 },
];

async function autoGenCrmTasks(leadId, type, userId) {
  const { count: existingCount } = await supabase.from('crm_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', leadId);
  if (existingCount > 0) {
    console.log(`[AUTO-TASK] Skip: ${type} ${leadId} already has ${existingCount} tasks`);
    return 0;
  }

  // Lấy stage_id + pipeline_id + company_id của lead/deal để ưu tiên template theo pipeline.
  const { data: leadRow } = await supabase
    .from('crm_leads')
    .select('stage_id, pipeline_id, company_id')
    .eq('id', leadId)
    .maybeSingle();
  let leadStageId = leadRow?.stage_id || null;
  let leadPipelineId = leadRow?.pipeline_id || null;
  const leadCompanyId = leadRow?.company_id || null;

  // Nếu lead/deal chưa có pipeline_id (rất phổ biến khi tạo mới qua form không pick pipeline),
  // tự lấy pipeline mặc định của công ty (is_default=true, fallback pipeline đầu tiên).
  // Sau đó backfill vào crm_leads để cố định pipeline cho lead/deal này.
  if (!leadPipelineId && leadCompanyId) {
    try {
      const defPid = await getDefaultPipelineIdForCompany(leadCompanyId);
      if (defPid) {
        leadPipelineId = defPid;
        // Cũng lấy stage đầu của pipeline mặc định nếu lead chưa có stage_id
        let backfillStageId = leadStageId;
        if (!backfillStageId) {
          const { data: firstStage } = await supabase
            .from('crm_pipeline_stages')
            .select('id')
            .eq('pipeline_id', defPid)
            .eq('is_active', true)
            .order('order_index')
            .limit(1)
            .maybeSingle();
          if (firstStage?.id) backfillStageId = firstStage.id;
        }
        const patch = { pipeline_id: defPid };
        if (backfillStageId && !leadStageId) {
          patch.stage_id = backfillStageId;
          leadStageId = backfillStageId;
        }
        const { error: backfillErr } = await supabase.from('crm_leads').update(patch).eq('id', leadId);
        if (backfillErr) {
          console.warn(`[AUTO-TASK] backfill pipeline_id failed for ${type} ${leadId}:`, backfillErr.message);
        } else {
          console.log(`[AUTO-TASK] backfilled ${type} ${leadId} → pipeline=${defPid}${patch.stage_id ? ` stage=${patch.stage_id}` : ''}`);
        }
      } else {
        console.log(`[AUTO-TASK] ${type} ${leadId}: company=${leadCompanyId} chưa có pipeline → không thể auto-gen theo pipeline.`);
      }
    } catch (e) {
      console.warn(`[AUTO-TASK] resolve default pipeline error:`, e.message);
    }
  }

  let pipelineStageIds = [];
  if (leadPipelineId) {
    const { data: stages } = await supabase
      .from('crm_pipeline_stages')
      .select('id')
      .eq('pipeline_id', leadPipelineId);
    pipelineStageIds = (stages || []).map((s) => s.id);
  }

  // (1) Ưu tiên template gắn pipeline_stage_id thuộc pipeline của lead.
  let templates = [];
  if (pipelineStageIds.length) {
    const { data: pipelineTpls } = await supabase
      .from('crm_task_templates')
      .select('id, name, stage_slug, pipeline_type, pipeline_stage_id')
      .eq('is_active', true)
      .in('pipeline_stage_id', pipelineStageIds)
      .order('order_index');
    templates = pipelineTpls || [];
  }
  const usedPipelineTpl = templates.length > 0;

  // (2) Fallback Global templates theo stage_slug — CHỈ áp dụng cho lead/deal cũ
  // KHÔNG có pipeline_id (legacy). Lead/deal đã có pipeline thật:
  //   - Bắt buộc dùng template gắn pipeline_stage_id (đã filter ở bước 1).
  //   - Nếu pipeline chưa có template nào → KHÔNG gen task mặc định cũ.
  //     User vào trang Bộ mẫu CRM, chọn pipeline rồi tạo template cho từng giai đoạn,
  //     hoặc tạo task tay trên tab Nhiệm vụ.
  if (!usedPipelineTpl) {
    if (leadPipelineId) {
      console.log(`[AUTO-TASK] ${type} ${leadId}: pipeline=${leadPipelineId} chưa có template gắn pipeline_stage_id → skip auto-gen (no fallback to global/default).`);
      return 0;
    }

    // Lead/deal cũ không có pipeline → fallback Global (giữ tương thích cho dữ liệu lịch sử).
    const pipelineFilter = type === 'deal'
      ? 'pipeline_type.eq.deal,pipeline_type.eq.both,pipeline_type.is.null'
      : 'pipeline_type.eq.lead,pipeline_type.eq.both,pipeline_type.is.null';

    const baseSelect = supabase
      .from('crm_task_templates')
      .select('id, name, stage_slug, pipeline_type, pipeline_stage_id')
      .is('pipeline_stage_id', null);

    let { data: defTpls, error: tplErr } = await baseSelect
      .eq('is_default', true).eq('is_active', true)
      .or(pipelineFilter)
      .order('order_index');

    if (defTpls?.length) {
      defTpls = defTpls.filter(t => {
        const isDealSlug = t.stage_slug?.startsWith('deal_');
        return type === 'deal' ? true : !isDealSlug;
      });
    }

    console.log(`[AUTO-TASK] ${type} ${leadId}: legacy (no pipeline) — found ${defTpls?.length || 0} default Global templates, err=${tplErr?.message || 'none'}`);

    if (!defTpls?.length) {
      const { data: allTemplates } = await supabase
        .from('crm_task_templates')
        .select('id, name, stage_slug, pipeline_type, pipeline_stage_id')
        .is('pipeline_stage_id', null)
        .eq('is_active', true)
        .or(pipelineFilter)
        .order('order_index');
      defTpls = (allTemplates || []).filter(t => {
        const isDealSlug = t.stage_slug?.startsWith('deal_');
        return type === 'deal' ? true : !isDealSlug;
      });
      console.log(`[AUTO-TASK] ${type} ${leadId}: legacy fallback all active Global = ${defTpls.length} templates`);
    }
    templates = defTpls || [];
  } else {
    console.log(`[AUTO-TASK] ${type} ${leadId}: using ${templates.length} per-pipeline templates (pipeline=${leadPipelineId})`);
  }

  let inserts = [];

  if (templates?.length) {
    const tplIds = templates.map(t => t.id);
    const { data: allItems, error: itemErr } = await supabase
      .from('crm_task_template_items')
      .select('*')
      .in('template_id', tplIds)
      .order('order_index');

    console.log(`[AUTO-TASK] ${type} ${leadId}: found ${allItems?.length || 0} template items, err=${itemErr?.message || 'none'}`);

    if (allItems?.length) {
      const tplMap = {};
      templates.forEach(t => { tplMap[t.id] = t; });

      inserts = allItems.map(item => {
        const tpl = tplMap[item.template_id] || {};
        return {
          lead_id: leadId,
          title: item.title,
          description: item.description || null,
          priority: item.priority || 'medium',
          stage_slug: tpl.stage_slug || null,
          pipeline_stage_id: tpl.pipeline_stage_id || leadStageId || null,
          order_index: item.order_index,
          deadline: null,
          created_by: userId,
          completion_requires_file_or_note: !!item.completion_requires_file_or_note,
          completion_requires_customer_note: !!item.completion_requires_customer_note,
          completion_requires_customer_contact: !!item.completion_requires_customer_contact,
          blocks_stage_advance: !!item.blocks_stage_advance,
        };
      });
    }
  }

  // KHÔNG gen FALLBACK_*_TASKS hardcoded nữa.
  // Triết lý mới: "chỉ gen những gì đã setup, chưa setup thì không tự tạo nhiệm vụ".
  // - Lead/deal có pipeline + công ty đã setup template gắn pipeline_stage_id → gen.
  // - Lead/deal có pipeline nhưng pipeline chưa có template → không gen (return 0).
  // - Lead/deal không có pipeline / không có company → không gen (return 0).
  // User có thể vào tab Nhiệm vụ → "Áp dụng mẫu" / "Thêm việc" để tạo tay khi cần.
  if (!inserts.length) {
    console.log(`[AUTO-TASK] ${type} ${leadId}: không có template setup → SKIP (no hardcoded fallback).`);
  }

  if (inserts.length) {
    const { error } = await supabase.from('crm_tasks').insert(inserts);
    if (error) {
      console.error(`[AUTO-TASK] Insert error:`, error.message);
      return 0;
    }
    console.log(`[AUTO-TASK] ✅ Created ${inserts.length} tasks for ${type} ${leadId}`);
    return inserts.length;
  }
  return 0;
}

/** Slugs coi là giai đoạn Tư vấn trên deal (sau khi chuyển từ lead → deal cần tick hoàn thành hết). */
const CONSULTING_STAGE_SLUGS = ['consulting', 'deal_new'];

/**
 * Đánh dấu hoàn thành toàn bộ crm_tasks thuộc giai đoạn Tư vấn (sau khi lead đã chuyển sang deal và trigger đã gen task mới).
 */
async function completeConsultingCrmTasksForLead(leadId) {
  if (!leadId) return { ok: false };
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('crm_tasks')
    .update({
      status: 'completed',
      completed_at: now,
      updated_at: now,
    })
    .eq('lead_id', leadId)
    .in('stage_slug', CONSULTING_STAGE_SLUGS)
    .neq('status', 'cancelled');
  if (error) {
    console.warn('[AUTO-TASK] completeConsultingCrmTasksForLead:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

module.exports = {
  autoGenCrmTasks,
  FALLBACK_LEAD_TASKS,
  FALLBACK_DEAL_TASKS,
  completeConsultingCrmTasksForLead,
};
