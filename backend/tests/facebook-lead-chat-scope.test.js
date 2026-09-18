const assert = require('assert');

function isFacebookHstAdmin(user) {
  const role = String(user?.role || '').toLowerCase();
  const hasCo = user?.company_id != null && String(user.company_id).trim() !== '';
  const hasTenant = user?.tenant_id != null && String(user.tenant_id).trim() !== '';
  if (role === 'ecosystem_admin') return true;
  return (role === 'admin' && !hasCo) || (role === 'platform_admin' && !hasCo) || (role === 'admin' && hasTenant && !hasCo);
}

function contactAllowedByFacebookScope(scope, contact) {
  if (!scope) return false;
  if (scope.mode === 'all') return true;
  if (!contact?.page_id) return false;
  if (!Array.isArray(scope.pageIds)) return false;
  const pid = String(contact.page_id);
  return scope.pageIds.some((p) => String(p) === pid);
}

function companyInTenantContext(req, companyId) {
  if (!req.tenantContext?.enforced) return true;
  if (!companyId) return false;
  return (req.tenantCompanyIds || []).includes(String(companyId));
}

function contactAllowedOnLeadThread(req, scope, contact, lead) {
  if (contactAllowedByFacebookScope(scope, contact)) return true;
  if (!isFacebookHstAdmin(req.user) || !contact || !lead) return false;
  if (req.tenantContext?.enforced === true && lead.company_id && !companyInTenantContext(req, lead.company_id)) {
    return false;
  }
  return true;
}

const hstAdmin = { role: 'ecosystem_admin', company_id: null, tenant_id: 'tenant-default' };
const legacyHstAdmin = { role: 'admin', company_id: null, tenant_id: 'tenant-default' };
const companyAdmin = { role: 'admin', company_id: 'co-a', tenant_id: 'tenant-default' };
const lead = { id: 'lead-1', customer_id: 'cust-1', company_id: 'co-a' };
const contactOtherPage = { id: 'c1', page_id: 'page-x' };
const scopeDealPages = { mode: 'filter', pageIds: ['page-vpt'] };
const reqHst = {
  user: hstAdmin,
  tenantContext: { enforced: true, tenantId: 'tenant-default' },
  tenantCompanyIds: ['co-a', 'co-b'],
};
const reqHstOtherTenantDeal = {
  ...reqHst,
  tenantCompanyIds: ['co-b'],
};

assert.equal(isFacebookHstAdmin(hstAdmin), true);
assert.equal(isFacebookHstAdmin(legacyHstAdmin), true);
assert.equal(isFacebookHstAdmin(companyAdmin), false);
assert.equal(contactAllowedByFacebookScope(scopeDealPages, contactOtherPage), false);
assert.equal(
  contactAllowedOnLeadThread(reqHst, scopeDealPages, contactOtherPage, lead),
  true,
  'admin HST xem thread deal trong HST dù Page không map công ty deal',
);
assert.equal(
  contactAllowedOnLeadThread({ user: companyAdmin }, scopeDealPages, contactOtherPage, lead),
  false,
  'admin một công ty vẫn bị khoá Page không thuộc công ty',
);
assert.equal(
  contactAllowedOnLeadThread(reqHstOtherTenantDeal, scopeDealPages, contactOtherPage, lead),
  false,
  'admin HST không xem deal công ty ngoài HST',
);

console.log('facebook-lead-chat-scope: ok');
