/** CRM request/company scope helpers (facade over helpersBundle). */
const h = require('./helpersBundle');

module.exports = {
  userIsAdmin: h.userIsAdmin,
  userIsCrmCompanyOrRegionAdmin: h.userIsCrmCompanyOrRegionAdmin,
  userCanBypassCrmDeleteRestriction: h.userCanBypassCrmDeleteRestriction,
  assertCrmEmployeeDeleteAllowed: h.assertCrmEmployeeDeleteAllowed,
  scopedAdminCompanyId: h.scopedAdminCompanyId,
  scopedCrmCompanyIdForWrite: h.scopedCrmCompanyIdForWrite,
  resolveCommercialDocListCompanyScope: h.resolveCommercialDocListCompanyScope,
  enforceCommercialDocCompanyOnWrite: h.enforceCommercialDocCompanyOnWrite,
  requireUserCompanyId: h.requireUserCompanyId,
  requireUserCompanyIdResolved: h.requireUserCompanyIdResolved,
};
