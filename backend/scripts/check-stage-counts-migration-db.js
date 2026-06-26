require('dotenv').config();
const { supabase } = require('../src/config/supabase');

async function main() {
  const { data, error } = await supabase.rpc('crm_leads_stage_counts', { p_type: 'deal' });
  if (error) {
    console.error('RPC_ERROR:', error.message);
    process.exit(1);
  }

  let v = data;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { /* keep */ }
  }

  const keys = v && typeof v === 'object' ? Object.keys(v).sort() : [];
  const hasValues = keys.includes('values');
  const hasWeighted = keys.includes('weighted_values');

  console.log('SOURCE: supabase_rpc_direct');
  console.log('RPC_RETURN_KEYS:', keys.join(', '));
  console.log('HAS_VALUES:', hasValues);
  console.log('HAS_WEIGHTED_VALUES:', hasWeighted);
  console.log('MIGRATION_365_IN_DB:', hasValues && hasWeighted ? 'YES' : 'NO');
}

main().catch((e) => {
  console.error('ERR:', e.message);
  process.exit(1);
});
