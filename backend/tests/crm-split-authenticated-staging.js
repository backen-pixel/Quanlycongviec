/** Chạy CRM parity bằng JWT staging chỉ tồn tại trong memory của tiến trình. */
const path = require('path');
const { spawnSync } = require('child_process');
const { supabase } = require('../src/config/supabase');
const { buildAuthSessionForUser } = require('../src/helpers/authSession');

const ADMIN_USER_ID = 'e679aa3f-efa0-4a57-8d81-5374950dc8d4';

async function run() {
  const { data: admin, error } = await supabase.from('users').select('*').eq('id', ADMIN_USER_ID).maybeSingle();
  if (error) throw error;
  if (!admin) throw new Error('Không tìm thấy admin staging để chạy CRM parity.');
  const session = await buildAuthSessionForUser(admin);
  const env = {
    ...process.env,
    CRM_TEST_TOKEN: session.token,
    CRM_TEST_BASE: process.env.CRM_TEST_BASE || 'http://127.0.0.1:4000',
  };
  for (const file of ['crm-split-50-cases.js', 'crm-split-50-cases-b.js']) {
    const result = spawnSync(process.execPath, [path.join(__dirname, file)], {
      cwd: path.join(__dirname, '..'),
      env,
      stdio: 'inherit',
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
  }
  console.log('CRM authenticated parity: 100/100 PASS; JWT chỉ tồn tại trong memory.');
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
