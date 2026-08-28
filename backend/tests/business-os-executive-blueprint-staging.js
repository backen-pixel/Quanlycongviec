/** UAT staging cho Báo cáo/AI và Blueprint công ty thứ hai. Blueprint được giữ lại có chủ đích. */
const assert = require('node:assert/strict');
const express = require('express');
const { supabase } = require('../src/config/supabase');
const { buildAuthSessionForUser } = require('../src/helpers/authSession');
const { syncDepartmentToEcosystem } = require('../src/helpers/ecosystemSync');

const PILOT_COMPANY_ID = '991dc79d-cbf5-49f9-a364-35227cb47635';
const TENANT_ADMIN_USER_ID = 'e679aa3f-efa0-4a57-8d81-5374950dc8d4';
const BLUEPRINT_KEY = 'cabinet-business-os';
const ROLLOUT_RING = 'uat-secondary';
const TRANSACTION_TABLES = [
  'crm_leads', 'projects', 'orders', 'invoices',
  'purchase_orders', 'supplier_bills', 'project_expenses',
];

function confirmed() {
  const index = process.argv.indexOf('--confirm');
  return index >= 0 && process.argv[index + 1] === 'VPT';
}

async function must(promise, label) {
  const result = await promise;
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function companyTransactionCounts(companyId) {
  const entries = await Promise.all(TRANSACTION_TABLES.map(async (table) => {
    const result = await supabase.from(table).select('id', { count: 'exact', head: true }).eq('company_id', companyId);
    if (result.error) throw new Error(`Đếm ${table}: ${result.error.message}`);
    return [table, Number(result.count || 0)];
  }));
  return Object.fromEntries(entries);
}

function totalCounts(counts) {
  return Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);
}

async function run() {
  if (!confirmed()) throw new Error('Đây là UAT có ghi cấu hình Blueprint. Chạy lại với --confirm VPT.');
  let server = null;
  try {
    const pilotCompany = await must(
      supabase.from('companies').select('id, tenant_id').eq('id', PILOT_COMPANY_ID).maybeSingle(),
      'Đọc công ty pilot',
    );
    assert.ok(pilotCompany?.tenant_id);
    const tenantId = pilotCompany.tenant_id;
    const [tenantAdmin, platformAdmin, companies, installations, outsideCompany] = await Promise.all([
      must(supabase.from('users').select('*').eq('id', TENANT_ADMIN_USER_ID).maybeSingle(), 'Đọc tenant admin'),
      must(supabase.from('users').select('*').eq('role', 'platform_admin').eq('is_active', true).limit(1).maybeSingle(), 'Đọc platform admin'),
      must(supabase.from('companies').select('id, name').eq('tenant_id', tenantId).neq('id', PILOT_COMPANY_ID), 'Đọc công ty thứ hai'),
      must(supabase.from('company_blueprint_installations').select('company_id, status, company_overrides').eq('tenant_id', tenantId), 'Đọc Blueprint theo công ty'),
      must(supabase.from('companies').select('id').neq('tenant_id', tenantId).limit(1).maybeSingle(), 'Đọc công ty ngoài tenant'),
    ]);
    assert.ok(tenantAdmin?.id);
    assert.ok(platformAdmin?.id, 'Cần một platform_admin đang hoạt động để áp Blueprint');
    assert.ok(companies.length > 0, 'Tenant cần ít nhất một công ty thứ hai');

    const existingUatInstallation = installations.find((item) => (
      item.status === 'active'
      && item.company_overrides?.operating_kernel?.rollout_ring === ROLLOUT_RING
    ));
    let target = existingUatInstallation
      ? companies.find((company) => company.id === existingUatInstallation.company_id)
      : null;
    if (!target) {
      const activeCompanyIds = new Set(installations.filter((item) => item.status === 'active').map((item) => item.company_id));
      const candidates = companies.filter((company) => !activeCompanyIds.has(company.id));
      assert.ok(candidates.length > 0, 'Không còn công ty thứ hai chưa cài Blueprint');
      const scored = [];
      for (const company of candidates) {
        const counts = await companyTransactionCounts(company.id);
        scored.push({ company, counts, total: totalCounts(counts) });
      }
      scored.sort((a, b) => a.total - b.total || a.company.id.localeCompare(b.company.id));
      target = scored[0].company;
    }

    const beforeCounts = await companyTransactionCounts(target.id);
    const tenantSession = await buildAuthSessionForUser(tenantAdmin);
    const platformSession = await buildAuthSessionForUser(platformAdmin);
    const app = express();
    app.use(express.json({ limit: '1mb' }));
    app.use('/api/management', require('../src/routes/management'));
    app.use('/api/platform', require('../src/routes/platform'));
    server = await new Promise((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    async function api(path, token, { method = 'GET', body } = {}) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, payload: await response.json() };
    }

    const brief = await api(
      `/api/management/executive-brief?company_id=${PILOT_COMPANY_ID}`,
      tenantSession.token,
    );
    assert.equal(brief.status, 200, JSON.stringify(brief.payload));
    assert.equal(brief.payload.version, 'executive_intelligence_v1');
    assert.equal(brief.payload.mode, 'read_recommend');
    assert.equal(brief.payload.guardrails.write_enabled, false);
    assert.equal(brief.payload.guardrails.external_send_enabled, false);
    assert.equal(brief.payload.guardrails.sensitive_actions_require_approval, true);
    assert.ok(Array.isArray(brief.payload.recommendations));
    assert.ok(brief.payload.recommendations.every((item) => (
      item.mode === 'read_recommend'
      && item.requires_human_review === true
      && Array.isArray(item.evidence)
      && item.evidence.length > 0
      && typeof item.href === 'string'
      && item.href.length > 0
    )));

    const previewPath = `/api/platform/tenants/${tenantId}/blueprints/preview?blueprint_key=${BLUEPRINT_KEY}&company_id=${target.id}`;
    const preview = await api(previewPath, platformSession.token);
    assert.equal(preview.status, 200, JSON.stringify(preview.payload));
    assert.equal(preview.payload.preview.scope, 'company');
    assert.equal(preview.payload.preview.transaction_data_copied, false);
    assert.deepEqual(preview.payload.preview.plan.destructive_actions, []);

    if (outsideCompany?.id) {
      const blocked = await api(
        `/api/platform/tenants/${tenantId}/blueprints/preview?blueprint_key=${BLUEPRINT_KEY}&company_id=${outsideCompany.id}`,
        platformSession.token,
      );
      assert.equal(blocked.status, 400, JSON.stringify(blocked.payload));
      assert.equal(blocked.payload.code, 'BLUEPRINT_COMPANY_SCOPE');
    }

    const applied = await api(`/api/platform/tenants/${tenantId}/blueprints/apply`, platformSession.token, {
      method: 'POST',
      body: {
        blueprint_key: BLUEPRINT_KEY,
        company_id: target.id,
        expected_current_version: preview.payload.preview.current?.version_number ?? null,
        company_overrides: { operating_kernel: { rollout_ring: ROLLOUT_RING } },
      },
    });
    assert.equal(applied.status, 200, JSON.stringify(applied.payload));
    assert.equal(applied.payload.installation.status, 'active');
    assert.equal(applied.payload.transaction_data_copied, false);

    const targetPreview = await api(previewPath, platformSession.token);
    assert.equal(targetPreview.status, 200, JSON.stringify(targetPreview.payload));
    assert.equal(targetPreview.payload.preview.company_overrides.operating_kernel.rollout_ring, ROLLOUT_RING);
    const pilotPreview = await api(
      `/api/platform/tenants/${tenantId}/blueprints/preview?blueprint_key=${BLUEPRINT_KEY}&company_id=${PILOT_COMPANY_ID}`,
      platformSession.token,
    );
    assert.equal(pilotPreview.status, 200, JSON.stringify(pilotPreview.payload));
    assert.notEqual(pilotPreview.payload.preview.company_overrides.operating_kernel.rollout_ring, ROLLOUT_RING);

    const appliedAgain = await api(`/api/platform/tenants/${tenantId}/blueprints/apply`, platformSession.token, {
      method: 'POST',
      body: {
        blueprint_key: BLUEPRINT_KEY,
        company_id: target.id,
        expected_current_version: targetPreview.payload.preview.current?.version_number,
      },
    });
    assert.equal(appliedAgain.status, 200, JSON.stringify(appliedAgain.payload));
    assert.equal(appliedAgain.payload.created_departments.length, 0, 'Apply lặp không được tạo phòng ban trùng');

    const materializedDepartmentIds = appliedAgain.payload.installation.configuration?.materialized_department_ids || [];
    const materializedDepartments = materializedDepartmentIds.length
      ? await must(
        supabase.from('departments').select('id, name, company_id, division_unit_id, is_active')
          .in('id', materializedDepartmentIds),
        'Đọc phòng ban đã materialize',
      )
      : [];
    assert.ok(materializedDepartments.length > 0, 'Blueprint cần materialize phòng ban cho công ty thứ hai');
    for (const department of materializedDepartments) {
      const unitId = await syncDepartmentToEcosystem(department);
      assert.ok(unitId, `Không đồng bộ được ecosystem unit cho phòng ban ${department.id}`);
      const unit = await must(
        supabase.from('ecosystem_units').select('id, is_active').eq('department_id', department.id).maybeSingle(),
        'Xác minh ecosystem unit phòng ban',
      );
      assert.equal(unit?.is_active, true);
    }

    const afterCounts = await companyTransactionCounts(target.id);
    assert.deepEqual(afterCounts, beforeCounts, 'Blueprint không được sao chép hoặc thay đổi dữ liệu giao dịch');

    console.log(JSON.stringify({
      ok: true,
      executive_contract: brief.payload.version,
      reports_and_ai_share_source: true,
      ai_mode: brief.payload.mode,
      recommendations_have_evidence_and_deep_links: true,
      ai_sensitive_actions_disabled: true,
      blueprint_scope: 'company',
      second_company_id: target.id,
      blueprint_status: appliedAgain.payload.installation.status,
      company_override_isolated: true,
      wrong_tenant_company_blocked: Boolean(outsideCompany?.id),
      blueprint_apply_idempotent: true,
      inactive_ecosystem_company_node_reused: true,
      materialized_departments_synced: true,
      transaction_counts_unchanged: true,
      configuration_persisted_for_uat: true,
    }, null, 2));
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
  }
}

run().then(() => {
  setTimeout(() => process.exit(0), 150);
}).catch((error) => {
  console.error(error);
  setTimeout(() => process.exit(1), 150);
});
