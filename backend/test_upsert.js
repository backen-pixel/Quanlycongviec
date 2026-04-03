// Generate ON CONFLICT UPDATE SQL from the original INSERT
// This script reads from stdin, transforms INSERT to UPSERT
process.chdir('/home/ubuntu/.openclaw/workspace/employee-workflow/backend');
require('dotenv').config();
const { supabase } = require('./src/config/supabase');

async function run() {
  // Check unique constraint on code column
  const { data, error } = await supabase.rpc('exec_sql', {
    query: `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'products' AND indexdef LIKE '%code%';`
  });
  
  // If RPC doesn't exist, try another way
  if (error) {
    console.log('RPC not available, checking via query...');
    // Try to insert a duplicate to see if constraint exists
    const { error: dupErr } = await supabase.from('products')
      .upsert({ code: 'HUC-TTGNA4T380', name: 'test', base_price: 1, selling_price: 1 }, { onConflict: 'code', ignoreDuplicates: true });
    
    if (dupErr) {
      console.log('Upsert error:', dupErr.message);
      console.log('\nLikely NO unique constraint on code column.');
      console.log('Need to add: ALTER TABLE products ADD CONSTRAINT products_code_unique UNIQUE (code);');
    } else {
      console.log('Upsert on code works! Unique constraint exists.');
    }
  }
  
  // Test: try real upsert with one product
  console.log('\n=== Testing single upsert ===');
  const testProduct = {
    code: 'HUC-TTGNA4T380',
    name: 'Tủ bếp trên nhôm lá ghép nhỏ tay nắm vác âm kính 4 ly thường 700 x 380',
    description: 'Tủ bếp trên nhôm lá ghép nhỏ tay nắm vác âm kính 4 ly thường 700 x 380',
    unit: 'Md',
    base_price: 2454545,
    selling_price: 2700000,
    vat_rate: 10,
    dimensions: {"ngang": 700, "cao": 380},
    status: 'active',
    code_group: 'Tủ bếp trên',
    code_spec: 'Nhôm lá ghép nhỏ',
    code_standard: 'Tay nắm vác âm',
    code_glass: 'Kính 4 ly thường',
    code_side: null,
    code_type_std: null,
    code_size: '700 x 380'
  };
  
  const { data: result, error: upsertErr } = await supabase.from('products')
    .upsert(testProduct, { onConflict: 'code' })
    .select('id, code, selling_price, base_price, code_group, code_glass, dimensions');
  
  if (upsertErr) {
    console.log('Upsert failed:', upsertErr.message);
    
    // Fallback: UPDATE by code
    console.log('\nTrying UPDATE approach...');
    const { data: existing } = await supabase.from('products')
      .select('id')
      .eq('code', 'HUC-TTGNA4T380')
      .single();
    
    if (existing) {
      const { data: upd, error: updErr } = await supabase.from('products')
        .update({
          base_price: 2454545,
          selling_price: 2700000,
          dimensions: {"ngang": 700, "cao": 380},
          code_group: 'Tủ bếp trên',
          code_spec: 'Nhôm lá ghép nhỏ',
          code_standard: 'Tay nắm vác âm',
          code_glass: 'Kính 4 ly thường',
          code_size: '700 x 380'
        })
        .eq('id', existing.id)
        .select('id, code, selling_price, code_group, code_glass');
      
      if (updErr) console.log('Update failed:', updErr.message);
      else console.log('Update OK:', upd);
    }
  } else {
    console.log('Upsert OK:', result);
  }
}

run().catch(console.error);
