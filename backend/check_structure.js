// Check current products structure + quotation usage
process.chdir('/home/ubuntu/.openclaw/workspace/employee-workflow/backend');
require('dotenv').config();
const { supabase } = require('./src/config/supabase');

async function run() {
  // 1. Current products table columns
  const { data: sample } = await supabase.from('products')
    .select('*').limit(1);
  if (sample?.[0]) {
    console.log('=== PRODUCTS TABLE COLUMNS ===');
    console.log(Object.keys(sample[0]).join(', '));
    console.log('\nSample:', JSON.stringify(sample[0], null, 2));
  }

  // 2. Check dimensions format
  const { data: dims } = await supabase.from('products')
    .select('code, dimensions')
    .not('dimensions', 'is', null)
    .limit(5);
  console.log('\n=== DIMENSIONS FORMAT ===');
  dims?.forEach(p => console.log(`${p.code}: ${JSON.stringify(p.dimensions)}`));

  // 3. Check if quotations exist and reference products
  const { data: qi, error: qiErr } = await supabase.from('quotation_items')
    .select('id, product_id, product_code, product_name, quantity, unit_price')
    .limit(5);
  if (qiErr) {
    console.log('\n=== QUOTATION_ITEMS ===');
    console.log('Error:', qiErr.message);
    // Try quotations table directly
    const { data: q } = await supabase.from('quotations').select('*').limit(1);
    console.log('Quotations sample:', q?.[0] ? Object.keys(q[0]).join(', ') : 'empty/not found');
  } else {
    console.log('\n=== QUOTATION_ITEMS ===');
    console.log('Count check...');
    const { count } = await supabase.from('quotation_items').select('*', { count: 'exact', head: true });
    console.log('Total items:', count);
    qi?.forEach(i => console.log(`  ${i.product_code}: qty=${i.quantity} price=${i.unit_price}`));
  }

  // 4. Check how many HUC products are referenced in quotations
  const { data: usedProducts } = await supabase.from('quotation_items')
    .select('product_id, product_code')
    .like('product_code', 'HUC-%');
  console.log('\n=== HUC PRODUCTS IN QUOTATIONS ===');
  console.log('Used HUC items:', usedProducts?.length || 0);
  if (usedProducts?.length) {
    const uniqueCodes = [...new Set(usedProducts.map(p => p.product_code))];
    console.log('Unique codes:', uniqueCodes.length);
    console.log('Samples:', uniqueCodes.slice(0, 10).join(', '));
  }

  // 5. Total counts
  const { count: totalProducts } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: hucCount } = await supabase.from('products').select('*', { count: 'exact', head: true }).like('code', 'HUC-%');
  const { count: nonHuc } = await supabase.from('products').select('*', { count: 'exact', head: true }).not('code', 'like', 'HUC-%');
  console.log('\n=== PRODUCT COUNTS ===');
  console.log('Total:', totalProducts);
  console.log('HUC-:', hucCount);
  console.log('Non-HUC:', nonHuc);

  // 6. Non-HUC products sample
  const { data: others } = await supabase.from('products')
    .select('code, name, selling_price')
    .not('code', 'like', 'HUC-%')
    .limit(10);
  console.log('\nNon-HUC samples:');
  others?.forEach(p => console.log(`  ${p.code}: ${p.name} - ${p.selling_price}`));
}

run().catch(console.error);
