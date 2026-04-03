process.chdir('/home/ubuntu/.openclaw/workspace/employee-workflow/backend');
require('dotenv').config();
const { supabase } = require('./src/config/supabase');

// Parse the SQL INSERT to extract product data
const fs = require('fs');

async function run() {
  // Read the SQL file content
  const sqlContent = fs.readFileSync('/tmp/products_insert.sql', 'utf-8');
  
  // Parse VALUES blocks
  const valueBlocks = [];
  const regex = /\(\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*(\d+),\s*(\d+),\s*(\d+),\s*('([^']*)'::jsonb|NULL::jsonb),\s*'([^']*)',\s*(\d+),\s*(\d+),\s*'\[\]'::jsonb,\s*('([^']*)'|NULL),\s*('([^']*)'|NULL),\s*('([^']*)'|NULL),\s*('([^']*)'|NULL),\s*('([^']*)'|NULL),\s*('([^']*)'|NULL),\s*('([^']*)'|NULL)\s*\)/g;
  
  let match;
  while ((match = regex.exec(sqlContent)) !== null) {
    valueBlocks.push({
      code: match[1],
      name: match[2],
      description: match[3],
      unit: match[4],
      base_price: parseInt(match[5]),
      selling_price: parseInt(match[6]),
      vat_rate: parseInt(match[7]),
      dimensions: match[9] ? JSON.parse(match[9].replace(/'/g, '"')) : null,
      status: match[10],
      stock_quantity: parseInt(match[11]),
      min_stock: parseInt(match[12]),
      code_group: match[14] || null,
      code_spec: match[16] || null,
      code_standard: match[18] || null,
      code_glass: match[20] || null,
      code_side: match[22] || null,
      code_type_std: match[24] || null,
      code_size: match[26] || null,
    });
  }
  
  console.log('Parsed products from SQL:', valueBlocks.length);
  
  if (valueBlocks.length === 0) {
    console.log('No products parsed! Trying simple approach...');
    return;
  }
  
  // Upsert in batches of 50
  let updated = 0;
  let inserted = 0;
  let errors = 0;
  
  for (let i = 0; i < valueBlocks.length; i += 50) {
    const batch = valueBlocks.slice(i, i + 50);
    const { data, error } = await supabase.from('products')
      .upsert(batch, { onConflict: 'code' })
      .select('id, code');
    
    if (error) {
      console.error('Batch error at', i, ':', error.message);
      errors += batch.length;
    } else {
      console.log(`Batch ${i}-${i + batch.length}: ${(data || []).length} upserted`);
      updated += (data || []).length;
    }
  }
  
  console.log('\n=== RESULT ===');
  console.log('Total upserted:', updated);
  console.log('Errors:', errors);
  
  // Verify
  const { data: verify } = await supabase.from('products')
    .select('code, selling_price, base_price, dimensions, code_group, code_glass')
    .eq('code', 'HUC-TTGNA4T380')
    .single();
  console.log('\nVerify HUC-TTGNA4T380:', verify);
}

run().catch(console.error);
