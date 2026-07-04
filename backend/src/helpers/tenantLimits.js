const { supabase } = require('../config/supabase');
const { getTenantLimits } = require('./tenantScope');

async function checkUserLimit(tenantId) {
  if (!tenantId) return { ok: true };
  const limits = await getTenantLimits(tenantId);
  if (!limits || !limits.max_users) return { ok: true };
  const { count } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('is_active', true);
  if ((count || 0) >= limits.max_users) {
    return { ok: false, error: `Đã đạt giới hạn ${limits.max_users} người dùng cho gói ${limits.tier}` };
  }
  return { ok: true, current: count, max: limits.max_users };
}

async function checkCompanyLimit(tenantId) {
  if (!tenantId) return { ok: true };
  const limits = await getTenantLimits(tenantId);
  if (!limits || !limits.max_companies) return { ok: true };
  const { count } = await supabase
    .from('companies')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  if ((count || 0) >= limits.max_companies) {
    return { ok: false, error: `Đã đạt giới hạn ${limits.max_companies} công ty cho gói ${limits.tier}` };
  }
  return { ok: true, current: count, max: limits.max_companies };
}

module.exports = { checkUserLimit, checkCompanyLimit };
