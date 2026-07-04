require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const attId = '262afcb4-6643-442e-b293-dc22b2e2b0aa';
  const leadId = '54b3a5bc-7238-45f8-b51f-9636f2726836';

  // Check all possible tables
  const tables = ['crm_task_attachments', 'file_attachments', 'lead_documents', 'project_documents'];
  for (const t of tables) {
    const { data, error } = await s.from(t).select('*').eq('id', attId).maybeSingle();
    if (error) console.log(`${t}: ERROR - ${error.message}`);
    else if (data) console.log(`${t}: FOUND`, JSON.stringify(data, null, 2));
    else console.log(`${t}: not found`);
  }

  // Check all attachments for this lead across tasks
  const { data: allAtt } = await s.from('crm_task_attachments').select('id, task_id, name, file_name').eq('lead_id', leadId);
  console.log('\nAll crm_task_attachments for lead:', JSON.stringify(allAtt, null, 2));
}
run();
