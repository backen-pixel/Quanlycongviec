/** Read-only smoke test cho tài khoản admin tenant không gắn company_id. */
const assert = require('assert/strict');
const express = require('express');
const { supabase } = require('../src/config/supabase');
const { buildAuthSessionForUser } = require('../src/helpers/authSession');

const TENANT_ADMIN_USER_ID = 'e679aa3f-efa0-4a57-8d81-5374950dc8d4';
const TENANT_ID = '7d42e731-895b-4ba8-99d6-0005c4e23544';
const REAL_DATA_COMPANY_ID = '991dc79d-cbf5-49f9-a364-35227cb47635';
const OUTSIDE_TENANT_COMPANY_ID = 'b7cb0688-8e4d-46e5-a8e0-694c6b57c1b4';

async function getJson(baseUrl, path, token) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { response, payload: await response.json() };
}

async function startReadOnlyTestServer() {
  if (process.env.BUSINESS_OS_BASE_URL) {
    return {
      baseUrl: String(process.env.BUSINESS_OS_BASE_URL).replace(/\/$/, ''),
      close: async () => {},
    };
  }

  const app = express();
  app.use(express.json());
  app.use('/api/business-os', require('../src/routes/businessOs'));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

async function run() {
  const { data: admin, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', TENANT_ADMIN_USER_ID)
    .maybeSingle();
  if (error) throw error;
  assert.equal(admin?.role, 'admin');
  assert.equal(admin?.company_id, null);
  assert.equal(admin?.tenant_id, TENANT_ID);

  const session = await buildAuthSessionForUser(admin);
  const testServer = await startReadOnlyTestServer();
  const { baseUrl } = testServer;

  try {
    const listResult = await getJson(baseUrl, '/api/business-os/companies', session.token);
    assert.equal(listResult.response.status, 200, JSON.stringify(listResult.payload));
    assert.ok(listResult.payload.companies.length > 0);
    assert.ok(listResult.payload.companies.every((company) => company.tenant_id === TENANT_ID));
    assert.ok(listResult.payload.companies.every((company) => company.is_active !== false));
    assert.ok(!listResult.payload.companies.some((company) => company.id === OUTSIDE_TENANT_COMPANY_ID));

    const defaultResult = await getJson(baseUrl, '/api/business-os/overview', session.token);
    assert.equal(defaultResult.response.status, 200, JSON.stringify(defaultResult.payload));
    assert.ok(listResult.payload.companies.some((company) => company.id === defaultResult.payload.company?.id));
    assert.equal(defaultResult.payload.rollout?.data_connected, true);
    assert.equal(defaultResult.payload.rollout?.all_modules_enabled, true);

    const realDataResult = await getJson(
      baseUrl,
      `/api/business-os/overview?company_id=${REAL_DATA_COMPANY_ID}`,
      session.token,
    );
    assert.equal(realDataResult.response.status, 200, JSON.stringify(realDataResult.payload));
    assert.equal(realDataResult.payload.company?.id, REAL_DATA_COMPANY_ID);
    assert.ok(realDataResult.payload.summary?.total_records > 0);

    const contractResult = await getJson(
      baseUrl,
      `/api/business-os/qualification-contract?company_id=${REAL_DATA_COMPANY_ID}`,
      session.token,
    );
    assert.equal(contractResult.response.status, 200, JSON.stringify(contractResult.payload));
    assert.ok(contractResult.payload.contract?.fields?.length >= 8);
    const versionsResult = await getJson(
      baseUrl,
      `/api/business-os/qualification-contract/versions?company_id=${REAL_DATA_COMPANY_ID}`,
      session.token,
    );
    assert.equal(versionsResult.response.status, 200, JSON.stringify(versionsResult.payload));
    assert.ok(versionsResult.payload.versions?.length >= 1, 'Migration 569 phải seed lịch sử contract hiện tại');

    const deniedResult = await getJson(
      baseUrl,
      `/api/business-os/overview?company_id=${OUTSIDE_TENANT_COMPANY_ID}`,
      session.token,
    );
    assert.equal(deniedResult.response.status, 403, JSON.stringify(deniedResult.payload));

    let modulesChecked = false;
    if (process.env.BUSINESS_OS_BASE_URL) {
      const companyParam = `company_id=${REAL_DATA_COMPANY_ID}`;
      const clientCompanyParam = `client_company_id=${REAL_DATA_COMPANY_ID}`;
      const [workSummary, workList, projectLifecycle, operations, operationsQueue, operationsDeals, purchasing, finance, financeDeals, customers, categories, lessons] = await Promise.all([
        getJson(baseUrl, `/api/work-tasks/summary?${companyParam}`, session.token),
        getJson(baseUrl, `/api/work-tasks?${companyParam}&page_size=20`, session.token),
        getJson(baseUrl, `/api/management/work-unified?${companyParam}`, session.token),
        getJson(baseUrl, `/api/management/overview?${companyParam}`, session.token),
        getJson(baseUrl, `/api/management/operations-queue?${companyParam}`, session.token),
        getJson(baseUrl, `/api/management/deals?${companyParam}&module_tab=sx&record_type=deal&page_size=20`, session.token),
        getJson(baseUrl, `/api/purchasing/orders?${companyParam}`, session.token),
        getJson(baseUrl, `/api/accounting/summary?${clientCompanyParam}`, session.token),
        getJson(baseUrl, `/api/accounting/deals?${clientCompanyParam}&limit=20`, session.token),
        getJson(baseUrl, `/api/customers?${companyParam}&limit=20`, session.token),
        getJson(baseUrl, `/api/knowledge/categories?${companyParam}`, session.token),
        getJson(baseUrl, `/api/knowledge/lessons?${companyParam}`, session.token),
      ]);

      const moduleResults = {
        work_summary: workSummary,
        work_list: workList,
        project_lifecycle: projectLifecycle,
        operations,
        operations_queue: operationsQueue,
        operations_deals: operationsDeals,
        purchasing,
        finance,
        finance_deals: financeDeals,
        customers,
        categories,
        lessons,
      };
      for (const [moduleName, result] of Object.entries(moduleResults)) {
        assert.equal(result.response.status, 200, `${moduleName}: ${JSON.stringify(result.payload)}`);
      }
      assert.ok((workList.payload.tasks || []).every((row) => String(row.company_id) === REAL_DATA_COMPANY_ID));
      assert.equal(projectLifecycle.payload.company_id, REAL_DATA_COMPANY_ID);
      assert.ok((operationsDeals.payload.deals || []).every((row) => String(row.company_id) === REAL_DATA_COMPANY_ID));
      assert.ok(
        Number(operations.payload.kpis?.sx_active || 0) > 0,
        'KPI Sản xuất của công ty pilot phải tính cả Project đang thực thi tại xưởng liên kết',
      );
      const pipelineCount = (rows) => (rows || []).reduce((sum, row) => sum + Number(row.count || 0), 0);
      assert.equal(pipelineCount(operations.payload.pipelines?.sx), Number(operations.payload.kpis?.sx_active || 0));
      assert.equal(pipelineCount(operations.payload.pipelines?.vc), Number(operations.payload.kpis?.vc_active || 0));
      assert.equal(pipelineCount(operations.payload.pipelines?.install), Number(operations.payload.kpis?.install_active || 0));
      assert.equal(operations.payload.metric_contract?.version, 'operations_kpi_v1');
      assert.equal(operationsQueue.payload.metric_contract?.version, 'operations_kpi_v1');
      assert.equal(Number(operationsQueue.payload.stats?.production || 0), Number(operations.payload.kpis?.sx_active || 0));
      assert.equal(Number(operationsQueue.payload.stats?.delivery || 0), Number(operations.payload.kpis?.vc_active || 0));
      assert.equal(Number(operationsQueue.payload.stats?.installation || 0), Number(operations.payload.kpis?.install_active || 0));
      assert.equal(
        new Set((operationsQueue.payload.queues?.all || []).map((row) => String(row.project_id))).size,
        (operationsQueue.payload.queues?.all || []).length,
        'Hàng đợi Operations phải khử trùng theo Project',
      );
      assert.equal(workSummary.payload.metric_contract?.version, 'work_kpi_v1');
      assert.equal(workSummary.payload.metric_contract?.company_id, REAL_DATA_COMPANY_ID);
      assert.equal(Number(workSummary.payload.open || 0), Number(operations.payload.kpis?.open_tasks || 0));
      assert.equal(Number(workSummary.payload.overdue || 0), Number(operations.payload.kpis?.overdue_tasks || 0));
      assert.ok(Number(workSummary.payload.total || 0) > 3000, 'KPI Work phải đọc toàn bộ dữ liệu thật, không cắt ở 3.000 dòng');
      assert.ok((purchasing.payload || []).every((row) => String(row.company_id) === REAL_DATA_COMPANY_ID));
      assert.equal(finance.payload.client_company_id, REAL_DATA_COMPANY_ID);
      assert.ok((customers.payload.customers || []).every((row) => String(row.company_id) === REAL_DATA_COMPANY_ID));
      assert.ok((categories.payload.flat || []).every((row) => row.company_id == null || String(row.company_id) === REAL_DATA_COMPANY_ID));
      assert.ok((lessons.payload.lessons || []).every((row) => row.category?.company_id == null || String(row.category.company_id) === REAL_DATA_COMPANY_ID));

      const detailChecks = [];
      const lifecycleProject = (projectLifecycle.payload.items || []).find((item) => (
        String(item.company_id) !== REAL_DATA_COMPANY_ID
        && String(item.logistics_company_id) === REAL_DATA_COMPANY_ID
      )) || projectLifecycle.payload.items?.[0];
      if (lifecycleProject?.id) {
        detailChecks.push(['project_work_bundle', `/api/management/by-project/${lifecycleProject.id}?${companyParam}`]);
        detailChecks.push(['project_work_tasks', `/api/work-tasks/by-project/${lifecycleProject.id}?${companyParam}`]);
      }
      const operationRecord = operationsDeals.payload.deals?.[0];
      if (operationRecord?.id) detailChecks.push(['operation_detail', `/api/management/deals/${operationRecord.id}?${companyParam}`]);
      const operationProject = operationsQueue.payload.queues?.all?.[0];
      if (operationProject?.project_id) {
        detailChecks.push(['operation_project_detail', `/api/management/production-overview/${operationProject.project_id}?${companyParam}`]);
        detailChecks.push(['operation_project_tasks', `/api/work-tasks/by-project/${operationProject.project_id}?${companyParam}`]);
      }
      const commercialCrossCompanyProject = (operationsQueue.payload.queues?.production || []).find((item) => (
        String(item.commercial_record?.company_id) === REAL_DATA_COMPANY_ID
        && String(item.company_id) !== REAL_DATA_COMPANY_ID
        && String(item.logistics_company_id || '') !== REAL_DATA_COMPANY_ID
      ));
      if (commercialCrossCompanyProject?.project_id) {
        detailChecks.push(['commercial_cross_company_project', `/api/management/production-overview/${commercialCrossCompanyProject.project_id}?${companyParam}`]);
        detailChecks.push(['commercial_cross_company_tasks', `/api/work-tasks/by-project/${commercialCrossCompanyProject.project_id}?${companyParam}`]);
      }
      const purchaseRecord = purchasing.payload?.[0];
      if (purchaseRecord?.id) detailChecks.push(['purchase_detail', `/api/purchasing/orders/${purchaseRecord.id}`]);
      const financeRecord = financeDeals.payload.deals?.[0];
      if (financeRecord?.id) detailChecks.push(['finance_detail', `/api/accounting/deals/${financeRecord.id}?${clientCompanyParam}`]);
      const customerRecord = customers.payload.customers?.[0];
      if (customerRecord?.id) detailChecks.push(['customer_detail', `/api/customers/${customerRecord.id}`]);
      const lessonRecord = lessons.payload.lessons?.[0];
      if (lessonRecord?.id) detailChecks.push(['lesson_detail', `/api/knowledge/lessons/${lessonRecord.id}`]);

      const detailResults = await Promise.all(detailChecks.map(async ([name, path]) => [name, await getJson(baseUrl, path, session.token)]));
      for (const [detailName, result] of detailResults) {
        assert.equal(result.response.status, 200, `${detailName}: ${JSON.stringify(result.payload)}`);
        if (detailName === 'project_work_tasks') {
          assert.equal(result.payload.scope_company_id, REAL_DATA_COMPANY_ID);
          assert.ok(
            [result.payload.company_id, result.payload.logistics_company_id].map(String).includes(REAL_DATA_COMPANY_ID),
            'Project phải thuộc hoặc được vận hành bởi công ty pilot',
          );
          assert.ok(Array.isArray(result.payload.next_actions));
          assert.equal(
            Number(result.payload.progress?.open || 0) + Number(result.payload.progress?.completed || 0),
            Number(result.payload.progress?.total || 0),
          );
        }
        if (detailName === 'operation_project_detail') {
          assert.equal(result.payload.metric_contract?.version, 'operations_kpi_v1');
          assert.equal(String(result.payload.project?.id), String(operationProject.project_id));
        }
        if (detailName === 'commercial_cross_company_project') {
          assert.equal(String(result.payload.project?.id), String(commercialCrossCompanyProject.project_id));
          assert.notEqual(String(result.payload.project?.company_id), REAL_DATA_COMPANY_ID);
        }
      }

      const deniedModules = await Promise.all([
        getJson(baseUrl, `/api/work-tasks/summary?company_id=${OUTSIDE_TENANT_COMPANY_ID}`, session.token),
        getJson(baseUrl, `/api/work-tasks?company_id=${OUTSIDE_TENANT_COMPANY_ID}&page_size=1`, session.token),
        getJson(baseUrl, `/api/management/operations-queue?company_id=${OUTSIDE_TENANT_COMPANY_ID}`, session.token),
        getJson(baseUrl, `/api/purchasing/orders?company_id=${OUTSIDE_TENANT_COMPANY_ID}`, session.token),
        getJson(baseUrl, `/api/customers?company_id=${OUTSIDE_TENANT_COMPANY_ID}`, session.token),
        getJson(baseUrl, `/api/knowledge/categories?company_id=${OUTSIDE_TENANT_COMPANY_ID}`, session.token),
      ]);
      for (const result of deniedModules) {
        assert.equal(result.response.status, 403, JSON.stringify(result.payload));
      }
      modulesChecked = true;
    }

    console.log(JSON.stringify({
      ok: true,
      companies: listResult.payload.companies.length,
      default_company: defaultResult.payload.company?.name,
      checked_company: realDataResult.payload.company?.name,
      records_loaded: realDataResult.payload.summary?.total_records,
      qualification_fields: contractResult.payload.contract.fields.length,
      contract_versions: versionsResult.payload.versions.length,
      outside_tenant_denied: true,
      modules_checked: modulesChecked,
    }, null, 2));
  } finally {
    await testServer.close();
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error.stack || error.message || error);
    process.exit(1);
  });
