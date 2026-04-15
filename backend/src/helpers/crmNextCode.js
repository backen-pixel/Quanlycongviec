const { supabase } = require('../config/supabase');

/** LEAD-2026-001, DEAL-2026-001 — đồng bộ với bảng code_sequences như CRM */
async function nextCrmCode(prefix) {
  const year = new Date().getFullYear();
  const { data } = await supabase.from('code_sequences').select('current_number, year').eq('prefix', prefix).single();
  let num = 1;
  if (data) {
    num = data.year === year ? data.current_number + 1 : 1;
  }
  await supabase.from('code_sequences').upsert({ prefix, current_number: num, year });
  return `${prefix}-${year}-${String(num).padStart(3, '0')}`;
}

module.exports = { nextCrmCode };
