process.chdir('/home/ubuntu/.openclaw/workspace/employee-workflow/backend');
require('dotenv').config();
const { supabase } = require('./src/config/supabase');

// Product data from the SQL INSERT - extracted key fields for all 630 products
// We'll do it differently: use Supabase RPC to run raw SQL with UPSERT logic

async function run() {
  // Step 1: Check if 'code' has a UNIQUE constraint (needed for upsert)
  const { data: test } = await supabase.from('products')
    .select('id, code')
    .eq('code', 'HUC-TTGNA4T380');
  console.log('Test lookup:', test?.length, 'results');

  // Step 2: Get current prices for comparison
  const { data: before } = await supabase.from('products')
    .select('code, selling_price, base_price, dimensions, code_group, code_glass')
    .in('code', ['HUC-TTGNA4T380', 'HUC-TDGNA4T560', 'HUC-D1GNA4T560', 'HUC-LHK700C5ST1000']);
  
  console.log('\n=== BEFORE UPDATE ===');
  (before || []).forEach(p => {
    console.log(p.code, '| sell:', p.selling_price, '| base:', p.base_price, '| group:', p.code_group, '| glass:', p.code_glass, '| dim:', JSON.stringify(p.dimensions));
  });

  // Step 3: Run SQL directly via Supabase pg
  // Since the SQL is an INSERT with 630 rows, best approach is to run it as raw SQL
  // But we need to handle conflicts - use INSERT ... ON CONFLICT (code) DO UPDATE
  
  console.log('\n=== INFO ===');
  console.log('SQL INSERT has 630 products');
  console.log('DB currently has 702 products (630 HUC + 72 others)');
  console.log('All 630 HUC codes already exist in DB');
  console.log('SQL has UPDATED PRICES (tăng ~150k-200k mỗi SP) + NEW structured dimensions + code_group/code_glass data');
  console.log('\nTO SYNC: Need to run SQL as UPDATE on existing rows');
  console.log('Approach: Convert INSERT to UPDATE statements matching by code');
}

run().catch(console.error);
