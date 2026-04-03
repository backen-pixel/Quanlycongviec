// Check quotation_items structure properly
process.chdir('/home/ubuntu/.openclaw/workspace/employee-workflow/backend');
require('dotenv').config();
const { supabase } = require('./src/config/supabase');

async function run() {
  // Get quotation_items columns
  const { data: qi, error } = await supabase.from('quotation_items')
    .select('*').limit(2);
  
  if (error) {
    console.log('quotation_items error:', error.message);
  } else {
    console.log('=== QUOTATION_ITEMS COLUMNS ===');
    if (qi?.[0]) {
      console.log(Object.keys(qi[0]).join(', '));
      console.log('\nSample:', JSON.stringify(qi[0], null, 2));
    }
    const { count } = await supabase.from('quotation_items')
      .select('*', { count: 'exact', head: true });
    console.log('\nTotal quotation items:', count);
  }
  
  // Check if any quotation_items reference product_id
  if (qi?.length) {
    const productIds = qi.filter(i => i.product_id).map(i => i.product_id);
    if (productIds.length) {
      const { data: prods } = await supabase.from('products')
        .select('id, code').in('id', productIds);
      console.log('\nReferenced products:', prods?.map(p => p.code));
    }
  }
}

run().catch(console.error);
