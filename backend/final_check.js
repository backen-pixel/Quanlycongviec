// Final comprehensive check: verify ALL 630 products have correct prices
// Check for any that got double-increased by looking at which still have code_group='HUC'
process.chdir('/home/ubuntu/.openclaw/workspace/employee-workflow/backend');
require('dotenv').config();
const { supabase } = require('./src/config/supabase');

async function run() {
  // Check if any products still have old code_group format
  let all = [];
  let off = 0;
  while (true) {
    const { data } = await supabase.from('products')
      .select('id, code, name, selling_price, base_price, code_group, code_spec, code_glass, dimensions')
      .like('code', 'HUC-%')
      .range(off, off + 499);
    if (!data || data.length === 0) break;
    all = all.concat(data);
    off += data.length;
    if (data.length < 500) break;
  }
  
  console.log('Total:', all.length);
  
  // Group by code_group
  const groups = {};
  for (const p of all) {
    const g = p.code_group || '(null)';
    groups[g] = (groups[g] || 0) + 1;
  }
  console.log('\ncode_group distribution:');
  for (const [g, c] of Object.entries(groups).sort((a,b) => b[1] - a[1])) {
    console.log(`  ${g}: ${c}`);
  }
  
  // Check for any still with "HUC" as code_group (old format)
  const oldFormat = all.filter(p => p.code_group === 'HUC');
  if (oldFormat.length > 0) {
    console.log(`\n⚠️ ${oldFormat.length} products still have code_group="HUC" (old format)`);
    oldFormat.slice(0, 5).forEach(p => console.log(`  ${p.code}: ${p.name?.slice(0,50)}`));
  }
  
  // Check dimensions coverage
  const withDim = all.filter(p => p.dimensions);
  const withoutDim = all.filter(p => !p.dimensions);
  console.log(`\nDimensions: ${withDim.length} have, ${withoutDim.length} don't`);
  if (withoutDim.length > 0) {
    console.log('Without dimensions (expected for accessories):');
    withoutDim.forEach(p => console.log(`  ${p.code}: ${p.name?.slice(0,50)}`));
  }
  
  // Verify selling_price = base_price * 1.1 for all
  let vatOk = 0, vatBad = 0;
  for (const p of all) {
    const expected = Math.round(p.base_price * 1.1);
    if (Math.abs(expected - p.selling_price) > 1) {
      vatBad++;
      if (vatBad <= 3) console.log(`\nVAT mismatch: ${p.code} base=${p.base_price} * 1.1 = ${expected}, sell=${p.selling_price}`);
    } else {
      vatOk++;
    }
  }
  console.log(`\nVAT check: ${vatOk} OK, ${vatBad} mismatch`);
  
  // Summary
  console.log('\n=== SUMMARY ===');
  console.log(`Total products: ${all.length}`);
  console.log(`With code_group: ${all.filter(p => p.code_group && p.code_group !== 'HUC').length}`);
  console.log(`With code_glass: ${all.filter(p => p.code_glass).length}`);
  console.log(`With dimensions: ${withDim.length}`);
  console.log(`VAT formula OK: ${vatOk}/${all.length}`);
}

run().catch(console.error);
