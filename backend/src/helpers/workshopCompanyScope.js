const { isSystemAdmin, isProductionAdmin, isProductionStaff } = require('./adminRole');
const {
  canCrossWorkshopProductionViewerUseCompanyQuery,
  isMetallaOrHucabiCompanyIdSync,
  isVptCompanyIdSync,
} = require('./dealParticipantProduction');

/** Chuẩn hóa UUID công ty cho query pipeline (chuỗi rỗng → null). */
function normalizeWorkshopCompanyId(companyId) {
  if (companyId == null) return null;
  const s = String(companyId).trim();
  return s || null;
}

/** Chip công ty CRM (VPT…) hoặc công ty của NV — không phải xưởng HCB/Metalla. */
function isNonWorkshopClientCompanyId(companyId, userCid = '') {
  const id = companyId != null ? String(companyId).trim() : '';
  if (!id || isMetallaOrHucabiCompanyIdSync(id)) return false;
  if (isVptCompanyIdSync(id)) return true;
  return !!(userCid && id === String(userCid));
}

/**
 * Xưởng / công ty thực hiện SX trên query `company_id` (projects.company_id).
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

  if (canCrossWorkshopProductionViewerUseCompanyQuery(req.user, q)) {
    if (q) {
      // Admin/NV CRM gửi company_id = VPT → đó là deal, không phải xưởng (dự án nằm ở HCB/Metalla).
      if (isNonWorkshopClientCompanyId(q, userCid)) return null;
      return q;
    }
    if (userCid && isMetallaOrHucabiCompanyIdSync(userCid)) return userCid;
    return null;
  }

  // NV xưởng (HCB/Metalla): luôn scope theo công ty đã resolve (kể cả từ department_id).
  if ((isProductionAdmin(req.user) || isProductionStaff(req.user)) && userCid) {
    if (q && String(q) === String(userCid)) return q;
    return userCid;
  }

  if (userCid && isNonWorkshopClientCompanyId(userCid, userCid)) return null;
  return userCid || null;
}

/**
 * Công ty CRM chủ deal — query `deal_company_id` (crm_leads.company_id / external_company_id).
 * NV CRM: mặc định công ty của họ. NV xưởng (HCB/Metalla) tại xưởng mình: không lọc deal.
 */
function effectiveDealCompanyId(req, queryDealCompanyId, workshopCompanyId = null) {
  const q =
    queryDealCompanyId != null && String(queryDealCompanyId).trim() !== ''
      ? String(queryDealCompanyId).trim()
      : '';
  if (isSystemAdmin(req.user)) {
    return q || null;
  }
  const userCid =
    req.user?.company_id != null && String(req.user.company_id).trim() !== ''
      ? String(req.user.company_id).trim()
      : '';
  if (!userCid) return q || null;
  const ws = workshopCompanyId != null ? String(workshopCompanyId).trim() : '';
  if (ws && ws === userCid && isMetallaOrHucabiCompanyIdSync(userCid)) {
    return null;
  }
  return userCid;
}

module.exports = {
  effectiveWorkshopCompanyId,
  effectiveDealCompanyId,
  normalizeWorkshopCompanyId,
};
