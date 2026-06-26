const { supabase } = require('../config/supabase');
const { getRestrictedDivisionIdsForModule } = require('./ecosystemModuleScope');

let cachedIds = null;
let cachedAt = 0;
const TTL_MS = 60_000;

/** ID công ty thuộc khối CRM (khớp GET /companies?for_module=crm). */
async function listCrmModuleCompanyIds() {
  const now = Date.now();
  if (cachedIds && now - cachedAt < TTL_MS) return cachedIds;

  const restricted = await getRestrictedDivisionIdsForModule('crm');
  let q = supabase
    .from('companies')
    .select('id')
    .or('is_active.eq.true,is_active.is.null');
  if (restricted && restricted.size > 0) {
    const ids = [...restricted];
    const { data: linkRows, error: linkErr } = await supabase
      .from('company_division_units')
      .select('company_id')
      .in('division_unit_id', ids);
    const fromLinks = !linkErr && linkRows?.length
      ? [...new Set(linkRows.map((r) => r.company_id).filter(Boolean))]
      : [];
    const orParts = [`division_unit_id.in.(${ids.join(',')})`];
    if (fromLinks.length) orParts.push(`id.in.(${fromLinks.join(',')})`);
    q = q.or(orParts.join(','));
  }
  const { data, error } = await q;
  if (error) throw error;
  cachedIds = (data || []).map((c) => c.id).filter(Boolean);
  cachedAt = now;
  return cachedIds;
}

module.exports = { listCrmModuleCompanyIds };
