// Comprehensive spot-check: verify prices across ALL categories match SQL expected
process.chdir('/home/ubuntu/.openclaw/workspace/employee-workflow/backend');
require('dotenv').config();
const { supabase } = require('./src/config/supabase');

async function run() {
  // Expected from SQL (sampling every category + size variant)
  const expected = {
    // Tủ bếp trên GN
    'HUC-TTGNA4T380': 2700000, 'HUC-TTGNC5ST380': 3400000,
    // Tủ bếp trên GL
    'HUC-TTGLA4T380': 3350000, 'HUC-TTGLC5ST380': 4050000,
    // Tủ bếp trên HK
    'HUC-TTHKA4T350': 3850000, 'HUC-TTHKC5ST350': 4500000,
    // Tủ bếp dưới GN 560
    'HUC-TDGNA4T560': 3100000, 'HUC-TDGNC5ST560': 3700000,
    // Tủ bếp dưới GN 600
    'HUC-TDGNA4T600': 3350000, 'HUC-TDGNC5ST600': 3950000,
    // Tủ bếp dưới GL 560
    'HUC-TDGLA4T560': 3950000, 'HUC-TDGLC5ST560': 4650000,
    // Tủ bếp dưới HK 550
    'HUC-TDHKA4T550': 4450000, 'HUC-TDHKC5ST550': 5050000,
    // Tủ bếp dưới HK 600
    'HUC-TDHKA4T600': 4850000, 'HUC-TDHKC5ST600': 5250000,
    // Bàn đảo 1 mặt GN
    'HUC-D1GNA4T560': 3800000, 'HUC-D1GNC5ST560': 4400000,
    // Bàn đảo 1 mặt GL
    'HUC-D1GLA4T560': 4700000, 'HUC-D1GLC5ST560': 5200000,
    // Bàn đảo 1 mặt HK 550
    'HUC-D1HKA4T550': 5550000, 'HUC-D1HKC5ST550': 6250000,
    // Bàn đảo 1 mặt HK 600
    'HUC-D1HKA4T600': 6000000, 'HUC-D1HKC5ST600': 6700000,
    // Bàn đảo 2 mặt GN
    'HUC-D2GNA4T560': 3950000, 'HUC-D2GNC5ST560': 4550000,
    // Bàn đảo 2 mặt HK 600
    'HUC-D2HKA4T600': 6400000, 'HUC-D2HKC5ST600': 7100000,
    // Hộc kéo
    'HUC-D2GLB': 750000, 'HUC-D2GLA': 850000,
    'HUC-D2HKB': 1100000, 'HUC-D2HKA': 1200000,
    // Hộc khay thìa
    'HUC-HTGNB': 375000, 'HUC-HTGB': 575000,
    // Tầng nhôm
    'HUC-TNGN': 950000, 'HUC-TNGL': 1200000, 'HUC-TNHK350': 700000,
    // Mặt nạ bếp
    'HUC-MNGNA4T': 2050000, 'HUC-MNHKC4T': 2950000,
    // Tủ đứng GN 630
    'HUC-DGN630A4T400': 2950000, 'HUC-DGN630C5ST400': 3650000,
    // Tủ đứng HK 700
    'HUC-DHK700A4T400': 4650000, 'HUC-DHK700C5ST400': 4800000,
    // Tủ đứng 1 cánh
    'HUC-DGN1A4T600': 3250000, 'HUC-DGN1C5ST600': 3950000,
    // Tủ đứng 2 cánh  
    'HUC-DGN2A4T600': 3700000, 'HUC-DGN2C5ST600': 4300000,
    // Tủ lạnh GN 630
    'HUC-LGN630A4T700': 2500000, 'HUC-LGN630C5ST1000': 3700000,
    // Tủ lạnh HK 700
    'HUC-LHK700A4T700': 3700000, 'HUC-LHK700C5ST1000': 4600000,
    // Tủ đồ khô GN
    'HUC-KGNA4T500': 2800000, 'HUC-KGNC5ST500': 3550000,
    // Tủ đồ khô HK H
    'HUC-KHKA4TH600': 4100000, 'HUC-KHKC5STH600': 4850000,
  };
  
  const codes = Object.keys(expected);
  const { data } = await supabase.from('products')
    .select('code, selling_price')
    .in('code', codes);
  
  const map = {};
  (data||[]).forEach(p => { map[p.code] = p.selling_price; });
  
  let ok = 0, bad = 0, missing = 0;
  for (const [code, exp] of Object.entries(expected)) {
    const actual = map[code];
    if (actual === undefined) {
      console.log(`❓ ${code}: NOT FOUND`);
      missing++;
    } else if (actual === exp) {
      ok++;
    } else {
      console.log(`❌ ${code}: got ${actual}, expected ${exp} (diff: ${actual - exp})`);
      bad++;
    }
  }
  
  console.log(`\n=== RESULT: ${ok}✅ ${bad}❌ ${missing}❓ / ${codes.length} total ===`);
  
  if (bad === 0 && missing === 0) {
    console.log('\n🎉 ALL PRICES CORRECT!');
  }
}

run().catch(console.error);
