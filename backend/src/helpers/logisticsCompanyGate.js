const { supabase } = require('../config/supabase');
const { getRestrictedDivisionIdsForModule } = require('./ecosystemModuleScope');

/**
 * Kiểm tra công ty thuộc phạm vi module Vận chuyển & Lắp đặt.
 * @returns {Promise<{ ok: true, company: object } | { ok: false, error: string }>}
 */
async function validateLogisticsCompanyId(rawId) {
  const id = String(rawId || '').trim();
  if (!id) {
    return { ok: false, error: 'Vui lòng chọn công ty thuộc module Vận chuyển.' };
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
  const restricted = await getRestrictedDivisionIdsForModule('logistics');
  if (restricted && restricted.size > 0) {
    const primary = co.division_unit_id ? String(co.division_unit_id) : '';
    let ok = primary && restricted.has(primary);
    if (!ok) {
      try {
        const { data: links, error: linkErr } = await supabase
          .from('company_division_units')
          .select('division_unit_id')
          .eq('company_id', id);
        if (!linkErr && Array.isArray(links) && links.length) {
          ok = links.some((r) => r?.division_unit_id && restricted.has(String(r.division_unit_id)));
        }
      } catch (_e) { /* ignore */ }
    }
    if (!ok) {
      return { ok: false, error: 'Công ty được chọn không thuộc phạm vi module Vận chuyển.' };
    }
  }
  return { ok: true, company: co };
}

module.exports = { validateLogisticsCompanyId };
