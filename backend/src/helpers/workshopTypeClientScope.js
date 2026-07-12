const { supabase } = require('../config/supabase');

/**
 * Lọc phân loại xưởng theo công ty CRM đặt hàng.
 * Type không có dòng trong production_workshop_type_clients → mọi khách ngoài đều thấy.
 */
async function filterWorkshopProjectTypesForClientCompany(workshopCompanyId, clientCompanyId, types) {
  if (!clientCompanyId || !Array.isArray(types) || types.length === 0) return types || [];

  const wId = String(workshopCompanyId || '').trim();
  const cId = String(clientCompanyId || '').trim();
  if (!wId || !cId || wId === cId) return types;

  const { data: links, error } = await supabase
    .from('production_workshop_type_clients')
    .select('workshop_type_id, client_company_id')
    .eq('production_company_id', wId);

  if (error) {
    if (String(error.message || '').includes('does not exist')) return types;
    console.warn('[workshopTypeClientScope] links:', error.message);
    return types;
  }

  const restricted = new Map();
  for (const row of links || []) {
    const tid = String(row.workshop_type_id || '');
    if (!tid) continue;
    if (!restricted.has(tid)) restricted.set(tid, new Set());
    restricted.get(tid).add(String(row.client_company_id));
  }

  return types.filter((t) => {
    const allowed = restricted.get(String(t.id));
    if (!allowed || allowed.size === 0) return true;
    return allowed.has(cId);
  });
}

module.exports = {
  filterWorkshopProjectTypesForClientCompany,
};
