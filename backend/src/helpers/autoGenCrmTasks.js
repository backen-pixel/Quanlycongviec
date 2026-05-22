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

function isSxCrmTaskRow(t) {
  return String(t?.stage_slug || '').startsWith('sx_');
}

async function pipelineHasActiveCrmTemplates(pipelineId) {
  if (!pipelineId) return false;
  const { data: stages } = await supabase
    .from('crm_pipeline_stages')
    .select('id')
    .eq('pipeline_id', pipelineId);
  const stageIds = (stages || []).map((s) => s.id);
  if (!stageIds.length) return false;
  const { count, error } = await supabase
    .from('crm_task_templates')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)
    .in('pipeline_stage_id', stageIds);
  if (error) throw error;
  return (count || 0) > 0;
}

/**
 * Dọn task CRM orphan (pipeline_stage_id = null) khi lead/deal đã có pipeline + bộ mẫu setup.
 * - Có task pipeline + orphan lẫn lộn → chỉ xóa orphan, giữ task pipeline.
 * - Chỉ orphan → xóa rồi autoGenCrmTasks.
 */
async function healOrphanCrmTasksForLead(leadId, userId) {
  const { data: lead } = await supabase
    .from('crm_leads')
    .select('type, pipeline_id, created_by')
    .eq('id', leadId)
    .maybeSingle();
  if (!lead?.pipeline_id) return { deleted: 0, created: 0, didHeal: false };

  const hasTemplates = await pipelineHasActiveCrmTemplates(lead.pipeline_id);
  if (!hasTemplates) return { deleted: 0, created: 0, didHeal: false };

  const { data: tasks, error: taskErr } = await supabase
    .from('crm_tasks')
    .select('id, stage_slug, pipeline_stage_id')
    .eq('lead_id', leadId);
  if (taskErr) throw taskErr;

  const crmTasks = (tasks || []).filter((t) => !isSxCrmTaskRow(t));
  const orphanCrm = crmTasks.filter((t) => !t.pipeline_stage_id);
  if (!orphanCrm.length) return { deleted: 0, created: 0, didHeal: false };

  const nonOrphanCrm = crmTasks.filter((t) => t.pipeline_stage_id);
  const orphanIds = orphanCrm.map((t) => t.id);
  const { error: delErr } = await supabase.from('crm_tasks').delete().in('id', orphanIds);
  if (delErr) throw delErr;

  let created = 0;
  if (nonOrphanCrm.length === 0) {
    created = await autoGenCrmTasks(leadId, lead.type || 'lead', userId || lead.created_by);
  }

  console.log(
    `[SELF-HEAL] lead=${leadId}: purged ${orphanIds.length} orphan task(s)`
    + (nonOrphanCrm.length ? ` (kept ${nonOrphanCrm.length} pipeline task(s))` : '')
    + (created ? `, regenerated ${created}` : ''),
  );

  return { deleted: orphanIds.length, created, didHeal: true };
}

/**
 * Áp bộ mẫu CRM cho một giai đoạn pipeline (pipeline_stage_id).
 * force=true: xóa task CRM hiện có của giai đoạn rồi tạo lại từ template.
 */
async function applyPipelineTemplatesForStage(leadId, stageId, userId, { force = false } = {}) {
  if (!leadId || !stageId) return { deleted: 0, created: 0, skipped: true };

  const { data: pipelineTpls } = await supabase
    .from('crm_task_templates')
    .select('id, stage_slug')
    .eq('pipeline_stage_id', stageId)
    .eq('is_active', true)
    .order('order_index');
  if (!pipelineTpls?.length) return { deleted: 0, created: 0, skipped: true, reason: 'no_template' };

  let deleted = 0;
  if (force) {
    const { data: existing } = await supabase
      .from('crm_tasks')
      .select('id, stage_slug')
      .eq('lead_id', leadId)
      .eq('pipeline_stage_id', stageId);
    const ids = (existing || []).filter((t) => !isSxCrmTaskRow(t)).map((t) => t.id);
    if (ids.length) {
      const { error: delErr } = await supabase.from('crm_tasks').delete().in('id', ids);
      if (delErr) throw delErr;
      deleted = ids.length;
    }
  } else {
    const { data: existsForStage } = await supabase
      .from('crm_tasks')
      .select('id')
      .eq('lead_id', leadId)
      .eq('pipeline_stage_id', stageId)
      .limit(1);
    if (existsForStage?.length) return { deleted: 0, created: 0, skipped: true, reason: 'already_has_tasks' };
  }

  const tplIds = pipelineTpls.map((t) => t.id);
  const { data: allItems, error: itemErr } = await supabase
    .from('crm_task_template_items')
    .select('*')
    .in('template_id', tplIds)
    .order('order_index');
  if (itemErr) throw itemErr;
  if (!allItems?.length) return { deleted, created: 0, skipped: true, reason: 'empty_template' };

  const tplMap = {};
  pipelineTpls.forEach((t) => { tplMap[t.id] = t; });
  const inserts = allItems.map((item) => ({
    lead_id: leadId,
    title: item.title,
    description: item.description || null,
    priority: item.priority || 'medium',
    stage_slug: tplMap[item.template_id]?.stage_slug || null,
    pipeline_stage_id: stageId,
    order_index: item.order_index,
    deadline: null,
    created_by: userId,
    completion_requires_file_or_note: !!item.completion_requires_file_or_note,
    completion_requires_customer_note: !!item.completion_requires_customer_note,
    completion_requires_customer_contact: !!item.completion_requires_customer_contact,
    blocks_stage_advance: !!item.blocks_stage_advance,
  }));
  const { error: insErr } = await supabase.from('crm_tasks').insert(inserts);
  if (insErr) throw insErr;

  return { deleted, created: inserts.length, skipped: false };
}

/**
 * Gen lại nhiệm vụ CRM theo bộ mẫu pipeline (nút thủ công trên tab Công việc):
 * - Xóa orphan + task giai đoạn pipeline không hợp lệ
 * - Xóa task giai đoạn khác (chưa bắt đầu / pending) — bỏ nhiệm vụ thừa từ auto-gen cũ
 * - Giữ task đang làm / đã xong ở giai đoạn khác
 * - Giai đoạn hiện tại: xóa & tạo lại đúng theo template
 */
async function resyncCrmPipelineTasksForLead(leadId, userId) {
  const { data: lead } = await supabase
    .from('crm_leads')
    .select('type, pipeline_id, stage_id, company_id, created_by')
    .eq('id', leadId)
    .maybeSingle();
  if (!lead) return { ok: false, error: 'Lead/deal không tồn tại' };

  let pipelineId = lead.pipeline_id;
  if (!pipelineId && lead.company_id) {
    pipelineId = await getDefaultPipelineIdForCompany(lead.company_id);
    if (pipelineId) {
      await supabase.from('crm_leads').update({ pipeline_id: pipelineId }).eq('id', leadId);
    }
  }
  if (!pipelineId) return { ok: false, error: 'Lead/deal chưa có pipeline CRM' };

  const hasTemplates = await pipelineHasActiveCrmTemplates(pipelineId);
  if (!hasTemplates) {
    return { ok: false, error: 'Pipeline chưa có bộ mẫu nhiệm vụ. Vào Bộ mẫu CRM để cấu hình.' };
  }

  const { data: stages, error: stErr } = await supabase
    .from('crm_pipeline_stages')
    .select('id')
    .eq('pipeline_id', pipelineId);
  if (stErr) throw stErr;
  const validStageIds = new Set((stages || []).map((s) => String(s.id)));

  const { data: tasks, error: taskErr } = await supabase
    .from('crm_tasks')
    .select('id, stage_slug, pipeline_stage_id, status')
    .eq('lead_id', leadId);
  if (taskErr) throw taskErr;

  const crmTasks = (tasks || []).filter((t) => !isSxCrmTaskRow(t));
  const currentStageId = lead.stage_id ? String(lead.stage_id) : null;
  const toDelete = [];

  for (const t of crmTasks) {
    const pid = t.pipeline_stage_id ? String(t.pipeline_stage_id) : null;
    if (!pid) {
      toDelete.push(t.id);
      continue;
    }
    if (!validStageIds.has(pid)) {
      toDelete.push(t.id);
      continue;
    }
    if (currentStageId && pid !== currentStageId && t.status === 'pending') {
      toDelete.push(t.id);
    }
  }

  if (toDelete.length) {
    const { error: delErr } = await supabase.from('crm_tasks').delete().in('id', toDelete);
    if (delErr) throw delErr;
  }

  let stageCreated = 0;
  let stageDeleted = 0;
  if (currentStageId) {
    const applied = await applyPipelineTemplatesForStage(
      leadId,
      currentStageId,
      userId || lead.created_by,
      { force: true },
    );
    stageCreated = applied.created || 0;
    stageDeleted = applied.deleted || 0;
  } else {
    const created = await autoGenCrmTasks(leadId, lead.type || 'lead', userId || lead.created_by);
    stageCreated = created;
  }

  console.log(
    `[RESYNC-CRM] lead=${leadId}: removed ${toDelete.length} extra task(s)`
    + (stageDeleted ? `, refreshed current stage (removed ${stageDeleted})` : '')
    + (stageCreated ? `, created ${stageCreated} from template` : ''),
  );

  return {
    ok: true,
    deleted_extra: toDelete.length,
    current_stage_resynced: !!currentStageId,
    stage_tasks_deleted: stageDeleted,
    tasks_created: stageCreated,
    current_stage_id: currentStageId,
  };
}

/**
 * Đồng bộ bộ mẫu CRM (theo pipeline) cho mọi lead/deal thuộc các khu vực của công ty.
 * Chỉ regen khi an toàn (giống SELF-HEAL trên GET /leads/:id/tasks):
 * - Có task pipeline + orphan lẫn lộn → chỉ xóa orphan.
 * - Chỉ orphan hoặc không có task → xóa orphan (nếu có) rồi gen lại.
 * - Đã có task pipeline, không orphan → bỏ qua.
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
    regenerated: 0,
    tasks_created: 0,
    pipeline_backfilled: 0,
    orphans_purged: 0,
    purged_only: 0,
    skipped_has_pipeline_tasks: 0,
    skipped_other_pipeline: 0,
    errors: [],
  };

  for (const lead of leads || []) {
    stats.scanned += 1;
    try {
      if (lead.pipeline_id && String(lead.pipeline_id) !== String(pipelineIdResolved)) {
        stats.skipped_other_pipeline += 1;
        continue;
      }

      const { data: tasks, error: taskErr } = await supabase
        .from('crm_tasks')
        .select('id, stage_slug, pipeline_stage_id')
        .eq('lead_id', lead.id);
      if (taskErr) throw taskErr;

      const crmTasks = (tasks || []).filter((t) => !isSxCrmTaskRow(t));
      const orphanCrm = crmTasks.filter((t) => !t.pipeline_stage_id);
      const nonOrphanCrm = crmTasks.filter((t) => t.pipeline_stage_id);

      if (nonOrphanCrm.length > 0 && orphanCrm.length === 0) {
        stats.skipped_has_pipeline_tasks += 1;
        continue;
      }

      if (!lead.pipeline_id) {
        const { error: bfErr } = await supabase
          .from('crm_leads')
          .update({ pipeline_id: pipelineIdResolved })
          .eq('id', lead.id);
        if (bfErr) throw bfErr;
        stats.pipeline_backfilled += 1;
      }

      if (orphanCrm.length > 0) {
        const orphanIds = orphanCrm.map((t) => t.id);
        const { error: delErr } = await supabase.from('crm_tasks').delete().in('id', orphanIds);
        if (delErr) throw delErr;
        stats.orphans_purged += orphanIds.length;
      }

      if (nonOrphanCrm.length === 0) {
        const created = await autoGenCrmTasks(lead.id, lead.type || 'lead', userId || lead.created_by);
        if (created > 0) {
          stats.regenerated += 1;
          stats.tasks_created += created;
        }
      } else {
        stats.purged_only += 1;
      }
    } catch (e) {
      stats.errors.push({ lead_id: lead.id, error: e.message });
    }
  }

  return stats;
}

module.exports = {
  autoGenCrmTasks,
  applyCrmTaskTemplatesToCompanyRegions,
  healOrphanCrmTasksForLead,
  resyncCrmPipelineTasksForLead,
  applyPipelineTemplatesForStage,
  FALLBACK_LEAD_TASKS,
  FALLBACK_DEAL_TASKS,
  completeConsultingCrmTasksForLead,
};
