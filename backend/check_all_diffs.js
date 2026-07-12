// Check if ALL 630 products follow the +150k pattern
// Compare more samples from the SQL with current DB values
process.chdir('/home/ubuntu/.openclaw/workspace/employee-workflow/backend');
require('dotenv').config();
const { supabase } = require('./src/config/supabase');

async function run() {
  // More test cases from the SQL (various categories)
  const testCases = [
    // Tủ bếp trên ghép nhỏ
    { code: 'HUC-TTGNA4T380', newSell: 2700000 },
    { code: 'HUC-TTGNC5ST380', newSell: 3400000 },
    // Tủ bếp trên ghép lớn  
    { code: 'HUC-TTGLA4T380', newSell: 3350000 },
    { code: 'HUC-TTGLC5ST380', newSell: 4050000 },
    // Tủ bếp trên hợp kim
    { code: 'HUC-TTHKA4T350', newSell: 3850000 },
    { code: 'HUC-TTHKC5ST350', newSell: 4500000 },
    // Tủ bếp dưới ghép nhỏ
    { code: 'HUC-TDGNA4T560', newSell: 3100000 },
    { code: 'HUC-TDGNC5ST560', newSell: 3700000 },
    // Tủ bếp dưới ghép lớn
    { code: 'HUC-TDGLA4T560', newSell: 3950000 },
    { code: 'HUC-TDGLC5ST560', newSell: 4650000 },
    // Tủ bếp dưới hợp kim  
    { code: 'HUC-TDHKA4T550', newSell: 4450000 },
    { code: 'HUC-TDHKC5ST600', newSell: 5250000 },
    // Bàn đảo 1 mặt ghép nhỏ
    { code: 'HUC-D1GNA4T560', newSell: 3800000 },
    { code: 'HUC-D1GNC5ST560', newSell: 4400000 },
    // Bàn đảo 1 mặt hợp kim
    { code: 'HUC-D1HKA4T550', newSell: 5550000 },
    { code: 'HUC-D1HKC5ST550', newSell: 6250000 },
    // Bàn đảo 2 mặt
    { code: 'HUC-D2GNA4T560', newSell: 3950000 },
    { code: 'HUC-D2HKC5ST600', newSell: 7100000 },
    // Hộc kéo
    { code: 'HUC-D2GLB', newSell: 750000 },
    { code: 'HUC-D2GLA', newSell: 850000 },
    { code: 'HUC-D2HKB', newSell: 1100000 },
    { code: 'HUC-D2HKA', newSell: 1200000 },
    // Tủ đứng
    { code: 'HUC-D2GN630A4T400', newSell: 2950000 },
    { code: 'HUC-DHK700C5ST400', newSell: 4800000 },
    // Tủ lạnh
    { code: 'HUC-LGN630A4T700', newSell: 2500000 },
    { code: 'HUC-LHK700C5ST1000', newSell: 4600000 },
    // Tủ đồ khô  
    { code: 'HUC-KGNA4T500', newSell: 2800000 },
    { code: 'HUC-KHKC5STH600', newSell: 4850000 },
    // Tầng nhôm
    { code: 'HUC-TNGN', newSell: 950000 },
    { code: 'HUC-TNGL', newSell: 1200000 },
    { code: 'HUC-TNHK350', newSell: 700000 },
    // Mặt nạ bếp
    { code: 'HUC-MNGNA4T', newSell: 2050000 },
    { code: 'HUC-MNHKC4T', newSell: 2950000 },
    // Hộc khay thìa
    { code: 'HUC-HTGNB', newSell: 375000 },
    { code: 'HUC-HTGB', newSell: 575000 },
    // Tủ lạnh ghép lớn 650
    { code: 'HUC-LGL650A4T700', newSell: 2850000 },
    { code: 'HUC-LGL650C5ST1000', newSell: 4000000 },
    // Tủ đứng 650/700
    { code: 'HUC-DGL650A4T400', newSell: 3700000 },
    { code: 'HUC-DHK650C5STH500', newSell: 5475000 },
    { code: 'HUC-DHK700A4TH500', newSell: 5100000 },
  ];
  
  const codes = testCases.map(t => t.code);
  const { data: current } = await supabase.from('products')
    .select('code, selling_price, base_price')
    .in('code', codes);
  
  const currentMap = {};
  (current || []).forEach(p => { currentMap[p.code] = p; });
  
  let allMatch150k = true;
  let diffs = {};
  
  console.log('=== PRICE DIFF ANALYSIS ===');
  for (const tc of testCases) {
    const cur = currentMap[tc.code];
    if (!cur) {
      console.log(`${tc.code}: NOT FOUND in DB (new product?)`);
      diffs['NOT_FOUND'] = (diffs['NOT_FOUND'] || 0) + 1;
      allMatch150k = false;
      continue;
    }
    const diff = tc.newSell - cur.selling_price;
    diffs[diff] = (diffs[diff] || 0) + 1;
    if (diff !== 150000) allMatch150k = false;
    const marker = diff === 150000 ? '✓' : '✗';
    console.log(`${marker} ${tc.code}: old=${cur.selling_price} new=${tc.newSell} diff=${diff}`);
  }
  
  console.log('\n=== DIFF DISTRIBUTION ===');
  for (const [diff, count] of Object.entries(diffs)) {
    console.log(`  +${diff}: ${count} products`);
  }
  console.log('\nAll +150k?', allMatch150k);
}

run().catch(console.error);
