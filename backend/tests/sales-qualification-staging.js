/**
 * Smoke test staging thật cho pilot Lead → Qualification → Deal.
 *
 * An toàn:
 * - Chỉ chạy khi truyền `--confirm ABC`.
 * - Chỉ tạo dữ liệu có tiền tố [STAGING] trong đúng company ABC.
 * - Luôn dọn fixture trong finally; app setting pilot được giữ nguyên.
 */
const assert = require('assert/strict');
const express = require('express');
const { supabase } = require('../src/config/supabase');
const { buildAuthSessionForUser } = require('../src/helpers/authSession');
const { isSalesPilotCompany } = require('../src/helpers/salesQualificationPilot');

const COMPANY_ID = 'b7cb0688-8e4d-46e5-a8e0-694c6b57c1b4';
const ADMIN_USER_ID = '17606212-3b26-4f5b-aa80-81528784ec46';
const PIPELINE_ID = '2a0f9435-f8f9-44c3-87ac-e434b53f244f';

function confirmed() {
  const index = process.argv.indexOf('--confirm');
  return index >= 0 && process.argv[index + 1] === 'ABC';
}

async function mustQuery(promise, label) {
  const result = await promise;
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function run() {
  if (!confirmed()) {
    throw new Error('Đây là kiểm thử dữ liệu thật. Chạy lại với --confirm ABC.');
  }

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const fixture = {
    customerId: null,
    regionId: null,
    leadId: null,
    server: null,
  };

  async function cleanup() {
    if (fixture.server) {
      await new Promise((resolve) => fixture.server.close(resolve));
      fixture.server = null;
    }

    if (fixture.leadId) {
      const cleanupTargets = [
        ['work_audit_logs', 'entity_id'],
        ['work_outbox_events', 'aggregate_id'],
        ['work_command_receipts', 'resource_id'],
        ['notifications', 'entity_id'],
        ['crm_kpi_ledger', 'lead_id'],
        ['lead_documents', 'lead_id'],
        ['crm_task_attachments', 'lead_id'],
        ['crm_tasks', 'lead_id'],
        ['crm_activities', 'lead_id'],
        ['crm_lead_stage_history', 'lead_id'],
      ];
      for (const [table, column] of cleanupTargets) {
        await supabase.from(table).delete().eq(column, fixture.leadId);
      }
      await supabase
        .from('business_os_process_instances')
        .delete()
        .eq('record_type', 'crm_lead')
        .eq('record_id', fixture.leadId);

      const { error: leadDeleteError } = await supabase
        .from('crm_leads')
        .delete()
        .eq('id', fixture.leadId);
      if (leadDeleteError) throw new Error(`Dọn lead staging thất bại: ${leadDeleteError.message}`);
    }

    if (fixture.customerId) {
      const { error } = await supabase.from('customers').delete().eq('id', fixture.customerId);
      if (error) throw new Error(`Dọn customer staging thất bại: ${error.message}`);
    }

    if (fixture.regionId) {
      await supabase.from('user_company_regions').delete().eq('region_id', fixture.regionId);
      const { error } = await supabase.from('company_regions').delete().eq('id', fixture.regionId);
      if (error) throw new Error(`Dọn region staging thất bại: ${error.message}`);
    }
  }

  try {
    const pilot = await isSalesPilotCompany(COMPANY_ID);
    assert.equal(pilot.enabled, true, 'Pilot phải được bật cho ABC trước khi smoke test');
    const otherCompany = await isSalesPilotCompany('00000000-0000-4000-8000-000000000001');
    assert.equal(otherCompany.enabled, false, 'Pilot phải tắt với công ty ngoài ABC');

    const admin = await mustQuery(
      supabase.from('users').select('*').eq('id', ADMIN_USER_ID).maybeSingle(),
      'Đọc admin ABC',
    );
    assert.ok(admin?.is_active !== false, 'Admin ABC phải đang hoạt động');
    assert.equal(admin?.company_id, COMPANY_ID, 'Admin phải thuộc ABC');

    const stages = await mustQuery(
      supabase
        .from('crm_pipeline_stages')
        .select('id, name, pipeline_type, order_index, is_active')
        .eq('pipeline_id', PIPELINE_ID)
        .eq('is_active', true)
        .order('order_index'),
      'Đọc pipeline ABC',
    );
    const leadStage = stages.find((stage) => stage.pipeline_type === 'lead');
    const dealStage = stages.find((stage) => stage.pipeline_type === 'deal');
    assert.ok(leadStage, 'Pipeline ABC cần ít nhất một cột Lead');
    assert.ok(dealStage, 'Pipeline ABC cần ít nhất một cột Deal');

    const region = await mustQuery(
      supabase
        .from('company_regions')
        .insert({
          company_id: COMPANY_ID,
          name: `[STAGING] Qualification ${suffix}`,
          code: `STG-${suffix}`.slice(0, 48),
          order_index: 9999,
          is_active: true,
        })
        .select('id')
        .single(),
      'Tạo region staging',
    );
    fixture.regionId = region.id;

    await mustQuery(
      supabase
        .from('user_company_regions')
        .upsert({ user_id: ADMIN_USER_ID, region_id: fixture.regionId }, { onConflict: 'user_id,region_id' })
        .select('user_id, region_id'),
      'Gán admin vào region staging',
    );

    const customer = await mustQuery(
      supabase
        .from('customers')
        .insert({
          full_name: `[STAGING] Khách Qualification ${suffix}`,
          phone: `090${String(Date.now()).slice(-7)}`,
          address: null,
          company_id: COMPANY_ID,
          notes: 'Fixture tự động — sẽ được xóa sau kiểm thử',
        })
        .select('id, phone')
        .single(),
      'Tạo customer staging',
    );
    fixture.customerId = customer.id;

    const lead = await mustQuery(
      supabase
        .from('crm_leads')
        .insert({
          code: `STG-BOS-${suffix}`.slice(0, 64),
          title: `[STAGING] Lead → Qualification → Deal ${suffix}`,
          type: 'lead',
          pipeline_id: PIPELINE_ID,
          stage_id: leadStage.id,
          company_id: COMPANY_ID,
          customer_id: fixture.customerId,
          region_id: fixture.regionId,
          assigned_to: ADMIN_USER_ID,
          lead_owner_id: ADMIN_USER_ID,
          phone: customer.phone,
          description: null,
          estimated_value: 0,
          expected_construction_time: null,
          install_address: null,
          created_by: ADMIN_USER_ID,
        })
        .select('id')
        .single(),
      'Tạo lead staging',
    );
    fixture.leadId = lead.id;

    const session = await buildAuthSessionForUser(admin);
    const app = express();
    app.use(express.json({ limit: '1mb' }));
    app.use('/api/crm', require('../src/routes/crm'));
    app.use((error, _req, res, _next) => {
      res.status(500).json({ error: error.message });
    });

    fixture.server = await new Promise((resolve) => {
      const server = app.listen(0, '127.0.0.1', () => resolve(server));
    });
    const { port } = fixture.server.address();
    const baseUrl = `http://127.0.0.1:${port}/api/crm`;

    async function api(path, { method = 'GET', body, idempotencyKey } = {}) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${session.token}`,
          'Content-Type': 'application/json',
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
          'X-Request-Id': `staging-${suffix}`,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const raw = await response.text();
      let data = null;
      try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
      return { status: response.status, data };
    }

    const initial = await api(`/leads/${fixture.leadId}/qualification`);
    assert.equal(initial.status, 200, JSON.stringify(initial.data));
    assert.equal(initial.data.enabled, true);
    assert.equal(initial.data.instance.current_stage_key, 'lead');
    assert.equal(initial.data.readiness.ready, false);
    assert.equal(initial.data.readiness.total_requirements, 4);

    const startKey = `staging-start-${suffix}`;
    const started = await api(`/leads/${fixture.leadId}/qualification/start`, {
      method: 'POST',
      body: {},
      idempotencyKey: startKey,
    });
    assert.equal(started.status, 200, JSON.stringify(started.data));
    assert.equal(started.data.instance.current_stage_key, 'qualification');
    assert.ok(started.data.instance.sla_due_at, 'Qualification phải có SLA');
    assert.equal(started.data.instance.storage_mode, 'work_kernel_compat');

    const startedAgain = await api(`/leads/${fixture.leadId}/qualification/start`, {
      method: 'POST',
      body: {},
      idempotencyKey: startKey,
    });
    assert.equal(startedAgain.status, 200, JSON.stringify(startedAgain.data));
    const startEvents = await mustQuery(
      supabase
        .from('work_audit_logs')
        .select('id')
        .eq('entity_id', fixture.leadId)
        .eq('action', 'sales.qualification.started'),
      'Kiểm tra idempotency start',
    );
    assert.equal(startEvents.length, 1, 'Gửi lại cùng command không được tạo event thứ hai');

    const incomplete = await api(`/leads/${fixture.leadId}/qualification/complete`, {
      method: 'POST',
      body: {},
      idempotencyKey: `staging-incomplete-${suffix}`,
    });
    assert.equal(incomplete.status, 409, JSON.stringify(incomplete.data));
    assert.equal(incomplete.data.code, 'BUSINESS_OS_QUALIFICATION_INCOMPLETE');

    const patched = await api(`/leads/${fixture.leadId}`, {
      method: 'PUT',
      body: {
        description: 'Khách cần thiết kế và thi công tủ bếp căn hộ mới.',
        estimated_value: 180000000,
        expected_construction_time: '1_2m',
        install_address: 'Căn hộ staging, Thành phố Hồ Chí Minh',
      },
    });
    assert.equal(patched.status, 200, JSON.stringify(patched.data));

    const blockingTask = await mustQuery(
      supabase
        .from('crm_tasks')
        .insert({
          lead_id: fixture.leadId,
          title: `[STAGING] Task chặn Qualification ${suffix}`,
          status: 'pending',
          priority: 'high',
          blocks_stage_advance: true,
          assignee_id: ADMIN_USER_ID,
          created_by: ADMIN_USER_ID,
        })
        .select('id')
        .single(),
      'Tạo task chặn staging',
    );

    const taskBlocked = await api(`/leads/${fixture.leadId}/qualification`);
    assert.equal(taskBlocked.status, 200, JSON.stringify(taskBlocked.data));
    assert.equal(taskBlocked.data.readiness.ready, false);
    assert.equal(taskBlocked.data.readiness.blocking_tasks.length, 1);

    const blockedComplete = await api(`/leads/${fixture.leadId}/qualification/complete`, {
      method: 'POST',
      body: {},
      idempotencyKey: `staging-task-blocked-${suffix}`,
    });
    assert.equal(blockedComplete.status, 409, JSON.stringify(blockedComplete.data));
    assert.equal(blockedComplete.data.code, 'BUSINESS_OS_QUALIFICATION_INCOMPLETE');

    await mustQuery(
      supabase
        .from('crm_tasks')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', blockingTask.id)
        .select('id'),
      'Hoàn thành task chặn staging',
    );

    const ready = await api(`/leads/${fixture.leadId}/qualification`);
    assert.equal(ready.status, 200, JSON.stringify(ready.data));
    assert.equal(ready.data.readiness.ready, true, JSON.stringify(ready.data.readiness));

    const completeKey = `staging-complete-${suffix}`;
    const completed = await api(`/leads/${fixture.leadId}/qualification/complete`, {
      method: 'POST',
      body: {},
      idempotencyKey: completeKey,
    });
    assert.equal(completed.status, 200, JSON.stringify(completed.data));
    assert.equal(completed.data.instance.current_stage_key, 'qualified');
    assert.ok(completed.data.instance.qualified_at);
    assert.ok(completed.data.instance.sla_due_at, 'SLA phải được giữ sau khi qualification hoàn tất');

    const converted = await api(`/leads/${fixture.leadId}/convert-to-deal`, {
      method: 'POST',
      body: {
        company_id: COMPANY_ID,
        pipeline_id: PIPELINE_ID,
        region_id: fixture.regionId,
        assigned_to: ADMIN_USER_ID,
      },
      idempotencyKey: `staging-convert-${suffix}`,
    });
    assert.equal(converted.status, 200, JSON.stringify(converted.data));
    assert.equal(converted.data.lead.type, 'deal');

    const convertedAgain = await api(`/leads/${fixture.leadId}/convert-to-deal`, {
      method: 'POST',
      body: {
        company_id: COMPANY_ID,
        pipeline_id: PIPELINE_ID,
        region_id: fixture.regionId,
        assigned_to: ADMIN_USER_ID,
      },
      idempotencyKey: `staging-convert-${suffix}`,
    });
    assert.equal(convertedAgain.status, 200, JSON.stringify(convertedAgain.data));
    assert.equal(convertedAgain.data.idempotent, true);

    const finalState = await api(`/leads/${fixture.leadId}/qualification`);
    assert.equal(finalState.status, 200, JSON.stringify(finalState.data));
    assert.equal(finalState.data.instance.current_stage_key, 'deal');
    assert.equal(finalState.data.instance.status, 'completed');
    assert.ok(finalState.data.instance.converted_at);

    const events = await mustQuery(
      supabase
        .from('work_audit_logs')
        .select('action, after, created_at')
        .eq('company_id', COMPANY_ID)
        .eq('entity_type', 'business_os_sales_process')
        .eq('entity_id', fixture.leadId)
        .order('created_at'),
      'Đọc event staging',
    );
    assert.deepEqual(
      events.map((event) => event.action),
      [
        'sales.qualification.started',
        'sales.qualification.completed',
        'sales.lead.converted_to_deal',
      ],
    );

    console.log(JSON.stringify({
      ok: true,
      company: 'ABC',
      flow: 'Lead → Qualification → Deal',
      storage_mode: finalState.data.instance.storage_mode,
      requirements: `${ready.data.readiness.completed_requirements}/${ready.data.readiness.total_requirements}`,
      event_count: events.length,
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
