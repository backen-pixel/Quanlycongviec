'use strict';

const { Router } = require('express');
const { isTenantScopeEnforced } = require('../helpers/tenantScope');
const VPT_COMPANY = '991dc79d-cbf5-49f9-a364-35227cb47635';

function canAccessMetaFeedback(req, companyId = VPT_COMPANY) {
  return req.user?.role === 'admin' && companyId === VPT_COMPANY
    && (!req.user.company_id || req.user.company_id === companyId)
    && (!isTenantScopeEnforced(req) || (req.tenantCompanyIds || []).includes(companyId));
}

function createMetaFeedbackRouter({ runtime, authenticate } = {}) {
  const router = Router();
  const service = runtime || require('../services/metaQualifiedFeedback').getMetaQualifiedFeedback();
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(authenticate || require('../middleware/auth').auth);
  router.use((req, res, next) => {
    const config = service.getConfig();
    if (!canAccessMetaFeedback(req, config.target?.company_id || VPT_COMPANY)
        || (req.query.company_id && req.query.company_id !== VPT_COMPANY))
      return res.status(403).json({ error: 'Không có quyền xem kết quả Facebook VPT', reason_code: 'FORBIDDEN' });
    next();
  });
  router.get('/preview', async (req, res) => {
    try { return res.json(await service.preview()); }
    catch { return res.status(503).json({ error: 'Chưa tải được nguồn xác minh Facebook. Không dùng số 0 thay cho dữ liệu thiếu.',
      reason_code: 'SOURCE_UNAVAILABLE' }); }
  });
  router.post('/run', async (req, res) => {
    const body = req.body || {}, config = service.getConfig();
    if (!body || typeof body !== 'object' || Array.isArray(body)
        || Object.keys(body).some(key => key !== 'limit')
        || (body.limit !== undefined && (!Number.isInteger(body.limit) || body.limit < 1 || body.limit > 20)))
      return res.status(400).json({ error: 'Yêu cầu đồng bộ không hợp lệ', reason_code: 'INVALID_COMMAND' });
    if (config.enabled !== true || config.ready !== true)
      return res.status(409).json({ error: 'Kết nối gửi kết quả về Meta chưa được bật', reason_code: config.reason_code || 'META_FEEDBACK_DISABLED' });
    try { return res.json(await service.drain({ limit: body.limit || 10 })); }
    catch { return res.status(503).json({ error: 'Chưa xác nhận được kết quả đồng bộ. Hãy tải lại lịch sử trước khi xử lý tiếp.',
      reason_code: 'META_DELIVERY_UNAVAILABLE' }); }
  });
  return router;
}

module.exports = { createMetaFeedbackRouter, canAccessMetaFeedback };
