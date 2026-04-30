const { supabase } = require('../config/supabase');
const { getRestrictedDivisionIdsForModule } = require('./ecosystemModuleScope');

/**
 * Kiểm tra công ty được phép dùng cho module Sản xuất (cùng logic GET /companies?for_module=production).
 * @returns {Promise<{ ok: true, company: object } | { ok: false, error: string }>}
 */
async function validateProductionCompanyId(rawId) {
  const id = String(rawId || '').trim();
  if (!id) {
    return { ok: false, error: 'Vui lòng chọn công ty thuộc module Sản xuất.' };
  }
  const { data: co, error } = await supabase
    .from('companies')
    .select('id, name, short_name, division_unit_id, is_active')
    .eq('id', id)
    .maybeSingle();
  if (error || !co) {
    return { ok: false, error: 'Công ty không tồn tại.' };
  }
  if (co.is_active === false) {
    return { ok: false, error: 'Công ty đã ngưng hoạt động.' };
  }
  const restricted = await getRestrictedDivisionIdsForModule('production');
  if (restricted && restricted.size > 0) {
    const div = co.division_unit_id ? String(co.division_unit_id) : '';
    if (!restricted.has(div)) {
      return {
        ok: false,
        error: 'Công ty được chọn không thuộc phạm vi module Sản xuất.',
      };
    }
  }
  return { ok: true, company: co };
}

module.exports = { validateProductionCompanyId };
