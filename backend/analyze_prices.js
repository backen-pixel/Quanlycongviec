// Smart approach: Get ALL current HUC products, compute price adjustments
// The SQL shows consistent price increase pattern
process.chdir('/home/ubuntu/.openclaw/workspace/employee-workflow/backend');
require('dotenv').config();
const { supabase } = require('./src/config/supabase');

async function run() {
  // Get all current HUC products
  let allProducts = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase.from('products')
      .select('id, code, name, base_price, selling_price, dimensions, code_group, code_spec, code_standard, code_glass, code_side, code_type_std, code_size')
      .like('code', 'HUC-%')
      .range(offset, offset + 499);
    if (!data || data.length === 0) break;
    allProducts = allProducts.concat(data);
    offset += data.length;
    if (data.length < 500) break;
  }
  
  console.log('Total HUC products in DB:', allProducts.length);
  
  // Analyze price change pattern from known samples
  const known = [
    { code: 'HUC-TTGNA4T380', oldSell: 2550000, newSell: 2700000, oldBase: 2318182, newBase: 2454545 },
    { code: 'HUC-TTGNC4T380', oldSell: 3000000, newSell: 3150000, oldBase: 2727273, newBase: 2863636 },
    { code: 'HUC-TTHKA4T350', oldSell: 3700000, newSell: 3850000, oldBase: 3363636, newBase: 3500000 },
    { code: 'HUC-TDGNA4T560', oldSell: 2950000, newSell: 3100000, oldBase: 2681818, newBase: 2818182 },
    { code: 'HUC-D1GNA4T560', oldSell: 3650000, newSell: 3800000, oldBase: 3318182, newBase: 3454545 },
  ];
  
  console.log('\n=== Price Change Analysis ===');
  for (const k of known) {
    const sellDiff = k.newSell - k.oldSell;
    const baseDiff = k.newBase - k.oldBase;
    const sellPct = ((sellDiff / k.oldSell) * 100).toFixed(2);
    const basePct = ((baseDiff / k.oldBase) * 100).toFixed(2);
    console.log(`${k.code}: sell +${sellDiff} (${sellPct}%), base +${baseDiff} (${basePct}%)`);
  }
  
  // Check: is the formula selling_price = base_price * 1.1 (10% VAT)?
  console.log('\n=== VAT Check (new prices) ===');
  for (const k of known) {
    const computed = Math.round(k.newBase * 1.1);
    console.log(`${k.code}: base*1.1 = ${computed}, actual sell = ${k.newSell}, match: ${computed === k.newSell}`);
  }
  
  // Check old prices too
  console.log('\n=== VAT Check (old prices) ===');
  for (const k of known) {
    const computed = Math.round(k.oldBase * 1.1);
    console.log(`${k.code}: base*1.1 = ${computed}, actual sell = ${k.oldSell}, match: ${computed === k.oldSell}`);
  }
  
  // Let's check if selling_price = round(base * 1.1) pattern holds for ALL new prices
  // New base = newSell / 1.1
  console.log('\n=== Reverse: base from sell ===');
  for (const k of known) {
    const computedBase = Math.round(k.newSell / 1.1);
    console.log(`${k.code}: sell/1.1 = ${computedBase}, actual base = ${k.newBase}, diff: ${computedBase - k.newBase}`);
  }
  
  // Check the sell price pattern - are all sell prices round numbers?
  console.log('\n=== Sell price roundness ===');
  for (const k of known) {
    console.log(`${k.code}: newSell=${k.newSell} (mod 50k: ${k.newSell % 50000})`);
  }
}

run().catch(console.error);
