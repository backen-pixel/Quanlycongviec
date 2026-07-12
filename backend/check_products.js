process.chdir('/home/ubuntu/.openclaw/workspace/employee-workflow/backend');
require('dotenv').config();
const { supabase } = require('./src/config/supabase');

(async () => {
  // 1. Check current products table structure
  const { data: sample } = await supabase.from('products').select('*').limit(1);
  const currentCols = sample && sample[0] ? Object.keys(sample[0]) : [];
  console.log('=== CURRENT COLUMNS ===');
  console.log(currentCols.join(', '));
  
  // 2. Check which new columns exist
  const newCols = ['code_group', 'code_spec', 'code_standard', 'code_glass', 'code_side', 'code_type_std', 'code_size'];
  const missing = newCols.filter(c => !currentCols.includes(c));
  console.log('\nNew columns MISSING:', missing.join(', ') || 'NONE');

  // 3. Count current products
  const { count } = await supabase.from('products').select('id', { count: 'exact', head: true });
  console.log('\nCurrent product count:', count);

  // 4. Sample
  const { data: prods } = await supabase.from('products')
    .select('id, code, name, base_price, selling_price, dimensions, unit')
    .limit(5);
  console.log('\n=== SAMPLE ===');
  (prods || []).forEach(p => {
    console.log('  code:', p.code, '| name:', (p.name||'').slice(0,50), '| sell:', p.selling_price, '| dim:', p.dimensions);
  });

  // 5. HUC codes?
  const { count: hucCount } = await supabase.from('products')
    .select('id', { count: 'exact', head: true })
    .like('code', 'HUC-%');
  console.log('\nHUC- products:', hucCount);

  // 6. Overlap check
  const { data: m1 } = await supabase.from('products').select('id, code, name').ilike('name', '%700 x 380%').limit(3);
  console.log('\nProducts with "700 x 380":', (m1||[]).length);
  (m1||[]).forEach(m => console.log('  ', m.code, m.name?.slice(0,60)));

  const { data: m2 } = await supabase.from('products').select('id, code, name').ilike('name', '%790 x 560%').limit(3);
  console.log('Products with "790 x 560":', (m2||[]).length);
  (m2||[]).forEach(m => console.log('  ', m.code, m.name?.slice(0,60)));
})();
