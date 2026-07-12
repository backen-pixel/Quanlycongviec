// Check code_group correctness by examining mismatches
process.chdir('/home/ubuntu/.openclaw/workspace/employee-workflow/backend');
require('dotenv').config();
const { supabase } = require('./src/config/supabase');

async function run() {
  // Sample products from each code_group to verify correctness
  const groups = ['Tủ bếp trên', 'Tủ bếp dưới', 'Bàn đảo 1 mặt', 'Bàn đảo 2 mặt', 'Tủ đứng', 'Tủ lạnh'];
  
  for (const g of groups) {
    const { data } = await supabase.from('products')
      .select('code, name, code_group')
      .eq('code_group', g)
      .limit(3);
    console.log(`\n${g} (sample):`);
    (data||[]).forEach(p => console.log(`  ${p.code}: ${p.name?.slice(0,60)}`));
  }
  
  // Check: does the name actually match the group?
  // "Tủ đứng" has 250 products - that's suspicious
  const { data: tudung } = await supabase.from('products')
    .select('code, name, code_group')
    .eq('code_group', 'Tủ đứng')
    .limit(10);
  console.log('\n=== "Tủ đứng" 250 products - samples: ===');
  (tudung||[]).forEach(p => console.log(`  ${p.code}: ${p.name?.slice(0,70)}`));
  
  // Tủ lạnh has 150 - check
  const { data: tulanh } = await supabase.from('products')
    .select('code, name, code_group')
    .eq('code_group', 'Tủ lạnh')
    .limit(10);
  console.log('\n=== "Tủ lạnh" 150 products - samples: ===');
  (tulanh||[]).forEach(p => console.log(`  ${p.code}: ${p.name?.slice(0,70)}`));
}

run().catch(console.error);
