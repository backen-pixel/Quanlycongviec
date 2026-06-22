const { isSystemAdmin } = require('./adminRole');
const {
  canCrossWorkshopProductionViewerUseCompanyQuery,
  isMetallaOrHucabiCompanyIdSync,
} = require('./dealParticipantProduction');

/** Chuẩn hóa UUID công ty cho query pipeline (chuỗi rỗng → null). */
function normalizeWorkshopCompanyId(companyId) {
  if (companyId == null) return null;
  const s = String(companyId).trim();
  return s || null;
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
    if (q) return q;
    if (userCid && isMetallaOrHucabiCompanyIdSync(userCid)) return userCid;
    return null;
  }

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
