// ═══════════════════════════════════════════════════════════════════════════
// AUTO-GEN CRM TASKS — Shared helper (dùng chung cho crm.js + facebook.js)
// ═══════════════════════════════════════════════════════════════════════════

const { supabase } = require('../config/supabase');

const FALLBACK_LEAD_TASKS = [
  { title: 'Tiếp nhận yêu cầu khách hàng', description: 'Ghi nhận thông tin KH, nhu cầu sử dụng', priority: 'high', stage_slug: 'consulting', order_index: 1, deadline_days: 0 },
  { title: 'Tư vấn sản phẩm & vật liệu', description: 'Tư vấn chất liệu, phụ kiện phù hợp', priority: 'high', stage_slug: 'consulting', order_index: 2, deadline_days: 1 },
  { title: 'Khảo sát thực tế (nếu cần)', description: 'Đo đạc kích thước, kiểm tra hiện trạng', priority: 'medium', stage_slug: 'consulting', order_index: 3, deadline_days: 2 },
  { title: 'Ghi nhận nhu cầu chi tiết', description: 'Tổng hợp yêu cầu, xác nhận lại với KH', priority: 'medium', stage_slug: 'consulting', order_index: 4, deadline_days: 2 },
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
        deadline: item.deadline_days ? new Date(now.getTime() + item.deadline_days * 86400000).toISOString() : null,
        created_by: userId,
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
      deadline: item.deadline_days ? new Date(now.getTime() + item.deadline_days * 86400000).toISOString() : null,
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

module.exports = { autoGenCrmTasks, FALLBACK_LEAD_TASKS, FALLBACK_DEAL_TASKS };
