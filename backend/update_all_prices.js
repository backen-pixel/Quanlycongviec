// FULL UPDATE: prices + metadata for ALL 630 HUC products
// Strategy: 
// 1. Apply price increases: +150k (most), +50k (hộc kéo), +25k (hộc khay thìa)
// 2. Update metadata (code_group, code_spec, code_standard, code_glass, code_side, code_type_std, code_size, dimensions)
//    by parsing product name patterns
process.chdir('/home/ubuntu/.openclaw/workspace/employee-workflow/backend');
require('dotenv').config();
const { supabase } = require('./src/config/supabase');

function parseProductName(name, code) {
  const result = { code_group: null, code_spec: null, code_standard: null, code_glass: null, code_side: null, code_type_std: null, code_size: null, dimensions: null };
  
  // code_group: product type
  if (name.startsWith('Tủ bếp trên')) result.code_group = 'Tủ bếp trên';
  else if (name.startsWith('Tủ bếp dưới')) result.code_group = 'Tủ bếp dưới';
  else if (name.startsWith('Bàn đảo 1 mặt')) result.code_group = 'Bàn đảo 1 mặt';
  else if (name.startsWith('Bàn đảo 2 mặt')) result.code_group = 'Bàn đảo 2 mặt';
  else if (name.startsWith('Tủ đứng')) result.code_group = 'Tủ đứng';
  else if (name.startsWith('Tủ lạnh')) result.code_group = 'Tủ lạnh';
  else if (name.startsWith('Tủ đồ khô')) result.code_group = null; // SQL has NULL for this
  else if (name.startsWith('Hộc kéo')) result.code_group = null;
  else if (name.startsWith('Hộc khay thìa')) result.code_group = null;
  else if (name.startsWith('Tầng nhôm')) result.code_group = null;
  else if (name.startsWith('Mặt nạ bếp')) result.code_group = null;
  
  // code_spec: material type
  if (name.includes('nhôm lá ghép nhỏ')) result.code_spec = 'Nhôm lá ghép nhỏ';
  else if (name.includes('nhôm lá ghép lớn')) result.code_spec = 'Nhôm lá ghép lớn';
  else if (name.includes('nhôm lá ghép')) result.code_spec = 'Nhôm lá ghép';
  else if (name.includes('nhôm hợp kim')) result.code_spec = 'Nhôm hợp kim';
  
  // code_standard: handle type
  if (name.includes('tay nắm vác âm')) result.code_standard = 'Tay nắm vác âm';
  else if (name.includes('tay nắm cnc') || name.includes('tay nắm CNC')) result.code_standard = 'Tay nắm CNC';
  
  // code_glass: glass type
  if (name.includes('kính 4 ly thường') || name.includes('kính 4 ly thường')) result.code_glass = 'Kính 4 ly thường';
  else if (name.includes('kính 4 ly siêu trong')) result.code_glass = 'Kính 4 ly siêu trong';
  else if (name.includes('kính 5 ly thường')) result.code_glass = 'Kính 5 ly thường';
  else if (name.includes('kính 5 ly cường lực')) result.code_glass = 'Kính 5 ly cường lực';
  else if (name.includes('kính 5 ly siêu trong')) result.code_glass = 'Kính 5 ly siêu trong';
  
  // code_side: side glass
  if (name.includes('kính hông')) result.code_side = 'Kính hông';
  
  // code_type_std: door count
  const doorMatch = name.match(/(\d)\s*cánh/);
  if (doorMatch) result.code_type_std = `${doorMatch[1]} cánh`;
  
  // code_size & dimensions: extract from end of name (NxM pattern)
  const sizeMatch = name.match(/(\d+)\s*x\s*(\d+)\s*$/);
  if (sizeMatch) {
    result.code_size = `${sizeMatch[1]} x ${sizeMatch[2]}`;
    result.dimensions = { ngang: parseInt(sizeMatch[1]), cao: parseInt(sizeMatch[2]) };
  }
  
  return result;
}

function getPriceIncrease(name, code) {
  // Hộc khay thìa: +25k
  if (name.startsWith('Hộc khay thìa')) return 25000;
  // Hộc kéo: +50k
  if (name.startsWith('Hộc kéo')) return 50000;
  // Everything else: +150k
  return 150000;
}

async function run() {
  // Get all HUC products
  let allProducts = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase.from('products')
      .select('id, code, name, base_price, selling_price')
      .like('code', 'HUC-%')
      .range(offset, offset + 499);
    if (!data || data.length === 0) break;
    allProducts = allProducts.concat(data);
    offset += data.length;
    if (data.length < 500) break;
  }
  
  console.log('Total products to update:', allProducts.length);
  
  // Build update payloads
  const updates = [];
  for (const p of allProducts) {
    const increase = getPriceIncrease(p.name, p.code);
    const newSell = p.selling_price + increase;
    const newBase = Math.round(newSell / 1.1);
    const meta = parseProductName(p.name, p.code);
    
    updates.push({
      id: p.id,
      code: p.code,
      base_price: newBase,
      selling_price: newSell,
      dimensions: meta.dimensions,
      code_group: meta.code_group,
      code_spec: meta.code_spec,
      code_standard: meta.code_standard,
      code_glass: meta.code_glass,
      code_side: meta.code_side,
      code_type_std: meta.code_type_std,
      code_size: meta.code_size,
    });
  }
  
  // Verify a few before applying
  console.log('\n=== PREVIEW (before applying) ===');
  const previews = ['HUC-TTGNA4T380', 'HUC-D2GLB', 'HUC-HTGNB', 'HUC-LHK700C5ST1000', 'HUC-DHK700A4TH500'];
  for (const code of previews) {
    const cur = allProducts.find(p => p.code === code);
    const upd = updates.find(u => u.code === code);
    if (cur && upd) {
      console.log(`${code}:`);
      console.log(`  sell: ${cur.selling_price} -> ${upd.selling_price} (+${upd.selling_price - cur.selling_price})`);
      console.log(`  base: ${cur.base_price} -> ${upd.base_price}`);
      console.log(`  group: ${upd.code_group} | spec: ${upd.code_spec} | glass: ${upd.code_glass}`);
      console.log(`  dim: ${JSON.stringify(upd.dimensions)} | size: ${upd.code_size}`);
    }
  }
  
  // HUC-TTGNA4T380 was already updated in test - check if it needs correction
  const ttgna = updates.find(u => u.code === 'HUC-TTGNA4T380');
  const ttgnaCur = allProducts.find(p => p.code === 'HUC-TTGNA4T380');
  if (ttgnaCur && ttgnaCur.selling_price === 2700000) {
    // Already at new price, don't double-increase
    console.log('\nHUC-TTGNA4T380 already at 2700000, skipping price increase');
    ttgna.selling_price = 2700000;
    ttgna.base_price = Math.round(2700000 / 1.1);
  }
  
  // Apply updates in batches
  console.log('\n=== APPLYING UPDATES ===');
  let ok = 0, fail = 0;
  
  for (let i = 0; i < updates.length; i += 30) {
    const batch = updates.slice(i, i + 30);
    
    // Use individual updates by ID for reliability
    for (const u of batch) {
      const { id, code, ...fields } = u;
      const { error } = await supabase.from('products')
        .update(fields)
        .eq('id', id);
      
      if (error) {
        console.error(`FAIL ${code}: ${error.message}`);
        fail++;
      } else {
        ok++;
      }
    }
    
    if (i % 150 === 0) {
      console.log(`  Progress: ${Math.min(i + 30, updates.length)}/${updates.length} (ok:${ok} fail:${fail})`);
    }
  }
  
  console.log(`\n=== RESULT ===`);
  console.log(`OK: ${ok} | FAIL: ${fail} | Total: ${updates.length}`);
  
  // Verify final state
  console.log('\n=== VERIFICATION ===');
  const verifyCodes = ['HUC-TTGNA4T380', 'HUC-TDGNA4T560', 'HUC-D2GLB', 'HUC-HTGNB', 'HUC-LHK700C5ST1000'];
  const { data: verified } = await supabase.from('products')
    .select('code, selling_price, base_price, code_group, code_spec, code_glass, code_side, dimensions')
    .in('code', verifyCodes);
  
  (verified || []).forEach(p => {
    console.log(`${p.code}: sell=${p.selling_price} base=${p.base_price} grp=${p.code_group} spec=${p.code_spec} glass=${p.code_glass} dim=${JSON.stringify(p.dimensions)}`);
  });
  
  // Check expected new prices
  const expected = {
    'HUC-TTGNA4T380': 2700000,
    'HUC-TDGNA4T560': 3100000,
    'HUC-D2GLB': 750000,
    'HUC-HTGNB': 375000,
    'HUC-LHK700C5ST1000': 4600000,
  };
  
  let allCorrect = true;
  for (const v of (verified || [])) {
    const exp = expected[v.code];
    if (exp && v.selling_price !== exp) {
      console.log(`MISMATCH ${v.code}: expected ${exp}, got ${v.selling_price}`);
      allCorrect = false;
    }
  }
  if (allCorrect) console.log('\n✅ All verified prices match expected values!');
}

run().catch(console.error);
