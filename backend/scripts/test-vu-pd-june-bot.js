require('dotenv').config();
const { executeTool, findUsersByName } = require('../src/helpers/aiReportTools');
const { runOpenAiToolsLoop } = require('../src/helpers/aiConversation');

const VU_ID = 'aecd9332-c7df-4212-b42d-b504d12a885b';
const MANAGER_ID = '6e8e39da-6286-4009-be4b-0957d4463ad7';

async function main() {
  const found = await findUsersByName({ name: 'Vũ PD' });
  console.log('=== findUsersByName ===');
  console.log(JSON.stringify(found, null, 2));

  const report = await executeTool(
    'get_employee_activity_report',
    { name: 'Vũ PD', time_scope: 'last_month' },
    {},
  );
  console.log('\n=== get_employee_activity_report (last_month = tháng 6) ===');
  console.log(JSON.stringify(report.summary, null, 2));
  console.log('period:', report.period, report.period_range);

  const org = await executeTool(
    'get_org_overview_report',
    {
      company_id: '29677f68-967e-4256-92fd-492bb580e888',
      assigned_to: VU_ID,
      date_from: '2026-06-01',
      date_to: '2026-06-30',
      compare: false,
    },
    { sender_user_id: MANAGER_ID },
  ).catch((e) => ({ error: e.message }));
  console.log('\n=== org overview June (assigned_to Vũ PD, created_at basis) ===');
  console.log(JSON.stringify(org?.summary, null, 2));

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log('\n=== SKIP OpenAI bot test (no OPENAI_API_KEY) ===');
    return;
  }

  const userQuestion = 'Báo cáo nhân viên Vũ PD tháng 6';
  console.log('\n=== OpenAI bot test ===');
  console.log('User:', userQuestion);
  const result = await runOpenAiToolsLoop({
    apiKey,
    system: 'Bạn là AI báo cáo CRM. Trả lời bằng tiếng Việt. Dùng tools cho mọi số liệu.',
    messages: [{ role: 'user', content: userQuestion }],
    toolCtx: { sender_user_id: MANAGER_ID },
  });
  console.log('\nBot reply:\n', result.text);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
