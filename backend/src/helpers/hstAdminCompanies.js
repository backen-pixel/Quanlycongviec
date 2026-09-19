/**
 * Admin hệ thống / ecosystem_admin: gắn mọi công ty trong HST qua user_companies.
 * Không ghi users.company_id — vẫn không khoá 1 công ty.
 */
const { supabase } = require('../config/supabase');
const { isSystemAdmin, hasTenantId } = require('./adminRole');
const { getTenantCompanyIds } = require('./tenantScope');

function userIdOf(user) {
  return user?.id || user?.userId || null;
}

async function syncHstAdminUserCompanies(user) {
  const userId = userIdOf(user);
  if (!userId || !isSystemAdmin(user) || !hasTenantId(user)) {
    return { added: 0, skipped: true };
  }
  const companyIds = await getTenantCompanyIds(user.tenant_id);
  if (!companyIds.length) return { added: 0 };
  const { data: activeRows, error: activeErr } = await supabase
    .from('companies')
    .select('id')
    .in('id', companyIds)
    .or('is_active.eq.true,is_active.is.null');
  if (activeErr) {
    console.warn('[syncHstAdminUserCompanies] active', activeErr.message);
    return { added: 0, error: activeErr.message };
  }
  const activeIds = (activeRows || []).map((r) => String(r.id));
  if (!activeIds.length) return { added: 0 };
  const { data: existing, error } = await supabase
    .from('user_companies')
    .select('company_id')
    .eq('user_id', userId);
  if (error) {
    console.warn('[syncHstAdminUserCompanies]', error.message);
    return { added: 0, error: error.message };
  }
  const have = new Set((existing || []).map((r) => String(r.company_id)));
  const rows = activeIds
    .filter((id) => !have.has(String(id)))
    .map((company_id) => ({ user_id: userId, company_id, is_primary: false }));
  if (!rows.length) return { added: 0 };
  const { error: insErr } = await supabase.from('user_companies').insert(rows);
  if (insErr && insErr.code !== '23505') {
    console.warn('[syncHstAdminUserCompanies] insert', insErr.message);
    return { added: 0, error: insErr.message };
  }
  return { added: rows.length };
}

async function attachCompanyToTenantHstAdmins(tenantId, companyId) {
  if (!tenantId || !companyId) return { added: 0 };
  const { data: users, error } = await supabase
    .from('users')
    .select('id, role, company_id, tenant_id')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .in('role', ['ecosystem_admin', 'admin']);
  if (error) {
    console.warn('[attachCompanyToTenantHstAdmins]', error.message);
    return { added: 0 };
  }
  const admins = (users || []).filter((u) => isSystemAdmin(u));
  let added = 0;
  for (const u of admins) {
    const { error: insErr } = await supabase.from('user_companies').insert({
      user_id: u.id,
      company_id: companyId,
      is_primary: false,
    });
    if (!insErr) added += 1;
    else if (insErr.code !== '23505') {
      console.warn('[attachCompanyToTenantHstAdmins]', insErr.message);
    }
  }
  return { added };
}

module.exports = {
  syncHstAdminUserCompanies,
  attachCompanyToTenantHstAdmins,
};
