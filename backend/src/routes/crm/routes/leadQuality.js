'use strict';
const { Router } = require('express');
const { supabase } = require('../../../config/supabase');
const routerState = require('../../../config/supabaseRouter');
const { createLeadQualityService } = require('../../../modules/crmLeadQuality/service');
const r = Router();
const service = createLeadQualityService({ db: supabase, isPrimary: () => !routerState.isFailoverEnabled() && routerState.getActiveTarget() === 'primary' });
const messages = {
  FORBIDDEN: 'Bạn không có quyền xác nhận hồ sơ khách này.',
  NOT_FOUND: 'Không tìm thấy hồ sơ khách.',
  STALE_CONTEXT: 'Hồ sơ đã thay đổi. Hãy tải lại và kiểm tra trước khi xác nhận.',
  IDEMPOTENCY_CONFLICT: 'Yêu cầu đã được dùng cho nội dung khác. Hãy tải lại hồ sơ.',
  INVALID_QUALIFICATION: 'Cần kiểm tra đủ thông tin và ghi căn cứ xác nhận.',
};
async function handle(req, res, write) {
  res.set('Cache-Control', 'no-store');
  if (process.env.VPT_CRM_LEAD_QUALITY !== '1') return res.status(503).json({ code: 'QUALITY_DISABLED', error: 'Chức năng xác nhận khách chưa được mở.' });
  const lead = req.crmLeadAccess?.lead;
  // Composition root authenticates and checks lead access before this router.
  if (!lead || lead.id !== req.params.id || !req.user?.userId || (req.user.id && req.user.id !== req.user.userId)) return res.status(403).json({ code: 'FORBIDDEN', error: messages.FORBIDDEN });
  const context = { leadId: lead.id, companyId: lead.company_id, actorId: req.user.userId };
  try { return res.json(await (write ? service.record(context, req.body) : service.read(context))); }
  catch (e) { return res.status(e.status || 503).json({ code: e.code || 'QUALITY_UNAVAILABLE', error: messages[e.code] || 'Chưa đọc được trạng thái xác nhận khách. Vui lòng thử lại.' }); }
}
r.get('/leads/:id/marketing-quality', (req, res) => handle(req, res, false));
r.post('/leads/:id/marketing-quality', (req, res) => handle(req, res, true));
module.exports = r;
