/**
 * /api/user-activity — Log hành vi UI của user, cho AI đọc/học.
 *
 * Endpoints:
 *   POST /            — ghi 1 hoặc nhiều entry (batch). Body: { entries: [...] } hoặc 1 object.
 *   GET  /me          — log của chính tôi (debug / personal insight).
 *   GET  /:userId     — log của user khác (admin only).
 *   GET  /summary     — tổng hợp theo module/action_type cho AI (admin only).
 *
 * Tất cả write KHÔNG block — fail-safe: client gửi sai cũng không vỡ session.
 */

const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { isAdminLike } = require('../helpers/adminRole');
const { activityContextFromEntry, missingDeviceGeoColumns } = require('../helpers/activityContext');

const r = Router();
r.use(auth);

/* ────────── TAXONOMY hợp lệ ────────── */
const ALLOWED_ACTIONS = new Set([
  'view',
  'filter',
  'search',
  'sort',
  'navigate',
  'click',
  'create',
  'update',
  'delete',
  'export',
  'open_modal',
  'submit_form',
  'chat_open',
  'chat_send',
]);

function sanitizeEntry(raw, userId) {
  if (!raw || typeof raw !== 'object') return null;
  const action_type = String(raw.action_type || '').trim().toLowerCase();
  if (!ALLOWED_ACTIONS.has(action_type)) return null;

  const ctx = activityContextFromEntry(raw);
  const out = {
    user_id: userId,
    session_id: raw.session_id ? String(raw.session_id).slice(0, 80) : null,
    action_type,
    module: raw.module ? String(raw.module).slice(0, 40) : null,
    feature: raw.feature ? String(raw.feature).slice(0, 80) : null,
    entity_type: raw.entity_type ? String(raw.entity_type).slice(0, 40) : null,
    entity_id: raw.entity_id || null,
    path: raw.path ? String(raw.path).slice(0, 400) : null,
    query: raw.query && typeof raw.query === 'object' ? raw.query : null,
    referrer_path: raw.referrer_path ? String(raw.referrer_path).slice(0, 400) : null,
    label: raw.label ? String(raw.label).slice(0, 400) : null,
    metadata: raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : null,
    importance:
      Number.isInteger(raw.importance) && raw.importance >= 0 && raw.importance <= 3
        ? raw.importance
        : 1,
    ...ctx,
  };
  if (out.metadata && typeof out.metadata === 'object') {
    out.metadata = {
      ...out.metadata,
      device_id: ctx.device_id,
      device_name: ctx.device_name,
      geo_lat: ctx.geo_lat,
      geo_lng: ctx.geo_lng,
      geo_address: ctx.geo_address,
    };
  }
  return out;
}

/* ────────── POST / — batch insert ────────── */
r.post('/', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'unauth' });

    const body = req.body || {};
    const rawList = Array.isArray(body.entries) ? body.entries : [body];
    const rows = rawList
      .map((e) => sanitizeEntry(e, userId))
      .filter(Boolean)
      .slice(0, 50);

    if (!rows.length) return res.json({ ok: true, inserted: 0 });

    let { error } = await supabase.from('user_activity_log').insert(rows);
    if (error && missingDeviceGeoColumns(error)) {
      const fallbackRows = rows.map(({ device_id, device_name, geo_lat, geo_lng, geo_address, ...rest }) => rest);
      ({ error } = await supabase.from('user_activity_log').insert(fallbackRows));
    }
    if (error) {
      if (/relation .* does not exist/i.test(error.message || '')) {
        return res.status(503).json({
          error: 'Bảng user_activity_log chưa tồn tại — chạy migration database/235_user_activity_log.sql',
        });
      }
      return res.status(500).json({ error: error.message });
    }
    res.json({ ok: true, inserted: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ────────── helper query ────────── */
async function queryLog({ userId, since, until, modules, actions, limit }) {
  let q = supabase
    .from('user_activity_log')
    .select('id, user_id, action_type, module, feature, entity_type, entity_id, path, query, label, metadata, importance, created_at')
    .order('created_at', { ascending: false })
    .limit(Math.min(Number(limit) || 200, 500));

  if (userId) q = q.eq('user_id', userId);
  if (since) q = q.gte('created_at', since);
  if (until) q = q.lt('created_at', until);
  if (Array.isArray(modules) && modules.length) q = q.in('module', modules);
  if (Array.isArray(actions) && actions.length) q = q.in('action_type', actions);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

/* ────────── GET /me ────────── */
r.get('/me', async (req, res) => {
  try {
    const data = await queryLog({
      userId: req.user.id,
      since: req.query.since,
      until: req.query.until,
      modules: req.query.modules ? String(req.query.modules).split(',') : null,
      actions: req.query.actions ? String(req.query.actions).split(',') : null,
      limit: req.query.limit,
    });
    res.json({ items: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ────────── GET /summary (admin) ────────── */
r.get('/summary', async (req, res) => {
  if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Cần quyền quản trị' });
  try {
    const since = req.query.since || new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { data, error } = await supabase
      .from('user_activity_log')
      .select('module, action_type, importance, user_id, created_at')
      .gte('created_at', since)
      .gte('importance', 1)
      .limit(5000);
    if (error) return res.status(500).json({ error: error.message });
    const byModule = {};
    const byAction = {};
    const byUser = {};
    for (const r of data || []) {
      byModule[r.module || '_none_'] = (byModule[r.module || '_none_'] || 0) + 1;
      byAction[r.action_type] = (byAction[r.action_type] || 0) + 1;
      byUser[r.user_id] = (byUser[r.user_id] || 0) + 1;
    }
    res.json({ since, total: (data || []).length, byModule, byAction, byUser });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ────────── GET /:userId (admin / self) ────────── */
r.get('/:userId', async (req, res) => {
  try {
    const target = req.params.userId;
    if (target !== req.user.id && !isAdminLike(req.user)) {
      return res.status(403).json({ error: 'Không có quyền xem log user khác' });
    }
    const data = await queryLog({
      userId: target,
      since: req.query.since,
      until: req.query.until,
      modules: req.query.modules ? String(req.query.modules).split(',') : null,
      actions: req.query.actions ? String(req.query.actions).split(',') : null,
      limit: req.query.limit,
    });
    res.json({ items: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = r;
