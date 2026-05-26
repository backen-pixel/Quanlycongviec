const { attachScope } = require('../helpers/scopeQueryParams');

/**
 * Middleware: parse query scope → `req.scope`.
 * Tuỳ chọn `req.scopeFilterOptions` trên router (forceUserCompany, elevatedRoles).
 */
function scopeFilter(req, res, next) {
  try {
    const opts = req.scopeFilterOptions || {};
    attachScope(req, opts);
    next();
  } catch (e) {
    next(e);
  }
}

module.exports = { scopeFilter };
