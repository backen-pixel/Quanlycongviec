/**
 * UAT có ghi tạm: Qualification task template + SLA escalation + KPI funnel.
 * Chỉ chạy với --confirm VPT; mọi fixture được dọn trong finally.
 */
const assert = require('node:assert/strict');
const express = require('express');
const { supabase } = require('../src/config/supabase');
const { buildAuthSessionForUser } = require('../src/helpers/authSession');

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
  const taskKey = `staging_qualification_${String(Date.now()).slice(-10)}`;
  const fixture = {
    server: null,
    customerId: null,
    leadId: null,
    processInstanceId: null,
    automationId: null,
    originalAutomation: null,
    originalItems: [],
    originalVersionIds: new Set(),
    originalAuditIds: new Set(),
  };

  async function cleanup() {
    if (fixture.server) {
      await new Promise((resolve) => fixture.server.close(resolve));
      fixture.server = null;
    }
    if (fixture.leadId) {
      await supabase.from('notifications').delete().eq('entity_type', 'crm_lead').eq('entity_id', fixture.leadId);
      await supabase.from('business_os_sla_escalations').delete().eq('record_id', fixture.leadId);
      await supabase.from('work_command_receipts').delete().eq('resource_id', fixture.leadId);
      await supabase.from('work_audit_logs').delete().eq('entity_id', fixture.leadId);
      await supabase.from('audit_log').delete().eq('entity_id', fixture.leadId);
      await supabase.from('work_outbox_events').delete().eq('aggregate_id', fixture.leadId);
      if (fixture.processInstanceId) {
        await supabase.from('work_audit_logs').delete().eq('entity_id', fixture.processInstanceId);
        await supabase.from('work_outbox_events').delete().eq('aggregate_id', fixture.processInstanceId);
      }
      await supabase.from('business_os_process_instances').delete().eq('record_type', 'crm_lead').eq('record_id', fixture.leadId);
      await supabase.from('crm_tasks').delete().eq('lead_id', fixture.leadId);
      await supabase.from('crm_leads').delete().eq('id', fixture.leadId);
    }
    if (fixture.customerId) await supabase.from('customers').delete().eq('id', fixture.customerId);

    if (fixture.automationId) {
      const { data: versions } = await supabase
        .from('business_os_stage_automation_versions')
        .select('id')
        .eq('automation_id', fixture.automationId);
      const createdVersionIds = (versions || [])
        .map((row) => row.id)
        .filter((id) => !fixture.originalVersionIds.has(id));
      if (createdVersionIds.length) {
        await supabase.from('business_os_stage_automation_versions').delete().in('id', createdVersionIds);
      }
      const { data: audits } = await supabase
        .from('work_audit_logs')
        .select('id')
        .eq('entity_type', 'business_os_stage_automation')
        .eq('entity_id', fixture.automationId);
      const createdAuditIds = (audits || [])
        .map((row) => row.id)
        .filter((id) => !fixture.originalAuditIds.has(id));
      if (createdAuditIds.length) await supabase.from('work_audit_logs').delete().in('id', createdAuditIds);
      await supabase.from('business_os_stage_task_template_items').delete().eq('automation_id', fixture.automationId);
      if (fixture.originalAutomation) {
        if (fixture.originalItems.length) {
          await must(
            supabase.from('business_os_stage_task_template_items').insert(fixture.originalItems),
            'Khôi phục task template gốc',
          );
        }
        await must(
          supabase.from('business_os_stage_automations').update({
            name: fixture.originalAutomation.name,
            sla_duration_minutes: fixture.originalAutomation.sla_duration_minutes,
            sla_warning_minutes: fixture.originalAutomation.sla_warning_minutes,
            escalate_at_risk_to_owner: fixture.originalAutomation.escalate_at_risk_to_owner,
            escalate_overdue_to_owner: fixture.originalAutomation.escalate_overdue_to_owner,
            escalate_overdue_to_company_admins: fixture.originalAutomation.escalate_overdue_to_company_admins,
            is_active: fixture.originalAutomation.is_active,
            version: fixture.originalAutomation.version,
            created_by: fixture.originalAutomation.created_by,
            updated_by: fixture.originalAutomation.updated_by,
            created_at: fixture.originalAutomation.created_at,
            updated_at: fixture.originalAutomation.updated_at,
          }).eq('id', fixture.automationId),
          'Khôi phục automation gốc',
        );
      } else {
        await supabase.from('business_os_stage_automations').delete().eq('id', fixture.automationId);
      }
    }
  }

  try {
    const admin = await must(
      supabase.from('users').select('*').eq('id', ADMIN_USER_ID).maybeSingle(),
      'Đọc admin VPT',
    );
    assert.equal(admin?.tenant_id, '7d42e731-895b-4ba8-99d6-0005c4e23544');

    const originalAutomation = await must(
      supabase.from('business_os_stage_automations').select('*')
        .eq('company_id', COMPANY_ID).eq('process_key', PROCESS_KEY).eq('stage_key', 'qualification').maybeSingle(),
      'Đọc automation gốc',
    );
    fixture.originalAutomation = originalAutomation || null;
    fixture.automationId = originalAutomation?.id || null;
    if (fixture.automationId) {
      fixture.originalItems = await must(
        supabase.from('business_os_stage_task_template_items').select('*').eq('automation_id', fixture.automationId),
        'Đọc task template gốc',
      );
      const versions = await must(
        supabase.from('business_os_stage_automation_versions').select('id').eq('automation_id', fixture.automationId),
        'Đọc version gốc',
      );
      fixture.originalVersionIds = new Set((versions || []).map((row) => row.id));
      const audits = await must(
        supabase.from('work_audit_logs').select('id')
          .eq('entity_type', 'business_os_stage_automation').eq('entity_id', fixture.automationId),
        'Đọc audit gốc',
      );
      fixture.originalAuditIds = new Set((audits || []).map((row) => row.id));
    }

    const pipeline = await must(
      supabase.from('crm_pipelines').select('id').eq('company_id', COMPANY_ID).eq('is_active', true).order('created_at').limit(1).maybeSingle(),
      'Đọc pipeline VPT',
    );
    assert.ok(pipeline?.id, 'VPT cần pipeline CRM đang hoạt động');
    const stage = await must(
      supabase.from('crm_pipeline_stages').select('id').eq('pipeline_id', pipeline.id).eq('pipeline_type', 'lead').eq('is_active', true).order('order_index').limit(1).maybeSingle(),
      'Đọc Lead stage VPT',
    );
    assert.ok(stage?.id, 'VPT cần Lead stage đang hoạt động');
    const region = await must(
      supabase.from('company_regions').select('id').eq('company_id', COMPANY_ID).eq('is_active', true).order('order_index').limit(1).maybeSingle(),
      'Đọc region VPT',
    );
    assert.ok(region?.id, 'VPT cần region đang hoạt động');

    const customer = await must(
      supabase.from('customers').insert({
        company_id: COMPANY_ID,
        full_name: `[STAGING] Automation ${suffix}`,
        phone: `089${String(Date.now()).slice(-7)}`,
        notes: 'Fixture automation — tự xóa sau UAT',
      }).select('id, phone').single(),
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
        code: `STG-AUTO-${suffix}`.slice(0, 64),
        title: `[STAGING] Qualification automation ${suffix}`,
        type: 'lead',
        phone: customer.phone,
        assigned_to: ADMIN_USER_ID,
        lead_owner_id: ADMIN_USER_ID,
        description: 'Khách staging cần xác minh task template và SLA.',
        created_by: ADMIN_USER_ID,
      }).select('id').single(),
      'Tạo Lead fixture',
    );
    fixture.leadId = lead.id;

    const session = await buildAuthSessionForUser(admin);
    const app = express();
    app.use(express.json({ limit: '1mb' }));
    app.use('/api/business-os', require('../src/routes/businessOs'));
    app.use('/api/crm', require('../src/routes/crm'));
    fixture.server = await new Promise((resolve) => {
      const server = app.listen(0, '127.0.0.1', () => resolve(server));
    });
    const baseUrl = `http://127.0.0.1:${fixture.server.address().port}`;
    async function api(path, { method = 'GET', body, idempotencyKey } = {}) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${session.token}`,
          'Content-Type': 'application/json',
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const payload = await response.json();
      return { status: response.status, payload };
    }

    const saved = await api('/api/business-os/qualification-automation', {
      method: 'PUT',
      body: {
        company_id: COMPANY_ID,
        automation: {
          name: `[STAGING] Qualification automation ${suffix}`,
          sla_policy: {
            duration_minutes: 60,
            warning_minutes: 60,
            escalate_at_risk_to_owner: true,
            escalate_overdue_to_owner: true,
            escalate_overdue_to_company_admins: true,
          },
          task_items: [{
            item_key: taskKey,
            title: `[STAGING] Xác minh Qualification ${suffix}`,
            description: 'Task fixture phải được tạo đúng một lần.',
            priority: 'high',
            deadline_minutes: 30,
            assignment_strategy: 'record_owner',
            blocks_stage_advance: true,
            requires_quick_verdict: false,
          }],
        },
      },
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.payload));
    fixture.automationId = saved.payload.automation.id;
    assert.equal(saved.payload.automation.task_items.length, 1);

    const startKey = `staging-automation-start-${suffix}`;
    const started = await api(`/api/crm/leads/${fixture.leadId}/qualification/start`, {
      method: 'POST',
      body: {},
      idempotencyKey: startKey,
    });
    assert.equal(started.status, 200, JSON.stringify(started.payload));
    assert.equal(started.payload.instance.current_stage_key, 'qualification');
    assert.equal(started.payload.automation.version, saved.payload.automation.version);

    const startedAgain = await api(`/api/crm/leads/${fixture.leadId}/qualification/start`, {
      method: 'POST',
      body: {},
      idempotencyKey: startKey,
    });
    assert.equal(startedAgain.status, 200, JSON.stringify(startedAgain.payload));
    const generatedTasks = await must(
      supabase.from('crm_tasks').select('id, title, deadline, blocks_stage_advance, business_os_template_item_key')
        .eq('lead_id', fixture.leadId).eq('business_os_template_item_key', taskKey),
      'Đọc task sinh từ automation',
    );
    assert.equal(generatedTasks.length, 1, 'Gọi start lặp không được sinh task trùng');
    assert.equal(generatedTasks[0].blocks_stage_advance, true);
    assert.ok(generatedTasks[0].deadline);

    const instance = await must(
      supabase.from('business_os_process_instances').select('id').eq('record_id', fixture.leadId).eq('process_key', PROCESS_KEY).single(),
      'Đọc process instance',
    );
    fixture.processInstanceId = instance.id;
    await must(
      supabase.from('business_os_process_instances')
        .update({ sla_due_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() })
        .eq('id', fixture.processInstanceId)
        .select('id'),
      'Đặt SLA fixture vào vùng at-risk',
    );

    const evaluated = await api('/api/business-os/qualification-sla/evaluate', {
      method: 'POST',
      body: { company_id: COMPANY_ID },
    });
    assert.equal(evaluated.status, 200, JSON.stringify(evaluated.payload));
    const evaluatedAgain = await api('/api/business-os/qualification-sla/evaluate', {
      method: 'POST',
      body: { company_id: COMPANY_ID },
    });
    assert.equal(evaluatedAgain.status, 200, JSON.stringify(evaluatedAgain.payload));
    const escalations = await must(
      supabase.from('business_os_sla_escalations').select('id, level, recipient_user_id, notification_id').eq('record_id', fixture.leadId),
      'Đọc SLA escalation',
    );
    assert.equal(escalations.length, 1, 'At-risk escalation cho owner phải được dedupe');
    assert.equal(escalations[0].level, 'at_risk');
    assert.equal(escalations[0].recipient_user_id, ADMIN_USER_ID);
    assert.ok(escalations[0].notification_id);

    const overview = await api(`/api/business-os/overview?company_id=${COMPANY_ID}`);
    assert.equal(overview.status, 200, JSON.stringify(overview.payload));
    const overviewRecord = overview.payload.records.find((row) => row.id === fixture.leadId);
    assert.ok(overviewRecord, 'Lead fixture phải xuất hiện trong overview dữ liệu thật');
    assert.equal(overviewRecord.current_stage_key, 'qualification');
    assert.ok(overview.payload.summary.funnel_kpi.qualification_started >= 1);
    assert.equal(overview.payload.qualification_automation.task_items.length, 1);

    console.log(JSON.stringify({
      ok: true,
      company: 'Công ty TNHH Bếp Vạn Phú Thành',
      task_created_once: true,
      task_blocks_stage: true,
      sla_internal_notification_deduped: true,
      funnel_kpi_connected: true,
      automation_version: saved.payload.automation.version,
      fixture_cleanup: 'pending',
    }, null, 2));
  } finally {
    await cleanup();
  }

  console.log(JSON.stringify({ ok: true, fixture_cleanup: 'completed', original_automation_restored: true }, null, 2));
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error.stack || error.message || error);
    process.exit(1);
  });
