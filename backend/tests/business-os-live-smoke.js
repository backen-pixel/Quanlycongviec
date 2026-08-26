/** Read-only smoke test cho backend đang chạy tại :4000. */
const assert = require('node:assert/strict');
const { supabase } = require('../src/config/supabase');
const { buildAuthSessionForUser } = require('../src/helpers/authSession');

const COMPANY_ID = '991dc79d-cbf5-49f9-a364-35227cb47635';
const ADMIN_USER_ID = 'e679aa3f-efa0-4a57-8d81-5374950dc8d4';

async function run() {
  const { data: admin, error } = await supabase.from('users').select('*').eq('id', ADMIN_USER_ID).single();
  if (error) throw error;
  const session = await buildAuthSessionForUser(admin);
  async function get(path) {
    const response = await fetch(`http://127.0.0.1:4000/api${path}`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    return payload;
  }
  const [overview, automation, versions, surveyAutomation, designAutomation, designReviewAutomation] = await Promise.all([
    get(`/business-os/overview?company_id=${COMPANY_ID}`),
    get(`/business-os/qualification-automation?company_id=${COMPANY_ID}`),
    get(`/business-os/qualification-automation/versions?company_id=${COMPANY_ID}`),
    get(`/business-os/stage-automations/survey?company_id=${COMPANY_ID}`),
    get(`/business-os/stage-automations/design?company_id=${COMPANY_ID}`),
    get(`/business-os/stage-automations/design_review?company_id=${COMPANY_ID}`),
  ]);
  assert.equal(overview.company.id, COMPANY_ID);
  assert.ok(overview.summary?.funnel_kpi);
  assert.equal(automation.automation.persisted, true);
  assert.equal(automation.automation.task_items.length, 3);
  assert.ok(versions.versions.length >= 1);
  assert.equal(surveyAutomation.automation.persisted, true);
  assert.equal(surveyAutomation.automation.task_items.length, 3);
  assert.equal(designAutomation.automation.persisted, true);
  assert.equal(designAutomation.automation.task_items.length, 3);
  assert.equal(designReviewAutomation.automation.persisted, true);
  assert.equal(designReviewAutomation.automation.task_items.length, 3);
  assert.ok(overview.summary?.deal_workflow_kpi);
  console.log(JSON.stringify({
    ok: true,
    overview_records: overview.records.length,
    task_template_items: automation.automation.task_items.length,
    automation_version: automation.automation.version,
    survey_automation_version: surveyAutomation.automation.version,
    design_automation_version: designAutomation.automation.version,
    design_review_automation_version: designReviewAutomation.automation.version,
    survey_task_template_items: surveyAutomation.automation.task_items.length,
    design_task_template_items: designAutomation.automation.task_items.length,
    design_review_task_template_items: designReviewAutomation.automation.task_items.length,
    funnel_source: overview.summary.funnel_kpi.source,
    deal_workflow_source: overview.summary.deal_workflow_kpi.source,
  }, null, 2));
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error.stack || error.message || error);
    process.exit(1);
  });
