/**
 * Khởi tạo cấu hình Qualification automation mặc định cho pilot Vạn Phú Thành.
 * Không ghi đè cấu hình đã tồn tại. Chạy: node scripts/seed-business-os-qualification-automation-pilot.js --confirm VPT
 */
const { getQualificationAutomation, saveQualificationAutomation } = require('../src/helpers/businessOsQualificationAutomation');

const COMPANY_ID = '991dc79d-cbf5-49f9-a364-35227cb47635';
const ADMIN_USER_ID = 'e679aa3f-efa0-4a57-8d81-5374950dc8d4';

function confirmed() {
  const index = process.argv.indexOf('--confirm');
  return index >= 0 && process.argv[index + 1] === 'VPT';
}

async function run() {
  if (!confirmed()) throw new Error('Chạy lại với --confirm VPT để khởi tạo cấu hình staging.');
  const current = await getQualificationAutomation(COMPANY_ID);
  if (current.persisted) {
    console.log(JSON.stringify({
      ok: true,
      changed: false,
      reason: 'already_configured',
      version: current.version,
      task_count: current.task_items.length,
    }, null, 2));
    return;
  }
  const saved = await saveQualificationAutomation({
    companyId: COMPANY_ID,
    input: current,
    actorUserId: ADMIN_USER_ID,
    changeType: 'seed',
  });
  console.log(JSON.stringify({
    ok: true,
    changed: true,
    company: 'Công ty TNHH Bếp Vạn Phú Thành',
    version: saved.version,
    sla_duration_minutes: saved.sla_policy.duration_minutes,
    warning_minutes: saved.sla_policy.warning_minutes,
    task_count: saved.task_items.length,
  }, null, 2));
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
