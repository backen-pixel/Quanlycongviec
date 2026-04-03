// Parse SQL INSERT and upsert to Supabase
// Usage: pipe the SQL file into stdin
// node parse_and_upsert.js < products.sql
process.chdir('/home/ubuntu/.openclaw/workspace/employee-workflow/backend');
require('dotenv').config();
const { supabase } = require('./src/config/supabase');

async function run() {
  // Read ALL from stdin
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const sql = Buffer.concat(chunks).toString('utf-8');
  console.log('SQL length:', sql.length, 'chars');
  
  // Extract value tuples using regex
  // Each tuple starts after VALUES or ),  and looks like:
  // ( 'CODE', 'NAME', 'DESC', 'UNIT', BASE, SELL, VAT, DIMENSIONS, 'STATUS', STOCK, MIN, TAGS, GROUP, SPEC, STANDARD, GLASS, SIDE, TYPE_STD, SIZE )
  
  const products = [];
  
  // Match individual value groups between parentheses
  const tupleRegex = /\(\s*\n\s*'(HUC-[^']+)',\s*'([^']+)',\s*'([^']*)',\s*'([^']+)',\s*\n\s*(\d+),\s*(\d+),\s*(\d+),\s*\n\s*('(\{[^}]+\})'::jsonb|NULL::jsonb),\s*'(\w+)',\s*(\d+),\s*(\d+),\s*'\[\]'::jsonb,\s*\n\s*('([^']*)'|NULL),\s*('([^']*)'|NULL),\s*('([^']*)'|NULL),\s*\n\s*('([^']*)'|NULL),\s*('([^']*)'|NULL),\s*('([^']*)'|NULL),\s*('([^']*)'|NULL)\s*\)/g;
  
  let match;
  while ((match = tupleRegex.exec(sql)) !== null) {
    const dimStr = match[9]; // the JSON string inside quotes
    let dimensions = null;
    if (dimStr) {
      try { dimensions = JSON.parse(dimStr.replace(/"/g, '"')); } catch(e) {}
    }
    
    products.push({
      code: match[1],
      name: match[2],
      description: match[3],
      unit: match[4],
      base_price: parseInt(match[5]),
      selling_price: parseInt(match[6]),
      vat_rate: parseInt(match[7]),
      dimensions: dimensions,
      status: match[10] || 'active',
      code_group: match[14] || null,
      code_spec: match[16] || null,
      code_standard: match[18] || null,
      code_glass: match[20] || null,
      code_side: match[22] || null,
      code_type_std: match[24] || null,
      code_size: match[26] || null,
    });
  }
  
  console.log('Parsed products:', products.length);
  
  if (products.length === 0) {
    console.log('No products parsed with strict regex, trying loose regex...');
    // Looser approach: split by VALUES blocks
    const valuesStart = sql.indexOf('VALUES');
    if (valuesStart === -1) {
      console.log('No VALUES keyword found!');
      return;
    }
    const valuesStr = sql.substring(valuesStart + 6);
    // Split by '),\n(' 
    const rawBlocks = valuesStr.split(/\)\s*,\s*\n\s*\(/);
    console.log('Raw blocks found:', rawBlocks.length);
    
    for (const rawBlock of rawBlocks) {
      const block = rawBlock.replace(/^\s*\(\s*/, '').replace(/\s*\)\s*;?\s*$/, '');
      // Extract code
      const codeM = block.match(/'(HUC-[^']+)'/);
      if (!codeM) continue;
      
      // Extract all quoted strings
      const strings = [];
      const strRegex = /'([^']*)'/g;
      let sm;
      while ((sm = strRegex.exec(block)) !== null) {
        strings.push(sm[1]);
      }
      
      // Extract all standalone numbers (not inside quotes)
      const cleanBlock = block.replace(/'[^']*'/g, ''); // remove quoted strings
      const numbers = [];
      const numRegex = /\b(\d{2,})\b/g;
      let nm;
      while ((nm = numRegex.exec(cleanBlock)) !== null) {
        numbers.push(parseInt(nm[1]));
      }
      
      // Parse dimensions from block
      let dimensions = null;
      const dimMatch = block.match(/"ngang":\s*(\d+),\s*"cao":\s*(\d+)/);
      if (dimMatch) {
        dimensions = { ngang: parseInt(dimMatch[1]), cao: parseInt(dimMatch[2]) };
      }
      
      // strings[0]=code, strings[1]=name, strings[2]=desc, strings[3]=unit
      // numbers[0]=base, numbers[1]=sell, numbers[2]=vat, numbers[3]=stock(0), numbers[4]=min(0)
      // After tags: strings[4+] = code_group, code_spec, code_standard, code_glass, ...
      // But NULL values won't appear in strings
      
      if (strings.length < 4 || numbers.length < 3) continue;
      
      // Find the metadata fields after the tags
      // They appear after '[]' in the SQL, as 'value' or NULL
      const afterTags = block.substring(block.indexOf("'[]'::jsonb") + 11);
      const metaStrings = [];
      const metaRegex = /('([^']*)'|NULL)/g;
      let mm;
      while ((mm = metaRegex.exec(afterTags)) !== null) {
        metaStrings.push(mm[2] !== undefined ? mm[2] : null);
      }
      
      products.push({
        code: strings[0],
        name: strings[1],
        description: strings[2] || strings[1],
        unit: strings[3],
        base_price: numbers[0],
        selling_price: numbers[1],
        vat_rate: numbers[2],
        dimensions: dimensions,
        status: 'active',
        code_group: metaStrings[0] || null,
        code_spec: metaStrings[1] || null,
        code_standard: metaStrings[2] || null,
        code_glass: metaStrings[3] || null,
        code_side: metaStrings[4] || null,
        code_type_std: metaStrings[5] || null,
        code_size: metaStrings[6] || null,
      });
    }
    console.log('Parsed with loose regex:', products.length);
  }
  
  if (products.length === 0) {
    console.log('FAILED to parse any products');
    return;
  }
  
  // Show samples
  console.log('\nFirst:', JSON.stringify(products[0]));
  console.log('Last:', JSON.stringify(products[products.length - 1]));
  
  // Upsert in batches
  let ok = 0, fail = 0;
  for (let i = 0; i < products.length; i += 30) {
    const batch = products.slice(i, i + 30);
    const { data, error } = await supabase.from('products')
      .upsert(batch, { onConflict: 'code' })
      .select('id');
    
    if (error) {
      console.error(`Batch ${i}: ${error.message}`);
      // Single fallback
      for (const p of batch) {
        const { error: e2 } = await supabase.from('products').upsert(p, { onConflict: 'code' });
        if (e2) { console.error(`  ${p.code}: ${e2.message}`); fail++; }
        else ok++;
      }
    } else {
      ok += (data || []).length;
      if (i % 120 === 0) console.log(`  ${i + batch.length}/${products.length}`);
    }
  }
  
  console.log('\n=== DONE ===');
  console.log('OK:', ok, '| Fail:', fail, '| Total:', products.length);
  
  // Verify
  const { data: v } = await supabase.from('products')
    .select('code, selling_price, code_group, code_glass, dimensions')
    .in('code', ['HUC-TTGNA4T380', 'HUC-TDGNA4T560', 'HUC-DHK700C5ST400'])
    .order('code');
  console.log('\nVerification:');
  (v || []).forEach(p => console.log(`  ${p.code} | sell:${p.selling_price} | grp:${p.code_group} | gl:${p.code_glass} | dim:${JSON.stringify(p.dimensions)}`));
}

run().catch(console.error);
