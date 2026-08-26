/** Seed automation Khảo sát + Thiết kế + Kiểm tra thiết kế có sẵn cho pilot Vạn Phú Thành. */
const { getStageAutomation, saveStageAutomation } = require('../src/helpers/businessOsDealWorkflow');

const COMPANY_ID = '991dc79d-cbf5-49f9-a364-35227cb47635';
const ADMIN_USER_ID = 'e679aa3f-efa0-4a57-8d81-5374950dc8d4';

function confirmed() {
  const index = process.argv.indexOf('--confirm');
  return index >= 0 && process.argv[index + 1] === 'VPT';
}

async function run() {
  if (!confirmed()) throw new Error('Chạy lại với --confirm VPT để khởi tạo cấu hình staging.');
  const results = [];
  for (const stageKey of ['survey', 'design', 'design_review']) {
    const current = await getStageAutomation(COMPANY_ID, stageKey);
    if (current.persisted) {
      results.push({ stage_key: stageKey, changed: false, version: current.version, task_count: current.task_items.length });
      continue;
    }
    const saved = await saveStageAutomation({
      companyId: COMPANY_ID,
      stageKey,
      input: current,
      actorUserId: ADMIN_USER_ID,
      changeType: 'seed',
    });
    results.push({ stage_key: stageKey, changed: true, version: saved.version, task_count: saved.task_items.length, sla_minutes: saved.sla_policy.duration_minutes });
  }
  console.log(JSON.stringify({ ok: true, company: 'Công ty TNHH Bếp Vạn Phú Thành', automations: results }, null, 2));
}

run().then(() => process.exit(0)).catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
