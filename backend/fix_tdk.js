// Fix Tủ đồ khô products that got double-increased
process.chdir('/home/ubuntu/.openclaw/workspace/employee-workflow/backend');
require('dotenv').config();
const { supabase } = require('./src/config/supabase');

// All Tủ đồ khô expected prices from SQL
const tdkExpected = {
'HUC-KGNA4T500': 2800000,'HUC-KGNC4T500': 3300000,'HUC-KGNA4ST500': 2950000,'HUC-KGNC4ST500': 3450000,
'HUC-KGNA5T500': 2850000,'HUC-KGNC5T500': 3350000,'HUC-KGNA5C500': 2900000,'HUC-KGNC5C500': 3400000,
'HUC-KGNA5ST500': 3050000,'HUC-KGNC5ST500': 3550000,
'HUC-KGLA4T500': 3250000,'HUC-KGLC4T500': 3750000,'HUC-KGLA4ST500': 3400000,'HUC-KGLC4ST500': 3950000,
'HUC-KGLA5T500': 3300000,'HUC-KGLC5T500': 3800000,'HUC-KGLA5C500': 3350000,'HUC-KGLC5C500': 3850000,
'HUC-KGLA5ST500': 3500000,'HUC-KGLC5ST500': 4050000,
'HUC-KGNA4T600': 3050000,'HUC-KGNC4T600': 3550000,'HUC-KGNA4ST600': 3300000,'HUC-KGNC4ST600': 3800000,
'HUC-KGNA5T600': 3100000,'HUC-KGNC5T600': 3600000,'HUC-KGNA5C600': 3150000,'HUC-KGNC5C600': 3650000,
'HUC-KGNA5ST600': 3400000,'HUC-KGNC5ST600': 3900000,
'HUC-KGLA4T600': 3400000,'HUC-KGLC4T600': 3900000,'HUC-KGLA4ST600': 3550000,'HUC-KGLC4ST600': 4050000,
'HUC-KGLA5T600': 3450000,'HUC-KGLC5T600': 3950000,'HUC-KGLA5C600': 3500000,'HUC-KGLC5C600': 4000000,
'HUC-KGLA5ST600': 3650000,'HUC-KGLC5ST600': 4150000,
'HUC-KHKA4T600': 3450000,'HUC-KHKC4T600': 3950000,'HUC-KHKA4ST600': 3600000,'HUC-KHKC4ST600': 4100000,
'HUC-KHKA5T600': 3500000,'HUC-KHKC5T600': 4000000,'HUC-KHKA5C600': 3550000,'HUC-KHKC5C600': 4050000,
'HUC-KHKA5ST600': 3700000,'HUC-KHKC5ST600': 4200000,
'HUC-KHKA4TH600': 4100000,'HUC-KHKC4TH600': 4600000,'HUC-KHKA4STH600': 4250000,'HUC-KHKC4STH600': 4750000,
'HUC-KHKA5TH600': 4150000,'HUC-KHKC5TH600': 4650000,'HUC-KHKA5CH600': 4300000,'HUC-KHKC5CH600': 4700000,
'HUC-KHKA5STH600': 4350000,'HUC-KHKC5STH600': 4850000,
};

async function run() {
  const codes = Object.keys(tdkExpected);
  console.log('Checking', codes.length, 'Tủ đồ khô products...');
  
  const { data: current } = await supabase.from('products')
    .select('id, code, selling_price')
    .in('code', codes);
  
  let fixed = 0, ok = 0;
  for (const p of (current || [])) {
    const exp = tdkExpected[p.code];
    if (p.selling_price !== exp) {
      const newBase = Math.round(exp / 1.1);
      const { error } = await supabase.from('products')
        .update({ selling_price: exp, base_price: newBase })
        .eq('id', p.id);
      if (error) console.log(`ERROR ${p.code}: ${error.message}`);
      else { fixed++; }
    } else { ok++; }
  }
  
  console.log(`OK: ${ok} | Fixed: ${fixed} | Total: ${(current||[]).length}`);
  
  // Quick verify
  const { data: v } = await supabase.from('products')
    .select('code, selling_price')
    .in('code', ['HUC-KGNA4T500', 'HUC-KGNC5ST500', 'HUC-KHKC5STH600']);
  console.log('\nVerify:');
  (v||[]).forEach(p => {
    const exp = tdkExpected[p.code];
    console.log(`${p.selling_price === exp ? '✅' : '❌'} ${p.code}: ${p.selling_price} (exp: ${exp})`);
  });
}

run().catch(console.error);
