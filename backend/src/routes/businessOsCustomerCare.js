const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { assertCompanyAccessible } = require('../helpers/tenantScope');
const { isAdminLike } = require('../helpers/adminRole');
const {
  AFTER_SALES_PROCESS_KEY,
  OPEN_CASE_STATUSES,
  isMissingAfterSalesSchema,
  afterSalesMigrationRequired,
  createCustomerServiceCase,
  updateCustomerServiceCase,
  completeAfterSalesPlan,
} = require('../helpers/businessOsAfterSales');

const r = Router();
r.use(auth);

function text(value) {
  return String(value || '').trim();
}

function requestActorId(req) {
  return req.user?.userId || req.user?.id || null;
}

function canManageCustomerCare(user) {
  if (isAdminLike(user)) return true;
  return new Set(['customer_care', 'manager', 'sales_admin', 'logistics_admin']).has(
    text(user?.role).toLowerCase(),
  );
}

function requireCustomerCareWrite(req, res) {
  if (canManageCustomerCare(req.user)) return true;
  res.status(403).json({
    error: 'Chỉ CSKH hoặc quản lý được cập nhật hồ sơ chăm sóc/bảo hành.',
    code: 'CUSTOMER_CARE_WRITE_DENIED',
  });
  return false;
}

function requestedCompanyId(req) {
  return text(req.query?.company_id || req.body?.company_id || req.user?.company_id);
}

function sendError(res, error) {
  const status = Number(error?.status || 500);
  return res.status(status >= 400 && status < 600 ? status : 500).json({
    error: error?.message || 'Lỗi Customer Care/Warranty',
    code: error?.code || undefined,
    details: error?.details || undefined,
  });
}

async function loadCustomerCareOverview(companyId) {
  const instanceResult = await supabase
    .from('business_os_process_instances')
    .select('*')
    .eq('company_id', companyId)
    .eq('process_key', AFTER_SALES_PROCESS_KEY)
    .eq('record_type', 'project')
    .order('updated_at', { ascending: false })
    .limit(500);
  if (instanceResult.error) throw instanceResult.error;
  const instances = instanceResult.data || [];
  const processIds = instances.map((row) => row.id);
  const projectIds = instances.map((row) => row.record_id);
  const dealIds = [...new Set(instances.map((row) => row.metadata?.deal_id).filter(Boolean))];
  const customerIds = [...new Set(instances.map((row) => row.metadata?.customer_id).filter(Boolean))];

  const [projectResult, dealResult, customerResult, taskResult, caseResult] = await Promise.all([
    projectIds.length
      ? supabase.from('projects').select('id, code, name, status, customer_id, care_person_id, install_date, completed_date').in('id', projectIds)
      : Promise.resolve({ data: [], error: null }),
    dealIds.length
      ? supabase.from('crm_leads').select('id, code, title, customer_id, assigned_to, lead_owner_id').in('id', dealIds)
      : Promise.resolve({ data: [], error: null }),
    customerIds.length
      ? supabase.from('customers').select('id, full_name, phone, email, address, assigned_to').in('id', customerIds)
      : Promise.resolve({ data: [], error: null }),
    dealIds.length
      ? supabase.from('crm_tasks')
        .select('id, lead_id, title, status, priority, deadline, assignee_id, business_os_template_item_key')
        .in('lead_id', dealIds)
        .eq('business_os_process_key', AFTER_SALES_PROCESS_KEY)
        .order('deadline')
      : Promise.resolve({ data: [], error: null }),
    processIds.length
      ? supabase.from('business_os_customer_service_cases')
        .select('*')
        .in('process_instance_id', processIds)
        .order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [projectResult, dealResult, customerResult, taskResult, caseResult]) {
    if (result.error) {
      if (isMissingAfterSalesSchema(result.error)) throw afterSalesMigrationRequired(result.error);
      throw result.error;
    }
  }

  const projects = new Map((projectResult.data || []).map((row) => [String(row.id), row]));
  const deals = new Map((dealResult.data || []).map((row) => [String(row.id), row]));
  const customers = new Map((customerResult.data || []).map((row) => [String(row.id), row]));
  const tasksByLead = new Map();
  for (const task of taskResult.data || []) {
    const key = String(task.lead_id);
    if (!tasksByLead.has(key)) tasksByLead.set(key, []);
    tasksByLead.get(key).push(task);
  }
  const casesByProcess = new Map();
  for (const item of caseResult.data || []) {
    const key = String(item.process_instance_id);
    if (!casesByProcess.has(key)) casesByProcess.set(key, []);
    casesByProcess.get(key).push(item);
  }
  const now = Date.now();
  const plans = instances.map((instance) => {
    const project = projects.get(String(instance.record_id)) || null;
    const deal = deals.get(String(instance.metadata?.deal_id || '')) || null;
    const customerId = instance.metadata?.customer_id || project?.customer_id || deal?.customer_id || null;
    const tasks = tasksByLead.get(String(deal?.id || '')) || [];
    const cases = casesByProcess.get(String(instance.id)) || [];
    return {
      id: instance.id,
      company_id: instance.company_id,
      current_stage_key: instance.current_stage_key,
      status: instance.status,
      stage_entered_at: instance.stage_entered_at,
      installation_completed_at: instance.metadata?.installation_completed_at || null,
      care_completed_at: instance.metadata?.care_completed_at || null,
      project,
      deal,
      customer: customers.get(String(customerId || '')) || null,
      care_tasks: tasks,
      open_task_count: tasks.filter((task) => !['completed', 'cancelled'].includes(task.status)).length,
      overdue_task_count: tasks.filter((task) => (
        !['completed', 'cancelled'].includes(task.status)
        && task.deadline
        && new Date(task.deadline).getTime() < now
      )).length,
      case_count: cases.length,
      open_case_count: cases.filter((item) => OPEN_CASE_STATUSES.includes(item.status)).length,
    };
  });
  const cases = (caseResult.data || []).map((item) => ({
    ...item,
    project: projects.get(String(item.project_id || '')) || null,
    deal: deals.get(String(item.deal_id || '')) || null,
    customer: customers.get(String(item.customer_id || '')) || null,
    sla_status: OPEN_CASE_STATUSES.includes(item.status) && item.sla_due_at
      ? (new Date(item.sla_due_at).getTime() < now ? 'overdue' : 'on_track')
      : 'none',
  }));
  return {
    generated_at: new Date().toISOString(),
    process_key: AFTER_SALES_PROCESS_KEY,
    summary: {
      total_plans: plans.length,
      active_plans: plans.filter((plan) => plan.status === 'active').length,
      warranty_active_plans: plans.filter((plan) => plan.current_stage_key === 'warranty_active').length,
      completed_plans: plans.filter((plan) => plan.status === 'completed').length,
      open_cases: cases.filter((item) => OPEN_CASE_STATUSES.includes(item.status)).length,
      overdue_cases: cases.filter((item) => item.sla_status === 'overdue').length,
      open_care_tasks: plans.reduce((sum, plan) => sum + plan.open_task_count, 0),
      overdue_care_tasks: plans.reduce((sum, plan) => sum + plan.overdue_task_count, 0),
    },
    plans,
    cases,
  };
}

// GET /api/business-os/customer-care/overview?company_id=...
r.get('/overview', async (req, res) => {
  try {
    const companyId = requestedCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'Thiếu company_id.' });
    if (!assertCompanyAccessible(req, res, companyId)) return;
    res.json(await loadCustomerCareOverview(companyId));
  } catch (error) {
    sendError(res, error);
  }
});

// POST /api/business-os/customer-care/cases
r.post('/cases', async (req, res) => {
  try {
    if (!requireCustomerCareWrite(req, res)) return;
    const companyId = requestedCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'Thiếu company_id.' });
    if (!assertCompanyAccessible(req, res, companyId)) return;
    const result = await createCustomerServiceCase({
      companyId,
      projectId: req.body?.project_id,
      title: req.body?.title,
      description: req.body?.description,
      caseType: req.body?.case_type,
      priority: req.body?.priority,
      assignedTo: req.body?.assigned_to || null,
      actorUserId: requestActorId(req),
      metadata: req.body?.metadata || {},
    });
    res.status(201).json(result);
  } catch (error) {
    sendError(res, error);
  }
});

// PATCH /api/business-os/customer-care/cases/:id
r.patch('/cases/:id', async (req, res) => {
  try {
    if (!requireCustomerCareWrite(req, res)) return;
    const current = await supabase
      .from('business_os_customer_service_cases')
      .select('id, company_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (current.error) {
      if (isMissingAfterSalesSchema(current.error)) throw afterSalesMigrationRequired(current.error);
      throw current.error;
    }
    if (!current.data) return res.status(404).json({ error: 'Không tìm thấy yêu cầu bảo hành.' });
    if (!assertCompanyAccessible(req, res, current.data.company_id)) return;
    const result = await updateCustomerServiceCase({
      caseId: req.params.id,
      patch: req.body || {},
      actorUserId: requestActorId(req),
    });
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

// POST /api/business-os/customer-care/plans/:projectId/complete
r.post('/plans/:projectId/complete', async (req, res) => {
  try {
    if (!requireCustomerCareWrite(req, res)) return;
    const companyId = requestedCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'Thiếu company_id.' });
    if (!assertCompanyAccessible(req, res, companyId)) return;
    const result = await completeAfterSalesPlan({
      companyId,
      projectId: req.params.projectId,
      actorUserId: requestActorId(req),
    });
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

module.exports = r;
module.exports.loadCustomerCareOverview = loadCustomerCareOverview;
