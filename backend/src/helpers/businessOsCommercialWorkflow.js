const { supabase } = require('../config/supabase');
const {
  SALES_PROCESS_KEY,
  isSalesPilotCompany,
  loadProcessInstance,
  findCommandReceipt,
  appendProcessEvent,
} = require('./salesQualificationPilot');

const QUOTATION_START_STAGE = 'quotation';
const QUOTATION_SOURCE_STAGE = 'design_completed';
const NEGOTIATION_STAGE = 'negotiation';
const ORDER_READY_STAGE = 'order_ready';
const ORDER_STAGE = 'order';
const PROJECT_STAGE = 'project';
const PRODUCTION_STAGE = 'production';
const DELIVERY_READY_STAGE = 'delivery_ready';
const INSTALLATION_STAGE = 'installation';
const COMPLETED_STAGE = 'completed';
const COMMERCIAL_STAGE_RANK = Object.freeze({
  [QUOTATION_SOURCE_STAGE]: 0,
  [QUOTATION_START_STAGE]: 1,
  [NEGOTIATION_STAGE]: 2,
  [ORDER_READY_STAGE]: 3,
  [ORDER_STAGE]: 4,
  [PROJECT_STAGE]: 5,
  [PRODUCTION_STAGE]: 6,
  [DELIVERY_READY_STAGE]: 7,
  [INSTALLATION_STAGE]: 8,
  [COMPLETED_STAGE]: 9,
});

function canStartQuotationFromStage(stageKey) {
  return String(stageKey || '') === QUOTATION_SOURCE_STAGE;
}

function quotationEventIdempotencyKey(quotationId) {
  return `sales-quotation-created-${String(quotationId || '').trim()}`;
}

function commercialEventIdempotencyKey(entityType, entityId, targetStage) {
  return `sales-commercial-${String(entityType || '').trim()}-${String(entityId || '').trim()}-${String(targetStage || '').trim()}`;
}

function quotationTargetStage(status) {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'draft') return QUOTATION_START_STAGE;
  if (['sent', 'rejected', 'expired'].includes(value)) return NEGOTIATION_STAGE;
  if (value === 'accepted') return ORDER_READY_STAGE;
  // converted is a system result. Only a real orders row may advance the kernel.
  return null;
}

function canAdvanceCommercialStage(fromStage, toStage) {
  const fromRank = COMMERCIAL_STAGE_RANK[String(fromStage || '')];
  const toRank = COMMERCIAL_STAGE_RANK[String(toStage || '')];
  return Number.isInteger(fromRank) && Number.isInteger(toRank) && toRank > fromRank;
}

function normalizeQuotationSummary(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code || null,
    title: row.title || null,
    status: row.status || 'draft',
    total: Number(row.total || 0),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function normalizeProjectSummary(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code || null,
    name: row.name || null,
    status: row.status || 'new',
    company_id: row.company_id || null,
    construction_start_date: row.construction_start_date || null,
    expected_production_start_date: row.expected_production_start_date || null,
    production_deadline: row.production_deadline || null,
    delivery_date: row.delivery_date || null,
    install_date: row.install_date || null,
    logistics_company_id: row.logistics_company_id || null,
    vc_kanban_column_id: row.vc_kanban_column_id || null,
    vc_handover_status: row.vc_handover_status || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

async function loadQuotationProjection(lead, instance = null) {
  if (!lead?.id || !lead?.company_id) {
    return { available: false, quotations: [], primary: null, count: 0 };
  }
  const [{ data, error }, { data: orderRows, error: orderError }] = await Promise.all([
    supabase
      .from('quotations')
      .select('id, code, title, status, total, created_at, updated_at, lead_id, company_id')
      .eq('lead_id', lead.id)
      .eq('company_id', lead.company_id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('orders')
      .select('id, code, title, status, total, quotation_id, created_at, updated_at, lead_id, company_id')
      .eq('lead_id', lead.id)
      .eq('company_id', lead.company_id)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);
  if (error) throw error;
  if (orderError) throw orderError;
  const quotations = (data || []).map(normalizeQuotationSummary);
  const orders = (orderRows || []).map((row) => ({
    id: row.id,
    code: row.code || null,
    title: row.title || null,
    status: row.status || 'draft',
    total: Number(row.total || 0),
    quotation_id: row.quotation_id || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  }));
  const primaryId = String(instance?.primary_quotation_id || '');
  const primary = quotations.find((quotation) => String(quotation.id) === primaryId)
    || quotations[quotations.length - 1]
    || null;
  const acceptedId = String(instance?.accepted_quotation_id || '');
  const accepted = quotations.find((quotation) => String(quotation.id) === acceptedId)
    || quotations.find((quotation) => ['accepted', 'converted'].includes(quotation.status))
    || null;
  const primaryOrderId = String(instance?.primary_order_id || '');
  const primaryOrder = orders.find((order) => String(order.id) === primaryOrderId)
    || orders[orders.length - 1]
    || null;
  const { data: projectLinks, error: projectLinkError } = await supabase
    .from('crm_deal_projects')
    .select('project_id, is_primary')
    .eq('deal_id', lead.id);
  if (projectLinkError && !String(projectLinkError.message || '').includes('crm_deal_projects')) {
    throw projectLinkError;
  }
  const projectIds = [...new Set([
    lead.project_id,
    instance?.primary_project_id,
    instance?.production_project_id,
    ...(projectLinks || []).map((link) => link.project_id),
  ].filter(Boolean).map(String))];
  let projects = [];
  if (projectIds.length) {
    const { data: projectRows, error: projectError } = await supabase
      .from('projects')
      .select('id, code, name, status, company_id, construction_start_date, expected_production_start_date, production_deadline, delivery_date, install_date, logistics_company_id, vc_kanban_column_id, vc_handover_status, created_at, updated_at')
      .in('id', projectIds);
    if (projectError) throw projectError;
    projects = (projectRows || []).map(normalizeProjectSummary);
  }
  const primaryProjectId = String(instance?.primary_project_id || lead.project_id || '');
  const primaryProject = projects.find((project) => String(project.id) === primaryProjectId)
    || projects.find((project) => (projectLinks || []).some((link) => link.is_primary && String(link.project_id) === String(project.id)))
    || projects[0]
    || null;
  const productionProjectId = String(instance?.production_project_id || '');
  const productionProject = projects.find((project) => String(project.id) === productionProjectId)
    || (lead.sx_handover_at ? primaryProject : null);
  const installationProjectId = String(instance?.installation_project_id || instance?.production_project_id || '');
  const installationProject = projects.find((project) => String(project.id) === installationProjectId)
    || ([DELIVERY_READY_STAGE, INSTALLATION_STAGE, COMPLETED_STAGE].includes(String(instance?.current_stage_key || ''))
      ? productionProject
      : null);
  return {
    available: true,
    quotations,
    primary,
    accepted,
    count: quotations.length,
    orders,
    primary_order: primaryOrder,
    order_count: orders.length,
    projects,
    primary_project: primaryProject,
    production_project: productionProject,
    installation_project: installationProject,
    project_count: projects.length,
    production_company_id: instance?.production_company_id || lead.sx_template_company_id || null,
    installation_company_id: instance?.installation_company_id || installationProject?.logistics_company_id || null,
    create_path: `/crm/quotations/new?lead_id=${encodeURIComponent(lead.id)}&return_to=${encodeURIComponent(`/crm/leads/${lead.id}`)}`,
  };
}

async function loadDealForQuotation(leadId) {
  if (!leadId) return null;
  const { data, error } = await supabase
    .from('crm_leads')
    .select('id, type, company_id, assigned_to, lead_owner_id, project_id, sx_handover_at, sx_template_company_id')
    .eq('id', leadId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * Adapter từ CRM quotation sang Business OS process kernel.
 * Không được làm hỏng việc tạo báo giá legacy: caller ghi log nếu adapter lỗi.
 */
async function recordQuotationCreated({
  leadId,
  quotation,
  actorUserId,
  requestId = null,
} = {}) {
  if (!leadId || !quotation?.id) return { applied: false, reason: 'missing_reference' };
  const lead = await loadDealForQuotation(leadId);
  if (!lead || lead.type !== 'deal') return { applied: false, reason: 'deal_required' };
  if (!lead.company_id || String(lead.company_id) !== String(quotation.company_id || '')) {
    return { applied: false, reason: 'company_mismatch' };
  }
  const pilot = await isSalesPilotCompany(lead.company_id);
  if (!pilot.enabled) return { applied: false, reason: 'pilot_disabled' };

  const idempotencyKey = quotationEventIdempotencyKey(quotation.id);
  const receipt = await findCommandReceipt(lead.company_id, idempotencyKey, lead.id);
  if (receipt) return { applied: false, reason: 'already_recorded', receipt };

  let instance = await loadProcessInstance(lead);
  if (!instance) return { applied: false, reason: 'process_not_started' };
  const fromStage = String(instance.current_stage_key || '');
  if (fromStage === QUOTATION_START_STAGE) {
    return { applied: false, reason: 'already_in_quotation', instance };
  }
  if (!canStartQuotationFromStage(fromStage)) {
    return { applied: false, reason: 'design_not_ready', current_stage_key: fromStage };
  }

  const now = new Date().toISOString();
  if (instance.compat_storage) {
    instance = {
      ...instance,
      current_stage_key: QUOTATION_START_STAGE,
      status: 'active',
      stage_entered_at: now,
      quotation_started_at: now,
      quotation_started_by: actorUserId || null,
      primary_quotation_id: quotation.id,
      version: Number(instance.version || 0) + 1,
    };
  } else {
    const { data, error } = await supabase
      .from('business_os_process_instances')
      .update({
        current_stage_key: QUOTATION_START_STAGE,
        status: 'active',
        stage_entered_at: now,
        sla_started_at: null,
        sla_due_at: null,
        quotation_started_at: now,
        quotation_started_by: actorUserId || null,
        primary_quotation_id: quotation.id,
        updated_by: actorUserId || null,
        version: Number(instance.version || 0) + 1,
      })
      .eq('id', instance.id)
      .eq('current_stage_key', QUOTATION_SOURCE_STAGE)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) return { applied: false, reason: 'concurrent_transition' };
    instance = data;
  }

  const event = await appendProcessEvent({
    instance,
    actorUserId,
    eventType: 'sales.quotation.created',
    fromStageKey: QUOTATION_SOURCE_STAGE,
    toStageKey: QUOTATION_START_STAGE,
    idempotencyKey,
    payload: {
      lead_id: lead.id,
      quotation_id: quotation.id,
      quotation_code: quotation.code || null,
      quotation_total: Number(quotation.total || 0),
      request_id: requestId,
      quotation_started_at: now,
    },
  });
  return { applied: true, instance, event };
}

function commercialTransitionPatch(instance, targetStage, quotation, actorUserId, now) {
  const patch = {
    current_stage_key: targetStage,
    status: 'active',
    stage_entered_at: now,
    sla_started_at: null,
    sla_due_at: null,
  };
  if (!instance.primary_quotation_id && quotation?.id) patch.primary_quotation_id = quotation.id;
  if (COMMERCIAL_STAGE_RANK[targetStage] >= COMMERCIAL_STAGE_RANK[NEGOTIATION_STAGE]) {
    if (!instance.negotiation_started_at) patch.negotiation_started_at = now;
    if (!instance.negotiation_started_by) patch.negotiation_started_by = actorUserId || null;
  }
  if (COMMERCIAL_STAGE_RANK[targetStage] >= COMMERCIAL_STAGE_RANK[ORDER_READY_STAGE]) {
    if (!instance.quotation_accepted_at) patch.quotation_accepted_at = now;
    if (!instance.quotation_accepted_by) patch.quotation_accepted_by = actorUserId || null;
    patch.accepted_quotation_id = quotation.id;
  }
  return patch;
}

async function recordQuotationStatusChanged({
  leadId,
  quotation,
  actorUserId,
  requestId = null,
} = {}) {
  if (!leadId || !quotation?.id) return { applied: false, reason: 'missing_reference' };
  const targetStage = quotationTargetStage(quotation.status);
  if (!targetStage) return { applied: false, reason: 'status_has_no_process_transition' };
  const lead = await loadDealForQuotation(leadId);
  if (!lead || lead.type !== 'deal') return { applied: false, reason: 'deal_required' };
  if (!lead.company_id || String(lead.company_id) !== String(quotation.company_id || '')) {
    return { applied: false, reason: 'company_mismatch' };
  }
  const pilot = await isSalesPilotCompany(lead.company_id);
  if (!pilot.enabled) return { applied: false, reason: 'pilot_disabled' };

  let instance = await loadProcessInstance(lead);
  if (!instance) return { applied: false, reason: 'process_not_started' };
  const fromStage = String(instance.current_stage_key || '');
  if (!canAdvanceCommercialStage(fromStage, targetStage)) {
    return {
      applied: false,
      reason: COMMERCIAL_STAGE_RANK[fromStage] >= COMMERCIAL_STAGE_RANK[targetStage]
        ? 'already_at_or_after_stage'
        : 'commercial_stage_not_ready',
      instance,
    };
  }
  const idempotencyKey = commercialEventIdempotencyKey('quotation', quotation.id, targetStage);
  const receipt = await findCommandReceipt(lead.company_id, idempotencyKey, lead.id);
  if (receipt) return { applied: false, reason: 'already_recorded', receipt, instance };

  const now = new Date().toISOString();
  const patch = commercialTransitionPatch(instance, targetStage, quotation, actorUserId, now);
  if (instance.compat_storage) {
    instance = { ...instance, ...patch, version: Number(instance.version || 0) + 1 };
  } else {
    const { data, error } = await supabase
      .from('business_os_process_instances')
      .update({ ...patch, updated_by: actorUserId || null, version: Number(instance.version || 0) + 1 })
      .eq('id', instance.id)
      .eq('current_stage_key', fromStage)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) return { applied: false, reason: 'concurrent_transition' };
    instance = data;
  }

  const eventType = targetStage === ORDER_READY_STAGE
    ? 'sales.quotation.accepted'
    : 'sales.negotiation.started';
  const event = await appendProcessEvent({
    instance,
    actorUserId,
    eventType,
    fromStageKey: fromStage,
    toStageKey: targetStage,
    idempotencyKey,
    payload: {
      lead_id: lead.id,
      quotation_id: quotation.id,
      quotation_code: quotation.code || null,
      quotation_status: quotation.status || null,
      quotation_total: Number(quotation.total || 0),
      request_id: requestId,
      negotiation_started_at: instance.negotiation_started_at || null,
      quotation_accepted_at: instance.quotation_accepted_at || null,
    },
  });
  return { applied: true, instance, event };
}

async function getPilotOrderCreationGate({ leadId, companyId, quotationId = null } = {}) {
  if (!leadId || !companyId) return { gated: false, allowed: true, reason: 'missing_scope' };
  const lead = await loadDealForQuotation(leadId);
  if (!lead || lead.type !== 'deal') return { gated: false, allowed: true, reason: 'deal_not_managed' };
  if (String(lead.company_id || '') !== String(companyId || '')) {
    return { gated: true, allowed: false, reason: 'company_mismatch' };
  }
  const pilot = await isSalesPilotCompany(companyId);
  if (!pilot.enabled) return { gated: false, allowed: true, reason: 'pilot_disabled' };
  const instance = await loadProcessInstance(lead);
  if (!instance) return { gated: false, allowed: true, reason: 'legacy_process_not_started' };
  const stage = String(instance.current_stage_key || '');
  if (![ORDER_READY_STAGE, ORDER_STAGE].includes(stage)) {
    return { gated: true, allowed: false, reason: 'quotation_not_accepted', current_stage_key: stage };
  }
  if (stage === ORDER_READY_STAGE && quotationId && instance.accepted_quotation_id
    && String(instance.accepted_quotation_id) !== String(quotationId)) {
    return { gated: true, allowed: false, reason: 'quotation_is_not_accepted_reference', current_stage_key: stage };
  }
  return { gated: true, allowed: true, current_stage_key: stage, instance };
}

async function recordOrderCreated({ order, actorUserId, requestId = null } = {}) {
  if (!order?.id || !order?.lead_id || !order?.company_id) return { applied: false, reason: 'missing_reference' };
  const lead = await loadDealForQuotation(order.lead_id);
  if (!lead || lead.type !== 'deal') return { applied: false, reason: 'deal_required' };
  if (String(lead.company_id || '') !== String(order.company_id || '')) {
    return { applied: false, reason: 'company_mismatch' };
  }
  const pilot = await isSalesPilotCompany(order.company_id);
  if (!pilot.enabled) return { applied: false, reason: 'pilot_disabled' };
  let instance = await loadProcessInstance(lead);
  if (!instance) return { applied: false, reason: 'process_not_started' };
  const fromStage = String(instance.current_stage_key || '');
  if (COMMERCIAL_STAGE_RANK[fromStage] >= COMMERCIAL_STAGE_RANK[ORDER_STAGE]) {
    return { applied: false, reason: 'already_at_or_after_order', instance };
  }
  if (fromStage !== ORDER_READY_STAGE) return { applied: false, reason: 'quotation_not_accepted', instance };

  const idempotencyKey = commercialEventIdempotencyKey('order', order.id, ORDER_STAGE);
  const receipt = await findCommandReceipt(lead.company_id, idempotencyKey, lead.id);
  if (receipt) return { applied: false, reason: 'already_recorded', receipt, instance };
  const now = new Date().toISOString();
  const patch = {
    current_stage_key: ORDER_STAGE,
    status: 'active',
    stage_entered_at: now,
    sla_started_at: null,
    sla_due_at: null,
    order_started_at: instance.order_started_at || now,
    order_started_by: instance.order_started_by || actorUserId || null,
    primary_order_id: instance.primary_order_id || order.id,
  };
  if (instance.compat_storage) {
    instance = { ...instance, ...patch, version: Number(instance.version || 0) + 1 };
  } else {
    const { data, error } = await supabase
      .from('business_os_process_instances')
      .update({ ...patch, updated_by: actorUserId || null, version: Number(instance.version || 0) + 1 })
      .eq('id', instance.id)
      .eq('current_stage_key', ORDER_READY_STAGE)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) return { applied: false, reason: 'concurrent_transition' };
    instance = data;
  }
  const event = await appendProcessEvent({
    instance,
    actorUserId,
    eventType: 'sales.order.created',
    fromStageKey: ORDER_READY_STAGE,
    toStageKey: ORDER_STAGE,
    idempotencyKey,
    payload: {
      lead_id: lead.id,
      quotation_id: order.quotation_id || null,
      order_id: order.id,
      order_code: order.code || null,
      order_total: Number(order.total || 0),
      request_id: requestId,
      order_started_at: instance.order_started_at || now,
    },
  });
  return { applied: true, instance, event };
}

async function loadConfirmedOrderProject(orderId) {
  if (!orderId) return { order: null, project: null };
  const { data: order, error } = await supabase
    .from('orders')
    .select('id, code, status, lead_id, company_id, project_id, quotation_id, total')
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw error;
  if (!order?.project_id) return { order: order || null, project: null };
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, code, name, status, company_id, created_at, updated_at')
    .eq('id', order.project_id)
    .maybeSingle();
  if (projectError) throw projectError;
  return { order, project: project || null };
}

async function recordProjectStarted({ order, project, actorUserId, requestId = null } = {}) {
  if (!order?.id) return { applied: false, reason: 'missing_order' };
  const loaded = await loadConfirmedOrderProject(order.id);
  const effectiveOrder = loaded.order;
  const effectiveProject = loaded.project || project || null;
  if (!effectiveOrder?.lead_id || !effectiveOrder?.company_id || !effectiveProject?.id) {
    return { applied: false, reason: 'missing_reference' };
  }
  if (String(effectiveOrder.status || '') !== 'confirmed') {
    return { applied: false, reason: 'order_not_confirmed' };
  }
  if (String(effectiveOrder.project_id || '') !== String(effectiveProject.id)) {
    return { applied: false, reason: 'project_not_linked_to_order' };
  }
  const lead = await loadDealForQuotation(effectiveOrder.lead_id);
  if (!lead || lead.type !== 'deal') return { applied: false, reason: 'deal_required' };
  if (String(lead.company_id || '') !== String(effectiveOrder.company_id || '')) {
    return { applied: false, reason: 'company_mismatch' };
  }
  const pilot = await isSalesPilotCompany(lead.company_id);
  if (!pilot.enabled) return { applied: false, reason: 'pilot_disabled' };
  let instance = await loadProcessInstance(lead);
  if (!instance) return { applied: false, reason: 'process_not_started' };
  const fromStage = String(instance.current_stage_key || '');
  if (COMMERCIAL_STAGE_RANK[fromStage] >= COMMERCIAL_STAGE_RANK[PROJECT_STAGE]) {
    return { applied: false, reason: 'already_at_or_after_project', instance };
  }
  if (fromStage !== ORDER_STAGE) return { applied: false, reason: 'order_stage_required', instance };

  const idempotencyKey = commercialEventIdempotencyKey('project', effectiveProject.id, PROJECT_STAGE);
  const receipt = await findCommandReceipt(lead.company_id, idempotencyKey, lead.id);
  if (receipt) return { applied: false, reason: 'already_recorded', receipt, instance };
  const now = new Date().toISOString();
  const patch = {
    current_stage_key: PROJECT_STAGE,
    status: 'active',
    stage_entered_at: now,
    sla_started_at: null,
    sla_due_at: null,
    project_started_at: instance.project_started_at || now,
    project_started_by: instance.project_started_by || actorUserId || null,
    primary_project_id: instance.primary_project_id || effectiveProject.id,
  };
  if (instance.compat_storage) {
    instance = { ...instance, ...patch, version: Number(instance.version || 0) + 1 };
  } else {
    const { data, error } = await supabase
      .from('business_os_process_instances')
      .update({ ...patch, updated_by: actorUserId || null, version: Number(instance.version || 0) + 1 })
      .eq('id', instance.id)
      .eq('current_stage_key', ORDER_STAGE)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) return { applied: false, reason: 'concurrent_transition' };
    instance = data;
  }
  const event = await appendProcessEvent({
    instance,
    actorUserId,
    eventType: 'sales.project.started',
    fromStageKey: ORDER_STAGE,
    toStageKey: PROJECT_STAGE,
    idempotencyKey,
    payload: {
      lead_id: lead.id,
      order_id: effectiveOrder.id,
      order_code: effectiveOrder.code || null,
      project_id: effectiveProject.id,
      project_code: effectiveProject.code || null,
      request_id: requestId,
      project_started_at: instance.project_started_at || now,
    },
  });
  return { applied: true, instance, event, project: normalizeProjectSummary(effectiveProject) };
}

async function getPilotProductionHandoverGate({
  leadId,
  companyId,
  projectId,
  actorUserId = null,
  requestId = null,
} = {}) {
  if (!leadId || !companyId || !projectId) return { gated: false, allowed: true, reason: 'missing_scope' };
  const lead = await loadDealForQuotation(leadId);
  if (!lead || lead.type !== 'deal') return { gated: false, allowed: true, reason: 'deal_not_managed' };
  if (String(lead.company_id || '') !== String(companyId || '')) {
    return { gated: true, allowed: false, reason: 'company_mismatch' };
  }
  const pilot = await isSalesPilotCompany(companyId);
  if (!pilot.enabled) return { gated: false, allowed: true, reason: 'pilot_disabled' };
  let instance = await loadProcessInstance(lead);
  if (!instance) return { gated: false, allowed: true, reason: 'legacy_process_not_started' };
  let stage = String(instance.current_stage_key || '');
  if (stage === ORDER_STAGE) {
    const { data: confirmedOrder, error } = await supabase
      .from('orders')
      .select('id, code, status, lead_id, company_id, project_id, quotation_id, total')
      .eq('lead_id', leadId)
      .eq('project_id', projectId)
      .eq('status', 'confirmed')
      .order('confirmed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (confirmedOrder) {
      const reconciled = await recordProjectStarted({
        order: confirmedOrder,
        actorUserId,
        requestId,
      });
      instance = reconciled.instance || await loadProcessInstance(lead);
      stage = String(instance?.current_stage_key || stage);
    }
  }
  if (stage === PRODUCTION_STAGE) {
    return { gated: true, allowed: false, reason: 'production_already_started', current_stage_key: stage };
  }
  if (stage !== PROJECT_STAGE) {
    return { gated: true, allowed: false, reason: 'confirmed_order_project_required', current_stage_key: stage };
  }
  return { gated: true, allowed: true, current_stage_key: stage, instance };
}

async function recordProductionStarted({
  leadId,
  projectId,
  productionCompanyId,
  actorUserId,
  requestId = null,
} = {}) {
  if (!leadId || !projectId || !productionCompanyId) return { applied: false, reason: 'missing_reference' };
  const lead = await loadDealForQuotation(leadId);
  if (!lead || lead.type !== 'deal') return { applied: false, reason: 'deal_required' };
  const pilot = await isSalesPilotCompany(lead.company_id);
  if (!pilot.enabled) return { applied: false, reason: 'pilot_disabled' };
  if (!lead.sx_handover_at) return { applied: false, reason: 'production_handover_not_persisted' };
  let instance = await loadProcessInstance(lead);
  if (!instance) return { applied: false, reason: 'process_not_started' };
  const fromStage = String(instance.current_stage_key || '');
  if (fromStage === PRODUCTION_STAGE) return { applied: false, reason: 'already_in_production', instance };
  if (fromStage !== PROJECT_STAGE) return { applied: false, reason: 'project_stage_required', instance };

  const idempotencyKey = commercialEventIdempotencyKey('project', projectId, PRODUCTION_STAGE);
  const receipt = await findCommandReceipt(lead.company_id, idempotencyKey, lead.id);
  if (receipt) return { applied: false, reason: 'already_recorded', receipt, instance };
  const now = lead.sx_handover_at || new Date().toISOString();
  const patch = {
    current_stage_key: PRODUCTION_STAGE,
    status: 'active',
    stage_entered_at: now,
    sla_started_at: null,
    sla_due_at: null,
    production_started_at: instance.production_started_at || now,
    production_started_by: instance.production_started_by || actorUserId || null,
    production_project_id: projectId,
    production_company_id: productionCompanyId,
  };
  if (instance.compat_storage) {
    instance = { ...instance, ...patch, version: Number(instance.version || 0) + 1 };
  } else {
    const { data, error } = await supabase
      .from('business_os_process_instances')
      .update({ ...patch, updated_by: actorUserId || null, version: Number(instance.version || 0) + 1 })
      .eq('id', instance.id)
      .eq('current_stage_key', PROJECT_STAGE)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) return { applied: false, reason: 'concurrent_transition' };
    instance = data;
  }
  const event = await appendProcessEvent({
    instance,
    actorUserId,
    eventType: 'sales.production.started',
    fromStageKey: PROJECT_STAGE,
    toStageKey: PRODUCTION_STAGE,
    idempotencyKey,
    payload: {
      lead_id: lead.id,
      project_id: projectId,
      production_company_id: productionCompanyId,
      request_id: requestId,
      production_started_at: instance.production_started_at || now,
    },
  });
  return { applied: true, instance, event };
}

function processOwnsProject(instance, projectId) {
  const expected = instance?.installation_project_id
    || instance?.production_project_id
    || instance?.primary_project_id
    || null;
  return !expected || String(expected) === String(projectId || '');
}

async function recordDeliveryReady({
  leadId,
  projectId,
  handoverCommentId,
  actorUserId,
  requestId = null,
} = {}) {
  if (!leadId || !projectId || !handoverCommentId) return { applied: false, reason: 'missing_reference' };
  const lead = await loadDealForQuotation(leadId);
  if (!lead || lead.type !== 'deal') return { applied: false, reason: 'deal_required' };
  const pilot = await isSalesPilotCompany(lead.company_id);
  if (!pilot.enabled) return { applied: false, reason: 'pilot_disabled' };
  let instance = await loadProcessInstance(lead);
  if (!instance) return { applied: false, reason: 'process_not_started' };
  if (!processOwnsProject(instance, projectId)) {
    return { applied: false, reason: 'production_project_mismatch', instance };
  }
  const fromStage = String(instance.current_stage_key || '');
  if (COMMERCIAL_STAGE_RANK[fromStage] >= COMMERCIAL_STAGE_RANK[DELIVERY_READY_STAGE]) {
    return { applied: false, reason: 'already_at_or_after_delivery_ready', instance };
  }
  if (fromStage !== PRODUCTION_STAGE) return { applied: false, reason: 'production_stage_required', instance };

  const idempotencyKey = commercialEventIdempotencyKey('vc_handover_comment', handoverCommentId, DELIVERY_READY_STAGE);
  const receipt = await findCommandReceipt(lead.company_id, idempotencyKey, lead.id);
  if (receipt) return { applied: false, reason: 'already_recorded', receipt, instance };
  const now = new Date().toISOString();
  const patch = {
    current_stage_key: DELIVERY_READY_STAGE,
    status: 'active',
    stage_entered_at: now,
    sla_started_at: null,
    sla_due_at: null,
    delivery_ready_at: instance.delivery_ready_at || now,
    delivery_ready_by: instance.delivery_ready_by || actorUserId || null,
    logistics_handover_comment_id: handoverCommentId,
    installation_project_id: instance.installation_project_id || projectId,
  };
  if (instance.compat_storage) {
    instance = { ...instance, ...patch, version: Number(instance.version || 0) + 1 };
  } else {
    const { data, error } = await supabase
      .from('business_os_process_instances')
      .update({ ...patch, updated_by: actorUserId || null, version: Number(instance.version || 0) + 1 })
      .eq('id', instance.id)
      .eq('current_stage_key', PRODUCTION_STAGE)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) return { applied: false, reason: 'concurrent_transition' };
    instance = data;
  }
  const event = await appendProcessEvent({
    instance,
    actorUserId,
    eventType: 'sales.delivery.ready',
    fromStageKey: PRODUCTION_STAGE,
    toStageKey: DELIVERY_READY_STAGE,
    idempotencyKey,
    payload: {
      lead_id: lead.id,
      project_id: projectId,
      handover_comment_id: handoverCommentId,
      request_id: requestId,
      delivery_ready_at: instance.delivery_ready_at || now,
    },
  });
  return { applied: true, instance, event };
}

async function recordInstallationStarted({
  leadId,
  projectId,
  handoverCommentId,
  logisticsCompanyId = null,
  externalCompanyName = null,
  actorUserId,
  requestId = null,
} = {}) {
  if (!leadId || !projectId || !handoverCommentId) return { applied: false, reason: 'missing_reference' };
  const lead = await loadDealForQuotation(leadId);
  if (!lead || lead.type !== 'deal') return { applied: false, reason: 'deal_required' };
  const pilot = await isSalesPilotCompany(lead.company_id);
  if (!pilot.enabled) return { applied: false, reason: 'pilot_disabled' };
  let instance = await loadProcessInstance(lead);
  if (!instance) return { applied: false, reason: 'process_not_started' };
  if (!processOwnsProject(instance, projectId)) {
    return { applied: false, reason: 'production_project_mismatch', instance };
  }
  const fromStage = String(instance.current_stage_key || '');
  if (COMMERCIAL_STAGE_RANK[fromStage] >= COMMERCIAL_STAGE_RANK[INSTALLATION_STAGE]) {
    return { applied: false, reason: 'already_at_or_after_installation', instance };
  }
  if (fromStage !== DELIVERY_READY_STAGE) return { applied: false, reason: 'delivery_ready_stage_required', instance };

  const idempotencyKey = commercialEventIdempotencyKey('vc_handover_comment', handoverCommentId, INSTALLATION_STAGE);
  const receipt = await findCommandReceipt(lead.company_id, idempotencyKey, lead.id);
  if (receipt) return { applied: false, reason: 'already_recorded', receipt, instance };
  const now = new Date().toISOString();
  const patch = {
    current_stage_key: INSTALLATION_STAGE,
    status: 'active',
    stage_entered_at: now,
    sla_started_at: null,
    sla_due_at: null,
    installation_started_at: instance.installation_started_at || now,
    installation_started_by: instance.installation_started_by || actorUserId || null,
    installation_project_id: instance.installation_project_id || projectId,
    installation_company_id: logisticsCompanyId || instance.installation_company_id || null,
    logistics_handover_comment_id: handoverCommentId,
  };
  if (instance.compat_storage) {
    instance = { ...instance, ...patch, version: Number(instance.version || 0) + 1 };
  } else {
    const { data, error } = await supabase
      .from('business_os_process_instances')
      .update({ ...patch, updated_by: actorUserId || null, version: Number(instance.version || 0) + 1 })
      .eq('id', instance.id)
      .eq('current_stage_key', DELIVERY_READY_STAGE)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) return { applied: false, reason: 'concurrent_transition' };
    instance = data;
  }
  const event = await appendProcessEvent({
    instance,
    actorUserId,
    eventType: 'sales.installation.started',
    fromStageKey: DELIVERY_READY_STAGE,
    toStageKey: INSTALLATION_STAGE,
    idempotencyKey,
    payload: {
      lead_id: lead.id,
      project_id: projectId,
      handover_comment_id: handoverCommentId,
      logistics_company_id: logisticsCompanyId,
      external_company_name: externalCompanyName || null,
      request_id: requestId,
      installation_started_at: instance.installation_started_at || now,
    },
  });
  return { applied: true, instance, event };
}

async function recordInstallationCompleted({
  leadId,
  projectId,
  logisticsStageId = null,
  actorUserId,
  requestId = null,
  completionSource = null,
  sourceReferenceId = null,
} = {}) {
  if (!leadId || !projectId) return { applied: false, reason: 'missing_reference' };
  const lead = await loadDealForQuotation(leadId);
  if (!lead || lead.type !== 'deal') return { applied: false, reason: 'deal_required' };
  const pilot = await isSalesPilotCompany(lead.company_id);
  if (!pilot.enabled) return { applied: false, reason: 'pilot_disabled' };
  let instance = await loadProcessInstance(lead);
  if (!instance) return { applied: false, reason: 'process_not_started' };
  if (!processOwnsProject(instance, projectId)) {
    return { applied: false, reason: 'production_project_mismatch', instance };
  }
  const fromStage = String(instance.current_stage_key || '');
  const ensureAfterSales = async () => {
    try {
      const { ensureAfterSalesStarted } = require('./businessOsAfterSales');
      return await ensureAfterSalesStarted({
        leadId: lead.id,
        projectId,
        actorUserId,
        source: completionSource || (logisticsStageId ? 'logistics_completed_column' : 'external_installation_event'),
        sourceReferenceId: sourceReferenceId || logisticsStageId || null,
        requestId,
      });
    } catch (error) {
      console.warn('[business-os] After-sales start skipped:', error.message);
      return { applied: false, reason: 'start_failed', error: error.message };
    }
  };
  if (fromStage === COMPLETED_STAGE) {
    return {
      applied: false,
      reason: 'already_completed',
      instance,
      after_sales: await ensureAfterSales(),
    };
  }
  if (fromStage !== INSTALLATION_STAGE) return { applied: false, reason: 'installation_stage_required', instance };

  const idempotencyKey = commercialEventIdempotencyKey('project', projectId, COMPLETED_STAGE);
  const receipt = await findCommandReceipt(lead.company_id, idempotencyKey, lead.id);
  if (receipt) return { applied: false, reason: 'already_recorded', receipt, instance };
  const now = new Date().toISOString();
  const patch = {
    current_stage_key: COMPLETED_STAGE,
    status: 'completed',
    stage_entered_at: now,
    sla_started_at: null,
    sla_due_at: null,
    installation_completed_at: instance.installation_completed_at || now,
    installation_completed_by: instance.installation_completed_by || actorUserId || null,
    installation_project_id: instance.installation_project_id || projectId,
  };
  if (instance.compat_storage) {
    instance = { ...instance, ...patch, version: Number(instance.version || 0) + 1 };
  } else {
    const { data, error } = await supabase
      .from('business_os_process_instances')
      .update({ ...patch, updated_by: actorUserId || null, version: Number(instance.version || 0) + 1 })
      .eq('id', instance.id)
      .eq('current_stage_key', INSTALLATION_STAGE)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) return { applied: false, reason: 'concurrent_transition' };
    instance = data;
  }
  const event = await appendProcessEvent({
    instance,
    actorUserId,
    eventType: 'sales.installation.completed',
    fromStageKey: INSTALLATION_STAGE,
    toStageKey: COMPLETED_STAGE,
    idempotencyKey,
    payload: {
      lead_id: lead.id,
      project_id: projectId,
      logistics_stage_id: logisticsStageId,
      request_id: requestId,
      installation_completed_at: instance.installation_completed_at || now,
    },
  });
  return { applied: true, instance, event, after_sales: await ensureAfterSales() };
}

module.exports = {
  SALES_PROCESS_KEY,
  QUOTATION_START_STAGE,
  QUOTATION_SOURCE_STAGE,
  NEGOTIATION_STAGE,
  ORDER_READY_STAGE,
  ORDER_STAGE,
  PROJECT_STAGE,
  PRODUCTION_STAGE,
  DELIVERY_READY_STAGE,
  INSTALLATION_STAGE,
  COMPLETED_STAGE,
  COMMERCIAL_STAGE_RANK,
  canStartQuotationFromStage,
  quotationEventIdempotencyKey,
  commercialEventIdempotencyKey,
  quotationTargetStage,
  canAdvanceCommercialStage,
  normalizeQuotationSummary,
  normalizeProjectSummary,
  loadQuotationProjection,
  recordQuotationCreated,
  recordQuotationStatusChanged,
  getPilotOrderCreationGate,
  recordOrderCreated,
  recordProjectStarted,
  getPilotProductionHandoverGate,
  recordProductionStarted,
  recordDeliveryReady,
  recordInstallationStarted,
  recordInstallationCompleted,
};
