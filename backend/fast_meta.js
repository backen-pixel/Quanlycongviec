// FAST metadata update using batch upsert
process.chdir('/home/ubuntu/.openclaw/workspace/employee-workflow/backend');
require('dotenv').config();
const { supabase } = require('./src/config/supabase');

function parseMeta(name) {
  const m = {};
  if (name.startsWith('Tủ bếp trên')) m.code_group = 'Tủ bếp trên';
  else if (name.startsWith('Tủ bếp dưới')) m.code_group = 'Tủ bếp dưới';
  else if (name.startsWith('Bàn đảo 1 mặt')) m.code_group = 'Bàn đảo 1 mặt';
  else if (name.startsWith('Bàn đảo 2 mặt')) m.code_group = 'Bàn đảo 2 mặt';
  else if (name.startsWith('Tủ đứng')) m.code_group = 'Tủ đứng';
  else if (name.startsWith('Tủ lạnh')) m.code_group = 'Tủ lạnh';
  else m.code_group = null;
  if (name.includes('nhôm lá ghép nhỏ')) m.code_spec = 'Nhôm lá ghép nhỏ';
  else if (name.includes('nhôm lá ghép lớn')) m.code_spec = 'Nhôm lá ghép lớn';
  else if (name.includes('nhôm lá ghép')) m.code_spec = 'Nhôm lá ghép';
  else if (name.includes('nhôm hợp kim')) m.code_spec = 'Nhôm hợp kim';
  else m.code_spec = null;
  if (name.includes('tay nắm vác âm')) m.code_standard = 'Tay nắm vác âm';
  else if (/tay nắm [cC][nN][cC]/.test(name)) m.code_standard = 'Tay nắm CNC';
  else m.code_standard = null;
  if (name.includes('kính 4 ly siêu trong')) m.code_glass = 'Kính 4 ly siêu trong';
  else if (name.includes('kính 4 ly thường')) m.code_glass = 'Kính 4 ly thường';
  else if (name.includes('kính 5 ly siêu trong')) m.code_glass = 'Kính 5 ly siêu trong';
  else if (name.includes('kính 5 ly cường lực')) m.code_glass = 'Kính 5 ly cường lực';
  else if (name.includes('kính 5 ly thường')) m.code_glass = 'Kính 5 ly thường';
  else m.code_glass = null;
  m.code_side = name.includes('kính hông') ? 'Kính hông' : null;
  const dm = name.match(/(\d)\s*cánh/);
  m.code_type_std = dm ? `${dm[1]} cánh` : null;
  const sm = name.match(/(\d+)\s*x\s*(\d+)\s*$/);
  if (sm) { m.code_size = `${sm[1]} x ${sm[2]}`; m.dimensions = {ngang:parseInt(sm[1]),cao:parseInt(sm[2])}; }
  else { m.code_size = null; m.dimensions = null; }
  return m;
}

async function run() {
  let all = [];
  for (let off = 0; ; off += 500) {
    const { data } = await supabase.from('products')
      .select('id, code, name, selling_price, base_price')
      .like('code', 'HUC-%').range(off, off + 499);
    if (!data || !data.length) break;
    all.push(...data);
    if (data.length < 500) break;
  }
  console.log('Total:', all.length);

  // Build upsert payloads with code (for onConflict) + all fields
  const payloads = all.map(p => {
    const meta = parseMeta(p.name);
    return {
      code: p.code,
      name: p.name,
      selling_price: p.selling_price,
      base_price: p.base_price,
      ...meta
    };
  });

  // Batch upsert 100 at a time (much faster than individual updates)
  let ok = 0, fail = 0;
  for (let i = 0; i < payloads.length; i += 100) {
    const batch = payloads.slice(i, i + 100);
    const { data, error } = await supabase.from('products')
      .upsert(batch, { onConflict: 'code' })
      .select('id');
    if (error) {
      console.error(`Batch ${i}: ${error.message}`);
      fail += batch.length;
    } else {
      ok += (data||[]).length;
    }
  }
  console.log(`Done: ${ok} OK, ${fail} FAIL`);

  // Verify
  const checks = ['HUC-TTGNA4T380','HUC-TDGNA4T560','HUC-D2GLB','HUC-HTGNB','HUC-KGNA4T500','HUC-DHK700C5ST400','HUC-LHK700C5ST1000'];
  const { data: v } = await supabase.from('products')
    .select('code, selling_price, code_group, code_glass, code_spec, dimensions')
    .in('code', checks);
  console.log('\nVerification:');
  (v||[]).forEach(p => console.log(`${p.code}: sell=${p.selling_price} grp=${p.code_group} spec=${p.code_spec} gl=${p.code_glass} dim=${JSON.stringify(p.dimensions)}`));
}

run().catch(console.error);
