// Add ngang, cao, sau columns + cleanup old HUC products
process.chdir('/home/ubuntu/.openclaw/workspace/employee-workflow/backend');
require('dotenv').config();
const { supabase } = require('./src/config/supabase');

async function run() {
  // 1. Check if columns already exist
  const { data: sample } = await supabase.from('products').select('*').limit(1);
  const cols = sample?.[0] ? Object.keys(sample[0]) : [];
  console.log('Current columns:', cols.join(', '));
  
  const hasNgang = cols.includes('ngang');
  const hasCao = cols.includes('cao');
  const hasSau = cols.includes('sau');
  
  console.log(`ngang: ${hasNgang}, cao: ${hasCao}, sau: ${hasSau}`);
  
  if (!hasNgang || !hasCao || !hasSau) {
    console.log('\nNeed to add columns via Supabase SQL Editor or RPC...');
    
    // Try adding via insert/update trick - won't work for new columns
    // Need to use Supabase dashboard SQL Editor
    // ALTER TABLE products ADD COLUMN IF NOT EXISTS ngang INTEGER;
    // ALTER TABLE products ADD COLUMN IF NOT EXISTS cao INTEGER;
    // ALTER TABLE products ADD COLUMN IF NOT EXISTS sau INTEGER;
    
    console.log('Please run in Supabase SQL Editor:');
    console.log('ALTER TABLE products ADD COLUMN IF NOT EXISTS ngang INTEGER;');
    console.log('ALTER TABLE products ADD COLUMN IF NOT EXISTS cao INTEGER;');  
    console.log('ALTER TABLE products ADD COLUMN IF NOT EXISTS sau INTEGER;');
  }
  
  // 2. Check quotation_items using HUC products
  const { data: qiHuc } = await supabase.from('quotation_items')
    .select('id, product_id, product_code, name')
    .like('product_code', 'HUC-%');
  console.log('\n=== QUOTATION ITEMS with HUC ===');
  console.log('Count:', qiHuc?.length || 0);
  
  // Also check by product_id
  const { data: hucIds } = await supabase.from('products')
    .select('id').like('code', 'HUC-%');
  const hucIdSet = new Set((hucIds||[]).map(p => p.id));
  
  const { data: allQi } = await supabase.from('quotation_items')
    .select('id, product_id, product_code, name');
  const qiUsingHuc = (allQi||[]).filter(qi => qi.product_id && hucIdSet.has(qi.product_id));
  console.log('QI referencing HUC product_id:', qiUsingHuc.length);
  
  if (qiUsingHuc.length > 0) {
    console.log('WARNING: Some quotation items reference HUC products!');
    qiUsingHuc.forEach(qi => console.log(`  ${qi.id}: ${qi.product_code} - ${qi.name}`));
  } else {
    console.log('✅ Safe to delete HUC products - no quotation references');
  }
  
  // 3. Delete HUC products
  console.log('\n=== DELETING HUC PRODUCTS ===');
  
  // First delete related structures
  const { error: structErr } = await supabase.from('product_structures')
    .delete().in('product_id', (hucIds||[]).map(p => p.id));
  if (structErr) console.log('Struct delete error:', structErr.message);
  
  // Delete project_products references
  const { error: ppErr } = await supabase.from('project_products')
    .delete().in('product_id', (hucIds||[]).map(p => p.id));
  if (ppErr) console.log('project_products delete error:', ppErr.message);
  
  // Delete products - batch by 100
  let deleted = 0;
  for (let i = 0; i < (hucIds||[]).length; i += 100) {
    const batch = hucIds.slice(i, i + 100).map(p => p.id);
    const { error } = await supabase.from('products').delete().in('id', batch);
    if (error) console.log(`Delete batch ${i}: ${error.message}`);
    else deleted += batch.length;
  }
  console.log(`Deleted: ${deleted} HUC products`);
  
  // 4. Verify
  const { count: remaining } = await supabase.from('products')
    .select('*', { count: 'exact', head: true });
  const { count: hucRemaining } = await supabase.from('products')
    .select('*', { count: 'exact', head: true }).like('code', 'HUC-%');
  console.log(`\nRemaining: ${remaining} total, ${hucRemaining} HUC`);
}

run().catch(console.error);
