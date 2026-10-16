'use strict';
const { Router } = require('express');
const { isTenantScopeEnforced } = require('../helpers/tenantScope');
const COMPANY = '991dc79d-cbf5-49f9-a364-35227cb47635';
function createWebsiteFeedbackRouter({ runtime, authenticate } = {}) {
  const router = Router(), service = runtime || require('../services/websiteQualifiedFeedback').getWebsiteQualifiedFeedback();
  router.use((req,res,next) => {res.set('Cache-Control','no-store');next();});
  router.use(authenticate || require('../middleware/auth').auth);
  router.use((req,res,next) => {
    if (req.user?.role !== 'admin' || (req.user.company_id && req.user.company_id !== COMPANY)
      || (isTenantScopeEnforced(req) && !(req.tenantCompanyIds || []).includes(COMPANY))
      || (req.query.company_id && req.query.company_id !== COMPANY))
      return res.status(403).json({reason_code:'FORBIDDEN',error:'Không có quyền xem khách website VPT'});
    let config;
    try { config = service.getConfig(); }
    catch { return res.status(503).json({reason_code:'SOURCE_UNAVAILABLE',error:'Chưa đọc được cấu hình đối soát website.'}); }
    if (config.target && config.target.company_id !== COMPANY)
      return res.status(403).json({reason_code:'FORBIDDEN',error:'Không có quyền xem khách website VPT'});
    next();
  });
  router.get('/preview',async(req,res) => {
    try { return res.json(await service.preview()); }
    catch { return res.status(503).json({reason_code:'SOURCE_UNAVAILABLE',error:'Chưa đủ nguồn để đối soát website; chưa thể xác nhận số khách.'}); }
  });
  router.post('/run',async(req,res) => {
    const body=req.body || {};
    if (!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(k => k!=='limit')
      || (body.limit!==undefined && (!Number.isInteger(body.limit) || body.limit<1 || body.limit>20)))
      return res.status(400).json({reason_code:'INVALID_COMMAND',error:'Yêu cầu đồng bộ không hợp lệ'});
    let config;
    try { config = service.getConfig(); }
    catch { return res.status(503).json({reason_code:'DELIVERY_UNAVAILABLE',error:'Chưa đọc được cấu hình đồng bộ website.'}); }
    if (config.enabled!==true || config.ready!==true) return res.status(409).json({reason_code:config.reason_code || 'DISABLED',error:'Kết nối website → Meta chưa được bật'});
    try { return res.json(await service.drain({limit:body.limit || 10})); }
    catch { return res.status(503).json({reason_code:'DELIVERY_UNAVAILABLE',error:'Chưa xác nhận được kết quả gửi. Cần kiểm lịch sử trước khi xử lý tiếp.'}); }
  });
  return router;
}
module.exports = { createWebsiteFeedbackRouter };
