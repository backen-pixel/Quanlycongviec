// Fix: 
// 1. HUC-D2GLB and similar hộc kéo products got double-increased
// 2. Check all prices match expected SQL values
process.chdir('/home/ubuntu/.openclaw/workspace/employee-workflow/backend');
require('dotenv').config();
const { supabase } = require('./src/config/supabase');

async function run() {
  // Expected prices from the SQL for all special items (hộc kéo, hộc khay thìa)
  const fixes = {
    'HUC-D2GLB': { selling_price: 750000, base_price: 681818, name: 'Hộc kéo nhôm lá ghép ray bi' },
    'HUC-D2GLA': { selling_price: 850000, base_price: 772727, name: 'Hộc kéo nhôm lá ghép ray âm' },
    'HUC-D2HKB': { selling_price: 1100000, base_price: 1000000, name: 'Hộc kéo nhôm hợp kim ray bi' },
    'HUC-D2HKA': { selling_price: 1200000, base_price: 1090909, name: 'Hộc kéo nhôm hợp kim ray âm' },
    'HUC-HTGNB': { selling_price: 375000, base_price: 340909, name: 'Hộc khay thìa nhôm lá ghép ray bi' },
    'HUC-HTGB': { selling_price: 575000, base_price: 522727, name: 'Hộc khay thìa nhôm hợp kim ray bi' },
    // Tầng nhôm
    'HUC-TNGN': { selling_price: 950000, base_price: 863636 },
    'HUC-TNGL': { selling_price: 1200000, base_price: 1090909 },
    'HUC-TNHK350': { selling_price: 700000, base_price: 636364 },
    'HUC-TNHK550': { selling_price: 1050000, base_price: 954545 },
    'HUC-TNHK600': { selling_price: 1100000, base_price: 1000000 },
    // Mặt nạ bếp
    'HUC-MNGNA4T': { selling_price: 2050000, base_price: 1863636 },
    'HUC-MNGNC4T': { selling_price: 2700000, base_price: 2454545 },
    'HUC-MNHKA4T': { selling_price: 2450000, base_price: 2227273 },
    'HUC-MNHKC4T': { selling_price: 2950000, base_price: 2681818 },
  };
  
  // Check current values
  const codes = Object.keys(fixes);
  const { data: current } = await supabase.from('products')
    .select('id, code, selling_price, base_price')
    .in('code', codes);
  
  console.log('=== CHECK & FIX ===');
  let needFix = 0;
  for (const p of (current || [])) {
    const expected = fixes[p.code];
    if (!expected) continue;
    const match = p.selling_price === expected.selling_price;
    if (!match) {
      console.log(`FIX ${p.code}: ${p.selling_price} -> ${expected.selling_price}`);
      const { error } = await supabase.from('products')
        .update({ selling_price: expected.selling_price, base_price: expected.base_price })
        .eq('id', p.id);
      if (error) console.log(`  ERROR: ${error.message}`);
      else { console.log(`  OK`); needFix++; }
    } else {
      console.log(`OK ${p.code}: ${p.selling_price}`);
    }
  }
  console.log(`\nFixed: ${needFix} products`);
  
  // Now verify a broader sample across ALL categories
  console.log('\n=== BROAD VERIFICATION ===');
  const broadCheck = [
    { code: 'HUC-TTGNA4T380', expected: 2700000 },
    { code: 'HUC-TTGLC5ST380', expected: 4050000 },
    { code: 'HUC-TTHKC5ST350', expected: 4500000 },
    { code: 'HUC-TDGNA4T560', expected: 3100000 },
    { code: 'HUC-TDGLC5ST560', expected: 4650000 },
    { code: 'HUC-TDHKC5ST600', expected: 5250000 },
    { code: 'HUC-D1GNA4T560', expected: 3800000 },
    { code: 'HUC-D1HKC5ST550', expected: 6250000 },
    { code: 'HUC-D2GNA4T560', expected: 3950000 },
    { code: 'HUC-D2HKC5ST600', expected: 7100000 },
    { code: 'HUC-D2GLB', expected: 750000 },
    { code: 'HUC-HTGNB', expected: 375000 },
    { code: 'HUC-TNGN', expected: 950000 },
    { code: 'HUC-MNGNA4T', expected: 2050000 },
    { code: 'HUC-LGN630A4T700', expected: 2500000 },
    { code: 'HUC-LHK700C5ST1000', expected: 4600000 },
    { code: 'HUC-KGNA4T500', expected: 2800000 },
    { code: 'HUC-DHK700C5ST400', expected: 4800000 },
    { code: 'HUC-DGL650A4T400', expected: 3700000 },
    { code: 'HUC-D1HKA4T600', expected: 6000000 },
    { code: 'HUC-D2HKA4T600', expected: 6400000 },
    { code: 'HUC-LGL650C5ST1000', expected: 4000000 },
    { code: 'HUC-LHK650C5ST1000', expected: 4225000 },
  ];
  
  const checkCodes = broadCheck.map(c => c.code);
  const { data: checked } = await supabase.from('products')
    .select('code, selling_price, code_group, code_glass')
    .in('code', checkCodes);
  
  const checkedMap = {};
  (checked || []).forEach(p => { checkedMap[p.code] = p; });
  
  let correct = 0, wrong = 0;
  for (const bc of broadCheck) {
    const p = checkedMap[bc.code];
    if (!p) { console.log(`❓ ${bc.code}: NOT FOUND`); continue; }
    const ok = p.selling_price === bc.expected;
    if (ok) correct++;
    else wrong++;
    console.log(`${ok ? '✅' : '❌'} ${bc.code}: sell=${p.selling_price} exp=${bc.expected} grp=${p.code_group} gl=${p.code_glass}`);
  }
  
  console.log(`\n${correct}/${correct + wrong} correct`);
}

run().catch(console.error);
