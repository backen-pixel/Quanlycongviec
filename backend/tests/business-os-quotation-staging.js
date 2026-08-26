/** UAT có ghi tạm toàn tuyến thương mại và hai nhánh lắp đặt; fixture luôn được dọn. */
const assert = require('node:assert/strict');
const express = require('express');
const { supabase } = require('../src/config/supabase');
const { buildAuthSessionForUser } = require('../src/helpers/authSession');
const { validateProductionCompanyId } = require('../src/helpers/productionCompanyGate');
const { validateLogisticsCompanyId } = require('../src/helpers/logisticsCompanyGate');

const COMPANY_ID = '991dc79d-cbf5-49f9-a364-35227cb47635';
const ADMIN_USER_ID = 'e679aa3f-efa0-4a57-8d81-5374950dc8d4';
const PROCESS_KEY = 'sales_lead_qualification_v1';

function confirmed() {
  const index = process.argv.indexOf('--confirm');
  return index >= 0 && process.argv[index + 1] === 'VPT';
}

async function must(promise, label) {
  const result = await promise;
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function run() {
  if (!confirmed()) throw new Error('Đây là UAT có ghi tạm. Chạy lại với --confirm VPT.');
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const fixture = {
    server: null,
    customerId: null,
    leadId: null,
    vcDealId: null,
    projectId: null,
    instanceId: null,
    quotationId: null,
    orderId: null,
    crmTaskId: null,
    handoverCommentId: null,
    externalCustomerId: null,
    externalLeadId: null,
    externalProjectId: null,
    externalInstanceId: null,
    externalEventId: null,
    externalCommentId: null,
    afterSalesInstanceId: null,
    externalAfterSalesInstanceId: null,
    customerCaseId: null,
  };

  async function cleanup() {
    if (fixture.server) {
      await new Promise((resolve) => fixture.server.close(resolve));
      fixture.server = null;
    }
    if (fixture.orderId) {
      await supabase.from('notifications').delete().eq('entity_type', 'order').eq('entity_id', fixture.orderId);
      await supabase.from('order_items').delete().eq('order_id', fixture.orderId);
      await supabase.from('orders').delete().eq('id', fixture.orderId);
    }
    if (fixture.externalEventId) {
      await supabase.from('crm_event_participants').delete().eq('event_id', fixture.externalEventId);
      await supabase.from('notifications').delete().eq('entity_type', 'event').eq('entity_id', fixture.externalEventId);
      await supabase.from('crm_events').delete().eq('id', fixture.externalEventId);
    }
    if (fixture.externalCommentId) {
      await supabase.from('crm_lead_comments').delete().eq('id', fixture.externalCommentId);
    }
    if (fixture.customerCaseId) {
      await supabase.from('business_os_customer_service_cases').delete().eq('id', fixture.customerCaseId);
    }
    if (fixture.quotationId) {
      await supabase.from('notifications').delete().eq('entity_type', 'quotation').eq('entity_id', fixture.quotationId);
      await supabase.from('quotation_edit_history').delete().eq('quotation_id', fixture.quotationId);
      await supabase.from('quotation_items').delete().eq('quotation_id', fixture.quotationId);
    }
    if (fixture.projectId) {
      const eventRows = await supabase.from('crm_events').select('id').eq('project_id', fixture.projectId);
      const eventIds = (eventRows.data || []).map((row) => row.id).filter(Boolean);
      if (eventIds.length) await supabase.from('crm_event_participants').delete().in('event_id', eventIds);
      await supabase.from('crm_events').delete().eq('project_id', fixture.projectId);
      await supabase.from('stage_transitions').delete().eq('project_id', fixture.projectId);
    }
    if (fixture.vcDealId && fixture.vcDealId !== fixture.leadId) {
      await supabase.from('crm_tasks').delete().eq('lead_id', fixture.vcDealId);
      await supabase.from('crm_leads').delete().eq('id', fixture.vcDealId);
    }
    if (fixture.leadId) {
      await supabase.from('crm_tasks').delete().eq('lead_id', fixture.leadId);
      await supabase.from('notifications').delete().eq('entity_type', 'crm_lead').eq('entity_id', fixture.leadId);
      await supabase.from('work_command_receipts').delete().eq('resource_id', fixture.leadId);
      await supabase.from('work_audit_logs').delete().eq('entity_id', fixture.leadId);
      await supabase.from('audit_log').delete().eq('entity_id', fixture.leadId);
      await supabase.from('work_outbox_events').delete().eq('aggregate_id', fixture.leadId);
    }
    if (fixture.instanceId) {
      await supabase.from('business_os_process_events').delete().eq('process_instance_id', fixture.instanceId);
      await supabase.from('work_audit_logs').delete().eq('entity_id', fixture.instanceId);
      await supabase.from('work_outbox_events').delete().eq('aggregate_id', fixture.instanceId);
      await supabase.from('business_os_process_instances').delete().eq('id', fixture.instanceId);
    }
    if (fixture.externalLeadId) {
      await supabase.from('crm_tasks').delete().eq('lead_id', fixture.externalLeadId);
      await supabase.from('work_command_receipts').delete().eq('resource_id', fixture.externalLeadId);
      await supabase.from('work_audit_logs').delete().eq('entity_id', fixture.externalLeadId);
      await supabase.from('work_outbox_events').delete().eq('aggregate_id', fixture.externalLeadId);
    }
    if (fixture.externalInstanceId) {
      await supabase.from('business_os_process_events').delete().eq('process_instance_id', fixture.externalInstanceId);
      await supabase.from('work_audit_logs').delete().eq('entity_id', fixture.externalInstanceId);
      await supabase.from('work_outbox_events').delete().eq('aggregate_id', fixture.externalInstanceId);
      await supabase.from('business_os_process_instances').delete().eq('id', fixture.externalInstanceId);
    }
    for (const afterSalesId of [fixture.afterSalesInstanceId, fixture.externalAfterSalesInstanceId].filter(Boolean)) {
      await supabase.from('business_os_process_events').delete().eq('process_instance_id', afterSalesId);
      await supabase.from('business_os_customer_service_cases').delete().eq('process_instance_id', afterSalesId);
      await supabase.from('business_os_process_instances').delete().eq('id', afterSalesId);
    }
    if (fixture.quotationId) await supabase.from('quotations').delete().eq('id', fixture.quotationId);
    if (fixture.leadId) await supabase.from('crm_leads').delete().eq('id', fixture.leadId);
    if (fixture.externalLeadId) await supabase.from('crm_leads').delete().eq('id', fixture.externalLeadId);
    if (fixture.projectId) {
      await supabase.from('tasks').delete().eq('project_id', fixture.projectId);
      await supabase.from('projects').delete().eq('id', fixture.projectId);
    }
    if (fixture.externalProjectId) await supabase.from('projects').delete().eq('id', fixture.externalProjectId);
    if (fixture.customerId) await supabase.from('customers').delete().eq('id', fixture.customerId);
    if (fixture.externalCustomerId) await supabase.from('customers').delete().eq('id', fixture.externalCustomerId);

    const coreFixtures = [
      ['orders', fixture.orderId],
      ['quotations', fixture.quotationId],
      ['business_os_process_instances', fixture.instanceId],
      ['crm_leads', fixture.leadId],
      ['crm_leads', fixture.vcDealId && fixture.vcDealId !== fixture.leadId ? fixture.vcDealId : null],
      ['projects', fixture.projectId],
      ['customers', fixture.customerId],
      ['business_os_process_instances', fixture.externalInstanceId],
      ['crm_leads', fixture.externalLeadId],
      ['projects', fixture.externalProjectId],
      ['customers', fixture.externalCustomerId],
      ['business_os_process_instances', fixture.afterSalesInstanceId],
      ['business_os_process_instances', fixture.externalAfterSalesInstanceId],
      ['business_os_customer_service_cases', fixture.customerCaseId],
    ].filter(([, id]) => id);
    for (const [table, id] of coreFixtures) {
      const { data, error } = await supabase.from(table).select('id').eq('id', id).maybeSingle();
      if (error) throw new Error(`Xác minh cleanup ${table}: ${error.message}`);
      if (data) throw new Error(`Cleanup còn sót fixture ${table}:${id}`);
    }
  }

  try {
    const admin = await must(supabase.from('users').select('*').eq('id', ADMIN_USER_ID).maybeSingle(), 'Đọc admin VPT');
    const pipeline = await must(
      supabase.from('crm_pipelines').select('id').eq('company_id', COMPANY_ID).eq('is_active', true).order('created_at').limit(1).maybeSingle(),
      'Đọc pipeline VPT',
    );
    const stage = await must(
      supabase.from('crm_pipeline_stages').select('id').eq('pipeline_id', pipeline.id).eq('pipeline_type', 'deal').eq('is_active', true).order('order_index').limit(1).maybeSingle(),
      'Đọc Deal stage VPT',
    );
    const region = await must(
      supabase.from('company_regions').select('id').eq('company_id', COMPANY_ID).eq('is_active', true).order('order_index').limit(1).maybeSingle(),
      'Đọc region VPT',
    );
    assert.ok(pipeline?.id && stage?.id && region?.id);

    const customer = await must(
      supabase.from('customers').insert({
        company_id: COMPANY_ID,
        full_name: `[STAGING] Quotation connector ${suffix}`,
        phone: `086${String(Date.now()).slice(-7)}`,
        notes: 'Fixture nối Business OS sang Báo giá — tự xóa sau UAT',
      }).select('id, phone, full_name').single(),
      'Tạo customer fixture',
    );
    fixture.customerId = customer.id;
    const lead = await must(
      supabase.from('crm_leads').insert({
        company_id: COMPANY_ID,
        pipeline_id: pipeline.id,
        stage_id: stage.id,
        region_id: region.id,
        customer_id: customer.id,
        code: `STG-BG-${suffix}`.slice(0, 64),
        title: `[STAGING] Quotation connector ${suffix}`,
        type: 'deal',
        phone: customer.phone,
        assigned_to: ADMIN_USER_ID,
        lead_owner_id: ADMIN_USER_ID,
        description: 'Hồ sơ đã qua gate thiết kế để kiểm thử tạo báo giá thật.',
        created_by: ADMIN_USER_ID,
      }).select('id').single(),
      'Tạo Deal fixture',
    );
    fixture.leadId = lead.id;
    const now = new Date().toISOString();
    const instance = await must(
      supabase.from('business_os_process_instances').insert({
        company_id: COMPANY_ID,
        process_key: PROCESS_KEY,
        process_version: 1,
        record_type: 'crm_lead',
        record_id: fixture.leadId,
        current_stage_key: 'design_completed',
        workflow_path: 'customer_design',
        status: 'completed',
        stage_entered_at: now,
        design_review_started_at: now,
        design_review_completed_at: now,
        design_completed_at: now,
        created_by: ADMIN_USER_ID,
        updated_by: ADMIN_USER_ID,
      }).select('id').single(),
      'Tạo process instance fixture',
    );
    fixture.instanceId = instance.id;

    const session = await buildAuthSessionForUser(admin);
    const app = express();
    app.use(express.json({ limit: '1mb' }));
    app.use('/api/crm', require('../src/routes/crm'));
    app.use('/api/vc-handover', require('../src/routes/vcHandover'));
    app.use('/api/logistics', require('../src/routes/logistics'));
    app.use('/api/events', require('../src/routes/events'));
    app.use('/api/business-os/customer-care', require('../src/routes/businessOsCustomerCare'));
    fixture.server = await new Promise((resolve) => {
      const server = app.listen(0, '127.0.0.1', () => resolve(server));
    });
    const baseUrl = `http://127.0.0.1:${fixture.server.address().port}`;
    async function api(path, { method = 'GET', body } = {}) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${session.token}`,
          'Content-Type': 'application/json',
          'X-Request-Id': `staging-quotation-${suffix}`,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, payload: await response.json() };
    }

    const created = await api('/api/crm/quotations', {
      method: 'POST',
      body: {
        company_id: COMPANY_ID,
        region_id: region.id,
        lead_id: fixture.leadId,
        customer_id: fixture.customerId,
        customer_name: customer.full_name,
        customer_phone: customer.phone,
        title: `[STAGING] Báo giá ${suffix}`,
        status: 'draft',
        items: [],
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.payload));
    assert.ok(created.payload.id);
    fixture.quotationId = created.payload.id;
    assert.equal(created.payload.business_os_process?.applied, true, JSON.stringify(created.payload.business_os_process));
    assert.equal(created.payload.business_os_process?.current_stage_key, 'quotation');

    const workflow = await api(`/api/crm/leads/${fixture.leadId}/deal-workflow`);
    assert.equal(workflow.status, 200, JSON.stringify(workflow.payload));
    assert.equal(workflow.payload.instance.current_stage_key, 'quotation');
    assert.equal(workflow.payload.instance.primary_quotation_id, fixture.quotationId);
    assert.equal(workflow.payload.commercial.primary.id, fixture.quotationId);

    const draftBlocked = await api(`/api/crm/quotations/${fixture.quotationId}/convert-to-order`, { method: 'POST' });
    assert.equal(draftBlocked.status, 409, JSON.stringify(draftBlocked.payload));
    assert.equal(draftBlocked.payload.code, 'QUOTATION_NOT_ACCEPTED');

    const sent = await api(`/api/crm/quotations/${fixture.quotationId}`, {
      method: 'PUT',
      body: { status: 'sent' },
    });
    assert.equal(sent.status, 200, JSON.stringify(sent.payload));
    assert.equal(sent.payload.business_os_process?.applied, true, JSON.stringify(sent.payload.business_os_process));
    assert.equal(sent.payload.business_os_process?.instance?.current_stage_key, 'negotiation');

    const accepted = await api(`/api/crm/quotations/${fixture.quotationId}`, {
      method: 'PUT',
      body: { status: 'accepted' },
    });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.payload));
    assert.equal(accepted.payload.business_os_process?.applied, true, JSON.stringify(accepted.payload.business_os_process));
    assert.equal(accepted.payload.business_os_process?.instance?.current_stage_key, 'order_ready');
    assert.equal(accepted.payload.auto?.autoProject || null, null, 'Chấp nhận báo giá không được tạo dự án sớm');
    assert.equal(accepted.payload.auto?.project_creation_deferred_to, 'order_confirmed');

    const converted = await api(`/api/crm/quotations/${fixture.quotationId}/convert-to-order`, { method: 'POST' });
    assert.equal(converted.status, 201, JSON.stringify(converted.payload));
    assert.ok(converted.payload.id);
    fixture.orderId = converted.payload.id;
    assert.equal(converted.payload.business_os_process?.applied, true, JSON.stringify(converted.payload.business_os_process));
    assert.equal(converted.payload.business_os_process?.instance?.current_stage_key, 'order');

    const repeated = await api(`/api/crm/quotations/${fixture.quotationId}/convert-to-order`, { method: 'POST' });
    assert.equal(repeated.status, 200, JSON.stringify(repeated.payload));
    assert.equal(repeated.payload.id, fixture.orderId);
    assert.equal(repeated.payload.existing, true);

    const confirmedOrder = await api(`/api/crm/orders/${fixture.orderId}`, {
      method: 'PUT',
      body: { status: 'confirmed' },
    });
    assert.equal(confirmedOrder.status, 200, JSON.stringify(confirmedOrder.payload));
    assert.ok(confirmedOrder.payload.auto_project?.id, 'Đơn hàng xác nhận phải tạo hoặc liên kết dự án');
    fixture.projectId = confirmedOrder.payload.auto_project.id;
    assert.equal(confirmedOrder.payload.business_os_process?.applied, true, JSON.stringify(confirmedOrder.payload.business_os_process));
    assert.equal(confirmedOrder.payload.business_os_process?.instance?.current_stage_key, 'project');

    const completedWorkflow = await api(`/api/crm/leads/${fixture.leadId}/deal-workflow`);
    assert.equal(completedWorkflow.status, 200, JSON.stringify(completedWorkflow.payload));
    assert.equal(completedWorkflow.payload.instance.current_stage_key, 'project');
    assert.equal(completedWorkflow.payload.instance.accepted_quotation_id, fixture.quotationId);
    assert.equal(completedWorkflow.payload.instance.primary_order_id, fixture.orderId);
    assert.equal(completedWorkflow.payload.instance.primary_project_id, fixture.projectId);
    assert.equal(completedWorkflow.payload.commercial.primary_order.id, fixture.orderId);
    assert.equal(completedWorkflow.payload.commercial.primary_project.id, fixture.projectId);

    const activeCompanies = await must(
      supabase.from('companies').select('id, name').eq('is_active', true).order('name').limit(100),
      'Đọc danh sách công ty để chọn xưởng',
    );
    let productionCompany = null;
    for (const company of activeCompanies || []) {
      const validation = await validateProductionCompanyId(company.id);
      if (validation.ok) {
        productionCompany = validation.company;
        break;
      }
    }
    assert.ok(productionCompany?.id, 'Staging cần ít nhất một công ty thuộc module Sản xuất');

    const sxTask = await must(
      supabase.from('crm_tasks').insert({
        lead_id: fixture.leadId,
        title: `[STAGING] Gate bàn giao SX ${suffix}`,
        status: 'completed',
        priority: 'high',
        stage_slug: 'sx_uat',
        completed_at: new Date().toISOString(),
        created_by: ADMIN_USER_ID,
      }).select('id').single(),
      'Tạo task SX hoàn tất',
    );
    fixture.crmTaskId = sxTask.id;
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const nextWeek = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    const productionHandover = await api(`/api/crm/leads/${fixture.leadId}/sx-handover`, {
      method: 'POST',
      body: {
        project_id: fixture.projectId,
        production_company_id: productionCompany.id,
        sale_acknowledged: true,
        construction_start_date: tomorrow,
        expected_production_start_date: tomorrow,
        expected_production_end_date: nextWeek,
      },
    });
    assert.equal(productionHandover.status, 200, JSON.stringify(productionHandover.payload));
    assert.equal(productionHandover.payload.business_os_process?.applied, true, JSON.stringify(productionHandover.payload.business_os_process));
    assert.equal(productionHandover.payload.business_os_process?.instance?.current_stage_key, 'production');

    const productionWorkflow = await api(`/api/crm/leads/${fixture.leadId}/deal-workflow`);
    assert.equal(productionWorkflow.status, 200, JSON.stringify(productionWorkflow.payload));
    assert.equal(productionWorkflow.payload.instance.current_stage_key, 'production');
    assert.equal(productionWorkflow.payload.instance.production_project_id, fixture.projectId);
    assert.equal(productionWorkflow.payload.instance.production_company_id, productionCompany.id);
    assert.equal(productionWorkflow.payload.commercial.production_project.id, fixture.projectId);

    let logisticsCompany = null;
    let completedLogisticsStage = null;
    let customerCareLogisticsStage = null;
    const logisticsStages = await must(
      supabase.from('logistics_pipeline_stages')
        .select('id, company_id, name, bucket_slug, crm_sync_type, is_active, order_index')
        .eq('is_active', true)
        .order('order_index'),
      'Đọc pipeline VC/LĐ staging',
    );
    for (const company of activeCompanies || []) {
      const validation = await validateLogisticsCompanyId(company.id);
      if (!validation.ok) continue;
      const scoped = logisticsStages.filter((row) => String(row.company_id || '') === String(company.id));
      const available = scoped.length ? scoped : logisticsStages.filter((row) => !row.company_id);
      const completed = available.find((row) => {
        const slug = String(row.bucket_slug || '').toLowerCase();
        const name = String(row.name || '').toLowerCase();
        return ['completed', 'done', 'install_completed'].includes(slug)
          || name === 'hoàn thành' || name === 'hoàn thiện';
      });
      const customerCare = available.find((row) => String(row.crm_sync_type || '') === 'customer_care');
      if (completed && customerCare) {
        logisticsCompany = validation.company;
        completedLogisticsStage = completed;
        customerCareLogisticsStage = customerCare;
        break;
      }
    }
    assert.ok(
      logisticsCompany?.id && completedLogisticsStage?.id && customerCareLogisticsStage?.id,
      'Staging cần công ty VC/LĐ có cả cột Bảo hành/CSKH và Hoàn thành thật',
    );

    const readyRequest = await api(`/api/vc-handover/projects/${fixture.projectId}/request`, {
      method: 'POST',
      body: {},
    });
    assert.equal(readyRequest.status, 200, JSON.stringify(readyRequest.payload));
    assert.ok(readyRequest.payload.comment?.id);
    fixture.handoverCommentId = readyRequest.payload.comment.id;
    assert.equal(readyRequest.payload.business_os_process?.applied, true, JSON.stringify(readyRequest.payload.business_os_process));
    assert.equal(readyRequest.payload.business_os_process?.instance?.current_stage_key, 'delivery_ready');

    const repeatedReadyRequest = await api(`/api/vc-handover/projects/${fixture.projectId}/request`, {
      method: 'POST',
      body: {},
    });
    assert.equal(repeatedReadyRequest.status, 200, JSON.stringify(repeatedReadyRequest.payload));
    assert.equal(repeatedReadyRequest.payload.already, true);
    assert.equal(repeatedReadyRequest.payload.business_os_process?.applied, false);

    const installationHandover = await api(`/api/vc-handover/comments/${fixture.handoverCommentId}/select`, {
      method: 'PATCH',
      body: {
        logistics_company_id: logisticsCompany.id,
        pickup_at: `${tomorrow}T08:00:00+07:00`,
        install_date: `${nextWeek}T14:00:00+07:00`,
        install_address: 'Fixture staging Business OS — tự xóa',
        notes: 'UAT Production → Installation',
      },
    });
    assert.equal(installationHandover.status, 200, JSON.stringify(installationHandover.payload));
    if (installationHandover.payload.vc_company_deal_created
      && installationHandover.payload.vc_company_deal_id !== fixture.leadId) {
      fixture.vcDealId = installationHandover.payload.vc_company_deal_id;
    }
    assert.equal(installationHandover.payload.business_os_process?.applied, true, JSON.stringify(installationHandover.payload.business_os_process));
    assert.equal(installationHandover.payload.business_os_process?.instance?.current_stage_key, 'installation');

    const installationCustomerCare = await api(`/api/logistics/projects/${fixture.projectId}/stage`, {
      method: 'PATCH',
      body: { vc_stage_id: customerCareLogisticsStage.id },
    });
    assert.equal(installationCustomerCare.status, 200, JSON.stringify(installationCustomerCare.payload));
    assert.equal(installationCustomerCare.payload.business_os_process?.applied, true, JSON.stringify(installationCustomerCare.payload.business_os_process));
    assert.equal(installationCustomerCare.payload.business_os_process?.instance?.current_stage_key, 'completed');
    assert.equal(installationCustomerCare.payload.business_os_process?.after_sales?.applied, true, JSON.stringify(installationCustomerCare.payload.business_os_process?.after_sales));
    assert.equal(installationCustomerCare.payload.business_os_process?.after_sales?.instance?.current_stage_key, 'care_active');
    assert.equal(installationCustomerCare.payload.business_os_process?.after_sales?.tasks?.length, 3);
    fixture.afterSalesInstanceId = installationCustomerCare.payload.business_os_process.after_sales.instance.id;

    const installationCompleted = await api(`/api/logistics/projects/${fixture.projectId}/stage`, {
      method: 'PATCH',
      body: { vc_stage_id: completedLogisticsStage.id },
    });
    assert.equal(installationCompleted.status, 200, JSON.stringify(installationCompleted.payload));
    assert.equal(installationCompleted.payload.business_os_process?.applied, false, JSON.stringify(installationCompleted.payload.business_os_process));
    assert.equal(installationCompleted.payload.business_os_process?.reason, 'already_completed');
    assert.equal(installationCompleted.payload.business_os_process?.after_sales?.applied, false);
    assert.equal(installationCompleted.payload.business_os_process?.after_sales?.reason, 'already_started');

    const finalWorkflow = await api(`/api/crm/leads/${fixture.leadId}/deal-workflow`);
    assert.equal(finalWorkflow.status, 200, JSON.stringify(finalWorkflow.payload));
    assert.equal(finalWorkflow.payload.instance.current_stage_key, 'completed');
    assert.equal(finalWorkflow.payload.instance.installation_project_id, fixture.projectId);
    assert.equal(finalWorkflow.payload.instance.installation_company_id, logisticsCompany.id);
    assert.equal(finalWorkflow.payload.commercial.installation_project.id, fixture.projectId);

    const careOverview = await api(`/api/business-os/customer-care/overview?company_id=${COMPANY_ID}`);
    assert.equal(careOverview.status, 200, JSON.stringify(careOverview.payload));
    const carePlan = careOverview.payload.plans.find((row) => row.id === fixture.afterSalesInstanceId);
    assert.ok(carePlan, 'Overview phải có kế hoạch chăm sóc của project vừa bàn giao');
    assert.equal(carePlan.open_task_count, 3);

    const createdCase = await api('/api/business-os/customer-care/cases', {
      method: 'POST',
      body: {
        company_id: COMPANY_ID,
        project_id: fixture.projectId,
        case_type: 'warranty',
        priority: 'urgent',
        title: `[STAGING] Cánh tủ cần cân chỉnh ${suffix}`,
        description: 'Fixture kiểm thử case bảo hành có SLA — tự xóa.',
        assigned_to: ADMIN_USER_ID,
      },
    });
    assert.equal(createdCase.status, 201, JSON.stringify(createdCase.payload));
    fixture.customerCaseId = createdCase.payload.case.id;
    assert.equal(createdCase.payload.case.status, 'open');
    assert.equal(createdCase.payload.case.priority, 'urgent');
    assert.ok(createdCase.payload.case.sla_due_at);
    assert.equal(createdCase.payload.instance.current_stage_key, 'warranty_active');

    const invalidResolve = await api(`/api/business-os/customer-care/cases/${fixture.customerCaseId}`, {
      method: 'PATCH',
      body: { status: 'resolved', resolution: 'Không được đi tắt từ open.' },
    });
    assert.equal(invalidResolve.status, 409, JSON.stringify(invalidResolve.payload));
    assert.equal(invalidResolve.payload.code, 'INVALID_CUSTOMER_CASE_TRANSITION');

    for (const [status, extra] of [
      ['triaged', {}],
      ['in_progress', {}],
      ['resolved', { resolution: 'Đã cân chỉnh bản lề và khách xác nhận ổn định.' }],
      ['closed', {}],
    ]) {
      const moved = await api(`/api/business-os/customer-care/cases/${fixture.customerCaseId}`, {
        method: 'PATCH',
        body: { status, ...extra },
      });
      assert.equal(moved.status, 200, JSON.stringify(moved.payload));
      assert.equal(moved.payload.case.status, status);
    }

    const careBlocked = await api(`/api/business-os/customer-care/plans/${fixture.projectId}/complete?company_id=${COMPANY_ID}`, {
      method: 'POST',
      body: {},
    });
    assert.equal(careBlocked.status, 409, JSON.stringify(careBlocked.payload));
    assert.equal(careBlocked.payload.code, 'AFTER_SALES_OPEN_WORK');
    const completedCareTasks = await supabase.from('crm_tasks').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      notes: 'Fixture UAT tự hoàn tất lịch chăm sóc.',
    }).eq('lead_id', fixture.leadId).eq('business_os_process_key', 'customer_after_sales_v1');
    assert.equal(completedCareTasks.error, null, completedCareTasks.error?.message);
    const careCompleted = await api(`/api/business-os/customer-care/plans/${fixture.projectId}/complete?company_id=${COMPANY_ID}`, {
      method: 'POST',
      body: {},
    });
    assert.equal(careCompleted.status, 200, JSON.stringify(careCompleted.payload));
    assert.equal(careCompleted.payload.applied, true);
    assert.equal(careCompleted.payload.instance.current_stage_key, 'closed');
    assert.equal(careCompleted.payload.instance.status, 'completed');

    const eventRows = await must(
      supabase.from('business_os_process_events')
        .select('event_type, idempotency_key')
        .eq('process_instance_id', fixture.instanceId)
        .eq('event_type', 'sales.quotation.created'),
      'Đọc event tạo báo giá',
    );
    assert.equal(eventRows.length, 1);
    const commercialEvents = await must(
      supabase.from('business_os_process_events')
        .select('event_type, idempotency_key')
        .eq('process_instance_id', fixture.instanceId)
        .in('event_type', ['sales.negotiation.started', 'sales.quotation.accepted', 'sales.order.created', 'sales.project.started', 'sales.production.started', 'sales.delivery.ready', 'sales.installation.started', 'sales.installation.completed']),
      'Đọc event thương mại',
    );
    assert.deepEqual(
      [...new Set(commercialEvents.map((row) => row.event_type))].sort(),
      ['sales.negotiation.started', 'sales.order.created', 'sales.production.started', 'sales.project.started', 'sales.quotation.accepted', 'sales.delivery.ready', 'sales.installation.started', 'sales.installation.completed'].sort(),
    );
    assert.equal(commercialEvents.length, 8);

    // Nhánh thuê đội lắp đặt bên ngoài không có project trên bảng Logistics.
    // Người phụ trách đóng sự kiện lịch là tín hiệu hoàn tất Business OS.
    const externalCustomer = await must(
      supabase.from('customers').insert({
        company_id: COMPANY_ID,
        full_name: `[STAGING] External installer ${suffix}`,
        phone: `087${String(Date.now()).slice(-7)}`,
        notes: 'Fixture lắp đặt thuê ngoài — tự xóa sau UAT',
      }).select('id, phone, full_name').single(),
      'Tạo customer thuê ngoài fixture',
    );
    fixture.externalCustomerId = externalCustomer.id;
    const externalProject = await must(
      supabase.from('projects').insert({
        company_id: COMPANY_ID,
        customer_id: fixture.externalCustomerId,
        code: `EXT-${suffix}`.slice(0, 20),
        name: `[STAGING] External installation ${suffix}`,
        status: 'new',
        install_address: 'Fixture staging Business OS — tự xóa',
        sales_person_id: ADMIN_USER_ID,
        created_by: ADMIN_USER_ID,
      }).select('id').single(),
      'Tạo project thuê ngoài fixture',
    );
    fixture.externalProjectId = externalProject.id;
    const externalLead = await must(
      supabase.from('crm_leads').insert({
        company_id: COMPANY_ID,
        pipeline_id: pipeline.id,
        stage_id: stage.id,
        region_id: region.id,
        customer_id: fixture.externalCustomerId,
        project_id: fixture.externalProjectId,
        code: `STG-EXT-${suffix}`.slice(0, 64),
        title: `[STAGING] External installation ${suffix}`,
        type: 'deal',
        phone: externalCustomer.phone,
        assigned_to: ADMIN_USER_ID,
        lead_owner_id: ADMIN_USER_ID,
        description: 'Hồ sơ ở bước lắp đặt với đội thuê ngoài.',
        created_by: ADMIN_USER_ID,
      }).select('id').single(),
      'Tạo Deal thuê ngoài fixture',
    );
    fixture.externalLeadId = externalLead.id;
    const externalProcess = await must(
      supabase.from('business_os_process_instances').insert({
        company_id: COMPANY_ID,
        process_key: PROCESS_KEY,
        process_version: 1,
        record_type: 'crm_lead',
        record_id: fixture.externalLeadId,
        current_stage_key: 'installation',
        workflow_path: 'customer_design',
        status: 'active',
        stage_entered_at: now,
        primary_project_id: fixture.externalProjectId,
        production_project_id: fixture.externalProjectId,
        installation_project_id: fixture.externalProjectId,
        installation_started_at: now,
        installation_started_by: ADMIN_USER_ID,
        created_by: ADMIN_USER_ID,
        updated_by: ADMIN_USER_ID,
      }).select('id').single(),
      'Tạo process lắp đặt thuê ngoài fixture',
    );
    fixture.externalInstanceId = externalProcess.id;
    const installationType = await must(
      supabase.from('event_types').select('id, slug').eq('slug', 'installation').maybeSingle(),
      'Đọc loại sự kiện lắp đặt',
    );
    assert.ok(installationType?.id);
    const externalEvent = await must(
      supabase.from('crm_events').insert({
        company_id: COMPANY_ID,
        module: 'production',
        event_type_id: installationType.id,
        event_type: 'installation',
        title: `[STAGING] Lắp đặt thuê ngoài ${suffix}`,
        description: 'Sự kiện fixture do thẻ bàn giao VC tạo.',
        start_time: `${tomorrow}T14:00:00+07:00`,
        status: 'in_progress',
        lead_id: fixture.externalLeadId,
        customer_id: fixture.externalCustomerId,
        project_id: fixture.externalProjectId,
        created_by: ADMIN_USER_ID,
        assignee_id: ADMIN_USER_ID,
      }).select('id').single(),
      'Tạo sự kiện lắp đặt thuê ngoài fixture',
    );
    fixture.externalEventId = externalEvent.id;
    const externalComment = await must(
      supabase.from('crm_lead_comments').insert({
        lead_id: fixture.externalLeadId,
        user_id: ADMIN_USER_ID,
        body: 'Thuê lắp đặt bên ngoài — fixture tự xóa.',
        comment_type: 'vc_handover',
        metadata: {
          state: 'done',
          skip_logistics_module: true,
          project_id: fixture.externalProjectId,
          install_event_id: fixture.externalEventId,
          event_ids: [fixture.externalEventId],
          events_mode: 'external',
          external_company_name: 'Đội lắp đặt staging',
        },
      }).select('id').single(),
      'Tạo marker bàn giao thuê ngoài fixture',
    );
    fixture.externalCommentId = externalComment.id;

    const externalCompleted = await api(`/api/events/${fixture.externalEventId}`, {
      method: 'PUT',
      body: { status: 'completed', result: 'Đã lắp xong và nghiệm thu nội bộ.' },
    });
    assert.equal(externalCompleted.status, 200, JSON.stringify(externalCompleted.payload));
    assert.equal(externalCompleted.payload.business_os_process?.applied, true, JSON.stringify(externalCompleted.payload.business_os_process));
    assert.equal(externalCompleted.payload.business_os_process?.instance?.current_stage_key, 'completed');
    assert.equal(externalCompleted.payload.business_os_process?.after_sales?.applied, true, JSON.stringify(externalCompleted.payload.business_os_process?.after_sales));
    assert.equal(externalCompleted.payload.business_os_process?.after_sales?.tasks?.length, 3);
    fixture.externalAfterSalesInstanceId = externalCompleted.payload.business_os_process.after_sales.instance.id;

    const externalRepeated = await api(`/api/events/${fixture.externalEventId}`, {
      method: 'PUT',
      body: { status: 'completed' },
    });
    assert.equal(externalRepeated.status, 200, JSON.stringify(externalRepeated.payload));
    assert.equal(externalRepeated.payload.business_os_process?.applied, false);
    assert.equal(externalRepeated.payload.business_os_process?.reason, 'already_completed');
    const externalCompletionEvents = await must(
      supabase.from('business_os_process_events')
        .select('id')
        .eq('process_instance_id', fixture.externalInstanceId)
        .eq('event_type', 'sales.installation.completed'),
      'Đọc event hoàn tất lắp đặt thuê ngoài',
    );
    assert.equal(externalCompletionEvents.length, 1);

    console.log(JSON.stringify({
      ok: true,
      company: 'Công ty TNHH Bếp Vạn Phú Thành',
      quotation_source_of_record: 'quotations',
      process_transition: 'design_completed -> quotation -> negotiation -> order_ready -> order -> project -> production -> delivery_ready -> installation -> completed',
      quotation_acceptance_does_not_create_project: true,
      confirmed_order_creates_project: true,
      production_handover_requires_project_gate: true,
      production_handover_reuses_existing_sx_task_date_company_gates: true,
      delivery_ready_reuses_vc_handover_comment: true,
      installation_reuses_logistics_project_and_kanban: true,
      installation_completed_from_real_customer_care_column: true,
      logistics_completed_column_is_idempotent_fallback: true,
      external_installation_completed_from_calendar_event: true,
      external_installation_completion_is_idempotent: true,
      after_sales_process_is_separate_from_sales: true,
      after_sales_7_30_90_tasks_materialized: true,
      warranty_case_sla_and_transitions_verified: true,
      after_sales_close_gate_verified: true,
      draft_order_gate_blocked: true,
      duplicate_order_prevented: true,
      event_recorded_once_per_milestone: true,
      fixture_cleanup: 'pending',
    }, null, 2));
  } finally {
    await cleanup();
    console.log(JSON.stringify({ fixture_cleanup: 'completed' }));
  }
}

run().then(() => {
  setTimeout(() => process.exit(0), 150);
}).catch((error) => {
  console.error(error.stack || error.message || error);
  setTimeout(() => process.exit(1), 150);
});
