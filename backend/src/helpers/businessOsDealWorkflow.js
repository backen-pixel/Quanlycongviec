const { supabase } = require('../config/supabase');
const { addBusinessMinutes } = require('../services/businessHours');
const { getCompanyScopedAdminIds } = require('./notifications');
const { collectBlockingTasks } = require('./crmTaskStageAdvanceGate');
const {
  SALES_PROCESS_KEY,
  isSalesPilotCompany,
  loadProcessInstance,
  ensureProcessInstance,
  findCommandReceipt,
  appendProcessEvent,
} = require('./salesQualificationPilot');
const {
  normalizeTaskItems,
  qualificationSlaLevel,
  isMissingAutomationTable,
} = require('./businessOsQualificationAutomation');
const { loadQuotationProjection } = require('./businessOsCommercialWorkflow');

const DEAL_WORKFLOW_STAGES = [
  'deal', 'survey', 'design', 'design_review', 'design_completed',
  'quotation', 'negotiation', 'order_ready', 'order', 'project', 'production',
  'delivery_ready', 'installation', 'completed',
];
const CONFIGURABLE_STAGE_KEYS = ['survey', 'design', 'design_review'];
const WORKFLOW_PATHS = ['full_service', 'customer_design'];

const STAGE_DEFINITIONS = {
  survey: {
    key: 'survey',
    label: 'Khảo sát',
    name: 'Automation Khảo sát',
    sla_duration_minutes: 3 * 8 * 60,
    sla_warning_minutes: 4 * 60,
    tasks: [
      {
        item_key: 'schedule_site_survey',
        title: 'Lên lịch khảo sát hiện trạng',
        description: 'Thống nhất thời gian, địa điểm và người tham gia khảo sát với khách hàng.',
        priority: 'high',
        deadline_minutes: 240,
        assignment_strategy: 'record_owner',
        blocks_stage_advance: true,
        completion_requires_file_or_note: false,
        required_evidence_file_types: [],
        requires_quick_verdict: false,
      },
      {
        item_key: 'capture_site_measurements',
        title: 'Khảo sát và ghi nhận kích thước hiện trạng',
        description: 'Ghi kích thước, điều kiện hiện trường và bổ sung ghi chú hoặc file minh chứng.',
        priority: 'urgent',
        deadline_minutes: 960,
        assignment_strategy: 'record_owner',
        blocks_stage_advance: true,
        completion_requires_file_or_note: true,
        required_evidence_file_types: [],
        requires_quick_verdict: false,
      },
      {
        item_key: 'approve_survey_handover',
        title: 'Xác nhận hồ sơ khảo sát đủ để thiết kế',
        description: 'Kiểm tra thông tin và chốt kết luận Đã đủ trước khi bàn giao Thiết kế.',
        priority: 'high',
        deadline_minutes: 1440,
        assignment_strategy: 'record_owner',
        blocks_stage_advance: true,
        completion_requires_file_or_note: false,
        required_evidence_file_types: [],
        requires_quick_verdict: true,
      },
    ],
  },
  design: {
    key: 'design',
    label: 'Thiết kế',
    name: 'Automation Thiết kế',
    sla_duration_minutes: 4 * 8 * 60,
    sla_warning_minutes: 8 * 60,
    tasks: [
      {
        item_key: 'create_design_concept',
        title: 'Lập phương án thiết kế từ hồ sơ khảo sát',
        description: 'Tạo phương án phù hợp nhu cầu, kích thước và điều kiện hiện trạng.',
        priority: 'high',
        deadline_minutes: 960,
        assignment_strategy: 'record_owner',
        blocks_stage_advance: true,
        completion_requires_file_or_note: true,
        required_evidence_file_types: [],
        requires_quick_verdict: false,
      },
      {
        item_key: 'review_design_with_customer',
        title: 'Duyệt phương án thiết kế với khách hàng',
        description: 'Ghi nhận phản hồi và kết luận phương án đã đủ hoặc cần chỉnh sửa.',
        priority: 'high',
        deadline_minutes: 1440,
        assignment_strategy: 'record_owner',
        blocks_stage_advance: true,
        completion_requires_file_or_note: false,
        required_evidence_file_types: [],
        requires_quick_verdict: true,
      },
      {
        item_key: 'finalize_design_handover',
        title: 'Hoàn thiện hồ sơ thiết kế để bàn giao báo giá',
        description: 'Chốt bản vẽ và bổ sung file hoặc ghi chú bàn giao cho bước Báo giá.',
        priority: 'urgent',
        deadline_minutes: 1920,
        assignment_strategy: 'record_owner',
        blocks_stage_advance: true,
        completion_requires_file_or_note: true,
        required_evidence_file_types: [],
        requires_quick_verdict: false,
      },
    ],
  },
  design_review: {
    key: 'design_review',
    label: 'Kiểm tra thiết kế có sẵn',
    name: 'Automation kiểm tra thiết kế khách cung cấp',
    sla_duration_minutes: 8 * 60,
    sla_warning_minutes: 2 * 60,
    tasks: [
      {
        item_key: 'receive_customer_design',
        title: 'Tiếp nhận bản thiết kế khách hàng cung cấp',
        description: 'Đính kèm bản vẽ hoặc ghi rõ vị trí hồ sơ thiết kế gốc do khách hàng bàn giao.',
        priority: 'high',
        deadline_minutes: 120,
        assignment_strategy: 'record_owner',
        blocks_stage_advance: true,
        completion_requires_file_or_note: true,
        required_evidence_file_types: [],
        requires_quick_verdict: false,
      },
      {
        item_key: 'verify_customer_design_feasibility',
        title: 'Kiểm tra kỹ thuật và kích thước bản thiết kế',
        description: 'Xác minh khả năng sản xuất, lắp đặt, kích thước và các thông tin còn thiếu trước khi báo giá.',
        priority: 'urgent',
        deadline_minutes: 360,
        assignment_strategy: 'record_owner',
        blocks_stage_advance: true,
        completion_requires_file_or_note: true,
        required_evidence_file_types: [],
        requires_quick_verdict: true,
      },
      {
        item_key: 'approve_customer_design_for_quotation',
        title: 'Xác nhận thiết kế đủ dữ liệu để báo giá',
        description: 'Chốt kết luận Đã đủ sau khi kiểm tra phạm vi, vật liệu và đầu vào thương mại.',
        priority: 'high',
        deadline_minutes: 480,
        assignment_strategy: 'record_owner',
        blocks_stage_advance: true,
        completion_requires_file_or_note: false,
        required_evidence_file_types: [],
        requires_quick_verdict: true,
      },
    ],
  },
};

const TASK_SELECT = [
  'id',
  'lead_id',
  'title',
  'description',
  'status',
  'priority',
  'stage_slug',
  'assignee_id',
  'deadline',
  'blocks_stage_advance',
  'completion_requires_file_or_note',
  'required_evidence_file_types',
  'requires_quick_verdict',
  'quick_verdict',
  'quick_verdict_reason',
  'notes',
  'business_os_template_item_key',
].join(', ');

function text(value) {
  return String(value || '').trim();
}

function bool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function int(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function stageDefinition(stageKey) {
  const definition = STAGE_DEFINITIONS[text(stageKey).toLowerCase()];
  if (!definition) {
    const error = new Error('Stage automation chỉ hỗ trợ Khảo sát, Thiết kế hoặc Kiểm tra thiết kế có sẵn trong lát cắt hiện tại.');
    error.status = 400;
    error.code = 'BUSINESS_OS_STAGE_NOT_CONFIGURABLE';
    throw error;
  }
  return definition;
}

function normalizeStageAutomation(raw = {}, taskItems = null, stageKey = 'survey') {
  const definition = stageDefinition(stageKey);
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const persisted = !!value.id;
  const itemsSource = Array.isArray(taskItems)
    ? taskItems
    : (Array.isArray(value.task_items) ? value.task_items : (!persisted ? definition.tasks : []));
  const duration = int(value.sla_duration_minutes, definition.sla_duration_minutes, 15, 43200);
  const warning = int(value.sla_warning_minutes, definition.sla_warning_minutes, 0, duration);
  return {
    id: value.id || null,
    company_id: value.company_id || null,
    process_key: SALES_PROCESS_KEY,
    stage_key: definition.key,
    stage_label: definition.label,
    name: text(value.name) || definition.name,
    persisted,
    storage_mode: persisted ? 'company_automation' : 'default_automation',
    is_active: value.is_active !== false,
    version: Number(value.version || 1),
    sla_policy: {
      duration_minutes: duration,
      warning_minutes: warning,
      escalate_at_risk_to_owner: bool(value.escalate_at_risk_to_owner, true),
      escalate_overdue_to_owner: bool(value.escalate_overdue_to_owner, true),
      escalate_overdue_to_company_admins: bool(value.escalate_overdue_to_company_admins, true),
    },
    task_items: normalizeTaskItems(itemsSource),
  };
}

async function getStageAutomation(companyId, stageKey) {
  const definition = stageDefinition(stageKey);
  const { data, error } = await supabase
    .from('business_os_stage_automations')
    .select('*')
    .eq('company_id', companyId)
    .eq('process_key', SALES_PROCESS_KEY)
    .eq('stage_key', definition.key)
    .eq('is_active', true)
    .maybeSingle();
  if (error) {
    if (isMissingAutomationTable(error)) return normalizeStageAutomation({ company_id: companyId }, null, definition.key);
    throw error;
  }
  if (!data) return normalizeStageAutomation({ company_id: companyId }, null, definition.key);
  const { data: items, error: itemsError } = await supabase
    .from('business_os_stage_task_template_items')
    .select('*')
    .eq('automation_id', data.id)
    .eq('is_active', true)
    .order('order_index')
    .order('created_at');
  if (itemsError) throw itemsError;
  return normalizeStageAutomation(data, items || [], definition.key);
}

function automationSnapshot(automation) {
  return {
    name: automation.name,
    is_active: automation.is_active,
    sla_duration_minutes: automation.sla_policy.duration_minutes,
    sla_warning_minutes: automation.sla_policy.warning_minutes,
    escalate_at_risk_to_owner: automation.sla_policy.escalate_at_risk_to_owner,
    escalate_overdue_to_owner: automation.sla_policy.escalate_overdue_to_owner,
    escalate_overdue_to_company_admins: automation.sla_policy.escalate_overdue_to_company_admins,
  };
}

async function saveStageAutomation({ companyId, stageKey, input, actorUserId, changeType = 'update', sourceVersion = null }) {
  const definition = stageDefinition(stageKey);
  const raw = input && typeof input === 'object' ? input : {};
  const current = await getStageAutomation(companyId, definition.key);
  const items = Array.isArray(raw.task_items) ? raw.task_items : current.task_items;
  const normalized = normalizeStageAutomation({
    ...raw,
    id: current.id,
    company_id: companyId,
    version: Number(current.persisted ? current.version : 0) + 1,
    sla_duration_minutes: raw.sla_policy?.duration_minutes ?? raw.sla_duration_minutes,
    sla_warning_minutes: raw.sla_policy?.warning_minutes ?? raw.sla_warning_minutes,
    escalate_at_risk_to_owner: raw.sla_policy?.escalate_at_risk_to_owner ?? raw.escalate_at_risk_to_owner,
    escalate_overdue_to_owner: raw.sla_policy?.escalate_overdue_to_owner ?? raw.escalate_overdue_to_owner,
    escalate_overdue_to_company_admins: raw.sla_policy?.escalate_overdue_to_company_admins ?? raw.escalate_overdue_to_company_admins,
    task_items: items,
  }, items, definition.key);
  if (!normalized.task_items.length || !normalized.task_items.some((item) => item.blocks_stage_advance)) {
    const error = new Error(`${definition.label} cần ít nhất một nhiệm vụ mẫu chặn chuyển bước.`);
    error.status = 400;
    error.code = 'BUSINESS_OS_STAGE_GATE_REQUIRED';
    throw error;
  }

  const payload = {
    company_id: companyId,
    process_key: SALES_PROCESS_KEY,
    stage_key: definition.key,
    name: normalized.name,
    sla_duration_minutes: normalized.sla_policy.duration_minutes,
    sla_warning_minutes: normalized.sla_policy.warning_minutes,
    escalate_at_risk_to_owner: normalized.sla_policy.escalate_at_risk_to_owner,
    escalate_overdue_to_owner: normalized.sla_policy.escalate_overdue_to_owner,
    escalate_overdue_to_company_admins: normalized.sla_policy.escalate_overdue_to_company_admins,
    is_active: true,
    version: Number(current.persisted ? current.version : 0) + 1,
    updated_by: actorUserId || null,
  };
  if (!current.persisted) payload.created_by = actorUserId || null;
  const { data: saved, error: saveError } = await supabase
    .from('business_os_stage_automations')
    .upsert(payload, { onConflict: 'company_id,process_key,stage_key' })
    .select('*')
    .single();
  if (saveError) throw saveError;

  const { data: existingItems, error: existingError } = await supabase
    .from('business_os_stage_task_template_items')
    .select('id, item_key')
    .eq('automation_id', saved.id);
  if (existingError) throw existingError;
  const activeKeys = normalized.task_items.map((item) => item.item_key);
  const removedIds = (existingItems || []).filter((item) => !activeKeys.includes(item.item_key)).map((item) => item.id);
  if (removedIds.length) {
    const { error: deactivateError } = await supabase
      .from('business_os_stage_task_template_items')
      .update({ is_active: false, updated_by: actorUserId || null })
      .in('id', removedIds);
    if (deactivateError) throw deactivateError;
  }
  const taskRows = normalized.task_items.map((item) => ({
    automation_id: saved.id,
    item_key: item.item_key,
    title: item.title,
    description: item.description,
    priority: item.priority,
    deadline_minutes: item.deadline_minutes,
    order_index: item.order_index,
    assignment_strategy: item.assignment_strategy,
    blocks_stage_advance: item.blocks_stage_advance,
    completion_requires_file_or_note: item.completion_requires_file_or_note,
    required_evidence_file_types: item.required_evidence_file_types,
    requires_quick_verdict: item.requires_quick_verdict,
    is_active: true,
    created_by: actorUserId || null,
    updated_by: actorUserId || null,
  }));
  const { error: itemsError } = await supabase
    .from('business_os_stage_task_template_items')
    .upsert(taskRows, { onConflict: 'automation_id,item_key' });
  if (itemsError) throw itemsError;

  const result = await getStageAutomation(companyId, definition.key);
  const { error: versionError } = await supabase.from('business_os_stage_automation_versions').insert({
    automation_id: saved.id,
    company_id: companyId,
    process_key: SALES_PROCESS_KEY,
    stage_key: definition.key,
    version: result.version,
    automation_snapshot: automationSnapshot(result),
    task_items_snapshot: result.task_items,
    change_type: changeType,
    source_version: sourceVersion,
    created_by: actorUserId || null,
  });
  if (versionError) throw versionError;
  await supabase.from('work_audit_logs').insert({
    company_id: companyId,
    actor_user_id: actorUserId || null,
    entity_type: 'business_os_stage_automation',
    entity_id: saved.id,
    action: `business_os.${definition.key}_automation.${changeType}`,
    before: current.persisted ? { version: current.version } : null,
    after: { version: result.version, ...automationSnapshot(result), task_count: result.task_items.length },
  }).then(({ error }) => {
    if (error) console.warn('[business-os deal automation audit]', error.message);
  });
  return result;
}

async function listStageAutomationVersions(companyId, stageKey) {
  const definition = stageDefinition(stageKey);
  const { data, error } = await supabase
    .from('business_os_stage_automation_versions')
    .select('*')
    .eq('company_id', companyId)
    .eq('process_key', SALES_PROCESS_KEY)
    .eq('stage_key', definition.key)
    .order('version', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    version: Number(row.version),
    automation: row.automation_snapshot || {},
    task_items: row.task_items_snapshot || [],
    change_type: row.change_type,
    source_version: row.source_version == null ? null : Number(row.source_version),
    created_by: row.created_by || null,
    created_at: row.created_at,
  }));
}

async function rollbackStageAutomation({ companyId, stageKey, version, actorUserId }) {
  const definition = stageDefinition(stageKey);
  const sourceVersion = Number(version);
  if (!Number.isInteger(sourceVersion) || sourceVersion < 1) {
    const error = new Error('Phiên bản automation cần khôi phục không hợp lệ.');
    error.status = 400;
    throw error;
  }
  const { data, error } = await supabase
    .from('business_os_stage_automation_versions')
    .select('*')
    .eq('company_id', companyId)
    .eq('process_key', SALES_PROCESS_KEY)
    .eq('stage_key', definition.key)
    .eq('version', sourceVersion)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const notFound = new Error('Không tìm thấy phiên bản automation.');
    notFound.status = 404;
    throw notFound;
  }
  return saveStageAutomation({
    companyId,
    stageKey: definition.key,
    input: { ...(data.automation_snapshot || {}), task_items: data.task_items_snapshot || [] },
    actorUserId,
    changeType: 'rollback',
    sourceVersion,
  });
}

async function ensureStageAutomation(companyId, stageKey, actorUserId) {
  const current = await getStageAutomation(companyId, stageKey);
  if (current.persisted) return current;
  return saveStageAutomation({ companyId, stageKey, input: current, actorUserId, changeType: 'seed' });
}

function taskAssigneeId(item, lead, actorUserId) {
  if (item.assignment_strategy === 'actor') return actorUserId || null;
  if (item.assignment_strategy === 'unassigned') return null;
  return lead.assigned_to || lead.lead_owner_id || actorUserId || null;
}

async function ensureStageTasks({ lead, stageKey, actorUserId, startedAt = new Date() }) {
  const definition = stageDefinition(stageKey);
  const automation = await ensureStageAutomation(lead.company_id, definition.key, actorUserId);
  const start = startedAt instanceof Date ? startedAt : new Date(startedAt);
  const rows = await Promise.all(automation.task_items.map(async (item) => {
    const assigneeId = taskAssigneeId(item, lead, actorUserId);
    const deadline = item.deadline_minutes > 0
      ? await addBusinessMinutes(start, item.deadline_minutes, { companyId: lead.company_id, userId: assigneeId })
      : null;
    return {
      lead_id: lead.id,
      title: item.title,
      description: item.description,
      status: 'pending',
      priority: item.priority,
      stage_slug: definition.key,
      order_index: item.order_index,
      assignee_id: assigneeId,
      deadline: deadline ? deadline.toISOString() : null,
      checklist: [],
      created_by: actorUserId || null,
      blocks_stage_advance: item.blocks_stage_advance,
      completion_requires_file_or_note: item.completion_requires_file_or_note,
      required_evidence_file_types: item.required_evidence_file_types,
      requires_quick_verdict: item.requires_quick_verdict,
      deadline_days: 0,
      deadline_hours: 0,
      deadline_minutes: item.deadline_minutes,
      business_os_process_key: SALES_PROCESS_KEY,
      business_os_stage_key: definition.key,
      business_os_template_item_key: item.item_key,
      business_os_template_item_id: item.id || null,
    };
  }));
  const { data, error } = await supabase
    .from('crm_tasks')
    .upsert(rows, {
      onConflict: 'lead_id,business_os_process_key,business_os_stage_key,business_os_template_item_key',
      ignoreDuplicates: true,
    })
    .select('id, lead_id, title, status, stage_slug, assignee_id, deadline, blocks_stage_advance, business_os_template_item_key');
  if (error) throw error;
  return { created: data?.length || 0, tasks: data || [], automation };
}

async function getStageReadiness(leadId, stageKey) {
  const definition = stageDefinition(stageKey);
  const { data, error } = await supabase
    .from('crm_tasks')
    .select(TASK_SELECT)
    .eq('lead_id', leadId)
    .eq('business_os_process_key', SALES_PROCESS_KEY)
    .eq('business_os_stage_key', definition.key)
    .neq('status', 'cancelled')
    .order('order_index')
    .limit(100);
  if (error) throw error;
  const tasks = data || [];
  const blockingTasks = await collectBlockingTasks(tasks, { id: null, name: definition.label });
  return {
    ready: tasks.length > 0 && blockingTasks.length === 0,
    stage_key: definition.key,
    stage_label: definition.label,
    completed_tasks: tasks.filter((task) => task.status === 'completed').length,
    total_tasks: tasks.length,
    blocking_tasks: blockingTasks,
    tasks,
  };
}

function workflowStage(instance) {
  const value = text(instance?.current_stage_key);
  return DEAL_WORKFLOW_STAGES.includes(value) ? value : 'deal';
}

function workflowPath(instance) {
  const configured = text(instance?.workflow_path);
  if (WORKFLOW_PATHS.includes(configured)) return configured;
  const stage = workflowStage(instance);
  if (instance?.design_review_started_at || stage === 'design_review') return 'customer_design';
  if (instance?.survey_started_at || ['survey', 'design'].includes(stage)) return 'full_service';
  return null;
}

function formatWorkflowInstance(instance, currentStage) {
  return {
    id: instance?.id || null,
    current_stage_key: currentStage,
    status: instance?.status || (['deal', 'design_completed'].includes(currentStage) ? 'completed' : 'active'),
    stage_entered_at: instance?.stage_entered_at || null,
    sla_started_at: instance?.sla_started_at || null,
    sla_due_at: instance?.sla_due_at || null,
    survey_started_at: instance?.survey_started_at || null,
    survey_completed_at: instance?.survey_completed_at || null,
    design_started_at: instance?.design_started_at || null,
    design_completed_at: instance?.design_completed_at || null,
    design_review_started_at: instance?.design_review_started_at || null,
    design_review_completed_at: instance?.design_review_completed_at || null,
    quotation_started_at: instance?.quotation_started_at || null,
    quotation_started_by: instance?.quotation_started_by || null,
    primary_quotation_id: instance?.primary_quotation_id || null,
    negotiation_started_at: instance?.negotiation_started_at || null,
    negotiation_started_by: instance?.negotiation_started_by || null,
    quotation_accepted_at: instance?.quotation_accepted_at || null,
    quotation_accepted_by: instance?.quotation_accepted_by || null,
    accepted_quotation_id: instance?.accepted_quotation_id || null,
    order_started_at: instance?.order_started_at || null,
    order_started_by: instance?.order_started_by || null,
    primary_order_id: instance?.primary_order_id || null,
    project_started_at: instance?.project_started_at || null,
    project_started_by: instance?.project_started_by || null,
    primary_project_id: instance?.primary_project_id || null,
    production_started_at: instance?.production_started_at || null,
    production_started_by: instance?.production_started_by || null,
    production_project_id: instance?.production_project_id || null,
    production_company_id: instance?.production_company_id || null,
    delivery_ready_at: instance?.delivery_ready_at || null,
    delivery_ready_by: instance?.delivery_ready_by || null,
    logistics_handover_comment_id: instance?.logistics_handover_comment_id || null,
    installation_started_at: instance?.installation_started_at || null,
    installation_started_by: instance?.installation_started_by || null,
    installation_project_id: instance?.installation_project_id || null,
    installation_company_id: instance?.installation_company_id || null,
    installation_completed_at: instance?.installation_completed_at || null,
    installation_completed_by: instance?.installation_completed_by || null,
    workflow_path: workflowPath(instance),
    version: Number(instance?.version || 0),
  };
}

async function getDealWorkflowState(lead) {
  const pilot = await isSalesPilotCompany(lead?.company_id);
  if (!pilot.enabled || lead?.type !== 'deal') {
    return { enabled: false, pilot: pilot.config, reason: lead?.type !== 'deal' ? 'record_is_not_deal' : 'pilot_disabled' };
  }
  const [instance, surveyAutomation, designAutomation, designReviewAutomation] = await Promise.all([
    loadProcessInstance(lead),
    getStageAutomation(lead.company_id, 'survey'),
    getStageAutomation(lead.company_id, 'design'),
    getStageAutomation(lead.company_id, 'design_review'),
  ]);
  const currentStage = workflowStage(instance);
  const commercial = await loadQuotationProjection(lead, instance);
  const readiness = CONFIGURABLE_STAGE_KEYS.includes(currentStage)
    ? await getStageReadiness(lead.id, currentStage)
    : { ready: ['design_completed', 'quotation', 'negotiation', 'order_ready', 'order', 'project', 'production', 'delivery_ready', 'installation', 'completed'].includes(currentStage), completed_tasks: 0, total_tasks: 0, blocking_tasks: [], tasks: [] };
  return {
    enabled: true,
    pilot: pilot.config,
    process: {
      key: SALES_PROCESS_KEY,
      name: 'Deal → Báo giá → Đơn hàng → Dự án → Sản xuất → Lắp đặt → Bàn giao',
      stages: [
        { key: 'deal', name: 'Deal', order: 1 },
        { key: 'survey', name: 'Khảo sát', order: 2 },
        { key: 'design', name: 'Thiết kế', order: 3 },
        { key: 'design_completed', name: 'Sẵn sàng báo giá', order: 4 },
        { key: 'quotation', name: 'Báo giá', order: 5 },
        { key: 'negotiation', name: 'Thương lượng', order: 6 },
        { key: 'order_ready', name: 'Sẵn sàng đặt hàng', order: 7 },
        { key: 'order', name: 'Đơn hàng', order: 8 },
        { key: 'project', name: 'Dự án', order: 9 },
        { key: 'production', name: 'Sản xuất', order: 10 },
        { key: 'delivery_ready', name: 'Sẵn sàng giao', order: 11 },
        { key: 'installation', name: 'Vận chuyển / Lắp đặt', order: 12 },
        { key: 'completed', name: 'Hoàn tất bàn giao', order: 13 },
      ],
      paths: [
        {
          key: 'full_service',
          name: 'Cần khảo sát và thiết kế',
          stages: ['deal', 'survey', 'design', 'design_completed', 'quotation', 'negotiation', 'order_ready', 'order', 'project', 'production', 'delivery_ready', 'installation', 'completed'],
        },
        {
          key: 'customer_design',
          name: 'Khách hàng đã có thiết kế',
          stages: ['deal', 'design_review', 'design_completed', 'quotation', 'negotiation', 'order_ready', 'order', 'project', 'production', 'delivery_ready', 'installation', 'completed'],
        },
      ],
    },
    instance: formatWorkflowInstance(instance, currentStage),
    readiness,
    commercial,
    automations: { survey: surveyAutomation, design: designAutomation, design_review: designReviewAutomation },
    allowed_actions: {
      start_survey: currentStage === 'deal',
      start_design_review: currentStage === 'deal',
      complete_survey: currentStage === 'survey' && readiness.ready,
      complete_design: currentStage === 'design' && readiness.ready,
      complete_design_review: currentStage === 'design_review' && readiness.ready,
      create_quotation: currentStage === 'design_completed',
    },
  };
}

function workflowError(message, code, details = null) {
  const error = new Error(message);
  error.status = 409;
  error.code = code;
  if (details) error.details = details;
  return error;
}

async function persistTransition(instance, patch, actorUserId) {
  const next = { ...instance, ...patch, version: Number(instance.version || 0) + 1 };
  if (instance.compat_storage) return next;
  const { data, error } = await supabase
    .from('business_os_process_instances')
    .update({ ...patch, updated_by: actorUserId || null, version: next.version })
    .eq('id', instance.id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function startSurvey({ lead, actorUserId, idempotencyKey, requestId = null }) {
  const pilot = await isSalesPilotCompany(lead.company_id);
  if (!pilot.enabled) return { enabled: false };
  if (lead.type !== 'deal') throw workflowError('Hồ sơ phải là Deal trước khi bắt đầu Khảo sát.', 'BUSINESS_OS_DEAL_REQUIRED');
  if (await findCommandReceipt(lead.company_id, idempotencyKey, lead.id)) return getDealWorkflowState(lead);
  let instance = await ensureProcessInstance(lead, actorUserId);
  const currentStage = workflowStage(instance);
  if (currentStage === 'survey') {
    await ensureStageTasks({ lead, stageKey: 'survey', actorUserId, startedAt: instance.survey_started_at || instance.stage_entered_at });
    return getDealWorkflowState(lead);
  }
  if (currentStage !== 'deal') throw workflowError('Chỉ Deal ở bước khởi tạo mới được bắt đầu Khảo sát.', 'BUSINESS_OS_INVALID_SURVEY_TRANSITION');
  const automation = await ensureStageAutomation(lead.company_id, 'survey', actorUserId);
  const now = new Date();
  const dueAt = await addBusinessMinutes(now, automation.sla_policy.duration_minutes, {
    companyId: lead.company_id,
    userId: lead.assigned_to || lead.lead_owner_id || actorUserId,
  });
  instance = await persistTransition(instance, {
    current_stage_key: 'survey',
    workflow_path: 'full_service',
    status: 'active',
    stage_entered_at: now.toISOString(),
    sla_started_at: now.toISOString(),
    sla_due_at: dueAt.toISOString(),
    survey_started_at: now.toISOString(),
  }, actorUserId);
  await appendProcessEvent({
    instance,
    actorUserId,
    eventType: 'sales.survey.started',
    fromStageKey: 'deal',
    toStageKey: 'survey',
    idempotencyKey,
    payload: { lead_id: lead.id, request_id: requestId, sla_started_at: now.toISOString(), sla_due_at: dueAt.toISOString(), survey_started_at: now.toISOString() },
  });
  await ensureStageTasks({ lead, stageKey: 'survey', actorUserId, startedAt: now });
  return getDealWorkflowState(lead);
}

async function startDesignReview({ lead, actorUserId, idempotencyKey, requestId = null }) {
  const pilot = await isSalesPilotCompany(lead?.company_id);
  if (!pilot.enabled) return { enabled: false };
  if (lead?.type !== 'deal') throw workflowError('Hồ sơ phải là Deal trước khi kiểm tra thiết kế có sẵn.', 'BUSINESS_OS_DEAL_REQUIRED');
  if (await findCommandReceipt(lead.company_id, idempotencyKey, lead.id)) return getDealWorkflowState(lead);
  let instance = await ensureProcessInstance(lead, actorUserId);
  const currentStage = workflowStage(instance);
  if (currentStage === 'design_review') {
    await ensureStageTasks({
      lead,
      stageKey: 'design_review',
      actorUserId,
      startedAt: instance.design_review_started_at || instance.stage_entered_at,
    });
    return getDealWorkflowState(lead);
  }
  if (currentStage !== 'deal') {
    throw workflowError('Chỉ Deal chưa chọn lộ trình mới được dùng thiết kế khách hàng cung cấp.', 'BUSINESS_OS_INVALID_DESIGN_REVIEW_TRANSITION');
  }
  const automation = await ensureStageAutomation(lead.company_id, 'design_review', actorUserId);
  const now = new Date();
  const dueAt = await addBusinessMinutes(now, automation.sla_policy.duration_minutes, {
    companyId: lead.company_id,
    userId: lead.assigned_to || lead.lead_owner_id || actorUserId,
  });
  instance = await persistTransition(instance, {
    current_stage_key: 'design_review',
    workflow_path: 'customer_design',
    status: 'active',
    stage_entered_at: now.toISOString(),
    sla_started_at: now.toISOString(),
    sla_due_at: dueAt.toISOString(),
    design_review_started_at: now.toISOString(),
  }, actorUserId);
  await appendProcessEvent({
    instance,
    actorUserId,
    eventType: 'sales.customer_design.review_started',
    fromStageKey: 'deal',
    toStageKey: 'design_review',
    idempotencyKey,
    payload: {
      lead_id: lead.id,
      request_id: requestId,
      workflow_path: 'customer_design',
      sla_started_at: now.toISOString(),
      sla_due_at: dueAt.toISOString(),
      design_review_started_at: now.toISOString(),
    },
  });
  await ensureStageTasks({ lead, stageKey: 'design_review', actorUserId, startedAt: now });
  return getDealWorkflowState(lead);
}

async function completeSurvey({ lead, actorUserId, idempotencyKey, requestId = null }) {
  const pilot = await isSalesPilotCompany(lead?.company_id);
  if (!pilot.enabled) return { enabled: false };
  if (lead?.type !== 'deal') throw workflowError('Hồ sơ phải là Deal trước khi bàn giao Thiết kế.', 'BUSINESS_OS_DEAL_REQUIRED');
  if (await findCommandReceipt(lead.company_id, idempotencyKey, lead.id)) return getDealWorkflowState(lead);
  let instance = await ensureProcessInstance(lead, actorUserId);
  if (workflowStage(instance) !== 'survey') throw workflowError('Deal phải ở bước Khảo sát trước khi bàn giao Thiết kế.', 'BUSINESS_OS_INVALID_SURVEY_TRANSITION');
  const readiness = await getStageReadiness(lead.id, 'survey');
  if (!readiness.ready) throw workflowError('Chưa hoàn tất các nhiệm vụ bắt buộc của Khảo sát.', 'BUSINESS_OS_SURVEY_INCOMPLETE', readiness);
  const automation = await ensureStageAutomation(lead.company_id, 'design', actorUserId);
  const now = new Date();
  const dueAt = await addBusinessMinutes(now, automation.sla_policy.duration_minutes, {
    companyId: lead.company_id,
    userId: lead.assigned_to || lead.lead_owner_id || actorUserId,
  });
  instance = await persistTransition(instance, {
    current_stage_key: 'design',
    workflow_path: 'full_service',
    status: 'active',
    stage_entered_at: now.toISOString(),
    sla_started_at: now.toISOString(),
    sla_due_at: dueAt.toISOString(),
    survey_completed_at: now.toISOString(),
    design_started_at: now.toISOString(),
  }, actorUserId);
  await appendProcessEvent({
    instance,
    actorUserId,
    eventType: 'sales.survey.completed',
    fromStageKey: 'survey',
    toStageKey: 'design',
    idempotencyKey,
    payload: { lead_id: lead.id, request_id: requestId, survey_completed_at: now.toISOString(), design_started_at: now.toISOString(), sla_started_at: now.toISOString(), sla_due_at: dueAt.toISOString() },
  });
  await ensureStageTasks({ lead, stageKey: 'design', actorUserId, startedAt: now });
  return getDealWorkflowState(lead);
}

async function completeDesign({ lead, actorUserId, idempotencyKey, requestId = null }) {
  const pilot = await isSalesPilotCompany(lead?.company_id);
  if (!pilot.enabled) return { enabled: false };
  if (lead?.type !== 'deal') throw workflowError('Hồ sơ phải là Deal trước khi xác nhận hoàn tất Thiết kế.', 'BUSINESS_OS_DEAL_REQUIRED');
  if (await findCommandReceipt(lead.company_id, idempotencyKey, lead.id)) return getDealWorkflowState(lead);
  let instance = await ensureProcessInstance(lead, actorUserId);
  if (workflowStage(instance) !== 'design') throw workflowError('Deal phải ở bước Thiết kế trước khi xác nhận hoàn tất.', 'BUSINESS_OS_INVALID_DESIGN_TRANSITION');
  const readiness = await getStageReadiness(lead.id, 'design');
  if (!readiness.ready) throw workflowError('Chưa hoàn tất các nhiệm vụ bắt buộc của Thiết kế.', 'BUSINESS_OS_DESIGN_INCOMPLETE', readiness);
  const now = new Date().toISOString();
  const priorDueAt = instance.sla_due_at || null;
  instance = await persistTransition(instance, {
    current_stage_key: 'design_completed',
    status: 'completed',
    stage_entered_at: now,
    sla_started_at: null,
    sla_due_at: null,
    design_completed_at: now,
  }, actorUserId);
  await appendProcessEvent({
    instance,
    actorUserId,
    eventType: 'sales.design.completed',
    fromStageKey: 'design',
    toStageKey: 'design_completed',
    idempotencyKey,
    payload: { lead_id: lead.id, request_id: requestId, design_completed_at: now, completed_sla_due_at: priorDueAt },
  });
  return getDealWorkflowState(lead);
}

async function completeDesignReview({ lead, actorUserId, idempotencyKey, requestId = null }) {
  const pilot = await isSalesPilotCompany(lead?.company_id);
  if (!pilot.enabled) return { enabled: false };
  if (lead?.type !== 'deal') throw workflowError('Hồ sơ phải là Deal trước khi xác nhận thiết kế có sẵn.', 'BUSINESS_OS_DEAL_REQUIRED');
  if (await findCommandReceipt(lead.company_id, idempotencyKey, lead.id)) return getDealWorkflowState(lead);
  let instance = await ensureProcessInstance(lead, actorUserId);
  if (workflowStage(instance) !== 'design_review') {
    throw workflowError('Deal phải ở bước Kiểm tra thiết kế có sẵn trước khi xác nhận.', 'BUSINESS_OS_INVALID_DESIGN_REVIEW_TRANSITION');
  }
  const readiness = await getStageReadiness(lead.id, 'design_review');
  if (!readiness.ready) {
    throw workflowError('Chưa hoàn tất kiểm tra kỹ thuật và minh chứng của thiết kế khách hàng cung cấp.', 'BUSINESS_OS_DESIGN_REVIEW_INCOMPLETE', readiness);
  }
  const now = new Date().toISOString();
  const priorDueAt = instance.sla_due_at || null;
  instance = await persistTransition(instance, {
    current_stage_key: 'design_completed',
    workflow_path: 'customer_design',
    status: 'completed',
    stage_entered_at: now,
    sla_started_at: null,
    sla_due_at: null,
    design_review_completed_at: now,
    design_completed_at: now,
  }, actorUserId);
  await appendProcessEvent({
    instance,
    actorUserId,
    eventType: 'sales.customer_design.review_completed',
    fromStageKey: 'design_review',
    toStageKey: 'design_completed',
    idempotencyKey,
    payload: {
      lead_id: lead.id,
      request_id: requestId,
      workflow_path: 'customer_design',
      design_review_completed_at: now,
      design_completed_at: now,
      completed_sla_due_at: priorDueAt,
    },
  });
  return getDealWorkflowState(lead);
}

async function insertStageSlaNotification({ instance, lead, automation, stageKey, level, recipientUserId }) {
  const definition = stageDefinition(stageKey);
  const { data: escalation, error: escalationError } = await supabase
    .from('business_os_sla_escalations')
    .insert({
      company_id: instance.company_id,
      process_instance_id: instance.id,
      record_id: instance.record_id,
      stage_key: definition.key,
      level,
      recipient_user_id: recipientUserId,
      due_at: instance.sla_due_at,
      metadata: { process_key: SALES_PROCESS_KEY, stage_key: definition.key },
    })
    .select('id')
    .single();
  if (escalationError) {
    if (escalationError.code === '23505') return { created: false, duplicate: true };
    throw escalationError;
  }
  const overdue = level === 'overdue';
  const leadLabel = text(lead?.title) || text(lead?.code) || 'Deal';
  const { data: notification, error: notificationError } = await supabase.from('notifications').insert({
    user_id: recipientUserId,
    type: overdue ? 'business_os_sla_overdue' : 'business_os_sla_at_risk',
    title: `SLA ${definition.label} ${overdue ? 'đã quá hạn' : 'sắp đến hạn'}`,
    message: `${leadLabel} ${overdue ? 'đã quá hạn' : 'đang tiến gần hạn'} ${definition.label}. Vui lòng xử lý các nhiệm vụ bắt buộc.`,
    entity_type: 'crm_lead',
    entity_id: String(instance.record_id),
    metadata: {
      company_id: instance.company_id,
      ecosystem_module_key: 'crm',
      module_key: 'crm',
      process_key: SALES_PROCESS_KEY,
      stage_key: definition.key,
      sla_level: level,
      sla_due_at: instance.sla_due_at,
      nav_url: `/crm/leads/${instance.record_id}?tab=tasks`,
      business_os_escalation_id: escalation.id,
      internal_only: true,
    },
  }).select('id').single();
  if (notificationError) {
    await supabase.from('business_os_sla_escalations').delete().eq('id', escalation.id);
    throw notificationError;
  }
  await supabase.from('business_os_sla_escalations').update({ notification_id: notification.id }).eq('id', escalation.id);
  return { created: true, duplicate: false };
}

async function evaluateStageSlaEscalations({ companyId, stageKey, now = new Date() }) {
  const definition = stageDefinition(stageKey);
  const automation = await getStageAutomation(companyId, definition.key);
  if (!automation.persisted || !automation.is_active) return { company_id: companyId, stage_key: definition.key, evaluated: 0, created: 0, skipped: 0 };
  const { data: instances, error } = await supabase
    .from('business_os_process_instances')
    .select('id, company_id, record_id, current_stage_key, status, sla_due_at')
    .eq('company_id', companyId)
    .eq('process_key', SALES_PROCESS_KEY)
    .eq('record_type', 'crm_lead')
    .eq('current_stage_key', definition.key)
    .eq('status', 'active')
    .not('sla_due_at', 'is', null)
    .limit(1000);
  if (error) throw error;
  if (!instances?.length) return { company_id: companyId, stage_key: definition.key, evaluated: 0, created: 0, skipped: 0 };
  const { data: leads, error: leadsError } = await supabase
    .from('crm_leads')
    .select('id, code, title, assigned_to, lead_owner_id')
    .eq('company_id', companyId)
    .in('id', instances.map((instance) => instance.record_id));
  if (leadsError) throw leadsError;
  const leadById = new Map((leads || []).map((lead) => [String(lead.id), lead]));
  let adminIds = null;
  const stats = { company_id: companyId, stage_key: definition.key, evaluated: instances.length, created: 0, skipped: 0, errors: [] };
  for (const instance of instances) {
    const level = qualificationSlaLevel({ dueAt: instance.sla_due_at, now, warningMinutes: automation.sla_policy.warning_minutes });
    if (!['at_risk', 'overdue'].includes(level)) continue;
    const lead = leadById.get(String(instance.record_id));
    if (!lead) continue;
    const ownerId = lead.assigned_to || lead.lead_owner_id || null;
    const recipients = new Set();
    if (level === 'at_risk' && automation.sla_policy.escalate_at_risk_to_owner && ownerId) recipients.add(ownerId);
    if (level === 'overdue' && automation.sla_policy.escalate_overdue_to_owner && ownerId) recipients.add(ownerId);
    if (level === 'overdue' && automation.sla_policy.escalate_overdue_to_company_admins) {
      if (!adminIds) adminIds = await getCompanyScopedAdminIds(companyId, { includeSystemAdmins: false });
      adminIds.forEach((id) => recipients.add(id));
    }
    for (const recipientUserId of recipients) {
      try {
        const result = await insertStageSlaNotification({ instance, lead, automation, stageKey: definition.key, level, recipientUserId });
        if (result.created) stats.created += 1;
        else stats.skipped += 1;
      } catch (notificationError) {
        stats.errors.push({ record_id: instance.record_id, recipient_user_id: recipientUserId, error: notificationError.message });
      }
    }
  }
  return stats;
}

async function evaluateAllDealWorkflowSlaEscalations({ now = new Date() } = {}) {
  const { data, error } = await supabase
    .from('business_os_stage_automations')
    .select('company_id, stage_key')
    .eq('process_key', SALES_PROCESS_KEY)
    .in('stage_key', CONFIGURABLE_STAGE_KEYS)
    .eq('is_active', true);
  if (error) {
    if (isMissingAutomationTable(error)) return { automations: 0, created: 0, skipped: 0, reason: 'migration_missing' };
    throw error;
  }
  const scopes = [...new Map((data || []).map((row) => [`${row.company_id}:${row.stage_key}`, row])).values()];
  const summary = { automations: scopes.length, created: 0, skipped: 0, errors: [] };
  for (const scope of scopes) {
    try {
      const result = await evaluateStageSlaEscalations({ companyId: scope.company_id, stageKey: scope.stage_key, now });
      summary.created += result.created || 0;
      summary.skipped += result.skipped || 0;
      summary.errors.push(...(result.errors || []));
    } catch (scopeError) {
      summary.errors.push({ company_id: scope.company_id, stage_key: scope.stage_key, error: scopeError.message });
    }
  }
  return summary;
}

function percent(numerator, denominator) {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

function buildDealWorkflowFunnelKpi({ records = [], instances = [] } = {}) {
  const deals = records.filter((record) => record.type === 'deal');
  const instanceByRecord = new Map(instances.map((instance) => [String(instance.record_id), instance]));
  let surveyStarted = 0;
  let surveyCompleted = 0;
  let designCompleted = 0;
  let fullServiceReady = 0;
  let designReviewStarted = 0;
  let designReviewCompleted = 0;
  let quotationStarted = 0;
  let negotiationStarted = 0;
  let quotationAccepted = 0;
  let orderStarted = 0;
  let projectStarted = 0;
  let productionStarted = 0;
  let deliveryReady = 0;
  let installationStarted = 0;
  let installationCompleted = 0;
  let surveyActive = 0;
  let designActive = 0;
  let designReviewActive = 0;
  const surveyDurations = [];
  const designDurations = [];
  const designReviewDurations = [];
  for (const deal of deals) {
    const instance = instanceByRecord.get(String(deal.id)) || {};
    const stage = workflowStage(instance);
    const path = workflowPath(instance);
    const designOrDownstream = ['design_completed', 'quotation', 'negotiation', 'order_ready', 'order', 'project', 'production', 'delivery_ready', 'installation', 'completed'].includes(stage);
    const hasSurveyStarted = !!instance.survey_started_at || ['survey', 'design'].includes(stage) || (designOrDownstream && path !== 'customer_design');
    const hasSurveyCompleted = !!instance.survey_completed_at || stage === 'design' || (designOrDownstream && path !== 'customer_design');
    const hasDesignCompleted = !!instance.design_completed_at || designOrDownstream;
    const hasDesignReviewStarted = !!instance.design_review_started_at || stage === 'design_review' || (designOrDownstream && path === 'customer_design');
    const hasDesignReviewCompleted = !!instance.design_review_completed_at || (designOrDownstream && path === 'customer_design');
    const hasQuotationStarted = !!instance.quotation_started_at || ['quotation', 'negotiation', 'order_ready', 'order', 'project', 'production', 'delivery_ready', 'installation', 'completed'].includes(stage);
    const hasNegotiationStarted = !!instance.negotiation_started_at || ['negotiation', 'order_ready', 'order', 'project', 'production', 'delivery_ready', 'installation', 'completed'].includes(stage);
    const hasQuotationAccepted = !!instance.quotation_accepted_at || ['order_ready', 'order', 'project', 'production', 'delivery_ready', 'installation', 'completed'].includes(stage);
    const hasOrderStarted = !!instance.order_started_at || ['order', 'project', 'production', 'delivery_ready', 'installation', 'completed'].includes(stage);
    const hasProjectStarted = !!instance.project_started_at || ['project', 'production', 'delivery_ready', 'installation', 'completed'].includes(stage);
    const hasProductionStarted = !!instance.production_started_at || ['production', 'delivery_ready', 'installation', 'completed'].includes(stage);
    const hasDeliveryReady = !!instance.delivery_ready_at || ['delivery_ready', 'installation', 'completed'].includes(stage);
    const hasInstallationStarted = !!instance.installation_started_at || ['installation', 'completed'].includes(stage);
    const hasInstallationCompleted = !!instance.installation_completed_at || stage === 'completed';
    if (hasSurveyStarted) surveyStarted += 1;
    if (hasSurveyCompleted) surveyCompleted += 1;
    if (hasDesignCompleted) designCompleted += 1;
    if (hasDesignCompleted && path !== 'customer_design') fullServiceReady += 1;
    if (hasDesignReviewStarted) designReviewStarted += 1;
    if (hasDesignReviewCompleted) designReviewCompleted += 1;
    if (hasQuotationStarted) quotationStarted += 1;
    if (hasNegotiationStarted) negotiationStarted += 1;
    if (hasQuotationAccepted) quotationAccepted += 1;
    if (hasOrderStarted) orderStarted += 1;
    if (hasProjectStarted) projectStarted += 1;
    if (hasProductionStarted) productionStarted += 1;
    if (hasDeliveryReady) deliveryReady += 1;
    if (hasInstallationStarted) installationStarted += 1;
    if (hasInstallationCompleted) installationCompleted += 1;
    if (stage === 'survey') surveyActive += 1;
    if (stage === 'design') designActive += 1;
    if (stage === 'design_review') designReviewActive += 1;
    const surveyStart = new Date(instance.survey_started_at || 0).getTime();
    const surveyEnd = new Date(instance.survey_completed_at || 0).getTime();
    if (surveyStart > 0 && surveyEnd >= surveyStart) surveyDurations.push((surveyEnd - surveyStart) / 60000);
    const designStart = new Date(instance.design_started_at || 0).getTime();
    const designEnd = new Date(instance.design_completed_at || 0).getTime();
    if (path !== 'customer_design' && designStart > 0 && designEnd >= designStart) designDurations.push((designEnd - designStart) / 60000);
    const designReviewStart = new Date(instance.design_review_started_at || 0).getTime();
    const designReviewEnd = new Date(instance.design_review_completed_at || 0).getTime();
    if (designReviewStart > 0 && designReviewEnd >= designReviewStart) designReviewDurations.push((designReviewEnd - designReviewStart) / 60000);
  }
  const averageHours = (values) => values.length
    ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length / 60) * 10) / 10
    : 0;
  return {
    deal_records: deals.length,
    workflow_started: surveyStarted + designReviewStarted,
    survey_started: surveyStarted,
    survey_completed: surveyCompleted,
    design_review_started: designReviewStarted,
    design_review_completed: designReviewCompleted,
    design_completed: designCompleted,
    quotation_started: quotationStarted,
    negotiation_started: negotiationStarted,
    quotation_accepted: quotationAccepted,
    order_started: orderStarted,
    project_started: projectStarted,
    production_started: productionStarted,
    delivery_ready: deliveryReady,
    installation_started: installationStarted,
    installation_completed: installationCompleted,
    survey_active: surveyActive,
    design_active: designActive,
    design_review_active: designReviewActive,
    workflow_selection_rate_pct: percent(surveyStarted + designReviewStarted, deals.length),
    customer_design_share_pct: percent(designReviewStarted, surveyStarted + designReviewStarted),
    deal_to_survey_rate_pct: percent(surveyStarted, deals.length),
    survey_completion_rate_pct: percent(surveyCompleted, surveyStarted),
    survey_to_design_ready_rate_pct: percent(fullServiceReady, surveyCompleted),
    design_review_completion_rate_pct: percent(designReviewCompleted, designReviewStarted),
    quote_ready_rate_pct: percent(designCompleted, surveyStarted + designReviewStarted),
    quote_started_rate_pct: percent(quotationStarted, designCompleted),
    negotiation_rate_pct: percent(negotiationStarted, quotationStarted),
    quote_acceptance_rate_pct: percent(quotationAccepted, negotiationStarted),
    order_creation_rate_pct: percent(orderStarted, quotationAccepted),
    project_creation_rate_pct: percent(projectStarted, orderStarted),
    production_handover_rate_pct: percent(productionStarted, projectStarted),
    production_ready_rate_pct: percent(deliveryReady, productionStarted),
    installation_handover_rate_pct: percent(installationStarted, deliveryReady),
    installation_completion_rate_pct: percent(installationCompleted, installationStarted),
    average_survey_hours: averageHours(surveyDurations),
    average_design_hours: averageHours(designDurations),
    average_design_review_hours: averageHours(designReviewDurations),
    source: 'crm_leads + business_os_process_instances',
  };
}

module.exports = {
  DEAL_WORKFLOW_STAGES,
  CONFIGURABLE_STAGE_KEYS,
  WORKFLOW_PATHS,
  STAGE_DEFINITIONS,
  normalizeStageAutomation,
  getStageAutomation,
  saveStageAutomation,
  listStageAutomationVersions,
  rollbackStageAutomation,
  ensureStageAutomation,
  ensureStageTasks,
  getStageReadiness,
  getDealWorkflowState,
  startSurvey,
  startDesignReview,
  completeSurvey,
  completeDesign,
  completeDesignReview,
  evaluateStageSlaEscalations,
  evaluateAllDealWorkflowSlaEscalations,
  buildDealWorkflowFunnelKpi,
};
