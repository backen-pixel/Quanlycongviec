const { randomUUID } = require('crypto');
const { supabase } = require('../config/supabase');
const { addBusinessMinutes } = require('../services/businessHours');
const { isSalesPilotCompany } = require('./salesQualificationPilot');

const AFTER_SALES_PROCESS_KEY = 'customer_after_sales_v1';
const CARE_ACTIVE_STAGE = 'care_active';
const WARRANTY_ACTIVE_STAGE = 'warranty_active';
const CLOSED_STAGE = 'closed';
const OPEN_CASE_STATUSES = ['open', 'triaged', 'in_progress'];

const CARE_TASK_DEFINITIONS = Object.freeze([
  {
    item_key: 'post_install_care_07d',
    title: 'Chăm sóc khách hàng sau lắp đặt 7 ngày',
    description: 'Gọi hỏi tình trạng sử dụng, ghi nhận phản hồi và hướng dẫn xử lý nếu có bất thường.',
    calendar_days: 7,
    priority: 'high',
  },
  {
    item_key: 'post_install_care_30d',
    title: 'Chăm sóc khách hàng sau lắp đặt 30 ngày',
    description: 'Đánh giá mức độ hài lòng, rà lỗi phát sinh sớm và ghi nhận nhu cầu hỗ trợ.',
    calendar_days: 30,
    priority: 'medium',
  },
  {
    item_key: 'post_install_care_90d',
    title: 'Chăm sóc khách hàng sau lắp đặt 90 ngày',
    description: 'Kiểm tra trải nghiệm dài hơn, nhắc điều kiện bảo hành và cập nhật hồ sơ quan hệ khách hàng.',
    calendar_days: 90,
    priority: 'medium',
  },
]);

const CASE_TRANSITIONS = Object.freeze({
  open: new Set(['triaged', 'in_progress', 'cancelled']),
  triaged: new Set(['in_progress', 'resolved', 'cancelled']),
  in_progress: new Set(['resolved', 'cancelled']),
  resolved: new Set(['in_progress', 'closed']),
  closed: new Set(),
  cancelled: new Set(),
});

function text(value) {
  return String(value || '').trim();
}

function addCalendarDaysIso(value, days) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString();
}

function caseSlaMinutes(priority) {
  return ({ urgent: 240, high: 480, medium: 1440, low: 2880 })[text(priority).toLowerCase()] || 1440;
}

function canTransitionCase(fromStatus, toStatus) {
  const from = text(fromStatus).toLowerCase();
  const to = text(toStatus).toLowerCase();
  return from === to || !!CASE_TRANSITIONS[from]?.has(to);
}

function isMissingAfterSalesSchema(error) {
  const message = String(error?.message || error?.details || '').toLowerCase();
  return message.includes('business_os_customer_service_cases')
    || (message.includes('relation') && message.includes('does not exist'));
}

function afterSalesMigrationRequired(cause = null) {
  const error = new Error('Chưa cài đặt Customer Care/Warranty. Chạy migration database/578_business_os_after_sales.sql');
  error.status = 503;
  error.code = 'BUSINESS_OS_AFTER_SALES_MIGRATION_REQUIRED';
  error.cause = cause;
  return error;
}

async function loadAfterSalesProcessByProject(companyId, projectId) {
  const { data, error } = await supabase
    .from('business_os_process_instances')
    .select('*')
    .eq('company_id', companyId)
    .eq('process_key', AFTER_SALES_PROCESS_KEY)
    .eq('record_type', 'project')
    .eq('record_id', projectId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function appendAfterSalesEvent({
  instance,
  eventType,
  fromStageKey = null,
  toStageKey = null,
  actorUserId = null,
  idempotencyKey,
  payload = {},
}) {
  const row = {
    company_id: instance.company_id,
    process_instance_id: instance.id,
    process_key: AFTER_SALES_PROCESS_KEY,
    event_type: eventType,
    from_stage_key: fromStageKey,
    to_stage_key: toStageKey,
    actor_user_id: actorUserId,
    idempotency_key: idempotencyKey,
    payload,
  };
  const { data, error } = await supabase
    .from('business_os_process_events')
    .insert(row)
    .select('*')
    .single();
  if (error && error.code === '23505') {
    const existing = await supabase
      .from('business_os_process_events')
      .select('*')
      .eq('company_id', instance.company_id)
      .eq('process_key', AFTER_SALES_PROCESS_KEY)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (existing.error) throw existing.error;
    return existing.data || null;
  }
  if (error) throw error;
  return data;
}

async function materializeCareTasks({ lead, project, installedAt, actorUserId }) {
  const assigneeId = project.care_person_id
    || lead.assigned_to
    || lead.lead_owner_id
    || actorUserId
    || null;
  const rows = CARE_TASK_DEFINITIONS.map((definition, index) => ({
    lead_id: lead.id,
    title: definition.title,
    description: definition.description,
    status: 'pending',
    priority: definition.priority,
    stage_slug: 'customer-care',
    order_index: index + 1,
    assignee_id: assigneeId,
    deadline: addCalendarDaysIso(installedAt, definition.calendar_days),
    created_by: actorUserId || assigneeId || null,
    blocks_stage_advance: false,
    completion_requires_file_or_note: true,
    business_os_process_key: AFTER_SALES_PROCESS_KEY,
    business_os_stage_key: CARE_ACTIVE_STAGE,
    business_os_template_item_key: definition.item_key,
  }));
  const { data, error } = await supabase
    .from('crm_tasks')
    .upsert(rows, {
      onConflict: 'lead_id,business_os_process_key,business_os_stage_key,business_os_template_item_key',
      ignoreDuplicates: true,
    })
    .select('id, title, status, deadline, assignee_id, business_os_template_item_key');
  if (error) throw error;
  const { data: allRows, error: allError } = await supabase
    .from('crm_tasks')
    .select('id, title, status, deadline, assignee_id, business_os_template_item_key')
    .eq('lead_id', lead.id)
    .eq('business_os_process_key', AFTER_SALES_PROCESS_KEY)
    .eq('business_os_stage_key', CARE_ACTIVE_STAGE)
    .order('order_index');
  if (allError) throw allError;
  return allRows || data || [];
}

async function ensureAfterSalesStarted({
  leadId,
  projectId,
  actorUserId = null,
  source = 'installation_completed',
  sourceReferenceId = null,
  requestId = null,
} = {}) {
  if (!leadId || !projectId) return { applied: false, reason: 'missing_reference' };
  const [{ data: lead, error: leadError }, { data: project, error: projectError }] = await Promise.all([
    supabase
      .from('crm_leads')
      .select('id, company_id, customer_id, assigned_to, lead_owner_id, project_id, type')
      .eq('id', leadId)
      .maybeSingle(),
    supabase
      .from('projects')
      .select('id, customer_id, care_person_id, install_date, completed_date, logistics_company_id')
      .eq('id', projectId)
      .maybeSingle(),
  ]);
  if (leadError) throw leadError;
  if (projectError) throw projectError;
  if (!lead || lead.type !== 'deal') return { applied: false, reason: 'deal_required' };
  if (!project) return { applied: false, reason: 'project_required' };
  const pilot = await isSalesPilotCompany(lead.company_id);
  if (!pilot.enabled) return { applied: false, reason: 'pilot_disabled' };
  if (lead.project_id && String(lead.project_id) !== String(projectId)) {
    const { data: link, error: linkError } = await supabase
      .from('crm_deal_projects')
      .select('project_id')
      .eq('deal_id', lead.id)
      .eq('project_id', projectId)
      .maybeSingle();
    if (linkError) throw linkError;
    if (!link) return { applied: false, reason: 'project_mismatch' };
  }

  const installedAt = new Date().toISOString();
  let instance = await loadAfterSalesProcessByProject(lead.company_id, projectId);
  let applied = false;
  if (!instance) {
    const metadata = {
      deal_id: lead.id,
      customer_id: lead.customer_id || project.customer_id || null,
      project_id: project.id,
      installation_completed_at: installedAt,
      source,
      source_reference_id: sourceReferenceId || null,
      request_id: requestId || null,
    };
    const inserted = await supabase
      .from('business_os_process_instances')
      .insert({
        company_id: lead.company_id,
        process_key: AFTER_SALES_PROCESS_KEY,
        process_version: 1,
        record_type: 'project',
        record_id: project.id,
        current_stage_key: CARE_ACTIVE_STAGE,
        status: 'active',
        stage_entered_at: installedAt,
        metadata,
        created_by: actorUserId,
        updated_by: actorUserId,
      })
      .select('*')
      .single();
    if (inserted.error && inserted.error.code === '23505') {
      instance = await loadAfterSalesProcessByProject(lead.company_id, projectId);
    } else if (inserted.error) {
      throw inserted.error;
    } else {
      instance = inserted.data;
      applied = true;
    }
  }
  if (!instance) throw new Error('Không tạo được quy trình chăm sóc sau bán.');

  const tasks = await materializeCareTasks({ lead, project, installedAt, actorUserId });
  const taskIds = tasks.map((task) => task.id);
  if (taskIds.length) {
    const nextMetadata = { ...(instance.metadata || {}), care_task_ids: taskIds };
    const updated = await supabase
      .from('business_os_process_instances')
      .update({ metadata: nextMetadata, updated_by: actorUserId })
      .eq('id', instance.id)
      .select('*')
      .single();
    if (updated.error) throw updated.error;
    instance = updated.data;
  }
  const event = await appendAfterSalesEvent({
    instance,
    eventType: 'customer.care.started',
    fromStageKey: null,
    toStageKey: CARE_ACTIVE_STAGE,
    actorUserId,
    idempotencyKey: `after-sales-project-${project.id}-started`,
    payload: {
      deal_id: lead.id,
      project_id: project.id,
      customer_id: lead.customer_id || project.customer_id || null,
      task_ids: taskIds,
      source,
      source_reference_id: sourceReferenceId || null,
      request_id: requestId || null,
    },
  });
  return {
    applied,
    reason: applied ? 'started' : 'already_started',
    instance,
    event,
    tasks,
  };
}

async function updateProcessStageFromOpenCases(instance, actorUserId) {
  const { count, error } = await supabase
    .from('business_os_customer_service_cases')
    .select('id', { count: 'exact', head: true })
    .eq('process_instance_id', instance.id)
    .in('status', OPEN_CASE_STATUSES);
  if (error) throw error;
  const target = Number(count || 0) > 0 ? WARRANTY_ACTIVE_STAGE : CARE_ACTIVE_STAGE;
  if (instance.status === 'completed' || instance.current_stage_key === target) return instance;
  const from = instance.current_stage_key;
  const { data, error: updateError } = await supabase
    .from('business_os_process_instances')
    .update({
      current_stage_key: target,
      stage_entered_at: new Date().toISOString(),
      updated_by: actorUserId || null,
      version: Number(instance.version || 0) + 1,
    })
    .eq('id', instance.id)
    .select('*')
    .single();
  if (updateError) throw updateError;
  await appendAfterSalesEvent({
    instance: data,
    eventType: target === WARRANTY_ACTIVE_STAGE ? 'customer.warranty.activated' : 'customer.care.resumed',
    fromStageKey: from,
    toStageKey: target,
    actorUserId,
    idempotencyKey: `after-sales-project-${instance.record_id}-${target}-${data.version}`,
    payload: { project_id: instance.record_id, open_case_count: Number(count || 0) },
  });
  return data;
}

async function createCustomerServiceCase({
  companyId,
  projectId,
  title,
  description,
  caseType = 'warranty',
  priority = 'medium',
  assignedTo = null,
  actorUserId = null,
  metadata = {},
} = {}) {
  const instance = await loadAfterSalesProcessByProject(companyId, projectId);
  if (!instance) {
    const error = new Error('Dự án chưa bàn giao sang quy trình Chăm sóc sau bán.');
    error.status = 409;
    error.code = 'AFTER_SALES_PROCESS_REQUIRED';
    throw error;
  }
  if (instance.status === 'completed') {
    const error = new Error('Quy trình chăm sóc đã đóng. Cần mở lại trước khi tạo yêu cầu mới.');
    error.status = 409;
    error.code = 'AFTER_SALES_PROCESS_CLOSED';
    throw error;
  }
  const normalizedTitle = text(title);
  const normalizedDescription = text(description);
  if (!normalizedTitle || !normalizedDescription) {
    const error = new Error('Yêu cầu bảo hành cần có tiêu đề và mô tả.');
    error.status = 400;
    throw error;
  }
  const normalizedType = ['warranty', 'service', 'complaint'].includes(caseType) ? caseType : 'warranty';
  const normalizedPriority = ['low', 'medium', 'high', 'urgent'].includes(priority) ? priority : 'medium';
  const now = new Date();
  const slaDueAt = await addBusinessMinutes(now, caseSlaMinutes(normalizedPriority), { companyId, userId: assignedTo });
  const caseCode = `CS-${now.toISOString().slice(2, 10).replace(/-/g, '')}-${randomUUID().slice(0, 6).toUpperCase()}`;
  const processMeta = instance.metadata || {};
  const { data, error } = await supabase
    .from('business_os_customer_service_cases')
    .insert({
      company_id: companyId,
      process_instance_id: instance.id,
      case_code: caseCode,
      case_type: normalizedType,
      priority: normalizedPriority,
      status: 'open',
      title: normalizedTitle,
      description: normalizedDescription,
      deal_id: processMeta.deal_id || null,
      project_id: projectId,
      customer_id: processMeta.customer_id || null,
      assigned_to: assignedTo || null,
      sla_due_at: slaDueAt?.toISOString?.() || String(slaDueAt || ''),
      created_by: actorUserId || null,
      updated_by: actorUserId || null,
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
    })
    .select('*')
    .single();
  if (error) {
    if (isMissingAfterSalesSchema(error)) throw afterSalesMigrationRequired(error);
    throw error;
  }
  const nextInstance = await updateProcessStageFromOpenCases(instance, actorUserId);
  const event = await appendAfterSalesEvent({
    instance: nextInstance,
    eventType: 'customer.warranty.case_opened',
    fromStageKey: instance.current_stage_key,
    toStageKey: WARRANTY_ACTIVE_STAGE,
    actorUserId,
    idempotencyKey: `customer-case-${data.id}-open`,
    payload: { case_id: data.id, case_code: data.case_code, priority: data.priority },
  });
  return { case: data, instance: nextInstance, event };
}

async function updateCustomerServiceCase({ caseId, patch = {}, actorUserId = null } = {}) {
  const currentResult = await supabase
    .from('business_os_customer_service_cases')
    .select('*')
    .eq('id', caseId)
    .maybeSingle();
  if (currentResult.error) {
    if (isMissingAfterSalesSchema(currentResult.error)) throw afterSalesMigrationRequired(currentResult.error);
    throw currentResult.error;
  }
  const current = currentResult.data;
  if (!current) {
    const error = new Error('Không tìm thấy yêu cầu bảo hành.');
    error.status = 404;
    throw error;
  }
  const nextStatus = text(patch.status || current.status).toLowerCase();
  const statusChanged = nextStatus !== String(current.status || '');
  if (!canTransitionCase(current.status, nextStatus)) {
    const error = new Error(`Không thể chuyển yêu cầu từ ${current.status} sang ${nextStatus}.`);
    error.status = 409;
    error.code = 'INVALID_CUSTOMER_CASE_TRANSITION';
    throw error;
  }
  const resolution = patch.resolution === undefined ? current.resolution : text(patch.resolution);
  if (['resolved', 'closed'].includes(nextStatus) && !resolution) {
    const error = new Error('Cần ghi kết quả xử lý trước khi hoàn tất yêu cầu.');
    error.status = 400;
    error.code = 'CUSTOMER_CASE_RESOLUTION_REQUIRED';
    throw error;
  }
  const now = new Date().toISOString();
  const update = {
    status: nextStatus,
    resolution: resolution || null,
    updated_by: actorUserId || null,
  };
  if (patch.title !== undefined) update.title = text(patch.title);
  if (patch.description !== undefined) update.description = text(patch.description);
  if (patch.assigned_to !== undefined) update.assigned_to = patch.assigned_to || null;
  if (patch.priority !== undefined && ['low', 'medium', 'high', 'urgent'].includes(patch.priority)) {
    update.priority = patch.priority;
    const due = await addBusinessMinutes(new Date(), caseSlaMinutes(patch.priority), {
      companyId: current.company_id,
      userId: update.assigned_to || current.assigned_to,
    });
    update.sla_due_at = due?.toISOString?.() || String(due || '');
  }
  if (['triaged', 'in_progress'].includes(nextStatus) && !current.started_at) update.started_at = now;
  if (nextStatus === 'resolved') {
    update.resolved_at = current.resolved_at || now;
    update.resolved_by = current.resolved_by || actorUserId || null;
  }
  if (nextStatus === 'closed') {
    update.resolved_at = current.resolved_at || now;
    update.resolved_by = current.resolved_by || actorUserId || null;
    update.closed_at = current.closed_at || now;
    update.closed_by = current.closed_by || actorUserId || null;
  }
  const { data, error } = await supabase
    .from('business_os_customer_service_cases')
    .update(update)
    .eq('id', caseId)
    .select('*')
    .single();
  if (error) throw error;
  const instanceResult = await supabase
    .from('business_os_process_instances')
    .select('*')
    .eq('id', current.process_instance_id)
    .single();
  if (instanceResult.error) throw instanceResult.error;
  if (!statusChanged) {
    return {
      applied: false,
      reason: 'already_in_status',
      case: data,
      instance: instanceResult.data,
      event: null,
    };
  }
  const instance = await updateProcessStageFromOpenCases(instanceResult.data, actorUserId);
  const event = await appendAfterSalesEvent({
    instance,
    eventType: `customer.warranty.case_${nextStatus}`,
    fromStageKey: instanceResult.data.current_stage_key,
    toStageKey: instance.current_stage_key,
    actorUserId,
    idempotencyKey: `customer-case-${data.id}-${current.status}-to-${nextStatus}`,
    payload: { case_id: data.id, case_code: data.case_code, status: nextStatus },
  });
  return { applied: true, case: data, instance, event };
}

async function completeAfterSalesPlan({ companyId, projectId, actorUserId = null } = {}) {
  let instance = await loadAfterSalesProcessByProject(companyId, projectId);
  if (!instance) {
    const error = new Error('Không tìm thấy quy trình chăm sóc sau bán.');
    error.status = 404;
    throw error;
  }
  if (instance.status === 'completed') return { applied: false, reason: 'already_completed', instance };
  const leadId = instance.metadata?.deal_id || null;
  const [caseResult, taskResult] = await Promise.all([
    supabase
      .from('business_os_customer_service_cases')
      .select('id, case_code, status')
      .eq('process_instance_id', instance.id)
      .in('status', OPEN_CASE_STATUSES),
    leadId
      ? supabase
        .from('crm_tasks')
        .select('id, title, status')
        .eq('lead_id', leadId)
        .eq('business_os_process_key', AFTER_SALES_PROCESS_KEY)
        .neq('status', 'completed')
        .neq('status', 'cancelled')
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (caseResult.error) throw caseResult.error;
  if (taskResult.error) throw taskResult.error;
  if (caseResult.data?.length || taskResult.data?.length) {
    const error = new Error('Chưa thể đóng chăm sóc: còn lịch chăm sóc hoặc yêu cầu bảo hành đang mở.');
    error.status = 409;
    error.code = 'AFTER_SALES_OPEN_WORK';
    error.details = { cases: caseResult.data || [], tasks: taskResult.data || [] };
    throw error;
  }
  const from = instance.current_stage_key;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('business_os_process_instances')
    .update({
      current_stage_key: CLOSED_STAGE,
      status: 'completed',
      stage_entered_at: now,
      metadata: { ...(instance.metadata || {}), care_completed_at: now },
      updated_by: actorUserId || null,
      version: Number(instance.version || 0) + 1,
    })
    .eq('id', instance.id)
    .select('*')
    .single();
  if (error) throw error;
  instance = data;
  const event = await appendAfterSalesEvent({
    instance,
    eventType: 'customer.care.completed',
    fromStageKey: from,
    toStageKey: CLOSED_STAGE,
    actorUserId,
    idempotencyKey: `after-sales-project-${projectId}-completed`,
    payload: { project_id: projectId, completed_at: now },
  });
  return { applied: true, instance, event };
}

module.exports = {
  AFTER_SALES_PROCESS_KEY,
  CARE_ACTIVE_STAGE,
  WARRANTY_ACTIVE_STAGE,
  CLOSED_STAGE,
  OPEN_CASE_STATUSES,
  CARE_TASK_DEFINITIONS,
  CASE_TRANSITIONS,
  addCalendarDaysIso,
  caseSlaMinutes,
  canTransitionCase,
  isMissingAfterSalesSchema,
  afterSalesMigrationRequired,
  loadAfterSalesProcessByProject,
  ensureAfterSalesStarted,
  createCustomerServiceCase,
  updateCustomerServiceCase,
  completeAfterSalesPlan,
};
