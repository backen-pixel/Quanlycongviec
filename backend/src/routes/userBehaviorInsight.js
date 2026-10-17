/**
 * /api/analytics/behavior-insight — báo cáo tổng hợp hành vi & khó khăn người dùng.
 * Nối user_activity_log + guide_chat_log + unified_tasks_v, chỉ đọc, không cron.
 * Xem docs/architecture/ke-hoach-thu-thap-hanh-vi-nguoi-dung.md.
 *
 * Không khoá bằng mật khẩu giám sát Supabase nữa (bỏ theo yêu cầu 17/10/2026) — chỉ còn JWT đăng
 * nhập + quyền quản lý (`isManagerLike`) chắn.
 */
const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { isManagerLike } = require('../helpers/unifiedTasksQuery');
const { getUserBehaviorInsight, getUserBehaviorEvents } = require('../helpers/userBehaviorInsight');

const r = Router();
r.use(auth);

r.get('/', async (req, res) => {
  if (!isManagerLike(req.user)) {
    return res.status(403).json({ error: 'Cần quyền quản lý trở lên' });
  }
  try {
    const companyId = req.query.company_id || req.user.company_id || null;
    const { range, sources, items } = await getUserBehaviorInsight({
      companyId,
      dateFrom: req.query.date_from || null,
      dateTo: req.query.date_to || null,
    });
    res.json({ company_id: companyId, range, sources, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Dòng thô đứng sau một con số — mở ra khi người xem bấm vào một hạng mục trên báo cáo. */
r.get('/events', async (req, res) => {
  if (!isManagerLike(req.user)) {
    return res.status(403).json({ error: 'Cần quyền quản lý trở lên' });
  }
  try {
    const out = await getUserBehaviorEvents({
      companyId: req.query.company_id || req.user.company_id || null,
      userId: req.query.user_id,
      source: req.query.source || 'activity',
      actionType: req.query.action_type || null,
      module: req.query.module || null,
      path: req.query.path || null,
      channel: req.query.channel || null,
      channelName: req.query.channel_name || null,
      contactId: req.query.contact_id || null,
      dateFrom: req.query.date_from || null,
      dateTo: req.query.date_to || null,
      limit: req.query.limit,
    });
    res.json(out);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = r;
