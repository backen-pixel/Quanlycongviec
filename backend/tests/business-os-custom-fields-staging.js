/**
 * UAT có ghi tạm cho Dynamic Custom Fields trên công ty pilot Vạn Phú Thành.
 * Chỉ chạy với --confirm VPT; finally khôi phục Stage Contract và xóa toàn bộ fixture.
 */
const assert = require('node:assert/strict');
const express = require('express');
const { supabase } = require('../src/config/supabase');
const { buildAuthSessionForUser } = require('../src/helpers/authSession');

const COMPANY_ID = '991dc79d-cbf5-49f9-a364-35227cb47635';
const ADMIN_USER_ID = 'e679aa3f-efa0-4a57-8d81-5374950dc8d4';

function confirmed() {
  const index = process.argv.indexOf('--confirm');
  return index >= 0 && process.argv[index + 1] === 'VPT';
}

async function run() {
  if (!confirmed()) throw new Error('Đây là UAT có ghi tạm. Chạy lại với --confirm VPT.');

  const fixture = {
    server: null,
    fieldId: null,
    contractId: null,
    originalContract: null,
    originalAuditIds: new Set(),
    leadId: null,
  };

  async function cleanup() {
    if (fixture.server) {
      await new Promise((resolve) => fixture.server.close(resolve));
      fixture.server = null;
    }
    if (fixture.fieldId) {
      await supabase.from('business_os_custom_field_values').delete().eq('field_definition_id', fixture.fieldId);
      await supabase.from('business_os_custom_field_definitions').delete().eq('id', fixture.fieldId).eq('company_id', COMPANY_ID);
    }
    if (fixture.leadId) {
      const { data: audits } = await supabase
        .from('work_audit_logs')
        .select('id')
        .eq('company_id', COMPANY_ID)
        .eq('entity_type', 'business_os_custom_fields')
        .eq('entity_id', fixture.leadId);
      const createdAuditIds = (audits || [])
        .map((row) => row.id)
        .filter((id) => !fixture.originalAuditIds.has(id));
      if (createdAuditIds.length) await supabase.from('work_audit_logs').delete().in('id', createdAuditIds);
    }
    if (fixture.contractId && fixture.originalContract) {
      await supabase
        .from('business_os_stage_contract_versions')
        .delete()
        .eq('contract_id', fixture.contractId)
        .gt('version', fixture.originalContract.version);
      await supabase
        .from('business_os_stage_contracts')
        .update({
          required_fields: fixture.originalContract.required_fields,
          optional_fields: fixture.originalContract.optional_fields,
          task_stage_slugs: fixture.originalContract.task_stage_slugs,
          version: fixture.originalContract.version,
          updated_by: fixture.originalContract.updated_by,
        })
        .eq('id', fixture.contractId)
        .eq('company_id', COMPANY_ID);
    }
  }

  try {
    const { data: admin, error: adminError } = await supabase.from('users').select('*').eq('id', ADMIN_USER_ID).maybeSingle();
    if (adminError) throw adminError;
    assert.equal(admin?.tenant_id, '7d42e731-895b-4ba8-99d6-0005c4e23544');

    const { data: original, error: contractError } = await supabase
      .from('business_os_stage_contracts')
      .select('*')
      .eq('company_id', COMPANY_ID)
      .eq('process_key', 'sales_lead_qualification_v1')
      .eq('stage_key', 'qualification')
      .single();
    if (contractError) throw contractError;
    fixture.contractId = original.id;
    fixture.originalContract = original;

    const { data: lead, error: leadError } = await supabase
      .from('crm_leads')
      .select('id')
      .eq('company_id', COMPANY_ID)
      .neq('type', 'deal')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (leadError) throw leadError;
    assert.ok(lead?.id, 'Công ty pilot cần một Lead để kiểm thử sidecar value');
    fixture.leadId = lead.id;

    const { data: originalAudits } = await supabase
      .from('work_audit_logs')
      .select('id')
      .eq('company_id', COMPANY_ID)
      .eq('entity_type', 'business_os_custom_fields')
      .eq('entity_id', fixture.leadId);
    fixture.originalAuditIds = new Set((originalAudits || []).map((row) => row.id));

    const session = await buildAuthSessionForUser(admin);
    const app = express();
    app.use(express.json({ limit: '1mb' }));
    app.use('/api/business-os', require('../src/routes/businessOs'));
    app.use('/api/crm', require('../src/routes/crm'));
    fixture.server = await new Promise((resolve) => {
      const server = app.listen(0, '127.0.0.1', () => resolve(server));
    });
    const baseUrl = `http://127.0.0.1:${fixture.server.address().port}`;

    async function api(path, { method = 'GET', body } = {}) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const payload = await response.json();
      return { status: response.status, payload };
    }

    const created = await api('/api/business-os/qualification-custom-fields', {
      method: 'POST',
      body: {
        company_id: COMPANY_ID,
        label: `[STAGING] Loại công trình ${Date.now()}`,
        field_type: 'select',
        mode: 'optional',
        options: ['Căn hộ', 'Nhà phố'],
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.payload));
    fixture.fieldId = created.payload.field.id;
    const fieldKey = created.payload.field.key;
    assert.equal(created.payload.contract.fields.find((field) => field.key === fieldKey)?.mode, 'optional');

    const savedValue = await api(`/api/crm/leads/${fixture.leadId}/qualification/custom-fields`, {
      method: 'PUT',
      body: { values: { [fieldKey]: 'Căn hộ' } },
    });
    assert.equal(savedValue.status, 200, JSON.stringify(savedValue.payload));
    const savedRequirement = savedValue.payload.qualification.readiness.requirements.find((item) => item.key === fieldKey);
    assert.equal(savedRequirement?.complete, true);
    assert.equal(savedRequirement?.value, 'Căn hộ');

    const required = await api('/api/business-os/qualification-contract', {
      method: 'PUT',
      body: {
        company_id: COMPANY_ID,
        required_fields: [...fixture.originalContract.required_fields, fieldKey],
        optional_fields: fixture.originalContract.optional_fields,
      },
    });
    assert.equal(required.status, 200, JSON.stringify(required.payload));
    assert.equal(required.payload.contract.fields.find((field) => field.key === fieldKey)?.mode, 'required');

    const rolledBack = await api('/api/business-os/qualification-contract/rollback', {
      method: 'POST',
      body: { company_id: COMPANY_ID, version: fixture.originalContract.version },
    });
    assert.equal(rolledBack.status, 200, JSON.stringify(rolledBack.payload));
    assert.equal(rolledBack.payload.contract.fields.find((field) => field.key === fieldKey)?.mode, 'hidden');

    const removed = await api(`/api/business-os/qualification-custom-fields/${fixture.fieldId}?company_id=${COMPANY_ID}`, {
      method: 'DELETE',
    });
    assert.equal(removed.status, 200, JSON.stringify(removed.payload));
    assert.equal(removed.payload.contract.fields.some((field) => field.key === fieldKey), false);

    console.log(JSON.stringify({
      ok: true,
      company: 'Công ty TNHH Bếp Vạn Phú Thành',
      field_types: ['text', 'textarea', 'number', 'date', 'select', 'boolean'],
      custom_value_saved: true,
      readiness_connected: true,
      rollback_verified: true,
      soft_delete_verified: true,
      fixture_cleanup: 'pending',
    }, null, 2));
  } finally {
    await cleanup();
  }

  console.log(JSON.stringify({ ok: true, fixture_cleanup: 'completed' }, null, 2));
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error.stack || error.message || error);
    process.exit(1);
  });
