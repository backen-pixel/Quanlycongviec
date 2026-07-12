// Batch upsert all 630 products using Supabase
// Reads the SQL INSERT, parses values, upserts via Supabase client
process.chdir('/home/ubuntu/.openclaw/workspace/employee-workflow/backend');
require('dotenv').config();
const { supabase } = require('./src/config/supabase');
const fs = require('fs');

async function run() {
  const sql = fs.readFileSync('/home/ubuntu/.openclaw/workspace/employee-workflow/products_import.sql', 'utf-8');
  
  // Parse each VALUES block
  // Pattern: ( 'code', 'name', 'desc', 'unit', base, sell, vat, dimensions, 'status', stock, min, tags, code_group, code_spec, code_standard, code_glass, code_side, code_type_std, code_size )
  const products = [];
  
  // Split by "),\n(" or ");\n" to get individual value blocks
  const blocks = sql.split(/\),\s*\n\(/);
  
  for (const block of blocks) {
    // Clean up
    let b = block.replace(/^\s*\(\s*/, '').replace(/\s*\)\s*;?\s*$/, '');
    
    // Extract fields using regex for each line pattern
    const codeMatch = b.match(/^\s*'([^']+)'/);
    if (!codeMatch) continue;
    
    // Extract all quoted strings and numbers
    const parts = [];
    let remaining = b;
    while (remaining.length > 0) {
      remaining = remaining.trimStart();
      if (remaining.startsWith("'")) {
        // Quoted string
        const end = remaining.indexOf("'", 1);
        if (end === -1) break;
        let val = remaining.substring(1, end);
        // Check for ::jsonb suffix
        remaining = remaining.substring(end + 1).trimStart();
        if (remaining.startsWith('::jsonb')) {
          remaining = remaining.substring(7);
          try { val = JSON.parse(val.replace(/'/g, '"')); } catch(e) { val = val; }
          parts.push({ type: 'jsonb', val });
        } else {
          parts.push({ type: 'string', val });
        }
      } else if (remaining.startsWith('NULL')) {
        remaining = remaining.substring(4).trimStart();
        if (remaining.startsWith('::jsonb')) remaining = remaining.substring(7);
        parts.push({ type: 'null', val: null });
      } else if (/^\d/.test(remaining)) {
        const numMatch = remaining.match(/^(\d+)/);
        if (numMatch) {
          parts.push({ type: 'number', val: parseInt(numMatch[1]) });
          remaining = remaining.substring(numMatch[1].length);
        }
      }
      // Skip comma
      remaining = remaining.trimStart();
      if (remaining.startsWith(',')) remaining = remaining.substring(1);
    }
    
    // Map parts to product fields
    // Expected order: code(0), name(1), desc(2), unit(3), base_price(4), selling_price(5), vat_rate(6),
    // dimensions(7), status(8), stock_quantity(9), min_stock(10), tags(11),
    // code_group(12), code_spec(13), code_standard(14), code_glass(15), code_side(16), code_type_std(17), code_size(18)
    
    if (parts.length < 12) continue;
    
    const product = {
      code: parts[0]?.val,
      name: parts[1]?.val,
      description: parts[2]?.val,
      unit: parts[3]?.val,
      base_price: parts[4]?.val,
      selling_price: parts[5]?.val,
      vat_rate: parts[6]?.val,
      dimensions: parts[7]?.val,
      status: parts[8]?.val || 'active',
      stock_quantity: parts[9]?.val || 0,
      min_stock: parts[10]?.val || 0,
      code_group: parts[12]?.val || null,
      code_spec: parts[13]?.val || null,
      code_standard: parts[14]?.val || null,
      code_glass: parts[15]?.val || null,
      code_side: parts[16]?.val || null,
      code_type_std: parts[17]?.val || null,
      code_size: parts[18]?.val || null,
    };
    
    if (product.code && product.code.startsWith('HUC-')) {
      products.push(product);
    }
  }
  
  console.log('Parsed products:', products.length);
  if (products.length < 10) {
    console.log('Too few products parsed. Debugging...');
    console.log('First block sample:', blocks[0]?.substring(0, 200));
    return;
  }
  
  // Show samples
  console.log('\nSample[0]:', JSON.stringify(products[0], null, 2));
  console.log('Sample[last]:', JSON.stringify(products[products.length - 1], null, 2));
  
  // Upsert in batches of 30
  let success = 0;
  let errors = 0;
  
  for (let i = 0; i < products.length; i += 30) {
    const batch = products.slice(i, i + 30);
    const { data, error } = await supabase.from('products')
      .upsert(batch, { onConflict: 'code' })
      .select('id');
    
    if (error) {
      console.error(`Batch ${i}: ERROR -`, error.message);
      // Try one by one
      for (const p of batch) {
        const { error: singleErr } = await supabase.from('products')
          .upsert(p, { onConflict: 'code' });
        if (singleErr) {
          console.error(`  ${p.code}: ${singleErr.message}`);
          errors++;
        } else {
          success++;
        }
      }
    } else {
      success += (data || []).length;
      if (i % 150 === 0) console.log(`Progress: ${i + batch.length}/${products.length} (${success} ok)`);
    }
  }
  
  console.log('\n=== RESULT ===');
  console.log('Success:', success);
  console.log('Errors:', errors);
  console.log('Total:', products.length);
  
  // Verify some records
  const verifyCodes = ['HUC-TTGNA4T380', 'HUC-TDGNA4T560', 'HUC-D1HKC5ST600', 'HUC-DHK700C5ST400'];
  const { data: verified } = await supabase.from('products')
    .select('code, selling_price, base_price, code_group, code_glass, dimensions')
    .in('code', verifyCodes);
  
  console.log('\n=== VERIFICATION ===');
  (verified || []).forEach(p => {
    console.log(`${p.code} | sell: ${p.selling_price} | group: ${p.code_group} | glass: ${p.code_glass} | dim: ${JSON.stringify(p.dimensions)}`);
  });
}

run().catch(console.error);
