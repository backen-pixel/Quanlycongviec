// ═══════════════════════════════════════════════════════════════════════════
// AUTO-GEN CRM TASKS — Shared helper (dùng chung cho crm.js + facebook.js)
// ═══════════════════════════════════════════════════════════════════════════

const { supabase } = require('../config/supabase');

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

  const pipelineFilter = type === 'deal'
    ? 'pipeline_type.eq.deal,pipeline_type.eq.both,pipeline_type.is.null'
    : 'pipeline_type.eq.lead,pipeline_type.eq.both,pipeline_type.is.null';

  let { data: templates, error: tplErr } = await supabase
    .from('crm_task_templates')
    .select('id, name, stage_slug, pipeline_type')
    .eq('is_default', true).eq('is_active', true)
    .or(pipelineFilter)
    .order('order_index');

  if (templates?.length) {
    templates = templates.filter(t => {
      const isDealSlug = t.stage_slug?.startsWith('deal_');
      return type === 'deal' ? true : !isDealSlug;
    });
  }

  console.log(`[AUTO-TASK] ${type} ${leadId}: found ${templates?.length || 0} default templates, err=${tplErr?.message || 'none'}`);

  if (!templates?.length) {
    let { data: allTemplates } = await supabase
      .from('crm_task_templates')
      .select('id, name, stage_slug, pipeline_type')
      .eq('is_active', true)
      .or(pipelineFilter)
      .order('order_index');
    if (allTemplates?.length) {
      allTemplates = allTemplates.filter(t => {
        const isDealSlug = t.stage_slug?.startsWith('deal_');
        return type === 'deal' ? true : !isDealSlug;
      });
    }
    templates = allTemplates || [];
    console.log(`[AUTO-TASK] ${type} ${leadId}: fallback all active = ${templates.length} templates`);
  }

  let inserts = [];
  const now = new Date();

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

      inserts = allItems.map(item => ({
        lead_id: leadId,
        title: item.title,
        description: item.description || null,
        priority: item.priority || 'medium',
        stage_slug: tplMap[item.template_id]?.stage_slug || null,
        order_index: item.order_index,
        deadline: null,
        created_by: userId,
        completion_requires_file_or_note: !!item.completion_requires_file_or_note,
        completion_requires_customer_note: !!item.completion_requires_customer_note,
        completion_requires_customer_contact: !!item.completion_requires_customer_contact,
      }));
    }
  }

  if (!inserts.length) {
    const fallback = type === 'deal' ? FALLBACK_DEAL_TASKS : FALLBACK_LEAD_TASKS;
    inserts = fallback.map(item => ({
      lead_id: leadId,
      title: item.title,
      description: item.description || null,
      priority: item.priority || 'medium',
      stage_slug: item.stage_slug,
      order_index: item.order_index,
      deadline: null,
      created_by: userId,
    }));
    console.log(`[AUTO-TASK] No templates in DB, using ${inserts.length} fallback ${type} tasks`);
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
