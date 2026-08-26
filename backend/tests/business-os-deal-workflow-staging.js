/** UAT có ghi tạm cho Deal -> Survey -> Design; mọi fixture được dọn trong finally. */
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
  const fixture = { server: null, customerId: null, leadId: null, processInstanceId: null };

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
  }

  try {
    const admin = await must(supabase.from('users').select('*').eq('id', ADMIN_USER_ID).maybeSingle(), 'Đọc admin VPT');
    const pipeline = await must(
      supabase.from('crm_pipelines').select('id').eq('company_id', COMPANY_ID).eq('is_active', true).order('created_at').limit(1).maybeSingle(),
      'Đọc pipeline VPT',
    );
    assert.ok(pipeline?.id);
    const stage = await must(
      supabase.from('crm_pipeline_stages').select('id').eq('pipeline_id', pipeline.id).eq('pipeline_type', 'deal').eq('is_active', true).order('order_index').limit(1).maybeSingle(),
      'Đọc Deal stage VPT',
    );
    assert.ok(stage?.id);
    const region = await must(
      supabase.from('company_regions').select('id').eq('company_id', COMPANY_ID).eq('is_active', true).order('order_index').limit(1).maybeSingle(),
      'Đọc region VPT',
    );
    assert.ok(region?.id);
    const customer = await must(
      supabase.from('customers').insert({
        company_id: COMPANY_ID,
        full_name: `[STAGING] Deal workflow ${suffix}`,
        phone: `088${String(Date.now()).slice(-7)}`,
        notes: 'Fixture Deal workflow — tự xóa sau UAT',
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
        code: `STG-DSD-${suffix}`.slice(0, 64),
        title: `[STAGING] Deal Survey Design ${suffix}`,
        type: 'deal',
        phone: customer.phone,
        assigned_to: ADMIN_USER_ID,
        lead_owner_id: ADMIN_USER_ID,
        description: 'Fixture kiểm thử Deal → Khảo sát → Thiết kế.',
        created_by: ADMIN_USER_ID,
      }).select('id').single(),
      'Tạo Deal fixture',
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
      return { status: response.status, payload: await response.json() };
    }

    const initial = await api(`/api/crm/leads/${fixture.leadId}/deal-workflow`);
    assert.equal(initial.status, 200, JSON.stringify(initial.payload));
    assert.equal(initial.payload.instance.current_stage_key, 'deal');
    assert.equal(initial.payload.automations.survey.task_items.length, 3);
    assert.equal(initial.payload.automations.design.task_items.length, 3);

    const startKey = `staging-survey-start-${suffix}`;
    const started = await api(`/api/crm/leads/${fixture.leadId}/deal-workflow/start-survey`, { method: 'POST', body: {}, idempotencyKey: startKey });
    assert.equal(started.status, 200, JSON.stringify(started.payload));
    assert.equal(started.payload.instance.current_stage_key, 'survey');
    const startedAgain = await api(`/api/crm/leads/${fixture.leadId}/deal-workflow/start-survey`, { method: 'POST', body: {}, idempotencyKey: startKey });
    assert.equal(startedAgain.status, 200, JSON.stringify(startedAgain.payload));

    const surveyTasks = await must(
      supabase.from('crm_tasks').select('id, status, blocks_stage_advance, completion_requires_file_or_note, requires_quick_verdict')
        .eq('lead_id', fixture.leadId).eq('business_os_stage_key', 'survey'),
      'Đọc task Khảo sát',
    );
    assert.equal(surveyTasks.length, 3, 'Start lặp không được sinh task Khảo sát trùng');
    const blockedSurvey = await api(`/api/crm/leads/${fixture.leadId}/deal-workflow/complete-survey`, { method: 'POST', body: {}, idempotencyKey: `blocked-survey-${suffix}` });
    assert.equal(blockedSurvey.status, 409, JSON.stringify(blockedSurvey.payload));

    await must(
      supabase.from('crm_tasks').update({ status: 'completed', notes: 'UAT: đã có minh chứng khảo sát', quick_verdict: 'sufficient', quick_verdict_at: new Date().toISOString(), quick_verdict_by: ADMIN_USER_ID }).in('id', surveyTasks.map((task) => task.id)).select('id'),
      'Hoàn tất task Khảo sát fixture',
    );
    const completedSurvey = await api(`/api/crm/leads/${fixture.leadId}/deal-workflow/complete-survey`, { method: 'POST', body: {}, idempotencyKey: `complete-survey-${suffix}` });
    assert.equal(completedSurvey.status, 200, JSON.stringify(completedSurvey.payload));
    assert.equal(completedSurvey.payload.instance.current_stage_key, 'design');

    const designTasks = await must(
      supabase.from('crm_tasks').select('id').eq('lead_id', fixture.leadId).eq('business_os_stage_key', 'design'),
      'Đọc task Thiết kế',
    );
    assert.equal(designTasks.length, 3);
    const blockedDesign = await api(`/api/crm/leads/${fixture.leadId}/deal-workflow/complete-design`, { method: 'POST', body: {}, idempotencyKey: `blocked-design-${suffix}` });
    assert.equal(blockedDesign.status, 409, JSON.stringify(blockedDesign.payload));
    await must(
      supabase.from('crm_tasks').update({ status: 'completed', notes: 'UAT: đã có file/ghi chú thiết kế', quick_verdict: 'sufficient', quick_verdict_at: new Date().toISOString(), quick_verdict_by: ADMIN_USER_ID }).in('id', designTasks.map((task) => task.id)).select('id'),
      'Hoàn tất task Thiết kế fixture',
    );
    const completedDesign = await api(`/api/crm/leads/${fixture.leadId}/deal-workflow/complete-design`, { method: 'POST', body: {}, idempotencyKey: `complete-design-${suffix}` });
    assert.equal(completedDesign.status, 200, JSON.stringify(completedDesign.payload));
    assert.equal(completedDesign.payload.instance.current_stage_key, 'design_completed');

    const instance = await must(
      supabase.from('business_os_process_instances').select('id, survey_started_at, survey_completed_at, design_started_at, design_completed_at').eq('record_id', fixture.leadId).eq('process_key', PROCESS_KEY).single(),
      'Đọc process instance hoàn tất',
    );
    fixture.processInstanceId = instance.id;
    assert.ok(instance.survey_started_at && instance.survey_completed_at && instance.design_started_at && instance.design_completed_at);

    const overview = await api(`/api/business-os/overview?company_id=${COMPANY_ID}`);
    assert.equal(overview.status, 200, JSON.stringify(overview.payload));
    const record = overview.payload.records.find((item) => item.id === fixture.leadId);
    assert.equal(record?.current_stage_key, 'design_completed');
    assert.ok(overview.payload.summary.deal_workflow_kpi.design_completed >= 1);

    console.log(JSON.stringify({
      ok: true,
      company: 'Công ty TNHH Bếp Vạn Phú Thành',
      survey_tasks_created_once: true,
      survey_gate_enforced: true,
      design_tasks_created: true,
      design_gate_enforced: true,
      lifecycle_timestamps_persisted: true,
      overview_kpi_connected: true,
      fixture_cleanup: 'pending',
    }, null, 2));
  } finally {
    await cleanup();
    console.log(JSON.stringify({ fixture_cleanup: 'completed' }));
  }
}

run().then(() => process.exit(0)).catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
