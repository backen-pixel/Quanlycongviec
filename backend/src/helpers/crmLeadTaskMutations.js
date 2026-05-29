/**
 * Core mutations cho crm_tasks — dùng chung từ /api/crm và /api/work-tasks gateway.
 */
const { supabase } = require('../config/supabase');
const { crmTaskMeetsCompletionRequirements, crmTaskRequiresCompletionEvidence } = require('./crmTaskCompletionEvidence');
const { createNotification } = require('./notifications');
const {
  ecosystemModuleKeyForCrmDeadline,
  crmTaskDeadlineModuleKey,
  filterUserIdsForCrmLeadScopedNotification,
} = require('./deadlineModuleNotifications');

function normalizeTimestamp(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function resolveCrmTaskWriteLeadId(routeLeadId) {
  const { data: leadRow } = await supabase
    .from('crm_leads')
    .select('use_order_tasks, parent_lead_id')
    .eq('id', routeLeadId)
    .maybeSingle();
  if (!leadRow?.use_order_tasks || leadRow.parent_lead_id) return routeLeadId;
  const { data: ords } = await supabase
    .from('orders')
    .select('fulfillment_lead_id')
    .eq('lead_id', routeLeadId)
    .not('fulfillment_lead_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(1);
  const fid = ords?.[0]?.fulfillment_lead_id;
  return fid ? String(fid) : routeLeadId;
}

const CRM_TASK_SELECT = '*, assignee:users!crm_tasks_assignee_id_fkey(id,full_name,avatar), supervisor:users!crm_tasks_supervisor_id_fkey(id,full_name,avatar)';

async function createCrmLeadTask(req, leadId, body) {
  const b = body;
  const targetLeadId = await resolveCrmTaskWriteLeadId(leadId);
  let pipelineStageId = b.pipeline_stage_id || null;
  if (!pipelineStageId) {
    const { data: leadRow } = await supabase.from('crm_leads').select('stage_id').eq('id', targetLeadId).maybeSingle();
    pipelineStageId = leadRow?.stage_id || null;
  }
  const { data, error } = await supabase.from('crm_tasks').insert({
    lead_id: targetLeadId,
    title: b.title,
    description: b.description || null,
    status: b.status || 'pending',
    priority: b.priority || 'medium',
    stage_slug: b.stage_slug || null,
    pipeline_stage_id: pipelineStageId,
    order_index: b.order_index || 0,
    assignee_id: b.assignee_id || null,
    supervisor_id: b.supervisor_id || null,
    deadline: b.deadline ? normalizeTimestamp(b.deadline) : null,
    created_by: req.user.userId,
    completion_requires_file_or_note: !!b.completion_requires_file_or_note,
    completion_requires_customer_note: !!b.completion_requires_customer_note,
    completion_requires_customer_contact: !!b.completion_requires_customer_contact,
    blocks_stage_advance: !!b.blocks_stage_advance,
    show_excel_quotation_upload: !!b.show_excel_quotation_upload,
  }).select(CRM_TASK_SELECT).single();
  if (error) return { error: error.message, status: 500 };

  try {
    if (data.assignee_id) {
      const { data: leadSnap } = await supabase.from('crm_leads')
        .select('company_id, region_id').eq('id', targetLeadId).maybeSingle();
      const eco = ecosystemModuleKeyForCrmDeadline(crmTaskDeadlineModuleKey(data.stage_slug));
      const okAssignees = await filterUserIdsForCrmLeadScopedNotification(
        supabase, leadSnap || {}, [data.assignee_id], eco,
      );
      if (okAssignees.some((x) => String(x) === String(data.assignee_id))) {
        await createNotification(req, data.assignee_id, 'crm_task_assigned',
          '📌 Nhiệm vụ CRM mới', `Bạn được giao: "${data.title}"`, 'crm_task', data.id);
      }
    }
  } catch (ne) { console.warn('[NOTIFY] crm_task_created:', ne.message); }

  return { data, status: 201, leadId: targetLeadId };
}

async function updateCrmLeadTask(req, leadId, taskId, body) {
  const b = body;
  if (b.status === 'completed') {
    const { data: prior, error: pErr } = await supabase
      .from('crm_tasks')
      .select('id,status,notes,completion_requires_file_or_note,completion_requires_customer_note,completion_requires_customer_contact')
      .eq('id', taskId).maybeSingle();
    if (pErr) return { error: pErr.message, status: 500 };
    if (prior && prior.status !== 'completed' && crmTaskRequiresCompletionEvidence(prior)) {
      const ok = await crmTaskMeetsCompletionRequirements(supabase, taskId, prior);
      if (!ok) {
        return {
          error: 'Nhiệm vụ này yêu cầu ghi chú khách hàng và/hoặc minh chứng liên hệ trước khi hoàn thành.',
          code: 'crm_task_completion_requires_evidence',
          status: 400,
        };
      }
    }
  }

  const update = { updated_at: new Date().toISOString() };
  const fields = ['title', 'description', 'status', 'priority', 'stage_slug', 'order_index',
    'assignee_id', 'supervisor_id', 'deadline', 'shared_to_project', 'blocks_stage_advance', 'show_excel_quotation_upload'];
  fields.forEach((f) => {
    if (b[f] === undefined) return;
    if (f === 'deadline' && b[f] != null && b[f] !== '') update[f] = normalizeTimestamp(b[f]);
    else update[f] = b[f];
  });
  if (b.status === 'completed' && !b.completed_at) update.completed_at = new Date().toISOString();
  if (b.status && b.status !== 'completed') update.completed_at = null;

  const { data, error } = await supabase.from('crm_tasks').update(update)
    .eq('id', taskId).select(CRM_TASK_SELECT).single();
  if (error) return { error: error.message, status: 500 };

  return { data, status: 200, leadId };
}

async function deleteCrmLeadTask(req, taskId) {
  const { data: task } = await supabase.from('crm_tasks').select('id, lead_id').eq('id', taskId).maybeSingle();
  if (!task) return { error: 'Không tìm thấy nhiệm vụ CRM', status: 404 };
  const { error } = await supabase.from('crm_tasks').delete().eq('id', taskId);
  if (error) return { error: error.message, status: 500 };
  return { data: { message: 'Đã xóa', lead_id: task.lead_id }, status: 200 };
}

async function getCrmTaskLeadId(taskId) {
  const { data } = await supabase.from('crm_tasks').select('lead_id').eq('id', taskId).maybeSingle();
  return data?.lead_id || null;
}

module.exports = {
  resolveCrmTaskWriteLeadId,
  createCrmLeadTask,
  updateCrmLeadTask,
  deleteCrmLeadTask,
  getCrmTaskLeadId,
};
