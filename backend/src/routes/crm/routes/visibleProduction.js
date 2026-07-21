/**
 * CRM: allowlist công ty SX hiển thị + danh sách SX đã lọc cho deal.
 */
const { Router } = require('express');
const {
  getVisibleProductionCompanyIds,
  setVisibleProductionCompanyIds,
  listAllProductionCompanies,
  listProductionCompaniesForCrmCompany,
} = require('../../../helpers/crmVisibleProductionCompanies');
const { isAdminLike } = require('../../../helpers/adminRole');
const helpers = require('../shared/helpersBundle');

const {
  scopedAdminCompanyId,
  requireUserCompanyId,
  userIsAdmin,
} = helpers;

const r = Router();

function assertCanManageCrmCompany(req, res, companyId) {
  const cid = String(companyId || '').trim();
  if (!cid) {
    res.status(400).json({ error: 'Thiếu company_id' });
    return null;
  }
  const sac = scopedAdminCompanyId(req);
  if (sac) {
    if (String(sac) !== cid) {
      res.status(403).json({ error: 'Không có quyền cấu hình công ty khác' });
      return null;
    }
    return cid;
  }
  if (userIsAdmin(req.user?.role) || isAdminLike(req.user)) {
    return cid;
  }
  const own = requireUserCompanyId(req, res);
  if (!own) return null;
  if (String(own) !== cid) {
    res.status(403).json({ error: 'Không có quyền cấu hình công ty khác' });
    return null;
  }
  return cid;
}

/** GET /crm/production-companies?company_id=<crm> — list SX đã lọc allowlist */
r.get('/production-companies', async (req, res) => {
  try {
    let companyId = req.query.company_id && String(req.query.company_id).trim()
      ? String(req.query.company_id).trim()
      : '';
    const sac = scopedAdminCompanyId(req);
    if (sac) {
      if (companyId && companyId !== String(sac)) {
        return res.status(403).json({ error: 'Không có quyền xem công ty khác' });
      }
      companyId = String(sac);
    } else if (!userIsAdmin(req.user?.role) && !isAdminLike(req.user)) {
      const own = requireUserCompanyId(req, res);
      if (!own) return;
      if (companyId && companyId !== String(own)) {
        return res.status(403).json({ error: 'Không có quyền xem công ty khác' });
      }
      companyId = companyId || String(own);
    }
    if (!companyId) {
      return res.status(400).json({ error: 'Thiếu company_id' });
    }
    const out = await listProductionCompaniesForCrmCompany(companyId);
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /crm/companies/:companyId/visible-production-companies */
r.get('/companies/:companyId/visible-production-companies', async (req, res) => {
  try {
    const cid = assertCanManageCrmCompany(req, res, req.params.companyId);
    if (!cid) return;
    const production_company_ids = await getVisibleProductionCompanyIds(cid);
    const all = await listAllProductionCompanies();
    res.json({
      production_company_ids,
      filtered: production_company_ids.length > 0,
      all_production_companies: all,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** PUT /crm/companies/:companyId/visible-production-companies */
r.put('/companies/:companyId/visible-production-companies', async (req, res) => {
  try {
    const cid = assertCanManageCrmCompany(req, res, req.params.companyId);
    if (!cid) return;
    if (!userIsAdmin(req.user?.role) && !isAdminLike(req.user)) {
      return res.status(403).json({ error: 'Chỉ admin được cấu hình danh sách công ty SX' });
    }
    const ids = req.body?.production_company_ids;
    const production_company_ids = await setVisibleProductionCompanyIds(cid, ids);
    res.json({
      production_company_ids,
      filtered: production_company_ids.length > 0,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = r;
