/** Read-only smoke test cho API Business OS trên server local + Supabase thật của ABC. */
const assert = require('assert/strict');
const { supabase } = require('../src/config/supabase');
const { buildAuthSessionForUser } = require('../src/helpers/authSession');

const COMPANY_ID = 'b7cb0688-8e4d-46e5-a8e0-694c6b57c1b4';
const ADMIN_USER_ID = '17606212-3b26-4f5b-aa80-81528784ec46';

async function run() {
  const { data: admin, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', ADMIN_USER_ID)
    .maybeSingle();
  if (error) throw error;
  assert.equal(admin?.company_id, COMPANY_ID);

  const session = await buildAuthSessionForUser(admin);
  const baseUrl = String(process.env.BUSINESS_OS_BASE_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/api/business-os/overview`, {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(payload.company?.id, COMPANY_ID);
  assert.equal(payload.rollout?.enabled, true);
  assert.equal(payload.rollout?.all_modules_enabled, true);
  assert.equal(payload.rollout?.workspace_mode, 'all_modules_gateway');
  assert.equal(payload.process?.key, 'sales_lead_qualification_v1');
  assert.equal(payload.process?.stages?.length, 4);
  assert.ok(Array.isArray(payload.records));
  assert.ok(Array.isArray(payload.catalog));
  assert.equal(payload.catalog.find((item) => item.key === 'sales')?.status, 'pilot');
  assert.equal(payload.catalog.find((item) => item.key === 'production')?.status, 'gateway');

  console.log(JSON.stringify({
    ok: true,
    company: payload.company.name,
    rollout: payload.rollout.scope,
    workspace_mode: payload.rollout.workspace_mode,
    storage_mode: payload.storage_mode,
    records: payload.summary.total_records,
    stages: payload.process.stages.map((stage) => stage.key),
  }, null, 2));
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error.stack || error.message || error);
    process.exit(1);
  });
