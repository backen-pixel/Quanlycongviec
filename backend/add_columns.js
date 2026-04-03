// Add ngang, cao, sau columns via Supabase service role
process.chdir('/home/ubuntu/.openclaw/workspace/employee-workflow/backend');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function runSQL(sql) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  return res;
}

async function run() {
  // Use Supabase REST to alter table - this won't work via REST API
  // Need to use the SQL API endpoint instead
  const sqls = [
    'ALTER TABLE products ADD COLUMN IF NOT EXISTS ngang INTEGER',
    'ALTER TABLE products ADD COLUMN IF NOT EXISTS cao INTEGER', 
    'ALTER TABLE products ADD COLUMN IF NOT EXISTS sau INTEGER',
  ];
  
  // Try via pg_net or direct SQL endpoint
  // Supabase has no direct SQL endpoint via REST, but we can use a workaround
  // Create a simple function first, or use the existing dimensions jsonb
  
  // Actually, let's try the Supabase Management API
  const mgmtRes = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
  });
  console.log('REST API status:', mgmtRes.status);
  
  // Alternative: just use dimensions jsonb with {ngang, cao, sau}
  // This already works - dimensions column already exists as jsonb
  // Much simpler than adding new columns!
  
  console.log('\n=== USING DIMENSIONS JSONB ===');
  console.log('Instead of new columns, update dimensions to: {ngang: X, cao: Y, sau: Z}');
  console.log('This already works with existing jsonb column!');
  
  // Test update
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  
  // Verify dimensions jsonb accepts 3 fields
  const { data: test } = await supabase.from('products')
    .select('id, code, dimensions').limit(1);
  
  if (test?.[0]) {
    const { data: updated, error } = await supabase.from('products')
      .update({ dimensions: { ngang: 700, cao: 380, sau: 320 } })
      .eq('id', test[0].id)
      .select('id, code, dimensions');
    
    if (error) console.log('Error:', error.message);
    else {
      console.log('Test update OK:', updated[0]);
      // Revert
      await supabase.from('products').update({ dimensions: test[0].dimensions }).eq('id', test[0].id);
      console.log('Reverted');
    }
  }
  
  console.log('\n✅ Plan: Use dimensions jsonb with {ngang, cao, sau} - no schema change needed!');
}

run().catch(console.error);
