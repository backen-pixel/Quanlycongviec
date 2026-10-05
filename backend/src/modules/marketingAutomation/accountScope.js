'use strict';
// req.user is supplied by authentication; never pass body/model fields here.
function accountCompanyScope(user, { tenantEnforced, tenantCompanyIds } = {}) {
  if (!user) return [];
  if (user.role === 'platform_admin') return null;
  const company = typeof user.company_id === 'string' && user.company_id ? user.company_id : null;
  const tenants = tenantEnforced === true && Array.isArray(tenantCompanyIds) ? tenantCompanyIds : null;
  if (user.role === 'ecosystem_admin' || (user.role === 'admin' && !company)) return tenants || [];
  if (!company || (tenantEnforced === true && (!tenants || !tenants.includes(company)))) return [];
  return [company];
}
module.exports = { accountCompanyScope };
