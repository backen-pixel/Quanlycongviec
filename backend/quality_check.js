// Simple final check: verify data quality (not absolute prices)
process.chdir('/home/ubuntu/.openclaw/workspace/employee-workflow/backend');
require('dotenv').config();
const { supabase } = require('./src/config/supabase');

async function run() {
  let all = [];
  for (let off = 0; ; off += 500) {
    const { data } = await supabase.from('products')
      .select('code, name, selling_price, base_price, vat_rate, code_group, code_spec, code_standard, code_glass, code_side, code_type_std, code_size, dimensions')
      .like('code', 'HUC-%').range(off, off + 499);
    if (!data || !data.length) break;
    all.push(...data);
    if (data.length < 500) break;
  }

  console.log('=== DATA QUALITY CHECK ===');
  console.log('Total:', all.length);
  
  // 1. VAT formula: sell = base * 1.1
  let vatOk = 0;
  for (const p of all) {
    if (Math.abs(Math.round(p.base_price * 1.1) - p.selling_price) <= 1) vatOk++;
  }
  console.log(`\n1. VAT formula (sell = base × 1.1): ${vatOk}/${all.length} ✅`);

  // 2. code_group distribution
  const grp = {};
  all.forEach(p => { grp[p.code_group || '(null)'] = (grp[p.code_group || '(null)'] || 0) + 1; });
  console.log('\n2. code_group:');
  Object.entries(grp).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(`   ${k}: ${v}`));

  // 3. code_spec distribution
  const spec = {};
  all.forEach(p => { spec[p.code_spec || '(null)'] = (spec[p.code_spec || '(null)'] || 0) + 1; });
  console.log('\n3. code_spec:');
  Object.entries(spec).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(`   ${k}: ${v}`));

  // 4. code_glass distribution
  const gl = {};
  all.forEach(p => { gl[p.code_glass || '(null)'] = (gl[p.code_glass || '(null)'] || 0) + 1; });
  console.log('\n4. code_glass:');
  Object.entries(gl).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(`   ${k}: ${v}`));

  // 5. Dimensions coverage
  const withDim = all.filter(p => p.dimensions).length;
  console.log(`\n5. Dimensions: ${withDim}/${all.length} have data`);

  // 6. Price range by group
  console.log('\n6. Price range by group:');
  for (const g of Object.keys(grp)) {
    const items = all.filter(p => (p.code_group || '(null)') === g);
    const prices = items.map(p => p.selling_price).sort((a,b) => a-b);
    console.log(`   ${g}: ${prices[0].toLocaleString()} - ${prices[prices.length-1].toLocaleString()} (${items.length} items)`);
  }

  // 7. Sample products per group
  console.log('\n7. Samples:');
  for (const g of ['Tủ bếp trên','Tủ bếp dưới','Bàn đảo 1 mặt','Tủ đứng','Tủ lạnh','(null)']) {
    const p = all.find(x => (x.code_group || '(null)') === g);
    if (p) console.log(`   ${p.code}: ${p.selling_price.toLocaleString()}đ | ${p.code_group} | ${p.code_spec} | ${p.code_glass} | ${p.code_size}`);
  }
  
  console.log('\n=== DONE ===');
}

run().catch(console.error);
