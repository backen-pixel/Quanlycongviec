// CONTINUE: Update remaining products (330+ done, continue from where left off)
// Use BATCH upsert instead of individual updates for speed
process.chdir('/home/ubuntu/.openclaw/workspace/employee-workflow/backend');
require('dotenv').config();
const { supabase } = require('./src/config/supabase');

function parseProductName(name) {
  const r = { code_group: null, code_spec: null, code_standard: null, code_glass: null, code_side: null, code_type_std: null, code_size: null, dimensions: null };
  if (name.startsWith('Tủ bếp trên')) r.code_group = 'Tủ bếp trên';
  else if (name.startsWith('Tủ bếp dưới')) r.code_group = 'Tủ bếp dưới';
  else if (name.startsWith('Bàn đảo 1 mặt')) r.code_group = 'Bàn đảo 1 mặt';
  else if (name.startsWith('Bàn đảo 2 mặt')) r.code_group = 'Bàn đảo 2 mặt';
  else if (name.startsWith('Tủ đứng')) r.code_group = 'Tủ đứng';
  else if (name.startsWith('Tủ lạnh')) r.code_group = 'Tủ lạnh';
  if (name.includes('nhôm lá ghép nhỏ')) r.code_spec = 'Nhôm lá ghép nhỏ';
  else if (name.includes('nhôm lá ghép lớn')) r.code_spec = 'Nhôm lá ghép lớn';
  else if (name.includes('nhôm lá ghép')) r.code_spec = 'Nhôm lá ghép';
  else if (name.includes('nhôm hợp kim')) r.code_spec = 'Nhôm hợp kim';
  if (name.includes('tay nắm vác âm')) r.code_standard = 'Tay nắm vác âm';
  else if (/tay nắm [cC][nN][cC]/.test(name)) r.code_standard = 'Tay nắm CNC';
  if (name.includes('kính 4 ly thường')) r.code_glass = 'Kính 4 ly thường';
  else if (name.includes('kính 4 ly siêu trong')) r.code_glass = 'Kính 4 ly siêu trong';
  else if (name.includes('kính 5 ly thường')) r.code_glass = 'Kính 5 ly thường';
  else if (name.includes('kính 5 ly cường lực')) r.code_glass = 'Kính 5 ly cường lực';
  else if (name.includes('kính 5 ly siêu trong')) r.code_glass = 'Kính 5 ly siêu trong';
  if (name.includes('kính hông')) r.code_side = 'Kính hông';
  const dm = name.match(/(\d)\s*cánh/); if (dm) r.code_type_std = `${dm[1]} cánh`;
  const sm = name.match(/(\d+)\s*x\s*(\d+)\s*$/); 
  if (sm) { r.code_size = `${sm[1]} x ${sm[2]}`; r.dimensions = { ngang: parseInt(sm[1]), cao: parseInt(sm[2]) }; }
  return r;
}

function getIncrease(name) {
  if (name.startsWith('Hộc khay thìa')) return 25000;
  if (name.startsWith('Hộc kéo')) return 50000;
  return 150000;
}

async function run() {
  // Check what was already updated (selling_price should match new expected)
  const { data: sample } = await supabase.from('products')
    .select('code, selling_price')
    .eq('code', 'HUC-TTGNC4T380');
  
  const alreadyUpdated = sample && sample[0] && sample[0].selling_price === 3150000;
  
  if (alreadyUpdated) {
    console.log('Some products already updated. Checking which ones need update...');
  }
  
  // Get ALL products - check which still need price update
  let all = [];
  let off = 0;
  while (true) {
    const { data } = await supabase.from('products')
      .select('id, code, name, base_price, selling_price, code_group')
      .like('code', 'HUC-%')
      .range(off, off + 499);
    if (!data || data.length === 0) break;
    all = all.concat(data);
    off += data.length;
    if (data.length < 500) break;
  }
  console.log('Total HUC products:', all.length);
  
  // Determine which need update: check if code_group is still wrong (e.g. "HUC") or metadata is missing
  const needUpdate = [];
  const alreadyOk = [];
  
  for (const p of all) {
    const meta = parseProductName(p.name);
    const inc = getIncrease(p.name);
    
    // Expected new selling price
    const expectedSell = (() => {
      // For products that were already updated in the first batch run
      // We need to detect if the price was already increased
      // Check: does current code_group look correct (not "HUC")?
      if (p.code_group && p.code_group !== 'HUC' && meta.code_group && p.code_group === meta.code_group) {
        // Metadata already updated, price likely already updated too
        return p.selling_price; // keep as-is
      }
      return p.selling_price + inc;
    })();
    
    // Check if metadata needs update
    const needsMeta = !p.code_group || p.code_group === 'HUC';
    const needsPrice = p.code_group === 'HUC' || !p.code_group;
    
    if (needsMeta || needsPrice) {
      const newSell = p.selling_price + inc;
      const newBase = Math.round(newSell / 1.1);
      needUpdate.push({
        id: p.id,
        code: p.code,
        base_price: newBase,
        selling_price: newSell,
        ...meta
      });
    } else {
      alreadyOk.push(p.code);
    }
  }
  
  console.log('Already updated:', alreadyOk.length);
  console.log('Need update:', needUpdate.length);
  
  if (needUpdate.length === 0) {
    console.log('All products already up to date!');
    // Just verify
    const { data: v } = await supabase.from('products')
      .select('code, selling_price, code_group, code_glass')
      .in('code', ['HUC-TTGNA4T380', 'HUC-TDGNA4T560', 'HUC-D2GLB', 'HUC-HTGNB', 'HUC-DHK700C5ST400']);
    console.log('\nVerification:');
    (v || []).forEach(p => console.log(`  ${p.code}: sell=${p.selling_price} grp=${p.code_group} gl=${p.code_glass}`));
    return;
  }
  
  // Apply using upsert (faster than individual updates)
  let ok = 0, fail = 0;
  for (let i = 0; i < needUpdate.length; i += 50) {
    const batch = needUpdate.slice(i, i + 50);
    // Upsert by id
    const upsertBatch = batch.map(u => {
      const { code, ...rest } = u;
      return { ...rest, code };
    });
    
    const { data, error } = await supabase.from('products')
      .upsert(upsertBatch, { onConflict: 'code' })
      .select('id');
    
    if (error) {
      console.error(`Batch ${i}: ${error.message}`);
      // Fallback single
      for (const u of batch) {
        const { id, code, ...fields } = u;
        const { error: e2 } = await supabase.from('products').update(fields).eq('id', id);
        if (e2) { fail++; } else { ok++; }
      }
    } else {
      ok += (data || []).length;
    }
    if (i % 200 === 0) console.log(`  ${Math.min(i+50, needUpdate.length)}/${needUpdate.length}`);
  }
  
  console.log(`\nDone: OK=${ok} FAIL=${fail}`);
  
  // Final verification
  const { data: v } = await supabase.from('products')
    .select('code, selling_price, base_price, code_group, code_glass, dimensions')
    .in('code', ['HUC-TTGNA4T380', 'HUC-TDGNA4T560', 'HUC-D2GLB', 'HUC-HTGNB', 'HUC-LHK700C5ST1000', 'HUC-DHK700C5ST400']);
  
  console.log('\n=== FINAL VERIFICATION ===');
  const expected = {
    'HUC-TTGNA4T380': 2700000, 'HUC-TDGNA4T560': 3100000,
    'HUC-D2GLB': 750000, 'HUC-HTGNB': 375000,
    'HUC-LHK700C5ST1000': 4600000, 'HUC-DHK700C5ST400': 4800000,
  };
  let correct = 0;
  (v || []).forEach(p => {
    const exp = expected[p.code];
    const match = exp ? (p.selling_price === exp ? '✅' : `❌ expected ${exp}`) : '?';
    console.log(`${match} ${p.code}: sell=${p.selling_price} grp=${p.code_group} gl=${p.code_glass} dim=${JSON.stringify(p.dimensions)}`);
    if (exp && p.selling_price === exp) correct++;
  });
  console.log(`\n${correct}/${Object.keys(expected).length} prices correct`);
}

run().catch(console.error);
