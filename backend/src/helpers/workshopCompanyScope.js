const { isSystemAdmin } = require('./adminRole');

/** Chuẩn hóa UUID công ty cho query pipeline (chuỗi rỗng → null). */
function normalizeWorkshopCompanyId(companyId) {
  if (companyId == null) return null;
  const s = String(companyId).trim();
  return s || null;
}

/**
 * Phạm vi công ty cho module Xưởng (SX / VC).
 * Admin hệ thống (không gắn company_id): có thể truyền company_id query (rỗng = xem mọi công ty).
 * User thường + admin công ty + sales_admin: luôn khóa theo company_id của tài khoản.
 */
function effectiveWorkshopCompanyId(req, queryCompanyId) {
  const q =
    queryCompanyId != null && String(queryCompanyId).trim() !== ''
      ? String(queryCompanyId).trim()
      : '';
  const userCid =
    req.user?.company_id != null && String(req.user.company_id).trim() !== ''
      ? String(req.user.company_id).trim()
      : '';
  if (isSystemAdmin(req.user)) {
    return q || null;
  }
  return userCid || null;
}

module.exports = { effectiveWorkshopCompanyId, normalizeWorkshopCompanyId };
