require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data, error } = await s.from('crm_pipeline_stages').select('id, name, pipeline_type, show_sx_transfer').limit(5);
  if (error) console.log('Error:', error.message);
  else console.log('OK:', JSON.stringify(data, null, 2));
}
run();
