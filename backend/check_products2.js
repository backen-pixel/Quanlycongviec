process.chdir('/home/ubuntu/.openclaw/workspace/employee-workflow/backend');
require('dotenv').config();
const { supabase } = require('./src/config/supabase');

(async () => {
  // Get ALL current products
  const { data: current } = await supabase.from('products').select('code, name, selling_price, base_price, dimensions');
  const currentByCode = {};
  (current || []).forEach(p => { if (p.code) currentByCode[p.code] = p; });
  console.log('Total current products:', Object.keys(currentByCode).length);

  // Parse the new SQL codes from the INSERT statement
  // Using the codes from the SQL the user provided
  const newProducts = [
    { code: 'HUC-TTGNA4T380', sell: 2700000, base: 2454545 },
    { code: 'HUC-TTGNC4T380', sell: 3150000, base: 2863636 },
    { code: 'HUC-TTGNA4ST380', sell: 2800000, base: 2545455 },
    { code: 'HUC-TTHKA4T350', sell: 3850000, base: 3500000 },
    { code: 'HUC-TDGNA4T560', sell: 3100000, base: 2818182 },
    { code: 'HUC-D1GNA4T560', sell: 3800000, base: 3454545 },
  ];

  // Compare prices
  let priceChanged = 0;
  let priceUnchanged = 0;
  let notFound = 0;

  // Actually compare ALL codes
  const { data: allCurrent } = await supabase.from('products').select('code, selling_price, base_price');
  const codeMap = {};
  (allCurrent || []).forEach(p => { if (p.code) codeMap[p.code] = p; });

  // Check sample comparisons
  console.log('\n=== PRICE COMPARISON (sample) ===');
  for (const np of newProducts) {
    const cp = codeMap[np.code];
    if (cp) {
      const changed = cp.selling_price !== np.sell || cp.base_price !== np.base;
      console.log(
        np.code, '|',
        changed ? 'CHANGED' : 'SAME',
        '| old sell:', cp.selling_price, '-> new:', np.sell,
        '| old base:', cp.base_price, '-> new:', np.base
      );
      if (changed) priceChanged++;
      else priceUnchanged++;
    } else {
      console.log(np.code, '| NOT FOUND in DB');
      notFound++;
    }
  }

  // Check if dimensions column has data currently
  const { data: withDim } = await supabase.from('products')
    .select('code')
    .not('dimensions', 'is', null)
    .limit(1);
  console.log('\nProducts with dimensions data:', (withDim || []).length > 0 ? 'YES' : 'NONE (all null)');

  // Check if code_group etc have data  
  const { data: withGroup } = await supabase.from('products')
    .select('code, code_group, code_spec, code_glass')
    .not('code_group', 'is', null)
    .limit(3);
  console.log('Products with code_group:', (withGroup || []).length > 0 ? 'YES' : 'NONE');
  (withGroup || []).forEach(p => console.log('  ', p.code, '| group:', p.code_group, '| spec:', p.code_spec, '| glass:', p.code_glass));
})();
