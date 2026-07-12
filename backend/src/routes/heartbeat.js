/**
 * GET /api/heartbeat
 * Gom ping + badge sidebar trong 1 request (giảm tải host backend).
 *
 * Query:
 *   social_company_id — admin hệ thống lọc bảng tin nội bộ
 *   fresh=1           — bỏ cache badge 15s
 *   badges=0          — chỉ ping, không đếm badge
 */
const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { runAppHeartbeat } = require('../helpers/appHeartbeat');
const { invalidateTags } = require('../middleware/responseCache');

const r = Router();
r.use(auth);

r.get('/', async (req, res) => {
  try {
    const socialCompanyId = req.query.social_company_id
      ? String(req.query.social_company_id).trim()
      : null;
    const fresh = req.query.fresh === '1' || req.query.fresh === 'true';
    const badges = req.query.badges !== '0' && req.query.badges !== 'false';

    const body = await runAppHeartbeat(req, { socialCompanyId, fresh, badges });
    if (body.ping?.persisted) {
      void invalidateTags(['users', 'presence']);
    }
    if (!body.ok && body.ping && !body.ping.persisted) {
      return res.status(503).json({
        ...body,
        error: 'Không ghi được ping — chạy migration database/67_user_activity_and_messenger_pins.sql',
      });
    }
    res.json(body);
  } catch (e) {
    console.error('GET /heartbeat:', e);
    res.status(e.status || 500).json({ error: e.message || 'Lỗi heartbeat' });
  }
});

module.exports = r;
