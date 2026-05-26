/**
 * /api/auth-events — Đọc audit login/logout (chi tiết đến giây).
 *
 *   GET /me              — log của chính tôi
 *   GET /:userId         — admin hoặc chính user đó
 */

const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { isAdminLike } = require('../helpers/adminRole');

const r = Router();
r.use(auth);

const SELECT_COLS =
  'id, user_id, email, event, reason, ip, platform, device_name, session_id, metadata, occurred_at';

async function queryAuthEvents({ userId, since, until, events, limit }) {
  let q = supabase
    .from('auth_event_log')
    .select(SELECT_COLS)
    .order('occurred_at', { ascending: false })
    .limit(Math.min(Number(limit) || 100, 500));

  if (userId) q = q.eq('user_id', userId);
  if (since) q = q.gte('occurred_at', since);
  if (until) q = q.lt('occurred_at', until);
  if (Array.isArray(events) && events.length) q = q.in('event', events);

  const { data, error } = await q;
  if (error) {
    if (/relation .* does not exist/i.test(error.message || '')) {
      const err = new Error('Bảng auth_event_log chưa tồn tại — chạy database/241_auth_event_log.sql');
      err.code = 'missing_table';
      throw err;
    }
    throw new Error(error.message);
  }
  return data || [];
}

/**
 * GET / — admin/manager: tra cứu log auth của 1 user hoặc cả nhóm user (theo company/department).
 * Query: user_id | user_ids (CSV) | company_id | department_id | since | until | events | limit
 */
r.get('/', async (req, res) => {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Cần quyền quản trị' });

    let userIds = [];
    if (req.query.user_id) userIds = [String(req.query.user_id)];
    else if (req.query.user_ids) userIds = String(req.query.user_ids).split(',').map((s) => s.trim()).filter(Boolean);

    if (!userIds.length && (req.query.company_id || req.query.department_id)) {
      let uq = supabase.from('users').select('id').neq('is_active', false);
      if (req.query.company_id) uq = uq.eq('company_id', req.query.company_id);
      if (req.query.department_id) uq = uq.eq('department_id', req.query.department_id);
      const { data: us, error: uErr } = await uq.limit(500);
      if (uErr) return res.status(500).json({ error: uErr.message });
      userIds = (us || []).map((u) => u.id);
    }

    let q = supabase
      .from('auth_event_log')
      .select(SELECT_COLS)
      .order('occurred_at', { ascending: false })
      .limit(Math.min(Number(req.query.limit) || 200, 1000));

    if (userIds.length) q = q.in('user_id', userIds);
    if (req.query.since) q = q.gte('occurred_at', req.query.since);
    if (req.query.until) q = q.lt('occurred_at', req.query.until);
    if (req.query.events) {
      const list = String(req.query.events).split(',').map((s) => s.trim()).filter(Boolean);
      if (list.length) q = q.in('event', list);
    }

    const { data, error } = await q;
    if (error) {
      if (/relation .* does not exist/i.test(error.message || '')) {
        return res.status(503).json({ error: 'Bảng auth_event_log chưa tồn tại — chạy database/241_auth_event_log.sql' });
      }
      return res.status(500).json({ error: error.message });
    }
    res.json({ items: data || [], scope_user_count: userIds.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

r.get('/me', async (req, res) => {
  try {
    const items = await queryAuthEvents({
      userId: req.user.id || req.user.userId,
      since: req.query.since,
      until: req.query.until,
      events: req.query.events ? String(req.query.events).split(',') : null,
      limit: req.query.limit,
    });
    res.json({ items });
  } catch (err) {
    if (err.code === 'missing_table') return res.status(503).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

r.get('/:userId', async (req, res) => {
  try {
    const target = req.params.userId;
    const selfId = req.user.id || req.user.userId;
    if (target !== selfId && !isAdminLike(req.user)) {
      return res.status(403).json({ error: 'Không có quyền xem log user khác' });
    }
    const items = await queryAuthEvents({
      userId: target,
      since: req.query.since,
      until: req.query.until,
      events: req.query.events ? String(req.query.events).split(',') : null,
      limit: req.query.limit,
    });
    res.json({ items });
  } catch (err) {
    if (err.code === 'missing_table') return res.status(503).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = r;
